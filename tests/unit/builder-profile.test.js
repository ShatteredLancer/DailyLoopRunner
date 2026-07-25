import { describe, expect, it } from 'vitest';
import {
  activateBuilderProfile,
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
    expect(normalized.profiles).toHaveLength(1);
    expect(normalized.profiles[0].draftConfig).toEqual(base);
  });
});
