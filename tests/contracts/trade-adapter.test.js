import { describe, expect, it } from 'vitest';
import { createEaInventoryAdapter } from '../../src/adapters/ea/inventory.js';
import { createEaTradeAdapter } from '../../src/adapters/ea/trade.js';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createRuntimeAdapters } from '../../src/adapters/index.js';

function eaRuntime(item) {
  class UTSearchCriteriaDTO {
    constructor() {
      this.type = null;
      this.category = null;
      this.defId = [];
      this.maxBuy = 0;
      this.accessToken = 'must-not-leak';
    }
  }
  const transfer = [item];
  return {
    UTSearchCriteriaDTO,
    TradeAccessLevel: { ALLOWED: 1 },
    ItemPile: { TRANSFER: 'transfer' },
    GameCurrency: { COINS: 'coins' },
    services: {
      User: { getUser: () => ({ tradeAccess: 1, coins: 123456, personaId: 'private' }) },
      Item: {
        searchTransferMarket() {},
        clearTransferMarketCache() {},
        bid() {},
        move() {},
        list() {},
        relistExpiredAuctions() {},
        requestTransferItems() {},
        requestMarketData(target) {
          return {
            observe(context, callback) {
              target._itemPriceLimits = { minimum: 300, maximum: 10000 };
              callback({ unobserve() {} }, { success: true });
            },
          };
        },
      },
    },
    repositories: {
      Item: {
        transfer: { _collection: transfer },
        getTransferItems: () => transfer,
        getPileSize: () => 100,
        numItemsInCache: () => 25,
      },
    },
  };
}

