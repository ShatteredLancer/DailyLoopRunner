import { createInventorySnapshot, createItemSnapshot } from '../domain/contracts.js';

function refKey(ref = {}) {
  const id = Number(ref?.id || 0);
  if (id) return `id:${id}`;
  return `definition:${Number(ref?.definitionId || 0)}:${String(ref?.pile || 'unassigned')}`;
}

function entrySignalRef(entry = {}) {
  return entry.signalRef || entry.signal?.ref || entry.signal || null;
}

function entryItemRef(entry = {}) {
  return entry.itemRef || entry.item?.ref || entry.item || null;
}

export function mergeTransientUnassignedSignals(snapshot, signals = []) {
  if (!signals.length) return snapshot;
  const existing = snapshot?.piles?.unassigned || [];
  const transientByKey = new Map();
  for (const signal of signals) {
    const normalized = createItemSnapshot(signal, 'unassigned');
    transientByKey.set(refKey(normalized.ref), normalized);
  }
  const mergedExisting = existing.map((item) => {
    const transient = transientByKey.get(refKey(item.ref || item));
    if (!transient) return item;
    transientByKey.delete(refKey(item.ref || item));
    return {
      ...item,
      ...transient,
      duplicate: item.duplicate === true || transient.duplicate === true,
      duplicateId: Number(transient.duplicateId || item.duplicateId || 0),
      ref: transient.ref,
      pile: 'unassigned',
    };
  });
  const additions = [];

  for (const transient of transientByKey.values()) additions.push(transient);

  return createInventorySnapshot({
    capturedAt: snapshot?.capturedAt,
    piles: {
      ...(snapshot?.piles || {}),
      unassigned: [...mergedExisting, ...additions],
    },
    capacities: snapshot?.capacities || {},
  });
}

export function selectionConsumesAllSignalRefs(selection, expectedRefs = []) {
  if (!expectedRefs.length) return true;
  const consumed = new Set((selection?.entries || [])
    .filter((entry) => entry.pileName === 'unassigned' && entrySignalRef(entry))
    .map((entry) => refKey(entrySignalRef(entry))));
  return expectedRefs.every((ref) => consumed.has(refKey(ref)));
}

export function selectedUnassignedSignalRefs(selection) {
  return (selection?.entries || [])
    .filter((entry) => entry.pileName === 'unassigned' && entrySignalRef(entry))
    .map((entry) => {
      const signal = entrySignalRef(entry);
      const item = entryItemRef(entry);
      return {
        id: Number(signal?.id || 0),
        definitionId: Number(signal?.definitionId || 0),
        duplicateId: Number(entry.signal?.duplicateId || signal?.duplicateId || item?.id || 0),
        pile: 'unassigned',
      };
    });
}

export function submittedUnassignedSignalRefs(selection, submittedItemRefs = []) {
  const submittedIds = new Set((submittedItemRefs || [])
    .map((ref) => Number(ref?.id || ref?.ref?.id || 0))
    .filter(Boolean));
  if (!submittedIds.size) return [];
  return selectedUnassignedSignalRefs(selection)
    .filter((ref) => submittedIds.has(Number(ref.duplicateId || 0)));
}

export function evaluateUnassignedSignalCoverage(selection, availableCount, capacity) {
  const available = Math.max(0, Number(availableCount || 0));
  const slotCapacity = Math.max(0, Number(capacity || 0));
  const expectedCount = Math.min(available, slotCapacity);
  const selectedCount = selectedUnassignedSignalRefs(selection).length;
  return {
    availableCount: available,
    capacity: slotCapacity,
    expectedCount,
    selectedCount,
    sufficient: expectedCount === 0 || selectedCount >= expectedCount,
  };
}
