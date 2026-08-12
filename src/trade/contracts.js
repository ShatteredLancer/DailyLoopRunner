import { isPlainObject } from '../domain/objects.js';

export const TRADE_SCHEMA_VERSION = 1;
export const TRADE_JOB_TYPES = Object.freeze(['buy', 'listing']);
export const TRADE_CARD_CLASSES = Object.freeze(['common-gold', 'normal-gold', 'rare-gold', 'special', 'gold']);
export const TRADE_SCHEDULE_TYPES = Object.freeze(['manual', 'once', 'daily', 'interval', 'window']);
export const TRADE_MISFIRE_POLICIES = Object.freeze(['skip', 'grace-window', 'next-login']);
export const TRADE_PRICE_PROVIDERS = Object.freeze(['auto', 'futgg', 'futnext']);

const TOP_LEVEL_FIELDS = new Set([
  'schemaVersion', 'id', 'name', 'type', 'enabled', 'armed', 'schedule',
  'misfirePolicy', 'policy', 'createdAt', 'updatedAt',
]);

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeRange(value, fallback) {
  const values = Array.isArray(value) ? value : fallback;
  const first = positiveInteger(values?.[0], fallback[0]);
  const second = positiveInteger(values?.[1], fallback[1]);
  return [Math.min(first, second), Math.max(first, second)];
}

