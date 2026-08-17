import { createSelectionPlan } from '../domain/contracts.js';
import { buildRatingSelectionPolicy, hasRatingSelectionPolicy } from './rating-policy.js';
import { buildDeterministicRatingRecipes } from './rating-recipes.js';

function comparePileSelections(a, b, piles, policyAware = false) {
  if (policyAware) {
    const aSoftProtected = Number(a?.softProtectedCount || 0);
    const bSoftProtected = Number(b?.softProtectedCount || 0);
    if (aSoftProtected !== bSoftProtected) return aSoftProtected - bSoftProtected;
    const aPreferred = Number(a?.preferredCount || 0);
    const bPreferred = Number(b?.preferredCount || 0);
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;
  }
  for (const pile of piles) {
    const aCount = Number(a?.pileCounts?.[pile] || 0);
    const bCount = Number(b?.pileCounts?.[pile] || 0);
    if (aCount !== bCount) return bCount - aCount;
  }
  const aIds = (a?.entries || []).map((entry) => Number(entry.item?.id || 0)).sort((x, y) => x - y);
  const bIds = (b?.entries || []).map((entry) => Number(entry.item?.id || 0)).sort((x, y) => x - y);
  for (let index = 0; index < Math.max(aIds.length, bIds.length); index++) {
    if ((aIds[index] || 0) !== (bIds[index] || 0)) return (aIds[index] || 0) - (bIds[index] || 0);
  }
  return 0;
}

function mergePileCounts(a = {}, b = {}) {
  const result = { ...a };
  Object.entries(b).forEach(([pile, count]) => {
    result[pile] = Number(result[pile] || 0) + Number(count || 0);
  });
  return result;
}

function ratingGroupSelectionOptions(entries, count, model, piles, roles = []) {
  const policyAware = roles.length > 0 || entries.some((entry) => entry.preferred || entry.softProtected);
  if (!count) return [{
    entries: [],
    progress: model.constraints.map(() => 0),
    roleCounts: roles.map(() => 0),
    specialCount: 0,
    preferredCount: 0,
    softProtectedCount: 0,
    pileCounts: {},
  }];
  const signatureCounts = new Map();
  const compactEntries = entries.filter((entry) => {
    const signature = `${entry.requirementMatches.map(Number).join('')}:${(entry.roleMatches || []).map(Number).join('')}:${Number(entry.special)}:${Number(entry.preferred)}:${Number(entry.softProtected)}:${entry.pileName}`;
    const seen = Number(signatureCounts.get(signature) || 0);
    if (seen >= count) return false;
    signatureCounts.set(signature, seen + 1);
    return true;
  });
  let states = new Map();
  states.set(`0|0|${model.constraints.map(() => 0).join('.')}|${roles.map(() => 0).join('.')}`, {
    entries: [],
    progress: model.constraints.map(() => 0),
    roleCounts: roles.map(() => 0),
    specialCount: 0,
    preferredCount: 0,
    softProtectedCount: 0,
    pileCounts: {},
  });

  for (const entry of compactEntries) {
    const next = new Map(states);
    for (const state of states.values()) {
      if (state.entries.length >= count) continue;
      const specialCount = state.specialCount + Number(entry.special);
      if (specialCount > model.maxSpecialCount) continue;
      const roleCounts = state.roleCounts.map((value, index) => value + Number(entry.roleMatches?.[index] === true));
      if (roleCounts.some((value, index) => value > roles[index].maxCount)) continue;
      const progress = state.progress.map((value, index) => Math.min(
        model.constraints[index].count,
        value + Number(entry.requirementMatches[index]),
      ));
      const candidate = {
        entries: [...state.entries, entry],
        progress,
        roleCounts,
        specialCount,
        preferredCount: state.preferredCount + Number(entry.preferred === true),
        softProtectedCount: state.softProtectedCount + Number(entry.softProtected === true),
        pileCounts: mergePileCounts(state.pileCounts, { [entry.pileName]: 1 }),
      };
      const key = `${candidate.entries.length}|${specialCount}|${progress.join('.')}|${roleCounts.join('.')}`;
      const existing = next.get(key);
      if (!existing || comparePileSelections(candidate, existing, piles, policyAware) < 0) next.set(key, candidate);
    }
    states = next;
  }
  return [...states.values()].filter((state) => state.entries.length === count);
}

