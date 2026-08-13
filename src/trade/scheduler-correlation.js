export const TRADE_CORRELATION_LIMIT = 20;

function stringOrNull(value) {
  return value === undefined || value === null || value === '' ? null : String(value);
}

function terminalHistory(receipt = {}) {
  return ['completed', 'blocked', 'missed', 'stopped', 'failed', 'error', 'ambiguous'].includes(receipt.status);
}

export function inspectExpiredTradeLeaseRecovery(input = {}) {
  const lease = input.previousLease || null;
  if (!lease?.runId) return { status: 'blocked', reason: 'expired-lease-run-id-missing' };
  const history = (input.history || []).find((entry) => String(entry.runId || '') === String(lease.runId));
  const journals = [
    input.buyJournal ? { type: 'buy', value: input.buyJournal } : null,
    input.listingJournal ? { type: 'listing', value: input.listingJournal } : null,
    input.bulkRelistJournal ? { type: 'bulk-relist', value: input.bulkRelistJournal } : null,
  ].filter((entry) => entry?.value?.runId && String(entry.value.runId) === String(lease.runId));
  const uncertainJournal = journals.find((entry) => input.inspectJournal?.(entry.value, entry.type) === true);
  if (uncertainJournal) {
    return {
      status: 'blocked',
      reason: 'expired-lease-journal-mutation-review-required',
      runId: String(lease.runId),
      jobId: stringOrNull(lease.jobId),
    };
  }
  const continuation = input.continuation || null;
  if (continuation?.runId
    && String(continuation.runId) === String(lease.runId)
    && (!lease.jobId || !continuation.jobId || String(continuation.jobId) === String(lease.jobId))) {
    return {
      status: 'reconciled',
      reason: 'expired-lease-persisted-continuation-confirmed',
      runId: String(lease.runId),
      jobId: stringOrNull(lease.jobId),
      historyStatus: null,
    };
  }
  if (!history || !terminalHistory(history)) {
    return {
      status: 'blocked',
      reason: 'expired-lease-terminal-history-missing',
      runId: String(lease.runId),
      jobId: stringOrNull(lease.jobId),
    };
  }
  return {
    status: 'reconciled',
    reason: 'expired-lease-terminal-history-confirmed',
    runId: String(lease.runId),
    jobId: stringOrNull(lease.jobId),
    historyStatus: String(history.status),
  };
}

export function summarizeTradeRunCorrelations(input = {}) {
  const scheduler = input.scheduler || {};
  const events = Array.isArray(input.events) ? input.events : [];
  const lease = input.lease?.lease || input.lease || null;
  const journals = [
    input.buyJournal ? { type: 'buy', value: input.buyJournal } : null,
    input.listingJournal ? { type: 'listing', value: input.listingJournal } : null,
    input.bulkRelistJournal ? { type: 'bulk-relist', value: input.bulkRelistJournal } : null,
  ].filter(Boolean);
  const runIds = [];
  const add = (value) => {
    const id = stringOrNull(value);
    if (id && !runIds.includes(id)) runIds.push(id);
  };
  [...(scheduler.history || [])].reverse().forEach((entry) => add(entry.runId));
  Object.values(scheduler.runtimes || {}).forEach((runtime) => add(runtime?.continuation?.runId));
  journals.forEach((entry) => add(entry.value.runId));
  add(lease?.runId);
  [...events].reverse().forEach((entry) => add(entry.runId));

  return runIds.slice(0, TRADE_CORRELATION_LIMIT).map((runId) => {
    const history = (scheduler.history || []).find((entry) => String(entry.runId || '') === runId) || null;
    const journal = journals.find((entry) => String(entry.value.runId || '') === runId) || null;
    const matchingEvents = events.filter((entry) => String(entry.runId || '') === runId);
    const continuation = Object.values(scheduler.runtimes || {})
      .map((runtime) => runtime?.continuation)
      .find((entry) => String(entry?.runId || '') === runId) || null;
    const pacingEvents = (journal?.value.events || []).filter((entry) => (
      String(entry.phase || '').endsWith('-permit-waiting')
      || entry.phase === 'request-pacing-cooldown'
    ));
    return {
      runId,
      jobId: stringOrNull(history?.jobId || journal?.value.jobId || (String(lease?.runId || '') === runId ? lease.jobId : null)),
      jobType: stringOrNull(history?.jobType || journal?.type),
      history: history ? {
        status: stringOrNull(history.status),
        reason: stringOrNull(history.reason),
        startedAt: Number(history.startedAt || 0) || null,
        finishedAt: Number(history.finishedAt || 0) || null,
      } : null,
      continuation: continuation ? {
        scheduledFor: Number(continuation.scheduledFor || 0) || null,
        startedAt: Number(continuation.startedAt || 0) || null,
        resumeAt: Number(continuation.resumeAt || 0) || null,
        yieldedAt: Number(continuation.yieldedAt || 0) || null,
        sliceCount: Math.max(1, Number(continuation.sliceCount || 1)),
        requested: Math.max(0, Number(continuation.requested || 0)),
        succeeded: Math.max(0, Number(continuation.succeeded || 0)),
      } : null,
      journal: journal ? {
        type: journal.type,
        status: stringOrNull(journal.value.status),
        phase: stringOrNull(journal.value.phase),
        updatedAt: Number(journal.value.updatedAt || 0) || null,
        mutationBoundaryCrossed: (journal.value.items || []).some((item) => item.mutationBoundaryCrossed === true),
        uncertainItems: journal.value.status === 'acknowledged' ? 0 : (journal.value.items || []).filter((item) => (
          item.mutationBoundaryCrossed === true
          && !['purchased', 'competition-lost', 'listed', 'relisted', 'failed'].includes(item.status)
        )).length,
      } : null,
      lease: String(lease?.runId || '') === runId ? {
        active: input.lease?.active === true,
        expired: input.lease?.expired === true,
        acquiredAt: Number(lease.acquiredAt || 0) || null,
        heartbeatAt: Number(lease.heartbeatAt || 0) || null,
        expiresAt: Number(lease.expiresAt || 0) || null,
      } : null,
      schedulerEvents: matchingEvents.length,
      pacingWaits: pacingEvents.length,
      latestPacingRetryAt: pacingEvents.length
        ? Math.max(...pacingEvents.map((entry) => Number(entry.retryAt || 0))) || null
        : null,
    };
  });
}
