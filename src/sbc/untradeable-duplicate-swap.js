import {
  isSamePlayerCardVersion,
  readExplicitPlayerRareFlag,
} from '../domain/player-rarity.js';
import {
  createDuplicateCardValueFingerprint,
  duplicateCardValueFingerprintMatches,
} from '../inventory/duplicate-materialization-transaction.js';

export const DUPLICATE_SWAP_MODES = Object.freeze([
  'off',
  'special-only',
  'safe-only',
  'all-eligible',
]);

export const CONTROLLED_DUPLICATE_SWAP_MAX_PAIRS = 1;

export function normalizeDuplicateSwapMode(value, legacyEnabled = false) {
  const normalized = String(value || '').trim().toLowerCase();
  if (DUPLICATE_SWAP_MODES.includes(normalized)) return normalized;
  if (value !== undefined && value !== null && String(value).trim() !== '') return 'off';
  // A legacy boolean was an experimental opt-in with no scope. Preserve the
  // opt-in, but migrate it to the narrowest controlled mode instead of
  // silently re-enabling the old broad exchange behavior after an upgrade.
  return legacyEnabled === true ? 'special-only' : 'off';
}

function rawHolders(item = {}) {
  return [item, item?.ref, item?._data, item?.data, item?._staticData, item?.staticData]
    .filter((value) => value && typeof value === 'object');
}

function firstRawValue(item, fields) {
  for (const holder of rawHolders(item)) {
    for (const field of fields) {
      try {
        if (holder[field] !== undefined && holder[field] !== null) return holder[field];
      } catch { }
    }
  }
  return undefined;
}

function hasRawField(item, fields) {
  // EA's UTItemEntity exposes rating/rareflag and other values through
  // prototype getters. `hasOwnProperty` therefore reports a complete live
  // entity as incomplete even though the value is safely readable.
  return rawHolders(item).some((holder) => fields.some((field) => {
    try {
      return field in holder && holder[field] !== undefined;
    } catch {
      return false;
    }
  }));
}

export function readDuplicateCardTradeability(item = {}) {
  const direct = firstRawValue(item, ['tradeable', 'tradable']);
  if (typeof direct === 'boolean') return direct;
  const untradeable = firstRawValue(item, ['untradeable']);
  if (typeof untradeable === 'boolean') return !untradeable;
  try {
    if (typeof item?.isTradeable === 'function') {
      const value = item.isTradeable();
      if (typeof value === 'boolean') return value;
    }
  } catch { }
  try {
    if (typeof item?.isUntradeable === 'function') {
      const value = item.isUntradeable();
      if (typeof value === 'boolean') return !value;
    }
  } catch { }
  const untradeableCount = firstRawValue(item, ['untradeableCount']);
  if (untradeableCount !== undefined && Number.isFinite(Number(untradeableCount))) {
    return Number(untradeableCount) === 0;
  }
  return null;
}

export function readDuplicateSpecialClassification(item = {}, isSpecial) {
  if (typeof item?.duplicateSpecialKnown === 'boolean') {
    return item.duplicateSpecialKnown ? item.duplicateSpecial === true : null;
  }
  const explicitRareFlag = readExplicitPlayerRareFlag(item);
  if (explicitRareFlag !== null) return explicitRareFlag > 1;
  const explicitSpecial = firstRawValue(item, ['special']);
  if (typeof explicitSpecial === 'boolean') return explicitSpecial;
  try {
    if (typeof item?.isSpecial === 'function') {
      const value = item.isSpecial();
      if (typeof value === 'boolean') return value;
    }
  } catch { }
  if (typeof isSpecial === 'function') {
    try {
      const value = isSpecial(item);
      if (typeof value === 'boolean' && hasRawField(item, ['rareflag', 'rareFlag', 'special'])) {
        return value;
      }
    } catch { }
  }
  return null;
}

