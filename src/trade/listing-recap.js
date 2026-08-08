export const TRADE_RECAP_PAGE_SIZE = 15;

export function createTradeListingRecap(receipt = {}, options = {}) {
  const items = Array.isArray(receipt.receipts) ? receipt.receipts : [];
  const pageSize = Math.max(1, Math.floor(Number(options.pageSize || TRADE_RECAP_PAGE_SIZE)));
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.floor(Number(options.page || 1))));
  const start = (page - 1) * pageSize;
  return {
    title: 'Listing recap',
    status: String(receipt.status || 'unknown'),
    reason: receipt.reason ? String(receipt.reason) : null,
    counts: {
      requested: Math.max(0, Number(receipt.requested || 0) || 0),
      succeeded: Math.max(0, Number(receipt.succeeded || 0) || 0),
      failed: Math.max(0, Number(receipt.failed || 0) || 0),
      skipped: Math.max(0, Number(receipt.skipped || 0) || 0),
    },
    coins: {
      before: Number.isFinite(Number(receipt.coinsBefore)) ? Number(receipt.coinsBefore) : null,
      after: Number.isFinite(Number(receipt.coinsAfter)) ? Number(receipt.coinsAfter) : null,
    },
    page,
    pageSize,
    pageCount,
    totalItems: items.length,
    items: items.slice(start, start + pageSize).map((entry) => ({
      index: Math.max(1, Number(entry.index || 0) || 1),
      status: String(entry.status || 'unknown'),
      reason: entry.reason ? String(entry.reason) : null,
      item: {
        id: Number(entry.item?.id || 0) || null,
        definitionId: Number(entry.item?.definitionId || 0) || null,
        pile: String(entry.item?.pile || 'unknown'),
      },
      listing: entry.listing ? {
        startPrice: Number(entry.listing.startPrice || 0) || null,
        buyNow: Number(entry.listing.buyNow || 0) || null,
        durationSeconds: Number(entry.listing.durationSeconds || 0) || null,
      } : null,
      auction: entry.verification?.auction ? {
        state: String(entry.verification.auction.state || 'unknown'),
        tradeId: Number(entry.verification.auction.tradeId || 0) || null,
        startingBid: Number(entry.verification.auction.startingBid || 0) || null,
        buyNowPrice: Number(entry.verification.auction.buyNowPrice || 0) || null,
        expires: Number(entry.verification.auction.expires || 0) || null,
      } : null,
    })),
  };
}
