import { describe, expect, it } from 'vitest';
import {
  createTradeJobStore,
  TRADE_HISTORY_LIMIT,
  TRADE_METRICS_REASON_LIMIT,
} from '../../src/trade/job-store.js';

function memoryStorage() {
  const values = new Map();
  return { get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) };
}

function job(id = 'job-1') {
  return {
    id, name: 'List Common Gold', type: 'listing', enabled: true, armed: true,
    schedule: { type: 'daily', time: '09:30', timezone: 'Asia/Shanghai' },
    policy: { cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }] },
  };
}

describe('Trade Job Store', () => {
  it('persists normalized jobs, runtime state and an explicitly paused default', () => {
    const storage = memoryStorage();
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => Date.parse('2026-08-08T00:00:00Z') });
    expect(store.read()).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      safety: { minimumRetainedCoins: null },
      jobs: [],
    });
    store.upsert(job());
    const reloaded = createTradeJobStore({ storage, key: 'jobs', now: () => Date.parse('2026-08-08T00:01:00Z') });
    expect(reloaded.read()).toMatchObject({
      paused: true,
      jobs: [{ id: 'job-1', armed: true }],
      runtimes: { 'job-1': { jobId: 'job-1', nextRunAt: Date.parse('2026-08-08T01:30:00Z') } },
    });
  });

  it('disarms imported jobs and bounds persisted history', () => {
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => 1000 });
    expect(store.upsert(job(), { imported: true }).job.armed).toBe(false);
    for (let index = 0; index < TRADE_HISTORY_LIMIT + 5; index += 1) store.addHistory({ runId: `run-${index}` });
    expect(store.read().history).toHaveLength(TRADE_HISTORY_LIMIT);
    expect(store.read().history[0].runId).toBe('run-5');
  });

  it('migrates legacy armed manual Jobs to a manual-only runtime', () => {
    const storage = memoryStorage();
    storage.set('jobs', {
      jobs: [{
        ...job('manual-listing'),
        schedule: { type: 'manual' },
      }],
      runtimes: {
        'manual-listing': {
          jobId: 'manual-listing',
          status: 'waiting-time',
          reason: null,
          nextRunAt: null,
          updatedAt: 900,
        },
      },
    });
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => 1000 });
    expect(store.read()).toMatchObject({
      jobs: [{ id: 'manual-listing', armed: false, schedule: { type: 'manual' } }],
      runtimes: {
        'manual-listing': { status: 'disabled', reason: 'manual-only', nextRunAt: null },
      },
    });
  });

  it('atomically pauses, disables live execution and disarms pending jobs', () => {
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => 1000 });
    store.upsert(job());
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const snapshot = store.relock();
    expect(snapshot).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ id: 'job-1', armed: false }],
      runtimes: { 'job-1': { status: 'disabled', reason: 'not-armed' } },
    });
  });

  it('relocks and disarms all jobs when configuration changes during live execution', () => {
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => 1000 });
    store.upsert(job('job-1'));
    store.upsert(job('job-2'));
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const updated = store.upsert({ ...job('job-1'), name: 'Changed while live' });
    expect(updated.job).toMatchObject({ id: 'job-1', name: 'Changed while live', armed: false });
    expect(updated.snapshot).toMatchObject({ paused: true, liveExecutionEnabled: false });
    expect(updated.snapshot.jobs.map((entry) => ({ id: entry.id, armed: entry.armed }))).toEqual([
      { id: 'job-2', armed: false },
      { id: 'job-1', armed: false },
    ]);
  });

  it('persists an explicit global Buy reserve and relocks when it changes during live execution', () => {
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => 1000 });
    store.upsert(job());
    expect(store.setMinimumRetainedCoins(100000)).toMatchObject({
      safety: { minimumRetainedCoins: 100000 },
    });
    store.setLiveExecutionEnabled(true);
    store.setPaused(false);
    expect(store.setMinimumRetainedCoins(150000)).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ armed: false }],
      safety: { minimumRetainedCoins: 150000 },
    });
    expect(() => store.setMinimumRetainedCoins(-1)).toThrow('non-negative integer');
    expect(store.setMinimumRetainedCoins(null)).toMatchObject({ safety: { minimumRetainedCoins: null } });
  });

  it('migrates retained History into persistent bounded long-run metrics', () => {
    const storage = memoryStorage();
    storage.set('jobs', {
      schemaVersion: 1,
      paused: true,
      history: [
        {
          runId: 'buy-run', jobId: 'buy-job', jobType: 'buy', status: 'completed',
          startedAt: 100, finishedAt: 200, requested: 1, succeeded: 1,
          receipts: [{ status: 'run-summary', searches: 2, buyAttempts: 1, spent: 900 }],
        },
        {
          runId: 'list-run', jobId: 'list-job', jobType: 'listing', status: 'blocked',
          reason: 'trade-circuit-open', startedAt: 300, finishedAt: 400, requested: 0,
        },
      ],
    });
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => 1000 });
    expect(store.read()).toMatchObject({
      schemaVersion: 3,
      metrics: {
        firstRecordedAt: 200,
        lastRecordedAt: 400,
        lastRun: { runId: 'list-run', jobType: 'listing', status: 'blocked', reason: 'trade-circuit-open' },
        runs: {
          total: 2,
          byStatus: { completed: 1, blocked: 1 },
          byJobType: { buy: 1, listing: 1 },
        },
        outcomes: { requested: 1, succeeded: 1, failed: 0, skipped: 0 },
        buy: { purchases: 1, searches: 2, attempts: 1, spent: 900 },
        listing: { listed: 0 },
        reasons: [{ reason: 'trade-circuit-open', count: 1, lastAt: 400 }],
      },
    });

    for (let index = 0; index < TRADE_HISTORY_LIMIT + 5; index += 1) {
      store.addHistory({
        runId: `new-${index}`, jobId: 'list-job', jobType: 'listing', status: 'completed',
        finishedAt: 500 + index, requested: 1, succeeded: 1,
      });
    }
    const reloaded = createTradeJobStore({ storage, key: 'jobs', now: () => 2000 }).read();
    expect(reloaded.history).toHaveLength(TRADE_HISTORY_LIMIT);
    expect(reloaded.metrics.runs.total).toBe(TRADE_HISTORY_LIMIT + 7);
    expect(reloaded.metrics.listing.listed).toBe(TRADE_HISTORY_LIMIT + 5);
  });

  it('persists bounded dispatch metadata without changing Job runtime or History', () => {
    let time = 1000;
    const storage = memoryStorage();
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(job('listing-job'));
    time = 2000;
    const snapshot = store.recordDispatch('listing-job');
    expect(snapshot.dispatch).toEqual({
      schemaVersion: 1,
      total: 1,
      lastJobId: 'listing-job',
      lastJobType: 'listing',
      lastDispatchedAt: 2000,
    });
    expect(snapshot.history).toEqual([]);
    expect(snapshot.runtimes['listing-job'].runCount).toBe(0);
    expect(createTradeJobStore({ storage, key: 'jobs', now: () => 3000 }).read().dispatch).toEqual(snapshot.dispatch);
  });

  it('bounds and aggregates diagnostic stop reasons', () => {
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => 1000 });
    store.addHistory({ runId: 'repeat-1', jobType: 'buy', status: 'blocked', reason: 'repeated', finishedAt: 1 });
    store.addHistory({ runId: 'repeat-2', jobType: 'buy', status: 'blocked', reason: 'repeated', finishedAt: 2 });
    for (let index = 0; index < TRADE_METRICS_REASON_LIMIT + 5; index += 1) {
      store.addHistory({ runId: `reason-${index}`, jobType: 'buy', status: 'blocked', reason: `reason-${index}`, finishedAt: 10 + index });
    }
    const metrics = store.read().metrics;
    expect(metrics.reasons).toHaveLength(TRADE_METRICS_REASON_LIMIT);
    expect(metrics.reasons[0]).toMatchObject({ reason: 'repeated', count: 2, lastAt: 2 });
  });

  it('atomically replaces imported Jobs while preserving local account state and observability', () => {
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => 1000 });
    store.upsert(job('old'));
    store.setMinimumRetainedCoins(500000);
    store.addHistory({ runId: 'existing-run', jobType: 'listing', status: 'completed', requested: 1, succeeded: 1, finishedAt: 900 });
    store.setPaused(false);
    store.setLiveExecutionEnabled(true);
    const snapshot = store.replaceJobs([{ ...job('imported'), armed: true }]);
    expect(snapshot).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      safety: { minimumRetainedCoins: 500000 },
      jobs: [{ id: 'imported', armed: false }],
      runtimes: { imported: { jobId: 'imported', status: 'disabled', reason: 'not-armed' } },
      history: [{ runId: 'existing-run' }],
      metrics: { runs: { total: 1 } },
    });
    expect(snapshot.runtimes.old).toBeUndefined();
    expect(() => store.replaceJobs([{ ...job('duplicate') }, { ...job('duplicate') }])).toThrow('Duplicate Trade Job id');
    expect(store.read().jobs).toEqual(snapshot.jobs);
  });
});