function buildMaterializationContext(entries, model, piles, roles = []) {
  const entriesByRating = new Map();
  for (const entry of entries) {
    const rating = Number(entry.item?.rating || 0);
    if (!rating) continue;
    const group = entriesByRating.get(rating) || [];
    group.push(entry);
    entriesByRating.set(rating, group);
  }
  for (const group of entriesByRating.values()) {
    group.sort((a, b) => a.pileRank - b.pileRank || Number(a.item?.id || 0) - Number(b.item?.id || 0));
  }
  return { entriesByRating, optionCache: new Map(), model, piles, roles };
}

function materializeRatingVector(context, descendingRatings) {
  const { entriesByRating, optionCache, model, piles, roles } = context;
  const policyAware = roles.length > 0
    || [...entriesByRating.values()].some((entries) => entries.some((entry) => entry.preferred || entry.softProtected));
  const counts = new Map();
  descendingRatings.forEach((rating) => counts.set(rating, (counts.get(rating) || 0) + 1));
  let combined = new Map();
  combined.set(`0|${model.constraints.map(() => 0).join('.')}|${roles.map(() => 0).join('.')}`, {
    entries: [],
    progress: model.constraints.map(() => 0),
    roleCounts: roles.map(() => 0),
    specialCount: 0,
    preferredCount: 0,
    softProtectedCount: 0,
    pileCounts: {},
  });

  for (const [rating, count] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
    const cacheKey = `${rating}:${count}`;
    let options = optionCache.get(cacheKey);
    if (!options) {
      options = ratingGroupSelectionOptions(entriesByRating.get(Number(rating)) || [], count, model, piles, roles);
      optionCache.set(cacheKey, options);
    }
    if (!options.length) return null;
    const next = new Map();
    for (const base of combined.values()) {
      for (const option of options) {
        const specialCount = base.specialCount + option.specialCount;
        if (specialCount > model.maxSpecialCount) continue;
        const roleCounts = base.roleCounts.map((value, index) => value + option.roleCounts[index]);
        if (roleCounts.some((value, index) => value > roles[index].maxCount)) continue;
        const progress = base.progress.map((value, index) => Math.min(
          model.constraints[index].count,
          value + option.progress[index],
        ));
        const candidate = {
          entries: [...base.entries, ...option.entries],
          progress,
          roleCounts,
          specialCount,
          preferredCount: base.preferredCount + option.preferredCount,
          softProtectedCount: base.softProtectedCount + option.softProtectedCount,
          pileCounts: mergePileCounts(base.pileCounts, option.pileCounts),
        };
        const key = `${specialCount}|${progress.join('.')}|${roleCounts.join('.')}`;
        const existing = next.get(key);
        if (!existing || comparePileSelections(candidate, existing, piles, policyAware) < 0) next.set(key, candidate);
      }
    }
    combined = next;
    if (!combined.size) return null;
  }

  return [...combined.values()]
    .filter((state) => state.progress.every((value, index) => value >= model.constraints[index].count))
    .filter((state) => state.roleCounts.every((value, index) => value >= roles[index].minCount))
    .sort((a, b) => comparePileSelections(a, b, piles, policyAware))[0] || null;
}

function planEntries(entries) {
  return entries.map((entry) => ({
    pileName: entry.pileName,
    pileRank: entry.pileRank,
    itemRef: entry.item.ref,
    signalRef: entry.signal?.ref || entry.signalRef || null,
    requirementMatches: entry.requirementMatches,
    special: entry.special === true,
    ...((entry.roleMatches || []).some(Boolean) ? {
      roleIndexes: entry.roleMatches.reduce((indexes, matches, index) => {
        if (matches) indexes.push(index);
        return indexes;
      }, []),
    } : {}),
  }));
}

