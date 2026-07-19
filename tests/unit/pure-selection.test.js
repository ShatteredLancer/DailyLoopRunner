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
});
