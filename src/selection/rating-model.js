import { calculateEaSquadRating } from '../domain/rating.js';
import { readPlayerDatabaseId, readPlayerRareFlag } from '../domain/player-rarity.js';
import {
  REQUIRED_SPECIAL_ALLOWANCE_MODES,
  isAllSpecialEligibilityRequirement,
  isRequiredSpecialEligibilityRequirement,
  requiredSpecialAllowanceMode,
} from '../domain/required-special.js';

const PLAYER_REQUIREMENT_KEYS = new Set([
  'PLAYER_QUALITY',
  'PLAYER_LEVEL',
  'PLAYER_RARITY',
  'PLAYER_RARITY_GROUP',
  'PLAYER_MIN_OVR',
  'PLAYER_EXACT_OVR',
  'CLUB_ID',
  'LEAGUE_ID',
  'NATION_ID',
]);

export function firstRequirementKey(requirement) {
  if (requirement?.key !== undefined && requirement?.key !== null) return requirement.key;
  try {
    const key = requirement?.getFirstKey?.();
    if (key !== undefined && key !== null) return key;
  } catch { }
  const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
  return Object.keys(collection)[0];
}

function flattenValues(value) {
  if (Array.isArray(value)) return value.flat(Infinity).filter((entry) => entry !== undefined && entry !== null);
  if (value === undefined || value === null) return [];
  return [value];
}

export function requirementValues(requirement, key) {
  const normalized = flattenValues(requirement?.values);
  if (normalized.length) return normalized;
  try {
    const values = flattenValues(requirement?.getValue?.(key));
    if (values.length) return values;
  } catch { }
  const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
  const direct = flattenValues(collection?.[key]);
  if (direct.length) return direct;
  try { return flattenValues(requirement?.getFirstValue?.(key)); } catch { return []; }
}

export function requirementCount(requirement, requiredPlayerCount) {
  const count = Number(requirement?.count);
  if (count === -1 || !Number.isFinite(count)) return requiredPlayerCount;
  return Math.max(0, Math.min(requiredPlayerCount, count));
}

export function readEligibilityRequirements(challenge, options = {}) {
  const requiredPlayerCount = Math.max(0, Number(options.requiredPlayerCount || 0) || 0);
  const eligibilityKeyName = options.eligibilityKeyName || ((key) => String(key || ''));
  return (challenge?.eligibilityRequirements || []).map((requirement) => {
    const key = firstRequirementKey(requirement);
    return {
      requirement,
      key,
      keyName: eligibilityKeyName(key),
      values: requirementValues(requirement, key),
      count: requirementCount(requirement, requiredPlayerCount),
    };
  });
}

function matchesDynamicRequirement(item, requirement, keyName, rawValues, matchers) {
  // PLAYER_RARITY_GROUP is represented directly by the live item's groups.
  // Keep that identity authoritative even if one EA model happens to expose a
  // broader meetsRequirements() helper: a card outside the encoded group must
  // never inherit permission from the expanded-group quantity policy.
  if (keyName === 'PLAYER_RARITY_GROUP') {
    // The production runtime adapter supplies exact EA item-group membership.
    try {
      const result = matchers.matchesPlayerRarityGroup?.(item, rawValues);
      if (typeof result === 'boolean') return result;
    } catch { }
    // Some isolated EA models do not expose their normalized item groups to
    // the parser. In that case retain the native requirement as the only
    // available matcher; the production userscript always supplies the live
    // item-group matcher above.
    try {
      const result = requirement?.meetsRequirements?.(item);
      if (typeof result === 'boolean') return result;
    } catch { }
    return false;
  }

  try {
    if (typeof requirement?.meetsRequirements === 'function') {
      const result = requirement.meetsRequirements(item);
      if (typeof result === 'boolean') return result;
    }
  } catch { }

  const values = rawValues.map(Number).filter(Number.isFinite);
  const rating = Number(item?.rating || 0);
  switch (keyName) {
    case 'PLAYER_QUALITY':
    case 'PLAYER_LEVEL':
      return values.some((value) =>
        (value === 1 && matchers.isBronze(item)) ||
        (value === 2 && matchers.isSilver(item)) ||
        (value === 3 && matchers.isGold(item)) ||
        (value === 4 && matchers.isSpecialItem(item))
      );
    case 'PLAYER_RARITY':
      return values.includes(readPlayerRareFlag(item));
    case 'PLAYER_MIN_OVR':
      return values.length > 0 && rating >= Math.min(...values);
    case 'PLAYER_EXACT_OVR':
      return values.includes(rating);
    case 'CLUB_ID':
      return values.includes(Number(item?.teamId ?? item?.clubId ?? item?._staticData?.teamId ?? 0));
    case 'LEAGUE_ID':
      return values.includes(matchers.itemLeagueId(item));
    case 'NATION_ID':
      return values.includes(Number(item?.nationId ?? item?._staticData?.nationId ?? 0));
    default:
      return false;
  }
}

