import { createTradeCapabilitySnapshot } from '../../trade/contracts.js';
import { readPlayerRareFlag } from '../../domain/player-rarity.js';

export function createFakeTradeAdapter(initial = {}) {
  const calls = [];
  const items = new Map((initial.items || []).map((entry) => [Number(entry.id || 0), { ...entry }]));
  let transferUsed = Number(initial.transferCapacity?.used);
  if (!Number.isFinite(transferUsed)) transferUsed = [...items.values()].filter((item) => item.pile === 'transfer').length;

  function listingCandidate(item) {
    const rareflag = readPlayerRareFlag(item);
    return {
      item: { id: Number(item.id || 0), definitionId: Number(item.definitionId || 0), pile: String(item.pile || 'club') },
      name: String(item.name || item.definitionId || item.id || 'unknown'),
      type: String(item.type || 'player'),
      rating: Number(item.rating || 0),
      tier: item.tier || (Number(item.rating || 0) >= 75 ? 'gold' : null),
      rare: item.rare === true || rareflag > 0,
      special: item.special === true || rareflag > 1,
      rareflag,
      tradeable: item.tradeable !== false,
      evolution: item.evolution === true,
      limitedUse: item.limitedUse === true,
      concept: item.concept === true,
      academyEnrolled: item.academyEnrolled === true,
      auction: {
        present: item.auction?.present === true,
        state: String(item.auction?.state || 'none'),
        tradeId: item.auction?.tradeId ?? null,
        startingBid: item.auction?.startingBid ?? null,
        currentBid: item.auction?.currentBid ?? null,
        buyNowPrice: item.auction?.buyNowPrice ?? null,
        expires: item.auction?.expires ?? null,
      },
    };
  }

  function inspectCapabilities() {
    calls.push({ method: 'inspectCapabilities' });
    return createTradeCapabilitySnapshot({
      runtimeReady: initial.runtimeReady !== false,
      canTrade: initial.canTrade !== false,
      tradeAccess: initial.tradeAccess || { available: true, allowed: true, level: 'ALLOWED' },
      coins: initial.coins ?? 100000,
      transferCapacity: { used: transferUsed, max: Number(initial.transferCapacity?.max ?? 100) },
      criteria: initial.criteria || {
        constructorAvailable: true,
        fields: ['type', 'category', 'defId', 'maxBuy'],
        defaults: { type: null, category: null, defId: [], maxBuy: 0 },
      },
      methods: initial.methods || {
        searchTransferMarket: true,
        clearTransferMarketCache: true,
        bid: true,
        move: true,
        requestMarketData: true,
        list: true,
        relistExpiredAuctions: true,
        requestTransferItems: true,
      },
      warnings: initial.warnings || [],
      capturedAt: initial.capturedAt,
    });
  }

  async function inspectPriceLimits(ref = {}, options = {}) {
    calls.push({ method: 'inspectPriceLimits', ref: { ...ref }, refresh: options.refresh === true });
    const item = items.get(Number(ref.id || 0)) || [...items.values()].find((entry) => (
      !ref.id && Number(ref.definitionId || 0) === Number(entry.definitionId || 0)
    ));
    const snapshot = item ? {
      found: true,
      item: { id: Number(item.id || 0), definitionId: Number(item.definitionId || 0), pile: String(item.pile || 'club') },
      hasPriceLimits: Number.isFinite(Number(item.minimum)) && Number.isFinite(Number(item.maximum)),
      minimum: Number.isFinite(Number(item.minimum)) ? Number(item.minimum) : null,
      maximum: Number.isFinite(Number(item.maximum)) ? Number(item.maximum) : null,
    } : { found: false, item: null, hasPriceLimits: false, minimum: null, maximum: null };
    if (!item) return { status: 'not-found', before: snapshot, after: snapshot, response: null, error: null };
    if (options.refresh === true && initial.refreshedLimits?.[item.id]) Object.assign(item, initial.refreshedLimits[item.id]);
    const after = {
      ...snapshot,
      hasPriceLimits: Number.isFinite(Number(item.minimum)) && Number.isFinite(Number(item.maximum)),
      minimum: Number.isFinite(Number(item.minimum)) ? Number(item.minimum) : null,
      maximum: Number.isFinite(Number(item.maximum)) ? Number(item.maximum) : null,
    };
    return {
      status: after.hasPriceLimits ? 'loaded' : 'unavailable',
      before: snapshot,
      after,
      response: options.refresh === true ? { success: true, status: null, code: null } : null,
      error: null,
    };
  }

  function inspectListingCandidates(options = {}) {
    calls.push({ method: 'inspectListingCandidates', options: { ...options } });
    const sources = [...new Set((options.sources || ['transfer', 'club']).map(String))];
    const all = [...items.values()].filter((item) => sources.includes(String(item.pile || 'club')));
    const limit = options.limit === 0 ? all.length : Math.min(all.length, Number(options.limit || 50));
    const candidates = all.slice(0, limit).map(listingCandidate);
    return {
      schemaVersion: 1,
      capturedAt: Number(initial.capturedAt || Date.now()),
      sources,
      counts: Object.fromEntries(sources.map((source) => [source, all.filter((item) => String(item.pile || 'club') === source).length])),
      total: all.length,
      returned: candidates.length,
      truncated: candidates.length < all.length,
      candidates,
      error: null,
    };
  }

  function inspectListingItem(ref = {}) {
    calls.push({ method: 'inspectListingItem', ref: { ...ref } });
    const item = items.get(Number(ref.id || 0));
    return item ? { status: 'loaded', candidate: listingCandidate(item) } : { status: 'not-found', candidate: null };
  }

  async function listItem(ref = {}, listing = {}) {
    calls.push({ method: 'listItem', ref: { ...ref }, listing: { ...listing } });
    const item = items.get(Number(ref.id || 0));
    const requested = {
      startPrice: Number(listing.startPrice),
      buyNow: Number(listing.buyNow),
      durationSeconds: Number(listing.durationSeconds),
    };
    if (!item) return { status: 'not-found', item: null, requested, response: null, error: null };
    if (String(item.pile || 'club') !== String(ref.pile || item.pile || 'club')) {
      return { status: 'moved', item: listingCandidate(item).item, requested, response: null, error: null };
    }
    const configured = initial.listResults?.[item.id];
    if (configured && configured.status !== 'accepted') {
      return {
        status: configured.status,
        item: listingCandidate(item).item,
        requested,
        response: configured.response || null,
        error: configured.error || null,
      };
    }
    const wasTransfer = item.pile === 'transfer';
    item.pile = 'transfer';
    item.auction = {
      present: true,
      state: 'active',
      tradeId: Number(configured?.tradeId || item.id + 1_000_000),
      startingBid: requested.startPrice,
      currentBid: 0,
      buyNowPrice: requested.buyNow,
      expires: requested.durationSeconds,
    };
    if (!wasTransfer) transferUsed += 1;
    return {
      status: 'accepted',
      item: { id: Number(item.id), definitionId: Number(item.definitionId), pile: ref.pile || 'club' },
      requested,
      response: { success: true, status: 200, code: null },
      error: null,
    };
  }

  async function refreshTransferItems() {
    calls.push({ method: 'refreshTransferItems' });
    return initial.refreshTransferResult || {
      status: 'completed',
      response: { success: true, status: 200, code: null },
      error: null,
    };
  }

  return Object.freeze({
    calls,
    inspectCapabilities,
    inspectListingCandidates,
    inspectListingItem,
    inspectPriceLimits,
    listItem,
    refreshTransferItems,
  });
}
