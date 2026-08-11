import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import {
  inspectScheduledBuyValidationJob,
  scheduledBuyValidationConfirmation,
  SCHEDULED_BUY_VALIDATION_MAX_EMPTY_SEARCHES,
  SCHEDULED_BUY_VALIDATION_MAX_RUNTIME_MINUTES,
} from '../../src/trade/scheduled-buy-validation.js';

function job(overrides = {}) {
  const policy = overrides.policy || {};
  return normalizeTradeJob({
    id: 'scheduled-buy-84',
    name: 'Scheduled Buy 84',
    type: 'buy',
    enabled: true,
    armed: true,
    schedule: { type: 'once', runAt: 60_000 },
    misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      ratingPriceOverrides: {}, quantity: 1, totalBudget: 1000, minimumRetainedCoins: null,
      maxRuntimeMinutes: 15, searchDelaySeconds: [8, 15], maxPurchasesPerSearch: 1,
      maxConsecutiveEmptySearches: 20,
      ...policy,
    },
    ...overrides,
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      ratingPriceOverrides: {}, quantity: 1, totalBudget: 1000, minimumRetainedCoins: null,
      maxRuntimeMinutes: 15, searchDelaySeconds: [8, 15], maxPurchasesPerSearch: 1,
      maxConsecutiveEmptySearches: 20,
      ...policy,
    },
  }, { now: 1 });
}

describe('Scheduled guarded Buy validation gate', () => {
  it('requires an explicit global reserve and clamps one scheduled Buy', () => {
    expect(inspectScheduledBuyValidationJob(job())).toMatchObject({
      ready: false,
      reason: 'scheduled-buy-validation-global-reserve-required',
    });
    expect(inspectScheduledBuyValidationJob(job(), { minimumRetainedCoins: 100000 })).toMatchObject({
      ready: true,
      maxPrice: 1000,
      minimumRetainedCoins: 100000,
      requiredText: 'RUN BUY ONCE 1 RESERVE 100000',
      job: {
        policy: {
          quantity: 1,
          maxRuntimeMinutes: SCHEDULED_BUY_VALIDATION_MAX_RUNTIME_MINUTES,
          maxConsecutiveEmptySearches: SCHEDULED_BUY_VALIDATION_MAX_EMPTY_SEARCHES,
        },
      },
    });
  });

  it('allows a Job to raise but not lower the global reserve', () => {
    expect(inspectScheduledBuyValidationJob(job({ policy: { minimumRetainedCoins: 150000 } }), {
      minimumRetainedCoins: 100000,
    })).toMatchObject({ minimumRetainedCoins: 150000, requiredText: 'RUN BUY ONCE 1 RESERVE 150000' });
    expect(inspectScheduledBuyValidationJob(job({ policy: { minimumRetainedCoins: 50000 } }), {
      minimumRetainedCoins: 100000,
    })).toMatchObject({ minimumRetainedCoins: 100000, requiredText: 'RUN BUY ONCE 1 RESERVE 100000' });
    expect(scheduledBuyValidationConfirmation(0)).toBe('RUN BUY ONCE 1 RESERVE 0');
    expect(() => scheduledBuyValidationConfirmation(null)).toThrow('must be explicit');
    const invalid = job();
    invalid.policy.minimumRetainedCoins = -1;
    expect(inspectScheduledBuyValidationJob(invalid, {
      minimumRetainedCoins: 100000,
    })).toMatchObject({ ready: false, reason: 'scheduled-buy-job-invalid' });
  });

  it('accepts a once-scheduled two-rating, two-item Rare Gold Buy', () => {
    expect(inspectScheduledBuyValidationJob(job({ policy: {
      ratingMax: 85,
      ratingPriceOverrides: { 85: 1500 },
      quantity: 2,
      totalBudget: 2500,
    } }), { minimumRetainedCoins: 100000 })).toMatchObject({
      ready: true,
      maxPrice: 1500,
      maxSpend: 2500,
      requiredText: 'RUN BUY ONCE 2 RESERVE 100000',
      job: { policy: { ratingMin: 84, ratingMax: 85, quantity: 2 } },
    });
  });

  it.each([
    [{ schedule: { type: 'manual' } }, 'scheduled-buy-validation-once-only'],
    [{ armed: false }, 'scheduled-buy-validation-job-not-armed'],
    [{ policy: { cardClass: 'common-gold' } }, 'scheduled-buy-validation-rare-gold-only'],
    [{ policy: { ratingMax: 86 } }, 'scheduled-buy-validation-adjacent-ratings-only'],
    [{ policy: { quantity: 3 } }, 'scheduled-buy-validation-quantity-cap'],
    [{ policy: { maxBuyNow: 2050, totalBudget: 2050 } }, 'scheduled-buy-validation-price-cap'],
    [{ misfirePolicy: { type: 'next-login' } }, 'scheduled-buy-validation-next-login-disabled'],
    [{ misfirePolicy: { type: 'grace-window', graceMinutes: 16 } }, 'scheduled-buy-validation-grace-too-long'],
  ])('rejects unsafe policy %#', (override, reason) => {
    expect(inspectScheduledBuyValidationJob(job(override), { minimumRetainedCoins: 100000 }))
      .toMatchObject({ ready: false, reason });
  });
});
