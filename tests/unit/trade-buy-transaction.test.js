import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { createBuyTransaction } from '../../src/trade/buy-transaction.js';

function job(overrides = {}) {
  return normalizeTradeJob({
    id: 'buy-84', name: 'Buy 84', type: 'buy', enabled: true, armed: false,
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      quantity: 1, totalBudget: 2000, maxRuntimeMinutes: 10,
      searchDelaySeconds: [1, 1], maxConsecutiveEmptySearches: 2,
      ...overrides,
    },
  }, { now: 1 });
}

function marketItem(id = 70, definitionId = 8401, price = 900) {
  return {
    id, definitionId, type: 'player', rating: 84, tier: 'gold', rare: true,
    auction: { present: true, state: 'active', tradeId: id + 1000, buyNowPrice: price, expires: 100 },
  };
}

function catalog(ids = [8401]) {
  return { load: vi.fn(async () => ({ ok: true, lanes: [{ rating: 84, definitionIds: ids, source: 'cache' }] })) };
}

function transaction(adapter, catalogProvider, times = [1000, 1001, 1002, 1003]) {
  let index = 0;
  return createBuyTransaction({
    tradeAdapter: adapter,
    playerCatalogProvider: catalogProvider,
    now: () => times[Math.min(index++, times.length - 1)],
    sleep: async () => {},
    random: () => 0,
    createRunId: () => 'buy-run-1',
  });
}

