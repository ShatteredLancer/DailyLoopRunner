import { TRADE_RECAP_PAGE_SIZE } from './listing-recap.js';

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function recapEntry(entry = {}) {
  return {
    index: Math.max(0, Number(entry.index || 0) || 0),
    status: String(entry.status || 'unknown'),
    reason: entry.reason ? String(entry.reason) : null,
    item: entry.item ? {
      id: finiteOrNull(entry.item.id),
      definitionId: finiteOrNull(entry.item.definitionId),
      pile: String(entry.item.pile || 'unknown'),
    } : null,
    tradeId: finiteOrNull(entry.tradeId),
    rating: finiteOrNull(entry.rating),
    price: finiteOrNull(entry.price),
    priceLimit: finiteOrNull(entry.priceLimit),
    coinsBefore: finiteOrNull(entry.coinsBefore),
    coinsAfter: finiteOrNull(entry.coinsAfter),
    destination: entry.destination ? String(entry.destination) : null,
    search: entry.search ? {
      rating: finiteOrNull(entry.search.rating),
      definitionId: finiteOrNull(entry.search.definitionId),
      maxBuyNow: finiteOrNull(entry.search.maxBuyNow),
    } : null,
    candidates: finiteOrNull(entry.candidates),
    rejectionCounts: entry.rejectionCounts && typeof entry.rejectionCounts === 'object'
      ? Object.fromEntries(Object.entries(entry.rejectionCounts).map(([key, value]) => [String(key), Math.max(0, Number(value || 0) || 0)]))
      : {},
  };
}

export function createTradeBuyRecap(receipt = {}, options = {}) {
  const entries = (Array.isArray(receipt.receipts) ? receipt.receipts : [])
    .filter((entry) => entry?.status !== 'run-summary');
  const runSummary = (receipt.receipts || []).find((entry) => entry?.status === 'run-summary') || {};
  const pageSize = Math.max(1, Math.floor(Number(options.pageSize || TRADE_RECAP_PAGE_SIZE)));
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.floor(Number(options.page || 1))));
  const start = (page - 1) * pageSize;
  return {
    title: 'Buy recap',
    status: String(receipt.status || 'unknown'),
    reason: receipt.reason ? String(receipt.reason) : null,
    counts: {
      requested: Math.max(0, Number(receipt.requested || 0) || 0),
      succeeded: Math.max(0, Number(receipt.succeeded || 0) || 0),
      failed: Math.max(0, Number(receipt.failed || 0) || 0),
      skipped: Math.max(0, Number(receipt.skipped || 0) || 0),
      searches: Math.max(0, Number(runSummary.searches || 0) || 0),
    },
    coins: {
      before: finiteOrNull(receipt.coinsBefore),
      after: finiteOrNull(receipt.coinsAfter),
      spent: Math.max(0, Number(runSummary.spent || 0) || 0),
    },
    page,
    pageSize,
    pageCount,
    totalItems: entries.length,
    items: entries.slice(start, start + pageSize).map(recapEntry),
  };
}