function pushRequiredString(value, path, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${path} is required`);
}

function pushPositiveNumber(value, path, errors) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) errors.push(`${path} must be a positive number`);
}

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: String(value || '') }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function validateSchedule(schedule, path, errors) {
  if (!isPlainObject(schedule)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!TRADE_SCHEDULE_TYPES.includes(schedule.type)) {
    errors.push(`${path}.type must be one of: ${TRADE_SCHEDULE_TYPES.join(', ')}`);
    return;
  }
  if (schedule.type === 'once') pushPositiveNumber(schedule.runAt, `${path}.runAt`, errors);
  if (schedule.type === 'daily') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(schedule.time || ''))) {
      errors.push(`${path}.time must use HH:mm`);
    }
    pushRequiredString(schedule.timezone, `${path}.timezone`, errors);
    if (typeof schedule.timezone === 'string' && schedule.timezone.trim() && !validTimeZone(schedule.timezone)) {
      errors.push(`${path}.timezone must be a valid IANA timezone`);
    }
  }
  if (schedule.type === 'interval') pushPositiveNumber(schedule.everyMinutes, `${path}.everyMinutes`, errors);
  if (schedule.type === 'window') {
    pushPositiveNumber(schedule.startAt, `${path}.startAt`, errors);
    pushPositiveNumber(schedule.endAt, `${path}.endAt`, errors);
    if (Number(schedule.endAt) <= Number(schedule.startAt)) errors.push(`${path}.endAt must be after startAt`);
  }
}

function validateMisfirePolicy(policy, path, errors) {
  if (!isPlainObject(policy)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!TRADE_MISFIRE_POLICIES.includes(policy.type)) {
    errors.push(`${path}.type must be one of: ${TRADE_MISFIRE_POLICIES.join(', ')}`);
  }
  if (policy.type === 'grace-window') pushPositiveNumber(policy.graceMinutes, `${path}.graceMinutes`, errors);
}

function validateCardClass(value, path, errors) {
  if (!TRADE_CARD_CLASSES.includes(value)) {
    errors.push(`${path} must be explicitly set to one of: ${TRADE_CARD_CLASSES.join(', ')}`);
  }
}

function validateDelayRange(value, path, errors) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((entry) => !Number.isFinite(Number(entry)) || Number(entry) <= 0)) {
    errors.push(`${path} must contain two positive numbers`);
    return;
  }
  if (Number(value[1]) < Number(value[0])) errors.push(`${path}[1] must be greater than or equal to ${path}[0]`);
}

function validateBuyPolicy(policy, path, errors) {
  if (!isPlainObject(policy)) {
    errors.push(`${path} must be an object`);
    return;
  }
  validateCardClass(policy.cardClass, `${path}.cardClass`, errors);
  for (const field of ['ratingMin', 'ratingMax']) {
    const rating = Number(policy[field]);
    if (!Number.isInteger(rating) || rating < 1 || rating > 99) errors.push(`${path}.${field} must be an integer between 1 and 99`);
  }
  if (Number(policy.ratingMax) < Number(policy.ratingMin)) errors.push(`${path}.ratingMax must be greater than or equal to ratingMin`);
  for (const field of ['maxBuyNow', 'quantity', 'totalBudget', 'maxRuntimeMinutes', 'maxConsecutiveEmptySearches']) {
    pushPositiveNumber(policy[field], `${path}.${field}`, errors);
  }
  if (policy.minimumRetainedCoins !== null
    && policy.minimumRetainedCoins !== undefined
    && (!Number.isInteger(Number(policy.minimumRetainedCoins)) || Number(policy.minimumRetainedCoins) < 0)) {
    errors.push(`${path}.minimumRetainedCoins must be null or a non-negative integer`);
  }
  if (Number(policy.maxPurchasesPerSearch) !== 1) errors.push(`${path}.maxPurchasesPerSearch must be 1`);
  validateDelayRange(policy.searchDelaySeconds, `${path}.searchDelaySeconds`, errors);
  if (!isPlainObject(policy.ratingPriceOverrides)) {
    errors.push(`${path}.ratingPriceOverrides must be an object`);
  } else {
    for (const [ratingText, price] of Object.entries(policy.ratingPriceOverrides)) {
      const rating = Number(ratingText);
      if (!Number.isInteger(rating) || rating < Number(policy.ratingMin) || rating > Number(policy.ratingMax)) {
        errors.push(`${path}.ratingPriceOverrides.${ratingText} must target a rating inside the job range`);
      }
      pushPositiveNumber(price, `${path}.ratingPriceOverrides.${ratingText}`, errors);
    }
  }
  if (!isPlainObject(policy.ratingQuantityOverrides)) {
    errors.push(`${path}.ratingQuantityOverrides must be an object`);
  } else {
    for (const [ratingText, quantity] of Object.entries(policy.ratingQuantityOverrides)) {
      const rating = Number(ratingText);
      if (!Number.isInteger(rating) || rating < Number(policy.ratingMin) || rating > Number(policy.ratingMax)) {
        errors.push(`${path}.ratingQuantityOverrides.${ratingText} must target a rating inside the job range`);
      }
      if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
        errors.push(`${path}.ratingQuantityOverrides.${ratingText} must be a positive integer`);
      }
    }
  }
}

function validateRatingRules(rules, path, errors) {
  if (!Array.isArray(rules) || !rules.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  const covered = new Set();
  rules.forEach((rule, index) => {
    const rulePath = `${path}[${index}]`;
    if (!isPlainObject(rule)) {
      errors.push(`${rulePath} must be an object`);
      return;
    }
    const min = Number(rule.min);
    const max = Number(rule.max);
    if (!Number.isInteger(min) || min < 1 || min > 99) errors.push(`${rulePath}.min must be an integer between 1 and 99`);
    if (!Number.isInteger(max) || max < min || max > 99) errors.push(`${rulePath}.max must be between min and 99`);
    pushPositiveNumber(rule.buyNow, `${rulePath}.buyNow`, errors);
    if (Number.isInteger(min) && Number.isInteger(max) && max >= min) {
      for (let rating = min; rating <= max; rating += 1) {
        if (covered.has(rating)) errors.push(`${rulePath} overlaps another rating rule at ${rating}`);
        covered.add(rating);
      }
    }
  });
}

function validateListingPolicy(policy, path, errors) {
  if (!isPlainObject(policy)) {
    errors.push(`${path} must be an object`);
    return;
  }
  validateCardClass(policy.cardClass, `${path}.cardClass`, errors);
  if (!Array.isArray(policy.sources) || !policy.sources.length || policy.sources.some((source) => !['club', 'transfer'].includes(source))) {
    errors.push(`${path}.sources must contain club and/or transfer`);
  }
  validateRatingRules(policy.ratingRules, `${path}.ratingRules`, errors);
  if (!isPlainObject(policy.marketOverride)) {
    errors.push(`${path}.marketOverride must be an object`);
  } else {
    if (typeof policy.marketOverride.enabled !== 'boolean') errors.push(`${path}.marketOverride.enabled must be boolean`);
    if (!Number.isFinite(Number(policy.marketOverride.markupPercent)) || Number(policy.marketOverride.markupPercent) < 0) {
      errors.push(`${path}.marketOverride.markupPercent must be zero or greater`);
    }
    pushPositiveNumber(policy.marketOverride.maxQuoteAgeMinutes, `${path}.marketOverride.maxQuoteAgeMinutes`, errors);
    if (!['configured', 'skip'].includes(policy.marketOverride.fallbackPolicy)) {
      errors.push(`${path}.marketOverride.fallbackPolicy must be configured or skip`);
    }
  }
  if (!['one-step-below', 'same'].includes(policy.startPricePolicy)) {
    errors.push(`${path}.startPricePolicy must be one-step-below or same`);
  }
  if (!['skip', 'reprice'].includes(policy.expiredPolicy)) errors.push(`${path}.expiredPolicy must be skip or reprice`);
  for (const field of ['durationSeconds', 'maxListings']) pushPositiveNumber(policy[field], `${path}.${field}`, errors);
  validateDelayRange(policy.listingDelaySeconds, `${path}.listingDelaySeconds`, errors);
}

export function validateTradeJob(job, label = 'Trade job') {
  const errors = [];
  if (!isPlainObject(job)) return [`${label} must be an object`];
  for (const field of Object.keys(job)) {
    if (!TOP_LEVEL_FIELDS.has(field)) errors.push(`${label}.${field} is not supported`);
  }
  if (Number(job.schemaVersion) !== TRADE_SCHEMA_VERSION) errors.push(`${label}.schemaVersion must be ${TRADE_SCHEMA_VERSION}`);
  pushRequiredString(job.id, `${label}.id`, errors);
  pushRequiredString(job.name, `${label}.name`, errors);
  if (!TRADE_JOB_TYPES.includes(job.type)) errors.push(`${label}.type must be one of: ${TRADE_JOB_TYPES.join(', ')}`);
  for (const field of ['enabled', 'armed']) {
    if (typeof job[field] !== 'boolean') errors.push(`${label}.${field} must be boolean`);
  }
  validateSchedule(job.schedule, `${label}.schedule`, errors);
  if (job.schedule?.type === 'manual' && job.armed === true) {
    errors.push(`${label}.armed must be false for a manual schedule`);
  }
  validateMisfirePolicy(job.misfirePolicy, `${label}.misfirePolicy`, errors);
  if (job.type === 'buy') validateBuyPolicy(job.policy, `${label}.policy`, errors);
  if (job.type === 'listing') validateListingPolicy(job.policy, `${label}.policy`, errors);
  for (const field of ['createdAt', 'updatedAt']) {
    if (!Number.isFinite(Number(job[field])) || Number(job[field]) < 0) errors.push(`${label}.${field} must be a non-negative epoch value`);
  }
  return errors;
}

export function assertValidTradeJob(job, label = 'Trade job') {
  const errors = validateTradeJob(job, label);
  if (errors.length) throw new Error(`${label} validation failed:\n- ${errors.join('\n- ')}`);
  return job;
}

function normalizeSchedule(value = {}) {
  const type = TRADE_SCHEDULE_TYPES.includes(value.type) ? value.type : 'manual';
  const schedule = { type };
  if (type === 'once') schedule.runAt = finiteNumber(value.runAt);
  if (type === 'daily') {
    schedule.time = String(value.time || '00:00');
    schedule.timezone = String(value.timezone || 'UTC');
  }
  if (type === 'interval') {
    schedule.everyMinutes = positiveInteger(value.everyMinutes, 60);
    if (value.anchorAt !== undefined) schedule.anchorAt = finiteNumber(value.anchorAt);
  }
  if (type === 'window') {
    schedule.startAt = finiteNumber(value.startAt);
    schedule.endAt = finiteNumber(value.endAt);
  }
  return schedule;
}

function normalizeMisfirePolicy(value = {}) {
  const type = TRADE_MISFIRE_POLICIES.includes(value.type) ? value.type : 'grace-window';
  return type === 'grace-window'
    ? { type, graceMinutes: positiveInteger(value.graceMinutes, 15) }
    : { type };
}

function normalizeBuyPolicy(value = {}) {
  const ratingMin = positiveInteger(value.ratingMin, 84);
  const ratingMax = positiveInteger(value.ratingMax, ratingMin);
  return {
    ratingMin: Math.min(99, Math.min(ratingMin, ratingMax)),
    ratingMax: Math.min(99, Math.max(ratingMin, ratingMax)),
    cardClass: String(value.cardClass || ''),
    maxBuyNow: positiveInteger(value.maxBuyNow, 1000),
    ratingPriceOverrides: Object.fromEntries(Object.entries(value.ratingPriceOverrides || {})
      .map(([rating, price]) => [String(Number(rating)), positiveInteger(price, 0)])
      .filter(([, price]) => price > 0)),
    ratingQuantityOverrides: Object.fromEntries(Object.entries(value.ratingQuantityOverrides || {})
      .map(([rating, quantity]) => [String(Number(rating)), positiveInteger(quantity, 0)])
      .filter(([, quantity]) => quantity > 0)),
    quantity: positiveInteger(value.quantity, 10),
    totalBudget: positiveInteger(value.totalBudget, 10000),
    minimumRetainedCoins: value.minimumRetainedCoins === null
      || value.minimumRetainedCoins === undefined
      || value.minimumRetainedCoins === ''
      ? null
      : Number.isFinite(Number(value.minimumRetainedCoins))
        ? Math.floor(Number(value.minimumRetainedCoins))
        : -1,
    maxRuntimeMinutes: positiveInteger(value.maxRuntimeMinutes, 30),
    searchDelaySeconds: normalizeRange(value.searchDelaySeconds, [8, 15]),
    maxPurchasesPerSearch: 1,
    maxConsecutiveEmptySearches: positiveInteger(value.maxConsecutiveEmptySearches, 30),
  };
}

function normalizeListingPolicy(value = {}) {
  return {
    sources: [...new Set((value.sources || ['club']).map(String))],
    cardClass: String(value.cardClass || ''),
    ratingRules: (value.ratingRules || []).map((rule) => ({
      min: positiveInteger(rule?.min, 0),
      max: positiveInteger(rule?.max, 0),
      buyNow: positiveInteger(rule?.buyNow, 0),
    })),
    marketOverride: {
      enabled: value.marketOverride?.enabled === true,
      markupPercent: Math.max(0, finiteNumber(value.marketOverride?.markupPercent, 5)),
      maxQuoteAgeMinutes: positiveInteger(value.marketOverride?.maxQuoteAgeMinutes, 10),
      fallbackPolicy: value.marketOverride?.fallbackPolicy === 'skip' ? 'skip' : 'configured',
    },
    startPricePolicy: String(value.startPricePolicy || 'one-step-below'),
    durationSeconds: positiveInteger(value.durationSeconds, 3600),
    listingDelaySeconds: normalizeRange(value.listingDelaySeconds, [4, 8]),
    maxListings: positiveInteger(value.maxListings, 50),
    expiredPolicy: String(value.expiredPolicy || 'skip'),
  };
}

export function normalizeTradeJob(input = {}, options = {}) {
  const now = Math.max(0, finiteNumber(options.now, Date.now()));
  const type = TRADE_JOB_TYPES.includes(input.type) ? input.type : String(input.type || '');
  const schedule = normalizeSchedule(input.schedule);
  const normalized = {
    schemaVersion: TRADE_SCHEMA_VERSION,
    id: String(input.id || '').trim(),
    name: String(input.name || '').trim(),
    type,
    enabled: input.enabled === true,
    armed: options.imported === true || schedule.type === 'manual' ? false : input.armed === true,
    schedule,
    misfirePolicy: normalizeMisfirePolicy(input.misfirePolicy),
    policy: type === 'buy' ? normalizeBuyPolicy(input.policy) : normalizeListingPolicy(input.policy),
    createdAt: Math.max(0, finiteNumber(input.createdAt, now)),
    updatedAt: Math.max(0, finiteNumber(input.updatedAt, now)),
  };
  assertValidTradeJob(normalized);
  return normalized;
}

export function createTradeRunReceipt(input = {}) {
  return {
    runId: String(input.runId || ''),
    jobId: String(input.jobId || ''),
    jobType: String(input.jobType || ''),
    scheduledFor: Math.max(0, finiteNumber(input.scheduledFor)),
    startedAt: Math.max(0, finiteNumber(input.startedAt)),
    finishedAt: Math.max(0, finiteNumber(input.finishedAt)),
    status: String(input.status || 'blocked'),
    reason: input.reason === undefined || input.reason === null ? null : String(input.reason),
    requested: Math.max(0, positiveInteger(input.requested, 0)),
    succeeded: Math.max(0, positiveInteger(input.succeeded, 0)),
    failed: Math.max(0, positiveInteger(input.failed, 0)),
    skipped: Math.max(0, positiveInteger(input.skipped, 0)),
    coinsBefore: nullableFiniteNumber(input.coinsBefore),
    coinsAfter: nullableFiniteNumber(input.coinsAfter),
    receipts: cloneSerializable(input.receipts || []),
  };
}

export function createTradeCapabilitySnapshot(input = {}) {
  const capacity = input.transferCapacity || {};
  const max = nullableFiniteNumber(capacity.max);
  const used = nullableFiniteNumber(capacity.used);
  return {
    schemaVersion: TRADE_SCHEMA_VERSION,
    capturedAt: Math.max(0, finiteNumber(input.capturedAt, Date.now())),
    runtimeReady: input.runtimeReady === true,
    canTrade: input.canTrade === true,
    tradeAccess: {
      available: input.tradeAccess?.available === true,
      allowed: typeof input.tradeAccess?.allowed === 'boolean' ? input.tradeAccess.allowed : null,
      level: ['string', 'number', 'boolean'].includes(typeof input.tradeAccess?.level) ? input.tradeAccess.level : null,
    },
    coins: nullableFiniteNumber(input.coins),
    transferCapacity: {
      used,
      max,
      free: used !== null && max !== null ? Math.max(0, max - used) : null,
    },
    criteria: {
      constructorAvailable: input.criteria?.constructorAvailable === true,
      fields: [...new Set((input.criteria?.fields || []).map(String))].sort(),
      defaults: cloneSerializable(input.criteria?.defaults || {}),
    },
    methods: Object.fromEntries(Object.entries(input.methods || {}).map(([name, available]) => [String(name), available === true])),
    warnings: [...new Set((input.warnings || []).map(String).filter(Boolean))],
  };
}
