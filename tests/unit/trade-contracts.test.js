import { describe, expect, it } from 'vitest';
import {
  createTradeRunReceipt,
  normalizeTradeJob,
  validateTradeJob,
} from '../../src/trade/contracts.js';

describe('Trade contracts', () => {
  it('keeps manual Buy Jobs unarmed with conservative pacing defaults', () => {
    const job = normalizeTradeJob({
      id: 'buy-84-85',
      name: 'Buy 84-85 Rare Gold',
      type: 'buy',
      enabled: true,
      armed: true,
      policy: { cardClass: 'rare-gold', ratingMin: 84, ratingMax: 85 },
    }, { now: 1000 });

    expect(job).toMatchObject({
      schemaVersion: 3,
      enabled: true,
      armed: false,
      schedule: { type: 'manual' },
      misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
      policy: {
        ratingMin: 84,
        ratingMax: 85,
        cardClass: 'rare-gold',
        searchDelaySeconds: [7, 15],
        buyDelaySeconds: [0, 1],
        maxPurchasesPerSearch: 1,
        searchCyclePauseEnabled: true,
        searchCyclePauseEvery: [10, 15],
        searchCyclePauseSeconds: [5, 8],
        initialRateLimitCooldownSeconds: 60,
        maximumRateLimitCooldownSeconds: 1800,
      },
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(validateTradeJob(job)).toEqual([]);
    expect(validateTradeJob({ ...job, armed: true })).toContain('Trade job.armed must be false for a manual schedule');
  });

  it('migrates legacy interval minutes to canonical seconds exactly once', () => {
    const legacy = normalizeTradeJob({
      schemaVersion: 1,
      id: 'legacy-interval',
      name: 'Legacy interval',
      type: 'listing',
      enabled: true,
      armed: true,
      schedule: { type: 'interval', everyMinutes: 5, anchorAt: 2000 },
      policy: {
        cardClass: 'common-gold',
        ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      },
    }, { now: 1000 });

    expect(legacy).toMatchObject({
      schemaVersion: 3,
      schedule: { type: 'interval', intervalSeconds: 300, anchorAt: 2000 },
    });
    expect(legacy.schedule).not.toHaveProperty('everyMinutes');
    expect(normalizeTradeJob(legacy, { now: 3000 }).schedule.intervalSeconds).toBe(300);
  });

  it('never arms an imported job and requires an explicit card class', () => {
    const imported = normalizeTradeJob({
      id: 'listing-low-gold',
      name: 'List low Gold',
      type: 'listing',
      enabled: true,
      armed: true,
      policy: {
        cardClass: 'normal-gold',
        ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      },
    }, { imported: true, now: 2000 });
    expect(imported.armed).toBe(false);
    expect(imported.policy).toMatchObject({ sources: ['club'], expiredPolicy: 'skip' });

    const commonGold = normalizeTradeJob({
      id: 'listing-common-gold',
      name: 'List common Gold',
      type: 'listing',
      policy: {
        cardClass: 'common-gold',
        ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      },
    }, { now: 2000 });
    expect(commonGold.policy.cardClass).toBe('common-gold');

    expect(() => normalizeTradeJob({
      id: 'unsafe-buy',
      name: 'Unsafe Buy',
      type: 'buy',
      policy: { ratingMin: 84, ratingMax: 84 },
    })).toThrow(/cardClass must be explicitly set/);
  });

  it('accepts bounded search fan-out and rejects unknown envelope fields and unsafe pacing', () => {
    const job = normalizeTradeJob({
      id: 'buy-84',
      name: 'Buy 84',
      type: 'buy',
      policy: { cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84 },
    }, { now: 1 });
    expect(validateTradeJob({ ...job, token: 'secret' })).toContain('Trade job.token is not supported');
    expect(validateTradeJob({
      ...job,
      policy: { ...job.policy, maxPurchasesPerSearch: 4 },
    })).toEqual([]);
    expect(validateTradeJob({
      ...job,
      policy: { ...job.policy, maxPurchasesPerSearch: 5 },
    })).toContain('Trade job.policy.maxPurchasesPerSearch must be an integer between 1 and 4');
    expect(validateTradeJob({
      ...job,
      policy: { ...job.policy, maximumRateLimitCooldownSeconds: 30 },
    })).toContain('Trade job.policy.maximumRateLimitCooldownSeconds must be greater than or equal to initialRateLimitCooldownSeconds');

    expect(() => normalizeTradeJob({
      id: 'listing',
      name: 'Listing',
      type: 'listing',
      policy: {
        cardClass: 'gold',
        ratingRules: [
          { min: 75, max: 80, buyNow: 700 },
          { min: 80, max: 82, buyNow: 800 },
        ],
      },
    }, { now: 1 })).toThrow(/overlaps another rating rule at 80/);

    expect(() => normalizeTradeJob({
      id: 'bad-timezone',
      name: 'Bad timezone',
      type: 'listing',
      schedule: { type: 'daily', time: '09:30', timezone: 'Not/A_Zone' },
      policy: { cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }] },
    }, { now: 1 })).toThrow(/timezone must be a valid IANA timezone/);
  });

  it('normalizes per-rating Buy quotas and explicit Listing quote fallback policies', () => {
    const buy = normalizeTradeJob({
      id: 'buy-quota',
      name: 'Buy quota',
      type: 'buy',
      policy: {
        cardClass: 'rare-gold',
        ratingMin: 84,
        ratingMax: 86,
        ratingQuantityOverrides: { 84: 2, 85: 1, 86: 1 },
      },
    }, { now: 1 });
    expect(buy.policy.ratingQuantityOverrides).toEqual({ 84: 2, 85: 1, 86: 1 });
    expect(validateTradeJob({
      ...buy,
      policy: { ...buy.policy, ratingQuantityOverrides: { 87: 1 } },
    })).toContain('Trade job.policy.ratingQuantityOverrides.87 must target a rating inside the job range');
    expect(validateTradeJob({
      ...buy,
      policy: { ...buy.policy, ratingQuantityOverrides: { 84: 0 } },
    })).toContain('Trade job.policy.ratingQuantityOverrides.84 must be a positive integer');

    const listing = normalizeTradeJob({
      id: 'listing-quote-skip',
      name: 'Listing quote skip',
      type: 'listing',
      policy: {
        cardClass: 'common-gold',
        ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
        marketOverride: { enabled: true, fallbackPolicy: 'skip' },
      },
    }, { now: 1 });
    expect(listing.policy.marketOverride.fallbackPolicy).toBe('skip');
  });

  it('creates a serializable run receipt without retaining input objects', () => {
    const raw = { item: { id: 10 }, status: 'listed' };
    const receipt = createTradeRunReceipt({
      runId: 'run-1',
      jobId: 'job-1',
      jobType: 'listing',
      status: 'completed',
      requested: 1,
      succeeded: 1,
      receipts: [raw],
    });
    raw.item.id = 99;
    expect(receipt.receipts[0].item.id).toBe(10);
    expect(JSON.parse(JSON.stringify(receipt))).toEqual(receipt);
  });

  it('accepts scheduled bulk Re-list All with no card or price policy and a 60 second minimum interval', () => {
    const job = normalizeTradeJob({
      id: 'scheduled-bulk-relist',
      name: 'Scheduled Re-list All',
      type: 'bulk-relist',
      enabled: true,
      armed: true,
      schedule: { type: 'interval', intervalSeconds: 60 },
      policy: {},
    }, { now: 1000 });
    expect(job).toMatchObject({
      schemaVersion: 3,
      type: 'bulk-relist',
      armed: true,
      schedule: { type: 'interval', intervalSeconds: 60 },
      policy: {
        relistDelaySeconds: [3, 8],
        initialRateLimitCooldownSeconds: 60,
        maximumRateLimitCooldownSeconds: 1800,
      },
    });
    expect(job.policy).not.toHaveProperty('cardClass');
    expect(job.policy).not.toHaveProperty('maxListings');
    expect(() => normalizeTradeJob({
      ...job,
      schedule: { type: 'interval', intervalSeconds: 59 },
    }, { now: 1000 })).toThrow(/intervalSeconds must be at least 60/);
    expect(() => normalizeTradeJob({
      ...job,
      schedule: { type: 'manual' },
    }, { now: 1000 })).toThrow(/must not be manual for bulk-relist/);
    expect(() => normalizeTradeJob({
      ...job,
      policy: { ...job.policy, maxListings: 1 },
    }, { now: 1000 })).toThrow(/maxListings is not supported/);
  });
});
