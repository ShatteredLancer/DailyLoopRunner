import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { reconcileExpiredPreBuyLease } from '../../src/trade/buy-lease-recovery.js';
import { createTradeJobStore } from '../../src/trade/job-store.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function buyJob() {
  return normalizeTradeJob({
    id: 'buy-1', name: 'Buy one', type: 'buy', enabled: true, armed: false,
    schedule: { type: 'manual' },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 5,
      searchDelaySeconds: [8, 15], maxConsecutiveEmptySearches: 5,
    },
  }, { now: 1 });
}

describe('Trade Buy expired pre-mutation lease recovery', () => {
  it('records and clears a crashed Buy Run that never heartbeat', () => {
    const storage = memoryStorage();
    let time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(buyJob());
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'old-tab', now: () => time, ttlMs: 5000, createToken: () => 'token' });
    lease.acquire({ runId: 'crashed-buy', jobId: 'buy-1' });
    time = 7000;

    const result = reconcileExpiredPreBuyLease({ lease, store, now: () => time });

    expect(result).toMatchObject({
      status: 'reconciled',
      receipt: { runId: 'crashed-buy', status: 'blocked', reason: 'browser-terminated-before-buy-heartbeat', requested: 0 },
    });
    expect(lease.inspect().lease).toBeNull();
    expect(store.read().history).toEqual([expect.objectContaining({ runId: 'crashed-buy', requested: 0 })]);
    expect(JSON.stringify(store.read())).not.toContain('token');
  });

  it('does not clear an expired Run that crossed the Buy heartbeat boundary', () => {
    const storage = memoryStorage();
    let time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(buyJob());
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'old-tab', now: () => time, ttlMs: 5000, createToken: () => 'token' });
    lease.acquire({ runId: 'ambiguous-buy', jobId: 'buy-1' });
    time = 2000;
    lease.heartbeat('ambiguous-buy');
    time = 8000;

    expect(reconcileExpiredPreBuyLease({ lease, store, now: () => time })).toMatchObject({
      status: 'blocked', reason: 'expired-lease-crossed-buy-boundary', receipt: null,
    });
    expect(lease.inspect()).toMatchObject({ expired: true, lease: { runId: 'ambiguous-buy', heartbeatAt: 2000 } });
    expect(store.read().history).toEqual([]);
  });
});
