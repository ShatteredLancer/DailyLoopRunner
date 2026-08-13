import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createBulkRelistPreview } from '../../src/trade/bulk-relist-preview.js';
import { createTradeBulkRelistJournal } from '../../src/trade/bulk-relist-journal.js';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { createGuardedScheduledBulkRelistExecutor } from '../../src/trade/guarded-scheduled-bulk-relist.js';
import { createTradeJobStore } from '../../src/trade/job-store.js';
import { createOperationCoordinator } from '../../src/trade/operation-coordinator.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function unsold(id = 1) {
  return {
    id, definitionId: 100 + id, pile: 'transfer', name: `Player ${id}`, rating: 84,
    auction: { present: true, state: 'inactive', tradeId: 1000 + id, startingBid: 650, buyNowPrice: 700 },
  };
}

function scheduledJob(overrides = {}) {
  return normalizeTradeJob({
    id: 'bulk-job', name: 'Scheduled Re-list All', type: 'bulk-relist', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 60_000 },
    misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: { relistDelaySeconds: [3, 8] },
    ...overrides,
  }, { now: 1000 });
}

function setup(adapter, overrides = {}) {
  const storage = memoryStorage();
  const job = overrides.job || scheduledJob();
  const store = createTradeJobStore({ storage, key: 'jobs', now: () => 1000 });
  store.upsert(job);
  store.authorize([job.id]);
  const journal = createTradeBulkRelistJournal({ storage, key: 'journal', now: () => 1000 });
  const operationCoordinator = createOperationCoordinator();
  const getTradeAdapter = overrides.getTradeAdapter || (() => adapter);
  const onRunningChange = vi.fn();
  const onReceipt = vi.fn();
  const executor = createGuardedScheduledBulkRelistExecutor({
    store,
    bulkRelistPreview: createBulkRelistPreview({
      getTradeAdapter,
      now: () => 1000,
      createToken: () => 'scheduled-token',
    }),
    operationCoordinator,
    journal,
    getTradeAdapter,
    validationGateEnabled: true,
    now: () => 1000,
    onRunningChange,
    onReceipt,
    ...overrides.options,
  });
  const input = {
    job,
    runId: 'scheduled-bulk-run',
    scheduledFor: 60_000,
    startedAt: 1000,
    context: { liveExecutionEnabled: true },
    heartbeat: () => true,
  };
  return { executor, input, job, store, journal, operationCoordinator, onRunningChange, onReceipt };
}

