import { createTradeCapabilitySnapshot } from '../../trade/contracts.js';
import { readPlayerRareFlag } from '../../domain/player-rarity.js';

export function createFakeTradeAdapter(initial = {}) {
  const calls = [];
  const items = new Map((initial.items || []).map((entry) => [Number(entry.id || 0), { ...entry }]));
  const marketItems = new Map((initial.marketItems || []).map((entry) => [Number(entry.id || 0), { ...entry, pile: 'market' }]));
  let coins = Number(initial.coins ?? 100000);
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
      coins,
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

  async function searchMarket(request = {}) {
    calls.push({ method: 'searchMarket', request: { ...request } });
    const configured = initial.searchResults?.[Number(request.definitionId)];
    if (configured && configured.status && configured.status !== 'completed') return { ...configured };
    const source = Array.isArray(configured?.items)
      ? configured.items.map((entry) => ({ ...entry, pile: 'market' }))
      : [...marketItems.values()];
    const candidates = source
      .filter((item) => Number(item.definitionId) === Number(request.definitionId))
      .map(listingCandidate);
    return {
      status: 'completed',
      request: { definitionId: Number(request.definitionId), maxBuyNow: Number(request.maxBuyNow), page: Number(request.page || 1) },
      response: { success: true, status: 200, code: null },
      candidates,
      error: null,
    };
  }

  async function buyNowItem(ref = {}, priceInput = 0) {
    const price = Number(priceInput);
    calls.push({ method: 'buyNowItem', ref: { ...ref }, price });
    const item = [...marketItems.values()].find((entry) => (
      Number(entry.id) === Number(ref.id)
      && Number(entry.auction?.tradeId) === Number(ref.tradeId)
    ));
    if (!item) return { status: 'not-found', item: null, price, response: null, error: null };
    const configured = initial.buyResults?.[Number(ref.tradeId)] || initial.buyResults?.[Number(item.id)];
    if (configured && configured.status !== 'accepted' && configured.materialize !== true) {
      return { status: configured.status, item: listingCandidate(item).item, price, response: configured.response || null, error: configured.error || null };
    }
    if (price !== Number(item.auction?.buyNowPrice)) {
      return { status: 'rejected', item: listingCandidate(item).item, price, response: null, error: { kind: 'price-changed' } };
    }
    if (coins < price) return { status: 'rejected', item: listingCandidate(item).item, price, response: null, error: { kind: 'insufficient-coins' } };
    if (configured?.preserveCoins !== true) coins -= price;
    marketItems.delete(Number(item.id));
    const purchased = { ...item, pile: 'unassigned', auction: { ...item.auction, state: 'closed' }, purchasePrice: price };
    items.set(Number(item.id), purchased);
    return {
      status: configured?.status || 'accepted',
      item: { id: Number(item.id), definitionId: Number(item.definitionId), pile: 'market' },
      tradeId: Number(item.auction?.tradeId),
      price,
      response: configured?.response || { success: true, status: 200, code: null },
      error: configured?.error || null,
    };
  }

  async function refreshPurchaseState(options = {}) {
    calls.push({ method: 'refreshPurchaseState', options: { ...options } });
    return initial.refreshPurchaseResult || { status: 'completed', response: { success: true, status: 200, code: null }, error: null };
  }

  function inspectPurchase(ref = {}) {
    calls.push({ method: 'inspectPurchase', ref: { ...ref } });
    const item = [...items.values()].find((entry) => Number(ref.id) > 0
      ? Number(entry.id) === Number(ref.id)
      : Number(entry.definitionId) === Number(ref.definitionId) && Number(entry.purchasePrice) === Number(ref.price));
    return item ? { status: 'loaded', candidate: listingCandidate(item), purchasePrice: Number(item.purchasePrice || 0) || null } : { status: 'not-found', candidate: null, purchasePrice: null };
  }

  function inspectDefinitionOwnership(definitionId) {
    calls.push({ method: 'inspectDefinitionOwnership', definitionId: Number(definitionId) });
    const owned = [...items.values()].filter((item) => Number(item.definitionId) === Number(definitionId));
    return {
      definitionId: Number(definitionId),
      club: owned.filter((item) => item.pile === 'club').length,
      transfer: owned.filter((item) => item.pile === 'transfer').length,
      unassigned: owned.filter((item) => item.pile === 'unassigned').length,
    };
  }

  function inspectUnassignedReadiness() {
    calls.push({ method: 'inspectUnassignedReadiness' });
    const unassigned = [...items.values()].filter((item) => item.pile === 'unassigned');
    const forced = initial.unassignedReady;
    return {
      ready: forced === undefined ? unassigned.length === 0 : forced === true,
      count: unassigned.length,
      reason: forced === false || (forced === undefined && unassigned.length) ? 'unassigned-not-empty' : null,
    };
  }

  async function routePurchasedItem(ref = {}, destination = 'club') {
    calls.push({ method: 'routePurchasedItem', ref: { ...ref }, destination: String(destination) });
    const item = items.get(Number(ref.id || 0));
    if (!item || item.pile !== 'unassigned') return { status: 'not-found', item: null, destination, response: null, error: null };
    if (destination === 'transfer' && transferUsed >= Number(initial.transferCapacity?.max ?? 100)) {
      return { status: 'destination-full', item: listingCandidate(item).item, destination, response: null, error: { kind: 'destination-full' } };
    }
    if (destination === 'club' && [...items.values()].some((entry) => entry.pile === 'club' && Number(entry.definitionId) === Number(item.definitionId))) {
      return { status: 'duplicate', item: listingCandidate(item).item, destination, response: null, error: { kind: 'duplicate' } };
    }
    item.pile = destination;
    if (destination === 'transfer') transferUsed += 1;
    return { status: 'completed', item: listingCandidate(item).item, destination, response: { success: true, status: 200, code: null }, error: null };
  }

  return Object.freeze({
    calls,
    inspectCapabilities,
    inspectListingCandidates,
    inspectListingItem,
    inspectPriceLimits,
    listItem,
    refreshTransferItems,
    searchMarket,
    buyNowItem,
    refreshPurchaseState,
    inspectPurchase,
    inspectDefinitionOwnership,
    inspectUnassignedReadiness,
    routePurchasedItem,
  });
}
