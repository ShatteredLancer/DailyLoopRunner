import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import {
  inspectManualBuyValidationJob,
  MANUAL_BUY_VALIDATION_MAX_EMPTY_SEARCHES,
  MANUAL_BUY_VALIDATION_MAX_RUNTIME_MINUTES,
} from '../../src/trade/manual-buy-validation.js';

function job(overrides = {}) {
  return normalizeTradeJob({
    id: 'buy-84', name: 'Buy 84', type: 'buy', enabled: true, armed: false,
    schedule: { type: 'manual' },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      ratingPriceOverrides: {}, quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 15,
      searchDelaySeconds: [8, 15], maxPurchasesPerSearch: 1, maxConsecutiveEmptySearches: 20,
      ...overrides,
    },
  }, { now: 1 });
}

describe('Manual guarded Buy validation gate', () => {
  it('accepts one low-value manual lane and clamps the live validation run', () => {
    expect(inspectManualBuyValidationJob(job())).toMatchObject({
      ready: true,
      maxPrice: 1000,
      approval: {
        risk: 'attention', action: 'buy', quantity: 1, maxPrice: 1000, totalBudget: 1000,
      },
      job: {
        armed: false,
        schedule: { type: 'manual' },
        policy: {
          quantity: 1,
          maxRuntimeMinutes: MANUAL_BUY_VALIDATION_MAX_RUNTIME_MINUTES,
          maxConsecutiveEmptySearches: MANUAL_BUY_VALIDATION_MAX_EMPTY_SEARCHES,
        },
      },
    });
  });

  it('accepts two adjacent ratings and two purchases within per-card and total caps', () => {
    expect(inspectManualBuyValidationJob(job({
      ratingMax: 85,
      ratingPriceOverrides: { 85: 1500 },
      quantity: 2,
      totalBudget: 2500,
    }))).toMatchObject({
      ready: true,
      maxPrice: 1500,
      approval: { action: 'buy', quantity: 2, maxPrice: 1500, totalBudget: 2500 },
      job: { policy: { ratingMin: 84, ratingMax: 85, quantity: 2 } },
    });
  });

  it.each([
    [{ cardClass: 'common-gold' }, 'manual-buy-validation-rare-gold-only'],
    [{ ratingMax: 88 }, 'manual-buy-validation-adjacent-ratings-only'],
    [{ quantity: 5 }, 'manual-buy-validation-quantity-cap'],
    [{ maxBuyNow: 2050, totalBudget: 2050 }, 'manual-buy-validation-price-cap'],
    [{ totalBudget: 8050 }, 'manual-buy-validation-budget-cap'],
    [{ ratingPriceOverrides: { 84: 2050 }, totalBudget: 2050 }, 'manual-buy-validation-rating-price-cap'],
    [{ ratingPriceOverrides: { 84: 1500 }, totalBudget: 1000 }, 'manual-buy-validation-budget-below-price-limit'],
  ])('rejects unsafe policy %#', (policy, reason) => {
    expect(inspectManualBuyValidationJob(job(policy))).toMatchObject({ ready: false, reason });
  });

  it('rejects armed and scheduled Jobs', () => {
    expect(inspectManualBuyValidationJob({ ...job(), armed: true })).toMatchObject({
      ready: false, reason: 'manual-buy-validation-job-must-be-unarmed',
    });
    expect(inspectManualBuyValidationJob({ ...job(), schedule: { type: 'once', runAt: 5000 } })).toMatchObject({
      ready: false, reason: 'manual-buy-validation-manual-only',
    });
  });
});
