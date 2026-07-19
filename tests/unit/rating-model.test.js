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
});
