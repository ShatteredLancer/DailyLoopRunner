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
    now = Date.now,
  } = options;
  const startedAt = now();
  const byItemId = new Map();
  const resolvedSignals = {};
  const safetyCache = new Map();
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
    if (duplicateId && submissionById.has(duplicateId)) return submissionById.get(duplicateId);
    const definitionId = Number(sourceItem?.definitionId || 0);
    return submissionByDefinition.get(definitionId)?.[0] || null;
  }

  const requirementCache = new Map();
  let scannedItems = 0;
  for (const [pileRank, pileName] of piles.entries()) {
    for (const sourceItem of getPileItems(pileName)) {
      scannedItems++;
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
      if (!requirementCache.has(itemId)) {
        requirementCache.set(itemId, model.constraints.map((constraint) => constraint.matches(item)));
      }
      const requirementMatches = requirementCache.get(itemId);
      byItemId.set(itemId, {
        item,
        signal,
        pileName,
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
    if (
      !existing
      || entry.pileRank < existing.pileRank
      || (entry.pileRank === existing.pileRank && Number(entry.item?.id || 0) < Number(existing.item?.id || 0))
    ) {
      byDefinition.set(definitionId, entry);
    }
  }
  return {
    entries: [...byDefinition.values()],
    piles,
    resolvedSignals,
    buildMs: now() - startedAt,
    scannedItems,
  };
}

export async function selectRatingCandidateEntries(options = {}) {
  const {
    candidateEntries = [],
    model,
    piles = [],
    searchOptions = {},
    createSnapshot,
    selectPlayers,
    control,
  } = options;
  const liveById = new Map();
  const snapshotEntries = candidateEntries.map((entry) => {
    const item = createSnapshot(entry.item, entry.pileName);
    const signal = entry.signal ? createSnapshot(entry.signal, entry.pileName) : null;
    liveById.set(Number(item.id), entry.item);
    if (signal) liveById.set(Number(signal.id), entry.signal);
    return {
      item,
      signal,
      pileName: entry.pileName,
      pileRank: entry.pileRank,
      requirementMatches: [...entry.requirementMatches],
      special: entry.special === true,
    };
  });
  const plan = await selectPlayers({
    mode: 'rating',
    candidateEntries: snapshotEntries,
    ratingModel: model,
    priorityPiles: piles,
    searchOptions,
    control,
  });
  if (!plan.ok) {
    return {
      ok: false,
      reason: plan.details.reason || plan.missing?.reason || 'rating selection failed',
      nodes: Number(plan.details.nodes || 0),
    };
  }

  const entries = plan.entries.map((entry) => ({
    item: liveById.get(Number(entry.itemRef?.id || 0)) || null,
    signal: entry.signalRef ? liveById.get(Number(entry.signalRef.id || 0)) || null : null,
    pileName: entry.pileName,
    pileRank: entry.pileRank,
    requirementMatches: entry.requirementMatches,
    special: entry.special,
  }));
  if (entries.some((entry, index) => !entry.item || (plan.entries[index]?.signalRef && !entry.signal))) {
    return {
      ok: false,
      reason: 'rating selection item became stale during plan resolution',
      nodes: Number(plan.details.nodes || 0),
    };
  }
  return {
    ok: true,
    entries,
    selected: entries.map((entry) => entry.item),
    rating: Number(plan.details.rating || 0),
    ratings: [...(plan.details.ratings || [])],
    pileCounts: { ...plan.pileCounts },
    nodes: Number(plan.details.nodes || 0),
    plan,
  };
}
