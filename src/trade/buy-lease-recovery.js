import { createTradeRunReceipt } from './contracts.js';

export function reconcileExpiredPreBuyLease(options = {}) {
  const lease = options.lease;
  const store = options.store;
  if (!lease?.inspect || !lease?.clearExpired || !store?.read || !store?.addHistory) {
    throw new TypeError('Trade lease and Job Store are required');
  }
  const inspected = lease.inspect();
  const previous = inspected.lease;
  if (!inspected.expired || !previous) return { status: 'not-needed', reason: null, receipt: null };
  if (Number(previous.heartbeatAt) !== Number(previous.acquiredAt)) {
    return { status: 'blocked', reason: 'expired-lease-crossed-buy-boundary', receipt: null };
  }
  const snapshot = store.read();
  const job = (snapshot.jobs || []).find((entry) => entry.id === previous.jobId);
  if (!job || job.type !== 'buy') return { status: 'blocked', reason: 'expired-lease-job-unavailable', receipt: null };
  if ((snapshot.history || []).some((entry) => entry.runId === previous.runId)) {
    const cleared = lease.clearExpired(previous.runId);
    return { status: cleared ? 'already-recorded' : 'blocked', reason: cleared ? null : 'expired-lease-clear-failed', receipt: null };
  }
  if (!lease.clearExpired(previous.runId)) {
    return { status: 'blocked', reason: 'expired-lease-clear-failed', receipt: null };
  }
  const finishedAt = Number(options.now?.() ?? Date.now());
  const receipt = createTradeRunReceipt({
    runId: previous.runId,
    jobId: previous.jobId,
    jobType: 'buy',
    scheduledFor: previous.acquiredAt,
    startedAt: previous.acquiredAt,
    finishedAt,
    status: 'blocked',
    reason: 'browser-terminated-before-buy-heartbeat',
    requested: 0,
    receipts: [{
      status: 'blocked',
      reason: 'browser-terminated-before-buy-heartbeat',
      previousLease: {
        runId: previous.runId,
        jobId: previous.jobId,
        acquiredAt: previous.acquiredAt,
        heartbeatAt: previous.heartbeatAt,
        expiresAt: previous.expiresAt,
      },
    }],
  });
  store.addHistory(receipt);
  return { status: 'reconciled', reason: receipt.reason, receipt };
}
