import { createTradeRunReceipt } from './contracts.js';
import { classifyTradeError } from './error-policy.js';
import {
  bulkRelistSnapshotFingerprint,
  normalizeBulkRelistSnapshot,
  reconcileBulkRelistSnapshots,
  sameBulkRelistSnapshot,
} from './bulk-relist-snapshot.js';

function confirmationIsValid(confirmation, token, snapshot, now) {
  return confirmation?.action === 'bulk-relist'
    && String(confirmation.token || '') === String(token || '')
    && String(confirmation.fingerprint || '') === bulkRelistSnapshotFingerprint(snapshot)
    && Number(confirmation.expiresAt || 0) > Number(now);
}

export function createBulkRelistTransaction(options = {}) {
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();

  async function run(input = {}) {
    const startedAt = Number(input.startedAt ?? now());
    const adapter = input.tradeAdapter || options.getTradeAdapter({ pacingContext: input.pacingContext });
    const before = normalizeBulkRelistSnapshot(input.before || input.preview?.snapshot);
    const requested = before.unsoldCount;
    if (!confirmationIsValid(input.confirmation, input.confirmationToken, before, now())) {
      return createTradeRunReceipt({
        runId: input.runId,
        jobId: input.jobId,
        jobType: 'bulk-relist',
        scheduledFor: input.scheduledFor,
        startedAt,
        finishedAt: Number(now()),
        status: 'blocked',
        reason: 'bulk-relist-approval-mismatch',
        requested,
      });
    }
    if (before.truncated) {
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status: 'blocked', reason: 'bulk-relist-snapshot-truncated', requested,
      });
    }
    const itemIds = before.items.map((entry) => Number(entry.item.id)).filter((id) => id > 0);
    const transferPreflight = await adapter.refreshTransferItems({ wait: input.deferWhenWaiting !== true });
    if (transferPreflight.status !== 'completed') {
      if (input.deferWhenWaiting === true
        && ['pacing-deferred', 'rate-limit'].includes(transferPreflight.error?.kind)
        && Number(transferPreflight.error?.retryAt) > Number(now())) {
        return createTradeRunReceipt({
          runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
          startedAt, finishedAt: Number(now()), status: 'deferred',
          reason: transferPreflight.error.kind === 'rate-limit' ? 'trade-rate-limit-cooldown' : 'trade-action-pacing',
          resumeAt: transferPreflight.error.retryAt, requested,
        });
      }
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status: 'blocked',
        reason: `bulk-relist-transfer-preflight-${transferPreflight.status || 'unavailable'}`, requested,
      });
    }
    const refreshedBefore = normalizeBulkRelistSnapshot(adapter.inspectBulkRelistSnapshot({ itemIds }));
    if (!sameBulkRelistSnapshot(before, refreshedBefore)) {
      options.onCheckpoint?.({ phase: 'bulk-relist-identity-changed', status: 'blocked', reason: 'bulk-relist-snapshot-changed' });
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status: 'blocked', reason: 'bulk-relist-snapshot-changed', requested,
      });
    }
    if (requested === 0) {
      options.onCheckpoint?.({ phase: 'bulk-relist-empty', status: 'skipped-empty', mutationBoundaryCrossed: false });
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status: 'completed', reason: 'skipped-empty', requested: 0,
        skipped: 0, receipts: [],
      });
    }
    const circuit = options.circuitBreaker?.availability?.();
    if (circuit && circuit.allowed !== true) {
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status: 'blocked', reason: 'trade-circuit-open', requested,
      });
    }
    if (input.beforeMutation && await input.beforeMutation() !== true) {
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status: 'blocked', reason: 'bulk-relist-execution-lease-lost', requested,
      });
    }
    const requestPermit = await adapter.acquireRequestPermit('bulk-relist', {
      wait: input.deferWhenWaiting !== true,
      onWait: input.onPermitWait,
    });
    if (requestPermit.status !== 'acquired') {
      if (input.deferWhenWaiting === true
        && ['pacing-deferred', 'rate-limit'].includes(requestPermit.error?.kind)
        && Number(requestPermit.error?.retryAt) > Number(now())) {
        return createTradeRunReceipt({
          runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
          startedAt, finishedAt: Number(now()), status: 'deferred',
          reason: requestPermit.error.kind === 'rate-limit' ? 'trade-rate-limit-cooldown' : 'trade-action-pacing',
          resumeAt: requestPermit.error.retryAt, requested,
        });
      }
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status: 'blocked',
        reason: requestPermit.error?.kind === 'rate-limit' ? 'trade-rate-limit' : 'bulk-relist-request-permit-blocked',
        requested,
      });
    }
    if (input.beforeMutation && await input.beforeMutation() !== true) {
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status: 'blocked', reason: 'bulk-relist-execution-lease-lost', requested,
      });
    }
    options.onCheckpoint?.({
      phase: 'bulk-relist-request-started', status: 'mutation-pending',
      mutationBoundaryCrossed: true, items: before.items,
    });
    const result = await adapter.relistExpiredAuctions({ requestPermit: requestPermit.permit });
    options.onCheckpoint?.({
      phase: 'bulk-relist-response-received', status: result.status,
      reason: result.error?.kind, response: result.response, mutationBoundaryCrossed: true,
    });
    if (result.status !== 'accepted') {
      const classification = classifyTradeError(result.error || result.response || { status: result.status });
      const status = result.status === 'ambiguous' || classification.ambiguous ? 'ambiguous' : 'failed';
      if (classification.kind !== 'rate-limit') {
        options.circuitBreaker?.recordFailure?.(result.error || result.response || {}, {
          action: 'bulk-relist', endpoint: '/auctionhouse', jobId: input.jobId, runId: input.runId,
          response: result.response, capabilities: adapter.inspectCapabilities(),
        });
      }
      const terminalStatus = classification.opensCircuit || classification.kind === 'rate-limit' ? 'blocked' : status;
      const itemStatus = terminalStatus === 'ambiguous' ? 'unknown' : 'failed';
      options.onCheckpoint?.({
        phase: 'bulk-relist-request-finished', status: terminalStatus,
        reason: classification.opensCircuit ? `trade-${classification.kind}` : `bulk-relist-${result.status}`,
        mutationBoundaryCrossed: true,
        items: before.items.map((entry) => ({ ...entry, status: itemStatus })),
      });
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status: terminalStatus,
        reason: classification.kind === 'rate-limit'
          ? 'trade-rate-limit'
          : classification.opensCircuit ? `trade-${classification.kind}` : `bulk-relist-${result.status}`,
        requested,
        failed: requested,
        receipts: before.items.map((entry) => ({
          item: entry.item, status: itemStatus, reason: `bulk-relist-${result.status}`, mutationBoundaryCrossed: true,
        })),
      });
    }
    const refresh = await adapter.refreshTransferItems({ wait: true });
    const after = normalizeBulkRelistSnapshot(adapter.inspectBulkRelistSnapshot({ itemIds }));
    const reconciliation = reconcileBulkRelistSnapshots(before, after);
    const reconciliationItems = refresh.status === 'completed'
      ? reconciliation.items
      : reconciliation.items.map((entry) => ({ ...entry, status: 'unknown' }));
    const effectiveReconciliationStatus = refresh.status === 'completed' ? reconciliation.status : 'ambiguous';
    options.onCheckpoint?.({
      phase: 'bulk-relist-reconciliation-finished', status: effectiveReconciliationStatus,
      reason: refresh.status === 'completed' ? null : 'bulk-relist-accepted-refresh-failed',
      response: refresh.response, mutationBoundaryCrossed: true, after, items: reconciliationItems,
    });
    if (refresh.status !== 'completed' || reconciliation.status !== 'completed') {
      options.circuitBreaker?.recordFailure?.(refresh.error || {}, {
        action: 'bulk-relist', endpoint: '/auctionhouse', jobId: input.jobId, runId: input.runId,
        response: refresh.response, capabilities: adapter.inspectCapabilities(),
      });
      const status = 'ambiguous';
      const reason = refresh.status !== 'completed'
        ? 'bulk-relist-accepted-refresh-failed'
        : `bulk-relist-${reconciliation.status}`;
      return createTradeRunReceipt({
        runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
        startedAt, finishedAt: Number(now()), status, reason, requested,
        succeeded: refresh.status === 'completed' ? reconciliation.relisted : 0,
        failed: refresh.status === 'completed' ? reconciliation.unknown : requested,
        receipts: reconciliationItems.map((entry) => ({ ...entry })),
      });
    }
    options.circuitBreaker?.recordSuccess?.({ action: 'bulk-relist', jobId: input.jobId, runId: input.runId });
    return createTradeRunReceipt({
      runId: input.runId, jobId: input.jobId, jobType: 'bulk-relist', scheduledFor: input.scheduledFor,
      startedAt, finishedAt: Number(now()), status: 'completed', reason: null, requested,
      succeeded: reconciliation.relisted, failed: 0,
      receipts: reconciliation.items.map((entry) => ({ ...entry })),
    });
  }

  return Object.freeze({ run });
}
