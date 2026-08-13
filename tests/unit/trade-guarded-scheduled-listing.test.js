import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createOperationCoordinator } from '../../src/trade/operation-coordinator.js';
import {
  createGuardedScheduledListingExecutor,
  guardedTradeSessionReadiness,
  guardedScheduledListingReason,
  selectGuardedScheduledListingJob,
} from '../../src/trade/guarded-scheduled-listing.js';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { createTradeJobStore } from '../../src/trade/job-store.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';
import { createTradeScheduler } from '../../src/trade/scheduler.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => value === null ? values.delete(key) : values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function job(overrides = {}) {
  return normalizeTradeJob({
    id: 'once-listing', name: 'One guarded listing', type: 'listing', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 2000 }, misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      sources: ['club'], cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      marketOverride: { enabled: false, markupPercent: 5, maxQuoteAgeMinutes: 10 },
      startPricePolicy: 'one-step-below', durationSeconds: 3600, listingDelaySeconds: [4, 8],
      maxListings: 1, expiredPolicy: 'skip',
    },
    ...overrides,
  }, { now: 1000 });
}

function transferRepriceJob(overrides = {}) {
  return normalizeTradeJob({
    id: 'once-transfer-reprice', name: 'One guarded Transfer reprice', type: 'listing', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 2000 }, misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      sources: ['transfer'], cardClass: 'rare-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      startPricePolicy: 'one-step-below', durationSeconds: 3600, listingDelaySeconds: [4, 8],
      maxListings: 1, expiredPolicy: 'reprice',
      ...overrides.policy,
    },
    ...overrides,
  }, { now: 1000 });
}

function store() {
  return {
    relock: vi.fn(),
    consumeAuthorization: vi.fn(() => ({ consumed: true, remainingRuns: 0 })),
  };
}

