import { describe, expect, it, vi } from 'vitest';
import { createInventorySnapshot } from '../../src/domain/contracts.js';
import { selectInventoryPlayers } from '../../src/selection/index.js';
import {
  createStoragePressureRole,
  createStorageSinkClubFillRole,
  genericStorageSinkSquadSourceStrategy,
  nextGenericStorageSinkContext,
  nextStorageSinkContext,
  planMultiSquadRatingSelections,
  prepareStorageSink89Candidates,
  prepareGenericStorageSinkCandidates,
  selectStorageSinkClubFallbackEntries,
  storageSinkRequiredSpecialRoles,
  storagePressureRequirement,
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

  it('uses one generic high-rating source policy without changing the legacy 89/88 contract', () => {
    expect(genericStorageSinkSquadSourceStrategy(90)).toEqual({
      targetRating: 90,
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      requirePrimaryUnassigned: true,
      maxClubCount: 3,
    });
    expect(genericStorageSinkSquadSourceStrategy(86)).toBeNull();

    const entries = [
      { item: player(1, 101, 93), signal: player(901, 101, 93, 'unassigned'), pileName: 'unassigned' },
      { item: player(2, 102, 90), signal: player(902, 102, 90, 'unassigned'), pileName: 'unassigned' },
      { item: player(3, 103, 89), signal: null, pileName: 'storage' },
      { item: player(4, 104, 88, 'transfer'), signal: null, pileName: 'transfer' },
      { item: player(5, 105, 87, 'club'), signal: null, pileName: 'club' },
    ];
    const prepared = prepareGenericStorageSinkCandidates(entries, {
      primaryRefs: [{ id: 901 }, { id: 902 }],
      maxRating: 95,
      requiredPlayerCount: 1,
      clubEntries: [entries[4]],
    });
    expect(prepared.requiredEntries.map((entry) => entry.item.id)).toEqual([1]);
    expect(prepared.entries.map((entry) => entry.item.id)).toEqual([1, 3, 4, 5]);
  });

  it('expands only ordinary Club boosters inside the configured rating range', () => {
    const entries = [
      { item: player(1, 101, 91, 'club'), pileName: 'club', special: false, requirementMatches: [] },
      { item: player(2, 102, 90, 'club'), pileName: 'club', special: false, requirementMatches: [] },
      { item: player(3, 103, 87, 'club'), pileName: 'club', special: false, requirementMatches: [] },
      { item: player(4, 104, 86, 'club'), pileName: 'club', special: false, requirementMatches: [] },
      { item: player(5, 105, 92, 'club'), pileName: 'club', special: false, requirementMatches: [] },
      { item: player(6, 106, 90, 'club'), pileName: 'club', special: true, requirementMatches: [] },
    ];

    expect(selectStorageSinkClubFallbackEntries(entries, {
      count: 8,
      maxCount: 8,
      maxRating: 95,
      ordinaryMinRating: 87,
      ordinaryMaxRating: 91,
    }).map((entry) => entry.item.id)).toEqual([1, 2, 3]);
  });

  it('admits only threshold-safe pending Unassigned cards as Storage pressure', () => {
    const entries = [
      { item: player(1, 101, 93), signal: player(901, 101, 93, 'unassigned'), pileName: 'unassigned' },
      { item: player(2, 102, 91), signal: player(902, 102, 91, 'unassigned'), pileName: 'unassigned' },
      { item: player(3, 103, 96), signal: player(903, 103, 96, 'unassigned'), pileName: 'unassigned' },
      { item: player(4, 104, 89), signal: null, pileName: 'storage' },
      { item: player(5, 105, 96), signal: null, pileName: 'storage' },
      { item: player(6, 106, 88, 'transfer'), signal: null, pileName: 'transfer' },
      { item: player(7, 107, 87, 'club'), signal: null, pileName: 'club' },
    ];

    const prepared = prepareGenericStorageSinkCandidates(entries, {
      primaryRefs: [{ id: 901 }],
      pendingStorageRefs: [{ id: 902 }, { id: 903 }],
      maxRating: 95,
      requiredPlayerCount: 11,
      clubEntries: [entries[6]],
    });

    expect(prepared.entries.map((entry) => entry.item.id)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(prepared.requiredEntries.map((entry) => entry.item.id)).toEqual([1]);
    expect(prepared.eligiblePendingEntries.map((entry) => entry.item.id)).toEqual([2]);
    expect(prepared.pressureEntries.map((entry) => entry.item.id)).toEqual([2, 4]);
  });

  it('enforces pending-or-Storage consumption as a rating-planner role', async () => {
    const primary = Array.from({ length: 6 }, (_, index) => ({
      item: player(index + 1, 1001 + index, 88, 'club'),
      signal: player(901 + index, 1001 + index, 88, 'unassigned'),
      pileName: 'unassigned',
      pileRank: 1,
      requirementMatches: [],
      special: false,
    }));
    const pending = Array.from({ length: 3 }, (_, index) => ({
      item: player(11 + index, 1101 + index, 88, 'club'),
      signal: player(911 + index, 1101 + index, 88, 'unassigned'),
      pileName: 'unassigned',
      pileRank: 1,
      requirementMatches: [],
      special: true,
    }));
    const transfer = Array.from({ length: 5 }, (_, index) => ({
      item: player(21 + index, 1201 + index, 88, 'transfer'),
      signal: null,
      pileName: 'transfer',
      pileRank: 0,
      requirementMatches: [],
      special: false,
    }));
    const prepared = prepareGenericStorageSinkCandidates([...primary, ...pending, ...transfer], {
      primaryRefs: primary.map((entry) => ({ id: entry.signal.id })),
      pendingStorageRefs: pending.map((entry) => ({ id: entry.signal.id })),
      maxRating: 95,
      requiredPlayerCount: 11,
    });

    const plan = await selectInventoryPlayers({
      mode: 'rating',
      candidateEntries: prepared.entries,
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 88,
        maxSpecialCount: 11,
        constraints: [],
      },
      priorityPiles: ['transfer', 'unassigned', 'storage', 'club'],
      requiredItems: prepared.requiredItems,
      exclusiveRoles: [createStoragePressureRole(prepared.pressureItems, 3, 11)],
      maxOrdinaryRating: 95,
      protectionPolicy: { allowOtherSpecialAsOrdinary: true },
    });

    expect(plan.ok).toBe(true);
    expect(plan.pileCounts).toEqual({ unassigned: 9, transfer: 2 });
    expect(plan.details.roles).toEqual([
      expect.objectContaining({ id: 'storage-pressure-release', selected: 3, minCount: 3 }),
      ...primary.map((_, index) => expect.objectContaining({
        id: `required-item-${index + 1}`,
        selected: 1,
      })),
    ]);
  });

  it('fails closed when fewer pressure candidates exist than the pre-plan minimum', async () => {
    const entries = Array.from({ length: 11 }, (_, index) => ({
      item: player(index + 1, 1301 + index, 88, index < 2 ? 'storage' : 'transfer'),
      signal: null,
      pileName: index < 2 ? 'storage' : 'transfer',
      pileRank: index < 2 ? 0 : 1,
      requirementMatches: [],
      special: false,
    }));

    const plan = await selectInventoryPlayers({
      mode: 'rating',
      candidateEntries: entries,
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 88,
        maxSpecialCount: 11,
        constraints: [],
      },
      priorityPiles: ['storage', 'transfer'],
      exclusiveRoles: [createStoragePressureRole(
        entries.slice(0, 2).map((entry) => ({ id: entry.item.id })),
        3,
        11,
      )],
      maxOrdinaryRating: 95,
      protectionPolicy: { allowOtherSpecialAsOrdinary: true },
    });

    expect(plan).toMatchObject({
      ok: false,
      missing: {
        code: 'REQUIRED_SPECIAL_SHORTAGE',
        reason: 'Storage pressure release x3 has only 2/3 safe candidate(s)',
      },
    });
  });

  it('keeps an exact 84 recovery squad while consuming the required real Storage cards', async () => {
    const primaryRatings = [88, 87, 87, 86, 85];
    const primary = primaryRatings.map((rating, index) => ({
      item: player(index + 1, 2001 + index, rating, 'club'),
      signal: player(901 + index, 2001 + index, rating, 'unassigned'),
      pileName: 'unassigned',
      submissionPileName: 'club',
      pileRank: 0,
      requirementMatches: [],
      special: false,
    }));
    const storage = [87, 89, 91, 92].map((rating, index) => ({
      item: player(21 + index, 2101 + index, rating, 'storage'),
      signal: null,
      pileName: 'storage',
      submissionPileName: 'storage',
      pileRank: 1,
      requirementMatches: [],
      special: false,
    }));
    const club = Array.from({ length: 32 }, (_, index) => ({
      item: player(41 + index, 2201 + index, 63 + (index % 16), 'club'),
      signal: null,
      pileName: 'club',
      submissionPileName: 'club',
      pileRank: 2,
      requirementMatches: [],
      special: false,
    }));
    const role = createStoragePressureRole(
      storage.map((entry) => ({ id: entry.item.id, definitionId: entry.item.definitionId })),
      2,
      11,
    );

    const plan = await selectInventoryPlayers({
      mode: 'rating',
      candidateEntries: [...primary, ...storage, ...club],
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 84,
        maxSpecialCount: 11,
        constraints: [],
      },
      priorityPiles: ['unassigned', 'storage', 'club'],
      requiredItems: primary.map((entry) => ({ id: entry.item.id })),
      exclusiveRoles: [role],
      maxOrdinaryRating: 96,
      protectionPolicy: { allowOtherSpecialAsOrdinary: true },
    });

    expect(plan.ok).toBe(true);
    expect(plan.details.rating).toBe(84);
    expect(plan.entries.filter((entry) => entry.pileName === 'storage')).toHaveLength(2);
    expect(plan.details.roles).toEqual([
      expect.objectContaining({ id: 'storage-pressure-release', selected: 2, minCount: 2 }),
      ...primary.map((_, index) => expect.objectContaining({
        id: `required-item-${index + 1}`,
        selected: 1,
      })),
    ]);
  });

  it('computes the pre-plan Storage release requirement including reward reserve', () => {
    expect(storagePressureRequirement({
      currentFree: 1,
      pendingStorageItems: 4,
    })).toMatchObject({
      ok: true,
      requiredFree: 4,
      minimumConsumption: 3,
    });
    expect(storagePressureRequirement({
      currentFree: 1,
      pendingStorageItems: 4,
      reserveSlots: 1,
    })).toMatchObject({
      ok: true,
      requiredFree: 5,
      minimumConsumption: 4,
    });
  });

  it('keeps generic Storage Sink challenges in live EA order', () => {
    const contexts = [
      { challengeId: 3864, targetRating: 88 },
      { challengeId: 3865, targetRating: 90 },
    ];

    expect(nextGenericStorageSinkContext(contexts)).toBe(contexts[0]);
    expect(nextGenericStorageSinkContext([{ targetRating: 86 }, contexts[1]])).toBe(contexts[1]);
  });

  it('models a live player-group condition as an exact Storage Sink role', () => {
    expect(storageSinkRequiredSpecialRoles({
      constraints: [
        { source: 'ea', keyName: 'PLAYER_RARITY_GROUP', label: 'PLAYER_RARITY_GROUP 83 x1', count: 1 },
        { source: 'ea', keyName: 'PLAYER_QUALITY', label: 'Gold', count: 11 },
      ],
    })).toEqual([{
      id: 'storage-sink-required-special',
      label: 'PLAYER_RARITY_GROUP 83 x1',
      constraintIndex: 0,
      minCount: 1,
      maxCount: 1,
    }]);
  });

  it('widens an all-matching-specials Storage Sink role to the squad size', () => {
    expect(storageSinkRequiredSpecialRoles({
      requiredPlayerCount: 11,
      requiredSpecialAllowanceMode: 'all-matching-specials',
      constraints: [{
        source: 'ea',
        keyName: 'PLAYER_RARITY_GROUP',
        requiredSpecialRole: true,
        label: 'Any Special x1',
        count: 1,
      }],
    })[0]).toMatchObject({ minCount: 1, maxCount: 11 });
  });

  it('fills the logged 88 squad with all eight Unassigned cards plus exactly one Required Special', async () => {
    const requiredRatings = [92, 89, 88, 87, 86, 86, 85, 85];
    const unassigned = requiredRatings.map((rating, index) => ({
      item: player(index + 1, 5001 + index, rating, 'club'),
      signal: player(901 + index, 5001 + index, rating, 'unassigned'),
      pileName: 'unassigned',
      pileRank: 0,
      requirementMatches: [false],
      special: index === 0 || index === 2,
    }));
    const storage = [
      { rating: 91, requiredSpecial: true },
      { rating: 90, requiredSpecial: false },
      { rating: 89, requiredSpecial: false },
      { rating: 86, requiredSpecial: false },
    ].map(({ rating, requiredSpecial }, index) => ({
      item: player(101 + index, 6001 + index, rating, 'storage'),
      signal: null,
      pileName: 'storage',
      pileRank: 1,
      requirementMatches: [requiredSpecial],
      special: requiredSpecial,
    }));
    const prepared = prepareGenericStorageSinkCandidates([...unassigned, ...storage], {
      primaryRefs: unassigned.map((entry) => ({ id: entry.signal.id })),
      maxRating: 95,
      requiredPlayerCount: 11,
    });
    const model = {
      requiredPlayerCount: 11,
      targetRating: 88,
      maxSpecialCount: 1,
      constraints: [{
        source: 'ea',
        keyName: 'PLAYER_RARITY_GROUP',
        label: 'PLAYER_RARITY_GROUP 83 x1',
        count: 1,
      }],
    };

    const plan = await selectInventoryPlayers({
      mode: 'rating',
      candidateEntries: prepared.entries,
      ratingModel: model,
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      requiredItems: prepared.requiredItems,
      exclusiveRoles: storageSinkRequiredSpecialRoles(model),
      maxOrdinaryRating: 95,
      protectionPolicy: { allowOtherSpecialAsOrdinary: true },
    });

    expect(plan.ok).toBe(true);
    expect(plan.details.rating).toBe(88);
    expect(plan.pileCounts).toEqual({ unassigned: 8, storage: 3 });
    expect(plan.selected.filter((item) => item.id <= 8)).toHaveLength(8);
    expect(plan.entries.filter((entry) => entry.requirementMatches[0])).toHaveLength(1);
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

  it('defers a protected primary duplicate and completes the logged 90 squad from Storage', async () => {
    const protectedSpecial = {
      item: player(1, 101, 95),
      signal: player(901, 101, 95, 'unassigned'),
      pileName: 'unassigned',
      pileRank: 0,
      requirementMatches: [],
      special: true,
    };
    const ordinary = Array.from({ length: 8 }, (_, index) => ({
      item: player(2 + index, 102 + index, 88 - Math.floor(index / 3)),
      signal: player(902 + index, 102 + index, 88 - Math.floor(index / 3), 'unassigned'),
      pileName: 'unassigned',
      pileRank: 0,
      requirementMatches: [],
      special: false,
    }));
    const storage = Array.from({ length: 3 }, (_, index) => ({
      item: player(20 + index, 120 + index, 95, 'storage'),
      signal: null,
      pileName: 'storage',
      pileRank: 1,
      requirementMatches: [],
      special: false,
    }));
    const primaryRefs = [protectedSpecial, ...ordinary].map((entry) => ({ id: entry.signal.id }));

    const generic = prepareGenericStorageSinkCandidates(
      [protectedSpecial, ...ordinary, ...storage],
      {
        primaryRefs,
        maxRating: 95,
        requiredPlayerCount: 11,
        protectedItems: [{ id: protectedSpecial.item.id }],
      },
    );
    const legacy = prepareStorageSink89Candidates(
      [protectedSpecial, ...ordinary, ...storage],
      {
        primaryRefs,
        maxRating: 95,
        protectedItems: [{ id: protectedSpecial.item.id }],
      },
    );

    for (const prepared of [generic, legacy]) {
      expect(prepared.requiredEntries.map((entry) => entry.item.id))
        .toEqual(ordinary.map((entry) => entry.item.id));
      expect(prepared.deferredProtectedEntries.map((entry) => entry.item.id))
        .toEqual([protectedSpecial.item.id]);
      expect(prepared.entries.some((entry) => entry.item.id === protectedSpecial.item.id)).toBe(false);
      expect(prepared.requiredItems).toHaveLength(8);
    }

    const plan = await selectInventoryPlayers({
      mode: 'rating',
      candidateEntries: generic.entries,
      ratingModel: {
        requiredPlayerCount: 11,
        targetRating: 90,
        maxSpecialCount: 11,
        constraints: [],
      },
      priorityPiles: ['unassigned', 'storage'],
      requiredItems: generic.requiredItems,
      maxOrdinaryRating: 95,
      protectionPolicy: { allowOtherSpecialAsOrdinary: true },
    });

    expect(plan.ok).toBe(true);
    expect(plan.details.rating).toBe(90);
    expect(plan.pileCounts).toEqual({ unassigned: 8, storage: 3 });
    expect(plan.selected.some((item) => item.id === protectedSpecial.item.id)).toBe(false);
  });

  it('keeps the same Required Special mandatory when the current sink role allows it', () => {
    const requiredSpecial = {
      item: player(1, 101, 95),
      signal: player(901, 101, 95, 'unassigned'),
      pileName: 'unassigned',
    };

    const prepared = prepareGenericStorageSinkCandidates([requiredSpecial], {
      primaryRefs: [{ id: requiredSpecial.signal.id }],
      maxRating: 95,
      requiredPlayerCount: 11,
      protectedItems: [],
    });

    expect(prepared.requiredEntries).toEqual([requiredSpecial]);
    expect(prepared.deferredProtectedEntries).toEqual([]);
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

  it('admits one required Club special ahead of ordinary Club fallback', () => {
    const entries = [
      { item: player(1, 101, 94, 'club'), pileName: 'club', special: false, requirementMatches: [false] },
      { item: player(2, 102, 96, 'club'), pileName: 'club', special: true, requirementMatches: [true] },
      { item: player(3, 103, 95, 'club'), pileName: 'club', special: true, requirementMatches: [false] },
      { item: player(4, 104, 93, 'club'), pileName: 'club', special: false, requirementMatches: [false] },
      { item: player(5, 105, 91, 'club'), pileName: 'club', special: true, requirementMatches: [true] },
      { item: player(6, 106, 92, 'club'), pileName: 'club', special: true, requirementMatches: [true] },
    ];

    expect(selectStorageSinkClubFallbackEntries(entries, {
      count: 3,
      maxRating: 95,
      requiredConstraintIndexes: [0],
      protectedItems: [{ id: 6 }],
    }).map((entry) => entry.item.id)).toEqual([5, 1, 4]);
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
