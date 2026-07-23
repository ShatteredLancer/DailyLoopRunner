import { describe, expect, it } from 'vitest';
import {
  classifyOpenedItemRouting,
  createOpenedItemRoutingBaseline,
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
    expect(result.directItems).toEqual([]);
    expect(result.deferredDuplicates).toEqual([opened]);
    expect(prepared).toEqual([101]);
  });

  it('routes only confirmed non-duplicates directly and defers duplicates to live Unassigned', () => {
    const normal = { id: 101, definitionId: 501, type: 'player', duplicateId: 0 };
    const duplicate = { id: 102, definitionId: 502, type: 'player', duplicateId: 202 };
    const result = materializeOpenedPlayerDuplicates({
      items: [normal, duplicate],
      clubItems: [{ id: 202, definitionId: 502, type: 'player' }],
      isPlayer: (item) => item.type === 'player',
      isDuplicate: (item) => Number(item.duplicateId || 0) > 0,
    });

    expect(result.directItems).toEqual([normal]);
    expect(result.deferredDuplicates).toEqual([duplicate]);
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

  it('routes a response item through one matching destination entity that appeared after the pack opened', () => {
    const opened = { id: 101, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: false };
    const existing = { id: 201, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: false };
    const landed = { id: 301, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: false };
    const routingBaseline = createOpenedItemRoutingBaseline({ transfer: [existing] });

    const result = classifyOpenedItemRouting({
      items: [opened],
      piles: { transfer: [existing, landed] },
      routingBaseline,
    });

    expect(result.pendingItems).toEqual([]);
    expect(result.routedItems).toEqual([opened]);
    expect(result.aliasRoutes).toEqual([{ item: opened, destination: { pile: 'transfer', item: landed } }]);
  });

  it('does not mistake a pre-open matching destination item for an opened item', () => {
    const opened = { id: 101, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: false };
    const existing = { id: 201, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: false };
    const routingBaseline = createOpenedItemRoutingBaseline({ transfer: [existing] });

    const result = classifyOpenedItemRouting({
      items: [opened],
      piles: { transfer: [existing] },
      routingBaseline,
    });

    expect(result.pendingItems).toEqual([opened]);
    expect(result.aliasRoutes).toEqual([]);
  });

  it('keeps an alias pending when multiple new destination entities could match it', () => {
    const opened = { id: 101, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: false };
    const routingBaseline = createOpenedItemRoutingBaseline();
    const result = classifyOpenedItemRouting({
      items: [opened],
      piles: {
        transfer: [
          { id: 301, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: false },
          { id: 302, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: false },
        ],
      },
      routingBaseline,
    });

    expect(result.pendingItems).toEqual([opened]);
    expect(result.aliasRoutes).toEqual([]);
  });
});
