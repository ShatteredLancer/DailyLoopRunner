import { describe, expect, it } from 'vitest';
import {
  classifyOpenedItemRouting,
  createOpenedItemRoutingBaseline,
  matchOpenedItemsToNewPileAliases,
  materializeOpenedPlayerDuplicates,
  needsUnassignedViewMaterialization,
  planUnmaterializedDuplicateFallback,
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
    expect(needsUnassignedViewMaterialization(result)).toBe(false);
  });

  it('requires a page sync when every opened player is a deferred duplicate', () => {
    expect(needsUnassignedViewMaterialization({
      directItems: [],
      deferredDuplicates: [{ id: 101 }, { id: 102 }],
    })).toBe(true);
    expect(needsUnassignedViewMaterialization({
      directItems: [{ id: 101 }],
      deferredDuplicates: [{ id: 102 }],
    })).toBe(false);
  });

  it('plans direct duplicate fallback without bypassing aggregate destination capacity', () => {
    const tradeable = { id: 101, tradeable: true };
    const swappable = { id: 102, tradeable: false, duplicateId: 202 };
    const clubTradeable = { id: 202, tradeable: true };
    const blocked = planUnmaterializedDuplicateFallback({
      items: [tradeable, swappable],
      isTradeable: (item) => item.tradeable === true,
      findClubDuplicate: (item) => item.id === swappable.id ? clubTradeable : null,
      capacities: { transfer: 1, storage: 10 },
    });

    expect(blocked).toMatchObject({
      status: 'blocked',
      blocked: { destination: 'transfer', required: 2, free: 1 },
    });
  });

  it('groups direct duplicate fallback routes by EA move destination', () => {
    const tradeable = { id: 101, tradeable: true };
    const swappable = { id: 102, tradeable: false };
    const storage = { id: 103, tradeable: false };
    const plan = planUnmaterializedDuplicateFallback({
      items: [tradeable, swappable, storage],
      isTradeable: (item) => item.tradeable === true,
      findClubDuplicate: (item) => item.id === swappable.id ? { id: 202, tradeable: true } : null,
      capacities: { transfer: 2, storage: 1 },
    });

    expect(plan.status).toBe('ready');
    expect(plan.groups.map((group) => ({
      key: group.key,
      capacityKey: group.capacityKey,
      ids: group.items.map((item) => item.id),
    }))).toEqual([
      { key: 'transfer', capacityKey: 'transfer', ids: [101] },
      { key: 'club', capacityKey: 'transfer', ids: [102] },
      { key: 'storage', capacityKey: 'storage', ids: [103] },
    ]);
  });

  it('keeps an opened item pending until its id appears in a destination pile', () => {
    const opened = { id: 101, definitionId: 501 };
    expect(classifyOpenedItemRouting({ items: [opened], piles: {} }).pendingItems).toEqual([opened]);
    expect(classifyOpenedItemRouting({
      items: [opened],
      piles: { club: [{ id: 101, definitionId: 501 }] },
    }).routedItems).toEqual([opened]);
    expect(classifyOpenedItemRouting({
      items: [opened],
      piles: { club: [{ id: 201, definitionId: 501 }] },
    }).pendingItems).toEqual([opened]);
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

  it('routes a remapped destination entity when EA hydrates tradeability after the response', () => {
    const opened = { id: 101, definitionId: 501, type: 'player', rating: 84, rareflag: 1 };
    const existing = { id: 201, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: true };
    const landed = { id: 301, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: true };
    const routingBaseline = createOpenedItemRoutingBaseline({ storage: [existing] });

    const result = classifyOpenedItemRouting({
      items: [opened],
      piles: { storage: [existing, landed] },
      routingBaseline,
    });

    expect(result.pendingItems).toEqual([]);
    expect(result.aliasRoutes).toEqual([{ item: opened, destination: { pile: 'storage', item: landed } }]);
  });

  it('keeps an exact live Unassigned entity pending even when a matching new destination appears', () => {
    const opened = { id: 101, definitionId: 501, type: 'player', rating: 84, rareflag: 1 };
    const landed = { id: 301, definitionId: 501, type: 'player', rating: 84, rareflag: 1, untradeable: true };
    const result = classifyOpenedItemRouting({
      items: [opened],
      piles: { unassigned: [opened], storage: [landed] },
      routingBaseline: createOpenedItemRoutingBaseline(),
    });

    expect(result.pendingItems).toEqual([opened]);
    expect(result.aliasRoutes).toEqual([]);
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

  it('matches a complete response group to new Unassigned aliases after EA remaps ids', () => {
    const opened = [
      { id: 101, definitionId: 501, type: 'player', rating: 84, rareflag: 1 },
      { id: 102, definitionId: 502, type: 'player', rating: 85, rareflag: 1 },
    ];
    const existing = { id: 201, definitionId: 501, type: 'player', rating: 84, rareflag: 1 };
    const aliases = [
      { id: 301, definitionId: 501, type: 'player', rating: 84, rareflag: 1 },
      { id: 302, definitionId: 502, type: 'player', rating: 85, rareflag: 1 },
    ];
    const baseline = createOpenedItemRoutingBaseline({ unassigned: [existing] });

    expect(matchOpenedItemsToNewPileAliases({
      items: opened,
      pileItems: [existing, ...aliases],
      baselineIds: baseline.unassignedIds,
    })).toEqual([
      { item: opened[0], alias: aliases[0] },
      { item: opened[1], alias: aliases[1] },
    ]);
  });

  it('keeps remapped Unassigned entities unmatched when the response group is not one-to-one', () => {
    const opened = [{ id: 101, definitionId: 501, type: 'player', rating: 84, rareflag: 1 }];
    const aliases = [
      { id: 301, definitionId: 501, type: 'player', rating: 84, rareflag: 1 },
      { id: 302, definitionId: 501, type: 'player', rating: 84, rareflag: 1 },
    ];

    expect(matchOpenedItemsToNewPileAliases({ items: opened, pileItems: aliases, baselineIds: [] })).toEqual([]);
  });
});
