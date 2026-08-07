import { describe, expect, it } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createListingPreview } from '../../src/trade/listing-preview.js';

function job(overrides = {}) {
  return {
    id: 'preview',
    name: 'Preview',
    policy: {
      sources: ['club'],
      cardClass: 'normal-gold',
      ratingRules: [{ min: 80, max: 84, buyNow: 700 }],
      maxListings: 1,
      marketOverride: { enabled: true, markupPercent: 5, maxQuoteAgeMinutes: 10 },
      ...overrides,
    },
  };
}

describe('Trade listing preview composition', () => {
  it('scans all configured candidates but only requests quotes for selected entries', async () => {
    const adapter = createFakeTradeAdapter({
      capturedAt: 50,
      items: [
        { id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true },
        { id: 2, definitionId: 102, pile: 'club', type: 'player', rating: 81, tradeable: true },
      ],
    });
    const quoteRequests = [];
    const preview = createListingPreview({
      getTradeAdapter: () => adapter,
      now: () => 1000,
      priceQuoteProvider: {
        async load(request) {
          quoteRequests.push(request);
          return {
            quotes: [{ definitionId: 101, price: 800, source: 'FUTNext', quotedAt: 900, expiresAt: 2000 }],
            source: 'FUTNext',
            attempts: [{ source: 'FUTNext', status: 'loaded' }],
          };
        },
      },
    });
    const result = await preview.preview(job(), { platform: 'pc', forceRefresh: true });
    expect(quoteRequests).toEqual([expect.objectContaining({
      definitionIds: [101],
      platform: 'pc',
      provider: 'auto',
      forceRefresh: true,
    })]);
    expect(result).toMatchObject({
      mode: 'preview-only',
      scan: { total: 2, returned: 2, truncated: false },
      quotes: { requested: 1, loaded: 1, source: 'FUTNext' },
      plan: { counts: { scanned: 2, eligible: 2, selected: 1, deferred: 1 } },
    });
    expect(result.plan.entries[0]).toMatchObject({ item: { id: 1 }, buyNow: 850, startPrice: 800 });
    expect(result.scan).not.toHaveProperty('candidates');
  });

  it('does not call the quote provider when market override is disabled', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{ id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true }],
    });
    let quoteCalls = 0;
    const preview = createListingPreview({
      getTradeAdapter: () => adapter,
      now: () => 1000,
      priceQuoteProvider: { async load() { quoteCalls += 1; return { quotes: [] }; } },
    });
    const result = await preview.preview(job({ marketOverride: { enabled: false } }));
    expect(quoteCalls).toBe(0);
    expect(result.quotes).toEqual({ requested: 1, loaded: 0, source: null, attempts: [] });
    expect(result.plan.entries[0]).toMatchObject({ quoteStatus: 'disabled', buyNow: 700 });
  });
});
