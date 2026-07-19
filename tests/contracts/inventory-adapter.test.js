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
    expect(ea.capacity('storage')).toEqual({ used: 1, max: 100, free: 99 });
    const fake = createFakeInventoryAdapter({ piles, capacities });
    expect(fake.capacity('storage')).toEqual({ used: 1, max: 100, free: 99 });
  });

  it('preserves legacy storage and transfer collection fallbacks', () => {
    const storageItem = makePlayer({ id: 20, definitionId: 120, rating: 76 });
    const transferItem = makePlayer({ id: 21, definitionId: 121, rating: 77 });
    const repository = {
      club: { items: { _collection: [] } },
      storage: { _collection: [storageItem] },
      transfer: { _collection: [transferItem] },
      getUnassignedItems: () => [],
    };
    const ea = createEaInventoryAdapter({ repositories: { Item: repository }, services: {} });
    expect(ea.readPile('storage')).toEqual([storageItem]);
    expect(ea.readPile('transfer')).toEqual([transferItem]);

    repository.getStorage = () => ({ _collection: [storageItem] });
    repository.storage = { _collection: [] };
    expect(ea.readPile('storage')).toEqual([storageItem]);
  });

  it('exposes refresh and move effects with the legacy method priority and arguments', () => {
    const calls = [];
    const runtime = createRuntime(piles, capacities);
    runtime.services.Item.requestUnassignedItems = () => { calls.push(['unassigned']); return { success: true }; };
    runtime.services.Item.requestStorageItems = () => { calls.push(['storage']); return { success: true }; };
    runtime.services.Item.requestSBCStorageItems = () => { calls.push(['sbc-storage']); return { success: true }; };
    runtime.services.Item.requestItems = (pile) => { calls.push(['generic', pile]); return { success: true }; };
    runtime.services.Item.move = (items, pile, allowStorage) => {
      calls.push(['move', items.map((item) => item.id), pile, allowStorage]);
      return { success: true };
    };
    const ea = createEaInventoryAdapter(runtime);
    expect(ea.requestUnassigned()).toMatchObject({ success: true });
    const actions = ea.refreshActions('storage');
    expect(actions.map((action) => action.methodName)).toEqual([
      'requestStorageItems', 'requestSBCStorageItems', 'requestItems',
    ]);
    actions[0].invoke();
    actions[2].invoke();
    ea.move([piles.storage[0]], 'club', true);
    expect(calls).toEqual([
      ['unassigned'],
      ['storage'],
      ['generic', 'storage'],
      ['move', [2], 'club', true],
    ]);

    const fake = createFakeInventoryAdapter({ piles, capacities });
    fake.requestUnassigned();
    fake.refreshActions('storage')[0].invoke();
    fake.move([piles.storage[0]], 'club', true);
    expect(fake.calls.map((call) => call.method)).toEqual(['requestUnassigned', 'refreshPile', 'move']);
  });

  it('resolves EA pile enums and prepares opened purchased items', () => {
    const runtime = createRuntime(piles, capacities);
    runtime.ItemPile.PURCHASED = 'ea-purchased';
    runtime.PlayerInjury = { NONE: 9 };
    const ea = createEaInventoryAdapter(runtime);
    expect(ea.pileValue('club')).toBe('club');
    expect(ea.pileValue('purchased')).toBe('ea-purchased');
    const item = { id: 100 };
    expect(ea.preparePurchasedItem(item)).toBe(item);
    expect(item).toMatchObject({ pile: 'ea-purchased', injuryType: 9 });
  });
});
