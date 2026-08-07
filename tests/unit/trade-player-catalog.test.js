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
});
