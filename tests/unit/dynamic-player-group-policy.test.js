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
});
