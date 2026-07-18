import { createSelectionPlan } from '../domain/contracts.js';
import { calculateEaSquadRating } from '../domain/rating.js';

function comparePileSelections(a, b, piles) {
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

function ratingGroupSelectionOptions(entries, count, model, piles) {
  if (!count) return [{ entries: [], progress: model.constraints.map(() => 0), specialCount: 0, pileCounts: {} }];
  const signatureCounts = new Map();
  const compactEntries = entries.filter((entry) => {
    const signature = `${entry.requirementMatches.map(Number).join('')}:${Number(entry.special)}:${entry.pileName}`;
    const seen = Number(signatureCounts.get(signature) || 0);
    if (seen >= count) return false;
    signatureCounts.set(signature, seen + 1);
    return true;
  });
  let states = new Map();
  states.set(`0|0|${model.constraints.map(() => 0).join('.')}`, {
    entries: [],
    progress: model.constraints.map(() => 0),
    specialCount: 0,
    pileCounts: {},
  });

  for (const entry of compactEntries) {
    const next = new Map(states);
    for (const state of states.values()) {
      if (state.entries.length >= count) continue;
      const specialCount = state.specialCount + Number(entry.special);
      if (specialCount > model.maxSpecialCount) continue;
      const progress = state.progress.map((value, index) => Math.min(
        model.constraints[index].count,
        value + Number(entry.requirementMatches[index]),
      ));
      const candidate = {
        entries: [...state.entries, entry],
        progress,
        specialCount,
        pileCounts: mergePileCounts(state.pileCounts, { [entry.pileName]: 1 }),
      };
      const key = `${candidate.entries.length}|${specialCount}|${progress.join('.')}`;
      const existing = next.get(key);
      if (!existing || comparePileSelections(candidate, existing, piles) < 0) next.set(key, candidate);
    }
    states = next;
  }
  return [...states.values()].filter((state) => state.entries.length === count);
}

function buildMaterializationContext(entries, model, piles) {
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
  return { entriesByRating, optionCache: new Map(), model, piles };
}

function materializeRatingVector(context, descendingRatings) {
  const { entriesByRating, optionCache, model, piles } = context;
  const counts = new Map();
  descendingRatings.forEach((rating) => counts.set(rating, (counts.get(rating) || 0) + 1));
  let combined = new Map();
  combined.set(`0|${model.constraints.map(() => 0).join('.')}`, {
    entries: [],
    progress: model.constraints.map(() => 0),
    specialCount: 0,
    pileCounts: {},
  });

  for (const [rating, count] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
    const cacheKey = `${rating}:${count}`;
    let options = optionCache.get(cacheKey);
    if (!options) {
      options = ratingGroupSelectionOptions(entriesByRating.get(Number(rating)) || [], count, model, piles);
      optionCache.set(cacheKey, options);
    }
    if (!options.length) return null;
    const next = new Map();
    for (const base of combined.values()) {
      for (const option of options) {
        const specialCount = base.specialCount + option.specialCount;
        if (specialCount > model.maxSpecialCount) continue;
        const progress = base.progress.map((value, index) => Math.min(
          model.constraints[index].count,
          value + option.progress[index],
        ));
        const candidate = {
          entries: [...base.entries, ...option.entries],
          progress,
          specialCount,
          pileCounts: mergePileCounts(base.pileCounts, option.pileCounts),
        };
        const key = `${specialCount}|${progress.join('.')}`;
        const existing = next.get(key);
        if (!existing || comparePileSelections(candidate, existing, piles) < 0) next.set(key, candidate);
      }
    }
    combined = next;
    if (!combined.size) return null;
  }

  return [...combined.values()]
    .filter((state) => state.progress.every((value, index) => value >= model.constraints[index].count))
    .sort((a, b) => comparePileSelections(a, b, piles))[0] || null;
}

function planEntries(entries) {
  return entries.map((entry) => ({
    pileName: entry.pileName,
    pileRank: entry.pileRank,
    itemRef: entry.item.ref,
    signalRef: entry.signal?.ref || entry.signalRef || null,
    requirementMatches: entry.requirementMatches,
    special: entry.special === true,
  }));
}

export async function selectRatingPlayers(input = {}) {
  const candidateEntries = input.candidateEntries || [];
  const model = input.ratingModel;
  const piles = input.priorityPiles || [];
  const options = input.searchOptions || {};
  const requiredCount = Number(model?.requiredPlayerCount || 0);
  if (!model || requiredCount <= 0) throw new Error('ratingModel with requiredPlayerCount is required');

  if (candidateEntries.length < requiredCount) {
    const reason = `only ${candidateEntries.length}/${requiredCount} safe unique player definitions are available`;
    return createSelectionPlan({ ok: false, mode: 'rating', missing: { count: requiredCount - candidateEntries.length, reason }, details: { reason, nodes: 0 } });
  }
  for (let index = 0; index < model.constraints.length; index++) {
    const constraint = model.constraints[index];
    const available = candidateEntries.reduce((count, entry) => count + Number(entry.requirementMatches[index]), 0);
    if (available < Number(constraint.count || 0)) {
      const reason = `${constraint.label} has only ${available}/${constraint.count} safe candidate(s)`;
      return createSelectionPlan({ ok: false, mode: 'rating', missing: { count: constraint.count - available, reason }, details: { reason, nodes: 0 } });
    }
  }

  const ratingCounts = new Map();
  candidateEntries.forEach((entry) => {
    const rating = Number(entry.item?.rating || 0);
    ratingCounts.set(rating, (ratingCounts.get(rating) || 0) + 1);
  });
  const levels = [...ratingCounts.keys()].filter(Boolean).sort((a, b) => a - b);
  const usedCounts = new Map();
  const descendingRatings = [];
  const maxNodes = Math.max(10000, Math.min(2000000, Number(options.maxSearchNodes || 500000) || 500000));
  const maxSearchMs = Math.max(1000, Math.min(60000, Number(options.maxSearchMs || 15000) || 15000));
  const yieldEveryNodes = Math.max(50, Math.min(5000, Number(options.yieldEveryNodes || 500) || 500));
  const now = input.control?.now || Date.now;
  const yieldControl = input.control?.yieldControl || (() => Promise.resolve());
  const shouldStop = input.control?.shouldStop || (() => false);
  const deadline = now() + maxSearchMs;
  const materializationContext = buildMaterializationContext(candidateEntries, model, piles);
  let nodes = 0;
  let exhausted = false;
  let timedOut = false;

  function highestAvailableCompletion(remaining, maxRating) {
    const completion = [];
    for (let index = levels.length - 1; index >= 0 && completion.length < remaining; index--) {
      const rating = levels[index];
      if (rating > maxRating) continue;
      const available = Number(ratingCounts.get(rating) || 0) - Number(usedCounts.get(rating) || 0);
      for (let count = 0; count < available && completion.length < remaining; count++) completion.push(rating);
    }
    return completion;
  }

  function* search(maxLevelIndex) {
    nodes++;
    if (nodes > maxNodes) {
      exhausted = true;
      return;
    }
    if ((nodes & 255) === 0 && now() > deadline) {
      timedOut = true;
      return;
    }
    if (nodes % yieldEveryNodes === 0) yield { control: true };
    const remaining = requiredCount - descendingRatings.length;
    if (!remaining) {
      if (calculateEaSquadRating(descendingRatings, requiredCount) >= model.targetRating) yield { ratings: [...descendingRatings] };
      return;
    }
    const maxRating = levels[maxLevelIndex];
    const optimistic = highestAvailableCompletion(remaining, maxRating);
    if (optimistic.length < remaining) return;
    if (calculateEaSquadRating([...descendingRatings, ...optimistic], requiredCount) < model.targetRating) return;
    for (let levelIndex = 0; levelIndex <= maxLevelIndex; levelIndex++) {
      const rating = levels[levelIndex];
      const used = Number(usedCounts.get(rating) || 0);
      if (used >= Number(ratingCounts.get(rating) || 0)) continue;
      usedCounts.set(rating, used + 1);
      descendingRatings.push(rating);
      yield* search(levelIndex);
      descendingRatings.pop();
      if (used) usedCounts.set(rating, used); else usedCounts.delete(rating);
      if (exhausted || timedOut) return;
    }
  }

  for (let maxLevelIndex = 0; maxLevelIndex < levels.length; maxLevelIndex++) {
    const rating = levels[maxLevelIndex];
    usedCounts.set(rating, 1);
    descendingRatings.push(rating);
    for (const step of search(maxLevelIndex)) {
      if (step.control) {
        if (shouldStop()) throw new Error('rating selection stopped');
        await yieldControl();
        if (shouldStop()) throw new Error('rating selection stopped');
        continue;
      }
      const materialized = materializeRatingVector(materializationContext, step.ratings);
      if (!materialized) continue;
      const ratingValue = calculateEaSquadRating(step.ratings, requiredCount);
      descendingRatings.pop();
      usedCounts.delete(rating);
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
        details: { rating: ratingValue, ratings: step.ratings, nodes },
      });
    }
    descendingRatings.pop();
    usedCounts.delete(rating);
    if (exhausted || timedOut) break;
    if (shouldStop()) throw new Error('rating selection stopped');
    await yieldControl();
    if (shouldStop()) throw new Error('rating selection stopped');
  }

  const reason = timedOut
    ? `rating search exceeded ${maxSearchMs}ms`
    : exhausted
      ? `rating search exceeded ${maxNodes} states`
      : `no safe ${requiredCount}-player combination reaches squad rating ${model.targetRating} and all challenge constraints`;
  return createSelectionPlan({ ok: false, mode: 'rating', missing: { count: 0, reason }, details: { reason, nodes } });
}
