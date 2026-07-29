import { describe, expect, it } from 'vitest';
import {
  activateBuilderProfile,
  activateSavedBuilderProfile,
  BUILDER_STARTER_PROFILE_IDS,
  builderObjectSources,
  createBuilderProfile,
  createBuilderStore,
  deactivateBuilderProfile,
  exportBuilderProfileJson,
  fingerprintBuilderValue,
  importBuilderProfileJson,
  materializeBuilderProfile,
  normalizeBuilderStore,
  refreshBuilderDynamicBindings,
  resolveBuilderProfileConflict,
  updateBuilderProfileDraft,
  validateBuilderProfile,
} from '../../src/config/builder-profile.js';
import { LOOP_DEFS } from '../../src/config/loops.js';
import {
  DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
  RECOVERY_RECIPES,
  UNASSIGNED_RECOVERY_POLICIES,
} from '../../src/config/recovery.js';

function config(overrides = {}) {
  return {
    loops: [
      { id: 'base', name: 'Base', strategy: 'workflowRoutine', steps: [{ loopId: 'child' }], openRewardPacks: false },
      { id: 'child', name: 'Child', strategy: 'fillAndVerifySbc', sbcNames: ['Child SBC'], maxCompletions: 1 },
    ],
    recoveryRecipes: [],
    unassignedRecoveryPolicies: [],
    defaultUnassignedRecoveryPolicyIds: [],
    ...overrides,
  };
}

