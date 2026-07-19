const MAX_BATCH_QUANTITY = 999;

function normalizedText(value) {
  return String(value || '').trim();
}

function normalizedPackId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizedQuantity(value) {
  return Math.max(1, Math.min(MAX_BATCH_QUANTITY, Math.floor(Number(value) || 1)));
}

export function batchOpenEntryKey(entry = {}) {
  const packId = normalizedPackId(entry.packId ?? entry.id);
  if (packId) return `id:${packId}`;
  const packName = normalizedText(entry.packName ?? entry.name).toLowerCase();
  return packName ? `name:${packName}` : '';
}

export function normalizeBatchOpenEntry(entry = {}) {
  const packId = normalizedPackId(entry.packId ?? entry.id);
  const packName = normalizedText(entry.packName ?? entry.name);
  if (!packId && !packName) return null;
  return Object.freeze({
    packId,
    packName,
    quantity: normalizedQuantity(entry.quantity),
  });
}

export function normalizeBatchOpenPlan(input = {}) {
  const entries = [];
  const indexes = new Map();
  for (const rawEntry of input?.entries || []) {
    const entry = normalizeBatchOpenEntry(rawEntry);
    if (!entry) continue;
    const key = batchOpenEntryKey(entry);
    if (!key) continue;
    if (indexes.has(key)) {
      entries[indexes.get(key)] = entry;
    } else {
      indexes.set(key, entries.length);
      entries.push(entry);
    }
  }
  return Object.freeze({ version: 1, entries: Object.freeze(entries) });
}

export function createBatchOpenAvailability(planInput = {}, snapshot = {}) {
  const plan = normalizeBatchOpenPlan(planInput);
  const groups = (snapshot?.groups || []).map((group) => ({
    packId: normalizedPackId(group.id ?? group.packId),
    packName: normalizedText(group.name ?? group.packName),
    available: Math.max(0, Math.floor(Number(group.count) || 0)),
  }));
  const byKey = new Map(groups.map((group) => [batchOpenEntryKey(group), group]));
  return plan.entries.map((entry) => Object.freeze({
    ...entry,
    available: byKey.get(batchOpenEntryKey(entry))?.available || 0,
  }));
}

