import { describe, expect, it } from 'vitest';
import {
  createTradeRunReceipt,
  normalizeTradeJob,
  validateTradeJob,
} from '../../src/trade/contracts.js';

describe('Trade contracts', () => {
  it('keeps manual Buy Jobs unarmed with conservative request defaults', () => {
    const job = normalizeTradeJob({
      id: 'buy-84-85',
      name: 'Buy 84-85 Rare Gold',
      type: 'buy',
      enabled: true,
      armed: true,
      policy: { cardClass: 'rare-gold', ratingMin: 84, ratingMax: 85 },
    }, { now: 1000 });

    expect(job).toMatchObject({
      schemaVersion: 1,
      enabled: true,
      armed: false,
      schedule: { type: 'manual' },
      misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
      policy: {
        ratingMin: 84,
        ratingMax: 85,
        cardClass: 'rare-gold',
        searchDelaySeconds: [8, 15],
        maxPurchasesPerSearch: 1,
      },
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(validateTradeJob(job)).toEqual([]);
    expect(validateTradeJob({ ...job, armed: true })).toContain('Trade job.armed must be false for a manual schedule');
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

  it('rejects unknown envelope fields, overlapping listing rules and unsafe search fan-out', () => {
    const job = normalizeTradeJob({
      id: 'buy-84',
      name: 'Buy 84',
      type: 'buy',
      policy: { cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84 },
    }, { now: 1 });
    expect(validateTradeJob({ ...job, token: 'secret' })).toContain('Trade job.token is not supported');
    expect(validateTradeJob({
      ...job,
      policy: { ...job.policy, maxPurchasesPerSearch: 2 },
    })).toContain('Trade job.policy.maxPurchasesPerSearch must be 1');

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
});
