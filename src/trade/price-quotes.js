import { TRADE_PRICE_PROVIDERS } from './contracts.js';

export const PRICE_QUOTE_SCHEMA_VERSION = 1;
export const DEFAULT_PRICE_QUOTE_TTL_MS = 10 * 60_000;
export const DEFAULT_FUTGG_CIRCUIT_TTL_MS = 30 * 60_000;
export const PRICE_QUOTE_HEALTH_SCHEMA_VERSION = 1;

export function normalizeFutGgProxy(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('FUT.GG proxy must be a valid HTTPS URL'); }
  if (parsed.protocol !== 'https:') throw new Error('FUT.GG proxy must use HTTPS');
  if (parsed.username || parsed.password) throw new Error('FUT.GG proxy must not contain username or password');
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.toString().replace(/\/$/, '');
}

export function buildFutGgPriceUrl({ proxy = '', definitionIds = [], platform = 'pc' } = {}) {
  const ids = normalizeDefinitionIds(definitionIds);
  const normalizedProxy = normalizeFutGgProxy(proxy);
  const base = normalizedProxy || 'https://www.fut.gg/api/fut';
  const separator = base.includes('?') ? (/[?&]$/.test(base) ? '' : '&') : '?';
  const prefix = normalizedProxy ? `${base}${separator}futggapi=` : `${base}/`;
  return `${prefix}player-prices/26/?ids=${encodeURIComponent(ids.join(','))}&platform=${encodeURIComponent(platform)}`;
}

