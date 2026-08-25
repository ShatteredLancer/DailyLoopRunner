import { describe, expect, it } from 'vitest';
import { parseRatingSbcChallenge, validateRatingSbcModelAgainstItems } from '../../src/selection/rating-model.js';

function requirement(key, value, count = -1, meetsRequirements = null) {
  return {
    count,
    getFirstKey: () => key,
    getValue: () => value,
    ...(meetsRequirements ? { meetsRequirements } : {}),
  };
}

describe('rating SBC model parsing and validation', () => {
  it('parses target rating, dynamic player constraints, unsupported chemistry, and configured special rules', () => {
    const model = parseRatingSbcChallenge({
      loopDef: {
        requiredSpecialCount: 1,
        requiredSpecialMinRating: 84,
        allowedSpecialCount: 1,
      },
      challenge: {
        eligibilityRequirements: [
          requirement('TEAM_RATING', [84]),
          requirement('PLAYER_RARITY', [1], 4),
          requirement('CHEMISTRY_POINTS', [20]),
        ],
      },
      requiredPlayerCount: 11,
      eligibilityKeyName: (key) => key,
      isRequiredSpecialItem: (item) => item.totw === true,
      requiredSpecialLabel: () => 'TOTW/TOTS/FOF',
    });

    expect(model.targetRating).toBe(84);
    expect(model.requiredPlayerCount).toBe(11);
    expect(model.maxSpecialCount).toBe(1);
    expect(model.unsupported).toEqual(['CHEMISTRY_POINTS']);
    expect(model.constraints.map((constraint) => constraint.label)).toEqual([
      'PLAYER_RARITY 1 x4',
      'TOTW/TOTS/FOF rating >= 84 x1',
    ]);
    expect(model.constraints[0].matches({ rareflag: 1 })).toBe(true);
    expect(model.constraints[1].matches({ totw: true, rating: 84 })).toBe(true);
  });

  it('prefers an EA requirement matcher when it returns an explicit boolean', () => {
    const model = parseRatingSbcChallenge({
      loopDef: { blockSpecial: false },
      challenge: { eligibilityRequirements: [requirement('PLAYER_MIN_OVR', [90], 1, (item) => item.accepted)] },
      requiredPlayerCount: 5,
      eligibilityKeyName: (key) => key,
    });
    expect(model.maxSpecialCount).toBe(5);
    expect(model.constraints[0].matches({ rating: 50, accepted: true })).toBe(true);
    expect(model.constraints[0].matches({ rating: 99, accepted: false })).toBe(false);
  });

  it('uses the live EA matcher as the only authority for a dynamic player rarity group', () => {
    const playerGroup = requirement('PLAYER_RARITY_GROUP', [83], 1, (item) => item.eaGroup83 === true);
    const model = parseRatingSbcChallenge({
      loopDef: {
        dynamicActiveEligibilityRequirements: [{ key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 }],
        requiredSpecialCount: 1,
        allowedSpecialCount: 1,
      },
      challenge: {
        eligibilityRequirements: [
          requirement('TEAM_RATING', [84]),
          playerGroup,
        ],
      },
      requiredPlayerCount: 11,
      eligibilityKeyName: (key) => key,
      isRequiredSpecialItem: () => false,
      requiredSpecialLabel: () => 'legacy hardcoded special',
    });

    expect(model.unsupported).toEqual([]);
    expect(model.maxSpecialCount).toBe(1);
    expect(model.constraints).toHaveLength(1);
    expect(model.constraints[0]).toMatchObject({
      keyName: 'PLAYER_RARITY_GROUP',
      values: [83],
      count: 1,
      source: 'ea',
    });
    expect(model.constraints[0].matches({ name: 'FUTTIES', eaGroup83: true })).toBe(true);
    expect(model.constraints[0].matches({ name: 'Unrelated special', groups: [83] })).toBe(false);
  });

  it('widens a Required Special role only when live allowance detection proves the new contract', () => {
    const model = parseRatingSbcChallenge({
      loopDef: {
        dynamicActiveEligibilityRequirements: [
          { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
        ],
        requiredSpecialCount: 1,
        allowedSpecialCount: 1,
      },
      challenge: {
        eligibilityRequirements: [
          requirement('TEAM_RATING', [84]),
          requirement('PLAYER_RARITY_GROUP', [83], 1),
        ],
      },
      requiredPlayerCount: 11,
      eligibilityKeyName: (key) => key,
      matchesPlayerRarityGroup: (item) => item.groups?.includes(83) === true,
      detectRequiredSpecialAllowanceMode: () => ({
        mode: 'all-matching-specials',
        source: 'live-matcher',
        matcherSource: 'ea-requirement',
        evidence: { acceptedOutsideLegacyCategoryCount: 1 },
      }),
    });

    expect(model).toMatchObject({
      requiredSpecialAllowanceMode: 'all-matching-specials',
      requiredSpecialAllowanceDecisionSource: 'live-matcher',
      maxSpecialCount: 11,
      requiredSpecialAllowanceEvidence: [{ acceptedOutsideLegacyCategoryCount: 1 }],
    });
  });

  it('uses the runtime EA item-group matcher when DAO requirements lack a method', () => {
    const model = parseRatingSbcChallenge({
      loopDef: {
        dynamicActiveEligibilityRequirements: [{ key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 }],
        requiredSpecialCount: 1,
        allowedSpecialCount: 1,
      },
      challenge: {
        eligibilityRequirements: [
          requirement('TEAM_RATING', [84]),
          requirement('PLAYER_RARITY_GROUP', [83], 1),
        ],
      },
      requiredPlayerCount: 11,
      eligibilityKeyName: (key) => key,
      itemGroupNumbers: (item) => item.groups || [],
    });

    expect(model.unsupported).toEqual([]);
    expect(model.constraints[0].matcherSource).toBe('runtime-item-groups');
    expect(model.constraints[0].matches({ groups: [83] })).toBe(true);
    expect(model.constraints[0].matches({ groups: [44] })).toBe(false);
    expect(model.constraints[0].matches({ groups: [] })).toBe(false);
  });

  it('fails closed when a dynamic player rarity group has no live EA matcher', () => {
    const model = parseRatingSbcChallenge({
      loopDef: {
        dynamicActiveEligibilityRequirements: [{ key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 }],
        requiredSpecialCount: 1,
        allowedSpecialCount: 1,
      },
      challenge: {
        eligibilityRequirements: [
          requirement('TEAM_RATING', [84]),
          requirement('PLAYER_RARITY_GROUP', [83], 1),
        ],
      },
      requiredPlayerCount: 11,
      eligibilityKeyName: (key) => key,
    });

    expect(model.constraints).toEqual([]);
    expect(model.unsupported).toEqual(['PLAYER_RARITY_GROUP(live EA matcher unavailable)']);
    expect(model.maxSpecialCount).toBe(0);
  });

  it('validates rating, unique definitions, constraints, special count, and EA challenge readiness', () => {
    const players = [
      { id: 1, definitionId: 10, rating: 84, special: true },
      { id: 2, definitionId: 11, rating: 84 },
    ];
    const model = {
      requiredPlayerCount: 2,
      targetRating: 84,
      maxSpecialCount: 1,
      constraints: [{ label: 'special x1', count: 1, matches: (item) => item.special === true }],
    };
    const valid = validateRatingSbcModelAgainstItems(model, players, { meetsRequirements: () => true }, {
      isSpecialItem: (item) => item.special === true,
    });
    expect(valid.ok).toBe(true);
    expect(valid.rating).toBe(84);
    expect(valid.challengeReady).toBe(true);

    const duplicate = [{ ...players[0] }, { ...players[1], definitionId: 10, special: true }];
    const invalid = validateRatingSbcModelAgainstItems(model, duplicate, { meetsRequirements: () => false }, {
      isSpecialItem: (item) => item.special === true,
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining([
      'unique-definitions 1/2',
      'special-count 2/1',
      'challenge.meetsRequirements() returned false',
    ]));
  });

  it('validates an exclusive role minimum and maximum with the live constraint matcher', () => {
    const roleConstraint = {
      id: 'challenge-0',
      label: 'Required Special x1',
      count: 1,
      matches: (item) => item.requiredSpecial === true,
    };
    const model = {
      requiredPlayerCount: 2,
      targetRating: 84,
      maxSpecialCount: 2,
      constraints: [roleConstraint],
    };
    const exclusiveRoles = [{
      id: 'required-special',
      constraintId: 'challenge-0',
      minCount: 1,
      maxCount: 1,
    }];
    const valid = validateRatingSbcModelAgainstItems(model, [
      { id: 1, definitionId: 11, rating: 84, requiredSpecial: true },
      { id: 2, definitionId: 12, rating: 84 },
    ], null, { exclusiveRoles });
    const invalid = validateRatingSbcModelAgainstItems(model, [
      { id: 1, definitionId: 11, rating: 84, requiredSpecial: true },
      { id: 2, definitionId: 12, rating: 84, requiredSpecial: true },
    ], null, { exclusiveRoles });

    expect(valid.ok).toBe(true);
    expect(valid.roleResults).toEqual([
      expect.objectContaining({ id: 'required-special', matched: 1, minCount: 1, maxCount: 1 }),
    ]);
    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toContain('Required Special x1 role-count 2/1-1');
  });

  it('rejects different card definitions for the same base player', () => {
    const result = validateRatingSbcModelAgainstItems({
      requiredPlayerCount: 2,
      targetRating: 84,
      maxSpecialCount: 2,
      constraints: [],
    }, [
      { id: 1, definitionId: 134449171, databaseId: 231443, rating: 84 },
      { id: 2, definitionId: 67340307, databaseId: 231443, rating: 84 },
    ]);

    expect(result.ok).toBe(false);
    expect(result.uniqueDefinitionCount).toBe(2);
    expect(result.uniquePlayerCount).toBe(1);
    expect(result.errors).toContain('unique-players 1/2');
  });
});