describe('Trade Adapter contracts', () => {
  it('EA capability diagnostics are serializable, allowlisted and read-only', () => {
    const adapter = createEaTradeAdapter(eaRuntime({ id: 10, definitionId: 20 }));
    const result = adapter.inspectCapabilities();
    expect(result).toMatchObject({
      runtimeReady: true,
      canTrade: true,
      tradeAccess: { available: true, allowed: true, level: 1 },
      coins: 123456,
      transferCapacity: { used: 25, max: 100, free: 75 },
      criteria: { constructorAvailable: true, fields: ['category', 'defId', 'maxBuy', 'type'] },
    });
    expect(JSON.stringify(result)).not.toContain('accessToken');
    expect(JSON.stringify(result)).not.toContain('persona');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('reads the live EA currency object without exposing the user object', () => {
    const runtime = eaRuntime({ id: 10, definitionId: 20 });
    runtime.services.User.getUser = () => ({
      tradeAccess: 1,
      getCurrency: () => ({ amount: 654321, privateCurrencyId: 'must-not-leak' }),
      personaId: 'must-not-leak',
    });
    const result = createEaTradeAdapter(runtime).inspectCapabilities();
    expect(result.coins).toBe(654321);
    expect(JSON.stringify(result)).not.toContain('privateCurrencyId');
    expect(JSON.stringify(result)).not.toContain('personaId');
  });

  it('EA price-limit diagnostics resolve an exact item and only make the requested read call', async () => {
    const item = { id: 10, definitionId: 20 };
    const adapter = createEaTradeAdapter(eaRuntime(item));
    const result = await adapter.inspectPriceLimits({ id: 10, pile: 'transfer' }, { refresh: true });
    expect(result).toEqual({
      status: 'loaded',
      before: {
        found: true,
        item: { id: 10, definitionId: 20, pile: 'transfer' },
        hasPriceLimits: false,
        minimum: null,
        maximum: null,
      },
      after: {
        found: true,
        item: { id: 10, definitionId: 20, pile: 'transfer' },
        hasPriceLimits: true,
        minimum: 300,
        maximum: 10000,
      },
      response: { success: true, status: null, code: null },
      error: null,
    });
  });

  it('exports allowlisted listing candidate snapshots without retaining EA items', () => {
    const item = {
      id: 10,
      definitionId: 20,
      type: 'player',
      rating: 84,
      rareflag: 1,
      untradeableCount: 0,
      loans: -1,
      privateToken: 'must-not-leak',
      _staticData: { getFullName: () => 'Test Player' },
      _auction: {
        tradeId: 30,
        buyNowPrice: 900,
        isActiveTrade: () => false,
        isClosedTrade: () => false,
        isInactive: () => true,
        privateAuctionData: 'must-not-leak',
      },
    };
    const result = createEaTradeAdapter(eaRuntime(item)).inspectListingCandidates({ sources: ['transfer'], limit: 10 });
    expect(result).toMatchObject({
      sources: ['transfer'],
      counts: { transfer: 1 },
      total: 1,
      returned: 1,
      truncated: false,
      candidates: [{
        item: { id: 10, definitionId: 20, pile: 'transfer' },
        name: 'Test Player',
        type: 'player',
        rating: 84,
        tier: 'gold',
        rare: true,
        special: false,
        tradeable: true,
        limitedUse: false,
        auction: { present: true, state: 'inactive', tradeId: 30, buyNowPrice: 900 },
      }],
      error: null,
    });
    expect(JSON.stringify(result)).not.toContain('privateToken');
    expect(JSON.stringify(result)).not.toContain('privateAuctionData');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('keeps listing-only tradeability fallbacks out of the shared inventory contract', () => {
    const sharedItem = {
      id: 11,
      definitionId: 21,
      type: 'player',
      rating: 80,
      rareflag: 0,
      untradeableCount: 0,
      loans: -1,
    };
    const runtime = eaRuntime(sharedItem);
    const result = createEaTradeAdapter(runtime)
      .inspectListingCandidates({ sources: ['transfer'], limit: 10 });
    expect(result.candidates[0]).toMatchObject({ tradeable: true });
    expect(createEaInventoryAdapter(runtime).snapshot().piles.transfer[0]).toMatchObject({ tradeable: false });
  });

  it('Fake and EA adapters expose the same TS1 methods and serializable result shapes', async () => {
    const fake = createFakeTradeAdapter({
      items: [{ id: 10, definitionId: 20, pile: 'transfer' }],
      refreshedLimits: { 10: { minimum: 300, maximum: 10000 } },
      capturedAt: 1,
    });
    const capability = fake.inspectCapabilities();
    const limits = await fake.inspectPriceLimits({ id: 10 }, { refresh: true });
    expect(Object.keys(fake).sort()).toEqual([
      'calls', 'inspectCapabilities', 'inspectListingCandidates', 'inspectListingItem',
      'inspectPriceLimits', 'listItem', 'refreshTransferItems',
    ]);
    expect(capability).toMatchObject({ runtimeReady: true, canTrade: true });
    expect(limits).toMatchObject({ status: 'loaded', after: { minimum: 300, maximum: 10000 } });
    expect(JSON.parse(JSON.stringify({ capability, limits }))).toEqual({ capability, limits });
  });

  it('normalizes the EA list observable without exposing the live item', async () => {
    const item = { id: 10, definitionId: 20 };
    const runtime = eaRuntime(item);
    runtime.services.Item.list = (target, startPrice, buyNow, durationSeconds) => ({
      observe(context, callback) {
        expect(target).toBe(item);
        expect({ startPrice, buyNow, durationSeconds }).toEqual({ startPrice: 700, buyNow: 750, durationSeconds: 3600 });
        callback({ unobserve() {} }, { success: true, status: 200, privateItem: target });
      },
    });
    const result = await createEaTradeAdapter(runtime).listItem(
      { id: 10, definitionId: 20, pile: 'transfer' },
      { startPrice: 700, buyNow: 750, durationSeconds: 3600 },
    );
    expect(result).toEqual({
      status: 'accepted',
      item: { id: 10, definitionId: 20, pile: 'transfer' },
      requested: { startPrice: 700, buyNow: 750, durationSeconds: 3600 },
      response: { success: true, status: 200, code: null },
      error: null,
    });
    expect(JSON.stringify(result)).not.toContain('privateItem');
  });

  it('reports missing runtime capabilities without throwing', () => {
    const result = createEaTradeAdapter({}).inspectCapabilities();
    expect(result.runtimeReady).toBe(false);
    expect(result.canTrade).toBe(false);
    expect(result.coins).toBeNull();
    expect(result.transferCapacity).toEqual({ used: null, max: null, free: null });
    expect(result.warnings).toEqual(expect.arrayContaining([
      'EA Item service is unavailable',
      'EA Item repository is unavailable',
      'EA user session is unavailable',
      'UTSearchCriteriaDTO is unavailable',
    ]));
  });

  it('is composed lazily by the Runtime Adapter factory', () => {
    const storage = { getItem: () => null, setItem() {}, removeItem() {}, get length() { return 0; } };
    const adapters = createRuntimeAdapters({ localStorage: storage, sessionStorage: storage, document: {} });
    expect(adapters.trade().inspectCapabilities()).toMatchObject({ runtimeReady: false, canTrade: false });
  });
});
