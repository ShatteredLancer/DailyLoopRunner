import { describe, expect, it } from 'vitest';
import {
  createInventorySnapshot,
  createItemSnapshot,
  createOpenPackReceipt,
  createSelectionPlan,
  createSquadPlan,
  createSubmissionResult,
} from '../../src/domain/contracts.js';

describe('domain contracts', () => {
  it('normalizes and freezes item/inventory snapshots', () => {
    const item = createItemSnapshot({ id: 1, definitionId: 2, type: 'player', rating: 84, rareflag: 2, tradeable: true }, 'club');
    const inventory = createInventorySnapshot({ piles: { club: [item] }, capacities: { club: { max: 100, used: 1 } } });
    expect(item).toMatchObject({ tier: 'gold', rare: true, special: true, pile: 'club' });
    expect(inventory.capacities.club).toEqual({ used: 1, max: 100, free: 99 });
    expect(Object.isFrozen(inventory)).toBe(true);
    expect(Object.isFrozen(inventory.piles.club)).toBe(true);
  });

  it('creates serializable plans and results without live model objects', () => {
    const selection = createSelectionPlan({ ok: true, selected: [{ id: 1 }], pileCounts: { club: 1 } });
    const squad = createSquadPlan({ ok: true, itemRefs: [{ id: 1, definitionId: 2, pile: 'club' }], expectedPlayerCount: 1 });
    const submission = createSubmissionResult({ status: 'submitted', submitted: true, consumedItemRefs: squad.itemRefs, rewardPackId: 105 });
    const receipt = createOpenPackReceipt({ status: 'opened', openedItems: [{ id: 5 }], attempts: 1 });
    expect(JSON.parse(JSON.stringify({ selection, squad, submission, receipt }))).toMatchObject({
      selection: { ok: true },
      squad: { ok: true, expectedPlayerCount: 1 },
      submission: { submitted: true, rewardPackId: 105 },
      receipt: { status: 'opened', attempts: 1 },
    });
  });
});
