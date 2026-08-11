import { createTradeRunReceipt } from './contracts.js';
import { createBuyTransaction } from './buy-transaction.js';
import {
  filterBuyCatalogForDestination,
  normalizeExpectedBuyDestination,
} from './buy-destination.js';
import { inspectManualBuyValidationJob } from './manual-buy-validation.js';
import { manualBuyValidationConfirmation } from './manual-buy-validation.js';
import { inspectTradeRequestCapacity, tradeBuyRequestReserve } from './request-budget.js';

export function createGuardedManualBuyExecutor(options = {}) {
  const operationCoordinator = options.operationCoordinator;
  const lease = options.lease;
  const buyPreview = options.buyPreview;
  const journal = options.journal;
  if (!operationCoordinator?.acquire || !operationCoordinator?.release) throw new TypeError('Operation Coordinator is required');
  if (!lease?.acquire || !lease?.heartbeat || !lease?.release) throw new TypeError('Trade Run Lease is required');
  if (typeof buyPreview?.preview !== 'function') throw new TypeError('Buy Preview is required');
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
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
      return blockedReceipt(gate.job, runId, journalRecovery.reason || 'buy-journal-recovery-required', startedAt);
    }
    const requestReserve = tradeBuyRequestReserve(gate.job);
    if (typeof options.requestBudget?.inspect === 'function') {
      const requestCapacity = inspectTradeRequestCapacity(options.requestBudget.inspect(), requestReserve);
      if (!requestCapacity.ready) return blockedReceipt(gate.job, runId, requestCapacity.reason, startedAt);
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
    let requestReservation = null;
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
        journal?.checkpoint?.(runId, { phase: 'preview-started' });
        preview = await buyPreview.preview(gate.job, { platform: input.platform || 'pc' });
        journal?.checkpoint?.(runId, { phase: 'preview-finished', status: preview?.plan?.ready ? 'completed' : 'blocked' });
      } catch (error) {
        const receipt = blockedReceipt(gate.job, runId, 'buy-preview-failed', startedAt);
        return finishReceipt(receipt, { preview: null, error }, 'preview-failed');
      }
      if (preview?.plan?.ready !== true || preview?.liveExecutionAllowed !== false) {
        const receipt = blockedReceipt(gate.job, runId, 'buy-preview-not-ready', startedAt);
        return finishReceipt(receipt, { preview }, 'preview-blocked');
      }

      let adapter = options.getTradeAdapter();
      journal?.checkpoint?.(runId, { phase: 'validation-destination-filter-started', destination: expectedDestination });
      const destinationPlan = filterBuyCatalogForDestination({ lanes: preview.plan.lanes }, adapter, expectedDestination);
      journal?.checkpoint?.(runId, {
        phase: 'validation-destination-filter-finished',
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

      if (typeof options.requestBudget?.reserve === 'function') {
        requestReservation = await options.requestBudget.reserve(requestReserve);
        if (!requestReservation.ready) {
          const receipt = blockedReceipt(gate.job, runId, 'trade-request-budget-insufficient', startedAt);
          return finishReceipt(receipt, { preview }, 'request-budget-blocked');
        }
        adapter = options.getTradeAdapter({ requestBudget: requestReservation });
      }

      const transaction = transactionFactory({
        tradeAdapter: adapter,
        playerCatalogProvider: options.playerCatalogProvider,
        circuitBreaker: options.circuitBreaker,
        sleep,
        onCheckpoint: (checkpoint) => journal?.checkpoint?.(runId, checkpoint),
      });
      const receipt = await transaction.run({
        job: gate.job,
        runId,
        scheduledFor: startedAt,
        platform: input.platform || 'pc',
        expectedDestination,
        maxBuyAttempts: Number(gate.job.policy.quantity),
        beforeBuy: () => {
          const renewed = lease.heartbeat(runId) === true;
          journal?.checkpoint?.(runId, {
            phase: renewed ? 'buy-lease-heartbeat-completed' : 'buy-lease-heartbeat-failed',
            status: renewed ? 'completed' : 'blocked',
          });
          return renewed;
        },
        shouldStop: () => options.shouldStop?.() === true,
      });
      return finishReceipt(receipt, { preview });
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
      try { await requestReservation?.release?.(); } catch { }
      if (runningNotified) options.onRunningChange?.(false, { ...input, job: gate.job, runId });
    }
  }

  return Object.freeze({ execute });
}
