import { describe, expect, it, vi } from 'vitest';
import { createInventorySnapshot } from '../../src/domain/contracts.js';
import { selectInventoryPlayers } from '../../src/selection/index.js';
import {
  createStorageSinkClubFillRole,
  nextStorageSinkContext,
  planMultiSquadRatingSelections,
  prepareStorageSink89Candidates,
  selectStorageSinkClubFallbackEntries,
  STORAGE_SINK_MAX_CLUB_FILL_PER_SQUAD,
  storageSinkSquadSourceStrategy,
  validateStorageRecoveryHeadroom,
  validateStorageSinkHeadroom,
} from '../../src/selection/multi-squad-rating.js';

function player(id, definitionId, rating, pile = 'storage') {
  return { id, definitionId, type: 'player', rating, pile, ref: { id, definitionId, pile } };
}

function snapshot() {
  return createInventorySnapshot({
    piles: {
      unassigned: [player(901, 101, 90, 'unassigned')],
      storage: [player(1, 201, 90), player(2, 202, 89), player(3, 203, 88)],
      transfer: [],
      club: [player(4, 204, 87, 'club')],
    },
    capacities: { storage: { used: 3, max: 100 } },
  });
}

function selection(entries) {
  return {
    ok: true,
    entries,
    pileCounts: entries.reduce((counts, entry) => ({
      ...counts,
      [entry.pileName]: (counts[entry.pileName] || 0) + 1,
    }), {}),
  };
}

