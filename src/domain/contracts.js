import {
  hasPlayerCosmetics,
  isPlayerEvolutionCard,
  readPlayerDatabaseId,
  readPlayerRareFlag,
} from './player-rarity.js';

export const INVENTORY_PILES = Object.freeze(['unassigned', 'storage', 'transfer', 'club']);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueNumbers(values = []) {
  return [...new Set((values || []).map(Number).filter((value) => Number.isFinite(value) && value > 0))];
}

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function createItemRef(item = {}, pile = item.pile || 'unknown') {
  return Object.freeze({
    id: finiteNumber(item.id),
    definitionId: finiteNumber(item.definitionId),
    pile: String(pile || 'unknown'),
  });
}

export function createItemSnapshot(item = {}, pile = item.pile || 'unknown') {
  const rating = finiteNumber(item.rating);
  const rareflag = readPlayerRareFlag(item);
  const groups = uniqueNumbers(item.groups);
  const tier = item.tier || (rating > 0 && rating <= 64 ? 'bronze' : rating >= 65 && rating <= 74 ? 'silver' : rating >= 75 ? 'gold' : null);
  const special = item.special === true || rareflag > 1;
  const rare = item.rare === true || rareflag > 0;
  return Object.freeze({
    ref: createItemRef(item, pile),
    id: finiteNumber(item.id),
    definitionId: finiteNumber(item.definitionId),
    databaseId: readPlayerDatabaseId(item),
    type: String(item.type || 'unknown'),
    name: String(item.name || item.commonName || item.lastName || item.definitionId || item.id || 'unknown'),
    rating,
    tier,
    rare,
    special,
    rareflag,
    duplicateSignal: item.duplicateSignal === true || item.duplicate === true || finiteNumber(item.duplicateId) > 0,
    duplicateSignalId: finiteNumber(item.duplicateSignalId || item.duplicateId),
    duplicate: item.duplicate === true || finiteNumber(item.duplicateId) > 0,
    duplicateId: finiteNumber(item.duplicateId),
    tradeable: item.tradeable === true,
    leagueId: finiteNumber(item.leagueId),
    identityIds: uniqueNumbers([item.id, item.definitionId, ...(item.identityIds || [])]),
    evolution: isPlayerEvolutionCard(item),
    cosmetic: hasPlayerCosmetics(item),
    limitedUse: item.limitedUse === true,
    concept: item.concept === true,
    academyEnrolled: item.academyEnrolled === true,
    activeTrade: item.activeTrade === true,
    endTime: item.endTime === undefined || item.endTime === null ? -1 : finiteNumber(item.endTime, -1),
    groups,
    pile: String(pile || 'unknown'),
  });
}

export function createInventorySnapshot(input = {}) {
  const piles = {};
  for (const pile of INVENTORY_PILES) {
    piles[pile] = Object.freeze((input.piles?.[pile] || []).map((item) =>
      item?.ref ? Object.freeze({ ...cloneSerializable(item), pile, ref: createItemRef(item.ref, pile) }) : createItemSnapshot(item, pile)
    ));
  }
  const capacities = {};
  for (const pile of INVENTORY_PILES) {
    const capacity = input.capacities?.[pile] || {};
    const explicitUsed = optionalFiniteNumber(capacity.used);
    const used = explicitUsed === null ? piles[pile].length : explicitUsed;
    const max = optionalFiniteNumber(capacity.max);
    capacities[pile] = Object.freeze({ used, max, free: max === null ? null : Math.max(0, max - used) });
  }
  return Object.freeze({
    version: 1,
    capturedAt: String(input.capturedAt || new Date().toISOString()),
    piles: Object.freeze(piles),
    capacities: Object.freeze(capacities),
  });
}

