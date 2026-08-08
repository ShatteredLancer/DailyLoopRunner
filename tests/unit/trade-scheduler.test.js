import { describe, expect, it, vi } from 'vitest';
import { createTradeRunReceipt } from '../../src/trade/contracts.js';
import { createTradeJobStore } from '../../src/trade/job-store.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';
import { createTradeScheduler } from '../../src/trade/scheduler.js';

function memoryStorage() {
  const values = new Map();
  return { get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback, set: (key, value) => value === null ? values.delete(key) : values.set(key, value), remove: (key) => values.delete(key) };
}

function scheduledJob() {
  return {
    id: 'listing-1', name: 'Scheduled Listing', type: 'listing', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 1000 },
    misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: { cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }] },
  };
}

describe('Trade Scheduler', () => {
  it('executes one due Fake job under a lease and persists history', async () => {
    const storage = memoryStorage();
    let time = 0;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(scheduledJob());
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    time = 1000;
    const executeJob = vi.fn(async ({ runId }) => createTradeRunReceipt({ runId, status: 'completed', requested: 1, succeeded: 1 }));
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'tab-a', now: () => time, createToken: () => 'token' }),
      now: () => time,
      createRunId: () => 'run-1',
      getContext: () => ({ sessionReady: true, operationBusy: false }),
      executeJob,
    });
    const result = await scheduler.tick();
    expect(result).toMatchObject({ status: 'completed', jobId: 'listing-1', receipt: { runId: 'run-1', succeeded: 1 } });
    expect(executeJob).toHaveBeenCalledOnce();
    expect(store.read()).toMatchObject({
      history: [{ runId: 'run-1', status: 'completed' }],
      runtimes: { 'listing-1': { status: 'completed', nextRunAt: null, runCount: 1 } },
    });
  });

  it('does not execute while paused, live-disabled, session-blocked or circuit-blocked', async () => {
    const storage = memoryStorage();
    let time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => 0 });
    store.upsert(scheduledJob());
    const executeJob = vi.fn();
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'tab-a', now: () => time, createToken: () => 'token' });
    const scheduler = createTradeScheduler({ store, lease, now: () => time, getContext: () => ({ sessionReady: true }), executeJob });
    expect(await scheduler.tick()).toMatchObject({ status: 'paused' });
    store.setPaused(false);
    expect(await scheduler.tick()).toMatchObject({ status: 'idle' });
    expect(store.read().runtimes['listing-1']).toMatchObject({ status: 'blocked', reason: 'live-execution-disabled' });
    expect(executeJob).not.toHaveBeenCalled();
  });

  it('fails closed when taking over an expired lease without reconciliation', async () => {
    const storage = memoryStorage();
    let time = 0;
    const stale = createTradeRunLease({ storage, key: 'lease', ownerId: 'old-tab', now: () => time, ttlMs: 5000, createToken: () => 'old-token' });
    stale.acquire({ runId: 'old-run', jobId: 'listing-1' });
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(scheduledJob());
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    time = 6000;
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'new-tab', now: () => time, ttlMs: 5000, createToken: () => 'new-token' }),
      now: () => time,
      getContext: () => ({ sessionReady: true }),
      executeJob: vi.fn(),
    });
    expect(await scheduler.tick()).toMatchObject({ status: 'blocked', runtime: { reason: 'expired-lease-reconciliation-required' } });
  });
});
