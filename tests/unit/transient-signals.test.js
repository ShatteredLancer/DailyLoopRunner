import { describe, expect, it } from 'vitest';
import { createFakeInventoryAdapter } from '../../src/adapters/fake/inventory.js';
import {
  evaluateUnassignedSignalCoverage,
  mergeTransientUnassignedSignals,
  selectedUnassignedSignalRefs,
  selectionConsumesAllSignalRefs,
  submittedUnassignedSignalRefs,
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

  it('extracts submitted duplicate signals and their matching inventory item ids', () => {
    const selection = {
      entries: [{
        pileName: 'unassigned',
        signal: { id: 101, definitionId: 501, duplicateId: 201 },
        item: { id: 201, definitionId: 501 },
      }, {
        pileName: 'club',
        signal: null,
        item: { id: 202, definitionId: 502 },
      }],
    };

    expect(selectedUnassignedSignalRefs(selection)).toEqual([{
      id: 101,
      definitionId: 501,
      duplicateId: 201,
      pile: 'unassigned',
    }]);
  });

  it('requires every matching Unassigned signal that fits in the squad to be selected', () => {
    const entry = (id) => ({
      pileName: 'unassigned',
      signalRef: { id, definitionId: id + 100, pile: 'unassigned' },
      itemRef: { id: id + 1000, definitionId: id + 100, pile: 'club' },
    });

    expect(evaluateUnassignedSignalCoverage({ entries: [] }, 3, 9)).toMatchObject({
      expectedCount: 3,
      selectedCount: 0,
      sufficient: false,
    });
    expect(evaluateUnassignedSignalCoverage({ entries: [entry(1), entry(2)] }, 3, 9)).toMatchObject({
      expectedCount: 3,
      selectedCount: 2,
      sufficient: false,
    });
    expect(evaluateUnassignedSignalCoverage({ entries: [entry(1), entry(2), entry(3)] }, 3, 9)).toMatchObject({
      expectedCount: 3,
      selectedCount: 3,
      sufficient: true,
    });
    expect(evaluateUnassignedSignalCoverage({ entries: [entry(1), entry(2)] }, 5, 2)).toMatchObject({
      expectedCount: 2,
      selectedCount: 2,
      sufficient: true,
    });
  });

  it('keeps only duplicate signals whose matching inventory entity was actually submitted', () => {
    const selection = {
      entries: [{
        pileName: 'unassigned',
        signalRef: { id: 101, definitionId: 501, pile: 'unassigned' },
        itemRef: { id: 201, definitionId: 501, pile: 'club' },
      }, {
        pileName: 'unassigned',
        signalRef: { id: 102, definitionId: 502, pile: 'unassigned' },
        itemRef: { id: 202, definitionId: 502, pile: 'club' },
      }],
    };

    expect(submittedUnassignedSignalRefs(selection, [{ id: 202 }])).toEqual([{
      id: 102,
      definitionId: 502,
      duplicateId: 202,
      pile: 'unassigned',
    }]);
  });

  it('preserves duplicate signals when the submitted squad cannot be identified', () => {
    const selection = {
      entries: [{
        pileName: 'unassigned',
        signalRef: { id: 101, definitionId: 501, pile: 'unassigned' },
        itemRef: { id: 201, definitionId: 501, pile: 'club' },
      }],
    };

    expect(submittedUnassignedSignalRefs(selection, [])).toEqual([]);
    expect(submittedUnassignedSignalRefs(selection, [{}])).toEqual([]);
  });

});
