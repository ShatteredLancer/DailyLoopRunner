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

  it('can submit the lowest above-target squad only when explicitly authorized', async () => {
    const club = Array.from({ length: 11 }, (_, index) => makePlayer({
      id: 12101 + index,
      definitionId: 22101 + index,
      rating: 85,
      rareflag: 1,
    }));
    const squadItems = [];
    const squad = {
      removeAllItems: vi.fn(() => { squadItems.length = 0; }),
      setPlayers: vi.fn((players) => {
        squadItems.push(...players.filter(Boolean));
      }),
      getPlayers: () => squadItems,
      canSubmit: () => true,
    };
    const { api } = await loadUserscript({ club });
    const challenge = {
      id: 3874,
      requiredPlayerCount: 11,
      eligibilityRequirements: [teamRatingRequirement(84)],
      squad,
    };
    const loopDef = {
      id: 'rating-excess-explicit-fallback',
      name: 'Rating Excess Explicit Fallback',
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
      allowAboveTarget: true,
      maxAboveTarget: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      optimizedRating: 85,
      fillResult: { submitReady: true },
    });
    expect(squad.removeAllItems).toHaveBeenCalledOnce();
    expect(squad.setPlayers).toHaveBeenCalledOnce();
    expect(squadItems).toHaveLength(11);
  });

  it('rejects an above-target fallback beyond the one-point cap', async () => {
    const club = Array.from({ length: 11 }, (_, index) => makePlayer({
      id: 12201 + index,
      definitionId: 22201 + index,
      rating: 86,
      rareflag: 1,
    }));
    const { api } = await loadUserscript({ club });
    const challenge = {
      id: 3874,
      requiredPlayerCount: 11,
      eligibilityRequirements: [teamRatingRequirement(84)],
      squad: {},
    };
    const loopDef = {
      id: 'rating-excess-cap',
      name: 'Rating Excess Cap',
      strategy: 'fillAndVerifySbc',
      expectedPlayerCount: 11,
      blockSpecial: true,
      allowedSpecialCount: 0,
      priorityPiles: ['club'],
      ratingSbcFill: { targetRating: 84, priorityPiles: ['club'] },
      runtimeSbcFodderPolicy: {
        mode: 'rating-constrained',
        ratingSbcMaxCardRating: 97,
      },
    };

    const result = await api.fillSbcSquadRatingOptimized(loopDef, { challenge }, {
      skipInventoryRefresh: true,
      deferAboveTarget: true,
      allowAboveTarget: true,
      maxAboveTarget: 1,
    });

    expect(result).toMatchObject({
      ok: false,
      reasonCode: 'SQUAD_RATING_EXCESS',
      optimizedRating: 86,
    });
  });
});
