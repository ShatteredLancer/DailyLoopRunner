import {
  createInventorySnapshot,
  createItemSnapshot,
  INVENTORY_PILES,
} from '../domain/contracts.js';

const MAX_DIAGNOSTIC_REASONS = 8;

function itemKey(item = {}) {
  const id = Number(item.id || item.ref?.id || 0);
  if (id) return `id:${id}`;
  const definitionId = Number(item.definitionId || item.ref?.definitionId || 0);
  if (!definitionId) return null;
  return `definition:${definitionId}:${String(item.pile || item.ref?.pile || 'unknown')}`;
}

function refMatchesItem(ref = {}, item = {}) {
  const id = Number(ref.id || 0);
  const definitionId = Number(ref.definitionId || 0);
  if (id) return id === Number(item.id || 0);
  return definitionId > 0 && definitionId === Number(item.definitionId || 0);
}

function normalizeReadiness(value = {}) {
  return Object.freeze({
    detected: value.detected === true,
    ready: value.ready !== false,
    fullyValidated: value.fullyValidated !== false,
    state: String(value.state || (value.ready === false ? 'not-ready' : 'ready')),
    cacheStatus: value.cacheStatus ? String(value.cacheStatus) : null,
  });
}

function normalizeClassification(item, value = {}) {
  const requiredSpecial = value.requiredSpecial === true
    ? true
    : value.requiredSpecial === false
      ? false
      : null;
  const special = item.special === true;
  return Object.freeze({
    requiredSpecial,
    otherSpecial: value.otherSpecial === true || (requiredSpecial === false && special),
    regular: value.regular === true || !special,
    provisionsReserve: value.provisionsReserve === true,
    protected: value.protected === true,
    protectionReasons: Object.freeze((value.protectionReasons || []).map(String).slice(0, MAX_DIAGNOSTIC_REASONS)),
  });
}

function criticalSignature(item = {}) {
  return JSON.stringify({
    definitionId: Number(item.definitionId || 0),
    rating: Number(item.rating || 0),
    duplicate: item.duplicate === true,
    duplicateId: Number(item.duplicateId || 0),
    special: item.special === true,
    rare: item.rare === true,
    tradeable: item.tradeable === true,
    limitedUse: item.limitedUse === true,
    concept: item.concept === true,
    evolution: item.evolution === true,
    academyEnrolled: item.academyEnrolled === true,
    activeTrade: item.activeTrade === true,
    groups: [...(item.groups || [])].map(Number).sort((a, b) => a - b),
  });
}

function cloneCapacity(capacity = {}, fallbackUsed = 0) {
  const max = capacity.max !== undefined && capacity.max !== null && Number.isFinite(Number(capacity.max))
    ? Number(capacity.max)
    : null;
  const used = capacity.used !== undefined && capacity.used !== null && Number.isFinite(Number(capacity.used))
    ? Number(capacity.used)
    : fallbackUsed;
  return { used, max, free: max === null ? null : Math.max(0, max - used) };
}

function readinessSignature(value = {}) {
  return JSON.stringify({
    detected: value.detected === true,
    ready: value.ready !== false,
    fullyValidated: value.fullyValidated !== false,
    state: String(value.state || ''),
    cacheStatus: value.cacheStatus ? String(value.cacheStatus) : null,
  });
}

function boundedReason(value) {
  return String(value || 'inventory reconciliation required').slice(0, 240);
}

