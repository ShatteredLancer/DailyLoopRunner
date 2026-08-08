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
});