async function selectRatingCandidatePool(input = {}, roles = []) {
  const candidateEntries = input.candidateEntries || [];
  const model = input.ratingModel;
  const piles = input.priorityPiles || [];
  const requiredCount = Number(model?.requiredPlayerCount || 0);
  if (!model || requiredCount <= 0) throw new Error('ratingModel with requiredPlayerCount is required');

  if (candidateEntries.length < requiredCount) {
    const reason = `only ${candidateEntries.length}/${requiredCount} safe unique player definitions are available`;
    return createSelectionPlan({ ok: false, mode: 'rating', missing: { count: requiredCount - candidateEntries.length, reason }, details: { reason, recipeAttempts: 0, recipeTransitions: 0, ratingLevels: 0 } });
  }
  for (let index = 0; index < model.constraints.length; index++) {
    const constraint = model.constraints[index];
    const available = candidateEntries.reduce((count, entry) => count + Number(entry.requirementMatches[index]), 0);
    if (available < Number(constraint.count || 0)) {
      const reason = `${constraint.label} has only ${available}/${constraint.count} safe candidate(s)`;
      return createSelectionPlan({ ok: false, mode: 'rating', missing: { count: constraint.count - available, reason }, details: { reason, recipeAttempts: 0, recipeTransitions: 0, ratingLevels: 0 } });
    }
  }

  const entryKey = (entry) => Number(entry.item?.id || 0)
    ? `id:${Number(entry.item.id)}`
    : `definition:${Number(entry.item?.definitionId || 0)}`;
  const forcedEntryMap = new Map();
  roles.forEach((role, roleIndex) => {
    if (role.source !== 'required-item' || Number(role.minCount || 0) <= 0) return;
    const matches = candidateEntries.filter((entry) => entry.roleMatches?.[roleIndex] === true);
    if (matches.length !== 1) return;
    const entry = matches[0];
    forcedEntryMap.set(entryKey(entry), entry);
  });

  model.constraints.forEach((constraint, constraintIndex) => {
    const matches = candidateEntries.filter((entry) => entry.requirementMatches?.[constraintIndex] === true);
    if (matches.length !== Number(constraint.count || 0)) return;
    matches.forEach((entry) => forcedEntryMap.set(entryKey(entry), entry));
  });

  // Required roles are seeded into the rating recipe before ordinary filler is
  // planned. Exact required-item roles remain enforced during materialization;
  // configurable roles use the best live pile/rating representative.
  roles.forEach((role, roleIndex) => {
    const alreadySeeded = [...forcedEntryMap.values()]
      .reduce((count, entry) => count + Number(entry.roleMatches?.[roleIndex] === true), 0);
    const missing = Math.max(0, Number(role.minCount || 0) - alreadySeeded);
    if (!missing || role.source === 'required-item') return;
    candidateEntries
      .filter((entry) => entry.roleMatches?.[roleIndex] === true && !forcedEntryMap.has(entryKey(entry)))
      .sort((left, right) => (
        Number(right.preferred === true) - Number(left.preferred === true)
          || Number(left.pileRank || 0) - Number(right.pileRank || 0)
          || Math.abs(Number(left.item?.rating || 0) - Number(model.targetRating || 0))
            - Math.abs(Number(right.item?.rating || 0) - Number(model.targetRating || 0))
          || Number(left.item?.rating || 0) - Number(right.item?.rating || 0)
          || Number(left.item?.id || 0) - Number(right.item?.id || 0)
      ))
      .slice(0, missing)
      .forEach((entry) => forcedEntryMap.set(entryKey(entry), entry));
  });

  const forcedRatings = [...forcedEntryMap.values()]
    .map((entry) => Number(entry.item?.rating || 0))
    .filter((rating) => rating > 0);
  if (forcedRatings.length > requiredCount) {
    const reason = `${forcedRatings.length} required items cannot fit in a ${requiredCount}-player squad`;
    return createSelectionPlan({
      ok: false,
      mode: 'rating',
      missing: { count: forcedRatings.length - requiredCount, code: 'PLAYER_COUNT_SHORTAGE', reason },
      details: { reason, reasonCode: 'PLAYER_COUNT_SHORTAGE', recipeAttempts: 0, recipeTransitions: 0, ratingLevels: 0 },
    });
  }
  const shouldStop = input.control?.shouldStop || (() => false);
  if (shouldStop()) throw new Error('rating selection stopped');
  const ratingCounts = new Map();
  candidateEntries.forEach((entry) => {
    const rating = Number(entry.item?.rating || 0);
    ratingCounts.set(rating, (ratingCounts.get(rating) || 0) + 1);
  });
  const recipeInput = {
    ratingCounts,
    forcedRatings,
    requiredPlayerCount: requiredCount,
    targetRating: Number(model.targetRating || 0),
  };
  let recipePlan = buildDeterministicRatingRecipes(recipeInput);
  const materializationContext = buildMaterializationContext(candidateEntries, model, piles, roles);
  let recipeAttempts = 0;
  const tryMaterialize = (recipes) => {
    for (const recipe of recipes || []) {
      recipeAttempts++;
      const materialized = materializeRatingVector(materializationContext, recipe.ratings);
      if (materialized) return { recipe, materialized };
    }
    return null;
  };
  let resolved = tryMaterialize(recipePlan.recipes);
  if (!resolved && recipePlan.searchMode === 'monotonic') {
    const fastTransitions = Number(recipePlan.metrics?.transitions || 0);
    const exhaustive = buildDeterministicRatingRecipes({ ...recipeInput, exhaustive: true });
    recipePlan = {
      ...exhaustive,
      metrics: {
        ...exhaustive.metrics,
        transitions: fastTransitions + Number(exhaustive.metrics?.transitions || 0),
      },
    };
    resolved = tryMaterialize(recipePlan.recipes);
  }
  if (resolved) {
    const { recipe, materialized } = resolved;
    const selected = materialized.entries.map((entry) => entry.item);
    const duplicateSignals = materialized.entries
      .filter((entry) => entry.signal?.ref || entry.signalRef)
      .map((entry) => ({ pileName: entry.pileName, signalRef: entry.signal?.ref || entry.signalRef, itemRef: entry.item.ref }));
    return createSelectionPlan({
      ok: true,
      mode: 'rating',
      entries: planEntries(materialized.entries),
      selected,
      missing: null,
      pileCounts: materialized.pileCounts,
      duplicateSignals,
      details: {
        rating: recipe.rating,
        ratings: recipe.ratings,
        recipeAttempts,
        recipeTransitions: Number(recipePlan.metrics?.transitions || 0),
        ratingLevels: Number(recipePlan.metrics?.ratingLevels || 0),
        ratingRange: recipePlan.ratingRange || null,
        recipeCacheHit: recipePlan.cacheHit === true,
        ...(roles.length ? { roleCounts: materialized.roleCounts } : {}),
      },
    });
  }

  const reason = recipePlan.ok
    ? `no deterministic rating recipe satisfies all ${requiredCount}-player challenge constraints`
    : recipePlan.reason || `no deterministic rating recipe reaches squad rating ${model.targetRating}`;
  return createSelectionPlan({
    ok: false,
    mode: 'rating',
    missing: { count: 0, reason },
    details: {
      reason,
      recipeAttempts,
      recipeTransitions: Number(recipePlan.metrics?.transitions || 0),
      ratingLevels: Number(recipePlan.metrics?.ratingLevels || 0),
      ratingRange: recipePlan.ratingRange || null,
      recipeCacheHit: recipePlan.cacheHit === true,
    },
  });
}

