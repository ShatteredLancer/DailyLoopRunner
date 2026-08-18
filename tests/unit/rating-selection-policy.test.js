import { describe, expect, it } from 'vitest';
import { selectInventoryPlayers } from '../../src/selection/index.js';
import { createStorageSinkClubFillRole } from '../../src/selection/multi-squad-rating.js';
import { createRollingPrimarySelectionPolicy } from '../../src/inventory/rolling-policy.js';

function entry(id, rating, options = {}) {
  return {
    item: {
      id,
      definitionId: 1000 + id,
      rating,
      special: options.special === true,
      ref: { id, definitionId: 1000 + id, pile: options.pileName || 'storage' },
    },
    signal: null,
    pileName: options.pileName || 'storage',
    pileRank: options.pileRank ?? 0,
    requirementMatches: options.requirementMatches || [],
    special: options.special === true,
  };
}

function model(overrides = {}) {
  return {
    requiredPlayerCount: 3,
    targetRating: 84,
    maxSpecialCount: 3,
    constraints: [],
    ...overrides,
  };
}

async function select(candidateEntries, options = {}) {
  return selectInventoryPlayers({
    mode: 'rating',
    candidateEntries,
    ratingModel: model(options.ratingModel),
    priorityPiles: options.priorityPiles || ['unassigned', 'storage', 'transfer', 'club'],
    ...options.selection,
  });
}

