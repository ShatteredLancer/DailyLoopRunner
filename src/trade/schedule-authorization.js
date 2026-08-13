export const TRADE_SCHEDULE_AUTHORIZATION_SCHEMA_VERSION = 2;
export const TRADE_SCHEDULE_AUTHORIZATIONS_SCHEMA_VERSION = 3;
export const TRADE_RECURRING_AUTHORIZATION_RUNS = 2;
export const TRADE_SCHEDULE_AUTHORIZATION_JOB_LIMIT = 3;

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
    const periodMs = Math.max(1, Number(job.schedule.intervalSeconds || 3600)) * 1000;
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
    activeRunId: null,
    activeStartedAt: null,
    activeExpiresAt: null,
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
  const activeExpiresAt = input.activeExpiresAt === null || input.activeExpiresAt === undefined
    ? null
    : Math.max(0, Number(input.activeExpiresAt || 0));
  if (!job || job.armed !== true || remainingRuns < 1 || Math.max(expiresAt, activeExpiresAt || 0) <= now) return null;
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
    activeRunId: input.activeRunId ? String(input.activeRunId) : null,
    activeStartedAt: input.activeStartedAt === null || input.activeStartedAt === undefined
      ? null
      : Math.max(0, Number(input.activeStartedAt || 0)),
    activeExpiresAt,
    lastRunId: input.lastRunId ? String(input.lastRunId) : null,
    lastConsumedAt: input.lastConsumedAt === null || input.lastConsumedAt === undefined
      ? null
      : Math.max(0, Number(input.lastConsumedAt || 0)),
  };
}

export function normalizeTradeScheduleAuthorizations(input, jobs = [], options = {}) {
  const now = Math.max(0, Number(options.now ?? Date.now()));
  const rawEntries = input?.schemaVersion === TRADE_SCHEDULE_AUTHORIZATIONS_SCHEMA_VERSION
    ? Object.values(input.jobs || {})
    : [];
  if (!rawEntries.length && options.legacyAuthorization) rawEntries.push(options.legacyAuthorization);
  const entries = rawEntries
    .map((entry) => normalizeTradeScheduleAuthorization(entry, jobs, { now }))
    .filter(Boolean)
    .sort((left, right) => left.grantedAt - right.grantedAt || left.jobId.localeCompare(right.jobId))
    .slice(0, TRADE_SCHEDULE_AUTHORIZATION_JOB_LIMIT);
  return {
    schemaVersion: TRADE_SCHEDULE_AUTHORIZATIONS_SCHEMA_VERSION,
    grantedAt: entries.length
      ? Math.min(...entries.map((entry) => entry.grantedAt))
      : null,
    jobs: Object.fromEntries(entries.map((entry) => [entry.jobId, entry])),
  };
}

export function createTradeScheduleAuthorizations(jobs = [], options = {}) {
  const selected = [...jobs]
    .filter((job) => job?.enabled === true && job?.armed === true && job?.schedule?.type !== 'manual')
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (!selected.length) throw new Error('At least one armed Trade Job is required');
  if (selected.length > TRADE_SCHEDULE_AUTHORIZATION_JOB_LIMIT) {
    throw new Error(`At most ${TRADE_SCHEDULE_AUTHORIZATION_JOB_LIMIT} armed Trade Jobs are allowed`);
  }
  const now = Math.max(0, Number(options.now ?? Date.now()));
  return normalizeTradeScheduleAuthorizations({
    schemaVersion: TRADE_SCHEDULE_AUTHORIZATIONS_SCHEMA_VERSION,
    jobs: Object.fromEntries(selected.map((job) => [
      job.id,
      createTradeScheduleAuthorization(job, { now }),
    ])),
  }, selected, { now });
}

export function tradeScheduleAuthorizationEntries(snapshot = {}, options = {}) {
  const normalized = normalizeTradeScheduleAuthorizations(snapshot.authorizations, snapshot.jobs || [], {
    ...options,
    legacyAuthorization: snapshot.authorization,
  });
  return Object.values(normalized.jobs);
}

export function derivedTradeScheduleAuthorization(authorizations = {}) {
  const entries = Object.values(authorizations.jobs || {});
  return entries.length === 1 ? entries[0] : null;
}

export function inspectTradeScheduleAuthorization(snapshot = {}, job = null, options = {}) {
  const authorizations = normalizeTradeScheduleAuthorizations(snapshot.authorizations, snapshot.jobs || [], {
    ...options,
    legacyAuthorization: snapshot.authorization,
  });
  const selected = job || (snapshot.jobs || []).find((entry) => authorizations.jobs?.[entry.id]);
  const authorization = selected ? authorizations.jobs?.[selected.id] || null : null;
  if (!authorization) return { ready: false, reason: 'schedule-authorization-missing-or-expired', authorization: null };
  if (!selected || selected.id !== authorization.jobId) {
    return { ready: false, reason: 'schedule-authorization-job-mismatch', authorization };
  }
  return { ready: true, reason: null, authorization };
}