function policyRoleResults(policy, plan = null) {
  const selectedCounts = plan?.details?.roleCounts || policy.roles.map(() => 0);
  return policy.roleAvailability.map((role, index) => ({
    ...role,
    selected: Number(selectedCounts[index] || 0),
  }));
}

function decoratePolicySuccess(plan, policy, usedSoftProtectedFallback) {
  return createSelectionPlan({
    ...plan,
    details: {
      ...plan.details,
      roles: policyRoleResults(policy, plan),
      policy: {
        counts: { ...policy.counts },
        usedSoftProtectedFallback,
      },
    },
  });
}

function policyFailure(policy, code, reason, basePlan = null) {
  const requiredCount = Number(basePlan?.missing?.count || 0);
  return createSelectionPlan({
    ok: false,
    mode: 'rating',
    entries: [],
    selected: [],
    missing: { count: requiredCount, code, reason },
    diagnostics: [policy.diagnostic],
    details: {
      reason,
      reasonCode: code,
      recipeAttempts: Number(basePlan?.details?.recipeAttempts || 0),
      recipeTransitions: Number(basePlan?.details?.recipeTransitions || 0),
      ratingLevels: Number(basePlan?.details?.ratingLevels || 0),
      ratingRange: basePlan?.details?.ratingRange || null,
      roles: policyRoleResults(policy),
      policy: {
        counts: { ...policy.counts },
        usedSoftProtectedFallback: false,
      },
    },
  });
}

