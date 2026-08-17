import {
  createInventoryDelta,
  createItemSnapshot,
  INVENTORY_PILES,
} from '../domain/contracts.js';

function validPile(value) {
  const pile = String(value || '');
  return INVENTORY_PILES.includes(pile) ? pile : null;
}

function itemId(value = {}) {
  return Number(value.id || value.ref?.id || 0);
}

function snapshotItem(item, pile, factory) {
  if (typeof factory === 'function') return factory(item, pile);
  return item?.ref
    ? { ...item, pile, ref: { ...item.ref, pile } }
    : createItemSnapshot(item, pile);
}

export function packReceiptInventoryDelta(receipt = {}, options = {}) {
  if (receipt.status !== 'opened') {
    return createInventoryDelta({
      status: options.ambiguous === true ? 'ambiguous' : 'rejected',
      operation: 'pack-open',
      reason: receipt.reason || `pack receipt status ${receipt.status || 'unknown'}`,
    });
  }
  if (receipt.pendingItemRefs?.length) {
    return createInventoryDelta({
      status: 'ambiguous',
      operation: 'pack-open',
      reason: `${receipt.pendingItemRefs.length} opened item(s) have unresolved inventory destinations`,
      details: { opened: receipt.openedItems?.length || 0, pending: receipt.pendingItemRefs.length },
    });
  }
  const destinationById = new Map();
  for (const ref of [...(receipt.reservedItemRefs || []), ...(receipt.routedItemRefs || [])]) {
    const id = itemId(ref);
    const pile = validPile(ref?.pile);
    if (id && pile) destinationById.set(id, pile);
  }
  const defaultPile = validPile(options.defaultPile) || 'unassigned';
  return createInventoryDelta({
    status: 'confirmed',
    operation: 'pack-open',
    additions: (receipt.openedItems || []).map((item) => {
      const pile = destinationById.get(itemId(item)) || validPile(item?.pile || item?.ref?.pile) || defaultPile;
      return { pile, item: snapshotItem(item, pile, options.snapshotItem) };
    }),
    confirmedAt: options.confirmedAt,
    details: { opened: receipt.openedItems?.length || 0 },
  });
}

export function moveInventoryDelta(input = {}) {
  const result = input.result || {};
  const items = input.items || [];
  const toPile = validPile(input.toPile);
  const moves = items.map((item) => ({
    itemRef: item.ref || item,
    fromPile: validPile(input.fromPile || item?.pile || item?.ref?.pile),
    toPile,
  }));
  const confirmed = result.success === true && toPile && moves.every((move) => move.fromPile);
  return createInventoryDelta({
    status: confirmed ? 'confirmed' : (input.ambiguous === true ? 'ambiguous' : 'rejected'),
    operation: 'move',
    moves,
    confirmedAt: input.confirmedAt,
    reason: confirmed ? null : input.reason || result?.error?.code || 'move result or pile is unconfirmed',
    details: { count: items.length, fromPile: input.fromPile || null, toPile: input.toPile || null },
  });
}

export function submissionInventoryDelta(result = {}, options = {}) {
  return createInventoryDelta({
    status: result.submitted === true && result.status === 'submitted'
      ? 'confirmed'
      : (options.ambiguous === true ? 'ambiguous' : 'rejected'),
    operation: 'sbc-submit',
    removals: result.consumedItemRefs || [],
    confirmedAt: options.confirmedAt,
    reason: result.submitted === true ? null : result.reason || `submission status ${result.status || 'unknown'}`,
    details: {
      consumed: result.consumedItemRefs?.length || 0,
      primary: options.primary === true,
    },
  });
}

export function playerPickInventoryDelta(result = {}, options = {}) {
  const pickedCards = result.pickedCards || result.items || [];
  const pile = validPile(options.pile) || 'unassigned';
  const confirmed = (result.status === 'selected' || result.confirmed === true) && pickedCards.length > 0;
  return createInventoryDelta({
    status: confirmed ? 'confirmed' : (options.ambiguous === true ? 'ambiguous' : 'rejected'),
    operation: 'player-pick',
    additions: pickedCards.map((item) => ({ pile, item: snapshotItem(item, pile, options.snapshotItem) })),
    confirmedAt: options.confirmedAt,
    reason: confirmed ? null : result.reason || 'Player Pick selection is unconfirmed',
    details: { selected: pickedCards.length },
  });
}

export function capacityInventoryDelta(capacities = {}, options = {}) {
  return createInventoryDelta({
    status: options.confirmed === false ? 'ambiguous' : 'confirmed',
    operation: 'capacity-update',
    capacities,
    confirmedAt: options.confirmedAt,
    reason: options.confirmed === false ? options.reason || 'capacity update is unconfirmed' : null,
  });
}
