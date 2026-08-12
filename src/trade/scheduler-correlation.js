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
  ].filter(Boolean);
  const runIds = [];
  const add = (value) => {
    const id = stringOrNull(value);
    if (id && !runIds.includes(id)) runIds.push(id);
  };
  [...(scheduler.history || [])].reverse().forEach((entry) => add(entry.runId));
  journals.forEach((entry) => add(entry.value.runId));
  add(lease?.runId);
  [...events].reverse().forEach((entry) => add(entry.runId));

  return runIds.slice(0, TRADE_CORRELATION_LIMIT).map((runId) => {
    const history = (scheduler.history || []).find((entry) => String(entry.runId || '') === runId) || null;
    const journal = journals.find((entry) => String(entry.value.runId || '') === runId) || null;
    const matchingEvents = events.filter((entry) => String(entry.runId || '') === runId);
    const budgetEvents = (journal?.value.events || []).filter((entry) => (
      entry.phase === 'chunk-budget-waiting' || entry.retryAt !== null && entry.retryAt !== undefined
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
      journal: journal ? {
        type: journal.type,
        status: stringOrNull(journal.value.status),
        phase: stringOrNull(journal.value.phase),
        updatedAt: Number(journal.value.updatedAt || 0) || null,
        mutationBoundaryCrossed: (journal.value.items || []).some((item) => item.mutationBoundaryCrossed === true),
        uncertainItems: journal.value.status === 'acknowledged' ? 0 : (journal.value.items || []).filter((item) => (
          item.mutationBoundaryCrossed === true
          && !['purchased', 'competition-lost', 'listed', 'failed'].includes(item.status)
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
      budgetWaits: budgetEvents.length,
      latestBudgetRetryAt: budgetEvents.length
        ? Math.max(...budgetEvents.map((entry) => Number(entry.retryAt || 0))) || null
        : null,
    };
  });
}
