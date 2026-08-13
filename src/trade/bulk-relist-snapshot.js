export const TRADE_BULK_RELIST_ITEM_LIMIT = 100;

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeItem(input = {}) {
  return {
    item: {
      id: safeNumber(input.item?.id),
      definitionId: safeNumber(input.item?.definitionId),
      pile: 'transfer',
    },
    name: String(input.name || 'unknown').slice(0, 80),
    rating: safeNumber(input.rating),
    auction: {
      state: String(input.auction?.state || 'unknown'),
      tradeId: safeNumber(input.auction?.tradeId),
      startingBid: safeNumber(input.auction?.startingBid),
      currentBid: safeNumber(input.auction?.currentBid),
      buyNowPrice: safeNumber(input.auction?.buyNowPrice),
      expires: safeNumber(input.auction?.expires),
    },
  };
}

export function isBulkRelistEligible(input = {}) {
  const auction = input.auction || input;
  const tradeId = safeNumber(auction.tradeId);
  const startingBid = safeNumber(auction.startingBid);
  const buyNowPrice = safeNumber(auction.buyNowPrice);
  return String(auction.state || 'unknown') === 'inactive'
    && tradeId !== null
    && tradeId > 0
    && startingBid !== null
    && startingBid > 0
    && buyNowPrice !== null
    && buyNowPrice >= startingBid;
}

export function normalizeBulkRelistSnapshot(input = {}) {
  const items = (Array.isArray(input.items) ? input.items : [])
    .slice(0, TRADE_BULK_RELIST_ITEM_LIMIT)
    .map(safeItem)
    .filter(isBulkRelistEligible);
  const auctions = (Array.isArray(input.auctions) ? input.auctions : input.items || [])
    .slice(0, TRADE_BULK_RELIST_ITEM_LIMIT)
    .map(safeItem);
  return {
    schemaVersion: 1,
    capturedAt: Math.max(0, safeNumber(input.capturedAt) ?? Date.now()),
    status: String(input.status || 'loaded'),
    total: Math.max(0, Math.floor(safeNumber(input.total) ?? auctions.length)),
    unsoldCount: input.truncated === true
      ? Math.max(items.length, Math.floor(safeNumber(input.unsoldCount) ?? items.length))
      : items.length,
    byState: Object.fromEntries(Object.entries(input.byState || {}).map(([state, count]) => [
      String(state), Math.max(0, Math.floor(safeNumber(count) ?? 0)),
    ])),
    truncated: input.truncated === true,
    items,
    auctions,
    error: input.error ? { message: String(input.error.message || input.error).slice(0, 200) } : null,
  };
}

function fingerprintEntry(entry = {}) {
  return [
    safeNumber(entry.item?.id),
    safeNumber(entry.item?.definitionId),
    safeNumber(entry.auction?.tradeId),
    safeNumber(entry.auction?.startingBid),
    safeNumber(entry.auction?.buyNowPrice),
  ].join(':');
}

export function bulkRelistSnapshotFingerprint(snapshotInput = {}) {
  const snapshot = normalizeBulkRelistSnapshot(snapshotInput);
  return snapshot.items.map(fingerprintEntry).sort().join('|');
}

export function sameBulkRelistSnapshot(left, right) {
  const first = normalizeBulkRelistSnapshot(left);
  const second = normalizeBulkRelistSnapshot(right);
  return first.unsoldCount === second.unsoldCount
    && first.truncated === second.truncated
    && bulkRelistSnapshotFingerprint(first) === bulkRelistSnapshotFingerprint(second);
}

export function reconcileBulkRelistSnapshots(beforeInput = {}, afterInput = {}) {
  const before = normalizeBulkRelistSnapshot(beforeInput);
  const after = normalizeBulkRelistSnapshot(afterInput);
  const live = new Map(after.auctions.map((entry) => [Number(entry.item.id), entry]));
  const items = before.items.map((entry) => {
    const current = live.get(Number(entry.item.id)) || null;
    const identityMatches = Boolean(current
      && Number(current.item.definitionId) === Number(entry.item.definitionId));
    const active = identityMatches && current.auction.state === 'active';
    return {
      item: { ...entry.item },
      auctionBefore: { ...entry.auction },
      auctionAfter: current ? { ...current.auction } : null,
      status: active ? 'relisted' : 'unknown',
    };
  });
  const relisted = items.filter((entry) => entry.status === 'relisted').length;
  const unknown = items.length - relisted;
  return {
    status: unknown === 0 ? 'completed' : relisted > 0 ? 'partial' : 'unknown',
    requested: before.unsoldCount,
    relisted,
    unknown,
    items,
  };
}
