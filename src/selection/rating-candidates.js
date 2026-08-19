import { isSamePlayerCardVersion } from '../domain/player-rarity.js';

const MAX_REQUIRED_DIAGNOSTICS = 32;
const MAX_COMPETING_CANDIDATES = 8;

function normalizedRequiredRef(value = {}) {
  const ref = value?.ref || value || {};
  return {
    id: Number(ref.id || 0),
    definitionId: Number(ref.definitionId || 0),
    pile: String(ref.pile || 'unknown'),
  };
}

function refMatchesItem(ref = {}, item = {}) {
  const id = Number(ref.id || 0);
  if (id) return id === Number(item?.id || 0);
  const definitionId = Number(ref.definitionId || 0);
  return definitionId > 0 && definitionId === Number(item?.definitionId || 0);
}

function diagnosticCandidate(item = {}, pileName = 'unknown') {
  return {
    id: Number(item?.id || 0),
    definitionId: Number(item?.definitionId || 0),
    pile: String(pileName || 'unknown'),
    rating: Number(item?.rating || 0) || null,
  };
}

function uniqueDiagnosticCandidates(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = `${Number(value?.id || 0)}:${String(value?.pile || 'unknown')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function finalizeRequiredCandidateDiagnostics(diagnostics = [], candidateEntries = []) {
  const entries = Array.isArray(candidateEntries) ? candidateEntries : [];
  return (Array.isArray(diagnostics) ? diagnostics : []).map((diagnostic) => {
    if (diagnostic?.candidateAfterDefinition !== true) return { ...diagnostic };
    const candidateAfterPolicy = entries.some((entry) => refMatchesItem(diagnostic.ref, entry?.item));
    return {
      ...diagnostic,
      candidateAfterPolicy,
      reason: candidateAfterPolicy ? 'candidate-available' : 'policy-filtered',
    };
  });
}

export function buildRatingCandidateEntries(options = {}) {
  const {
    model,
    settings,
    piles = [],
    getPileItems,
    submissionItems = [],
    isSafe,
    isDuplicate,
    pileNeedsDuplicateSignalResolution,
    sortFodder,
    isSpecialItem,
    broadSpec = {},
    requiredItems = [],
    resolveRequirementItem = (item) => item,
    now = Date.now,
  } = options;
  const startedAt = now();
  const byItemId = new Map();
  const resolvedSignals = {};
  const safetyCache = new Map();
  const pileItemsCache = new Map();
  const readPile = (pileName) => {
    if (!pileItemsCache.has(pileName)) {
      pileItemsCache.set(pileName, getPileItems(pileName) || []);
    }
    return pileItemsCache.get(pileName);
  };
  const submissionPileById = new Map();
  for (const pileName of ['storage', 'club']) {
    for (const item of readPile(pileName)) {
      const itemId = Number(item?.id || 0);
      if (itemId && !submissionPileById.has(itemId)) submissionPileById.set(itemId, pileName);
    }
  }
  const requiredRefs = (Array.isArray(requiredItems) ? requiredItems : [])
    .map(normalizedRequiredRef)
    .filter((ref) => ref.id > 0 || ref.definitionId > 0)
    .slice(0, MAX_REQUIRED_DIAGNOSTICS);
  const exactRequiredItemIds = new Set(requiredRefs.map((ref) => ref.id).filter((id) => id > 0));
  const requiredScannedLocations = requiredRefs.map(() => []);
  const cachedIsSafe = (item) => {
    const itemId = Number(item?.id || 0);
    if (!itemId) return false;
    if (!safetyCache.has(itemId)) safetyCache.set(itemId, isSafe(item));
    return safetyCache.get(itemId);
  };
  const safeSubmissionItems = submissionItems.filter(cachedIsSafe);
  const submissionById = new Map();
  const submissionByDefinition = new Map();
  for (const item of safeSubmissionItems) {
    const itemId = Number(item?.id || 0);
    const definitionId = Number(item?.definitionId || 0);
    if (itemId) submissionById.set(itemId, item);
    if (!definitionId) continue;
    const entries = submissionByDefinition.get(definitionId) || [];
    entries.push(item);
    submissionByDefinition.set(definitionId, entries);
  }
  for (const entries of submissionByDefinition.values()) {
    const sorted = sortFodder(entries, broadSpec, settings);
    entries.splice(0, entries.length, ...sorted);
  }

  function resolveSignal(sourceItem) {
    const duplicateId = Number(sourceItem?.duplicateId || 0);
    const direct = duplicateId ? submissionById.get(duplicateId) : null;
    if (direct && isSamePlayerCardVersion(sourceItem, direct)) return direct;
    const definitionId = Number(sourceItem?.definitionId || 0);
    return (submissionByDefinition.get(definitionId) || [])
      .find((item) => isSamePlayerCardVersion(sourceItem, item)) || null;
  }

  const requirementCache = new Map();
  let scannedItems = 0;
  for (const [pileRank, pileName] of piles.entries()) {
    for (const sourceItem of readPile(pileName)) {
      scannedItems++;
      requiredRefs.forEach((ref, index) => {
        if (refMatchesItem(ref, sourceItem)) {
          requiredScannedLocations[index].push(diagnosticCandidate(sourceItem, pileName));
        }
      });
      let item = sourceItem;
      let signal = null;
      if (pileNeedsDuplicateSignalResolution(pileName)) {
        if (!isDuplicate(sourceItem)) continue;
        item = resolveSignal(sourceItem);
        if (!item) continue;
        signal = sourceItem;
      }
      const itemId = Number(item?.id || 0);
      const definitionId = Number(item?.definitionId || 0);
      if (!itemId || !definitionId || byItemId.has(itemId)) continue;
      if (!cachedIsSafe(item)) continue;
      const submissionPileName = String(
        submissionPileById.get(itemId)
          || item?.ref?.pile
          || item?.pile
          || pileName,
      );
      if (!requirementCache.has(itemId)) {
        let requirementItem = item;
        try { requirementItem = resolveRequirementItem(item, { sourceItem, signal, pileName }) || item; } catch { }
        requirementCache.set(itemId, model.constraints.map((constraint) => constraint.matches(requirementItem)));
      }
      const requirementMatches = requirementCache.get(itemId);
      byItemId.set(itemId, {
        item,
        signal,
        pileName,
        submissionPileName,
        pileRank,
        requirementMatches,
        special: isSpecialItem(item),
      });
      if (signal) resolvedSignals[pileName] = (resolvedSignals[pileName] || 0) + 1;
    }
  }

  const byDefinition = new Map();
  for (const entry of byItemId.values()) {
    const definitionId = Number(entry.item?.definitionId || 0);
    const existing = byDefinition.get(definitionId);
    const entryIsExactRequired = exactRequiredItemIds.has(Number(entry.item?.id || 0));
    const existingIsExactRequired = exactRequiredItemIds.has(Number(existing?.item?.id || 0));
    if (
      !existing
      || (entryIsExactRequired && !existingIsExactRequired)
      || (
        entryIsExactRequired === existingIsExactRequired
        && (
          entry.pileRank < existing.pileRank
          || (entry.pileRank === existing.pileRank && Number(entry.item?.id || 0) < Number(existing.item?.id || 0))
        )
      )
    ) {
      byDefinition.set(definitionId, entry);
    }
  }
  const entries = [...byDefinition.values()];
  const requiredItemDiagnostics = requiredRefs.map((ref, index) => {
    const candidateBeforeDefinition = [...byItemId.values()]
      .find((entry) => refMatchesItem(ref, entry.item)) || null;
    const definitionId = Number(ref.definitionId || candidateBeforeDefinition?.item?.definitionId || 0);
    const representative = definitionId ? byDefinition.get(definitionId) || null : null;
    const candidateAfterDefinition = Boolean(
      candidateBeforeDefinition
        && representative
        && Number(candidateBeforeDefinition.item?.id || 0) === Number(representative.item?.id || 0),
    );
    const scannedLocations = uniqueDiagnosticCandidates(requiredScannedLocations[index]);
    let reason = 'candidate-available';
    if (!scannedLocations.length && !candidateBeforeDefinition) reason = 'not-in-scanned-piles';
    else if (!candidateBeforeDefinition) reason = 'rejected-before-definition';
    else if (!candidateAfterDefinition) reason = 'definition-dedup-replaced';
    const competingCandidates = definitionId
      ? [...byItemId.values()]
        .filter((entry) => Number(entry.item?.definitionId || 0) === definitionId)
        .slice(0, MAX_COMPETING_CANDIDATES)
        .map((entry) => diagnosticCandidate(
          entry.item,
          entry.submissionPileName || entry.pileName,
        ))
      : [];
    return {
      ref,
      scannedLocations,
      candidateBeforeDefinition: Boolean(candidateBeforeDefinition),
      candidateAfterDefinition,
      candidateAfterPolicy: candidateAfterDefinition,
      representative: representative
        ? diagnosticCandidate(
          representative.item,
          representative.submissionPileName || representative.pileName,
        )
        : null,
      competingCandidates,
      reason,
    };
  });
  return {
    entries,
    piles,
    resolvedSignals,
    buildMs: now() - startedAt,
    scannedItems,
    requiredItemDiagnostics,
  };
}

export async function selectRatingCandidateEntries(options = {}) {
  const {
    candidateEntries = [],
    model,
    piles = [],
    createSnapshot,
    selectPlayers,
    control,
    requiredItems,
    preferredItems,
    protectedItems,
    exclusiveRoles,
    maxOrdinaryRating,
    protectionPolicy,
  } = options;
  const liveById = new Map();
  const snapshotEntries = candidateEntries.map((entry) => {
    const item = createSnapshot(
      entry.item,
      entry.submissionPileName || entry.pileName,
    );
    const signal = entry.signal ? createSnapshot(entry.signal, entry.pileName) : null;
    liveById.set(Number(item.id), entry.item);
    if (signal) liveById.set(Number(signal.id), entry.signal);
    return {
      item,
      signal,
      pileName: entry.pileName,
      submissionPileName: entry.submissionPileName || entry.pileName,
      pileRank: entry.pileRank,
      requirementMatches: [...entry.requirementMatches],
      special: entry.special === true,
      ...(entry.roleMatches ? {
        roleMatches: Array.isArray(entry.roleMatches) ? [...entry.roleMatches] : { ...entry.roleMatches },
      } : {}),
    };
  });
  const plan = await selectPlayers({
    mode: 'rating',
    candidateEntries: snapshotEntries,
    ratingModel: model,
    priorityPiles: piles,
    control,
    requiredItems,
    preferredItems,
    protectedItems,
    exclusiveRoles,
    maxOrdinaryRating,
    protectionPolicy,
  });
  if (!plan.ok) {
    const result = {
      ok: false,
      reason: plan.details.reason || plan.missing?.reason || 'rating selection failed',
      recipeAttempts: Number(plan.details.recipeAttempts || 0),
      recipeTransitions: Number(plan.details.recipeTransitions || 0),
      ratingLevels: Number(plan.details.ratingLevels || 0),
      ratingRange: plan.details.ratingRange || null,
      recipeCacheHit: plan.details.recipeCacheHit === true,
      missing: plan.missing || null,
      details: plan.details || {},
    };
    if (plan.details.reasonCode) result.reasonCode = plan.details.reasonCode;
    if (plan.diagnostics?.length) result.diagnostics = [...plan.diagnostics];
    return result;
  }

  const entries = plan.entries.map((entry) => ({
    item: liveById.get(Number(entry.itemRef?.id || 0)) || null,
    signal: entry.signalRef ? liveById.get(Number(entry.signalRef.id || 0)) || null : null,
    pileName: entry.pileName,
    submissionPileName: entry.submissionPileName || entry.pileName,
    pileRank: entry.pileRank,
    requirementMatches: entry.requirementMatches,
    special: entry.special,
  }));
  if (entries.some((entry, index) => !entry.item || (plan.entries[index]?.signalRef && !entry.signal))) {
    return {
      ok: false,
      reason: 'rating selection item became stale during plan resolution',
      recipeAttempts: Number(plan.details.recipeAttempts || 0),
      recipeTransitions: Number(plan.details.recipeTransitions || 0),
      ratingLevels: Number(plan.details.ratingLevels || 0),
      ratingRange: plan.details.ratingRange || null,
      recipeCacheHit: plan.details.recipeCacheHit === true,
    };
  }
  return {
    ok: true,
    entries,
    selected: entries.map((entry) => entry.item),
    resolvedSignals: entries.reduce((counts, entry) => {
      const pileName = String(entry?.pileName || '');
      if (entry?.signal && ['unassigned', 'transfer'].includes(pileName)) {
        counts[pileName] = (counts[pileName] || 0) + 1;
      }
      return counts;
    }, {}),
    rating: Number(plan.details.rating || 0),
    ratings: [...(plan.details.ratings || [])],
    pileCounts: { ...plan.pileCounts },
    recipeAttempts: Number(plan.details.recipeAttempts || 0),
    recipeTransitions: Number(plan.details.recipeTransitions || 0),
    ratingLevels: Number(plan.details.ratingLevels || 0),
    ratingRange: plan.details.ratingRange || null,
    recipeCacheHit: plan.details.recipeCacheHit === true,
    plan,
  };
}
