import { describe, expect, it, vi } from 'vitest';
import { createStorageAdapter } from '../../src/adapters/browser/storage.js';
import { createFsuAdapter } from '../../src/adapters/ea/fsu.js';

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

function adapter(runtime = {}, localValues = {}, sessionValues = {}) {
  return createFsuAdapter(runtime, {
    documentObject: {},
    localStorage: storage(localValues),
    sessionStorage: storage(sessionValues),
  });
}

describe('FSU runtime adapter', () => {
  it('preserves window.info build/set precedence and legacy field mapping', () => {
    const settings = adapter({
      info: {
        build: {
          ignorepos: 0,
          untradeable: 1,
          league: 1,
          flag: 1,
          academy: 0,
          strictlypcik: 0,
          comprange: 0,
          comprare: 0,
          firststorage: 0,
          sbfirstcommon: 0,
        },
        set: { goldenrange: 81, shield_league: '31/16/13' },
      },
      FSU: { onlyUntradeable: false, goldRange: [75, 79] },
    }, {
      fsuSettings: JSON.stringify({ onlyUntradeable: false, goldRange: [75, 78] }),
    }).snapshot();

    expect(settings).toMatchObject({
      ignorePlayerPosition: false,
      onlyUntradeable: true,
      excludeDesignatedLeagues: true,
      excludedLeagueIds: [31, 16, 13],
      useRarityPlayer: true,
      excludeEvolution: false,
      playerPickStrictCommonRare: false,
      priorityRareWithinGoldRange: false,
      priorityNonSpecialPlayers: false,
      priorityStoragePlayers: false,
      silverBronzePrioritizeNormal: false,
      goldRange: [75, 81],
      source: 'window.info.build/set',
      detected: true,
    });
  });

  it('discovers named and dynamic runtime roots when window.info is unavailable', () => {
    const named = adapter({ FSU: {
      options: { onlyUntradeable: true, excludeEvolution: false },
      goldRange: [75, 80],
    } }).snapshot();
    expect(named).toMatchObject({
      onlyUntradeable: true,
      excludeEvolution: false,
      goldRange: [75, 80],
      source: 'window.FSU',
    });

    const dynamic = adapter({ customEnhancerRuntime: {
      settings: { priorityStoragePlayers: false },
      goldRange: [75, 79],
    } }).snapshot();
    expect(dynamic).toMatchObject({
      priorityStoragePlayers: false,
      goldRange: [75, 79],
      source: 'window.customEnhancerRuntime',
    });
  });

  it('uses local storage before session storage and falls back to cloned defaults', () => {
    const stored = adapter({}, {
      fsuSettings: JSON.stringify({ onlyUntradeable: true, goldRange: [75, 80] }),
    }, {
      fsuSettings: JSON.stringify({ onlyUntradeable: false, goldRange: [75, 78] }),
    }).snapshot();
    expect(stored).toMatchObject({
      onlyUntradeable: true,
      goldRange: [75, 80],
      source: 'localStorage:fsuSettings',
    });

    const defaults = adapter().snapshot();
    expect(defaults).toMatchObject({
      onlyUntradeable: false,
      goldRange: [75, 83],
      source: 'compat-defaults',
      detected: false,
    });
    expect(defaults.goldRange).not.toBe(adapter().snapshot().goldRange);
  });

  it('merges locks from runtime and both storage sources into detected settings', () => {
    const settings = adapter({
      info: {
        build: { untradeable: 1 },
        lock: [{ itemId: 10, definitionId: 20 }],
      },
      FSU: { protectedPlayers: [{ id: 11, assetId: 21 }] },
    }, {
      'fsu.lockedPlayers': JSON.stringify([{ itemId: 12, definitionId: 22 }]),
    }, {
      'enhancer.protectedCards': JSON.stringify([{ id: 13, assetId: 23 }]),
    }).snapshot();

    expect(settings.lockedItemIds).toEqual(expect.arrayContaining([10, 11, 12, 13]));
    expect(settings.lockedDefinitionIds).toEqual(expect.arrayContaining([20, 21, 22, 23]));
    expect(settings.source).toBe('window.info.build/set+locked-players');
  });

  it('keeps runtime locks active when a manual settings override is supplied', () => {
    const settings = adapter({
      info: { lock: [{ itemId: 40, definitionId: 50 }] },
    }).snapshot({
      onlyUntradeable: false,
      goldRange: [75, 82],
      lockedItemIds: [],
      lockedDefinitionIds: [],
      detected: true,
      source: 'manual-override',
    });

    expect(settings).toMatchObject({
      source: 'manual-override+locked-players',
      lockedItemIds: [40],
      lockedDefinitionIds: [50],
    });
  });

  it('reports FSU Club readiness without treating an absent FSU as blocked', () => {
    expect(adapter().readiness()).toEqual({
      detected: false,
      ready: true,
      state: 'not-detected',
    });

    expect(adapter({
      info: {
        build: { untradeable: false },
        base: { state: false, reloadPlayersPromise: {} },
      },
    }).readiness()).toEqual({
      detected: true,
      ready: false,
      fullyValidated: false,
      state: 'loading',
    });

    expect(adapter({
      info: {
        build: { untradeable: false },
        base: { state: true },
      },
    }).readiness()).toEqual({
      detected: true,
      ready: true,
      fullyValidated: true,
      state: 'ready',
    });

    expect(adapter({
      info: {
        build: { untradeable: false },
        base: { state: false, clubCache: { status: 'finalizing' } },
      },
    }).readiness()).toEqual({
      detected: true,
      ready: true,
      fullyValidated: true,
      state: 'ready',
      cacheStatus: 'finalizing',
    });
  });

  it('exposes provisional Club cache validation and scoped access controls', async () => {
    const validateClubPlayers = vi.fn(async (refs) => ({ ok: true, items: refs, missing: [] }));
    const beginProvisionalClubAccess = vi.fn(() => 1);
    const endProvisionalClubAccess = vi.fn(() => 0);
    const fsu = adapter({
      info: {
        build: { untradeable: false },
        base: {
          state: false,
          reloadPlayersPromise: {},
          clubCache: { status: 'validating' },
        },
      },
      events: {
        validateClubPlayers,
        beginProvisionalClubAccess,
        endProvisionalClubAccess,
      },
    });

    expect(fsu.readiness()).toEqual({
      detected: true,
      ready: true,
      fullyValidated: false,
      state: 'provisional',
      cacheStatus: 'validating',
    });
    await expect(fsu.validateClubPlayers([{ id: 10, definitionId: 20 }]))
      .resolves.toMatchObject({ ok: true, missing: [] });
    expect(validateClubPlayers).toHaveBeenCalledWith(
      [{ id: 10, definitionId: 20 }],
      {},
    );
    expect(fsu.beginProvisionalClubAccess()).toBe(1);
    expect(fsu.endProvisionalClubAccess()).toBe(0);

    expect(adapter({
      info: {
        build: { untradeable: false },
        base: {
          state: false,
          clubCache: { status: 'validation-failed' },
        },
      },
    }).readiness()).toEqual({
      detected: true,
      ready: true,
      fullyValidated: false,
      state: 'provisional',
      cacheStatus: 'validation-failed',
    });
  });
});
