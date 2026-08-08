import {
  classifyTradeError,
  createTradeCircuitState,
  reduceTradeCircuit,
  tradeCircuitAvailability,
} from './error-policy.js';

export const TRADE_CIRCUIT_SCHEMA_VERSION = 1;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeCapabilities(value = {}) {
  return {
    runtimeReady: value.runtimeReady === true,
    canTrade: value.canTrade === true,
    tradeAccess: {
      available: value.tradeAccess?.available === true,
      allowed: typeof value.tradeAccess?.allowed === 'boolean' ? value.tradeAccess.allowed : null,
      level: ['string', 'number', 'boolean'].includes(typeof value.tradeAccess?.level)
        ? value.tradeAccess.level
        : null,
    },
    transferCapacity: {
      used: Number.isFinite(Number(value.transferCapacity?.used)) ? Number(value.transferCapacity.used) : null,
      max: Number.isFinite(Number(value.transferCapacity?.max)) ? Number(value.transferCapacity.max) : null,
      free: Number.isFinite(Number(value.transferCapacity?.free)) ? Number(value.transferCapacity.free) : null,
    },
  };
}

function safeResponse(value = {}) {
  const status = Number(value.status ?? value.statusCode);
  const code = Number(value.code ?? value.error?.code);
  const result = {
    success: value.success === true,
    status: Number.isFinite(status) ? status : null,
    code: Number.isFinite(code) ? code : null,
  };
  const message = String(value.message || value.reason || '').trim();
  if (message) result.message = message.slice(0, 200);
  return result;
}

function safeEvent(input = {}, classification = {}) {
  return {
    at: Math.max(0, finiteNumber(input.at, Date.now())),
    action: String(input.action || 'unknown'),
    endpoint: String(input.endpoint || ''),
    jobId: input.jobId ? String(input.jobId) : null,
    runId: input.runId ? String(input.runId) : null,
    classification: {
      kind: String(classification.kind || 'service-error'),
      code: Number.isFinite(Number(classification.code)) ? Number(classification.code) : null,
      action: String(classification.action || 'stop'),
      retryable: classification.retryable === true,
      persistent: classification.persistent === true,
    },
    response: safeResponse(input.response),
    capabilities: safeCapabilities(input.capabilities),
  };
}

export function normalizeTradeCircuitRecord(input = {}) {
  return {
    schemaVersion: TRADE_CIRCUIT_SCHEMA_VERSION,
    circuit: createTradeCircuitState(input.circuit),
    recentEvents: (Array.isArray(input.recentEvents) ? input.recentEvents : [])
      .slice(-20)
      .map((event) => safeEvent(event, event.classification)),
    updatedAt: Math.max(0, finiteNumber(input.updatedAt, 0)),
    reset: input.reset ? {
      at: Math.max(0, finiteNumber(input.reset.at, 0)),
      reason: String(input.reset.reason || 'manual'),
    } : null,
  };
}

export function createTradeCircuitBreaker(options = {}) {
  const storage = options.storage;
  const key = String(options.key || 'fc-loop-runner-trade-circuit-v1');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const config = options.config || {};
  let memory = normalizeTradeCircuitRecord();

  function read() {
    const stored = storage?.get?.(key, null);
    if (stored && typeof stored === 'object') memory = normalizeTradeCircuitRecord(stored);
    return normalizeTradeCircuitRecord(memory);
  }

  function write(record) {
    memory = normalizeTradeCircuitRecord(record);
    storage?.set?.(key, clone(memory));
    return read();
  }

  function snapshot() {
    const record = read();
    const availability = tradeCircuitAvailability(record.circuit, now());
    if (JSON.stringify(availability.state) !== JSON.stringify(record.circuit)) {
      return write({ ...record, circuit: availability.state, updatedAt: now() });
    }
    return record;
  }

  function availability() {
    const record = snapshot();
    const result = tradeCircuitAvailability(record.circuit, now());
    return { ...result, record };
  }

  function recordFailure(error = {}, context = {}) {
    const at = Math.max(0, finiteNumber(context.at, now()));
    const classification = context.classification || classifyTradeError(error);
    const record = read();
    const event = safeEvent({ ...context, at }, classification);
    return write({
      ...record,
      circuit: reduceTradeCircuit(record.circuit, { type: 'failure', at, classification }, config),
      recentEvents: [...record.recentEvents, event].slice(-20),
      updatedAt: at,
      reset: null,
    });
  }

  function recordSuccess(context = {}) {
    const record = read();
    if (record.circuit.persistent) return record;
    const at = Math.max(0, finiteNumber(context.at, now()));
    return write({
      ...record,
      circuit: reduceTradeCircuit(record.circuit, { type: 'success', at }, config),
      updatedAt: at,
    });
  }

  function reset(reason = 'manual') {
    const at = Math.max(0, finiteNumber(now(), Date.now()));
    return write({
      schemaVersion: TRADE_CIRCUIT_SCHEMA_VERSION,
      circuit: createTradeCircuitState(),
      recentEvents: read().recentEvents,
      updatedAt: at,
      reset: { at, reason: String(reason || 'manual') },
    });
  }

  return Object.freeze({ availability, recordFailure, recordSuccess, reset, snapshot });
}