function proxyOrigin(value) {
  try {
    const normalized = normalizeFutGgProxy(value);
    if (!normalized) return null;
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

function parseJson(text, source) {
  try { return JSON.parse(text); } catch { throw new Error(`${source} returned invalid JSON`); }
}

function normalizeDefinitionIds(values = []) {
  return [...new Set((values || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))];
}

function normalizeProvider(value) {
  const provider = String(value || 'auto').trim().toLowerCase().replace('.', '');
  if (!TRADE_PRICE_PROVIDERS.includes(provider)) throw new Error(`Unsupported price provider: ${value}`);
  return provider;
}

function quote(definitionId, price, source, platform, quotedAt, ttlMs) {
  return {
    schemaVersion: PRICE_QUOTE_SCHEMA_VERSION,
    definitionId,
    price,
    source,
    platform,
    quotedAt,
    expiresAt: quotedAt + ttlMs,
  };
}

export function parseFutGgPriceResponse(text) {
  const response = parseJson(text, 'FUT.GG');
  const prices = [];
  for (const entry of response?.data || []) {
    const definitionId = Number(entry?.eaId || entry?.definitionId || 0);
    const price = Number(entry?.price);
    if (Number.isInteger(definitionId) && definitionId > 0 && Number.isFinite(price) && price > 0) {
      prices.push({ definitionId, price });
    }
  }
  return [...new Map(prices.map((entry) => [entry.definitionId, entry])).values()];
}

export function parseFutNextPriceResponse(text) {
  const response = parseJson(text, 'FUTNext');
  const prices = [];
  for (const entry of Array.isArray(response) ? response : []) {
    const definitionId = Number(entry?.definitionId || entry?.eaId || 0);
    const price = Number(entry?.prices?.[0]);
    if (Number.isInteger(definitionId) && definitionId > 0 && Number.isFinite(price) && price > 0) {
      prices.push({ definitionId, price });
    }
  }
  return [...new Map(prices.map((entry) => [entry.definitionId, entry])).values()];
}

async function requestFutGg(options, ids) {
  const proxy = typeof options.getFutGgProxy === 'function'
    ? options.getFutGgProxy()
    : options.futGgProxy;
  const usingProxy = Boolean(normalizeFutGgProxy(proxy));
  const url = buildFutGgPriceUrl({ proxy, definitionIds: ids, platform: options.platform });
  const text = await options.requestText(url, {
    sendCookies: !usingProxy,
    headers: {
      Accept: 'application/json, text/plain, */*',
      ...(usingProxy ? {} : { Referer: options.referer || '' }),
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  return parseFutGgPriceResponse(text);
}

async function requestFutNext(options, ids) {
  const url = `https://enhancer-api.futnext.com/players/prices?ids=${encodeURIComponent(ids.join('_'))}&platform=${encodeURIComponent(options.platform)}`;
  const text = await options.requestText(url, {
    sendCookies: false,
    headers: { Accept: 'application/json, text/plain, */*' },
  });
  return parseFutNextPriceResponse(text);
}

export async function loadPriceQuotes(options = {}) {
  if (typeof options.requestText !== 'function') throw new TypeError('requestText is required');
  const ids = normalizeDefinitionIds(options.definitionIds);
  const provider = normalizeProvider(options.provider);
  const platform = String(options.platform || 'pc').trim().toLowerCase();
  const quotedAt = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const ttlMs = Math.max(1, Number(options.ttlMs || DEFAULT_PRICE_QUOTE_TTL_MS));
  const result = { quotes: [], ids, source: null, attempts: [] };
  if (!ids.length) return result;

  const loaded = new Map();
  const providerSteps = provider === 'auto' ? ['futgg', 'futnext'] : [provider];
  for (const source of providerSteps) {
    const missingIds = ids.filter((id) => !loaded.has(id));
    if (!missingIds.length) break;
    if (source === 'futgg' && provider === 'auto' && options.skipFutGg === true) {
      result.attempts.push({
        source: 'FUT.GG',
        status: 'skipped',
        reason: options.skipFutGgReason || 'FUT.GG circuit is open; using FUTNext',
      });
      continue;
    }
    if (source === 'futnext' && provider === 'auto' && loaded.size && options.fallbackOnPartial === false) break;
    try {
      const entries = source === 'futgg'
        ? await requestFutGg({ ...options, platform }, missingIds)
        : await requestFutNext({ ...options, platform }, missingIds);
      const sourceName = source === 'futgg' ? 'FUT.GG' : 'FUTNext';
      let accepted = 0;
      for (const entry of entries) {
        if (!missingIds.includes(entry.definitionId)) continue;
        loaded.set(entry.definitionId, quote(entry.definitionId, entry.price, sourceName, platform, quotedAt, ttlMs));
        accepted += 1;
      }
      result.attempts.push({ source: sourceName, status: accepted ? 'loaded' : 'empty' });
      if (provider !== 'auto') break;
    } catch (error) {
      result.attempts.push({
        source: source === 'futgg' ? 'FUT.GG' : 'FUTNext',
        status: 'error',
        reason: error?.message || String(error),
      });
    }
  }
  result.quotes = ids.map((id) => loaded.get(id)).filter(Boolean);
  const sources = [...new Set(result.quotes.map((entry) => entry.source))];
  result.source = sources.length === 1 ? sources[0] : sources.length > 1 ? 'mixed' : null;
  return result;
}

function quoteMatchesProvider(entry, provider) {
  if (provider === 'auto') return true;
  if (provider === 'futgg') return entry.source === 'FUT.GG';
  return entry.source === 'FUTNext';
}

export function createPriceQuoteProvider(options = {}) {
  if (typeof options.requestText !== 'function') throw new TypeError('requestText is required');
  const cache = new Map();
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const cacheKey = (platform, definitionId) => `${platform}:${definitionId}`;
  let loadCount = 0;
  let lastLoad = null;
  let lastClearedAt = null;
  let futGgBlockedUntil = 0;
  let futGgBlockReason = null;

  function isFutGgCircuitError(error) {
    return /(?:\bHTTP\s*)?403\b|cloudflare|cf-mitigated|forbidden/i.test(
      String(error?.message || error || ''),
    );
  }

  async function load(request = {}) {
    const provider = normalizeProvider(request.provider || options.provider);
    const ids = normalizeDefinitionIds(request.definitionIds);
    const platform = String(request.platform || options.platform || 'pc').trim().toLowerCase();
    const currentTime = Number(now());
    const fresh = request.forceRefresh === true ? [] : ids
      .map((id) => cache.get(cacheKey(platform, id)))
      .filter((entry) => entry && entry.expiresAt > currentTime && quoteMatchesProvider(entry, provider));
    const freshIds = new Set(fresh.map((entry) => entry.definitionId));
    const missingIds = ids.filter((id) => !freshIds.has(id));
    const futGgCircuitOpen = provider === 'auto' && currentTime < futGgBlockedUntil;
    const loaded = missingIds.length ? await loadPriceQuotes({
      ...options,
      ...request,
      provider,
      platform,
      definitionIds: missingIds,
      now: currentTime,
      skipFutGg: futGgCircuitOpen,
      skipFutGgReason: futGgBlockReason || undefined,
    }) : { quotes: [], ids: [], source: null, attempts: [] };
    const futGgAttempt = loaded.attempts.find((attempt) => attempt.source === 'FUT.GG');
    if (provider === 'auto' && futGgAttempt?.status === 'error' && isFutGgCircuitError(futGgAttempt.reason)) {
      const circuitTtlMs = Math.max(
        1,
        Number(request.futGgCircuitTtlMs || options.futGgCircuitTtlMs || DEFAULT_FUTGG_CIRCUIT_TTL_MS),
      );
      futGgBlockedUntil = currentTime + circuitTtlMs;
      futGgBlockReason = `FUT.GG unavailable (${futGgAttempt.reason}); using FUTNext for ${Math.ceil(circuitTtlMs / 60000)} minutes`;
    } else if (futGgAttempt?.status === 'loaded') {
      futGgBlockedUntil = 0;
      futGgBlockReason = null;
    }
    for (const entry of loaded.quotes) cache.set(cacheKey(entry.platform, entry.definitionId), entry);
    const quotes = ids.map((id) => cache.get(cacheKey(platform, id)))
      .filter((entry) => entry && entry.expiresAt > currentTime && quoteMatchesProvider(entry, provider));
    const sources = [...new Set(quotes.map((entry) => entry.source))];
    const result = {
      quotes,
      ids,
      source: sources.length === 1 ? sources[0] : sources.length > 1 ? 'mixed' : null,
      attempts: [
        ...(fresh.length ? [{ source: 'cache', status: 'loaded', count: fresh.length }] : []),
        ...loaded.attempts,
      ],
    };
    loadCount += 1;
    lastLoad = {
      at: currentTime,
      provider,
      platform,
      requested: ids.length,
      returned: quotes.length,
      attempts: result.attempts.map((attempt) => ({
        source: String(attempt.source || 'unknown'),
        status: String(attempt.status || 'unknown'),
        count: Math.max(0, Number(attempt.count || 0) || 0),
        reason: attempt.reason ? String(attempt.reason).slice(0, 160) : null,
      })),
    };
    return result;
  }

  function clear() {
    cache.clear();
    futGgBlockedUntil = 0;
    futGgBlockReason = null;
    lastClearedAt = Number(now());
  }

  function snapshot() {
    return [...cache.values()].sort((left, right) => left.definitionId - right.definitionId);
  }

  function inspect() {
    const currentTime = Number(now());
    const entries = snapshot();
    const fresh = entries.filter((entry) => Number(entry.expiresAt) > currentTime);
    const expired = entries.length - fresh.length;
    const countBy = (field) => Object.fromEntries([...new Set(entries.map((entry) => String(entry[field] || 'unknown')))]
      .sort()
      .map((key) => [key, entries.filter((entry) => String(entry[field] || 'unknown') === key).length]));
    const quotedAt = entries.map((entry) => Number(entry.quotedAt)).filter(Number.isFinite);
    const expiresAt = entries.map((entry) => Number(entry.expiresAt)).filter(Number.isFinite);
    return {
      schemaVersion: PRICE_QUOTE_HEALTH_SCHEMA_VERSION,
      capturedAt: currentTime,
      providers: ['FUT.GG', 'FUTNext'],
      futGgProxy: {
        configured: Boolean(proxyOrigin(typeof options.getFutGgProxy === 'function' ? options.getFutGgProxy() : options.futGgProxy)),
        origin: proxyOrigin(typeof options.getFutGgProxy === 'function' ? options.getFutGgProxy() : options.futGgProxy),
      },
      status: !entries.length ? 'empty' : !expired ? 'fresh' : !fresh.length ? 'stale' : 'partial',
      cache: {
        entries: entries.length,
        freshEntries: fresh.length,
        expiredEntries: expired,
        bySource: countBy('source'),
        byPlatform: countBy('platform'),
        oldestQuotedAt: quotedAt.length ? Math.min(...quotedAt) : null,
        newestQuotedAt: quotedAt.length ? Math.max(...quotedAt) : null,
        earliestExpiresAt: expiresAt.length ? Math.min(...expiresAt) : null,
        latestExpiresAt: expiresAt.length ? Math.max(...expiresAt) : null,
      },
      activity: {
        loadCount,
        lastLoad: lastLoad ? JSON.parse(JSON.stringify(lastLoad)) : null,
        lastClearedAt,
      },
      futGgCircuit: {
        state: futGgBlockedUntil > currentTime ? 'open' : 'closed',
        blockedUntil: futGgBlockedUntil || null,
        reason: futGgBlockedUntil > currentTime ? futGgBlockReason : null,
      },
    };
  }

  return Object.freeze({ clear, inspect, load, snapshot });
}
