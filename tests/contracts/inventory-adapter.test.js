import { describe, expect, it } from 'vitest';
import { createEaInventoryAdapter } from '../../src/adapters/ea/inventory.js';
import { createFakeInventoryAdapter } from '../../src/adapters/fake/inventory.js';
import { INVENTORY_PILES } from '../../src/domain/contracts.js';
import { makePlayer } from '../helpers/load-userscript.js';

function createRuntime(piles, capacities = {}) {
  const repository = {
    club: { items: { _collection: piles.club || [] } },
    storage: { _collection: piles.storage || [] },
    transfer: { _collection: piles.transfer || [] },
    getUnassignedItems: () => piles.unassigned || [],
    getStorageItems: () => piles.storage || [],
    getTransferItems: () => piles.transfer || [],
    getPileSize: (pile) => capacities[pile]?.max,
    numItemsInCache: (pile) => capacities[pile]?.used,
  };
  return {
    repositories: { Item: repository },
    services: { Item: { itemDao: { itemRepo: { club: { items: { _collection: [] } } } } } },
    ItemPile: { CLUB: 'club', STORAGE: 'storage', TRANSFER: 'transfer', PURCHASED: 'unassigned' },
  };
}

describe('Inventory Adapter contract', () => {
  const piles = {
    unassigned: [makePlayer({ id: 1, definitionId: 101, rating: 80, duplicate: true, duplicateId: 2 })],
    storage: [makePlayer({ id: 2, definitionId: 101, rating: 80 })],
    transfer: [makePlayer({ id: 3, definitionId: 103, rating: 75, untradeable: false })],
    club: [makePlayer({ id: 4, definitionId: 104, rating: 84, rareflag: 2, groups: [44] })],
  };
  const capacities = {
    storage: { used: 1, max: 100 },
    transfer: { used: 1, max: 100 },
    club: { used: 1, max: null },
    unassigned: { used: 1, max: null },
  };

  it('EA and Fake adapters produce serializable snapshots with the same item identities', () => {
    const ea = createEaInventoryAdapter(createRuntime(piles, capacities));
    const fake = createFakeInventoryAdapter({ piles, capacities });
    const eaSnapshot = ea.snapshot();
    const fakeSnapshot = fake.snapshot();

    expect(() => JSON.stringify(eaSnapshot)).not.toThrow();
    expect(() => JSON.stringify(fakeSnapshot)).not.toThrow();
    for (const pile of INVENTORY_PILES) {
      expect(eaSnapshot.piles[pile].map((item) => item.id))
        .toEqual(fakeSnapshot.piles[pile].map((item) => item.id));
    }
    expect(eaSnapshot.piles.unassigned[0]).toMatchObject({
      duplicate: true,
      duplicateId: 2,
      pile: 'unassigned',
    });
    expect(eaSnapshot.piles.club[0]).toMatchObject({ special: true, groups: [44] });
  });

  it('resolves a stable ItemRef back to a live item', () => {
    const ea = createEaInventoryAdapter(createRuntime(piles, capacities));
    const snapshot = ea.snapshot();
    const resolved = ea.resolveItem(snapshot.piles.storage[0].ref);
    expect(resolved.pile).toBe('storage');
    expect(resolved.item.id).toBe(2);
  });

  it('computes stable capacity values', () => {
    const ea = createEaInventoryAdapter(createRuntime(piles, capacities));
    expect(ea.snapshot().capacities.storage).toEqual({ used: 1, max: 100, free: 99 });
  });
});