describe('multi-squad rating planner', () => {
  it('defines a bounded Club-only fill role for Storage Sink planning', () => {
    expect(createStorageSinkClubFillRole(2)).toEqual({
      id: 'storage-sink-club-fill',
      label: 'Club fill',
      piles: ['club'],
      minCount: 0,
      maxCount: 2,
    });
    expect(createStorageSinkClubFillRole(-1).maxCount).toBe(0);
    expect(STORAGE_SINK_MAX_CLUB_FILL_PER_SQUAD).toBe(3);
  });

  it('uses sequential source policies for the 89 and 88 Storage Sink squads', () => {
    expect(storageSinkSquadSourceStrategy(89)).toEqual({
      targetRating: 89,
      priorityPiles: ['unassigned', 'storage'],
      requirePrimaryUnassigned: true,
      maxClubCount: 0,
    });
    expect(storageSinkSquadSourceStrategy(88)).toEqual({
      targetRating: 88,
      priorityPiles: ['storage', 'club'],
      requirePrimaryUnassigned: false,
      maxClubCount: 3,
    });
    expect(storageSinkSquadSourceStrategy(87)).toBeNull();
  });

  it('continues the harder incomplete Storage Sink squad without requiring both contexts', () => {
    expect(nextStorageSinkContext([{ targetRating: 88 }, { targetRating: 89 }]))
      .toMatchObject({ targetRating: 89 });
    expect(nextStorageSinkContext([{ targetRating: 88 }]))
      .toMatchObject({ targetRating: 88 });
    expect(nextStorageSinkContext([])).toBeNull();
  });

  it('forces only eligible current primary Unassigned signals into the 89 squad pool', () => {
    const entries = [
      { item: player(1, 101, 93), signal: player(901, 101, 93, 'unassigned'), pileName: 'unassigned' },
      { item: player(2, 102, 96), signal: player(902, 102, 96, 'unassigned'), pileName: 'unassigned' },
      { item: player(3, 103, 90), signal: player(903, 103, 90, 'unassigned'), pileName: 'unassigned' },
      { item: player(4, 104, 88), signal: null, pileName: 'storage' },
      { item: player(5, 105, 91, 'club'), signal: null, pileName: 'club' },
    ];

    const result = prepareStorageSink89Candidates(entries, {
      primaryRefs: [{ id: 901 }, { id: 902 }],
      maxRating: 95,
    });

    expect(result.entries.map((entry) => entry.item.id)).toEqual([1, 4]);
    expect(result.requiredEntries.map((entry) => entry.item.id)).toEqual([1]);
    expect(result.requiredItems).toEqual([{ id: 1, definitionId: 101, pile: 'unassigned' }]);
  });

  it('materializes the logged eight-card Unassigned case without admitting ordinary Club fill', async () => {
    const ratings = [93, 90, 90, 90, 88, 88, 85, 85];
    const unassigned = ratings.map((rating, index) => ({
      item: player(index + 1, 1001 + index, rating, 'club'),
      signal: player(901 + index, 1001 + index, rating, 'unassigned'),
      pileName: 'unassigned',
      pileRank: 0,
      requirementMatches: [],
      special: false,
    }));
    const storage = [95, 94, 92, 91, 89, 88, 87, 86].map((rating, index) => ({
      item: player(101 + index, 2001 + index, rating, 'storage'),
      signal: null,
      pileName: 'storage',
      pileRank: 1,
      requirementMatches: [],
      special: false,
    }));
    const prepared = prepareStorageSink89Candidates([...unassigned, ...storage], {
      primaryRefs: unassigned.map((entry) => ({ id: entry.signal.id })),
      maxRating: 95,
    });

    const plan = await selectInventoryPlayers({
      mode: 'rating',
      candidateEntries: prepared.entries,
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 89,
        maxSpecialCount: 11,
        constraints: [],
      },
      priorityPiles: ['unassigned', 'storage'],
      requiredItems: prepared.requiredItems,
      maxOrdinaryRating: 95,
      protectionPolicy: { allowOtherSpecialAsOrdinary: true },
    });

    expect(plan.ok).toBe(true);
    expect(plan.details.rating).toBe(89);
    expect(plan.pileCounts).toEqual({ unassigned: 8, storage: 3 });
    expect(plan.selected.filter((item) => item.id <= 8)).toHaveLength(8);
  });

  it('keeps every required Unassigned card when the lowest 89 squad necessarily over-rates', async () => {
    const unassigned = Array.from({ length: 8 }, (_, index) => ({
      item: player(index + 1, 3001 + index, 95, 'club'),
      signal: player(901 + index, 3001 + index, 95, 'unassigned'),
      pileName: 'unassigned',
      pileRank: 0,
      requirementMatches: [],
      special: false,
    }));
    const storage = Array.from({ length: 3 }, (_, index) => ({
      item: player(101 + index, 4001 + index, 95, 'storage'),
      signal: null,
      pileName: 'storage',
      pileRank: 1,
      requirementMatches: [],
      special: false,
    }));
    const prepared = prepareStorageSink89Candidates([...unassigned, ...storage], {
      primaryRefs: unassigned.map((entry) => ({ id: entry.signal.id })),
      maxRating: 95,
    });

    const plan = await selectInventoryPlayers({
      mode: 'rating',
      candidateEntries: prepared.entries,
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 89,
        maxSpecialCount: 11,
        constraints: [],
      },
      priorityPiles: ['unassigned', 'storage'],
      requiredItems: prepared.requiredItems,
      maxOrdinaryRating: 95,
      protectionPolicy: { allowOtherSpecialAsOrdinary: true },
    });

    expect(plan.ok).toBe(true);
    expect(plan.details.rating).toBe(95);
    expect(plan.pileCounts).toEqual({ unassigned: 8, storage: 3 });
  });

  it('bounds the 88 squad Club fallback to safe ordinary cards', () => {
    const entries = [
      { item: player(1, 101, 90, 'club'), pileName: 'club', special: false },
      { item: player(2, 102, 95, 'club'), pileName: 'club', special: true },
      { item: player(3, 103, 96, 'club'), pileName: 'club', special: false },
      { item: player(4, 104, 89, 'club'), pileName: 'club', special: false },
      { item: player(5, 105, 88), pileName: 'storage', special: false },
    ];

    expect(selectStorageSinkClubFallbackEntries(entries, { count: 2, maxRating: 95 })
      .map((entry) => entry.item.id)).toEqual([1, 4]);
    expect(selectStorageSinkClubFallbackEntries(entries, { count: 99, maxRating: 95 }))
      .toHaveLength(2);
  });

  it('plans the harder squad first and removes its item and signal refs before the next plan', async () => {
    const selectChallenge = vi.fn(async (working, context) => {
      if (context.targetRating === 89) {
        return selection([{
          itemRef: { id: 1, definitionId: 201, pile: 'storage' },
          signalRef: { id: 901, definitionId: 101, pile: 'unassigned' },
          pileName: 'storage',
        }]);
      }
      expect(working.piles.storage.map((item) => item.id)).toEqual([2, 3]);
      expect(working.piles.unassigned).toEqual([]);
      return selection([{
        itemRef: { id: 4, definitionId: 204, pile: 'club' },
        pileName: 'club',
      }]);
    });

    const result = await planMultiSquadRatingSelections({
      snapshot: snapshot(),
      contexts: [{ targetRating: 88 }, { targetRating: 89 }],
      selectChallenge,
    });

    expect(result).toMatchObject({
      ok: true,
      storageItemsConsumed: 1,
      pileCounts: { storage: 1, club: 1 },
      details: { squadCount: 2, challengeRatings: [89, 88] },
    });
    expect(selectChallenge).toHaveBeenCalledTimes(2);
  });

  it('fails before returning any plan when the second squad is infeasible', async () => {
    const result = await planMultiSquadRatingSelections({
      snapshot: snapshot(),
      contexts: [{ targetRating: 88 }, { targetRating: 89 }],
      selectChallenge: vi.fn(async (_working, context) => context.targetRating === 89
        ? selection([{ itemRef: { id: 1, definitionId: 201, pile: 'storage' }, pileName: 'storage' }])
        : { ok: false, reason: 'not enough 88 fodder', reasonCode: 'SQUAD_RATING_SHORTAGE' }),
    });

    expect(result).toMatchObject({
      ok: false,
      reasonCode: 'SQUAD_RATING_SHORTAGE',
      details: {
        failedIndex: 1,
        targetRating: 88,
        completedPlans: 1,
        selectionMissing: null,
        selectionPolicy: null,
        selectionDiagnostics: [],
      },
    });
  });

  it('rejects item, definition, and duplicate-signal reuse across squads', async () => {
    const cases = [
      {
        first: { itemRef: { id: 1, definitionId: 201, pile: 'storage' }, pileName: 'storage' },
        second: { itemRef: { id: 1, definitionId: 999, pile: 'storage' }, pileName: 'storage' },
        code: 'MULTI_SQUAD_IDENTITY_OVERLAP',
      },
      {
        first: { itemRef: { id: 1, definitionId: 201, pile: 'storage' }, pileName: 'storage' },
        second: { itemRef: { id: 2, definitionId: 201, pile: 'storage' }, pileName: 'storage' },
        code: 'MULTI_SQUAD_DEFINITION_OVERLAP',
      },
      {
        first: { itemRef: { id: 1, definitionId: 201, pile: 'storage' }, signalRef: { id: 901, definitionId: 101, pile: 'unassigned' }, pileName: 'storage' },
        second: { itemRef: { id: 2, definitionId: 202, pile: 'storage' }, signalRef: { id: 901, definitionId: 101, pile: 'unassigned' }, pileName: 'storage' },
        code: 'MULTI_SQUAD_SIGNAL_OVERLAP',
      },
    ];

    for (const testCase of cases) {
      let call = 0;
      const result = await planMultiSquadRatingSelections({
        snapshot: snapshot(),
        contexts: [{ targetRating: 89 }, { targetRating: 88 }],
        selectChallenge: vi.fn(async () => selection([call++ ? testCase.second : testCase.first])),
      });
      expect(result.reasonCode).toBe(testCase.code);
    }
  });

  it('requires enough projected Storage room for pending cards and one Pick duplicate', () => {
    expect(validateStorageSinkHeadroom({
      currentFree: 0,
      storageItemsConsumed: 3,
      pendingStorageItems: 2,
    })).toMatchObject({ ok: true, projectedFree: 3, requiredFree: 3 });
    expect(validateStorageSinkHeadroom({
      currentFree: 0,
      storageItemsConsumed: 2,
      pendingStorageItems: 2,
    })).toMatchObject({ ok: false, reasonCode: 'STORAGE_SINK_HEADROOM_INSUFFICIENT' });
    expect(validateStorageSinkHeadroom({
      currentFree: null,
      storageItemsConsumed: 22,
      pendingStorageItems: 1,
    })).toMatchObject({ ok: false, reasonCode: 'STORAGE_CAPACITY_UNKNOWN' });
  });

  it('requires emergency Provisions to release enough actual Storage cards', () => {
    expect(validateStorageRecoveryHeadroom({
      currentFree: 1,
      storageItemsConsumed: 2,
      pendingStorageItems: 3,
    })).toMatchObject({
      ok: true,
      currentFree: 1,
      projectedFree: 3,
      requiredFree: 3,
      storageItemsConsumed: 2,
    });
    expect(validateStorageRecoveryHeadroom({
      currentFree: 0,
      storageItemsConsumed: 1,
      pendingStorageItems: 3,
    })).toMatchObject({
      ok: false,
      reasonCode: 'RECOVERY_STORAGE_HEADROOM_INSUFFICIENT',
      details: {
        currentFree: 0,
        projectedFree: 1,
        requiredFree: 3,
        storageItemsConsumed: 1,
      },
    });
    expect(validateStorageRecoveryHeadroom({
      currentFree: null,
      storageItemsConsumed: 4,
      pendingStorageItems: 1,
    })).toMatchObject({
      ok: false,
      reasonCode: 'STORAGE_CAPACITY_UNKNOWN',
    });
  });
});
