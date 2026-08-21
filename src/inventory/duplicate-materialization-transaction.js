const TRANSACTION_STATUSES = new Set([
  'planned',
  'materialized',
  'submission-confirmed',
  'recovery-required',
  'ambiguous',
  'completed',
]);

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function itemId(value = {}) {
  return positiveId(value.id || value.ref?.id);
}

function definitionId(value = {}) {
  return positiveId(value.definitionId || value.ref?.definitionId);
}

function itemPile(value = {}, fallback = 'unknown') {
  return String(value.pile || value.ref?.pile || fallback || 'unknown');
}

function itemRef(value = {}, pile = null) {
  return Object.freeze({
    id: itemId(value),
    definitionId: definitionId(value),
    pile: itemPile(value, pile || 'unknown'),
  });
}

function stableValue(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object' || depth >= 5) return null;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((entry) => stableValue(entry, depth + 1, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (typeof entry === 'function' || key.startsWith('on')) continue;
    result[key] = stableValue(entry, depth + 1, seen);
  }
  seen.delete(value);
  return result;
}

function firstDefined(values = [], fallback = null) {
  return values.find((value) => value !== undefined && value !== null) ?? fallback;
}

function rawHolders(item = {}) {
  return [item, item?._data, item?.data, item?._staticData, item?.staticData]
    .filter((value) => value && typeof value === 'object');
}

function readRaw(item, fields, fallback = null) {
  for (const holder of rawHolders(item)) {
    for (const field of fields) {
      if (holder[field] !== undefined && holder[field] !== null) return holder[field];
    }
  }
  return fallback;
}

export function createDuplicateCardValueFingerprint(item = {}) {
  const upgrades = readRaw(item, ['upgrades'], null);
  const cosmetics = readRaw(item, ['cosmetics'], null);
  const groups = firstDefined([item.groups, item._data?.groups], []);
  return Object.freeze({
    definitionId: definitionId(item),
    databaseId: positiveId(readRaw(item, ['databaseId', 'databaseID'], 0)),
    rating: Number(readRaw(item, ['rating', '_rating'], 0)) || 0,
    rareflag: Number(readRaw(item, ['rareflag', 'rareFlag', '_rareflag'], 0)) || 0,
    tradeable: item.tradeable === true || item.tradable === true || item.untradeable === false,
    evolution: item.evolution === true
      || upgrades !== null
      || positiveId(readRaw(item, ['evolutionId', 'evoId'], 0)) > 0,
    upgrades: stableValue(upgrades),
    cosmetics: stableValue(cosmetics),
    chemistryStyle: Number(readRaw(item, ['playStyle', 'chemistryStyle', 'chemStyle', 'styleId'], 0)) || 0,
    loyaltyBonus: Number(readRaw(item, ['loyaltyBonus'], 0)) || 0,
    preferredPosition: Number(readRaw(item, ['preferredPosition', '_preferredPosition'], 0)) || 0,
    attributes: stableValue(readRaw(item, ['attributes'], [])),
    skillMoves: Number(readRaw(item, ['skillMoves', '_skillMoves'], 0)) || 0,
    weakFoot: Number(readRaw(item, ['weakFoot', '_weakFoot'], 0)) || 0,
    groups: Object.freeze([...(Array.isArray(groups) ? groups : [])].map(Number).sort((a, b) => a - b)),
  });
}

export function duplicateCardValueFingerprintMatches(left = {}, right = {}) {
  return JSON.stringify(createDuplicateCardValueFingerprint(left))
    === JSON.stringify(createDuplicateCardValueFingerprint(right));
}

