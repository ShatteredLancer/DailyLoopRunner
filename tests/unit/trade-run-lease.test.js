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
    expect(second.acquire({ runId: 'run-b', jobId: 'job-b' })).toMatchObject({ acquired: false, reason: 'lease-held' });
    time = 7000;
    expect(second.acquire({ runId: 'run-b', jobId: 'job-b' })).toMatchObject({
      acquired: true, recoveryRequired: true, previousLease: { runId: 'run-a', ownerId: 'tab-a' },
    });
    expect(second.heartbeat('run-b')).toBe(true);
    expect(first.release('run-a')).toBe(false);
    expect(second.release('run-b')).toBe(true);
  });
});
