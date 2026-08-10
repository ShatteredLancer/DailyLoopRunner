export const TRADE_SCHEDULER_EVENT_LIMIT = 100;

const RUNTIME_STATUS_PRIORITY = [
  'running',
  'waiting-operation',
  'waiting-session',
  'waiting-time',
  'armed',
  'blocked',
  'completed',
  'missed',
  'disabled',
];

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalString(value) {
  return value === undefined || value === null || value === '' ? null : String(value);
}

function normalizeEvent(input = {}, at = Date.now()) {
  const timestamp = Math.max(0, finiteNumber(input.at, at));
  return {
    firstAt: Math.max(0, finiteNumber(input.firstAt, timestamp)),
    at: timestamp,
    count: Math.max(1, Math.floor(finiteNumber(input.count, 1))),
    trigger: optionalString(input.trigger) || 'unknown',
    status: optionalString(input.status) || 'unknown',
    reason: optionalString(input.reason),
    jobId: optionalString(input.jobId),
    runId: optionalString(input.runId),
    runtimeStatus: optionalString(input.runtimeStatus),
    runtimeReason: optionalString(input.runtimeReason),
    runtimeNextRunAt: input.runtimeNextRunAt === undefined || input.runtimeNextRunAt === null
      ? null
      : Math.max(0, finiteNumber(input.runtimeNextRunAt)),
  };
}

function eventSignature(event = {}) {
  return JSON.stringify([
    event.trigger,
    event.status,
    event.reason,
    event.jobId,
    event.runId,
    event.runtimeStatus,
    event.runtimeReason,
    event.runtimeNextRunAt,
  ]);
}

export function createTradeSchedulerEventLog(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const limit = Math.max(1, Math.floor(finiteNumber(options.limit, TRADE_SCHEDULER_EVENT_LIMIT)));
  let events = [];

  function record(input = {}) {
    const event = normalizeEvent(input, Number(now()));
    const previous = events.at(-1);
    if (previous && eventSignature(previous) === eventSignature(event)) {
      const merged = {
        ...event,
        firstAt: previous.firstAt,
        count: previous.count + 1,
      };
      events = [...events.slice(0, -1), merged];
      return { ...merged };
    }
    events = [...events, event].slice(-limit);
    return { ...event };
  }

  function snapshot() {
    return events.map((event) => ({ ...event }));
  }

  return Object.freeze({ record, snapshot });
}

export function summarizeTradeSchedulerRuntime(snapshot = {}, preferredJobId = null) {
  const runtimes = snapshot?.runtimes && typeof snapshot.runtimes === 'object' ? snapshot.runtimes : {};
  const entries = Object.entries(runtimes);
  let selected = preferredJobId && runtimes[String(preferredJobId)]
    ? [String(preferredJobId), runtimes[String(preferredJobId)]]
    : null;
  if (!selected) {
    for (const status of RUNTIME_STATUS_PRIORITY) {
      selected = entries.find(([, runtime]) => runtime?.status === status);
      if (selected) break;
    }
  }
  if (!selected) return {};
  const [jobId, runtime] = selected;
  return {
    jobId,
    runtimeStatus: optionalString(runtime?.status),
    runtimeReason: optionalString(runtime?.reason),
    runtimeNextRunAt: runtime?.nextRunAt ?? null,
  };
}
