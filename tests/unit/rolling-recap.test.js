import { describe, expect, it } from 'vitest';
import {
  createRollingRecapAggregator,
  createRollingRecapModel,
} from '../../src/reward/rolling-recap.js';

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
      routedItemRefs: [{ id: 3, pile: 'storage' }],
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