function transactionPair(input = {}) {
  const sourceSignalRef = itemRef(input.sourceSignalRef || input.sourceSignal, 'unassigned');
  const protectedCounterpartRef = itemRef(
    input.protectedCounterpartRef || input.protectedCounterpart,
    'club',
  );
  if (!sourceSignalRef.id || !protectedCounterpartRef.id || !sourceSignalRef.definitionId) {
    throw new TypeError('duplicate materialization pair requires exact source and counterpart identities');
  }
  if (sourceSignalRef.id === protectedCounterpartRef.id) {
    throw new TypeError('duplicate materialization source and counterpart must be different instances');
  }
  if (sourceSignalRef.definitionId !== protectedCounterpartRef.definitionId) {
    throw new TypeError('duplicate materialization pair must use the same definition');
  }
  return Object.freeze({
    sourceSignalRef,
    protectedCounterpartRef,
    sourceFingerprint: Object.freeze(input.sourceFingerprint
      ? stableValue(input.sourceFingerprint)
      : createDuplicateCardValueFingerprint(input.sourceSignal || input.sourceSignalRef)),
    counterpartFingerprint: Object.freeze(input.counterpartFingerprint
      ? stableValue(input.counterpartFingerprint)
      : createDuplicateCardValueFingerprint(
        input.protectedCounterpart || input.protectedCounterpartRef,
      )),
    materializedConsumeRef: input.materializedConsumeRef
      ? itemRef(input.materializedConsumeRef, 'club')
      : null,
    displacedProtectedRef: input.displacedProtectedRef
      ? itemRef(input.displacedProtectedRef, 'unassigned')
      : null,
  });
}

function freezeTransaction(input = {}) {
  const status = TRANSACTION_STATUSES.has(String(input.status)) ? String(input.status) : 'planned';
  return Object.freeze({
    schemaVersion: 1,
    transactionId: String(input.transactionId || ''),
    challengeRef: Object.freeze({
      setId: positiveId(input.challengeRef?.setId || input.challengeRef?.set?.id),
      challengeId: positiveId(input.challengeRef?.challengeId || input.challengeRef?.challenge?.id),
    }),
    beforeInventoryVersion: Math.max(0, Number(input.beforeInventoryVersion) || 0),
    afterInventoryVersion: Math.max(0, Number(input.afterInventoryVersion) || 0),
    status,
    createdAt: String(input.createdAt || new Date().toISOString()),
    updatedAt: String(input.updatedAt || input.createdAt || new Date().toISOString()),
    reason: input.reason ? String(input.reason) : null,
    pairs: Object.freeze((input.pairs || []).map(transactionPair)),
  });
}

export function createDuplicateMaterializationTransaction(input = {}) {
  const transaction = freezeTransaction({ ...input, status: 'planned' });
  if (!transaction.transactionId) throw new TypeError('duplicate materialization transactionId is required');
  if (!transaction.pairs.length) throw new TypeError('duplicate materialization transaction requires a pair');
  const ids = transaction.pairs.flatMap((pair) => [pair.sourceSignalRef.id, pair.protectedCounterpartRef.id]);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('duplicate materialization transaction reused an item identity');
  }
  return transaction;
}

