import { describe, expect, it } from 'vitest';
import { createFakeInventoryAdapter } from '../../src/adapters/fake/inventory.js';
import {
  mergeTransientUnassignedSignals,
  selectionConsumesAllSignalRefs,
} from '../../src/selection/transient-signals.js';
import { makePlayer } from '../helpers/load-userscript.js';

describe('transient Unassigned duplicate signals', () => {
  it('overlays response signals without changing the real inventory capacities', () => {
    const adapter = createFakeInventoryAdapter({
      unassigned: [makePlayer({ id: 1, definitionId: 101, duplicate: true, duplicateId: 11, rating: 75 })],
      club: [makePlayer({ id: 11, definitionId: 101, rating: 75 })],
      capacities: { storage: { max: 100, used: 98 } },
    });
    const snapshot = adapter.snapshot();
    const merged = mergeTransientUnassignedSignals(snapshot, [
      { id: 2, definitionId: 102, type: 'player', rating: 76, rareflag: 1, rare: true, duplicate: true, duplicateId: 12 },
    ]);

    expect(merged.piles.unassigned.map((item) => item.id)).toEqual([1, 2]);
    expect(merged.capacities.storage.free).toBe(snapshot.capacities.storage.free);
  });

  it('restores duplicate metadata when the repository item is visible but not fully materialized', () => {
    const adapter = createFakeInventoryAdapter({
      unassigned: [makePlayer({ id: 2, definitionId: 102, duplicate: false, duplicateId: 0, rating: 76, rareflag: 1 })],
    });
    const merged = mergeTransientUnassignedSignals(adapter.snapshot(), [
      { id: 2, definitionId: 102, type: 'player', rating: 76, rareflag: 1, rare: true, duplicate: true, duplicateId: 12 },
    ]);

    expect(merged.piles.unassigned).toHaveLength(1);
    expect(merged.piles.unassigned[0]).toMatchObject({ id: 2, duplicate: true, duplicateId: 12 });
  });

  it('requires every just-opened signal to be consumed by the selection', () => {
    const refs = [
      { id: 1, definitionId: 101, pile: 'unassigned' },
      { id: 2, definitionId: 102, pile: 'unassigned' },
    ];
    const complete = {
      entries: refs.map((signalRef) => ({ pileName: 'unassigned', signalRef })),
    };
    const partial = { entries: [complete.entries[0]] };

    expect(selectionConsumesAllSignalRefs(complete, refs)).toBe(true);
    expect(selectionConsumesAllSignalRefs(partial, refs)).toBe(false);
  });
});
