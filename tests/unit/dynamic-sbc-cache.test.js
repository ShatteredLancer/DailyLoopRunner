import { describe, expect, it, vi } from 'vitest';
import {
  createDynamicSbcCache,
  DYNAMIC_SBC_PARSER_VERSION,
  dynamicSbcLoadErrorCode,
  dynamicSbcLoadFailurePolicy,
  isCompatibleDynamicSbcIndex,
  normalizeDynamicSbcCache,
  normalizeDynamicSbcScanHealth,
  scanDynamicSbcSnapshots,
  updateDynamicSbcScanHealth,
} from '../../src/sbc/dynamic-sbc-cache.js';

function makeSet(overrides = {}) {
  return {
    id: 100,
    name: '1 of 3 84+ Player Pick',
    timesCompleted: 0,
    repeats: 3,
    rewards: [{ type: 'PLAYER_PICK', resourceId: 500, name: 'Pick', candidateCount: 3, selectionCount: 1 }],
    challengeIds: [200],
    categoryIds: [],
    categoryNames: [],
    categoriesAvailable: true,
    inUpgradesCategory: false,
    ...overrides,
  };
}

async function scan(input = {}) {
  const sets = input.sets || [makeSet()];
  const loadChallenges = input.loadChallenges || vi.fn(async () => [{ id: 200, requiredPlayerCount: 4 }]);
  return scanDynamicSbcSnapshots({
    cache: input.cache,
    now: () => input.now ?? 1000,
    maxAgeMs: input.maxAgeMs ?? 10000,
    forceFull: input.forceFull,
    loadAttempts: input.loadAttempts,
    loadRetryDelayMs: input.loadRetryDelayMs,
    sleep: input.sleep,
    onLoadRetry: input.onLoadRetry,
    refreshSets: vi.fn(async () => ({ success: true })),
    listSets: () => sets,
    snapshotIndex: (set) => ({ ...set, challenges: [] }),
    snapshotSet: (set, challenges) => ({ ...set, challenges: challenges === null ? set.challenges || [] : challenges }),
    loadChallenges,
    isCandidate: () => true,
  });
}

