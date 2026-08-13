import { describe, expect, it } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createListingPreparation } from '../../src/trade/listing-preparation.js';
import { createListingPreview } from '../../src/trade/listing-preview.js';

function job() {
  return {
    id: 'prepare-listing',
    name: 'Prepare Listing',
    policy: {
      sources: ['club'],
      cardClass: 'common-gold',
      ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      maxListings: 5,
      marketOverride: { enabled: false, markupPercent: 5, maxQuoteAgeMinutes: 10 },
    },
  };
}

function transferJob() {
  return {
    ...job(),
    id: 'prepare-reprice',
    name: 'Prepare Reprice',
    policy: {
      ...job().policy,
      sources: ['transfer'],
      cardClass: 'rare-gold',
      ratingRules: [{ min: 85, max: 85, buyNow: 700 }],
      expiredPolicy: 'reprice',
    },
  };
}

function preparation(adapter, now = 1000) {
  const listingPreview = createListingPreview({
    getTradeAdapter: () => adapter,
    priceQuoteProvider: { async load() { return { quotes: [], source: null, attempts: [] }; } },
    now: () => now,
  });
  return createListingPreparation({ getTradeAdapter: () => adapter, listingPreview, now: () => now });
}

describe('Trade listing preparation', () => {
  it('refreshes EA limits, adjusts exact prices and creates an expiring confirmation', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{
        id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
      }],
    });
    const result = await preparation(adapter).prepare(job(), { maxListings: 1 });
    expect(result).toMatchObject({
      mode: 'prepared',
      ready: true,
      blockers: [],
      transferPreflight: { status: 'completed' },
      confirmation: { createdAt: 1000, expiresAt: 601000, itemCount: 1, action: 'list' },
    });
    expect(result.plan.entries[0]).toMatchObject({
      item: { id: 1 },
      startPrice: 700,
      buyNow: 750,
      priceLimitStatus: 'loaded',
      priceLimits: {
        minimum: 700,
        maximum: 10_000,
        bidMinimum: 700,
        buyNowMinimum: 750,
      },
    });
    expect(result.priceLimitChecks).toEqual([expect.objectContaining({
      status: 'loaded',
      refreshStatus: 'completed',
      limitsSource: 'refreshed',
      bidMinimum: 700,
      buyNowMinimum: 750,
    })]);
    expect(result.plan.warnings).toContain('101 listing prices were adjusted to EA limits');
    expect(result.confirmation.token).toMatch(/^listing-[0-9a-f]{8}$/);
  });

  it('fails closed before price-limit reads when Transfer cannot be refreshed', async () => {
    const adapter = createFakeTradeAdapter({
      refreshTransferResult: { status: 'ambiguous', response: null, error: { kind: 'ambiguous-transport' } },
      items: [{
        id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
      }],
    });
    const result = await preparation(adapter).prepare(job(), { maxListings: 1 });
    expect(result).toMatchObject({
      ready: false,
      blockers: [{ reason: 'listing-transfer-preflight-ambiguous', detail: 'ambiguous-transport' }],
      transferPreflight: { status: 'ambiguous' },
      plan: { entries: [], counts: { selected: 0 } },
    });
    expect(result.confirmation).toBeNull();
    expect(adapter.calls.some((call) => call.method === 'inspectPriceLimits')).toBe(false);
  });

  it('does not produce a confirmation when price limits are unavailable', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{ id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true }],
    });
    const result = await preparation(adapter).prepare(job(), { maxListings: 1 });
    expect(result.ready).toBe(false);
    expect(result.confirmation).toBeNull();
    expect(result.blockers).toEqual([{ item: { id: 1, definitionId: 101, pile: 'club' }, reason: 'price-limits-unavailable' }]);
  });

  it('refreshes Transfer before preparing one expired item with a reprice approval', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{
        id: 2, definitionId: 102, pile: 'transfer', type: 'player', rating: 85, tier: 'gold', rare: true,
        tradeable: true, minimum: 700, maximum: 10_000,
        auction: { present: true, state: 'inactive', tradeId: 2002, buyNowPrice: 1900 },
      }],
    });

    const result = await preparation(adapter).prepare(transferJob(), { maxListings: 1 });

    expect(result).toMatchObject({
      mode: 'prepared',
      ready: true,
      blockers: [],
      transferPreflight: { status: 'completed' },
      confirmation: { action: 'reprice', itemCount: 1 },
      plan: {
        entries: [{
          item: { id: 2, pile: 'transfer' }, auctionState: 'inactive', startPrice: 700, buyNow: 750,
        }],
      },
    });
    const methods = adapter.calls.map((call) => call.method);
    expect(methods.indexOf('refreshTransferItems')).toBeLessThan(methods.indexOf('inspectListingCandidates'));
    expect(methods.indexOf('inspectListingCandidates')).toBeLessThan(methods.indexOf('inspectPriceLimits'));
  });
});