export function duplicateCardValueFingerprintIsComplete(item = {}) {
  if (typeof item?.duplicateFingerprintComplete === 'boolean') {
    return item.duplicateFingerprintComplete === true
      && item.duplicateFingerprintSource === 'live-ea';
  }
  if (item?.duplicateValueFingerprint && typeof item.duplicateValueFingerprint === 'object') {
    return false;
  }
  const evolutionKnown = hasRawField(item, [
    'evolution', 'isEvolution', 'isEvo', 'evolutionId', 'evoId',
    'evolutionLevel', 'evolutionStatus', 'upgrades',
  ]);
  const cosmeticsKnown = hasRawField(item, ['cosmetics', 'cosmetic']);
  const requiredFields = [
    ['definitionId', 'definitionID', 'defId'],
    ['rating', '_rating'],
    ['rareflag', 'rareFlag', '_rareflag'],
    ['chemistryStyle', 'chemStyle', 'styleId', 'playStyle'],
    ['preferredPosition', '_preferredPosition'],
    ['attributes'],
    ['skillMoves', '_skillMoves', 'skillmoves'],
    ['weakFoot', '_weakFoot', 'weakfoot'],
    ['groups'],
  ];
  return readDuplicateCardTradeability(item) !== null
    && evolutionKnown
    && cosmeticsKnown
    && requiredFields.every((fields) => hasRawField(item, fields));
}

function cardIsSpecial(item, isSpecial) {
  return readDuplicateSpecialClassification(item, isSpecial);
}

function duplicateSwapBaseIdentityMatches(source, target) {
  const sourceFingerprint = createDuplicateCardValueFingerprint(source);
  const targetFingerprint = createDuplicateCardValueFingerprint(target);
  if (!sourceFingerprint.definitionId
    || sourceFingerprint.definitionId !== targetFingerprint.definitionId) {
    return false;
  }
  if (sourceFingerprint.rating > 0
    && targetFingerprint.rating > 0
    && sourceFingerprint.rating !== targetFingerprint.rating) {
    return false;
  }
  if (sourceFingerprint.rareflag !== targetFingerprint.rareflag) return false;
  if (sourceFingerprint.databaseId > 0
    && targetFingerprint.databaseId > 0
    && sourceFingerprint.databaseId !== targetFingerprint.databaseId) {
    return false;
  }
  return true;
}

