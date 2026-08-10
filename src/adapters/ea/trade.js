import { createTradeCapabilitySnapshot } from '../../trade/contracts.js';
import { classifyTradeError } from '../../trade/error-policy.js';
import { createEaInventoryAdapter } from './inventory.js';

const CRITERIA_FIELDS = Object.freeze([
  'type', 'category', 'defId', 'maskedDefId', 'rarities', 'position',
  'nation', 'league', 'club', 'minBid', 'maxBid', 'minBuy', 'maxBuy',
]);

const ITEM_SERVICE_METHODS = Object.freeze([
  'searchTransferMarket', 'clearTransferMarketCache', 'bid', 'move',
  'requestMarketData', 'list', 'relistExpiredAuctions', 'requestTransferItems',
]);

function collectionValues(collection) {
  if (!collection) return [];
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (Array.isArray(collection._collection)) return collection._collection;
  if (collection._collection && typeof collection._collection === 'object') return Object.values(collection._collection);
  if (Array.isArray(collection)) return collection;
  return [];
}

function safePrimitive(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.filter((entry) => entry === null || ['string', 'number', 'boolean'].includes(typeof entry));
  return null;
}

function callBoolean(value, method) {
  try {
    return typeof value?.[method] === 'function' ? value[method]() === true : null;
  } catch {
    return null;
  }
}

function listingTradeable(item, snapshot) {
  if (typeof item?.isUntradeable === 'function') return snapshot.tradeable === true;
  if (typeof item?.tradeable === 'boolean') return item.tradeable;
  if (typeof item?.untradeable === 'boolean') return !item.untradeable;
  const untradeableCount = Number(item?.untradeableCount ?? item?._data?.untradeableCount);
  return Number.isFinite(untradeableCount) ? untradeableCount === 0 : snapshot.tradeable === true;
}

function auctionSnapshot(item) {
  let auction = null;
  try { auction = item?.getAuctionData?.() || item?._auction || null; } catch { }
  if (!auction) {
    return {
      present: false,
      state: 'none',
      tradeId: null,
      startingBid: null,
      currentBid: null,
      buyNowPrice: null,
      expires: null,
    };
  }
  const active = callBoolean(auction, 'isActiveTrade');
  const closed = callBoolean(auction, 'isClosedTrade');
  const inactive = callBoolean(auction, 'isInactive');
  const primitiveState = safePrimitive(auction.tradeState ?? auction.state ?? auction.bidState);
  const state = active === true
    ? 'active'
    : closed === true
      ? 'closed'
      : inactive === true
        ? 'inactive'
        : 'unknown';
  const numberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  return {
    present: true,
    state,
    rawState: primitiveState,
    tradeId: numberOrNull(auction.tradeId ?? auction.id),
    startingBid: numberOrNull(auction.startingBid ?? auction.startPrice),
    currentBid: numberOrNull(auction.currentBid),
    buyNowPrice: numberOrNull(auction.buyNowPrice),
    expires: numberOrNull(auction.expires ?? auction.endTime ?? item?.endTime),
  };
}

function listingCandidateSnapshot(inventory, item, pile) {
  const snapshot = inventory.snapshotItem(item, pile);
  return {
    item: { id: snapshot.id, definitionId: snapshot.definitionId, pile: snapshot.pile },
    name: snapshot.name,
    type: snapshot.type,
    rating: snapshot.rating,
    tier: snapshot.tier,
    rare: snapshot.rare,
    special: snapshot.special,
    rareflag: snapshot.rareflag,
    tradeable: listingTradeable(item, snapshot),
    evolution: snapshot.evolution,
    limitedUse: snapshot.limitedUse,
    concept: snapshot.concept,
    academyEnrolled: snapshot.academyEnrolled,
    auction: auctionSnapshot(item),
  };
}

