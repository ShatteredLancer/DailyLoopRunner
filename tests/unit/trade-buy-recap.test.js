import { describe, expect, it } from 'vitest';
import { createTradeBuyRecap } from '../../src/trade/buy-recap.js';

describe('Trade Buy recap model', () => {
  it('paginates at 15 purchases and preserves stop, spend and destination details', () => {
    const receipt = {
      status: 'stopped',
      reason: 'budget-limit',
      requested: 31,
      succeeded: 30,
      skipped: 1,
      coinsBefore: 100000,
      coinsAfter: 73000,
      receipts: [
        { status: 'run-summary', searches: 35, spent: 27000 },
        ...Array.from({ length: 31 }, (_, offset) => ({
          index: offset + 1,
          status: 'purchased',
          item: { id: offset + 1, definitionId: 8401, pile: 'market' },
          tradeId: 1000 + offset,
          rating: 84,
          price: 900,
          priceLimit: 1000,
          coinsBefore: 100000 - offset * 900,
          coinsAfter: 100000 - (offset + 1) * 900,
          destination: offset % 2 ? 'transfer' : 'club',
          search: { rating: 84, definitionId: 8401, maxBuyNow: 1000 },
        })),
      ],
    };
    const recap = createTradeBuyRecap(receipt, { page: 2 });
    expect(recap).toMatchObject({
      status: 'stopped',
      reason: 'budget-limit',
      counts: { requested: 31, succeeded: 30, failed: 0, skipped: 1, searches: 35 },
      coins: { before: 100000, after: 73000, spent: 27000 },
      page: 2,
      pageSize: 15,
      pageCount: 3,
      totalItems: 31,
    });
    expect(recap.items).toHaveLength(15);
    expect(recap.items[0]).toMatchObject({
      index: 16,
      status: 'purchased',
      tradeId: 1015,
      rating: 84,
      price: 900,
      priceLimit: 1000,
      coinsBefore: 86500,
      coinsAfter: 85600,
      destination: 'transfer',
      search: { definitionId: 8401, maxBuyNow: 1000 },
    });
  });
});
