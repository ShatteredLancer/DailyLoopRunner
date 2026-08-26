import { describe, expect, it } from 'vitest';
import { parseRollingStorageSinkSnapshot } from '../../src/config/rolling-upgrade.js';
import { materializeDynamicUpgradeChallengeLoopDef } from '../../src/config/upgrade-discovery.js';
import { createInventorySnapshot } from '../../src/domain/contracts.js';
import { storageSinkRequiredSpecialRoles } from '../../src/selection/multi-squad-rating.js';
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
  it('carries an expanded group-83 contract through automatic Storage Sink discovery and planning', async () => {
    const specials = Array.from({ length: 11 }, (_, index) => makePlayer({
      id: 12000 + index,
      definitionId: 22000 + index,
      rating: 89,
      rareflag: 120 + index,
      groups: [19, 83],
      name: `Discovered Sink Special ${index + 1}`,
    }));
    const discovered = parseRollingStorageSinkSnapshot({
      set: {
        id: 4000,
        name: 'Rafael Leao',
        rewards: [{ type: 'PLAYER', resourceId: 5000, name: 'Rafael Leao' }],
        challenges: [{
          id: 4006,
          requiredPlayerCount: 11,
          eligibilityRequirements: [
            { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
            { key: 'TEAM_RATING', values: [89], count: -1 },
          ],
        }],
      },
    });
    expect(discovered.status).toBe('supported');
    const liveChallenge = {
      id: 4006,
      requiredPlayerCount: 11,
      squad: { getNumOfRequiredPlayers: () => 11 },
      eligibilityRequirements: [
        requirement('PLAYER_RARITY_GROUP', [83], 1),
        requirement('TEAM_RATING', [89]),
      ],
    };
    const activeLoopDef = {
      ...materializeDynamicUpgradeChallengeLoopDef(discovered.capability.loop, liveChallenge),
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 97 },
      ratingSbcFill: { priorityPiles: ['storage'], targetRating: 89 },
    };
    const { api } = await loadUserscript({ storage: specials });
    const model = api.resolveRatingSbcChallenge(activeLoopDef, liveChallenge);
    const exclusiveRoles = storageSinkRequiredSpecialRoles(model);
    const candidates = api.buildRatingSbcCandidateEntries(activeLoopDef, model, { exclusiveRoles });
    const selection = await api.findOptimalRatingSbcSelection(
      candidates.entries,
      model,
      candidates.piles,
      {
        selectionPolicy: {
          exclusiveRoles,
          maxPlayerRating: 97,
          maxOrdinaryRating: 97,
          protectionPolicy: { allowOtherSpecialAsOrdinary: true },
        },
      },
    );

    expect(activeLoopDef).toMatchObject({
      requiredSpecialCount: 1,
      allowedSpecialCount: 11,
      requiredSpecialAllowanceMode: 'all-matching-specials',
    });
    expect(model).toMatchObject({
      requiredSpecialAllowanceMode: 'all-matching-specials',
      maxSpecialCount: 11,
    });
    expect(exclusiveRoles).toEqual([
      expect.objectContaining({ minCount: 1, maxCount: 11 }),
    ]);
    expect(selection).toMatchObject({ ok: true });
    expect(selection.selected).toHaveLength(11);
    expect(selection.selected.every((item) => item.groups.includes(83))).toBe(true);
  });

  it('keeps an automatically discovered group-83 Storage Sink fail-closed without live matching material', async () => {
    const discovered = parseRollingStorageSinkSnapshot({
      set: {
        id: 4010,
        name: 'Fail-closed Player SBC',
        rewards: [{ type: 'PLAYER', resourceId: 5010, name: 'Player Reward' }],
        challenges: [{
          id: 4016,
          requiredPlayerCount: 11,
          eligibilityRequirements: [
            { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
            { key: 'TEAM_RATING', values: [89], count: -1 },
          ],
        }],
      },
    });
    const liveChallenge = {
      id: 4016,
      requiredPlayerCount: 11,
      squad: { getNumOfRequiredPlayers: () => 11 },
      eligibilityRequirements: [
        requirement('PLAYER_RARITY_GROUP', [83], 1),
        requirement('TEAM_RATING', [89]),
      ],
    };
    const activeLoopDef = {
      ...materializeDynamicUpgradeChallengeLoopDef(discovered.capability.loop, liveChallenge),
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 97 },
    };
    const ordinaryGolds = Array.from({ length: 11 }, (_, index) => makePlayer({
      id: 13000 + index,
      rating: 89,
      rareflag: 1,
      groups: [4],
    }));
    const { api } = await loadUserscript({ storage: ordinaryGolds });
    const model = api.resolveRatingSbcChallenge(activeLoopDef, liveChallenge);

    expect(activeLoopDef).toMatchObject({
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      requiredSpecialAllowanceMode: 'required-only',
    });
    expect(model).toMatchObject({
      requiredSpecialAllowanceMode: 'required-only',
      maxSpecialCount: 1,
    });
    expect(storageSinkRequiredSpecialRoles(model)).toEqual([
      expect.objectContaining({ minCount: 1, maxCount: 1 }),
    ]);
  });

  it('uses the Rolling protection rating for Storage Pressure candidates', async () => {
    const { api } = await loadUserscript();
    const active = api.rollingStorageSinkLoopDefForPiles({
      activeLoopDef: {
        sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 88 },
        runtimeSbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 88 },
        ratingSbcFill: { priorityPiles: ['club'] },
      },
    }, ['storage'], {
      runtimePickOptions: { protectionRating: 97 },
    });

    expect(active).toMatchObject({
      priorityPiles: ['storage'],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 97 },
      runtimeSbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 97 },
      ratingSbcFill: { priorityPiles: ['storage'] },
    });
  });

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

  it('widens the safe quantity when live group 83 contains a special outside the legacy categories', async () => {
    const outsideLegacy = makePlayer({
      id: 9001,
      definitionId: 19001,
      rating: 88,
      rareflag: 150,
      groups: [19, 83],
      name: 'Outside legacy category',
    });
    const { api } = await loadUserscript({ storage: [outsideLegacy] });
    const loopDef = {
      name: 'Live matcher expanded 85x10',
      expectedPlayerCount: 11,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 95 },
      ratingSbcFill: { priorityPiles: ['storage'] },
    };
    const model = api.parseRatingSbcChallenge(loopDef, {
      id: 9999,
      requiredPlayerCount: 11,
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1),
      ],
    });

    expect(api.isTotwItem(outsideLegacy)).toBe(false);
    expect(api.isTotsItem(outsideLegacy)).toBe(false);
    expect(api.isFofItem(outsideLegacy)).toBe(false);
    expect(api.isFuttiesItem(outsideLegacy)).toBe(false);
    expect(model).toMatchObject({
      requiredSpecialAllowanceMode: 'all-matching-specials',
      requiredSpecialAllowanceDecisionSource: 'live-matcher',
      maxSpecialCount: 11,
    });
    expect(model.constraints[0].requiredSpecialAllowanceEvidence)
      .toMatchObject({
        acceptedOutsideLegacyCategoryCount: 1,
        expandedGroup83MembershipCount: 1,
        matcherExpansionProof: 'live-group-83-expanded-contract',
      });
    expect(model.constraints[0].matches(outsideLegacy)).toBe(true);
    expect(model.constraints[0].matches(makePlayer({ rareflag: 150, groups: [19] }))).toBe(false);
    const expandedSnapshotLoop = {
      ...loopDef,
      requiredSpecialAllowanceMode: 'all-matching-specials',
    };
    expect(api.rollingSnapshotRequiredSpecial({
      ...outsideLegacy,
      pile: 'storage',
      special: true,
    }, expandedSnapshotLoop)).toBe(true);
    expect(api.rollingSnapshotRequiredSpecial({
      ...outsideLegacy,
      id: 9007,
      definitionId: 19007,
      groups: [19],
      pile: 'storage',
      special: true,
    }, expandedSnapshotLoop)).toBe(false);
  });

  it('keeps the one-card rule when no live group-83 candidate is available', async () => {
    const legacyTotw = makePlayer({
      id: 9005,
      definitionId: 19005,
      rating: 88,
      rareflag: 3,
      groups: [44],
      name: 'TOTW outside current group 83',
    });
    const { api } = await loadUserscript({ storage: [legacyTotw] });
    const loopDef = {
      name: 'Native matcher expanded contract',
      expectedPlayerCount: 11,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 95 },
      ratingSbcFill: { priorityPiles: ['storage'] },
    };
    const model = api.parseRatingSbcChallenge(loopDef, {
      id: 9999,
      requiredPlayerCount: 11,
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1),
      ],
    });

    expect(model).toMatchObject({
      requiredSpecialAllowanceMode: 'required-only',
      requiredSpecialAllowanceDecisionSource: 'fail-closed',
      maxSpecialCount: 1,
    });
    expect(model.constraints[0].requiredSpecialAllowanceEvidence)
      .toMatchObject({
        acceptedOutsideLegacyCategoryCount: 0,
        expandedGroup83MembershipCount: 0,
        matcherExpansionProof: null,
      });
    expect(model.constraints[0].matches(legacyTotw)).toBe(false);
    expect(model.constraints[0].matches(makePlayer({ rareflag: 150, groups: [19] }))).toBe(false);
  });

  it('expands live group 83 through item membership when the DAO requirement method is unavailable', async () => {
    const arbitrarySpecial = makePlayer({
      id: 9002,
      definitionId: 19002,
      rating: 88,
      rareflag: 150,
      groups: [19],
      name: 'Arbitrary Special',
    });
    const legacyGroup83Special = makePlayer({
      id: 9006,
      definitionId: 19006,
      rating: 88,
      rareflag: 3,
      groups: [83],
      name: 'Legacy group 83 TOTW',
    });
    const { api } = await loadUserscript({ storage: [arbitrarySpecial, legacyGroup83Special] });
    const loopDef = {
      name: 'Confirmed current 85x10',
      sbcSetIds: [1356],
      dynamicActiveChallengeId: 3874,
      expectedPlayerCount: 11,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 95 },
      ratingSbcFill: { priorityPiles: ['storage'] },
    };
    const model = api.parseRatingSbcChallenge(loopDef, {
      id: 3874,
      requiredPlayerCount: 11,
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1),
      ],
    });

    expect(model).toMatchObject({
      requiredSpecialAllowanceMode: 'all-matching-specials',
      requiredSpecialAllowanceDecisionSource: 'live-matcher',
      maxSpecialCount: 11,
    });
    expect(model.constraints[0].matcherSource).toBe('runtime-item-groups');
    expect(model.constraints[0].matches(arbitrarySpecial)).toBe(false);
    expect(model.constraints[0].matches(legacyGroup83Special)).toBe(true);
    expect(model.constraints[0].matches(makePlayer({ rareflag: 1 }))).toBe(false);
  });

  it('hard-protects evolved and cosmetic specials only after the any-special contract expands', async () => {
    const evolved = makePlayer({ id: 9003, rating: 88, rareflag: 150 });
    evolved.upgrades = { evolutionId: 42 };
    const cosmetic = makePlayer({ id: 9004, rating: 88, rareflag: 151 });
    cosmetic.cosmetics = [{ id: 7 }];
    const { api } = await loadUserscript();
    const expanded = { requiredSpecialAllowanceMode: 'all-matching-specials' };

    expect(api.rollingBaseProtectionReasons(evolved, expanded))
      .toContain('rolling-any-special-evolution');
    expect(api.rollingBaseProtectionReasons(cosmetic, expanded))
      .toContain('rolling-any-special-cosmetics');
    expect(api.rollingBaseProtectionReasons(evolved, {}))
      .not.toContain('rolling-any-special-evolution');
    expect(api.rollingBaseProtectionReasons(cosmetic, {}))
      .not.toContain('rolling-any-special-cosmetics');
  });

  it('keeps an expanded group-83 duplicate out of the primary squad when its real card is a Club non-TOTW special', async () => {
    const clubTarget = makePlayer({
      id: 931034238050,
      definitionId: 84141734,
      rating: 96,
      rareflag: 151,
      groups: [6, 19, 33, 83],
      name: 'Kalulu',
    });
    const unassignedDuplicate = makePlayer({
      id: 931645793385,
      definitionId: 84141734,
      rating: 96,
      rareflag: 151,
      groups: [6, 19, 33, 83],
      duplicate: true,
      duplicateId: clubTarget.id,
      name: 'Kalulu',
    });
    clubTarget.pile = 7;
    unassignedDuplicate.pile = 6;
    const { api } = await loadUserscript({
      club: [clubTarget],
      unassigned: [unassignedDuplicate],
    });
    const expandedLoop = {
      expectedPlayerCount: 11,
      requiredSpecialAllowanceMode: 'all-matching-specials',
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [84], count: 11 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
    };
    expect(api.rollingBaseProtectionReasons(clubTarget, expandedLoop, 'club')).toContain(
      'rolling-club-non-totw-required-special',
    );
    expect(api.rollingOpenedDuplicateTargetProtectionReasons(
      unassignedDuplicate,
      expandedLoop,
    )).toContain('duplicate-target-rolling-club-non-totw-required-special');
  });

  it('selects only one Required Special for a non-83 player group', async () => {
    const players = [
      makePlayer({ id: 9010, definitionId: 19010, rating: 84, rareflag: 3, groups: [44] }),
      makePlayer({ id: 9011, definitionId: 19011, rating: 84, rareflag: 151, groups: [22] }),
      makePlayer({ id: 9012, definitionId: 19012, rating: 84, rareflag: 1, groups: [4] }),
      makePlayer({ id: 9013, definitionId: 19013, rating: 84, rareflag: 1, groups: [4] }),
    ];
    const { api } = await loadUserscript({ storage: players });
    const loopDef = {
      name: 'Confirmed current 85x10 selection',
      sbcSetIds: [1356],
      dynamicActiveChallengeId: 3874,
      expectedPlayerCount: 3,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'PLAYER_RARITY_GROUP', values: [44], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 84 },
      ratingSbcFill: { priorityPiles: ['storage'] },
    };
    const model = api.parseRatingSbcChallenge(loopDef, {
      id: 3874,
      requiredPlayerCount: 3,
      squad: { getNumOfRequiredPlayers: () => 3 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [44], 1),
      ],
    });
    const exclusiveRoles = [{
      id: 'required-special',
      constraintIndex: 0,
      minCount: 1,
      maxCount: 1,
    }];
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model, { exclusiveRoles });
    const selection = await api.findOptimalRatingSbcSelection(
      candidates.entries,
      model,
      candidates.piles,
      { selectionPolicy: { exclusiveRoles, maxPlayerRating: 84, maxOrdinaryRating: 84 } },
    );

    expect(selection).toMatchObject({ ok: true });
    expect(selection.selected.filter((item) => api.isSbcSpecialItem(item))).toHaveLength(1);
    expect(api.validateRatingSbcModelAgainstItems(model, selection.selected, null, {
      exclusiveRoles,
      allowOtherSpecialAsOrdinary: false,
    }).ok).toBe(true);
  });

  it('selects multiple matcher-approved specials when EA proves group 83 expansion', async () => {
    const specials = [1, 2, 3].map((id) => makePlayer({
      id: 9020 + id,
      definitionId: 19020 + id,
      rating: 84,
      rareflag: 150 + id,
      groups: [19, 83],
      name: `Expanded Special ${id}`,
    }));
    const { api } = await loadUserscript({ storage: specials });
    const loopDef = {
      name: 'Expanded 85x10 selection',
      expectedPlayerCount: 3,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicActiveEligibilityRequirements: [
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 84 },
      ratingSbcFill: { priorityPiles: ['storage'] },
    };
    const challenge = {
      requiredPlayerCount: 3,
      squad: { getNumOfRequiredPlayers: () => 3 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => (
          specials.some((candidate) => candidate.id === item.id)
        )),
      ],
    };
    const model = api.parseRatingSbcChallenge(loopDef, challenge);
    const exclusiveRoles = model.constraints
      .map((constraint, constraintIndex) => ({ constraint, constraintIndex }))
      .filter(({ constraint }) => constraint.requiredSpecialRole === true)
      .map(({ constraint, constraintIndex }) => ({
        id: 'required-special',
        constraintIndex,
        minCount: constraint.count,
        maxCount: model.requiredPlayerCount,
      }));
    const candidates = api.buildRatingSbcCandidateEntries(loopDef, model, { exclusiveRoles });
    const selection = await api.findOptimalRatingSbcSelection(
      candidates.entries,
      model,
      candidates.piles,
      {
        selectionPolicy: {
          exclusiveRoles,
          maxPlayerRating: 84,
          maxOrdinaryRating: 84,
          protectionPolicy: { allowOtherSpecialAsOrdinary: true },
        },
      },
    );

    expect(model).toMatchObject({
      requiredSpecialAllowanceMode: 'all-matching-specials',
      maxSpecialCount: 3,
    });
    expect(selection).toMatchObject({ ok: true });
    expect(selection.selected.map((item) => item.id).sort()).toEqual(specials.map((item) => item.id).sort());
    expect(selection.selected.filter((item) => api.isSbcSpecialItem(item))).toHaveLength(3);
    expect(api.validateRatingSbcModelAgainstItems(model, selection.selected, null, {
      exclusiveRoles,
      allowOtherSpecialAsOrdinary: true,
    }).ok).toBe(true);
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
        isClubTotw: api.isTotwItem,
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

  it('allows multiple exact matcher-approved Storage specials in a generic Storage Sink', async () => {
    const approved = [1, 2].map((id) => makePlayer({
      id: 9100 + id,
      definitionId: 19100 + id,
      rating: 84,
      rareflag: 120 + id,
      groups: [19, 83],
      name: `Approved Storage Special ${id}`,
    }));
    const unrelatedSpecial = makePlayer({
      id: 9103,
      definitionId: 19103,
      rating: 84,
      rareflag: 140,
      groups: [19],
      name: 'Unrelated Storage Special',
    });
    const ordinary = makePlayer({
      id: 9104,
      definitionId: 19104,
      rating: 84,
      rareflag: 0,
      groups: [4],
      name: 'Storage Gold',
    });
    const { api } = await loadUserscript({ storage: [...approved, unrelatedSpecial, ordinary] });
    const primaryLoopDef = {
      name: 'Expanded primary context',
      expectedPlayerCount: 3,
      requiredSpecialCount: 1,
      allowedSpecialCount: 3,
      dynamicActiveEligibilityRequirements: [
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 84 },
      ratingSbcFill: { priorityPiles: ['storage'] },
      requiredSpecialAllowanceMode: 'all-matching-specials',
    };
    const primaryModel = api.parseRatingSbcChallenge(primaryLoopDef, {
      requiredPlayerCount: 3,
      squad: { getNumOfRequiredPlayers: () => 3 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => (
          approved.some((candidate) => candidate.id === item.id)
        )),
      ],
    });
    const sinkLoopDef = {
      name: 'Generic Storage Sink',
      runtimeProtectionRating: 95,
      expectedPlayerCount: 3,
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 95 },
      ratingSbcFill: { priorityPiles: ['storage'] },
    };
    const sinkModel = api.parseRatingSbcChallenge(sinkLoopDef, {
      requiredPlayerCount: 3,
      squad: { getNumOfRequiredPlayers: () => 3 },
      eligibilityRequirements: [requirement('TEAM_RATING', [84])],
    });
    const snapshot = createInventorySnapshot({
      piles: { storage: [...approved, unrelatedSpecial, ordinary] },
    });
    const entries = snapshot.piles.storage.map((item) => ({
      item,
      pile: 'storage',
      classification: {
        requiredSpecial: approved.some((candidate) => candidate.id === item.id),
        otherSpecial: item.special === true && !approved.some((candidate) => candidate.id === item.id),
        protected: false,
      },
    }));
    const runtime = {
      primaryContext: { model: primaryModel, activeLoopDef: primaryLoopDef },
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      openRouting: null,
      coordinator: { getLedger: () => ({ classifiedEntries: () => entries }) },
    };
    const policy = api.rollingStorageSinkSelectionPolicy(sinkLoopDef, runtime, {
      model: sinkModel,
    });
    const candidates = api.buildRatingSbcCandidateEntries(
      sinkLoopDef,
      sinkModel,
      policy,
      snapshot,
    );
    const selection = await api.findOptimalRatingSbcSelection(
      candidates.entries,
      sinkModel,
      candidates.piles,
      { selectionPolicy: policy },
    );

    expect(api.rollingStoragePressureRequiredSpecialEntries(runtime, sinkLoopDef)
      .map(({ item }) => item.id).sort()).toEqual(approved.map((item) => item.id).sort());
    expect(candidates.entries.map((entry) => entry.item.id).sort()).toEqual(
      [...approved, ordinary].map((item) => item.id).sort(),
    );
    expect(selection).toMatchObject({ ok: true });
    expect(selection.selected.map((item) => item.id).sort()).toEqual(
      [...approved, ordinary].map((item) => item.id).sort(),
    );
  });

  it('authorizes multiple exact Storage specials for Provisions and rejects an unapproved special', async () => {
    const approved = [1, 2].map((id) => makePlayer({
      id: 9200 + id,
      definitionId: 19200 + id,
      rating: id === 1 ? 88 : 90,
      rareflag: 120 + id,
      groups: [19, 83],
      name: `Provision Special ${id}`,
    }));
    const unrelated = makePlayer({
      id: 9203,
      definitionId: 19203,
      rating: 88,
      rareflag: 140,
      groups: [19],
      name: 'Unapproved Provision Special',
    });
    const cosmetic = makePlayer({
      id: 9204,
      definitionId: 19204,
      rating: 88,
      rareflag: 150,
      groups: [19, 83],
      cosmetics: [{ id: 7 }],
      name: 'Cosmetic Provision Special',
    });
    const evolved = makePlayer({
      id: 9205,
      definitionId: 19205,
      rating: 88,
      rareflag: 151,
      groups: [19, 83],
      upgrades: { evolutionId: 42 },
      name: 'Evolved Provision Special',
    });
    const overProtection = makePlayer({
      id: 9206,
      definitionId: 19206,
      rating: 96,
      rareflag: 152,
      groups: [19, 83],
      name: 'Over-protection Provision Special',
    });
    const ordinary89 = makePlayer({
      id: 9207,
      definitionId: 19207,
      rating: 89,
      rareflag: 0,
      groups: [4],
      name: 'Ordinary Gold 89',
    });
    const { api } = await loadUserscript({
      storage: [...approved, unrelated, cosmetic, evolved, overProtection, ordinary89],
    });
    const primaryLoopDef = {
      name: 'Expanded primary context',
      expectedPlayerCount: 3,
      requiredSpecialCount: 1,
      allowedSpecialCount: 3,
      requiredSpecialAllowanceMode: 'all-matching-specials',
      dynamicActiveEligibilityRequirements: [
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
    };
    const primaryModel = api.parseRatingSbcChallenge(primaryLoopDef, {
      requiredPlayerCount: 3,
      squad: { getNumOfRequiredPlayers: () => 3 },
      eligibilityRequirements: [
        requirement('TEAM_RATING', [84]),
        requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => (
          approved.some((candidate) => candidate.id === item.id)
        )),
      ],
    });
    const loopDef = { name: 'Storage Pressure', runtimeProtectionRating: 95 };
    const snapshot = createInventorySnapshot({
      piles: { storage: [...approved, unrelated, cosmetic, evolved, overProtection, ordinary89] },
    });
    const entries = snapshot.piles.storage.map((item) => ({
      item,
      pile: 'storage',
      classification: { requiredSpecial: true, protected: false },
    }));
    const runtime = {
      primaryContext: { model: primaryModel, activeLoopDef: primaryLoopDef },
      coordinator: { getLedger: () => ({ classifiedEntries: () => entries }) },
    };
    const reserveEntries = api.rollingStoragePressureProvisionsReserveEntries(runtime, loopDef);
    const allowedRefs = reserveEntries.map(({ item }) => ({
      id: item.id,
      definitionId: item.definitionId,
      pile: 'storage',
    }));

    expect(reserveEntries.map(({ item }) => item.id).sort()).toEqual(approved.map((item) => item.id).sort());
    const provisionsSelection = api.selectInventoryPlayers({
      name: 'Emergency Provisions selection',
      requirements: [{
        tier: 'gold',
        count: 4,
        minRating: 87,
        maxRating: 95,
        playerOnly: true,
        allowSpecial: true,
      }],
      priorityPiles: ['storage'],
      protectedItemIds: [
        unrelated.id,
        cosmetic.id,
        evolved.id,
        overProtection.id,
        ordinary89.id,
      ],
      runtimeSbcFodderPolicy: {
        mode: 'rating-constrained',
        ratingSbcMaxCardRating: 95,
      },
    }, ['storage']);
    expect(provisionsSelection).toMatchObject({ ok: false });
    expect(provisionsSelection.selected || []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ordinary89.id }),
    ]));
    expect(() => api.assertRollingRecoveryItems(
      loopDef,
      runtime,
      approved,
      {
        allowSpecial: true,
        allowProvisionsReserve: true,
        allowedRequiredSpecialItems: allowedRefs,
        minRating: 87,
        maxRating: 95,
      },
    )).not.toThrow();
    expect(() => api.assertRollingRecoveryItems(
      loopDef,
      runtime,
      [unrelated],
      {
        allowSpecial: true,
        allowProvisionsReserve: true,
        allowedRequiredSpecialItems: allowedRefs,
        minRating: 87,
        maxRating: 95,
      },
    )).toThrow(/Required Special|protected card/);
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

  it('uses extra safe Club normal-gold boosters only when Storage-pressure expansion is enabled', async () => {
    const storage = Array.from({ length: 3 }, (_, index) => makePlayer({
      id: 1200 + index,
      definitionId: 2200 + index,
      rating: 78,
      pile: 'storage',
      name: `Low Storage ${index + 1}`,
    }));
    const club = Array.from({ length: 8 }, (_, index) => makePlayer({
      id: 1300 + index,
      definitionId: 2300 + index,
      rating: 90,
      pile: 'club',
      name: `Normal Club booster ${index + 1}`,
    }));
    const baseLoopDef = {
      name: 'Generic 89 Storage Sink',
      expectedPlayerCount: 11,
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [89], count: 1 },
      ],
      runtimePickOptions: { protectionRating: 96, rollingProvisionsMaxRating: 91 },
      runtimeProvisionsMaxRating: 91,
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 96 },
      ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
    };
    const { api } = await loadUserscript({ storage, club });
    const sinkModel = api.parseRatingSbcChallenge(baseLoopDef, {
      requiredPlayerCount: 11,
      squad: { getNumOfRequiredPlayers: () => 11 },
      eligibilityRequirements: [requirement('TEAM_RATING', [89])],
    });
    const snapshot = createInventorySnapshot({ piles: { storage, club } });
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      coordinator: { getLedger: () => null },
    };

    const disabled = await api.selectRollingGenericStorageSinkSquad(
      baseLoopDef,
      runtime,
      { targetRating: 89, model: sinkModel, activeLoopDef: baseLoopDef },
      snapshot,
      { minimumPressureConsumption: 3 },
    );
    expect(disabled).toMatchObject({
      ok: false,
      reasonCode: 'RECOVERY_STORAGE_PRESSURE_INFEASIBLE',
    });

    const enabled = await api.selectRollingGenericStorageSinkSquad(
      { ...baseLoopDef, rollingStoragePressureClubBoostersEnabled: true },
      runtime,
      { targetRating: 89, model: sinkModel, activeLoopDef: baseLoopDef },
      snapshot,
      { minimumPressureConsumption: 3 },
    );
    expect(enabled).toMatchObject({
      ok: true,
      rating: 89,
      storagePressureConsumed: 3,
      pileCounts: { storage: 3, club: 8 },
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
      groups: [83],
      name: 'FUTTIES Club Item',
    });
    const duplicateSignal = makePlayer({
      id: 10,
      definitionId: 200,
      rating: 84,
      rareflag: 2,
      groups: [83],
      duplicate: true,
      duplicateId: 20,
      name: 'FUTTIES Unassigned Signal',
    });
    const storageFutties = makePlayer({
      id: 30,
      definitionId: 300,
      rating: 84,
      rareflag: 2,
      groups: [83],
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
      groups: [83],
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
      makePlayer({ id: 60, definitionId: 600, rating: 84, rareflag: 2, groups: [83], name: 'FUTTIES A' }),
      makePlayer({ id: 61, definitionId: 601, rating: 84, rareflag: 2, groups: [83], name: 'FUTTIES B' }),
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
