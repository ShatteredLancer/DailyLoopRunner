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
      schemaVersion: 1,
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
    [{ kind: TRADE_JOB_CONFIG_KIND, schemaVersion: 2, jobs: [] }, 'schemaVersion must be 1'],
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
});
