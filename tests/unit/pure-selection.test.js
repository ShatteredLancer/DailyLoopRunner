import { describe, expect, it } from 'vitest';
import { createFakeInventoryAdapter } from '../../src/adapters/fake/inventory.js';
import { selectInventoryPlayers } from '../../src/selection/inventory.js';
import { makePlayer } from '../helpers/load-userscript.js';

const fsuPolicy = {
  onlyUntradeable: false,
  excludeEvolution: false,
  excludeDesignatedLeagues: false,
  excludedLeagueIds: [],
  useRarityPlayer: true,
  priorityStoragePlayers: false,
  priorityNonSpecialPlayers: true,
  priorityRareWithinGoldRange: false,
  silverBronzePrioritizeNormal: true,
  goldRange: [75, 99],
  lockedItemIds: [],
  lockedDefinitionIds: [],
};

describe('pure inventory selector', () => {
  it('selects strict rarity ratios and protects high gold', () => {
    const adapter = createFakeInventoryAdapter({ storage: [
      makePlayer({ id: 1, rating: 75, rareflag: 1 }),
      makePlayer({ id: 2, rating: 76, rareflag: 1 }),
      makePlayer({ id: 3, rating: 77, rareflag: 1 }),
      makePlayer({ id: 4, rating: 81, rareflag: 0 }),
      makePlayer({ id: 5, rating: 86, rareflag: 0 }),
    ] });
    const plan = selectInventoryPlayers({
      inventorySnapshot: adapter.snapshot(),
      requirements: [
        { tier: 'gold', rarity: 'rare', count: 3, playerOnly: true, allowSpecial: false },
        { tier: 'gold', rarity: 'common', count: 1, playerOnly: true, allowSpecial: false, protectHighGold: true },
      ],
      priorityPiles: ['storage'],
      fsuPolicy,
    });
    expect(plan.ok).toBe(true);
    expect(plan.selected.map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });

  it('honors a custom highGoldThreshold when protectHighGold is enabled', () => {
    const adapter = createFakeInventoryAdapter({ storage: [
      makePlayer({ id: 1, rating: 84, rareflag: 0 }),
      makePlayer({ id: 2, rating: 85, rareflag: 0 }),
    ] });
    const plan = selectInventoryPlayers({
      inventorySnapshot: adapter.snapshot(),
      requirements: [{
        tier: 'gold',
        rarity: 'common',
        count: 1,
        playerOnly: true,
        allowSpecial: false,
        protectHighGold: true,
        highGoldThreshold: 85,
      }],
      priorityPiles: ['storage'],
      fsuPolicy,
    });
    expect(plan.ok).toBe(true);
    expect(plan.selected[0].id).toBe(1);
  });

  it('resolves Unassigned duplicate signals to Storage or Club item refs', () => {
    const adapter = createFakeInventoryAdapter({
      unassigned: [makePlayer({ id: 10, definitionId: 100, duplicate: true, duplicateId: 20, rating: 80 })],
      club: [makePlayer({ id: 20, definitionId: 100, rating: 80 })],
    });
    const plan = selectInventoryPlayers({
      inventorySnapshot: adapter.snapshot(),
      requirements: [{ tier: 'gold', rarity: 'common', count: 1, playerOnly: true, allowSpecial: false }],
      priorityPiles: ['unassigned'],
      fsuPolicy,
    });
    expect(plan.ok).toBe(true);
    expect(plan.selected[0].id).toBe(20);
    expect(plan.duplicateSignals).toEqual([
      expect.objectContaining({ pileName: 'unassigned', signalRef: expect.objectContaining({ id: 10 }), itemRef: expect.objectContaining({ id: 20 }) }),
    ]);
  });

  it('prioritizes a blocked Unassigned duplicate signal without bypassing eligibility', () => {
    const adapter = createFakeInventoryAdapter({
      unassigned: [
        makePlayer({ id: 10, definitionId: 100, duplicate: true, duplicateId: 20, rating: 64 }),
        makePlayer({ id: 11, definitionId: 101, duplicate: true, duplicateId: 21, rating: 60 }),
      ],
      club: [
        makePlayer({ id: 20, definitionId: 100, rating: 64 }),
        makePlayer({ id: 21, definitionId: 101, rating: 60 }),
      ],
    });
    const plan = selectInventoryPlayers({
      inventorySnapshot: adapter.snapshot(),
      requirements: [{ tier: 'bronze', count: 1, playerOnly: true, allowSpecial: false }],
      priorityPiles: ['unassigned'],
      preferredSignalRefs: [{ id: 10, definitionId: 100, pile: 'unassigned' }],
      fsuPolicy,
    });
    expect(plan.ok).toBe(true);
    expect(plan.duplicateSignals[0].signalRef.id).toBe(10);
    expect(plan.selected[0].id).toBe(20);
  });

  it('does not select a protected preferred signal', () => {
    const adapter = createFakeInventoryAdapter({
      unassigned: [
        makePlayer({ id: 10, definitionId: 100, duplicate: true, duplicateId: 20, rating: 86 }),
        makePlayer({ id: 11, definitionId: 101, duplicate: true, duplicateId: 21, rating: 80 }),
      ],
      club: [
        makePlayer({ id: 20, definitionId: 100, rating: 86 }),
        makePlayer({ id: 21, definitionId: 101, rating: 80 }),
      ],
    });
    const plan = selectInventoryPlayers({
      inventorySnapshot: adapter.snapshot(),
      requirements: [{ tier: 'gold', rarity: 'common', count: 1, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true }],
      priorityPiles: ['unassigned'],
      preferredSignalRefs: [{ id: 10, definitionId: 100, pile: 'unassigned' }],
      fsuPolicy,
    });
    expect(plan.ok).toBe(true);
    expect(plan.duplicateSignals[0].signalRef.id).toBe(11);
    expect(plan.selected[0].id).toBe(21);
  });

  it('obeys consumed, protected, FSU lock and only-untradeable policies', () => {
    const adapter = createFakeInventoryAdapter({ storage: [
      makePlayer({ id: 31, definitionId: 131, rating: 75 }),
      makePlayer({ id: 32, definitionId: 132, rating: 76 }),
      makePlayer({ id: 33, definitionId: 133, rating: 77, untradeable: false }),
      makePlayer({ id: 34, definitionId: 134, rating: 78 }),
    ] });
    const plan = selectInventoryPlayers({
      inventorySnapshot: adapter.snapshot(),
      requirements: [{ tier: 'gold', count: 1, playerOnly: true, allowSpecial: false }],
      priorityPiles: ['storage'],
      fsuPolicy: { ...fsuPolicy, onlyUntradeable: true, lockedItemIds: [32] },
      consumedItemIds: [31],
      protectedDefinitionIds: [133],
    });
    expect(plan.ok).toBe(true);
    expect(plan.selected[0].id).toBe(34);
  });

  it('uses eligible common gold across every pile before any rare gold', () => {
    const adapter = createFakeInventoryAdapter({
      unassigned: [
        makePlayer({ id: 10, definitionId: 110, duplicate: true, duplicateId: 20, rating: 75, rareflag: 1 }),
      ],
      storage: [makePlayer({ id: 30, definitionId: 130, rating: 78, rareflag: 0 })],
      transfer: [
        makePlayer({ id: 40, definitionId: 140, duplicate: true, duplicateId: 50, rating: 76, rareflag: 0 }),
      ],
      club: [
        makePlayer({ id: 20, definitionId: 110, rating: 75, rareflag: 1 }),
        makePlayer({ id: 50, definitionId: 140, rating: 76, rareflag: 0 }),
        makePlayer({ id: 60, definitionId: 160, rating: 77, rareflag: 0 }),
      ],
    });
    const plan = selectInventoryPlayers({
      inventorySnapshot: adapter.snapshot(),
      requirements: [{
        tier: 'gold',
        count: 3,
        preferCommon: true,
        playerOnly: true,
        allowSpecial: false,
      }],
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      fsuPolicy: { ...fsuPolicy, priorityRareWithinGoldRange: true },
    });

    expect(plan.ok).toBe(true);
    expect(plan.selected.map((item) => item.id)).toEqual([30, 50, 60]);
    expect(plan.selected.every((item) => item.rare === false)).toBe(true);
  });

  it('preserves pile order within the common phase before restarting at unassigned for rare fallback', () => {
    const adapter = createFakeInventoryAdapter({
      unassigned: [
        makePlayer({ id: 10, definitionId: 110, duplicate: true, duplicateId: 20, rating: 75, rareflag: 0 }),
        makePlayer({ id: 11, definitionId: 111, duplicate: true, duplicateId: 21, rating: 75, rareflag: 1 }),
      ],
      storage: [
        makePlayer({ id: 20, definitionId: 110, rating: 75, rareflag: 0 }),
        makePlayer({ id: 30, definitionId: 130, rating: 76, rareflag: 0 }),
      ],
      transfer: [
        makePlayer({ id: 40, definitionId: 140, duplicate: true, duplicateId: 50, rating: 77, rareflag: 0 }),
      ],
      club: [
        makePlayer({ id: 21, definitionId: 111, rating: 75, rareflag: 1 }),
        makePlayer({ id: 50, definitionId: 140, rating: 77, rareflag: 0 }),
        makePlayer({ id: 60, definitionId: 160, rating: 78, rareflag: 0 }),
      ],
    });
    const plan = selectInventoryPlayers({
      inventorySnapshot: adapter.snapshot(),
      requirements: [{
        tier: 'gold',
        count: 5,
        preferCommon: true,
        playerOnly: true,
        allowSpecial: false,
      }],
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      fsuPolicy: { ...fsuPolicy, priorityRareWithinGoldRange: true },
    });

    expect(plan.ok).toBe(true);
    expect(plan.selected.map((item) => item.id)).toEqual([20, 30, 50, 60, 21]);
    expect(plan.entries.map((entry) => entry.pileName)).toEqual([
      'unassigned',
      'storage',
      'transfer',
      'club',
      'unassigned',
    ]);
    expect(plan.selected.map((item) => item.rare)).toEqual([false, false, false, false, true]);
  });

  it('uses rare gold only after all eligible common gold is exhausted', () => {
    const adapter = createFakeInventoryAdapter({
      unassigned: [
        makePlayer({ id: 10, definitionId: 110, duplicate: true, duplicateId: 20, rating: 75, rareflag: 1 }),
      ],
      storage: [makePlayer({ id: 30, definitionId: 130, rating: 78, rareflag: 0 })],
      club: [makePlayer({ id: 20, definitionId: 110, rating: 75, rareflag: 1 })],
    });
    const plan = selectInventoryPlayers({
      inventorySnapshot: adapter.snapshot(),
      requirements: [{
        tier: 'gold',
        count: 2,
        preferCommon: true,
        playerOnly: true,
        allowSpecial: false,
      }],
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      fsuPolicy: { ...fsuPolicy, priorityRareWithinGoldRange: true },
    });

    expect(plan.ok).toBe(true);
    expect(plan.selected.map((item) => item.id)).toEqual([30, 20]);
    expect(plan.duplicateSignals).toEqual([
      expect.objectContaining({ signalRef: expect.objectContaining({ id: 10 }), itemRef: expect.objectContaining({ id: 20 }) }),
    ]);
  });
});
