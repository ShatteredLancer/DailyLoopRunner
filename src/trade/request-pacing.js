export const TRADE_REQUEST_PACING_SCHEMA_VERSION = 1;
export const TRADE_REQUEST_PACING_KEY = 'fc-loop-runner-trade-request-pacing-v1';
export const TRADE_REQUEST_PACING_LOCK = 'fc-loop-runner-trade-request-pacing-v1';

const ACTIONS = new Set([
  'price-limits',
  'list',
  'bulk-relist',
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

function boundedText(value, limit = 80) {
  return value ? String(value).slice(0, limit) : null;
}

function normalizeRange(value, fallback = [0, 0], options = {}) {
  const values = Array.isArray(value) ? value : fallback;
  const floor = options.positive === true ? Number.MIN_VALUE : 0;
  const first = Math.max(floor, finiteNumber(values?.[0], fallback[0]));
  const second = Math.max(floor, finiteNumber(values?.[1], fallback[1]));
  return [Math.min(first, second), Math.max(first, second)];
}

function randomRange(range, random) {
  const [minimum, maximum] = normalizeRange(range);
  return minimum + (maximum - minimum) * Math.min(1, Math.max(0, finiteNumber(random(), 0)));
}

function normalizeRecord(input = {}, now = Date.now()) {
  const actions = {};
  for (const [name, entry] of Object.entries(input.actions || {})) {
    const action = actionName(name);
    if (action === 'unknown') continue;
    const at = Math.max(0, finiteNumber(entry?.at));
    if (!at) continue;
    actions[action] = {
      at,
      nextAllowedAt: Math.max(at, finiteNumber(entry?.nextAllowedAt, at)),
      delaySeconds: Math.max(0, finiteNumber(entry?.delaySeconds)),
      jobId: boundedText(entry?.jobId),
      runId: boundedText(entry?.runId),
      ownerId: boundedText(entry?.ownerId),
    };
  }
  const cooldownRetryAt = Math.max(0, finiteNumber(input.cooldown?.retryAt));
  const cooldown = cooldownRetryAt > 0 ? {
    level: Math.max(1, Math.floor(finiteNumber(input.cooldown?.level, 1))),
    startedAt: Math.max(0, finiteNumber(input.cooldown?.startedAt)),
    retryAt: cooldownRetryAt,
    action: actionName(input.cooldown?.action),
  } : null;
  const cycles = {};
  for (const [jobId, entry] of Object.entries(input.cycles || {}).slice(-100)) {
    const id = boundedText(jobId);
    if (!id) continue;
    cycles[id] = {
      count: Math.max(0, Math.floor(finiteNumber(entry?.count))),
      threshold: Math.max(1, Math.floor(finiteNumber(entry?.threshold, 1))),
      pauseUntil: Math.max(0, finiteNumber(entry?.pauseUntil)),
    };
  }
  return {
    schemaVersion: TRADE_REQUEST_PACING_SCHEMA_VERSION,
    actions,
    cooldown,
    cycles,
    healthySuccesses: Math.max(0, Math.floor(finiteNumber(input.healthySuccesses))),
    updatedAt: Math.max(0, finiteNumber(input.updatedAt)),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function tradeActionDelay(policy = {}, actionInput = '') {
  const action = actionName(actionInput);
  if (action === 'market-search') return normalizeRange(policy.searchDelaySeconds, [7, 15]);
  if (action === 'buy') return normalizeRange(policy.buyDelaySeconds, [0, 1]);
  if (action === 'list') return normalizeRange(policy.listingDelaySeconds, [3, 8]);
  if (action === 'bulk-relist') return normalizeRange(policy.relistDelaySeconds || policy.listingDelaySeconds, [3, 8]);
  return [0, 0];
}

export function createTradeRequestPacer(options = {}) {
  const storage = options.storage;
  const key = String(options.key || TRADE_REQUEST_PACING_KEY);
  const lockManager = options.lockManager;
  const lockName = String(options.lockName || TRADE_REQUEST_PACING_LOCK);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sleep = typeof options.sleep === 'function' ? options.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const random = typeof options.random === 'function' ? options.random : Math.random;
  let memory = normalizeRecord();

  function read(at = Number(now())) {
    const stored = storage?.get?.(key, null);
    if (stored && typeof stored === 'object') memory = normalizeRecord(stored, at);
    else memory = normalizeRecord(memory, at);
    return memory;
  }

  function write(record, at = Number(now())) {
    memory = normalizeRecord({ ...record, updatedAt: at }, at);
    storage?.set?.(key, clone(memory));
    return memory;
  }

  async function withLock(task) {
    if (typeof lockManager?.request !== 'function') return task();
    return lockManager.request(lockName, { mode: 'exclusive' }, task);
  }

  function cycleWait(record, context, at) {
    if (actionName(context.action) !== 'market-search' || !context.jobId) return null;
    const cycle = record.cycles[context.jobId];
    return cycle?.pauseUntil > at ? cycle.pauseUntil : null;
  }

  async function acquire(actionInput, context = {}) {
    const action = actionName(actionInput);
    const delayRange = normalizeRange(context.delaySeconds, [0, 0]);
    while (true) {
      const result = await withLock(() => {
        const at = Number(now());
        const record = read(at);
        if (record.cooldown?.retryAt > at) {
          return { allowed: false, reason: 'trade-rate-limit-cooldown', retryAt: record.cooldown.retryAt, cooldown: true };
        }
        const previous = record.actions[action];
        const actionNextAt = previous?.nextAllowedAt || 0;
        const pauseUntil = cycleWait(record, { ...context, action }, at) || 0;
        const nextAllowedAt = Math.max(actionNextAt, pauseUntil);
        if (nextAllowedAt > at) {
          return {
            allowed: false,
            deferred: context.wait === false,
            reason: pauseUntil >= actionNextAt ? 'trade-cycle-pause' : 'trade-action-pacing',
            retryAt: nextAllowedAt,
          };
        }

        const selectedDelay = randomRange(delayRange, random);
        const next = clone(record);
        next.actions[action] = {
          at,
          nextAllowedAt: at + Math.round(selectedDelay * 1000),
          delaySeconds: selectedDelay,
          jobId: boundedText(context.jobId),
          runId: boundedText(context.runId),
          ownerId: boundedText(context.ownerId),
        };
        if (action === 'market-search' && context.jobId && context.searchCyclePauseEnabled !== false) {
          const every = normalizeRange(context.searchCyclePauseEvery, [10, 15], { positive: true });
          const duration = normalizeRange(context.searchCyclePauseSeconds, [5, 8], { positive: true });
          const existing = next.cycles[context.jobId] || {
            count: 0,
            threshold: Math.max(1, Math.round(randomRange(every, random))),
            pauseUntil: 0,
          };
          existing.count += 1;
          existing.pauseUntil = 0;
          if (existing.count >= existing.threshold) {
            existing.count = 0;
            existing.threshold = Math.max(1, Math.round(randomRange(every, random)));
            existing.pauseUntil = at + Math.round(randomRange(duration, random) * 1000);
          }
          next.cycles[context.jobId] = existing;
        }
        write(next, at);
        return { allowed: true, action, at, nextAllowedAt: next.actions[action].nextAllowedAt, delaySeconds: selectedDelay };
      });
      if (result.allowed || result.cooldown) return result;
      if (result.deferred) return result;
      if (context.shouldStop?.() === true) return { ...result, reason: 'stopped-by-user' };
      try { context.onWait?.({ ...result, action }); } catch { }
      await sleep(Math.max(1, Number(result.retryAt) - Number(now())));
    }
  }

  async function recordRateLimit(actionInput, context = {}) {
    return withLock(() => {
      const at = Number(now());
      const record = read(at);
      const previousLevel = Math.max(0, Math.floor(finiteNumber(record.cooldown?.level)));
      const level = Math.min(16, previousLevel + 1);
      const initial = Math.max(1, finiteNumber(context.initialCooldownSeconds, 60));
      const maximum = Math.max(initial, finiteNumber(context.maximumCooldownSeconds, 1800));
      const durationSeconds = Math.min(maximum, initial * (2 ** (level - 1)));
      const retryAt = Math.max(record.cooldown?.retryAt || 0, at + durationSeconds * 1000);
      const next = write({
        ...record,
        cooldown: { level, startedAt: at, retryAt, action: actionName(actionInput) },
        healthySuccesses: 0,
      }, at);
      return { status: 'cooldown', level, retryAt, durationSeconds, record: clone(next) };
    });
  }

  async function recordSuccess() {
    return withLock(() => {
      const at = Number(now());
      const record = read(at);
      const healthySuccesses = record.healthySuccesses + 1;
      const cooldown = record.cooldown && healthySuccesses < 10
        ? record.cooldown
        : record.cooldown && record.cooldown.level > 1
          ? { ...record.cooldown, level: record.cooldown.level - 1, retryAt: at }
          : null;
      return clone(write({ ...record, cooldown, healthySuccesses: healthySuccesses >= 10 ? 0 : healthySuccesses }, at));
    });
  }

  function inspect(context = {}) {
    const at = Number(now());
    const record = read(at);
    const action = context.action ? actionName(context.action) : null;
    const actionState = action ? record.actions[action] || null : null;
    const cycle = context.jobId ? record.cycles[String(context.jobId)] || null : null;
    const activeCooldown = record.cooldown?.retryAt > at ? record.cooldown : null;
    const candidates = [activeCooldown?.retryAt, actionState?.nextAllowedAt, cycle?.pauseUntil]
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > at);
    const nextAllowedAt = candidates.length ? Math.max(...candidates) : null;
    return {
      schemaVersion: TRADE_REQUEST_PACING_SCHEMA_VERSION,
      capturedAt: at,
      status: activeCooldown ? 'cooldown' : nextAllowedAt ? 'waiting' : 'available',
      nextAllowedAt,
      reason: activeCooldown ? 'rate-limit' : cycle?.pauseUntil > at ? 'cycle-pause' : nextAllowedAt ? 'action-pacing' : null,
      cooldown: record.cooldown ? { ...clone(record.cooldown), active: Boolean(activeCooldown) } : null,
      lastAction: Object.entries(record.actions)
        .map(([name, entry]) => ({ action: name, ...entry }))
        .sort((left, right) => right.at - left.at)[0] || null,
      action: actionState ? { action, ...clone(actionState) } : null,
      cycle: cycle ? clone(cycle) : null,
      lock: { name: lockName, supported: typeof lockManager?.request === 'function' },
    };
  }

  return Object.freeze({ acquire, inspect, recordRateLimit, recordSuccess });
}
