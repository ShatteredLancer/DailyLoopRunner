import { createItemRef } from '../domain/contracts.js';

function itemRefKey(ref) {
  const id = Number(ref?.id || 0);
  if (id) return `id:${id}`;
  return `definition:${Number(ref?.definitionId || 0)}:${String(ref?.pile || 'unknown')}`;
}

function uniqueRefs(items = [], defaultPile = 'unassigned') {
  const refs = [];
  const seen = new Set();
  for (const item of items || []) {
    const ref = item?.ref
      ? createItemRef(item.ref, item.ref.pile || item.pile || defaultPile)
      : createItemRef(item, item?.pile || defaultPile);
    const key = itemRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

function explicitRefs(result, itemKey, refKey, defaultPile) {
  if (Array.isArray(result?.[refKey])) return uniqueRefs(result[refKey], defaultPile);
  return uniqueRefs(result?.[itemKey] || [], defaultPile);
}

export function partitionOpenedItems(items = [], classifiers = []) {
  const groups = Object.fromEntries((classifiers || []).map((entry) => [entry.name, []]));
  groups.pending = [];
  for (const item of items || []) {
    const match = (classifiers || []).find((entry) => entry?.matches?.(item));
    if (match) groups[match.name].push(item);
    else groups.pending.push(item);
  }
  return groups;
}

export function createOpenedItemPolicy(handler, options = {}) {
  if (typeof handler !== 'function') throw new TypeError('opened item policy handler is required');
  const defaultPile = String(options.defaultPile || 'unassigned');
  return async (openedItems, context = {}) => {
    const result = await handler(openedItems || [], context) || {};
    const reservedItemRefs = explicitRefs(result, 'reservedItems', 'reservedItemRefs', defaultPile);
    const routedItemRefs = explicitRefs(result, 'routedItems', 'routedItemRefs', defaultPile);
    const covered = new Set([...reservedItemRefs, ...routedItemRefs].map(itemRefKey));
    const pendingItemRefs = Array.isArray(result.pendingItemRefs) || Array.isArray(result.pendingItems)
      ? explicitRefs(result, 'pendingItems', 'pendingItemRefs', defaultPile)
      : uniqueRefs(openedItems, defaultPile).filter((ref) => !covered.has(itemRefKey(ref)));
    return {
      reservedItemRefs,
      routedItemRefs,
      pendingItemRefs,
      details: result.details || {},
    };
  };
}
