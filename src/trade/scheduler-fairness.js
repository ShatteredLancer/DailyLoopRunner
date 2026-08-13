function scheduledAt(candidate = {}) {
  const value = Number(
    candidate.runtime?.continuation?.resumeAt
    ?? candidate.runtime?.nextRunAt
    ?? candidate.decision?.scheduledFor,
  );
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function sortedCandidates(input = []) {
  return [...input].sort((left, right) => (
    scheduledAt(left) - scheduledAt(right)
    || String(left.job?.id || '').localeCompare(String(right.job?.id || ''))
  ));
}

const FAIR_JOB_TYPES = Object.freeze(['buy', 'listing', 'bulk-relist']);

export function selectFairTradeCandidate(input = [], dispatch = {}) {
  const candidates = sortedCandidates(input).filter((candidate) => candidate.decision?.action === 'run');
  if (candidates.length < 2) return candidates[0] || null;
  const firstDueAt = scheduledAt(candidates[0]);
  const equallyDue = candidates.filter((candidate) => scheduledAt(candidate) === firstDueAt);
  if (equallyDue.length < 2) return candidates[0];
  const lastType = FAIR_JOB_TYPES.includes(dispatch.lastJobType) ? dispatch.lastJobType : null;
  if (!lastType) return equallyDue[0];
  const lastIndex = FAIR_JOB_TYPES.indexOf(lastType);
  for (let offset = 1; offset <= FAIR_JOB_TYPES.length; offset += 1) {
    const nextType = FAIR_JOB_TYPES[(lastIndex + offset) % FAIR_JOB_TYPES.length];
    const selected = equallyDue.find((candidate) => candidate.job?.type === nextType);
    if (selected) return selected;
  }
  return equallyDue[0];
}

export function normalizeTradeDispatchState(input = {}) {
  const lastJobType = FAIR_JOB_TYPES.includes(input.lastJobType) ? input.lastJobType : null;
  const lastDispatchedAt = Number(input.lastDispatchedAt);
  return {
    schemaVersion: 1,
    total: Math.max(0, Math.floor(Number(input.total) || 0)),
    lastJobId: input.lastJobId ? String(input.lastJobId) : null,
    lastJobType,
    lastDispatchedAt: Number.isFinite(lastDispatchedAt) && lastDispatchedAt >= 0 ? lastDispatchedAt : null,
  };
}

export function recordTradeDispatch(input = {}, job = {}, atInput = Date.now()) {
  const state = normalizeTradeDispatchState(input);
  const at = Number(atInput);
  return normalizeTradeDispatchState({
    ...state,
    total: state.total + 1,
    lastJobId: job.id,
    lastJobType: job.type,
    lastDispatchedAt: Number.isFinite(at) ? Math.max(0, at) : Date.now(),
  });
}
