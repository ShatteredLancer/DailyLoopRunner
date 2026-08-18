import { inventorySelectionRefs, removeInventorySelection } from '../inventory/snapshot-selection.js';

export const STORAGE_SINK_MAX_CLUB_FILL_PER_SQUAD = 3;

export function storageSinkSquadSourceStrategy(targetRating) {
  const rating = Number(targetRating || 0);
  if (rating === 89) {
    return {
      targetRating: 89,
      priorityPiles: ['unassigned', 'storage'],
      requirePrimaryUnassigned: true,
      maxClubCount: 0,
    };
  }
  if (rating === 88) {
    return {
      targetRating: 88,
      priorityPiles: ['storage', 'club'],
      requirePrimaryUnassigned: false,
      maxClubCount: STORAGE_SINK_MAX_CLUB_FILL_PER_SQUAD,
    };
  }
  return null;
}

export function genericStorageSinkSquadSourceStrategy(targetRating) {
  const rating = Number(targetRating || 0);
  if (!Number.isInteger(rating) || rating < 87 || rating > 99) return null;
  return {
    targetRating: rating,
    priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
    requirePrimaryUnassigned: true,
    maxClubCount: STORAGE_SINK_MAX_CLUB_FILL_PER_SQUAD,
  };
}

export function nextStorageSinkContext(contexts = []) {
  return [...contexts]
    .filter((context) => storageSinkSquadSourceStrategy(
      context?.targetRating || context?.model?.targetRating,
    ))
    .sort((left, right) => (
      Number(right?.targetRating || right?.model?.targetRating || 0)
        - Number(left?.targetRating || left?.model?.targetRating || 0)
    ))[0] || null;
}

function entryItemRef(entry = {}) {
  const item = entry.item?.ref || entry.item || {};
  return {
    id: Number(item.id || 0),
    definitionId: Number(item.definitionId || 0),
    pile: String(entry.pileName || item.pile || 'unknown'),
  };
}

function matchesRef(item = {}, ref = {}) {
  const source = item?.ref || item || {};
  const refSource = ref?.ref || ref || {};
  const refId = Number(refSource.id || 0);
  if (refId) return Number(source.id || 0) === refId;
  const definitionId = Number(refSource.definitionId || 0);
  return definitionId > 0 && Number(source.definitionId || 0) === definitionId;
}

export function prepareStorageSink89Candidates(entries = [], options = {}) {
  const maxRating = Math.max(1, Number(options.maxRating || 95) || 95);
  const primaryRefs = options.primaryRefs || [];
  const requiredEntries = entries.filter((entry) => (
    entry.pileName === 'unassigned'
      && entry.signal
      && Number(entry.item?.rating || 0) <= maxRating
      && primaryRefs.some((ref) => matchesRef(entry.signal, ref))
  ));
  const requiredIds = new Set(requiredEntries.map((entry) => Number(entry.item?.id || 0)));
  return {
    entries: entries.filter((entry) => (
      entry.pileName === 'storage'
        || (entry.pileName === 'unassigned' && requiredIds.has(Number(entry.item?.id || 0)))
    )),
    requiredEntries,
    requiredItems: requiredEntries.map(entryItemRef),
  };
}

export function prepareGenericStorageSinkCandidates(entries = [], options = {}) {
  const maxRating = Math.max(1, Number(options.maxRating || 95) || 95);
  const requiredPlayerCount = Math.max(1, Number(options.requiredPlayerCount || 11) || 11);
  const primaryRefs = options.primaryRefs || [];
  const requiredEntries = entries.filter((entry) => (
    entry.pileName === 'unassigned'
      && entry.signal
      && Number(entry.item?.rating || 0) <= maxRating
      && primaryRefs.some((ref) => matchesRef(entry.signal, ref))
  )).sort((left, right) => (
    Number(right.item?.rating || 0) - Number(left.item?.rating || 0)
      || Number(left.item?.id || 0) - Number(right.item?.id || 0)
  )).slice(0, requiredPlayerCount);
  const requiredIds = new Set(requiredEntries.map((entry) => Number(entry.item?.id || 0)));
  const clubIds = new Set((options.clubEntries || []).map((entry) => Number(entry.item?.id || 0)));
  return {
    entries: entries.filter((entry) => (
      ['storage', 'transfer'].includes(entry.pileName)
        || (entry.pileName === 'unassigned' && requiredIds.has(Number(entry.item?.id || 0)))
        || (entry.pileName === 'club' && clubIds.has(Number(entry.item?.id || 0)))
    )),
    requiredEntries,
    requiredItems: requiredEntries.map(entryItemRef),
  };
}

