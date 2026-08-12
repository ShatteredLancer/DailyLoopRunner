export const TRADE_REQUEST_BUDGET_SCHEMA_VERSION = 1;
export const TRADE_REQUEST_BUDGET_LIMIT = 30;
export const TRADE_REQUEST_BUDGET_WINDOW_MS = 5 * 60_000;
export const TRADE_RUN_REQUEST_RESERVE = 12;
export const TRADE_REQUEST_BUDGET_LOCK = 'fc-loop-runner-trade-request-budget-v1';

const ACTIONS = new Set([
  'reserved',
  'price-limits',
  'list',
  'transfer-refresh',
  'market-search',
  'buy',
  'purchase-refresh',
  'purchase-route',
]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function actionName(value) {
  const action = String(value || 'unknown');
  return ACTIONS.has(action) ? action : 'unknown';
}

function normalizeRequests(input, now, windowMs, limit) {
  const windowStart = now - windowMs;
  return (Array.isArray(input) ? input : [])
    .map((entry) => ({
      at: Math.max(0, finiteNumber(entry?.at)),
      action: actionName(entry?.action),
      reservationId: entry?.reservationId ? String(entry.reservationId) : null,
    }))
    .filter((entry) => entry.at > windowStart && entry.at <= now)
    .sort((left, right) => left.at - right.at)
    .slice(-limit);
}

export function inspectTradeRequestCapacity(snapshot = {}, requiredInput = TRADE_RUN_REQUEST_RESERVE) {
  const required = Math.max(1, Math.floor(finiteNumber(requiredInput, TRADE_RUN_REQUEST_RESERVE)));
  const remaining = Math.max(0, Math.floor(finiteNumber(snapshot.remaining)));
  const runCapacity = snapshot.runCapacity?.required === required ? snapshot.runCapacity : null;
  return {
    ready: remaining >= required,
    required,
    remaining,
    retryAt: (runCapacity?.retryAt ?? snapshot.retryAt) === null
      || (runCapacity?.retryAt ?? snapshot.retryAt) === undefined
      ? null
      : Math.max(0, finiteNumber(runCapacity?.retryAt ?? snapshot.retryAt)),
    reason: remaining >= required ? null : 'trade-request-budget-insufficient',
  };
}

export function tradeListingRequestReserve(input = {}) {
  const value = typeof input === 'number' ? input : input.policy?.maxListings ?? input.maxListings;
  // Reservations are per verified two-item chunk, never for the whole Run.
  const quantity = Math.min(2, Math.max(1, Math.floor(finiteNumber(value, 1))));
  return Math.max(TRADE_RUN_REQUEST_RESERVE, 1 + quantity * 5);
}

export function tradeBuyRequestReserve(input = {}) {
  const policy = input.policy || input;
  // Reservations are per verified two-item chunk, never for the whole Run.
  const quantity = Math.min(2, Math.max(1, Math.floor(finiteNumber(policy.quantity, 1))));
  const emptySearches = Math.min(5, Math.max(1, Math.floor(finiteNumber(policy.maxConsecutiveEmptySearches, 5))));
  // Each item can consume empty searches, one successful search, Buy, broad ambiguity refresh,
  // route and route verification. Reserving the worst case prevents a partial mutation from
  // becoming unverifiable because another tab consumed the remaining shared budget.
  return Math.min(TRADE_REQUEST_BUDGET_LIMIT, quantity * (emptySearches + 9));
}

export function createTradeRequestBudget(options = {}) {
  const storage = options.storage;
  const key = String(options.key || 'fc-loop-runner-trade-request-budget-v1');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const limit = Math.max(1, Math.floor(finiteNumber(options.limit, TRADE_REQUEST_BUDGET_LIMIT)));
  const windowMs = Math.max(1000, Math.floor(finiteNumber(options.windowMs, TRADE_REQUEST_BUDGET_WINDOW_MS)));
  const lockManager = options.lockManager;
  const lockName = String(options.lockName || TRADE_REQUEST_BUDGET_LOCK);
  const createReservationId = typeof options.createReservationId === 'function'
    ? options.createReservationId
    : () => `request-reservation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let memory = { schemaVersion: TRADE_REQUEST_BUDGET_SCHEMA_VERSION, requests: [] };

  function readRequests(at) {
    const stored = storage?.get?.(key, null);
    if (stored && typeof stored === 'object') memory = stored;
    return normalizeRequests(memory.requests, at, windowMs, limit);
  }

  function writeRequests(requests) {
    memory = { schemaVersion: TRADE_REQUEST_BUDGET_SCHEMA_VERSION, requests };
    storage?.set?.(key, memory);
  }

  function snapshotFrom(requests, at) {
    const used = requests.length;
    const remaining = Math.max(0, limit - used);
    const retryAt = used >= limit && requests.length ? requests[0].at + windowMs : null;
    const runRequired = Math.min(limit, TRADE_RUN_REQUEST_RESERVE);
    const runSlotsToRecover = Math.max(0, runRequired - remaining);
    const runRetryAt = runSlotsToRecover > 0
      ? requests[runSlotsToRecover - 1]?.at + windowMs
      : null;
    const byAction = {};
    for (const request of requests) byAction[request.action] = (byAction[request.action] || 0) + 1;
    return {
      schemaVersion: TRADE_REQUEST_BUDGET_SCHEMA_VERSION,
      capturedAt: at,
      status: remaining > 0 ? 'available' : 'cooldown',
      limit,
      windowMs,
      used,
      remaining,
      retryAt,
      runCapacity: {
        required: runRequired,
        ready: remaining >= runRequired,
        retryAt: runRetryAt || null,
      },
      byAction,
      lastRequestAt: requests.length ? requests[requests.length - 1].at : null,
      lock: { name: lockName, supported: typeof lockManager?.request === 'function' },
    };
  }

  function inspect() {
    const at = Math.max(0, finiteNumber(now(), Date.now()));
    return snapshotFrom(readRequests(at), at);
  }

  async function withLock(task) {
    if (typeof lockManager?.request !== 'function') return task();
    return lockManager.request(lockName, { mode: 'exclusive' }, task);
  }

  function takeWithoutLock(actionInput, reservationId = null) {
    const action = actionName(actionInput);
    const at = Math.max(0, finiteNumber(now(), Date.now()));
    const requests = readRequests(at);
    if (reservationId) {
      const reservedIndex = requests.findIndex((entry) => entry.reservationId === reservationId && entry.action === 'reserved');
      if (reservedIndex >= 0) {
        requests[reservedIndex] = { at, action, reservationId: null };
        writeRequests(requests);
        const snapshot = snapshotFrom(requests, at);
        return { allowed: true, action, remaining: snapshot.remaining, retryAt: snapshot.retryAt, reserved: true };
      }
      const snapshot = snapshotFrom(requests, at);
      return { allowed: false, action, remaining: snapshot.remaining, retryAt: snapshot.retryAt, reserved: false };
    }
    if (requests.length >= limit) {
      const snapshot = snapshotFrom(requests, at);
      return { allowed: false, action, remaining: snapshot.remaining, retryAt: snapshot.retryAt, reserved: false };
    }
    requests.push({ at, action, reservationId: null });
    writeRequests(requests);
    const snapshot = snapshotFrom(requests, at);
    return { allowed: true, action, remaining: snapshot.remaining, retryAt: snapshot.retryAt, reserved: false };
  }

  async function take(actionInput) {
    return withLock(() => takeWithoutLock(actionInput));
  }

  async function reserve(countInput = TRADE_RUN_REQUEST_RESERVE) {
    const count = Math.max(1, Math.floor(finiteNumber(countInput, TRADE_RUN_REQUEST_RESERVE)));
    const reservationId = String(createReservationId());
    const acquired = await withLock(() => {
      const at = Math.max(0, finiteNumber(now(), Date.now()));
      const requests = readRequests(at);
      if (requests.length + count > limit) {
        const snapshot = snapshotFrom(requests, at);
        const slotsToRecover = Math.max(0, count - snapshot.remaining);
        const retryAt = slotsToRecover > 0
          ? requests[slotsToRecover - 1]?.at + windowMs
          : null;
        return { ready: false, required: count, remaining: snapshot.remaining, retryAt: retryAt || null };
      }
      for (let index = 0; index < count; index += 1) {
        requests.push({ at, action: 'reserved', reservationId });
      }
      writeRequests(requests);
      const snapshot = snapshotFrom(requests, at);
      return { ready: true, required: count, remaining: snapshot.remaining, retryAt: snapshot.retryAt };
    });
    if (!acquired.ready) return acquired;
    let released = false;
    return Object.freeze({
      ...acquired,
      async take(action) {
        if (released) return { allowed: false, action: actionName(action), remaining: inspect().remaining, retryAt: inspect().retryAt, reserved: false };
        return withLock(() => takeWithoutLock(action, reservationId));
      },
      async release() {
        if (released) return inspect();
        released = true;
        return withLock(() => {
          const at = Math.max(0, finiteNumber(now(), Date.now()));
          const requests = readRequests(at).filter((entry) => entry.reservationId !== reservationId);
          writeRequests(requests);
          return snapshotFrom(requests, at);
        });
      },
    });
  }

  return Object.freeze({ inspect, take, reserve });
}