function inspectCriteria(runtime) {
  if (typeof runtime?.UTSearchCriteriaDTO !== 'function') {
    return { constructorAvailable: false, fields: [], defaults: {} };
  }
  try {
    const criteria = new runtime.UTSearchCriteriaDTO();
    const fields = CRITERIA_FIELDS.filter((field) => field in criteria);
    return {
      constructorAvailable: true,
      fields,
      defaults: Object.fromEntries(fields.map((field) => [field, safePrimitive(criteria[field])])),
    };
  } catch {
    return { constructorAvailable: false, fields: [], defaults: {} };
  }
}

function readUser(runtime) {
  try { return runtime?.services?.User?.getUser?.() || null; } catch { return null; }
}

function readTradeAccess(runtime, user) {
  if (!user || user.tradeAccess === undefined || user.tradeAccess === null) {
    return { available: false, allowed: null, level: null };
  }
  const level = safePrimitive(user.tradeAccess);
  const allowedValue = runtime?.TradeAccessLevel?.ALLOWED;
  let allowed = null;
  if (allowedValue !== undefined) allowed = user.tradeAccess === allowedValue;
  else if (typeof user.tradeAccess === 'string') allowed = user.tradeAccess.toLowerCase() === 'allowed';
  return { available: true, allowed, level };
}

function currencyAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const candidate = typeof value === 'object' ? value.amount : value;
  if (candidate === null || candidate === undefined || candidate === '') return null;
  const amount = Number(candidate);
  return Number.isFinite(amount) ? amount : null;
}

function readCoins(runtime, user) {
  const direct = currencyAmount(user?.coins);
  if (direct !== null) return direct;
  try {
    return currencyAmount(user?.getCurrency?.(runtime?.GameCurrency?.COINS));
  } catch {
    return null;
  }
}

function readTransferCapacity(runtime) {
  const repository = runtime?.repositories?.Item;
  const pile = runtime?.ItemPile?.TRANSFER ?? 'transfer';
  let max = null;
  let used = null;
  try {
    const value = Number(repository?.getPileSize?.(pile));
    if (Number.isFinite(value)) max = value;
  } catch { }
  try {
    const value = Number(repository?.numItemsInCache?.(pile));
    if (Number.isFinite(value)) used = value;
  } catch { }
  if (used === null && repository) {
    try { used = collectionValues(repository?.transfer).length; } catch { }
  }
  return { max, used };
}

function repositoryPile(runtime, pile) {
  const repository = runtime?.repositories?.Item;
  if (!repository) return [];
  if (pile === 'unassigned') {
    try { return Array.from(repository.getUnassignedItems?.() || []); } catch { return []; }
  }
  if (pile === 'storage') {
    try { return Array.from(repository.getStorageItems?.() || []); } catch { return collectionValues(repository.storage); }
  }
  if (pile === 'transfer') {
    try { return Array.from(repository.getTransferItems?.() || []); } catch { return collectionValues(repository.transfer); }
  }
  return collectionValues(repository.club?.items)
    .concat(collectionValues(runtime?.services?.Item?.itemDao?.itemRepo?.club?.items));
}

function resolveItem(runtime, ref = {}) {
  const id = Number(ref.id || 0);
  const definitionId = Number(ref.definitionId || 0);
  const piles = [...new Set([ref.pile, 'unassigned', 'storage', 'transfer', 'club'].filter(Boolean))];
  for (const pile of piles) {
    const item = repositoryPile(runtime, pile).find((candidate) => (
      (id > 0 && Number(candidate?.id || 0) === id)
      || (!id && definitionId > 0 && Number(candidate?.definitionId || 0) === definitionId)
    ));
    if (item) return { item, pile };
  }
  return null;
}

function itemPriceLimitSnapshot(resolved) {
  if (!resolved) return { found: false, item: null, hasPriceLimits: false, minimum: null, maximum: null };
  const { item, pile } = resolved;
  let hasPriceLimits = false;
  try { hasPriceLimits = item?.hasPriceLimits?.() === true; } catch { }
  const limits = item?._itemPriceLimits || item?.itemPriceLimits || null;
  const minimum = Number(limits?.minimum);
  const maximum = Number(limits?.maximum);
  hasPriceLimits = hasPriceLimits || (Number.isFinite(minimum) && Number.isFinite(maximum));
  return {
    found: true,
    item: {
      id: Number(item?.id || 0),
      definitionId: Number(item?.definitionId || 0),
      pile: String(pile),
    },
    hasPriceLimits,
    minimum: Number.isFinite(minimum) ? minimum : null,
    maximum: Number.isFinite(maximum) ? maximum : null,
  };
}

