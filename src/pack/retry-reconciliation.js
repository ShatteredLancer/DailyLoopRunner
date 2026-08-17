export const PACK_OPEN_RESPONSE_LOST = 'PACK_OPEN_RESPONSE_LOST';
export const PACK_OPEN_RESULT_AMBIGUOUS = 'PACK_OPEN_RESULT_AMBIGUOUS';

const FAILED_INSTANCE_UNSAFE_CODES = new Set([
  '471',
  'empty-result',
  'missing-items',
  'transport-error',
  'transport-timeout',
  'unknown',
]);

function packIdKey(packOrId) {
  const id = typeof packOrId === 'object'
    ? (packOrId?.id ?? packOrId?.packId ?? packOrId?.packDefinitionId ?? packOrId?.packAssetId)
    : packOrId;
  const numeric = Number(id);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : '';
}

function itemId(item) {
  const numeric = Number(item?.id ?? item?.itemId ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function uniqueSortedItemIds(piles = {}) {
  const ids = new Set();
  for (const pile of Object.values(piles || {})) {
    if (!Array.isArray(pile)) continue;
    for (const item of pile) {
      const id = itemId(item);
      if (id !== null) ids.add(id);
    }
  }
  return [...ids].sort((left, right) => left - right);
}

export function capturePackOpenRetrySnapshot(options = {}) {
  const packId = packIdKey(options.pack);
  const matchingPacks = (Array.isArray(options.packs) ? options.packs : [])
    .filter((candidate) => packId && packIdKey(candidate) === packId);
  return {
    packId,
    matchingPacks,
    packCount: matchingPacks.length,
    itemIds: uniqueSortedItemIds(options.piles),
    stable: options.stable !== false,
    stableReadCount: Math.max(1, Number(options.stableReadCount || 1) || 1),
  };
}

function sameValues(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameReferences(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value) => right.includes(value));
}

export function samePackOpenRetrySnapshot(left, right) {
  if (!left || !right) return false;
  return left.packId === right.packId
    && left.packCount === right.packCount
    && sameValues(left.itemIds || [], right.itemIds || [])
    && sameReferences(left.matchingPacks || [], right.matchingPacks || []);
}

function reconciliationEvidence(baseline, current) {
  const beforeIds = new Set(baseline?.itemIds || []);
  return {
    packCountBefore: Number(baseline?.packCount || 0),
    packCountAfter: Number(current?.packCount || 0),
    addedItemIds: (current?.itemIds || []).filter((id) => !beforeIds.has(id)),
    stable: current?.stable !== false,
    stableReadCount: Math.max(0, Number(current?.stableReadCount || 0) || 0),
  };
}

function blocked(reason, evidence) {
  return { action: 'blocked', reason, evidence };
}

export function decidePackOpenRetry(options = {}) {
  const code = String(options.code ?? '').trim();
  const failedPack = options.failedPack || null;
  const resolvedPack = options.resolvedPack || null;
  const baseline = options.baseline || null;
  const current = options.current || null;
  const evidence = reconciliationEvidence(baseline, current);

  if (!baseline || !current || !baseline.packId || baseline.packId !== current.packId) {
    return blocked(PACK_OPEN_RESULT_AMBIGUOUS, evidence);
  }
  if (!evidence.stable) return blocked(PACK_OPEN_RESULT_AMBIGUOUS, evidence);
  if (evidence.addedItemIds.length > 0) {
    return blocked(PACK_OPEN_RESPONSE_LOST, evidence);
  }
  if (evidence.packCountAfter < evidence.packCountBefore) {
    return blocked(
      evidence.packCountAfter > 0 ? PACK_OPEN_RESPONSE_LOST : PACK_OPEN_RESULT_AMBIGUOUS,
      evidence,
    );
  }
  if (evidence.packCountAfter !== evidence.packCountBefore) {
    return blocked(PACK_OPEN_RESULT_AMBIGUOUS, evidence);
  }

  const matchingPacks = current.matchingPacks || [];
  const failedPresent = matchingPacks.includes(failedPack);
  const resolvedFresh = resolvedPack !== failedPack
    && packIdKey(resolvedPack) === baseline.packId
    && matchingPacks.includes(resolvedPack)
    ? resolvedPack
    : null;
  const discoveredFresh = matchingPacks.find((candidate) => candidate !== failedPack) || null;
  const failedInstanceUnsafe = FAILED_INSTANCE_UNSAFE_CODES.has(code);

  if (!failedInstanceUnsafe && failedPresent) {
    return { action: 'retry', pack: failedPack, source: 'same-instance', evidence };
  }
  const freshPack = resolvedFresh || discoveredFresh;
  if (freshPack) {
    return { action: 'retry', pack: freshPack, source: 'fresh-instance', evidence };
  }
  return blocked(PACK_OPEN_RESULT_AMBIGUOUS, evidence);
}