export function selectStorageSinkClubFallbackEntries(entries = [], options = {}) {
  const count = Math.max(0, Math.min(
    STORAGE_SINK_MAX_CLUB_FILL_PER_SQUAD,
    Math.floor(Number(options.count || 0)),
  ));
  const maxRating = Math.max(1, Number(options.maxRating || 95) || 95);
  return entries
    .filter((entry) => (
      entry.pileName === 'club'
        && entry.special !== true
        && Number(entry.item?.rating || 0) <= maxRating
    ))
    .sort((left, right) => (
      Number(right.item?.rating || 0) - Number(left.item?.rating || 0)
        || Number(left.item?.id || 0) - Number(right.item?.id || 0)
    ))
    .slice(0, count);
}

export function createStorageSinkClubFillRole(maxClubCount = 0) {
  return {
    id: 'storage-sink-club-fill',
    label: 'Club fill',
    piles: ['club'],
    minCount: 0,
    maxCount: Math.max(0, Math.floor(Number(maxClubCount || 0))),
  };
}

function targetRating(context = {}) {
  return Number(context.targetRating || context.model?.targetRating || 0);
}

function failure(reason, reasonCode, details = {}) {
  return { ok: false, reason, reasonCode, details };
}

function pileCountsFor(selection = {}) {
  return selection.plan?.pileCounts || selection.pileCounts || {};
}

function findRefPile(snapshot, ref) {
  for (const [pile, items] of Object.entries(snapshot?.piles || {})) {
    if ((items || []).some((item) => (
      ref.id
        ? Number(item?.id || item?.ref?.id || 0) === ref.id
        : Number(item?.definitionId || item?.ref?.definitionId || 0) === ref.definitionId
    ))) return pile;
  }
  return null;
}

export async function planMultiSquadRatingSelections(input = {}) {
  if (!input.snapshot?.piles) throw new TypeError('inventory snapshot is required');
  if (typeof input.selectChallenge !== 'function') throw new TypeError('selectChallenge is required');
  const contexts = [...(input.contexts || [])].sort((left, right) => (
    targetRating(right) - targetRating(left)
      || Number(right.challengeId || right.challenge?.id || 0) - Number(left.challengeId || left.challenge?.id || 0)
  ));
  if (!contexts.length) return failure('at least one squad context is required', 'MULTI_SQUAD_CONTEXT_MISSING');

  let snapshot = input.snapshot;
  const usedItemIds = new Set();
  const usedSignalIds = new Set();
  const usedDefinitionIds = new Set();
  const plans = [];
  const pileCounts = {};
  let storageItemsConsumed = 0;

  for (const [index, context] of contexts.entries()) {
    const selection = await input.selectChallenge(snapshot, context, { index, plans: [...plans] });
    if (!selection?.ok) {
      return failure(
        selection?.reason || selection?.missing?.reason || `rating ${targetRating(context)} squad is infeasible`,
        selection?.reasonCode || selection?.missing?.code || 'MULTI_SQUAD_INFEASIBLE',
        {
          failedIndex: index,
          targetRating: targetRating(context),
          completedPlans: plans.length,
          selectionMissing: selection?.missing || null,
          selectionPolicy: selection?.details?.policy || null,
          selectionDiagnostics: (selection?.diagnostics || []).slice(0, 1),
        },
      );
    }
    const refs = inventorySelectionRefs(selection, { includeSignals: true });
    const itemRefs = refs.filter((entry) => entry.kind === 'item').map((entry) => entry.ref);
    const signalRefs = refs.filter((entry) => entry.kind === 'signal').map((entry) => entry.ref);
    if (!itemRefs.length) {
      return failure('rating selection has no stable item references', 'MULTI_SQUAD_IDENTITY_UNAVAILABLE', {
        failedIndex: index,
        targetRating: targetRating(context),
      });
    }

    for (const ref of itemRefs) {
      if (ref.id && (usedItemIds.has(ref.id) || usedSignalIds.has(ref.id))) {
        return failure(`item #${ref.id} is reused across squad plans`, 'MULTI_SQUAD_IDENTITY_OVERLAP');
      }
      if (ref.definitionId && usedDefinitionIds.has(ref.definitionId)) {
        return failure(`definition #${ref.definitionId} is reused across squad plans`, 'MULTI_SQUAD_DEFINITION_OVERLAP');
      }
    }
    for (const ref of signalRefs) {
      if (ref.id && (usedSignalIds.has(ref.id) || usedItemIds.has(ref.id))) {
        return failure(`duplicate signal #${ref.id} is reused across squad plans`, 'MULTI_SQUAD_SIGNAL_OVERLAP');
      }
    }

    const nextSnapshot = removeInventorySelection(snapshot, selection, { includeSignals: true });
    if (!nextSnapshot) {
      return failure('rating selection could not be removed from the inventory snapshot', 'MULTI_SQUAD_SNAPSHOT_MISMATCH', {
        failedIndex: index,
        targetRating: targetRating(context),
      });
    }
    itemRefs.forEach((ref) => {
      if (ref.id) usedItemIds.add(ref.id);
      if (ref.definitionId) usedDefinitionIds.add(ref.definitionId);
      if (findRefPile(snapshot, ref) === 'storage') storageItemsConsumed++;
    });
    signalRefs.forEach((ref) => { if (ref.id) usedSignalIds.add(ref.id); });
    Object.entries(pileCountsFor(selection)).forEach(([pile, count]) => {
      pileCounts[pile] = (pileCounts[pile] || 0) + Number(count || 0);
    });
    plans.push({ context, selection, itemRefs, signalRefs });
    snapshot = nextSnapshot;
  }

  return {
    ok: true,
    plans,
    projectedSnapshot: snapshot,
    pileCounts,
    storageItemsConsumed,
    details: {
      squadCount: plans.length,
      challengeRatings: plans.map(({ context }) => targetRating(context)),
    },
  };
}

