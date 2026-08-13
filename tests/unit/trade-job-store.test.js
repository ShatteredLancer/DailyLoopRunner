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

  it('records manual bulk Re-list All History under its own metrics type without enabling a Job type', () => {
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => 1000 });
    const snapshot = store.addHistory({
      runId: 'bulk-run', jobId: 'manual-bulk-relist', jobType: 'bulk-relist',
      status: 'completed', requested: 2, succeeded: 2, finishedAt: 1000,
    });
    expect(snapshot.metrics).toMatchObject({
      lastRun: { jobType: 'bulk-relist' },
      runs: { total: 1, byJobType: { 'bulk-relist': 1, unknown: 0 } },
      outcomes: { requested: 2, succeeded: 2 },
      bulkRelist: { relisted: 2 },
    });
    expect(snapshot.jobs).toEqual([]);
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

  it('persists and consumes a bounded recurring authorization before relocking', () => {
    let time = 1000;
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => time });
    store.upsert(job());
    expect(store.authorize('job-1')).toMatchObject({
      paused: false,
      liveExecutionEnabled: true,
      authorization: { jobId: 'job-1', totalRuns: 2, remainingRuns: 2 },
    });
    time = 2000;
    expect(store.consumeAuthorization('job-1', 'run-1')).toMatchObject({ consumed: true, remainingRuns: 1 });
    expect(store.read()).toMatchObject({
      paused: false,
      liveExecutionEnabled: true,
      jobs: [{ armed: true }],
      authorization: { remainingRuns: 1, lastRunId: 'run-1' },
    });
    expect(store.consumeAuthorization('job-1', 'run-1')).toMatchObject({
      consumed: false,
      reason: 'schedule-authorization-run-already-consumed',
    });
    expect(store.read()).toMatchObject({
      paused: false,
      liveExecutionEnabled: true,
      authorization: { remainingRuns: 1, lastRunId: 'run-1' },
    });
    time = 3000;
    expect(store.consumeAuthorization('job-1', 'run-2')).toMatchObject({ consumed: true, remainingRuns: 0 });
    expect(store.read()).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ armed: false }],
      authorization: null,
    });
  });

  it('reserves one occurrence across slices and consumes it only at terminal completion', () => {
    let time = 1000;
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => time });
    store.upsert({ ...job('once-sliced'), schedule: { type: 'once', runAt: 1000 } });
    store.authorize('once-sliced');

    expect(store.beginAuthorization('once-sliced', 'slice-run')).toMatchObject({
      begun: true, resumed: false, remainingRuns: 1,
    });
    expect(store.read()).toMatchObject({
      paused: false,
      liveExecutionEnabled: true,
      jobs: [{ armed: true }],
      authorization: { remainingRuns: 1, activeRunId: 'slice-run' },
    });
    time = 4000;
    expect(store.beginAuthorization('once-sliced', 'slice-run')).toMatchObject({
      begun: true, resumed: true, remainingRuns: 1,
    });
    expect(store.read().authorization.activeExpiresAt).toBe(3_604_000);
    expect(store.beginAuthorization('once-sliced', 'other-run')).toMatchObject({
      begun: false, reason: 'schedule-authorization-run-active',
    });
    expect(store.completeAuthorization('once-sliced', 'slice-run')).toMatchObject({
      completed: true, remainingRuns: 0,
    });
    expect(store.read()).toMatchObject({ paused: true, liveExecutionEnabled: false, jobs: [{ armed: false }] });
  });

  it('authorizes three Jobs and disarms only the Job whose envelope is exhausted', () => {
    let time = 1000;
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => time });
    store.upsert({ ...job('daily-a'), schedule: { type: 'daily', time: '09:30', timezone: 'Asia/Shanghai' } });
    store.upsert({ ...job('once-b'), schedule: { type: 'once', runAt: 60_000 } });
    store.upsert({ ...job('window-c'), schedule: { type: 'window', startAt: 2000, endAt: 60_000 } });
    const enabled = store.authorize(['daily-a', 'once-b', 'window-c']);
    expect(enabled.authorization).toBeNull();
    expect(Object.keys(enabled.authorizations.jobs)).toEqual(['daily-a', 'once-b', 'window-c']);

    time = 2000;
    expect(store.consumeAuthorization('once-b', 'once-run')).toMatchObject({ consumed: true, remainingRuns: 0 });
    expect(store.read()).toMatchObject({
      paused: false,
      liveExecutionEnabled: true,
      jobs: [
        { id: 'daily-a', armed: true },
        { id: 'once-b', armed: false },
        { id: 'window-c', armed: true },
      ],
    });
    expect(Object.keys(store.read().authorizations.jobs)).toEqual(['daily-a', 'window-c']);
    expect(store.consumeAuthorization('window-c', 'window-run')).toMatchObject({ consumed: true, remainingRuns: 0 });
    expect(store.read()).toMatchObject({ paused: false, liveExecutionEnabled: true });
    expect(store.consumeAuthorization('daily-a', 'daily-run-1')).toMatchObject({ consumed: true, remainingRuns: 1 });
    expect(store.consumeAuthorization('daily-a', 'daily-run-2')).toMatchObject({ consumed: true, remainingRuns: 0 });
    expect(store.read()).toMatchObject({ paused: true, liveExecutionEnabled: false });
  });

  it('migrates a schema 4 singular authorization into schema 7 and relocks it', () => {
    const storage = memoryStorage();
    const legacyJob = job('legacy');
    const source = createTradeJobStore({ storage: memoryStorage(), now: () => 1000 });
    source.upsert(legacyJob);
    const legacyAuthorization = source.authorize('legacy').authorization;
    storage.set('jobs', {
      schemaVersion: 4,
      paused: false,
      liveExecutionEnabled: true,
      jobs: [legacyJob],
      authorization: legacyAuthorization,
    });
    const migrated = createTradeJobStore({ storage, key: 'jobs', now: () => 2000 }).read();
    expect(migrated).toMatchObject({
      schemaVersion: 8,
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ id: 'legacy', armed: false }],
      authorization: null,
      authorizations: { schemaVersion: 3, jobs: {} },
    });
  });

  it('migrates schema 5 interval minutes to seconds and relocks only on the first read', () => {
    const storage = memoryStorage();
    storage.set('jobs', {
      schemaVersion: 5,
      paused: false,
      liveExecutionEnabled: true,
      jobs: [{
        ...job('legacy-interval'),
        schedule: { type: 'interval', everyMinutes: 5, anchorAt: 2000 },
      }],
    });

    const store = createTradeJobStore({ storage, key: 'jobs', now: () => 3000 });
    const migrated = store.read();
    expect(migrated).toMatchObject({
      schemaVersion: 8,
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{
        id: 'legacy-interval',
        schemaVersion: 3,
        armed: false,
        schedule: { type: 'interval', intervalSeconds: 300, anchorAt: 2000 },
      }],
    });
    expect(migrated.jobs[0].schedule).not.toHaveProperty('everyMinutes');
    expect(storage.get('jobs')).toMatchObject({
      schemaVersion: 8,
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ schedule: { intervalSeconds: 300 } }],
    });
    store.setPaused(false);
    expect(store.read()).toMatchObject({ paused: false, jobs: [{ schedule: { intervalSeconds: 300 } }] });
    const reloaded = createTradeJobStore({ storage, key: 'jobs', now: () => 4000 }).read();
    expect(reloaded).toMatchObject({ paused: false, jobs: [{ schedule: { intervalSeconds: 300 } }] });
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

  it('invalidates persisted authorization on edit, delete, and import', () => {
    let time = 1000;
    const store = createTradeJobStore({ storage: memoryStorage(), now: () => time });
    store.upsert(job('authorized'));
    store.authorize('authorized');
    time = 2000;
    expect(store.upsert({ ...job('authorized'), name: 'Edited' }).snapshot).toMatchObject({
      paused: true, liveExecutionEnabled: false, authorization: null,
      jobs: [{ id: 'authorized', armed: false }],
    });

    store.upsert({ ...job('authorized'), name: 'Edited', armed: true });
    store.authorize('authorized');
    time = 3000;
    expect(store.remove('authorized')).toMatchObject({
      paused: true, liveExecutionEnabled: false, authorization: null, jobs: [],
    });

    store.upsert(job('before-import'));
    store.authorize('before-import');
    time = 4000;
    expect(store.replaceJobs([job('imported')])).toMatchObject({
      paused: true, liveExecutionEnabled: false, authorization: null,
      jobs: [{ id: 'imported', armed: false }],
    });
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
      schemaVersion: 8,
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
