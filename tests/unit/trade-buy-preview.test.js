import { describe, expect, it } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createBuyPreview } from '../../src/trade/buy-preview.js';

describe('Trade Buy Preview', () => {
  it('materializes exact rating lanes without calling the EA market', async () => {
    const adapter = createFakeTradeAdapter({ coins: 100000 });
    const preview = createBuyPreview({
      getTradeAdapter: () => adapter,
      playerCatalogProvider: {
        load: async () => ({
          ok: true,
          platform: 'pc',
          ratings: [84, 85],
          missingRatings: [],
          attempts: [{ rating: 84, source: 'cache', status: 'loaded', count: 2 }],
          lanes: [
            { rating: 84, definitionIds: [8401, 8402], source: 'cache' },
            { rating: 85, definitionIds: [8501], source: 'cache' },
          ],
        }),
      },
      now: () => 1000,
    });
    const result = await preview.preview({
      id: 'buy-preview',
      name: 'Buy 84-85',
      type: 'buy',
      policy: {
        ratingMin: 84,
        ratingMax: 85,
        cardClass: 'rare-gold',
        maxBuyNow: 1000,
        quantity: 3,
        totalBudget: 3000,
      },
    });

    expect(result).toMatchObject({
      mode: 'preview-only',
      liveExecutionAllowed: false,
      catalog: { ok: true, missingRatings: [] },
      plan: { ready: true, missingRatings: [] },
      summary: { ratings: 2, definitions: 3, missingRatings: 0, maxQuantity: 3, totalBudget: 3000 },
    });
    expect(adapter.calls.map((call) => call.method)).toEqual(['inspectCapabilities']);
  });
});
