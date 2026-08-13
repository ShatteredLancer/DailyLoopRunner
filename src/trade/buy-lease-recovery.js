import { createTradeRunReceipt } from './contracts.js';

function journalForRun(journals, runId) {
  return (Array.isArray(journals) ? journals : [])
    .map((journal) => ({ journal, snapshot: journal?.snapshot?.() }))
    .find((entry) => entry.snapshot?.runId === runId) || null;
}

function journalKind(journal) {
  if (journal?.before && Array.isArray(journal.before.items)) return 'bulk-relist';
  if (journal?.source) return 'listing';
  return 'buy';
}

function terminalItemStatus(kind, status) {
  if (kind === 'listing') return status === 'listed';
  if (kind === 'bulk-relist') return status === 'relisted';
  return status === 'purchased';
}

function recoveredReceipt(previous, journal, finishedAt, reason) {
  const kind = journalKind(journal);
  const items = journal?.items || [];
  const succeeded = items.filter((entry) => terminalItemStatus(kind, entry.status)).length;
  const failed = items.filter((entry) => ['failed', 'blocked', 'ambiguous'].includes(entry.status)).length;
  const requested = Math.max(Number(journal?.requested || 0), items.length);
  return createTradeRunReceipt({
    runId: previous.runId,
    jobId: previous.jobId,
    jobType: kind,
    scheduledFor: previous.acquiredAt,
    startedAt: previous.acquiredAt,
    finishedAt,
    status: 'blocked',
    reason,
    requested,
    succeeded,
    failed,
    skipped: Math.max(0, requested - succeeded - failed),
    receipts: items.map((entry) => ({
      index: entry.index,
      status: entry.status,
      reason: entry.reason,
      item: entry.item,
      price: entry.price ?? entry.listing?.buyNow ?? null,
      destination: entry.destination ?? null,
      mutationBoundaryCrossed: entry.mutationBoundaryCrossed === true,
    })),
  });
}

export function reconcileExpiredTradeLease(options = {}) {
  const lease = options.lease;
  const store = options.store;
  if (!lease?.inspect || !lease?.clearExpired || !store?.read || !store?.addHistory) {
    throw new TypeError('Trade lease and Job Store are required');
  }
  const inspected = lease.inspect();
  const previous = inspected.lease;
  if (!inspected.expired || !previous) return { status: 'not-needed', reason: null, receipt: null };
  const journalEntry = journalForRun(options.journals, previous.runId);
  const journal = journalEntry?.snapshot || null;
  const kind = journalKind(journal);
  const crossedJournalBoundary = journal?.items?.some((entry) => entry.mutationBoundaryCrossed === true) === true;
  const crossedLeaseBoundary = Number(previous.heartbeatAt) !== Number(previous.acquiredAt);
  const journalTerminal = journal && journal.status !== 'active';
  const knownTerminalStatuses = kind === 'listing'
    ? ['listed', 'failed']
    : kind === 'bulk-relist' ? ['relisted', 'failed'] : ['purchased', 'competition-lost', 'failed'];
  const uncertainJournalMutation = journal?.items?.some((entry) => (
    entry.mutationBoundaryCrossed === true && !knownTerminalStatuses.includes(entry.status)
  )) === true;
  if ((crossedJournalBoundary || crossedLeaseBoundary) && (!journalTerminal || uncertainJournalMutation)) {
    return { status: 'blocked', reason: `expired-lease-crossed-${kind}-boundary`, receipt: null, journal };
  }
  const snapshot = store.read();
  const job = (snapshot.jobs || []).find((entry) => entry.id === previous.jobId);
  if (!journal && (!job || !['buy', 'listing', 'bulk-relist'].includes(job.type))) {
    return { status: 'blocked', reason: 'expired-lease-job-unavailable', receipt: null };
  }
  if ((snapshot.history || []).some((entry) => entry.runId === previous.runId)) {
    const cleared = lease.clearExpired(previous.runId);
    return { status: cleared ? 'already-recorded' : 'blocked', reason: cleared ? null : 'expired-lease-clear-failed', receipt: null };
  }
  if (!lease.clearExpired(previous.runId)) {
    return { status: 'blocked', reason: 'expired-lease-clear-failed', receipt: null };
  }
  const finishedAt = Number(options.now?.() ?? Date.now());
  const reason = journalTerminal
    ? `browser-terminated-after-${kind}-journal-terminal`
    : `browser-terminated-before-${kind}-mutation-boundary`;
  const receipt = journal
    ? recoveredReceipt(previous, journal, finishedAt, reason)
    : createTradeRunReceipt({
      runId: previous.runId,
      jobId: previous.jobId,
      jobType: job.type,
      scheduledFor: previous.acquiredAt,
      startedAt: previous.acquiredAt,
      finishedAt,
      status: 'blocked',
      reason,
      requested: 0,
      receipts: [{ status: 'blocked', reason }],
    });
  store.addHistory(receipt);
  journalEntry?.journal?.finish?.(previous.runId, {
    phase: 'expired-lease-reconciled',
    status: 'blocked',
    reason,
  });
  return { status: 'reconciled', reason: receipt.reason, receipt, journal };
}

export function reconcileExpiredPreBuyLease(options = {}) {
  return reconcileExpiredTradeLease(options);
}
