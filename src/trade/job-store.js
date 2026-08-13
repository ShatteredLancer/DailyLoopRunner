import { normalizeTradeJob } from './contracts.js';
import { createTradeJobRuntime, normalizeTradeJobRuntime } from './schedule.js';
import { normalizeTradeDispatchState, recordTradeDispatch } from './scheduler-fairness.js';
import {
  createTradeScheduleAuthorizations,
  derivedTradeScheduleAuthorization,
  normalizeTradeScheduleAuthorization,
  normalizeTradeScheduleAuthorizations,
} from './schedule-authorization.js';

export const TRADE_JOB_STORE_SCHEMA_VERSION = 8;
export const TRADE_HISTORY_LIMIT = 100;
export const TRADE_METRICS_SCHEMA_VERSION = 1;
export const TRADE_METRICS_REASON_LIMIT = 20;
export const TRADE_ACTIVE_AUTHORIZATION_TTL_MS = 60 * 60_000;

const TRADE_METRIC_STATUSES = ['completed', 'blocked', 'missed', 'stopped', 'failed', 'error', 'unknown'];
const TRADE_METRIC_JOB_TYPES = ['listing', 'buy', 'bulk-relist', 'unknown'];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nonNegativeInteger(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function nullableTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizedCounterMap(input, keys) {
  return Object.fromEntries(keys.map((key) => [key, nonNegativeInteger(input?.[key])]));
}

function normalizeMetricReasons(input = []) {
  const merged = new Map();
  for (const entry of Array.isArray(input) ? input : []) {
    const reason = String(entry?.reason || '').slice(0, 120);
    if (!reason) continue;
    const previous = merged.get(reason) || { reason, count: 0, lastAt: null };
    merged.set(reason, {
      reason,
      count: previous.count + nonNegativeInteger(entry?.count),
      lastAt: Math.max(previous.lastAt || 0, nullableTimestamp(entry?.lastAt) || 0) || null,
    });
  }
  return [...merged.values()]
    .sort((left, right) => right.count - left.count || (right.lastAt || 0) - (left.lastAt || 0) || left.reason.localeCompare(right.reason))
    .slice(0, TRADE_METRICS_REASON_LIMIT);
}

export function normalizeTradeMetrics(input = {}) {
  return {
    schemaVersion: TRADE_METRICS_SCHEMA_VERSION,
    firstRecordedAt: nullableTimestamp(input.firstRecordedAt),
    lastRecordedAt: nullableTimestamp(input.lastRecordedAt),
    lastRun: input.lastRun && typeof input.lastRun === 'object' ? {
      runId: String(input.lastRun.runId || ''),
      jobId: String(input.lastRun.jobId || ''),
      jobType: TRADE_METRIC_JOB_TYPES.includes(input.lastRun.jobType) ? input.lastRun.jobType : 'unknown',
      status: TRADE_METRIC_STATUSES.includes(input.lastRun.status) ? input.lastRun.status : 'unknown',
      reason: input.lastRun.reason ? String(input.lastRun.reason).slice(0, 120) : null,
      finishedAt: nullableTimestamp(input.lastRun.finishedAt),
    } : null,
    runs: {
      total: nonNegativeInteger(input.runs?.total),
      byStatus: normalizedCounterMap(input.runs?.byStatus, TRADE_METRIC_STATUSES),
      byJobType: normalizedCounterMap(input.runs?.byJobType, TRADE_METRIC_JOB_TYPES),
    },
    outcomes: {
      requested: nonNegativeInteger(input.outcomes?.requested),
      succeeded: nonNegativeInteger(input.outcomes?.succeeded),
      failed: nonNegativeInteger(input.outcomes?.failed),
      skipped: nonNegativeInteger(input.outcomes?.skipped),
    },
    buy: {
      purchases: nonNegativeInteger(input.buy?.purchases),
      searches: nonNegativeInteger(input.buy?.searches),
      attempts: nonNegativeInteger(input.buy?.attempts),
      spent: nonNegativeInteger(input.buy?.spent),
    },
    listing: {
      listed: nonNegativeInteger(input.listing?.listed),
    },
    bulkRelist: {
      relisted: nonNegativeInteger(input.bulkRelist?.relisted),
    },
    reasons: normalizeMetricReasons(input.reasons),
  };
}

function receiptSummary(receipt = {}) {
  return (Array.isArray(receipt.receipts) ? receipt.receipts : [])
    .find((entry) => entry?.status === 'run-summary') || null;
}

export function recordTradeMetrics(input = {}, receipt = {}, options = {}) {
  const metrics = normalizeTradeMetrics(input);
  const at = nullableTimestamp(receipt.finishedAt)
    ?? nullableTimestamp(receipt.startedAt)
    ?? nullableTimestamp(options.now)
    ?? Date.now();
  const status = TRADE_METRIC_STATUSES.includes(receipt.status) ? receipt.status : 'unknown';
  const jobType = TRADE_METRIC_JOB_TYPES.includes(receipt.jobType) ? receipt.jobType : 'unknown';
  const summary = receiptSummary(receipt);
  const reason = receipt.reason ? String(receipt.reason).slice(0, 120) : null;
  const reasons = reason
    ? normalizeMetricReasons([...metrics.reasons, { reason, count: 1, lastAt: at }])
    : metrics.reasons;
  return normalizeTradeMetrics({
    ...metrics,
    firstRecordedAt: metrics.firstRecordedAt ?? at,
    lastRecordedAt: at,
    lastRun: {
      runId: String(receipt.runId || ''),
      jobId: String(receipt.jobId || ''),
      jobType,
      status,
      reason,
      finishedAt: at,
    },
    runs: {
      total: metrics.runs.total + 1,
      byStatus: { ...metrics.runs.byStatus, [status]: metrics.runs.byStatus[status] + 1 },
      byJobType: { ...metrics.runs.byJobType, [jobType]: metrics.runs.byJobType[jobType] + 1 },
    },
    outcomes: {
      requested: metrics.outcomes.requested + nonNegativeInteger(receipt.requested),
      succeeded: metrics.outcomes.succeeded + nonNegativeInteger(receipt.succeeded),
      failed: metrics.outcomes.failed + nonNegativeInteger(receipt.failed),
      skipped: metrics.outcomes.skipped + nonNegativeInteger(receipt.skipped),
    },
    buy: {
      purchases: metrics.buy.purchases + (jobType === 'buy' ? nonNegativeInteger(receipt.succeeded) : 0),
      searches: metrics.buy.searches + (jobType === 'buy' ? nonNegativeInteger(summary?.searches) : 0),
      attempts: metrics.buy.attempts + (jobType === 'buy' ? nonNegativeInteger(summary?.buyAttempts) : 0),
      spent: metrics.buy.spent + (jobType === 'buy' ? nonNegativeInteger(summary?.spent) : 0),
    },
    listing: {
      listed: metrics.listing.listed + (jobType === 'listing' ? nonNegativeInteger(receipt.succeeded) : 0),
    },
    bulkRelist: {
      relisted: metrics.bulkRelist.relisted + (jobType === 'bulk-relist' ? nonNegativeInteger(receipt.succeeded) : 0),
    },
    reasons,
  });
}

function metricsFromHistory(history, now) {
  return history.reduce((metrics, receipt) => recordTradeMetrics(metrics, receipt, { now }), normalizeTradeMetrics());
}

function relockedSnapshot(snapshot, at) {
  const jobs = snapshot.jobs.map((job) => job.armed === true ? { ...job, armed: false, updatedAt: at } : job);
  const runtimes = { ...snapshot.runtimes };
  for (const job of snapshot.jobs) {
    const runtime = runtimes[job.id];
    if (job.armed !== true || !runtime || !['armed', 'waiting-time', 'waiting-session', 'waiting-operation', 'waiting-pace', 'running'].includes(runtime.status)) continue;
    runtimes[job.id] = normalizeTradeJobRuntime({
      ...runtime,
      status: 'disabled',
      reason: 'not-armed',
      continuation: null,
      updatedAt: at,
    });
  }
  return {
    ...snapshot,
    paused: true,
    liveExecutionEnabled: false,
    authorization: null,
    authorizations: normalizeTradeScheduleAuthorizations(null, jobs, { now: at }),
    jobs,
    runtimes,
  };
}

export function normalizeTradeJobStore(input = {}, options = {}) {
  const now = Math.max(0, finiteNumber(options.now, Date.now()));
  const sourceSchemaVersion = Math.max(0, Math.floor(finiteNumber(input.schemaVersion)));
  const hasPersistedState = input && typeof input === 'object' && Object.keys(input).length > 0;
  const requiresV2Relock = hasPersistedState && sourceSchemaVersion < TRADE_JOB_STORE_SCHEMA_VERSION;
  const jobs = [];
  for (const raw of Array.isArray(input.jobs) ? input.jobs : []) {
    try {
      const job = normalizeTradeJob(raw, { now: raw?.updatedAt ?? now });
      jobs.push(requiresV2Relock && job.armed ? { ...job, armed: false, updatedAt: now } : job);
    } catch { }
  }
  const runtimes = {};
  for (const job of jobs) {
    const persisted = input.runtimes?.[job.id];
    if (job.schedule?.type === 'manual' && persisted) {
      runtimes[job.id] = normalizeTradeJobRuntime({
        ...persisted,
        jobId: job.id,
        status: 'disabled',
        reason: 'manual-only',
        nextRunAt: null,
      });
    } else {
      runtimes[job.id] = persisted
        ? normalizeTradeJobRuntime({ ...persisted, jobId: job.id })
        : createTradeJobRuntime(job, { now });
    }
  }
  const history = (Array.isArray(input.history) ? input.history : []).slice(-TRADE_HISTORY_LIMIT).map(clone);
  const metrics = input.metrics?.schemaVersion === TRADE_METRICS_SCHEMA_VERSION
    ? normalizeTradeMetrics(input.metrics)
    : metricsFromHistory(history, now);
  const authorizations = normalizeTradeScheduleAuthorizations(requiresV2Relock ? null : input.authorizations, jobs, {
    now,
    legacyAuthorization: requiresV2Relock ? null : input.authorization,
  });
  return {
    schemaVersion: TRADE_JOB_STORE_SCHEMA_VERSION,
    paused: requiresV2Relock ? true : input.paused !== false,
    liveExecutionEnabled: requiresV2Relock ? false : input.liveExecutionEnabled === true,
    safety: {
      minimumRetainedCoins: nullableNonNegativeInteger(input.safety?.minimumRetainedCoins),
    },
    jobs,
    runtimes,
    history,
    metrics,
    dispatch: normalizeTradeDispatchState(input.dispatch),
    authorizations,
    authorization: derivedTradeScheduleAuthorization(authorizations),
    updatedAt: Math.max(0, finiteNumber(input.updatedAt, now)),
  };
}

export function createTradeJobStore(options = {}) {
  const storage = options.storage;
  const key = String(options.key || 'fc-loop-runner-trade-jobs-v1');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let memory = normalizeTradeJobStore({}, { now: now() });

  function read() {
    const value = storage?.get?.(key, null);
    if (value && typeof value === 'object') {
      const sourceSchemaVersion = Math.max(0, Math.floor(finiteNumber(value.schemaVersion)));
      memory = normalizeTradeJobStore(value, { now: now() });
      if (sourceSchemaVersion < TRADE_JOB_STORE_SCHEMA_VERSION) storage?.set?.(key, clone(memory));
    }
    return clone(memory);
  }

  function write(value) {
    memory = normalizeTradeJobStore({ ...value, updatedAt: now() }, { now: now() });
    storage?.set?.(key, clone(memory));
    return read();
  }

  function upsert(input, normalizeOptions = {}) {
    let snapshot = read();
    const relockedForChange = snapshot.liveExecutionEnabled === true
      || Object.keys(snapshot.authorizations?.jobs || {}).length > 0;
    if (relockedForChange) snapshot = relockedSnapshot(snapshot, Number(now()));
    const existing = snapshot.jobs.find((job) => job.id === String(input?.id || ''));
    const job = normalizeTradeJob({
      ...input,
      armed: relockedForChange ? false : input?.armed,
      createdAt: existing?.createdAt ?? input?.createdAt ?? now(),
      updatedAt: now(),
    }, { ...normalizeOptions, now: now() });
    const jobs = snapshot.jobs.filter((entry) => entry.id !== job.id);
    jobs.push(job);
    const scheduleChanged = !existing || JSON.stringify(existing.schedule) !== JSON.stringify(job.schedule);
    const runtimes = {
      ...snapshot.runtimes,
      [job.id]: scheduleChanged || relockedForChange
        ? createTradeJobRuntime(job, { now: now() })
        : normalizeTradeJobRuntime({ ...snapshot.runtimes[job.id], jobId: job.id }),
    };
    return { job: clone(job), snapshot: write({ ...snapshot, jobs, runtimes }) };
  }

  function remove(jobId) {
    const id = String(jobId || '');
    const current = read();
    const snapshot = current.liveExecutionEnabled === true || Object.keys(current.authorizations?.jobs || {}).length > 0
      ? relockedSnapshot(current, Number(now()))
      : current;
    const runtimes = { ...snapshot.runtimes };
    delete runtimes[id];
    return write({ ...snapshot, jobs: snapshot.jobs.filter((job) => job.id !== id), runtimes });
  }

  function updateRuntime(jobId, runtime) {
    const id = String(jobId || '');
    const snapshot = read();
    if (!snapshot.jobs.some((job) => job.id === id)) throw new Error(`Trade Job ${id} does not exist`);
    return write({
      ...snapshot,
      runtimes: { ...snapshot.runtimes, [id]: normalizeTradeJobRuntime({ ...runtime, jobId: id }) },
    });
  }

  function addHistory(receipt) {
    const snapshot = read();
    return write({
      ...snapshot,
      history: [...snapshot.history, clone(receipt)].slice(-TRADE_HISTORY_LIMIT),
      metrics: recordTradeMetrics(snapshot.metrics, receipt, { now: now() }),
    });
  }

  function recordDispatch(jobId) {
    const id = String(jobId || '');
    const snapshot = read();
    const job = snapshot.jobs.find((entry) => entry.id === id);
    if (!job) throw new Error(`Trade Job ${id} does not exist`);
    return write({ ...snapshot, dispatch: recordTradeDispatch(snapshot.dispatch, job, Number(now())) });
  }

  function replaceJobs(inputs = []) {
    if (!Array.isArray(inputs)) throw new TypeError('Trade Jobs must be an array');
    const at = Number(now());
    const jobs = inputs.map((input) => normalizeTradeJob({ ...input, armed: false, updatedAt: at }, { imported: true, now: at }));
    const ids = new Set();
    for (const job of jobs) {
      if (ids.has(job.id)) throw new Error(`Duplicate Trade Job id: ${job.id}`);
      ids.add(job.id);
    }
    const snapshot = relockedSnapshot(read(), at);
    const runtimes = Object.fromEntries(jobs.map((job) => [job.id, createTradeJobRuntime(job, { now: at })]));
    return write({ ...snapshot, jobs, runtimes });
  }

  function setPaused(value) {
    return write({ ...read(), paused: value !== false });
  }

  function setLiveExecutionEnabled(value) {
    return write({ ...read(), liveExecutionEnabled: value === true });
  }

  function authorize(jobIds) {
    const snapshot = read();
    const armed = snapshot.jobs.filter((entry) => entry.enabled === true && entry.armed === true && entry.schedule?.type !== 'manual');
    const requestedIds = (Array.isArray(jobIds) ? jobIds : [jobIds]).map((entry) => String(entry || '')).sort();
    const armedIds = armed.map((entry) => entry.id).sort();
    if (!armed.length || requestedIds.length !== armedIds.length || requestedIds.some((id, index) => id !== armedIds[index])) {
      throw new Error('Authorized Trade Jobs must exactly match all armed Trade Jobs');
    }
    const authorizations = createTradeScheduleAuthorizations(armed, { now: now() });
    return write({
      ...snapshot,
      paused: false,
      liveExecutionEnabled: true,
      authorizations,
      authorization: derivedTradeScheduleAuthorization(authorizations),
    });
  }

  function consumeAuthorization(jobId, runId) {
    const snapshot = read();
    const id = String(jobId || '');
    const authorizations = normalizeTradeScheduleAuthorizations(snapshot.authorizations, snapshot.jobs, {
      now: now(),
      legacyAuthorization: snapshot.authorization,
    });
    const authorization = normalizeTradeScheduleAuthorization(authorizations.jobs?.[id], snapshot.jobs, { now: now() });
    if (!authorization) {
      return { consumed: false, reason: 'schedule-authorization-missing-or-expired', snapshot: relock() };
    }
    if (authorization.lastRunId && authorization.lastRunId === String(runId || '')) {
      return {
        consumed: false,
        reason: 'schedule-authorization-run-already-consumed',
        snapshot,
      };
    }
    const remainingRuns = authorization.remainingRuns - 1;
    const next = {
      ...authorization,
      remainingRuns,
      lastRunId: String(runId || ''),
      lastConsumedAt: Number(now()),
    };
    const nextJobs = { ...authorizations.jobs };
    if (remainingRuns < 1) delete nextJobs[id];
    else nextJobs[id] = next;
    const nextAuthorizations = normalizeTradeScheduleAuthorizations({
      ...authorizations,
      jobs: nextJobs,
    }, snapshot.jobs, { now: now() });
    if (remainingRuns < 1 && Object.keys(nextAuthorizations.jobs).length < 1) {
      return { consumed: true, remainingRuns: 0, snapshot: write(relockedSnapshot(snapshot, Number(now()))) };
    }
    const jobs = remainingRuns < 1
      ? snapshot.jobs.map((job) => job.id === id ? { ...job, armed: false, updatedAt: Number(now()) } : job)
      : snapshot.jobs;
    return {
      consumed: true,
      remainingRuns,
      snapshot: write({
        ...snapshot,
        jobs,
        authorizations: nextAuthorizations,
        authorization: derivedTradeScheduleAuthorization(nextAuthorizations),
      }),
    };
  }

  function beginAuthorization(jobId, runId) {
    const snapshot = read();
    const id = String(jobId || '');
    const selectedRunId = String(runId || '');
    const authorizations = normalizeTradeScheduleAuthorizations(snapshot.authorizations, snapshot.jobs, {
      now: now(),
      legacyAuthorization: snapshot.authorization,
    });
    const authorization = normalizeTradeScheduleAuthorization(authorizations.jobs?.[id], snapshot.jobs, { now: now() });
    if (!authorization) {
      return { begun: false, resumed: false, reason: 'schedule-authorization-missing-or-expired', snapshot: relock() };
    }
    if (!selectedRunId) return { begun: false, resumed: false, reason: 'schedule-authorization-run-id-required', snapshot };
    if (authorization.activeRunId) {
      if (authorization.activeRunId !== selectedRunId) {
        return { begun: false, resumed: false, reason: 'schedule-authorization-run-active', snapshot };
      }
      const at = Number(now());
      const resumed = {
        ...authorization,
        activeExpiresAt: Math.max(Number(authorization.activeExpiresAt || 0), at + TRADE_ACTIVE_AUTHORIZATION_TTL_MS),
      };
      const nextAuthorizations = normalizeTradeScheduleAuthorizations({
        ...authorizations,
        jobs: { ...authorizations.jobs, [id]: resumed },
      }, snapshot.jobs, { now: at });
      const nextSnapshot = write({
        ...snapshot,
        authorizations: nextAuthorizations,
        authorization: derivedTradeScheduleAuthorization(nextAuthorizations),
      });
      return {
        begun: true,
        resumed: true,
        remainingRuns: resumed.remainingRuns,
        authorization: nextAuthorizations.jobs[id],
        snapshot: nextSnapshot,
      };
    }
    const at = Number(now());
    const active = {
      ...authorization,
      activeRunId: selectedRunId,
      activeStartedAt: at,
      activeExpiresAt: at + TRADE_ACTIVE_AUTHORIZATION_TTL_MS,
    };
    const nextAuthorizations = normalizeTradeScheduleAuthorizations({
      ...authorizations,
      jobs: { ...authorizations.jobs, [id]: active },
    }, snapshot.jobs, { now: at });
    const nextSnapshot = write({
      ...snapshot,
      authorizations: nextAuthorizations,
      authorization: derivedTradeScheduleAuthorization(nextAuthorizations),
    });
    return {
      begun: true,
      resumed: false,
      remainingRuns: active.remainingRuns,
      authorization: nextAuthorizations.jobs[id],
      snapshot: nextSnapshot,
    };
  }

  function completeAuthorization(jobId, runId) {
    const snapshot = read();
    const id = String(jobId || '');
    const selectedRunId = String(runId || '');
    const authorizations = normalizeTradeScheduleAuthorizations(snapshot.authorizations, snapshot.jobs, {
      now: now(),
      legacyAuthorization: snapshot.authorization,
    });
    const authorization = normalizeTradeScheduleAuthorization(authorizations.jobs?.[id], snapshot.jobs, { now: now() });
    if (!authorization) return { completed: false, reason: 'schedule-authorization-missing-or-expired', snapshot: relock() };
    if (!authorization.activeRunId || authorization.activeRunId !== selectedRunId) {
      return { completed: false, reason: 'schedule-authorization-active-run-mismatch', snapshot };
    }
    const remainingRuns = authorization.remainingRuns - 1;
    const nextJobs = { ...authorizations.jobs };
    if (remainingRuns < 1) delete nextJobs[id];
    else {
      nextJobs[id] = {
        ...authorization,
        remainingRuns,
        activeRunId: null,
        activeStartedAt: null,
        activeExpiresAt: null,
        lastRunId: selectedRunId,
        lastConsumedAt: Number(now()),
      };
    }
    const nextAuthorizations = normalizeTradeScheduleAuthorizations({
      ...authorizations,
      jobs: nextJobs,
    }, snapshot.jobs, { now: now() });
    if (remainingRuns < 1 && Object.keys(nextAuthorizations.jobs).length < 1) {
      return { completed: true, remainingRuns: 0, snapshot: write(relockedSnapshot(snapshot, Number(now()))) };
    }
    const jobs = remainingRuns < 1
      ? snapshot.jobs.map((job) => job.id === id ? { ...job, armed: false, updatedAt: Number(now()) } : job)
      : snapshot.jobs;
    return {
      completed: true,
      remainingRuns,
      snapshot: write({
        ...snapshot,
        jobs,
        authorizations: nextAuthorizations,
        authorization: derivedTradeScheduleAuthorization(nextAuthorizations),
      }),
    };
  }

  function revokeAuthorization(jobId, reason = 'schedule-authorization-revoked') {
    const snapshot = read();
    const id = String(jobId || '');
    const authorizations = normalizeTradeScheduleAuthorizations(snapshot.authorizations, snapshot.jobs, {
      now: now(),
      legacyAuthorization: snapshot.authorization,
    });
    const nextJobs = { ...authorizations.jobs };
    delete nextJobs[id];
    const nextAuthorizations = normalizeTradeScheduleAuthorizations({ ...authorizations, jobs: nextJobs }, snapshot.jobs, { now: now() });
    if (!Object.keys(nextAuthorizations.jobs).length) return relock();
    const at = Number(now());
    const jobs = snapshot.jobs.map((job) => job.id === id ? { ...job, armed: false, updatedAt: at } : job);
    const runtimes = { ...snapshot.runtimes };
    if (runtimes[id]) {
      runtimes[id] = normalizeTradeJobRuntime({
        ...runtimes[id],
        status: 'disabled',
        reason: String(reason || 'schedule-authorization-revoked'),
        continuation: null,
        updatedAt: at,
      });
    }
    return write({
      ...snapshot,
      jobs,
      runtimes,
      authorizations: nextAuthorizations,
      authorization: derivedTradeScheduleAuthorization(nextAuthorizations),
    });
  }

  function setMinimumRetainedCoins(value) {
    let snapshot = read();
    if (snapshot.liveExecutionEnabled === true || Object.keys(snapshot.authorizations?.jobs || {}).length > 0) {
      snapshot = relockedSnapshot(snapshot, Number(now()));
    }
    const minimumRetainedCoins = nullableNonNegativeInteger(value);
    if (value !== null && value !== undefined && value !== '' && minimumRetainedCoins === null) {
      throw new TypeError('Minimum retained coins must be a non-negative integer or null');
    }
    return write({ ...snapshot, safety: { ...snapshot.safety, minimumRetainedCoins } });
  }

  function relock() {
    return write(relockedSnapshot(read(), Number(now())));
  }

  return Object.freeze({
    read,
    upsert,
    remove,
    updateRuntime,
    addHistory,
    recordDispatch,
    replaceJobs,
    setPaused,
    setLiveExecutionEnabled,
    authorize,
    beginAuthorization,
    completeAuthorization,
    consumeAuthorization,
    revokeAuthorization,
    setMinimumRetainedCoins,
    relock,
  });
}
