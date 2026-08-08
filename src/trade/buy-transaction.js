import { assertValidTradeJob, createTradeRunReceipt } from './contracts.js';
import { buildBuyLanePlan, nextBuySearch, selectBuyCandidate } from './buy-plan.js';
import { classifyTradeError } from './error-policy.js';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function randomDelayMs(range, random) {
  const minimum = Math.max(0, finiteNumber(range?.[0]));
  const maximum = Math.max(minimum, finiteNumber(range?.[1], minimum));
  return Math.round((minimum + (maximum - minimum) * random()) * 1000);
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
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const createRunId = typeof options.createRunId === 'function'
    ? options.createRunId
    : () => `buy-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function run(input = {}) {
    const job = input.job;
    assertValidTradeJob(job, 'Buy job');
    if (job.type !== 'buy') throw new Error('Buy job.type must be buy');
    const runId = createRunId();
    const startedAt = Number(now());
    const requested = Number(job.policy.quantity);
    const receipts = [];
    let succeeded = 0;
    let failed = 0;
    let spent = 0;
    let emptySearches = 0;
    let searches = 0;
    let status = 'completed';
    let reason = null;
    let cursor = null;

    const beforeCapabilities = adapter.inspectCapabilities();
    const stop = (nextStatus, nextReason) => {
      status = nextStatus;
      reason = nextReason;
    };
    const circuit = options.circuitBreaker?.availability?.();
    if (circuit && circuit.allowed !== true) stop('blocked', 'trade-circuit-open');
    else if (beforeCapabilities.canTrade !== true) stop('blocked', 'trade-capability-unavailable');
    else {
      const readiness = adapter.inspectUnassignedReadiness();
      if (readiness.ready !== true) stop('blocked', readiness.reason || 'unassigned-not-ready');
    }

    let lanePlan = null;
    if (!reason) {
      const catalog = await catalogProvider.load({
        ratingMin: job.policy.ratingMin,
        ratingMax: job.policy.ratingMax,
        platform: input.platform || 'pc',
      });
      lanePlan = buildBuyLanePlan({ job, catalog, runId });
      cursor = lanePlan.cursor;
      if (!catalog.ok || !lanePlan.ready) stop('blocked', `catalog-ratings-unavailable:${lanePlan.missingRatings.join(',')}`);
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
      const readiness = adapter.inspectUnassignedReadiness();
      if (readiness.ready !== true) {
        stop('blocked', readiness.reason || 'unassigned-not-ready');
        break;
      }
      const searchCircuit = options.circuitBreaker?.availability?.();
      if (searchCircuit && searchCircuit.allowed !== true) {
        stop('blocked', 'trade-circuit-open');
        break;
      }
      const next = nextBuySearch(lanePlan, cursor);
      cursor = next.cursor;
      const search = next.search;
      if (!search) {
        stop('blocked', 'buy-search-plan-unavailable');
        break;
      }
      searches += 1;
      const searchResult = await adapter.searchMarket({ ...search, page: 1 });
      if (searchResult.status !== 'completed') {
        const classification = classifyTradeError(searchResult.error || searchResult.response || {});
        options.circuitBreaker?.recordFailure?.(searchResult.error || searchResult.response || {}, {
          action: 'search', endpoint: '/transfermarket', jobId: job.id, runId,
          classification, response: searchResult.response, capabilities: adapter.inspectCapabilities(),
        });
        stop(classification.opensCircuit ? 'blocked' : classification.ambiguous ? 'ambiguous' : 'failed', `trade-${classification.kind}`);
        break;
      }
      const capabilities = adapter.inspectCapabilities();
      const selected = selectBuyCandidate({
        job,
        search,
        candidates: searchResult.candidates,
        limits: { remainingBudget, coins: capabilities.coins },
      });
      if (!selected.selected) {
        emptySearches += 1;
        receipts.push({
          index: receipts.length + 1, status: 'empty-search', search: { ...search },
          candidates: searchResult.candidates?.length || 0, rejectionCounts: selected.rejectionCounts,
        });
        if (emptySearches >= Number(job.policy.maxConsecutiveEmptySearches)) {
          stop('stopped', 'empty-search-limit');
          break;
        }
        await sleep(randomDelayMs(job.policy.searchDelaySeconds, random));
        continue;
      }

      emptySearches = 0;
      const candidate = selected.selected;
      const price = Number(candidate.auction.buyNowPrice);
      const ownership = adapter.inspectDefinitionOwnership(candidate.item.definitionId);
      const destination = Number(ownership.club || 0) > 0 ? 'transfer' : 'club';
      const liveCapabilities = adapter.inspectCapabilities();
      if (price > Number(job.policy.totalBudget) - spent) {
        stop('stopped', 'budget-limit');
        break;
      }
      if (!Number.isFinite(Number(liveCapabilities.coins)) || price > Number(liveCapabilities.coins)) {
        stop('blocked', 'insufficient-coins');
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
      const buyCircuit = options.circuitBreaker?.availability?.();
      if (buyCircuit && buyCircuit.allowed !== true) {
        stop('blocked', 'trade-circuit-open');
        break;
      }

      const item = safeItem(candidate);
      const purchaseRef = { ...item, tradeId: Number(candidate.auction.tradeId), price };
      const coinsBeforePurchase = Number(liveCapabilities.coins);
      const bought = await adapter.buyNowItem(purchaseRef, price);
      let purchase = null;
      let refresh = null;
      let afterPurchaseCapabilities = adapter.inspectCapabilities();
      if (['accepted', 'ambiguous'].includes(bought.status)) {
        refresh = await adapter.refreshPurchaseState({ ambiguity: bought.status === 'ambiguous' });
        afterPurchaseCapabilities = adapter.inspectCapabilities();
        purchase = adapter.inspectPurchase(purchaseRef);
      }
      if (refresh && refresh.status !== 'completed') {
        const classification = classifyTradeError(refresh.error || refresh.response || { kind: refresh.status });
        options.circuitBreaker?.recordFailure?.(refresh.error || refresh.response || {}, {
          action: 'buy-reconciliation', endpoint: '/purchased-state', jobId: job.id, runId,
          classification, response: refresh.response, capabilities: afterPurchaseCapabilities,
        });
        failed += 1;
        stop(classification.opensCircuit ? 'blocked' : 'ambiguous', classification.opensCircuit ? `trade-${classification.kind}` : 'purchase-refresh-not-reconciled');
        receipts.push({
          index: receipts.length + 1, status, reason, item, tradeId: purchaseRef.tradeId, price,
          priceLimit: Number(search.maxBuyNow), coinsBefore: coinsBeforePurchase,
          coinsAfter: Number(afterPurchaseCapabilities.coins), search: { ...search }, refresh,
        });
        break;
      }
      const coinDelta = coinsBeforePurchase - Number(afterPurchaseCapabilities.coins);
      const ambiguousPurchaseProven = bought.status !== 'ambiguous'
        || (purchase?.status === 'loaded' && Number.isFinite(coinDelta) && coinDelta === price);
      if (purchase?.status !== 'loaded') {
        const classification = classifyTradeError(bought.error || bought.response || { kind: bought.status });
        if (bought.status !== 'accepted') {
          options.circuitBreaker?.recordFailure?.(bought.error || bought.response || {}, {
            action: 'buy', endpoint: '/auctionhouse', jobId: job.id, runId,
            classification, response: bought.response, capabilities: adapter.inspectCapabilities(),
          });
        }
        if (classification.kind === 'competition-lost') {
          receipts.push({ index: receipts.length + 1, status: 'competition-lost', item, tradeId: purchaseRef.tradeId, price, search: { ...search } });
          await sleep(randomDelayMs(job.policy.searchDelaySeconds, random));
          continue;
        }
        failed += 1;
        const ambiguous = bought.status === 'accepted' || bought.status === 'ambiguous' || classification.ambiguous;
        stop(classification.opensCircuit ? 'blocked' : ambiguous ? 'ambiguous' : 'failed', classification.opensCircuit ? `trade-${classification.kind}` : 'purchase-not-reconciled');
        receipts.push({
          index: receipts.length + 1, status, reason, item, tradeId: purchaseRef.tradeId, price,
          priceLimit: Number(search.maxBuyNow), coinsBefore: coinsBeforePurchase,
          coinsAfter: Number(afterPurchaseCapabilities.coins), search: { ...search }, adapterStatus: bought.status,
          response: bought.response, error: bought.error,
        });
        break;
      }
      if (!ambiguousPurchaseProven) {
        failed += 1;
        stop('ambiguous', 'purchase-coin-change-not-reconciled');
        receipts.push({
          index: receipts.length + 1, status: 'ambiguous', reason, item, tradeId: purchaseRef.tradeId, price,
          priceLimit: Number(search.maxBuyNow), coinsBefore: coinsBeforePurchase,
          coinsAfter: Number(afterPurchaseCapabilities.coins), search: { ...search }, adapterStatus: bought.status,
        });
        break;
      }

      const purchasedRef = { ...purchase.candidate.item, tradeId: purchaseRef.tradeId, price };
      const routed = await adapter.routePurchasedItem(purchasedRef, destination);
      if (routed.status !== 'completed') {
        failed += 1;
        stop('blocked', routed.status === 'destination-full' ? 'transfer-list-full' : `purchase-route-${routed.status}`);
        receipts.push({
          index: receipts.length + 1, status: 'blocked', reason, item: purchasedRef,
          tradeId: purchaseRef.tradeId, price, priceLimit: Number(search.maxBuyNow),
          coinsBefore: coinsBeforePurchase, coinsAfter: Number(afterPurchaseCapabilities.coins), destination, route: routed,
        });
        break;
      }
      await adapter.refreshPurchaseState();
      const verified = adapter.inspectPurchase({ ...purchasedRef, pile: destination });
      if (verified.status !== 'loaded' || verified.candidate?.item?.pile !== destination) {
        failed += 1;
        stop('ambiguous', 'purchase-routed-but-not-verified');
        receipts.push({
          index: receipts.length + 1, status: 'ambiguous', reason, item: purchasedRef,
          tradeId: purchaseRef.tradeId, price, priceLimit: Number(search.maxBuyNow),
          coinsBefore: coinsBeforePurchase, coinsAfter: Number(afterPurchaseCapabilities.coins),
          destination, route: routed, verification: verified,
        });
        break;
      }
      succeeded += 1;
      spent += price;
      options.circuitBreaker?.recordSuccess?.({ action: 'buy', jobId: job.id, runId });
      receipts.push({
        index: receipts.length + 1,
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
      if (succeeded < requested && input.shouldStop?.() !== true) {
        await sleep(randomDelayMs(job.policy.searchDelaySeconds, random));
      }
    }

    const finishedAt = Number(now());
    const afterCapabilities = adapter.inspectCapabilities();
    return createTradeRunReceipt({
      runId, jobId: job.id, jobType: job.type,
      scheduledFor: input.scheduledFor ?? startedAt,
      startedAt, finishedAt, status, reason,
      requested, succeeded, failed,
      skipped: Math.max(0, requested - succeeded - failed),
      coinsBefore: beforeCapabilities.coins,
      coinsAfter: afterCapabilities.coins,
      receipts: [{ status: 'run-summary', searches, spent, cursor }, ...receipts],
    });
  }

  return Object.freeze({ run });
}
