import { describe, expect, it } from 'vitest';
import {
  applyLoopRuntimeOptions,
  applyPickRuntimeOptions,
  loopUsesRounds,
  normalizePickRuntimeOptions,
} from '../../src/config/runtime-options.js';

describe('loop runtime option projection', () => {
  it('normalizes configurable Pick thresholds to the existing bounds', () => {
    expect(normalizePickRuntimeOptions()).toEqual({
      protectHighGold: true,
      autoSelectBelow90: true,
      preferScannedMetadata: false,
      openPicksAtEnd: false,
      highGoldThreshold: 82,
      autoPickThreshold: 90,
    });
    expect(normalizePickRuntimeOptions({
      protectHighGold: false,
      autoSelectBelow90: false,
      preferScannedMetadata: true,
      openPicksAtEnd: true,
      highGoldThreshold: 120,
      autoPickThreshold: 0,
    })).toEqual({
      protectHighGold: false,
      autoSelectBelow90: false,
      preferScannedMetadata: true,
      openPicksAtEnd: true,
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
      openPicksAtEnd: true,
      highGoldThreshold: 84,
      autoPickThreshold: 91,
    });
    expect(loopDef).toMatchObject({
      protectHighGold: true,
      autoSelectBelow90: false,
      openPicksAtEnd: true,
      pickHighGoldThreshold: 84,
      autoPickRatingThreshold: 91,
      requirements: [{ maxRating: 83, protectHighGold: true, highGoldThreshold: 84, highGoldProtectionMaxRating: true }],
      challengeRequirements: [
        [{ maxRating: 83, protectHighGold: true, highGoldThreshold: 84, highGoldProtectionMaxRating: true }],
        [{
          maxRating: 83,
          protectHighGold: true,
          highGoldThreshold: 84,
          highGoldProtectionMaxRating: true,
          maxRatingBeforeHighGoldProtection: 85,
        }],
      ],
    });
  });

  it('removes legacy and custom protection caps when Pick protection is disabled', () => {
    const loopDef = {
      strategy: 'playerPickSbc',
      requirements: [
        { maxRating: 81, highGoldThreshold: 82, protectHighGold: true },
        {
          maxRating: 83,
          highGoldThreshold: 84,
          protectHighGold: true,
        },
        { maxRating: 85, highGoldThreshold: 82, protectHighGold: true },
      ],
    };
    applyPickRuntimeOptions(loopDef, { protectHighGold: false });
    expect(loopDef.requirements).toEqual([
      { protectHighGold: false },
      { protectHighGold: false },
      { maxRating: 85, protectHighGold: false },
    ]);
  });

  it('restores an explicit Pick maxRating after temporary high-gold protection', () => {
    const loopDef = {
      strategy: 'playerPickSbc',
      requirements: [{ maxRating: 85 }],
    };

    applyPickRuntimeOptions(loopDef, { protectHighGold: true, highGoldThreshold: 84 });
    applyPickRuntimeOptions(loopDef, { protectHighGold: false, highGoldThreshold: 84 });

    expect(loopDef.requirements).toEqual([{ maxRating: 85, protectHighGold: false }]);
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

    const rarePack = {
      strategy: 'rarePackTo84Upgrade',
      useRoundsAsCompletions: true,
      consumeAllSourcePacks: true,
      openRewardPacks: true,
    };
    applyLoopRuntimeOptions(rarePack, { rounds: 3, openRewardPacks: false });
    expect(rarePack).toMatchObject({
      consumeAllSourcePacks: true,
      maxCompletions: 3,
      openRewardPacks: false,
    });
  });

  it('shows rounds only for explicit repeat-count loops', () => {
    expect(loopUsesRounds({ strategy: 'playerPickSbc', exhaustSbcSet: true })).toBe(false);
    expect(loopUsesRounds({ strategy: 'playerPickSbc', useRoundsAsCompletions: true })).toBe(true);
    expect(loopUsesRounds({ strategy: 'provisionPackCrafting' })).toBe(true);
    expect(loopUsesRounds({ strategy: 'dailyRoutine' })).toBe(false);
  });
});
