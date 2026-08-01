import { isPlainObject } from '../domain/objects.js';

export const SBC_FODDER_MODES = Object.freeze([
  'inherit',
  'auto',
  'low-gold',
  'rating-constrained',
]);

export const DEFAULT_SBC_FODDER_POLICY = Object.freeze({
  mode: 'auto',
  lowRatedGoldMaxRating: 82,
  ratingSbcMaxCardRating: 88,
});

function boundedRating(value, fallback) {
  const parsed = Number(value);
  return Math.max(1, Math.min(99, Number.isFinite(parsed) ? parsed : fallback));
}

function policyObject(input = {}) {
  if (!isPlainObject(input)) return {};
  return isPlainObject(input.sbcFodderPolicy) ? input.sbcFodderPolicy : input;
}

function configuredMode(input = {}) {
  const value = String(policyObject(input).mode || '').trim();
  return SBC_FODDER_MODES.includes(value) ? value : 'inherit';
}

export function inferSbcFodderMode(loopDef = {}) {
  const explicit = configuredMode(loopDef);
  if (explicit !== 'inherit' && explicit !== 'auto') return explicit;
  if (isPlainObject(loopDef.ratingSbcFill)) return 'rating-constrained';
  if ((loopDef.dynamicChallenges || []).some((challenge) => Number(challenge?.targetRating || 0) > 0)) {
    return 'rating-constrained';
  }
  if (Number(loopDef.ratingSbcFill?.targetRating || 0) > 0) return 'rating-constrained';
  return 'low-gold';
}

function legacyLowGoldMaxRating(input = {}) {
  if (!isPlainObject(input)) return undefined;
  const nestedPick = isPlainObject(input.pickOptions) ? input.pickOptions : {};
  const directMax = input.maxNormalGoldSubmittedRating;
  if (directMax !== undefined) return boundedRating(directMax, DEFAULT_SBC_FODDER_POLICY.lowRatedGoldMaxRating);
  const protect = nestedPick.protectHighGold ?? input.protectHighGold;
  if (protect !== true) return undefined;
  const threshold = nestedPick.highGoldThreshold
    ?? input.pickHighGoldThreshold
    ?? input.highGoldThreshold
    ?? 82;
  return Math.max(1, boundedRating(threshold, 82) - 1);
}

function policyOverrides(input = {}) {
  if (!isPlainObject(input)) return {};
  const nested = policyObject(input);
  const result = {};
  const mode = configuredMode(input);
  if (mode !== 'inherit') result.mode = mode;
  if (nested.lowRatedGoldMaxRating !== undefined) {
    result.lowRatedGoldMaxRating = boundedRating(
      nested.lowRatedGoldMaxRating,
      DEFAULT_SBC_FODDER_POLICY.lowRatedGoldMaxRating,
    );
  } else {
    const legacy = legacyLowGoldMaxRating(input);
    if (legacy !== undefined) result.lowRatedGoldMaxRating = legacy;
  }
  if (nested.ratingSbcMaxCardRating !== undefined) {
    result.ratingSbcMaxCardRating = boundedRating(
      nested.ratingSbcMaxCardRating,
      DEFAULT_SBC_FODDER_POLICY.ratingSbcMaxCardRating,
    );
  } else if (input.maxSubmittedRating !== undefined && inferSbcFodderMode(input) === 'rating-constrained') {
    result.ratingSbcMaxCardRating = boundedRating(
      input.maxSubmittedRating,
      DEFAULT_SBC_FODDER_POLICY.ratingSbcMaxCardRating,
    );
  }
  return result;
}

export function normalizeSbcFodderPolicy(input = {}) {
  return resolveSbcFodderPolicy(DEFAULT_SBC_FODDER_POLICY, input);
}

export function resolveSbcFodderPolicy(globalPolicy = {}, ...overrides) {
  const resolved = { ...DEFAULT_SBC_FODDER_POLICY };
  for (const input of [globalPolicy, ...overrides]) {
    Object.assign(resolved, policyOverrides(input));
  }
  return {
    mode: resolved.mode === 'inherit' ? 'auto' : resolved.mode,
    lowRatedGoldMaxRating: boundedRating(
      resolved.lowRatedGoldMaxRating,
      DEFAULT_SBC_FODDER_POLICY.lowRatedGoldMaxRating,
    ),
    ratingSbcMaxCardRating: boundedRating(
      resolved.ratingSbcMaxCardRating,
      DEFAULT_SBC_FODDER_POLICY.ratingSbcMaxCardRating,
    ),
  };
}

export function effectiveSbcFodderPolicy(loopDef = {}, inheritedPolicy = DEFAULT_SBC_FODDER_POLICY) {
  const policy = resolveSbcFodderPolicy(inheritedPolicy, loopDef);
  return {
    ...policy,
    mode: policy.mode === 'auto' ? inferSbcFodderMode(loopDef) : policy.mode,
  };
}

export function applySbcFodderPolicy(loopDef, inheritedPolicy = DEFAULT_SBC_FODDER_POLICY) {
  const policy = resolveSbcFodderPolicy(inheritedPolicy, loopDef);
  const container = ['dailyRoutine', 'workflowRoutine'].includes(loopDef?.strategy);
  loopDef.runtimeSbcFodderPolicy = {
    ...policy,
    mode: policy.mode === 'auto' && !container ? inferSbcFodderMode(loopDef) : policy.mode,
  };
  return loopDef;
}

export function effectiveNormalGoldMaxRating(policy = {}, fsuGoldRange = null, businessMaxRating = null) {
  const limits = [policy.lowRatedGoldMaxRating, businessMaxRating]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (Array.isArray(fsuGoldRange)) {
    const fsuMax = Number(fsuGoldRange[1]);
    if (Number.isFinite(fsuMax) && fsuMax > 0) limits.push(fsuMax);
  }
  return limits.length ? Math.min(...limits) : 0;
}
