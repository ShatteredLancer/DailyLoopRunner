import { cloneLoopDef, isPlainObject } from '../domain/objects.js';
import {
  getLoopStrategyCapabilities,
  INVENTORY_ONLY_CAPABILITIES,
} from '../domain/strategies.js';
import { normalizeLoopConfig, parseLoopConfig, validateLoopConfig } from './loop-schema.js';

export const BUILDER_SCHEMA_VERSION = 1;
export const BUILDER_BUILT_IN_PROFILE_ID = '__built-in__';

export const BUILDER_STARTER_PROFILE_IDS = Object.freeze({
  default: 'default',
  bronzeSilverInventoryOnly: 'starter-bronze-silver-inventory-only',
  dailyRarePack2x84: 'starter-daily-rare-pack-2x84',
});

const LEGACY_INVENTORY_ONLY_PROFILE_ID = 'starter-inventory-only';
const LEGACY_DAILY_RARE_PACK_PROFILE_NAME = 'Daily + Rare Pack to 2x84+';
const DAILY_RARE_PACK_PROFILE_NAME = 'Daily + Rare Pack Recycling';

const ENTITY_COLLECTIONS = Object.freeze([
  'loops',
  'recoveryRecipes',
  'unassignedRecoveryPolicies',
]);

function clone(value) {
  return cloneLoopDef(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sameValue(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function valueAt(value, path) {
  let current = value;
  for (const key of path) {
    if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
    current = current[key];
  }
  return current;
}

function setValueAt(value, path, nextValue) {
  if (!path.length) return clone(nextValue);
  const result = isPlainObject(value) ? clone(value) : {};
  let current = result;
  for (const key of path.slice(0, -1)) {
    if (!isPlainObject(current[key])) current[key] = {};
    current = current[key];
  }
  const key = path.at(-1);
  if (nextValue === undefined) delete current[key];
  else current[key] = clone(nextValue);
  return result;
}

function replaceEntity(items, id, entity) {
  const result = [];
  let replaced = false;
  for (const item of items || []) {
    if (String(item?.id || '') !== String(id)) {
      result.push(clone(item));
      continue;
    }
    replaced = true;
    if (entity) result.push(clone(entity));
  }
  if (!replaced && entity) result.push(clone(entity));
  return result;
}

function mergePatch(base, patch) {
  if (!isPlainObject(patch)) return clone(patch);
  const result = isPlainObject(base) ? clone(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = isPlainObject(value) ? mergePatch(result[key], value) : clone(value);
  }
  return result;
}

function createPatch(base, target) {
  if (sameValue(base, target)) return undefined;
  if (!isPlainObject(base) || !isPlainObject(target)) return clone(target);
  const patch = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(target)]);
  for (const key of keys) {
    if (!Object.hasOwn(target, key)) {
      patch[key] = null;
      continue;
    }
    if (!Object.hasOwn(base, key)) {
      patch[key] = clone(target[key]);
      continue;
    }
    const child = createPatch(base[key], target[key]);
    if (child !== undefined) patch[key] = child;
  }
  return Object.keys(patch).length ? patch : undefined;
}

function patchLeafPaths(patch, prefix = []) {
  if (!isPlainObject(patch)) return [prefix];
  const entries = Object.entries(patch);
  if (!entries.length) return [prefix];
  return entries.flatMap(([key, value]) => patchLeafPaths(value, [...prefix, key]));
}

function entityMap(items = []) {
  return new Map((items || []).filter((item) => item?.id).map((item) => [String(item.id), item]));
}

function rebaseEntityCollection(collection, baseItems, targetItems, currentItems) {
  const base = entityMap(baseItems);
  const target = entityMap(targetItems);
  const current = entityMap(currentItems);
  const orderedIds = (targetItems || []).map((item) => String(item?.id || '')).filter(Boolean);
  for (const item of currentItems || []) {
    const id = String(item?.id || '');
    if (id && !base.has(id) && !target.has(id)) orderedIds.push(id);
  }

  const entities = [];
  const conflicts = [];
  for (const id of [...new Set(orderedIds)]) {
    const baseEntity = base.get(id);
    const targetEntity = target.get(id);
    const currentEntity = current.get(id);
    if (!targetEntity) {
      if (!baseEntity && currentEntity) entities.push(clone(currentEntity));
      continue;
    }
    if (!baseEntity) {
      if (currentEntity && !sameValue(currentEntity, targetEntity)) {
        conflicts.push({ collection, id, path: '', reason: 'custom-id-collision' });
      }
      entities.push(clone(targetEntity));
      continue;
    }
    if (!currentEntity) {
      conflicts.push({ collection, id, path: '', reason: 'built-in-removed' });
      entities.push(clone(targetEntity));
      continue;
    }
    if (sameValue(baseEntity, targetEntity)) {
      entities.push(clone(currentEntity));
      continue;
    }

    const patch = createPatch(baseEntity, targetEntity);
    for (const path of patchLeafPaths(patch)) {
      const before = valueAt(baseEntity, path);
      const upstream = valueAt(currentEntity, path);
      const desired = valueAt(targetEntity, path);
      if (!sameValue(before, upstream) && !sameValue(upstream, desired)) {
        conflicts.push({
          collection,
          id,
          path: path.join('.'),
          reason: 'both-changed',
          base: clone(before),
          builtIn: clone(upstream),
          profile: clone(desired),
        });
      }
    }
    entities.push(mergePatch(currentEntity, patch));
  }

  return { entities, conflicts };
}

function rebaseDefaultPolicies(baseConfig, targetConfig, currentConfig) {
  const field = 'defaultUnassignedRecoveryPolicyIds';
  const base = baseConfig[field];
  const target = targetConfig[field];
  const current = currentConfig[field];
  if (sameValue(base, target)) return { value: clone(current), conflicts: [] };
  if (!sameValue(base, current) && !sameValue(current, target)) {
    return {
      value: clone(target),
      conflicts: [{
        collection: field,
        id: field,
        path: '',
        reason: 'both-changed',
        base: clone(base),
        builtIn: clone(current),
        profile: clone(target),
      }],
    };
  }
  return { value: clone(target), conflicts: [] };
}

function normalizeDynamicBinding(binding = {}) {
  return {
    id: String(binding.id || binding.loopId || ''),
    loopId: String(binding.loopId || binding.definition?.id || ''),
    sbcSetIds: [...new Set((binding.sbcSetIds || binding.definition?.sbcSetIds || []).map(Number).filter(Number.isFinite))],
    pickItemResourceIds: [...new Set((binding.pickItemResourceIds || binding.definition?.pickItemResourceIds || []).map(Number).filter(Number.isFinite))],
    rewardPackIds: [...new Set((binding.rewardPackIds || binding.definition?.rewardPackIds || []).map(Number).filter(Number.isFinite))],
    discoveryKind: String(binding.discoveryKind || binding.definition?.discoveryKind || ''),
    available: binding.available === true,
    definition: binding.definition ? clone(binding.definition) : null,
    lastSeenAt: Number(binding.lastSeenAt || 0) || 0,
  };
}

function dynamicLoopMatch(binding, loop) {
  if (!binding || !loop) return false;
  if (binding.loopId && binding.loopId === String(loop.id || '')) return true;
  const setIds = new Set((loop.sbcSetIds || []).map(Number));
  if (binding.sbcSetIds.some((id) => setIds.has(id))) return true;
  const resourceIds = new Set((loop.pickItemResourceIds || []).map(Number));
  if (binding.pickItemResourceIds.some((id) => resourceIds.has(id))) return true;
  const packIds = new Set((loop.rewardPackIds || []).map(Number));
  return binding.rewardPackIds.some((id) => packIds.has(id));
}

function legacyInventoryOnlyStarterConfig(baseConfig) {
  const config = clone(normalizeLoopConfig(baseConfig));
  config.loops = config.loops.map((loop) => (
    getLoopStrategyCapabilities(loop.strategy).inventoryOnly === INVENTORY_ONLY_CAPABILITIES.container
      ? { ...loop, inventoryMode: 'inventory-only' }
      : loop
  ));
  return validateLoopConfig(config, 'Legacy Inventory Only starter profile');
}

function requirementUsesBronzeOrSilver(requirement = {}) {
  return ['bronze', 'silver'].includes(String(requirement.tier || '').toLowerCase());
}

function loopUsesBronzeOrSilverInventory(loop = {}) {
  if (requirementUsesBronzeOrSilver(loop.targetDuplicate)) return true;
  if ((loop.requirements || []).some(requirementUsesBronzeOrSilver)) return true;
  return (loop.challengeRequirements || []).some((requirements) => (
    (requirements || []).some(requirementUsesBronzeOrSilver)
  ));
}

function bronzeSilverInventoryOnlyStarterConfig(baseConfig) {
  const config = clone(normalizeLoopConfig(baseConfig));
  config.loops = config.loops.map((loop) => {
    const capability = getLoopStrategyCapabilities(loop.strategy).inventoryOnly;
    if (![INVENTORY_ONLY_CAPABILITIES.supported, INVENTORY_ONLY_CAPABILITIES.container].includes(capability)) {
      return loop;
    }
    return {
      ...loop,
      inventoryMode: loopUsesBronzeOrSilverInventory(loop) ? 'inventory-only' : 'normal',
    };
  });
  return validateLoopConfig(config, 'Bronze/Silver Inventory Only starter profile');
}

function dailyRarePack2x84StarterConfig(baseConfig) {
  const config = clone(normalizeLoopConfig(baseConfig));
  config.loops = config.loops.map((loop) => {
    if (loop.id !== 'one-click-daily') return loop;
    const steps = (loop.steps || []).filter((step) => (
      String(typeof step === 'object' ? step?.loopId || '' : step) !== 'daily-rare-pack-84'
    ));
    return {
      ...loop,
      steps: [...steps, 'daily-rare-pack-84'],
      stepOverrides: {
        ...(loop.stepOverrides || {}),
        'daily-rare-pack-84': {
          useRoundsAsCompletions: false,
          sourceExhaustedFallbackMaxCompletions: 1,
        },
      },
    };
  });
  return validateLoopConfig(config, 'Daily Rare Pack Recycling starter profile');
}

function migrateOfficialStarterMetadata(profile, baseConfig, now = Date.now()) {
  if (profile?.id !== BUILDER_STARTER_PROFILE_IDS.dailyRarePack2x84
    || profile?.preset !== 'daily-rare-pack-2x84'
    || profile?.name !== LEGACY_DAILY_RARE_PACK_PROFILE_NAME
    || (profile.dynamicBindings || []).length) return profile;
  const previousBase = normalizeLoopConfig(profile.baseConfig || baseConfig);
  const expected = dailyRarePack2x84StarterConfig(previousBase);
  const snapshots = [profile.draftConfig, profile.savedConfig, profile.lastKnownGood].filter(Boolean);
  if (!snapshots.length || !snapshots.every((config) => sameValue(normalizeLoopConfig(config), expected))) {
    return profile;
  }
  return { ...clone(profile), name: DAILY_RARE_PACK_PROFILE_NAME, updatedAt: Number(now) };
}

function isUnmodifiedLegacyInventoryOnlyProfile(profile, baseConfig) {
  if (profile?.preset !== 'inventory-only'
    || profile?.id !== LEGACY_INVENTORY_ONLY_PROFILE_ID
    || profile?.name !== 'Inventory Only') return false;
  const legacyConfig = legacyInventoryOnlyStarterConfig(profile.baseConfig || baseConfig);
  return [profile.draftConfig, profile.savedConfig, profile.lastKnownGood]
    .filter(Boolean)
    .every((config) => sameValue(normalizeLoopConfig(config), legacyConfig));
}

function officialStarterConfig(profile, baseConfig) {
  const id = String(profile?.id || '');
  const preset = String(profile?.preset || '');
  const normalizedBase = clone(normalizeLoopConfig(baseConfig));
  if (id === BUILDER_STARTER_PROFILE_IDS.default && preset === 'default') return normalizedBase;
  if (id === BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly && preset === 'bronze-silver-inventory-only') {
    return bronzeSilverInventoryOnlyStarterConfig(normalizedBase);
  }
  if (id === BUILDER_STARTER_PROFILE_IDS.dailyRarePack2x84 && preset === 'daily-rare-pack-2x84') {
    return dailyRarePack2x84StarterConfig(normalizedBase);
  }
  return null;
}

function refreshUnmodifiedOfficialStarterProfile(profile, currentBaseConfig, now = Date.now()) {
  if ((profile?.dynamicBindings || []).length) return null;
  const previousBaseConfig = normalizeLoopConfig(profile?.baseConfig || currentBaseConfig);
  const normalizedCurrentBase = normalizeLoopConfig(currentBaseConfig);
  if (sameValue(previousBaseConfig, normalizedCurrentBase)) return null;
  const previousStarterConfig = officialStarterConfig(profile, previousBaseConfig);
  if (!previousStarterConfig) return null;
  const snapshots = [profile.draftConfig, profile.savedConfig, profile.lastKnownGood].filter(Boolean);
  if (!snapshots.length || !snapshots.every((config) => sameValue(normalizeLoopConfig(config), previousStarterConfig))) {
    return null;
  }

  const currentStarterConfig = officialStarterConfig(profile, normalizedCurrentBase);
  const revision = Math.max(Number(profile.draftRevision || 0), Number(profile.savedRevision || 0), 1) + 1;
  const refreshed = createBuilderProfile({
    id: profile.id,
    name: profile.name,
    preset: profile.preset,
    baseConfig: normalizedCurrentBase,
    config: currentStarterConfig,
    now,
  });
  return {
    ...clone(profile),
    ...refreshed,
    createdAt: Number(profile.createdAt || refreshed.createdAt),
    updatedAt: Number(now),
    draftRevision: revision,
    savedRevision: revision,
  };
}

export function createBuilderStarterProfiles(baseConfig, options = {}) {
  const normalizedBase = clone(validateLoopConfig(baseConfig, 'Builder starter profile base'));
  return [
    createBuilderProfile({
      id: BUILDER_STARTER_PROFILE_IDS.default,
      name: 'Default',
      preset: 'default',
      baseConfig: normalizedBase,
      config: normalizedBase,
      now: options.now,
    }),
    createBuilderProfile({
      id: BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly,
      name: 'Bronze/Silver Inventory Only',
      preset: 'bronze-silver-inventory-only',
      baseConfig: normalizedBase,
      config: bronzeSilverInventoryOnlyStarterConfig(normalizedBase),
      now: options.now,
    }),
    createBuilderProfile({
      id: BUILDER_STARTER_PROFILE_IDS.dailyRarePack2x84,
      name: DAILY_RARE_PACK_PROFILE_NAME,
      preset: 'daily-rare-pack-2x84',
      baseConfig: normalizedBase,
      config: dailyRarePack2x84StarterConfig(normalizedBase),
      now: options.now,
    }),
  ];
}

export function fingerprintBuilderValue(value) {
  const text = JSON.stringify(stableValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createBuilderProfile(options = {}) {
  const baseConfig = clone(normalizeLoopConfig(options.baseConfig || options.config));
  const config = clone(normalizeLoopConfig(options.config || baseConfig));
  const now = Number(options.now || Date.now());
  return {
    schemaVersion: BUILDER_SCHEMA_VERSION,
    id: String(options.id || 'default'),
    name: String(options.name || 'Default'),
    ...(options.preset ? { preset: String(options.preset) } : {}),
    baseFingerprint: fingerprintBuilderValue(baseConfig),
    baseConfig,
    draftConfig: config,
    savedConfig: clone(config),
    lastKnownGood: clone(validateLoopConfig(config, 'Builder profile')),
    dynamicBindings: (options.dynamicBindings || []).map(normalizeDynamicBinding),
    draftRevision: 1,
    savedRevision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeBuilderProfile(profile, baseConfig, options = {}) {
  if (!isPlainObject(profile)) return createBuilderProfile({ baseConfig, ...options });
  let normalizedBase;
  try {
    normalizedBase = clone(validateLoopConfig(profile.baseConfig || baseConfig, 'Builder profile base'));
  } catch {
    normalizedBase = clone(validateLoopConfig(baseConfig, 'Current built-in config'));
  }
  let lastKnownGood = null;
  for (const candidate of [profile.lastKnownGood, profile.savedConfig, normalizedBase]) {
    if (!candidate) continue;
    try {
      lastKnownGood = clone(validateLoopConfig(candidate, 'Builder last known good'));
      break;
    } catch { }
  }
  const draftConfig = clone(normalizeLoopConfig(profile.draftConfig || lastKnownGood));
  const result = {
    ...createBuilderProfile({
      id: profile.id || options.id,
      name: profile.name || options.name,
      baseConfig: normalizedBase,
      config: lastKnownGood,
      now: profile.createdAt || options.now,
    }),
    ...clone(profile),
    schemaVersion: BUILDER_SCHEMA_VERSION,
    baseConfig: clone(normalizedBase),
    draftConfig,
    savedConfig: clone(lastKnownGood),
    lastKnownGood: clone(lastKnownGood),
    dynamicBindings: (profile.dynamicBindings || []).map((binding) => ({
      ...normalizeDynamicBinding(binding),
      available: false,
    })),
  };
  result.baseFingerprint = fingerprintBuilderValue(result.baseConfig);
  return result;
}

export function createBuilderStore(options = {}) {
  const profiles = createBuilderStarterProfiles(options.baseConfig, { now: options.now });
  if (options.profileId || options.profileName || options.config) {
    profiles[0] = createBuilderProfile({
      id: options.profileId || BUILDER_STARTER_PROFILE_IDS.default,
      name: options.profileName || 'Default',
      preset: options.profileId && options.profileId !== BUILDER_STARTER_PROFILE_IDS.default ? null : 'default',
      baseConfig: options.baseConfig,
      config: options.config || options.baseConfig,
      now: options.now,
    });
  }
  return {
    schemaVersion: BUILDER_SCHEMA_VERSION,
    activeProfileId: null,
    activeDynamicBindings: [],
    profiles,
    lastKnownGood: null,
  };
}

export function normalizeBuilderStore(store, baseConfig, options = {}) {
  if (!isPlainObject(store) || Number(store.schemaVersion) !== BUILDER_SCHEMA_VERSION || !Array.isArray(store.profiles)) {
    return createBuilderStore({ baseConfig, ...options });
  }
  const refreshedStarterIds = new Set();
  const profiles = store.profiles.flatMap((profile, index) => {
    try {
      const normalized = normalizeBuilderProfile(profile, baseConfig, {
        id: index ? `profile-${index + 1}` : 'default',
        name: index ? `Profile ${index + 1}` : 'Default',
        now: options.now,
      });
      const refreshed = refreshUnmodifiedOfficialStarterProfile(normalized, baseConfig, options.now);
      if (refreshed) refreshedStarterIds.add(refreshed.id);
      return [migrateOfficialStarterMetadata(refreshed || normalized, baseConfig, options.now)];
    } catch {
      return [];
    }
  });
  if (!profiles.length) return createBuilderStore({ baseConfig, ...options });
  let migratedLegacyActive = false;
  const legacyIndex = profiles.findIndex((profile) => isUnmodifiedLegacyInventoryOnlyProfile(profile, baseConfig));
  if (legacyIndex >= 0) {
    migratedLegacyActive = store.activeProfileId === LEGACY_INVENTORY_ONLY_PROFILE_ID;
    profiles.splice(legacyIndex, 1);
  }
  const profileIds = new Set(profiles.map((profile) => profile.id));
  for (const starter of createBuilderStarterProfiles(baseConfig, options)) {
    if (!profileIds.has(starter.id)) profiles.push(starter);
  }
  const requestedActiveProfileId = migratedLegacyActive
    ? BUILDER_STARTER_PROFILE_IDS.bronzeSilverInventoryOnly
    : store.activeProfileId;
  const activeProfileId = profiles.some((profile) => profile.id === requestedActiveProfileId)
    ? requestedActiveProfileId
    : null;
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
  const activeStarterRefreshed = refreshedStarterIds.has(activeProfileId);
  return {
    schemaVersion: BUILDER_SCHEMA_VERSION,
    activeProfileId,
    activeDynamicBindings: (activeStarterRefreshed
      ? activeProfile?.dynamicBindings || []
      : Object.hasOwn(store, 'activeDynamicBindings')
      ? store.activeDynamicBindings
      : activeProfile?.dynamicBindings || [])
      .map((binding) => ({
        ...normalizeDynamicBinding(binding),
        available: false,
      })),
    profiles,
    lastKnownGood: migratedLegacyActive || activeStarterRefreshed
      ? clone(activeProfile?.lastKnownGood || null)
      : store.lastKnownGood ? clone(store.lastKnownGood) : null,
  };
}

export function updateBuilderProfileDraft(profile, config, now = Date.now()) {
  return {
    ...clone(profile),
    draftConfig: clone(normalizeLoopConfig(config)),
    draftRevision: Math.max(Number(profile?.draftRevision || 0), Number(profile?.savedRevision || 0)) + 1,
    updatedAt: Number(now),
  };
}

export function refreshBuilderDynamicBindings(profile, discoveredLoops = [], now = Date.now()) {
  const result = clone(profile);
  result.dynamicBindings = (profile.dynamicBindings || []).map(normalizeDynamicBinding).map((binding) => {
    const definition = discoveredLoops.find((loop) => dynamicLoopMatch(binding, loop));
    return {
      ...binding,
      available: Boolean(definition),
      definition: definition ? clone(definition) : binding.definition,
      lastSeenAt: definition ? Number(now) : binding.lastSeenAt,
    };
  });
  return result;
}

export function materializeBuilderProfile(profile, currentBuiltInConfig) {
  const baseConfig = normalizeLoopConfig(profile.baseConfig || currentBuiltInConfig);
  const targetConfig = normalizeLoopConfig(profile.draftConfig || profile.savedConfig || baseConfig);
  const currentConfig = normalizeLoopConfig(currentBuiltInConfig);
  const config = {};
  const conflicts = [];

  for (const collection of ENTITY_COLLECTIONS) {
    const rebased = rebaseEntityCollection(
      collection,
      baseConfig[collection],
      targetConfig[collection],
      currentConfig[collection],
    );
    config[collection] = rebased.entities;
    conflicts.push(...rebased.conflicts);
  }
  const defaults = rebaseDefaultPolicies(baseConfig, targetConfig, currentConfig);
  config.defaultUnassignedRecoveryPolicyIds = defaults.value;
  conflicts.push(...defaults.conflicts);

  const unavailableBindings = [];
  for (const binding of (profile.dynamicBindings || []).map(normalizeDynamicBinding)) {
    config.loops = config.loops.filter((loop) => String(loop.id || '') !== binding.loopId);
    if (!binding.available || !binding.definition) {
      unavailableBindings.push({ id: binding.id, loopId: binding.loopId });
      continue;
    }
    config.loops.push(clone(binding.definition));
  }

  return {
    config,
    conflicts,
    unavailableBindings,
    valid: conflicts.length === 0 && unavailableBindings.length === 0,
  };
}

export function validateBuilderProfile(profile, currentBuiltInConfig) {
  const materialized = materializeBuilderProfile(profile, currentBuiltInConfig);
  const errors = [];
  if (materialized.conflicts.length) errors.push(`${materialized.conflicts.length} built-in conflict(s) require resolution`);
  if (materialized.unavailableBindings.length) errors.push(`${materialized.unavailableBindings.length} dynamic binding(s) are unavailable`);
  try {
    validateLoopConfig(materialized.config, 'Builder profile');
  } catch (error) {
    errors.push(error?.message || String(error));
  }
  return { ...materialized, errors, valid: errors.length === 0 };
}

export function resolveBuilderProfileConflict(profile, currentBuiltInConfig, conflict, choice, now = Date.now()) {
  if (!['built-in', 'profile'].includes(choice)) throw new Error(`Unsupported conflict choice: ${choice}`);
  const result = clone(profile);
  const currentConfig = normalizeLoopConfig(currentBuiltInConfig);
  const path = String(conflict?.path || '').split('.').filter(Boolean);
  const collection = String(conflict?.collection || '');

  if (collection === 'defaultUnassignedRecoveryPolicyIds') {
    if (choice === 'built-in') {
      result.draftConfig[collection] = clone(currentConfig[collection]);
    } else {
      result.baseConfig[collection] = clone(currentConfig[collection]);
    }
  } else if (ENTITY_COLLECTIONS.includes(collection)) {
    const id = String(conflict?.id || '');
    const currentEntity = (currentConfig[collection] || []).find((item) => String(item?.id || '') === id) || null;
    if (choice === 'built-in') {
      if (!path.length) {
        result.draftConfig[collection] = replaceEntity(result.draftConfig[collection], id, currentEntity);
      } else {
        const draftEntity = (result.draftConfig[collection] || []).find((item) => String(item?.id || '') === id);
        if (!draftEntity) throw new Error(`Profile object not found while resolving conflict: ${collection}.${id}`);
        const replacement = setValueAt(draftEntity, path, valueAt(currentEntity, path));
        result.draftConfig[collection] = replaceEntity(result.draftConfig[collection], id, replacement);
      }
    } else if (!path.length) {
      result.baseConfig[collection] = replaceEntity(result.baseConfig[collection], id, currentEntity);
    } else {
      const baseEntity = (result.baseConfig[collection] || []).find((item) => String(item?.id || '') === id);
      if (!baseEntity) throw new Error(`Profile base object not found while resolving conflict: ${collection}.${id}`);
      const replacement = setValueAt(baseEntity, path, valueAt(currentEntity, path));
      result.baseConfig[collection] = replaceEntity(result.baseConfig[collection], id, replacement);
    }
  } else {
    throw new Error(`Unsupported conflict collection: ${collection}`);
  }

  result.baseFingerprint = fingerprintBuilderValue(result.baseConfig);
  result.draftRevision = Math.max(Number(result.draftRevision || 0), Number(result.savedRevision || 0)) + 1;
  result.updatedAt = Number(now);
  return result;
}

export function saveBuilderProfile(profile, currentBuiltInConfig, now = Date.now()) {
  const validation = validateBuilderProfile(profile, currentBuiltInConfig);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  const revision = Math.max(Number(profile?.draftRevision || 0), Number(profile?.savedRevision || 0)) + 1;
  const currentBase = clone(normalizeLoopConfig(currentBuiltInConfig));
  return {
    ...clone(profile),
    baseConfig: currentBase,
    baseFingerprint: fingerprintBuilderValue(currentBase),
    draftConfig: clone(validation.config),
    savedConfig: clone(validation.config),
    lastKnownGood: clone(validation.config),
    draftRevision: revision,
    savedRevision: revision,
    updatedAt: Number(now),
  };
}

export function upsertBuilderProfile(store, profile) {
  const profiles = [...(store.profiles || [])];
  const index = profiles.findIndex((entry) => entry.id === profile.id);
  if (index >= 0) profiles[index] = clone(profile);
  else profiles.push(clone(profile));
  return { ...clone(store), profiles };
}

export function activateBuilderProfile(store, profile, currentBuiltInConfig) {
  const saved = saveBuilderProfile(profile, currentBuiltInConfig);
  const nextStore = upsertBuilderProfile(store, saved);
  return {
    store: {
      ...nextStore,
      activeProfileId: saved.id,
      activeDynamicBindings: clone(saved.dynamicBindings || []),
      lastKnownGood: clone(saved.lastKnownGood),
    },
    profile: saved,
    config: clone(saved.lastKnownGood),
  };
}

export function activateSavedBuilderProfile(store, profileId, currentBuiltInConfig) {
  const profile = (store.profiles || []).find((entry) => String(entry.id) === String(profileId));
  if (!profile) throw new Error(`Builder profile not found: ${profileId}`);
  const savedConfig = clone(profile.lastKnownGood || profile.savedConfig);
  if (!savedConfig) throw new Error(`Builder profile has no saved configuration: ${profile.name || profile.id}`);
  const savedLoopIds = new Set((savedConfig.loops || []).map((loop) => String(loop.id || '')));
  const savedDynamicBindings = (profile.dynamicBindings || [])
    .map(normalizeDynamicBinding)
    .filter((binding) => savedLoopIds.has(binding.loopId));
  const savedProfile = {
    ...clone(profile),
    draftConfig: clone(savedConfig),
    savedConfig: clone(savedConfig),
    lastKnownGood: clone(savedConfig),
    dynamicBindings: savedDynamicBindings,
  };
  const validation = validateBuilderProfile(savedProfile, currentBuiltInConfig);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return {
    store: {
      ...clone(store),
      activeProfileId: profile.id,
      activeDynamicBindings: clone(savedDynamicBindings),
      lastKnownGood: clone(validation.config),
    },
    profile: clone(profile),
    config: clone(validation.config),
  };
}

export function deactivateBuilderProfile(store) {
  return {
    ...clone(store),
    activeProfileId: null,
    activeDynamicBindings: [],
  };
}

export function importBuilderProfileJson(text, options = {}) {
  const config = validateLoopConfig(parseLoopConfig(text), 'Imported Builder JSON');
  return createBuilderProfile({
    id: options.id,
    name: options.name || 'Imported',
    baseConfig: options.baseConfig,
    config,
    now: options.now,
  });
}

export function exportBuilderProfileJson(profile, currentBuiltInConfig) {
  const validation = validateBuilderProfile(profile, currentBuiltInConfig);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return `${JSON.stringify(validation.config, null, 2)}\n`;
}

export function builderObjectSources(profile, currentBuiltInConfig) {
  const baseConfig = normalizeLoopConfig(profile.baseConfig || currentBuiltInConfig);
  const targetConfig = normalizeLoopConfig(profile.draftConfig || profile.savedConfig || baseConfig);
  const currentConfig = normalizeLoopConfig(currentBuiltInConfig);
  const sources = {};
  for (const collection of ENTITY_COLLECTIONS) {
    const base = entityMap(baseConfig[collection]);
    const target = entityMap(targetConfig[collection]);
    const current = entityMap(currentConfig[collection]);
    const dynamicIds = collection === 'loops'
      ? new Set((profile.dynamicBindings || []).map((binding) => String(binding.loopId || '')).filter(Boolean))
      : new Set();
    sources[collection] = (targetConfig[collection] || []).map((entity) => {
      const id = String(entity.id);
      const source = dynamicIds.has(id)
        ? 'dynamic'
        : (base.has(id) && sameValue(base.get(id), entity))
          || (current.has(id) && sameValue(current.get(id), entity))
          ? 'built-in'
          : !base.has(id) && !current.has(id)
        ? 'custom'
        : 'override';
      return { id, source, current: current.has(id) };
    });
  }
  return sources;
}
