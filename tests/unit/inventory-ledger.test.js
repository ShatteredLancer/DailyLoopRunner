import { describe, expect, it } from 'vitest';
import { createInventoryDelta, createInventorySnapshot } from '../../src/domain/contracts.js';
import { createInventoryLedger } from '../../src/inventory/ledger.js';

function item(id, rating = 84, pile = 'club', overrides = {}) {
  return {
    id,
    definitionId: 100000 + id,
    type: 'player',
    rating,
    rareflag: overrides.special ? 2 : 1,
    pile,
    ...overrides,
  };
}

function snapshot(piles = {}, capacities = {}) {
  return createInventorySnapshot({ piles, capacities });
}

function classifier(value) {
  return {
    requiredSpecial: value.groups?.includes(4) || false,
    provisionsReserve: [87, 88, 89].includes(value.rating),
    protected: value.rating >= 96,
    protectionReasons: value.rating >= 96 ? ['rating'] : [],
  };
}

describe('Inventory Ledger', () => {
  it('indexes inventory, capacities and policy classifications', () => {
    const ledger = createInventoryLedger({
      snapshot: snapshot({
        unassigned: [item(1, 84, 'unassigned', { special: true, groups: [4] })],
        storage: [item(2, 88, 'storage')],
        club: [item(3, 97, 'club', { special: true })],
      }, { storage: { used: 1, max: 100 }, club: { used: 1, max: null } }),
      classifyItem: classifier,
      readiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional' },
    });

    expect(ledger.summary()).toMatchObject({
      inventoryVersion: 1,
      itemCount: 3,
      pileCounts: { unassigned: 1, storage: 1, transfer: 0, club: 1 },
      classificationCounts: {
        requiredSpecial: 1,
        otherSpecial: 1,
        regular: 1,
        provisionsReserve: 1,
        protected: 1,
      },
      capacities: { storage: { used: 1, max: 100, free: 99 }, club: { used: 1, max: null, free: null } },
      readiness: { state: 'provisional', fullyValidated: false },
    });
    expect(ledger.resolveItem({ id: 2 })).toMatchObject({ rating: 88, pile: 'storage' });
  });

  it('indexes 10,000 local players in under one second without external reads', () => {
    const players = Array.from({ length: 10000 }, (_, index) => item(index + 1, 75 + (index % 24)));
    const ledger = createInventoryLedger({ snapshot: snapshot({ club: players }), classifyItem: classifier });
    const summary = ledger.summary();

    expect(summary.itemCount).toBe(10000);
    expect(summary.lastBuild.elapsedMs).toBeLessThan(1000);
  });

  it('applies confirmed removals, moves and additions atomically with capacity deltas', () => {
    const ledger = createInventoryLedger({
      snapshot: snapshot({
        club: [item(1), item(2)],
        storage: [item(3, 87, 'storage')],
      }, { club: { used: 12, max: 200 }, storage: { used: 8, max: 100 } }),
      classifyItem: classifier,
    });
    const result = ledger.applyDelta(createInventoryDelta({
      status: 'confirmed',
      operation: 'settle',
      removals: [{ id: 1, definitionId: 100001, pile: 'club' }],
      moves: [{ itemRef: { id: 2, definitionId: 100002 }, fromPile: 'club', toPile: 'storage' }],
      additions: [{ pile: 'unassigned', item: item(4, 95, 'unassigned', { special: true }) }],
      capacities: { storage: { used: 9, max: 100 } },
    }));

    expect(result).toMatchObject({ applied: true, inventoryVersion: 2, additions: 1, removals: 1, moves: 1 });
    expect(ledger.validateItemRefs([
      { id: 2, definitionId: 100002, pile: 'storage' },
      { id: 4, definitionId: 100004, pile: 'unassigned' },
    ]).ok).toBe(true);
    expect(ledger.summary().capacities).toMatchObject({
      club: { used: 10, max: 200, free: 190 },
      storage: { used: 9, max: 100, free: 91 },
      unassigned: { used: 1 },
    });
  });

  it('does not partially mutate when a confirmed delta has an identity conflict', () => {
    const source = { id: 0, definitionId: 500, type: 'player', rating: 84 };
    const ledger = createInventoryLedger({
      snapshot: snapshot({ club: [source], storage: [source] }),
    });
    const before = ledger.inventorySnapshot();
    const result = ledger.applyDelta(createInventoryDelta({
      status: 'confirmed',
      operation: 'bad-move',
      removals: [{ definitionId: 500, pile: 'club' }],
      additions: [{ pile: 'storage', item: source }],
    }));

    expect(result.applied).toBe(false);
    expect(ledger.summary()).toMatchObject({ inventoryVersion: 1, needsReconciliation: true });
    expect(ledger.inventorySnapshot().piles).toEqual(before.piles);
  });

  it('marks ambiguous mutations stale without changing inventory', () => {
    const ledger = createInventoryLedger({ snapshot: snapshot({ club: [item(1)] }) });
    const result = ledger.applyDelta(createInventoryDelta({
      status: 'ambiguous',
      operation: 'pack-open',
      additions: [{ pile: 'unassigned', item: item(2, 90, 'unassigned') }],
      reason: 'destination unknown',
    }));

    expect(result.applied).toBe(false);
    expect(ledger.summary()).toMatchObject({ itemCount: 1, inventoryVersion: 1, needsReconciliation: true });
  });

  it('detects and reconciles added, removed, moved, changed and capacity drift', () => {
    const ledger = createInventoryLedger({
      snapshot: snapshot({
        club: [item(1), item(2)],
        storage: [item(3, 87, 'storage')],
      }, { storage: { used: 1, max: 100 } }),
      classifyItem: classifier,
    });
    const next = snapshot({
      storage: [item(1, 84, 'storage'), item(3, 88, 'storage')],
      transfer: [item(4, 90, 'transfer')],
    }, { storage: { used: 2, max: 120 } });

    expect(ledger.compareSnapshot(next)).toEqual({
      added: 1,
      removed: 1,
      moved: 1,
      changed: 1,
      capacityChanged: true,
      drifted: true,
    });
    expect(ledger.reconcile(next)).toMatchObject({ ok: true, inventoryVersion: 2 });
    expect(ledger.summary()).toMatchObject({ itemCount: 3, needsReconciliation: false });
    expect(ledger.resolveItem({ id: 3 })).toMatchObject({ rating: 88 });
  });

  it('rebuilds classifications when readiness metadata changes', () => {
    const ledger = createInventoryLedger({
      snapshot: snapshot({ club: [item(1, 84, 'club', { special: true })] }),
      readiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional' },
      classifyItem: (_value, context) => ({ requiredSpecial: context.readiness.fullyValidated }),
    });

    expect(ledger.summary().classificationCounts.requiredSpecial).toBe(0);
    const result = ledger.reconcile(ledger.inventorySnapshot(), {
      readiness: { detected: true, ready: true, fullyValidated: true, state: 'ready' },
    });
    expect(result).toMatchObject({ ok: true, inventoryVersion: 2 });
    expect(ledger.summary().classificationCounts.requiredSpecial).toBe(1);
  });
});
