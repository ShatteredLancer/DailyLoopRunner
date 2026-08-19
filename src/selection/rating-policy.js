import { calculateEaSquadRating } from '../domain/rating.js';

const POLICY_INPUT_KEYS = Object.freeze([
  'requiredItems',
  'preferredItems',
  'protectedItems',
  'exclusiveRoles',
  'maxOrdinaryRating',
  'protectionPolicy',
]);

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function normalizeItemRef(value) {
  if (typeof value === 'number' || typeof value === 'string') {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? { id, definitionId: 0 } : null;
  }
  const source = value?.ref || value || {};
  const id = Number(source.id || 0);
  const definitionId = Number(source.definitionId || 0);
  if (!id && !definitionId) return null;
  return { id, definitionId };
}

function normalizeItemRefs(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of values || []) {
    const ref = normalizeItemRef(value);
    if (!ref) continue;
    const key = ref.id ? `id:${ref.id}` : `definition:${ref.definitionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function itemMatchesRef(item, ref) {
  const id = Number(item?.id || item?.ref?.id || 0);
  const definitionId = Number(item?.definitionId || item?.ref?.definitionId || 0);
  return ref.id ? id === ref.id : ref.definitionId > 0 && definitionId === ref.definitionId;
}

function itemMatchesAnyRef(item, refs) {
  return refs.some((ref) => itemMatchesRef(item, ref));
}

function normalizeRole(role = {}, index, model) {
  const id = String(role.id || `exclusive-role-${index + 1}`);
  const constraintIndex = role.constraintIndex !== undefined
    ? positiveInteger(role.constraintIndex)
    : (model.constraints || []).findIndex((constraint) => String(constraint.id || '') === String(role.constraintId || ''));
  const itemRefs = normalizeItemRefs(role.itemRefs || role.items);
  const piles = [...new Set((role.piles || []).map(String).filter(Boolean))];
  const hasEntryRoleMatches = typeof role.entryMatchKey === 'string' && role.entryMatchKey.length > 0;
  const hasMatcher = itemRefs.length > 0
    || piles.length > 0
    || (constraintIndex !== null && constraintIndex >= 0 && constraintIndex < (model.constraints || []).length)
    || typeof role.matches === 'function'
    || hasEntryRoleMatches;
  const minCount = Math.max(0, positiveInteger(role.minCount ?? role.count) ?? 0);
  const maxCount = Math.max(minCount, positiveInteger(role.maxCount) ?? minCount);
  return {
    id,
    label: String(role.label || id),
    minCount,
    maxCount,
    constraintIndex: constraintIndex !== null && constraintIndex >= 0 ? constraintIndex : null,
    itemRefs,
    piles,
    matches: role.matches,
    entryMatchKey: hasEntryRoleMatches ? role.entryMatchKey : null,
    hasMatcher,
    source: 'exclusive-role',
  };
}

function roleMatchesEntry(role, entry) {
  if (role.itemRefs.length && itemMatchesAnyRef(entry.item, role.itemRefs)) return true;
  if ((role.piles || []).length && role.piles.includes(String(entry.pileName || ''))) return true;
  if (role.constraintIndex !== null) return entry.requirementMatches?.[role.constraintIndex] === true;
  if (role.entryMatchKey) {
    if (Array.isArray(entry.roleMatches)) return entry.roleMatches.includes(role.entryMatchKey);
    return entry.roleMatches?.[role.entryMatchKey] === true;
  }
  if (typeof role.matches === 'function') {
    try { return role.matches(entry.item) === true; } catch { return false; }
  }
  return false;
}

function entrySubmissionPile(entry = {}) {
  return String(
    entry.submissionPileName
      || entry.item?.pile
      || entry.item?.ref?.pile
      || entry.pileName
      || '',
  );
}

function histogram(entries = []) {
  const result = {};
  for (const entry of entries) {
    const rating = Number(entry.item?.rating || 0);
    if (!rating) continue;
    result[rating] = (result[rating] || 0) + 1;
  }
  return result;
}

function highestReachableRating(entries, requiredPlayerCount) {
  const ratings = entries
    .map((entry) => Number(entry.item?.rating || 0))
    .filter((rating) => rating > 0)
    .sort((a, b) => b - a)
    .slice(0, requiredPlayerCount);
  return ratings.length === requiredPlayerCount
    ? calculateEaSquadRating(ratings, requiredPlayerCount)
    : 0;
}

export function hasRatingSelectionPolicy(input = {}) {
  return POLICY_INPUT_KEYS.some((key) => input[key] !== undefined);
}

export function buildRatingSelectionPolicy(input = {}, candidateEntries = [], model = {}) {
  const requiredRefs = normalizeItemRefs(input.requiredItems);
  const preferredRefs = normalizeItemRefs(input.preferredItems);
  const protectedRefs = normalizeItemRefs(input.protectedItems);
  const configuredRoles = (input.exclusiveRoles || []).map((role, index) => normalizeRole(role, index, model));
  const requiredRoles = requiredRefs.map((ref, index) => ({
    id: `required-item-${index + 1}`,
    label: `required item ${index + 1}`,
    minCount: 1,
    maxCount: 1,
    constraintIndex: null,
    itemRefs: [ref],
    piles: [],
    matches: null,
    entryMatchKey: null,
    hasMatcher: true,
    source: 'required-item',
  }));
  const roles = [...configuredRoles, ...requiredRoles];
  const reserveRatings = new Set((input.protectionPolicy?.reserveRatings || [])
    .map(Number)
    .filter((rating) => Number.isFinite(rating) && rating > 0));
  const softProtectSpecialPiles = new Set((input.protectionPolicy?.softProtectSpecialPiles || [])
    .map(String)
    .filter(Boolean));
  const maxOrdinaryRating = Number(input.maxOrdinaryRating);
  const hasMaxOrdinaryRating = Number.isFinite(maxOrdinaryRating) && maxOrdinaryRating > 0;
  const counts = {
    scanned: candidateEntries.length,
    required: requiredRefs.length,
    preferred: 0,
    protected: 0,
    reserved: 0,
    overMaxOrdinaryRating: 0,
    softProtected: 0,
    eligible: 0,
  };
  const buckets = {
    eligible: [],
    softProtected: [],
    reserved: [],
    protected: [],
  };

  for (const sourceEntry of candidateEntries) {
    const roleMatches = roles.map((role) => roleMatchesEntry(role, sourceEntry));
    const matchesExclusiveRole = roleMatches.some(Boolean);
    const preferred = itemMatchesAnyRef(sourceEntry.item, preferredRefs);
    if (preferred) counts.preferred++;
    const entry = {
      ...sourceEntry,
      roleMatches,
      preferred,
      softProtected: false,
    };
    if (itemMatchesAnyRef(sourceEntry.item, protectedRefs)) {
      counts.protected++;
      buckets.protected.push(entry);
      continue;
    }
    if (!matchesExclusiveRole && hasMaxOrdinaryRating && Number(sourceEntry.item?.rating || 0) > maxOrdinaryRating) {
      counts.overMaxOrdinaryRating++;
      buckets.protected.push(entry);
      continue;
    }
    if (!matchesExclusiveRole && reserveRatings.has(Number(sourceEntry.item?.rating || 0))) {
      counts.reserved++;
      buckets.reserved.push(entry);
      continue;
    }
    if (!matchesExclusiveRole
      && sourceEntry.special === true
      && softProtectSpecialPiles.has(entrySubmissionPile(sourceEntry))) {
      counts.softProtected++;
      buckets.softProtected.push({ ...entry, softProtected: true });
      continue;
    }
    counts.eligible++;
    buckets.eligible.push(entry);
  }

  const availableForRoles = [...buckets.eligible, ...buckets.softProtected];
  const roleAvailability = roles.map((role, roleIndex) => ({
    id: role.id,
    label: role.label,
    minCount: role.minCount,
    maxCount: role.maxCount,
    source: role.source,
    available: availableForRoles.reduce((total, entry) => total + Number(entry.roleMatches[roleIndex]), 0),
  }));
  const requiredPlayerCount = Math.max(0, Number(model.requiredPlayerCount || 0));
  const diagnostic = {
    counts: { ...counts },
    ratingHistogram: {
      eligible: histogram(buckets.eligible),
      softProtected: histogram(buckets.softProtected),
      reserved: histogram(buckets.reserved),
      protected: histogram(buckets.protected),
    },
    maxReachableRating: highestReachableRating([...buckets.eligible, ...buckets.softProtected], requiredPlayerCount),
    maxReachableRatingWithBlocked: highestReachableRating(
      [...buckets.eligible, ...buckets.softProtected, ...buckets.reserved, ...buckets.protected],
      requiredPlayerCount,
    ),
    roles: roleAvailability.map((role) => ({ ...role })),
  };
  return {
    roles,
    buckets,
    counts,
    diagnostic,
    roleAvailability,
    liveRequirementsAvailable: input.protectionPolicy?.liveRequirementsAvailable !== false
      && configuredRoles.every((role) => role.hasMatcher),
    allowSoftProtectedFallback: input.protectionPolicy?.allowSoftProtectedFallback !== false,
    allowOtherSpecialAsOrdinary: input.protectionPolicy?.allowOtherSpecialAsOrdinary === true,
  };
}
