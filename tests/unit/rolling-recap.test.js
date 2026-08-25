import { describe, expect, it } from 'vitest';
import {
  createRollingRecapAggregator,
  createRollingRecapModel,
} from '../../src/reward/rolling-recap.js';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

function card(overrides = {}) {
  return {
    id: 1,
    definitionId: 101,
    type: 'player',
    name: 'Player',
    rating: 85,
    tier: 'gold',
    rare: true,
    ...overrides,
  };
}

describe('Rolling recap aggregation', () => {
  it('does not replace a temporary Player Pick card with an evolved Club version', async () => {
    const evolvedLukaku = makePlayer({
      id: 926027598527,
      definitionId: 84078585,
      name: 'Romelu Lukaku',
      rating: 98,
      rareflag: 109,
      evolutionId: 1,
      upgrades: { chemistry: true },
    });
    const { api } = await loadUserscript({ club: [evolvedLukaku] });
    const candidate = makePlayer({
      id: 2,
      definitionId: 84078585,
      name: 'Romelu Lukaku',
      rating: 95,
      rareflag: 109,
    });

    const hydrateItem = api.createRecapItemHydrator();
    const hydrated = hydrateItem(candidate);

    expect(hydrated).toBe(candidate);
    expect(hydrated).toMatchObject({ id: 2, definitionId: 84078585, rating: 95 });

    const aggregator = createRollingRecapAggregator();
    aggregator.recordItems([candidate], {
      sourceLabel: '1 of 3 95+ FOF or FUTTIES Player Pick',
      hydrateItem,
      destination: 'club',
    });
    const model = createRollingRecapModel({
      snapshot: aggregator.getSnapshot(),
      hydrateItem,
    });
    expect(model.rows[0]).toMatchObject({
      name: 'Romelu Lukaku',
      rating: 95,
      sourceLabel: '1/3 95+ Pick',
      destination: 'club',
    });
  });

  it('hydrates a temporary Player Pick id from an identical final Club version', async () => {
    const finalLukaku = makePlayer({
      id: 929574885638,
      definitionId: 84078585,
      name: 'Romelu Lukaku',
      rating: 95,
      rareflag: 109,
    });
    const { api } = await loadUserscript({ club: [finalLukaku] });
    const candidate = makePlayer({
      id: 2,
      definitionId: 84078585,
      name: '84078585',
      rating: 95,
      rareflag: 109,
    });

    expect(api.createRecapItemHydrator()(candidate)).toBe(finalLukaku);
  });

  it('hydrates a duplicate Player Pick to the newly generated entity, not its existing Club source', async () => {
    const clubXhaka = makePlayer({
      id: 915695560200,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
    });
    const pickedXhaka = makePlayer({
      id: 930745043407,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
      duplicateId: 915695560200,
    });
    const { api } = await loadUserscript({ club: [clubXhaka], storage: [pickedXhaka] });
    const temporaryPick = makePlayer({
      id: 2,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
      duplicateId: 915695560200,
    });
    const hydrateItem = api.createRecapItemHydrator();

    expect(hydrateItem(temporaryPick)).toBe(pickedXhaka);
    expect(hydrateItem.resolveDestination(temporaryPick)).toBe('storage');
  });

  it('prefers the current Unassigned Pick entity over an older identical Storage duplicate', async () => {
    const clubXhaka = makePlayer({
      id: 915695560200,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
    });
    const storedXhaka = makePlayer({
      id: 929000000001,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
      duplicateId: 915695560200,
    });
    const currentXhaka = makePlayer({
      id: 930745043407,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
      duplicateId: 915695560200,
    });
    const { api } = await loadUserscript({
      club: [clubXhaka],
      storage: [storedXhaka],
      unassigned: [currentXhaka],
    });
    const temporaryPick = makePlayer({
      id: 2,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
      duplicateId: 915695560200,
    });

    expect(api.createRecapItemHydrator()(temporaryPick)).toBe(currentXhaka);
  });

  it('keeps a recorded Player Pick destination when the selected entity later leaves inventory', async () => {
    const clubXhaka = makePlayer({
      id: 915695560200,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
    });
    const pickedXhaka = makePlayer({
      id: 930745043407,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
      duplicateId: 915695560200,
    });
    // Match the live sequence: EA materializes the confirmed Pick in
    // Unassigned, while cleanup predicts and later performs the Storage move.
    const { api } = await loadUserscript({ club: [clubXhaka], unassigned: [pickedXhaka] });
    const recordHydrator = api.createRecapItemHydrator();
    const aggregator = createRollingRecapAggregator();
    const temporaryPick = makePlayer({
      id: 2,
      definitionId: 100862799,
      name: 'Xhaka',
      rating: 97,
      rareflag: 138,
      duplicateId: 915695560200,
    });
    aggregator.recordItems([temporaryPick], {
      sourceLabel: '1 of 3 95+ FOF or FUTTIES Player Pick',
      hydrateItem: recordHydrator,
      destination: 'storage',
    });

    // Simulate the selected entity being consumed later while the original
    // Club source remains in the live inventory used for recap reopening.
    const { api: liveApi } = await loadUserscript({ club: [clubXhaka] });
    const liveHydrator = liveApi.createRecapItemHydrator();
    const model = createRollingRecapModel({
      snapshot: aggregator.getSnapshot(),
      hydrateItem: liveHydrator,
      resolveDestination: liveHydrator.resolveDestination,
    });

    expect(model.rows[0]).toMatchObject({
      name: 'Xhaka',
      rating: 97,
      destination: 'storage',
    });
  });

  it('keeps long runs bounded and stores summaries instead of source items', () => {
    const aggregator = createRollingRecapAggregator({ alertMinimumRating: 94 });
    const source = card({ id: 1, definitionId: 101, rating: 99, special: true, rareflag: 8 });
    for (let index = 0; index < 10000; index++) {
      aggregator.recordPackReceipt({
        status: 'opened',
        packRef: { name: '10x85+' },
        openedItems: [{
          ...source,
          id: index + 1,
          definitionId: index + 100,
          rating: 94 + (index % 6),
        }],
      });
    }
    const snapshot = aggregator.getSnapshot({
      workflow: { completions: 10000, iterations: 10000, packsOpened: 10000 },
      status: 'stopped',
      reason: 'test stop',
    });

    expect(snapshot.counters).toMatchObject({
      packsOpened: 10000,
      itemCount: 10000,
      playerCount: 10000,
      qualifyingCount: 10000,
    });
    expect(snapshot.topCards).toHaveLength(50);
    expect(snapshot.alertCards).toHaveLength(100);
    expect(snapshot.retainedCards).toHaveLength(100);
    expect(snapshot.omitted).toEqual({ topCards: 9950, alertCards: 9900 });
    expect(snapshot.retainedCards[0]).not.toHaveProperty('item');
    expect(snapshot.retainedCards[0]).not.toBe(source);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('counts card types, ratings, recovery actions, and duplicate routes', () => {
    const aggregator = createRollingRecapAggregator();
    aggregator.recordPackReceipt({
      status: 'opened',
      packRef: { name: 'Reward' },
      openedItems: [
        card({ id: 1, rating: 84, rare: false, rareflag: 0, duplicate: true }),
        card({ id: 2, rating: 85, rare: true, rareflag: 1 }),
        card({ id: 3, rating: 96, special: true, rareflag: 8 }),
      ],
      routedItemRefs: [{ id: 1, pile: 'club' }, { id: 3, pile: 'storage' }],
      pendingItemRefs: [{ id: 2, pile: 'unassigned' }],
    });
    aggregator.recordRecovery('provisions', { duplicatesConsumed: 2 });
    aggregator.recordRecovery('totw', { duplicatesConsumed: 1 });
    aggregator.recordRecovery('playerPick');
    aggregator.recordRecovery('goldSink');
    aggregator.recordDuplicateRoute('primary', 4);

    const snapshot = aggregator.getSnapshot({ workflow: { completions: 1 } });
    expect(snapshot.counters.types).toEqual({ common: 1, rare: 1, special: 1 });
    expect(snapshot.counters.ratings).toEqual({ 84: 1, 85: 1, 96: 1 });
    expect(snapshot.counters.recoveries).toEqual({ totw: 1, provisions: 1, playerPick: 1, goldSink: 1, storageSink: 0 });
    expect(snapshot.counters.duplicateRoutes).toEqual({ primary: 4, storage: 1, recovery: 3 });
    expect(Object.fromEntries(snapshot.retainedCards.map((entry) => [entry.id, entry.destination])))
      .toEqual({ 1: 'club', 2: 'unassigned', 3: 'storage' });
  });

  it('hydrates lightweight response names and preserves Player Pick destinations', () => {
    const aggregator = createRollingRecapAggregator({
      hydrateItem: (item) => item.id === 77
        ? { id: 77, definitionId: 707, type: 'player', rating: 96, _staticData: { firstName: 'Real', lastName: 'Name' } }
        : item,
    });
    aggregator.recordItems([{ id: 77, definitionId: 707, name: '707', rating: 96, rareflag: 7 }], {
      sourceLabel: '1 of 3 94+ Player Pick',
      destination: 'storage',
    });

    const snapshot = aggregator.getSnapshot();
    expect(snapshot.retainedCards[0]).toMatchObject({ name: 'Real Name', destination: 'storage' });
    const model = createRollingRecapModel({ snapshot });
    expect(model.rows[0]).toMatchObject({
      name: 'Real Name',
      sourceLabel: '1/3 94+ Pick',
      sourceTitle: '1 of 3 94+ Player Pick',
      destination: 'storage',
    });
  });

  it('prefers the final inventory destination over the pack-time destination', () => {
    const aggregator = createRollingRecapAggregator();
    aggregator.recordPackReceipt({
      status: 'opened',
      packRef: { name: '10x85+' },
      openedItems: [
        card({ id: 77, definitionId: 707, name: 'Moved Player', rating: 87 }),
        card({ id: 78, definitionId: 708, name: 'Historical Player', rating: 86 }),
      ],
      pendingItemRefs: [
        { id: 77, definitionId: 707 },
        { id: 78, definitionId: 708 },
      ],
    });

    const model = createRollingRecapModel({
      snapshot: aggregator.getSnapshot(),
      resolveDestination: (item) => item.id === 77 ? 'club' : null,
    });

    expect(model.rows.find((row) => row.name === 'Moved Player')?.destination).toBe('club');
    expect(model.rows.find((row) => row.name === 'Historical Player')?.destination).toBe('unassigned');
  });

  it('builds a compact sorted model with prices and final resources', () => {
    const aggregator = createRollingRecapAggregator({ alertMinimumRating: 94 });
    aggregator.recordPackReceipt({
      status: 'opened', packRef: { name: '10x85+' },
      openedItems: [card({ id: 1, definitionId: 101, name: 'Rare 85', rating: 85 })],
    });
    aggregator.recordPackReceipt({
      status: 'opened', packRef: { name: '10x85+' },
      openedItems: [card({ id: 2, definitionId: 102, name: 'Special 96', rating: 96, special: true, rareflag: 8 })],
    });
    const snapshot = aggregator.getSnapshot({
      status: 'blocked',
      reason: 'Storage full',
      workflow: { completions: 2, iterations: 3, packsOpened: 2, reasonCode: 'PROTECTED_STORAGE_BLOCKED' },
      finalResources: { storage: '100/100', inventoryVersion: 9 },
    });
    const model = createRollingRecapModel({
      name: '10x85+ Rolling Loop',
      snapshot,
      prices: new Map([[102, 250000]]),
    });

    expect(model).toMatchObject({
      title: '10x85+ Rolling Loop Recap',
      status: 'blocked',
      reason: 'Storage full',
      itemCount: 2,
      qualifyingCount: 1,
      totalPacksOpened: 2,
      requestedPacks: 2,
    });
    expect(model.rows.map((row) => row.name)).toEqual(['Special 96', 'Rare 85']);
    expect(model.rows[0]).toMatchObject({ price: 250000, showPrice: true, sourceLabel: '10x85+' });
    expect(model.details.map((entry) => entry.label)).toContain('Final inventory');
    expect(model.receipts).toEqual([]);
  });
});
