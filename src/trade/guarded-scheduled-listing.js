import { createTradeRunReceipt } from './contracts.js';
import { createListingTransaction } from './listing-transaction.js';
import { inspectTradeRequestCapacity, tradeListingRequestReserve } from './request-budget.js';

export const GUARDED_SCHEDULE_CONFIRMATION = 'RUN ONCE 1';
export const GUARDED_TRANSFER_REPRICE_CONFIRMATION = 'RUN REPRICE ONCE 1';
export const GUARDED_SCHEDULED_LISTING_LIMIT = 2;

export function guardedScheduledListingConfirmation(mode, countInput) {
  const count = Math.min(GUARDED_SCHEDULED_LISTING_LIMIT, Math.max(1, Math.floor(Number(countInput) || 1)));
  return mode === 'transfer-reprice' ? `RUN REPRICE ONCE ${count}` : `RUN ONCE ${count}`;
}

export function guardedTradeSessionReadiness(input = {}) {
  if (input.pageReady !== true) return { ready: false, reason: 'ea-session-unavailable' };
  const fsu = input.fsuReadiness || {};
  if (fsu.detected !== true) return { ready: true, reason: null };
  if (fsu.ready !== true) return { ready: false, reason: `fsu-club-${fsu.state || 'not-ready'}` };
  return { ready: true, reason: null };
}

function itemRef(ref = {}) {
  return {
    id: Number(ref.id || 0),
    definitionId: Number(ref.definitionId || 0),
    pile: String(ref.pile || ''),
  };
}

function sameItemRef(left = {}, right = {}) {
  return Number(left.id || 0) > 0
    && Number(left.id) === Number(right.id)
    && Number(left.definitionId) === Number(right.definitionId);
}

async function validateProvisionalClubEntries(options, input, prepared) {
  const readiness = input.context?.fsuReadiness || {};
  const refs = (prepared?.plan?.entries || []).map((entry) => itemRef(entry.item));
  if (refs.length && refs.every((ref) => ref.pile === 'transfer')) {
    return { ok: true, required: false, status: 'not-required-transfer', items: refs };
  }
  if (readiness.detected !== true || readiness.fullyValidated !== false) {
    return { ok: true, required: false, status: 'not-required', items: refs };
  }
  if (!refs.length || refs.some((ref) => ref.pile !== 'club' || !ref.id || !ref.definitionId)) {
    return { ok: false, required: true, status: 'invalid-item', items: refs };
  }
  if (typeof options.validateClubPlayers !== 'function') {
    return { ok: false, required: true, status: 'unavailable', items: refs };
  }
  try {
    const validation = await options.validateClubPlayers(refs, {
      label: `${input.job?.name || 'Trade Scheduler'} targeted Club validation`,
    });
    const returned = (validation?.items || []).map(itemRef);
    const missing = (validation?.missing || []).map(itemRef);
    const matched = refs.every((ref) => returned.some((candidate) => sameItemRef(candidate, ref)));
    return {
      ok: validation?.ok === true && matched,
      required: true,
      status: validation?.ok !== true ? 'failed' : matched ? 'passed' : refs.length === 1 ? 'item-not-returned' : 'items-not-returned',
      items: refs,
      returned,
      missing,
      elapsed: Number(validation?.elapsed || 0),
      reason: validation?.reason ? String(validation.reason) : null,
      fsuState: String(readiness.state || ''),
      cacheStatus: String(readiness.cacheStatus || ''),
    };
  } catch (error) {
    return {
      ok: false,
      required: true,
      status: 'error',
      items: refs,
      error: { message: error?.message || String(error) },
      fsuState: String(readiness.state || ''),
      cacheStatus: String(readiness.cacheStatus || ''),
    };
  }
}

