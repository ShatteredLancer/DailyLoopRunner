export const TRADE_SCHEDULE_AUTHORIZATION_SCHEMA_VERSION = 1;
export const TRADE_RECURRING_AUTHORIZATION_RUNS = 2;

function stableHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function tradeScheduleFingerprint(job = {}) {
  return stableHash(JSON.stringify({
    id: String(job.id || ''),
    type: String(job.type || ''),
    schedule: job.schedule || null,
    misfirePolicy: job.misfirePolicy || null,
    policy: job.policy || null,
  }));
}

export function tradeScheduleAuthorizationRuns(job = {}) {
  return ['daily', 'interval'].includes(job.schedule?.type)
    ? TRADE_RECURRING_AUTHORIZATION_RUNS
    : 1;
}

function authorizationExpiry(job, now, runs) {
  const graceMs = job.misfirePolicy?.type === 'grace-window'
    ? Math.min(15, Math.max(1, Number(job.misfirePolicy.graceMinutes || 15))) * 60_000
    : 15_000;
  if (job.schedule?.type === 'once') return Number(job.schedule.runAt) + graceMs;
  if (job.schedule?.type === 'window') return Number(job.schedule.endAt) + graceMs;
  if (job.schedule?.type === 'interval') {
    const periodMs = Math.max(1, Number(job.schedule.everyMinutes || 60)) * 60_000;
    return now + Math.min(48 * 60 * 60_000, periodMs * runs + graceMs + 15 * 60_000);
  }
  if (job.schedule?.type === 'daily') return now + 26 * 60 * 60_000;
  return now;
}

export function createTradeScheduleAuthorization(job = {}, options = {}) {
  const now = Math.max(0, Number(options.now ?? Date.now()));
  const totalRuns = tradeScheduleAuthorizationRuns(job);
  return {
    schemaVersion: TRADE_SCHEDULE_AUTHORIZATION_SCHEMA_VERSION,
    jobId: String(job.id || ''),
    jobFingerprint: tradeScheduleFingerprint(job),
    scheduleType: String(job.schedule?.type || ''),
    grantedAt: now,
    expiresAt: authorizationExpiry(job, now, totalRuns),
    totalRuns,
    remainingRuns: totalRuns,
    lastRunId: null,
    lastConsumedAt: null,
  };
}

export function normalizeTradeScheduleAuthorization(input, jobs = [], options = {}) {
  if (!input || typeof input !== 'object') return null;
  const now = Math.max(0, Number(options.now ?? Date.now()));
  const job = jobs.find((entry) => String(entry.id) === String(input.jobId || ''));
  const totalRuns = Math.max(1, Math.floor(Number(input.totalRuns || 0)));
  const remainingRuns = Math.min(totalRuns, Math.max(0, Math.floor(Number(input.remainingRuns || 0))));
  const expiresAt = Math.max(0, Number(input.expiresAt || 0));
  if (!job || job.armed !== true || remainingRuns < 1 || expiresAt <= now) return null;
  if (String(input.jobFingerprint || '') !== tradeScheduleFingerprint(job)) return null;
  return {
    schemaVersion: TRADE_SCHEDULE_AUTHORIZATION_SCHEMA_VERSION,
    jobId: String(job.id),
    jobFingerprint: String(input.jobFingerprint),
    scheduleType: String(job.schedule?.type || ''),
    grantedAt: Math.max(0, Number(input.grantedAt || 0)),
    expiresAt,
    totalRuns,
    remainingRuns,
    lastRunId: input.lastRunId ? String(input.lastRunId) : null,
    lastConsumedAt: input.lastConsumedAt === null || input.lastConsumedAt === undefined
      ? null
      : Math.max(0, Number(input.lastConsumedAt || 0)),
  };
}

export function inspectTradeScheduleAuthorization(snapshot = {}, job = null, options = {}) {
  const selected = job || (snapshot.jobs || []).find((entry) => entry.id === snapshot.authorization?.jobId);
  const authorization = normalizeTradeScheduleAuthorization(snapshot.authorization, snapshot.jobs || [], options);
  if (!authorization) return { ready: false, reason: 'schedule-authorization-missing-or-expired', authorization: null };
  if (!selected || selected.id !== authorization.jobId) {
    return { ready: false, reason: 'schedule-authorization-job-mismatch', authorization };
  }
  return { ready: true, reason: null, authorization };
}
