import { describe, expect, it } from 'vitest';
import {
  assertValidLoopDef,
  normalizeLoopConfig,
  parseLoopConfig,
  validateLoopConfig,
  validateLoopDef,
  validateLoopDefList,
} from '../../src/config/loop-schema.js';
import {
  DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
  RECOVERY_RECIPES,
  UNASSIGNED_RECOVERY_POLICIES,
} from '../../src/config/recovery.js';

function validLoop(overrides = {}) {
  return {
    id: 'daily-sequence',
    name: 'Daily Sequence',
    strategy: 'dailyRoutine',
    steps: ['daily-bronze'],
    ...overrides,
  };
}

describe('loop configuration schema', () => {
  it('normalizes legacy arrays and object containers with the built-in recovery defaults', () => {
    const loops = [validLoop()];
    for (const normalized of [normalizeLoopConfig(loops), parseLoopConfig(JSON.stringify({ loops }))]) {
      expect(normalized.loops).toEqual(loops);
      expect(normalized.recoveryRecipes).toBe(RECOVERY_RECIPES);
      expect(normalized.unassignedRecoveryPolicies).toBe(UNASSIGNED_RECOVERY_POLICIES);
      expect(normalized.defaultUnassignedRecoveryPolicyIds).toBe(DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS);
    }
  });

  it('preserves the exact invalid-container and field error messages', () => {
    expect(() => normalizeLoopConfig({})).toThrow(
      'Loop config JSON must be an array or an object with a loops array',
    );
    expect(validateLoopDef({
      name: '',
      strategy: 'dailyRoutine',
      steps: [],
      disabledPiles: ['discard'],
    })).toEqual([
      'name is required',
      'disabledPiles[0] must be one of: unassigned, storage, transfer, club',
      'steps must be a non-empty array',
    ]);
    expect(() => assertValidLoopDef({ name: '', strategy: 'dailyRoutine', steps: [] }, 'Custom loop JSON'))
      .toThrow('Custom loop JSON validation failed:\n- name is required\n- steps must be a non-empty array');
  });

  it('preserves list reference and duplicate-id validation', () => {
    expect(() => validateLoopDefList([validLoop(), validLoop()], 'loops'))
      .toThrow('loops has duplicate id: daily-sequence');
    expect(() => validateLoopDefList([validLoop({
      preCraftPlayerPickLoopId: 'missing-pick',
    })], 'loops')).toThrow('loops[0].preCraftPlayerPickLoopId not found: missing-pick');
    expect(() => validateLoopDefList([validLoop({
      stepOverrides: { missing: { maxCompletions: 1 } },
    })], 'loops')).toThrow('loops[0].stepOverrides references a non-step loop: missing');
    expect(() => validateLoopDefList([validLoop({
      sourceExhaustedFallbackLoopId: 'missing-fallback',
    })], 'loops')).toThrow('loops[0].sourceExhaustedFallbackLoopId not found: missing-fallback');
    expect(validateLoopDef(validLoop({ preCraftPlayerPick: {} }))).toContain(
      'preCraftPlayerPick.sbcSetIds or preCraftPlayerPick.pickItemResourceIds is required',
    );
    expect(validateLoopDef(validLoop({
      preCraftPlayerPick: { sbcSetIds: [1256], pickItemResourceIds: [5005713] },
    }))).toEqual([]);
  });

  it('validates composable workflow routines and their safe step references', () => {
    const child = {
      id: 'bronze-child',
      name: 'Bronze child',
      strategy: 'dailySingleCardRecycle',
      sbcNames: ['Bronze Upgrade'],
      targetDuplicate: { tier: 'bronze' },
    };
    const workflow = {
      id: 'custom-workflow',
      name: 'Custom workflow',
      strategy: 'workflowRoutine',
      steps: [{
        loopId: 'bronze-child',
        rewardFlow: { open: 'always', packNames: ['Bronze Players Premium'] },
      }],
    };
    expect(validateLoopDef(workflow)).toEqual([]);
    expect(() => validateLoopDefList([child, workflow], 'loops')).not.toThrow();
    expect(() => validateLoopConfig({ loops: [child, { ...workflow, steps: ['custom-workflow'] }] }, 'config'))
      .toThrow('config.loops[1].steps[0] cannot reference itself');
    expect(() => validateLoopConfig({ loops: [child, { ...workflow, steps: ['missing'] }] }, 'config'))
      .toThrow('config.loops[1].steps[0] loop not found: missing');
    expect(validateLoopDef({
      ...workflow,
      steps: [{ loopId: 'bronze-child', maxCompletions: 2, requirements: [{ count: 1 }] }],
    })).toEqual(expect.arrayContaining([
      'steps[0].maxCompletions belongs on the referenced child loop definition',
      'steps[0].requirements belongs on the referenced child loop definition',
    ]));
    expect(validateLoopDef({ ...workflow, stepOverrides: { 'bronze-child': { maxCompletions: 2 } } }))
      .toContain('stepOverrides is only supported by dailyRoutine compatibility flows; configure a dedicated child loop instead');
  });

  it('preserves recovery recipe, policy, and per-loop policy validation', () => {
    const base = {
      loops: [validLoop()],
      recoveryRecipes: RECOVERY_RECIPES,
      unassignedRecoveryPolicies: UNASSIGNED_RECOVERY_POLICIES,
      defaultUnassignedRecoveryPolicyIds: DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
    };
    expect(() => validateLoopConfig({
      ...base,
      unassignedRecoveryPolicies: [{
        id: 'broken-policy',
        match: { tier: 'bronze' },
        steps: [{ recipeId: 'missing-recipe' }],
      }],
      defaultUnassignedRecoveryPolicyIds: ['broken-policy'],
    }, 'external')).toThrow(
      'external.unassignedRecoveryPolicies[0] validation failed:\n'
      + '- external.unassignedRecoveryPolicies[0].steps[0].recipeId not found: missing-recipe',
    );
    expect(() => validateLoopConfig({
      ...base,
      loops: [validLoop({ unassignedRecoveryPolicyIds: ['missing-policy'] })],
    }, 'external')).toThrow(
      'external.loops[0].unassignedRecoveryPolicyIds[0] not found: missing-policy',
    );
  });

  it('validates rating and Player Pick limits without runtime dependencies', () => {
    expect(validateLoopDef({
      id: 'rating-loop',
      name: 'Rating Loop',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['Rating SBC'],
      ratingSbcFill: {
        priorityPiles: ['storage'],
        targetRating: 100,
        maxSearchNodes: 9999,
        maxSearchMs: 999,
        yieldEveryNodes: 49,
      },
    })).toEqual([
      'ratingSbcFill.targetRating must be a number between 1 and 99',
      'ratingSbcFill.maxSearchNodes must be an integer between 10000 and 2000000',
      'ratingSbcFill.maxSearchMs must be an integer between 1000 and 60000',
      'ratingSbcFill.yieldEveryNodes must be an integer between 50 and 5000',
    ]);
  });

  it('validates stable Player Pick identities and candidate counts', () => {
    const base = {
      name: 'Discovered Pick',
      strategy: 'playerPickSbc',
      sbcNames: ['Discovered Pick'],
      pickItemNames: ['Discovered Reward'],
      sbcSetIds: [100],
      pickItemResourceIds: [200],
      requirements: [{ tier: 'gold', rarity: 'rare', count: 4 }],
      challengesPerPick: 1,
      pickCandidateCount: 5,
      pickCount: 1,
    };
    expect(validateLoopDef(base)).toEqual([]);
    expect(validateLoopDef({ ...base, pickCandidateCount: 0 })).toContain(
      'pickCandidateCount must be an integer between 1 and 20',
    );
    expect(validateLoopDef({ ...base, pickCandidateCount: 1, pickCount: 2 })).toContain(
      'pickCandidateCount must be greater than or equal to pickCount',
    );
    expect(validateLoopDef({
      ...base,
      exhaustSbcSet: true,
      useRoundsAsCompletions: true,
      setCompletionSafetyLimit: 101,
    })).toEqual(expect.arrayContaining([
      'setCompletionSafetyLimit must be an integer between 1 and 100',
      'exhaustSbcSet cannot be combined with useRoundsAsCompletions',
    ]));
  });

  it('validates inheritable preferences, strategy capabilities, and runtime quantity metadata', () => {
    const supported = {
      id: 'common-loop',
      name: 'Common Loop',
      strategy: 'supplyAndCraft',
      sbcNames: ['Common Upgrade'],
      requirements: [{ tier: 'gold', count: 1 }],
      inventoryMode: 'inventory-only',
      pickOptions: { protectHighGold: false, autoPickThreshold: 91 },
      runtimeQuantity: {
        mode: 'user',
        target: 'maxCompletions',
        default: 3,
        min: 1,
        max: 10,
        label: 'Attempts',
      },
    };
    expect(validateLoopDef(supported)).toEqual([]);
    expect(validateLoopDef({
      id: 'provision',
      name: 'Provision',
      strategy: 'provisionPackCrafting',
      sourcePackNames: ['Provision Pack'],
      craftingUpgrades: [{ name: 'Upgrade', sbcNames: ['Upgrade'], requirements: [{ count: 1 }] }],
      inventoryMode: 'inventory-only',
    })).toContain('inventoryMode is not configurable for strategy provisionPackCrafting');
    expect(validateLoopDef({
      ...supported,
      inventoryMode: 'sometimes',
      pickOptions: { autoPickThreshold: 100, unsupported: true },
      runtimeQuantity: { mode: 'manual', target: 'unknown', min: 5, max: 2 },
    })).toEqual(expect.arrayContaining([
      'pickOptions.autoPickThreshold must be a number between 1 and 99',
      'pickOptions.unsupported is not supported',
      'runtimeQuantity.mode must be one of: user, ea-remaining, exhaust, fixed',
      'runtimeQuantity.target must be one of: maxCompletions, rounds, maxPacks, validationRounds',
      'runtimeQuantity.min must not exceed runtimeQuantity.max',
      'inventoryMode must be one of: inherit, inventory-only, normal',
    ]));
  });
});