describe('Builder profiles', () => {
  it('creates the official starter profiles', () => {
    const base = config();
    base.loops.push(
      {
        id: 'daily-bronze',
        name: 'Daily Bronze',
        strategy: 'dailySingleCardRecycle',
        sbcNames: ['Daily Bronze'],
        targetDuplicate: { tier: 'bronze', playerOnly: true, allowSpecial: false },
      },
      {
        id: 'daily-common',
        name: 'Daily Common',
        strategy: 'supplyAndCraft',
        sbcNames: ['Daily Common'],
        requirements: [{ tier: 'silver', count: 5 }, { tier: 'bronze', count: 5 }],
      },
      {
        id: 'daily-rare',
        name: 'Daily Rare',
        strategy: 'supplyAndCraft',
        sbcNames: ['Daily Rare'],
        requirements: [{ tier: 'gold', rarity: 'common', count: 5 }],
      },
    );
    const store = createBuilderStore({ baseConfig: base, now: 1 });
    expect(store.profiles.map((profile) => profile.id)).toEqual([
      BUILDER_STARTER_PROFILE_IDS.default,
      BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly,
      BUILDER_STARTER_PROFILE_IDS.dailyRarePack2x84,
    ]);
    const inventoryOnly = store.profiles.find((profile) => profile.id === BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly);
    expect(inventoryOnly.savedConfig.loops.find((loop) => loop.id === 'base').inventoryMode).toBe('normal');
    expect(inventoryOnly.savedConfig.loops.find((loop) => loop.id === 'daily-bronze').inventoryMode).toBe('inventory-only');
    expect(inventoryOnly.savedConfig.loops.find((loop) => loop.id === 'daily-common').inventoryMode).toBe('inventory-only');
    expect(inventoryOnly.savedConfig.loops.find((loop) => loop.id === 'daily-rare').inventoryMode).toBe('normal');
    expect(inventoryOnly.savedConfig.loops.find((loop) => loop.id === 'child').inventoryMode).toBeUndefined();
    expect(validateBuilderProfile(inventoryOnly, base).valid).toBe(true);
  });

  it('scopes the bronze/silver starter against the complete built-in configuration', () => {
    const builtIns = {
      loops: LOOP_DEFS,
      recoveryRecipes: RECOVERY_RECIPES,
      unassignedRecoveryPolicies: UNASSIGNED_RECOVERY_POLICIES,
      defaultUnassignedRecoveryPolicyIds: DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
    };
    const store = createBuilderStore({ baseConfig: builtIns });
    const profile = store.profiles.find((entry) => entry.id === BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly);
    const modes = new Map(profile.savedConfig.loops.map((loop) => [loop.id, loop.inventoryMode]));
    for (const id of [
      'daily-bronze', 'daily-bronze-mvp',
      'daily-silver', 'daily-silver-mvp',
      'daily-common', 'daily-common-mvp',
    ]) {
      expect(modes.get(id), id).toBe('inventory-only');
    }
    for (const id of ['one-click-daily', 'one-click-daily-mvp', 'daily-rare', 'daily-rare-mvp']) {
      expect(modes.get(id), id).toBe('normal');
    }
    expect(profile.savedConfig.loops.find((loop) => loop.id === 'one-click-daily').steps).toEqual([
      'daily-bronze',
      'daily-silver',
      'daily-common',
      'daily-rare',
    ]);
  });

  it('adds the Rare Pack to 2x84+ stage only in its dedicated starter profile', () => {
    const builtIns = {
      loops: LOOP_DEFS,
      recoveryRecipes: RECOVERY_RECIPES,
      unassignedRecoveryPolicies: UNASSIGNED_RECOVERY_POLICIES,
      defaultUnassignedRecoveryPolicyIds: DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
    };
    const store = createBuilderStore({ baseConfig: builtIns });
    const defaultProfile = store.profiles.find((entry) => entry.id === BUILDER_STARTER_PROFILE_IDS.default);
    const inventoryProfile = store.profiles.find((entry) => entry.id === BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly);
    const rarePackProfile = store.profiles.find((entry) => entry.id === BUILDER_STARTER_PROFILE_IDS.dailyRarePack2x84);
    const workflow = (profile) => profile.savedConfig.loops.find((loop) => loop.id === 'one-click-daily');

    expect(workflow(defaultProfile).steps).toEqual(['daily-bronze', 'daily-silver', 'daily-common', 'daily-rare']);
    expect(workflow(inventoryProfile).steps).toEqual(workflow(defaultProfile).steps);
    expect(workflow(rarePackProfile)).toMatchObject({
      steps: ['daily-bronze', 'daily-silver', 'daily-common', 'daily-rare', 'daily-rare-pack-84'],
      stepOverrides: {
        'daily-rare-pack-84': {
          useRoundsAsCompletions: false,
          sourceExhaustedFallbackMaxCompletions: 1,
        },
      },
    });
  });

  it('adds missing starter profiles without replacing an existing profile with the same id', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.profiles[0].name = 'My Default';
    store.profiles = [store.profiles[0]];
    const normalized = normalizeBuilderStore(store, base);
    expect(normalized.profiles.find((profile) => profile.id === 'default').name).toBe('My Default');
    expect(normalized.profiles.map((profile) => profile.id)).toContain(BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly);
    expect(normalized.profiles.map((profile) => profile.id)).toContain(BUILDER_STARTER_PROFILE_IDS.dailyRarePack2x84);
  });

  it('does not revise untouched official starters when the built-in baseline is unchanged', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base, now: 1 });
    const normalized = normalizeBuilderStore(store, base, { now: 2 });
    expect(normalized.profiles.map((profile) => ({
      id: profile.id,
      draftRevision: profile.draftRevision,
      savedRevision: profile.savedRevision,
      updatedAt: profile.updatedAt,
    }))).toEqual(store.profiles.map((profile) => ({
      id: profile.id,
      draftRevision: profile.draftRevision,
      savedRevision: profile.savedRevision,
      updatedAt: profile.updatedAt,
    })));
  });

  it('refreshes every untouched official starter after obsolete built-ins are removed', () => {
    const current = {
      loops: JSON.parse(JSON.stringify(LOOP_DEFS)),
      recoveryRecipes: JSON.parse(JSON.stringify(RECOVERY_RECIPES)),
      unassignedRecoveryPolicies: JSON.parse(JSON.stringify(UNASSIGNED_RECOVERY_POLICIES)),
      defaultUnassignedRecoveryPolicyIds: [...DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS],
    };
    const obsoleteLoops = Array.from({ length: 4 }, (_, index) => ({
      id: `obsolete-${index + 1}`,
      name: `Obsolete ${index + 1}`,
      strategy: 'fillAndVerifySbc',
      sbcNames: [`Obsolete SBC ${index + 1}`],
      maxCompletions: 1,
    }));
    const previous = { ...current, loops: [...current.loops, ...obsoleteLoops] };
    const store = createBuilderStore({ baseConfig: previous, now: 1 });
    const officialProfileIds = [
      BUILDER_STARTER_PROFILE_IDS.default,
      BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly,
      BUILDER_STARTER_PROFILE_IDS.dailyRarePack2x84,
    ];
    const staleProfile = store.profiles.find((entry) => entry.id === BUILDER_STARTER_PROFILE_IDS.dailyRarePack2x84);
    store.activeProfileId = staleProfile.id;
    store.lastKnownGood = JSON.parse(JSON.stringify(staleProfile.lastKnownGood));

    for (const profileId of officialProfileIds) {
      const staleValidation = validateBuilderProfile(
        store.profiles.find((entry) => entry.id === profileId),
        current,
      );
      expect(staleValidation.conflicts, profileId).toHaveLength(4);
      expect(
        staleValidation.conflicts.every((conflict) => conflict.reason === 'built-in-removed'),
        profileId,
      ).toBe(true);
    }

    const normalized = normalizeBuilderStore(store, current, { now: 2 });
    for (const profileId of officialProfileIds) {
      const officialProfile = normalized.profiles.find((entry) => entry.id === profileId);
      expect(validateBuilderProfile(officialProfile, current).valid, profileId).toBe(true);
      expect(
        officialProfile.lastKnownGood.loops.some((loop) => loop.id.startsWith('obsolete-')),
        profileId,
      ).toBe(false);
    }

    const refreshed = normalized.profiles.find((entry) => entry.id === staleProfile.id);
    const workflow = refreshed.lastKnownGood.loops.find((loop) => loop.id === 'one-click-daily');
    expect(workflow.steps).toEqual([
      'daily-bronze',
      'daily-silver',
      'daily-common',
      'daily-rare',
      'daily-rare-pack-84',
    ]);
    expect(workflow.stepOverrides['daily-rare-pack-84']).toEqual({
      useRoundsAsCompletions: false,
      sourceExhaustedFallbackMaxCompletions: 1,
    });
    expect(normalized.lastKnownGood).toEqual(refreshed.lastKnownGood);
  });

  it('does not replace a customized official starter during built-in migration', () => {
    const current = config();
    const previous = config({
      loops: [
        ...current.loops,
        { id: 'obsolete', name: 'Obsolete', strategy: 'fillAndVerifySbc', sbcNames: ['Obsolete SBC'] },
      ],
    });
    const store = createBuilderStore({ baseConfig: previous, now: 1 });
    const profile = store.profiles.find((entry) => entry.id === BUILDER_STARTER_PROFILE_IDS.default);
    for (const field of ['draftConfig', 'savedConfig', 'lastKnownGood']) {
      profile[field].loops.find((loop) => loop.id === 'base').openRewardPacks = true;
    }

    const normalized = normalizeBuilderStore(store, current, { now: 2 });
    const preserved = normalized.profiles.find((entry) => entry.id === profile.id);
    expect(preserved.lastKnownGood.loops.find((loop) => loop.id === 'base').openRewardPacks).toBe(true);
    expect(preserved.lastKnownGood.loops.some((loop) => loop.id === 'obsolete')).toBe(true);
    expect(validateBuilderProfile(preserved, current).conflicts).toEqual([
      expect.objectContaining({ id: 'obsolete', reason: 'built-in-removed' }),
    ]);
  });

  it('migrates an untouched legacy Inventory Only starter without overwriting customized copies', () => {
    const base = config();
    const legacyConfig = {
      ...base,
      loops: base.loops.map((loop) => loop.strategy === 'workflowRoutine'
        ? { ...loop, inventoryMode: 'inventory-only' }
        : loop),
    };
    const legacy = createBuilderProfile({
      id: 'starter-inventory-only',
      name: 'Inventory Only',
      preset: 'inventory-only',
      baseConfig: base,
      config: legacyConfig,
    });
    const migrated = normalizeBuilderStore({
      schemaVersion: 1,
      activeProfileId: legacy.id,
      activeDynamicBindings: [],
      profiles: [createBuilderProfile({ baseConfig: base }), legacy],
      lastKnownGood: legacyConfig,
    }, base);
    expect(migrated.activeProfileId).toBe(BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly);
    expect(migrated.profiles.map((profile) => profile.id)).not.toContain('starter-inventory-only');

    legacy.name = 'My Inventory Profile';
    const customized = normalizeBuilderStore({ schemaVersion: 1, profiles: [legacy] }, base);
    expect(customized.profiles.map((profile) => profile.id)).toContain('starter-inventory-only');
    expect(customized.profiles.map((profile) => profile.id)).toContain(BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly);
  });

  it('round-trips validated JSON and stable fingerprints', () => {
    const base = config();
    const profile = importBuilderProfileJson(JSON.stringify(base), {
      id: 'imported',
      baseConfig: base,
    });
    expect(JSON.parse(exportBuilderProfileJson(profile, base))).toEqual(base);
    expect(fingerprintBuilderValue(base)).toBe(fingerprintBuilderValue(JSON.parse(JSON.stringify(base))));
    expect(builderObjectSources(profile, base).loops.map((entry) => entry.source)).toEqual(['built-in', 'built-in']);
  });

  it('round-trips the complete built-in configuration without dropping nested fields', () => {
    const builtIns = {
      loops: LOOP_DEFS,
      recoveryRecipes: RECOVERY_RECIPES,
      unassignedRecoveryPolicies: UNASSIGNED_RECOVERY_POLICIES,
      defaultUnassignedRecoveryPolicyIds: DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
    };
    const profile = importBuilderProfileJson(JSON.stringify(builtIns), {
      id: 'all-built-ins',
      baseConfig: builtIns,
    });
    expect(JSON.parse(exportBuilderProfileJson(profile, builtIns))).toEqual(JSON.parse(JSON.stringify(builtIns)));
  });

  it('inherits untouched built-in changes and preserves profile changes', () => {
    const base = config();
    const profileConfig = config({
      loops: [
        { ...base.loops[0], openRewardPacks: true },
        base.loops[1],
        { id: 'custom', name: 'Custom', strategy: 'fillAndVerifySbc', sbcNames: ['Custom SBC'] },
      ],
    });
    const profile = createBuilderProfile({ baseConfig: base, config: profileConfig });
    const current = config({
      loops: [
        { ...base.loops[0], name: 'Updated Base' },
        { ...base.loops[1], maxCompletions: 3 },
        { id: 'new-built-in', name: 'New', strategy: 'fillAndVerifySbc', sbcNames: ['New SBC'] },
      ],
    });
    const result = materializeBuilderProfile(profile, current);
    expect(result.conflicts).toEqual([]);
    expect(result.config.loops.find((loop) => loop.id === 'base')).toMatchObject({ name: 'Updated Base', openRewardPacks: true });
    expect(result.config.loops.find((loop) => loop.id === 'child').maxCompletions).toBe(3);
    expect(result.config.loops.map((loop) => loop.id)).toContain('custom');
    expect(result.config.loops.map((loop) => loop.id)).toContain('new-built-in');
  });

  it('reports same-field built-in conflicts and blocks activation', () => {
    const base = config();
    const profile = createBuilderProfile({
      baseConfig: base,
      config: config({ loops: [{ ...base.loops[0], name: 'Mine' }, base.loops[1]] }),
    });
    const current = config({ loops: [{ ...base.loops[0], name: 'Upstream' }, base.loops[1]] });
    const validation = validateBuilderProfile(profile, current);
    expect(validation.valid).toBe(false);
    expect(validation.conflicts).toEqual([
      expect.objectContaining({ collection: 'loops', id: 'base', path: 'name', reason: 'both-changed' }),
    ]);
    const useBuiltIn = resolveBuilderProfileConflict(profile, current, validation.conflicts[0], 'built-in');
    expect(validateBuilderProfile(useBuiltIn, current).valid).toBe(true);
    expect(materializeBuilderProfile(useBuiltIn, current).config.loops[0].name).toBe('Upstream');
    const keepMine = resolveBuilderProfileConflict(profile, current, validation.conflicts[0], 'profile');
    expect(validateBuilderProfile(keepMine, current).valid).toBe(true);
    expect(materializeBuilderProfile(keepMine, current).config.loops[0].name).toBe('Mine');
  });

  it('keeps drafts separate and activates only a valid saved revision', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base, now: 1 });
    const profile = updateBuilderProfileDraft(store.profiles[0], {
      ...base,
      loops: [...base.loops, { id: 'extra', name: 'Extra', strategy: 'fillAndVerifySbc', sbcNames: ['Extra SBC'] }],
    }, 2);
    expect(profile.draftRevision).toBeGreaterThan(profile.savedRevision);
    const activated = activateBuilderProfile(store, profile, base);
    expect(activated.store.activeProfileId).toBe('default');
    expect(activated.profile.savedRevision).toBe(activated.profile.draftRevision);
    expect(activated.config.loops.map((loop) => loop.id)).toContain('extra');
  });

  it('activates only the saved revision and never leaks a later draft', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.profiles[0].draftConfig.loops.push({
      id: 'draft-only', name: 'Draft only', strategy: 'fillAndVerifySbc', sbcNames: ['Draft SBC'],
    });
    const activated = activateSavedBuilderProfile(store, 'default', base);
    expect(activated.config.loops.map((loop) => loop.id)).not.toContain('draft-only');
    expect(activated.store.activeProfileId).toBe('default');
  });

  it('deactivates a profile without deleting its saved configuration', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.activeProfileId = 'default';
    const deactivated = deactivateBuilderProfile(store);
    expect(deactivated.activeProfileId).toBeNull();
    expect(deactivated.activeDynamicBindings).toEqual([]);
    expect(deactivated.profiles).toEqual(store.profiles);
  });

  it('requires dynamic Pick bindings to refresh before materialization', () => {
    const base = config();
    const dynamic = {
      id: 'dynamic-pick',
      name: 'Dynamic Pick',
      strategy: 'playerPickSbc',
      sbcNames: ['Dynamic Pick'],
      pickItemNames: ['Dynamic Pick Item'],
      sbcSetIds: [99],
      pickItemResourceIds: [500],
      requirements: [{ tier: 'gold', count: 1 }],
    };
    const profile = createBuilderProfile({
      baseConfig: base,
      config: { ...base, loops: [...base.loops, dynamic] },
      dynamicBindings: [{ loopId: 'dynamic-pick', sbcSetIds: [99], definition: dynamic }],
    });
    expect(materializeBuilderProfile(profile, base).unavailableBindings).toHaveLength(1);
    const refreshed = refreshBuilderDynamicBindings(profile, [dynamic], 10);
    const result = materializeBuilderProfile(refreshed, base);
    expect(result.unavailableBindings).toEqual([]);
    expect(result.config.loops.find((loop) => loop.id === 'dynamic-pick')).toEqual(dynamic);
    expect(builderObjectSources(refreshed, base).loops.find((entry) => entry.id === 'dynamic-pick').source).toBe('dynamic');
  });

  it('refreshes dynamic Upgrade bindings by Set or Pack reward identity', () => {
    const base = config();
    const dynamic = {
      id: 'discovered-upgrade-900-high-rated-x10-85',
      name: '10x 85+ Upgrade',
      strategy: 'fillAndVerifySbc',
      discoveryKind: 'upgrade',
      sbcNames: ['10x 85+ Upgrade'],
      sbcSetIds: [900],
      rewardPackIds: [300],
      ratingSbcFill: { targetRating: 88, priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
    };
    const profile = createBuilderProfile({
      baseConfig: base,
      config: { ...base, loops: [...base.loops, dynamic] },
      dynamicBindings: [{ loopId: 'old-upgrade-id', rewardPackIds: [300], definition: dynamic }],
    });
    const refreshed = refreshBuilderDynamicBindings(profile, [{ ...dynamic, id: 'new-upgrade-id' }], 10);
    expect(refreshed.dynamicBindings[0]).toMatchObject({ available: true, lastSeenAt: 10 });
    expect(refreshed.dynamicBindings[0].definition.id).toBe('new-upgrade-id');
  });

  it('normalizes stale persisted dynamic availability to unavailable', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.profiles[0].dynamicBindings = [{ loopId: 'pick', available: true, definition: { id: 'pick' } }];
    const normalized = normalizeBuilderStore(store, base);
    expect(normalized.profiles[0].dynamicBindings[0].available).toBe(false);
  });

  it('preserves an invalid autosaved draft while retaining the valid startup revision', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.activeProfileId = 'default';
    store.profiles[0].draftConfig = {
      ...base,
      loops: [base.loops[0], { ...base.loops[1], sbcNames: [] }],
    };
    store.profiles[0].draftRevision = 2;

    const normalized = normalizeBuilderStore(store, base);
    expect(normalized.activeProfileId).toBe('default');
    expect(normalized.profiles[0].draftConfig.loops[1].sbcNames).toEqual([]);
    expect(normalized.profiles[0].lastKnownGood).toEqual(base);
    expect(validateBuilderProfile(normalized.profiles[0], base).valid).toBe(false);
  });

  it('drops corrupt persisted profiles and falls back to a built-in default', () => {
    const base = config();
    const normalized = normalizeBuilderStore({
      schemaVersion: 1,
      activeProfileId: 'broken',
      profiles: [{ id: 'broken', draftConfig: { loops: 'invalid' } }],
    }, base);
    expect(normalized.activeProfileId).toBeNull();
    expect(normalized.profiles.map((profile) => profile.id)).toEqual([
      BUILDER_STARTER_PROFILE_IDS.default,
      BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly,
      BUILDER_STARTER_PROFILE_IDS.dailyRarePack2x84,
    ]);
    expect(normalized.profiles[0].draftConfig).toEqual(base);
  });
});
