import { createTradeRunReceipt } from './contracts.js';
import { createListingTransaction } from './listing-transaction.js';

export const GUARDED_SCHEDULE_CONFIRMATION = 'RUN ONCE 1';

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

async function validateProvisionalClubEntry(options, input, prepared) {
  const readiness = input.context?.fsuReadiness || {};
  const entry = prepared?.plan?.entries?.[0];
  const ref = itemRef(entry?.item);
  if (readiness.detected !== true || readiness.fullyValidated !== false) {
    return { ok: true, required: false, status: 'not-required', item: ref };
  }
  if (ref.pile !== 'club' || !ref.id || !ref.definitionId) {
    return { ok: false, required: true, status: 'invalid-item', item: ref };
  }
  if (typeof options.validateClubPlayers !== 'function') {
    return { ok: false, required: true, status: 'unavailable', item: ref };
  }
  try {
    const validation = await options.validateClubPlayers([ref], {
      label: `${input.job?.name || 'Trade Scheduler'} targeted Club validation`,
    });
    const returned = (validation?.items || []).map(itemRef);
    const missing = (validation?.missing || []).map(itemRef);
    const matched = returned.some((candidate) => sameItemRef(candidate, ref));
    return {
      ok: validation?.ok === true && matched,
      required: true,
      status: validation?.ok !== true ? 'failed' : matched ? 'passed' : 'item-not-returned',
      item: ref,
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
      item: ref,
      error: { message: error?.message || String(error) },
      fsuState: String(readiness.state || ''),
      cacheStatus: String(readiness.cacheStatus || ''),
    };
  }
}

export function guardedScheduledListingReason(job = {}) {
  if (job.type !== 'listing') return 'validation-gate-listing-only';
  if (job.enabled !== true) return 'validation-gate-job-disabled';
  if (job.armed !== true) return 'validation-gate-job-not-armed';
  if (job.schedule?.type !== 'once') return 'validation-gate-once-only';
  if (!Number.isFinite(Number(job.schedule?.runAt)) || Number(job.schedule.runAt) <= 0) return 'validation-gate-run-at-invalid';
  if (!['skip', 'grace-window'].includes(job.misfirePolicy?.type)) return 'validation-gate-next-login-disabled';
  if (job.misfirePolicy?.type === 'grace-window' && Number(job.misfirePolicy.graceMinutes) > 15) {
    return 'validation-gate-grace-too-long';
  }
  if (!Array.isArray(job.policy?.sources)
    || job.policy.sources.length !== 1
    || job.policy.sources[0] !== 'club') return 'validation-gate-club-only';
  if (Number(job.policy?.maxListings) !== 1) return 'validation-gate-one-item-only';
  return null;
}

export function selectGuardedScheduledListingJob(snapshot = {}) {
  const armed = (snapshot.jobs || []).filter((job) => job.enabled === true && job.armed === true);
  if (armed.length !== 1) {
    return { ready: false, reason: armed.length ? 'validation-gate-multiple-armed-jobs' : 'validation-gate-no-armed-job', job: null };
  }
  const reason = guardedScheduledListingReason(armed[0]);
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
    store.relock();
    if (options.validationGateEnabled !== true) return blockedReceipt(input, 'scheduled-listing-validation-gate-disabled', startedAt);
    if (input.context?.liveExecutionEnabled !== true) return blockedReceipt(input, 'live-execution-disabled', startedAt);
    const reason = guardedScheduledListingReason(input.job);
    if (reason) return blockedReceipt(input, reason, startedAt);
    const availability = options.circuitBreaker?.availability?.();
    if (availability && availability.allowed !== true) return blockedReceipt(input, 'trade-circuit-open', startedAt);

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
      const job = {
        ...input.job,
        policy: { ...input.job.policy, sources: ['club'], maxListings: 1 },
      };
      const prepared = await listingPreparation.prepare(job, { maxListings: 1 });
      if (prepared?.ready !== true || prepared?.plan?.entries?.length !== 1) {
        const receipt = blockedReceipt(input, prepared?.blockers?.[0]?.reason || 'scheduled-listing-not-prepared', startedAt);
        options.onReceipt?.(receipt, { job, prepared, input });
        return receipt;
      }
      const clubValidation = await validateProvisionalClubEntry(options, input, prepared);
      if (!clubValidation.ok) {
        const receipt = blockedReceipt(input, `fsu-targeted-club-validation-${clubValidation.status}`, startedAt);
        options.onReceipt?.(receipt, { job, prepared, clubValidation, input });
        return receipt;
      }
      const transaction = transactionFactory({
        tradeAdapter: options.getTradeAdapter(),
        circuitBreaker: options.circuitBreaker,
        sleep,
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
      options.onReceipt?.(receipt, { job, prepared, clubValidation, input });
      return receipt;
    } finally {
      options.onRunningChange?.(false, input);
      operationCoordinator.release(operationId);
    }
  }

  return Object.freeze({ execute });
}
