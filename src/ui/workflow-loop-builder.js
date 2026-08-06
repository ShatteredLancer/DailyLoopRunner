import { cloneLoopDef } from '../domain/objects.js';
import {
  activateBuilderProfile,
  activateSavedBuilderProfile,
  BUILDER_BUILT_IN_PROFILE_ID,
  builderObjectSources,
  createBuilderProfile,
  createBuilderStore,
  deactivateBuilderProfile,
  exportBuilderProfileJson,
  fingerprintBuilderValue,
  importBuilderProfileJson,
  normalizeBuilderStore,
  refreshBuilderDynamicBindings,
  resolveBuilderProfileConflict,
  saveBuilderProfile,
  updateBuilderProfileDraft,
  upsertBuilderProfile,
  validateBuilderProfile,
} from '../config/builder-profile.js';
import {
  addBuilderLoop,
  addBuilderWorkflowStep,
  createBuilderStepVariant,
  duplicateBuilderLoop,
  findBuilderReferences,
  findBuilderRecoveryReferences,
  moveBuilderWorkflowStep,
  removeBuilderLoop,
  removeBuilderRecovery,
  removeBuilderWorkflowStep,
  renameBuilderLoopId,
  renameBuilderRecoveryId,
  setBuilderPath,
  setBuilderWorkflowStepPath,
} from '../config/builder-editor.js';
import { normalizeLoopConfig, validateLoopConfig } from '../config/loop-schema.js';
import {
  mountWorkflowLoopBuilder,
  workflowLoopBuilderHtml,
} from './workflow-loop-builder-view.js';

function clone(value) {
  return cloneLoopDef(value);
}

function pathValue(object, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], object);
}

function replaceById(items, id, replacement) {
  return items.map((item) => String(item.id) === String(id) ? replacement : item);
}

const BUILDER_COLLECTIONS = Object.freeze(['loops', 'recoveryRecipes', 'unassignedRecoveryPolicies']);

