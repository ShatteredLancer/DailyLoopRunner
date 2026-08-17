import { describe, expect, it } from 'vitest';
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
  it('keeps Club non-TOTW event cards out of the Rolling Required Special pool', async () => {
    const clubTotw = makePlayer({
      id: 70,
      definitionId: 700,
      rating: 88,
      rareflag: 2,
      groups: [83],
      name: 'TOTW Club Item',
    });
    const clubFutties = makePlayer({
      id: 71,
      definitionId: 701,
      rating: 95,
      rareflag: 2,
      groups: [83],
      name: 'FUTTIES Club Item',
    });
    const storageTots = makePlayer({
      id: 72,
      definitionId: 702,
      rating: 93,
      rareflag: 2,
      groups: [83],
      name: 'TOTS Storage Item',
    });
    const unassignedTotsSignal = makePlayer({
      id: 74,
      definitionId: 702,
      rating: 93,
      rareflag: 2,
      groups: [83],
      duplicate: true,
      duplicateId: 72,
      name: 'TOTS Unassigned Signal',
    });
    const storageFutties = makePlayer({
      id: 75,
      definitionId: 705,
      rating: 94,
      rareflag: 2,
      groups: [83],
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
      isClubTotw: (candidate) => /TOTW/.test(candidate.name),
    });
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model, { candidateFilter });

    expect(candidates.entries.map((entry) => ({ id: entry.item.id, pile: entry.pileName }))).toEqual([
      { id: 72, pile: 'unassigned' },
      { id: 75, pile: 'storage' },
      { id: 73, pile: 'transfer' },
      { id: 70, pile: 'club' },
    ]);
    expect(candidates.policyFiltered).toBe(1);

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
});
