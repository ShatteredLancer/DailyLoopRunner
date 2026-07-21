import { FSU_COMPAT_DEFAULTS } from '../../config/runtime.js';
import {
  mergeLockedPlayersIntoSettings,
  normalizeFsuSettings,
  normalizeLockedPlayerIds,
  readFsuLockedPlayersFromStorage,
  readFsuSettingsFromStorage,
} from '../../config/fsu-compat.js';

const ROOT_NAMES = [
  'FSU',
  'fsu',
  'FUTEnhancer',
  'FCEnhancer',
  'Enhancer',
  'enhancer',
  '__FSU',
  '__FUTEnhancer',
  '__FCEnhancer',
];

function safeRead(holder, key) {
  try { return holder?.[key]; } catch { return undefined; }
}

function boolFromAny(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enabled', 'enable'].includes(text)) return true;
    if (['false', '0', 'no', 'off', 'disabled', 'disable'].includes(text)) return false;
  }
  return null;
}

function numberListFromAny(value, isInspectableObject, depth = 0, seen = new WeakSet()) {
  if (depth > 5) return [];
  if (Array.isArray(value)) {
    if (seen.has(value)) return [];
    seen.add(value);
    return value.flatMap((entry) => numberListFromAny(entry, isInspectableObject, depth + 1, seen))
      .filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return [Number(value)];
  if (typeof value === 'string') return (value.match(/\d+/g) || []).map(Number).filter(Number.isFinite);
  if (!isInspectableObject(value)) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  return Object.keys(value).slice(0, 250)
    .flatMap((key) => numberListFromAny(safeRead(value, key), isInspectableObject, depth + 1, seen))
    .filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
}

function uniquePositiveNumbers(values = []) {
  return values.map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function cloneDefaults() {
  return {
    ...FSU_COMPAT_DEFAULTS,
    excludedLeagueIds: [...FSU_COMPAT_DEFAULTS.excludedLeagueIds],
    goldRange: [...FSU_COMPAT_DEFAULTS.goldRange],
    lockedItemIds: [...FSU_COMPAT_DEFAULTS.lockedItemIds],
    lockedDefinitionIds: [...FSU_COMPAT_DEFAULTS.lockedDefinitionIds],
  };
}

export function createFsuAdapter(runtime, options = {}) {
  const documentObject = options.documentObject || runtime?.document || globalThis.document;
  const localStorage = options.localStorage || null;
  const sessionStorage = options.sessionStorage || null;

  function isInspectableObject(value) {
    if (!value || typeof value !== 'object') return false;
    if (value === runtime || value === documentObject || value === documentObject?.body) return false;
    const tag = Object.prototype.toString.call(value);
    return tag === '[object Object]' || tag === '[object Array]';
  }

  function readInfoSettings() {
    const info = safeRead(runtime, 'info');
    const build = safeRead(info, 'build');
    if (!isInspectableObject(build)) return null;

    const knownBuildKeys = [
      'ignorepos',
      'untradeable',
      'league',
      'flag',
      'academy',
      'strictlypcik',
      'comprange',
      'comprare',
      'firststorage',
      'sbfirstcommon',
    ];
    if (!knownBuildKeys.some((key) => safeRead(build, key) !== undefined)) return null;

    const setCandidate = safeRead(info, 'set');
    const set = isInspectableObject(setCandidate) ? setCandidate : {};
    const rawGoldenMax = Number(safeRead(set, 'goldenrange'));
    const goldenMax = Number.isFinite(rawGoldenMax) && rawGoldenMax >= 75 && rawGoldenMax <= 99
      ? rawGoldenMax
      : FSU_COMPAT_DEFAULTS.goldRange[1];
    const readBoolean = (key, fallback) => {
      const value = boolFromAny(safeRead(build, key));
      return value === null ? fallback : value;
    };

    return {
      ...cloneDefaults(),
      ignorePlayerPosition: readBoolean('ignorepos', FSU_COMPAT_DEFAULTS.ignorePlayerPosition),
      onlyUntradeable: readBoolean('untradeable', FSU_COMPAT_DEFAULTS.onlyUntradeable),
      excludeDesignatedLeagues: readBoolean('league', FSU_COMPAT_DEFAULTS.excludeDesignatedLeagues),
      excludedLeagueIds: uniquePositiveNumbers(numberListFromAny(safeRead(set, 'shield_league'), isInspectableObject)),
      useRarityPlayer: readBoolean('flag', FSU_COMPAT_DEFAULTS.useRarityPlayer),
      excludeEvolution: readBoolean('academy', FSU_COMPAT_DEFAULTS.excludeEvolution),
      playerPickStrictCommonRare: readBoolean('strictlypcik', FSU_COMPAT_DEFAULTS.playerPickStrictCommonRare),
      priorityRareWithinGoldRange: readBoolean('comprange', FSU_COMPAT_DEFAULTS.priorityRareWithinGoldRange),
      priorityNonSpecialPlayers: readBoolean('comprare', FSU_COMPAT_DEFAULTS.priorityNonSpecialPlayers),
      priorityStoragePlayers: readBoolean('firststorage', FSU_COMPAT_DEFAULTS.priorityStoragePlayers),
      silverBronzePrioritizeNormal: readBoolean('sbfirstcommon', FSU_COMPAT_DEFAULTS.silverBronzePrioritizeNormal),
      goldRange: [75, goldenMax],
      detected: true,
      source: 'window.info.build/set',
    };
  }

  function namedRoots(includeDynamic = true) {
    const roots = [];
    for (const name of ROOT_NAMES) {
      const value = safeRead(runtime, name);
      if (isInspectableObject(value)) roots.push([name, value]);
    }
    if (includeDynamic) {
      let keys = [];
      try { keys = Object.keys(runtime); } catch { }
      keys.filter((key) => /fsu|enhancer/i.test(key)).slice(0, 40).forEach((key) => {
        const value = safeRead(runtime, key);
        if (isInspectableObject(value)) roots.push([key, value]);
      });
    }
    return roots;
  }

  function readWindowSettings() {
    const infoSettings = readInfoSettings();
    if (infoSettings) return infoSettings;

    const seen = new WeakSet();
    for (const [name, root] of namedRoots(true)) {
      if (seen.has(root)) continue;
      seen.add(root);
      const settings = normalizeFsuSettings(root, `window.${name}`);
      if (settings) return settings;
    }
    return null;
  }

  function readWindowLockedPlayers() {
    const info = safeRead(runtime, 'info');
    const state = safeRead(runtime, 'state');
    const page = safeRead(state, 'page');
    const pageInfo = safeRead(page, 'info');
    const known = [
      ['window.info.lock', safeRead(info, 'lock')],
      ['window.info.lockedPlayers', safeRead(info, 'lockedPlayers')],
      ['window.info.lockPlayers', safeRead(info, 'lockPlayers')],
      ['window.info.playerLock', safeRead(info, 'playerLock')],
      ['window.info.protectedPlayers', safeRead(info, 'protectedPlayers')],
      ['window.state.page.info.lock', safeRead(pageInfo, 'lock')],
    ];
    const combined = { itemIds: [], definitionIds: [], sources: [] };
    for (const [path, value] of known) {
      const locked = normalizeLockedPlayerIds(value, path);
      combined.itemIds.push(...locked.itemIds);
      combined.definitionIds.push(...locked.definitionIds);
      combined.sources.push(...locked.sources);
    }
    for (const [name, root] of namedRoots(false)) {
      const locked = normalizeLockedPlayerIds(root, `window.${name}`);
      combined.itemIds.push(...locked.itemIds);
      combined.definitionIds.push(...locked.definitionIds);
      combined.sources.push(...locked.sources);
    }
    return {
      itemIds: uniquePositiveNumbers(combined.itemIds),
      definitionIds: uniquePositiveNumbers(combined.definitionIds),
      sources: [...new Set(combined.sources)].slice(0, 8),
    };
  }

  function readLockedPlayers() {
    const windowLocked = readWindowLockedPlayers();
    const localLocked = readFsuLockedPlayersFromStorage(localStorage, 'localStorage');
    const sessionLocked = readFsuLockedPlayersFromStorage(sessionStorage, 'sessionStorage');
    return {
      itemIds: uniquePositiveNumbers([
        ...(windowLocked.itemIds || []),
        ...(localLocked.itemIds || []),
        ...(sessionLocked.itemIds || []),
      ]),
      definitionIds: uniquePositiveNumbers([
        ...(windowLocked.definitionIds || []),
        ...(localLocked.definitionIds || []),
        ...(sessionLocked.definitionIds || []),
      ]),
      sources: [...new Set([
        ...(windowLocked.sources || []),
        ...(localLocked.sources || []),
        ...(sessionLocked.sources || []),
      ])].slice(0, 8),
    };
  }

  function snapshot(settingsOverride = null) {
    const settings = settingsOverride
      || readWindowSettings()
      || readFsuSettingsFromStorage(localStorage, 'localStorage')
      || readFsuSettingsFromStorage(sessionStorage, 'sessionStorage')
      || cloneDefaults();
    const locked = readLockedPlayers();
    return mergeLockedPlayersIntoSettings(
      settings,
      locked,
      locked.itemIds.length || locked.definitionIds.length ? 'locked-players' : '',
    );
  }

  function readiness() {
    const info = safeRead(runtime, 'info');
    const build = safeRead(info, 'build');
    if (!isInspectableObject(build)) {
      return { detected: false, ready: true, state: 'not-detected' };
    }
    const base = safeRead(info, 'base');
    const rawState = safeRead(base, 'state');
    const cacheStatus = String(safeRead(safeRead(base, 'clubCache'), 'status') || '');
    if (cacheStatus === 'finalizing') {
      return {
        detected: true,
        ready: true,
        fullyValidated: true,
        state: 'ready',
        cacheStatus,
      };
    }
    if (['validating', 'validation-failed'].includes(cacheStatus)) {
      return {
        detected: true,
        ready: true,
        fullyValidated: false,
        state: 'provisional',
        cacheStatus,
      };
    }
    if (rawState === false) {
      return {
        detected: true,
        ready: false,
        fullyValidated: false,
        state: safeRead(base, 'reloadPlayersPromise') ? 'loading' : 'not-ready',
      };
    }
    return {
      detected: true,
      ready: true,
      fullyValidated: true,
      state: 'ready',
    };
  }

  async function validateClubPlayers(refs = [], options = {}) {
    const events = safeRead(runtime, 'events');
    const validate = safeRead(events, 'validateClubPlayers');
    if (typeof validate !== 'function') {
      return {
        ok: readiness().fullyValidated !== false,
        items: [],
        missing: refs,
        reason: 'FSU targeted Club validation is unavailable',
      };
    }
    return validate(refs, options);
  }

  function beginProvisionalClubAccess() {
    const begin = safeRead(safeRead(runtime, 'events'), 'beginProvisionalClubAccess');
    return typeof begin === 'function' ? begin() : null;
  }

  function endProvisionalClubAccess() {
    const end = safeRead(safeRead(runtime, 'events'), 'endProvisionalClubAccess');
    return typeof end === 'function' ? end() : null;
  }

  return Object.freeze({
    snapshot,
    readiness,
    validateClubPlayers,
    beginProvisionalClubAccess,
    endProvisionalClubAccess,
  });
}
