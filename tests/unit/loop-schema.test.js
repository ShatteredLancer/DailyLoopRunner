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

function validRollingLoop(challengeRatings = [86, 87]) {
  return {
    id: 'rolling-upgrade',
    name: '10x 85+ Upgrade Rolling Loop',
    strategy: 'rollingUpgrade',
    dynamicSbcFamily: 'high-rated-x10',
    dynamicRewardCount: 10,
    sbcNames: ['10x 85+ Upgrade'],
    sbcSetIds: [1356],
    rewardPackIds: [1082],
    requiredSpecialCount: 1,
    allowedSpecialCount: 1,
    rollingTotwUpgrade: { activityBinding: { family: 'totw-upgrade' } },
    rollingProvisionsUpgrade: { activityBinding: { family: 'provisions-upgrade' } },
    rollingGoldSinkUpgrade: { activityBinding: { family: '5x80-upgrade' } },
    rollingPlayerPick: {
      status: 'resolved',
      required: true,
      selector: {
        material: 'gold-with-required-rare',
        selectionCount: 1,
        maxChallenges: 1,
        repeatability: 'unlimited',
        preference: 'rare-cost-first',
      },
      loop: { strategy: 'playerPickSbc' },
    },
    rollingStorageSinkPick: {
      status: 'unavailable',
      required: false,
      selector: {
        rewardMinRating: 95,
        candidateCount: 3,
        selectionCount: 1,
        challengeRatings: [88, 89],
      },
    },
    rollingStorageSink: {
      status: 'resolved',
      required: false,
      mode: 'automatic',
      capability: {
        setId: 1382,
        rewardKind: 'player',
        challengeRatings,
      },
    },
    runtimeQuantity: { allowZero: true },
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

  it('validates dynamic source-pack reward references and compatibility fallbacks', () => {
    const producer = {
      id: 'producer',
      name: 'Producer',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['Current SBC'],
      requirements: [{ tier: 'gold', count: 1 }],
    };
    const consumer = {
      id: 'consumer',
      name: 'Consumer',
      strategy: 'rarePackTo84Upgrade',
      sourcePackRef: { rewardOfLoopId: 'producer' },
      rareUpgrade: {
        name: 'Upgrade',
        sbcNames: ['Upgrade'],
        requirements: [{ tier: 'gold', count: 1 }],
      },
    };
    const shortageConsumer = {
      id: 'shortage-consumer',
      name: 'Shortage consumer',
      strategy: 'supplyAndCraft',
      sbcNames: ['Shortage SBC'],
      requirements: [{ tier: 'gold', count: 1 }],
      shortagePacks: [{
        requirement: { tier: 'gold' },
        sourcePackRef: { rewardOfLoopId: 'producer' },
      }],
    };

    expect(validateLoopDef(consumer)).toEqual([]);
    expect(validateLoopDef({
      ...consumer,
      sourceExhaustedFallbackActivityFamily: '2x84-upgrade',
    })).toEqual([]);
    expect(validateLoopDef({
      ...consumer,
      sourceExhaustedFallbackActivityFamily: 'unknown-upgrade',
    })).toContain('sourceExhaustedFallbackActivityFamily is not supported: unknown-upgrade');
    expect(validateLoopDef({
      ...consumer,
      sourceExhaustedFallbackLoopId: 'producer',
      sourceExhaustedFallbackActivityFamily: '2x84-upgrade',
    })).toContain('sourceExhaustedFallbackLoopId and sourceExhaustedFallbackActivityFamily cannot both be configured');
    expect(validateLoopDef(shortageConsumer)).toEqual([]);
    expect(() => validateLoopDefList([producer, consumer, shortageConsumer])).not.toThrow();
    expect(() => validateLoopDefList([producer, { ...consumer, sourcePackRef: { rewardOfLoopId: 'missing' } }]))
      .toThrow(/rewardOfLoopId not found: missing/);
    expect(() => validateLoopDefList([producer, { ...consumer, sourcePackRef: { rewardOfLoopId: 'consumer' } }]))
      .toThrow(/cannot reference its own Loop/);
    expect(validateLoopDef({ ...consumer, sourcePackRef: { rewardOfLoopId: '', extra: true } }))
      .toEqual(expect.arrayContaining([
        'sourcePackRef.rewardOfLoopId is required',
        'sourcePackRef.extra is not supported',
      ]));
    expect(validateLoopDef(validLoop({ sourcePackRef: { rewardOfLoopId: 'producer' } })))
      .toContain('sourcePackRef is not supported by strategy dailyRoutine');
  });

  it('validates material sink classes and ranking preferences only on semantic families', () => {
    const loop = {
      id: 'common-premium',
      name: 'Common Premium',
      strategy: 'fillAndVerifySbc',
      activityBinding: {
        family: 'common-gold-material-upgrade',
        classes: ['premium'],
        preference: 'reward-first',
        selectionMaterial: 'rare-gold',
        category: 'Upgrades',
        required: true,
      },
      sbcNames: ['Compatibility Upgrade'],
      requirements: [{ tier: 'gold', rarity: 'common', count: 9 }],
    };
    expect(validateLoopDef(loop)).toEqual([]);
    expect(validateLoopDef({
      ...loop,
      activityBinding: {
        ...loop.activityBinding,
        classes: ['unknown'],
        preference: 'random',
        selectionMaterial: 'mixed-gold',
      },
    })).toEqual(expect.arrayContaining([
      'activityBinding.classes[0] must be one of: premium, baseline, sub-baseline, incomparable',
      'activityBinding.preference must be one of: reward-first, quantity-first, cost-first',
      'activityBinding.selectionMaterial must be one of: common-gold, low-rated-gold, rare-gold',
    ]));
    expect(validateLoopDef({
      ...loop,
      activityBinding: { family: 'gold-upgrade', classes: ['baseline'] },
    })).toContain('activityBinding.classes, preference, and selectionMaterial require a material sink family');
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

  it('treats an empty optional reward pack alias list as omitted', () => {
    const loop = {
      id: '84x10',
      name: '84x10 Loop',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['10x 84+ Upgrade'],
      rewardPackNames: [],
    };
    expect(validateLoopDef(loop)).toEqual([]);
    expect(() => assertValidLoopDef(loop, loop.name)).not.toThrow();
    expect(validateLoopDef({ ...loop, sbcNames: [] })).toContain('sbcNames must be a non-empty array');
  });

  it('validates dynamic EA eligibility snapshots without interpreting group ids', () => {
    const loop = {
      id: 'dynamic-upgrade',
      name: 'Dynamic Upgrade',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['Dynamic Upgrade'],
      dynamicChallenges: [{
        challengeId: 1234,
        eligibilityRequirements: [
          { key: 'TEAM_RATING', values: [84], count: 11 },
          { key: 'PLAYER_RARITY_GROUP', values: [999], count: 1 },
        ],
      }],
    };

    expect(validateLoopDef(loop)).toEqual([]);
    expect(validateLoopDef({
      ...loop,
      dynamicChallenges: [{ challengeId: 0, eligibilityRequirements: [{ key: '', values: [], count: 0 }] }],
    })).toEqual(expect.arrayContaining([
      'dynamicChallenges[0].challengeId must be a positive integer',
      'dynamicChallenges[0].eligibilityRequirements[0].key must be a non-empty string',
      'dynamicChallenges[0].eligibilityRequirements[0].values must be a non-empty array',
      'dynamicChallenges[0].eligibilityRequirements[0].count must be a positive integer',
    ]));
  });

  it('admits a Storage Sink Set when one challenge is 87+ and preserves strict rating validation', () => {
    const diagnostic = 'rollingStorageSink.capability.challengeRatings must contain one or more ratings of 87+';

    expect(validateLoopDef(validRollingLoop([86, 87]))).not.toContain(diagnostic);
    expect(validateLoopDef(validRollingLoop([86]))).toContain(diagnostic);

    for (const challengeRatings of [[], [86, 'not-a-rating'], [0, 87], [86.5, 87], [87, 100]]) {
      expect(validateLoopDef(validRollingLoop(challengeRatings))).toContain(diagnostic);
    }
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
      },
    })).toEqual([
      'ratingSbcFill.targetRating must be a number between 1 and 99',
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
      pickOptions: {
        autoPickThreshold: 91,
        rollingStorageSinkEnabled: true,
        rollingStorageSinkMode: 'selected',
        rollingStorageSinkSetId: 20995,
        rollingStorageSinkSetName: '1 of 3 95+ Player Pick',
        rollingSurplusCraftingEnabled: true,
        rollingProvisionsShortageRecoveryEnabled: true,
        rollingRequiredSpecialRecoveryEnabled: true,
        rollingProtectAllClubNonTotwSpecials: true,
        rollingAllowClubCurrentPoolSpecialsForProvisions: true,
        rollingStoragePressureClubBoostersEnabled: true,
        rollingDuplicateSwapEnabled: true,
        rollingDuplicateSwapMode: 'special-only',
        rollingProvisionsMaxRating: 89,
        rollingRecoveryStorageFirst: true,
        rollingStorageRecoveryPriority: 'storage-pressure',
        rollingOpenDuplicateProvisionsRewards: true,
        rollingShortageProvisionsPackLimit: 2,
      },
      sbcFodderPolicy: { mode: 'low-gold', lowRatedGoldMaxRating: 82 },
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
      pickOptions: {
        autoPickThreshold: 100,
        pickSelectionMode: 'unsupported-mode',
        rollingStorageSinkEnabled: 'yes',
        rollingStorageSinkMode: 'selected',
        rollingStorageSinkSetId: 0,
        rollingStorageSinkSetName: 95,
        rollingSurplusCraftingEnabled: 'yes',
        rollingProvisionsShortageRecoveryEnabled: 'yes',
        rollingRequiredSpecialRecoveryEnabled: 'yes',
        rollingProtectAllClubNonTotwSpecials: 'yes',
        rollingAllowClubCurrentPoolSpecialsForProvisions: 'yes',
        rollingStoragePressureClubBoostersEnabled: 'yes',
        rollingDuplicateSwapEnabled: 'yes',
        rollingDuplicateSwapMode: 'unsafe',
        rollingProvisionsMaxRating: 92,
        rollingRecoveryStorageFirst: 'yes',
        rollingStorageRecoveryPriority: 'invalid',
        rollingShortageProvisionsPackLimit: 31,
        unsupported: true,
      },
      sbcFodderPolicy: { mode: 'named-after-sbc', ratingSbcMaxCardRating: 100, unsupported: true },
      runtimeQuantity: { mode: 'manual', target: 'unknown', min: 5, max: 2 },
    })).toEqual(expect.arrayContaining([
      'pickOptions.autoPickThreshold must be a number between 1 and 99',
      'pickOptions.pickSelectionMode must be one of: rating-auto, rating-review, special-price, special-manual',
      'pickOptions.rollingStorageSinkEnabled must be boolean',
      'pickOptions.rollingStorageSinkSetId must be a positive integer or null',
      'pickOptions.rollingStorageSinkSetName must be a string',
      'pickOptions.rollingStorageSinkSetId is required when mode is selected',
      'pickOptions.rollingSurplusCraftingEnabled must be boolean',
      'pickOptions.rollingProvisionsShortageRecoveryEnabled must be boolean',
      'pickOptions.rollingRequiredSpecialRecoveryEnabled must be boolean',
      'pickOptions.rollingProtectAllClubNonTotwSpecials must be boolean',
      'pickOptions.rollingAllowClubCurrentPoolSpecialsForProvisions must be boolean',
      'pickOptions.rollingStoragePressureClubBoostersEnabled must be boolean',
      'pickOptions.rollingDuplicateSwapEnabled must be boolean',
      'pickOptions.rollingDuplicateSwapMode must be off, special-only, safe-only, or all-eligible',
      'pickOptions.rollingRecoveryStorageFirst must be boolean',
      'pickOptions.rollingStorageRecoveryPriority must be storage-pressure or provisions',
      'pickOptions.rollingProvisionsMaxRating must be one of: 88, 89, 90, 91',
      'pickOptions.rollingShortageProvisionsPackLimit must be an integer between 1 and 30',
      'pickOptions.unsupported is not supported',
      'sbcFodderPolicy.mode must be one of: inherit, auto, low-gold, rating-constrained',
      'sbcFodderPolicy.ratingSbcMaxCardRating must be a number between 1 and 99',
      'sbcFodderPolicy.unsupported is not supported',
      'runtimeQuantity.mode must be one of: user, ea-remaining, exhaust, fixed',
      'runtimeQuantity.target must be one of: maxCompletions, rounds, maxPacks, validationRounds',
      'runtimeQuantity.min must not exceed runtimeQuantity.max',
      'inventoryMode must be one of: inherit, inventory-only, normal',
    ]));
  });

  it('rejects zero quantity opt-in outside the dedicated Rolling strategy', () => {
    const errors = validateLoopDef({
      id: 'generic',
      name: 'Generic',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['Generic'],
      runtimeQuantity: {
        mode: 'user', target: 'maxCompletions', default: 0, min: 0, max: 50, allowZero: true,
      },
    });
    expect(errors).toContain('runtimeQuantity.allowZero is only supported by strategy rollingUpgrade');
    expect(errors).toContain('runtimeQuantity.default must be an integer between 1 and 1000');
    expect(errors).toContain('runtimeQuantity.min must be an integer between 1 and 1000');
  });
});
