import { describe, expect, it, vi } from 'vitest';
import { createBuilderStore } from '../../src/config/builder-profile.js';
import { createWorkflowLoopBuilder } from '../../src/ui/workflow-loop-builder.js';

function config() {
  return {
    loops: [
      { id: 'flow', name: 'Flow', strategy: 'workflowRoutine', steps: ['child'] },
      { id: 'child', name: 'Child', strategy: 'fillAndVerifySbc', sbcNames: ['SBC'] },
    ],
    recoveryRecipes: [],
    unassignedRecoveryPolicies: [],
    defaultUnassignedRecoveryPolicyIds: [],
  };
}

function classList() {
  const values = new Set();
  return {
    add: (value) => values.add(value),
    remove: (value) => values.delete(value),
    contains: (value) => values.has(value),
  };
}

function harness(storeInput = null, builtInConfig = config(), discoveredLoops = []) {
  const root = {
    innerHTML: '',
    classList: classList(),
    attributes: {},
    listeners: new Map(),
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    removeEventListener(type) { this.listeners.delete(type); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; },
    remove() {},
  };
  const existing = new Map();
  const dom = {
    query: (selector) => selector === '#dlr-workflow-builder' ? root : existing.get(selector) || null,
    create: () => ({ setAttribute() {}, remove() {} }),
    appendToHead() {},
    appendToBody() {},
  };
  const applyConfig = vi.fn();
  const useBuiltIn = vi.fn();
  const saveStore = vi.fn();
  const builder = createWorkflowLoopBuilder({
    dom,
    getBuiltInConfig: () => builtInConfig,
    getDiscoveredLoops: () => discoveredLoops,
    loadStore: () => storeInput,
    saveStore,
    applyConfig,
    useBuiltIn,
    exportText: vi.fn(),
    now: () => 10,
  });
  return { builder, root, applyConfig, saveStore, useBuiltIn };
}

function click(root, dataset) {
  const target = { dataset, closest() { return this; } };
  root.listeners.get('click')({ target });
}