describe('Trade Buy Transaction', () => {
  it('buys one exact item, routes a non-duplicate to Club and verifies it', async () => {
    const adapter = createFakeTradeAdapter({ coins: 5000, marketItems: [marketItem()] });
    const result = await transaction(adapter, catalog()).run({ job: job(), platform: 'pc' });
    expect(result).toMatchObject({
      runId: 'buy-run-1', status: 'completed', requested: 1, succeeded: 1, failed: 0, skipped: 0,
      coinsBefore: 5000, coinsAfter: 4100,
      receipts: [
        { status: 'run-summary', searches: 1, spent: 900 },
        { status: 'purchased', tradeId: 1070, price: 900, destination: 'club', verification: { item: { pile: 'club' } } },
      ],
    });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(1);
  });

  it('buys two adjacent rating lanes and preserves per-item routing receipts', async () => {
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      marketItems: [marketItem(70, 8401, 900), { ...marketItem(71, 8501, 1000), rating: 85 }],
    });
    const provider = {
      load: vi.fn(async () => ({
        ok: true,
        lanes: [
          { rating: 84, definitionIds: [8401], source: 'cache' },
          { rating: 85, definitionIds: [8501], source: 'cache' },
        ],
      })),
    };
    const result = await transaction(adapter, provider).run({
      job: job({ ratingMax: 85, quantity: 2, totalBudget: 2000 }),
      platform: 'pc',
      maxBuyAttempts: 2,
    });

    expect(result).toMatchObject({
      status: 'completed', requested: 2, succeeded: 2, failed: 0, skipped: 0,
      coinsBefore: 5000, coinsAfter: 3100,
    });
    expect(result.receipts.filter((entry) => entry.status === 'purchased')).toEqual([
      expect.objectContaining({ rating: expect.any(Number), destination: 'club' }),
      expect.objectContaining({ rating: expect.any(Number), destination: 'club' }),
    ]);
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(2);
  });

  it('preserves one purchase and never attempts beyond an ambiguous second Buy', async () => {
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      marketItems: [marketItem(70, 8401, 900), marketItem(71, 8401, 900)],
      buyResults: { 1071: { status: 'ambiguous', error: { kind: 'ambiguous-transport' } } },
    });
    const phases = [];
    const result = await createBuyTransaction({
      tradeAdapter: adapter,
      playerCatalogProvider: catalog([8401]),
      now: () => 1000,
      sleep: async () => {},
      random: () => 0,
      createRunId: () => 'buy-two-partial',
      onCheckpoint: (entry) => phases.push(entry),
    }).run({
      job: job({ quantity: 2, totalBudget: 2000 }),
      maxBuyAttempts: 2,
    });

    expect(result).toMatchObject({ status: 'ambiguous', succeeded: 1, failed: 1, skipped: 0 });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(2);
    expect(phases.filter((entry) => entry.phase === 'buy-request-started')).toEqual([
      expect.objectContaining({ itemIndex: 1, mutationBoundaryCrossed: true }),
      expect.objectContaining({ itemIndex: 2, mutationBoundaryCrossed: true }),
    ]);
  });

  it('routes a duplicate to Transfer and blocks before buying when Transfer is full', async () => {
    const base = { id: 1, definitionId: 8401, pile: 'club', type: 'player', rating: 84, tier: 'gold', rare: true };
    const adapter = createFakeTradeAdapter({
      coins: 5000, transferCapacity: { used: 10, max: 100 }, items: [base], marketItems: [marketItem()],
    });
    const routed = await transaction(adapter, catalog()).run({ job: job() });
    expect(routed).toMatchObject({ status: 'completed', receipts: [expect.anything(), { destination: 'transfer' }] });

    const full = createFakeTradeAdapter({
      coins: 5000, transferCapacity: { used: 100, max: 100 }, items: [base], marketItems: [marketItem()],
    });
    const blocked = await transaction(full, catalog()).run({ job: job() });
    expect(blocked).toMatchObject({ status: 'blocked', reason: 'transfer-list-full', succeeded: 0 });
    expect(full.calls.some((call) => call.method === 'buyNowItem')).toBe(false);
  });

  it('filters manual validation searches by the expected destination', async () => {
    const owned = { id: 1, definitionId: 8401, pile: 'club', type: 'player', rating: 84, tier: 'gold', rare: true };
    const transferAdapter = createFakeTradeAdapter({
      coins: 5000,
      items: [owned],
      marketItems: [marketItem(70, 8401), marketItem(71, 8402)],
    });
    const transferResult = await transaction(transferAdapter, catalog([8401, 8402])).run({
      job: job(),
      expectedDestination: 'transfer',
    });
    expect(transferResult).toMatchObject({
      status: 'completed',
      receipts: [
        expect.objectContaining({ expectedDestination: 'transfer', buyAttempts: 1 }),
        expect.objectContaining({ destination: 'transfer', search: expect.objectContaining({ definitionId: 8401 }) }),
      ],
    });
    expect(transferAdapter.calls.filter((call) => call.method === 'inspectDefinitionOwnerships')).toHaveLength(1);
    expect(transferAdapter.calls.filter((call) => call.method === 'inspectDefinitionOwnership')).toHaveLength(1);

    const clubAdapter = createFakeTradeAdapter({
      coins: 5000,
      items: [owned],
      marketItems: [marketItem(70, 8401), marketItem(71, 8402)],
    });
    const clubResult = await transaction(clubAdapter, catalog([8401, 8402])).run({
      job: job(),
      expectedDestination: 'club',
    });
    expect(clubResult).toMatchObject({
      status: 'completed',
      receipts: [expect.anything(), expect.objectContaining({ destination: 'club', search: expect.objectContaining({ definitionId: 8402 }) })],
    });
  });

  it('blocks before a market search when no definition matches the expected destination', async () => {
    const adapter = createFakeTradeAdapter({ coins: 5000, marketItems: [marketItem()] });
    const result = await transaction(adapter, catalog()).run({ job: job(), expectedDestination: 'transfer' });
    expect(result).toMatchObject({ status: 'blocked', reason: 'buy-transfer-definitions-unavailable', succeeded: 0 });
    expect(adapter.calls.some((call) => call.method === 'searchMarket')).toBe(false);
    expect(adapter.calls.some((call) => call.method === 'buyNowItem')).toBe(false);
  });

  it('blocks a controlled Transfer validation before search when Transfer is full', async () => {
    const owned = { id: 1, definitionId: 8401, pile: 'club', type: 'player', rating: 84, tier: 'gold', rare: true };
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      transferCapacity: { used: 100, max: 100 },
      items: [owned],
      marketItems: [marketItem()],
    });
    const result = await transaction(adapter, catalog()).run({ job: job(), expectedDestination: 'transfer' });
    expect(result).toMatchObject({ status: 'blocked', reason: 'transfer-list-full', requested: 1, succeeded: 0 });
    expect(adapter.calls.some((call) => call.method === 'searchMarket')).toBe(false);
    expect(adapter.calls.some((call) => call.method === 'buyNowItem')).toBe(false);
  });

  it('stops before search when Unassigned is not ready', async () => {
    const adapter = createFakeTradeAdapter({ coins: 5000, unassignedReady: false, marketItems: [marketItem()] });
    const result = await transaction(adapter, catalog()).run({ job: job() });
    expect(result).toMatchObject({ status: 'blocked', reason: 'unassigned-not-empty', succeeded: 0 });
    expect(adapter.calls.some((call) => call.method === 'searchMarket')).toBe(false);
  });

  it('reconciles an ambiguous response once and never repeats a successful purchase', async () => {
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      marketItems: [marketItem()],
      buyResults: { 1070: { status: 'ambiguous', materialize: true, response: null, error: { kind: 'ambiguous-transport' } } },
    });
    const result = await transaction(adapter, catalog()).run({ job: job() });
    expect(result).toMatchObject({ status: 'completed', succeeded: 1, coinsAfter: 4100 });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(1);
  });

  it('stops ambiguous when a materialized item has no matching coin debit evidence', async () => {
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      marketItems: [marketItem()],
      buyResults: { 1070: { status: 'ambiguous', materialize: true, preserveCoins: true, error: { kind: 'ambiguous-transport' } } },
    });
    const result = await transaction(adapter, catalog()).run({ job: job() });
    expect(result).toMatchObject({
      status: 'ambiguous', reason: 'purchase-coin-change-not-reconciled', succeeded: 0, failed: 1,
      receipts: [expect.anything(), { coinsBefore: 5000, coinsAfter: 5000, price: 900, priceLimit: 1000 }],
    });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(1);
    expect(adapter.calls.some((call) => call.method === 'routePurchasedItem')).toBe(false);
  });

  it('rechecks the shared circuit after search and blocks before Buy Now', async () => {
    const adapter = createFakeTradeAdapter({ coins: 5000, marketItems: [marketItem()] });
    const availability = vi.fn()
      .mockReturnValueOnce({ allowed: true })
      .mockReturnValueOnce({ allowed: true })
      .mockReturnValue({ allowed: false });
    const result = await createBuyTransaction({
      tradeAdapter: adapter,
      playerCatalogProvider: catalog(),
      circuitBreaker: { availability },
      now: () => 1000,
      sleep: async () => {},
      createRunId: () => 'buy-run-circuit-race',
    }).run({ job: job() });
    expect(result).toMatchObject({ status: 'blocked', reason: 'trade-circuit-open', succeeded: 0 });
    expect(adapter.calls.filter((call) => call.method === 'searchMarket')).toHaveLength(1);
    expect(adapter.calls.some((call) => call.method === 'buyNowItem')).toBe(false);
  });

  it('opens the circuit when purchase reconciliation receives EA 427', async () => {
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      marketItems: [marketItem()],
      refreshPurchaseResult: {
        status: 'rejected', response: { status: 427 }, error: { kind: 'auction-operation-blocked', code: 427 },
      },
    });
    const circuit = { availability: () => ({ allowed: true }), recordFailure: vi.fn(), recordSuccess: vi.fn() };
    const result = await createBuyTransaction({
      tradeAdapter: adapter,
      playerCatalogProvider: catalog(),
      circuitBreaker: circuit,
      now: () => 1000,
      sleep: async () => {},
      createRunId: () => 'buy-run-refresh-427',
    }).run({ job: job() });
    expect(result).toMatchObject({ status: 'blocked', reason: 'trade-auction-operation-blocked', succeeded: 0, failed: 1 });
    expect(circuit.recordFailure).toHaveBeenCalledWith(expect.objectContaining({ code: 427 }), expect.objectContaining({ action: 'buy-reconciliation' }));
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(1);
    expect(adapter.calls.some((call) => call.method === 'routePurchasedItem')).toBe(false);
  });

  it('keeps an accepted purchase ambiguous when local budget blocks reconciliation without opening Circuit', async () => {
    const base = createFakeTradeAdapter({ coins: 5000, marketItems: [marketItem()] });
    const adapter = {
      ...base,
      refreshPurchaseState: vi.fn(async () => ({
        status: 'blocked', response: null,
        error: { kind: 'request-budget-exhausted', action: 'wait-until-budget-reset', retryAt: 6000 },
      })),
    };
    const circuit = { availability: () => ({ allowed: true }), recordFailure: vi.fn(), recordSuccess: vi.fn() };
    const result = await createBuyTransaction({
      tradeAdapter: adapter,
      playerCatalogProvider: catalog(),
      circuitBreaker: circuit,
      now: () => 1000,
      sleep: async () => {},
      createRunId: () => 'buy-run-budget-reconciliation',
    }).run({ job: job() });
    expect(result).toMatchObject({
      status: 'ambiguous',
      reason: 'purchase-accepted-request-budget-exhausted-before-verification',
      succeeded: 0,
      failed: 1,
    });
    expect(base.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(1);
    expect(base.calls.some((call) => call.method === 'routePurchasedItem')).toBe(false);
    expect(circuit.recordFailure).not.toHaveBeenCalled();
    expect(circuit.recordSuccess).not.toHaveBeenCalled();
  });

  it('blocks before Buy when local budget stops the market search without opening Circuit', async () => {
    const base = createFakeTradeAdapter({ coins: 5000 });
    const adapter = {
      ...base,
      searchMarket: vi.fn(async () => ({
        status: 'blocked', response: null, candidates: [],
        error: { kind: 'request-budget-exhausted', action: 'wait-until-budget-reset', retryAt: 6000 },
      })),
    };
    const circuit = { availability: () => ({ allowed: true }), recordFailure: vi.fn(), recordSuccess: vi.fn() };
    const result = await createBuyTransaction({
      tradeAdapter: adapter,
      playerCatalogProvider: catalog(),
      circuitBreaker: circuit,
      now: () => 1000,
      sleep: async () => {},
    }).run({ job: job() });
    expect(result).toMatchObject({ status: 'blocked', reason: 'trade-request-budget-exhausted', succeeded: 0 });
    expect(base.calls.some((call) => call.method === 'buyNowItem')).toBe(false);
    expect(circuit.recordFailure).not.toHaveBeenCalled();
  });

  it('opens the circuit and stops without retrying an EA 427 Buy rejection', async () => {
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      marketItems: [marketItem()],
      buyResults: { 1070: { status: 'rejected', response: { status: 427 }, error: { kind: 'auction-operation-blocked', code: 427 } } },
    });
    const circuit = { availability: () => ({ allowed: true }), recordFailure: vi.fn(), recordSuccess: vi.fn() };
    const result = await createBuyTransaction({
      tradeAdapter: adapter,
      playerCatalogProvider: catalog(),
      circuitBreaker: circuit,
      now: () => 1000,
      sleep: async () => {},
      createRunId: () => 'buy-run-427',
    }).run({ job: job() });
    expect(result).toMatchObject({ status: 'blocked', reason: 'trade-auction-operation-blocked', failed: 1 });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(1);
    expect(circuit.recordFailure).toHaveBeenCalledWith(expect.objectContaining({ code: 427 }), expect.objectContaining({ action: 'buy', runId: 'buy-run-427' }));
    expect(circuit.recordSuccess).not.toHaveBeenCalled();
  });

  it('stops at the configured empty-search limit', async () => {
    const adapter = createFakeTradeAdapter({ coins: 5000, marketItems: [] });
    const result = await transaction(adapter, catalog()).run({ job: job({ maxConsecutiveEmptySearches: 2 }) });
    expect(result).toMatchObject({ status: 'stopped', reason: 'empty-search-limit', succeeded: 0, skipped: 1 });
    expect(adapter.calls.filter((call) => call.method === 'searchMarket')).toHaveLength(2);
    expect(adapter.calls.some((call) => call.method === 'buyNowItem')).toBe(false);
  });

  it('allows a guarded caller to authorize at most one Buy Now mutation', async () => {
    const first = marketItem();
    const adapter = createFakeTradeAdapter({
      coins: 5000,
      marketItems: [first],
      buyResults: { 1070: { status: 'rejected', error: { kind: 'competition-lost' } } },
    });
    const result = await transaction(adapter, catalog()).run({
      job: job({ maxConsecutiveEmptySearches: 5 }),
      maxBuyAttempts: 1,
    });
    expect(result).toMatchObject({
      status: 'stopped', reason: 'buy-attempt-limit', succeeded: 0,
      receipts: [expect.objectContaining({ buyAttempts: 1 }), expect.objectContaining({ status: 'competition-lost' })],
    });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(1);
  });

  it('checks the guarded lease immediately before Buy Now', async () => {
    const adapter = createFakeTradeAdapter({ coins: 5000, marketItems: [marketItem()] });
    const result = await transaction(adapter, catalog()).run({
      job: job(),
      maxBuyAttempts: 1,
      beforeBuy: () => false,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'buy-execution-lease-lost', succeeded: 0 });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(0);
  });

  it('preserves the scheduled Buy minimum coin floor before Buy Now', async () => {
    const adapter = createFakeTradeAdapter({ coins: 5000, marketItems: [marketItem()] });
    const result = await transaction(adapter, catalog()).run({
      job: job(),
      minimumRetainedCoins: 4200,
      maxBuyAttempts: 1,
      beforeBuy: () => true,
    });
    expect(result).toMatchObject({
      status: 'stopped',
      reason: 'empty-search-limit',
      succeeded: 0,
    });
    expect(result.receipts[0]).toMatchObject({ minimumRetainedCoins: 4200, buyAttempts: 0 });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(0);
  });

  it('refreshes the actual destination before route verification', async () => {
    const adapter = createFakeTradeAdapter({ coins: 5000, marketItems: [marketItem()] });
    const result = await transaction(adapter, catalog()).run({ job: job(), maxBuyAttempts: 1 });
    expect(result).toMatchObject({ status: 'completed', succeeded: 1 });
    expect(adapter.calls.filter((call) => call.method === 'refreshPurchaseState').at(-1)).toMatchObject({
      options: { destination: 'club' },
    });
  });

  it('checkpoints every mutation boundary before and after Buy and routing', async () => {
    const adapter = createFakeTradeAdapter({ coins: 5000, marketItems: [marketItem()] });
    const phases = [];
    const result = await createBuyTransaction({
      tradeAdapter: adapter,
      playerCatalogProvider: catalog(),
      now: () => 1000,
      sleep: async () => {},
      createRunId: () => 'buy-run-checkpoints',
      onCheckpoint: (entry) => phases.push(entry.phase),
    }).run({ job: job(), maxBuyAttempts: 1, beforeBuy: () => true });

    expect(result.status).toBe('completed');
    expect(phases).toEqual([
      'transaction-start',
      'catalog-loaded',
      'destination-filtered',
      'market-search-started',
      'market-search-finished',
      'candidate-selected',
      'buy-request-started',
      'buy-response-received',
      'purchase-reconciliation-started',
      'purchase-reconciliation-finished',
      'purchase-route-started',
      'purchase-route-finished',
      'route-verification-refresh-started',
      'route-verification-refresh-finished',
      'route-verification-inspected',
      'item-finished',
    ]);
  });
});
