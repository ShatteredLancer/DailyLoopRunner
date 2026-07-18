import { createInventorySnapshot, createItemSnapshot } from '../domain/contracts.js';

function refKey(ref = {}) {
  const id = Number(ref?.id || 0);
  if (id) return `id:${id}`;
  return `definition:${Number(ref?.definitionId || 0)}:${String(ref?.pile || 'unassigned')}`;
}

function entrySignalRef(entry = {}) {
  return entry.signalRef || entry.signal?.ref || entry.signal || null;
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
