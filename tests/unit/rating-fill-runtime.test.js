import { describe, expect, it, vi } from 'vitest';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

function teamRatingRequirement(rating) {
  return {
    count: -1,
    getFirstKey: () => 'TEAM_RATING',
    getValue: () => [rating],
  };
}

describe('rating SBC runtime fill', () => {
  it('does not mutate the live squad when Rolling can only build above the target rating', async () => {
    const club = Array.from({ length: 11 }, (_, index) => makePlayer({
      id: 12001 + index,
      definitionId: 22001 + index,
      rating: 86,
      rareflag: 1,
    }));
    const { api } = await loadUserscript({ club });
    const removeAllItems = vi.fn();
    const setPlayers = vi.fn();
    const challenge = {
      id: 3874,
      requiredPlayerCount: 11,
      eligibilityRequirements: [teamRatingRequirement(84)],
      squad: { removeAllItems, setPlayers },
    };
    const loopDef = {
      id: 'rating-excess-no-save',
      name: 'Rating Excess No Save',
      strategy: 'fillAndVerifySbc',
      expectedPlayerCount: 11,
      blockSpecial: true,
      allowedSpecialCount: 0,
      priorityPiles: ['club'],
      ratingSbcFill: {
        targetRating: 84,
        priorityPiles: ['club'],
      },
      runtimeSbcFodderPolicy: {
        mode: 'rating-constrained',
        ratingSbcMaxCardRating: 97,
      },
    };

    const result = await api.fillSbcSquadRatingOptimized(loopDef, {
      challenge,
      background: true,
    }, {
      skipInventoryRefresh: true,
      deferAboveTarget: true,
    });

    expect(result).toMatchObject({
      ok: true,
      deferred: true,
      reasonCode: 'SQUAD_RATING_EXCESS',
      optimizedRating: 86,
    });
    expect(removeAllItems).not.toHaveBeenCalled();
    expect(setPlayers).not.toHaveBeenCalled();
  });
});
