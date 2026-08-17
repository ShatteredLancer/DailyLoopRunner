import { createInventorySnapshot, INVENTORY_PILES } from '../domain/contracts.js';

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeRef(value = {}, fallbackPile = 'unknown') {
  const source = value?.ref || value || {};
  const id = positiveNumber(source.id);
  const definitionId = positiveNumber(source.definitionId);
  if (!id && !definitionId) return null;
  return {
    id,
    definitionId,
    pile: String(source.pile || fallbackPile || 'unknown'),
  };
}

export function inventorySelectionRefs(selection = {}, options = {}) {
  const plan = selection.plan || selection;
  const refs = [];
  for (const entry of plan.entries || []) {
    const itemRef = normalizeRef(entry.itemRef || entry.item || entry.selected, entry.pileName);
    if (itemRef) refs.push({ kind: 'item', ref: itemRef });
    if (options.includeSignals === true) {
      const signalRef = normalizeRef(entry.signalRef || entry.signal, entry.pileName);
      if (signalRef) refs.push({ kind: 'signal', ref: signalRef });
    }
  }
  if (!refs.some((entry) => entry.kind === 'item')) {
    for (const item of plan.selected || selection.selected || []) {
      const ref = normalizeRef(item);
      if (ref) refs.push({ kind: 'item', ref });
    }
  }
  const seen = new Set();
  return refs.filter(({ kind, ref }) => {
    const key = `${kind}:${ref.id ? `id:${ref.id}` : `definition:${ref.definitionId}:${ref.pile}`}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchesRef(item, pile, ref) {
  if (ref.id) return Number(item?.id || item?.ref?.id || 0) === ref.id;
  return ref.definitionId > 0
    && Number(item?.definitionId || item?.ref?.definitionId || 0) === ref.definitionId
    && (ref.pile === 'unknown' || ref.pile === pile);
}

export function removeInventorySelection(snapshot, selection, options = {}) {
  const selectionRefs = inventorySelectionRefs(selection, options);
  if (!selectionRefs.length) return null;
  const pending = selectionRefs.map((entry) => ({ ...entry, removed: false }));
  const piles = Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, []]));

  for (const pile of INVENTORY_PILES) {
    for (const item of snapshot?.piles?.[pile] || []) {
      const match = pending.find((entry) => !entry.removed && matchesRef(item, pile, entry.ref));
      if (match) match.removed = true;
      else piles[pile].push(item);
    }
  }
  if (pending.some((entry) => !entry.removed)) return null;
  return createInventorySnapshot({
    capturedAt: snapshot.capturedAt,
    piles,
    capacities: Object.fromEntries(INVENTORY_PILES.map((pile) => [
      pile,
      { used: piles[pile].length, max: snapshot.capacities?.[pile]?.max },
    ])),
  });
}
