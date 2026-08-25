export const REQUIRED_SPECIAL_ALLOWANCE_MODES = Object.freeze({
  REQUIRED_ONLY: 'required-only',
  ALL_MATCHING_SPECIALS: 'all-matching-specials',
});

export const REQUIRED_SPECIAL_ALLOWANCE_SOURCES = Object.freeze({
  LIVE_MATCHER: 'live-matcher',
  EXPLICIT_METADATA: 'explicit-metadata',
  FAIL_CLOSED: 'fail-closed',
});

function requirementKey(requirement = {}) {
  return String(requirement.keyName ?? requirement.key ?? '');
}

function numericValues(requirement = {}) {
  return (requirement.values || []).map(Number).filter(Number.isFinite);
}

export function isAllSpecialEligibilityRequirement(requirement = {}) {
  const key = requirementKey(requirement);
  const values = numericValues(requirement);
  return ['PLAYER_QUALITY', 'PLAYER_LEVEL'].includes(key)
    && values.length === 1
    && values[0] === 4;
}

export function isRequiredSpecialEligibilityRequirement(requirement = {}) {
  return requirementKey(requirement) === 'PLAYER_RARITY_GROUP'
    || isAllSpecialEligibilityRequirement(requirement);
}

export function requiredSpecialAllowanceMode(requirements = []) {
  const requiredSpecial = (requirements || []).filter(isRequiredSpecialEligibilityRequirement);
  return requiredSpecial.length > 0
    && requiredSpecial.every(isAllSpecialEligibilityRequirement)
    ? REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS
    : REQUIRED_SPECIAL_ALLOWANCE_MODES.REQUIRED_ONLY;
}

export function resolvedRequiredSpecialAllowanceMode(value = {}) {
  const explicit = String(value?.requiredSpecialAllowanceMode || '');
  if (Object.values(REQUIRED_SPECIAL_ALLOWANCE_MODES).includes(explicit)) return explicit;
  return requiredSpecialAllowanceMode(value?.eligibilityRequirements || []);
}

export function isRequiredSpecialConstraint(constraint = {}) {
  return constraint.id === 'runner-required-special'
    || (constraint.source === 'ea' && isRequiredSpecialEligibilityRequirement(constraint));
}

export function allowsAllMatchingSpecials(value = {}) {
  if (value.requiredSpecialAllowanceMode) {
    return value.requiredSpecialAllowanceMode === REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS;
  }
  return requiredSpecialAllowanceMode(value.dynamicActiveEligibilityRequirements || [])
    === REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS;
}

export function requiredSpecialRoleMaximum(model = {}, constraint = {}) {
  const minimum = Math.max(0, Number(constraint.count || 0) || 0);
  if (model.requiredSpecialAllowanceMode !== REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS) {
    return minimum;
  }
  return Math.max(minimum, Number(model.requiredPlayerCount || 0) || 0);
}
