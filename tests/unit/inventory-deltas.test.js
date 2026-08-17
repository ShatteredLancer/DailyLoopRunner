import { describe, expect, it } from 'vitest';
import {
  capacityInventoryDelta,
  moveInventoryDelta,
  packReceiptInventoryDelta,
  playerPickInventoryDelta,
  submissionInventoryDelta,
} from '../../src/inventory/deltas.js';

describe('InventoryDelta projectors', () => {
  it('projects a fully routed pack receipt into confirmed additions', () => {
    const delta = packReceiptInventoryDelta({
      status: 'opened',
      openedItems: [
        { id: 1, definitionId: 101, rating: 84 },
        { id: 2, definitionId: 102, rating: 95 },
        { id: 3, definitionId: 103, rating: 87 },
      ],
      routedItemRefs: [{ id: 1, pile: 'club' }, { id: 2, pile: 'storage' }],
      reservedItemRefs: [{ id: 3, pile: 'transfer' }],
      pendingItemRefs: [],
    });

    expect(delta).toMatchObject({
      status: 'confirmed',
      operation: 'pack-open',
      additions: [
        { pile: 'club', item: { id: 1, pile: 'club' } },
        { pile: 'storage', item: { id: 2, pile: 'storage' } },
        { pile: 'transfer', item: { id: 3, pile: 'transfer' } },
      ],
    });
  });

  it('marks unresolved opened destinations ambiguous and non-opened receipts rejected', () => {
    expect(packReceiptInventoryDelta({
      status: 'opened',
      openedItems: [{ id: 1 }],
      pendingItemRefs: [{ id: 1 }],
    })).toMatchObject({ status: 'ambiguous', reason: '1 opened item(s) have unresolved inventory destinations' });
    expect(packReceiptInventoryDelta({ status: 'blocked', reason: 'transport-error' }))
      .toMatchObject({ status: 'rejected', reason: 'transport-error' });
  });

  it('projects confirmed and ambiguous moves', () => {
    expect(moveInventoryDelta({
      result: { success: true },
      items: [{ id: 1, definitionId: 101, pile: 'unassigned' }],
      toPile: 'storage',
    })).toMatchObject({
      status: 'confirmed',
      moves: [{ itemRef: { id: 1 }, fromPile: 'unassigned', toPile: 'storage' }],
    });
    expect(moveInventoryDelta({ result: undefined, items: [{ id: 1 }], ambiguous: true, toPile: 'storage' }))
      .toMatchObject({ status: 'ambiguous' });
  });

  it('projects only confirmed submissions and Pick selections as mutations', () => {
    expect(submissionInventoryDelta({
      status: 'submitted',
      submitted: true,
      consumedItemRefs: [{ id: 10, definitionId: 110, pile: 'club' }],
    }, { primary: true })).toMatchObject({
      status: 'confirmed',
      removals: [{ id: 10 }],
      details: { consumed: 1, primary: true },
    });
    expect(submissionInventoryDelta({ status: 'blocked', reason: 'timeout' }, { ambiguous: true }))
      .toMatchObject({ status: 'ambiguous', reason: 'timeout' });
    expect(playerPickInventoryDelta({ status: 'selected', pickedCards: [{ id: 20, definitionId: 120 }] }))
      .toMatchObject({ status: 'confirmed', additions: [{ pile: 'unassigned', item: { id: 20 } }] });
    expect(playerPickInventoryDelta({ status: 'blocked' })).toMatchObject({ status: 'rejected' });
  });

  it('projects confirmed and ambiguous capacity observations', () => {
    expect(capacityInventoryDelta({ storage: { used: 80, max: 100 } }))
      .toMatchObject({ status: 'confirmed', capacities: { storage: { used: 80, max: 100 } } });
    expect(capacityInventoryDelta({}, { confirmed: false, reason: 'storage response missing' }))
      .toMatchObject({ status: 'ambiguous', reason: 'storage response missing' });
  });
});
