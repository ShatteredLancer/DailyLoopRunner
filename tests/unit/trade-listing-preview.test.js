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
  it('scans all configured candidates and requests a bounded quote pool for backfill', async () => {
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
            quotes: [
              { definitionId: 101, price: 800, source: 'FUTNext', quotedAt: 900, expiresAt: 2000 },
              { definitionId: 102, price: 800, source: 'FUTNext', quotedAt: 900, expiresAt: 2000 },
            ],
            source: 'FUTNext',
            attempts: [{ source: 'FUTNext', status: 'loaded' }],
          };
        },
      },
    });
    const result = await preview.preview(job(), { platform: 'pc', forceRefresh: true });
    expect(quoteRequests).toEqual([expect.objectContaining({
      definitionIds: [101, 102],
      platform: 'pc',
      provider: 'auto',
      forceRefresh: true,
    })]);
    expect(result).toMatchObject({
      mode: 'preview-only',
      scan: { total: 2, returned: 2, truncated: false },
      quotes: {
        requested: 2,
        candidateDefinitions: 2,
        candidatePoolSize: 2,
        candidatePoolLimit: 4,
        candidatePoolTruncated: false,
        loaded: 2,
        source: 'FUTNext',
      },
      plan: {
        counts: { scanned: 2, eligible: 2, evaluated: 1, selected: 1, deferred: 1 },
        candidatePool: { limit: 4, size: 2, truncated: false },
      },
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
    expect(result.quotes).toEqual({
      requested: 0,
      candidateDefinitions: 1,
      candidatePoolSize: 1,
      candidatePoolLimit: 4,
      candidatePoolTruncated: false,
      loaded: 0,
      source: null,
      attempts: [],
    });
    expect(result.plan.entries[0]).toMatchObject({ quoteStatus: 'disabled', buyNow: 700 });
  });

  it('requests quotes before applying skip fallback and selects a later fresh candidate', async () => {
    const adapter = createFakeTradeAdapter({
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
            quotes: [{ definitionId: 102, price: 800, source: 'FUTNext', quotedAt: 999, expiresAt: 2000 }],
            source: 'FUTNext',
            attempts: [],
          };
        },
      },
    });

    const result = await preview.preview(job({
      marketOverride: { enabled: true, markupPercent: 0, maxQuoteAgeMinutes: 10, fallbackPolicy: 'skip' },
    }));

    expect(quoteRequests[0].definitionIds).toEqual([101, 102]);
    expect(result.plan.entries.map((entry) => entry.item.id)).toEqual([2]);
    expect(result.plan.rejectionCounts).toEqual({ 'market-quote-unavailable': 1 });
  });

  it('backfills four slots after four leading high-value quotes in the Step 7 shape', async () => {
    const items = Array.from({ length: 9 }, (_, index) => ({
      id: index + 1,
      definitionId: 101 + index,
      pile: 'club',
      type: 'player',
      rating: 80,
      tradeable: true,
    }));
    const requested = [];
    const preview = createListingPreview({
      getTradeAdapter: () => createFakeTradeAdapter({ items }),
      now: () => 1000,
      priceQuoteProvider: {
        async load(request) {
          requested.push(...request.definitionIds);
          return {
            quotes: request.definitionIds.map((definitionId, index) => ({
              definitionId,
              price: index < 4 ? 10_100 : 800,
              source: 'FUTNext',
              quotedAt: 999,
              expiresAt: 2000,
            })),
            source: 'FUTNext',
            attempts: [],
          };
        },
      },
    });

    const result = await preview.preview(job({ maxListings: 4 }));

    expect(requested).toEqual(items.map((item) => item.definitionId));
    expect(result.plan.entries.map((entry) => entry.item.id)).toEqual([5, 6, 7, 8]);
    expect(result.plan.counts).toMatchObject({
      scanned: 9, eligible: 9, evaluated: 8, selected: 4, deferred: 1, rejected: 4,
    });
    expect(result.plan.rejectionCounts).toEqual({ 'high-value-listing-excluded': 4 });
  });

  it('caps a larger candidate pool and leaves unquoted candidates deferred', async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      definitionId: 101 + index,
      pile: 'club',
      type: 'player',
      rating: 80,
      tradeable: true,
    }));
    const quoteRequests = [];
    const preview = createListingPreview({
      getTradeAdapter: () => createFakeTradeAdapter({ items }),
      now: () => 1000,
      priceQuoteProvider: {
        async load(request) {
          quoteRequests.push(request);
          return {
            quotes: request.definitionIds.map((definitionId) => ({
              definitionId,
              price: 10_100,
              source: 'FUTNext',
              quotedAt: 999,
              expiresAt: 2000,
            })),
            source: 'FUTNext',
            attempts: [],
          };
        },
      },
    });

    const result = await preview.preview(job({ maxListings: 4 }));

    expect(quoteRequests[0].definitionIds).toEqual(items.slice(0, 16).map((item) => item.definitionId));
    expect(result.quotes).toMatchObject({
      requested: 16, candidatePoolSize: 16, candidatePoolLimit: 16, candidatePoolTruncated: true,
    });
    expect(result.plan.entries).toEqual([]);
    expect(result.plan.counts).toMatchObject({ evaluated: 16, selected: 0, deferred: 9, rejected: 16 });
    expect(result.plan.candidatePool).toEqual({ limit: 16, size: 16, truncated: true });
  });
});