describe('Workflow and Loop Builder controller', () => {
  it('opens and closes without modifying the active runtime configuration', () => {
    const { builder, root, applyConfig } = harness();
    expect(builder.open('loops')).toBe(true);
    expect(root.classList.contains('open')).toBe(true);
    expect(root.innerHTML).toContain('Workflow Builder');
    expect(applyConfig).not.toHaveBeenCalled();
    builder.close();
    expect(root.classList.contains('open')).toBe(false);
  });

  it('shows an unbound scanned Pick in the Dynamic Picks library', () => {
    const dynamic = {
      id: 'dynamic-pick',
      name: 'Dynamic Pick',
      strategy: 'playerPickSbc',
      sbcNames: ['Dynamic Pick'],
      pickItemNames: ['Dynamic Pick Item'],
      sbcSetIds: [99],
      requirements: [{ tier: 'gold', count: 1 }],
    };
    const { builder, root } = harness(null, config(), [dynamic]);

    builder.open('dynamic');

    expect(root.innerHTML).toContain('Dynamic Pick');
    expect(root.innerHTML).toContain('data-kind="dynamic"');
  });

  it('imports validated JSON into a draft without activating it', () => {
    const { builder, applyConfig } = harness();
    const imported = { ...config(), loops: [...config().loops, { id: 'extra', name: 'Extra', strategy: 'fillAndVerifySbc', sbcNames: ['Extra'] }] };
    builder.importConfigText(JSON.stringify(imported), { open: false });
    const profile = builder.getStore().profiles[0];
    expect(profile.draftConfig.loops.map((loop) => loop.id)).toContain('extra');
    expect(profile.savedConfig).toEqual(config());
    expect(profile.lastKnownGood).toEqual(config());
    expect(applyConfig).not.toHaveBeenCalled();
  });

  it('keeps an active runtime on its last activated snapshot after a draft import', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.activeProfileId = 'default';
    store.lastKnownGood = base;
    const { builder, applyConfig } = harness(store);
    const imported = { ...base, loops: [...base.loops, { id: 'extra', name: 'Extra', strategy: 'fillAndVerifySbc', sbcNames: ['Extra'] }] };

    builder.importConfigText(JSON.stringify(imported), { open: false });
    expect(builder.restoreActiveProfile().status).toBe('applied');

    expect(applyConfig).toHaveBeenLastCalledWith(base, 'Builder profile: Default');
  });

  it('does not apply a draft-only dynamic binding during active-profile refresh', () => {
    const base = config();
    const dynamic = {
      id: 'dynamic-pick',
      name: 'Dynamic Pick',
      strategy: 'playerPickSbc',
      sbcNames: ['Dynamic Pick'],
      pickItemNames: ['Dynamic Pick Item'],
      sbcSetIds: [99],
      requirements: [{ tier: 'gold', count: 1 }],
    };
    const store = createBuilderStore({ baseConfig: base });
    store.activeProfileId = 'default';
    store.lastKnownGood = base;
    store.activeDynamicBindings = [];
    store.profiles[0].draftConfig.loops.push(dynamic);
    store.profiles[0].dynamicBindings = [{ loopId: dynamic.id, sbcSetIds: [99], definition: dynamic }];
    const { builder, applyConfig } = harness(store);

    builder.refreshDynamic([dynamic]);
    expect(builder.restoreActiveProfile().status).toBe('applied');

    expect(applyConfig).toHaveBeenLastCalledWith(base, 'Builder profile: Default');
  });

  it('retains an existing dynamic binding when validated JSON keeps that Pick Loop', () => {
    const base = config();
    const dynamic = {
      id: 'dynamic-pick',
      name: 'Dynamic Pick',
      strategy: 'playerPickSbc',
      sbcNames: ['Dynamic Pick'],
      pickItemNames: ['Dynamic Pick Item'],
      sbcSetIds: [99],
      requirements: [{ tier: 'gold', count: 1 }],
    };
    const store = createBuilderStore({ baseConfig: base });
    store.profiles[0].draftConfig.loops.push(dynamic);
    store.profiles[0].savedConfig.loops.push(dynamic);
    store.profiles[0].lastKnownGood.loops.push(dynamic);
    store.profiles[0].dynamicBindings = [{ loopId: dynamic.id, sbcSetIds: [99], definition: dynamic }];
    const { builder } = harness(store, base);

    builder.importConfigText(JSON.stringify({ ...base, loops: [...base.loops, dynamic] }), { open: false });

    expect(builder.getStore().profiles[0].dynamicBindings).toEqual([
      expect.objectContaining({ loopId: dynamic.id, sbcSetIds: [99] }),
    ]);
  });

  it('undoes and redoes draft imports without changing the runtime configuration', () => {
    const { builder, applyConfig } = harness();
    const imported = { ...config(), loops: [...config().loops, { id: 'extra', name: 'Extra', strategy: 'fillAndVerifySbc', sbcNames: ['Extra'] }] };
    builder.importConfigText(JSON.stringify(imported), { open: false });
    expect(builder.getStore().profiles[0].draftConfig.loops.map((loop) => loop.id)).toContain('extra');
    expect(builder.undoDraft()).toBe(true);
    expect(builder.getStore().profiles[0].draftConfig.loops.map((loop) => loop.id)).not.toContain('extra');
    expect(builder.redoDraft()).toBe(true);
    expect(builder.getStore().profiles[0].draftConfig.loops.map((loop) => loop.id)).toContain('extra');
    expect(applyConfig).not.toHaveBeenCalled();
  });

  it('edits Workflow step reward lists without losing a string step Loop reference', () => {
    const { builder, root } = harness();
    builder.open('workflows');
    click(root, { builderAction: 'override-object' });
    click(root, { builderAction: 'select-step', index: '0' });
    click(root, { builderAction: 'add-list', path: 'steps.0.rewardFlow.packNames', itemType: 'text' });
    expect(builder.getStore().profiles[0].draftConfig.loops[0].steps[0]).toEqual({
      loopId: 'child',
      rewardFlow: { packNames: [''] },
    });
  });

  it('restores only a previously active valid profile', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.activeProfileId = 'default';
    const { builder, applyConfig } = harness(store);
    const restored = builder.restoreActiveProfile();
    expect(restored.status).toBe('applied');
    expect(applyConfig).toHaveBeenCalledWith(base, 'Builder profile: Default');
  });

  it('restores the last known good saved config instead of a later dirty draft', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.activeProfileId = 'default';
    store.profiles[0].draftConfig = {
      ...base,
      loops: [...base.loops, { id: 'dirty', name: 'Dirty', strategy: 'fillAndVerifySbc', sbcNames: ['Dirty'] }],
    };
    const { builder, applyConfig } = harness(store);
    expect(builder.restoreActiveProfile().status).toBe('applied');
    expect(applyConfig).toHaveBeenCalledWith(base, 'Builder profile: Default');
  });

  it('loads a saved profile from the runtime selector without applying its dirty draft', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.profiles[0].draftConfig.loops.push({
      id: 'dirty', name: 'Dirty', strategy: 'fillAndVerifySbc', sbcNames: ['Dirty'],
    });
    const { builder, applyConfig } = harness(store);
    const result = builder.selectRuntimeProfile('default');
    expect(result.status).toBe('applied');
    expect(builder.getStore().activeProfileId).toBe('default');
    expect(applyConfig).toHaveBeenCalledWith(base, 'Builder profile: Default');
  });

  it('rejects a saved profile whose dynamic Pick binding is unavailable', () => {
    const base = config();
    const dynamic = {
      id: 'dynamic-pick',
      name: 'Dynamic Pick',
      strategy: 'playerPickSbc',
      sbcNames: ['Dynamic Pick'],
      pickItemNames: ['Dynamic Pick Item'],
      sbcSetIds: [99],
      requirements: [{ tier: 'gold', count: 1 }],
    };
    const store = createBuilderStore({ baseConfig: base });
    store.profiles[0].savedConfig.loops.push(dynamic);
    store.profiles[0].lastKnownGood.loops.push(dynamic);
    store.profiles[0].dynamicBindings = [{ loopId: dynamic.id, sbcSetIds: [99], definition: dynamic }];
    const { builder, applyConfig } = harness(store);
    expect(() => builder.selectRuntimeProfile('default')).toThrow(/dynamic binding\(s\) are unavailable/);
    expect(builder.getStore().activeProfileId).toBeNull();
    expect(applyConfig).not.toHaveBeenCalled();
  });

  it('deactivates the active profile when switching to built-ins', () => {
    const base = config();
    const store = createBuilderStore({ baseConfig: base });
    store.activeProfileId = 'default';
    const { builder, useBuiltIn } = harness(store);
    expect(builder.useBuiltIn()).toBe(true);
    expect(builder.getStore().activeProfileId).toBeNull();
    expect(useBuiltIn).toHaveBeenCalledOnce();
  });

  it('lists built-in, starter, and user profiles for the main selector', () => {
    const { builder } = harness();
    expect(builder.listRuntimeProfiles()).toEqual([
      expect.objectContaining({ id: '__built-in__', name: 'Built-in' }),
      expect.objectContaining({ id: 'default', name: 'Default' }),
      expect.objectContaining({ id: 'starter-bronze-silver-inventory-only', name: 'Bronze/Silver Inventory Only' }),
      expect.objectContaining({ id: 'starter-daily-rare-pack-2x84', name: 'Daily + Rare Pack to 2x84+' }),
    ]);
  });

  it('shows rebased current built-ins instead of stale profile snapshots', () => {
    const old = config();
    old.loops[1] = { ...old.loops[1], name: 'Old Child' };
    const store = createBuilderStore({ baseConfig: old });
    const current = config();
    current.loops.push({ id: 'new-child', name: 'New Child', strategy: 'fillAndVerifySbc', sbcNames: ['New SBC'] });
    const { builder, root } = harness(store, current);
    builder.open('loops');
    expect(root.innerHTML).toContain('Child');
    expect(root.innerHTML).not.toContain('Old Child');
    expect(root.innerHTML).toContain('New Child');
  });

  it('marks stale dynamic Pick bindings unavailable in the library', () => {
    const base = config();
    const dynamic = {
      id: 'dynamic-pick',
      name: 'Dynamic Pick',
      strategy: 'playerPickSbc',
      sbcNames: ['Dynamic Pick'],
      pickItemNames: ['Dynamic Pick Item'],
      sbcSetIds: [99],
      requirements: [{ tier: 'gold', count: 1 }],
    };
    const store = createBuilderStore({ baseConfig: base });
    store.profiles[0].draftConfig.loops.push(dynamic);
    store.profiles[0].dynamicBindings = [{ loopId: dynamic.id, sbcSetIds: [99], definition: dynamic, available: true }];
    const { builder, root } = harness(store, base);
    builder.open('loops');
    expect(root.innerHTML).toContain('playerPickSbc | unavailable');
    expect(root.innerHTML).toContain('dlr-builder-source dynamic unavailable');
  });
});