describe('role-aware rating selection policy', () => {
  it('uses Unassigned, Storage, and Transfer without Club when the Storage Sink squad is feasible', async () => {
    const plan = await select([
      entry(1, 84, { pileName: 'unassigned', pileRank: 0 }),
      entry(2, 84, { pileName: 'storage', pileRank: 1 }),
      entry(3, 84, { pileName: 'transfer', pileRank: 2 }),
      entry(4, 84, { pileName: 'club', pileRank: 3 }),
    ], {
      selection: {
        exclusiveRoles: [createStorageSinkClubFillRole(0)],
      },
    });

    expect(plan.ok).toBe(true);
    expect(plan.pileCounts).toEqual({ unassigned: 1, storage: 1, transfer: 1 });
    expect(plan.selected.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('uses only the allowed number of Club cards as final Storage Sink fill', async () => {
    const candidates = [
      entry(1, 84, { pileName: 'unassigned', pileRank: 0 }),
      entry(2, 84, { pileName: 'storage', pileRank: 1 }),
      entry(3, 84, { pileName: 'club', pileRank: 3 }),
      entry(4, 84, { pileName: 'club', pileRank: 3 }),
    ];
    const blocked = await select(candidates, {
      selection: { exclusiveRoles: [createStorageSinkClubFillRole(0)] },
    });
    const filled = await select(candidates, {
      selection: { exclusiveRoles: [createStorageSinkClubFillRole(1)] },
    });

    expect(blocked.ok).toBe(false);
    expect(filled.ok).toBe(true);
    expect(filled.pileCounts).toEqual({ unassigned: 1, storage: 1, club: 1 });
  });

  it('selects an exact squad from more than 4000 live candidates within a bounded budget', async () => {
    const requiredSpecial = entry(1, 92, { special: true, requirementMatches: [true] });
    const fillers = Array.from({ length: 4095 }, (_, index) => entry(index + 2, 52 + (index % 44), {
      requirementMatches: [false],
      pileName: index < 90 ? 'storage' : 'club',
      pileRank: index < 90 ? 0 : 1,
    }));
    const startedAt = performance.now();
    const plan = await select([requiredSpecial, ...fillers], {
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 84,
        maxSpecialCount: 1,
        constraints: [{ id: 'required-special', label: 'Required Special x1', count: 1 }],
      },
      selection: {
        exclusiveRoles: [{
          id: 'required-special',
          constraintId: 'required-special',
          minCount: 1,
          maxCount: 1,
        }],
        maxOrdinaryRating: 95,
      },
    });
    const elapsedMs = performance.now() - startedAt;

    expect(plan.ok).toBe(true);
    expect(plan.details.rating).toBe(84);
    expect(plan.details.recipeTransitions).toBeLessThan(100);
    expect(elapsedMs).toBeLessThan(250);
  });

  it('selects exactly one item for an exclusive Required Special role', async () => {
    const plan = await select([
      entry(1, 84, { special: true, requirementMatches: [true] }),
      entry(2, 84, { special: true, requirementMatches: [true] }),
      entry(3, 84, { requirementMatches: [false] }),
      entry(4, 84, { requirementMatches: [false] }),
    ], {
      ratingModel: {
        constraints: [{ id: 'required-special', label: 'Required Special x1', count: 1 }],
      },
      selection: {
        exclusiveRoles: [{
          id: 'required-special',
          constraintId: 'required-special',
          minCount: 1,
          maxCount: 1,
        }],
      },
    });

    expect(plan.ok).toBe(true);
    expect(plan.selected).toHaveLength(3);
    expect(plan.selected.filter((item) => [1, 2].includes(item.id))).toHaveLength(1);
    expect(plan.details.roles).toEqual([
      expect.objectContaining({ id: 'required-special', selected: 1, minCount: 1, maxCount: 1 }),
    ]);
  });

  it('honors required, preferred, and protected item inputs deterministically', async () => {
    const plan = await select([
      entry(1, 84),
      entry(2, 84),
      entry(3, 84),
      entry(4, 85),
      entry(5, 84),
    ], {
      ratingModel: { requiredPlayerCount: 2 },
      selection: {
        requiredItems: [{ id: 4 }],
        preferredItems: [{ id: 2 }],
        protectedItems: [{ id: 5 }],
      },
    });

    expect(plan.ok).toBe(true);
    expect(plan.selected.map((item) => item.id)).toEqual([4, 2]);
    expect(plan.details.policy.counts).toMatchObject({ required: 1, preferred: 1, protected: 1 });
  });

  it('seeds high-rated required duplicates before building the remaining rating recipe', async () => {
    const required = [
      entry(1, 91, { special: true, requirementMatches: [true] }),
      entry(2, 92, { requirementMatches: [false] }),
      entry(3, 86, { requirementMatches: [false] }),
      entry(4, 89, { requirementMatches: [false] }),
    ];
    const fillers = [];
    let id = 10;
    for (let rating = 75; rating <= 95; rating++) {
      for (let count = 0; count < 12; count++) {
        fillers.push(entry(id++, rating, { requirementMatches: [false] }));
      }
    }
    const plan = await select([...required, ...fillers], {
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 84,
        maxSpecialCount: 1,
        constraints: [{ id: 'required-special', label: 'Required Special x1', count: 1 }],
      },
      selection: {
        requiredItems: required.map(({ item }) => ({ id: item.id })),
        exclusiveRoles: [{
          id: 'required-special',
          constraintId: 'required-special',
          minCount: 1,
          maxCount: 1,
        }],
        maxOrdinaryRating: 95,
      },
    });

    expect(plan.ok).toBe(true);
    expect(plan.selected.map((item) => item.id)).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    expect(plan.details.rating).toBe(84);
    expect(plan.details.recipeAttempts).toBeLessThanOrEqual(64);
    expect(plan.details.ratingRange).toEqual({ min: 75, max: 95 });
  });

  it('consumes all pending Unassigned duplicates in an exact 84 Required Special recovery recipe', async () => {
    const pendingRatings = [93, 89, 88, 87, 87, 86, 85];
    const pending = pendingRatings.map((rating, index) => {
      const candidate = entry(100 + index, rating, {
        pileName: 'unassigned',
        pileRank: 0,
      });
      const signal = {
        ...candidate.item,
        id: index + 1,
        duplicate: true,
        duplicateId: candidate.item.id,
        ref: {
          id: index + 1,
          definitionId: candidate.item.definitionId,
          pile: 'unassigned',
        },
      };
      candidate.signal = signal;
      return { candidate, signal };
    });
    const primaryPolicy = createRollingPrimarySelectionPolicy({
      entries: pending.map(({ signal }) => ({
        item: signal,
        pile: 'unassigned',
        classification: {
          requiredSpecial: false,
          protected: false,
          provisionsReserve: false,
        },
      })),
      model: { constraints: [] },
      reserveRatings: false,
      primaryDuplicateRefs: pending.map(({ signal }) => signal.ref),
    });
    const clubFill = Array.from({ length: 8 }, (_, index) => entry(500 + index, 61 + index, {
      pileName: 'club',
      pileRank: 3,
    }));

    const plan = await select([...pending.map(({ candidate }) => candidate), ...clubFill], {
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 84,
        maxSpecialCount: 11,
        constraints: [],
      },
      selection: {
        requiredItems: primaryPolicy.requiredItems,
        preferredItems: primaryPolicy.preferredItems,
        maxOrdinaryRating: 95,
        protectionPolicy: { allowOtherSpecialAsOrdinary: true },
      },
    });

    expect(plan.ok).toBe(true);
    expect(plan.details.rating).toBe(84);
    expect(plan.selected.map((item) => item.id)).toEqual(expect.arrayContaining(
      pending.map(({ candidate }) => candidate.item.id),
    ));
    expect(plan.pileCounts).toMatchObject({ unassigned: 7, club: 4 });
  });

  it('normalizes high non-reserve primary duplicates to an exact 84 squad by relaxing highest duplicates', async () => {
    const duplicateRatings = [95, 94, 93, 92, 90, 86, 86, 85];
    const duplicates = duplicateRatings.map((rating, index) => entry(index + 1, rating, {
      special: index === 0,
      requirementMatches: [false],
    }));
    const requiredSpecial = entry(20, 92, { special: true, requirementMatches: [true] });
    const fillers = [];
    let id = 100;
    for (let rating = 52; rating <= 95; rating++) {
      for (let count = 0; count < 11; count++) {
        fillers.push(entry(id++, rating, { requirementMatches: [false] }));
      }
    }
    const candidates = [...duplicates, requiredSpecial, ...fillers];
    const relaxationOrder = [...duplicates]
      .sort((left, right) => right.item.rating - left.item.rating || right.item.id - left.item.id)
      .map(({ item }) => ({ id: item.id }));
    const relaxed = [];
    let plan = null;

    while (true) {
      plan = await select(candidates, {
        ratingModel: {
          requiredPlayerCount: 11,
          targetRating: 84,
          maxSpecialCount: 1,
          constraints: [{ id: 'required-special', label: 'Required Special x1', count: 1 }],
        },
        selection: {
          requiredItems: duplicates
            .filter(({ item }) => !relaxed.some((ref) => ref.id === item.id))
            .map(({ item }) => ({ id: item.id })),
          protectedItems: relaxed,
          exclusiveRoles: [{
            id: 'required-special',
            constraintId: 'required-special',
            minCount: 1,
            maxCount: 1,
          }],
          maxOrdinaryRating: 95,
          protectionPolicy: {
            reserveRatings: [87, 88, 89],
            allowOtherSpecialAsOrdinary: true,
          },
        },
      });
      expect(plan.ok).toBe(true);
      if (plan.details.rating <= 84) break;
      relaxed.push(relaxationOrder[relaxed.length]);
    }

    expect(relaxed.length).toBeGreaterThan(0);
    expect(plan.details.rating).toBe(84);
    expect(plan.selected.map((item) => item.id)).toContain(requiredSpecial.item.id);
    expect(plan.selected.filter((item) => item.id === requiredSpecial.item.id)).toHaveLength(1);
    const selectedIds = new Set(plan.selected.map((item) => item.id));
    expect(relaxed.some((ref) => selectedIds.has(ref.id))).toBe(false);
  });

  it('does not depend on obsolete search budgets', async () => {
    const candidates = [];
    let id = 1;
    for (let rating = 75; rating <= 95; rating++) {
      for (let count = 0; count < 11; count++) {
        candidates.push(entry(id++, rating, {
          special: rating === 95 && count === 0,
          requirementMatches: [rating === 95 && count === 0],
        }));
      }
    }
    const plan = await select(candidates, {
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 84,
        maxSpecialCount: 1,
        constraints: [{ id: 'required-special', label: 'Required Special x1', count: 1 }],
      },
      selection: {
        exclusiveRoles: [{
          id: 'required-special',
          constraintId: 'required-special',
          minCount: 1,
          maxCount: 1,
        }],
      },
    });

    expect(plan.ok).toBe(true);
    expect(plan.details.rating).toBe(84);
    expect(plan.details.ratingLevels).toBe(21);
    expect(plan.details).not.toHaveProperty('nodes');
  });

  it('reserves Provisions ratings and applies the ordinary rating ceiling', async () => {
    const plan = await select([
      entry(1, 84),
      entry(2, 84),
      entry(3, 87),
      entry(4, 96),
    ], {
      ratingModel: { requiredPlayerCount: 2 },
      selection: {
        maxOrdinaryRating: 95,
        protectionPolicy: { reserveRatings: [87, 88, 89] },
      },
    });

    expect(plan.ok).toBe(true);
    expect(plan.selected.map((item) => item.id)).toEqual([1, 2]);
    expect(plan.details.policy.counts).toMatchObject({ reserved: 1, overMaxOrdinaryRating: 1 });
  });

  it('uses Club Other Special cards only as a soft-protected fallback', async () => {
    const roleFreeModel = { requiredPlayerCount: 1, targetRating: 84 };
    const policy = {
      protectionPolicy: {
        softProtectSpecialPiles: ['club'],
        allowSoftProtectedFallback: true,
      },
    };
    const normalPlan = await select([
      entry(1, 84, { special: true, pileName: 'club', pileRank: 0 }),
      entry(2, 84, { pileName: 'storage', pileRank: 1 }),
    ], {
      ratingModel: roleFreeModel,
      priorityPiles: ['club', 'storage'],
      selection: policy,
    });
    const fallbackPlan = await select([
      entry(1, 84, { special: true, pileName: 'club', pileRank: 0 }),
    ], {
      ratingModel: roleFreeModel,
      priorityPiles: ['club'],
      selection: policy,
    });

    expect(normalPlan.ok).toBe(true);
    expect(normalPlan.selected.map((item) => item.id)).toEqual([2]);
    expect(normalPlan.details.policy.usedSoftProtectedFallback).toBe(false);
    expect(fallbackPlan.ok).toBe(true);
    expect(fallbackPlan.selected.map((item) => item.id)).toEqual([1]);
    expect(fallbackPlan.details.policy.usedSoftProtectedFallback).toBe(true);
  });

  it.each([
    {
      name: 'missing live matcher metadata',
      entries: [entry(1, 84)],
      ratingModel: { requiredPlayerCount: 1 },
      selection: { protectionPolicy: { liveRequirementsAvailable: false } },
      code: 'LIVE_REQUIREMENT_UNAVAILABLE',
    },
    {
      name: 'missing Required Special',
      entries: [entry(1, 84, { requirementMatches: [false] })],
      ratingModel: {
        requiredPlayerCount: 1,
        constraints: [{ id: 'required-special', label: 'Required Special x1', count: 1 }],
      },
      selection: {
        exclusiveRoles: [{ id: 'required-special', constraintId: 'required-special', minCount: 1, maxCount: 1 }],
      },
      code: 'REQUIRED_SPECIAL_SHORTAGE',
    },
    {
      name: 'too few legal players',
      entries: [entry(1, 84)],
      ratingModel: { requiredPlayerCount: 2 },
      selection: { maxOrdinaryRating: 95 },
      code: 'PLAYER_COUNT_SHORTAGE',
    },
    {
      name: 'insufficient maximum squad rating',
      entries: [entry(1, 80), entry(2, 80)],
      ratingModel: { requiredPlayerCount: 2, targetRating: 84 },
      selection: { maxOrdinaryRating: 95 },
      code: 'SQUAD_RATING_SHORTAGE',
    },
    {
      name: 'reserved fodder is the only feasible material',
      entries: [entry(1, 87)],
      ratingModel: { requiredPlayerCount: 1, targetRating: 87 },
      selection: { protectionPolicy: { reserveRatings: [87, 88, 89] } },
      code: 'RESERVED_FODDER_BLOCKED',
    },
  ])('returns $code when $name', async ({ entries, ratingModel, selection, code }) => {
    const plan = await select(entries, { ratingModel, selection });

    expect(plan.ok).toBe(false);
    expect(plan.missing.code).toBe(code);
    expect(plan.details.reasonCode).toBe(code);
    expect(plan.diagnostics).toEqual([
      expect.objectContaining({
        counts: expect.any(Object),
        ratingHistogram: expect.any(Object),
      }),
    ]);
    expect(JSON.stringify(plan.diagnostics)).not.toContain('definitionId');
  });

  it('distinguishes an unavailable mandatory item from an ordinary player shortage', async () => {
    const plan = await select([
      entry(1, 84),
      entry(2, 84),
    ], {
      ratingModel: { requiredPlayerCount: 2, targetRating: 84 },
      selection: {
        requiredItems: [{ id: 999, definitionId: 1999 }],
        maxOrdinaryRating: 95,
      },
    });

    expect(plan).toMatchObject({
      ok: false,
      missing: { code: 'REQUIRED_ITEM_UNAVAILABLE' },
    });
  });
});
