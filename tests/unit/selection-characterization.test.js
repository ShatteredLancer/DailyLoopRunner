import { describe, expect, it } from 'vitest';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

describe('current inventory selection behavior', () => {
  it('selects the exact common/rare ratio instead of filling common slots with rares', async () => {
    const storage = [
      makePlayer({ id: 1, rating: 75, rareflag: 1 }),
      makePlayer({ id: 2, rating: 76, rareflag: 1 }),
      makePlayer({ id: 3, rating: 77, rareflag: 1 }),
      makePlayer({ id: 4, rating: 78, rareflag: 1 }),
      makePlayer({ id: 5, rating: 75, rareflag: 0 }),
    ];
    const { api } = await loadUserscript({ storage });
    const selection = api.selectInventoryPlayers([
      { tier: 'gold', rarity: 'rare', count: 3, playerOnly: true, allowSpecial: false },
      { tier: 'gold', rarity: 'common', count: 1, playerOnly: true, allowSpecial: false },
    ], ['storage']);

    expect(selection.ok).toBe(true);
    expect(selection.selected.filter((item) => item.rareflag > 0)).toHaveLength(3);
    expect(selection.selected.filter((item) => item.rareflag === 0)).toHaveLength(1);
  });

  it('protects 82+ normal gold cards when protectHighGold is enabled', async () => {
    const storage = [
      makePlayer({ id: 10, rating: 86, rareflag: 0 }),
      makePlayer({ id: 11, rating: 81, rareflag: 0 }),
    ];
    const { api } = await loadUserscript({ storage });
    const selection = api.selectInventoryPlayers([
      { tier: 'gold', rarity: 'common', count: 1, playerOnly: true, allowSpecial: false, protectHighGold: true },
    ], ['storage']);

    expect(selection.ok).toBe(true);
    expect(selection.selected.map((item) => item.rating)).toEqual([81]);
  });

  it('rejects special cards for normal bronze, silver and gold requirements', async () => {
    const storage = [
      makePlayer({ id: 20, rating: 64, rareflag: 2 }),
      makePlayer({ id: 21, rating: 64, rareflag: 0 }),
      makePlayer({ id: 22, rating: 74, rareflag: 2 }),
      makePlayer({ id: 23, rating: 74, rareflag: 0 }),
      makePlayer({ id: 24, rating: 80, rareflag: 2 }),
      makePlayer({ id: 25, rating: 80, rareflag: 0 }),
    ];
    const { api } = await loadUserscript({ storage });
    const selection = api.selectInventoryPlayers([
      { tier: 'bronze', count: 1, playerOnly: true, allowSpecial: false },
      { tier: 'silver', count: 1, playerOnly: true, allowSpecial: false },
      { tier: 'gold', count: 1, playerOnly: true, allowSpecial: false },
    ], ['storage']);

    expect(selection.ok).toBe(true);
    expect(selection.selected.map((item) => item.id)).toEqual([21, 23, 25]);
  });

  it('resolves an Unassigned duplicate signal to the actual club item', async () => {
    const clubItem = makePlayer({ id: 200, definitionId: 500, rating: 80, rareflag: 0 });
    const signal = makePlayer({
      id: 100,
      definitionId: 500,
      duplicateId: 200,
      duplicate: true,
      rating: 80,
      rareflag: 0,
    });
    const { api } = await loadUserscript({ club: [clubItem], unassigned: [signal] });
    const selection = api.selectInventoryPlayers([
      { tier: 'gold', rarity: 'common', count: 1, playerOnly: true, allowSpecial: false },
    ], ['unassigned']);

    expect(selection.ok).toBe(true);
    expect(selection.selected[0].id).toBe(200);
    expect(selection.entries[0].signal.id).toBe(100);
    expect(selection.resolvedSignals.unassigned).toBe(1);
  });

  it('uses just-opened transient duplicate signals before the EA Unassigned repository refreshes', async () => {
    const club = [
      makePlayer({ id: 201, definitionId: 501, rating: 75, rareflag: 1 }),
      makePlayer({ id: 202, definitionId: 502, rating: 76, rareflag: 1 }),
      makePlayer({ id: 203, definitionId: 503, rating: 77, rareflag: 1 }),
    ];
    const storage = [
      makePlayer({ id: 204, definitionId: 504, rating: 78, rareflag: 1 }),
      makePlayer({ id: 205, definitionId: 505, rating: 79, rareflag: 1 }),
      makePlayer({ id: 206, definitionId: 506, rating: 80, rareflag: 1 }),
    ];
    const transientUnassignedSignals = club.map((item, index) => ({
      id: 1001 + index,
      definitionId: item.definitionId,
      type: 'player',
      rating: item.rating,
      rareflag: 1,
      rare: true,
      special: false,
      duplicate: true,
      duplicateId: item.id,
      pile: 'unassigned',
    }));
    const { api } = await loadUserscript({
      club,
      storage,
      unassigned: [],
      pileSizes: { storage: 100 },
      pileCounts: { storage: 98 },
    });
    const selection = api.selectInventoryPlayers([
      { tier: 'gold', rarity: 'rare', count: 6, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true },
    ], ['unassigned', 'storage', 'transfer', 'club'], {
      transientUnassignedSignals,
      preferredSignalRefs: transientUnassignedSignals,
    });

    expect(selection.ok).toBe(true);
    expect(selection.selected.map((item) => item.id)).toEqual([201, 202, 203, 204, 205, 206]);
    expect(selection.stats).toEqual({ unassigned: 3, storage: 3 });
    expect(selection.entries.filter((entry) => entry.signal).map((entry) => entry.signal.id)).toEqual([1001, 1002, 1003]);
  });

  it('consumes all four response duplicates when the EA repository has materialized only three', async () => {
    const club = [
      makePlayer({ id: 221, definitionId: 521, rating: 75, rareflag: 1 }),
      makePlayer({ id: 222, definitionId: 522, rating: 76, rareflag: 1 }),
      makePlayer({ id: 223, definitionId: 523, rating: 77, rareflag: 1 }),
      makePlayer({ id: 224, definitionId: 524, rating: 78, rareflag: 1 }),
      makePlayer({ id: 225, definitionId: 525, rating: 79, rareflag: 1 }),
      makePlayer({ id: 226, definitionId: 526, rating: 80, rareflag: 1 }),
    ];
    const responseSignals = club.slice(0, 4).map((item, index) => ({
      id: 1201 + index,
      definitionId: item.definitionId,
      type: 'player',
      rating: item.rating,
      rareflag: 1,
      rare: true,
      special: false,
      duplicate: true,
      duplicateId: item.id,
      pile: 'unassigned',
    }));
    const { api } = await loadUserscript({
      club,
      unassigned: responseSignals.slice(0, 3),
    });
    const selection = api.selectInventoryPlayers([
      { tier: 'gold', rarity: 'rare', count: 6, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true },
    ], ['unassigned', 'storage', 'transfer', 'club'], {
      transientUnassignedSignals: responseSignals,
      preferredSignalRefs: responseSignals,
    });

    expect(selection.ok).toBe(true);
    expect(selection.selected.map((item) => item.id)).toEqual([221, 222, 223, 224, 225, 226]);
    expect(selection.stats).toEqual({ unassigned: 4, club: 2 });
    expect(selection.entries.filter((entry) => entry.signal).map((entry) => entry.signal.id)).toEqual([1201, 1202, 1203, 1204]);
  });

  it('does not let transient signals bypass the 82+ or special-card protection', async () => {
    const club = [
      makePlayer({ id: 211, definitionId: 511, rating: 86, rareflag: 1 }),
      makePlayer({ id: 212, definitionId: 512, rating: 80, rareflag: 2 }),
    ];
    const transientUnassignedSignals = club.map((item, index) => ({
      id: 1101 + index,
      definitionId: item.definitionId,
      type: 'player',
      rating: item.rating,
      rareflag: item.rareflag,
      rare: true,
      special: item.rareflag > 1,
      duplicate: true,
      duplicateId: item.id,
      pile: 'unassigned',
    }));
    const { api } = await loadUserscript({ club, unassigned: [] });
    const selection = api.selectInventoryPlayers([
      { tier: 'gold', rarity: 'rare', count: 1, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true },
    ], ['unassigned'], { transientUnassignedSignals });

    expect(selection.ok).toBe(false);
    expect(selection.selected).toEqual([]);
  });

  it('does not select two instances with the same definition id', async () => {
    const storage = [
      makePlayer({ id: 301, definitionId: 900, rating: 75 }),
      makePlayer({ id: 302, definitionId: 900, rating: 75 }),
      makePlayer({ id: 303, definitionId: 901, rating: 76 }),
    ];
    const { api } = await loadUserscript({ storage });
    const selection = api.selectInventoryPlayers([
      { tier: 'gold', count: 2, playerOnly: true, allowSpecial: false },
    ], ['storage']);

    expect(selection.ok).toBe(true);
    expect(new Set(selection.selected.map((item) => item.definitionId)).size).toBe(2);
  });

  it('obeys FSU lock and only-untradeable filters', async () => {
    const storage = [
      makePlayer({ id: 401, rating: 75, untradeable: true }),
      makePlayer({ id: 402, rating: 76, untradeable: false }),
      makePlayer({ id: 403, rating: 77, untradeable: true }),
    ];
    const { api } = await loadUserscript({ storage });
    api.setFsuSettingsOverride({
      onlyUntradeable: true,
      excludeDesignatedLeagues: false,
      useRarityPlayer: true,
      excludeEvolution: false,
      priorityStoragePlayers: false,
      priorityNonSpecialPlayers: true,
      priorityRareWithinGoldRange: false,
      silverBronzePrioritizeNormal: true,
      goldRange: [75, 99],
      lockedItemIds: [401],
      lockedDefinitionIds: [],
    });
    const selection = api.selectInventoryPlayers([
      { tier: 'gold', count: 1, playerOnly: true, allowSpecial: false },
    ], ['storage']);

    expect(selection.ok).toBe(true);
    expect(selection.selected.map((item) => item.id)).toEqual([403]);
  });
});