describe('Guarded scheduled Listing validation executor', () => {
  it('blocks unresolved Journal evidence before consuming authorization', async () => {
    const jobStore = store();
    const listingPreparation = { prepare: vi.fn() };
    const result = await createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      journal: { inspectRecovery: () => ({ canSupersede: false, reason: 'listing-journal-mutation-review-required' }) },
      getTradeAdapter: () => createFakeTradeAdapter(),
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: job(), runId: 'blocked-before-auth', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'listing-journal-mutation-review-required' });
    expect(jobStore.consumeAuthorization).not.toHaveBeenCalled();
    expect(listingPreparation.prepare).not.toHaveBeenCalled();
  });

  it('blocks a cross-type recovery race before consuming authorization', async () => {
    const jobStore = store();
    const listingPreparation = { prepare: vi.fn() };
    const result = await createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      journal: { inspectRecovery: () => ({ canSupersede: true }) },
      inspectRecovery: () => ({
        reviewRequired: true,
        reason: 'buy-journal-mutation-review-required',
      }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: job(), runId: 'cross-type-blocked-before-auth', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'buy-journal-mutation-review-required' });
    expect(jobStore.consumeAuthorization).not.toHaveBeenCalled();
    expect(listingPreparation.prepare).not.toHaveBeenCalled();
  });

  it('waits for FSU loading but allows provisional data for targeted validation', () => {
    expect(guardedTradeSessionReadiness({ pageReady: false })).toEqual({ ready: false, reason: 'ea-session-unavailable' });
    expect(guardedTradeSessionReadiness({ pageReady: true, fsuReadiness: { detected: false } }))
      .toEqual({ ready: true, reason: null });
    expect(guardedTradeSessionReadiness({
      pageReady: true,
      fsuReadiness: { detected: true, ready: false, state: 'loading' },
    })).toEqual({ ready: false, reason: 'fsu-club-loading' });
    expect(guardedTradeSessionReadiness({
      pageReady: true,
      fsuReadiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional' },
    })).toEqual({ ready: true, reason: null });
    expect(guardedTradeSessionReadiness({
      pageReady: true,
      fsuReadiness: { detected: true, ready: true, fullyValidated: true, state: 'ready' },
    })).toEqual({ ready: true, reason: null });
  });

  it('selects exactly one armed once/Club/one-item Listing Job', () => {
    const valid = job();
    expect(guardedScheduledListingReason(valid)).toBeNull();
    expect(selectGuardedScheduledListingJob({ jobs: [valid] })).toEqual({ ready: true, reason: null, job: valid });
    expect(selectGuardedScheduledListingJob({ jobs: [] })).toMatchObject({ ready: false, reason: 'validation-gate-no-armed-job' });
    expect(selectGuardedScheduledListingJob({ jobs: [valid, job({ id: 'second' })] }))
      .toMatchObject({ ready: false, reason: 'validation-gate-multiple-armed-jobs' });
    expect(guardedScheduledListingReason(job({ schedule: { type: 'daily', time: '09:00', timezone: 'UTC' } })))
      .toBeNull();
    expect(guardedScheduledListingReason(job({ misfirePolicy: { type: 'next-login' } })))
      .toBe('validation-gate-next-login-disabled');
    expect(guardedScheduledListingReason(job({ misfirePolicy: { type: 'grace-window', graceMinutes: 30 } })))
      .toBe('validation-gate-grace-too-long');
    expect(selectGuardedScheduledListingJob({
      jobs: [valid], runtimes: { [valid.id]: { nextRunAt: null } },
    })).toMatchObject({ ready: false, reason: 'validation-gate-no-pending-run' });
    const recurring = job({ schedule: { type: 'interval', intervalSeconds: 3600, anchorAt: 2000 } });
    expect(selectGuardedScheduledListingJob({ jobs: [recurring] }, { authorizationRuns: 2 }))
      .toMatchObject({ ready: true, job: { id: 'once-listing' } });
  });

  it('consumes one bounded authorization before preparing and executing one item', async () => {
    const jobStore = store();
    const order = [];
    jobStore.relock.mockImplementation(() => order.push('relock'));
    const prepared = {
      ready: true,
      job: job(),
      plan: { entries: [{ item: { id: 1, definitionId: 2, pile: 'club' } }] },
      confirmation: { token: 'secret', action: 'list' },
    };
    const listingPreparation = { prepare: vi.fn(async () => { order.push('prepare'); return prepared; }) };
    const transaction = { run: vi.fn(async () => {
      order.push('transaction');
      return { status: 'completed', requested: 1, succeeded: 1, receipts: [] };
    }) };
    const adapter = createFakeTradeAdapter();
    const getTradeAdapter = vi.fn(() => adapter);
    const transactionFactory = vi.fn(() => transaction);
    const onRunningChange = vi.fn();
    const executor = createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter,
      transactionFactory,
      circuitBreaker: { availability: () => ({ allowed: true }) },
      validationGateEnabled: true,
      ownerId: 'scheduled-tab',
      now: () => 2000,
      onRunningChange,
    });
    const heartbeat = vi.fn(() => true);
    const result = await executor.execute({
      job: job(), runId: 'run-1', scheduledFor: 2000, context: { liveExecutionEnabled: true }, heartbeat,
    });
    expect(result).toMatchObject({ status: 'completed', requested: 1, succeeded: 1 });
    expect(order).toEqual(['prepare', 'transaction']);
    expect(jobStore.consumeAuthorization).toHaveBeenCalledWith('once-listing', 'run-1');
    expect(transaction.run).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1', confirmationToken: 'secret', approved: true, scheduledFor: 2000,
    }));
    expect(transaction.run.mock.calls[0][0].beforeMutation()).toBe(true);
    expect(heartbeat).toHaveBeenCalledTimes(2);
    expect(onRunningChange.mock.calls.map((call) => call[0])).toEqual([true, false]);
    expect(getTradeAdapter).toHaveBeenCalledWith({
      pacingContext: expect.objectContaining({
        jobId: 'once-listing', runId: 'run-1', ownerId: 'scheduled-tab',
        policy: expect.objectContaining({ maxListings: 1 }), shouldStop: expect.any(Function),
      }),
    });
    expect(transactionFactory).toHaveBeenCalledWith(expect.objectContaining({ tradeAdapter: adapter }));
  });

  it('prepares, target-validates and executes two Club items under the dual-card gate', async () => {
    const dual = job({
      id: 'once-listing-dual',
      name: 'Two guarded listings',
      policy: { ...job().policy, maxListings: 2 },
    });
    const entries = [1, 2].map((id) => ({ item: { id, definitionId: id + 100, pile: 'club' } }));
    const prepared = {
      ready: true,
      job: dual,
      plan: { entries },
      confirmation: { token: 'secret', action: 'list' },
    };
    const validateClubPlayers = vi.fn(async () => ({ ok: true, items: entries.map((entry) => entry.item), missing: [] }));
    const transaction = { run: vi.fn(async () => ({ status: 'completed', requested: 2, succeeded: 2, receipts: [] })) };
    const result = await createGuardedScheduledListingExecutor({
      store: store(),
      listingPreparation: { prepare: vi.fn(async () => prepared) },
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory: () => transaction,
      validateClubPlayers,
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: dual, runId: 'scheduled-listing-dual', scheduledFor: 2000,
      context: {
        liveExecutionEnabled: true,
        fsuReadiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional' },
      },
      heartbeat: () => true,
    });

    expect(result).toMatchObject({ status: 'completed', requested: 2, succeeded: 2 });
    expect(validateClubPlayers).toHaveBeenCalledWith(entries.map((entry) => entry.item), expect.any(Object));
    expect(transaction.run).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
  });

  it('executes four prepared Listing items as two chunks', async () => {
    const four = job({
      id: 'once-listing-four',
      name: 'Four guarded listings',
      policy: { ...job().policy, maxListings: 4 },
    });
    const entries = [1, 2, 3, 4].map((id) => ({ item: { id, definitionId: id + 100, pile: 'club' } }));
    const prepared = {
      ready: true,
      job: four,
      plan: { entries },
      confirmation: { token: 'secret', action: 'list' },
    };
    const transaction = { run: vi.fn(async ({ prepared: chunk, itemIndexOffset }) => ({
      status: 'completed',
      requested: chunk.plan.entries.length,
      succeeded: chunk.plan.entries.length,
      receipts: chunk.plan.entries.map((entry, index) => ({
        index: itemIndexOffset + index + 1,
        item: entry.item,
        status: 'listed',
      })),
    })) };

    const receipt = await createGuardedScheduledListingExecutor({
      store: store(),
      listingPreparation: { prepare: vi.fn(async () => prepared) },
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory: () => transaction,
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: four,
      runId: 'scheduled-listing-four',
      scheduledFor: 2000,
      context: { liveExecutionEnabled: true },
      heartbeat: () => true,
    });

    expect(receipt).toMatchObject({ status: 'completed', requested: 4, succeeded: 4, skipped: 0 });
    expect(transaction.run.mock.calls.map(([input]) => ({
      offset: input.itemIndexOffset,
      ids: input.prepared.plan.entries.map((entry) => entry.item.id),
    }))).toEqual([
      { offset: 0, ids: [1, 2] },
      { offset: 2, ids: [3, 4] },
    ]);
  });

  it('yields a paced Listing slice and completes the same authorization after resume', async () => {
    let time = 2000;
    const storage = memoryStorage();
    const scheduled = job({ policy: { ...job().policy, maxListings: 2 } });
    const jobStore = createTradeJobStore({ storage, now: () => time });
    jobStore.upsert(scheduled);
    jobStore.authorize(scheduled.id);
    const operationCoordinator = createOperationCoordinator({ now: () => time });
    const entries = [1, 2].map((id) => ({ item: { id, definitionId: 100 + id, pile: 'club' } }));
    const prepare = vi.fn(async (_job, request) => ({
      ready: true,
      job: scheduled,
      plan: { entries: entries.slice(2 - Number(request.maxListings)) },
      confirmation: { token: `slice-${request.maxListings}`, action: 'list' },
    }));
    let slice = 0;
    const transaction = { run: vi.fn(async ({ itemIndexOffset }) => {
      slice += 1;
      return slice === 1
        ? {
            status: 'deferred', reason: 'trade-action-pacing', resumeAt: 5000,
            requested: 2, succeeded: 1, skipped: 0,
            receipts: [{ index: 1, status: 'listed', item: entries[0].item }],
          }
        : {
            status: 'completed', requested: 1, succeeded: 1,
            receipts: [{ index: itemIndexOffset + 1, status: 'listed', item: entries[1].item }],
          };
    }) };
    const executor = createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation: { prepare },
      operationCoordinator,
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory: () => transaction,
      validationGateEnabled: true,
      now: () => time,
    });

    const first = await executor.execute({
      job: scheduled, runId: 'listing-sliced', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(first).toMatchObject({
      status: 'deferred', resumeAt: 5000, requested: 2, succeeded: 1,
      continuation: { runId: 'listing-sliced', succeeded: 1 },
    });
    expect(operationCoordinator.inspect().active).toBeNull();
    expect(jobStore.read()).toMatchObject({
      paused: false,
      liveExecutionEnabled: true,
      authorization: { activeRunId: 'listing-sliced', remainingRuns: 1 },
    });

    time = 5000;
    const second = await executor.execute({
      job: scheduled, runId: 'listing-sliced', scheduledFor: 2000,
      continuation: first.continuation,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(second).toMatchObject({ status: 'completed', requested: 2, succeeded: 2, skipped: 0 });
    expect(transaction.run.mock.calls.map(([input]) => input.itemIndexOffset)).toEqual([0, 1]);
    expect(prepare.mock.calls.map(([, request]) => request.maxListings)).toEqual([2, 1]);
    expect(jobStore.read()).toMatchObject({ paused: true, liveExecutionEnabled: false, jobs: [{ armed: false }] });
  });

  it('supports the offline Scheduled Transfer reprice branch without Club validation', async () => {
    const jobStore = store();
    const prepared = {
      ready: true,
      job: transferRepriceJob(),
      plan: { entries: [{ item: { id: 9, definitionId: 10, pile: 'transfer' } }] },
      confirmation: { token: 'secret', action: 'reprice' },
    };
    const listingPreparation = { prepare: vi.fn(async (preparedJob) => ({ ...prepared, job: preparedJob })) };
    const transaction = { run: vi.fn(async () => ({ status: 'completed', requested: 1, succeeded: 1, receipts: [] })) };
    const transactionFactory = vi.fn(() => transaction);
    const validateClubPlayers = vi.fn();
    const result = await createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory,
      validateClubPlayers,
      validationGateEnabled: true,
      scheduledTransferRepriceEnabled: true,
      now: () => 2000,
    }).execute({
      job: transferRepriceJob(),
      runId: 'transfer-reprice-run',
      scheduledFor: 2000,
      context: {
        liveExecutionEnabled: true,
        fsuReadiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional' },
      },
      heartbeat: () => true,
    });

    expect(result).toMatchObject({ status: 'completed', requested: 1, succeeded: 1 });
    expect(listingPreparation.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ policy: expect.objectContaining({ sources: ['transfer'], expiredPolicy: 'reprice' }) }),
      expect.objectContaining({ maxListings: 1 }),
    );
    expect(transaction.run).toHaveBeenCalledWith(expect.objectContaining({
      approved: true,
      prepared: expect.objectContaining({ job: expect.objectContaining({ policy: expect.objectContaining({ sources: ['transfer'] }) }) }),
    }));
    expect(validateClubPlayers).not.toHaveBeenCalled();
  });

  it('target-validates the selected Club item when FSU is provisional', async () => {
    const jobStore = store();
    const order = [];
    jobStore.relock.mockImplementation(() => order.push('relock'));
    const prepared = {
      ready: true,
      job: job(),
      plan: { entries: [{ item: { id: 10, definitionId: 20, pile: 'club' } }] },
      confirmation: { token: 'secret', action: 'list' },
    };
    const validateClubPlayers = vi.fn(async () => {
      order.push('validate');
      return { ok: true, items: [{ id: 10, definitionId: 20 }], missing: [], elapsed: 12 };
    });
    const transaction = { run: vi.fn(async () => {
      order.push('transaction');
      return { status: 'completed', requested: 1, succeeded: 1, receipts: [] };
    }) };
    const onReceipt = vi.fn();
    const result = await createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation: { prepare: vi.fn(async () => { order.push('prepare'); return prepared; }) },
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory: () => transaction,
      validateClubPlayers,
      validationGateEnabled: true,
      now: () => 2000,
      onReceipt,
    }).execute({
      job: job(),
      runId: 'provisional-run',
      scheduledFor: 2000,
      context: {
        liveExecutionEnabled: true,
        fsuReadiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional', cacheStatus: 'trusted-provisional' },
      },
      heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'completed', succeeded: 1 });
    expect(validateClubPlayers).toHaveBeenCalledWith(
      [{ id: 10, definitionId: 20, pile: 'club' }],
      { label: 'One guarded listing targeted Club validation' },
    );
    expect(order).toEqual(['prepare', 'validate', 'transaction']);
    expect(onReceipt).toHaveBeenCalledWith(result, expect.objectContaining({
      clubValidation: expect.objectContaining({ status: 'passed', elapsed: 12 }),
    }));
  });

  it('fails closed when provisional Club validation cannot confirm the selected item', async () => {
    const transactionFactory = vi.fn();
    const onReceipt = vi.fn();
    const result = await createGuardedScheduledListingExecutor({
      store: store(),
      listingPreparation: {
        prepare: vi.fn(async () => ({
          ready: true,
          job: job(),
          plan: { entries: [{ item: { id: 10, definitionId: 20, pile: 'club' } }] },
          confirmation: { token: 'secret', action: 'list' },
        })),
      },
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory,
      validateClubPlayers: vi.fn(async () => ({ ok: true, items: [], missing: [{ id: 10, definitionId: 20 }] })),
      validationGateEnabled: true,
      now: () => 2000,
      onReceipt,
    }).execute({
      job: job(),
      runId: 'provisional-blocked',
      scheduledFor: 2000,
      context: {
        liveExecutionEnabled: true,
        fsuReadiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional', cacheStatus: 'trusted-provisional' },
      },
      heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'fsu-targeted-club-validation-item-not-returned', requested: 0 });
    expect(transactionFactory).not.toHaveBeenCalled();
    expect(onReceipt).toHaveBeenCalledWith(result, expect.objectContaining({
      clubValidation: expect.objectContaining({ status: 'item-not-returned' }),
    }));
  });

  it('refuses invalid or disabled validation gates before any preparation', async () => {
    const jobStore = store();
    const listingPreparation = { prepare: vi.fn() };
    const base = {
      store: jobStore,
      listingPreparation,
      operationCoordinator: createOperationCoordinator(),
      getTradeAdapter: () => createFakeTradeAdapter(),
      now: () => 2000,
    };
    const disabled = await createGuardedScheduledListingExecutor(base).execute({
      job: job(), runId: 'run-disabled', scheduledFor: 2000, context: { liveExecutionEnabled: true },
    });
    expect(disabled).toMatchObject({ status: 'blocked', reason: 'scheduled-listing-validation-gate-disabled' });
    const invalid = await createGuardedScheduledListingExecutor({ ...base, validationGateEnabled: true }).execute({
      job: job({ policy: { ...job().policy, maxListings: 5 } }),
      runId: 'run-invalid', scheduledFor: 2000, context: { liveExecutionEnabled: true },
    });
    expect(invalid).toMatchObject({ status: 'blocked', reason: 'validation-gate-listing-quantity-cap' });
    expect(listingPreparation.prepare).not.toHaveBeenCalled();
    expect(jobStore.consumeAuthorization).not.toHaveBeenCalled();
  });

  it('retains a blocked Prepared scan for diagnostics without starting a transaction', async () => {
    const jobStore = store();
    const prepared = {
      ready: false,
      blockers: [{ reason: 'no-eligible-listing-candidates' }],
      scan: { counts: { club: 0 }, total: 0 },
      plan: { entries: [], counts: { scanned: 0, eligible: 0, selected: 0 } },
    };
    const transactionFactory = vi.fn();
    const onReceipt = vi.fn();
    const result = await createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation: { prepare: vi.fn(async () => prepared) },
      operationCoordinator: createOperationCoordinator(),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory,
      validationGateEnabled: true,
      now: () => 2000,
      onReceipt,
    }).execute({
      job: job(), runId: 'blocked-run', scheduledFor: 2000, context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'no-eligible-listing-candidates', requested: 0 });
    expect(transactionFactory).not.toHaveBeenCalled();
    expect(onReceipt).toHaveBeenCalledWith(result, expect.objectContaining({ prepared }));
  });

  it('runs through the Scheduler once and persists the relocked, disarmed state', async () => {
    const storage = memoryStorage();
    let time = 1000;
    const jobStore = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    jobStore.upsert(job());
    jobStore.authorize('once-listing');
    time = 2000;
    const transaction = { run: vi.fn(async () => ({ status: 'completed', requested: 1, succeeded: 1, receipts: [] })) };
    const executor = createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation: {
        prepare: async (preparedJob) => ({
          ready: true,
          job: preparedJob,
          plan: { entries: [{ item: { id: 1, definitionId: 2, pile: 'club' } }] },
          confirmation: { token: 'token', action: 'list' },
        }),
      },
      operationCoordinator: createOperationCoordinator({ now: () => time }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory: () => transaction,
      validationGateEnabled: true,
      now: () => time,
    });
    const scheduler = createTradeScheduler({
      store: jobStore,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'tab-a', now: () => time, createToken: () => 'lease-token' }),
      now: () => time,
      createRunId: () => 'scheduled-run-1',
      getContext: () => ({ sessionReady: true, operationBusy: false }),
      executeJob: executor.execute,
    });
    const result = await scheduler.tick();
    expect(result).toMatchObject({ status: 'completed', receipt: { runId: 'scheduled-run-1', succeeded: 1 } });
    expect(transaction.run).toHaveBeenCalledOnce();
    expect(jobStore.read()).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ id: 'once-listing', armed: false }],
      runtimes: { 'once-listing': { status: 'completed', nextRunAt: null, runCount: 1 } },
      history: [{ runId: 'scheduled-run-1', status: 'completed', succeeded: 1 }],
    });
  });

  it('runs one Transfer reprice through the Scheduler and cannot repeat', async () => {
    const storage = memoryStorage();
    let time = 1000;
    const jobStore = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    const scheduledJob = transferRepriceJob();
    jobStore.upsert(scheduledJob);
    jobStore.authorize(scheduledJob.id);
    time = 2000;
    const transaction = { run: vi.fn(async () => ({ status: 'completed', requested: 1, succeeded: 1, receipts: [] })) };
    const executor = createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation: {
        prepare: async (preparedJob) => ({
          ready: true,
          job: preparedJob,
          plan: { entries: [{ item: { id: 9, definitionId: 10, pile: 'transfer' } }] },
          confirmation: { token: 'token', action: 'reprice' },
        }),
      },
      operationCoordinator: createOperationCoordinator({ now: () => time }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory: () => transaction,
      validationGateEnabled: true,
      scheduledTransferRepriceEnabled: true,
      now: () => time,
    });
    const scheduler = createTradeScheduler({
      store: jobStore,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'tab-a', now: () => time, createToken: () => 'lease-token' }),
      now: () => time,
      createRunId: () => 'scheduled-transfer-reprice-run',
      getContext: () => ({ sessionReady: true, operationBusy: false }),
      executeJob: executor.execute,
    });

    const result = await scheduler.tick();
    expect(result).toMatchObject({
      status: 'completed',
      receipt: { runId: 'scheduled-transfer-reprice-run', succeeded: 1 },
    });
    expect(transaction.run).toHaveBeenCalledWith(expect.objectContaining({
      approved: true,
      prepared: expect.objectContaining({
        job: expect.objectContaining({ policy: expect.objectContaining({ sources: ['transfer'], expiredPolicy: 'reprice' }) }),
      }),
    }));
    expect(jobStore.read()).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ id: scheduledJob.id, armed: false }],
      runtimes: { [scheduledJob.id]: { status: 'completed', nextRunAt: null, runCount: 1 } },
      history: [{ runId: 'scheduled-transfer-reprice-run', status: 'completed', succeeded: 1 }],
    });
    expect(await scheduler.tick()).toMatchObject({ status: 'paused' });
    expect(transaction.run).toHaveBeenCalledOnce();
  });
});
