import { createTradeRunReceipt } from './contracts.js';

export function finalizeChunkedBuyReceipt(receipt = {}) {
  const entries = Array.isArray(receipt.receipts) ? receipt.receipts : [];
  const summaries = entries.filter((entry) => entry?.status === 'run-summary');
  if (!summaries.length) return createTradeRunReceipt(receipt);
  const last = summaries[summaries.length - 1];
  const aggregate = {
    status: 'run-summary',
    searches: summaries.reduce((sum, entry) => sum + Math.max(0, Number(entry.searches || 0)), 0),
    buyAttempts: summaries.reduce((sum, entry) => sum + Math.max(0, Number(entry.buyAttempts || 0)), 0),
    spent: summaries.reduce((sum, entry) => sum + Math.max(0, Number(entry.spent || 0)), 0),
    expectedDestination: last.expectedDestination || 'auto',
    minimumRetainedCoins: Number(last.minimumRetainedCoins || 0),
    cursor: last.cursor || null,
    purchasedByRating: { ...(last.purchasedByRating || {}) },
  };
  return createTradeRunReceipt({
    ...receipt,
    receipts: [aggregate, ...entries.filter((entry) => entry?.status !== 'run-summary')],
  });
}
