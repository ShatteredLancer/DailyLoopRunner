import { assertValidTradeJob, createTradeRunReceipt } from './contracts.js';
import { buildBuyLanePlan, nextBuySearch, selectBuyCandidate } from './buy-plan.js';
import {
  destinationForOwnership,
  filterBuyCatalogForDestination,
  normalizeExpectedBuyDestination,
} from './buy-destination.js';
import { classifyTradeError } from './error-policy.js';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeItem(candidate = {}) {
  return {
    id: Number(candidate.item?.id || 0),
    definitionId: Number(candidate.item?.definitionId || 0),
    pile: String(candidate.item?.pile || 'market'),
  };
}

export function createBuyTransaction(options = {}) {
  const adapter = options.tradeAdapter;
  const catalogProvider = options.playerCatalogProvider;
  if (!adapter) throw new TypeError('tradeAdapter is required');
  if (typeof catalogProvider?.load !== 'function') throw new TypeError('playerCatalogProvider.load is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sleep = typeof options.sleep === 'function' ? options.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const createRunId = typeof options.createRunId === 'function'
    ? options.createRunId
    : () => `buy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const purchaseReconciliationAttempts = Math.min(
    3,
    Math.max(1, Math.floor(Number(options.purchaseReconciliationAttempts || 3))),
  );

  async function run(input = {}) {
    const job = input.job;
    assertValidTradeJob(job, 'Buy job');
    if (job.type !== 'buy') throw new Error('Buy job.type must be buy');
    const runId = String(input.runId || createRunId());
    const startedAt = Number(now());
    const requested = Number(job.policy.quantity);
    const itemIndexOffset = Math.max(0, Math.floor(Number(input.itemIndexOffset || 0)));
    const receipts = [];
    let succeeded = 0;
    let failed = 0;
    let spent = 0;
    let emptySearches = 0;
    let searches = 0;
    let buyAttempts = 0;
    let status = 'completed';
    let reason = null;
    let resumeAt = null;
    let cursor = null;
    let activeSearch = null;
    let activeCandidates = [];
    let mutationsFromSearch = 0;
    const purchasedByRating = Object.fromEntries(Object.entries(input.purchasedByRating || {})
      .map(([rating, count]) => [String(Number(rating)), Math.max(0, Math.floor(Number(count) || 0))]));
    const expectedDestination = normalizeExpectedBuyDestination(input.expectedDestination || 'auto');
    const minimumRetainedCoins = Math.max(0, Math.floor(finiteNumber(input.minimumRetainedCoins)));
    const checkpoint = (phase, detail = {}) => {
      try { options.onCheckpoint?.({ phase, at: Number(now()), ...detail }); } catch { }
    };
    const discardSearchResponse = () => {
      activeSearch = null;
      activeCandidates = [];
      mutationsFromSearch = 0;
    };

    const beforeCapabilities = adapter.inspectCapabilities();
    checkpoint('transaction-start', { destination: expectedDestination });
    const stop = (nextStatus, nextReason) => {
      status = nextStatus;
      reason = nextReason;
    };
    const circuit = options.circuitBreaker?.availability?.();
    if (!expectedDestination) stop('blocked', 'buy-validation-destination-invalid');
    else if (circuit && circuit.allowed !== true) stop('blocked', 'trade-circuit-open');
    else if (beforeCapabilities.canTrade !== true) stop('blocked', 'trade-capability-unavailable');
    else if (!Number.isFinite(Number(beforeCapabilities.coins))) stop('blocked', 'trade-coins-unavailable');
    else if (Number(beforeCapabilities.coins) < minimumRetainedCoins) stop('blocked', 'minimum-retained-coins');
    else if (expectedDestination === 'transfer' && Number(beforeCapabilities.transferCapacity?.free) <= 0) {
      stop('blocked', 'transfer-list-full');
    }

    let lanePlan = null;
    if (!reason) {
      const catalog = await catalogProvider.load({
        ratingMin: job.policy.ratingMin,
        ratingMax: job.policy.ratingMax,
        platform: input.platform || 'pc',
      });
      checkpoint('catalog-loaded', { status: catalog.ok ? 'completed' : 'blocked' });
      const destinationCatalog = filterBuyCatalogForDestination(catalog, adapter, expectedDestination);
      checkpoint('destination-filtered', {
        status: destinationCatalog.reason ? 'blocked' : 'completed',
        reason: destinationCatalog.reason,
        destination: expectedDestination,
      });
      lanePlan = buildBuyLanePlan({ job, catalog: destinationCatalog.catalog, runId });
      cursor = input.cursor ? { ...lanePlan.cursor, ...input.cursor } : lanePlan.cursor;
      if (destinationCatalog.reason) stop('blocked', destinationCatalog.reason);
      else if (!catalog.ok || !lanePlan.ready) stop('blocked', `catalog-ratings-unavailable:${lanePlan.missingRatings.join(',')}`);
    }

    while (!reason && succeeded < requested) {
      if (input.shouldStop?.() === true) {
        stop('stopped', 'stopped-by-user');
        break;
      }
      if (Number(now()) - startedAt >= Number(job.policy.maxRuntimeMinutes) * 60_000) {
        stop('stopped', 'runtime-limit');
        break;
      }
      const remainingBudget = Number(job.policy.totalBudget) - spent;
      if (remainingBudget <= 0) {
        stop('stopped', 'budget-limit');
        break;
      }
      const searchCircuit = options.circuitBreaker?.availability?.();
      if (searchCircuit && searchCircuit.allowed !== true) {
        stop('blocked', 'trade-circuit-open');
        break;
      }
      const activeLane = activeSearch
        ? lanePlan.lanes.find((lane) => Number(lane.rating) === Number(activeSearch.rating))
        : null;
      if (activeLane && activeLane.quantityLimit !== null
        && Number(purchasedByRating[String(activeLane.rating)] || 0) >= Number(activeLane.quantityLimit)) {
        discardSearchResponse();
      }
      if (!activeSearch) {
        const excludedRatings = lanePlan.lanes
          .filter((lane) => lane.quantityLimit !== null
            && Number(purchasedByRating[String(lane.rating)] || 0) >= Number(lane.quantityLimit))
          .map((lane) => lane.rating);
        const cursorBeforeSearch = cursor ? JSON.parse(JSON.stringify(cursor)) : null;
        const next = nextBuySearch(lanePlan, cursor, { excludedRatings });
        cursor = next.cursor;
        const search = next.search;
        if (!search) {
          stop('stopped', excludedRatings.length === lanePlan.lanes.length ? 'rating-quantity-limit' : 'buy-search-plan-unavailable');
          break;
        }
        searches += 1;
        checkpoint('market-search-started', { search });
        const searchResult = await adapter.searchMarket(
          { ...search, page: 1 },
          { wait: input.deferWhenWaiting !== true },
        );
        checkpoint('market-search-finished', {
          search,
          status: searchResult.status,
          response: searchResult.response,
        });
        if (searchResult.status !== 'completed') {
          if (searchResult.error?.kind === 'pacing-deferred') {
            cursor = cursorBeforeSearch;
            searches = Math.max(0, searches - 1);
            stop('deferred', 'trade-action-pacing');
            resumeAt = searchResult.error.retryAt ?? null;
            checkpoint('buy-slice-deferred', {
              search, reason, retryAt: resumeAt, mutationBoundaryCrossed: false,
            });
            break;
          }
          const classification = classifyTradeError(searchResult.error || searchResult.response || {});
          if (classification.kind !== 'rate-limit') {
            options.circuitBreaker?.recordFailure?.(searchResult.error || searchResult.response || {}, {
              action: 'search', endpoint: '/transfermarket', jobId: job.id, runId,
              classification, response: searchResult.response, capabilities: adapter.inspectCapabilities(),
            });
          }
          stop(
            classification.kind === 'rate-limit' || classification.opensCircuit
              ? 'blocked'
              : classification.ambiguous ? 'ambiguous' : 'failed',
            classification.kind === 'rate-limit' ? 'trade-rate-limit' : `trade-${classification.kind}`,
          );
          break;
        }
        activeSearch = search;
        activeCandidates = [...(searchResult.candidates || [])];
        mutationsFromSearch = 0;
      }
      const search = activeSearch;
      const capabilities = adapter.inspectCapabilities();
      const selected = selectBuyCandidate({
        job,
        search,
        candidates: activeCandidates,
        limits: { remainingBudget, coins: Number(capabilities.coins) - minimumRetainedCoins },
      });
      if (!selected.selected) {
        emptySearches += 1;
        receipts.push({
          index: itemIndexOffset + receipts.length + 1, status: 'empty-search', search: { ...search },
          candidates: activeCandidates.length, rejectionCounts: selected.rejectionCounts,
        });
        discardSearchResponse();
        if (emptySearches >= Number(job.policy.maxConsecutiveEmptySearches)) {
          stop('stopped', 'empty-search-limit');
          break;
        }
        continue;
      }

      emptySearches = 0;
      const candidate = selected.selected;
      activeCandidates = activeCandidates.filter((entry) => (
        Number(entry.auction?.tradeId) !== Number(candidate.auction?.tradeId)
      ));
      const price = Number(candidate.auction.buyNowPrice);
      checkpoint('candidate-selected', {
        item: candidate.item,
        tradeId: candidate.auction.tradeId,
        price,
        search,
      });
      const ownership = adapter.inspectDefinitionOwnership(candidate.item.definitionId);
      const destination = destinationForOwnership(ownership);
      const liveCapabilities = adapter.inspectCapabilities();
      if (expectedDestination !== 'auto' && destination !== expectedDestination) {
        stop('blocked', 'buy-destination-changed');
        break;
      }
      if (price > Number(job.policy.totalBudget) - spent) {
        stop('stopped', 'budget-limit');
        break;
      }
      if (!Number.isFinite(Number(liveCapabilities.coins)) || price > Number(liveCapabilities.coins)) {
        stop('blocked', 'insufficient-coins');
        break;
      }
      if (Number(liveCapabilities.coins) - price < minimumRetainedCoins) {
        stop('blocked', 'minimum-retained-coins');
        break;
      }
      if (destination === 'transfer' && Number(liveCapabilities.transferCapacity?.free) <= 0) {
        stop('blocked', 'transfer-list-full');
        break;
      }
      if (input.shouldStop?.() === true) {
        stop('stopped', 'stopped-by-user');
        break;
      }
      const maxBuyAttempts = Math.max(1, Math.floor(Number(input.maxBuyAttempts || Number.MAX_SAFE_INTEGER)));
      if (buyAttempts >= maxBuyAttempts) {
        stop('stopped', 'buy-attempt-limit');
        break;
      }
      const buyCircuit = options.circuitBreaker?.availability?.();
      if (buyCircuit && buyCircuit.allowed !== true) {
        stop('blocked', 'trade-circuit-open');
        break;
      }
      if (input.beforeBuy && await input.beforeBuy() !== true) {
        stop('blocked', 'buy-execution-lease-lost');
        break;
      }

      const requestPermit = await adapter.acquireRequestPermit('buy', {
        wait: input.deferWhenWaiting !== true,
        onWait: (wait) => checkpoint('buy-request-permit-waiting', {
          item: safeItem(candidate),
          tradeId: Number(candidate.auction.tradeId),
          price,
          reason: wait.reason,
          retryAt: wait.retryAt,
          mutationBoundaryCrossed: false,
        }),
      });
      if (requestPermit?.status !== 'acquired' || !requestPermit.permit) {
        if (requestPermit?.error?.kind === 'pacing-deferred') {
          stop('deferred', 'trade-action-pacing');
          resumeAt = requestPermit.error.retryAt ?? null;
          checkpoint('buy-slice-deferred', {
            item: safeItem(candidate), tradeId: Number(candidate.auction.tradeId), price,
            reason, retryAt: resumeAt, mutationBoundaryCrossed: false,
          });
          break;
        }
        checkpoint('buy-request-permit-blocked', {
          item: safeItem(candidate),
          tradeId: Number(candidate.auction.tradeId),
          price,
          status: requestPermit?.status || 'blocked',
          reason: requestPermit?.error?.kind || 'trade-rate-limit',
          retryAt: requestPermit?.error?.retryAt ?? null,
          mutationBoundaryCrossed: false,
        });
        stop(
          requestPermit?.error?.kind === 'stopped-by-user' ? 'stopped' : 'blocked',
          requestPermit?.error?.kind === 'stopped-by-user' ? 'stopped-by-user' : 'trade-rate-limit',
        );
        break;
      }
      if (input.shouldStop?.() === true) {
        stop('stopped', 'stopped-by-user');
        break;
      }
      const permitCircuit = options.circuitBreaker?.availability?.();
      if (permitCircuit && permitCircuit.allowed !== true) {
        stop('blocked', 'trade-circuit-open');
        break;
      }
      if (input.beforeBuy && await input.beforeBuy() !== true) {
        stop('blocked', 'buy-execution-lease-lost');
        break;
      }

      const item = safeItem(candidate);
      const purchaseRef = { ...item, tradeId: Number(candidate.auction.tradeId), price };
      const coinsBeforePurchase = Number(liveCapabilities.coins);
      buyAttempts += 1;
      mutationsFromSearch += 1;
      const itemIndex = itemIndexOffset + buyAttempts;
      checkpoint('buy-request-started', {
        itemIndex,
        item,
        tradeId: purchaseRef.tradeId,
        price,
        destination,
        search,
        mutationBoundaryCrossed: true,
      });
      const bought = await adapter.buyNowItem(purchaseRef, price, { requestPermit: requestPermit.permit });
      checkpoint('buy-response-received', {
        itemIndex,
        item,
        tradeId: purchaseRef.tradeId,
        price,
        destination,
        status: bought.status,
        response: bought.response,
        mutationBoundaryCrossed: true,
      });
      let purchase = null;
      let refresh = null;
      let afterPurchaseCapabilities = adapter.inspectCapabilities();
      if (['accepted', 'ambiguous'].includes(bought.status)) {
        for (let attempt = 1; attempt <= purchaseReconciliationAttempts; attempt += 1) {
          checkpoint('purchase-reconciliation-started', {
            itemIndex, item, tradeId: purchaseRef.tradeId, price, destination,
            reason: `attempt-${attempt}`, mutationBoundaryCrossed: true,
          });
          refresh = await adapter.refreshPurchaseState({
            ambiguity: bought.status === 'ambiguous' || attempt === purchaseReconciliationAttempts,
          });
          afterPurchaseCapabilities = adapter.inspectCapabilities();
          purchase = adapter.inspectPurchase(purchaseRef);
          checkpoint('purchase-reconciliation-finished', {
            itemIndex,
            item: purchase?.candidate?.item || item,
            tradeId: purchaseRef.tradeId,
            price,
            destination,
            status: refresh.status,
            reason: purchase?.status === 'loaded' ? `materialized-attempt-${attempt}` : `pending-attempt-${attempt}`,
            response: refresh.response,
            mutationBoundaryCrossed: true,
          });
          if (refresh.status !== 'completed' || purchase?.status === 'loaded') break;
          if (attempt < purchaseReconciliationAttempts) await sleep(attempt * 750);
        }
      }
      if (refresh && refresh.status !== 'completed') {
        const classification = classifyTradeError(refresh.error || refresh.response || { kind: refresh.status });
        if (classification.kind !== 'rate-limit') {
          options.circuitBreaker?.recordFailure?.(refresh.error || refresh.response || {}, {
            action: 'buy-reconciliation', endpoint: '/purchased-state', jobId: job.id, runId,
            classification, response: refresh.response, capabilities: afterPurchaseCapabilities,
          });
        }
        failed += 1;
        stop(
          classification.opensCircuit ? 'blocked' : 'ambiguous',
          classification.kind === 'rate-limit'
            ? 'purchase-accepted-rate-limit-before-verification'
            : classification.opensCircuit ? `trade-${classification.kind}` : 'purchase-refresh-not-reconciled',
        );
        receipts.push({
          index: itemIndex, status, reason, item, tradeId: purchaseRef.tradeId, price,
          priceLimit: Number(search.maxBuyNow), coinsBefore: coinsBeforePurchase,
          coinsAfter: Number(afterPurchaseCapabilities.coins), search: { ...search }, refresh,
        });
        checkpoint('item-finished', {
          itemIndex, item, tradeId: purchaseRef.tradeId, price, destination,
          status, reason, mutationBoundaryCrossed: true,
        });
        break;
      }
      const coinDelta = coinsBeforePurchase - Number(afterPurchaseCapabilities.coins);
      const ambiguousPurchaseProven = bought.status !== 'ambiguous'
        || (purchase?.status === 'loaded' && Number.isFinite(coinDelta) && coinDelta === price);
      if (purchase?.status !== 'loaded') {
        const classification = classifyTradeError(bought.error || bought.response || { kind: bought.status });
        if (bought.status !== 'accepted') {
          if (classification.kind !== 'rate-limit') {
            options.circuitBreaker?.recordFailure?.(bought.error || bought.response || {}, {
              action: 'buy', endpoint: '/auctionhouse', jobId: job.id, runId,
              classification, response: bought.response, capabilities: adapter.inspectCapabilities(),
            });
          }
        }
        if (classification.kind === 'competition-lost') {
          receipts.push({ index: itemIndex, status: 'competition-lost', item, tradeId: purchaseRef.tradeId, price, search: { ...search } });
          checkpoint('item-finished', {
            itemIndex, item, tradeId: purchaseRef.tradeId, price, destination,
            status: 'competition-lost', reason: classification.kind, mutationBoundaryCrossed: true,
          });
          if (buyAttempts >= maxBuyAttempts) {
            stop('stopped', 'buy-attempt-limit');
            break;
          }
          if (mutationsFromSearch >= Number(job.policy.maxPurchasesPerSearch) || !activeCandidates.length) {
            discardSearchResponse();
          }
          continue;
        }
        failed += 1;
        const ambiguous = bought.status === 'accepted' || bought.status === 'ambiguous' || classification.ambiguous;
        stop(
          classification.opensCircuit
            ? 'blocked'
            : ambiguous ? 'ambiguous' : 'failed',
          classification.kind === 'rate-limit'
            ? 'trade-rate-limit'
            : classification.opensCircuit
              ? `trade-${classification.kind}`
            : 'purchase-not-reconciled',
        );
        receipts.push({
          index: itemIndex, status, reason, item, tradeId: purchaseRef.tradeId, price,
          priceLimit: Number(search.maxBuyNow), coinsBefore: coinsBeforePurchase,
          coinsAfter: Number(afterPurchaseCapabilities.coins), search: { ...search }, adapterStatus: bought.status,
          response: bought.response, error: bought.error,
        });
        checkpoint('item-finished', {
          itemIndex, item, tradeId: purchaseRef.tradeId, price, destination,
          status, reason, mutationBoundaryCrossed: true,
        });
        break;
      }
      if (!ambiguousPurchaseProven) {
        failed += 1;
        stop('ambiguous', 'purchase-coin-change-not-reconciled');
        receipts.push({
          index: itemIndex, status: 'ambiguous', reason, item, tradeId: purchaseRef.tradeId, price,
          priceLimit: Number(search.maxBuyNow), coinsBefore: coinsBeforePurchase,
          coinsAfter: Number(afterPurchaseCapabilities.coins), search: { ...search }, adapterStatus: bought.status,
        });
        checkpoint('item-finished', {
          itemIndex, item, tradeId: purchaseRef.tradeId, price, destination,
          status: 'ambiguous', reason, mutationBoundaryCrossed: true,
        });
        break;
      }

      const purchasedRef = { ...purchase.candidate.item, tradeId: purchaseRef.tradeId, price };
      const routePermit = await adapter.acquireRequestPermit('purchase-route', {
        onWait: (wait) => checkpoint('purchase-route-permit-waiting', {
          itemIndex, item: purchasedRef, tradeId: purchaseRef.tradeId, price, destination,
          reason: wait.reason, retryAt: wait.retryAt, mutationBoundaryCrossed: true,
        }),
      });
      if (routePermit?.status !== 'acquired' || !routePermit.permit) {
        failed += 1;
        stop(
          routePermit?.error?.kind === 'stopped-by-user' ? 'stopped' : 'ambiguous',
          routePermit?.error?.kind === 'stopped-by-user'
            ? 'stopped-by-user'
            : 'purchase-accepted-rate-limit-before-routing',
        );
        receipts.push({
          index: itemIndex, status, reason, item: purchasedRef,
          tradeId: purchaseRef.tradeId, price, destination,
          retryAt: routePermit?.error?.retryAt ?? null,
        });
        checkpoint('item-finished', {
          itemIndex, item: purchasedRef, tradeId: purchaseRef.tradeId, price, destination,
          status, reason, mutationBoundaryCrossed: true,
        });
        break;
      }
      if (input.shouldStop?.() === true) {
        failed += 1;
        stop('stopped', 'stopped-by-user');
        break;
      }
      if (input.beforeBuy && await input.beforeBuy() !== true) {
        failed += 1;
        stop('blocked', 'buy-execution-lease-lost');
        break;
      }
      checkpoint('purchase-route-started', {
        itemIndex, item: purchasedRef, tradeId: purchaseRef.tradeId, price, destination,
        mutationBoundaryCrossed: true,
      });
      const routed = await adapter.routePurchasedItem(
        purchasedRef,
        destination,
        { requestPermit: routePermit.permit },
      );
      checkpoint('purchase-route-finished', {
        itemIndex,
        item: routed.item || purchasedRef,
        tradeId: purchaseRef.tradeId,
        price,
        destination,
        status: routed.status,
        response: routed.response,
        mutationBoundaryCrossed: true,
      });
      if (routed.status !== 'completed') {
        failed += 1;
        stop(
          'blocked',
          routed.error?.kind === 'rate-limit'
            ? 'purchase-route-rate-limited'
            : routed.status === 'destination-full' ? 'transfer-list-full' : `purchase-route-${routed.status}`,
        );
        receipts.push({
          index: itemIndex, status: 'blocked', reason, item: purchasedRef,
          tradeId: purchaseRef.tradeId, price, priceLimit: Number(search.maxBuyNow),
          coinsBefore: coinsBeforePurchase, coinsAfter: Number(afterPurchaseCapabilities.coins), destination, route: routed,
        });
        checkpoint('item-finished', {
          itemIndex, item: purchasedRef, tradeId: purchaseRef.tradeId, price, destination,
          status: 'blocked', reason, mutationBoundaryCrossed: true,
        });
        break;
      }
      checkpoint('route-verification-refresh-started', {
        itemIndex, item: purchasedRef, tradeId: purchaseRef.tradeId, price, destination,
        mutationBoundaryCrossed: true,
      });
      const routeRefresh = await adapter.refreshPurchaseState({ destination });
      checkpoint('route-verification-refresh-finished', {
        itemIndex,
        item: purchasedRef,
        tradeId: purchaseRef.tradeId,
        price,
        destination,
        status: routeRefresh.status,
        response: routeRefresh.response,
        mutationBoundaryCrossed: true,
      });
      const verified = adapter.inspectPurchase({ ...purchasedRef, pile: destination });
      checkpoint('route-verification-inspected', {
        itemIndex,
        item: verified.candidate?.item || purchasedRef,
        tradeId: purchaseRef.tradeId,
        price,
        destination,
        status: verified.status,
        mutationBoundaryCrossed: true,
      });
      if (verified.status !== 'loaded' || verified.candidate?.item?.pile !== destination) {
        failed += 1;
        stop(
          'ambiguous',
          routeRefresh.error?.kind === 'rate-limit'
            ? 'purchase-routed-rate-limit-before-verification'
            : 'purchase-routed-but-not-verified',
        );
        receipts.push({
          index: itemIndex, status: 'ambiguous', reason, item: purchasedRef,
          tradeId: purchaseRef.tradeId, price, priceLimit: Number(search.maxBuyNow),
          coinsBefore: coinsBeforePurchase, coinsAfter: Number(afterPurchaseCapabilities.coins),
          destination, route: routed, verification: verified,
        });
        checkpoint('item-finished', {
          itemIndex, item: purchasedRef, tradeId: purchaseRef.tradeId, price, destination,
          status: 'ambiguous', reason, mutationBoundaryCrossed: true,
        });
        break;
      }
      succeeded += 1;
      spent += price;
      purchasedByRating[String(candidate.rating)] = Number(purchasedByRating[String(candidate.rating)] || 0) + 1;
      options.circuitBreaker?.recordSuccess?.({ action: 'buy', jobId: job.id, runId });
      receipts.push({
        index: itemIndex,
        status: 'purchased',
        item,
        tradeId: purchaseRef.tradeId,
        rating: Number(candidate.rating),
        price,
        priceLimit: Number(search.maxBuyNow),
        coinsBefore: coinsBeforePurchase,
        coinsAfter: Number(afterPurchaseCapabilities.coins),
        destination,
        search: { ...search },
        verification: { item: { ...verified.candidate.item }, purchasePrice: verified.purchasePrice },
      });
      checkpoint('item-finished', {
        itemIndex,
        item: { ...purchasedRef, pile: destination },
        tradeId: purchaseRef.tradeId,
        price,
        destination,
        status: 'purchased',
        mutationBoundaryCrossed: true,
      });
      if (mutationsFromSearch >= Number(job.policy.maxPurchasesPerSearch) || !activeCandidates.length) {
        discardSearchResponse();
      }
    }

    const finishedAt = Number(now());
    const afterCapabilities = adapter.inspectCapabilities();
    return createTradeRunReceipt({
      runId, jobId: job.id, jobType: job.type,
      scheduledFor: input.scheduledFor ?? startedAt,
      startedAt, finishedAt, resumeAt, status, reason,
      requested, succeeded, failed,
      skipped: status === 'deferred' ? 0 : Math.max(0, requested - succeeded - failed),
      coinsBefore: beforeCapabilities.coins,
      coinsAfter: afterCapabilities.coins,
      receipts: [{
        status: 'run-summary', searches, buyAttempts, spent, expectedDestination, minimumRetainedCoins, cursor,
        purchasedByRating,
      }, ...receipts],
    });
  }

  return Object.freeze({ run });
}