export function materializeDuplicateTransaction(transaction = {}, input = {}) {
  if (transaction.status !== 'planned') {
    return { ok: false, reason: `duplicate materialization transaction is ${transaction.status || 'invalid'}` };
  }
  const replacements = Array.isArray(input.replacements) ? input.replacements : [];
  if (replacements.length !== transaction.pairs.length) {
    return { ok: false, reason: 'duplicate materialization replacement count changed' };
  }
  const replacementBySource = new Map(replacements.map((entry) => [positiveId(entry.signalId), entry]));
  const materializedPairs = [];
  for (const pair of transaction.pairs) {
    const replacement = replacementBySource.get(pair.sourceSignalRef.id);
    const materializedConsume = input.resolveItem?.(positiveId(replacement?.newItemId), 'club') || null;
    const displacedProtected = input.resolveItem?.(pair.protectedCounterpartRef.id, 'unassigned') || null;
    if (!replacement || positiveId(replacement.targetId) !== pair.protectedCounterpartRef.id) {
      return { ok: false, reason: `duplicate materialization mapping changed for source #${pair.sourceSignalRef.id}` };
    }
    if (itemId(materializedConsume) !== positiveId(replacement.newItemId)
      || itemPile(materializedConsume) !== 'club') {
      return { ok: false, reason: `materialized consume item #${positiveId(replacement.newItemId) || '?'} is not in Club` };
    }
    if (definitionId(materializedConsume) !== pair.sourceSignalRef.definitionId
      || !duplicateCardValueFingerprintMatches(pair.sourceFingerprint, materializedConsume)) {
      return { ok: false, reason: `materialized consume item #${itemId(materializedConsume)} changed value identity` };
    }
    if (itemId(displacedProtected) !== pair.protectedCounterpartRef.id
      || itemPile(displacedProtected) !== 'unassigned') {
      return { ok: false, reason: `protected counterpart #${pair.protectedCounterpartRef.id} is not displaced to Unassigned` };
    }
    if (!duplicateCardValueFingerprintMatches(pair.counterpartFingerprint, displacedProtected)) {
      return { ok: false, reason: `protected counterpart #${pair.protectedCounterpartRef.id} changed value identity` };
    }
    materializedPairs.push({
      ...pair,
      materializedConsumeRef: itemRef(materializedConsume, 'club'),
      displacedProtectedRef: itemRef(displacedProtected, 'unassigned'),
    });
  }
  const afterInventoryVersion = Math.max(0, Number(input.afterInventoryVersion) || 0);
  if (transaction.beforeInventoryVersion && afterInventoryVersion <= transaction.beforeInventoryVersion) {
    return { ok: false, reason: 'duplicate materialization did not advance the inventory version' };
  }
  return {
    ok: true,
    transaction: freezeTransaction({
      ...transaction,
      status: 'materialized',
      pairs: materializedPairs,
      afterInventoryVersion,
      updatedAt: input.updatedAt,
    }),
  };
}

export function duplicateTransactionConsumeRefs(transaction = {}) {
  if (transaction.status !== 'materialized') return [];
  return transaction.pairs.map((pair) => pair.materializedConsumeRef).filter(Boolean);
}

export function duplicateTransactionProtectedRefs(transaction = {}) {
  return (transaction.pairs || []).map((pair) => (
    pair.displacedProtectedRef || pair.protectedCounterpartRef
  ));
}

export function duplicateTransactionAuthorizesItem(transaction = {}, item = {}) {
  const id = itemId(item);
  const defId = definitionId(item);
  return transaction.status === 'materialized'
    && transaction.pairs.some((pair) => (
      pair.materializedConsumeRef?.id === id
        && pair.materializedConsumeRef?.definitionId === defId
    ));
}

export function validateDuplicateMaterializationState(transaction = {}, input = {}) {
  if (transaction.status !== 'materialized') {
    return { ok: false, reason: `duplicate materialization transaction is ${transaction.status || 'invalid'}` };
  }
  const inventoryVersion = Math.max(0, Number(input.inventoryVersion) || 0);
  if (transaction.afterInventoryVersion && inventoryVersion
    && transaction.afterInventoryVersion !== inventoryVersion) {
    return { ok: false, reason: 'duplicate materialization inventory version changed before replanning' };
  }
  for (const pair of transaction.pairs || []) {
    const consume = input.resolveItem?.(pair.materializedConsumeRef?.id, 'club') || null;
    const protectedCard = input.resolveItem?.(pair.displacedProtectedRef?.id, 'unassigned') || null;
    if (itemId(consume) !== pair.materializedConsumeRef?.id
      || definitionId(consume) !== pair.materializedConsumeRef?.definitionId
      || itemPile(consume) !== 'club'
      || !duplicateCardValueFingerprintMatches(pair.sourceFingerprint, consume)) {
      return { ok: false, reason: `materialized consume item #${pair.materializedConsumeRef?.id || '?'} changed before replanning` };
    }
    if (itemId(protectedCard) !== pair.displacedProtectedRef?.id
      || definitionId(protectedCard) !== pair.displacedProtectedRef?.definitionId
      || itemPile(protectedCard) !== 'unassigned'
      || !duplicateCardValueFingerprintMatches(pair.counterpartFingerprint, protectedCard)) {
      return { ok: false, reason: `protected counterpart #${pair.displacedProtectedRef?.id || '?'} changed before replanning` };
    }
  }
  return { ok: true };
}