function emptyMutableValue(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function duplicateSwapSourceIsUnmodified(item) {
  const fingerprint = createDuplicateCardValueFingerprint(item);
  // 250 is EA's unmodified/default chemistry style. Other mutable fields are
  // represented explicitly by the live entity and are therefore safe to
  // reject without guessing at a card-specific base value.
  return fingerprint.evolution !== true
    && emptyMutableValue(fingerprint.upgrades)
    && emptyMutableValue(fingerprint.cosmetics)
    && fingerprint.cosmetic !== true
    && fingerprint.chemistryStyle === 250;
}

function duplicateSwapTargetHasKnownMutableValue(item) {
  const fingerprint = createDuplicateCardValueFingerprint(item);
  return fingerprint.evolution === true
    || !emptyMutableValue(fingerprint.upgrades)
    || !emptyMutableValue(fingerprint.cosmetics)
    || fingerprint.cosmetic === true
    || (fingerprint.chemistryStyle > 0 && fingerprint.chemistryStyle !== 250);
}

function duplicateSwapDirectionalValueMatch(source, target) {
  if (duplicateCardValueFingerprintMatches(source, target)) return true;
  if (!duplicateSwapSourceIsUnmodified(source)
    || !duplicateSwapTargetHasKnownMutableValue(target)) return false;

  const sourceFingerprint = createDuplicateCardValueFingerprint(source);
  const targetFingerprint = createDuplicateCardValueFingerprint(target);
  const mutableFields = new Set([
    'evolution',
    'upgrades',
    'cosmetics',
    'cosmetic',
    'chemistryStyle',
    'preferredPosition',
    'attributes',
    'skillMoves',
    'weakFoot',
    'groups',
  ]);
  const changedFields = [...new Set([
    ...Object.keys(sourceFingerprint),
    ...Object.keys(targetFingerprint),
  ])].filter((field) => (
    JSON.stringify(sourceFingerprint[field]) !== JSON.stringify(targetFingerprint[field])
  ));
  // A plain Unassigned source may replace a more valuable Club target. Any
  // identity/tradeability mismatch remains unsafe; the post-move validator
  // later proves that each value fingerprint stayed on its original entity.
  return changedFields.length > 0 && changedFields.every((field) => mutableFields.has(field));
}

export function evaluateDuplicateSwapEligibility({
  source = null,
  target = null,
  mode = 'off',
  isSpecial,
} = {}) {
  const normalizedMode = normalizeDuplicateSwapMode(mode);
  if (normalizedMode === 'off') {
    return { eligible: false, reason: 'duplicate swap mode is off' };
  }
  if (!source || !target) {
    return { eligible: false, reason: 'duplicate swap source or Club counterpart is missing' };
  }
  const sourceTradeable = readDuplicateCardTradeability(source);
  const targetTradeable = readDuplicateCardTradeability(target);
  if (sourceTradeable !== false) {
    return { eligible: false, reason: 'duplicate source must be confirmed untradeable' };
  }
  if (typeof targetTradeable !== 'boolean') {
    return { eligible: false, reason: 'duplicate Club counterpart tradeability is unknown' };
  }
  if (!duplicateSwapBaseIdentityMatches(source, target)) {
    return { eligible: false, reason: 'duplicate source and Club counterpart are different card versions' };
  }

  if (normalizedMode === 'all-eligible') return { eligible: true, mode: normalizedMode };

  // Controlled modes never exchange a tradeable Club card. A plain
  // Unassigned source may replace a value-modified Club counterpart, but the
  // source itself may not carry mutable value state. The native response and
  // the strict two-sided postcondition below are the evidence that the Club
  // value was displaced intact rather than consumed.
  if (targetTradeable !== false) {
    return { eligible: false, reason: 'controlled duplicate swaps require an untradeable Club counterpart' };
  }
  if (!duplicateCardValueFingerprintIsComplete(source)
    || !duplicateCardValueFingerprintIsComplete(target)) {
    return { eligible: false, reason: 'controlled duplicate swap value fingerprint is incomplete' };
  }
  if (!duplicateSwapDirectionalValueMatch(source, target)) {
    return { eligible: false, reason: 'controlled duplicate swap requires an unmodified Unassigned source' };
  }

  const sourceSpecial = cardIsSpecial(source, isSpecial);
  const targetSpecial = cardIsSpecial(target, isSpecial);
  if (sourceSpecial === null || targetSpecial === null) {
    return { eligible: false, reason: 'duplicate special-card classification is unknown' };
  }
  if (normalizedMode === 'special-only' && !(sourceSpecial && targetSpecial)) {
    return { eligible: false, reason: 'duplicate swap mode only permits special cards' };
  }
  if (normalizedMode === 'safe-only' && (sourceSpecial || targetSpecial)) {
    return { eligible: false, reason: 'safe duplicate swap mode excludes special cards' };
  }
  return { eligible: true, mode: normalizedMode };
}

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

export function planUntradeableDuplicateSwaps({
  selection = null,
  players = [],
  swapMode = 'off',
  isSpecial,
  maxPairs = null,
} = {}) {
  const playerById = new Map((players || [])
    .map((player) => [positiveId(player?.id || player?.ref?.id), player])
    .filter(([id]) => id));
  const swaps = [];
  const seenSignals = new Set();
  const seenTargets = new Set();

  const pairLimit = Number.isSafeInteger(Number(maxPairs)) && Number(maxPairs) > 0
    ? Number(maxPairs)
    : Number.POSITIVE_INFINITY;
  const normalizedMode = normalizeDuplicateSwapMode(swapMode);
  for (const entry of selection?.entries || []) {
    if (swaps.length >= pairLimit) break;
    if (String(entry?.pileName || '') !== 'unassigned') continue;
    const signal = entrySignal(entry);
    const plannedTarget = entryItem(entry);
    const signalId = positiveId(signal?.id || signal?.ref?.id);
    const targetId = positiveId(plannedTarget?.id || plannedTarget?.ref?.id);
    const target = playerById.get(targetId);
    if (!signalId || !targetId || !target) continue;
    if (signal?.tradeable === true || itemPile(target) !== 'club') continue;
    // Controlled/all-eligible modes may intentionally displace a Club card
    // whose mutable value state differs. The evaluator still enforces the
    // base identity and directional value rules; the old exact-version gate
    // is retained only while swaps are disabled.
    if (normalizedMode === 'off'
      ? !isSamePlayerCardVersion(signal, target)
      : !duplicateSwapBaseIdentityMatches(signal, target)) continue;
    if (readDuplicateCardTradeability(signal) !== false) {
      return { ok: false, reason: 'duplicate source tradeability is unknown', swaps: [] };
    }
    if (typeof readDuplicateCardTradeability(target) !== 'boolean') {
      return { ok: false, reason: 'duplicate Club counterpart tradeability is unknown', swaps: [] };
    }

    const eligibility = evaluateDuplicateSwapEligibility({
      source: signal,
      target,
      mode: swapMode,
      isSpecial,
    });
    if (!eligibility.eligible) {
      return { ok: false, reason: eligibility.reason, swaps: [] };
    }

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
  if (clubDuplicates.length !== swaps.length) {
    return failedResolution('duplicate swap response mapping count does not match the planned pair count');
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

function failedMaterialization(reason) {
  return { ok: false, reason };
}

export function validateUntradeableDuplicateSwapMaterialization({
  replacement = {},
  originalSignal = null,
  originalTarget = null,
  newClubItem = null,
  displacedTarget = null,
} = {}) {
  const signalId = positiveId(replacement.signalId);
  const targetId = positiveId(replacement.targetId);
  const newItemId = positiveId(replacement.newItemId);
  if (!signalId || !targetId || !newItemId || !originalSignal || !originalTarget) {
    return failedMaterialization('duplicate swap postcondition is missing an expected identity');
  }

  if (positiveId(newClubItem?.id || newClubItem?.ref?.id) !== newItemId) {
    return failedMaterialization(`duplicate swap Club item #${newItemId} was not materialized`);
  }
  if (itemPile(newClubItem) !== 'club') {
    return failedMaterialization(`duplicate swap replacement #${newItemId} materialized in ${itemPile(newClubItem)}, expected club`);
  }
  if (originalSignal?.tradeable !== false
    || !isSamePlayerCardVersion(originalSignal, newClubItem)
    || newClubItem?.tradeable !== false) {
    return failedMaterialization(`duplicate swap Club item #${newItemId} failed same-version untradeable validation`);
  }
  if (!duplicateCardValueFingerprintIsComplete(originalSignal)
    || !duplicateCardValueFingerprintIsComplete(newClubItem)
    || !duplicateCardValueFingerprintMatches(originalSignal, newClubItem)) {
    return failedMaterialization(`duplicate swap Club item #${newItemId} changed value fingerprint`);
  }

  if (!displacedTarget) {
    return failedMaterialization(`duplicate swap protected Club counterpart #${targetId} disappeared after move`);
  }
  if (positiveId(displacedTarget?.id || displacedTarget?.ref?.id) !== targetId) {
    return failedMaterialization(`duplicate swap displaced item identity changed from #${targetId}`);
  }
  if (itemPile(displacedTarget) !== 'unassigned') {
    return failedMaterialization(`duplicate swap protected Club counterpart #${targetId} moved to ${itemPile(displacedTarget)}, expected unassigned`);
  }
  if (!isSamePlayerCardVersion(originalTarget, displacedTarget)) {
    return failedMaterialization(`duplicate swap protected Club counterpart #${targetId} changed card version`);
  }
  if (typeof originalTarget?.tradeable !== 'boolean'
    || displacedTarget?.tradeable !== originalTarget.tradeable) {
    return failedMaterialization(`duplicate swap protected Club counterpart #${targetId} changed tradeability`);
  }
  if (!duplicateCardValueFingerprintIsComplete(originalTarget)
    || !duplicateCardValueFingerprintIsComplete(displacedTarget)
    || !duplicateCardValueFingerprintMatches(originalTarget, displacedTarget)) {
    return failedMaterialization(`duplicate swap protected Club counterpart #${targetId} changed value fingerprint`);
  }

  return {
    ok: true,
    signalId,
    targetId,
    newItemId,
  };
}
