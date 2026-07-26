import { cloneLoopDef, isPlainObject } from '../domain/objects.js';

export const DYNAMIC_SBC_CACHE_SCHEMA_VERSION = 1;
export const DYNAMIC_SBC_PARSER_VERSION = 1;
export const DYNAMIC_SBC_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function clone(value) {
  return cloneLoopDef(value);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function fingerprintDynamicSbcValue(value) {
  const text = JSON.stringify(stableValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function rewardFingerprint(reward = {}) {
  return {
    type: String(reward.type || ''),
    resourceId: positiveInteger(reward.resourceId),
    definitionId: positiveInteger(reward.definitionId),
    packId: positiveInteger(reward.packId),
    candidateCount: positiveInteger(reward.candidateCount),
    selectionCount: positiveInteger(reward.selectionCount),
    count: positiveInteger(reward.count),
    name: String(reward.name || ''),
    description: String(reward.description || ''),
  };
}

export function dynamicSbcIndexFingerprint(index = {}) {
  return fingerprintDynamicSbcValue({
    id: positiveInteger(index.id),
    name: String(index.name || ''),
    repeats: index.repeats ?? null,
    startTime: index.startTime ?? null,
    endTime: index.endTime ?? null,
    categoryIds: [...(index.categoryIds || [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b),
    categoryNames: [...(index.categoryNames || [])].map(String).sort(),
    categoriesAvailable: index.categoriesAvailable === true,
    inUpgradesCategory: index.inUpgradesCategory === true,
    challengeIds: [...(index.challengeIds || [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b),
    rewards: (index.rewards || []).map(rewardFingerprint),
  });
}

export function createDynamicSbcCache(now = Date.now()) {
  return {
    schemaVersion: DYNAMIC_SBC_CACHE_SCHEMA_VERSION,
    parserVersion: DYNAMIC_SBC_PARSER_VERSION,
    updatedAt: Number(now) || 0,
    sets: {},
  };
}

export function normalizeDynamicSbcCache(cache, now = Date.now()) {
  if (!isPlainObject(cache)
    || Number(cache.schemaVersion) !== DYNAMIC_SBC_CACHE_SCHEMA_VERSION
    || Number(cache.parserVersion) !== DYNAMIC_SBC_PARSER_VERSION
    || !isPlainObject(cache.sets)) {
    return createDynamicSbcCache(now);
  }
  const sets = {};
  for (const [key, entry] of Object.entries(cache.sets)) {
    const setId = positiveInteger(entry?.setId || key);
    if (!setId || !entry?.fingerprint || !isPlainObject(entry?.snapshot)) continue;
    sets[String(setId)] = {
      setId,
      fingerprint: String(entry.fingerprint),
      snapshot: clone(entry.snapshot),
      scannedAt: Number(entry.scannedAt || 0) || 0,
      validatedAt: Number(entry.validatedAt || 0) || 0,
    };
  }
  return {
    schemaVersion: DYNAMIC_SBC_CACHE_SCHEMA_VERSION,
    parserVersion: DYNAMIC_SBC_PARSER_VERSION,
    updatedAt: Number(cache.updatedAt || now) || 0,
    sets,
  };
}

export function mergeDynamicSbcLiveState(snapshot = {}, index = {}) {
  return {
    ...clone(snapshot),
    id: index.id ?? snapshot.id,
    name: index.name || snapshot.name,
    status: index.status ?? snapshot.status,
    complete: index.complete === true,
    timesCompleted: index.timesCompleted ?? null,
    repeats: index.repeats ?? null,
    startTime: index.startTime ?? snapshot.startTime ?? null,
    endTime: index.endTime ?? snapshot.endTime ?? null,
    categoryIds: clone(index.categoryIds || snapshot.categoryIds || []),
    categoryNames: clone(index.categoryNames || snapshot.categoryNames || []),
    categoriesAvailable: index.categoriesAvailable === true,
    inUpgradesCategory: index.inUpgradesCategory === true,
    rewards: clone(index.rewards?.length ? index.rewards : snapshot.rewards || []),
  };
}

export async function scanDynamicSbcSnapshots(options = {}) {
  if (typeof options.refreshSets !== 'function') throw new TypeError('refreshSets is required');
  if (typeof options.listSets !== 'function') throw new TypeError('listSets is required');
  if (typeof options.snapshotIndex !== 'function') throw new TypeError('snapshotIndex is required');
  if (typeof options.snapshotSet !== 'function') throw new TypeError('snapshotSet is required');
  if (typeof options.loadChallenges !== 'function') throw new TypeError('loadChallenges is required');
  if (typeof options.isCandidate !== 'function') throw new TypeError('isCandidate is required');

  const now = Number(options.now?.() ?? Date.now()) || Date.now();
  const maxAgeMs = Math.max(0, Number(options.maxAgeMs ?? DYNAMIC_SBC_CACHE_MAX_AGE_MS) || 0);
  const forceFull = options.forceFull === true;
  const cache = normalizeDynamicSbcCache(options.cache, now);
  const refreshResult = await options.refreshSets();
  const sets = options.listSets() || [];
  const results = [];
  const currentCandidateIds = new Set();
  const stats = {
    setsScanned: sets.length,
    candidates: 0,
    cacheHits: 0,
    rescanned: 0,
    newSets: 0,
    changedSets: 0,
    expiredEntries: 0,
    loadFailures: 0,
    removedEntries: 0,
  };

  for (const set of sets) {
    const index = options.snapshotIndex(set, refreshResult);
    if (!options.isCandidate(index, set)) continue;
    const setId = positiveInteger(index?.id);
    if (!setId) continue;
    currentCandidateIds.add(String(setId));
    stats.candidates++;

    const fingerprint = dynamicSbcIndexFingerprint(index);
    const cached = cache.sets[String(setId)] || null;
    const age = cached ? Math.max(0, now - Number(cached.scannedAt || 0)) : Infinity;
    const unchanged = Boolean(cached && cached.fingerprint === fingerprint);
    const fresh = unchanged && age <= maxAgeMs;
    let snapshot;
    let loadError = null;
    let cacheStatus = 'miss';

    if (!forceFull && fresh) {
      snapshot = mergeDynamicSbcLiveState(cached.snapshot, index);
      cacheStatus = 'hit';
      stats.cacheHits++;
      cache.sets[String(setId)] = {
        ...cached,
        snapshot: clone(snapshot),
        validatedAt: now,
      };
    } else {
      if (!cached) stats.newSets++;
      else if (!unchanged) stats.changedSets++;
      else stats.expiredEntries++;
      let challenges = null;
      if (index?.complete !== true) {
        try {
          challenges = await options.loadChallenges(set, index);
        } catch (error) {
          loadError = error;
          stats.loadFailures++;
        }
      }
      snapshot = loadError && cached && unchanged
        ? mergeDynamicSbcLiveState(cached.snapshot, index)
        : options.snapshotSet(set, challenges, refreshResult);
      cacheStatus = forceFull ? 'forced' : cached ? (unchanged ? 'expired' : 'changed') : 'new';
      stats.rescanned++;
      if (!loadError) {
        cache.sets[String(setId)] = {
          setId,
          fingerprint,
          snapshot: clone(snapshot),
          scannedAt: now,
          validatedAt: now,
        };
      } else if (cached && unchanged) {
        cacheStatus = 'load-failed-cached';
      }
    }

    const result = { set, index, snapshot, loadError, cacheStatus, fingerprint };
    results.push(result);
    await options.onResult?.(result);
  }

  for (const key of Object.keys(cache.sets)) {
    if (currentCandidateIds.has(key)) continue;
    delete cache.sets[key];
    stats.removedEntries++;
  }
  cache.updatedAt = now;
  return { refreshResult, results, stats, cache };
}
