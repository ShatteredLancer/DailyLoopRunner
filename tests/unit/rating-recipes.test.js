import { describe, expect, it } from 'vitest';
import { buildDeterministicRatingRecipes } from '../../src/selection/rating-recipes.js';

function fullRatingHistogram(copiesPerRating) {
  return new Map(Array.from({ length: 53 }, (_, index) => [47 + index, copiesPerRating]));
}

describe('deterministic rating recipes', () => {
  it('plans a large live histogram without inventory-sized state expansion', () => {
    const ratingCounts = new Map(Array.from(
      { length: 48 },
      (_, index) => [52 + index, 100],
    ));
    const startedAt = performance.now();
    const result = buildDeterministicRatingRecipes({
      ratingCounts,
      forcedRatings: [92],
      requiredPlayerCount: 11,
      targetRating: 84,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.ok).toBe(true);
    expect(result.recipes[0]).toEqual({
      ratings: [92, 83, 83, 83, 82, 82, 82, 82, 82, 82, 82],
      rating: 84,
    });
    expect(result.metrics.ratingLevels).toBe(48);
    expect(result.metrics.transitions).toBeLessThan(100);
    expect(elapsedMs).toBeLessThan(100);
  });

  it('builds the same recipe and bounded state graph for small and very large inventories', () => {
    const input = {
      forcedRatings: [91, 92, 86, 89],
      requiredPlayerCount: 11,
      targetRating: 84,
    };
    const small = buildDeterministicRatingRecipes({ ...input, ratingCounts: fullRatingHistogram(11) });
    const large = buildDeterministicRatingRecipes({ ...input, ratingCounts: fullRatingHistogram(10000) });

    expect(small.ok).toBe(true);
    expect(large.ok).toBe(true);
    expect(large.recipes[0]).toEqual(small.recipes[0]);
    expect(large.metrics).toEqual(small.metrics);
    expect(large.cacheHit).toBe(true);
    expect(large.metrics.ratingLevels).toBe(53);
    expect(large.metrics.transitions).toBeLessThan(200000);
    expect(large.ratingRange).toEqual({ min: 47, max: 99 });
  });

  it('uses only the rating levels currently present in inventory', () => {
    const result = buildDeterministicRatingRecipes({
      ratingCounts: new Map([[75, 20], [76, 20], [91, 1], [92, 1], [86, 1], [89, 1]]),
      forcedRatings: [91, 92, 86, 89],
      requiredPlayerCount: 11,
      targetRating: 84,
    });

    expect(result.ok).toBe(true);
    expect(result.recipes[0].rating).toBe(84);
    expect(result.ratingRange).toEqual({ min: 75, max: 92 });
    expect(result.metrics.ratingLevels).toBe(2);
  });
});
