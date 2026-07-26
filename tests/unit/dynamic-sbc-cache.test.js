import { describe, expect, it, vi } from 'vitest';
import {
  createDynamicSbcCache,
  scanDynamicSbcSnapshots,
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
    refreshSets: vi.fn(async () => ({ success: true })),
    listSets: () => sets,
    snapshotIndex: (set) => ({ ...set, challenges: [] }),
    snapshotSet: (set, challenges) => ({ ...set, challenges: challenges === null ? set.challenges || [] : challenges }),
    loadChallenges,
    isCandidate: () => true,
  });
}

describe('dynamic SBC cache', () => {
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
    expect(failed.results[0].cacheStatus).toBe('load-failed-cached');
    expect(failed.results[0].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
    expect(failed.cache.sets['100'].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
  });

  it('rejects incompatible cache schemas', async () => {
    const result = await scan({ cache: { ...createDynamicSbcCache(), schemaVersion: 99 } });
    expect(result.stats.newSets).toBe(1);
  });

  it('preserves Set-local Challenge snapshots for completed candidates without a network load', async () => {
    const completed = makeSet({ complete: true, challenges: [{ id: 200, requiredPlayerCount: 4 }] });
    const loadChallenges = vi.fn(async () => []);
    const result = await scan({ sets: [completed], loadChallenges });
    expect(loadChallenges).not.toHaveBeenCalled();
    expect(result.results[0].snapshot.challenges).toEqual([{ id: 200, requiredPlayerCount: 4 }]);
  });
});