export function validateDuplicateProtectedRestoration(transaction = {}, input = {}) {
  if (!['submission-confirmed', 'completed'].includes(transaction.status)) {
    return { ok: false, reason: `duplicate materialization transaction is ${transaction.status || 'invalid'}` };
  }
  for (const pair of transaction.pairs || []) {
    const protectedCard = input.resolveItem?.(pair.protectedCounterpartRef.id, 'club') || null;
    if (itemId(protectedCard) !== pair.protectedCounterpartRef.id
      || definitionId(protectedCard) !== pair.protectedCounterpartRef.definitionId
      || itemPile(protectedCard) !== 'club'
      || !duplicateCardValueFingerprintMatches(pair.counterpartFingerprint, protectedCard)) {
      return { ok: false, reason: `protected counterpart #${pair.protectedCounterpartRef.id} was not restored unchanged to Club` };
    }
  }
  return { ok: true };
}

function exactRecoveryItem(transactionPairValue, ref, fingerprint, input = {}) {
  const item = input.resolveItem?.(positiveId(ref?.id)) || null;
  if (!item) return { ok: false, missing: true, item: null, pile: null };
  const exact = itemId(item) === positiveId(ref?.id)
    && definitionId(item) === positiveId(ref?.definitionId);
  const valueIdentity = exact && duplicateCardValueFingerprintMatches(fingerprint, item);
  return {
    ok: exact && valueIdentity,
    missing: false,
    item,
    pile: itemPile(item),
    pair: transactionPairValue,
    exact,
    valueIdentity,
  };
}

export function planDuplicateMaterializationRecovery(transaction = {}, input = {}) {
  if (!transaction?.transactionId || !Array.isArray(transaction.pairs) || !transaction.pairs.length) {
    return { ok: false, action: 'block', reason: 'duplicate materialization journal is invalid' };
  }
  if (transaction.status === 'completed') return { ok: true, action: 'clear' };

  const states = transaction.pairs.map((pair) => ({
    pair,
    source: exactRecoveryItem(pair, pair.sourceSignalRef, pair.sourceFingerprint, input),
    consume: pair.materializedConsumeRef
      ? exactRecoveryItem(pair, pair.materializedConsumeRef, pair.sourceFingerprint, input)
      : null,
    counterpart: exactRecoveryItem(
      pair,
      pair.displacedProtectedRef || pair.protectedCounterpartRef,
      pair.counterpartFingerprint,
      input,
    ),
  }));
  const changedValueIdentity = states.some(({ source, consume, counterpart }) => (
    [source, consume, counterpart].filter(Boolean).some((state) => !state.missing && !state.ok)
  ));
  if (changedValueIdentity) {
    return {
      ok: false,
      action: 'block',
      reason: 'a duplicate materialization journal item changed value identity',
    };
  }

  if (transaction.status === 'planned') {
    const untouched = states.every(({ source, counterpart }) => (
      source.ok && source.pile === 'unassigned'
        && counterpart.ok && counterpart.pile === 'club'
    ));
    if (untouched) return { ok: true, action: 'clear' };
    const displaced = states.every(({ counterpart }) => (
      counterpart.ok && counterpart.pile === 'unassigned'
    ));
    return displaced
      ? { ok: true, action: 'restore-ambiguous' }
      : { ok: false, action: 'block', reason: 'planned duplicate materialization journal has ambiguous inventory state' };
  }

  if (transaction.status === 'submission-confirmed') {
    const displaced = states.every(({ counterpart }) => (
      counterpart.ok && counterpart.pile === 'unassigned'
    ));
    if (displaced) return { ok: true, action: 'restore-confirmed' };
    const restored = states.every(({ counterpart }) => (
      counterpart.ok && counterpart.pile === 'club'
    ));
    return restored
      ? { ok: true, action: 'clear' }
      : { ok: false, action: 'block', reason: 'confirmed duplicate counterpart restoration is ambiguous' };
  }

  if (['materialized', 'recovery-required', 'ambiguous'].includes(transaction.status)) {
    const swapped = states.every(({ consume, counterpart }) => (
      consume?.ok && consume.pile === 'club'
        && counterpart.ok && counterpart.pile === 'unassigned'
    ));
    if (swapped) return { ok: true, action: 'rollback' };
    const restored = states.every(({ consume, counterpart }) => (
      consume?.ok && consume.pile === 'unassigned'
        && counterpart.ok && counterpart.pile === 'club'
    ));
    if (restored && transaction.status === 'materialized') return { ok: true, action: 'clear' };
    const protectedDisplaced = states.every(({ counterpart }) => (
      counterpart.ok && counterpart.pile === 'unassigned'
    ));
    if (protectedDisplaced) return { ok: true, action: 'restore-ambiguous' };
    return {
      ok: false,
      action: 'block',
      reason: 'duplicate materialization submission outcome is ambiguous',
    };
  }

  return {
    ok: false,
    action: 'block',
    reason: `duplicate materialization journal has unsupported status ${transaction.status || 'unknown'}`,
  };
}

