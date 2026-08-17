import { describe, expect, it } from 'vitest';
import {
  applyLoopRuntimeOptions,
  applyPickRuntimeOptions,
  assertRollingRuntimePreflight,
  applyInventoryMode,
  loopUsesRounds,
  normalizePickRuntimeOptions,
  resolveInventoryMode,
  resolvePickRuntimeOptions,
  resolveRuntimeQuantity,
  shouldAutoSelectPlayerPick,
} from '../../src/config/runtime-options.js';

describe('loop runtime option projection', () => {
  it('uses an inclusive shared automatic-use boundary for Player Picks', () => {
    expect(shouldAutoSelectPlayerPick(90, { protectionRating: 90, autoSelectBelow90: true })).toBe(true);
    expect(shouldAutoSelectPlayerPick(91, { protectionRating: 90, autoSelectBelow90: true })).toBe(false);
    expect(shouldAutoSelectPlayerPick(90, { protectionRating: 90, autoSelectBelow90: false })).toBe(false);
  });

  it('normalizes Pick redemption controls without material-protection fields', () => {
    expect(normalizePickRuntimeOptions()).toEqual({
      autoSelectBelow90: true,
      preferScannedMetadata: false,
      openPicksAtEnd: false,
      rollingStorageSinkEnabled: false,
      rollingSurplusCraftingEnabled: false,
      rollingProvisionsMaxRating: 88,
      rollingOpenDuplicateProvisionsRewards: false,
      rollingShortageProvisionsPackLimit: 2,
      protectionRating: 90,
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
      rollingStorageSinkEnabled: false,
      rollingSurplusCraftingEnabled: false,
      rollingProvisionsMaxRating: 88,
      rollingOpenDuplicateProvisionsRewards: false,
      rollingShortageProvisionsPackLimit: 2,
      protectionRating: 90,
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
      protectionRating: 91,
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
      protectionRating: 92,
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

  it('migrates the legacy Pick threshold into the shared Protection rating', () => {
    expect(normalizePickRuntimeOptions({ autoPickThreshold: 95 })).toMatchObject({
      protectionRating: 95,
    });
    expect(resolvePickRuntimeOptions(
      { autoPickThreshold: 91 },
      { pickOptions: { protectionRating: 94 } },
    )).toMatchObject({ protectionRating: 94 });
  });

  it('keeps the Rolling Storage sink opt-in across global and Loop overrides', () => {
    expect(normalizePickRuntimeOptions({})).toMatchObject({
      rollingStorageSinkEnabled: false,
    });
    expect(resolvePickRuntimeOptions(
      { rollingStorageSinkEnabled: true },
      { pickOptions: { rollingStorageSinkEnabled: false } },
    )).toMatchObject({ rollingStorageSinkEnabled: false });

    const disabled = { strategy: 'rollingUpgrade' };
    applyLoopRuntimeOptions(disabled, { pickOptions: {} });
    expect(disabled.rollingStorageSinkEnabled).toBe(false);

    const enabled = { strategy: 'rollingUpgrade' };
    applyLoopRuntimeOptions(enabled, {
      pickOptions: { rollingStorageSinkEnabled: true },
    });
    expect(enabled).toMatchObject({
      rollingStorageSinkEnabled: true,
      runtimePickOptions: { rollingStorageSinkEnabled: true },
    });
  });

  it('keeps proactive Rolling surplus crafting disabled unless explicitly enabled', () => {
    expect(normalizePickRuntimeOptions({})).toMatchObject({
      rollingSurplusCraftingEnabled: false,
    });
    expect(resolvePickRuntimeOptions(
      { rollingSurplusCraftingEnabled: true },
      { pickOptions: { rollingSurplusCraftingEnabled: false } },
    )).toMatchObject({ rollingSurplusCraftingEnabled: false });

    const disabled = { strategy: 'rollingUpgrade' };
    applyLoopRuntimeOptions(disabled, { pickOptions: {} });
    expect(disabled.rollingSurplusCraftingEnabled).toBe(false);

    const enabled = { strategy: 'rollingUpgrade' };
    applyLoopRuntimeOptions(enabled, {
      pickOptions: { rollingSurplusCraftingEnabled: true },
    });
    expect(enabled).toMatchObject({
      rollingSurplusCraftingEnabled: true,
      runtimePickOptions: { rollingSurplusCraftingEnabled: true },
    });
  });

  it('projects the configurable Provisions reserve, shortage batch, and reward timing onto Rolling', () => {
    expect(normalizePickRuntimeOptions({ rollingProvisionsMaxRating: 89 })).toMatchObject({
      rollingProvisionsMaxRating: 89,
      rollingOpenDuplicateProvisionsRewards: false,
      rollingShortageProvisionsPackLimit: 2,
    });
    expect(normalizePickRuntimeOptions({ rollingProvisionsMaxRating: 90 })).toMatchObject({
      rollingProvisionsMaxRating: 88,
    });
    expect(normalizePickRuntimeOptions({ rollingShortageProvisionsPackLimit: 0 }))
      .toMatchObject({ rollingShortageProvisionsPackLimit: 1 });
    expect(normalizePickRuntimeOptions({ rollingShortageProvisionsPackLimit: 99 }))
      .toMatchObject({ rollingShortageProvisionsPackLimit: 30 });

    const loopDef = {
      strategy: 'rollingUpgrade',
      rollingProvisionsUpgrade: {
        requirements: [{ tier: 'gold', count: 4, minRating: 87, maxRating: 89 }],
      },
    };
    applyLoopRuntimeOptions(loopDef, {
      pickOptions: {
        rollingProvisionsMaxRating: 89,
        rollingOpenDuplicateProvisionsRewards: true,
        rollingShortageProvisionsPackLimit: 4,
      },
    });
    expect(loopDef).toMatchObject({
      runtimeProvisionsMaxRating: 89,
      rollingOpenDuplicateProvisionsRewards: true,
      rollingShortageProvisionsPackLimit: 4,
      rollingProvisionsUpgrade: { requirements: [{ maxRating: 89 }] },
    });
  });

  it('allows zero quantity only through the explicit Rolling contract', () => {
    const rolling = {
      strategy: 'rollingUpgrade',
      runtimeQuantity: {
        mode: 'user', target: 'maxCompletions', default: 0, min: 0, max: 1000, allowZero: true,
      },
    };
    expect(resolveRuntimeQuantity(rolling)).toMatchObject({
      default: 0,
      min: 0,
      allowZero: true,
    });
    applyLoopRuntimeOptions(rolling, {
      rounds: 0,
      openRewardPacks: true,
      pickOptions: { protectionRating: 95 },
    });
    expect(rolling).toMatchObject({
      maxCompletions: 0,
      runtimeProtectionRating: 95,
    });

    expect(resolveRuntimeQuantity({
      strategy: 'fillAndVerifySbc',
      runtimeQuantity: {
        mode: 'user', target: 'maxCompletions', default: 0, min: 0, max: 50, allowZero: true,
      },
    })).toMatchObject({ default: 1, min: 1 });
  });

  it('fails Rolling preflight before dispatch when rewards are closed or the workflow is staged', () => {
    expect(() => assertRollingRuntimePreflight({
      strategy: 'rollingUpgrade',
      openRewardPacks: false,
      rollingWorkflowEnabled: false,
    })).toThrow('requires Open reward packs');
    expect(() => assertRollingRuntimePreflight({
      strategy: 'rollingUpgrade',
      openRewardPacks: true,
      rollingWorkflowEnabled: false,
    })).toThrow('staged but not enabled');
    expect(assertRollingRuntimePreflight({
      strategy: 'rollingUpgrade',
      openRewardPacks: true,
      rollingWorkflowEnabled: true,
    })).toMatchObject({ strategy: 'rollingUpgrade' });
    expect(assertRollingRuntimePreflight({ strategy: 'playerPickSbc' })).toMatchObject({
      strategy: 'playerPickSbc',
    });
  });
});
