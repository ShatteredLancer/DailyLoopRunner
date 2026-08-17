import { isSamePlayerCardVersion } from '../domain/player-rarity.js';

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function entrySignal(entry = {}) {
  return entry.signal || entry.signalRef || null;
}

function entryItem(entry = {}) {
  return entry.item || entry.itemRef || null;
}

function itemPile(item = {}) {
  return String(item.pile || item.ref?.pile || 'unknown');
}

export function planUntradeableDuplicateSwaps({ selection = null, players = [] } = {}) {
  const playerById = new Map((players || [])
    .map((player) => [positiveId(player?.id || player?.ref?.id), player])
    .filter(([id]) => id));
  const swaps = [];
  const seenSignals = new Set();
  const seenTargets = new Set();

  for (const entry of selection?.entries || []) {
    if (String(entry?.pileName || '') !== 'unassigned') continue;
    const signal = entrySignal(entry);
    const plannedTarget = entryItem(entry);
    const signalId = positiveId(signal?.id || signal?.ref?.id);
    const targetId = positiveId(plannedTarget?.id || plannedTarget?.ref?.id);
    const target = playerById.get(targetId);
    if (!signalId || !targetId || !target) continue;
    if (signal?.tradeable === true || target?.tradeable !== true || itemPile(target) !== 'club') continue;
    if (!isSamePlayerCardVersion(signal, target)) continue;

    const duplicateId = positiveId(signal?.duplicateId || signal?.duplicateSignalId);
    if (!duplicateId) {
      return { ok: false, reason: 'duplicate target identity is missing', swaps: [] };
    }
    if (duplicateId !== targetId) {
      return { ok: false, reason: 'duplicate target identity changed', swaps: [] };
    }
    if (seenSignals.has(signalId) || seenTargets.has(targetId)) {
      return { ok: false, reason: 'duplicate swap plan reused an item identity', swaps: [] };
    }
    seenSignals.add(signalId);
    seenTargets.add(targetId);
    swaps.push({
      signalId,
      targetId,
      definitionId: positiveId(signal?.definitionId || signal?.ref?.definitionId),
    });
  }

  return { ok: true, swaps };
}

function failedResolution(reason) {
  return { ok: false, reason, replacements: [] };
}

export function resolveUntradeableDuplicateSwapIds(plan = {}, result = null) {
  const swaps = Array.isArray(plan?.swaps) ? plan.swaps : [];
  if (!swaps.length) return { ok: true, replacements: [] };
  if (result?.success !== true) return failedResolution('duplicate swap move failed');

  const clubDuplicates = result?.data?.clubDuplicates;
  const itemIds = result?.data?.itemIds;
  if (!Array.isArray(clubDuplicates) || !Array.isArray(itemIds)) {
    return failedResolution('duplicate swap response has no identity mapping');
  }
  if (!clubDuplicates.length || clubDuplicates.length !== itemIds.length) {
    return failedResolution('duplicate swap response mapping is incomplete');
  }

  const newIdByOldId = new Map();
  for (let index = 0; index < clubDuplicates.length; index++) {
    const oldId = positiveId(clubDuplicates[index]?.id ?? clubDuplicates[index]?.itemId ?? clubDuplicates[index]);
    const newItemId = positiveId(itemIds[index]);
    if (!oldId || !newItemId || newIdByOldId.has(oldId)) {
      return failedResolution('duplicate swap response contains invalid identities');
    }
    newIdByOldId.set(oldId, newItemId);
  }

  const replacements = [];
  for (const swap of swaps) {
    const newItemId = newIdByOldId.get(positiveId(swap.targetId));
    if (!newItemId) {
      return failedResolution(`duplicate swap response omitted selected Club item #${positiveId(swap.targetId) || '?'}`);
    }
    replacements.push({
      signalId: positiveId(swap.signalId),
      targetId: positiveId(swap.targetId),
      newItemId,
      definitionId: positiveId(swap.definitionId),
    });
  }
  return { ok: true, replacements };
}
