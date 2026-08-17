import { describe, expect, it, vi } from 'vitest';
import { createInventoryMutationObservers } from '../../src/inventory/mutation-observers.js';

describe('Inventory Ledger mutation observers', () => {
  it('normalizes transaction callback shapes for the coordinator', async () => {
    const coordinator = {
      recordPackReceipt: vi.fn(async () => 'pack'),
      recordMove: vi.fn(async () => 'move'),
      recordSubmission: vi.fn(async () => 'submit'),
      recordPickSelection: vi.fn(async () => 'pick'),
      recordCapacities: vi.fn(async () => 'capacity'),
    };
    const observers = createInventoryMutationObservers(coordinator);
    const card = { id: 1, definitionId: 101, pile: 'unassigned' };

    await expect(observers.packReceipt({ status: 'opened' }, { reconcile: true })).resolves.toBe('pack');
    await expect(observers.moveResult({ success: true }, {
      items: [card], fromPile: 'unassigned', toPile: 'storage', confirmedAt: 'now',
    })).resolves.toBe('move');
    await expect(observers.submissionResult({ status: 'submitted' }, { primary: true })).resolves.toBe('submit');
    await expect(observers.pickConfirmed({ entry: { pickedCards: [card] } })).resolves.toBe('pick');
    await expect(observers.capacities({ storage: { used: 1, max: 100 } })).resolves.toBe('capacity');

    expect(coordinator.recordPackReceipt).toHaveBeenCalledWith({ status: 'opened' }, { reconcile: true });
    expect(coordinator.recordMove).toHaveBeenCalledWith(expect.objectContaining({
      result: { success: true }, items: [card], fromPile: 'unassigned', toPile: 'storage', confirmedAt: 'now',
    }));
    expect(coordinator.recordSubmission).toHaveBeenCalledWith({ status: 'submitted' }, expect.objectContaining({ primary: true }));
    expect(coordinator.recordPickSelection).toHaveBeenCalledWith(expect.objectContaining({
      status: 'selected', confirmed: true, pickedCards: [card],
    }), expect.objectContaining({ pile: 'unassigned' }));
  });

  it('requires an explicit coordinator and leaves legacy callers opt-in', () => {
    expect(() => createInventoryMutationObservers()).toThrow('Inventory Ledger coordinator is required');
  });
});
