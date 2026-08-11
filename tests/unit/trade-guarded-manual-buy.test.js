import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { createGuardedManualBuyExecutor } from '../../src/trade/guarded-manual-buy.js';
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

function job() {
  return normalizeTradeJob({
    id: 'buy-84', name: 'Buy 84', type: 'buy', enabled: true, armed: false,
    schedule: { type: 'manual' },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 15,
      searchDelaySeconds: [8, 15], maxPurchasesPerSearch: 1, maxConsecutiveEmptySearches: 20,
    },
  }, { now: 1 });
}

function marketItem() {
  return {
    id: 70, definitionId: 8401, type: 'player', rating: 84, tier: 'gold', rare: true,
    auction: { present: true, state: 'active', tradeId: 1070, buyNowPrice: 900, expires: 100 },
  };
}

function setup(overrides = {}) {
  const adapter = overrides.adapter || createFakeTradeAdapter({ coins: 5000, marketItems: [marketItem()] });
  const playerCatalogProvider = {
    load: vi.fn(async () => ({ ok: true, lanes: [{ rating: 84, definitionIds: [8401], source: 'cache' }], missingRatings: [] })),
  };
  const buyPreview = {
    preview: vi.fn(async (input) => ({
      mode: 'preview-only', liveExecutionAllowed: false,
      job: input, plan: { ready: true, missingRatings: [], lanes: [{ rating: 84, definitionIds: [8401] }] },
    })),
  };
  const memory = storage();
  const lease = overrides.lease || createTradeRunLease({
    storage: memory, key: 'lease', ownerId: 'tab-a', now: () => 1000, createToken: () => 'token',
  });
  const onReceipt = vi.fn();
  const executor = createGuardedManualBuyExecutor({
    operationCoordinator: createOperationCoordinator(),
    lease,
    buyPreview,
    playerCatalogProvider,
    getTradeAdapter: () => adapter,
    getSchedulerState: () => ({ paused: true, liveExecutionEnabled: false }),
    now: () => 1000,
    createRunId: () => 'manual-buy-run',
    sleep: async () => {},
    onReceipt,
    ...overrides.options,
  });
  return { adapter, buyPreview, executor, lease, onReceipt };
}

describe('Guarded manual one-card Buy executor', () => {
  it('freshens Preview and completes exactly one confirmed purchase', async () => {
    const { adapter, buyPreview, executor, onReceipt } = setup();
    const receipt = await executor.execute({ job: job(), confirmationText: 'BUY 1 MAX 1000' });
    expect(receipt).toMatchObject({
      runId: 'manual-buy-run', status: 'completed', requested: 1, succeeded: 1,
      receipts: [expect.objectContaining({ status: 'run-summary', buyAttempts: 1 }), expect.objectContaining({ status: 'purchased' })],
    });
    expect(buyPreview.preview).toHaveBeenCalledOnce();
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(1);
    expect(onReceipt).toHaveBeenCalledWith(receipt, expect.objectContaining({ preview: expect.objectContaining({ liveExecutionAllowed: false }) }));
  });

  it('requires the route-specific confirmation and searches only owned definitions for Transfer', async () => {
    const owned = { id: 1, definitionId: 8401, pile: 'club', type: 'player', rating: 84, tier: 'gold', rare: true };
    const adapter = createFakeTradeAdapter({ coins: 5000, items: [owned], marketItems: [marketItem()] });
    const { executor, onReceipt } = setup({ adapter });
    await expect(executor.execute({
      job: job(),
      expectedDestination: 'transfer',
      confirmationText: 'BUY 1 MAX 1000',
    })).rejects.toThrow('BUY 1 TO TRANSFER MAX 1000');
    const receipt = await executor.execute({
      job: job(),
      expectedDestination: 'transfer',
      confirmationText: 'BUY 1 TO TRANSFER MAX 1000',
    });
    expect(receipt).toMatchObject({
      status: 'completed',
      receipts: [expect.objectContaining({ expectedDestination: 'transfer' }), expect.objectContaining({ destination: 'transfer' })],
    });
    expect(onReceipt).toHaveBeenCalledWith(receipt, expect.objectContaining({
      preview: expect.objectContaining({
        validationDestination: expect.objectContaining({ expected: 'transfer', matchingDefinitions: 1, ready: true }),
      }),
    }));
    expect(adapter.calls.filter((call) => call.method === 'inspectDefinitionOwnerships')).toHaveLength(2);
    expect(adapter.calls.filter((call) => call.method === 'inspectDefinitionOwnership')).toHaveLength(1);
  });

  it('requires exact confirmation and a locked Scheduler', async () => {
    const { executor } = setup();
    await expect(executor.execute({ job: job(), confirmationText: 'BUY 1' })).rejects.toThrow('BUY 1 MAX 1000');
    const locked = setup({ options: { getSchedulerState: () => ({ paused: false, liveExecutionEnabled: true }) } });
    await expect(locked.executor.execute({ job: job(), confirmationText: 'BUY 1 MAX 1000' })).resolves.toMatchObject({
      status: 'blocked', reason: 'manual-buy-scheduler-must-be-locked', requested: 0,
    });
    expect(locked.adapter.calls.some((call) => call.method === 'searchMarket')).toBe(false);
  });

  it('blocks before Preview when another tab owns the lease', async () => {
    const memory = storage();
    const oldLease = createTradeRunLease({ storage: memory, key: 'lease', ownerId: 'tab-old', now: () => 1000, createToken: () => 'old' });
    oldLease.acquire({ runId: 'old-run', jobId: 'old-job' });
    const lease = createTradeRunLease({ storage: memory, key: 'lease', ownerId: 'tab-new', now: () => 1000, createToken: () => 'new' });
    const { executor, buyPreview, adapter } = setup({ lease });
    await expect(executor.execute({ job: job(), confirmationText: 'BUY 1 MAX 1000' })).resolves.toMatchObject({
      status: 'blocked', reason: 'lease-held', requested: 0,
    });
    expect(buyPreview.preview).not.toHaveBeenCalled();
    expect(adapter.calls.some((call) => call.method === 'buyNowItem')).toBe(false);
  });

  it('blocks before Preview when fewer than the reconciliation reserve slots remain', async () => {
    const { executor, buyPreview, adapter } = setup({
      options: { requestBudget: { inspect: () => ({ remaining: 11, retryAt: 5000 }) } },
    });
    await expect(executor.execute({ job: job(), confirmationText: 'BUY 1 MAX 1000' })).resolves.toMatchObject({
      status: 'blocked', reason: 'trade-request-budget-insufficient', requested: 0,
    });
    expect(buyPreview.preview).not.toHaveBeenCalled();
    expect(adapter.calls.some((call) => call.method === 'searchMarket')).toBe(false);
  });
});
