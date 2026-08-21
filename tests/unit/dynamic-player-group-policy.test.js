import { describe, expect, it } from 'vitest';
import { createInventorySnapshot } from '../../src/domain/contracts.js';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

function requirement(key, values, count = -1, matcher = null) {
  return {
    count,
    getFirstKey: () => key,
    getValue: () => values,
    ...(matcher ? { meetsRequirements: matcher } : {}),
  };
}

describe('dynamic EA player-group policy', () => {
  it('keeps explicit FC26 rarity authoritative over overlapping player groups and subtype methods', async () => {
    const { api } = await loadUserscript();
    const totw = makePlayer({
      id: 1,
      rating: 86,
      rareflag: 3,
      groups: [4, 22, 44, 45, 83],
      name: 'Singo',
    });
    const tots = makePlayer({
      id: 2,
      rating: 95,
      rareflag: 11,
      groups: [16, 19, 43, 44, 83],
      name: 'Kobel',
    });
    const futties = makePlayer({
      id: 3,
      rating: 93,
      rareflag: 120,
      groups: [19, 33, 43, 44, 83],
      name: 'Ekitike',
    });
    const semenyo = makePlayer({
      id: 4,
      definitionId: 168013396,
      rating: 96,
      rareflag: 109,
      groups: [22, 45, 79, 83, 87],
      name: 'Semenyo',
    });
    semenyo.isTOTW = () => true;

    expect(api.isTotwItem(totw)).toBe(true);
    expect(api.isTotwItem(tots)).toBe(false);
    expect(api.isTotwItem(futties)).toBe(false);
    expect(api.isTotwItem(semenyo)).toBe(false);
    expect(api.isTotwItem({ ...totw, isTOTW: () => false })).toBe(true);
    expect(api.isTotwItem({ ...totw, rareflag: 57, rarityName: 'Team of the Week' })).toBe(true);
    expect(api.isTotwItem({ ...totw, rareflag: 1, rarityName: 'Team of the Week' })).toBe(false);
    const assumedReward = { ...totw, id: 5, rareflag: 0, special: false };
    expect(api.isSbcSpecialItem(assumedReward)).toBe(false);
    api.markAssumedTotwRewardItems([assumedReward], 'test TOTW reward');
    expect(api.isSbcSpecialItem(assumedReward)).toBe(true);
    expect(api.rollingBaseProtectionReasons({ ...semenyo, pile: 'club' }, {
      rollingProtectAllClubNonTotwSpecials: true,
      expectedPlayerCount: 11,
    })).toContain('rolling-club-non-totw-special-strict');
  });

  it('does not let a Club rareflag-109 card satisfy the primary Required Special role through group 45', async () => {
    const semenyo = makePlayer({
      id: 883322847088,
      definitionId: 168013396,
      rating: 96,
      rareflag: 109,
      groups: [22, 45, 79, 83, 87],
      name: 'Semenyo',
    });
    semenyo.matchesPrimaryGroup = true;
    semenyo.isTOTW = () => true;
    const { api } = await loadUserscript({ club: [semenyo] });
    const loopDef = {
      name: 'Strict Dynamic 85x10',
      expectedPlayerCount: 1,
      allowedSpecialCount: 1,
      rollingProtectAllClubNonTotwSpecials: true,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [96], count: 1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 96 },
      ratingSbcFill: { priorityPiles: ['club'] },
    };
    const challenge = {
      requiredPlayerCount: 1,
      squad: { getNumOfRequiredPlayers: () => 1 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [96]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => item.matchesPrimaryGroup === true),
      ],
    };
    const model = api.parseRatingSbcChallenge(loopDef, challenge);
    const requiredSpecialIndexes = model.constraints
      .map((constraint, index) => ({ constraint, index }))
      .filter(({ constraint }) => constraint.keyName === 'PLAYER_RARITY_GROUP')
      .map(({ index }) => index);
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model, {
      candidateFilter: api.createRollingRequiredSpecialSourceFilter({
        constraintIndexes: requiredSpecialIndexes,
        isClubTotw: api.isTotwItem,
      }),
    });

    expect(api.isTotwItem(semenyo)).toBe(false);
    expect(candidates.entries).toEqual([]);
    expect(candidates.policyFiltered).toBe(1);
  });

  it('evaluates a Ledger-backed Storage Sink candidate through its live EA entity', async () => {
    const clubTotw = makePlayer({
      id: 77,
      definitionId: 707,
      rating: 91,
      rareflag: 3,
      groups: [4, 22, 44, 45, 83],
      name: 'TOTW Club Item',
    });
    clubTotw.runtimeGroup83 = true;
    const { api } = await loadUserscript({ club: [clubTotw] });
    const loopDef = {
      name: 'Ledger-backed Storage pressure squad',
      runtimeProtectionRating: 95,
      expectedPlayerCount: 1,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [88], count: 1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 95 },
      ratingSbcFill: { priorityPiles: ['club'] },
    };
    const challenge = {
      requiredPlayerCount: 1,
      squad: { getNumOfRequiredPlayers: () => 1 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [88]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => item.runtimeGroup83 === true),
      ],
    };
    const model = api.parseRatingSbcChallenge(loopDef, challenge);
    const inventorySnapshot = createInventorySnapshot({
      piles: { club: [clubTotw] },
    });
    expect(inventorySnapshot.piles.club[0].runtimeGroup83).toBeUndefined();

    const requiredSpecialIndexes = model.constraints
      .map((constraint, index) => ({ constraint, index }))
      .filter(({ constraint }) => constraint.keyName === 'PLAYER_RARITY_GROUP')
      .map(({ index }) => index);
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model, {
      candidateFilter: api.createRollingRequiredSpecialSourceFilter({
        constraintIndexes: requiredSpecialIndexes,
        isClubTotw: (item) => item.groups.includes(45),
      }),
    }, inventorySnapshot);

    expect(candidates.entries).toEqual([
      expect.objectContaining({
        pileName: 'club',
        item: expect.objectContaining({ id: 77, groups: [4, 22, 44, 45, 83] }),
        requirementMatches: [true],
      }),
    ]);

    const ledger = {
      classifiedEntries: () => [{
        item: inventorySnapshot.piles.club[0],
        pile: 'club',
        classification: { requiredSpecial: true, otherSpecial: false, protected: false },
      }],
    };
    const storageSinkPolicy = api.rollingStorageSinkSelectionPolicy(loopDef, {
      coordinator: { getLedger: () => ledger },
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      openRouting: null,
    }, { model });
    const storageSinkCandidates = api.buildRatingSbcCandidateEntries(
      loopDef,
      model,
      storageSinkPolicy,
      inventorySnapshot,
    );
    expect(storageSinkCandidates.entries).toEqual([
      expect.objectContaining({
        pileName: 'club',
        item: expect.objectContaining({ id: 77 }),
        requirementMatches: [true],
      }),
    ]);
    const storageSinkSelection = await api.findOptimalRatingSbcSelection(
      storageSinkCandidates.entries,
      model,
      storageSinkCandidates.piles,
      { selectionPolicy: storageSinkPolicy },
    );
    expect(storageSinkSelection).toMatchObject({
      ok: true,
      selected: [expect.objectContaining({ id: 77 })],
    });
  });

  it('filters a primary Required Special duplicate out of a generic Storage Sink plan while keeping ordinary swaps', async () => {
    const requiredSignal = makePlayer({
      id: 101,
      definitionId: 9001,
      rating: 91,
      rareflag: 120,
      groups: [83],
      duplicate: true,
      duplicateId: 201,
      name: 'Primary Required Special signal',
    });
    const requiredClubItem = makePlayer({
      id: 201,
      definitionId: 9001,
      rating: 91,
      rareflag: 120,
      groups: [83],
      name: 'Primary Required Special Club item',
    });
    const ordinarySignal = makePlayer({
      id: 102,
      definitionId: 9002,
      rating: 88,
      duplicate: true,
      duplicateId: 202,
      name: 'Ordinary duplicate signal',
    });
    const ordinaryClubItem = makePlayer({
      id: 202,
      definitionId: 9002,
      rating: 88,
      name: 'Ordinary duplicate Club item',
    });
    const storage = Array.from({ length: 9 }, (_, index) => makePlayer({
      id: 300 + index,
      definitionId: 9100 + index,
      rating: 88,
      pile: 'storage',
      name: `Storage fodder ${index + 1}`,
    }));
    const primaryLoopDef = {
      name: 'Primary rolling loop',
      dynamicActiveEligibilityRequirements: [
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
    };
    const sinkLoopDef = {
      name: 'Generic Storage Sink',
      expectedPlayerCount: 11,
      dynamicActiveEligibilityRequirements: [],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 95 },
      ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'club'] },
    };
    const { api } = await loadUserscript({
      unassigned: [requiredSignal, ordinarySignal],
      storage,
      club: [requiredClubItem, ordinaryClubItem],
    });
    const primaryModel = api.parseRatingSbcChallenge(primaryLoopDef, {
      requiredPlayerCount: 11,
      squad: { getNumOfRequiredPlayers: () => 11 },
      eligibilityRequirements: [requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => item.groups.includes(83))],
    });
    const sinkModel = api.parseRatingSbcChallenge(sinkLoopDef, {
      requiredPlayerCount: 11,
      squad: { getNumOfRequiredPlayers: () => 11 },
      eligibilityRequirements: [],
    });
    const ledger = {
      classifiedEntries: () => [
        { item: requiredSignal, pile: 'unassigned', classification: { requiredSpecial: true, protected: false } },
        { item: requiredClubItem, pile: 'club', classification: { requiredSpecial: true, protected: false } },
        { item: ordinarySignal, pile: 'unassigned', classification: { requiredSpecial: false, protected: false } },
        { item: ordinaryClubItem, pile: 'club', classification: { requiredSpecial: false, protected: false } },
      ],
    };
    const runtime = {
      primaryContext: { model: primaryModel, activeLoopDef: primaryLoopDef },
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      coordinator: { getLedger: () => ledger },
    };
    const policy = api.rollingStorageSinkSelectionPolicy(sinkLoopDef, runtime, { model: sinkModel });
    const candidates = api.buildRatingSbcCandidateEntries(sinkLoopDef, sinkModel, policy);

    expect(candidates.entries.map((entry) => entry.item.id)).toEqual([
      ordinaryClubItem.id,
      ...storage.map((item) => item.id),
    ]);
    expect(candidates.policyFiltered).toBe(1);
    expect(candidates.entries.some((entry) => entry.item.id === requiredClubItem.id)).toBe(false);
    expect(candidates.entries.some((entry) => entry.item.id === ordinaryClubItem.id)).toBe(true);
  });

  it('reports a Storage pressure shortfall when only a primary Required Special could release the required slot', async () => {
    const requiredSignal = makePlayer({
      id: 111,
      definitionId: 9011,
      rating: 91,
      rareflag: 120,
      groups: [83],
      duplicate: true,
      duplicateId: 211,
      name: 'Blocked Required Special signal',
    });
    const requiredClubItem = makePlayer({
      id: 211,
      definitionId: 9011,
      rating: 91,
      rareflag: 120,
      groups: [83],
      name: 'Blocked Required Special Club item',
    });
    const transferClubItems = Array.from({ length: 11 }, (_, index) => makePlayer({
      id: 400 + index,
      definitionId: 9200 + index,
      rating: 88,
      name: `Transfer fodder Club item ${index + 1}`,
    }));
    const transfer = transferClubItems.map((clubItem, index) => makePlayer({
      id: 500 + index,
      definitionId: clubItem.definitionId,
      rating: 88,
      duplicate: true,
      duplicateId: clubItem.id,
      name: `Transfer duplicate signal ${index + 1}`,
    }));
    const primaryLoopDef = {
      name: 'Primary rolling loop',
      dynamicActiveEligibilityRequirements: [
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
    };
    const sinkLoopDef = {
      name: 'Generic Storage Sink',
      expectedPlayerCount: 11,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [88], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 95 },
      ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
    };
    const { api } = await loadUserscript({
      unassigned: [requiredSignal],
      transfer,
      club: [requiredClubItem, ...transferClubItems],
    });
    const primaryModel = api.parseRatingSbcChallenge(primaryLoopDef, {
      requiredPlayerCount: 11,
      squad: { getNumOfRequiredPlayers: () => 11 },
      eligibilityRequirements: [requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => item.groups.includes(83))],
    });
    const sinkModel = api.parseRatingSbcChallenge(sinkLoopDef, {
      requiredPlayerCount: 11,
      squad: { getNumOfRequiredPlayers: () => 11 },
      eligibilityRequirements: [requirement('TEAM_RATING', [88])],
    });
    const snapshot = createInventorySnapshot({
      piles: {
        unassigned: [requiredSignal],
        storage: [],
        transfer,
        club: [requiredClubItem, ...transferClubItems],
      },
    });
    const runtime = {
      primaryContext: { model: primaryModel, activeLoopDef: primaryLoopDef },
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [requiredSignal],
      coordinator: {
        getLedger: () => ({
          classifiedEntries: () => [
            { item: requiredSignal, pile: 'unassigned', classification: { requiredSpecial: true, protected: false } },
            { item: requiredClubItem, pile: 'club', classification: { requiredSpecial: true, protected: false } },
          ],
        }),
      },
    };

    const policy = api.rollingStorageSinkSelectionPolicy(
      sinkLoopDef,
      runtime,
      { model: sinkModel },
    );
    const candidates = api.buildRatingSbcCandidateEntries(
      sinkLoopDef,
      sinkModel,
      policy,
      snapshot,
    );
    expect(candidates.entries).toHaveLength(11);
    expect(candidates.entries).toEqual(expect.arrayContaining(
      transferClubItems.map((item) => expect.objectContaining({
        item: expect.objectContaining({ id: item.id }),
        pileName: 'transfer',
      })),
    ));
    expect(candidates.entries.some((entry) => entry.item.id === requiredClubItem.id)).toBe(false);

    const unpressured = await api.selectRollingGenericStorageSinkSquad(
      sinkLoopDef,
      runtime,
      { targetRating: 88, model: sinkModel, activeLoopDef: sinkLoopDef },
      snapshot,
      {
        minimumPressureConsumption: 0,
        pendingStorageRefs: [requiredSignal],
      },
    );
    expect(unpressured).toMatchObject({
      ok: true,
      rating: 88,
      storagePressureConsumed: 0,
    });
    expect(unpressured.selected.map((item) => item.id).sort((left, right) => left - right))
      .toEqual(transferClubItems.map((item) => item.id));

    const result = await api.selectRollingGenericStorageSinkSquad(
      sinkLoopDef,
      runtime,
      { targetRating: 88, model: sinkModel, activeLoopDef: sinkLoopDef },
      snapshot,
      {
        minimumPressureConsumption: 1,
        pendingStorageRefs: [requiredSignal],
      },
    );

    expect(result).toMatchObject({
      ok: false,
      reasonCode: 'RECOVERY_STORAGE_PRESSURE_INFEASIBLE',
      details: {
        requestedPressure: 1,
        maximumFeasible: 0,
        shortfall: 1,
      },
    });
  });

  it('preserves a Required Special shortage while reporting the Storage pressure gap', async () => {
    const storage = Array.from({ length: 11 }, (_, index) => makePlayer({
      id: 600 + index,
      definitionId: 9300 + index,
      rating: 88,
      pile: 'storage',
      name: `Storage fodder ${index + 1}`,
    }));
    const sinkLoopDef = {
      name: 'Required Special Storage Sink',
      expectedPlayerCount: 11,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [88], count: 1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 95 },
      ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
    };
    const { api } = await loadUserscript({ storage });
    const sinkModel = api.parseRatingSbcChallenge(sinkLoopDef, {
      requiredPlayerCount: 11,
      squad: { getNumOfRequiredPlayers: () => 11 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [88]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => item.runtimeGroup83 === true),
      ],
    });
    const snapshot = createInventorySnapshot({
      piles: { storage },
    });
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      coordinator: { getLedger: () => null },
    };

    const result = await api.selectRollingGenericStorageSinkSquad(
      sinkLoopDef,
      runtime,
      { targetRating: 88, model: sinkModel, activeLoopDef: sinkLoopDef },
      snapshot,
      { minimumPressureConsumption: 2 },
    );

    expect(result).toMatchObject({
      ok: false,
      reasonCode: 'REQUIRED_SPECIAL_SHORTAGE',
      details: {
        requestedPressure: 2,
        maximumFeasible: 0,
        shortfall: 2,
        pressureCandidates: 11,
      },
    });
    expect(result.reason).toContain('PLAYER_RARITY_GROUP 83 x1');
  });

  it('keeps Club non-TOTW event cards out of the Rolling Required Special pool', async () => {
    const clubTotw = makePlayer({
      id: 70,
      definitionId: 700,
      rating: 88,
      rareflag: 3,
      groups: [4, 22, 44, 45, 83],
      name: 'Singo',
    });
    const clubFutties = makePlayer({
      id: 71,
      definitionId: 701,
      rating: 95,
      rareflag: 120,
      groups: [19, 33, 43, 44, 83],
      name: 'Ekitike',
    });
    const storageTots = makePlayer({
      id: 72,
      definitionId: 702,
      rating: 93,
      rareflag: 11,
      groups: [16, 19, 43, 44, 83],
      name: 'Kobel',
    });
    const unassignedTotsSignal = makePlayer({
      id: 74,
      definitionId: 702,
      rating: 93,
      rareflag: 11,
      groups: [16, 19, 43, 44, 83],
      duplicate: true,
      duplicateId: 72,
      name: 'TOTS Unassigned Signal',
    });
    const storageFutties = makePlayer({
      id: 75,
      definitionId: 705,
      rating: 94,
      rareflag: 120,
      groups: [19, 33, 43, 44, 83],
      name: 'FUTTIES Storage Item',
    });
    const clubFof = makePlayer({
      id: 73,
      definitionId: 703,
      rating: 92,
      rareflag: 2,
      groups: [83],
      name: 'FOF Club Duplicate',
    });
    const transferFofSignal = makePlayer({
      id: 76,
      definitionId: 703,
      rating: 92,
      rareflag: 2,
      groups: [83],
      duplicate: true,
      duplicateId: 73,
      name: 'FOF Transfer Signal',
    });
    clubTotw.pile = 7;
    clubFutties.pile = 7;
    clubFof.pile = 7;
    const { api } = await loadUserscript({
      club: [clubTotw, clubFutties, clubFof],
      storage: [storageTots, storageFutties],
      transfer: [transferFofSignal],
      unassigned: [unassignedTotsSignal],
    });
    const loopDef = {
      name: 'Rolling Required Special source policy',
      expectedPlayerCount: 1,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [84], count: 1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 95 },
      ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
    };
    const challenge = {
      requiredPlayerCount: 1,
      squad: { getNumOfRequiredPlayers: () => 1 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (candidate) => candidate.groups.includes(83)),
      ],
    };
    const model = api.parseRatingSbcChallenge(loopDef, challenge);
    const requiredSpecialIndexes = model.constraints
      .map((constraint, index) => ({ constraint, index }))
      .filter(({ constraint }) => constraint.keyName === 'PLAYER_RARITY_GROUP')
      .map(({ index }) => index);
    const candidateFilter = api.createRollingRequiredSpecialSourceFilter({
      constraintIndexes: requiredSpecialIndexes,
      isClubTotw: api.isTotwItem,
    });
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model, { candidateFilter });

    expect(candidates.entries.map((entry) => ({ id: entry.item.id, pile: entry.pileName }))).toEqual([
      { id: 72, pile: 'unassigned' },
      { id: 75, pile: 'storage' },
      { id: 70, pile: 'club' },
    ]);
    expect(candidates.policyFiltered).toBe(2);

    const clubFuttiesSnapshot = { ...clubFutties, pile: 'club', special: true };
    const clubTotwSnapshot = { ...clubTotw, pile: 'club', special: true };
    const storageFuttiesSnapshot = { ...storageFutties, pile: 'storage', special: true };
    expect(api.rollingSnapshotRequiredSpecial(clubFuttiesSnapshot, loopDef)).toBe(false);
    expect(api.rollingSnapshotRequiredSpecial(clubTotwSnapshot, loopDef)).toBe(true);
    expect(api.rollingSnapshotRequiredSpecial(storageFuttiesSnapshot, loopDef)).toBe(true);
    expect(api.rollingBaseProtectionReasons(clubFuttiesSnapshot, loopDef)).toContain(
      'rolling-club-non-totw-required-special',
    );
  });

  it('optionally hard-protects every Club non-TOTW special without protecting Storage specials or Club TOTW', async () => {
    const clubOtherSpecial = makePlayer({
      id: 81,
      definitionId: 801,
      rating: 90,
      rareflag: 2,
      name: 'Campaign Club Item',
    });
    const clubTotw = makePlayer({
      id: 82,
      definitionId: 802,
      rating: 88,
      rareflag: 3,
      groups: [45],
      name: 'TOTW Club Item',
    });
    const storageOtherSpecial = makePlayer({
      id: 83,
      definitionId: 803,
      rating: 89,
      rareflag: 2,
      name: 'Campaign Storage Item',
    });
    const { api } = await loadUserscript({
      club: [clubOtherSpecial, clubTotw],
      storage: [storageOtherSpecial],
    });
    const strictLoop = {
      name: 'Strict Club special policy',
      rollingProtectAllClubNonTotwSpecials: true,
    };

    const clubOtherSnapshot = { ...clubOtherSpecial, pile: 'club', special: true };
    const clubTotwSnapshot = { ...clubTotw, pile: 'club', special: true };
    const storageOtherSnapshot = { ...storageOtherSpecial, pile: 'storage', special: true };
    expect(api.rollingBaseProtectionReasons(clubOtherSnapshot, {}))
      .not.toContain('rolling-club-non-totw-special-strict');
    expect(api.rollingBaseProtectionReasons(clubOtherSnapshot, strictLoop))
      .toContain('rolling-club-non-totw-special-strict');
    expect(api.rollingBaseProtectionReasons(clubTotwSnapshot, strictLoop))
      .not.toContain('rolling-club-non-totw-special-strict');
    expect(api.rollingBaseProtectionReasons(storageOtherSnapshot, strictLoop))
      .not.toContain('rolling-club-non-totw-special-strict');
    expect(() => api.assertRollingRecoveryItems(strictLoop, {
      primaryContext: { activeLoopDef: strictLoop },
      coordinator: { getLedger: () => null },
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
    }, [clubOtherSpecial], { allowSpecial: true, allowProvisionsReserve: true }))
      .toThrow(/rolling-club-non-totw-special-strict/);
  });

  it('preserves the Club pile when routing a duplicate of a protected non-TOTW special', async () => {
    const clubSpecial = makePlayer({
      id: 84,
      definitionId: 804,
      rating: 89,
      rareflag: 117,
      name: 'Protected Club Special',
    });
    const unassignedDuplicate = makePlayer({
      id: 85,
      definitionId: 804,
      rating: 89,
      rareflag: 117,
      duplicate: true,
      duplicateId: clubSpecial.id,
      name: 'Protected Club Special',
    });
    const { api } = await loadUserscript({
      club: [clubSpecial],
      unassigned: [unassignedDuplicate],
    });

    expect(api.rollingOpenedDuplicateTargetProtectionReasons(unassignedDuplicate, {
      rollingProtectAllClubNonTotwSpecials: true,
      expectedPlayerCount: 11,
    })).toContain('duplicate-target-rolling-club-non-totw-special-strict');
  });

  it('recognizes when the Required Special condition owns every special slot', async () => {
    const { api } = await loadUserscript();
    const requiredSpecialConstraint = {
      source: 'ea',
      keyName: 'PLAYER_RARITY_GROUP',
      count: 1,
    };

    expect(api.rollingPrimaryReservesAllSpecialSlots({
      maxSpecialCount: 1,
      constraints: [requiredSpecialConstraint],
    })).toBe(true);
    expect(api.rollingPrimaryReservesAllSpecialSlots({
      maxSpecialCount: 2,
      constraints: [requiredSpecialConstraint],
    })).toBe(false);
  });

  it('selects a FUTTIES card through the live EA matcher and preserves pile priority', async () => {
    const clubFutties = makePlayer({
      id: 20,
      definitionId: 200,
      rating: 84,
      rareflag: 2,
      name: 'FUTTIES Club Item',
    });
    const duplicateSignal = makePlayer({
      id: 10,
      definitionId: 200,
      rating: 84,
      rareflag: 2,
      duplicate: true,
      duplicateId: 20,
      name: 'FUTTIES Unassigned Signal',
    });
    const storageFutties = makePlayer({
      id: 30,
      definitionId: 300,
      rating: 84,
      rareflag: 2,
      name: 'FUTTIES Storage Item',
    });
    const { api } = await loadUserscript({
      club: [clubFutties],
      storage: [storageFutties],
      unassigned: [duplicateSignal],
    });
    const loopDef = {
      name: 'Dynamic 85x10',
      expectedPlayerCount: 1,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [84], count: 1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 88 },
      ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
    };
    const challenge = {
      requiredPlayerCount: 1,
      squad: { getNumOfRequiredPlayers: () => 1 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => /FUTTIES/.test(item.name)),
      ],
    };
    const model = api.parseRatingSbcChallenge(loopDef, challenge);
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model);
    const selection = await api.findOptimalRatingSbcSelection(
      candidates.entries,
      model,
      candidates.piles,
      loopDef.ratingSbcFill,
    );

    expect(model.unsupported).toEqual([]);
    expect(model.constraints).toHaveLength(1);
    expect(candidates.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pileName: 'unassigned',
        item: expect.objectContaining({ id: 20, definitionId: 200 }),
        requirementMatches: [true],
      }),
    ]));
    expect(selection).toMatchObject({ ok: true });
    expect(selection.entries[0]).toMatchObject({
      pileName: 'unassigned',
      item: { id: 20, definitionId: 200 },
    });
  });

  it('does not admit an unrelated special card into a dynamic EA group squad', async () => {
    const eligibleFutties = makePlayer({
      id: 40,
      definitionId: 400,
      rating: 84,
      rareflag: 2,
      name: 'Eligible FUTTIES',
    });
    const unrelatedSpecial = makePlayer({
      id: 50,
      definitionId: 500,
      rating: 83,
      rareflag: 2,
      name: 'Unrelated Special',
    });
    const { api } = await loadUserscript({ storage: [unrelatedSpecial, eligibleFutties] });
    const loopDef = {
      name: 'Dynamic group safety',
      expectedPlayerCount: 1,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [84], count: 1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 88 },
      ratingSbcFill: { priorityPiles: ['storage', 'club'] },
    };
    const challenge = {
      requiredPlayerCount: 1,
      squad: { getNumOfRequiredPlayers: () => 1 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => /FUTTIES/.test(item.name)),
      ],
    };
    const model = api.parseRatingSbcChallenge(loopDef, challenge);
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model);

    expect(candidates.entries.map((entry) => entry.item.id)).toEqual([40]);
  });

  it('matches a current DAO group requirement through exact EA item group membership', async () => {
    const eligible = makePlayer({
      id: 51,
      definitionId: 501,
      rating: 84,
      rareflag: 2,
      groups: [83],
      name: 'Current EA group item',
    });
    const unrelated = makePlayer({
      id: 52,
      definitionId: 502,
      rating: 84,
      rareflag: 2,
      groups: [44],
      name: 'Other EA group item',
    });
    const { api } = await loadUserscript({ storage: [eligible, unrelated] });
    const loopDef = {
      name: 'DAO group matcher fallback',
      expectedPlayerCount: 1,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [84], count: 1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 88 },
      ratingSbcFill: { priorityPiles: ['storage'] },
    };
    const challenge = {
      requiredPlayerCount: 1,
      squad: { getNumOfRequiredPlayers: () => 1 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1),
      ],
    };
    const model = api.parseRatingSbcChallenge(loopDef, challenge);
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model);

    expect(model.unsupported).toEqual([]);
    expect(candidates.entries.map((entry) => entry.item.id)).toEqual([51]);
  });

  it('bridges the live matcher into an exact-one role without consuming a Club Other Special', async () => {
    const players = [
      makePlayer({ id: 60, definitionId: 600, rating: 84, rareflag: 2, name: 'FUTTIES A' }),
      makePlayer({ id: 61, definitionId: 601, rating: 84, rareflag: 2, name: 'FUTTIES B' }),
      makePlayer({ id: 62, definitionId: 602, rating: 84, rareflag: 0, name: 'Regular A' }),
      makePlayer({ id: 63, definitionId: 603, rating: 84, rareflag: 0, name: 'Regular B' }),
      makePlayer({ id: 64, definitionId: 604, rating: 84, rareflag: 2, name: 'Other Special' }),
    ];
    const { api } = await loadUserscript({
      storage: players.slice(0, 4),
      club: [players[4]],
    });
    const loopDef = {
      name: 'Role-aware Dynamic 85x10',
      expectedPlayerCount: 3,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [84], count: 1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 88 },
      ratingSbcFill: { priorityPiles: ['storage', 'club'] },
    };
    const challenge = {
      requiredPlayerCount: 3,
      squad: { getNumOfRequiredPlayers: () => 3 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => /FUTTIES/.test(item.name)),
      ],
    };
    const parsedModel = api.parseRatingSbcChallenge(loopDef, challenge);
    const roleAwareModel = parsedModel;
    const exclusiveRoles = [{
      id: 'required-special',
      constraintId: 'challenge-0',
      minCount: 1,
      maxCount: 1,
    }];
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, roleAwareModel, { exclusiveRoles });
    const selection = await api.findOptimalRatingSbcSelection(
      candidates.entries,
      roleAwareModel,
      candidates.piles,
      {
        ...loopDef.ratingSbcFill,
        selectionPolicy: {
          exclusiveRoles,
          maxOrdinaryRating: 95,
          protectionPolicy: {
            reserveRatings: [87, 88, 89],
            softProtectSpecialPiles: ['club'],
            allowOtherSpecialAsOrdinary: true,
          },
        },
      },
    );
    const validation = api.validateRatingSbcModelAgainstItems(
      roleAwareModel,
      selection.selected,
      null,
      { exclusiveRoles, allowOtherSpecialAsOrdinary: true },
    );
    const fallbackSelection = await api.findOptimalRatingSbcSelection(
      candidates.entries.filter((entry) => entry.item.id !== 63),
      roleAwareModel,
      candidates.piles,
      {
        ...loopDef.ratingSbcFill,
        selectionPolicy: {
          exclusiveRoles,
          maxOrdinaryRating: 95,
          protectionPolicy: {
            reserveRatings: [87, 88, 89],
            softProtectSpecialPiles: ['club'],
            allowOtherSpecialAsOrdinary: true,
          },
        },
      },
    );
    const fallbackValidation = api.validateRatingSbcModelAgainstItems(
      roleAwareModel,
      fallbackSelection.selected,
      null,
      { exclusiveRoles, allowOtherSpecialAsOrdinary: true },
    );

    expect(candidates.entries.map((entry) => entry.item.id)).toEqual([60, 61, 62, 63, 64]);
    expect(selection.ok).toBe(true);
    expect(selection.selected.filter((item) => /FUTTIES/.test(item.name))).toHaveLength(1);
    expect(selection.selected.map((item) => item.id)).not.toContain(64);
    expect(validation.ok).toBe(true);
    expect(validation.roleResults[0].matched).toBe(1);
    expect(fallbackSelection.ok).toBe(true);
    expect(fallbackSelection.selected.map((item) => item.id)).toContain(64);
    expect(fallbackSelection.plan.details.policy.usedSoftProtectedFallback).toBe(true);
    expect(fallbackValidation.ok).toBe(true);
  });

  it('propagates the Rolling all-card maximum through the userscript rating planner', async () => {
    const required98 = makePlayer({
      id: 65,
      definitionId: 605,
      rating: 98,
      rareflag: 3,
      groups: [83],
      name: 'Required Special 98',
    });
    const { api } = await loadUserscript({ storage: [required98] });
    const loopDef = {
      name: 'Role-aware Dynamic 85x10 hard cap',
      expectedPlayerCount: 1,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [98], count: 1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 96 },
      ratingSbcFill: { priorityPiles: ['storage'] },
    };
    const challenge = {
      requiredPlayerCount: 1,
      squad: { getNumOfRequiredPlayers: () => 1 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [98]),
        requirement('PLAYER_RARITY_GROUP', [83], 1),
      ],
    };
    const model = api.parseRatingSbcChallenge(loopDef, challenge);
    const exclusiveRoles = [{
      id: 'required-special',
      constraintId: 'challenge-0',
      minCount: 1,
      maxCount: 1,
    }];
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model, { exclusiveRoles });
    const selection = await api.findOptimalRatingSbcSelection(
      candidates.entries,
      model,
      candidates.piles,
      {
        selectionPolicy: {
          exclusiveRoles,
          maxPlayerRating: 96,
          maxOrdinaryRating: 96,
          protectionPolicy: { allowOtherSpecialAsOrdinary: true },
        },
      },
    );

    expect(candidates.entries.map((entry) => entry.item.id)).toEqual([65]);
    expect(selection).toMatchObject({
      ok: false,
      reasonCode: 'REQUIRED_SPECIAL_SHORTAGE',
      details: {
        policy: {
          counts: { overMaxPlayerRating: 1, eligible: 0 },
        },
      },
    });
  });
});
