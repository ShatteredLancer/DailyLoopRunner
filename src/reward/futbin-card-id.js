const CACHE_VERSION = 1;
const MAX_CACHE_ENTRIES = 2000;

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizedPlatform(value) {
  const platform = String(value || '').trim().toUpperCase();
  return platform === 'PC' || platform === 'PS' ? platform : null;
}

function safeContext(context) {
  return context && typeof context === 'object' ? context : {};
}

function cacheEntryKey(context = {}) {
  const source = safeContext(context);
  const season = positiveInteger(source.season);
  const platform = normalizedPlatform(source.platform);
  const definitionId = positiveInteger(source.definitionId);
  if (!season || !platform || !definitionId) return null;
  return `${season}:${platform}:${definitionId}`;
}

export function normalizeFutbinCardIdCache(rawCache) {
  const entries = {};
  const rawEntries = rawCache?.version === CACHE_VERSION && rawCache?.entries && typeof rawCache.entries === 'object'
    ? rawCache.entries
    : {};
  for (const [key, value] of Object.entries(rawEntries)) {
    if (!/^\d{2}:(?:PC|PS):\d+$/.test(key)) continue;
    const futbinPlayerId = positiveInteger(value);
    if (futbinPlayerId) entries[key] = futbinPlayerId;
    if (Object.keys(entries).length >= MAX_CACHE_ENTRIES) break;
  }
  return { version: CACHE_VERSION, entries };
}

export function getCachedFutbinPlayerId(cache, context = {}) {
  const key = cacheEntryKey(context);
  return key ? positiveInteger(cache?.entries?.[key]) : null;
}

export function cacheFutbinPlayerId(cache, context = {}, futbinPlayerId) {
  const key = cacheEntryKey(context);
  const id = positiveInteger(futbinPlayerId);
  if (!key || !id) return false;
  if (!cache.entries || typeof cache.entries !== 'object') cache.entries = {};
  cache.entries[key] = id;
  const keys = Object.keys(cache.entries);
  if (keys.length > MAX_CACHE_ENTRIES) {
    keys.slice(0, keys.length - MAX_CACHE_ENTRIES).forEach((staleKey) => delete cache.entries[staleKey]);
  }
  return true;
}

export function createFutbinFilteredPlayersUrl(context = {}) {
  const source = safeContext(context);
  const season = positiveInteger(source.season);
  const platform = normalizedPlatform(source.platform);
  const nationId = positiveInteger(source.nationId);
  const leagueId = positiveInteger(source.leagueId);
  const teamId = positiveInteger(source.teamId);
  const rating = positiveInteger(source.rating);
  const position = String(source.position || '').trim();
  if (!season || !platform || !nationId || !leagueId || !teamId || !rating || !position) return null;
  const query = new URLSearchParams({
    platform,
    nation: String(nationId),
    league: String(leagueId),
    rating: `${rating}-${rating}`,
    club: String(teamId),
    sort: 'rating',
    position,
    order: 'desc',
    page: '1',
  });
  return `https://www.futbin.org/futbin/api/${season}/getFilteredPlayers?${query.toString()}`;
}

export function parseFutbinFilteredPlayerId(responseText, definitionId) {
  const targetDefinitionId = positiveInteger(definitionId);
  if (!targetDefinitionId || typeof responseText !== 'string') return null;
  let response;
  try { response = JSON.parse(responseText); } catch { return null; }
  const entries = Array.isArray(response?.data) ? response.data : [];
  const exactMatch = entries.find((entry) => positiveInteger(entry?.resource_id) === targetDefinitionId);
  return positiveInteger(exactMatch?.ID);
}

async function mapWithConcurrency(entries, limit, callback) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, Number(limit) || 1), entries.length) }, async () => {
    while (cursor < entries.length) {
      const index = cursor++;
      results[index] = await callback(entries[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function resolveFutbinCardIds(options = {}) {
  const items = Array.isArray(options.items) ? options.items : [];
  const cache = normalizeFutbinCardIdCache(options.cache);
  const hydrateItem = typeof options.hydrateItem === 'function' ? options.hydrateItem : (item) => item;
  const resolveKnownId = typeof options.resolveKnownId === 'function' ? options.resolveKnownId : () => null;
  const getLookupContext = typeof options.getLookupContext === 'function' ? options.getLookupContext : () => null;
  const shouldResolve = typeof options.shouldResolve === 'function' ? options.shouldResolve : () => true;
  const requestText = typeof options.requestText === 'function' ? options.requestText : null;
  const ids = new Map();
  const queued = new Map();
  let cacheHits = 0;

  for (const originalItem of items) {
    const definitionId = positiveInteger(originalItem?.definitionId);
    if (!definitionId || ids.has(definitionId)) continue;
    let item = originalItem;
    try { item = hydrateItem(originalItem) || originalItem; } catch { item = originalItem; }
    const knownId = positiveInteger(resolveKnownId(item)) || positiveInteger(resolveKnownId(originalItem));
    if (knownId) {
      ids.set(definitionId, knownId);
      continue;
    }
    if (!shouldResolve(originalItem)) continue;
    const context = getLookupContext(item) || getLookupContext(originalItem);
    const cacheHit = getCachedFutbinPlayerId(cache, context);
    if (cacheHit) {
      ids.set(definitionId, cacheHit);
      cacheHits++;
      continue;
    }
    const url = createFutbinFilteredPlayersUrl(context);
    if (url) queued.set(definitionId, { item, context, url });
  }

  const lookups = [...queued.values()];
  const responses = requestText
    ? await mapWithConcurrency(lookups, options.maxConcurrency || 2, async (lookup) => {
      try {
        const body = await requestText(lookup.url, {
          headers: { Accept: 'application/json' },
          sendCookies: false,
          timeout: 10000,
        });
        const id = parseFutbinFilteredPlayerId(body, lookup.context.definitionId);
        return { ...lookup, id, failed: false };
      } catch {
        return { ...lookup, id: null, failed: true };
      }
    })
    : lookups.map((lookup) => ({ ...lookup, id: null, failed: true }));

  let resolved = 0;
  let failed = 0;
  responses.forEach((response) => {
    if (!response.id) {
      if (response.failed) failed++;
      return;
    }
    ids.set(response.context.definitionId, response.id);
    cacheFutbinPlayerId(cache, response.context, response.id);
    resolved++;
  });

  return {
    ids,
    cache,
    cacheHits,
    queried: lookups.length,
    resolved,
    failed,
    unmatched: lookups.length - resolved - failed,
  };
}
