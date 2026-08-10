import { describe, expect, it } from 'vitest';
import { createTradeJobStore, TRADE_HISTORY_LIMIT } from '../../src/trade/job-store.js';

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
    expect(store.read()).toMatchObject({ paused: true, liveExecutionEnabled: false, jobs: [] });
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
});