export function validateStorageSinkHeadroom(input = {}) {
  const currentFree = input.currentFree;
  const pendingStorageItems = Math.max(0, Number(input.pendingStorageItems || 0) || 0);
  const pickDuplicateReserve = Math.max(0, Number(input.pickDuplicateReserve ?? 1) || 0);
  const storageItemsConsumed = Math.max(0, Number(input.storageItemsConsumed || 0) || 0);
  const requiredFree = pendingStorageItems + pickDuplicateReserve;
  if (currentFree === null || currentFree === undefined || !Number.isFinite(Number(currentFree))) {
    return {
      ok: false,
      reason: 'Storage capacity is unknown; the two-squad Pick cannot be submitted safely',
      reasonCode: 'STORAGE_CAPACITY_UNKNOWN',
    };
  }
  const projectedFree = Math.max(0, Number(currentFree)) + storageItemsConsumed;
  if (projectedFree < requiredFree) {
    return {
      ok: false,
      reason: `${storageItemsConsumed} planned Storage card(s) would leave ${projectedFree} free slot(s), but ${requiredFree} are required for ${pendingStorageItems} pending card(s) and the Pick result`,
      reasonCode: 'STORAGE_SINK_HEADROOM_INSUFFICIENT',
      details: { currentFree: Number(currentFree), projectedFree, requiredFree, pendingStorageItems, pickDuplicateReserve },
    };
  }
  return {
    ok: true,
    currentFree: Number(currentFree),
    projectedFree,
    requiredFree,
    pendingStorageItems,
    pickDuplicateReserve,
  };
}

export function validateStorageRecoveryHeadroom(input = {}) {
  const currentFree = input.currentFree;
  const pendingStorageItems = Math.max(0, Number(input.pendingStorageItems || 0) || 0);
  const storageItemsConsumed = Math.max(0, Number(input.storageItemsConsumed || 0) || 0);
  if (currentFree === null || currentFree === undefined || !Number.isFinite(Number(currentFree))) {
    return {
      ok: false,
      reason: 'Storage capacity is unknown; emergency Provisions cannot prove that pending cards will fit',
      reasonCode: 'STORAGE_CAPACITY_UNKNOWN',
    };
  }
  const normalizedCurrentFree = Math.max(0, Number(currentFree));
  const projectedFree = normalizedCurrentFree + storageItemsConsumed;
  if (projectedFree < pendingStorageItems) {
    return {
      ok: false,
      reason: `${storageItemsConsumed} selected Storage card(s) would leave ${projectedFree} free slot(s), but ${pendingStorageItems} pending card(s) require Storage`,
      reasonCode: 'RECOVERY_STORAGE_HEADROOM_INSUFFICIENT',
      details: {
        currentFree: normalizedCurrentFree,
        projectedFree,
        requiredFree: pendingStorageItems,
        pendingStorageItems,
        storageItemsConsumed,
      },
    };
  }
  return {
    ok: true,
    currentFree: normalizedCurrentFree,
    projectedFree,
    requiredFree: pendingStorageItems,
    pendingStorageItems,
    storageItemsConsumed,
  };
}
