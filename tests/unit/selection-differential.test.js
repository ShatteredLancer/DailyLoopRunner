import { describe, expect, it } from 'vitest';
import { createEaInventoryAdapter } from '../../src/adapters/ea/inventory.js';
import { selectInventoryPlayers as selectPure } from '../../src/selection/inventory.js';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

function defaultFsu(overrides = {}) {
  return {
    ignorePlayerPosition: true,
    onlyUntradeable: false,
    excludeDesignatedLeagues: false,
    excludedLeagueIds: [],
    useRarityPlayer: true,
    excludeEvolution: false,
    playerPickStrictCommonRare: true,
    priorityRareWithinGoldRange: false,
    priorityNonSpecialPlayers: true,
    priorityStoragePlayers: false,
    silverBronzePrioritizeNormal: true,
    goldRange: [75, 99],
    lockedItemIds: [],
    lockedDefinitionIds: [],
    ...overrides,
  };
}

async function expectSelection({
  piles,
  requirements,
  priorityPiles,
  expectedIds,
  expectedPileCounts,
  expectedSignals = [],
  fsu = defaultFsu(),
  consumedItemIds = [],
  selectionOptions = {},
}) {
  const { api, window } = await loadUserscript(piles);
  api.setFsuSettingsOverride(fsu);
  consumedItemIds.forEach((id) => api.state.consumedItemIds.add(id));
  const snapshot = createEaInventoryAdapter(window).snapshot();
  const pure = selectPure({
    inventorySnapshot: snapshot,
    requirements,
    priorityPiles,
    fsuPolicy: fsu,
    consumedItemIds,
    preferredSignalRefs: selectionOptions.preferredSignalRefs || [],
  });
  expect(pure.ok).toBe(true);
  expect(pure.selected.map((item) => item.id)).toEqual(expectedIds);
  expect(pure.missing).toBeNull();
  expect(pure.pileCounts).toEqual(expectedPileCounts);
  expect(pure.duplicateSignals.map((signal) => ({
    pileName: signal.pileName,
    signalId: signal.signalRef.id,
    itemId: signal.itemRef.id,
  }))).toEqual(expectedSignals);

  const bridged = api.selectInventoryPlayers(requirements, priorityPiles, selectionOptions);
  expect(bridged.ok).toBe(true);
  expect(bridged.selected.map((item) => item.id)).toEqual(expectedIds);
  expect(bridged.stats).toEqual(expectedPileCounts);
}

