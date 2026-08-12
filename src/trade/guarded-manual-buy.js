import { createTradeRunReceipt } from './contracts.js';
import { createBuyTransaction } from './buy-transaction.js';
import { reconcileResolvedTradeBuyJournal } from './buy-journal.js';
import {
  filterBuyCatalogForDestination,
  normalizeExpectedBuyDestination,
} from './buy-destination.js';
import { inspectManualBuyValidationJob } from './manual-buy-validation.js';
import { manualBuyValidationConfirmation } from './manual-buy-validation.js';
import { tradeBuyRequestReserve } from './request-budget.js';
import { createTradeChunkCoordinator } from './chunk-coordinator.js';
import { finalizeChunkedBuyReceipt } from './buy-chunk-receipt.js';

export function createGuardedManualBuyExecutor(options = {}) {
  const operationCoordinator = options.operationCoordinator;
  const lease = options.lease;
  const buyPreview = options.buyPreview;
  const journal = options.journal;
  if (!operationCoordinator?.acquire || !operationCoordinator?.release) throw new TypeError('Operation Coordinator is required');
  if (!lease?.acquire || !lease?.heartbeat || !lease?.release) throw new TypeError('Trade Run Lease is required');
  if (typeof buyPreview?.preview !== 'function') throw new TypeError('Buy Preview is required');
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  if (typeof options.requestBudget?.reserve !== 'function') throw new TypeError('Trade request budget is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sleep = typeof options.sleep === 'function' ? options.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const createRunId = typeof options.createRunId === 'function'
    ? options.createRunId
    : () => `manual-buy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const transactionFactory = typeof options.transactionFactory === 'function'
    ? options.transactionFactory
    : (transactionOptions) => createBuyTransaction(transactionOptions);

  function blockedReceipt(job, runId, reason, startedAt = Number(now())) {
    return createTradeRunReceipt({
      runId,
      jobId: job?.id,
      jobType: job?.type,
      scheduledFor: startedAt,
      startedAt,
      finishedAt: Number(now()),
      status: 'blocked',
      reason,
      requested: 0,
    });
  }

  async function execute(input = {}) {
    const startedAt = Number(now());
    const runId = createRunId();
    const reportProgress = typeof input.onProgress === 'function' ? input.onProgress : null;
    const recordCheckpoint = (checkpoint) => {
      journal?.checkpoint?.(runId, checkpoint);
      try { reportProgress?.(checkpoint); } catch { }
    };
    const gate = inspectManualBuyValidationJob(input.job, { now: startedAt });
    if (!gate.ready) return blockedReceipt(input.job, runId, gate.reason, startedAt);
    const expectedDestination = normalizeExpectedBuyDestination(input.expectedDestination || 'auto');
    if (!expectedDestination) return blockedReceipt(gate.job, runId, 'buy-validation-destination-invalid', startedAt);
    const requiredText = manualBuyValidationConfirmation(gate.maxPrice, expectedDestination, gate.job.policy.quantity);
    if (String(input.confirmationText || '') !== requiredText) {
      throw new Error(`Confirmation must exactly match ${requiredText}`);
    }
    const scheduler = options.getSchedulerState?.() || {};
    if (scheduler.paused !== true || scheduler.liveExecutionEnabled === true) {
      return blockedReceipt(gate.job, runId, 'manual-buy-scheduler-must-be-locked', startedAt);
    }
    const circuit = options.circuitBreaker?.availability?.();
    if (circuit && circuit.allowed !== true) return blockedReceipt(gate.job, runId, 'trade-circuit-open', startedAt);
    const journalRecovery = journal?.inspectRecovery?.();
    if (journalRecovery?.canSupersede === false) {
      const reconciliation = reconcileResolvedTradeBuyJournal({
        journal,
        adapter: options.getTradeAdapter(),
        now,
      });
      if (reconciliation.status === 'reconciled') {
        return blockedReceipt(gate.job, runId, reconciliation.reason, startedAt);
      }
      return blockedReceipt(
        gate.job,
        runId,
        reconciliation.reason || journalRecovery.reason || 'buy-journal-recovery-required',
        startedAt,
      );
    }
    const operationId = `manual-buy:${runId}`;
    const operation = operationCoordinator.acquire({
      id: operationId,
      type: 'trade-buy',
      ownerId: options.ownerId || '',
      label: gate.job.name,
    });
    if (!operation.acquired) return blockedReceipt(gate.job, runId, operation.reason || 'operation-unavailable', startedAt);

    const acquired = lease.acquire({ runId, jobId: gate.job.id });
    if (!acquired.acquired || acquired.recoveryRequired) {
      if (acquired.acquired) lease.release(runId);
      operationCoordinator.release(operationId);
      return blockedReceipt(
        gate.job,
        runId,
        acquired.recoveryRequired ? 'expired-lease-reconciliation-required' : acquired.reason || 'lease-unavailable',
        startedAt,
      );
    }

    const finishReceipt = (receipt, context = {}, phase = 'receipt-recorded') => {
      journal?.finish?.(runId, {
        phase,
        status: receipt.status,
        reason: receipt.reason,
      });
      options.onReceipt?.(receipt, { job: gate.job, input, ...context });
      return receipt;
    };
    let runningNotified = false;
    try {
      journal?.begin?.({
        runId,
        jobId: gate.job.id,
        expectedDestination,
        requested: gate.job.policy.quantity,
        at: startedAt,
      });
      options.onRunningChange?.(true, { ...input, job: gate.job, runId });
      runningNotified = true;
      let preview;
      try {
        recordCheckpoint({ phase: 'preview-started', at: Number(now()) });
        preview = await buyPreview.preview(gate.job, { platform: input.platform || 'pc' });
        recordCheckpoint({
          phase: 'preview-finished',
          at: Number(now()),
          status: preview?.plan?.ready ? 'completed' : 'blocked',
        });
      } catch (error) {
        const receipt = blockedReceipt(gate.job, runId, 'buy-preview-failed', startedAt);
        return finishReceipt(receipt, { preview: null, error }, 'preview-failed');
      }
      if (preview?.plan?.ready !== true || preview?.liveExecutionAllowed !== false) {
        const receipt = blockedReceipt(gate.job, runId, 'buy-preview-not-ready', startedAt);
        return finishReceipt(receipt, { preview }, 'preview-blocked');
      }

      let adapter = options.getTradeAdapter();
      recordCheckpoint({
        phase: 'validation-destination-filter-started',
        at: Number(now()),
        destination: expectedDestination,
      });
      const destinationPlan = filterBuyCatalogForDestination({ lanes: preview.plan.lanes }, adapter, expectedDestination);
      recordCheckpoint({
        phase: 'validation-destination-filter-finished',
        at: Number(now()),
        destination: expectedDestination,
        status: destinationPlan.reason ? 'blocked' : 'completed',
        reason: destinationPlan.reason,
      });
      preview = {
        ...preview,
        validationDestination: {
          expected: expectedDestination,
          definitionsBefore: destinationPlan.before,
          matchingDefinitions: destinationPlan.matched,
          ready: !destinationPlan.reason,
          reason: destinationPlan.reason || null,
        },
      };
      if (destinationPlan.reason) {
        const receipt = blockedReceipt(gate.job, runId, destinationPlan.reason, startedAt);
        return finishReceipt(receipt, { preview }, 'validation-destination-blocked');
      }

      const coordinator = createTradeChunkCoordinator({
        requestBudget: options.requestBudget,
        now,
        sleep,
        onCheckpoint: recordCheckpoint,
      });
      let spent = 0;
      let cursor = null;
      let purchasedByRating = {};
      const deadlineAt = startedAt + Number(gate.job.policy.maxRuntimeMinutes) * 60_000;
      const receipt = await coordinator.run({
        runId,
        jobId: gate.job.id,
        jobType: gate.job.type,
        scheduledFor: startedAt,
        startedAt,
        deadlineAt,
        deadlineReason: 'runtime-limit',
        requested: gate.job.policy.quantity,
        requestReserve: (quantity) => tradeBuyRequestReserve({
          ...gate.job,
          policy: { ...gate.job.policy, quantity },
        }),
        heartbeat: () => lease.heartbeat(runId) === true,
        shouldStop: () => options.shouldStop?.() === true,
        executeChunk: async ({ offset, quantity, reservation }) => {
          adapter = options.getTradeAdapter({ requestBudget: reservation });
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
          const transaction = transactionFactory({
            tradeAdapter: adapter,
            playerCatalogProvider: options.playerCatalogProvider,
            circuitBreaker: options.circuitBreaker,
            sleep,
            onCheckpoint: recordCheckpoint,
          });
          const chunkReceipt = await transaction.run({
            job: chunkJob,
            runId,
            scheduledFor: startedAt,
            platform: input.platform || 'pc',
            expectedDestination,
            itemIndexOffset: offset,
            cursor,
            purchasedByRating,
            maxBuyAttempts: quantity,
            beforeBuy: () => {
              const renewed = lease.heartbeat(runId) === true;
              recordCheckpoint({
                phase: renewed ? 'buy-lease-heartbeat-completed' : 'buy-lease-heartbeat-failed',
                at: Number(now()),
                status: renewed ? 'completed' : 'blocked',
              });
              return renewed;
            },
            shouldStop: () => options.shouldStop?.() === true,
          });
          const summary = (chunkReceipt.receipts || []).find((entry) => entry.status === 'run-summary') || {};
          spent += Number(summary.spent || 0);
          cursor = summary.cursor || cursor;
          purchasedByRating = { ...purchasedByRating, ...(summary.purchasedByRating || {}) };
          return chunkReceipt;
        },
      });
      return finishReceipt(finalizeChunkedBuyReceipt(receipt), { preview });
    } catch (error) {
      journal?.finish?.(runId, {
        phase: 'executor-error',
        status: 'error',
        reason: error?.message || String(error),
      });
      throw error;
    } finally {
      lease.release(runId);
      operationCoordinator.release(operationId);
      if (runningNotified) options.onRunningChange?.(false, { ...input, job: gate.job, runId });
    }
  }

  return Object.freeze({ execute });
}