function responseSummary(response) {
  const summary = {
    success: response?.success === true,
    status: Number.isFinite(Number(response?.status)) ? Number(response.status) : null,
    code: Number.isFinite(Number(response?.error?.code ?? response?.code)) ? Number(response?.error?.code ?? response?.code) : null,
  };
  const message = String(response?.error?.message || response?.message || response?.reason || '').trim();
  if (message) summary.message = message.slice(0, 200);
  return summary;
}

function observeResult(value, context = {}) {
  if (value && typeof value.then === 'function') return Promise.resolve(value);
  if (!value || typeof value.observe !== 'function') return Promise.resolve(value);
  return new Promise((resolve, reject) => {
    try {
      value.observe(context, (sender, response) => {
        try { sender?.unobserve?.(context); } catch { }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function createEaTradeAdapter(runtime) {
  const marketItems = new Map();

  function marketItemKey(ref = {}) {
    const id = Number(ref.id || 0);
    const tradeId = Number(ref.tradeId ?? ref.auction?.tradeId ?? 0);
    return id > 0 && tradeId > 0 ? `${id}:${tradeId}` : null;
  }

  function rememberMarketItem(item) {
    const auction = auctionSnapshot(item);
    const key = marketItemKey({ id: item?.id, tradeId: auction.tradeId });
    if (key) marketItems.set(key, item);
    return auction;
  }

  function inspectCapabilities() {
    const service = runtime?.services?.Item;
    const repository = runtime?.repositories?.Item;
    const user = readUser(runtime);
    const criteria = inspectCriteria(runtime);
    const methods = Object.fromEntries(ITEM_SERVICE_METHODS.map((name) => [name, typeof service?.[name] === 'function']));
    const tradeAccess = readTradeAccess(runtime, user);
    const transferCapacity = readTransferCapacity(runtime);
    const warnings = [];
    if (!service) warnings.push('EA Item service is unavailable');
    if (!repository) warnings.push('EA Item repository is unavailable');
    if (!user) warnings.push('EA user session is unavailable');
    if (!criteria.constructorAvailable) warnings.push('UTSearchCriteriaDTO is unavailable');
    const requiredMethods = ['searchTransferMarket', 'clearTransferMarketCache', 'bid', 'move', 'requestMarketData', 'list'];
    const missingMethods = requiredMethods.filter((name) => !methods[name]);
    if (missingMethods.length) warnings.push(`EA Trade methods unavailable: ${missingMethods.join(', ')}`);
    if (tradeAccess.available && tradeAccess.allowed === false) warnings.push('EA Trade Access is not allowed');
    if (transferCapacity.max === null || transferCapacity.used === null) warnings.push('Transfer List capacity is unavailable');
    const runtimeReady = Boolean(service && repository && user && criteria.constructorAvailable);
    return createTradeCapabilitySnapshot({
      runtimeReady,
      canTrade: runtimeReady && tradeAccess.allowed === true && missingMethods.length === 0,
      tradeAccess,
      coins: readCoins(runtime, user),
      transferCapacity,
      criteria,
      methods,
      warnings,
    });
  }

  async function inspectPriceLimits(ref = {}, options = {}) {
    const service = runtime?.services?.Item;
    const resolved = resolveItem(runtime, ref);
    const before = itemPriceLimitSnapshot(resolved);
    if (!resolved) {
      return {
        status: 'not-found', refreshStatus: 'not-requested', limitsSource: 'none',
        before, after: before, response: null, error: null,
      };
    }
    if (options.refresh !== true) {
      return {
        status: before.hasPriceLimits ? 'loaded' : 'unavailable',
        refreshStatus: 'not-requested',
        limitsSource: before.hasPriceLimits ? 'existing-cache' : 'none',
        before,
        after: before,
        response: null,
        error: null,
      };
    }
    if (typeof service?.requestMarketData !== 'function') {
      return {
        status: 'unsupported', refreshStatus: 'unsupported',
        limitsSource: before.hasPriceLimits ? 'existing-cache' : 'none',
        before, after: before, response: null, error: null,
      };
    }
    try {
      const response = await observeResult(service.requestMarketData(resolved.item), options.observerContext || {});
      const after = itemPriceLimitSnapshot(resolveItem(runtime, before.item));
      const responseSnapshot = responseSummary(response);
      const refreshStatus = responseSnapshot.success === false ? 'rejected' : 'completed';
      return {
        status: after.hasPriceLimits ? 'loaded' : 'unavailable',
        refreshStatus,
        limitsSource: after.hasPriceLimits
          ? (refreshStatus === 'completed' ? 'refreshed' : before.hasPriceLimits ? 'existing-cache' : 'runtime-cache')
          : 'none',
        before,
        after,
        response: responseSnapshot,
        error: null,
      };
    } catch (error) {
      const classification = classifyTradeError(error);
      const after = itemPriceLimitSnapshot(resolveItem(runtime, before.item));
      return {
        status: 'error',
        refreshStatus: 'error',
        limitsSource: after.hasPriceLimits ? (before.hasPriceLimits ? 'existing-cache' : 'runtime-cache') : 'none',
        before,
        after,
        response: null,
        error: { kind: classification.kind, code: classification.code, message: error?.message || String(error) },
      };
    }
  }

  function inspectListingCandidates(options = {}) {
    const requestedSources = Array.isArray(options.sources) ? options.sources : ['transfer', 'club'];
    const sources = [...new Set(requestedSources.map(String).filter((pile) => ['club', 'transfer'].includes(pile)))];
    const requestedLimit = Number(options.limit);
    const limit = options.limit === 0
      ? Number.POSITIVE_INFINITY
      : Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(5000, Math.floor(requestedLimit))
        : 50;
    try {
      const inventory = createEaInventoryAdapter(runtime);
      const seen = new Set();
      const candidates = [];
      const counts = {};
      for (const pile of sources) {
        const rawItems = inventory.readPile(pile);
        let sourceCount = 0;
        for (const item of rawItems) {
          const id = Number(item?.id || 0);
          const definitionId = Number(item?.definitionId || 0);
          const key = id > 0 ? `${pile}:${id}` : `${pile}:definition:${definitionId}:index:${sourceCount}`;
          if (seen.has(key)) continue;
          seen.add(key);
          sourceCount += 1;
          if (candidates.length < limit) candidates.push(listingCandidateSnapshot(inventory, item, pile));
        }
        counts[pile] = sourceCount;
      }
      const total = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
      return {
        schemaVersion: 1,
        capturedAt: Date.now(),
        sources,
        counts,
        total,
        returned: candidates.length,
        truncated: candidates.length < total,
        candidates,
        error: null,
      };
    } catch (error) {
      return {
        schemaVersion: 1,
        capturedAt: Date.now(),
        sources,
        counts: {},
        total: 0,
        returned: 0,
        truncated: false,
        candidates: [],
        error: { message: error?.message || String(error) },
      };
    }
  }

  function inspectListingItem(ref = {}) {
    const resolved = resolveItem(runtime, ref);
    if (!resolved) return { status: 'not-found', candidate: null };
    try {
      const inventory = createEaInventoryAdapter(runtime);
      return { status: 'loaded', candidate: listingCandidateSnapshot(inventory, resolved.item, resolved.pile) };
    } catch (error) {
      return { status: 'error', candidate: null, error: { message: error?.message || String(error) } };
    }
  }

  async function listItem(ref = {}, listing = {}, options = {}) {
    const service = runtime?.services?.Item;
    const resolved = resolveItem(runtime, ref);
    const requested = {
      startPrice: Number(listing.startPrice),
      buyNow: Number(listing.buyNow),
      durationSeconds: Number(listing.durationSeconds),
    };
    if (!resolved || Number(ref.id || 0) <= 0) {
      return { status: 'not-found', item: null, requested, response: null, error: null };
    }
    const item = { id: Number(resolved.item?.id || 0), definitionId: Number(resolved.item?.definitionId || 0), pile: resolved.pile };
    if (String(resolved.pile) !== String(ref.pile || resolved.pile)) {
      return { status: 'moved', item, requested, response: null, error: null };
    }
    if (typeof service?.list !== 'function') {
      return { status: 'unsupported', item, requested, response: null, error: null };
    }
    if (!Number.isFinite(requested.startPrice) || requested.startPrice <= 0
      || !Number.isFinite(requested.buyNow) || requested.buyNow < requested.startPrice
      || !Number.isFinite(requested.durationSeconds) || requested.durationSeconds <= 0) {
      return { status: 'invalid-request', item, requested, response: null, error: null };
    }
    try {
      const response = await observeResult(service.list(
        resolved.item,
        requested.startPrice,
        requested.buyNow,
        requested.durationSeconds,
      ), options.observerContext || {});
      const summary = responseSummary(response);
      if (summary.success) return { status: 'accepted', item, requested, response: summary, error: null };
      const classification = classifyTradeError(response || {});
      return {
        status: 'rejected',
        item,
        requested,
        response: summary,
        error: { kind: classification.kind, code: classification.code, action: classification.action },
      };
    } catch (error) {
      const classification = classifyTradeError(error);
      return {
        status: classification.ambiguous ? 'ambiguous' : 'error',
        item,
        requested,
        response: null,
        error: { kind: classification.kind, code: classification.code, action: classification.action, message: error?.message || String(error) },
      };
    }
  }

  async function refreshTransferItems(options = {}) {
    const service = runtime?.services?.Item;
    if (typeof service?.requestTransferItems !== 'function') {
      return { status: 'unsupported', response: null, error: null };
    }
    try {
      const response = await observeResult(service.requestTransferItems(), options.observerContext || {});
      return { status: 'completed', response: responseSummary(response), error: null };
    } catch (error) {
      const classification = classifyTradeError(error);
      return {
        status: classification.ambiguous ? 'ambiguous' : 'error',
        response: null,
        error: { kind: classification.kind, code: classification.code, action: classification.action, message: error?.message || String(error) },
      };
    }
  }

  async function searchMarket(request = {}, options = {}) {
    const service = runtime?.services?.Item;
    const definitionId = Number(request.definitionId);
    const maxBuyNow = Number(request.maxBuyNow);
    const page = Math.max(1, Math.floor(Number(request.page || 1)));
    const normalizedRequest = { definitionId, maxBuyNow, page };
    if (!Number.isInteger(definitionId) || definitionId <= 0
      || !Number.isFinite(maxBuyNow) || maxBuyNow <= 0) {
      return { status: 'invalid-request', request: normalizedRequest, response: null, candidates: [], error: null };
    }
    if (typeof runtime?.UTSearchCriteriaDTO !== 'function'
      || typeof service?.searchTransferMarket !== 'function') {
      return { status: 'unsupported', request: normalizedRequest, response: null, candidates: [], error: null };
    }
    try {
      const criteria = new runtime.UTSearchCriteriaDTO();
      criteria.defId = [definitionId];
      criteria.type = runtime?.SearchType?.PLAYER ?? 'player';
      criteria.category = runtime?.SearchCategory?.ANY ?? 'any';
      criteria.maxBuy = maxBuyNow;
      marketItems.clear();
      service.clearTransferMarketCache?.();
      const response = await observeResult(
        service.searchTransferMarket(criteria, page),
        options.observerContext || {},
      );
      const summary = responseSummary(response);
      if (!summary.success) {
        const classification = classifyTradeError(response || {});
        return {
          status: 'rejected', request: normalizedRequest, response: summary, candidates: [],
          error: { kind: classification.kind, code: classification.code, action: classification.action },
        };
      }
      const inventory = createEaInventoryAdapter(runtime);
      const candidates = Array.from(response?.data?.items || []).map((item) => {
        rememberMarketItem(item);
        return listingCandidateSnapshot(inventory, item, 'market');
      });
      return { status: 'completed', request: normalizedRequest, response: summary, candidates, error: null };
    } catch (error) {
      const classification = classifyTradeError(error);
      return {
        status: classification.ambiguous ? 'ambiguous' : 'error',
        request: normalizedRequest,
        response: null,
        candidates: [],
        error: { kind: classification.kind, code: classification.code, action: classification.action, message: error?.message || String(error) },
      };
    }
  }

  async function buyNowItem(ref = {}, priceInput = 0, options = {}) {
    const service = runtime?.services?.Item;
    const price = Number(priceInput);
    const key = marketItemKey(ref);
    const liveItem = key ? marketItems.get(key) : null;
    const item = liveItem ? {
      id: Number(liveItem.id || 0),
      definitionId: Number(liveItem.definitionId || 0),
      pile: 'market',
    } : null;
    if (!liveItem) return { status: 'not-found', item: null, tradeId: Number(ref.tradeId || 0), price, response: null, error: null };
    if (Number(ref.definitionId || 0) !== Number(liveItem.definitionId || 0)) {
      return {
        status: 'mismatch', item, tradeId: Number(ref.tradeId), price, response: null,
        error: { kind: 'definition-mismatch', code: null, action: 'stop' },
      };
    }
    if (typeof service?.bid !== 'function') {
      return { status: 'unsupported', item, tradeId: Number(ref.tradeId), price, response: null, error: null };
    }
    const auction = auctionSnapshot(liveItem);
    if (!Number.isFinite(price) || price <= 0 || price !== Number(auction.buyNowPrice)) {
      return {
        status: 'rejected', item, tradeId: Number(ref.tradeId), price, response: null,
        error: { kind: 'price-changed', code: null, action: 'refresh-and-skip' },
      };
    }
    try {
      const response = await observeResult(service.bid(liveItem, price), options.observerContext || {});
      const summary = responseSummary(response);
      if (summary.success) return { status: 'accepted', item, tradeId: Number(ref.tradeId), price, response: summary, error: null };
      const classification = classifyTradeError(response || {});
      return {
        status: 'rejected', item, tradeId: Number(ref.tradeId), price, response: summary,
        error: { kind: classification.kind, code: classification.code, action: classification.action },
      };
    } catch (error) {
      const classification = classifyTradeError(error);
      return {
        status: classification.ambiguous ? 'ambiguous' : 'error',
        item,
        tradeId: Number(ref.tradeId),
        price,
        response: null,
        error: { kind: classification.kind, code: classification.code, action: classification.action, message: error?.message || String(error) },
      };
    }
  }

  async function refreshPurchaseState(options = {}) {
    const service = runtime?.services?.Item;
    const methods = options.ambiguity === true
      ? ['requestUnassignedItems', 'requestTransferItems', 'requestClubItems', 'requestWatchlist', 'requestWatchedItems']
      : options.destination === 'transfer'
        ? ['requestTransferItems']
        : options.destination === 'club'
          ? ['requestClubItems']
          : ['requestUnassignedItems'];
    const available = [...new Set(methods)].filter((method) => typeof service?.[method] === 'function');
    if (!available.length) return { status: 'unsupported', response: null, steps: [], error: null };
    try {
      const steps = [];
      for (const method of available) {
        const response = await observeResult(service[method](), options.observerContext || {});
        const summary = responseSummary(response);
        steps.push({ method, response: summary });
        if (!summary.success) {
          const classification = classifyTradeError(response || {});
          return {
            status: 'rejected', response: summary, steps,
            error: { kind: classification.kind, code: classification.code, action: classification.action },
          };
        }
      }
      return { status: 'completed', response: steps[0]?.response || null, steps, error: null };
    } catch (error) {
      const classification = classifyTradeError(error);
      return {
        status: classification.ambiguous ? 'ambiguous' : 'error',
        response: null,
        steps: [],
        error: { kind: classification.kind, code: classification.code, action: classification.action, message: error?.message || String(error) },
      };
    }
  }

  function inspectPurchase(ref = {}) {
    const resolved = resolveItem(runtime, ref);
    if (!resolved) return { status: 'not-found', candidate: null, purchasePrice: null };
    try {
      const inventory = createEaInventoryAdapter(runtime);
      const purchasePrice = Number(
        resolved.item?.purchasePrice
        ?? resolved.item?._data?.purchasePrice
        ?? resolved.item?.lastSalePrice,
      );
      return {
        status: 'loaded',
        candidate: listingCandidateSnapshot(inventory, resolved.item, resolved.pile),
        purchasePrice: Number.isFinite(purchasePrice) && purchasePrice > 0 ? purchasePrice : null,
      };
    } catch (error) {
      return { status: 'error', candidate: null, purchasePrice: null, error: { message: error?.message || String(error) } };
    }
  }

  function inspectDefinitionOwnership(definitionIdInput) {
    const definitionId = Number(definitionIdInput);
    const counts = { club: 0, transfer: 0, unassigned: 0, storage: 0 };
    if (!Number.isInteger(definitionId) || definitionId <= 0) return { definitionId, ...counts };
    for (const pile of Object.keys(counts)) {
      const seen = new Set();
      for (const item of repositoryPile(runtime, pile)) {
        if (Number(item?.definitionId || 0) !== definitionId) continue;
        const id = Number(item?.id || 0);
        const key = id > 0 ? id : item;
        if (seen.has(key)) continue;
        seen.add(key);
        counts[pile] += 1;
      }
    }
    return { definitionId, ...counts };
  }

  function inspectUnassignedReadiness() {
    const items = repositoryPile(runtime, 'unassigned');
    return {
      ready: items.length === 0,
      count: items.length,
      reason: items.length ? 'unassigned-not-empty' : null,
    };
  }

  async function routePurchasedItem(ref = {}, destinationInput = 'club', options = {}) {
    const service = runtime?.services?.Item;
    const destination = String(destinationInput);
    if (!['club', 'transfer'].includes(destination)) {
      return { status: 'invalid-destination', item: null, destination, response: null, error: null };
    }
    const resolved = resolveItem(runtime, ref);
    const key = marketItemKey(ref);
    const liveItem = resolved?.item || (key ? marketItems.get(key) : null);
    const item = liveItem ? {
      id: Number(liveItem.id || 0),
      definitionId: Number(liveItem.definitionId || 0),
      pile: String(resolved?.pile || 'unassigned'),
    } : null;
    if (!liveItem) return { status: 'not-found', item: null, destination, response: null, error: null };
    if (typeof service?.move !== 'function') return { status: 'unsupported', item, destination, response: null, error: null };
    const pile = runtime?.ItemPile?.[destination.toUpperCase()] ?? destination;
    try {
      const response = await observeResult(service.move(liveItem, pile), options.observerContext || {});
      const summary = responseSummary(response);
      if (summary.success) {
        if (key) marketItems.delete(key);
        return { status: 'completed', item: { ...item, pile: destination }, destination, response: summary, error: null };
      }
      const classification = classifyTradeError(response || {});
      return {
        status: classification.kind === 'destination-full' ? 'destination-full' : classification.kind === 'card-in-trade' ? 'moved' : 'rejected',
        item,
        destination,
        response: summary,
        error: { kind: classification.kind, code: classification.code, action: classification.action },
      };
    } catch (error) {
      const classification = classifyTradeError(error);
      return {
        status: classification.ambiguous ? 'ambiguous' : 'error',
        item,
        destination,
        response: null,
        error: { kind: classification.kind, code: classification.code, action: classification.action, message: error?.message || String(error) },
      };
    }
  }

  return Object.freeze({
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