export function parseRatingSbcChallenge(input = {}) {
  const loopDef = input.loopDef || {};
  const challenge = input.challenge || null;
  const requiredPlayerCount = Math.max(0, Number(input.requiredPlayerCount || 0) || 0);
  const eligibilityKeyName = input.eligibilityKeyName || ((key) => String(key || ''));
  const runtimePlayerRarityGroupMatcher = typeof input.matchesPlayerRarityGroup === 'function'
    ? input.matchesPlayerRarityGroup
    : typeof input.itemGroupNumbers === 'function'
      ? (item, values) => {
          const groups = new Set(input.itemGroupNumbers(item) || []);
          return (values || []).some((value) => groups.has(Number(value)));
        }
      : null;
  const matchers = {
    isBronze: input.isBronze || (() => false),
    isSilver: input.isSilver || (() => false),
    isGold: input.isGold || (() => false),
    isSpecialItem: input.isSpecialItem || (() => false),
    itemGroupNumbers: input.itemGroupNumbers || (() => []),
    matchesPlayerRarityGroup: runtimePlayerRarityGroupMatcher,
    itemLeagueId: input.itemLeagueId || (() => 0),
  };
  const constraints = [];
  const unsupported = [];
  const liveRequiredSpecialAllowanceModes = [];
  const requiredSpecialAllowanceSources = [];
  let targetRating = Number(loopDef.ratingSbcFill?.targetRating || 0) || 0;

  for (const entry of readEligibilityRequirements(challenge, { requiredPlayerCount, eligibilityKeyName })) {
    const { requirement, keyName, values, count } = entry;
    if (keyName === 'TEAM_RATING') {
      const ratings = values.map(Number).filter(Number.isFinite);
      if (ratings.length) targetRating = Math.max(targetRating, ...ratings);
      continue;
    }
    if (keyName === 'CHEMISTRY_POINTS' || keyName === 'ALL_PLAYERS_CHEMISTRY_POINTS') {
      unsupported.push(keyName);
      continue;
    }
    if (!PLAYER_REQUIREMENT_KEYS.has(keyName)) {
      unsupported.push(keyName);
      continue;
    }
    if (!count || !values.length) {
      unsupported.push(`${keyName}(count:${requirement?.count ?? '?'}, values:${values.join('/') || '?'})`);
      continue;
    }
    if (keyName === 'PLAYER_RARITY_GROUP'
      && typeof requirement?.meetsRequirements !== 'function'
      && typeof matchers.matchesPlayerRarityGroup !== 'function') {
      unsupported.push(`${keyName}(live EA matcher unavailable)`);
      continue;
    }
    const requiredSpecialRole = isRequiredSpecialEligibilityRequirement({ keyName, values });
    let liveRequiredSpecialAllowanceMode = null;
    let liveRequiredSpecialAllowanceEvidence = null;
    let liveRequiredSpecialAllowanceSource = null;
    let liveRequiredSpecialMatcher = null;
    let liveRequiredSpecialMatcherSource = null;
    if (requiredSpecialRole && typeof input.detectRequiredSpecialAllowanceMode === 'function') {
      try {
        const detection = input.detectRequiredSpecialAllowanceMode({
          requirement,
          keyName,
          values: [...values],
          count,
        });
        liveRequiredSpecialAllowanceMode = typeof detection === 'string'
          ? detection
          : detection?.mode || null;
        liveRequiredSpecialAllowanceEvidence = typeof detection === 'object'
          ? detection?.evidence || null
          : null;
        liveRequiredSpecialAllowanceSource = typeof detection === 'object'
          ? detection?.source || null
          : null;
        liveRequiredSpecialMatcher = typeof detection?.matches === 'function'
          ? detection.matches
          : null;
        liveRequiredSpecialMatcherSource = typeof detection === 'object'
          ? detection?.matcherSource || null
          : null;
      } catch { }
      if (liveRequiredSpecialAllowanceMode === REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS) {
        liveRequiredSpecialAllowanceModes.push(liveRequiredSpecialAllowanceMode);
      }
      if (liveRequiredSpecialAllowanceSource) {
        requiredSpecialAllowanceSources.push(liveRequiredSpecialAllowanceSource);
      }
    }
    constraints.push({
      id: `challenge-${constraints.length}`,
      label: `${keyName} ${values.join('/')} x${count}`,
      source: 'ea',
      keyName,
      values: [...values],
      count,
      requiredSpecialRole,
      requiredSpecialAllowanceMode: liveRequiredSpecialAllowanceMode,
      requiredSpecialAllowanceEvidence: liveRequiredSpecialAllowanceEvidence,
      requiredSpecialAllowanceSource: liveRequiredSpecialAllowanceSource,
      ...(keyName === 'PLAYER_RARITY_GROUP' ? {
        matcherSource: liveRequiredSpecialMatcherSource || (
          typeof requirement?.meetsRequirements === 'function'
            ? 'ea-requirement'
            : 'runtime-item-groups'
        ),
      } : {}),
      matches: liveRequiredSpecialMatcher
        || ((item) => matchesDynamicRequirement(item, requirement, keyName, values, matchers)),
    });
  }

  const configuredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
  const dynamicRequiredSpecial = (loopDef.dynamicActiveEligibilityRequirements || [])
    .filter(isRequiredSpecialEligibilityRequirement);
  if (configuredSpecialCount && !dynamicRequiredSpecial.length) {
    const minimumRating = Math.max(0, Number(loopDef.requiredSpecialMinRating || 0) || 0);
    const label = input.requiredSpecialLabel?.(loopDef) || 'special';
    constraints.push({
      id: 'runner-required-special',
      label: `${label} rating >= ${minimumRating} x${configuredSpecialCount}`,
      count: configuredSpecialCount,
      matches: (item) => input.isRequiredSpecialItem?.(item, loopDef) === true && Number(item?.rating || 0) >= minimumRating,
    });
  }

  const configuredAllowedSpecial = loopDef.allowedSpecialCount !== undefined
    ? Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0)
    : null;
  const requiredSpecialConstraints = constraints.filter((constraint) => (
    constraint.requiredSpecialRole === true
  ));
  const detectedAllowanceMode = requiredSpecialConstraints.length > 0
    && liveRequiredSpecialAllowanceModes.length === requiredSpecialConstraints.length
    ? REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS
    : requiredSpecialAllowanceMode(dynamicRequiredSpecial);
  // A cached loop definition must not be able to widen a PLAYER_RARITY_GROUP
  // requirement. Only the live matcher probe (or the explicit PLAYER_QUALITY /
  // PLAYER_LEVEL=4 contract) can authorize all matching specials. This keeps
  // stale Set 1356 metadata from turning group 83 into an all-special guess.
  const explicitAllMatchingSpecials = loopDef.requiredSpecialAllowanceMode
    === REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS
    && dynamicRequiredSpecial.length > 0
    && dynamicRequiredSpecial.every(isAllSpecialEligibilityRequirement);
  const allowanceMode = explicitAllMatchingSpecials
    ? REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS
    : detectedAllowanceMode;
  const dynamicRequiredSpecialLimit = dynamicRequiredSpecial.length
    ? constraints
      .filter((constraint) => constraint.requiredSpecialRole === true)
      .reduce((total, constraint) => total + Math.max(0, Number(constraint.count || 0) || 0), 0)
    : null;
  return {
    requiredPlayerCount,
    targetRating,
    constraints,
    unsupported: [...new Set(unsupported)],
    requiredSpecialAllowanceMode: allowanceMode,
    requiredSpecialAllowanceDecisionSource: requiredSpecialAllowanceSources[0]
      || (allowanceMode === REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS
        ? loopDef.requiredSpecialAllowanceDecisionSource
        : null)
      || 'fail-closed',
    requiredSpecialAllowanceEvidence: requiredSpecialConstraints
      .map((constraint) => constraint.requiredSpecialAllowanceEvidence)
      .filter(Boolean),
    maxSpecialCount: dynamicRequiredSpecialLimit !== null
      ? allowanceMode === REQUIRED_SPECIAL_ALLOWANCE_MODES.ALL_MATCHING_SPECIALS
        ? requiredPlayerCount
        : dynamicRequiredSpecialLimit
      : configuredAllowedSpecial === null
        ? (loopDef.blockSpecial === false ? requiredPlayerCount : 0)
        : configuredAllowedSpecial,
  };
}

