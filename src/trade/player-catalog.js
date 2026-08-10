import { classifyTradeError } from './error-policy.js';

export const PLAYER_CATALOG_SCHEMA_VERSION = 1;
export const PLAYER_CATALOG_PARSER_VERSION = 1;
export const DEFAULT_PLAYER_CATALOG_TTL_MS = 24 * 60 * 60_000;
export const PLAYER_CATALOG_HEALTH_SCHEMA_VERSION = 1;

function parseJson(text) {
  try { return JSON.parse(text); } catch { throw new Error('FUTNext player catalog returned invalid JSON'); }
}

function definitionIds(values = []) {
  return [...new Set((values || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
}

function normalizeRatings(input = {}) {
  const explicit = Array.isArray(input.ratings) ? input.ratings : [];
  if (explicit.length) return [...new Set(explicit.map(Number).filter((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 99))].sort((a, b) => a - b);
  const min = Number(input.ratingMin ?? input.rating);
  const max = Number(input.ratingMax ?? input.rating);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 99 || max < min) {
    throw new Error('Player catalog requires ratings or a valid ratingMin/ratingMax range');
  }
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function parseCache(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

export function createEmptyPlayerCatalogCache(options = {}) {
  return {
    schemaVersion: PLAYER_CATALOG_SCHEMA_VERSION,
    parserVersion: Number(options.parserVersion || PLAYER_CATALOG_PARSER_VERSION),
    season: String(options.season || '26'),
    platform: String(options.platform || 'pc').toLowerCase(),
    lanes: {},
  };
}

export function normalizePlayerCatalogCache(value, options = {}) {
  const expected = createEmptyPlayerCatalogCache(options);
  const cache = parseCache(value);
  if (!cache || Number(cache.schemaVersion) !== PLAYER_CATALOG_SCHEMA_VERSION) return expected;
  if (Number(cache.parserVersion) !== expected.parserVersion) return expected;
  if (String(cache.season) !== expected.season || String(cache.platform).toLowerCase() !== expected.platform) return expected;
  const lanes = {};
  for (const [ratingText, lane] of Object.entries(cache.lanes || {})) {
    const rating = Number(ratingText);
    const ids = definitionIds(lane?.definitionIds);
    const fetchedAt = Number(lane?.fetchedAt);
    const expiresAt = Number(lane?.expiresAt);
    if (!Number.isInteger(rating) || rating < 1 || rating > 99 || !ids.length) continue;
    if (!Number.isFinite(fetchedAt) || !Number.isFinite(expiresAt) || expiresAt <= fetchedAt) continue;
    lanes[rating] = { rating, definitionIds: ids, fetchedAt, expiresAt };
  }
  return { ...expected, lanes };
}

export function parseFutNextPlayerCatalogResponse(text) {
  const response = parseJson(text);
  const ids = definitionIds(response?.ids || response?.data?.ids);
  if (!ids.length) throw new Error('FUTNext player catalog returned no definition IDs');
  return ids;
}

export function createPlayerCatalogProvider(options = {}) {
  if (typeof options.requestText !== 'function') throw new TypeError('requestText is required');
  const storage = options.storage;
  const cacheKey = String(options.cacheKey || 'fc-loop-runner-trade-player-catalog-v1');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let loadCount = 0;
  let lastLoad = null;
  let lastClearedAt = null;

  function readCache(request) {
    const raw = storage?.get?.(cacheKey, null);
    return normalizePlayerCatalogCache(raw, request);
  }

  function writeCache(cache) {
    storage?.set?.(cacheKey, cache);
  }

  async function load(request = {}) {
    const ratings = normalizeRatings(request);
    const platform = String(request.platform || options.platform || 'pc').trim().toLowerCase();
    const season = String(request.season || options.season || '26');
    const parserVersion = Number(request.parserVersion || options.parserVersion || PLAYER_CATALOG_PARSER_VERSION);
    const ttlMs = Math.max(1, Number(request.ttlMs || options.ttlMs || DEFAULT_PLAYER_CATALOG_TTL_MS));
    const currentTime = Number(now());
    const cacheOptions = { platform, season, parserVersion };
    const cache = readCache(cacheOptions);
    const lanes = [];
    const attempts = [];
    const missingRatings = [];
    let circuitOpen = false;

    for (const rating of ratings) {
      const cached = cache.lanes[rating];
      if (request.forceRefresh !== true && cached?.expiresAt > currentTime) {
        lanes.push({ ...cached, source: 'cache' });
        attempts.push({ rating, source: 'cache', status: 'loaded', count: cached.definitionIds.length });
        continue;
      }
      if (circuitOpen) {
        missingRatings.push(rating);
        attempts.push({ rating, source: 'FUTNext', status: 'skipped', reason: 'request circuit open' });
        continue;
      }
      const url = `https://rest.futnext.com/players/filter?rating=${encodeURIComponent(rating)}&platform=${encodeURIComponent(platform)}`;
      try {
        const text = await options.requestText(url, {
          sendCookies: false,
          headers: { Accept: 'application/json, text/plain, */*' },
        });
        const ids = parseFutNextPlayerCatalogResponse(text);
        const lane = { rating, definitionIds: ids, fetchedAt: currentTime, expiresAt: currentTime + ttlMs };
        cache.lanes[rating] = lane;
        lanes.push({ ...lane, source: 'FUTNext' });
        attempts.push({ rating, source: 'FUTNext', status: 'loaded', count: ids.length });
      } catch (error) {
        const classification = classifyTradeError(error);
        missingRatings.push(rating);
        attempts.push({
          rating,
          source: 'FUTNext',
          status: 'error',
          reason: error?.message || String(error),
          errorKind: classification.kind,
        });
        if (classification.kind === 'rate-limit') circuitOpen = true;
      }
    }
    writeCache(cache);
    const result = {
      schemaVersion: PLAYER_CATALOG_SCHEMA_VERSION,
      ok: missingRatings.length === 0,
      platform,
      season,
      parserVersion,
      ratings,
      lanes: lanes.sort((left, right) => left.rating - right.rating),
      missingRatings,
      attempts,
      cache,
    };
    loadCount += 1;
    lastLoad = {
      at: currentTime,
      platform,
      season,
      ratings: [...ratings],
      ok: result.ok,
      lanes: result.lanes.length,
      missing: result.missingRatings.length,
      attempts: attempts.map((attempt) => ({
        rating: Number(attempt.rating),
        source: String(attempt.source || 'unknown'),
        status: String(attempt.status || 'unknown'),
        count: Math.max(0, Number(attempt.count || 0) || 0),
        errorKind: attempt.errorKind ? String(attempt.errorKind) : null,
        reason: attempt.reason ? String(attempt.reason).slice(0, 160) : null,
      })),
    };
    return result;
  }

  function clear() {
    storage?.remove?.(cacheKey);
    lastClearedAt = Number(now());
  }

  function snapshot(request = {}) {
    const platform = String(request.platform || options.platform || 'pc').trim().toLowerCase();
    const season = String(request.season || options.season || '26');
    const parserVersion = Number(request.parserVersion || options.parserVersion || PLAYER_CATALOG_PARSER_VERSION);
    return readCache({ platform, season, parserVersion });
  }

  function inspect(request = {}) {
    const currentTime = Number(now());
    const cache = snapshot(request);
    const lanes = Object.values(cache.lanes || {});
    const fresh = lanes.filter((lane) => Number(lane.expiresAt) > currentTime);
    const expired = lanes.length - fresh.length;
    const status = !lanes.length ? 'empty' : !expired ? 'fresh' : !fresh.length ? 'stale' : 'partial';
    const timestamps = (field) => lanes.map((lane) => Number(lane[field])).filter(Number.isFinite);
    const fetched = timestamps('fetchedAt');
    const expires = timestamps('expiresAt');
    return {
      schemaVersion: PLAYER_CATALOG_HEALTH_SCHEMA_VERSION,
      capturedAt: currentTime,
      provider: 'FUTNext',
      status,
      cache: {
        schemaVersion: cache.schemaVersion,
        parserVersion: cache.parserVersion,
        platform: cache.platform,
        season: cache.season,
        lanes: lanes.length,
        freshLanes: fresh.length,
        expiredLanes: expired,
        definitions: lanes.reduce((sum, lane) => sum + lane.definitionIds.length, 0),
        oldestFetchedAt: fetched.length ? Math.min(...fetched) : null,
        newestFetchedAt: fetched.length ? Math.max(...fetched) : null,
        earliestExpiresAt: expires.length ? Math.min(...expires) : null,
        latestExpiresAt: expires.length ? Math.max(...expires) : null,
      },
      activity: {
        loadCount,
        lastLoad: lastLoad ? JSON.parse(JSON.stringify(lastLoad)) : null,
        lastClearedAt,
      },
    };
  }

  return Object.freeze({ clear, inspect, load, snapshot });
}
