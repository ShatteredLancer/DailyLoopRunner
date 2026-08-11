const RUNTIME_STATES = new Set([
  'disabled', 'armed', 'waiting-time', 'waiting-session', 'waiting-operation',
  'running', 'cooldown', 'completed', 'missed', 'blocked',
]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nullableEpoch(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function formatter(timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
}

function zonedParts(epoch, timezone) {
  const values = Object.fromEntries(formatter(timezone).formatToParts(new Date(epoch))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function localPartsEpoch(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
}

function zonedDateToEpoch(parts, timezone) {
  const target = localPartsEpoch(parts);
  let candidate = target;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const represented = localPartsEpoch(zonedParts(candidate, timezone));
    const difference = target - represented;
    if (difference === 0) return candidate;
    candidate += difference;
  }
  return candidate;
}

function dailyTime(schedule = {}) {
  const match = String(schedule.time || '00:00').match(/^(\d{2}):(\d{2})$/);
  return { hour: Number(match?.[1] || 0), minute: Number(match?.[2] || 0) };
}

function shiftedDate(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function nextDailyRunAt(schedule, referenceAt, inclusive) {
  const timezone = String(schedule.timezone || 'UTC');
  formatter(timezone).format(new Date(referenceAt));
  const local = zonedParts(referenceAt, timezone);
  const time = dailyTime(schedule);
  const today = zonedDateToEpoch({ ...shiftedDate(local, 0), ...time, second: 0 }, timezone);
  if (today > referenceAt || (inclusive && today === referenceAt)) return today;
  return zonedDateToEpoch({ ...shiftedDate(local, 1), ...time, second: 0 }, timezone);
}

export function nextTradeRunAt(job = {}, referenceAtInput = Date.now(), options = {}) {
  const referenceAt = Math.max(0, finiteNumber(referenceAtInput, Date.now()));
  const inclusive = options.inclusive !== false;
  const schedule = job.schedule || {};
  if (schedule.type === 'manual') return null;
  if (schedule.type === 'once') {
    const runAt = Math.max(0, finiteNumber(schedule.runAt));
    return runAt > referenceAt || (inclusive && runAt === referenceAt) ? runAt : null;
  }
  if (schedule.type === 'daily') return nextDailyRunAt(schedule, referenceAt, inclusive);
  if (schedule.type === 'interval') {
    const period = positiveInteger(schedule.everyMinutes, 60) * 60_000;
    const anchorAt = Math.max(0, finiteNumber(schedule.anchorAt, job.createdAt));
    if (referenceAt < anchorAt || (inclusive && referenceAt === anchorAt)) return anchorAt;
    const elapsed = referenceAt - anchorAt;
    const steps = inclusive ? Math.ceil(elapsed / period) : Math.floor(elapsed / period) + 1;
    return anchorAt + Math.max(0, steps) * period;
  }
  if (schedule.type === 'window') {
    const startAt = Math.max(0, finiteNumber(schedule.startAt));
    const endAt = Math.max(startAt, finiteNumber(schedule.endAt, startAt));
    if (referenceAt > endAt || (!inclusive && referenceAt === endAt)) return null;
    return Math.max(startAt, referenceAt);
  }
  return null;
}

export function createTradeJobRuntime(job = {}, options = {}) {
  const now = Math.max(0, finiteNumber(options.now, Date.now()));
  return normalizeTradeJobRuntime({
    jobId: job.id,
    status: job.enabled === true && job.armed === true ? 'waiting-time' : 'disabled',
    reason: job.enabled === true && job.armed === true ? null : job.enabled === true ? 'not-armed' : 'job-disabled',
    nextRunAt: nextTradeRunAt(job, now),
    updatedAt: now,
  });
}

export function normalizeTradeJobRuntime(input = {}) {
  return {
    jobId: String(input.jobId || ''),
    status: RUNTIME_STATES.has(input.status) ? input.status : 'disabled',
    reason: input.reason === undefined || input.reason === null ? null : String(input.reason),
    nextRunAt: nullableEpoch(input.nextRunAt),
    lastScheduledFor: nullableEpoch(input.lastScheduledFor),
    lastStartedAt: nullableEpoch(input.lastStartedAt),
    lastFinishedAt: nullableEpoch(input.lastFinishedAt),
    lastRunId: input.lastRunId ? String(input.lastRunId) : null,
    runCount: Math.max(0, Math.floor(finiteNumber(input.runCount))),
    updatedAt: Math.max(0, finiteNumber(input.updatedAt)),
  };
}

export function evaluateTradeJob(job = {}, runtimeInput = {}, context = {}) {
  const runtime = normalizeTradeJobRuntime({ ...runtimeInput, jobId: job.id });
  const now = Math.max(0, finiteNumber(context.now, Date.now()));
  const result = (status, reason, action = 'wait') => ({
    status, reason, action, scheduledFor: runtime.nextRunAt, runtime: { ...runtime, status, reason, updatedAt: now },
  });
  if (job.enabled !== true) return result('disabled', 'job-disabled');
  if (job.armed !== true) return result('disabled', 'not-armed');
  if (context.circuitAllowed === false) return result('blocked', context.circuitReason || 'trade-circuit-open');
  if (context.liveExecutionEnabled === false) return result('blocked', 'live-execution-disabled');
  if (job.schedule?.type === 'manual') return result('armed', null);
  if (runtime.nextRunAt === null) return result('completed', null);
  if (runtime.nextRunAt > now) return result('waiting-time', null);
  if (context.sessionReady !== true) return result('waiting-session', context.sessionReason || 'ea-session-unavailable');
  if (context.operationBusy === true) return result('waiting-operation', context.operationReason || 'another-operation-active');
  if (context.requestBudgetReady === false) return result('cooldown', 'trade-request-budget-insufficient');

  const lateness = Math.max(0, now - runtime.nextRunAt);
  const tolerance = Math.max(0, finiteNumber(context.tickToleranceMs, 30_000));
  if (job.misfirePolicy?.type === 'skip' && lateness > tolerance) {
    return result('missed', 'misfire-skip', 'advance');
  }
  if (job.misfirePolicy?.type === 'grace-window') {
    const graceMs = positiveInteger(job.misfirePolicy.graceMinutes, 15) * 60_000;
    if (lateness > graceMs) return result('missed', 'misfire-grace-expired', 'advance');
  }
  return result('running', null, 'run');
}

export function advanceTradeJobRuntime(job = {}, runtimeInput = {}, input = {}) {
  const runtime = normalizeTradeJobRuntime(runtimeInput);
  const at = Math.max(0, finiteNumber(input.at, Date.now()));
  const scheduledFor = Math.max(0, finiteNumber(input.scheduledFor, runtime.nextRunAt));
  const nextRunAt = nextTradeRunAt(job, Math.max(at, scheduledFor + 1), { inclusive: true });
  return normalizeTradeJobRuntime({
    ...runtime,
    status: nextRunAt === null ? 'completed' : 'waiting-time',
    reason: input.reason || null,
    nextRunAt,
    lastScheduledFor: scheduledFor,
    lastStartedAt: input.startedAt ?? runtime.lastStartedAt,
    lastFinishedAt: input.finishedAt ?? at,
    lastRunId: input.runId ?? runtime.lastRunId,
    runCount: runtime.runCount + (input.countRun === false ? 0 : 1),
    updatedAt: at,
  });
}

export { RUNTIME_STATES as TRADE_RUNTIME_STATES };
