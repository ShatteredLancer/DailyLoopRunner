import { describe, expect, it } from 'vitest';
import {
  batchOpenEntryKey,
  createBatchOpenAvailability,
  materializeBatchOpenPlan,
  normalizeBatchOpenPlan,
} from '../../src/config/batch-open.js';

describe('Batch Open plan config', () => {
  it('normalizes stable identities, quantities, and duplicate entries', () => {
    const plan = normalizeBatchOpenPlan({ entries: [
      { packId: 105, packName: 'Bronze', quantity: 2 },
      { packId: 105, packName: 'Bronze renamed', quantity: 4, quantityMode: 'all' },
      { packName: 'Name only', quantity: 0 },
      {},
    ] });
    expect(plan).toEqual({ version: 1, entries: [
      { packId: 105, packName: 'Bronze renamed', quantity: 4, quantityMode: 'all' },
      { packId: null, packName: 'Name only', quantity: 1, quantityMode: 'fixed' },
    ] });
    expect(batchOpenEntryKey(plan.entries[0])).toBe('id:105');
  });

  it('keeps remembered unavailable types in the availability model', () => {
    const rows = createBatchOpenAvailability({ entries: [
      { packId: 105, packName: 'Bronze', quantity: 3 },
      { packId: 999, packName: 'Old pack', quantity: 2 },
    ] }, { groups: [{ id: 105, name: 'Bronze', count: 8 }] });
    expect(rows).toEqual([
      { packId: 105, packName: 'Bronze', quantity: 3, quantityMode: 'fixed', available: 8, effectiveQuantity: 3 },
      { packId: 999, packName: 'Old pack', quantity: 2, quantityMode: 'fixed', available: 0, effectiveQuantity: 2 },
    ]);
  });

  it('resolves all-mode quantities from the latest snapshot and ignores currently unavailable all entries', () => {
    const saved = { entries: [
      { packId: 105, packName: 'Bronze', quantity: 6, quantityMode: 'all' },
      { packId: 205, packName: 'Silver', quantity: 4, quantityMode: 'all' },
      { packId: 305, packName: 'Gold', quantity: 5, quantityMode: 'fixed' },
    ] };
    const snapshot = { groups: [
      { id: 105, name: 'Bronze', count: 3 },
      { id: 305, name: 'Gold', count: 2 },
    ] };
    expect(createBatchOpenAvailability(saved, snapshot).map((entry) => entry.effectiveQuantity)).toEqual([3, 0, 5]);
    expect(materializeBatchOpenPlan(saved, snapshot).entries).toEqual([
      { packId: 105, packName: 'Bronze', quantity: 3, quantityMode: 'all' },
      { packId: 305, packName: 'Gold', quantity: 5, quantityMode: 'fixed' },
    ]);
  });
});
