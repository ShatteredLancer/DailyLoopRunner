import { createTradeRunReceipt } from './contracts.js';
import { createBulkRelistTransaction } from './bulk-relist-transaction.js';

const SUPPORTED_SCHEDULES = new Set(['once', 'daily', 'interval', 'window']);

export function inspectGuardedScheduledBulkRelistJob(job = {}, options = {}) {
  let reason = null;
  if (options.validationGateEnabled !== true) reason = 'scheduled-bulk-relist-validation-gate-disabled';
  else if (job.type !== 'bulk-relist') reason = 'validation-gate-bulk-relist-only';
  else if (job.enabled !== true) reason = 'validation-gate-job-disabled';
  else if (job.armed !== true) reason = 'validation-gate-job-not-armed';
  else if (!SUPPORTED_SCHEDULES.has(job.schedule?.type)) reason = 'validation-gate-schedule-unsupported';
  else if (job.schedule?.type === 'interval' && Number(job.schedule.intervalSeconds) < 60) {
    reason = 'validation-gate-bulk-relist-interval-too-short';
  } else if (!['skip', 'grace-window'].includes(job.misfirePolicy?.type)) {
    reason = 'validation-gate-next-login-disabled';
  } else if (job.misfirePolicy?.type === 'grace-window' && Number(job.misfirePolicy.graceMinutes) > 15) {
    reason = 'validation-gate-grace-too-long';
  }
  return {
    ready: reason === null,
    reason,
    job,
    mode: 'bulk-relist',
    approval: reason === null ? {
      risk: 'high',
      action: 'bulk-relist',
      scope: 'all-unsold',
      itemLimit: 100,
      scheduleType: job.schedule.type,
    } : null,
  };
}