export function validateRatingSbcModelAgainstItems(model, items = [], challenge = null, options = {}) {
  const players = (items || []).filter(Boolean);
  const errors = [];
  const requiredPlayerCount = Math.max(0, Number(model?.requiredPlayerCount || 0) || 0);
  const ratings = players.map((item) => Number(item?.rating || 0));
  const rating = players.length === requiredPlayerCount
    ? (options.calculateSquadRating || calculateEaSquadRating)(ratings, requiredPlayerCount)
    : 0;
  const definitionIds = players.map((item) => Number(item?.definitionId || 0)).filter(Boolean);
  const uniqueDefinitionCount = new Set(definitionIds).size;
  const databaseIds = players.map(readPlayerDatabaseId).filter(Boolean);
  const uniquePlayerCount = new Set(databaseIds).size;

  if (players.length !== requiredPlayerCount) errors.push(`player-count ${players.length}/${requiredPlayerCount}`);
  if (definitionIds.length !== players.length || uniqueDefinitionCount !== players.length) {
    errors.push(`unique-definitions ${uniqueDefinitionCount}/${players.length}`);
  }
  if (databaseIds.length !== players.length || uniquePlayerCount !== players.length) {
    errors.push(`unique-players ${uniquePlayerCount}/${players.length}`);
  }
  if (players.length === requiredPlayerCount && rating < Number(model?.targetRating || 0)) {
    errors.push(`team-rating ${rating}/${Number(model?.targetRating || 0)}`);
  }

  const constraintResults = (model?.constraints || []).map((constraint) => {
    const matched = players.filter((item) => {
      try { return constraint.matches(item); } catch { return false; }
    }).length;
    const required = Math.max(0, Number(constraint.count || 0) || 0);
    if (matched < required) errors.push(`${constraint.label} ${matched}/${required}`);
    return { constraint, matched, required };
  });
  const specialCount = players.filter(options.isSpecialItem || (() => false)).length;
  const maxSpecialCount = options.allowOtherSpecialAsOrdinary === true
    ? requiredPlayerCount
    : Number(model?.maxSpecialCount || 0);
  if (specialCount > maxSpecialCount) {
    errors.push(`special-count ${specialCount}/${maxSpecialCount}`);
  }

  const roleResults = (options.exclusiveRoles || model?.exclusiveRoles || []).map((role, index) => {
    const id = String(role?.id || `exclusive-role-${index + 1}`);
    const constraintIndex = role?.constraintIndex !== undefined
      ? Number(role.constraintIndex)
      : (model?.constraints || []).findIndex((constraint) => String(constraint.id || '') === String(role?.constraintId || ''));
    const constraint = Number.isInteger(constraintIndex) && constraintIndex >= 0
      ? model?.constraints?.[constraintIndex]
      : null;
    const label = String(role?.label || constraint?.label || id);
    const matcher = typeof role?.matches === 'function' ? role.matches : constraint?.matches;
    const minCount = Math.max(0, Number(role?.minCount ?? role?.count ?? 0) || 0);
    const maxCount = Math.max(minCount, Number(role?.maxCount ?? minCount) || minCount);
    let matched = 0;
    if (typeof matcher === 'function') {
      matched = players.reduce((count, item) => {
        try { return count + Number(matcher(item) === true); } catch { return count; }
      }, 0);
    }
    if (typeof matcher !== 'function') errors.push(`${label} role-matcher unavailable`);
    else if (matched < minCount || matched > maxCount) {
      errors.push(`${label} role-count ${matched}/${minCount}-${maxCount}`);
    }
    return { id, label, matched, minCount, maxCount, matcherAvailable: typeof matcher === 'function' };
  });

  let challengeReady = null;
  if (challenge && typeof challenge.meetsRequirements === 'function') {
    try {
      challengeReady = challenge.meetsRequirements() === true;
      if (!challengeReady) errors.push('challenge.meetsRequirements() returned false');
    } catch (error) {
      errors.push(`challenge.meetsRequirements() failed: ${error?.message || error}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    players,
    ratings,
    rating,
    specialCount,
    uniqueDefinitionCount,
    uniquePlayerCount,
    constraintResults,
    roleResults,
    challengeReady,
  };
}
