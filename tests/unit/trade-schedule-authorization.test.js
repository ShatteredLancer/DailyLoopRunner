import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import {
  createTradeScheduleAuthorization,
  createTradeScheduleAuthorizations,
  inspectTradeScheduleAuthorization,
  normalizeTradeScheduleAuthorization,
  normalizeTradeScheduleAuthorizations,
  tradeScheduleFingerprint,
} from '../../src/trade/schedule-authorization.js';

function job(schedule = { type: 'interval', intervalSeconds: 300, anchorAt: 2000 }) {
  return normalizeTradeJob({
    id: 'listing-recurring', name: 'Recurring listing', type: 'listing', enabled: true, armed: true,
    schedule, misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      sources: ['club'], cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      marketOverride: { enabled: false, markupPercent: 5, maxQuoteAgeMinutes: 10, fallbackPolicy: 'configured' },
      startPricePolicy: 'one-step-below', durationSeconds: 3600, listingDelaySeconds: [4, 8],
      maxListings: 2, expiredPolicy: 'skip',
    },
  }, { now: 1000 });
}

describe('Trade schedule authorization', () => {
  it('creates two-run recurring and one-run once/window envelopes', () => {
    expect(createTradeScheduleAuthorization(job(), { now: 1000 })).toMatchObject({
      jobId: 'listing-recurring', scheduleType: 'interval', totalRuns: 2, remainingRuns: 2,
    });
    expect(createTradeScheduleAuthorization(job({ type: 'once', runAt: 60_000 }), { now: 1000 }).totalRuns).toBe(1);
    expect(createTradeScheduleAuthorization(job({ type: 'window', startAt: 2000, endAt: 60_000 }), { now: 1000 }).totalRuns).toBe(1);
    expect(createTradeScheduleAuthorization(job({ type: 'daily', time: '09:00', timezone: 'UTC' }), { now: 1000 }))
      .toMatchObject({ scheduleType: 'daily', totalRuns: 2, remainingRuns: 2, expiresAt: 93_601_000 });
  });

  it('invalidates an authorization after policy changes or expiry', () => {
    const original = job();
    const authorization = createTradeScheduleAuthorization(original, { now: 1000 });
    expect(inspectTradeScheduleAuthorization({ jobs: [original], authorization }, original, { now: 2000 }).ready).toBe(true);
    const changed = { ...original, policy: { ...original.policy, maxListings: 1 } };
    expect(normalizeTradeScheduleAuthorization(authorization, [changed], { now: 2000 })).toBeNull();
    expect(normalizeTradeScheduleAuthorization(authorization, [original], { now: authorization.expiresAt + 1 })).toBeNull();
    expect(tradeScheduleFingerprint(changed)).not.toBe(tradeScheduleFingerprint(original));
  });

  it('normalizes up to three independent Job authorizations and migrates the legacy envelope', () => {
    const first = job();
    const second = { ...job({ type: 'once', runAt: 60_000 }), id: 'listing-once' };
    const authorizations = createTradeScheduleAuthorizations([second, first], { now: 1000 });
    expect(Object.keys(authorizations.jobs)).toEqual(['listing-once', 'listing-recurring']);
    expect(authorizations.jobs).toMatchObject({
      'listing-once': { totalRuns: 1, remainingRuns: 1 },
      'listing-recurring': { totalRuns: 2, remainingRuns: 2 },
    });
    expect(inspectTradeScheduleAuthorization({ jobs: [first, second], authorizations }, second, { now: 2000 }))
      .toMatchObject({ ready: true, authorization: { jobId: second.id } });

    const legacy = createTradeScheduleAuthorization(first, { now: 1000 });
    expect(normalizeTradeScheduleAuthorizations(null, [first], {
      now: 2000,
      legacyAuthorization: legacy,
    }).jobs).toMatchObject({ [first.id]: { jobId: first.id } });

    const four = [first, second, { ...first, id: 'third' }, { ...first, id: 'fourth' }];
    expect(() => createTradeScheduleAuthorizations(four, { now: 1000 })).toThrow('At most 3');
  });
});