function uniqueProfileId(store, name) {
  const base = String(name || 'profile').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile';
  const ids = new Set((store.profiles || []).map((profile) => profile.id));
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function defaultRequirement() {
  return { tier: 'gold', count: 1, playerOnly: true, allowSpecial: false };
}

function defaultUpgrade(stage = false, index = 0) {
  return {
    ...(stage ? { id: `stage-${index + 1}` } : {}),
    name: stage ? `Stage ${index + 1}` : `Upgrade ${index + 1}`,
    sbcNames: ['SBC name'],
    requirements: [defaultRequirement()],
    ...(stage ? { maxCompletions: 1 } : {}),
  };
}

function normalizeFieldValue(element) {
  const valueType = element?.dataset?.builderValueType || element?.type || 'text';
  const raw = element?.value;
  if (valueType === 'boolean-inherit') {
    if (raw === '') return undefined;
    return raw === 'true';
  }
  if (valueType === 'object-toggle') {
    if (raw === '') return undefined;
    return raw === 'true' ? {} : false;
  }
  if (valueType === 'string-list') {
    return [...(element?.selectedOptions || [])].map((option) => option.value).filter(Boolean);
  }
  if (valueType === 'number') return raw === '' ? undefined : Number(raw);
  if (element?.tagName === 'SELECT' && raw === '') return undefined;
  if (raw === '' && ['special-kind', 'loop-reference'].includes(valueType)) return undefined;
  return raw;
}

function firstObjectForTab(config, tab, discoveredLoops = []) {
  if (tab === 'workflows') return { kind: 'loops', object: config.loops.find((loop) => ['dailyRoutine', 'workflowRoutine'].includes(loop.strategy)) || null };
  if (tab === 'loops') return { kind: 'loops', object: config.loops.find((loop) => !['dailyRoutine', 'workflowRoutine'].includes(loop.strategy)) || null };
  if (tab === 'dynamic') return { kind: 'dynamic', object: discoveredLoops[0] || null };
  if (tab === 'recovery') return config.recoveryRecipes.length
    ? { kind: 'recoveryRecipes', object: config.recoveryRecipes[0] }
    : { kind: 'unassignedRecoveryPolicies', object: config.unassignedRecoveryPolicies[0] || null };
  return { kind: null, object: null };
}

export function createWorkflowLoopBuilder(options = {}) {
  const dom = options.dom;
  const builtInConfig = () => clone(normalizeLoopConfig(options.getBuiltInConfig?.()));
  const mounted = mountWorkflowLoopBuilder({ dom });
  const root = mounted.root;
  let store = normalizeBuilderStore(options.loadStore?.(), builtInConfig(), { now: options.now?.() });
  let profileId = store.activeProfileId || store.profiles[0].id;
  let tab = 'workflows';
  let selectedKind = null;
  let selectedId = null;
  let selectedStep = null;
  let search = '';
  let jsonInput = '';
  let jsonMessage = '';
  let jsonValid = false;
  let importedProfile = null;
  let previewOpen = false;
  let mobileSection = 'library';
  let mobileActionsOpen = false;
  const editableBuiltIns = new Set();
  const profileHistory = new Map();

  function now() {
    return Number(options.now?.() || Date.now());
  }

  function discoveredLoops() {
    return clone(options.getDiscoveredLoops?.() || []);
  }

  function profile() {
    return store.profiles.find((entry) => entry.id === profileId) || store.profiles[0];
  }

  function persist() {
    const snapshot = clone(store);
    options.saveStore?.(snapshot);
    options.onStoreChange?.(snapshot);
  }

  function setProfile(nextProfile, persistNow = true) {
    store = upsertBuilderProfile(store, nextProfile);
    profileId = nextProfile.id;
    if (persistNow) persist();
  }

  function history(profileKey = profileId) {
    if (!profileHistory.has(profileKey)) profileHistory.set(profileKey, { undo: [], redo: [] });
    return profileHistory.get(profileKey);
  }

  function setEditedProfile(nextProfile) {
    const current = profile();
    if (JSON.stringify(current) === JSON.stringify(nextProfile)) return false;
    const currentHistory = history();
    currentHistory.undo.push(clone(current));
    if (currentHistory.undo.length > 50) currentHistory.undo.shift();
    currentHistory.redo = [];
    setProfile(nextProfile);
    return true;
  }

  function setDraftConfig(config) {
    return setEditedProfile(updateBuilderProfileDraft(profile(), config, now()));
  }

  function undoDraft() {
    const currentHistory = history();
    const previous = currentHistory.undo.pop();
    if (!previous) return false;
    currentHistory.redo.push(clone(profile()));
    setProfile(previous);
    selectedKind = null;
    selectedId = null;
    selectedStep = null;
    render();
    return true;
  }

  function redoDraft() {
    const currentHistory = history();
    const next = currentHistory.redo.pop();
    if (!next) return false;
    currentHistory.undo.push(clone(profile()));
    setProfile(next);
    selectedKind = null;
    selectedId = null;
    selectedStep = null;
    render();
    return true;
  }

  function selectedObject(config) {
    if (selectedKind === 'loops') return config.loops.find((loop) => String(loop.id) === String(selectedId)) || null;
    if (selectedKind === 'dynamic') return discoveredLoops().find((loop) => String(loop.id) === String(selectedId)) || null;
    if (selectedKind === 'recoveryRecipes') return config.recoveryRecipes.find((item) => String(item.id) === String(selectedId)) || null;
    if (selectedKind === 'unassignedRecoveryPolicies') return config.unassignedRecoveryPolicies.find((item) => String(item.id) === String(selectedId)) || null;
    return null;
  }

  function ensureSelection(config) {
    const selected = selectedObject(config);
    if (selected || tab === 'json') return selected;
    const first = firstObjectForTab(config, tab, discoveredLoops());
    selectedKind = first.kind;
    selectedId = first.object?.id || null;
    selectedStep = null;
    return first.object;
  }

  function sourceFor(config, kind, id, sources) {
    if (kind === 'dynamic') return 'dynamic';
    return sources[kind]?.find((entry) => entry.id === String(id))?.source || 'custom';
  }

  function editableKey(kind = selectedKind, id = selectedId) {
    return `${profileId}:${kind}:${id}`;
  }

  function displayConfig(currentProfile, validation, sources) {
    const config = clone(normalizeLoopConfig(currentProfile.draftConfig));
    for (const collection of BUILDER_COLLECTIONS) {
      const effective = new Map((validation.config[collection] || []).map((item) => [String(item.id), item]));
      const sourceMap = new Map((sources[collection] || []).map((entry) => [String(entry.id), entry.source]));
      config[collection] = (config[collection] || []).map((item) => {
        const source = sourceMap.get(String(item.id));
        return ['built-in', 'override', 'dynamic'].includes(source) && effective.has(String(item.id))
          ? clone(effective.get(String(item.id)))
          : item;
      });
      const ids = new Set(config[collection].map((item) => String(item.id)));
      for (const item of validation.config[collection] || []) {
        const id = String(item.id);
        if (ids.has(id)) continue;
        config[collection].push(clone(item));
        sources[collection] = [...(sources[collection] || []), { id, source: 'built-in', current: true }];
        ids.add(id);
      }
    }
    config.defaultUnassignedRecoveryPolicyIds = clone(validation.config.defaultUnassignedRecoveryPolicyIds);
    return config;
  }

  function buildModel() {
    const currentProfile = profile();
    const validation = validateBuilderProfile(currentProfile, builtInConfig());
    const sources = builderObjectSources(currentProfile, builtInConfig());
    const config = displayConfig(currentProfile, validation, sources);
    const object = ensureSelection(config);
    const selectedSource = sourceFor(config, selectedKind, selectedId, sources);
    const editorReadOnly = selectedKind === 'dynamic' || selectedSource === 'dynamic'
      || (selectedSource === 'built-in' && !editableBuiltIns.has(editableKey()));
    const rawStep = selectedKind === 'loops' && Array.isArray(object?.steps) && selectedStep !== null
      ? object.steps[selectedStep]
      : null;
    const selectedStepData = typeof rawStep === 'string' ? { loopId: rawStep } : rawStep;
    return {
      store,
      profile: currentProfile,
      tab,
      search,
      config,
      discoveredLoops: discoveredLoops(),
      sources,
      selectedKind,
      selectedId,
      selectedObject: object,
      selectedSource,
      selectedStep,
      selectedStepData,
      editorReadOnly,
      references: selectedKind === 'loops' && object
        ? findBuilderReferences(config, object.id)
        : ['recoveryRecipes', 'unassignedRecoveryPolicies'].includes(selectedKind) && object
          ? findBuilderRecoveryReferences(config, selectedKind, object.id)
          : [],
      validation,
      generatedJson: `${JSON.stringify(validation.config, null, 2)}\n`,
      jsonInput,
      jsonMessage,
      jsonValid,
      previewOpen,
      mobileSection,
      mobileActionsOpen,
      canUndo: history().undo.length > 0,
      canRedo: history().redo.length > 0,
    };
  }

  function render() {
    root.innerHTML = workflowLoopBuilderHtml(buildModel());
  }

  function open(requestedTab = tab) {
    tab = requestedTab;
    previewOpen = false;
    selectedKind = null;
    selectedId = null;
    selectedStep = null;
    mobileSection = 'library';
    mobileActionsOpen = false;
    const refreshed = refreshBuilderDynamicBindings(profile(), discoveredLoops(), now());
    setProfile(refreshed, false);
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    render();
    return true;
  }

  function close() {
    previewOpen = false;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    return true;
  }

  function updateSelectedObject(mutator) {
    const config = clone(profile().draftConfig);
    const object = selectedObject(config);
    if (!object || selectedKind === 'dynamic') return false;
    const updated = mutator(clone(object));
    if (!updated) return false;
    config[selectedKind] = replaceById(config[selectedKind], object.id, updated);
    setDraftConfig(config);
    selectedId = updated.id;
    render();
    return true;
  }

  function updateList(path, updater) {
    const stepPath = selectedKind === 'loops' && selectedStep !== null
      ? String(path).match(new RegExp(`^steps\\.${selectedStep}\\.(.+)$`))
      : null;
    if (stepPath) {
      const config = profile().draftConfig;
      const workflow = config.loops.find((loop) => String(loop.id) === String(selectedId));
      const rawStep = workflow?.steps?.[selectedStep];
      const step = typeof rawStep === 'string' ? { loopId: rawStep } : rawStep;
      const previous = pathValue(step, stepPath[1]);
      setDraftConfig(setBuilderWorkflowStepPath(
        config,
        selectedId,
        selectedStep,
        stepPath[1],
        updater(Array.isArray(previous) ? [...previous] : []),
      ));
      render();
      return true;
    }
    return updateSelectedObject((object) => {
      const previous = pathValue(object, path);
      return setBuilderPath(object, path, updater(Array.isArray(previous) ? [...previous] : []));
    });
  }

  function handleFieldChange(element) {
    const path = element.dataset.builderField;
    if (!path) return;
    const value = normalizeFieldValue(element);
    const stepPath = selectedKind === 'loops' && selectedStep !== null
      ? path.match(new RegExp(`^steps\\.${selectedStep}\\.(.+)$`))
      : null;
    if (stepPath) {
      setDraftConfig(setBuilderWorkflowStepPath(
        profile().draftConfig,
        selectedId,
        selectedStep,
        stepPath[1],
        value,
      ));
      render();
      return;
    }
    if (selectedKind === 'loops' && path === 'id') {
      const renamed = renameBuilderLoopId(profile().draftConfig, selectedId, value);
      setDraftConfig(renamed.config);
      selectedId = renamed.id;
      render();
      return;
    }
    if (['recoveryRecipes', 'unassignedRecoveryPolicies'].includes(selectedKind) && path === 'id') {
      const renamed = renameBuilderRecoveryId(profile().draftConfig, selectedKind, selectedId, value);
      setDraftConfig(renamed.config);
      selectedId = renamed.id;
      render();
      return;
    }
    updateSelectedObject((object) => setBuilderPath(object, path, value));
  }

  function toggleDefaultRecoveryPolicy(element) {
    const policyId = String(element?.dataset?.policyId || '');
    if (!policyId) return;
    const config = clone(profile().draftConfig);
    const ids = new Set(config.defaultUnassignedRecoveryPolicyIds || []);
    if (element.value === 'true') ids.add(policyId);
    else ids.delete(policyId);
    config.defaultUnassignedRecoveryPolicyIds = [...ids];
    setDraftConfig(config);
    render();
  }

  function newObject() {
    const config = clone(profile().draftConfig);
    if (tab === 'workflows') {
      const result = addBuilderLoop(config, 'workflowRoutine', { name: 'Custom Workflow' });
      setDraftConfig(result.config);
      selectedKind = 'loops';
      selectedId = result.loop.id;
      editableBuiltIns.add(editableKey('loops', selectedId));
      render();
      return;
    }
    if (tab === 'loops') {
      const strategy = root.querySelector('#dlr-builder-new-strategy')?.value || 'fillAndVerifySbc';
      const result = addBuilderLoop(config, strategy, { name: 'Custom Loop' });
      setDraftConfig(result.config);
      selectedKind = 'loops';
      selectedId = result.loop.id;
      render();
      return;
    }
    if (tab === 'recovery') {
      const type = root.querySelector('#dlr-builder-new-recovery-type')?.value || 'recipe';
      if (type === 'policy') {
        const id = `custom-policy-${config.unassignedRecoveryPolicies.length + 1}`;
        config.unassignedRecoveryPolicies.push({ id, match: { tier: 'gold', playerOnly: true, allowSpecial: false }, steps: [{ recipeId: config.recoveryRecipes[0]?.id || '' }] });
        selectedKind = 'unassignedRecoveryPolicies';
        selectedId = id;
      } else {
        const id = `custom-recovery-${config.recoveryRecipes.length + 1}`;
        config.recoveryRecipes.push({
          id,
          name: 'Custom Recovery',
          sbcNames: ['SBC name'],
          requirements: [defaultRequirement()],
          maxSubmissions: 1,
          mustConsumeTrigger: true,
          onUnavailable: 'continue',
          onInsufficient: 'continue',
          onBlocked: 'stop',
        });
        selectedKind = 'recoveryRecipes';
        selectedId = id;
      }
      setDraftConfig(config);
      render();
    }
  }

  function duplicateObject() {
    if (selectedKind === 'loops') {
      const config = clone(profile().draftConfig);
      const hadSource = config.loops.some((loop) => String(loop.id) === String(selectedId));
      if (!hadSource) {
        const effective = validateBuilderProfile(profile(), builtInConfig()).config.loops
          .find((loop) => String(loop.id) === String(selectedId));
        if (!effective) throw new Error(`Loop not found: ${selectedId}`);
        config.loops.push(clone(effective));
      }
      const result = duplicateBuilderLoop(config, selectedId);
      if (!hadSource) result.config.loops = result.config.loops.filter((loop) => String(loop.id) !== String(selectedId));
      setDraftConfig(result.config);
      selectedId = result.loop.id;
      selectedKind = 'loops';
      render();
      return;
    }
    if (!['recoveryRecipes', 'unassignedRecoveryPolicies'].includes(selectedKind)) return;
    const config = clone(profile().draftConfig);
    let source = config[selectedKind].find((item) => String(item.id) === String(selectedId));
    if (!source) {
      source = validateBuilderProfile(profile(), builtInConfig()).config[selectedKind]
        .find((item) => String(item.id) === String(selectedId));
    }
    if (!source) return;
    const ids = new Set(config[selectedKind].map((item) => String(item.id)));
    let index = 2;
    let id = `${source.id}-copy`;
    while (ids.has(id)) id = `${source.id}-copy-${index++}`;
    const copy = { ...clone(source), id, ...(source.name ? { name: `${source.name} Copy` } : {}) };
    config[selectedKind].push(copy);
    setDraftConfig(config);
    selectedId = id;
    render();
  }

  function resetObject() {
    const config = clone(profile().draftConfig);
    const current = builtInConfig()[selectedKind]?.find((item) => String(item.id) === String(selectedId));
    if (!current) return;
    config[selectedKind] = replaceById(config[selectedKind], selectedId, clone(current));
    editableBuiltIns.delete(editableKey());
    setDraftConfig(config);
    render();
  }

  function deleteObject() {
    if (selectedKind === 'loops') {
      const next = removeBuilderLoop(profile().draftConfig, selectedId);
      setDraftConfig(next);
      selectedId = null;
      render();
      return;
    }
    if (!['recoveryRecipes', 'unassignedRecoveryPolicies'].includes(selectedKind)) return;
    setDraftConfig(removeBuilderRecovery(profile().draftConfig, selectedKind, selectedId));
    selectedId = null;
    render();
  }

  function bindDynamic() {
    if (selectedKind !== 'dynamic') return;
    const definition = selectedObject(profile().draftConfig);
    if (!definition) return;
    const currentProfile = clone(profile());
    const config = clone(currentProfile.draftConfig);
    const existing = config.loops.findIndex((loop) => String(loop.id) === String(definition.id));
    if (existing >= 0) config.loops[existing] = clone(definition);
    else config.loops.push(clone(definition));
    currentProfile.dynamicBindings = [
      ...(currentProfile.dynamicBindings || []).filter((binding) => binding.loopId !== definition.id),
      {
        id: definition.id,
        loopId: definition.id,
        sbcSetIds: clone(definition.sbcSetIds || []),
        pickItemResourceIds: clone(definition.pickItemResourceIds || []),
        rewardPackIds: clone(definition.rewardPackIds || []),
        discoveryKind: String(definition.discoveryKind || ''),
        definition: clone(definition),
        available: true,
        lastSeenAt: now(),
      },
    ];
    const updated = updateBuilderProfileDraft(currentProfile, config, now());
    setEditedProfile(updated);
    tab = 'loops';
    selectedKind = 'loops';
    selectedId = definition.id;
    render();
  }

  function unbindDynamic() {
    if (selectedKind !== 'loops') return;
    const currentProfile = clone(profile());
    const binding = (currentProfile.dynamicBindings || [])
      .find((entry) => String(entry.loopId) === String(selectedId));
    if (!binding) return;
    const references = findBuilderReferences(currentProfile.draftConfig, binding.loopId);
    if (references.length) {
      throw new Error(`Dynamic SBC ${binding.loopId} is referenced by ${references.length} Workflow location(s); remove those steps first`);
    }
    const config = clone(currentProfile.draftConfig);
    config.loops = config.loops.filter((loop) => String(loop.id) !== String(binding.loopId));
    currentProfile.dynamicBindings = currentProfile.dynamicBindings
      .filter((entry) => String(entry.loopId) !== String(binding.loopId));
    setEditedProfile(updateBuilderProfileDraft(currentProfile, config, now()));
    selectedId = null;
    render();
  }

  function saveProfile() {
    try {
      const saved = saveBuilderProfile(profile(), builtInConfig(), now());
      setProfile(saved);
      jsonMessage = 'Profile saved';
      jsonValid = true;
    } catch (error) {
      jsonMessage = error?.message || String(error);
      jsonValid = false;
    }
    render();
  }

  function resolveConflict(index, choice) {
    const validation = validateBuilderProfile(profile(), builtInConfig());
    const conflict = validation.conflicts[Number(index)];
    if (!conflict) throw new Error(`Builder conflict not found: ${index}`);
    setEditedProfile(resolveBuilderProfileConflict(profile(), builtInConfig(), conflict, choice, now()));
    jsonMessage = `Resolved ${conflict.collection}.${conflict.id}${conflict.path ? `.${conflict.path}` : ''}`;
    jsonValid = false;
    render();
  }

  function activateProfile() {
    try {
      const activated = activateBuilderProfile(store, profile(), builtInConfig());
      store = activated.store;
      profileId = activated.profile.id;
      persist();
      options.applyConfig?.(clone(activated.config), `Builder profile: ${activated.profile.name}`);
      jsonMessage = 'Profile activated';
      jsonValid = true;
    } catch (error) {
      jsonMessage = error?.message || String(error);
      jsonValid = false;
    }
    render();
  }

  function validateJson() {
    try {
      importedProfile = importBuilderProfileJson(jsonInput, {
        id: profile().id,
        name: profile().name,
        baseConfig: builtInConfig(),
        now: now(),
      });
      jsonMessage = `Valid configuration with ${importedProfile.draftConfig.loops.length} Loop(s)`;
      jsonValid = true;
    } catch (error) {
      importedProfile = null;
      jsonMessage = error?.message || String(error);
      jsonValid = false;
    }
    render();
  }

  function importedDynamicBindings(currentProfile, config) {
    const loops = new Map((config.loops || []).map((loop) => [String(loop.id || ''), loop]));
    return clone((currentProfile.dynamicBindings || []).filter((binding) => {
      const loop = loops.get(String(binding.loopId || ''));
      return ['playerPickSbc', 'fillAndVerifySbc'].includes(loop?.strategy);
    }));
  }

  function applyImportedDraft(currentProfile, imported) {
    const next = updateBuilderProfileDraft(currentProfile, imported.draftConfig, now());
    next.dynamicBindings = importedDynamicBindings(currentProfile, imported.draftConfig);
    return next;
  }

  function applyJson() {
    if (!importedProfile) validateJson();
    if (!importedProfile) return;
    setEditedProfile(applyImportedDraft(profile(), importedProfile));
    jsonMessage = 'Validated JSON imported into the current draft';
    jsonValid = true;
    render();
  }

  function exportJson() {
    try {
      const text = exportBuilderProfileJson(profile(), builtInConfig());
      options.exportText?.(text, `${profile().id}.loops.json`);
      jsonMessage = 'Generated JSON exported';
      jsonValid = true;
    } catch (error) {
      jsonMessage = error?.message || String(error);
      jsonValid = false;
    }
    render();
  }

  function newProfile() {
    const name = `Profile ${store.profiles.length + 1}`;
    const next = createBuilderProfile({
      id: uniqueProfileId(store, name),
      name,
      baseConfig: builtInConfig(),
      config: builtInConfig(),
      now: now(),
    });
    setProfile(next);
    profileHistory.delete(next.id);
    selectedKind = null;
    selectedId = null;
    render();
  }

  function deleteProfile() {
    if (store.profiles.length <= 1) return;
    const deletedProfileId = profileId;
    const deletedActiveProfile = store.activeProfileId === profileId;
    store = {
      ...store,
      profiles: store.profiles.filter((entry) => entry.id !== profileId),
      activeProfileId: store.activeProfileId === profileId ? null : store.activeProfileId,
      activeDynamicBindings: deletedActiveProfile ? [] : store.activeDynamicBindings,
    };
    profileId = store.profiles[0].id;
    profileHistory.delete(deletedProfileId);
    selectedKind = null;
    selectedId = null;
    persist();
    if (deletedActiveProfile) options.useBuiltIn?.();
    render();
  }

  function handleAction(button) {
    const action = button.dataset.builderAction;
    if (!action) return;
    if (action === 'close-builder') return close();
    if (action === 'toggle-mobile-actions') {
      mobileActionsOpen = !mobileActionsOpen;
      render();
      return;
    }
    if (action === 'select-mobile-section') {
      mobileSection = ['library', 'editor', 'details'].includes(button.dataset.section)
        ? button.dataset.section
        : 'library';
      render();
      return;
    }
    if (action === 'undo-draft') return undoDraft();
    if (action === 'redo-draft') return redoDraft();
    if (action === 'preview-profile') {
      previewOpen = true;
      render();
      return;
    }
    if (action === 'close-preview') {
      previewOpen = false;
      render();
      return;
    }
    if (action === 'show-import') {
      previewOpen = false;
      tab = 'json';
      selectedKind = null;
      selectedId = null;
      selectedStep = null;
      render();
      return;
    }
    if (action === 'select-tab') {
      tab = button.dataset.tab;
      previewOpen = false;
      selectedKind = null;
      selectedId = null;
      selectedStep = null;
      mobileSection = 'library';
      render();
      return;
    }
    if (action === 'select-object') {
      selectedKind = button.dataset.kind;
      selectedId = button.dataset.id;
      selectedStep = null;
      mobileSection = 'editor';
      render();
      return;
    }
    if (action === 'new-object') return newObject();
    if (action === 'duplicate-object') return duplicateObject();
    if (action === 'override-object') {
      const config = clone(profile().draftConfig);
      if (!config[selectedKind]?.some((item) => String(item.id) === String(selectedId))) {
        const effective = validateBuilderProfile(profile(), builtInConfig()).config[selectedKind]
          ?.find((item) => String(item.id) === String(selectedId));
        if (!effective) throw new Error(`Built-in object not found: ${selectedKind}.${selectedId}`);
        config[selectedKind].push(clone(effective));
        const currentProfile = clone(profile());
        currentProfile.baseConfig[selectedKind].push(clone(effective));
        currentProfile.baseFingerprint = fingerprintBuilderValue(currentProfile.baseConfig);
        setEditedProfile(updateBuilderProfileDraft(currentProfile, config, now()));
      }
      editableBuiltIns.add(editableKey());
      render();
      return;
    }
    if (action === 'reset-object') return resetObject();
    if (action === 'delete-object') return deleteObject();
    if (action === 'bind-dynamic') return bindDynamic();
    if (action === 'unbind-dynamic') return unbindDynamic();
    if (action === 'add-list') return updateList(button.dataset.path, (items) => [...items, button.dataset.itemType === 'number' ? 0 : '']);
    if (action === 'add-selected-list') {
      const select = root.querySelector(`[data-builder-add-select="${button.dataset.path}"]`);
      if (select?.value) updateList(button.dataset.path, (items) => [...items, select.value]);
      return;
    }
    if (action === 'remove-list') return updateList(button.dataset.path, (items) => items.filter((_, index) => index !== Number(button.dataset.index)));
    if (action === 'move-list') return updateList(button.dataset.path, (items) => {
      const from = Number(button.dataset.index);
      const to = Math.max(0, Math.min(items.length - 1, from + Number(button.dataset.delta)));
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      return items;
    });
    if (action === 'add-requirement') return updateList(button.dataset.path, (items) => [...items, defaultRequirement()]);
    if (action === 'add-challenge-group') return updateList(button.dataset.path, (items) => [...items, [defaultRequirement()]]);
    if (action === 'add-shortage') return updateList(button.dataset.path, (items) => [...items, { requirement: { tier: 'gold', playerOnly: true, allowSpecial: false }, packNames: ['Source pack'], maxOpensPerAttempt: 1 }]);
    if (action === 'add-upgrade') return updateList(button.dataset.path, (items) => [...items, defaultUpgrade(button.dataset.stage === 'true', items.length)]);
    if (action === 'add-recovery-step') return updateList('steps', (items) => [...items, { recipeId: profile().draftConfig.recoveryRecipes[0]?.id || '' }]);
    if (action === 'add-step') {
      const loopId = root.querySelector('#dlr-builder-add-step-select')?.value;
      if (loopId) setDraftConfig(addBuilderWorkflowStep(profile().draftConfig, selectedId, loopId));
      render();
      return;
    }
    if (action === 'select-step') {
      selectedStep = Number(button.dataset.index);
      mobileSection = 'details';
      render();
      return;
    }
    if (action === 'move-step') {
      const index = Number(button.dataset.index);
      setDraftConfig(moveBuilderWorkflowStep(profile().draftConfig, selectedId, index, index + Number(button.dataset.delta)));
      selectedStep = Math.max(0, index + Number(button.dataset.delta));
      render();
      return;
    }
    if (action === 'remove-step') {
      setDraftConfig(removeBuilderWorkflowStep(profile().draftConfig, selectedId, Number(button.dataset.index)));
      selectedStep = null;
      render();
      return;
    }
    if (action === 'variant-step') {
      const result = createBuilderStepVariant(profile().draftConfig, selectedId, Number(button.dataset.index));
      setDraftConfig(result.config);
      selectedKind = 'loops';
      selectedId = result.loop.id;
      tab = 'loops';
      selectedStep = null;
      mobileSection = 'editor';
      render();
      return;
    }
    if (action === 'validate-profile') {
      const validation = validateBuilderProfile(profile(), builtInConfig());
      jsonMessage = validation.valid ? 'Draft is valid' : validation.errors.join('; ');
      jsonValid = validation.valid;
      render();
      return;
    }
    if (action === 'resolve-conflict') return resolveConflict(button.dataset.index, button.dataset.choice);
    if (action === 'save-profile') return saveProfile();
    if (action === 'activate-profile') return activateProfile();
    if (action === 'validate-json') return validateJson();
    if (action === 'apply-json') return applyJson();
    if (action === 'export-json') return exportJson();
    if (action === 'new-profile') return newProfile();
    if (action === 'delete-profile') return deleteProfile();
  }

  function onClick(event) {
    const button = event.target?.closest?.('[data-builder-action]');
    if (!button || !root.contains(button)) return;
    try { handleAction(button); } catch (error) {
      jsonMessage = error?.message || String(error);
      jsonValid = false;
      options.log?.(`Builder action failed: ${jsonMessage}`);
      render();
    }
  }

  function onChange(event) {
    const element = event.target;
    try {
      if (element?.dataset?.builderAction === 'select-profile') {
        profileId = element.value;
        previewOpen = false;
        selectedKind = null;
        selectedId = null;
        render();
        return;
      }
      if (element?.dataset?.builderAction === 'toggle-default-policy') {
        toggleDefaultRecoveryPolicy(element);
        return;
      }
      if (element?.id === 'dlr-builder-profile-name') {
        const next = { ...clone(profile()), name: String(element.value || '').trim() || profile().name, updatedAt: now() };
        setEditedProfile(next);
        render();
        return;
      }
      if (element?.dataset?.builderField) handleFieldChange(element);
    } catch (error) {
      jsonMessage = error?.message || String(error);
      jsonValid = false;
      options.log?.(`Builder edit failed: ${jsonMessage}`);
      render();
    }
  }

  function onInput(event) {
    if (event.target?.id === 'dlr-builder-search') {
      search = event.target.value;
      const query = search.trim().toLowerCase();
      root.querySelectorAll('.dlr-builder-library-row').forEach((row) => {
        row.style.display = !query || String(row.textContent || '').toLowerCase().includes(query) ? '' : 'none';
      });
    }
    if (event.target?.id === 'dlr-builder-json-input') {
      jsonInput = event.target.value;
      importedProfile = null;
      jsonMessage = '';
      jsonValid = false;
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.setAttribute('aria-hidden', 'true');

  function importConfigText(text, importOptions = {}) {
    jsonInput = String(text || '');
    importedProfile = importBuilderProfileJson(jsonInput, {
      id: profile().id,
      name: importOptions.name || profile().name,
      baseConfig: builtInConfig(),
      now: now(),
    });
    setEditedProfile(applyImportedDraft(profile(), importedProfile));
    jsonMessage = `Imported ${importedProfile.draftConfig.loops.length} Loop(s)`;
    jsonValid = true;
    if (importOptions.open !== false) open('json');
    return clone(importedProfile.draftConfig);
  }

  function refreshDynamic(nextDiscoveredLoops = discoveredLoops()) {
    const loops = clone(nextDiscoveredLoops);
    const activeBindingSnapshot = refreshBuilderDynamicBindings({
      dynamicBindings: store.activeDynamicBindings || [],
    }, loops, now()).dynamicBindings;
    store = {
      ...store,
      activeDynamicBindings: activeBindingSnapshot,
      profiles: store.profiles.map((entry) => refreshBuilderDynamicBindings(entry, loops, now())),
    };
    persist();
    if (root.classList.contains('open')) render();
    return clone(store);
  }

  function restoreActiveProfile() {
    if (!store.activeProfileId) return { status: 'built-in', config: null };
    const active = store.profiles.find((entry) => entry.id === store.activeProfileId);
    if (!active) return { status: 'missing', config: null };
    const activeConfig = store.lastKnownGood || active.lastKnownGood || active.savedConfig;
    const startupProfile = {
      ...clone(active),
      draftConfig: clone(activeConfig),
      savedConfig: clone(activeConfig),
      dynamicBindings: clone(store.activeDynamicBindings || []),
    };
    const validation = validateBuilderProfile(startupProfile, builtInConfig());
    if (!validation.valid) return { status: 'blocked', errors: validation.errors, config: null };
    options.applyConfig?.(clone(validation.config), `Builder profile: ${active.name}`);
    return { status: 'applied', config: clone(validation.config) };
  }

  function selectRuntimeProfile(nextProfileId) {
    if (String(nextProfileId) === BUILDER_BUILT_IN_PROFILE_ID) {
      useBuiltIn();
      return { status: 'built-in', profileId: null, config: null };
    }
    const activated = activateSavedBuilderProfile(store, nextProfileId, builtInConfig());
    store = activated.store;
    profileId = activated.profile.id;
    persist();
    options.applyConfig?.(clone(activated.config), `Builder profile: ${activated.profile.name}`);
    if (root.classList.contains('open')) render();
    return {
      status: 'applied',
      profileId: activated.profile.id,
      config: clone(activated.config),
    };
  }

  function useBuiltIn() {
    store = deactivateBuilderProfile(store);
    persist();
    options.useBuiltIn?.();
    if (root.classList.contains('open')) render();
    return true;
  }

  function destroy() {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.remove();
    mounted.style?.remove?.();
  }

  return Object.freeze({
    open,
    close,
    undoDraft,
    redoDraft,
    destroy,
    importConfigText,
    refreshDynamic,
    restoreActiveProfile,
    selectRuntimeProfile,
    useBuiltIn,
    listRuntimeProfiles: () => [
      { id: BUILDER_BUILT_IN_PROFILE_ID, name: 'Built-in', builtIn: true },
      ...store.profiles.map((entry) => ({ id: entry.id, name: entry.name, preset: entry.preset || null })),
    ],
    getSelectedRuntimeProfileId: () => store.activeProfileId || BUILDER_BUILT_IN_PROFILE_ID,
    getStore: () => clone(store),
    isOpen: () => root.classList.contains('open'),
    root,
  });
}
