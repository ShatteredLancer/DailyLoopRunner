import { createTradeRunReceipt } from './contracts.js';
import { createBulkRelistTransaction } from './bulk-relist-transaction.js';

export function createGuardedManualBulkRelistExecutor(options = {}) {
  const operationCoordinator = options.operationCoordinator;
  const lease = options.lease;
  const journal = options.journal;
  if (!operationCoordinator?.acquire || !operationCoordinator?.release) throw new TypeError('Operation Coordinator is required');
  if (!lease?.acquire || !lease?.heartbeat || !lease?.release) throw new TypeError('Trade Run Lease is required');
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const createRunId = typeof options.createRunId === 'function'
    ? options.createRunId
    : () => `manual-bulk-relist-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const transactionFactory = typeof options.transactionFactory === 'function'
    ? options.transactionFactory
    : (transactionOptions) => createBulkRelistTransaction(transactionOptions);

  function blockedReceipt(runId, reason, startedAt, requested = 0) {
    return createTradeRunReceipt({
      runId,
      jobId: 'manual-bulk-relist',
      jobType: 'bulk-relist',
      scheduledFor: startedAt,
      startedAt,
      finishedAt: Number(now()),
      status: 'blocked',
      reason,
      requested,
    });
  }

  async function execute(input = {}) {
    const startedAt = Number(now());
    const runId = createRunId();
    const preview = input.preview || null;
    const requested = Number(preview?.snapshot?.unsoldCount || 0);
    if (input.approved !== true) throw new Error('Manual Re-list All requires explicit approval');
    if (preview?.ready !== true || !preview.confirmation) {
      return blockedReceipt(runId, 'bulk-relist-preview-not-ready', startedAt, requested);
    }
    const scheduler = options.getSchedulerState?.() || {};
    if (scheduler.paused !== true || scheduler.liveExecutionEnabled === true) {
      return blockedReceipt(runId, 'manual-bulk-relist-scheduler-must-be-locked', startedAt, requested);
    }
    const circuit = options.circuitBreaker?.availability?.();
    if (circuit && circuit.allowed !== true) {
      return blockedReceipt(runId, 'trade-circuit-open', startedAt, requested);
    }
    const journalRecovery = journal?.inspectRecovery?.();
    if (journalRecovery?.canSupersede === false) {
      return blockedReceipt(runId, journalRecovery.reason || 'bulk-relist-journal-recovery-required', startedAt, requested);
    }
    let globalRecovery = options.inspectRecovery?.();
    if (globalRecovery?.reviewRequired === true) {
      return blockedReceipt(runId, globalRecovery.reason || 'trade-recovery-review-required', startedAt, requested);
    }
    const operationId = `manual-bulk-relist:${runId}`;
    const operation = operationCoordinator.acquire({
      id: operationId,
      type: 'trade-listing',
      ownerId: options.ownerId || '',
      label: 'Manual Re-list All',
    });
    if (!operation.acquired) return blockedReceipt(runId, operation.reason || 'operation-unavailable', startedAt, requested);

    const acquired = lease.acquire({ runId, jobId: 'manual-bulk-relist' });
    if (!acquired.acquired || acquired.recoveryRequired) {
      if (acquired.acquired) lease.release(runId);
      operationCoordinator.release(operationId);
      return blockedReceipt(
        runId,
        acquired.recoveryRequired ? 'expired-lease-reconciliation-required' : acquired.reason || 'lease-unavailable',
        startedAt,
        requested,
      );
    }
    globalRecovery = options.inspectRecovery?.();
    if (globalRecovery?.reviewRequired === true) {
      lease.release(runId);
      operationCoordinator.release(operationId);
      return blockedReceipt(runId, globalRecovery.reason || 'trade-recovery-review-required', startedAt, requested);
    }

    let runningNotified = false;
    try {
      journal?.begin?.({
        runId,
        jobId: 'manual-bulk-relist',
        before: preview.snapshot,
        at: startedAt,
      });
      options.onRunningChange?.(true, { runId, preview });
      runningNotified = true;
      const pacingContext = {
        policy: options.policy || { listingDelaySeconds: [3, 8] },
        jobId: 'manual-bulk-relist',
        runId,
        ownerId: options.ownerId || '',
        shouldStop: () => false,
      };
      const transaction = transactionFactory({
        getTradeAdapter: options.getTradeAdapter,
        circuitBreaker: options.circuitBreaker,
        now,
        onCheckpoint: (checkpoint) => journal?.checkpoint?.(runId, checkpoint),
      });
      const receipt = await transaction.run({
        runId,
        jobId: 'manual-bulk-relist',
        scheduledFor: startedAt,
        startedAt,
        preview,
        confirmation: preview.confirmation,
        confirmationToken: input.confirmationToken,
        pacingContext,
        beforeMutation: () => lease.heartbeat(runId) === true,
      });
      journal?.finish?.(runId, {
        phase: 'receipt-recorded',
        status: receipt.status,
        reason: receipt.reason,
      });
      options.onReceipt?.(receipt, { preview, input });
      return receipt;
    } catch (error) {
      journal?.finish?.(runId, {
        phase: 'executor-error', status: 'error', reason: error?.message || String(error),
      });
      throw error;
    } finally {
      lease.release(runId);
      operationCoordinator.release(operationId);
      if (runningNotified) options.onRunningChange?.(false, { runId, preview });
    }
  }

  return Object.freeze({ execute });
}
