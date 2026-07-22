import { describe, expect, it } from 'vitest';
import {
  classifyOpenedItemRouting,
  materializeOpenedPlayerDuplicates,
} from '../../src/pack/opened-item-materialization.js';

describe('opened item materialization', () => {
  it('infers a delayed duplicate from the matching Club definition', () => {
    const opened = { id: 101, definitionId: 501, type: 'player', duplicateId: 0 };
    const prepared = [];
    const result = materializeOpenedPlayerDuplicates({
      items: [opened],
      clubItems: [{ id: 201, definitionId: 501, type: 'player' }],
      isPlayer: (item) => item.type === 'player',
      isDuplicate: (item) => Number(item.duplicateId || 0) > 0,
      preparePurchasedItem: (item) => prepared.push(item.id),
    });

    expect(opened.duplicateId).toBe(201);
    expect(result.duplicates).toEqual([opened]);
    expect(result.inferredDuplicates).toEqual([opened]);
    expect(prepared).toEqual([101]);
  });

  it('keeps an opened item pending until its id appears in a destination pile', () => {
    const opened = { id: 101, definitionId: 501 };
    expect(classifyOpenedItemRouting({ items: [opened], piles: {} }).pendingItems).toEqual([opened]);
    expect(classifyOpenedItemRouting({
      items: [opened],
      piles: { club: [{ id: 101, definitionId: 501 }] },
    }).routedItems).toEqual([opened]);
  });

  it('distinguishes intentionally reserved Unassigned items from unresolved items', () => {
    const reserved = { id: 101, definitionId: 501 };
    const pending = { id: 102, definitionId: 502 };
    const result = classifyOpenedItemRouting({
      items: [reserved, pending],
      piles: { unassigned: [reserved, pending] },
      reserveItem: (item) => item.id === 101,
    });
    expect(result.reservedItems).toEqual([reserved]);
    expect(result.pendingItems).toEqual([pending]);
  });
});
