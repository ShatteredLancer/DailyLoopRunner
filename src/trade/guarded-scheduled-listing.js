import { createTradeRunReceipt } from './contracts.js';
import { createListingTransaction } from './listing-transaction.js';
import { createTradeChunkCoordinator, TRADE_RUN_ITEM_LIMIT } from './chunk-coordinator.js';

export const GUARDED_SCHEDULED_LISTING_LIMIT = TRADE_RUN_ITEM_LIMIT;

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
      approval: null,
    };
  }
  if (job.enabled !== true) reason = 'validation-gate-job-disabled';
  else if (job.armed !== true) reason = 'validation-gate-job-not-armed';
  else if (!['once', 'daily', 'interval', 'window'].includes(job.schedule?.type)) reason = 'validation-gate-schedule-unsupported';
  else if (job.schedule?.type === 'once' && (!Number.isFinite(Number(job.schedule?.runAt)) || Number(job.schedule.runAt) <= 0)) reason = 'validation-gate-run-at-invalid';
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
  if (!source) {
    reason ||= 'validation-gate-single-source-only';
  } else if (source === 'club') {
    mode = 'club-listing';
    if (job.policy?.expiredPolicy !== 'skip') reason ||= 'validation-gate-club-skip-expired-only';
  } else if (source === 'transfer') {
    mode = 'transfer-reprice';
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
    approval: reason === null ? {
      risk: 'attention',
      action: mode,
      quantity: maxListings,
      scheduleType: job.schedule.type,
      authorizedRuns: options.authorizationRuns || 2,
    } : null,
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
  if (typeof store?.beginAuthorization !== 'function' && typeof store?.consumeAuthorization !== 'function') {
    throw new TypeError('Trade Job Store authorization is required');
  }
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
    const continuation = input.continuation || null;
    const startedAt = Number(continuation?.startedAt ?? input.startedAt ?? now());
    if (options.validationGateEnabled !== true) return blockedReceipt(input, 'scheduled-listing-validation-gate-disabled', startedAt);
    if (input.context?.liveExecutionEnabled !== true) return blockedReceipt(input, 'live-execution-disabled', startedAt);
    const gate = inspectGuardedScheduledListingJob(input.job, {
      scheduledTransferRepriceEnabled: options.scheduledTransferRepriceEnabled === true,
    });
    const reason = gate.reason;
    if (reason) return blockedReceipt(input, reason, startedAt);
    const globalRecovery = options.inspectRecovery?.();
    if (globalRecovery?.reviewRequired === true) {
      return blockedReceipt(input, globalRecovery.reason || 'trade-recovery-review-required', startedAt);
    }
    const journalRecovery = options.journal?.inspectRecovery?.({ runId: input.runId });
    if (journalRecovery?.canSupersede === false) {
      return blockedReceipt(input, journalRecovery.reason || 'listing-journal-recovery-required', startedAt);
    }
    const authorization = typeof store.beginAuthorization === 'function'
      ? store.beginAuthorization(input.job.id, input.runId)
      : { begun: store.consumeAuthorization(input.job.id, input.runId)?.consumed === true };
    if (authorization.begun !== true) {
      return blockedReceipt(input, authorization.reason || 'schedule-authorization-missing-or-expired', startedAt);
    }
    let authorizationBegun = true;
    let yielded = false;
    const completeAuthorization = () => {
      if (!authorizationBegun) return;
      store.completeAuthorization?.(input.job.id, input.runId);
      authorizationBegun = false;
    };
    const availability = options.circuitBreaker?.availability?.();
    if (availability && availability.allowed !== true) {
      completeAuthorization();
      return blockedReceipt(input, 'trade-circuit-open', startedAt);
    }
    const operationId = `scheduled-listing:${input.runId}`;
    const operation = operationCoordinator.acquire({
      id: operationId,
      type: 'trade-listing',
      ownerId: options.ownerId || '',
      label: input.job.name,
    });
    if (!operation.acquired) {
      completeAuthorization();
      return blockedReceipt(input, operation.reason || 'operation-unavailable', startedAt);
    }

    options.onRunningChange?.(true, input);
    try {
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
      if (!continuation) {
        options.journal?.begin?.({
          runId: input.runId,
          jobId: job.id,
          source: job.policy.sources[0],
          requested: maxListings,
          at: startedAt,
        });
      } else {
        options.journal?.checkpoint?.(input.runId, {
          phase: 'slice-resumed',
          status: 'active',
          offset: continuation.succeeded + continuation.failed + continuation.skipped,
        });
      }
      const pacingContext = {
        policy: job.policy,
        jobId: job.id,
        runId: input.runId,
        ownerId: options.ownerId || '',
        shouldStop: () => options.shouldStop?.() === true,
      };
      const adapter = options.getTradeAdapter({ pacingContext });
      const completedBefore = Math.max(0, Number(continuation?.succeeded || 0)
        + Number(continuation?.failed || 0) + Number(continuation?.skipped || 0));
      const remainingListings = Math.max(1, maxListings - completedBefore);
      const prepared = await listingPreparation.prepare(job, {
        maxListings: remainingListings,
        tradeAdapter: adapter,
        pacingContext,
        deferWhenWaiting: true,
      });
      options.journal?.checkpoint?.(input.runId, {
        phase: 'prepare-finished',
        status: prepared?.ready ? 'completed' : 'blocked',
        reason: prepared?.blockers?.[0]?.reason,
        items: prepared?.plan?.entries || [],
        offset: completedBefore,
      });
      if (prepared?.deferredAt) {
        yielded = true;
        const receipt = createTradeRunReceipt({
          runId: input.runId,
          jobId: job.id,
          jobType: job.type,
          scheduledFor: input.scheduledFor,
          startedAt,
          finishedAt: Number(now()),
          resumeAt: prepared.deferredAt,
          status: 'deferred',
          reason: 'trade-action-pacing',
          requested: maxListings,
          succeeded: completedBefore,
          continuation: {
            ...(continuation || {}),
            runId: input.runId,
            scheduledFor: input.scheduledFor,
            startedAt,
            resumeAt: prepared.deferredAt,
            yieldedAt: Number(now()),
            sliceCount: Math.max(1, Number(continuation?.sliceCount || 0) + 1),
            requested: maxListings,
            succeeded: completedBefore,
            failed: 0,
            skipped: 0,
            receipts: continuation?.receipts || [],
          },
        });
        if (typeof input.persistContinuation === 'function'
          && input.persistContinuation(receipt) !== true) {
          receipt.status = 'blocked';
          receipt.reason = 'trade-continuation-persistence-rejected';
          receipt.resumeAt = null;
          receipt.continuation = null;
          yielded = false;
        }
        options.journal?.finish?.(input.runId, {
          phase: 'slice-deferred', status: 'deferred', reason: receipt.reason, retryAt: receipt.resumeAt,
        });
        options.onReceipt?.(receipt, { job, prepared, input });
        return receipt;
      }
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
      const coordinator = createTradeChunkCoordinator({
        now,
        onCheckpoint: (checkpoint) => options.journal?.checkpoint?.(input.runId, checkpoint),
      });
      const receipt = await coordinator.run({
        runId: input.runId,
        jobId: prepared.job.id,
        jobType: prepared.job.type,
        scheduledFor: input.scheduledFor,
        startedAt,
        requested: maxListings,
        continuation,
        heartbeat: () => input.heartbeat?.() === true,
        shouldStop: () => options.shouldStop?.() === true,
        executeChunk: async ({ offset, quantity }) => {
          const relativeOffset = Math.max(0, offset - completedBefore);
          const chunkPrepared = {
            ...prepared,
            plan: { ...prepared.plan, entries: prepared.plan.entries.slice(relativeOffset, relativeOffset + quantity) },
          };
          const transaction = transactionFactory({
            tradeAdapter: options.getTradeAdapter({
              pacingContext: {
                ...pacingContext,
                policy: prepared.job.policy,
              },
            }),
            circuitBreaker: options.circuitBreaker,
            sleep,
            onCheckpoint: (checkpoint) => options.journal?.checkpoint?.(input.runId, checkpoint),
          });
          return transaction.run({
            job: prepared.job,
            prepared: chunkPrepared,
            runId: input.runId,
            confirmationToken: prepared.confirmation.token,
            approved: true,
            scheduledFor: input.scheduledFor,
            itemIndexOffset: offset,
            beforeMutation: () => input.heartbeat?.() === true,
            shouldStop: () => options.shouldStop?.() === true,
            deferWhenWaiting: true,
          });
        },
      });
      if (receipt.status === 'deferred' && typeof input.persistContinuation === 'function'
        && input.persistContinuation(receipt) !== true) {
        receipt.status = 'blocked';
        receipt.reason = 'trade-continuation-persistence-rejected';
        receipt.resumeAt = null;
        receipt.continuation = null;
      }
      yielded = receipt.status === 'deferred';
      options.journal?.finish?.(input.runId, {
        phase: receipt.status === 'deferred' ? 'slice-deferred' : 'receipt-recorded',
        status: receipt.status,
        reason: receipt.reason,
        retryAt: receipt.resumeAt,
      });
      options.onReceipt?.(receipt, { job, prepared, clubValidation, input });
      return receipt;
    } catch (error) {
      options.journal?.finish?.(input.runId, {
        phase: 'executor-error', status: 'error', reason: error?.message || String(error),
      });
      throw error;
    } finally {
      if (authorizationBegun && !yielded) {
        completeAuthorization();
      }
      operationCoordinator.release(operationId);
      options.onRunningChange?.(false, input);
    }
  }

  return Object.freeze({ execute });
}