export function createInventoryLedger(options = {}) {
  if (!options.snapshot?.piles) throw new TypeError('inventory snapshot is required');
  const now = options.now || (() => new Date().toISOString());
  const measureTime = options.measureTime || (() => Date.now());
  const classifyItem = typeof options.classifyItem === 'function' ? options.classifyItem : () => ({});
  let readiness = normalizeReadiness(options.readiness);
  let source = String(options.source || 'local-repository');
  let version = 0;
  let updatedAt = String(now());
  let needsReconciliation = false;
  let reconciliationReason = null;
  let lastBuild = null;
  const records = new Map();
  const keysByPile = Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, new Set()]));
  const keysByDefinition = new Map();
  const keysByRating = new Map();
  let capacities = {};

  function indexValue(index, value, key) {
    const keys = index.get(value) || new Set();
    keys.add(key);
    index.set(value, keys);
  }

  function unindexValue(index, value, key) {
    const keys = index.get(value);
    if (!keys) return;
    keys.delete(key);
    if (!keys.size) index.delete(value);
  }

  function classify(item, pile) {
    try {
      return normalizeClassification(item, classifyItem(item, { pile, readiness, source }) || {});
    } catch {
      return normalizeClassification(item, {});
    }
  }

  function insert(item, pile) {
    const snapshotItem = item?.ref
      ? Object.freeze({ ...item, pile, ref: Object.freeze({ ...item.ref, pile }) })
      : createItemSnapshot(item, pile);
    const key = itemKey(snapshotItem);
    if (!key) {
      return { ok: false, reason: 'inventory item has no stable identity' };
    }
    if (records.has(key)) return { ok: false, reason: `duplicate inventory identity ${key}` };
    const record = Object.freeze({
      key,
      pile,
      item: snapshotItem,
      classification: classify(snapshotItem, pile),
      signature: criticalSignature(snapshotItem),
    });
    records.set(key, record);
    keysByPile[pile].add(key);
    indexValue(keysByDefinition, Number(snapshotItem.definitionId || 0), key);
    indexValue(keysByRating, Number(snapshotItem.rating || 0), key);
    return { ok: true, record };
  }

  function remove(key) {
    const record = records.get(key);
    if (!record) return null;
    records.delete(key);
    keysByPile[record.pile].delete(key);
    unindexValue(keysByDefinition, Number(record.item.definitionId || 0), key);
    unindexValue(keysByRating, Number(record.item.rating || 0), key);
    return record;
  }

  function resolve(ref = {}, expectedPile = null) {
    const id = Number(ref.id || 0);
    if (id) {
      const record = records.get(`id:${id}`) || null;
      if (expectedPile && record?.pile !== expectedPile) return null;
      return record;
    }
    const definitionId = Number(ref.definitionId || 0);
    const matches = [...(keysByDefinition.get(definitionId) || [])]
      .map((key) => records.get(key))
      .filter((record) => record && (!expectedPile || record.pile === expectedPile));
    return matches.length === 1 ? matches[0] : null;
  }

  function rebuild(snapshot, metadata = {}) {
    const startedAt = measureTime();
    if (metadata.readiness) readiness = normalizeReadiness(metadata.readiness);
    if (metadata.source) source = String(metadata.source);
    records.clear();
    INVENTORY_PILES.forEach((pile) => keysByPile[pile].clear());
    keysByDefinition.clear();
    keysByRating.clear();
    needsReconciliation = false;
    reconciliationReason = null;
    const collisions = [];
    for (const pile of INVENTORY_PILES) {
      for (const item of snapshot.piles[pile] || []) {
        const inserted = insert(item, pile);
        if (!inserted.ok) collisions.push(inserted.reason);
      }
    }
    capacities = Object.fromEntries(INVENTORY_PILES.map((pile) => [
      pile,
      cloneCapacity(snapshot.capacities?.[pile], keysByPile[pile].size),
    ]));
    lastBuild = Object.freeze({
      itemCount: records.size,
      pileCounts: Object.freeze(Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, keysByPile[pile].size]))),
      collisionCount: collisions.length,
      elapsedMs: Math.max(0, Number(measureTime() - startedAt) || 0),
      source,
    });
    if (collisions.length) {
      needsReconciliation = true;
      reconciliationReason = boundedReason(`${collisions.length} duplicate inventory identity collision(s)`);
    }
  }

  function inventorySnapshot() {
    return createInventorySnapshot({
      capturedAt: updatedAt,
      piles: Object.fromEntries(INVENTORY_PILES.map((pile) => [
        pile,
        [...keysByPile[pile]].map((key) => records.get(key).item),
      ])),
      capacities,
    });
  }

  function classifiedEntries() {
    return Object.freeze([...records.values()].map((record) => Object.freeze({
      item: record.item,
      pile: record.pile,
      classification: record.classification,
    })));
  }

  function summary() {
    const classificationCounts = {
      requiredSpecial: 0,
      requiredSpecialUnknown: 0,
      otherSpecial: 0,
      regular: 0,
      provisionsReserve: 0,
      protected: 0,
    };
    for (const record of records.values()) {
      const value = record.classification;
      if (value.requiredSpecial === true) classificationCounts.requiredSpecial++;
      if (value.requiredSpecial === null && record.item.special) classificationCounts.requiredSpecialUnknown++;
      if (value.otherSpecial) classificationCounts.otherSpecial++;
      if (value.regular) classificationCounts.regular++;
      if (value.provisionsReserve) classificationCounts.provisionsReserve++;
      if (value.protected) classificationCounts.protected++;
    }
    return Object.freeze({
      inventoryVersion: version,
      itemCount: records.size,
      pileCounts: Object.freeze(Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, keysByPile[pile].size]))),
      capacities: Object.freeze(Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, Object.freeze({ ...capacities[pile] })]))),
      classificationCounts: Object.freeze(classificationCounts),
      readiness,
      source,
      needsReconciliation,
      reconciliationReason,
      updatedAt,
      lastBuild,
    });
  }

  function markReconciliationRequired(reason) {
    needsReconciliation = true;
    reconciliationReason = boundedReason(reason);
    return summary();
  }

  function validateItemRefs(refs = []) {
    const missing = [];
    const moved = [];
    const found = [];
    for (const ref of refs || []) {
      const record = resolve(ref);
      if (!record) {
        missing.push({ id: Number(ref?.id || 0), definitionId: Number(ref?.definitionId || 0), pile: String(ref?.pile || 'unknown') });
        continue;
      }
      if (INVENTORY_PILES.includes(ref?.pile) && record.pile !== ref.pile) {
        moved.push({ id: Number(ref?.id || 0), fromPile: String(ref.pile), toPile: record.pile });
      }
      found.push(record.item.ref);
    }
    return Object.freeze({ ok: !missing.length && !moved.length, found: Object.freeze(found), missing: Object.freeze(missing), moved: Object.freeze(moved) });
  }

  function applyDelta(delta = {}) {
    if (delta.status !== 'confirmed') {
      if (delta.status === 'ambiguous') markReconciliationRequired(delta.reason || `${delta.operation || 'inventory'} result is ambiguous`);
      return Object.freeze({ applied: false, inventoryVersion: version, reason: delta.reason || `delta status ${delta.status || 'unknown'}` });
    }
    const removalRecords = [];
    const movedRecords = [];
    const consumedKeys = new Set();
    for (const ref of delta.removals || []) {
      const record = resolve(ref, INVENTORY_PILES.includes(ref.pile) ? ref.pile : null);
      if (!record || consumedKeys.has(record.key)) {
        markReconciliationRequired(`confirmed ${delta.operation} removal does not match ledger`);
        return Object.freeze({ applied: false, inventoryVersion: version, reason: reconciliationReason });
      }
      consumedKeys.add(record.key);
      removalRecords.push(record);
    }
    for (const move of delta.moves || []) {
      if (!INVENTORY_PILES.includes(move.fromPile) || !INVENTORY_PILES.includes(move.toPile)) {
        markReconciliationRequired(`confirmed ${delta.operation} move has an unknown pile`);
        return Object.freeze({ applied: false, inventoryVersion: version, reason: reconciliationReason });
      }
      const record = resolve(move.itemRef, move.fromPile);
      if (!record || consumedKeys.has(record.key)) {
        markReconciliationRequired(`confirmed ${delta.operation} move does not match ledger`);
        return Object.freeze({ applied: false, inventoryVersion: version, reason: reconciliationReason });
      }
      consumedKeys.add(record.key);
      movedRecords.push({ record, toPile: move.toPile });
    }
    const futureKeys = new Set(records.keys());
    removalRecords.forEach((record) => futureKeys.delete(record.key));
    movedRecords.forEach(({ record }) => futureKeys.delete(record.key));
    for (const { record, toPile } of movedRecords) {
      const targetKey = itemKey({ ...record.item, pile: toPile, ref: { ...record.item.ref, pile: toPile } });
      if (!targetKey || futureKeys.has(targetKey)) {
        markReconciliationRequired(`confirmed ${delta.operation} move conflicts with ledger identity`);
        return Object.freeze({ applied: false, inventoryVersion: version, reason: reconciliationReason });
      }
      futureKeys.add(targetKey);
    }
    for (const addition of delta.additions || []) {
      if (!INVENTORY_PILES.includes(addition.pile)) {
        markReconciliationRequired(`confirmed ${delta.operation} addition has an unknown pile`);
        return Object.freeze({ applied: false, inventoryVersion: version, reason: reconciliationReason });
      }
      const key = itemKey(addition.item);
      if (!key || futureKeys.has(key)) {
        markReconciliationRequired(`confirmed ${delta.operation} addition conflicts with ledger identity`);
        return Object.freeze({ applied: false, inventoryVersion: version, reason: reconciliationReason });
      }
      futureKeys.add(key);
    }

    const usedDeltas = Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, 0]));
    removalRecords.forEach((record) => { usedDeltas[record.pile]--; });
    movedRecords.forEach(({ record, toPile }) => {
      usedDeltas[record.pile]--;
      usedDeltas[toPile]++;
    });
    for (const addition of delta.additions || []) usedDeltas[addition.pile]++;
    const previousCapacities = Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, { ...capacities[pile] }]));
    removalRecords.forEach((record) => remove(record.key));
    movedRecords.forEach(({ record }) => remove(record.key));
    for (const { record, toPile } of movedRecords) insert(record.item, toPile);
    for (const addition of delta.additions || []) insert(addition.item, addition.pile);
    for (const pile of INVENTORY_PILES) {
      const previous = previousCapacities[pile] || {};
      const confirmed = delta.capacities?.[pile];
      const derivedUsed = Math.max(0, Number(previous.used || 0) + usedDeltas[pile]);
      capacities[pile] = cloneCapacity({
        used: confirmed?.used ?? derivedUsed,
        max: confirmed?.max ?? previous.max,
      }, derivedUsed);
    }
    version++;
    updatedAt = String(delta.confirmedAt || now());
    needsReconciliation = false;
    reconciliationReason = null;
    return Object.freeze({
      applied: true,
      inventoryVersion: version,
      operation: String(delta.operation || 'unknown'),
      additions: (delta.additions || []).length,
      removals: removalRecords.length,
      moves: movedRecords.length,
    });
  }

  function compareSnapshot(snapshot) {
    const incoming = new Map();
    for (const pile of INVENTORY_PILES) {
      for (const item of snapshot.piles?.[pile] || []) incoming.set(itemKey(item), { item, pile, signature: criticalSignature(item) });
    }
    let added = 0;
    let removed = 0;
    let moved = 0;
    let changed = 0;
    for (const [key, record] of records) {
      const next = incoming.get(key);
      if (!next) removed++;
      else if (next.pile !== record.pile) moved++;
      else if (next.signature !== record.signature) changed++;
    }
    for (const key of incoming.keys()) if (!records.has(key)) added++;
    const capacityChanged = INVENTORY_PILES.some((pile) => {
      const next = cloneCapacity(snapshot.capacities?.[pile], snapshot.piles?.[pile]?.length || 0);
      const current = capacities[pile] || {};
      return next.used !== current.used || next.max !== current.max;
    });
    return Object.freeze({ added, removed, moved, changed, capacityChanged, drifted: Boolean(added || removed || moved || changed || capacityChanged) });
  }

  function reconcile(snapshot, metadata = {}) {
    if (!snapshot?.piles) return Object.freeze({ ok: false, reason: 'reconciliation snapshot is unavailable' });
    const nextReadiness = normalizeReadiness(metadata.readiness || readiness);
    const nextSource = String(metadata.source || source);
    if (!nextReadiness.ready) {
      markReconciliationRequired(`inventory source is ${nextReadiness.state}`);
      return Object.freeze({ ok: false, reason: reconciliationReason, drift: null });
    }
    const drift = compareSnapshot(snapshot);
    const metadataChanged = readinessSignature(readiness) !== readinessSignature(nextReadiness) || source !== nextSource;
    if (drift.drifted || needsReconciliation || metadataChanged) {
      rebuild(snapshot, { ...metadata, readiness: nextReadiness, source: nextSource });
      version++;
    } else {
      readiness = nextReadiness;
      source = nextSource;
    }
    updatedAt = String(now());
    if (lastBuild?.collisionCount) {
      return Object.freeze({ ok: false, inventoryVersion: version, reason: reconciliationReason, drift });
    }
    needsReconciliation = false;
    reconciliationReason = null;
    return Object.freeze({ ok: true, inventoryVersion: version, drift });
  }

  if (!readiness.ready) throw new Error(`inventory source is ${readiness.state}`);
  rebuild(options.snapshot, options);
  version = 1;

  return Object.freeze({
    applyDelta,
    classifiedEntries,
    compareSnapshot,
    inventorySnapshot,
    markReconciliationRequired,
    reconcile,
    resolveItem: (ref) => resolve(ref)?.item || null,
    summary,
    validateItemRefs,
  });
}
