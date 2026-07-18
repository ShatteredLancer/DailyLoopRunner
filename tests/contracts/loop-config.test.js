import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadUserscript } from '../helpers/load-userscript.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function loadDefinitions() {
  const { api } = await loadUserscript();
  const externalConfig = JSON.parse(await readFile(path.join(root, 'DailyLoopRunner.loops.json'), 'utf8'));
  return { api, builtIn: api.LOOP_DEFS, external: externalConfig.loops, externalConfig };
}

function byId(loops, id) {
  const loop = loops.find((entry) => entry.id === id);
  expect(loop, `loop ${id}`).toBeTruthy();
  return loop;
}

describe('loop configuration contracts', () => {
  it('validates all built-in and external loop definitions', async () => {
    const { api, builtIn, externalConfig } = await loadDefinitions();
    expect(() => api.validateLoopConfig({
      loops: builtIn,
      recoveryRecipes: api.RECOVERY_RECIPES,
      unassignedRecoveryPolicies: api.UNASSIGNED_RECOVERY_POLICIES,
      defaultUnassignedRecoveryPolicyIds: api.DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
    }, 'built-in')).not.toThrow();
    expect(() => api.validateLoopConfig(externalConfig, 'external')).not.toThrow();
  });

  it('keeps built-in and external loop ids and strategies aligned', async () => {
    const { builtIn, external } = await loadDefinitions();
    expect(external.map(({ id, strategy }) => ({ id, strategy })))
      .toEqual(builtIn.map(({ id, strategy }) => ({ id, strategy })));
  });

  it('locks the One-click Daily stage order', async () => {
    const { builtIn } = await loadDefinitions();
    expect(byId(builtIn, 'one-click-daily').steps).toEqual([
      'daily-bronze',
      'daily-silver',
      'daily-common',
      'daily-rare',
      'daily-rare-pack-84',
    ]);
  });

  it('locks Daily Bronze and Silver recycle contracts', async () => {
    const { builtIn } = await loadDefinitions();
    const bronze = byId(builtIn, 'daily-bronze');
    const silver = byId(builtIn, 'daily-silver');
    expect(bronze).toMatchObject({
      strategy: 'dailySingleCardRecycle',
      rewardPackIds: [105],
      targetDuplicate: { tier: 'bronze', playerOnly: true, allowSpecial: false },
      dailyCompletionLimit: 7,
    });
    expect(silver).toMatchObject({
      strategy: 'dailySingleCardRecycle',
      rewardPackIds: [205],
      targetDuplicate: { tier: 'silver', playerOnly: true, allowSpecial: false },
      dailyCompletionLimit: 7,
    });
    expect([bronze, silver, byId(builtIn, 'daily-bronze-mvp'), byId(builtIn, 'daily-silver-mvp')])
      .toEqual(expect.not.arrayContaining([expect.objectContaining({ overflowRecovery: expect.anything() })]));
  });

  it('locks configurable Unassigned recovery routes and low-gold protection', async () => {
    const { api, externalConfig } = await loadDefinitions();
    const builtInPolicies = Object.fromEntries(api.UNASSIGNED_RECOVERY_POLICIES.map((policy) => [policy.id, policy]));
    expect(builtInPolicies['bronze-duplicate-overflow'].steps.map((step) => step.recipeId)).toEqual([
      'daily-bronze-upgrade',
      'daily-common-gold-upgrade',
      'bronze-upgrade',
    ]);
    expect(builtInPolicies['silver-duplicate-overflow'].steps.map((step) => step.recipeId)).toEqual([
      'daily-silver-upgrade',
      'daily-common-gold-upgrade',
      'silver-upgrade',
    ]);
    expect(builtInPolicies['common-gold-duplicate-overflow'].steps.map((step) => step.recipeId)).toEqual([
      'daily-rare-gold-upgrade',
      'fof-glory-hunters-crafting-upgrade',
      'gold-upgrade',
    ]);
    expect(builtInPolicies['rare-gold-duplicate-overflow'].steps.map((step) => step.recipeId)).toEqual(['2x84-upgrade']);

    const protectedRecipes = api.RECOVERY_RECIPES.filter((recipe) =>
      recipe.requirements.some((requirement) => requirement.tier === 'gold')
    );
    protectedRecipes.forEach((recipe) => {
      recipe.requirements.forEach((requirement) => {
        expect(requirement).toMatchObject({ maxRating: 81, protectHighGold: true, allowSpecial: false });
      });
    });
    expect(externalConfig.recoveryRecipes.map((recipe) => recipe.id))
      .toEqual(api.RECOVERY_RECIPES.map((recipe) => recipe.id));
    expect(externalConfig.unassignedRecoveryPolicies.map((policy) => policy.id))
      .toEqual(api.UNASSIGNED_RECOVERY_POLICIES.map((policy) => policy.id));
  });

  it('rejects missing recovery recipe and policy references', async () => {
    const { api } = await loadDefinitions();
    const base = {
      loops: api.LOOP_DEFS,
      recoveryRecipes: api.RECOVERY_RECIPES,
      unassignedRecoveryPolicies: [{
        id: 'broken-policy',
        match: { tier: 'bronze', playerOnly: true, allowSpecial: false },
        steps: [{ recipeId: 'missing-recipe' }],
      }],
      defaultUnassignedRecoveryPolicyIds: ['broken-policy'],
    };
    expect(() => api.validateLoopConfig(base, 'broken')).toThrow(/recipeId not found/);
    expect(() => api.validateLoopConfig({
      ...base,
      unassignedRecoveryPolicies: api.UNASSIGNED_RECOVERY_POLICIES,
      defaultUnassignedRecoveryPolicyIds: ['missing-policy'],
    }, 'broken')).toThrow(/not found: missing-policy/);
  });

  it('keeps legacy loop containers compatible while rejecting obsolete per-loop recovery', async () => {
    const { api } = await loadDefinitions();
    const fromArray = api.parseLoopConfig(JSON.stringify(api.LOOP_DEFS));
    const fromObject = api.parseLoopConfig(JSON.stringify({ loops: api.LOOP_DEFS }));
    for (const normalized of [fromArray, fromObject]) {
      expect(normalized.loops).toHaveLength(api.LOOP_DEFS.length);
      expect(normalized.recoveryRecipes.map((recipe) => recipe.id))
        .toEqual(api.RECOVERY_RECIPES.map((recipe) => recipe.id));
    }
    expect(() => api.validateLoopConfig({
      loops: [{ ...api.LOOP_DEFS[0], overflowRecovery: {} }],
    }, 'legacy')).toThrow(/overflowRecovery is obsolete/);
  });

  it('locks Daily Common material ratio and shortage pack order', async () => {
    const { builtIn } = await loadDefinitions();
    const loop = byId(builtIn, 'daily-common');
    expect(loop.strategy).toBe('supplyAndCraft');
    expect(loop.requirements.map(({ tier, count }) => ({ tier, count }))).toEqual([
      { tier: 'silver', count: 5 },
      { tier: 'bronze', count: 5 },
    ]);
    expect(loop.shortagePacks.map((source) => ({
      tier: source.requirement.tier,
      packIds: source.packIds,
      maxOpensPerAttempt: source.maxOpensPerAttempt,
    }))).toEqual([
      { tier: 'bronze', packIds: [105], maxOpensPerAttempt: 1 },
      { tier: 'silver', packIds: [205], maxOpensPerAttempt: 1 },
    ]);
    expect(loop.primaryPiles).toEqual(['unassigned', 'storage', 'transfer']);
    expect(loop.clubFallbackPiles).toEqual(['unassigned', 'storage', 'transfer', 'club']);
  });

  it('locks protected low-gold crafting contracts', async () => {
    const { builtIn } = await loadDefinitions();
    const rare = byId(builtIn, 'daily-rare');
    const rarePack = byId(builtIn, 'daily-rare-pack-84');
    const provision = byId(builtIn, 'provision-crafting');

    expect(rare.requirements[0]).toMatchObject({
      tier: 'gold', rarity: 'common', count: 5, protectHighGold: true,
    });
    expect(rare).toMatchObject({
      strategy: 'supplyAndCraft',
      deferChallengeLoad: true,
      preSelectionCleanup: false,
      priorityPiles: ['unassigned', 'storage', 'transfer'],
      clubFallbackPiles: ['unassigned', 'storage', 'transfer', 'club'],
    });
    expect(rare.shortagePacks).toEqual([
      expect.objectContaining({
        repeatUntilSatisfied: true,
        routingPolicy: 'reserveMatchingDuplicates',
        packNames: ['11x Gold Players Pack', '11 x Gold Players Pack'],
        requirement: expect.objectContaining({ rarity: 'common', protectHighGold: true }),
      }),
    ]);
    expect(rarePack.rareUpgrade.requirements[0]).toMatchObject({
      tier: 'gold', rarity: 'rare', count: 6, protectHighGold: true,
    });
    expect(provision.preCraftPlayerPickLoopId).toBe('82-plus-player-pick-5of10');
    expect(provision.craftingUpgrades.map((upgrade) => upgrade.requirements[0].protectHighGold))
      .toEqual([true, true]);
  });

  it('locks Player Pick rarity ratios and protection caps', async () => {
    const { builtIn, external } = await loadDefinitions();
    const pick83 = byId(builtIn, '83-plus-player-pick-1of5');
    const summerPick84 = byId(builtIn, '84-plus-summer-tournament-nations-pick-1of3');
    const externalSummerPick84 = byId(external, '84-plus-summer-tournament-nations-pick-1of3');
    const pick82 = byId(builtIn, '82-plus-player-pick-5of10');

    expect(pick83.requirements).toEqual([
      expect.objectContaining({ rarity: 'rare', count: 4, maxRating: 81, protectHighGold: true }),
    ]);
    expect(summerPick84).toMatchObject({
      strategy: 'playerPickSbc',
      challengesPerPick: 1,
      pickCount: 1,
      requirements: [expect.objectContaining({ rarity: 'rare', count: 4, maxRating: 81, protectHighGold: true })],
    });
    expect(summerPick84.pickItemNames).toEqual(expect.arrayContaining([
      'Summer Tournament Nations Player Pick',
      '1 of 3 84+ Summer Tournament Nations Pick',
    ]));
    expect(summerPick84.pickItemNames.every((name) => /summer tournament nations/i.test(name))).toBe(true);
    expect(externalSummerPick84).toMatchObject({
      challengesPerPick: 1,
      pickCount: 1,
      requirements: [expect.objectContaining({ rarity: 'rare', count: 4, maxRating: 81, protectHighGold: true })],
    });
    expect(pick82).toMatchObject({ challengesPerPick: 2, pickCount: 5 });
    expect(pick82.requirements).toEqual([
      expect.objectContaining({ rarity: 'common', count: 11, maxRating: 81, protectHighGold: true }),
    ]);
  });

  it('locks rating SBC entry points and special requirements', async () => {
    const { builtIn, external } = await loadDefinitions();
    const fodder = byId(builtIn, '2x84-fodder');
    const externalFodder = byId(external, '2x84-fodder');
    const totw = byId(builtIn, 'auto-totw-upgrade');
    const x10 = byId(builtIn, '84x10');
    expect(fodder).toMatchObject({ hidden: true, mvp: true });
    expect(externalFodder).toMatchObject({ hidden: true, mvp: true });
    expect(totw.ratingSbcFill.priorityPiles).toEqual(['unassigned', 'storage', 'transfer', 'club']);
    expect(totw.blockSpecial).toBe(true);
    expect(x10).toMatchObject({
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      requiredSpecialKind: 'totw-tots-fof',
      requiredSpecialMinRating: 84,
    });
  });
});