export function createGuardedScheduledBulkRelistExecutor(options = {}) {
  const store = options.store;
  const previewer = options.bulkRelistPreview;
  const operationCoordinator = options.operationCoordinator;
  const journal = options.journal;
  if (typeof store?.beginAuthorization !== 'function' || typeof store?.completeAuthorization !== 'function') {
    throw new TypeError('Trade Job Store authorization is required');
  }
  if (typeof previewer?.preview !== 'function') throw new TypeError('Bulk Re-list Preview is required');
  if (!operationCoordinator?.acquire || !operationCoordinator?.release) throw new TypeError('Operation Coordinator is required');
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const transactionFactory = typeof options.transactionFactory === 'function'
    ? options.transactionFactory
    : (transactionOptions) => createBulkRelistTransaction(transactionOptions);

  function blockedReceipt(input, reason, startedAt, requested = 0) {
    return createTradeRunReceipt({
      runId: input.runId,
      jobId: input.job?.id,
      jobType: 'bulk-relist',
      scheduledFor: input.scheduledFor,
      startedAt,
      finishedAt: Number(now()),
      status: 'blocked',
      reason,
      requested,
    });
  }

  async function execute(input = {}) {
    const continuation = input.continuation || null;
    const startedAt = Number(continuation?.startedAt ?? input.startedAt ?? now());
    const gate = inspectGuardedScheduledBulkRelistJob(input.job, {
      validationGateEnabled: options.validationGateEnabled === true,
    });
    if (input.context?.liveExecutionEnabled !== true) return blockedReceipt(input, 'live-execution-disabled', startedAt);
    if (!gate.ready) return blockedReceipt(input, gate.reason, startedAt);
    const globalRecovery = options.inspectRecovery?.();
    if (globalRecovery?.reviewRequired === true) {
      return blockedReceipt(input, globalRecovery.reason || 'trade-recovery-review-required', startedAt);
    }
    const journalRecovery = journal?.inspectRecovery?.({ runId: input.runId });
    if (journalRecovery?.canSupersede === false) {
      return blockedReceipt(input, journalRecovery.reason || 'bulk-relist-journal-recovery-required', startedAt);
    }
    const authorization = store.beginAuthorization(input.job.id, input.runId);
    if (authorization.begun !== true) {
      return blockedReceipt(input, authorization.reason || 'schedule-authorization-missing-or-expired', startedAt);
    }
    let authorizationBegun = true;
    let yielded = false;
    const completeAuthorization = () => {
      if (!authorizationBegun) return;
      store.completeAuthorization(input.job.id, input.runId);
      authorizationBegun = false;
    };
    const availability = options.circuitBreaker?.availability?.();
    if (availability && availability.allowed !== true) {
      completeAuthorization();
      return blockedReceipt(input, 'trade-circuit-open', startedAt);
    }
    const operationId = `scheduled-bulk-relist:${input.runId}`;
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
      const pacingContext = {
        policy: input.job.policy,
        jobId: input.job.id,
        runId: input.runId,
        ownerId: options.ownerId || '',
        shouldStop: () => options.shouldStop?.() === true,
      };
      const adapter = options.getTradeAdapter({ pacingContext });
      const preview = await previewer.preview({
        tradeAdapter: adapter,
        pacingContext,
        wait: false,
      });
      const requested = Number(preview?.snapshot?.unsoldCount || 0);
      if (preview.ready !== true || !preview.confirmation) {
        const blocker = preview.blockers?.[0];
        const retryAt = Number(preview.transferRefresh?.error?.retryAt || 0);
        if (['pacing-deferred', 'rate-limit'].includes(preview.transferRefresh?.error?.kind)
          && retryAt > Number(now())) {
          let receipt = createTradeRunReceipt({
            runId: input.runId,
            jobId: input.job.id,
            jobType: 'bulk-relist',
            scheduledFor: input.scheduledFor,
            startedAt,
            finishedAt: Number(now()),
            status: 'deferred',
            reason: preview.transferRefresh.error.kind === 'rate-limit'
              ? 'trade-rate-limit-cooldown'
              : 'trade-action-pacing',
            resumeAt: retryAt,
            requested,
            continuation: {
              runId: input.runId,
              scheduledFor: input.scheduledFor,
              startedAt,
              resumeAt: retryAt,
              yieldedAt: Number(now()),
              sliceCount: Math.max(1, Number(continuation?.sliceCount || 0) + 1),
              requested,
              succeeded: 0,
              failed: 0,
              skipped: 0,
              receipts: [],
            },
          });
          if (typeof input.persistContinuation !== 'function' || input.persistContinuation(receipt) !== true) {
            receipt = createTradeRunReceipt({
              ...receipt,
              status: 'blocked',
              reason: 'trade-continuation-persistence-rejected',
              resumeAt: null,
              continuation: null,
            });
          } else {
            yielded = true;
          }
          options.onReceipt?.(receipt, { job: input.job, preview, input });
          return receipt;
        }
        const receipt = blockedReceipt(input, blocker?.reason || 'scheduled-bulk-relist-preview-not-ready', startedAt, requested);
        options.onReceipt?.(receipt, { job: input.job, preview, input });
        return receipt;
      }
      journal?.begin?.({
        runId: input.runId,
        jobId: input.job.id,
        before: preview.snapshot,
        at: startedAt,
      });
      const transaction = transactionFactory({
        getTradeAdapter: options.getTradeAdapter,
        circuitBreaker: options.circuitBreaker,
        now,
        onCheckpoint: (checkpoint) => journal?.checkpoint?.(input.runId, checkpoint),
      });
      let receipt = await transaction.run({
        runId: input.runId,
        jobId: input.job.id,
        scheduledFor: input.scheduledFor,
        startedAt,
        preview,
        confirmation: preview.confirmation,
        confirmationToken: preview.confirmation.token,
        pacingContext,
        deferWhenWaiting: true,
        beforeMutation: () => input.heartbeat?.() === true,
      });
      if (receipt.status === 'deferred') {
        receipt = createTradeRunReceipt({
          ...receipt,
          continuation: {
            runId: input.runId,
            scheduledFor: input.scheduledFor,
            startedAt,
            resumeAt: receipt.resumeAt,
            yieldedAt: Number(now()),
            sliceCount: Math.max(1, Number(continuation?.sliceCount || 0) + 1),
            requested,
            succeeded: 0,
            failed: 0,
            skipped: 0,
            receipts: [],
          },
        });
        if (typeof input.persistContinuation !== 'function' || input.persistContinuation(receipt) !== true) {
          receipt = createTradeRunReceipt({
            ...receipt,
            status: 'blocked',
            reason: 'trade-continuation-persistence-rejected',
            resumeAt: null,
            continuation: null,
          });
        } else {
          yielded = true;
        }
      }
      journal?.finish?.(input.runId, {
        phase: receipt.status === 'deferred' ? 'slice-deferred' : 'receipt-recorded',
        status: receipt.status,
        reason: receipt.reason,
        retryAt: receipt.resumeAt,
      });
      options.onReceipt?.(receipt, { job: input.job, preview, input });
      return receipt;
    } catch (error) {
      journal?.finish?.(input.runId, {
        phase: 'executor-error', status: 'error', reason: error?.message || String(error),
      });
      throw error;
    } finally {
      if (authorizationBegun && !yielded) completeAuthorization();
      operationCoordinator.release(operationId);
      options.onRunningChange?.(false, input);
    }
  }

  return Object.freeze({ execute });
}