describe('inventory selector regression fixtures', () => {
  it('preserves strict common/rare selection and high-gold protection', async () => {
    await expectSelection({
      piles: { storage: [
        makePlayer({ id: 1, rating: 75, rareflag: 1 }),
        makePlayer({ id: 2, rating: 76, rareflag: 1 }),
        makePlayer({ id: 3, rating: 77, rareflag: 1 }),
        makePlayer({ id: 4, rating: 81, rareflag: 0 }),
        makePlayer({ id: 5, rating: 86, rareflag: 0 }),
      ] },
      requirements: [
        { tier: 'gold', rarity: 'rare', count: 3, playerOnly: true, allowSpecial: false },
        { tier: 'gold', rarity: 'common', count: 1, playerOnly: true, allowSpecial: false, protectHighGold: true },
      ],
      priorityPiles: ['storage'],
      expectedIds: [1, 2, 3, 4],
      expectedPileCounts: { storage: 4 },
    });
  });

  it('preserves Unassigned and Transfer duplicate signal resolution', async () => {
    await expectSelection({
      piles: {
        unassigned: [makePlayer({ id: 10, definitionId: 110, duplicate: true, duplicateId: 20, rating: 80 })],
        transfer: [makePlayer({ id: 11, definitionId: 111, duplicate: true, duplicateId: 21, rating: 79, untradeable: false })],
        storage: [makePlayer({ id: 20, definitionId: 110, rating: 80 })],
        club: [makePlayer({ id: 21, definitionId: 111, rating: 79 })],
      },
      requirements: [{ tier: 'gold', rarity: 'common', count: 2, playerOnly: true, allowSpecial: false }],
      priorityPiles: ['unassigned', 'transfer'],
      expectedIds: [20, 21],
      expectedPileCounts: { unassigned: 1, transfer: 1 },
      expectedSignals: [
        { pileName: 'unassigned', signalId: 10, itemId: 20 },
        { pileName: 'transfer', signalId: 11, itemId: 21 },
      ],
    });
  });

  it('preserves FSU priority, lock, league, evolution and consumed filters', async () => {
    await expectSelection({
      piles: {
        storage: [
          makePlayer({ id: 31, definitionId: 131, rating: 75 }),
          makePlayer({ id: 32, definitionId: 132, rating: 76, leagueId: 31 }),
          makePlayer({ id: 33, definitionId: 133, rating: 77, evolutionId: 1 }),
          makePlayer({ id: 34, definitionId: 134, rating: 78 }),
        ],
        club: [makePlayer({ id: 35, definitionId: 135, rating: 79 })],
      },
      requirements: [{ tier: 'gold', count: 1, playerOnly: true, allowSpecial: false }],
      priorityPiles: ['club', 'storage'],
      fsu: defaultFsu({
        priorityStoragePlayers: true,
        excludeDesignatedLeagues: true,
        excludedLeagueIds: [31],
        excludeEvolution: true,
        lockedItemIds: [31],
      }),
      consumedItemIds: [34],
      expectedIds: [35],
      expectedPileCounts: { club: 1 },
    });
  });

  it('preserves low-tier normal-before-rare ordering', async () => {
    await expectSelection({
      piles: { storage: [
        makePlayer({ id: 41, rating: 64, rareflag: 1 }),
        makePlayer({ id: 42, rating: 63, rareflag: 0 }),
      ] },
      requirements: [{ tier: 'bronze', count: 1, playerOnly: true, allowSpecial: false }],
      priorityPiles: ['storage'],
      fsu: defaultFsu({ silverBronzePrioritizeNormal: true }),
      expectedIds: [42],
      expectedPileCounts: { storage: 1 },
    });
  });

  it('preserves nested FSU resource and asset lock identities', async () => {
    const locked = makePlayer({ id: 51, definitionId: 151, rating: 75 });
    locked._data = { resourceId: 700051 };
    const allowed = makePlayer({ id: 52, definitionId: 152, rating: 76 });
    await expectSelection({
      piles: { storage: [locked, allowed] },
      requirements: [{ tier: 'gold', count: 1, playerOnly: true, allowSpecial: false }],
      priorityPiles: ['storage'],
      fsu: defaultFsu({ lockedItemIds: [700051] }),
      expectedIds: [52],
      expectedPileCounts: { storage: 1 },
    });
  });

  it('preserves blocked duplicate signal priority through the runtime bridge', async () => {
    await expectSelection({
      piles: {
        unassigned: [
          makePlayer({ id: 61, definitionId: 161, duplicate: true, duplicateId: 71, rating: 64 }),
          makePlayer({ id: 62, definitionId: 162, duplicate: true, duplicateId: 72, rating: 60 }),
        ],
        club: [
          makePlayer({ id: 71, definitionId: 161, rating: 64 }),
          makePlayer({ id: 72, definitionId: 162, rating: 60 }),
        ],
      },
      requirements: [{ tier: 'bronze', count: 1, playerOnly: true, allowSpecial: false }],
      priorityPiles: ['unassigned'],
      selectionOptions: { preferredSignalRefs: [{ id: 61, definitionId: 161, pile: 'unassigned' }] },
      expectedIds: [71],
      expectedPileCounts: { unassigned: 1 },
      expectedSignals: [{ pileName: 'unassigned', signalId: 61, itemId: 71 }],
    });
  });
});
