import { normalizeTradeJob } from './contracts.js';

export const SCHEDULED_BUY_VALIDATION_MAX_PRICE = 2_000;
export const SCHEDULED_BUY_VALIDATION_MAX_TOTAL_BUDGET = 8_000;
export const SCHEDULED_BUY_VALIDATION_MAX_QUANTITY = 4;
export const SCHEDULED_BUY_VALIDATION_MAX_RATING_SPAN = 3;
export const SCHEDULED_BUY_VALIDATION_MAX_RUNTIME_MINUTES = 15;
export const SCHEDULED_BUY_VALIDATION_MAX_EMPTY_SEARCHES = 5;

function effectiveRatingLimit(job) {
  const limits = [];
  for (let rating = Number(job.policy.ratingMin); rating <= Number(job.policy.ratingMax); rating += 1) {
    const override = Number(job.policy.ratingPriceOverrides?.[String(rating)]);
    limits.push(Number.isFinite(override) && override > 0 ? override : Number(job.policy.maxBuyNow));
  }
  return Math.max(...limits);
}

function explicitMinimumRetainedCoins(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function scheduledBuyValidationConfirmation(minimumRetainedCoins, quantity = 1, scheduleType = 'once', runs = 1) {
  const minimum = explicitMinimumRetainedCoins(minimumRetainedCoins);
  if (minimum === null) throw new Error('Scheduled Buy minimum retained coins must be explicit');
  const count = Math.min(SCHEDULED_BUY_VALIDATION_MAX_QUANTITY, Math.max(1, Math.floor(Number(quantity) || 1)));
  const prefix = `RUN BUY ${String(scheduleType || 'once').toUpperCase()} ${count} RESERVE ${minimum}`;
  return scheduleType === 'once' || scheduleType === 'window' ? prefix : `${prefix} FOR ${runs} RUNS`;
}

export function inspectScheduledBuyValidationJob(input = {}, options = {}) {
  let job;
  try {
    job = normalizeTradeJob(input, { now: options.now ?? Date.now() });
  } catch (error) {
    return { ready: false, reason: 'scheduled-buy-job-invalid', error: error?.message || String(error), job: null };
  }

  const globalMinimum = explicitMinimumRetainedCoins(options.minimumRetainedCoins);
  const jobMinimum = explicitMinimumRetainedCoins(job.policy.minimumRetainedCoins);
  let reason = null;
  if (job.type !== 'buy') reason = 'scheduled-buy-validation-buy-only';
  else if (job.enabled !== true) reason = 'scheduled-buy-validation-job-disabled';
  else if (!['once', 'daily', 'interval', 'window'].includes(job.schedule?.type)) reason = 'scheduled-buy-validation-schedule-unsupported';
  else if (job.armed !== true) reason = 'scheduled-buy-validation-job-not-armed';
  else if (job.schedule?.type === 'once' && (!Number.isFinite(Number(job.schedule?.runAt)) || Number(job.schedule.runAt) <= 0)) reason = 'scheduled-buy-validation-run-at-invalid';
  else if (!['skip', 'grace-window'].includes(job.misfirePolicy?.type)) reason = 'scheduled-buy-validation-next-login-disabled';
  else if (job.misfirePolicy?.type === 'grace-window' && Number(job.misfirePolicy.graceMinutes) > 15) reason = 'scheduled-buy-validation-grace-too-long';
  else if (job.policy.cardClass !== 'rare-gold') reason = 'scheduled-buy-validation-rare-gold-only';
  else if (Number(job.policy.ratingMax) - Number(job.policy.ratingMin) > SCHEDULED_BUY_VALIDATION_MAX_RATING_SPAN) {
    reason = 'scheduled-buy-validation-adjacent-ratings-only';
  }
  else if (Number(job.policy.quantity) < 1 || Number(job.policy.quantity) > SCHEDULED_BUY_VALIDATION_MAX_QUANTITY) {
    reason = 'scheduled-buy-validation-quantity-cap';
  }
  else if (Number(job.policy.maxBuyNow) > SCHEDULED_BUY_VALIDATION_MAX_PRICE) reason = 'scheduled-buy-validation-price-cap';
  else if (Number(job.policy.totalBudget) > SCHEDULED_BUY_VALIDATION_MAX_TOTAL_BUDGET) reason = 'scheduled-buy-validation-budget-cap';
  else if (globalMinimum === null) reason = 'scheduled-buy-validation-global-reserve-required';

  const maxPrice = effectiveRatingLimit(job);
  if (!reason && maxPrice > SCHEDULED_BUY_VALIDATION_MAX_PRICE) reason = 'scheduled-buy-validation-rating-price-cap';
  if (!reason && maxPrice > Number(job.policy.totalBudget)) reason = 'scheduled-buy-validation-budget-below-price-limit';
  if (reason) return { ready: false, reason, job, maxPrice, minimumRetainedCoins: globalMinimum };

  const minimumRetainedCoins = Math.max(globalMinimum, jobMinimum ?? 0);
  const guardedJob = {
    ...job,
    policy: {
      ...job.policy,
      quantity: Number(job.policy.quantity),
      minimumRetainedCoins,
      maxRuntimeMinutes: Math.min(
        Number(job.policy.maxRuntimeMinutes),
        SCHEDULED_BUY_VALIDATION_MAX_RUNTIME_MINUTES,
      ),
      maxPurchasesPerSearch: 1,
      maxConsecutiveEmptySearches: Math.min(
        Number(job.policy.maxConsecutiveEmptySearches),
        SCHEDULED_BUY_VALIDATION_MAX_EMPTY_SEARCHES,
      ),
    },
  };
  return {
    ready: true,
    reason: null,
    job: guardedJob,
    maxPrice,
    minimumRetainedCoins,
    maxSpend: Number(job.policy.totalBudget),
    requiredText: scheduledBuyValidationConfirmation(
      minimumRetainedCoins,
      job.policy.quantity,
      job.schedule.type,
      options.authorizationRuns || 2,
    ),
  };
}
