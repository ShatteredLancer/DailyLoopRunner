import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import {
  inspectManualBuyValidationJob,
  manualBuyValidationConfirmation,
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

describe('Manual one-card Buy validation gate', () => {
  it('accepts one low-value manual lane and clamps the live validation run', () => {
    expect(inspectManualBuyValidationJob(job())).toMatchObject({
      ready: true,
      maxPrice: 1000,
      requiredText: 'BUY 1 MAX 1000',
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

  it('uses route-specific confirmation text without changing the Job', () => {
    expect(manualBuyValidationConfirmation(1000, 'auto')).toBe('BUY 1 MAX 1000');
    expect(manualBuyValidationConfirmation(1000, 'club')).toBe('BUY 1 TO CLUB MAX 1000');
    expect(manualBuyValidationConfirmation(1000, 'transfer')).toBe('BUY 1 TO TRANSFER MAX 1000');
    expect(() => manualBuyValidationConfirmation(1000, 'discard')).toThrow('auto, club, or transfer');
  });

  it.each([
    [{ cardClass: 'common-gold' }, 'manual-buy-validation-rare-gold-only'],
    [{ ratingMax: 85 }, 'manual-buy-validation-single-rating-only'],
    [{ quantity: 2 }, 'manual-buy-validation-one-item-only'],
    [{ maxBuyNow: 2050, totalBudget: 2050 }, 'manual-buy-validation-price-cap'],
    [{ totalBudget: 2050 }, 'manual-buy-validation-budget-cap'],
    [{ ratingPriceOverrides: { 84: 2050 }, totalBudget: 2050 }, 'manual-buy-validation-budget-cap'],
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
