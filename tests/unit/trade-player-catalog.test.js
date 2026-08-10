import { describe, expect, it, vi } from 'vitest';
import {
  createPlayerCatalogProvider,
  normalizePlayerCatalogCache,
  parseFutNextPlayerCatalogResponse,
} from '../../src/trade/player-catalog.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

describe('Trade Player Catalog Provider', () => {
  it('parses, deduplicates and sorts the observed FUTNext rating response', () => {
    expect(parseFutNextPlayerCatalogResponse(JSON.stringify({ ids: ['20', 10, 20, 0] }))).toEqual([10, 20]);
    expect(() => parseFutNextPlayerCatalogResponse('{}')).toThrow(/no definition IDs/);
  });

  it('loads exact rating lanes and reuses a fresh persisted cache', async () => {
    const storage = memoryStorage();
    const requestText = vi.fn(async (url) => JSON.stringify({ ids: url.includes('rating=84') ? [8402, 8401] : [8501] }));
    const provider = createPlayerCatalogProvider({ requestText, storage, now: () => 1000 });
    const loaded = await provider.load({ ratingMin: 84, ratingMax: 85, platform: 'pc' });
    expect(loaded.ok).toBe(true);
    expect(loaded.lanes).toEqual([
      expect.objectContaining({ rating: 84, definitionIds: [8401, 8402], source: 'FUTNext' }),
      expect.objectContaining({ rating: 85, definitionIds: [8501], source: 'FUTNext' }),
    ]);
    expect(requestText).toHaveBeenCalledTimes(2);

    const cached = await provider.load({ ratings: [84, 85], platform: 'pc' });
    expect(cached.lanes.every((lane) => lane.source === 'cache')).toBe(true);
    expect(requestText).toHaveBeenCalledTimes(2);
    expect(JSON.parse(JSON.stringify(cached))).toEqual(cached);
  });

  it('invalidates cache by platform, season and parser version', () => {
    const raw = {
      schemaVersion: 1,
      parserVersion: 1,
      season: '26',
      platform: 'pc',
      lanes: { 84: { rating: 84, definitionIds: [1], fetchedAt: 1, expiresAt: 100 } },
    };
    expect(normalizePlayerCatalogCache(raw, { platform: 'pc', season: '26', parserVersion: 1 }).lanes[84]).toBeTruthy();
    expect(normalizePlayerCatalogCache(raw, { platform: 'ps', season: '26', parserVersion: 1 }).lanes).toEqual({});
    expect(normalizePlayerCatalogCache(raw, { platform: 'pc', season: '27', parserVersion: 1 }).lanes).toEqual({});
    expect(normalizePlayerCatalogCache(raw, { platform: 'pc', season: '26', parserVersion: 2 }).lanes).toEqual({});
  });

  it('does not use expired data after a failed refresh and stops requests after 429', async () => {
    const storage = memoryStorage();
    storage.set('fc-loop-runner-trade-player-catalog-v1', {
      schemaVersion: 1,
      parserVersion: 1,
      season: '26',
      platform: 'pc',
      lanes: { 84: { rating: 84, definitionIds: [8401], fetchedAt: 1, expiresAt: 10 } },
    });
    const requestText = vi.fn(async () => { throw new Error('HTTP 429'); });
    const provider = createPlayerCatalogProvider({ requestText, storage, now: () => 1000 });
    const result = await provider.load({ ratingMin: 84, ratingMax: 85, platform: 'pc' });
    expect(result.ok).toBe(false);
    expect(result.lanes).toEqual([]);
    expect(result.missingRatings).toEqual([84, 85]);
    expect(result.attempts).toEqual([
      expect.objectContaining({ rating: 84, status: 'error', errorKind: 'rate-limit' }),
      expect.objectContaining({ rating: 85, status: 'skipped' }),
    ]);
    expect(requestText).toHaveBeenCalledTimes(1);
  });

  it('exposes network-free allowlisted health and explicit cache invalidation', async () => {
    let time = 1000;
    const storage = memoryStorage();
    const requestText = vi.fn(async () => JSON.stringify({ ids: [8401, 8402] }));
    const provider = createPlayerCatalogProvider({ requestText, storage, now: () => time });
    expect(provider.inspect()).toMatchObject({
      schemaVersion: 1,
      provider: 'FUTNext',
      status: 'empty',
      cache: { lanes: 0, definitions: 0 },
      activity: { loadCount: 0, lastLoad: null, lastClearedAt: null },
    });
    expect(requestText).not.toHaveBeenCalled();
    await provider.load({ rating: 84, platform: 'pc', ttlMs: 100 });
    const health = provider.inspect();
    expect(health).toMatchObject({
      status: 'fresh',
      cache: { lanes: 1, freshLanes: 1, expiredLanes: 0, definitions: 2 },
      activity: {
        loadCount: 1,
        lastLoad: { platform: 'pc', ratings: [84], ok: true, lanes: 1, missing: 0 },
      },
    });
    expect(JSON.stringify(health)).not.toContain('definitionId');
    expect(JSON.stringify(health)).not.toContain('8401');
    expect(requestText).toHaveBeenCalledTimes(1);
    time = 1200;
    expect(provider.inspect()).toMatchObject({ status: 'stale', cache: { freshLanes: 0, expiredLanes: 1 } });
    expect(requestText).toHaveBeenCalledTimes(1);
    provider.clear();
    expect(provider.inspect()).toMatchObject({
      status: 'empty',
      cache: { lanes: 0 },
      activity: { loadCount: 1, lastClearedAt: 1200 },
    });
  });
});