export function inspectGuardedScheduledListingJob(job = {}, options = {}) {
  let reason = null;
  if (job.type !== 'listing') {
    return {
      ready: false,
      reason: 'validation-gate-listing-only',
      job,
      mode: null,
      requiredText: null,
    };
  }
  if (job.enabled !== true) reason = 'validation-gate-job-disabled';
  else if (job.armed !== true) reason = 'validation-gate-job-not-armed';
  else if (job.schedule?.type !== 'once') reason = 'validation-gate-once-only';
  else if (!Number.isFinite(Number(job.schedule?.runAt)) || Number(job.schedule.runAt) <= 0) reason = 'validation-gate-run-at-invalid';
  else if (!['skip', 'grace-window'].includes(job.misfirePolicy?.type)) reason = 'validation-gate-next-login-disabled';
  if (job.misfirePolicy?.type === 'grace-window' && Number(job.misfirePolicy.graceMinutes) > 15) {
    reason ||= 'validation-gate-grace-too-long';
  }
  const maxListings = Number(job.policy?.maxListings);
  if (!Number.isInteger(maxListings) || maxListings < 1 || maxListings > GUARDED_SCHEDULED_LISTING_LIMIT) {
    reason ||= 'validation-gate-listing-quantity-cap';
  }

  const sources = Array.isArray(job.policy?.sources) ? job.policy.sources : [];
  const source = sources.length === 1 ? sources[0] : null;
  let mode = null;
  let requiredText = null;
  if (!source) {
    reason ||= 'validation-gate-single-source-only';
  } else if (source === 'club') {
    mode = 'club-listing';
    requiredText = guardedScheduledListingConfirmation(mode, maxListings);
    if (job.policy?.expiredPolicy !== 'skip') reason ||= 'validation-gate-club-skip-expired-only';
  } else if (source === 'transfer') {
    mode = 'transfer-reprice';
    requiredText = guardedScheduledListingConfirmation(mode, maxListings);
    if (job.policy?.expiredPolicy !== 'reprice') reason ||= 'validation-gate-transfer-reprice-required';
    else if (options.scheduledTransferRepriceEnabled !== true) {
      reason ||= 'scheduled-transfer-reprice-validation-gate-disabled';
    }
  } else {
    reason ||= 'validation-gate-source-unsupported';
  }

  return {
    ready: reason === null,
    reason,
    job,
    mode,
    requiredText: reason === null ? requiredText : null,
  };
}

export function guardedScheduledListingReason(job = {}, options = {}) {
  return inspectGuardedScheduledListingJob(job, options).reason;
}

export function selectGuardedScheduledListingJob(snapshot = {}, options = {}) {
  const armed = (snapshot.jobs || []).filter((job) => job.enabled === true && job.armed === true);
  if (armed.length !== 1) {
    return { ready: false, reason: armed.length ? 'validation-gate-multiple-armed-jobs' : 'validation-gate-no-armed-job', job: null };
  }
  const gate = inspectGuardedScheduledListingJob(armed[0], options);
  const reason = gate.reason;
  const runtime = snapshot.runtimes?.[armed[0].id];
  if (!reason && runtime && runtime.nextRunAt === null) {
    return { ready: false, reason: 'validation-gate-no-pending-run', job: null };
  }
  return { ready: reason === null, reason, job: reason === null ? armed[0] : null };
}

