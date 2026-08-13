import { assertValidTradeJob, createTradeRunReceipt } from './contracts.js';
import { classifyTradeError } from './error-policy.js';
import { applyListingPriceLimits, listingCandidateRejection, TRADE_LISTING_MAX_BUY_NOW } from './listing-plan.js';

function sameNumber(left, right) {
  return Number(left) === Number(right);
}

function verificationMatches(entry, candidate) {
  return candidate
    && Number(candidate.item?.id) === Number(entry.item.id)
    && Number(candidate.item?.definitionId) === Number(entry.item.definitionId)
    && candidate.item?.pile === 'transfer'
    && candidate.auction?.state === 'active'
    && sameNumber(candidate.auction?.startingBid, entry.startPrice)
    && sameNumber(candidate.auction?.buyNowPrice, entry.buyNow);
}

export function createListingTransaction(options = {}) {
  const adapter = options.tradeAdapter;
  if (!adapter) throw new TypeError('tradeAdapter is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const createRunId = typeof options.createRunId === 'function'
    ? options.createRunId
    : () => `listing-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function run(input = {}) {
    const startedAt = Number(now());
    const runId = input.runId ? String(input.runId) : createRunId();
    const scheduledFor = Number.isFinite(Number(input.scheduledFor)) ? Number(input.scheduledFor) : startedAt;
    const job = input.job;
    const prepared = input.prepared;
    const itemIndexOffset = Math.max(0, Math.floor(Number(input.itemIndexOffset || 0)));
    assertValidTradeJob(job, 'Listing job');
    if (job.type !== 'listing') throw new Error('Listing job.type must be listing');
    const entries = prepared?.plan?.entries || [];
    const confirmation = prepared?.confirmation;
    const receipts = [];
    let status = 'completed';
    let reason = null;
    let succeeded = 0;
    let failed = 0;
    let resumeAt = null;
    const checkpoint = (phase, detail = {}) => {
      try { options.onCheckpoint?.({ phase, at: Number(now()), ...detail }); } catch { }
    };

    const circuitAvailability = options.circuitBreaker?.availability?.();
    checkpoint('transaction-started', { status: 'active' });
    if (circuitAvailability && circuitAvailability.allowed !== true) {
      status = 'blocked';
      reason = 'trade-circuit-open';
    }

    if (!reason && (prepared?.mode !== 'prepared' || prepared?.ready !== true || !confirmation || !entries.length)) {
      status = 'blocked';
      reason = 'listing-plan-not-prepared';
    } else if (entries.length > Number(job.policy.maxListings)) {
      status = 'blocked';
      reason = 'listing-plan-exceeds-job-limit';
    } else if (String(input.confirmationToken || '') !== confirmation.token
      || input.approved !== true) {
      status = 'blocked';
      reason = 'listing-approval-mismatch';
    } else if (startedAt > Number(confirmation.expiresAt)) {
      status = 'blocked';
      reason = 'listing-confirmation-expired';
    }

    const beforeCapabilities = adapter.inspectCapabilities();
    if (!reason && beforeCapabilities.canTrade !== true) {
      status = 'blocked';
      reason = 'trade-capability-unavailable';
    }

    for (let index = 0; !reason && index < entries.length; index += 1) {
      const entry = entries[index];
      const itemIndex = itemIndexOffset + index + 1;
      const listing = {
        startPrice: entry.startPrice,
        buyNow: entry.buyNow,
        durationSeconds: entry.durationSeconds,
      };
      checkpoint('item-preflight-started', { itemIndex, item: entry.item, listing });
      if (input.shouldStop?.() === true) {
        status = 'stopped';
        reason = 'stopped-by-user';
        break;
      }
      let transferPreflight = null;
      if (entry.item.pile === 'club' || entry.item.pile === 'transfer') {
        checkpoint('transfer-refresh-started', { itemIndex, item: entry.item, listing });
        transferPreflight = await adapter.refreshTransferItems({ wait: input.deferWhenWaiting !== true });
        checkpoint('transfer-refresh-finished', {
          itemIndex, item: entry.item, listing, status: transferPreflight.status, response: transferPreflight.response,
        });
        if (transferPreflight.status !== 'completed') {
          if (transferPreflight.error?.kind === 'pacing-deferred') {
            status = 'deferred';
            reason = 'trade-action-pacing';
            resumeAt = transferPreflight.error.retryAt ?? null;
            checkpoint('listing-slice-deferred', {
              itemIndex, item: entry.item, listing, reason, retryAt: resumeAt, mutationBoundaryCrossed: false,
            });
            break;
          }
          failed += 1;
          status = 'blocked';
          reason = transferPreflight.error?.kind === 'rate-limit'
            ? 'trade-rate-limit'
            : `listing-transfer-preflight-${transferPreflight.status || 'unavailable'}`;
          receipts.push({
            index: itemIndex,
            item: { ...entry.item },
            status: 'blocked',
            reason,
            transferPreflight,
          });
          break;
        }
        if (entry.item.pile === 'club') {
          const transferItem = adapter.inspectListingItem({ ...entry.item, pile: 'transfer' });
          if (transferItem.status === 'loaded' && transferItem.candidate?.item?.pile === 'transfer') {
            failed += 1;
            status = 'blocked';
            reason = 'listing-item-already-in-transfer';
            receipts.push({
              index: itemIndex,
              item: { ...entry.item },
              status: 'blocked',
              reason,
              transferPreflight,
              live: transferItem.candidate.item,
            });
            break;
          }
          if (transferItem.status === 'error') {
            failed += 1;
            status = 'blocked';
            reason = 'listing-transfer-state-error';
            receipts.push({
              index: itemIndex,
              item: { ...entry.item },
              status: 'blocked',
              reason,
              transferPreflight,
            });
            break;
          }
        }
      }
      const live = adapter.inspectListingItem(entry.item);
      if (live.status !== 'loaded' || !live.candidate) {
        failed += 1;
        status = 'blocked';
        reason = `listing-item-${live.status}`;
        receipts.push({ index: itemIndex, item: { ...entry.item }, status: 'blocked', reason });
        break;
      }
      if (live.candidate.item.pile !== entry.item.pile
        || Number(live.candidate.item.definitionId) !== Number(entry.item.definitionId)) {
        failed += 1;
        status = 'blocked';
        reason = 'listing-item-identity-changed';
        receipts.push({ index: itemIndex, item: { ...entry.item }, status: 'blocked', reason, live: live.candidate.item });
        break;
      }
      const eligibilityReason = listingCandidateRejection(live.candidate, job.policy);
      if (eligibilityReason) {
        failed += 1;
        status = 'blocked';
        reason = `listing-item-${eligibilityReason}`;
        receipts.push({ index: itemIndex, item: { ...entry.item }, status: 'blocked', reason });
        break;
      }
      const capabilities = adapter.inspectCapabilities();
      if (entry.item.pile === 'club' && Number(capabilities.transferCapacity?.free) <= 0) {
        failed += 1;
        status = 'blocked';
        reason = 'transfer-list-full';
        receipts.push({ index: itemIndex, item: { ...entry.item }, status: 'blocked', reason });
        break;
      }
      checkpoint('price-limits-refresh-started', { itemIndex, item: entry.item, listing });
      const priceLimitResult = await adapter.inspectPriceLimits(entry.item, {
        refresh: true,
        wait: input.deferWhenWaiting !== true,
      });
      checkpoint('price-limits-refresh-finished', {
        itemIndex, item: entry.item, listing, status: priceLimitResult.status, response: priceLimitResult.response,
      });
      if (priceLimitResult.error?.kind === 'rate-limit') {
        failed += 1;
        status = 'blocked';
        reason = 'trade-rate-limit';
        receipts.push({ index: itemIndex, item: { ...entry.item }, status, reason, requestPacing: priceLimitResult.error });
        break;
      }
      if (priceLimitResult.error?.kind === 'pacing-deferred') {
        status = 'deferred';
        reason = 'trade-action-pacing';
        resumeAt = priceLimitResult.error.retryAt ?? null;
        checkpoint('listing-slice-deferred', {
          itemIndex, item: entry.item, listing, reason, retryAt: resumeAt, mutationBoundaryCrossed: false,
        });
        break;
      }
      const finalPrice = applyListingPriceLimits(entry, priceLimitResult);
      if (!finalPrice.ok) {
        failed += 1;
        status = 'blocked';
        reason = finalPrice.reason;
        receipts.push({ index: itemIndex, item: { ...entry.item }, status: 'blocked', reason, priceLimits: priceLimitResult.after });
        break;
      }
      if (Number(finalPrice.entry.buyNow) > TRADE_LISTING_MAX_BUY_NOW) {
        failed += 1;
        status = 'blocked';
        reason = 'high-value-listing-excluded';
        receipts.push({ index: itemIndex, item: { ...entry.item }, status: 'blocked', reason });
        break;
      }
      if (!sameNumber(finalPrice.entry.startPrice, entry.startPrice) || !sameNumber(finalPrice.entry.buyNow, entry.buyNow)) {
        failed += 1;
        status = 'blocked';
        reason = 'listing-price-changed-after-confirmation';
        receipts.push({
          index: itemIndex,
          item: { ...entry.item },
          status: 'blocked',
          reason,
          confirmed: { startPrice: entry.startPrice, buyNow: entry.buyNow },
          current: { startPrice: finalPrice.entry.startPrice, buyNow: finalPrice.entry.buyNow },
        });
        break;
      }

      if (typeof input.beforeMutation === 'function' && await input.beforeMutation(entry) !== true) {
        failed += 1;
        status = 'blocked';
        reason = 'listing-execution-lease-lost';
        receipts.push({ index: itemIndex, item: { ...entry.item }, status: 'blocked', reason });
        break;
      }

      const requestPermit = await adapter.acquireRequestPermit('list', {
        wait: input.deferWhenWaiting !== true,
        onWait: (wait) => checkpoint('listing-request-permit-waiting', {
          itemIndex, item: entry.item, listing,
          reason: wait.reason, retryAt: wait.retryAt, mutationBoundaryCrossed: false,
        }),
      });
      if (requestPermit?.status !== 'acquired' || !requestPermit.permit) {
        if (requestPermit?.error?.kind === 'pacing-deferred') {
          status = 'deferred';
          reason = 'trade-action-pacing';
          resumeAt = requestPermit.error.retryAt ?? null;
          checkpoint('listing-slice-deferred', {
            itemIndex, item: entry.item, listing, reason, retryAt: resumeAt, mutationBoundaryCrossed: false,
          });
          break;
        }
        status = requestPermit?.error?.kind === 'stopped-by-user' ? 'stopped' : 'blocked';
        reason = requestPermit?.error?.kind === 'stopped-by-user' ? 'stopped-by-user' : 'trade-rate-limit';
        receipts.push({
          index: itemIndex,
          item: { ...entry.item },
          status,
          reason,
          retryAt: requestPermit?.error?.retryAt ?? null,
        });
        checkpoint('listing-request-permit-blocked', {
          itemIndex,
          item: entry.item,
          listing,
          status,
          reason,
          retryAt: requestPermit?.error?.retryAt ?? null,
          mutationBoundaryCrossed: false,
        });
        break;
      }
      if (input.shouldStop?.() === true) {
        status = 'stopped';
        reason = 'stopped-by-user';
        break;
      }
      const permitCircuit = options.circuitBreaker?.availability?.();
      if (permitCircuit && permitCircuit.allowed !== true) {
        status = 'blocked';
        reason = 'trade-circuit-open';
        break;
      }
      if (typeof input.beforeMutation === 'function' && await input.beforeMutation(entry) !== true) {
        status = 'blocked';
        reason = 'listing-execution-lease-lost';
        break;
      }

      checkpoint('listing-request-started', {
        itemIndex,
        item: entry.item,
        listing,
        status: 'mutation-pending',
        mutationBoundaryCrossed: true,
      });
      const listed = await adapter.listItem(entry.item, entry, { requestPermit: requestPermit.permit });
      checkpoint('listing-response-received', {
        itemIndex,
        item: entry.item,
        listing,
        status: listed.status,
        response: listed.response,
        mutationBoundaryCrossed: true,
      });
      const receipt = {
        index: itemIndex,
        item: { ...entry.item },
        listing: { startPrice: entry.startPrice, buyNow: entry.buyNow, durationSeconds: entry.durationSeconds },
        priceLimits: { ...entry.priceLimits },
        priceLimitRefresh: {
          status: priceLimitResult.refreshStatus,
          limitsSource: priceLimitResult.limitsSource,
          response: priceLimitResult.response,
          error: priceLimitResult.error,
        },
        adapterStatus: listed.status,
        response: listed.response,
        error: listed.error,
      };
      if (listed.status !== 'accepted') {
        const classification = classifyTradeError(listed.error || listed.response || { status: listed.status });
        if (classification.kind !== 'rate-limit') {
          options.circuitBreaker?.recordFailure?.(listed.error || listed.response || {}, {
            action: 'list',
            endpoint: '/auctionhouse',
            jobId: job.id,
            runId,
            classification,
            response: listed.response,
            capabilities: adapter.inspectCapabilities(),
          });
        }
        failed += 1;
        status = listed.status === 'ambiguous'
            ? 'ambiguous'
            : classification.opensCircuit || classification.kind === 'rate-limit' ? 'blocked' : 'failed';
        reason = classification.kind === 'rate-limit'
          ? 'trade-rate-limit'
          : classification.opensCircuit ? `trade-${classification.kind}` : `listing-${listed.status}`;
        receipts.push({ ...receipt, status, reason, classification });
        checkpoint('item-finished', {
          itemIndex, item: entry.item, listing, status, reason, mutationBoundaryCrossed: true,
        });
        break;
      }

      checkpoint('listing-reconciliation-started', {
        itemIndex, item: entry.item, listing, status: 'accepted', mutationBoundaryCrossed: true,
      });
      const refresh = await adapter.refreshTransferItems();
      const verification = adapter.inspectListingItem({ ...entry.item, pile: 'transfer' });
      checkpoint('listing-reconciliation-finished', {
        itemIndex,
        item: verification.candidate?.item || entry.item,
        listing,
        status: refresh.status === 'completed' && verificationMatches(entry, verification.candidate) ? 'listed' : 'ambiguous',
        response: refresh.response,
        mutationBoundaryCrossed: true,
      });
      if (refresh.status !== 'completed' || verification.status !== 'loaded' || !verificationMatches(entry, verification.candidate)) {
        failed += 1;
        status = 'ambiguous';
        reason = refresh.error?.kind === 'rate-limit'
          ? 'listing-accepted-rate-limit-before-verification'
          : 'listing-accepted-but-not-verified';
        receipts.push({
          ...receipt,
          status: 'ambiguous',
          reason,
          refresh,
          verification: verification.candidate || null,
        });
        checkpoint('item-finished', {
          itemIndex, item: entry.item, listing, status: 'ambiguous', reason, mutationBoundaryCrossed: true,
        });
        break;
      }
      succeeded += 1;
      options.circuitBreaker?.recordSuccess?.({ action: 'list', jobId: job.id, runId });
      receipts.push({
        ...receipt,
        status: 'listed',
        reason: null,
        refresh,
        verification: {
          item: { ...verification.candidate.item },
          auction: { ...verification.candidate.auction },
        },
      });
      checkpoint('item-finished', {
        itemIndex,
        item: verification.candidate.item,
        listing,
        status: 'listed',
        mutationBoundaryCrossed: true,
      });
    }

    const finishedAt = Number(now());
    const afterCapabilities = adapter.inspectCapabilities();
    const skipped = status === 'deferred' ? 0 : Math.max(0, entries.length - succeeded - failed);
    checkpoint('transaction-finished', { status, reason });
    return createTradeRunReceipt({
      runId,
      jobId: job.id,
      jobType: job.type,
      scheduledFor,
      startedAt,
      finishedAt,
      resumeAt,
      status,
      reason,
      requested: entries.length,
      succeeded,
      failed,
      skipped,
      coinsBefore: beforeCapabilities.coins,
      coinsAfter: afterCapabilities.coins,
      receipts,
    });
  }

  return Object.freeze({ run });
}
