import { describe, expect, it } from 'vitest';
import {
  batchOpenEntryKey,
  createBatchOpenAvailability,
  normalizeBatchOpenPlan,
} from '../../src/config/batch-open.js';

describe('Batch Open plan config', () => {
  it('normalizes stable identities, quantities, and duplicate entries', () => {
    const plan = normalizeBatchOpenPlan({ entries: [
      { packId: 105, packName: 'Bronze', quantity: 2 },
      { packId: 105, packName: 'Bronze renamed', quantity: 4 },
      { packName: 'Name only', quantity: 0 },
      {},
    ] });
    expect(plan).toEqual({ version: 1, entries: [
      { packId: 105, packName: 'Bronze renamed', quantity: 4 },
      { packId: null, packName: 'Name only', quantity: 1 },
    ] });
    expect(batchOpenEntryKey(plan.entries[0])).toBe('id:105');
  });

  it('keeps remembered unavailable types in the availability model', () => {
    const rows = createBatchOpenAvailability({ entries: [
      { packId: 105, packName: 'Bronze', quantity: 3 },
      { packId: 999, packName: 'Old pack', quantity: 2 },
    ] }, { groups: [{ id: 105, name: 'Bronze', count: 8 }] });
    expect(rows).toEqual([
      { packId: 105, packName: 'Bronze', quantity: 3, available: 8 },
      { packId: 999, packName: 'Old pack', quantity: 2, available: 0 },
    ]);
  });
});

