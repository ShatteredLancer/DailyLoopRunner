import { describe, expect, it } from 'vitest';
import {
  createTradeJobConfig,
  exportTradeJobConfigJson,
  parseTradeJobConfig,
  TRADE_JOB_CONFIG_KIND,
} from '../../src/trade/job-config.js';
import { normalizeTradeJob } from '../../src/trade/contracts.js';

function buyJob(overrides = {}) {
  return normalizeTradeJob({
    id: 'buy-1', name: 'Buy 84', type: 'buy', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 2000 },
    misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      ratingPriceOverrides: {}, quantity: 1, totalBudget: 1000, minimumRetainedCoins: null,
      maxRuntimeMinutes: 5, searchDelaySeconds: [8, 15], maxPurchasesPerSearch: 1,
      maxConsecutiveEmptySearches: 5,
    },
    ...overrides,
  }, { now: 1000 });
}

describe('Trade Job configuration', () => {
  it('exports only portable Job configuration without execution or account state', () => {
    const configuredJob = buyJob();
    configuredJob.policy.minimumRetainedCoins = 800000;
    const value = createTradeJobConfig({
      paused: false,
      liveExecutionEnabled: true,
      safety: { minimumRetainedCoins: 900000 },
      history: [{ runId: 'secret-run' }],
      metrics: { runs: { total: 1 } },
      runtimes: { 'buy-1': { status: 'running' } },
      jobs: [configuredJob],
    }, { exportedAt: 3000, runnerVersion: '0.7.46' });
    expect(value).toEqual({
      kind: TRADE_JOB_CONFIG_KIND,
      schemaVersion: 3,
      exportedAt: 3000,
      runnerVersion: '0.7.46',
      jobs: [expect.objectContaining({ id: 'buy-1', enabled: true })],
    });
    expect(value.jobs[0]).not.toHaveProperty('armed');
    expect(value.jobs[0]).not.toHaveProperty('createdAt');
    expect(value.jobs[0]).not.toHaveProperty('updatedAt');
    expect(value.jobs[0].policy).not.toHaveProperty('minimumRetainedCoins');
    const text = exportTradeJobConfigJson({ jobs: [buyJob()] }, { exportedAt: 3000, runnerVersion: '0.7.46' });
    expect(text).not.toContain('minimumRetainedCoins\": 900000');
    expect(text).not.toContain('secret-run');
  });

  it('imports legacy schema 1 interval minutes and exports canonical schema 3 seconds', () => {
    const portable = createTradeJobConfig({ jobs: [buyJob()] }, { exportedAt: 3000, runnerVersion: '0.7.91' });
    portable.schemaVersion = 1;
    portable.jobs[0].schemaVersion = 1;
    portable.jobs[0].schedule = { type: 'interval', everyMinutes: 5, anchorAt: 2000 };

    const imported = parseTradeJobConfig(portable, { now: 4000 });
    expect(imported).toMatchObject({
      schemaVersion: 3,
      jobs: [{ schemaVersion: 3, armed: false, schedule: { type: 'interval', intervalSeconds: 300, anchorAt: 2000 } }],
    });
    const exported = createTradeJobConfig({ jobs: imported.jobs }, { exportedAt: 5000, runnerVersion: 'next' });
    expect(exported.schemaVersion).toBe(3);
    expect(exported.jobs[0].schedule).toEqual({ type: 'interval', intervalSeconds: 300, anchorAt: 2000 });
  });

  it('strictly validates and disarms every imported Job', () => {
    const exported = createTradeJobConfig({ jobs: [buyJob()] }, { exportedAt: 3000, runnerVersion: '0.7.46' });
    const imported = parseTradeJobConfig(JSON.stringify(exported), { now: 4000 });
    expect(imported.jobs).toHaveLength(1);
    expect(imported.jobs[0]).toMatchObject({ id: 'buy-1', enabled: true, armed: false, createdAt: 4000, updatedAt: 4000 });
  });

  it.each([
    [{ kind: TRADE_JOB_CONFIG_KIND, schemaVersion: 1, jobs: [], history: [] }, 'history is not supported'],
    [{ kind: TRADE_JOB_CONFIG_KIND, schemaVersion: 1, jobs: [{ ...buyJob(), armed: true }] }, 'armed is not supported'],
    [{
      kind: TRADE_JOB_CONFIG_KIND,
      schemaVersion: 1,
      jobs: [{ ...createTradeJobConfig({ jobs: [buyJob()] }, { exportedAt: 3000 }).jobs[0], policy: { ...buyJob().policy, minimumRetainedCoins: 1 } }],
    }, 'minimumRetainedCoins is account-specific'],
    [{ kind: 'other', schemaVersion: 1, jobs: [] }, 'kind must be'],
    [{ kind: TRADE_JOB_CONFIG_KIND, schemaVersion: 4, jobs: [] }, 'schemaVersion must be 1, 2, or 3'],
  ])('rejects unsafe or incompatible input %#', (input, message) => {
    expect(() => parseTradeJobConfig(input, { now: 4000 })).toThrow(message);
  });

  it('rejects duplicate Job ids before returning an import plan', () => {
    const first = createTradeJobConfig({ jobs: [buyJob()] }, { exportedAt: 3000 }).jobs[0];
    expect(() => parseTradeJobConfig({
      kind: TRADE_JOB_CONFIG_KIND,
      schemaVersion: 1,
      jobs: [first, { ...first, name: 'Duplicate' }],
    }, { now: 4000 })).toThrow('duplicate id: buy-1');
  });

  it('round-trips scheduled bulk Re-list All and keeps it unarmed on import', () => {
    const bulk = normalizeTradeJob({
      id: 'bulk-relist-1', name: 'Re-list every five minutes', type: 'bulk-relist', enabled: true, armed: true,
      schedule: { type: 'interval', intervalSeconds: 300, anchorAt: 1000 },
      misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
      policy: { relistDelaySeconds: [3, 8] },
    }, { now: 1000 });
    const exported = createTradeJobConfig({ jobs: [bulk] }, { exportedAt: 2000, runnerVersion: 'next' });
    expect(exported).toMatchObject({
      schemaVersion: 3,
      jobs: [{ schemaVersion: 3, type: 'bulk-relist', policy: { relistDelaySeconds: [3, 8] } }],
    });
    expect(exported.jobs[0].policy).not.toHaveProperty('cardClass');
    expect(parseTradeJobConfig(exported, { now: 3000 })).toMatchObject({
      jobs: [{ id: 'bulk-relist-1', type: 'bulk-relist', armed: false }],
    });
  });
});
