import { createTradeRunReceipt } from './contracts.js';
import { createBuyTransaction } from './buy-transaction.js';
import { filterBuyCatalogForDestination } from './buy-destination.js';
import { sanitizeTradeBuyReceipt } from './buy-diagnostics.js';
import { inspectScheduledBuyValidationJob } from './scheduled-buy-validation.js';
import { createTradeChunkCoordinator } from './chunk-coordinator.js';
import { finalizeChunkedBuyReceipt } from './buy-chunk-receipt.js';

export function createGuardedScheduledBuyExecutor(options = {}) {
  const store = options.store;
  const operationCoordinator = options.operationCoordinator;
  const buyPreview = options.buyPreview;
  const journal = options.journal;
  if (typeof store?.read !== 'function' || typeof store?.beginAuthorization !== 'function') throw new TypeError('Trade Job Store authorization is required');
  if (!operationCoordinator?.acquire || !operationCoordinator?.release) throw new TypeError('Operation Coordinator is required');
  if (typeof buyPreview?.preview !== 'function') throw new TypeError('Buy Preview is required');
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sleep = typeof options.sleep === 'function' ? options.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const transactionFactory = typeof options.transactionFactory === 'function'
    ? options.transactionFactory
    : (transactionOptions) => createBuyTransaction(transactionOptions);

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
    const minimumRetainedCoins = store.read().safety?.minimumRetainedCoins;
    let authorizationBegun = false;
    let yielded = false;
    const finish = (receipt, context = {}, phase = 'receipt-recorded') => {
      const safeReceipt = sanitizeTradeBuyReceipt(receipt);
      if (authorizationBegun && safeReceipt.status !== 'deferred') {
        const completed = store.completeAuthorization?.(input.job.id, input.runId);
        if (completed && completed.completed !== true) {
          safeReceipt.status = 'blocked';
          safeReceipt.reason = completed.reason || 'schedule-authorization-completion-failed';
        }
        authorizationBegun = false;
      }
      journal?.finish?.(input.runId, { phase, status: safeReceipt.status, reason: safeReceipt.reason });
      options.onReceipt?.(safeReceipt, { job: context.job || input.job, input, ...context });
      return safeReceipt;
    };
    if (options.validationGateEnabled !== true) return finish(blockedReceipt(input, 'scheduled-buy-validation-gate-disabled', startedAt));
    if (input.context?.liveExecutionEnabled !== true) return finish(blockedReceipt(input, 'live-execution-disabled', startedAt));
    const gate = inspectScheduledBuyValidationJob(input.job, { minimumRetainedCoins, now: startedAt });
    if (!gate.ready) return finish(blockedReceipt(input, gate.reason, startedAt), { gate });
    const globalRecovery = options.inspectRecovery?.();
    if (globalRecovery?.reviewRequired === true) {
      return finish(blockedReceipt(
        input,
        globalRecovery.reason || 'trade-recovery-review-required',
        startedAt,
      ), { gate });
    }
    const journalRecovery = journal?.inspectRecovery?.({ runId: input.runId });
    if (journalRecovery?.canSupersede === false) {
      return finish(blockedReceipt(input, journalRecovery.reason || 'buy-journal-recovery-required', startedAt), { gate });
    }
    const authorization = typeof store.beginAuthorization === 'function'
      ? store.beginAuthorization(input.job.id, input.runId)
      : { begun: store.consumeAuthorization?.(input.job.id, input.runId)?.consumed === true };
    if (authorization.begun !== true) {
      return finish(blockedReceipt(input, authorization.reason || 'schedule-authorization-missing-or-expired', startedAt), { gate });
    }
    authorizationBegun = true;
    const circuit = options.circuitBreaker?.availability?.();
    if (circuit && circuit.allowed !== true) return finish(blockedReceipt(input, 'trade-circuit-open', startedAt), { gate });
    let adapter = options.getTradeAdapter();
    const capabilities = adapter.inspectCapabilities();
    if (!Number.isFinite(Number(capabilities.coins))) {
      return finish(blockedReceipt(input, 'scheduled-buy-coins-unavailable', startedAt), { gate });
    }
    if (Number(capabilities.coins) - Number(gate.maxSpend) < Number(gate.minimumRetainedCoins)) {
      return finish(blockedReceipt(input, 'scheduled-buy-minimum-coins-not-met', startedAt), { gate });
    }

    const operationId = `scheduled-buy:${input.runId}`;
    const operation = operationCoordinator.acquire({
      id: operationId,
      type: 'trade-buy',
      ownerId: options.ownerId || '',
      label: gate.job.name,
    });
    if (!operation.acquired) return finish(blockedReceipt(input, operation.reason || 'operation-unavailable', startedAt), { gate });

    let runningNotified = false;
    try {
      if (!continuation) {
        journal?.begin?.({
          runId: input.runId,
          jobId: gate.job.id,
          expectedDestination: 'auto',
          requested: gate.job.policy.quantity,
          at: startedAt,
        });
      } else {
        journal?.checkpoint?.(input.runId, {
          phase: 'slice-resumed',
          status: 'active',
          offset: continuation.succeeded + continuation.failed + continuation.skipped,
        });
      }
      options.onRunningChange?.(true, { ...input, job: gate.job });
      runningNotified = true;
      let preview;
      try {
        journal?.checkpoint?.(input.runId, { phase: 'preview-started' });
        preview = await buyPreview.preview(gate.job, { platform: input.platform || 'pc' });
        journal?.checkpoint?.(input.runId, {
          phase: 'preview-finished',
          status: preview?.plan?.ready ? 'completed' : 'blocked',
        });
      } catch (error) {
        return finish(blockedReceipt(input, 'buy-preview-failed', startedAt), { gate, preview: null, error }, 'preview-failed');
      }
      if (preview?.plan?.ready !== true || preview?.liveExecutionAllowed !== false) {
        return finish(blockedReceipt(input, 'buy-preview-not-ready', startedAt), { gate, preview }, 'preview-blocked');
      }

      journal?.checkpoint?.(input.runId, { phase: 'validation-destination-filter-started', destination: 'auto' });
      const destinationPlan = filterBuyCatalogForDestination({ lanes: preview.plan.lanes }, adapter, 'auto');
      journal?.checkpoint?.(input.runId, {
        phase: 'validation-destination-filter-finished',
        destination: 'auto',
        status: destinationPlan.reason ? 'blocked' : 'completed',
        reason: destinationPlan.reason,
      });
      if (destinationPlan.reason) {
        return finish(blockedReceipt(input, destinationPlan.reason, startedAt), { gate, preview }, 'validation-destination-blocked');
      }

      const coordinator = createTradeChunkCoordinator({
        now,
        onCheckpoint: (checkpoint) => journal?.checkpoint?.(input.runId, checkpoint),
      });
      let spent = Math.max(0, Number(continuation?.spent || 0));
      let cursor = continuation?.cursor || null;
      let purchasedByRating = { ...(continuation?.purchasedByRating || {}) };
      const deadlineAt = startedAt + Number(gate.job.policy.maxRuntimeMinutes) * 60_000;
      const receipt = await coordinator.run({
        runId: input.runId,
        jobId: gate.job.id,
        jobType: gate.job.type,
        scheduledFor: input.scheduledFor,
        startedAt,
        deadlineAt,
        deadlineReason: 'runtime-limit',
        requested: gate.job.policy.quantity,
        continuation,
        heartbeat: () => input.heartbeat?.() === true,
        shouldStop: () => options.shouldStop?.() === true,
        executeChunk: async ({ offset, quantity }) => {
          const remainingRuntimeMinutes = Math.max(1 / 60_000, (deadlineAt - Number(now())) / 60_000);
          const chunkJob = {
            ...gate.job,
            policy: {
              ...gate.job.policy,
              quantity,
              totalBudget: Math.max(1, Number(gate.job.policy.totalBudget) - spent),
              maxRuntimeMinutes: Math.min(Number(gate.job.policy.maxRuntimeMinutes), remainingRuntimeMinutes),
            },
          };
          adapter = options.getTradeAdapter({
            pacingContext: {
              policy: chunkJob.policy,
              jobId: gate.job.id,
              runId: input.runId,
              ownerId: options.ownerId || '',
              shouldStop: () => options.shouldStop?.() === true,
            },
          });
          const transaction = transactionFactory({
            tradeAdapter: adapter,
            playerCatalogProvider: options.playerCatalogProvider,
            circuitBreaker: options.circuitBreaker,
            sleep,
            onCheckpoint: (checkpoint) => journal?.checkpoint?.(input.runId, checkpoint),
          });
          const chunkReceipt = await transaction.run({
            job: chunkJob,
            runId: input.runId,
            scheduledFor: input.scheduledFor,
            platform: input.platform || 'pc',
            expectedDestination: 'auto',
            minimumRetainedCoins: gate.minimumRetainedCoins,
            itemIndexOffset: offset,
            cursor,
            purchasedByRating,
            maxBuyAttempts: quantity,
            beforeBuy: () => input.heartbeat?.() === true,
            shouldStop: () => options.shouldStop?.() === true,
            deferWhenWaiting: true,
          });
          const summary = (chunkReceipt.receipts || []).find((entry) => entry.status === 'run-summary') || {};
          spent += Number(summary.spent || 0);
          cursor = summary.cursor || cursor;
          purchasedByRating = { ...purchasedByRating, ...(summary.purchasedByRating || {}) };
          return chunkReceipt;
        },
      });
      const finalized = finalizeChunkedBuyReceipt(receipt);
      if (finalized.status === 'deferred') {
        const summary = (finalized.receipts || []).find((entry) => entry.status === 'run-summary') || {};
        finalized.continuation = {
          ...(finalized.continuation || {}),
          spent: Number(summary.spent || spent),
          searches: Number(summary.searches || 0),
          buyAttempts: Number(summary.buyAttempts || 0),
          cursor: summary.cursor || cursor,
          purchasedByRating: { ...(summary.purchasedByRating || purchasedByRating) },
        };
        if (typeof input.persistContinuation === 'function'
          && input.persistContinuation(finalized) !== true) {
          finalized.status = 'blocked';
          finalized.reason = 'trade-continuation-persistence-rejected';
          finalized.resumeAt = null;
          finalized.continuation = null;
        }
      }
      yielded = finalized.status === 'deferred';
      return finish(
        finalized,
        { gate, preview },
        finalized.status === 'deferred' ? 'slice-deferred' : 'receipt-recorded',
      );
    } catch (error) {
      journal?.finish?.(input.runId, {
        phase: 'executor-error',
        status: 'error',
        reason: error?.message || String(error),
      });
      throw error;
    } finally {
      if (authorizationBegun && !yielded) {
        store.completeAuthorization?.(input.job.id, input.runId);
        authorizationBegun = false;
      }
      operationCoordinator.release(operationId);
      if (runningNotified) options.onRunningChange?.(false, { ...input, job: gate.job });
    }
  }

  return Object.freeze({ execute });
}
