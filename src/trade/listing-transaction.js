import { assertValidTradeJob, createTradeRunReceipt } from './contracts.js';
import { classifyTradeError } from './error-policy.js';
import { applyListingPriceLimits, listingCandidateRejection } from './listing-plan.js';

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

function randomDelayMs(range, random) {
  const minimum = Math.max(0, Number(range?.[0] || 0));
  const maximum = Math.max(minimum, Number(range?.[1] || minimum));
  return Math.round((minimum + (maximum - minimum) * random()) * 1000);
}

export function createListingTransaction(options = {}) {
  const adapter = options.tradeAdapter;
  if (!adapter) throw new TypeError('tradeAdapter is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sleep = typeof options.sleep === 'function' ? options.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const createRunId = typeof options.createRunId === 'function'
    ? options.createRunId
    : () => `listing-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function run(input = {}) {
    const startedAt = Number(now());
    const runId = createRunId();
    const job = input.job;
    const prepared = input.prepared;
    assertValidTradeJob(job, 'Listing job');
    if (job.type !== 'listing') throw new Error('Listing job.type must be listing');
    const entries = prepared?.plan?.entries || [];
    const confirmation = prepared?.confirmation;
    const receipts = [];
    let status = 'completed';
    let reason = null;
    let succeeded = 0;
    let failed = 0;

    const circuitAvailability = options.circuitBreaker?.availability?.();
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
      || String(input.confirmationText || '') !== confirmation.requiredText) {
      status = 'blocked';
      reason = 'listing-confirmation-mismatch';
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
      if (input.shouldStop?.() === true) {
        status = 'stopped';
        reason = 'stopped-by-user';
        break;
      }
      const live = adapter.inspectListingItem(entry.item);
      if (live.status !== 'loaded' || !live.candidate) {
        failed += 1;
        status = 'blocked';
        reason = `listing-item-${live.status}`;
        receipts.push({ index: index + 1, item: { ...entry.item }, status: 'blocked', reason });
        break;
      }
      if (live.candidate.item.pile !== entry.item.pile
        || Number(live.candidate.item.definitionId) !== Number(entry.item.definitionId)) {
        failed += 1;
        status = 'blocked';
        reason = 'listing-item-identity-changed';
        receipts.push({ index: index + 1, item: { ...entry.item }, status: 'blocked', reason, live: live.candidate.item });
        break;
      }
      const eligibilityReason = listingCandidateRejection(live.candidate, job.policy);
      if (eligibilityReason) {
        failed += 1;
        status = 'blocked';
        reason = `listing-item-${eligibilityReason}`;
        receipts.push({ index: index + 1, item: { ...entry.item }, status: 'blocked', reason });
        break;
      }
      const capabilities = adapter.inspectCapabilities();
      if (entry.item.pile === 'club' && Number(capabilities.transferCapacity?.free) <= 0) {
        failed += 1;
        status = 'blocked';
        reason = 'transfer-list-full';
        receipts.push({ index: index + 1, item: { ...entry.item }, status: 'blocked', reason });
        break;
      }
      const priceLimitResult = await adapter.inspectPriceLimits(entry.item, { refresh: true });
      const finalPrice = applyListingPriceLimits(entry, priceLimitResult);
      if (!finalPrice.ok) {
        failed += 1;
        status = 'blocked';
        reason = finalPrice.reason;
        receipts.push({ index: index + 1, item: { ...entry.item }, status: 'blocked', reason, priceLimits: priceLimitResult.after });
        break;
      }
      if (!sameNumber(finalPrice.entry.startPrice, entry.startPrice) || !sameNumber(finalPrice.entry.buyNow, entry.buyNow)) {
        failed += 1;
        status = 'blocked';
        reason = 'listing-price-changed-after-confirmation';
        receipts.push({
          index: index + 1,
          item: { ...entry.item },
          status: 'blocked',
          reason,
          confirmed: { startPrice: entry.startPrice, buyNow: entry.buyNow },
          current: { startPrice: finalPrice.entry.startPrice, buyNow: finalPrice.entry.buyNow },
        });
        break;
      }

      const listed = await adapter.listItem(entry.item, entry);
      const receipt = {
        index: index + 1,
        item: { ...entry.item },
        listing: { startPrice: entry.startPrice, buyNow: entry.buyNow, durationSeconds: entry.durationSeconds },
        priceLimits: { ...entry.priceLimits },
        adapterStatus: listed.status,
        response: listed.response,
        error: listed.error,
      };
      if (listed.status !== 'accepted') {
        const classification = classifyTradeError(listed.error || listed.response || { status: listed.status });
        options.circuitBreaker?.recordFailure?.(listed.error || listed.response || {}, {
          action: 'list',
          endpoint: '/auctionhouse',
          jobId: job.id,
          runId,
          classification,
          response: listed.response,
          capabilities: adapter.inspectCapabilities(),
        });
        failed += 1;
        status = listed.status === 'ambiguous' ? 'ambiguous' : classification.opensCircuit ? 'blocked' : 'failed';
        reason = classification.opensCircuit ? `trade-${classification.kind}` : `listing-${listed.status}`;
        receipts.push({ ...receipt, status, reason, classification });
        break;
      }

      const refresh = await adapter.refreshTransferItems();
      const verification = adapter.inspectListingItem({ ...entry.item, pile: 'transfer' });
      if (refresh.status !== 'completed' || verification.status !== 'loaded' || !verificationMatches(entry, verification.candidate)) {
        failed += 1;
        status = 'ambiguous';
        reason = 'listing-accepted-but-not-verified';
        receipts.push({
          ...receipt,
          status: 'ambiguous',
          reason,
          refresh,
          verification: verification.candidate || null,
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
      if (index < entries.length - 1 && input.shouldStop?.() !== true) {
        await sleep(randomDelayMs(job.policy.listingDelaySeconds, random));
      }
    }

    const finishedAt = Number(now());
    const afterCapabilities = adapter.inspectCapabilities();
    const skipped = Math.max(0, entries.length - succeeded - failed);
    return createTradeRunReceipt({
      runId,
      jobId: job.id,
      jobType: job.type,
      scheduledFor: startedAt,
      startedAt,
      finishedAt,
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