export function createGuardedScheduledListingExecutor(options = {}) {
  const store = options.store;
  const listingPreparation = options.listingPreparation;
  const operationCoordinator = options.operationCoordinator;
  if (typeof store?.relock !== 'function') throw new TypeError('Trade Job Store with relock is required');
  if (typeof listingPreparation?.prepare !== 'function') throw new TypeError('Listing Preparation is required');
  if (!operationCoordinator?.acquire || !operationCoordinator?.release) throw new TypeError('Operation Coordinator is required');
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sleep = typeof options.sleep === 'function' ? options.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const transactionFactory = typeof options.transactionFactory === 'function'
    ? options.transactionFactory
    : (transactionOptions) => createListingTransaction(transactionOptions);

  function blockedReceipt(input, reason, startedAt = Number(now())) {
    return createTradeRunReceipt({
      runId: input.runId,
      jobId: input.job?.id,
      jobType: input.job?.type,
      scheduledFor: input.scheduledFor,
      startedAt,
      finishedAt: Number(now()),
      status: 'blocked',
      reason,
      requested: 0,
    });
  }

  async function execute(input = {}) {
    const startedAt = Number(now());
    let requestReservation = null;
    store.relock();
    if (options.validationGateEnabled !== true) return blockedReceipt(input, 'scheduled-listing-validation-gate-disabled', startedAt);
    if (input.context?.liveExecutionEnabled !== true) return blockedReceipt(input, 'live-execution-disabled', startedAt);
    const gate = inspectGuardedScheduledListingJob(input.job, {
      scheduledTransferRepriceEnabled: options.scheduledTransferRepriceEnabled === true,
    });
    const reason = gate.reason;
    if (reason) return blockedReceipt(input, reason, startedAt);
    const availability = options.circuitBreaker?.availability?.();
    if (availability && availability.allowed !== true) return blockedReceipt(input, 'trade-circuit-open', startedAt);
    const requestReserve = tradeListingRequestReserve(input.job);
    if (typeof options.requestBudget?.inspect === 'function') {
      const requestCapacity = inspectTradeRequestCapacity(options.requestBudget.inspect(), requestReserve);
      if (!requestCapacity.ready) return blockedReceipt(input, requestCapacity.reason, startedAt);
    }
    const journalRecovery = options.journal?.inspectRecovery?.();
    if (journalRecovery?.canSupersede === false) {
      return blockedReceipt(input, journalRecovery.reason || 'listing-journal-recovery-required', startedAt);
    }

    const operationId = `scheduled-listing:${input.runId}`;
    const operation = operationCoordinator.acquire({
      id: operationId,
      type: 'trade-listing',
      ownerId: options.ownerId || '',
      label: input.job.name,
    });
    if (!operation.acquired) return blockedReceipt(input, operation.reason || 'operation-unavailable', startedAt);

    options.onRunningChange?.(true, input);
    try {
      if (typeof options.requestBudget?.reserve === 'function') {
        requestReservation = await options.requestBudget.reserve(requestReserve);
        if (!requestReservation.ready) {
          const receipt = blockedReceipt(input, 'trade-request-budget-insufficient', startedAt);
          options.onReceipt?.(receipt, { job: input.job, prepared: null, clubValidation: null, input });
          return receipt;
        }
      }
      const maxListings = Number(input.job.policy.maxListings);
      const job = {
        ...input.job,
        policy: {
          ...input.job.policy,
          sources: [gate.mode === 'transfer-reprice' ? 'transfer' : 'club'],
          maxListings,
          expiredPolicy: gate.mode === 'transfer-reprice' ? 'reprice' : 'skip',
        },
      };
      options.journal?.begin?.({
        runId: input.runId,
        jobId: job.id,
        source: job.policy.sources[0],
        requested: maxListings,
        at: startedAt,
      });
      const adapter = requestReservation?.ready
        ? options.getTradeAdapter({ requestBudget: requestReservation })
        : options.getTradeAdapter();
      const prepared = await listingPreparation.prepare(job, {
        maxListings,
        tradeAdapter: adapter,
        requestBudget: requestReservation,
      });
      options.journal?.checkpoint?.(input.runId, {
        phase: 'prepare-finished',
        status: prepared?.ready ? 'completed' : 'blocked',
        reason: prepared?.blockers?.[0]?.reason,
        items: prepared?.plan?.entries || [],
      });
      if (prepared?.ready !== true || prepared?.plan?.entries?.length < 1 || prepared.plan.entries.length > maxListings) {
        const receipt = blockedReceipt(input, prepared?.blockers?.[0]?.reason || 'scheduled-listing-not-prepared', startedAt);
        options.journal?.finish?.(input.runId, { phase: 'prepare-blocked', status: receipt.status, reason: receipt.reason });
        options.onReceipt?.(receipt, { job, prepared, input });
        return receipt;
      }
      const clubValidation = await validateProvisionalClubEntries(options, input, prepared);
      if (!clubValidation.ok) {
        const receipt = blockedReceipt(input, `fsu-targeted-club-validation-${clubValidation.status}`, startedAt);
        options.journal?.finish?.(input.runId, { phase: 'club-validation-blocked', status: receipt.status, reason: receipt.reason });
        options.onReceipt?.(receipt, { job, prepared, clubValidation, input });
        return receipt;
      }
      const transaction = transactionFactory({
        tradeAdapter: adapter,
        circuitBreaker: options.circuitBreaker,
        sleep,
        onCheckpoint: (checkpoint) => options.journal?.checkpoint?.(input.runId, checkpoint),
      });
      const receipt = await transaction.run({
        job: prepared.job,
        prepared,
        runId: input.runId,
        confirmationToken: prepared.confirmation.token,
        confirmationText: prepared.confirmation.requiredText,
        scheduledFor: input.scheduledFor,
        beforeMutation: () => input.heartbeat?.() === true,
        shouldStop: () => options.shouldStop?.() === true,
      });
      options.journal?.finish?.(input.runId, {
        phase: 'receipt-recorded', status: receipt.status, reason: receipt.reason,
      });
      options.onReceipt?.(receipt, { job, prepared, clubValidation, input });
      return receipt;
    } catch (error) {
      options.journal?.finish?.(input.runId, {
        phase: 'executor-error', status: 'error', reason: error?.message || String(error),
      });
      throw error;
    } finally {
      operationCoordinator.release(operationId);
      try { await requestReservation?.release?.(); } catch { }
      options.onRunningChange?.(false, input);
    }
  }

  return Object.freeze({ execute });
}
