import { describe, expect, it } from 'vitest';
import { createTradeRunLease } from '../../src/trade/run-lease.js';

function memoryStorage() {
  const values = new Map();
  return { get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback, set: (key, value) => value === null ? values.delete(key) : values.set(key, value), remove: (key) => values.delete(key) };
}

describe('Trade Run Lease', () => {
  it('prevents a second tab from acquiring an active lease and requires recovery after expiry', () => {
    const storage = memoryStorage();
    let time = 1000;
    const first = createTradeRunLease({ storage, key: 'lease', ownerId: 'tab-a', now: () => time, ttlMs: 5000, createToken: () => 'token-a' });
    const second = createTradeRunLease({ storage, key: 'lease', ownerId: 'tab-b', now: () => time, ttlMs: 5000, createToken: () => 'token-b' });
    expect(first.acquire({ runId: 'run-a', jobId: 'job-a' })).toMatchObject({ acquired: true, recoveryRequired: false });
    expect(JSON.stringify(first.inspect())).not.toContain('token-a');
    expect(second.acquire({ runId: 'run-b', jobId: 'job-b' })).toMatchObject({ acquired: false, reason: 'lease-held' });
    time = 7000;
    expect(second.acquire({ runId: 'run-b', jobId: 'job-b' })).toMatchObject({
      acquired: false, reason: 'expired-lease-reconciliation-required', recoveryRequired: true,
      previousLease: { runId: 'run-a', ownerId: 'tab-a' },
    });
    expect(second.inspect()).toMatchObject({ expired: true, lease: { runId: 'run-a', ownerId: 'tab-a' } });
    expect(JSON.stringify(second.inspect())).not.toContain('token-a');
    expect(second.heartbeat('run-b')).toBe(false);
    expect(second.clearExpired('run-a')).toBe(true);
    expect(second.acquire({ runId: 'run-b', jobId: 'job-b' })).toMatchObject({ acquired: true, recoveryRequired: false });
    expect(second.release('run-b')).toBe(true);
  });

  it('clears only an expired matching Run', () => {
    const storage = memoryStorage();
    let time = 1000;
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'tab-a', now: () => time, ttlMs: 5000, createToken: () => 'token-a' });
    lease.acquire({ runId: 'run-a', jobId: 'job-a' });
    expect(lease.clearExpired('run-a')).toBe(false);
    time = 7000;
    expect(lease.clearExpired('other-run')).toBe(false);
    expect(lease.clearExpired('run-a')).toBe(true);
    expect(lease.inspect().lease).toBeNull();
  });
});
