import { describe, expect, it, vi } from 'vitest';
import { createTradeRunReceipt } from '../../src/trade/contracts.js';
import { createTradeJobStore } from '../../src/trade/job-store.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';
import { createTradeScheduler } from '../../src/trade/scheduler.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => value === null ? values.delete(key) : values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function listingJob(id) {
  return {
    id, name: id, type: 'listing', enabled: true, armed: true,
    schedule: { type: 'interval', intervalSeconds: 60, anchorAt: 1000 },
    misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      sources: ['club'], cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      marketOverride: { enabled: false, markupPercent: 5, maxQuoteAgeMinutes: 10, fallbackPolicy: 'configured' },
      startPricePolicy: 'one-step-below', durationSeconds: 3600, listingDelaySeconds: [4, 8],
      maxListings: 1, expiredPolicy: 'skip',
    },
  };
}

function buyJob(id) {
  return {
    id, name: id, type: 'buy', enabled: true, armed: true,
    schedule: { type: 'interval', intervalSeconds: 60, anchorAt: 1000 },
    misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      ratingPriceOverrides: {}, ratingQuantityOverrides: {}, quantity: 1, totalBudget: 1000,
      minimumRetainedCoins: 100000, maxRuntimeMinutes: 15, searchDelaySeconds: [8, 15],
      maxPurchasesPerSearch: 1, maxConsecutiveEmptySearches: 20,
    },
  };
}

describe('Trade Scheduler bounded long-run soak', () => {
  it('runs three recurring Jobs fairly across waits, reload and a second-tab Lease', async () => {
    const storage = memoryStorage();
    let time = 1000;
    let sessionReady = false;
    let loopBusy = false;
    let requestPacingReady = true;
    let runSequence = 0;
    const dispatched = [];
    let store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    for (const job of [listingJob('listing-a'), buyJob('buy-b'), listingJob('listing-c')]) store.upsert(job);
    store.authorize(['listing-a', 'buy-b', 'listing-c']);

    const executeJob = vi.fn(async ({ job, runId }) => {
      const consumed = store.consumeAuthorization(job.id, runId);
      expect(consumed.consumed).toBe(true);
      dispatched.push(job.id);
      return createTradeRunReceipt({
        runId, jobId: job.id, jobType: job.type, status: 'completed',
        requested: 1, succeeded: 1, finishedAt: time,
      });
    });
    const context = (job) => ({
      sessionReady,
      sessionReason: sessionReady ? null : 'ea-session-unavailable',
      operationBusy: loopBusy,
      operationReason: loopBusy ? 'runner-operation-active' : null,
      requestPacingReady,
      tickToleranceMs: 15000,
    });
    const schedulerFor = (ownerId) => createTradeScheduler({
      store,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId, now: () => time }),
      now: () => time,
      createRunId: () => `soak-${++runSequence}`,
      getContext: context,
      executeJob,
    });
    let scheduler = schedulerFor('tab-a');

    expect(await scheduler.tick()).toMatchObject({ status: 'idle' });
    expect(Object.values(store.read().runtimes).every((runtime) => runtime.status === 'waiting-session')).toBe(true);
    sessionReady = true;
    loopBusy = true;
    expect(await scheduler.tick()).toMatchObject({ status: 'idle' });
    expect(Object.values(store.read().runtimes).every((runtime) => runtime.status === 'waiting-operation')).toBe(true);
    loopBusy = false;

    const firstRun = await scheduler.tick();
    expect(firstRun).toMatchObject({ status: 'completed', jobId: expect.any(String) });
    requestPacingReady = false;
    expect(await scheduler.tick()).toMatchObject({ status: 'idle' });
    for (const id of ['listing-a', 'buy-b', 'listing-c'].filter((id) => id !== firstRun.jobId)) {
      expect(store.read().runtimes[id]).toMatchObject({ status: 'cooldown', reason: 'trade-rate-limit-cooldown' });
    }
    requestPacingReady = true;
    expect(await scheduler.tick()).toMatchObject({ status: 'completed', jobId: expect.any(String) });
    expect(await scheduler.tick()).toMatchObject({ status: 'completed', jobId: expect.any(String) });
    expect(new Set(dispatched.slice(0, 3))).toEqual(new Set(['listing-a', 'listing-c', 'buy-b']));

    time = 61000;
    store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    scheduler = schedulerFor('tab-reloaded');
    const otherTab = createTradeRunLease({ storage, key: 'lease', ownerId: 'tab-other', now: () => time });
    otherTab.acquire({ runId: 'other-tab-run', jobId: 'external-job' });
    expect(await scheduler.tick()).toMatchObject({ status: 'waiting-operation' });
    expect(dispatched).toHaveLength(3);
    otherTab.release('other-tab-run');

    expect((await scheduler.tick()).status).toBe('completed');
    expect((await scheduler.tick()).status).toBe('completed');
    expect((await scheduler.tick()).status).toBe('completed');
    expect(dispatched).toHaveLength(6);
    expect(Object.fromEntries(['listing-a', 'buy-b', 'listing-c'].map((id) => [id, dispatched.filter((entry) => entry === id).length])))
      .toEqual({ 'listing-a': 2, 'buy-b': 2, 'listing-c': 2 });
    expect(store.read()).toMatchObject({ paused: true, liveExecutionEnabled: false });
    expect(store.read().jobs.every((job) => job.armed === false)).toBe(true);
    expect(store.read().history).toHaveLength(6);
  });
});
