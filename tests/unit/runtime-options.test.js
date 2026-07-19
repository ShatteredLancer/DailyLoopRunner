import { describe, expect, it } from 'vitest';
import {
  applyLoopRuntimeOptions,
  applyPickRuntimeOptions,
  normalizePickRuntimeOptions,
} from '../../src/config/runtime-options.js';

describe('loop runtime option projection', () => {
  it('normalizes configurable Pick thresholds to the existing bounds', () => {
    expect(normalizePickRuntimeOptions()).toEqual({
      protectHighGold: true,
      autoSelectBelow90: true,
      preferScannedMetadata: false,
      highGoldThreshold: 82,
      autoPickThreshold: 90,
    });
    expect(normalizePickRuntimeOptions({
      protectHighGold: false,
      autoSelectBelow90: false,
      preferScannedMetadata: true,
      highGoldThreshold: 120,
      autoPickThreshold: 0,
    })).toEqual({
      protectHighGold: false,
      autoSelectBelow90: false,
      preferScannedMetadata: true,
      highGoldThreshold: 99,
      autoPickThreshold: 90,
    });
  });

  it('projects Pick protection across normal and challenge requirements', () => {
    const loopDef = {
      strategy: 'playerPickSbc',
      requirements: [{ maxRating: 81 }],
      challengeRequirements: [[{ maxRating: 81 }], [{ maxRating: 85 }]],
    };
    applyPickRuntimeOptions(loopDef, {
      protectHighGold: true,
      autoSelectBelow90: false,
      highGoldThreshold: 84,
      autoPickThreshold: 91,
    });
    expect(loopDef).toMatchObject({
      protectHighGold: true,
      autoSelectBelow90: false,
      pickHighGoldThreshold: 84,
      autoPickRatingThreshold: 91,
      requirements: [{ maxRating: 83, protectHighGold: true }],
      challengeRequirements: [
        [{ maxRating: 83, protectHighGold: true }],
        [{ maxRating: 83, protectHighGold: true }],
      ],
    });
  });

  it('removes only the legacy low-gold cap when Pick protection is disabled', () => {
    const loopDef = {
      strategy: 'playerPickSbc',
      requirements: [{ maxRating: 81 }, { maxRating: 85 }],
    };
    applyPickRuntimeOptions(loopDef, { protectHighGold: false });
    expect(loopDef.requirements).toEqual([
      { protectHighGold: false },
      { maxRating: 85, protectHighGold: false },
    ]);
  });

  it('preserves forced reward opening and applies rounds to the intended strategies', () => {
    const forced = {
      strategy: 'fillAndVerifySbc',
      useRoundsAsCompletions: true,
      forceOpenRewardPacks: true,
      openRewardPacks: false,
    };
    applyLoopRuntimeOptions(forced, { rounds: 4, openRewardPacks: false, dryRun: true });
    expect(forced).toMatchObject({
      dryRun: true,
      openRewardPacks: true,
      maxCompletions: 4,
    });

    const provision = { strategy: 'provisionPackCrafting' };
    applyLoopRuntimeOptions(provision, { rounds: 60 });
    expect(provision.rounds).toBe(50);
  });
});