describe('Guarded scheduled Re-list All executor', () => {
  it('completes an empty occurrence without mutation and consumes one authorization', async () => {
    const adapter = createFakeTradeAdapter();
    const result = setup(adapter);
    await expect(result.executor.execute(result.input)).resolves.toMatchObject({
      status: 'completed', reason: 'skipped-empty', requested: 0, succeeded: 0,
    });
    expect(adapter.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);
    expect(result.store.read()).toMatchObject({ paused: true, liveExecutionEnabled: false, jobs: [{ armed: false }] });
    expect(result.journal.snapshot()).toMatchObject({
      status: 'completed', mutationBoundaryCrossed: false, requested: 0,
    });
  });

  it('sends one aggregate mutation, reconciles every item, and records one terminal receipt', async () => {
    const adapter = createFakeTradeAdapter({ items: [unsold(1), unsold(2)] });
    const result = setup(adapter);
    const receipt = await result.executor.execute(result.input);
    expect(receipt).toMatchObject({ status: 'completed', requested: 2, succeeded: 2, failed: 0 });
    expect(adapter.calls.filter((call) => call.method === 'relistExpiredAuctions')).toHaveLength(1);
    expect(result.journal.snapshot()).toMatchObject({
      status: 'completed', phase: 'receipt-recorded', mutationBoundaryCrossed: true,
      items: [expect.objectContaining({ status: 'relisted' }), expect.objectContaining({ status: 'relisted' })],
    });
    expect(result.journal.inspectRecovery()).toMatchObject({ canSupersede: true, uncertainMutation: false });
    expect(result.onReceipt).toHaveBeenCalledWith(receipt, expect.objectContaining({ job: result.job }));
    expect(result.operationCoordinator.inspect().active).toBeNull();
  });

  it('persists a pre-mutation pacing continuation and resumes the same authorized run once', async () => {
    const base = createFakeTradeAdapter({ items: [unsold()] });
    let permitAttempts = 0;
    const adapter = {
      ...base,
      acquireRequestPermit: async (action) => {
        if (action === 'bulk-relist' && permitAttempts++ === 0) {
          return {
            status: 'blocked', action, permit: null,
            error: { kind: 'pacing-deferred', action: 'yield', retryAt: 5000 },
          };
        }
        return base.acquireRequestPermit(action);
      },
    };
    const result = setup(adapter);
    const persistContinuation = vi.fn(() => true);
    const deferred = await result.executor.execute({ ...result.input, persistContinuation });
    expect(deferred).toMatchObject({
      status: 'deferred', reason: 'trade-action-pacing', resumeAt: 5000,
      continuation: { runId: 'scheduled-bulk-run', requested: 1 },
    });
    expect(persistContinuation).toHaveBeenCalledOnce();
    expect(base.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);
    expect(result.store.read().authorizations.jobs[result.job.id]).toMatchObject({
      remainingRuns: 1, activeRunId: 'scheduled-bulk-run',
    });
    expect(result.journal.snapshot()).toMatchObject({
      runId: 'scheduled-bulk-run', status: 'deferred', phase: 'slice-deferred', mutationBoundaryCrossed: false,
    });
    const completed = await result.executor.execute({
      ...result.input,
      continuation: deferred.continuation,
      persistContinuation,
    });
    expect(completed).toMatchObject({ status: 'completed', requested: 1, succeeded: 1 });
    expect(base.calls.filter((call) => call.method === 'relistExpiredAuctions')).toHaveLength(1);
    expect(result.journal.snapshot()).toMatchObject({
      runId: 'scheduled-bulk-run', status: 'completed', phase: 'receipt-recorded', mutationBoundaryCrossed: true,
    });
  });

  it('defers a paced Preview refresh before opening a Journal and resumes without duplicate mutation', async () => {
    const adapter = createFakeTradeAdapter({
      items: [unsold()],
      refreshTransferResults: [
        { status: 'blocked', response: null, error: { kind: 'pacing-deferred', retryAt: 5000 } },
        { status: 'completed', response: { success: true, status: 200 }, error: null },
      ],
    });
    const result = setup(adapter);
    const persistContinuation = vi.fn(() => true);
    const deferred = await result.executor.execute({ ...result.input, persistContinuation });
    expect(deferred).toMatchObject({
      status: 'deferred', reason: 'trade-action-pacing', resumeAt: 5000,
      continuation: { runId: 'scheduled-bulk-run', requested: 1 },
    });
    expect(result.journal.snapshot()).toBeNull();
    expect(adapter.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);
    const completed = await result.executor.execute({
      ...result.input,
      continuation: deferred.continuation,
      persistContinuation,
    });
    expect(completed).toMatchObject({ status: 'completed', requested: 1, succeeded: 1 });
    expect(adapter.calls.filter((call) => call.method === 'relistExpiredAuctions')).toHaveLength(1);
  });

  it('defers a pre-mutation rate-limit permit and keeps the same authorization occurrence', async () => {
    const base = createFakeTradeAdapter({ items: [unsold()] });
    let permitAttempts = 0;
    const adapter = {
      ...base,
      acquireRequestPermit: async (action) => {
        if (action === 'bulk-relist' && permitAttempts++ === 0) {
          return {
            status: 'blocked', action, permit: null,
            error: { kind: 'rate-limit', code: 429, action: 'stop-and-cooldown', retryAt: 7000 },
          };
        }
        return base.acquireRequestPermit(action);
      },
    };
    const result = setup(adapter);
    const persistContinuation = vi.fn(() => true);
    const deferred = await result.executor.execute({ ...result.input, persistContinuation });
    expect(deferred).toMatchObject({
      status: 'deferred', reason: 'trade-rate-limit-cooldown', resumeAt: 7000,
      continuation: { runId: 'scheduled-bulk-run', requested: 1 },
    });
    expect(base.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);
    expect(result.journal.snapshot()).toMatchObject({ mutationBoundaryCrossed: false, status: 'deferred' });
    expect(result.store.read().authorizations.jobs[result.job.id]).toMatchObject({
      remainingRuns: 1, activeRunId: 'scheduled-bulk-run',
    });
    const completed = await result.executor.execute({
      ...result.input, continuation: deferred.continuation, persistContinuation,
    });
    expect(completed).toMatchObject({ status: 'completed', requested: 1, succeeded: 1 });
    expect(base.calls.filter((call) => call.method === 'relistExpiredAuctions')).toHaveLength(1);
  });

  it('keeps partial aggregate reconciliation as unknown Recovery evidence', async () => {
    const adapter = createFakeTradeAdapter({
      items: [unsold(1), unsold(2)],
      bulkRelistResult: { status: 'accepted', itemIds: [1] },
    });
    const result = setup(adapter);
    await expect(result.executor.execute(result.input)).resolves.toMatchObject({
      status: 'ambiguous', reason: 'bulk-relist-partial', requested: 2,
    });
    expect(result.journal.inspectRecovery()).toMatchObject({
      canSupersede: false,
      uncertainMutation: true,
      reason: 'bulk-relist-journal-mutation-review-required',
    });
  });

  it('rejects unsupported schedules and a disabled live gate before authorization or mutation', async () => {
    const adapter = createFakeTradeAdapter({ items: [unsold()] });
    const result = setup(adapter, { options: { validationGateEnabled: false } });
    await expect(result.executor.execute(result.input)).resolves.toMatchObject({
      status: 'blocked', reason: 'scheduled-bulk-relist-validation-gate-disabled',
    });
    expect(adapter.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);
    expect(result.store.read().authorizations.jobs[result.job.id]).toMatchObject({ remainingRuns: 1 });
  });
});
