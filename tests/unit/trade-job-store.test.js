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
});
