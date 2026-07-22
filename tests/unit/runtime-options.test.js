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
      requirements: [{ maxRating: 81, protectHighGold: true, highGoldThreshold: 84, highGoldProtectionMaxRating: true, maxRatingBeforeHighGoldProtection: 81 }],
      challengeRequirements: [
        [{ maxRating: 81, protectHighGold: true, highGoldThreshold: 84, highGoldProtectionMaxRating: true, maxRatingBeforeHighGoldProtection: 81 }],
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

  it('removes generated protection caps while preserving explicit business max ratings', () => {
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

  it('resolves Pick preferences from global to parent to child without weakening business limits', () => {
    expect(resolvePickRuntimeOptions(
      { protectHighGold: true, highGoldThreshold: 82, openPicksAtEnd: false },
      { pickOptions: { highGoldThreshold: 84, openAtEnd: true } },
      { pickOptions: { protectHighGold: false } },
    )).toMatchObject({
      protectHighGold: false,
      highGoldThreshold: 84,
      openPicksAtEnd: true,
    });

    const loopDef = {
      strategy: 'playerPickSbc',
      pickOptions: { highGoldThreshold: 86 },
      requirements: [{ maxRating: 83 }],
    };
    applyPickRuntimeOptions(loopDef, { protectHighGold: true, highGoldThreshold: 82 });
    expect(loopDef.requirements[0]).toMatchObject({
      maxRating: 83,
      maxRatingBeforeHighGoldProtection: 83,
      highGoldThreshold: 86,
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
