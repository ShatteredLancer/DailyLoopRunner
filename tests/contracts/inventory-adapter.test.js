import { describe, expect, it } from 'vitest';
import { createEaInventoryAdapter } from '../../src/adapters/ea/inventory.js';
import { createFakeInventoryAdapter } from '../../src/adapters/fake/inventory.js';
import { INVENTORY_PILES } from '../../src/domain/contracts.js';
import { selectInventoryPlayers } from '../../src/selection/inventory.js';
import { planUnassignedActions } from '../../src/unassigned/plan.js';
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
    unassigned: [makePlayer({
      id: 1,
      definitionId: 104,
      rating: 84,
      rareflag: 2,
      duplicate: true,
      duplicateId: 4,
    })],
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
      duplicateId: 4,
      pile: 'unassigned',
    });
    expect(eaSnapshot.piles.club[0]).toMatchObject({ special: true, groups: [44] });
  });

  it('deduplicates the same Club entities exposed by both EA repositories', () => {
    const club = Array.from({ length: 4000 }, (_, index) => makePlayer({
      id: 10000 + index,
      definitionId: 20000 + index,
      rating: 75 + (index % 20),
    }));
    const runtime = createRuntime({ club });
    runtime.services.Item.itemDao.itemRepo.club.items._collection = [...club];

    const ea = createEaInventoryAdapter(runtime);

    expect(ea.readPile('club')).toHaveLength(4000);
    expect(ea.snapshot().piles.club).toHaveLength(4000);
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

  it('reads rarity metadata from nested EA item data', () => {
    const nestedRare = {
      id: 10,
      definitionId: 110,
      type: 'player',
      rating: 78,
      _staticData: { rareflag: 1 },
    };
    const nestedSpecial = {
      id: 11,
      definitionId: 111,
      type: 'player',
      rating: 90,
      _data: { rareFlag: 2 },
    };
    const ea = createEaInventoryAdapter(createRuntime({ club: [nestedRare, nestedSpecial] }));

    expect(ea.snapshot().piles.club).toEqual([
      expect.objectContaining({ id: 10, rareflag: 1, rare: true, special: false }),
      expect.objectContaining({ id: 11, rareflag: 2, rare: true, special: true }),
    ]);
  });

  it('uses the verified EA tradeability method before compatibility aliases', () => {
    const item = makePlayer({ id: 14, definitionId: 114, untradeable: true });
    item.isTradeable = () => true;
    item.isUntradeable = () => true;
    const ea = createEaInventoryAdapter(createRuntime({ club: [item] }));

    expect(ea.snapshot().piles.club[0]).toMatchObject({ id: 14, tradeable: true });
  });

  it('preserves or derives the EA base-player database identity', () => {
    const direct = {
      id: 12,
      definitionId: 134449171,
      databaseId: 999999,
      type: 'player',
      rating: 95,
    };
    const derived = {
      id: 13,
      definitionId: 67340307,
      type: 'player',
      rating: 91,
    };
    const ea = createEaInventoryAdapter(createRuntime({ club: [direct, derived] }));

    expect(ea.snapshot().piles.club).toEqual([
      expect.objectContaining({ id: 12, databaseId: 999999 }),
      expect.objectContaining({ id: 13, databaseId: 231443 }),
    ]);
  });

  it('restores latent Unassigned duplicate metadata from a matching Club definition', () => {
    const unassigned = makePlayer({
      id: 30,
      definitionId: 130,
      rating: 78,
      rareflag: 1,
      duplicate: false,
      duplicateId: 0,
    });
    const club = makePlayer({ id: 40, definitionId: 130, rating: 78, rareflag: 1 });
    const ea = createEaInventoryAdapter(createRuntime({ unassigned: [unassigned], club: [club] }));

    expect(ea.snapshot().piles.unassigned[0]).toMatchObject({
      id: 30,
      duplicate: true,
      duplicateId: 40,
    });
  });

  it('reclassifies a stale duplicate signal after its exact Club card was submitted', () => {
    const guirassy = makePlayer({
      id: 921331223291,
      definitionId: 215441,
      rating: 87,
      rareflag: 1,
      duplicate: true,
      duplicateId: 921242882169,
      name: 'Guirassy',
    });
    const ea = createEaInventoryAdapter(createRuntime({ unassigned: [guirassy], club: [] }));
    const snapshot = ea.snapshot();

    expect(snapshot.piles.unassigned[0]).toMatchObject({
      id: 921331223291,
      duplicate: false,
      duplicateId: 0,
    });
    expect(planUnassignedActions(snapshot)).toMatchObject({
      status: 'action',
      action: {
        destination: 'club',
        description: 'non-duplicate',
        requiresExactClubDuplicate: false,
      },
    });
  });

  it.each(['storage', 'transfer'])('does not use a same-version %s card as Club duplicate evidence', (pile) => {
    const unassigned = makePlayer({
      id: 301,
      definitionId: 401,
      rating: 86,
      rareflag: 1,
      duplicate: true,
      duplicateId: 302,
    });
    const counterpart = makePlayer({
      id: 302,
      definitionId: 401,
      rating: 86,
      rareflag: 1,
    });
    const snapshot = createEaInventoryAdapter(createRuntime({
      unassigned: [unassigned],
      [pile]: [counterpart],
      club: [],
    })).snapshot();

    expect(snapshot.piles.unassigned[0]).toMatchObject({
      duplicate: false,
      duplicateId: 0,
      duplicateSignal: true,
      duplicateSignalId: 302,
    });
    expect(planUnassignedActions(snapshot)).toMatchObject({
      status: 'action',
      action: { destination: 'club', description: 'non-duplicate' },
    });
  });

  it('reclassifies a stale Unassigned duplicate after its Club card is submitted while Storage remains', () => {
    const unassigned = makePlayer({
      id: 921424298691,
      definitionId: 200389,
      rating: 88,
      rareflag: 1,
      duplicate: true,
      duplicateId: 921209854799,
      name: 'Oblak',
    });
    const storage = makePlayer({
      id: 921395412498,
      definitionId: 200389,
      rating: 88,
      rareflag: 1,
      duplicate: true,
      duplicateId: 921209854799,
      name: 'Oblak',
    });
    const club = [makePlayer({
      id: 921209854799,
      definitionId: 200389,
      rating: 88,
      rareflag: 1,
      duplicate: false,
      duplicateId: 0,
      name: 'Oblak',
    })];
    const ea = createEaInventoryAdapter(createRuntime({
      unassigned: [unassigned],
      storage: [storage],
      club,
    }));

    expect(ea.snapshot().piles.unassigned[0]).toMatchObject({
      duplicate: true,
      duplicateId: 921209854799,
    });
    club.splice(0);
    const snapshot = ea.snapshot();

    expect(snapshot.piles.unassigned[0]).toMatchObject({
      id: 921424298691,
      duplicate: false,
      duplicateId: 0,
      duplicateSignal: true,
      duplicateSignalId: 921209854799,
    });
    expect(planUnassignedActions(snapshot)).toMatchObject({
      status: 'action',
      action: {
        destination: 'club',
        description: 'non-duplicate',
        requiresExactClubDuplicate: false,
      },
    });
    expect(selectInventoryPlayers({
      inventorySnapshot: snapshot,
      requirements: [{
        count: 1,
        playerOnly: true,
        tier: 'gold',
        rarity: 'rare',
        allowSpecial: false,
        respectFsuGoldRange: false,
      }],
      priorityPiles: ['unassigned'],
    })).toMatchObject({
      ok: true,
      selected: [{ id: 921395412498, pile: 'storage' }],
      duplicateSignals: [{
        pileName: 'unassigned',
        signalRef: { id: 921424298691 },
        itemRef: { id: 921395412498, pile: 'storage' },
      }],
    });
  });

  it('keeps a different rating or rarity version non-duplicate and routes it to Club', () => {
    const unassigned = makePlayer({
      id: 30,
      definitionId: 50606891,
      rating: 94,
      rareflag: 15,
      duplicate: false,
      duplicateId: 0,
    });
    const club = makePlayer({
      id: 40,
      definitionId: 50606891,
      rating: 98,
      rareflag: 16,
    });
    const ea = createEaInventoryAdapter(createRuntime({ unassigned: [unassigned], club: [club] }));
    const snapshot = ea.snapshot();

    expect(snapshot.piles.unassigned[0]).toMatchObject({
      id: 30,
      duplicate: false,
      duplicateId: 0,
    });
    expect(planUnassignedActions(snapshot)).toMatchObject({
      status: 'action',
      action: { destination: 'club', description: 'non-duplicate' },
    });
  });

  it('does not restore duplicate metadata when only an evolved Club version exists', () => {
    const unassigned = makePlayer({
      id: 920703861773,
      definitionId: 67331195,
      rating: 97,
      rareflag: 16,
      duplicate: true,
      duplicateId: 919091646534,
    });
    const evolvedClub = makePlayer({
      id: 919091646534,
      definitionId: 67331195,
      rating: 97,
      rareflag: 16,
      upgrades: { evolutionId: 42 },
    });
    const ea = createEaInventoryAdapter(createRuntime({
      unassigned: [unassigned],
      club: [evolvedClub],
    }));
    const snapshot = ea.snapshot();

    expect(snapshot.piles.club[0]).toMatchObject({ evolution: true });
    expect(snapshot.piles.unassigned[0]).toMatchObject({
      id: 920703861773,
      evolution: false,
      duplicate: false,
      duplicateId: 0,
    });
    expect(planUnassignedActions(snapshot)).toMatchObject({
      status: 'action',
      action: { destination: 'club', description: 'non-duplicate' },
    });
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
    runtime.services.Item.move = (...args) => {
      const [items, pile, allowStorage] = args;
      calls.push(['move', Array.isArray(items) ? items.map((item) => item.id) : items.id, pile, allowStorage, args.length]);
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
    ea.moveSingleItem(piles.storage[0], 'club');
    expect(calls).toEqual([
      ['unassigned'],
      ['storage'],
      ['generic', 'storage'],
      ['move', [2], 'club', true, 3],
      ['move', 2, 'club', undefined, 2],
    ]);

    const fake = createFakeInventoryAdapter({ piles, capacities });
    fake.requestUnassigned();
    fake.refreshActions('storage')[0].invoke();
    fake.move([piles.storage[0]], 'club', true);
    fake.moveSingleItem(piles.storage[0], 'club');
    expect(fake.calls.map((call) => call.method)).toEqual([
      'requestUnassigned', 'refreshPile', 'move', 'moveSingleItem',
    ]);
  });

  it('invalidates every distinct EA Unassigned cache before a forced refresh', async () => {
    const calls = [];
    const runtime = createRuntime(piles, capacities);
    runtime.ItemPile.PURCHASED = 'ea-purchased';
    runtime.repositories.Item.setDirty = (pile) => calls.push(['setDirty', pile]);
    runtime.repositories.Item.unassigned = { reset: () => calls.push(['repository-reset']) };
    runtime.services.Item.itemDao.itemRepo.unassigned = { reset: () => calls.push(['dao-reset']) };

    const result = await createEaInventoryAdapter(runtime).invalidateUnassigned();

    expect(result).toMatchObject({ invalidated: true, pile: 'ea-purchased' });
    expect(result.actions).toEqual([
      expect.objectContaining({ id: 'repository-unassigned-reset', available: true, succeeded: true }),
      expect.objectContaining({ id: 'dao-unassigned-reset', available: true, succeeded: true }),
      expect.objectContaining({ id: 'repository-set-dirty', available: true, succeeded: true }),
    ]);
    expect(calls).toEqual([
      ['repository-reset'],
      ['dao-reset'],
      ['setDirty', 'ea-purchased'],
    ]);
  });

  it('waits for asynchronous Unassigned resets before marking PURCHASED dirty', async () => {
    const calls = [];
    const runtime = createRuntime(piles, capacities);
    runtime.repositories.Item.unassigned = {
      reset: async () => {
        calls.push('repository-reset-start');
        await Promise.resolve();
        calls.push('repository-reset-end');
      },
    };
    runtime.services.Item.itemDao.itemRepo.unassigned = {
      reset: async () => {
        calls.push('dao-reset-start');
        await Promise.resolve();
        calls.push('dao-reset-end');
      },
    };
    runtime.repositories.Item.setDirty = () => calls.push('set-dirty');

    await createEaInventoryAdapter(runtime).invalidateUnassigned();

    expect(calls).toEqual([
      'repository-reset-start',
      'repository-reset-end',
      'dao-reset-start',
      'dao-reset-end',
      'set-dirty',
    ]);
  });

  it('merges and reports every EA Unassigned repository source without duplicating entities', () => {
    const first = makePlayer({ id: 101, definitionId: 501, rating: 85 });
    const second = makePlayer({ id: 102, definitionId: 502, rating: 86 });
    const third = makePlayer({ id: 103, definitionId: 503, rating: 87 });
    const runtime = createRuntime({ unassigned: [first] });
    runtime.repositories.Item.unassigned = { _collection: [first, second] };
    runtime.services.Item.itemDao.itemRepo.unassigned = { _collection: [second, third] };

    const adapter = createEaInventoryAdapter(runtime);

    expect(adapter.readPile('unassigned').map((item) => item.id)).toEqual([101, 102, 103]);
    expect(adapter.unassignedState()).toEqual({
      mergedCount: 3,
      mergedItemIds: [101, 102, 103],
      sources: {
        repositoryGetter: { count: 1, itemIds: [101] },
        repositoryCollection: { count: 2, itemIds: [101, 102] },
        daoCollection: { count: 2, itemIds: [102, 103] },
      },
    });
  });

  it('reports unavailable or failing invalidators without hiding a working fallback', async () => {
    const runtime = createRuntime(piles, capacities);
    runtime.repositories.Item.setDirty = () => { throw new Error('dirty failed'); };
    runtime.repositories.Item.unassigned = { reset: () => {} };

    const result = await createEaInventoryAdapter(runtime).invalidateUnassigned();

    expect(result.invalidated).toBe(true);
    expect(result.actions).toEqual([
      expect.objectContaining({ id: 'repository-unassigned-reset', succeeded: true }),
      expect.objectContaining({ id: 'dao-unassigned-reset', available: false, succeeded: false }),
      expect.objectContaining({ id: 'repository-set-dirty', succeeded: false, error: 'dirty failed' }),
    ]);
  });

  it('does not report a deduplicated DAO reset as successful when the shared reset failed', async () => {
    const runtime = createRuntime(piles, capacities);
    const sharedUnassigned = { reset: () => { throw new Error('shared reset failed'); } };
    runtime.repositories.Item.unassigned = sharedUnassigned;
    runtime.services.Item.itemDao.itemRepo.unassigned = sharedUnassigned;
    runtime.repositories.Item.setDirty = undefined;

    const result = await createEaInventoryAdapter(runtime).invalidateUnassigned();

    expect(result.invalidated).toBe(false);
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: 'repository-unassigned-reset',
        available: true,
        succeeded: false,
        error: 'shared reset failed',
      }),
      expect.objectContaining({
        id: 'dao-unassigned-reset',
        available: true,
        succeeded: false,
        deduplicated: true,
        error: 'shared reset failed',
      }),
      expect.objectContaining({
        id: 'repository-set-dirty',
        available: false,
        succeeded: false,
      }),
    ]);
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
