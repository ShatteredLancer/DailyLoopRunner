import { normalizeTradeJob } from './contracts.js';
import { normalizeExpectedBuyDestination } from './buy-destination.js';

export const MANUAL_BUY_VALIDATION_MAX_PRICE = 2_000;
export const MANUAL_BUY_VALIDATION_MAX_TOTAL_BUDGET = 4_000;
export const MANUAL_BUY_VALIDATION_MAX_QUANTITY = 2;
export const MANUAL_BUY_VALIDATION_MAX_RATING_SPAN = 1;
export const MANUAL_BUY_VALIDATION_MAX_RUNTIME_MINUTES = 5;
export const MANUAL_BUY_VALIDATION_MAX_EMPTY_SEARCHES = 5;

export function manualBuyValidationConfirmation(maxPrice, expectedDestination = 'auto', quantity = 1) {
  const destination = normalizeExpectedBuyDestination(expectedDestination);
  if (!destination) throw new Error('Buy validation destination must be auto, club, or transfer');
  const count = Math.min(MANUAL_BUY_VALIDATION_MAX_QUANTITY, Math.max(1, Math.floor(Number(quantity) || 1)));
  return destination === 'auto'
    ? `BUY ${count} MAX ${maxPrice}`
    : `BUY ${count} TO ${destination.toUpperCase()} MAX ${maxPrice}`;
}

function effectiveRatingLimit(job) {
  const limits = [];
  for (let rating = Number(job.policy.ratingMin); rating <= Number(job.policy.ratingMax); rating += 1) {
    const override = Number(job.policy.ratingPriceOverrides?.[String(rating)]);
    limits.push(Number.isFinite(override) && override > 0 ? override : Number(job.policy.maxBuyNow));
  }
  return Math.max(...limits);
}

export function inspectManualBuyValidationJob(input = {}, options = {}) {
  const explicitlyArmed = input?.armed === true;
  let job;
  try {
    job = normalizeTradeJob(input, { now: options.now ?? Date.now() });
  } catch (error) {
    return { ready: false, reason: 'manual-buy-job-invalid', error: error?.message || String(error), job: null };
  }

  let reason = null;
  if (job.type !== 'buy') reason = 'manual-buy-validation-buy-only';
  else if (job.enabled !== true) reason = 'manual-buy-validation-job-disabled';
  else if (explicitlyArmed) reason = 'manual-buy-validation-job-must-be-unarmed';
  else if (job.schedule?.type !== 'manual') reason = 'manual-buy-validation-manual-only';
  else if (job.policy.cardClass !== 'rare-gold') reason = 'manual-buy-validation-rare-gold-only';
  else if (Number(job.policy.ratingMax) - Number(job.policy.ratingMin) > MANUAL_BUY_VALIDATION_MAX_RATING_SPAN) {
    reason = 'manual-buy-validation-adjacent-ratings-only';
  }
  else if (Number(job.policy.quantity) < 1 || Number(job.policy.quantity) > MANUAL_BUY_VALIDATION_MAX_QUANTITY) {
    reason = 'manual-buy-validation-quantity-cap';
  }
  else if (Number(job.policy.maxBuyNow) > MANUAL_BUY_VALIDATION_MAX_PRICE) reason = 'manual-buy-validation-price-cap';
  else if (Number(job.policy.totalBudget) > MANUAL_BUY_VALIDATION_MAX_TOTAL_BUDGET) reason = 'manual-buy-validation-budget-cap';

  const maxPrice = effectiveRatingLimit(job);
  if (!reason && maxPrice > MANUAL_BUY_VALIDATION_MAX_PRICE) reason = 'manual-buy-validation-rating-price-cap';
  if (!reason && maxPrice > Number(job.policy.totalBudget)) reason = 'manual-buy-validation-budget-below-price-limit';
  if (reason) return { ready: false, reason, job, maxPrice };

  const guardedJob = {
    ...job,
    armed: false,
    schedule: { type: 'manual' },
    policy: {
      ...job.policy,
      quantity: Number(job.policy.quantity),
      maxRuntimeMinutes: Math.min(
        Number(job.policy.maxRuntimeMinutes),
        MANUAL_BUY_VALIDATION_MAX_RUNTIME_MINUTES,
      ),
      maxPurchasesPerSearch: 1,
      maxConsecutiveEmptySearches: Math.min(
        Number(job.policy.maxConsecutiveEmptySearches),
        MANUAL_BUY_VALIDATION_MAX_EMPTY_SEARCHES,
      ),
    },
  };
  return {
    ready: true,
    reason: null,
    job: guardedJob,
    maxPrice,
    requiredText: manualBuyValidationConfirmation(maxPrice, 'auto', job.policy.quantity),
  };
}
