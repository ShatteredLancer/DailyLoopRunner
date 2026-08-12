import { describe, expect, it, vi } from 'vitest';
import { createTradeRunReceipt, normalizeTradeJob } from '../../src/trade/contracts.js';
import { createTradeJobStore } from '../../src/trade/job-store.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';
import { createTradeScheduler } from '../../src/trade/scheduler.js';

function memoryStorage() {
  const values = new Map();
  return { get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback, set: (key, value) => value === null ? values.delete(key) : values.set(key, value), remove: (key) => values.delete(key) };
}

function scheduledJob(overrides = {}) {
  return {
    id: 'listing-1', name: 'Scheduled Listing', type: 'listing', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 1000 },
    misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: { cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }] },
    ...overrides,
  };
}

function scheduledBuyJob(overrides = {}) {
  return {
    id: 'buy-1', name: 'Scheduled Buy', type: 'buy', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 1000 },
    misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      ratingMin: 84, ratingMax: 84, cardClass: 'rare-gold', maxBuyNow: 1000,
      ratingPriceOverrides: {}, quantity: 1, totalBudget: 1000,
      maxRuntimeMinutes: 5, searchDelaySeconds: [8, 15],
      maxPurchasesPerSearch: 1, maxConsecutiveEmptySearches: 5,
    },
    ...overrides,
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
    const executeJob = vi.fn();
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'new-tab', now: () => time, ttlMs: 5000, createToken: () => 'new-token' }),
      now: () => time,
      getContext: () => ({ sessionReady: true }),
      executeJob,
    });
    expect(await scheduler.tick()).toMatchObject({
      status: 'blocked',
      receipt: {
        status: 'blocked',
        reason: 'expired-lease-reconciliation-required',
        receipts: [{
          previousLease: {
            runId: 'old-run',
            jobId: 'listing-1',
            acquiredAt: 0,
            heartbeatAt: 0,
            expiresAt: 5000,
          },
        }],
      },
      runtime: { reason: 'expired-lease-reconciliation-required', lastRunId: expect.any(String) },
    });
    expect(store.read().history).toEqual([expect.objectContaining({
      status: 'blocked', reason: 'expired-lease-reconciliation-required',
    })]);
    expect(JSON.stringify(store.read().history)).not.toContain('old-token');
    expect(executeJob).not.toHaveBeenCalled();
  });

  it('executes exactly once when a page resumes inside the grace window', async () => {
    const storage = memoryStorage();
    let time = 0;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(scheduledJob());
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    time = 61_000;
    const executeJob = vi.fn(async ({ runId }) => createTradeRunReceipt({
      runId, status: 'completed', requested: 1, succeeded: 1, finishedAt: time,
    }));
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'resumed-tab', now: () => time, createToken: () => 'resume-token' }),
      now: () => time,
      createRunId: () => 'resumed-run',
      getContext: () => ({ sessionReady: true, operationBusy: false, tickToleranceMs: 15_000 }),
      executeJob,
    });
    expect(await scheduler.tick()).toMatchObject({
      status: 'completed', receipt: { runId: 'resumed-run', scheduledFor: 1000, succeeded: 1 },
    });
    expect(await scheduler.tick()).toMatchObject({ status: 'idle' });
    expect(executeJob).toHaveBeenCalledOnce();
    expect(store.read().history).toHaveLength(1);
  });

  it('records a missed run without execution when a page resumes after skip tolerance', async () => {
    const storage = memoryStorage();
    let time = 0;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(scheduledJob({ misfirePolicy: { type: 'skip' } }));
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    time = 16_001;
    const executeJob = vi.fn();
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'late-tab', now: () => time }),
      now: () => time,
      createRunId: () => 'missed-run',
      getContext: () => ({ sessionReady: true, operationBusy: false, tickToleranceMs: 15_000 }),
      executeJob,
    });
    expect(await scheduler.tick()).toMatchObject({
      status: 'missed',
      receipt: { runId: 'missed-run', scheduledFor: 1000, status: 'missed', reason: 'misfire-skip' },
      runtime: { nextRunAt: null, runCount: 0 },
    });
    expect(await scheduler.tick()).toMatchObject({ status: 'paused' });
    expect(executeJob).not.toHaveBeenCalled();
    expect(store.read().history).toEqual([expect.objectContaining({ status: 'missed', reason: 'misfire-skip' })]);
    expect(store.read()).toMatchObject({ paused: true, liveExecutionEnabled: false, jobs: [{ armed: false }] });
  });

  it('runs exactly two authorized interval occurrences and cannot dispatch a third', async () => {
    const storage = memoryStorage();
    let time = 1000;
    const recurring = normalizeTradeJob({
      ...scheduledJob(),
      id: 'recurring-two',
      schedule: { type: 'interval', everyMinutes: 1, anchorAt: 1000 },
    }, { now: 0 });
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(recurring);
    store.authorize(recurring.id);
    let runNumber = 0;
    const executeJob = vi.fn(async ({ job, runId }) => {
      runNumber += 1;
      expect(store.consumeAuthorization(job.id, runId)).toMatchObject({
        consumed: true,
        remainingRuns: 2 - runNumber,
      });
      return createTradeRunReceipt({
        runId, jobId: job.id, jobType: job.type, status: 'completed',
        requested: 1, succeeded: 1, finishedAt: time,
      });
    });
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'recurring-tab', now: () => time }),
      now: () => time,
      createRunId: () => `recurring-run-${runNumber + 1}`,
      getContext: () => ({ sessionReady: true, operationBusy: false, tickToleranceMs: 15_000 }),
      executeJob,
    });

    expect(await scheduler.tick()).toMatchObject({ status: 'completed' });
    time = 61_000;
    expect(await scheduler.tick()).toMatchObject({ status: 'completed' });
    time = 121_000;
    expect(await scheduler.tick()).toMatchObject({ status: 'paused' });
    expect(executeJob).toHaveBeenCalledTimes(2);
    expect(store.read()).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ id: 'recurring-two', armed: false }],
      runtimes: {
        'recurring-two': {
          status: 'completed',
          reason: null,
          nextRunAt: null,
          runCount: 2,
          lastRunId: 'recurring-run-2',
        },
      },
      authorization: null,
    });
    expect(store.read().history).toHaveLength(2);
  });

  it('does not restore a Job runtime after the Job is deleted during execution', async () => {
    const storage = memoryStorage();
    const time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(scheduledJob());
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'delete-tab', now: () => time }),
      now: () => time,
      createRunId: () => 'deleted-run',
      getContext: () => ({ sessionReady: true, operationBusy: false }),
      executeJob: async ({ job, runId }) => {
        store.remove(job.id);
        return createTradeRunReceipt({ runId, status: 'completed', requested: 1, succeeded: 1, finishedAt: time });
      },
    });

    expect(await scheduler.tick()).toMatchObject({ status: 'completed', receipt: { runId: 'deleted-run' } });
    expect(store.read()).toMatchObject({ jobs: [], runtimes: {}, history: [{ runId: 'deleted-run' }] });
  });

  it('does not overwrite an edited schedule with an in-flight Run runtime', async () => {
    const storage = memoryStorage();
    const time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(scheduledJob());
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'edit-tab', now: () => time }),
      now: () => time,
      createRunId: () => 'edited-run',
      getContext: () => ({ sessionReady: true, operationBusy: false }),
      executeJob: async ({ job, runId }) => {
        store.upsert({ ...job, armed: false, schedule: { type: 'once', runAt: 5000 } });
        return createTradeRunReceipt({ runId, status: 'completed', requested: 1, succeeded: 1, finishedAt: time });
      },
    });

    expect(await scheduler.tick()).toMatchObject({
      status: 'completed',
      runtime: { status: 'disabled', reason: 'not-armed', nextRunAt: 5000, runCount: 0 },
    });
    expect(store.read()).toMatchObject({
      jobs: [{ schedule: { type: 'once', runAt: 5000 }, armed: false }],
      runtimes: { 'listing-1': { status: 'disabled', reason: 'not-armed', nextRunAt: 5000, runCount: 0 } },
      history: [{ runId: 'edited-run' }],
    });
  });

  it('waits for the EA session but expires instead of executing outside the grace window', async () => {
    const storage = memoryStorage();
    let time = 2_000;
    let sessionReady = false;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => 0 });
    store.upsert(scheduledJob({ misfirePolicy: { type: 'grace-window', graceMinutes: 1 } }));
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const executeJob = vi.fn();
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'session-tab', now: () => time }),
      now: () => time,
      createRunId: () => 'session-missed-run',
      getContext: () => ({ sessionReady, operationBusy: false, tickToleranceMs: 15_000 }),
      executeJob,
    });
    expect(await scheduler.tick()).toMatchObject({ status: 'idle' });
    expect(store.read().runtimes['listing-1']).toMatchObject({ status: 'waiting-session', reason: 'ea-session-unavailable' });
    time = 61_001;
    sessionReady = true;
    expect(await scheduler.tick()).toMatchObject({
      status: 'missed', receipt: { status: 'missed', reason: 'misfire-grace-expired' },
    });
    expect(executeJob).not.toHaveBeenCalled();
  });

  it('waits for a same-tab Runner operation and executes once when it clears inside grace', async () => {
    const storage = memoryStorage();
    let time = 2_000;
    let operationBusy = true;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => 0 });
    store.upsert(scheduledJob({ misfirePolicy: { type: 'grace-window', graceMinutes: 1 } }));
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const executeJob = vi.fn(async ({ runId }) => createTradeRunReceipt({
      runId, status: 'completed', requested: 1, succeeded: 1, finishedAt: time,
    }));
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'operation-tab', now: () => time }),
      now: () => time,
      createRunId: () => 'operation-run',
      getContext: () => ({ sessionReady: true, operationBusy, operationReason: 'runner-operation-active' }),
      executeJob,
    });
    expect(await scheduler.tick()).toMatchObject({ status: 'idle' });
    expect(store.read().runtimes['listing-1']).toMatchObject({ status: 'waiting-operation', reason: 'runner-operation-active' });
    time = 30_000;
    operationBusy = false;
    expect(await scheduler.tick()).toMatchObject({ status: 'completed', receipt: { runId: 'operation-run', succeeded: 1 } });
    expect(await scheduler.tick()).toMatchObject({ status: 'idle' });
    expect(executeJob).toHaveBeenCalledOnce();
  });

  it('enters cooldown without a lease or execution until the global request reserve is available', async () => {
    const storage = memoryStorage();
    let time = 1000;
    let requestBudgetReady = false;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(scheduledJob());
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const executeJob = vi.fn(async ({ runId }) => createTradeRunReceipt({ runId, status: 'completed', requested: 1, succeeded: 1, finishedAt: time }));
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'budget-tab', now: () => time }),
      now: () => time,
      getContext: () => ({ sessionReady: true, operationBusy: false, requestBudgetReady }),
      executeJob,
    });
    expect(await scheduler.tick()).toMatchObject({ status: 'idle' });
    expect(store.read().runtimes['listing-1']).toMatchObject({ status: 'cooldown', reason: 'trade-request-budget-insufficient' });
    expect(store.read().dispatch.total).toBe(0);
    expect(executeJob).not.toHaveBeenCalled();
    requestBudgetReady = true;
    time = 2000;
    expect(await scheduler.tick()).toMatchObject({ status: 'completed', jobId: 'listing-1' });
    expect(store.read().dispatch).toMatchObject({ total: 1, lastJobId: 'listing-1', lastJobType: 'listing' });
  });

  it('does not record a dispatch when another tab holds the run lease', async () => {
    const storage = memoryStorage();
    const time = 1000;
    const holder = createTradeRunLease({ storage, key: 'lease', ownerId: 'holder-tab', now: () => time });
    holder.acquire({ runId: 'holder-run', jobId: 'other-job' });
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(scheduledJob());
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const executeJob = vi.fn();
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'waiting-tab', now: () => time }),
      now: () => time,
      getContext: () => ({ sessionReady: true, operationBusy: false, requestBudgetReady: true }),
      executeJob,
    });
    expect(await scheduler.tick()).toMatchObject({ status: 'waiting-operation', jobId: 'listing-1' });
    expect(store.read().dispatch.total).toBe(0);
    expect(executeJob).not.toHaveBeenCalled();
  });

  it('alternates Buy and Listing dispatch when both types remain due', async () => {
    const storage = memoryStorage();
    const time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(scheduledJob({ id: 'listing-a' }));
    store.upsert(scheduledJob({ id: 'listing-b' }));
    store.upsert(scheduledBuyJob({ id: 'z-buy' }));
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const dispatched = [];
    const scheduler = createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'fair-tab', now: () => time }),
      now: () => time,
      getContext: () => ({ sessionReady: true, operationBusy: false, requestBudgetReady: true }),
      executeJob: async ({ job, runId }) => {
        dispatched.push(job.type);
        return createTradeRunReceipt({ runId, status: 'completed', requested: 1, succeeded: 1, finishedAt: time });
      },
    });
    await scheduler.tick();
    await scheduler.tick();
    await scheduler.tick();
    expect(dispatched).toEqual(['listing', 'buy', 'listing']);
    expect(store.read().dispatch).toMatchObject({ total: 3, lastJobType: 'listing', lastJobId: 'listing-b' });
  });
});
