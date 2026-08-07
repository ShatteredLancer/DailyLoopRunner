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
      confirmation: { createdAt: 1000, expiresAt: 601000, itemCount: 1, requiredText: 'LIST 1' },
    });
    expect(result.plan.entries[0]).toMatchObject({
      item: { id: 1 },
      startPrice: 700,
      buyNow: 700,
      priceLimitStatus: 'loaded',
      priceLimits: { minimum: 700, maximum: 10_000 },
    });
    expect(result.plan.warnings).toContain('101 listing prices were adjusted to EA limits');
    expect(result.confirmation.token).toMatch(/^listing-[0-9a-f]{8}$/);
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
});
