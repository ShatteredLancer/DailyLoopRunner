import { cloneLoopDef, isPlainObject } from '../domain/objects.js';

export const DYNAMIC_SBC_CACHE_SCHEMA_VERSION = 1;
export const DYNAMIC_SBC_PARSER_VERSION = 4;
export const DYNAMIC_SBC_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DYNAMIC_SBC_SCAN_HEALTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const BOUNDED_RETRY_LOAD_CODES = new Set([426, 512, 521]);

export function dynamicSbcLoadErrorCode(error) {
  const directValues = [
    error?.status,
    error?.statusCode,
    error?.code,
    error?.error?.status,
    error?.error?.code,
  ];
  for (const value of directValues) {
    const code = Number(value);
    if (Number.isInteger(code) && code >= 100 && code <= 599) return code;
  }
  const match = String(error?.message || error || '').match(/(?:^|\D)(426|429|512|521)(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

export function dynamicSbcLoadFailurePolicy(error, context = {}) {
  const code = dynamicSbcLoadErrorCode(error);
  const attempt = Math.max(1, Number(context.attempt || 1) || 1);
  const attempts = Math.max(attempt, Number(context.attempts || attempt) || attempt);
  if (code === 429) return { code, retry: false, openCircuit: true };
  if (BOUNDED_RETRY_LOAD_CODES.has(code)) {
    return { code, retry: attempt < Math.min(attempts, 2), openCircuit: false };
  }
  return { code, retry: attempt < attempts, openCircuit: false };
}

export function normalizeDynamicSbcScanHealth(value = {}, now = Date.now()) {
  const updatedAt = Math.max(0, Number(value?.updatedAt || 0) || 0);
  const stale = !updatedAt || Math.max(0, Number(now) - updatedAt) > DYNAMIC_SBC_SCAN_HEALTH_MAX_AGE_MS;
  if (stale) {
    return {
      updatedAt: 0,
      runs: 0,
      requestCount: 0,
      failureCount: 0,
      rateLimitCount: 0,
      failureRate: 0,
      recommendedGapMs: 1200,
    };
  }
  return {
    updatedAt,
    runs: Math.max(0, Number(value?.runs || 0) || 0),
    requestCount: Math.max(0, Number(value?.requestCount || 0) || 0),
    failureCount: Math.max(0, Number(value?.failureCount || 0) || 0),
    rateLimitCount: Math.max(0, Number(value?.rateLimitCount || 0) || 0),
    failureRate: Math.max(0, Math.min(1, Number(value?.failureRate || 0) || 0)),
    recommendedGapMs: Math.max(800, Math.min(3000, Number(value?.recommendedGapMs || 1200) || 1200)),
  };
}

export function updateDynamicSbcScanHealth(previous = {}, metrics = {}, now = Date.now()) {
  const normalized = normalizeDynamicSbcScanHealth(previous, now);
  const requestCount = Math.max(0, Number(metrics.requestCount || 0) || 0);
  if (!requestCount) return normalized;
  const failureCount = Math.max(0, Math.min(requestCount, Number(metrics.failureCount || 0) || 0));
  const rateLimitCount = Math.max(0, Number(metrics.rateLimitCount || 0) || 0);
  const currentRate = requestCount ? failureCount / requestCount : 0;
  const failureRate = normalized.runs && requestCount
    ? (normalized.failureRate * 0.65) + (currentRate * 0.35)
    : requestCount ? currentRate : normalized.failureRate;
  let recommendedGapMs = normalized.recommendedGapMs;
  if (rateLimitCount > 0) recommendedGapMs = 3000;
  else if (currentRate >= 0.2 || failureRate >= 0.2) recommendedGapMs = Math.max(recommendedGapMs, 2500);
  else if (currentRate >= 0.1 || failureRate >= 0.1) recommendedGapMs = Math.max(recommendedGapMs, 1800);
  else if (requestCount >= 10 && failureCount === 0) recommendedGapMs = Math.max(800, recommendedGapMs - 200);
  return {
    updatedAt: Number(now) || Date.now(),
    runs: normalized.runs + 1,
    requestCount,
    failureCount,
    rateLimitCount,
    failureRate,
    recommendedGapMs,
  };
}

function scanCircuitOpenError(circuit) {
  const error = new Error(`Challenge metadata request skipped because the scan circuit opened after EA ${circuit?.code || 'rate limiting'}`);
  error.code = 'DYNAMIC_SBC_SCAN_CIRCUIT_OPEN';
  error.eaCode = circuit?.code || null;
  return error;
}

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

function knownChallengeIds(value = {}) {
  return [...new Set([
    ...(value.challengeIds || []),
    ...(value.challenges || []).map((challenge) => challenge?.id),
  ].map(positiveInteger).filter(Boolean))].sort((a, b) => a - b);
}

function cachedChallengeSnapshotUsable(cached, index = {}) {
  return index?.complete === true
    || (Array.isArray(cached?.snapshot?.challenges) && cached.snapshot.challenges.length > 0);
}

function compatibleIndexCore(value = {}) {
  return {
    id: positiveInteger(value.id),
    name: String(value.name || ''),
    repeats: value.repeats ?? null,
    startTime: value.startTime ?? null,
    endTime: value.endTime ?? null,
    inUpgradesCategory: value.inUpgradesCategory === true,
    rewards: (value.rewards || []).map(rewardFingerprint),
  };
}

export function isCompatibleDynamicSbcIndex(cachedSnapshot = {}, index = {}) {
  if (fingerprintDynamicSbcValue(compatibleIndexCore(cachedSnapshot))
    !== fingerprintDynamicSbcValue(compatibleIndexCore(index))) return false;
  const cachedIds = knownChallengeIds(cachedSnapshot);
  const currentIds = knownChallengeIds(index);
  if (!currentIds.length) return true;
  return cachedIds.length === currentIds.length
    && currentIds.every((id, position) => id === cachedIds[position]);
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
  const loadAttempts = Math.max(1, Math.min(5, Number(options.loadAttempts || 1) || 1));
  const loadRetryDelayMs = Math.max(0, Number(options.loadRetryDelayMs || 0) || 0);
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
    invalidEntries: 0,
    loadFailures: 0,
    loadRetries: 0,
    cacheFallbacks: 0,
    circuitBreakers: 0,
    circuitSkipped: 0,
    removedEntries: 0,
  };
  let loadCircuit = null;
  const candidates = [];

  for (const set of sets) {
    const index = options.snapshotIndex(set, refreshResult);
    if (!options.isCandidate(index, set)) continue;
    const setId = positiveInteger(index?.id);
    if (!setId) continue;
    currentCandidateIds.add(String(setId));
    stats.candidates++;
    candidates.push({ set, index, setId });
  }

  await options.onProgress?.({
    phase: 'validating',
    completed: 0,
    total: candidates.length,
    setsScanned: sets.length,
    index: candidates[0]?.index || null,
  });

  for (const { set, index, setId } of candidates) {
    const fingerprint = dynamicSbcIndexFingerprint(index);
    const cached = cache.sets[String(setId)] || null;
    const age = cached ? Math.max(0, now - Number(cached.scannedAt || 0)) : Infinity;
    const unchanged = Boolean(cached && cached.fingerprint === fingerprint);
    const cacheMetadataUsable = cachedChallengeSnapshotUsable(cached, index);
    const fresh = unchanged && age <= maxAgeMs && cacheMetadataUsable;
    const compatibleFresh = Boolean(
      cached
        && !unchanged
        && age <= maxAgeMs
        && cacheMetadataUsable
        && isCompatibleDynamicSbcIndex(cached.snapshot, index)
    );
    let snapshot;
    let loadError = null;
    let cacheStatus = 'miss';

    if (!forceFull && (fresh || compatibleFresh)) {
      snapshot = mergeDynamicSbcLiveState(cached.snapshot, index);
      cacheStatus = compatibleFresh ? 'compatible-hit' : 'hit';
      stats.cacheHits++;
      cache.sets[String(setId)] = {
        ...cached,
        fingerprint,
        snapshot: clone(snapshot),
        validatedAt: now,
      };
    } else {
      if (!cached) stats.newSets++;
      else if (!unchanged) stats.changedSets++;
      else if (!cacheMetadataUsable) stats.invalidEntries++;
      else stats.expiredEntries++;
      let challenges = null;
      if (index?.complete !== true) {
        if (loadCircuit) {
          loadError = scanCircuitOpenError(loadCircuit);
          stats.circuitSkipped++;
          await options.onLoadSkipped?.({ set, index, circuit: loadCircuit, error: loadError });
        } else {
          for (let attempt = 1; attempt <= loadAttempts; attempt++) {
            try {
              challenges = await options.loadChallenges(set, index, {
                attempt,
                attempts: loadAttempts,
                cachedSnapshot: cached?.snapshot || null,
                unchanged,
              });
              loadError = null;
              break;
            } catch (error) {
              loadError = error;
              const policy = options.loadFailurePolicy?.(error, {
                set,
                index,
                attempt,
                attempts: loadAttempts,
              }) || dynamicSbcLoadFailurePolicy(error, { attempt, attempts: loadAttempts });
              if (policy.openCircuit) {
                loadCircuit = { code: policy.code || dynamicSbcLoadErrorCode(error), error };
                stats.circuitBreakers++;
                await options.onCircuitOpen?.({ set, index, circuit: loadCircuit, error });
              }
              if (!policy.retry || attempt >= loadAttempts || loadCircuit) break;
              const delayMs = loadRetryDelayMs * attempt;
              stats.loadRetries++;
              await options.onLoadRetry?.({ set, index, attempt, attempts: loadAttempts, delayMs, error });
              if (delayMs && typeof options.sleep === 'function') await options.sleep(delayMs);
            }
          }
        }
        if (loadError) stats.loadFailures++;
      }
      const compatibleCacheFallback = Boolean(
        loadError
          && cached
          && cacheMetadataUsable
          && isCompatibleDynamicSbcIndex(cached.snapshot, index)
      );
      snapshot = compatibleCacheFallback
        ? mergeDynamicSbcLiveState(cached.snapshot, index)
        : options.snapshotSet(set, challenges, refreshResult);
      cacheStatus = compatibleCacheFallback
        ? 'load-failed-compatible-cache'
        : forceFull ? 'forced' : cached ? (unchanged ? (cacheMetadataUsable ? 'expired' : 'invalid') : 'changed') : 'new';
      stats.rescanned++;
      if (compatibleCacheFallback) {
        stats.cacheFallbacks++;
        cache.sets[String(setId)] = {
          ...cached,
          fingerprint,
          snapshot: clone(snapshot),
          validatedAt: now,
        };
      } else if (!loadError) {
        cache.sets[String(setId)] = {
          setId,
          fingerprint,
          snapshot: clone(snapshot),
          scannedAt: now,
          validatedAt: now,
        };
      }
    }

    const result = { set, index, snapshot, loadError, cacheStatus, fingerprint };
    results.push(result);
    await options.onResult?.(result);
    await options.onProgress?.({
      phase: 'validating',
      completed: results.length,
      total: candidates.length,
      setsScanned: sets.length,
      index: candidates[results.length]?.index || index,
      result,
    });
  }

  for (const key of Object.keys(cache.sets)) {
    if (currentCandidateIds.has(key)) continue;
    delete cache.sets[key];
    stats.removedEntries++;
  }
  cache.updatedAt = now;
  return { refreshResult, results, stats, cache };
}
