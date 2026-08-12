import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createTradeBuyJournal } from '../../src/trade/buy-journal.js';
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

function job(overrides = {}) {
  return normalizeTradeJob({
    id: 'buy-84', name: 'Buy 84', type: 'buy', enabled: true, armed: false,
    schedule: { type: 'manual' },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 15,
      searchDelaySeconds: [8, 15], maxPurchasesPerSearch: 1, maxConsecutiveEmptySearches: 20,
      ...overrides,
    },
  }, { now: 1 });
}

function marketItem(id = 70, definitionId = 8401, buyNowPrice = 900) {
  return {
    id, definitionId, type: 'player', rating: 84, tier: 'gold', rare: true,
    auction: { present: true, state: 'active', tradeId: id + 1000, buyNowPrice, expires: 100 },
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
  const operationCoordinator = overrides.options?.operationCoordinator || createOperationCoordinator();
  const onReceipt = vi.fn();
  const requestBudget = {
    inspect: () => ({ remaining: 30 }),
    reserve: vi.fn(async () => ({ ready: true, release: vi.fn(async () => {}) })),
  };
  const executor = createGuardedManualBuyExecutor({
    operationCoordinator,
    lease,
    buyPreview,
    playerCatalogProvider,
    getTradeAdapter: () => adapter,
    getSchedulerState: () => ({ paused: true, liveExecutionEnabled: false }),
    now: () => 1000,
    createRunId: () => 'manual-buy-run',
    sleep: async () => {},
    onReceipt,
    requestBudget,
    ...overrides.options,
  });
  return { adapter, buyPreview, executor, lease, operationCoordinator, onReceipt };
}

describe('Guarded manual Buy executor', () => {
  it('freshens Preview and completes exactly one confirmed purchase', async () => {
    const { adapter, buyPreview, executor, onReceipt } = setup();
    const receipt = await executor.execute({ job: job(), confirmationText: 'BUY 1 MAX 1000' });
    expect(receipt).toMatchObject({
      runId: 'manual-buy-run', status: 'completed', requested: 1, succeeded: 1,
      receipts: expect.arrayContaining([
        expect.objectContaining({ status: 'run-summary', buyAttempts: 1 }),
        expect.objectContaining({ status: 'chunk-summary', succeeded: 1 }),
        expect.objectContaining({ status: 'purchased' }),
      ]),
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
      receipts: expect.arrayContaining([
        expect.objectContaining({ expectedDestination: 'transfer' }),
        expect.objectContaining({ destination: 'transfer' }),
      ]),
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

  it('reconciles an exact prior Buy journal destination without starting another purchase', async () => {
    const journal = createTradeBuyJournal({ storage: storage(), key: 'buy-journal', now: () => 1000 });
    journal.begin({ runId: 'prior-buy', jobId: 'buy-84', expectedDestination: 'transfer', requested: 1 });
    journal.checkpoint('prior-buy', {
      phase: 'item-finished', itemIndex: 1, status: 'ambiguous', reason: 'purchase-not-reconciled',
      item: { id: 70, definitionId: 8401, pile: 'market' }, tradeId: 1070, price: 900,
      destination: 'transfer', mutationBoundaryCrossed: true,
    });
    journal.finish('prior-buy', { phase: 'receipt-recorded', status: 'ambiguous' });
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      items: [{ id: 70, definitionId: 8401, pile: 'transfer', purchasePrice: 900 }],
      marketItems: [marketItem(71)],
    });
    const { executor, buyPreview } = setup({ adapter, options: { journal } });

    await expect(executor.execute({ job: job(), confirmationText: 'BUY 1 MAX 1000' })).resolves.toMatchObject({
      status: 'blocked', reason: 'buy-journal-reconciled-retry-required', requested: 0,
    });
    expect(journal.inspectRecovery()).toMatchObject({ canSupersede: true });
    expect(buyPreview.preview).not.toHaveBeenCalled();
    expect(adapter.calls.some((call) => call.method === 'buyNowItem')).toBe(false);
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

  it('waits for chunk capacity and then executes without another confirmation', async () => {
    let time = 1000;
    const requestBudget = {
      reserve: vi.fn()
        .mockResolvedValueOnce({ ready: false, remaining: 11, retryAt: 2000 })
        .mockResolvedValueOnce({ ready: true, release: vi.fn(async () => {}) }),
    };
    const { executor, buyPreview, adapter } = setup({
      options: {
        requestBudget,
        now: () => time,
        sleep: async (ms) => { time += ms; },
      },
    });
    await expect(executor.execute({ job: job(), confirmationText: 'BUY 1 MAX 1000' })).resolves.toMatchObject({
      status: 'completed', requested: 1, succeeded: 1,
    });
    expect(buyPreview.preview).toHaveBeenCalledOnce();
    expect(requestBudget.reserve).toHaveBeenCalledTimes(2);
    expect(adapter.calls.some((call) => call.method === 'searchMarket')).toBe(true);
  });

  it('reports Journal-backed transaction and chunk progress to the caller', async () => {
    const onProgress = vi.fn();
    const { executor } = setup();
    const receipt = await executor.execute({
      job: job(),
      confirmationText: 'BUY 1 MAX 1000',
      onProgress,
    });

    expect(receipt.status).toBe('completed');
    expect(onProgress.mock.calls.map(([checkpoint]) => checkpoint.phase)).toEqual(expect.arrayContaining([
      'preview-started',
      'chunk-started',
      'market-search-started',
      'purchase-reconciliation-started',
      'item-finished',
      'chunk-finished',
    ]));
  });

  it('executes two adjacent rating lanes under one confirmation and one Lease', async () => {
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      marketItems: [
        marketItem(),
        {
          ...marketItem(), id: 71, definitionId: 8501, rating: 85,
          auction: { ...marketItem().auction, tradeId: 1071, buyNowPrice: 1000 },
        },
      ],
    });
    const dualJob = job({ ratingMax: 85, quantity: 2, totalBudget: 2000 });
    const lanes = [
      { rating: 84, definitionIds: [8401], source: 'cache' },
      { rating: 85, definitionIds: [8501], source: 'cache' },
    ];
    const requestBudget = {
      inspect: () => ({ remaining: 30 }),
      reserve: vi.fn(async () => ({ ready: true, release: vi.fn(async () => {}) })),
    };
    const { executor } = setup({
      adapter,
      options: {
        requestBudget,
        playerCatalogProvider: { load: vi.fn(async () => ({ ok: true, lanes })) },
        buyPreview: {
          preview: vi.fn(async (input) => ({
            mode: 'preview-only', liveExecutionAllowed: false, job: input,
            plan: { ready: true, missingRatings: [], lanes },
          })),
        },
        getTradeAdapter: () => adapter,
      },
    });

    const receipt = await executor.execute({ job: dualJob, confirmationText: 'BUY 2 MAX 1000' });

    expect(receipt).toMatchObject({ status: 'completed', requested: 2, succeeded: 2 });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(2);
    expect(requestBudget.reserve).toHaveBeenCalledWith(28);
  });

  it('executes four items as two chunks and preserves rating quotas across chunks', async () => {
    const lanes = [84, 85, 86].map((rating) => ({
      rating,
      definitionIds: [rating * 100 + 1],
      source: 'cache',
    }));
    const adapter = createFakeTradeAdapter({
      coins: 9000,
      marketItems: [
        marketItem(70, 8401, 900),
        marketItem(71, 8401, 900),
        { ...marketItem(72, 8501, 900), rating: 85 },
        { ...marketItem(73, 8601, 900), rating: 86 },
      ],
    });
    const requestBudget = {
      reserve: vi.fn(async () => ({ ready: true, release: vi.fn(async () => {}) })),
    };
    const { executor } = setup({
      adapter,
      options: {
        requestBudget,
        getTradeAdapter: () => adapter,
        playerCatalogProvider: { load: vi.fn(async () => ({ ok: true, lanes })) },
        buyPreview: {
          preview: vi.fn(async (input) => ({
            mode: 'preview-only', liveExecutionAllowed: false, job: input,
            plan: { ready: true, missingRatings: [], lanes },
          })),
        },
      },
    });
    const quotaJob = job({
      ratingMax: 86,
      ratingQuantityOverrides: { 84: 2, 85: 1, 86: 1 },
      quantity: 4,
      totalBudget: 4000,
    });

    const receipt = await executor.execute({ job: quotaJob, confirmationText: 'BUY 4 MAX 1000' });
    const purchases = receipt.receipts.filter((entry) => entry.status === 'purchased');
    expect(receipt).toMatchObject({ status: 'completed', requested: 4, succeeded: 4, skipped: 0 });
    expect(requestBudget.reserve.mock.calls).toEqual([[28], [28]]);
    expect(purchases.map((entry) => entry.index)).toEqual([1, 2, 3, 4]);
    expect(Object.fromEntries([84, 85, 86].map((rating) => [
      rating,
      purchases.filter((entry) => entry.rating === rating).length,
    ]))).toEqual({ 84: 2, 85: 1, 86: 1 });
  });

  it('releases the Lease and Coordinator when Journal begin detects a cross-tab conflict', async () => {
    const journal = {
      inspectRecovery: vi.fn(() => ({ canSupersede: true })),
      begin: vi.fn(() => { throw new Error('buy-journal-mutation-review-required'); }),
      finish: vi.fn(),
    };
    const onRunningChange = vi.fn();
    const { executor, lease, operationCoordinator, buyPreview } = setup({
      options: { journal, onRunningChange },
    });

    await expect(executor.execute({
      job: job(), confirmationText: 'BUY 1 MAX 1000',
    })).rejects.toThrow('buy-journal-mutation-review-required');

    expect(lease.inspect().lease).toBeNull();
    expect(operationCoordinator.inspect().active).toBeNull();
    expect(buyPreview.preview).not.toHaveBeenCalled();
    expect(onRunningChange).not.toHaveBeenCalled();
  });
});