describe('dynamic SBC cache', () => {
  it('classifies EA load errors and bounds transient retries', () => {
    expect(dynamicSbcLoadErrorCode(new Error('EA error 429 Too Many Requests'))).toBe(429);
    expect(dynamicSbcLoadErrorCode({ status: 512 })).toBe(512);
    expect(dynamicSbcLoadFailurePolicy(new Error('429'), { attempt: 1, attempts: 3 }))
      .toEqual({ code: 429, retry: false, openCircuit: true });
    expect(dynamicSbcLoadFailurePolicy(new Error('512'), { attempt: 1, attempts: 3 }).retry).toBe(true);
    expect(dynamicSbcLoadFailurePolicy(new Error('512'), { attempt: 2, attempts: 3 }).retry).toBe(false);
  });

  it('adapts the next scan request gap from recent request health', () => {
    const healthy = updateDynamicSbcScanHealth({}, {
      requestCount: 20,
      failureCount: 0,
      rateLimitCount: 0,
    }, 1000);
    expect(healthy.recommendedGapMs).toBe(1000);

    const degraded = updateDynamicSbcScanHealth(healthy, {
      requestCount: 20,
      failureCount: 4,
      rateLimitCount: 0,
    }, 2000);
    expect(degraded.recommendedGapMs).toBe(2500);

    const limited = updateDynamicSbcScanHealth(degraded, {
      requestCount: 5,
      failureCount: 1,
      rateLimitCount: 1,
    }, 3000);
    expect(limited.recommendedGapMs).toBe(3000);
    expect(normalizeDynamicSbcScanHealth(limited, 3000)).toMatchObject({
      failureCount: 1,
      rateLimitCount: 1,
      recommendedGapMs: 3000,
    });
    expect(normalizeDynamicSbcScanHealth(limited, 3000 + (25 * 60 * 60 * 1000)).recommendedGapMs).toBe(1200);
    expect(updateDynamicSbcScanHealth(limited, { requestCount: 0 }, 4000)).toEqual(limited);
  });

  it('reuses unchanged Challenge snapshots while merging current progress', async () => {
    const first = await scan();
    const loadChallenges = vi.fn(async () => { throw new Error('should not reload'); });
    const second = await scan({
      cache: first.cache,
      sets: [makeSet({ timesCompleted: 1 })],
      now: 2000,
      loadChallenges,
    });

    expect(loadChallenges).not.toHaveBeenCalled();
    expect(second.stats.cacheHits).toBe(1);
    expect(second.results[0]).toMatchObject({ cacheStatus: 'hit' });
    expect(second.results[0].snapshot).toMatchObject({ timesCompleted: 1, challenges: [{ id: 200 }] });
  });

  it('treats newly exposed matching Challenge ids as compatible index enrichment', async () => {
    const first = await scan({ sets: [makeSet({ challengeIds: [] })] });
    const loadChallenges = vi.fn(async () => { throw new Error('should not reload'); });
    const second = await scan({
      cache: first.cache,
      sets: [makeSet({ challengeIds: [200] })],
      now: 2000,
      loadChallenges,
    });

    expect(isCompatibleDynamicSbcIndex(first.results[0].snapshot, makeSet({ challengeIds: [200] }))).toBe(true);
    expect(loadChallenges).not.toHaveBeenCalled();
    expect(second.results[0].cacheStatus).toBe('compatible-hit');
    expect(second.results[0].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
  });

  it('rescans new, changed, expired and forced entries and removes missing Sets', async () => {
    const first = await scan();
    const changedLoader = vi.fn(async () => [{ id: 201, requiredPlayerCount: 11 }]);
    const changed = await scan({
      cache: first.cache,
      sets: [makeSet({ challengeIds: [201] })],
      now: 2000,
      loadChallenges: changedLoader,
    });
    expect(changedLoader).toHaveBeenCalledOnce();
    expect(changed.stats.changedSets).toBe(1);

    const changedSet = makeSet({ challengeIds: [201] });
    const expired = await scan({ cache: changed.cache, sets: [changedSet], now: 20000, maxAgeMs: 1000 });
    expect(expired.stats.expiredEntries).toBe(1);
    expect(expired.stats.rescanned).toBe(1);

    const forced = await scan({ cache: expired.cache, sets: [changedSet], now: 21000, forceFull: true });
    expect(forced.results[0].cacheStatus).toBe('forced');

    const removed = await scan({ cache: forced.cache, sets: [], now: 22000 });
    expect(removed.stats.removedEntries).toBe(1);
    expect(removed.cache.sets).toEqual({});
  });

  it('retains a good unchanged snapshot when a refresh load temporarily fails', async () => {
    const first = await scan();
    const failed = await scan({
      cache: first.cache,
      now: 20000,
      maxAgeMs: 1000,
      loadChallenges: vi.fn(async () => { throw new Error('temporary outage'); }),
    });

    expect(failed.stats.loadFailures).toBe(1);
    expect(failed.results[0].cacheStatus).toBe('load-failed-compatible-cache');
    expect(failed.stats.cacheFallbacks).toBe(1);
    expect(failed.results[0].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
    expect(failed.cache.sets['100'].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
  });

  it('keeps a compatible validated snapshot when a forced rescan is rate-limited', async () => {
    const first = await scan();
    const failed = await scan({
      cache: first.cache,
      now: 2000,
      forceFull: true,
      loadAttempts: 1,
      loadChallenges: vi.fn(async () => { throw new Error('429 Too Many Requests'); }),
    });

    expect(failed.results[0].cacheStatus).toBe('load-failed-compatible-cache');
    expect(failed.results[0].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
    expect(failed.stats.cacheFallbacks).toBe(1);
  });

  it('retries transient Challenge metadata failures before marking the Set unavailable', async () => {
    const loadChallenges = vi.fn()
      .mockRejectedValueOnce(new Error('temporary 512'))
      .mockResolvedValue([{ id: 200, requiredPlayerCount: 11 }]);
    const sleep = vi.fn(async () => {});
    const onLoadRetry = vi.fn(async () => {});
    const result = await scan({
      loadChallenges,
      loadAttempts: 3,
      loadRetryDelayMs: 3000,
      sleep,
      onLoadRetry,
    });

    expect(loadChallenges).toHaveBeenCalledTimes(2);
    expect(onLoadRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      attempts: 3,
      delayMs: 3000,
    }));
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(result.stats.loadRetries).toBe(1);
    expect(result.stats.loadFailures).toBe(0);
    expect(result.results[0].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 11 }]);
  });

  it('opens a scan circuit on 429, retains compatible cache, and skips later requests', async () => {
    const first = await scan({
      sets: [makeSet({ id: 100 }), makeSet({ id: 101, challengeIds: [201] })],
      loadChallenges: vi.fn(async (set) => [{ id: set.id + 100, requiredPlayerCount: 4 }]),
    });
    const loadChallenges = vi.fn(async () => { throw new Error('429 Too Many Requests'); });
    const onCircuitOpen = vi.fn(async () => {});
    const onLoadSkipped = vi.fn(async () => {});
    const result = await scanDynamicSbcSnapshots({
      cache: first.cache,
      now: () => 2000,
      forceFull: true,
      loadAttempts: 3,
      refreshSets: vi.fn(async () => ({ success: true })),
      listSets: () => [makeSet({ id: 100 }), makeSet({ id: 101, challengeIds: [201] })],
      snapshotIndex: (set) => ({ ...set, challenges: [] }),
      snapshotSet: (set, challenges) => ({ ...set, challenges: challenges || [] }),
      loadChallenges,
      isCandidate: () => true,
      onCircuitOpen,
      onLoadSkipped,
    });

    expect(loadChallenges).toHaveBeenCalledTimes(1);
    expect(onCircuitOpen).toHaveBeenCalledTimes(1);
    expect(onLoadSkipped).toHaveBeenCalledTimes(1);
    expect(result.stats).toMatchObject({
      loadRetries: 0,
      loadFailures: 2,
      cacheFallbacks: 2,
      circuitBreakers: 1,
      circuitSkipped: 1,
    });
    expect(result.results.map((entry) => entry.cacheStatus))
      .toEqual(['load-failed-compatible-cache', 'load-failed-compatible-cache']);
  });

  it('leaves a new Set unavailable after the 429 circuit opens', async () => {
    const first = await scan({ sets: [makeSet({ id: 100 })] });
    const loadChallenges = vi.fn(async () => { throw new Error('429 Too Many Requests'); });
    const result = await scanDynamicSbcSnapshots({
      cache: first.cache,
      now: () => 2000,
      forceFull: true,
      loadAttempts: 3,
      refreshSets: vi.fn(async () => ({ success: true })),
      listSets: () => [makeSet({ id: 100 }), makeSet({ id: 102, challengeIds: [202] })],
      snapshotIndex: (set) => ({ ...set, challenges: [] }),
      snapshotSet: (set, challenges) => ({ ...set, challenges: challenges || [] }),
      loadChallenges,
      isCandidate: () => true,
    });

    expect(loadChallenges).toHaveBeenCalledTimes(1);
    expect(result.results[0].cacheStatus).toBe('load-failed-compatible-cache');
    expect(result.results[1].cacheStatus).toBe('forced');
    expect(result.results[1].loadError?.code).toBe('DYNAMIC_SBC_SCAN_CIRCUIT_OPEN');
    expect(result.results[1].snapshot.challenges).toEqual([]);
  });

  it('does not fall back when reward or Challenge identity changed', async () => {
    const first = await scan();
    const changedSet = makeSet({
      challengeIds: [201],
      rewards: [{ type: 'PACK', packId: 999, resourceId: 999, name: 'Changed reward' }],
    });
    const failed = await scan({
      cache: first.cache,
      sets: [changedSet],
      now: 2000,
      forceFull: true,
      loadAttempts: 1,
      loadChallenges: vi.fn(async () => { throw new Error('429 Too Many Requests'); }),
    });

    expect(failed.results[0].cacheStatus).toBe('forced');
    expect(failed.stats.cacheFallbacks).toBe(0);
    expect(failed.results[0].snapshot.challenges).toEqual([]);
  });

  it('rejects incompatible cache schemas', async () => {
    const result = await scan({ cache: { ...createDynamicSbcCache(), schemaVersion: 99 } });
    expect(result.stats.newSets).toBe(1);
  });

  it('keeps raw Challenge snapshots when only the parser version changes', () => {
    const cache = createDynamicSbcCache(1000);
    cache.parserVersion = Math.max(0, DYNAMIC_SBC_PARSER_VERSION - 1);
    cache.sets['100'] = {
      setId: 100,
      fingerprint: 'stable',
      snapshot: makeSet({ challenges: [{ id: 200, requiredPlayerCount: 4 }] }),
      scannedAt: 1000,
      validatedAt: 1000,
    };

    const normalized = normalizeDynamicSbcCache(cache, 2000);
    expect(normalized.parserVersion).toBe(DYNAMIC_SBC_PARSER_VERSION);
    expect(normalized.sets['100'].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
  });

  it('preserves Set-local Challenge snapshots for completed candidates without a network load', async () => {
    const completed = makeSet({ complete: true, challenges: [{ id: 200, requiredPlayerCount: 4 }] });
    const loadChallenges = vi.fn(async () => []);
    const result = await scan({ sets: [completed], loadChallenges });
    expect(loadChallenges).not.toHaveBeenCalled();
    expect(result.results[0].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
  });

  it('reloads an empty completed cache snapshot when the Set becomes incomplete again', async () => {
    const completed = await scan({ sets: [makeSet({ complete: true, challenges: [] })] });
    expect(completed.results[0].snapshot.challenges).toEqual([]);
    const loadChallenges = vi.fn(async () => [{ id: 200, requiredPlayerCount: 4 }]);
    const reopened = await scan({
      cache: completed.cache,
      sets: [makeSet({ complete: false, challenges: [] })],
      now: 2000,
      loadChallenges,
    });

    expect(loadChallenges).toHaveBeenCalledOnce();
    expect(reopened.stats.invalidEntries).toBe(1);
    expect(reopened.results[0].cacheStatus).toBe('invalid');
    expect(reopened.results[0].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
  });
});
