import { calculateEaSquadRating } from '../domain/rating.js';

const MIN_PLAYER_RATING = 47;
const MAX_PLAYER_RATING = 99;
const DEFAULT_RECIPE_LIMIT = 64;
const RECIPE_CACHE_LIMIT = 128;
const recipeCache = new Map();

function playerRating(value) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= MIN_PLAYER_RATING && rating <= MAX_PLAYER_RATING
    ? rating
    : null;
}

function compareRatingVectors(left = [], right = []) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = Number(left[index] || 0) - Number(right[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function compareRecipes(left, right) {
  return Number(left.rating || 0) - Number(right.rating || 0)
    || compareRatingVectors(left.ratings, right.ratings);
}

function emptySubsetPlans(maxCount) {
  const plans = Array.from({ length: maxCount + 1 }, () => new Map());
  plans[0].set(0, []);
  return plans;
}

function addRatingBucket(plans, rating, available, maxCount, metrics) {
  const next = plans.map((states) => new Map(states));
  const limit = Math.min(maxCount, Math.max(0, Number(available || 0)));
  for (let selectedCount = 0; selectedCount <= maxCount; selectedCount++) {
    for (const [sum, vector] of plans[selectedCount]) {
      for (let quantity = 1; quantity <= limit && selectedCount + quantity <= maxCount; quantity++) {
        metrics.transitions++;
        const nextCount = selectedCount + quantity;
        const nextSum = sum + rating * quantity;
        const candidate = [...vector, ...Array(quantity).fill(rating)].sort((a, b) => b - a);
        const existing = next[nextCount].get(nextSum);
        if (!existing || compareRatingVectors(candidate, existing) < 0) {
          next[nextCount].set(nextSum, candidate);
        }
      }
    }
  }
  return next;
}

function takeAvailableRatings(counts, count, descending) {
  const result = [];
  const levels = [...counts.keys()].sort((a, b) => descending ? b - a : a - b);
  for (const rating of levels) {
    const available = Number(counts.get(rating) || 0);
    for (let index = 0; index < available && result.length < count; index++) result.push(rating);
    if (result.length === count) break;
  }
  return result;
}

function takeHighestLowerRatings(levels, counts, startIndex, count) {
  const result = [];
  for (let index = startIndex; index < levels.length && result.length < count; index++) {
    const rating = levels[index];
    const available = Number(counts.get(rating) || 0);
    for (let quantity = 0; quantity < available && result.length < count; quantity++) {
      result.push(rating);
    }
  }
  return result;
}

function buildMonotonicExactRecipe(input, metrics) {
  const {
    counts,
    forcedRatings,
    remainingCount,
    requiredPlayerCount,
    targetRating,
  } = input;
  const levels = [...counts.keys()].sort((a, b) => b - a);
  const selected = [];
  let remainingSlots = remainingCount;

  // Minimize the descending rating vector. At each rating level, use the
  // fewest copies that still allow the best lower-rated completion to reach
  // the target. Squad rating is monotonic, so this is an exact feasibility
  // test rather than a player-combination search.
  for (let levelIndex = 0; levelIndex < levels.length && remainingSlots > 0; levelIndex++) {
    const rating = levels[levelIndex];
    const available = Math.min(remainingSlots, Number(counts.get(rating) || 0));
    let selectedAtLevel = null;
    for (let quantity = 0; quantity <= available; quantity++) {
      const lower = takeHighestLowerRatings(
        levels,
        counts,
        levelIndex + 1,
        remainingSlots - quantity,
      );
      metrics.transitions++;
      if (lower.length !== remainingSlots - quantity) continue;
      const candidate = [
        ...forcedRatings,
        ...selected,
        ...Array(quantity).fill(rating),
        ...lower,
      ];
      if (calculateEaSquadRating(candidate, requiredPlayerCount) >= targetRating) {
        selectedAtLevel = quantity;
        break;
      }
    }
    if (selectedAtLevel === null) return null;
    selected.push(...Array(selectedAtLevel).fill(rating));
    remainingSlots -= selectedAtLevel;
  }

  if (remainingSlots) return null;
  const ratings = [...forcedRatings, ...selected].sort((a, b) => b - a);
  const rating = calculateEaSquadRating(ratings, requiredPlayerCount);
  if (rating !== targetRating) return null;
  metrics.candidateRecipes++;
  return { ratings, rating };
}

function insertRecipe(recipes, seen, candidate, limit) {
  const key = candidate.ratings.join(',');
  if (seen.has(key)) return;
  seen.add(key);
  let index = recipes.findIndex((entry) => compareRecipes(candidate, entry) < 0);
  if (index < 0) index = recipes.length;
  recipes.splice(index, 0, candidate);
  if (recipes.length <= limit) return;
  const removed = recipes.pop();
  seen.delete(removed.ratings.join(','));
}

function recipeCacheKey(input) {
  const counts = [...input.counts.entries()]
    .map(([rating, count]) => `${rating}:${Math.min(input.remainingCount, Number(count || 0))}`)
    .join(',');
  return [
    input.searchMode,
    input.requiredPlayerCount,
    input.targetRating,
    input.recipeLimit,
    [...input.forcedRatings].sort((a, b) => b - a).join(','),
    counts,
  ].join('|');
}

function cacheRecipePlan(key, plan) {
  recipeCache.set(key, plan);
  if (recipeCache.size > RECIPE_CACHE_LIMIT) recipeCache.delete(recipeCache.keys().next().value);
  return { ...plan, cacheHit: false };
}

export function buildDeterministicRatingRecipes(input = {}) {
  const requiredPlayerCount = Math.max(0, Number(input.requiredPlayerCount || 0));
  const targetRating = Math.max(0, Number(input.targetRating || 0));
  const recipeLimit = Math.max(1, Math.min(256, Number(input.recipeLimit || DEFAULT_RECIPE_LIMIT)));
  const searchMode = input.exhaustive === true ? 'exhaustive' : 'monotonic';
  const forcedRatings = (input.forcedRatings || []).map(playerRating).filter(Boolean);
  const counts = new Map();
  for (const [value, countValue] of input.ratingCounts || []) {
    const rating = playerRating(value);
    const count = Math.max(0, Math.floor(Number(countValue || 0)));
    if (rating && count) counts.set(rating, (counts.get(rating) || 0) + count);
  }
  for (const rating of forcedRatings) {
    const available = Number(counts.get(rating) || 0);
    if (!available) {
      return {
        ok: false,
        reason: `required rating ${rating} is unavailable`,
        recipes: [],
        cacheHit: false,
        metrics: { ratingLevels: counts.size, transitions: 0, candidateRecipes: 0 },
      };
    }
    if (available === 1) counts.delete(rating);
    else counts.set(rating, available - 1);
  }

  const remainingCount = requiredPlayerCount - forcedRatings.length;
  if (!requiredPlayerCount || !targetRating || remainingCount < 0) {
    return {
      ok: false,
      reason: 'invalid rating recipe input',
      recipes: [],
      cacheHit: false,
      metrics: { ratingLevels: counts.size, transitions: 0, candidateRecipes: 0 },
    };
  }
  const minimumFill = takeAvailableRatings(counts, remainingCount, false);
  const maximumFill = takeAvailableRatings(counts, remainingCount, true);
  if (minimumFill.length < remainingCount || maximumFill.length < remainingCount) {
    return {
      ok: false,
      reason: `only ${forcedRatings.length + maximumFill.length}/${requiredPlayerCount} rating-bucket player(s) are available`,
      recipes: [],
      cacheHit: false,
      metrics: { ratingLevels: counts.size, transitions: 0, candidateRecipes: 0 },
    };
  }
  const maximumRating = calculateEaSquadRating([...forcedRatings, ...maximumFill], requiredPlayerCount);
  if (maximumRating < targetRating) {
    return {
      ok: false,
      reason: `maximum rating-bucket squad rating ${maximumRating}/${targetRating}`,
      recipes: [],
      cacheHit: false,
      maximumRating,
      metrics: { ratingLevels: counts.size, transitions: 0, candidateRecipes: 0 },
    };
  }

  const metrics = { ratingLevels: counts.size, transitions: 0, candidateRecipes: 0 };
  if (!remainingCount) {
    const ratings = [...forcedRatings].sort((a, b) => b - a);
    const rating = calculateEaSquadRating(ratings, requiredPlayerCount);
    return {
      ok: rating >= targetRating,
      reason: rating >= targetRating ? null : `required items reach only squad rating ${rating}/${targetRating}`,
      recipes: rating >= targetRating ? [{ ratings, rating }] : [],
      maximumRating: rating,
      metrics: { ...metrics, candidateRecipes: Number(rating >= targetRating) },
      cacheHit: false,
    };
  }

  const cacheKey = recipeCacheKey({
    counts,
    forcedRatings,
    remainingCount,
    requiredPlayerCount,
    targetRating,
    recipeLimit,
    searchMode,
  });
  const cached = recipeCache.get(cacheKey);
  if (cached) {
    recipeCache.delete(cacheKey);
    recipeCache.set(cacheKey, cached);
    return { ...cached, cacheHit: true };
  }

  if (searchMode === 'monotonic') {
    const recipe = buildMonotonicExactRecipe({
      counts,
      forcedRatings,
      remainingCount,
      requiredPlayerCount,
      targetRating,
    }, metrics);
    if (recipe) {
      const levels = [...counts.keys()];
      return cacheRecipePlan(cacheKey, {
        ok: true,
        reason: null,
        recipes: [recipe],
        maximumRating,
        metrics,
        searchMode,
        ratingRange: levels.length || forcedRatings.length
          ? {
            min: Math.min(...levels, ...forcedRatings),
            max: Math.max(...levels, ...forcedRatings),
          }
          : null,
      });
    }
  }

  const levels = [...counts.keys()].sort((a, b) => a - b);
  const suffixPlans = Array(levels.length + 1);
  suffixPlans[levels.length] = emptySubsetPlans(remainingCount);
  for (let index = levels.length - 1; index >= 0; index--) {
    const rating = levels[index];
    suffixPlans[index] = addRatingBucket(
      suffixPlans[index + 1],
      rating,
      counts.get(rating),
      remainingCount,
      metrics,
    );
  }

  const minimumVector = [...forcedRatings, ...minimumFill];
  const maximumVector = [...forcedRatings, ...maximumFill];
  const minimumAverage = Math.floor(minimumVector.reduce((sum, rating) => sum + rating, 0) / requiredPlayerCount);
  const maximumAverage = Math.floor(maximumVector.reduce((sum, rating) => sum + rating, 0) / requiredPlayerCount);
  const forcedSum = forcedRatings.reduce((sum, rating) => sum + rating, 0);
  const recipes = [];
  const seen = new Set();
  let lowPlans = emptySubsetPlans(remainingCount);
  let lowLevelIndex = 0;

  for (let averageFloor = minimumAverage; averageFloor <= maximumAverage; averageFloor++) {
    while (lowLevelIndex < levels.length && levels[lowLevelIndex] <= averageFloor) {
      const rating = levels[lowLevelIndex];
      lowPlans = addRatingBucket(lowPlans, rating, counts.get(rating), remainingCount, metrics);
      lowLevelIndex++;
    }
    const highPlans = suffixPlans[lowLevelIndex];
    const forcedHigh = forcedRatings.filter((rating) => rating > averageFloor);
    const forcedHighSum = forcedHigh.reduce((sum, rating) => sum + rating, 0);
    const minimumTotal = requiredPlayerCount * averageFloor;
    const maximumTotal = requiredPlayerCount * (averageFloor + 1) - 1;

    for (let lowCount = 0; lowCount <= remainingCount; lowCount++) {
      const highCount = remainingCount - lowCount;
      const lowStates = lowPlans[lowCount];
      const highStates = highPlans[highCount];
      if (!lowStates.size || !highStates.size) continue;
      for (const [lowSum, lowRatings] of lowStates) {
        const minimumHighSum = Math.max(0, minimumTotal - forcedSum - lowSum);
        const maximumHighSum = maximumTotal - forcedSum - lowSum;
        for (let highSum = minimumHighSum; highSum <= maximumHighSum; highSum++) {
          const highRatings = highStates.get(highSum);
          if (!highRatings) continue;
          const ratings = [...forcedRatings, ...lowRatings, ...highRatings].sort((a, b) => b - a);
          const total = forcedSum + lowSum + highSum;
          if (Math.floor(total / requiredPlayerCount) !== averageFloor) continue;
          const highTotal = forcedHighSum + highSum;
          const highTotalCount = forcedHigh.length + highCount;
          const adjustedTotal = total + highTotal - highTotalCount * total / requiredPlayerCount;
          const rating = Math.floor(Math.round(adjustedTotal) / requiredPlayerCount);
          metrics.candidateRecipes++;
          if (rating < targetRating) continue;
          insertRecipe(recipes, seen, { ratings, rating }, recipeLimit);
        }
      }
    }
  }

  return cacheRecipePlan(cacheKey, {
    ok: recipes.length > 0,
    reason: recipes.length ? null : `no deterministic rating recipe reaches squad rating ${targetRating}`,
    recipes,
    maximumRating,
    metrics,
    searchMode: 'exhaustive',
    ratingRange: levels.length || forcedRatings.length
      ? {
        min: Math.min(...levels, ...forcedRatings),
        max: Math.max(...levels, ...forcedRatings),
      }
      : null,
  });
}
