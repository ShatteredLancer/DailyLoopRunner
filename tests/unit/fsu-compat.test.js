import { describe, expect, it } from 'vitest';
import { createStorageAdapter } from '../../src/adapters/browser/storage.js';
import {
  mergeLockedPlayersIntoSettings,
  normalizeFsuSettings,
  normalizeLockedPlayerIds,
  readFsuLockedPlayersFromStorage,
  readFsuSettingsFromStorage,
} from '../../src/config/fsu-compat.js';

function storage(values = {}) {
  const entries = new Map(Object.entries(values));
  return createStorageAdapter({
    getItem: (key) => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
    key: (index) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  });
}

describe('FSU compatibility parsing', () => {
  it('normalizes nested aliases, leagues, ranges, and locked identities', () => {
    const settings = normalizeFsuSettings({
      goldRange: [75, 81],
      options: {
        onlyUntradeable: true,
        excludeEvolution: false,
        priorityStoragePlayers: false,
        excludedLeagueIds: '31,16',
        lockedPlayers: [{ id: 100, definitionId: 200 }],
      },
    }, 'fixture');
    expect(settings).toMatchObject({
      onlyUntradeable: true,
      excludeEvolution: false,
      priorityStoragePlayers: false,
      excludeDesignatedLeagues: true,
      excludedLeagueIds: [31, 16],
      goldRange: [75, 81],
      lockedItemIds: [100],
      lockedDefinitionIds: [200],
      source: 'fixture',
    });
  });

  it('reads exact and discovered storage settings without evaluating unrelated keys', () => {
    const exact = readFsuSettingsFromStorage(storage({
      fsuSettings: JSON.stringify({ onlyUntradeable: true, goldRange: [75, 80] }),
    }), 'localStorage');
    expect(exact).toMatchObject({ onlyUntradeable: true, goldRange: [75, 80], source: 'localStorage:fsuSettings' });

    const discovered = readFsuSettingsFromStorage(storage({
      unrelated: JSON.stringify({ onlyUntradeable: false }),
      enhancer_sbc_ignore_settings: JSON.stringify({ excludeEvolution: true }),
    }), 'sessionStorage');
    expect(discovered).toMatchObject({ excludeEvolution: true, source: 'sessionStorage:enhancer_sbc_ignore_settings' });
  });

  it('extracts and merges locked player identities from storage', () => {
    const adapter = storage({
      'fsu.lockedPlayers': JSON.stringify([{ itemId: 10, assetId: 20 }, { id: 11, definitionId: 21 }]),
      'fsu.unlockedPlayers': JSON.stringify([{ id: 99 }]),
    });
    const locked = readFsuLockedPlayersFromStorage(adapter, 'localStorage');
    expect(locked.itemIds).toEqual(expect.arrayContaining([10, 11]));
    expect(locked.definitionIds).toEqual(expect.arrayContaining([20, 21]));
    const merged = mergeLockedPlayersIntoSettings({
      source: 'window.info.build/set',
      detected: true,
      lockedItemIds: [1],
      lockedDefinitionIds: [2],
    }, locked, 'locked-players');
    expect(merged.lockedItemIds).toEqual(expect.arrayContaining([1, 10, 11]));
    expect(merged.lockedDefinitionIds).toEqual(expect.arrayContaining([2, 20, 21]));
    expect(merged.source).toBe('window.info.build/set+locked-players');
  });

  it('ignores unlock paths while normalizing arbitrary window roots', () => {
    const locked = normalizeLockedPlayerIds({
      unlockedPlayers: [{ id: 90 }],
      protectedCards: [{ resourceId: 30 }],
    }, 'window.FSU');
    expect(locked.itemIds).not.toContain(90);
    expect(locked.itemIds).toContain(30);
    expect(locked.definitionIds).toContain(30);
  });
});
