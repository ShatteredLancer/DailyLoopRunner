import { createTradeCapabilitySnapshot } from '../../trade/contracts.js';
import { isBulkRelistEligible } from '../../trade/bulk-relist-snapshot.js';
import { readPlayerRareFlag } from '../../domain/player-rarity.js';

export function createFakeTradeAdapter(initial = {}) {
  const calls = [];
  const mutationPermits = new WeakMap();
  let transferRefreshIndex = 0;
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

  async function acquireRequestPermit(actionInput) {
    const action = String(actionInput || '');
    calls.push({ method: 'acquireRequestPermit', action });
    const configured = initial.requestPermitResults?.[action];
    if (configured?.status === 'blocked') return { ...configured, action, permit: null };
    if (!['buy', 'list', 'bulk-relist', 'purchase-route'].includes(action)) {
      return {
        status: 'blocked', action, permit: null,
        error: { kind: 'invalid-request-permit-action', code: null, action: 'stop' },
      };
    }
    const permit = Object.freeze({});
    mutationPermits.set(permit, action);
    return { status: 'acquired', action, permit, error: null };
  }

  function consumeRequestPermit(action, permit) {
    if (!permit || mutationPermits.get(permit) !== action) {
      return { kind: 'invalid-request-permit', code: null, action: 'stop' };
    }
    mutationPermits.delete(permit);
    return null;
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
    if (!item) {
      return {
        status: 'not-found', refreshStatus: 'not-requested', limitsSource: 'none',
        before: snapshot, after: snapshot, response: null, error: null,
      };
    }
    if (options.refresh === true && initial.refreshedLimits?.[item.id]) Object.assign(item, initial.refreshedLimits[item.id]);
    const after = {
      ...snapshot,
      hasPriceLimits: Number.isFinite(Number(item.minimum)) && Number.isFinite(Number(item.maximum)),
      minimum: Number.isFinite(Number(item.minimum)) ? Number(item.minimum) : null,
      maximum: Number.isFinite(Number(item.maximum)) ? Number(item.maximum) : null,
    };
    return {
      status: after.hasPriceLimits ? 'loaded' : 'unavailable',
      refreshStatus: options.refresh === true ? 'completed' : 'not-requested',
      limitsSource: after.hasPriceLimits
        ? (options.refresh === true ? 'refreshed' : 'existing-cache')
        : 'none',
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

  function inspectBulkRelistSnapshot(options = {}) {
    calls.push({ method: 'inspectBulkRelistSnapshot', options: { ...options } });
    const transfer = [...items.values()].filter((item) => item.pile === 'transfer');
    const requestedIds = new Set((options.itemIds || []).map(Number).filter((id) => id > 0));
    const byState = {};
    for (const item of transfer) {
      const state = String(item.auction?.state || 'none');
      byState[state] = Number(byState[state] || 0) + 1;
    }
    const unsold = transfer.filter(isBulkRelistEligible);
    return {
      schemaVersion: 1,
      capturedAt: Number(initial.capturedAt || Date.now()),
      status: 'loaded',
      total: transfer.length,
      unsoldCount: unsold.length,
      byState,
      truncated: unsold.length > 100,
      items: unsold.slice(0, 100).map((item) => {
        const candidate = listingCandidate(item);
        return {
          item: { ...candidate.item, pile: 'transfer' },
          name: candidate.name,
          rating: candidate.rating || null,
          auction: { ...candidate.auction },
        };
      }),
      auctions: (requestedIds.size
        ? transfer.filter((item) => requestedIds.has(Number(item.id)))
        : transfer.slice(0, 100))
        .slice(0, 100)
        .map((item) => {
          const candidate = listingCandidate(item);
          return {
            item: { ...candidate.item, pile: 'transfer' },
            name: candidate.name,
            rating: candidate.rating || null,
            auction: { ...candidate.auction },
          };
        }),
      error: null,
    };
  }

  async function listItem(ref = {}, listing = {}, options = {}) {
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
    const permitError = consumeRequestPermit('list', options.requestPermit);
    if (permitError) {
      return { status: 'blocked', item: listingCandidate(item).item, requested, response: null, error: permitError };
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
    const sequenced = Array.isArray(initial.refreshTransferResults)
      ? initial.refreshTransferResults[Math.min(transferRefreshIndex++, initial.refreshTransferResults.length - 1)]
      : null;
    return sequenced || initial.refreshTransferResult || {
      status: 'completed',
      response: { success: true, status: 200, code: null },
      error: null,
    };
  }

  async function relistExpiredAuctions(options = {}) {
    calls.push({ method: 'relistExpiredAuctions' });
    const permitError = consumeRequestPermit('bulk-relist', options.requestPermit);
    if (permitError) return { status: 'blocked', response: null, error: permitError };
    const configured = initial.bulkRelistResult;
    if (configured && configured.status !== 'accepted') return { ...configured };
    const selectedIds = Array.isArray(configured?.itemIds)
      ? new Set(configured.itemIds.map(Number))
      : null;
    if (configured?.materialize !== false) {
      for (const item of items.values()) {
        if (item.pile !== 'transfer' || !isBulkRelistEligible(item)) continue;
        if (selectedIds && !selectedIds.has(Number(item.id))) continue;
        item.auction = { ...item.auction, state: 'active' };
      }
    }
    return {
      status: 'accepted',
      response: configured?.response === undefined
        ? { success: true, status: 200, code: null }
        : configured.response,
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

  async function buyNowItem(ref = {}, priceInput = 0, options = {}) {
    const price = Number(priceInput);
    calls.push({ method: 'buyNowItem', ref: { ...ref }, price });
    const item = [...marketItems.values()].find((entry) => (
      Number(entry.id) === Number(ref.id)
      && Number(entry.auction?.tradeId) === Number(ref.tradeId)
    ));
    if (!item) return { status: 'not-found', item: null, price, response: null, error: null };
    const permitError = consumeRequestPermit('buy', options.requestPermit);
    if (permitError) {
      return { status: 'blocked', item: listingCandidate(item).item, price, response: null, error: permitError };
    }
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
    return definitionOwnershipSnapshot(Number(definitionId));
  }

  function definitionOwnershipSnapshot(definitionId) {
    const owned = [...items.values()].filter((item) => Number(item.definitionId) === definitionId);
    return {
      definitionId,
      club: owned.filter((item) => item.pile === 'club').length,
      transfer: owned.filter((item) => item.pile === 'transfer').length,
      unassigned: owned.filter((item) => item.pile === 'unassigned').length,
      storage: owned.filter((item) => item.pile === 'storage').length,
    };
  }

  function inspectDefinitionOwnerships(definitionIds = []) {
    const ids = [...new Set((definitionIds || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))];
    calls.push({ method: 'inspectDefinitionOwnerships', definitionIds: [...ids] });
    return Object.fromEntries(ids.map((definitionId) => [definitionId, definitionOwnershipSnapshot(definitionId)]));
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

  async function routePurchasedItem(ref = {}, destination = 'club', options = {}) {
    calls.push({ method: 'routePurchasedItem', ref: { ...ref }, destination: String(destination) });
    const item = items.get(Number(ref.id || 0));
    if (!item || item.pile !== 'unassigned') return { status: 'not-found', item: null, destination, response: null, error: null };
    const permitError = consumeRequestPermit('purchase-route', options.requestPermit);
    if (permitError) {
      return { status: 'blocked', item: listingCandidate(item).item, destination, response: null, error: permitError };
    }
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
    acquireRequestPermit,
    inspectCapabilities,
    inspectListingCandidates,
    inspectListingItem,
    inspectBulkRelistSnapshot,
    inspectPriceLimits,
    listItem,
    relistExpiredAuctions,
    refreshTransferItems,
    searchMarket,
    buyNowItem,
    refreshPurchaseState,
    inspectPurchase,
    inspectDefinitionOwnership,
    inspectDefinitionOwnerships,
    inspectUnassignedReadiness,
    routePurchasedItem,
  });
}
