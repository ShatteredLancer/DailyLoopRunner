import { normalizeTradeJob } from './contracts.js';
import { createTradeJobRuntime, normalizeTradeJobRuntime } from './schedule.js';

export const TRADE_JOB_STORE_SCHEMA_VERSION = 1;
export const TRADE_HISTORY_LIMIT = 100;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function relockedSnapshot(snapshot, at) {
  const jobs = snapshot.jobs.map((job) => job.armed === true ? { ...job, armed: false, updatedAt: at } : job);
  const runtimes = { ...snapshot.runtimes };
  for (const job of snapshot.jobs) {
    const runtime = runtimes[job.id];
    if (job.armed !== true || !runtime || !['armed', 'waiting-time', 'waiting-session', 'waiting-operation', 'running'].includes(runtime.status)) continue;
    runtimes[job.id] = normalizeTradeJobRuntime({
      ...runtime,
      status: 'disabled',
      reason: 'not-armed',
      updatedAt: at,
    });
  }
  return { ...snapshot, paused: true, liveExecutionEnabled: false, jobs, runtimes };
}

export function normalizeTradeJobStore(input = {}, options = {}) {
  const now = Math.max(0, finiteNumber(options.now, Date.now()));
  const jobs = [];
  for (const raw of Array.isArray(input.jobs) ? input.jobs : []) {
    try { jobs.push(normalizeTradeJob(raw, { now: raw?.updatedAt ?? now })); } catch { }
  }
  const runtimes = {};
  for (const job of jobs) {
    const persisted = input.runtimes?.[job.id];
    runtimes[job.id] = persisted
      ? normalizeTradeJobRuntime({ ...persisted, jobId: job.id })
      : createTradeJobRuntime(job, { now });
  }
  return {
    schemaVersion: TRADE_JOB_STORE_SCHEMA_VERSION,
    paused: input.paused !== false,
    liveExecutionEnabled: input.liveExecutionEnabled === true,
    jobs,
    runtimes,
    history: (Array.isArray(input.history) ? input.history : []).slice(-TRADE_HISTORY_LIMIT).map(clone),
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
    if (value && typeof value === 'object') memory = normalizeTradeJobStore(value, { now: now() });
    return clone(memory);
  }

  function write(value) {
    memory = normalizeTradeJobStore({ ...value, updatedAt: now() }, { now: now() });
    storage?.set?.(key, clone(memory));
    return read();
  }

  function upsert(input, normalizeOptions = {}) {
    let snapshot = read();
    const relockedForChange = snapshot.liveExecutionEnabled === true;
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
      [job.id]: scheduleChanged
        ? createTradeJobRuntime(job, { now: now() })
        : normalizeTradeJobRuntime({ ...snapshot.runtimes[job.id], jobId: job.id }),
    };
    return { job: clone(job), snapshot: write({ ...snapshot, jobs, runtimes }) };
  }

  function remove(jobId) {
    const id = String(jobId || '');
    const current = read();
    const snapshot = current.liveExecutionEnabled === true
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
    return write({ ...snapshot, history: [...snapshot.history, clone(receipt)].slice(-TRADE_HISTORY_LIMIT) });
  }

  function setPaused(value) {
    return write({ ...read(), paused: value !== false });
  }

  function setLiveExecutionEnabled(value) {
    return write({ ...read(), liveExecutionEnabled: value === true });
  }

  function relock() {
    return write(relockedSnapshot(read(), Number(now())));
  }

  return Object.freeze({ read, upsert, remove, updateRuntime, addHistory, setPaused, setLiveExecutionEnabled, relock });
}
