export const TRADE_RUN_LEASE_SCHEMA_VERSION = 1;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeLease(input = {}) {
  if (!input || typeof input !== 'object' || !input.ownerId || !input.runId) return null;
  return {
    schemaVersion: TRADE_RUN_LEASE_SCHEMA_VERSION,
    ownerId: String(input.ownerId),
    runId: String(input.runId),
    jobId: String(input.jobId || ''),
    token: String(input.token || ''),
    acquiredAt: Math.max(0, finiteNumber(input.acquiredAt)),
    heartbeatAt: Math.max(0, finiteNumber(input.heartbeatAt)),
    expiresAt: Math.max(0, finiteNumber(input.expiresAt)),
  };
}

function leaseSnapshot(lease) {
  if (!lease) return null;
  return {
    schemaVersion: lease.schemaVersion,
    ownerId: lease.ownerId,
    runId: lease.runId,
    jobId: lease.jobId,
    acquiredAt: lease.acquiredAt,
    heartbeatAt: lease.heartbeatAt,
    expiresAt: lease.expiresAt,
  };
}

export function createTradeRunLease(options = {}) {
  const storage = options.storage;
  const key = String(options.key || 'fc-loop-runner-trade-run-lease-v1');
  const ownerId = String(options.ownerId || 'unknown-owner');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const ttlMs = Math.max(5_000, finiteNumber(options.ttlMs, 30_000));
  const createToken = typeof options.createToken === 'function'
    ? options.createToken
    : () => `${ownerId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function read() {
    return normalizeLease(storage?.get?.(key, null));
  }

  function write(value) {
    storage?.set?.(key, value);
  }

  function inspect() {
    const lease = read();
    const at = Number(now());
    return {
      lease: leaseSnapshot(lease),
      active: Boolean(lease && lease.expiresAt > at),
      owned: Boolean(lease && lease.ownerId === ownerId && lease.expiresAt > at),
      expired: Boolean(lease && lease.expiresAt <= at),
    };
  }

  function acquire(input = {}) {
    const at = Number(now());
    const before = inspect();
    if (before.active && !before.owned) return { acquired: false, reason: 'lease-held', ...before };
    const lease = normalizeLease({
      ownerId,
      runId: input.runId,
      jobId: input.jobId,
      token: createToken(),
      acquiredAt: at,
      heartbeatAt: at,
      expiresAt: at + ttlMs,
    });
    write(lease);
    const confirmed = read();
    const acquired = Boolean(confirmed && confirmed.ownerId === ownerId && confirmed.token === lease.token);
    return {
      acquired,
      reason: acquired ? null : 'lease-race-lost',
      lease: leaseSnapshot(confirmed),
      recoveryRequired: acquired && before.expired,
      previousLease: before.expired ? before.lease : null,
    };
  }

  function heartbeat(runId) {
    const current = read();
    const at = Number(now());
    if (!current || current.ownerId !== ownerId || current.runId !== String(runId) || current.expiresAt <= at) return false;
    write({ ...current, heartbeatAt: at, expiresAt: at + ttlMs });
    return true;
  }

  function release(runId) {
    const current = read();
    if (!current || current.ownerId !== ownerId || current.runId !== String(runId)) return false;
    storage?.remove?.(key);
    if (read()) write(null);
    return read() === null;
  }

  return Object.freeze({ acquire, heartbeat, inspect, release });
}