export function createInventoryDelta(input = {}) {
  const status = ['confirmed', 'ambiguous', 'rejected', 'planned'].includes(String(input.status))
    ? String(input.status)
    : 'ambiguous';
  const normalizeAddition = (entry = {}) => {
    const pile = String(entry.pile || entry.item?.pile || entry.item?.ref?.pile || 'unknown');
    const item = entry.item?.ref
      ? Object.freeze({ ...cloneSerializable(entry.item), pile, ref: createItemRef(entry.item.ref, pile) })
      : createItemSnapshot(entry.item || entry, pile);
    return Object.freeze({ pile, item });
  };
  const normalizeMove = (entry = {}) => Object.freeze({
    itemRef: createItemRef(entry.itemRef || entry.item || {}, entry.fromPile || entry.itemRef?.pile || 'unknown'),
    fromPile: String(entry.fromPile || entry.itemRef?.pile || 'unknown'),
    toPile: String(entry.toPile || 'unknown'),
  });
  const capacities = Object.fromEntries(Object.entries(input.capacities || {}).map(([pile, value]) => [
    String(pile),
    Object.freeze({
      used: optionalFiniteNumber(value?.used),
      max: optionalFiniteNumber(value?.max),
    }),
  ]));
  return Object.freeze({
    status,
    operation: String(input.operation || 'unknown'),
    additions: Object.freeze((input.additions || []).map(normalizeAddition)),
    removals: Object.freeze((input.removals || []).map((ref) => createItemRef(ref, ref?.pile || 'unknown'))),
    moves: Object.freeze((input.moves || []).map(normalizeMove)),
    capacities: Object.freeze(capacities),
    reason: input.reason ? String(input.reason) : null,
    confirmedAt: input.confirmedAt ? String(input.confirmedAt) : null,
    details: Object.freeze(cloneSerializable(input.details || {})),
  });
}

export function createSelectionPlan(input = {}) {
  return Object.freeze({
    ok: input.ok === true,
    mode: String(input.mode || 'requirements'),
    entries: Object.freeze(cloneSerializable(input.entries || [])),
    selected: Object.freeze(cloneSerializable(input.selected || [])),
    missing: cloneSerializable(input.missing ?? null),
    pileCounts: Object.freeze({ ...(input.pileCounts || {}) }),
    duplicateSignals: Object.freeze(cloneSerializable(input.duplicateSignals || [])),
    diagnostics: Object.freeze(cloneSerializable(input.diagnostics || [])),
    details: Object.freeze(cloneSerializable(input.details || {})),
  });
}

export function createSquadPlan(input = {}) {
  return Object.freeze({
    ok: input.ok === true,
    challengeRef: cloneSerializable(input.challengeRef ?? null),
    itemRefs: Object.freeze(cloneSerializable(input.itemRefs || [])),
    expectedPlayerCount: finiteNumber(input.expectedPlayerCount),
    validation: Object.freeze(cloneSerializable(input.validation || [])),
    source: String(input.source || 'inventory'),
  });
}

export function createSubmissionResult(input = {}) {
  return Object.freeze({
    status: String(input.status || 'blocked'),
    submitted: input.submitted === true,
    challengeRef: cloneSerializable(input.challengeRef ?? null),
    consumedItemRefs: Object.freeze(cloneSerializable(input.consumedItemRefs || [])),
    rewardPackId: input.rewardPackId === undefined || input.rewardPackId === null ? null : finiteNumber(input.rewardPackId),
    reason: input.reason ? String(input.reason) : null,
  });
}

export function createOpenPackReceipt(input = {}) {
  return Object.freeze({
    status: String(input.status || 'blocked'),
    packRef: cloneSerializable(input.packRef ?? null),
    openedItems: Object.freeze(cloneSerializable(input.openedItems || [])),
    reservedItemRefs: Object.freeze(cloneSerializable(input.reservedItemRefs || [])),
    routedItemRefs: Object.freeze(cloneSerializable(input.routedItemRefs || [])),
    pendingItemRefs: Object.freeze(cloneSerializable(input.pendingItemRefs || [])),
    attempts: Math.max(0, finiteNumber(input.attempts)),
    reason: input.reason ? String(input.reason) : null,
    details: Object.freeze(cloneSerializable(input.details || {})),
  });
}
