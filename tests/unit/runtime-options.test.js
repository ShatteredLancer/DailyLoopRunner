import { describe, expect, it } from 'vitest';
import {
  applyLoopRuntimeOptions,
  applyPickRuntimeOptions,
  applyInventoryMode,
  loopUsesRounds,
  normalizePickRuntimeOptions,
  resolveInventoryMode,
  resolvePickRuntimeOptions,
  resolveRuntimeQuantity,
} from '../../src/config/runtime-options.js';

describe('loop runtime option projection', () => {
  it('normalizes Pick redemption controls without material-protection fields', () => {
    expect(normalizePickRuntimeOptions()).toEqual({
      autoSelectBelow90: true,
      preferScannedMetadata: false,
      openPicksAtEnd: false,
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
      autoSelectBelow90: false,
      preferScannedMetadata: true,
      openPicksAtEnd: true,
      autoPickThreshold: 90,
    });
  });

  it('projects only Pick redemption options and preserves SBC requirements', () => {
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
      autoSelectBelow90: false,
      openPicksAtEnd: true,
      autoPickRatingThreshold: 91,
      requirements: [{ maxRating: 81 }],
      challengeRequirements: [[{ maxRating: 81 }], [{ maxRating: 85 }]],
    });
    expect(loopDef).not.toHaveProperty('protectHighGold');
    expect(loopDef).not.toHaveProperty('pickHighGoldThreshold');
  });

  it('does not rewrite legacy requirement fields while applying Pick options', () => {
    const loopDef = {
      strategy: 'playerPickSbc',
      requirements: [
        { maxRating: 81, highGoldThreshold: 82, protectHighGold: true, highGoldProtectionMaxRating: true },
        {
          maxRating: 83,
          highGoldThreshold: 84,
          protectHighGold: true,
          highGoldProtectionMaxRating: true,
        },
        { maxRating: 85, highGoldThreshold: 82, protectHighGold: true },
      ],
    };
    applyPickRuntimeOptions(loopDef, { protectHighGold: false });
    expect(loopDef.requirements).toEqual([
      { maxRating: 81, highGoldThreshold: 82, protectHighGold: true, highGoldProtectionMaxRating: true },
      { maxRating: 83, highGoldThreshold: 84, protectHighGold: true, highGoldProtectionMaxRating: true },
      { maxRating: 85, highGoldThreshold: 82, protectHighGold: true },
    ]);
  });

  it('preserves an explicit Pick business maxRating across repeated option projection', () => {
    const loopDef = {
      strategy: 'playerPickSbc',
      requirements: [{ maxRating: 85 }],
    };

    applyPickRuntimeOptions(loopDef, { protectHighGold: true, highGoldThreshold: 84 });
    applyPickRuntimeOptions(loopDef, { protectHighGold: false, highGoldThreshold: 84 });

    expect(loopDef.requirements).toEqual([{ maxRating: 85 }]);
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

    const dailyRecycle = { strategy: 'dailySingleCardRecycle' };
    applyLoopRuntimeOptions(dailyRecycle, { dailyRecycleInventoryOnly: true });
    expect(dailyRecycle.inventoryOnly).toBe(true);
    expect(dailyRecycle.openRewardPacks).toBe(false);

    const dailyRoutine = { strategy: 'dailyRoutine' };
    applyLoopRuntimeOptions(dailyRoutine, { dailyRecycleInventoryOnly: true });
    expect(dailyRoutine.runtimeInventoryMode).toBe('inventory-only');

    const workflow = {
      strategy: 'workflowRoutine',
      rewardFlow: {
        open: 'never',
        packIds: [105],
        packNames: ['Bronze Players Premium'],
      },
    };
    applyLoopRuntimeOptions(workflow, { openRewardPacks: true, dailyRecycleInventoryOnly: true });
    expect(workflow).toMatchObject({
      openRewardPacks: false,
      rewardPackIds: [105],
      rewardPackNames: ['Bronze Players Premium'],
      runtimeInventoryMode: 'inventory-only',
      runtimePickOptions: normalizePickRuntimeOptions(),
    });
  });

  it('shows rounds only for explicit repeat-count loops', () => {
    expect(loopUsesRounds({ strategy: 'playerPickSbc', exhaustSbcSet: true })).toBe(false);
    expect(loopUsesRounds({ strategy: 'playerPickSbc', useRoundsAsCompletions: true })).toBe(true);
    expect(loopUsesRounds({ strategy: 'provisionPackCrafting' })).toBe(true);
    expect(loopUsesRounds({ strategy: 'dailyRoutine' })).toBe(false);
  });

  it('applies the selected Rounds value to an unlimited discovered Pick', () => {
    const loopDef = {
      strategy: 'playerPickSbc',
      discovered: true,
      useRoundsAsCompletions: true,
      maxCompletions: 1,
    };
    applyLoopRuntimeOptions(loopDef, { rounds: 6 });
    expect(loopDef.maxCompletions).toBe(6);
    expect(loopUsesRounds(loopDef)).toBe(true);
  });

  it('resolves Pick preferences from global to parent to child without material settings', () => {
    expect(resolvePickRuntimeOptions(
      { protectHighGold: true, highGoldThreshold: 82, openPicksAtEnd: false },
      { pickOptions: { openAtEnd: true, autoPickThreshold: 92 } },
      { pickOptions: { autoSelectBelow90: false } },
    )).toMatchObject({
      autoSelectBelow90: false,
      autoPickThreshold: 92,
      openPicksAtEnd: true,
    });

    const loopDef = {
      strategy: 'playerPickSbc',
      pickOptions: { autoPickThreshold: 86 },
      requirements: [{ maxRating: 83 }],
    };
    applyPickRuntimeOptions(loopDef, { protectHighGold: true, highGoldThreshold: 82 });
    expect(loopDef.requirements).toEqual([{ maxRating: 83 }]);
    expect(loopDef.autoPickRatingThreshold).toBe(86);
  });

  it('infers rating-constrained fodder policy independently from Pick options', () => {
    const loopDef = {
      strategy: 'fillAndVerifySbc',
      ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
    };
    applyLoopRuntimeOptions(loopDef, {
      pickOptions: { autoPickThreshold: 92 },
      sbcFodderPolicy: { lowRatedGoldMaxRating: 82, ratingSbcMaxCardRating: 88 },
    });
    expect(loopDef).not.toHaveProperty('protectHighGold');
    expect(loopDef).not.toHaveProperty('pickHighGoldThreshold');
    expect(loopDef.runtimeSbcFodderPolicy).toEqual({
      mode: 'rating-constrained',
      lowRatedGoldMaxRating: 82,
      ratingSbcMaxCardRating: 88,
    });
  });

  it('resolves inventory-only as an inheritable preference only for supported strategies', () => {
    expect(resolveInventoryMode('normal', { inventoryMode: 'inventory-only' }, { inventoryMode: 'normal' }))
      .toBe('normal');
    const supported = { strategy: 'supplyAndCraft', inventoryMode: 'inventory-only', openRewardPacks: true };
    applyInventoryMode(supported, 'normal');
    expect(supported).toMatchObject({ inventoryOnly: true, openRewardPacks: false });

    const unsupported = { strategy: 'provisionPackCrafting' };
    applyInventoryMode(unsupported, 'inventory-only');
    expect(unsupported).not.toHaveProperty('inventoryOnly');
    expect(unsupported.inventoryOnlyIgnored).toBe(true);
  });

  it('uses declarative runtime quantity metadata before legacy rounds flags', () => {
    const loopDef = {
      strategy: 'fillAndVerifySbc',
      useRoundsAsCompletions: true,
      maxCompletions: 1,
      runtimeQuantity: {
        mode: 'user',
        target: 'maxCompletions',
        default: 7,
        min: 2,
        max: 12,
        label: 'Craft count',
      },
    };
    expect(resolveRuntimeQuantity(loopDef)).toEqual({
      mode: 'user',
      target: 'maxCompletions',
      default: 7,
      min: 2,
      max: 12,
      label: 'Craft count',
    });
    applyLoopRuntimeOptions(loopDef, { rounds: 50 });
    expect(loopDef.maxCompletions).toBe(12);
  });
});
