import { FSU_COMPAT_DEFAULTS } from '../../config/runtime.js';

function bool(value, fallback) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
  if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') return false;
  return fallback;
}

function numbers(value) {
  if (Array.isArray(value)) return [...new Set(value.map(Number).filter((entry) => Number.isFinite(entry) && entry > 0))];
  return [...new Set((String(value || '').match(/\d+/g) || []).map(Number).filter((entry) => entry > 0))];
}

export function createFsuAdapter(runtime) {
  function snapshot() {
    const info = runtime?.info || {};
    const build = info.build || {};
    const settings = info.set || {};
    const lock = info.lock || {};
    const min = Number(settings.goldenmin ?? settings.goldmin ?? FSU_COMPAT_DEFAULTS.goldRange[0]);
    const max = Number(settings.goldenmax ?? settings.goldmax ?? FSU_COMPAT_DEFAULTS.goldRange[1]);
    return Object.freeze({
      ...FSU_COMPAT_DEFAULTS,
      onlyUntradeable: bool(build.untradeable, FSU_COMPAT_DEFAULTS.onlyUntradeable),
      excludeDesignatedLeagues: bool(build.league, FSU_COMPAT_DEFAULTS.excludeDesignatedLeagues),
      useRarityPlayer: bool(build.flag, FSU_COMPAT_DEFAULTS.useRarityPlayer),
      excludeEvolution: bool(build.academy, FSU_COMPAT_DEFAULTS.excludeEvolution),
      priorityRareWithinGoldRange: bool(build.comprange, FSU_COMPAT_DEFAULTS.priorityRareWithinGoldRange),
      priorityNonSpecialPlayers: bool(build.comprare, FSU_COMPAT_DEFAULTS.priorityNonSpecialPlayers),
      priorityStoragePlayers: bool(build.firststorage, FSU_COMPAT_DEFAULTS.priorityStoragePlayers),
      silverBronzePrioritizeNormal: bool(build.sbfirstcommon, FSU_COMPAT_DEFAULTS.silverBronzePrioritizeNormal),
      excludedLeagueIds: numbers(settings.leagueids ?? settings.leagues),
      goldRange: [Number.isFinite(min) ? min : 75, Number.isFinite(max) ? max : 83],
      lockedItemIds: numbers(lock.itemIds ?? lock.items ?? lock),
      lockedDefinitionIds: numbers(lock.definitionIds ?? lock.definitions),
      detected: !!runtime?.info,
      source: runtime?.info ? 'window.info.build/set' : 'compat-defaults',
    });
  }

  return Object.freeze({ snapshot });
}