export function createDuplicateSubmissionManifest(input = {}) {
  const transaction = input.transaction || {};
  const expectedRefs = (input.players || []).map((item) => itemRef(item));
  const expectedIds = expectedRefs.map((ref) => ref.id);
  if (!expectedIds.length || expectedIds.some((id) => !id) || new Set(expectedIds).size !== expectedIds.length) {
    return { ok: false, reason: 'duplicate submission manifest requires unique exact player identities' };
  }
  const requiredRefs = duplicateTransactionConsumeRefs(transaction);
  const protectedRefs = duplicateTransactionProtectedRefs(transaction);
  if (requiredRefs.some((ref) => !expectedIds.includes(ref.id))) {
    return { ok: false, reason: 'replanned squad does not contain every materialized consume item' };
  }
  if (protectedRefs.some((ref) => expectedIds.includes(ref.id))) {
    return { ok: false, reason: 'replanned squad contains a protected displaced counterpart' };
  }
  return {
    ok: true,
    manifest: Object.freeze({
      transactionId: String(transaction.transactionId || ''),
      inventoryVersion: Math.max(0, Number(input.inventoryVersion) || 0),
      expectedRefs: Object.freeze(expectedRefs),
      requiredRefs: Object.freeze(requiredRefs),
      protectedRefs: Object.freeze(protectedRefs),
    }),
  };
}

export function validateDuplicateSubmissionManifest(manifest = {}, players = [], options = {}) {
  const actualRefs = players.map((item) => itemRef(item));
  const actualIds = actualRefs.map((ref) => ref.id);
  const expectedIds = (manifest.expectedRefs || []).map((ref) => positiveId(ref.id));
  const inventoryVersion = Math.max(0, Number(options.inventoryVersion) || 0);
  if (manifest.inventoryVersion && inventoryVersion && manifest.inventoryVersion !== inventoryVersion) {
    return { ok: false, reason: 'duplicate submission inventory version changed after replanning' };
  }
  if (actualIds.length !== expectedIds.length
    || actualIds.some((id) => !id)
    || [...actualIds].sort((a, b) => a - b).some((id, index) => id !== [...expectedIds].sort((a, b) => a - b)[index])) {
    return { ok: false, reason: 'saved squad identities differ from the duplicate submission manifest' };
  }
  for (const required of manifest.requiredRefs || []) {
    const actual = actualRefs.find((ref) => ref.id === positiveId(required.id));
    if (!actual || actual.definitionId !== positiveId(required.definitionId)) {
      return { ok: false, reason: `saved squad is missing materialized consume item #${positiveId(required.id) || '?'}` };
    }
  }
  for (const protectedRef of manifest.protectedRefs || []) {
    if (actualIds.includes(positiveId(protectedRef.id))) {
      return { ok: false, reason: `saved squad contains protected counterpart #${positiveId(protectedRef.id)}` };
    }
  }
  return { ok: true, actualRefs };
}

export function transitionDuplicateMaterializationTransaction(transaction = {}, status, options = {}) {
  if (!TRANSACTION_STATUSES.has(String(status))) throw new TypeError(`invalid duplicate transaction status ${status}`);
  return freezeTransaction({
    ...transaction,
    status,
    reason: options.reason,
    updatedAt: options.updatedAt,
  });
}