function shortageReason(code, model, policy) {
  const requiredCount = Number(model.requiredPlayerCount || 0);
  switch (code) {
    case 'LIVE_REQUIREMENT_UNAVAILABLE':
      return 'live EA requirement metadata or matcher is unavailable';
    case 'REQUIRED_SPECIAL_SHORTAGE': {
      const missing = policy.roleAvailability.find((role) => role.source === 'exclusive-role' && role.available < role.minCount);
      return `${missing?.label || 'Required Special'} has only ${missing?.available || 0}/${missing?.minCount || 1} safe candidate(s)`;
    }
    case 'RESERVED_FODDER_BLOCKED':
      return 'the squad is feasible only by consuming protected or Provisions-reserved fodder';
    case 'PLAYER_COUNT_SHORTAGE':
      return `only ${policy.buckets.eligible.length + policy.buckets.softProtected.length}/${requiredCount} policy-eligible player definitions are available`;
    case 'SQUAD_RATING_SHORTAGE':
    default:
      return `maximum policy-eligible squad rating ${policy.diagnostic.maxReachableRating}/${Number(model.targetRating || 0)}`;
  }
}

async function blockedCandidatesWouldUnlock(input, policy) {
  const blockedEntries = [...policy.buckets.reserved, ...policy.buckets.protected];
  if (!blockedEntries.length) return false;
  const candidateEntries = [
    ...policy.buckets.eligible,
    ...(policy.allowSoftProtectedFallback ? policy.buckets.softProtected : []),
    ...blockedEntries,
  ];
  const plan = await selectRatingCandidatePool({ ...input, candidateEntries }, policy.roles);
  return plan.ok;
}

async function selectRatingPlayersWithPolicy(input) {
  const candidateEntries = input.candidateEntries || [];
  const model = input.ratingModel;
  const policy = buildRatingSelectionPolicy(input, candidateEntries, model);
  const effectiveInput = policy.allowOtherSpecialAsOrdinary
    ? {
      ...input,
      ratingModel: {
        ...model,
        maxSpecialCount: Math.max(
          Number(model.maxSpecialCount || 0),
          Number(model.requiredPlayerCount || 0),
        ),
      },
    }
    : input;
  if (!policy.liveRequirementsAvailable) {
    const code = 'LIVE_REQUIREMENT_UNAVAILABLE';
    return policyFailure(policy, code, shortageReason(code, model, policy));
  }

  const missingConfiguredRole = policy.roleAvailability.some((role) => (
    role.source === 'exclusive-role' && role.available < role.minCount
  ));
  if (missingConfiguredRole) {
    const code = 'REQUIRED_SPECIAL_SHORTAGE';
    return policyFailure(policy, code, shortageReason(code, model, policy));
  }
  const missingRequiredItem = policy.roleAvailability.some((role) => (
    role.source === 'required-item' && role.available < role.minCount
  ));
  if (missingRequiredItem) {
    const code = 'REQUIRED_ITEM_UNAVAILABLE';
    return policyFailure(policy, code, 'one or more required items are unavailable or protected');
  }

  const primaryPlan = await selectRatingCandidatePool({
    ...effectiveInput,
    candidateEntries: policy.buckets.eligible,
  }, policy.roles);
  if (primaryPlan.ok) return decoratePolicySuccess(primaryPlan, policy, false);
  if (policy.allowSoftProtectedFallback && policy.buckets.softProtected.length) {
    const fallbackPlan = await selectRatingCandidatePool({
      ...effectiveInput,
      candidateEntries: [...policy.buckets.eligible, ...policy.buckets.softProtected],
    }, policy.roles);
    if (fallbackPlan.ok) return decoratePolicySuccess(fallbackPlan, policy, true);
  }

  if (await blockedCandidatesWouldUnlock(effectiveInput, policy)) {
    const code = 'RESERVED_FODDER_BLOCKED';
    return policyFailure(policy, code, shortageReason(code, model, policy), primaryPlan);
  }
  const availableCount = policy.buckets.eligible.length
    + (policy.allowSoftProtectedFallback ? policy.buckets.softProtected.length : 0);
  const code = availableCount < Number(model.requiredPlayerCount || 0)
    ? 'PLAYER_COUNT_SHORTAGE'
    : 'SQUAD_RATING_SHORTAGE';
  return policyFailure(policy, code, shortageReason(code, model, policy), primaryPlan);
}

export async function selectRatingPlayers(input = {}) {
  if (!hasRatingSelectionPolicy(input)) return selectRatingCandidatePool(input);
  return selectRatingPlayersWithPolicy(input);
}
