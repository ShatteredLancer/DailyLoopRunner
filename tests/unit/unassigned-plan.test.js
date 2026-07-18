import { describe, expect, it } from 'vitest';
import { createInventorySnapshot, createItemSnapshot } from '../../src/domain/contracts.js';
import { planUnassignedActions } from '../../src/unassigned/plan.js';

function item(id, options = {}) {
  return createItemSnapshot({
    id,
    definitionId: options.definitionId || id + 100,
    type: 'player',
    rating: options.rating || 64,
    duplicate: options.duplicate === true,
    duplicateId: options.duplicateId || 0,
    tradeable: options.tradeable === true,
  }, options.pile || 'unassigned');
}

function snapshot({ unassigned = [], club = [], storageFree = 100, transferFree = 100 }) {
  return createInventorySnapshot({
    piles: { unassigned, club },
    capacities: {
      storage: { used: 100 - storageFree, max: 100 },
      transfer: { used: 100 - transferFree, max: 100 },
    },
  });
}

describe('planUnassignedActions', () => {
  it('prioritizes non-duplicates to club', () => {
    const plan = planUnassignedActions(snapshot({ unassigned: [item(1), item(2, { duplicate: true, tradeable: true })] }));
    expect(plan).toMatchObject({ status: 'action', action: { type: 'move', destination: 'club', description: 'non-duplicate' } });
    expect(plan.action.itemRefs.map((ref) => ref.id)).toEqual([1]);
  });

  it('routes tradeable duplicates to transfer and blocks on capacity', () => {
    const blocked = planUnassignedActions(snapshot({
      unassigned: [item(1, { duplicate: true, tradeable: true }), item(2, { duplicate: true, tradeable: true })],
      transferFree: 1,
    }));
    expect(blocked).toMatchObject({ status: 'blocked', blocked: { destination: 'transfer', required: 2, free: 1 } });
  });

  it('swaps an untradeable duplicate when the club version is tradeable', () => {
    const duplicate = item(1, { definitionId: 501, duplicate: true, duplicateId: 2 });
    const club = item(2, { definitionId: 501, tradeable: true, pile: 'club' });
    const plan = planUnassignedActions(snapshot({ unassigned: [duplicate], club: [club] }));
    expect(plan).toMatchObject({ status: 'action', action: { type: 'swap', destination: 'club' } });
  });

  it('blocks Storage overflow and preserves reserved items', () => {
    const duplicate = item(1, { duplicate: true, duplicateId: 2 });
    const blocked = planUnassignedActions(snapshot({ unassigned: [duplicate], storageFree: 0 }));
    expect(blocked).toMatchObject({ status: 'blocked', blocked: { destination: 'storage', required: 1, free: 0 } });
    const preserved = planUnassignedActions(snapshot({ unassigned: [duplicate] }), { reserveItem: (entry) => entry.id === 1 });
    expect(preserved).toMatchObject({ status: 'preserved', reservedItemRefs: [{ id: 1 }] });
  });
});
