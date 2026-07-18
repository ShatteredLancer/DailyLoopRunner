import { describe, expect, it } from 'vitest';
import { createOpenedItemPolicy, partitionOpenedItems } from '../../src/pack/opened-item-policy.js';

describe('opened item policies', () => {
  it('partitions items by the first matching classifier', () => {
    const groups = partitionOpenedItems(
      [{ id: 1, duplicate: true }, { id: 2, rare: true }, { id: 3 }],
      [
        { name: 'duplicates', matches: (item) => item.duplicate === true },
        { name: 'rare', matches: (item) => item.rare === true },
      ],
    );
    expect(groups).toEqual({
      duplicates: [{ id: 1, duplicate: true }],
      rare: [{ id: 2, rare: true }],
      pending: [{ id: 3 }],
    });
  });

  it('normalizes routed and reserved items and derives uncovered pending refs', async () => {
    const policy = createOpenedItemPolicy(async (items) => ({
      reservedItems: [items[0], items[0]],
      routedItems: [items[1]],
      details: { reservedCount: 1 },
    }));
    const result = await policy([
      { id: 1, definitionId: 101 },
      { id: 2, definitionId: 102 },
      { id: 3, definitionId: 103 },
    ]);
    expect(result.reservedItemRefs).toEqual([{ id: 1, definitionId: 101, pile: 'unassigned' }]);
    expect(result.routedItemRefs).toEqual([{ id: 2, definitionId: 102, pile: 'unassigned' }]);
    expect(result.pendingItemRefs).toEqual([{ id: 3, definitionId: 103, pile: 'unassigned' }]);
    expect(result.details).toEqual({ reservedCount: 1 });
  });
});
