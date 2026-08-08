import { describe, expect, it } from 'vitest';
import { createTradeListingRecap, TRADE_RECAP_PAGE_SIZE } from '../../src/trade/listing-recap.js';

function receiptEntry(index) {
  return {
    index,
    status: 'listed',
    item: { id: index, definitionId: index + 100, pile: 'club' },
    listing: { startPrice: 650, buyNow: 700, durationSeconds: 3600 },
    verification: { auction: { state: 'active', tradeId: index + 1000, buyNowPrice: 700 } },
  };
}

describe('Trade listing recap model', () => {
  it('paginates receipts at 15 items and preserves stop and auction details', () => {
    const receipt = {
      status: 'stopped',
      reason: 'stopped-by-user',
      requested: 31,
      succeeded: 30,
      skipped: 1,
      coinsBefore: 1000,
      coinsAfter: 2000,
      receipts: Array.from({ length: 31 }, (_, index) => receiptEntry(index + 1)),
    };
    const recap = createTradeListingRecap(receipt, { page: 2 });

    expect(TRADE_RECAP_PAGE_SIZE).toBe(15);
    expect(recap).toMatchObject({
      status: 'stopped',
      reason: 'stopped-by-user',
      page: 2,
      pageCount: 3,
      totalItems: 31,
      counts: { requested: 31, succeeded: 30, failed: 0, skipped: 1 },
      coins: { before: 1000, after: 2000 },
    });
    expect(recap.items).toHaveLength(15);
    expect(recap.items[0]).toMatchObject({
      index: 16,
      item: { id: 16, definitionId: 116, pile: 'club' },
      listing: { startPrice: 650, buyNow: 700 },
      auction: { state: 'active', tradeId: 1016 },
    });
  });
});
