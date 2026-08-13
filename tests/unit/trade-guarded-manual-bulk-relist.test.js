import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createBulkRelistPreview } from '../../src/trade/bulk-relist-preview.js';
import { createTradeBulkRelistJournal } from '../../src/trade/bulk-relist-journal.js';
import { createTradeCircuitBreaker } from '../../src/trade/circuit-breaker.js';
import { createGuardedManualBulkRelistExecutor } from '../../src/trade/guarded-manual-bulk-relist.js';
import { createOperationCoordinator } from '../../src/trade/operation-coordinator.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';

function storage() {
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

async function setup(overrides = {}) {
  const adapter = overrides.adapter || createFakeTradeAdapter({ items: [unsold()] });
  const memory = storage();
  const journal = overrides.journal || createTradeBulkRelistJournal({ storage: memory, key: 'journal', now: () => 1000 });
  const lease = createTradeRunLease({
    storage: memory, key: 'lease', ownerId: 'tab-a', now: () => 1000, createToken: () => 'lease-token',
  });
  const operationCoordinator = createOperationCoordinator();
  const preview = await createBulkRelistPreview({
    getTradeAdapter: () => adapter, now: () => 1000, createToken: () => 'approval-token',
  }).preview();
  const onRunningChange = vi.fn();
  const onReceipt = vi.fn();
  const executor = createGuardedManualBulkRelistExecutor({
    operationCoordinator,
    lease,
    journal,
    getTradeAdapter: () => adapter,
    getSchedulerState: () => ({ paused: true, liveExecutionEnabled: false }),
    now: () => 1000,
    createRunId: () => 'manual-bulk-run',
    onRunningChange,
    onReceipt,
    ...overrides.options,
  });
  return { adapter, executor, journal, lease, operationCoordinator, preview, onRunningChange, onReceipt };
}

describe('Guarded manual Re-list All executor', () => {
  it('requires direct approval, a locked Scheduler, idle recovery, one Lease and one Coordinator operation', async () => {
    const ready = await setup();
    await expect(ready.executor.execute({ preview: ready.preview })).rejects.toThrow('explicit approval');

    const unlocked = await setup({ options: { getSchedulerState: () => ({ paused: false, liveExecutionEnabled: true }) } });
    await expect(unlocked.executor.execute({
      approved: true, preview: unlocked.preview, confirmationToken: 'approval-token',
    })).resolves.toMatchObject({ status: 'blocked', reason: 'manual-bulk-relist-scheduler-must-be-locked' });
    expect(unlocked.adapter.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);

    const receipt = await ready.executor.execute({
      approved: true, preview: ready.preview, confirmationToken: 'approval-token',
    });
    expect(receipt).toMatchObject({ status: 'completed', jobType: 'bulk-relist', requested: 1, succeeded: 1 });
    expect(ready.onRunningChange).toHaveBeenNthCalledWith(1, true, expect.objectContaining({ runId: 'manual-bulk-run' }));
    expect(ready.onRunningChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ runId: 'manual-bulk-run' }));
    expect(ready.onReceipt).toHaveBeenCalledWith(receipt, expect.objectContaining({ preview: ready.preview }));
    expect(ready.lease.inspect().lease).toBeNull();
    expect(ready.operationCoordinator.inspect().active).toBeNull();
  });

  it('blocks before Journal begin when another Trade recovery review exists', async () => {
    const result = await setup({
      options: { inspectRecovery: () => ({ reviewRequired: true, reason: 'listing-journal-mutation-review-required' }) },
    });
    await expect(result.executor.execute({
      approved: true, preview: result.preview, confirmationToken: 'approval-token',
    })).resolves.toMatchObject({ status: 'blocked', reason: 'listing-journal-mutation-review-required' });
    expect(result.journal.snapshot()).toBeNull();
    expect(result.adapter.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);
  });

  it('persists partial aggregate reconciliation as a recoverable unknown Journal', async () => {
    const adapter = createFakeTradeAdapter({
      items: [unsold(1), unsold(2)],
      bulkRelistResult: { status: 'accepted', itemIds: [1] },
    });
    const result = await setup({ adapter });
    await expect(result.executor.execute({
      approved: true, preview: result.preview, confirmationToken: 'approval-token',
    })).resolves.toMatchObject({ status: 'ambiguous', reason: 'bulk-relist-partial' });
    expect(result.journal.inspectRecovery()).toMatchObject({
      canSupersede: false, uncertainMutation: true, reason: 'bulk-relist-journal-mutation-review-required',
    });
  });

  it('opens the persistent Circuit on an explicit EA 427 without leaving unknown Journal items', async () => {
    const memory = storage();
    const circuitBreaker = createTradeCircuitBreaker({ storage: memory, key: 'circuit', now: () => 1000 });
    const adapter = createFakeTradeAdapter({
      items: [unsold()],
      bulkRelistResult: {
        status: 'rejected',
        response: { success: false, status: 427, code: null },
        error: { kind: 'auction-operation-blocked', code: 427, action: 'stop-and-require-manual-reset' },
      },
    });
    const result = await setup({ adapter, options: { circuitBreaker } });
    await expect(result.executor.execute({
      approved: true, preview: result.preview, confirmationToken: 'approval-token',
    })).resolves.toMatchObject({
      status: 'blocked', reason: 'trade-auction-operation-blocked', requested: 1, failed: 1,
      receipts: [expect.objectContaining({ status: 'failed', mutationBoundaryCrossed: true })],
    });
    expect(result.journal.inspectRecovery()).toMatchObject({ canSupersede: true, uncertainMutation: false });
    expect(result.journal.snapshot().items).toEqual([
      expect.objectContaining({ status: 'failed', mutationBoundaryCrossed: true }),
    ]);
    expect(circuitBreaker.availability()).toMatchObject({
      allowed: false,
      state: { state: 'open', reason: 'auction-operation-blocked', persistent: true },
    });
  });

  it('persists accepted-but-unrefreshable mutations as unknown Recovery evidence', async () => {
    const adapter = createFakeTradeAdapter({
      items: [unsold()],
      refreshTransferResults: [
        { status: 'completed', response: { success: true }, error: null },
        { status: 'completed', response: { success: true }, error: null },
        { status: 'error', response: null, error: { kind: 'ambiguous-transport' } },
      ],
    });
    const result = await setup({ adapter });
    await expect(result.executor.execute({
      approved: true, preview: result.preview, confirmationToken: 'approval-token',
    })).resolves.toMatchObject({ status: 'ambiguous', reason: 'bulk-relist-accepted-refresh-failed' });
    expect(result.journal.snapshot()).toMatchObject({
      status: 'ambiguous',
      phase: 'receipt-recorded',
      items: [expect.objectContaining({ status: 'unknown', mutationBoundaryCrossed: true })],
    });
    expect(result.journal.inspectRecovery()).toMatchObject({
      canSupersede: false, uncertainMutation: true, reason: 'bulk-relist-journal-mutation-review-required',
    });
  });
});
