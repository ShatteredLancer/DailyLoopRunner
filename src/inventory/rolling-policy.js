function normalizedRating(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function itemRef(item = {}) {
  return item.ref || {
    id: Number(item.id || 0),
    definitionId: Number(item.definitionId || 0),
    pile: String(item.pile || 'unknown'),
  };
}

function submissionRef(item = {}) {
  const duplicateId = Number(item.duplicateId || 0);
  if (item.duplicate === true && duplicateId > 0) {
    return {
      id: duplicateId,
      definitionId: Number(item.definitionId || 0),
      pile: 'unknown',
    };
  }
  return itemRef(item);
}

function uniqueRefs(values = []) {
  const seen = new Set();
  const refs = [];
  for (const value of values || []) {
    const ref = value?.ref || value || {};
    const id = Number(ref.id || 0);
    const definitionId = Number(ref.definitionId || 0);
    if (!id && !definitionId) continue;
    const key = id ? `id:${id}` : `definition:${definitionId}:${String(ref.pile || 'unknown')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ id, definitionId, pile: String(ref.pile || 'unknown') });
  }
  return refs;
}

function diagnosticItem(item = {}, pile = null) {
  return {
    id: Number(item?.id || item?.ref?.id || 0),
    definitionId: Number(item?.definitionId || item?.ref?.definitionId || 0),
    pile: String(pile || item?.pile || item?.ref?.pile || 'unknown'),
    rating: normalizedRating(item?.rating),
    duplicate: item?.duplicate === true,
    duplicateId: Number(item?.duplicateId || 0),
    special: item?.special === true,
    rare: item?.rare === true,
    evolution: item?.evolution === true,
    name: String(item?.name || item?.displayName || '').slice(0, 80),
  };
}

export function diagnoseRollingInventoryRefs(refs = [], piles = {}) {
  const pileNames = ['unassigned', 'storage', 'transfer', 'club'];
  const normalizedPiles = Object.fromEntries(pileNames.map((pile) => [
    pile,
    Array.isArray(piles?.[pile]) ? piles[pile] : [],
  ]));
  const allEntries = pileNames.flatMap((pile) => normalizedPiles[pile].map((item) => ({ item, pile })));
  const normalizedRefs = uniqueRefs(refs);
  return normalizedRefs.map((ref) => {
    const exact = allEntries
      .filter(({ item }) => Number(item?.id || 0) === Number(ref.id || 0))
      .map(({ item, pile }) => diagnosticItem(item, pile));
    const sameDefinition = Number(ref.definitionId || 0)
      ? allEntries
        .filter(({ item }) => Number(item?.definitionId || 0) === Number(ref.definitionId || 0))
        .slice(0, 12)
        .map(({ item, pile }) => diagnosticItem(item, pile))
      : [];
    return {
      ref,
      exact,
      sameDefinition,
    };
  });
}

function refMatchesItem(ref = {}, item = {}) {
  const id = Number(ref?.id || 0);
  const definitionId = Number(ref?.definitionId || 0);
  return id
    ? id === Number(item?.id || item?.ref?.id || 0)
    : definitionId > 0 && definitionId === Number(item?.definitionId || item?.ref?.definitionId || 0);
}

function primarySelectionRef(item = {}) {
  const pile = String(item.pile || item.ref?.pile || 'unknown');
  return ['unassigned', 'transfer'].includes(pile) ? submissionRef(item) : itemRef(item);
}

function sortByRatingAndIdentity(left, right) {
  return normalizedRating(left?.rating) - normalizedRating(right?.rating)
    || Number(left?.id || left?.ref?.id || 0) - Number(right?.id || right?.ref?.id || 0);
}

function normalizedReserveRatings(value) {
  if (value === false) return [];
  const source = Array.isArray(value) ? value : [87, 88];
  return [...new Set(source
    .map(Number)
    .filter((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 99))]
    .sort((left, right) => left - right);
}

function storageMaintenanceItemRef(entry = {}) {
  return itemRef(entry.item || entry);
}

function isStorageMaintenancePlayer(entry = {}) {
  return String(entry.pile || entry.item?.pile || entry.item?.ref?.pile || '') === 'storage'
    && String(entry.item?.type || '') === 'player';
}

export function planRollingStorageMaintenance(input = {}) {
  const entries = input.ledger?.classifiedEntries?.() || input.entries || [];
  const protectedItems = uniqueRefs(input.protectedItems || []);
  const provisionsRequiredCount = Math.max(1, Number(input.provisionsRequiredCount || 4) || 4);
  const totwRequiredCount = Math.max(1, Number(input.totwRequiredCount || 11) || 11);
  const maxRating = Math.max(1, Math.min(99, Number(input.maxRating || 95) || 95));
  const eligible = entries.filter((entry) => {
    const rating = normalizedRating(entry.item?.rating);
    return isStorageMaintenancePlayer(entry)
      && rating > 0
      && rating <= maxRating
      && entry.classification?.requiredSpecial === false
      && entry.classification?.protected !== true
      && !protectedItems.some((ref) => refMatchesItem(ref, entry.item));
  });
  const provisionsEntries = eligible
    .filter(({ item }) => [87, 88].includes(normalizedRating(item?.rating)))
    .sort((left, right) => sortByRatingAndIdentity(left.item, right.item));
  const totwEntries = eligible
    .filter(({ item }) => {
      const rating = normalizedRating(item?.rating);
      return rating <= 86 || rating === 89;
    })
    .sort((left, right) => sortByRatingAndIdentity(right.item, left.item));
  const provisionsBatches = Math.floor(provisionsEntries.length / provisionsRequiredCount);
  const totwReady = totwEntries.length >= totwRequiredCount;
  const action = provisionsBatches > 0 ? 'provisions' : totwReady ? 'totw' : null;

  return {
    status: action ? 'ready' : 'idle',
    action,
    provisions: {
      eligible: provisionsEntries.length,
      requiredCount: provisionsRequiredCount,
      batches: provisionsBatches,
      nextBatchRefs: uniqueRefs(
        provisionsEntries.slice(0, provisionsRequiredCount).map(storageMaintenanceItemRef),
      ),
    },
    totw: {
      eligible: totwEntries.length,
      requiredCount: totwRequiredCount,
      ready: totwReady,
      candidateRefs: uniqueRefs(totwEntries.map(storageMaintenanceItemRef)),
    },
  };
}

export function createRollingRequiredSpecialSourceFilter(input = {}) {
  const constraintIndexes = [...new Set((input.constraintIndexes || [])
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0))];
  const isClubTotw = typeof input.isClubTotw === 'function'
    ? input.isClubTotw
    : () => false;
  return (entry = {}) => {
    if (String(entry.pileName || entry.item?.pile || entry.item?.ref?.pile || '') !== 'club') return true;
    const matchesRequiredSpecial = constraintIndexes.some((index) => (
      entry.requirementMatches?.[index] === true
    ));
    if (!matchesRequiredSpecial) return true;
    try { return isClubTotw(entry.item) === true; } catch { return false; }
  };
}

export function classifyRollingInventoryItem(item = {}, options = {}) {
  const rating = normalizedRating(item.rating);
  const duplicate = options.duplicate === true
    ? true
    : options.duplicate === false
      ? false
      : item.duplicate === true;
  const special = options.special === true
    ? true
    : options.special === false
      ? false
      : item.special === true;
  const protectionRating = Math.max(1, Number(options.protectionRating || 95) || 95);
  const requiredSpecial = options.requiredSpecial === true
    ? true
    : options.requiredSpecial === false
      ? false
      : null;
  const otherSpecial = special && requiredSpecial === false;
  const provisionsMinRating = Number(options.provisionsMinRating || 87) || 87;
  const provisionsMaxRating = Number(options.provisionsMaxRating || 88) || 88;
  const provisionsReserve = requiredSpecial === false
    && rating >= provisionsMinRating
    && rating <= provisionsMaxRating;
  const protectionReasons = [...new Set((options.protectionReasons || []).map(String).filter(Boolean))];
  if (duplicate && rating > protectionRating) {
    protectionReasons.push(`duplicate-rating-over-${protectionRating}`);
  }
  return {
    duplicate,
    special,
    requiredSpecial,
    otherSpecial,
    regular: !special,
    provisionsReserve,
    protected: protectionReasons.length > 0,
    protectionReasons,
  };
}

export function rollingDuplicateTargetProtectionReasons(item = {}, options = {}) {
  let duplicate = item?.duplicate === true;
  try {
    if (typeof options.isDuplicate === 'function') duplicate = options.isDuplicate(item) === true;
  } catch {
    return ['duplicate-target-unavailable'];
  }
  if (!duplicate) return [];

  const duplicateId = Number(item?.duplicateId || 0);
  if (!duplicateId) return ['duplicate-target-unavailable'];
  let target = null;
  try {
    target = options.resolveTarget?.(item, duplicateId) || null;
  } catch {
    return ['duplicate-target-unavailable'];
  }
  if (Number(target?.id || target?.ref?.id || 0) !== duplicateId) {
    return ['duplicate-target-unavailable'];
  }

  let reasons = [];
  try {
    reasons = options.protectionReasons?.(target) || [];
  } catch {
    return ['duplicate-target-protection-check-failed'];
  }
  return [...new Set(reasons.map((reason) => `duplicate-target-${String(reason)}`))];
}

export function planRollingOpenedItemRouting(items = [], options = {}) {
  const provisionsRequiredCount = Math.max(1, Number(options.provisionsRequiredCount || 4) || 4);
  const provisionsRecoveryAvailable = options.provisionsRecoveryAvailable !== false;
  const proactiveProvisionsEnabled = options.proactiveProvisionsEnabled === true;
  const storageFree = options.storageFree === null || options.storageFree === undefined
    ? null
    : Math.max(0, Number(options.storageFree) || 0);
  const entries = (items || []).map((item) => {
    const protectionReasons = [
      ...(options.protectionReasons?.(item) || []),
      ...(options.duplicateTargetProtectionReasons?.(item) || []),
    ];
    const classification = classifyRollingInventoryItem(item, {
      protectionRating: options.protectionRating,
      duplicate: typeof options.isDuplicate === 'function' ? options.isDuplicate(item) : undefined,
      special: typeof options.isSpecial === 'function' ? options.isSpecial(item) : undefined,
      requiredSpecial: options.isRequiredSpecial?.(item),
      provisionsMinRating: options.provisionsMinRating,
      provisionsMaxRating: options.provisionsMaxRating,
      protectionReasons,
    });
    return { item, classification };
  });
  const duplicates = entries.filter(({ classification }) => classification.duplicate === true);
  const requiredSpecialDuplicates = duplicates
    .filter(({ classification }) => classification.requiredSpecial === true)
    .sort((left, right) => sortByRatingAndIdentity(left.item, right.item));
  const usableRequiredSpecial = requiredSpecialDuplicates
    .filter(({ classification }) => !classification.protected);
  const keptRequiredSpecial = usableRequiredSpecial.slice(0, 1);
  const extraRequiredSpecial = usableRequiredSpecial.slice(1);
  const protectedDuplicates = duplicates.filter(({ classification }) => classification.protected);
  const provisionsReserve = duplicates.filter(({ classification }) => (
    classification.provisionsReserve && !classification.protected
  ));
  const immediateProvisionCount = provisionsRecoveryAvailable && proactiveProvisionsEnabled
    ? Math.floor(provisionsReserve.length / provisionsRequiredCount) * provisionsRequiredCount
    : 0;
  const provisionRecoveryEntries = provisionsReserve.slice(0, immediateProvisionCount);
  const storedProvisionEntries = proactiveProvisionsEnabled
    ? provisionsReserve.slice(immediateProvisionCount)
    : [];
  const storageEntries = [...new Set([
    ...protectedDuplicates,
    ...extraRequiredSpecial,
    ...storedProvisionEntries,
  ])];
  const storageEntrySet = new Set(storageEntries);
  const reservedPrimaryDuplicates = duplicates.filter((entry) => (
    !storageEntrySet.has(entry)
      && entry.classification.requiredSpecial !== true
      && (!entry.classification.provisionsReserve || !proactiveProvisionsEnabled)
      && !entry.classification.protected
  ));
  const reservedEntries = [...keptRequiredSpecial, ...reservedPrimaryDuplicates];
  const directClubEntries = entries.filter(({ classification }) => classification.duplicate !== true);
  const storageBlocked = storageEntries.length > 0
    && (storageFree === null || storageEntries.length > storageFree);

  return {
    status: storageBlocked ? 'blocked' : 'ready',
    reason: storageBlocked
      ? `SBC storage has ${storageFree === null ? 'an unknown number of' : storageFree} free slot(s), but ${storageEntries.length} protected/reserved item(s) require storage`
      : null,
    reasonCode: storageBlocked ? 'PROTECTED_STORAGE_BLOCKED' : null,
    entries,
    directClubItems: directClubEntries.map(({ item }) => item),
    storageItems: storageEntries.map(({ item }) => item),
    provisionsItems: provisionRecoveryEntries.map(({ item }) => item),
    reservedItems: reservedEntries.map(({ item }) => item),
    pendingItems: storageBlocked ? storageEntries.map(({ item }) => item) : [],
    counts: {
      opened: entries.length,
      duplicates: duplicates.length,
      directClub: directClubEntries.length,
      requiredSpecial: requiredSpecialDuplicates.length,
      keptRequiredSpecial: keptRequiredSpecial.length,
      extraRequiredSpecial: extraRequiredSpecial.length,
      provisionsReserve: provisionsReserve.length,
      provisionsImmediate: provisionRecoveryEntries.length,
      protectedDuplicates: protectedDuplicates.length,
      primaryDuplicates: reservedPrimaryDuplicates.length,
      storageRequired: storageEntries.length,
      storageFree,
    },
  };
}

export function createRollingPrimarySelectionPolicy(input = {}) {
  const entries = input.ledger?.classifiedEntries?.() || input.entries || [];
  const reserveRatings = normalizedReserveRatings(input.reserveRatings);
  const protectProvisionsReserve = reserveRatings.length > 0;
  const primaryDuplicateRefs = uniqueRefs(input.primaryDuplicateRefs || []);
  const relaxedPrimaryDuplicateRefs = uniqueRefs(input.relaxedPrimaryDuplicateRefs || []);
  const isRelaxedPrimaryDuplicate = (item) => relaxedPrimaryDuplicateRefs.some((ref) => refMatchesItem(ref, item));
  // Unassigned/Transfer duplicates are temporary EA signals. Their duplicateId
  // points at the real submission entity, which may otherwise be hard-protected
  // because that entity still lives in Club. The signal authorizes that entity
  // for the current primary SBC only; high-rated/protected signals stay blocked.
  const authorizedTransientRefs = uniqueRefs(entries
    .filter(({ item, classification }) => (
      ['unassigned', 'transfer'].includes(String(item?.pile || item?.ref?.pile || ''))
        && item?.duplicate === true
        && classification?.protected !== true
    ))
    .flatMap(({ item }) => {
      const duplicateId = Number(item?.duplicateId || 0);
      return duplicateId
        ? [{ id: duplicateId, definitionId: Number(item?.definitionId || 0) }]
        : [];
    }));
  const isAuthorizedTransientEntity = (item) => authorizedTransientRefs.some((ref) => refMatchesItem(ref, item));
  const primaryDuplicates = entries.filter(({ item, classification }) => {
    const routedPrimaryDuplicate = primaryDuplicateRefs.some((ref) => refMatchesItem(ref, item));
    return item.duplicate === true
      && classification.protected !== true
      && (classification.provisionsReserve !== true || !protectProvisionsReserve)
      && (routedPrimaryDuplicate || (
        classification.requiredSpecial !== true
          && (item.special !== true || classification.requiredSpecial === false)
      ));
  });
  const requiredItems = primaryDuplicates
    .filter(({ item }) => {
      const routedPrimaryDuplicate = primaryDuplicateRefs.some((ref) => refMatchesItem(ref, item));
      return routedPrimaryDuplicate
        ? !isRelaxedPrimaryDuplicate(item)
        : String(item.pile || item.ref?.pile || '') === 'unassigned';
    })
    .map(({ item }) => (
      primaryDuplicateRefs.some((ref) => refMatchesItem(ref, item))
        ? primarySelectionRef(item)
        : submissionRef(item)
    ));
  const preferredItems = primaryDuplicates
    .filter(({ item }) => !isRelaxedPrimaryDuplicate(item))
    .map(({ item }) => (
      primaryDuplicateRefs.some((ref) => refMatchesItem(ref, item))
        ? primarySelectionRef(item)
        : submissionRef(item)
    ));
  const relaxedPrimaryItems = primaryDuplicates
    .filter(({ item }) => isRelaxedPrimaryDuplicate(item))
    .map(({ item }) => primarySelectionRef(item));
  const protectedItems = entries
    .filter(({ item, classification }) => (
      classification.protected === true && !isAuthorizedTransientEntity(item)
    ))
    .map(({ item }) => itemRef(item));
  const specialConstraints = (input.model?.constraints || [])
    .map((constraint, index) => ({ constraint, index }))
    .filter(({ constraint }) => (
      (constraint.source === 'ea' && constraint.keyName === 'PLAYER_RARITY_GROUP')
        || constraint.id === 'runner-required-special'
    ));
  const exclusiveRoles = specialConstraints.map(({ constraint, index }, roleIndex) => ({
    id: roleIndex === 0 ? 'required-special' : `required-special-${roleIndex + 1}`,
    label: constraint.label || 'Required Special',
    constraintIndex: index,
    minCount: Number(constraint.count || 0),
    maxCount: Number(constraint.count || 0),
  }));

  return {
    requiredItems: uniqueRefs(requiredItems),
    preferredItems: uniqueRefs(preferredItems),
    relaxedPrimaryDuplicateRefs,
    protectedItems: uniqueRefs([...protectedItems, ...relaxedPrimaryItems]),
    exclusiveRoles,
    maxOrdinaryRating: Math.max(1, Number(input.protectionRating || 95) || 95),
    protectionPolicy: {
      reserveRatings,
      softProtectSpecialPiles: ['club'],
      allowSoftProtectedFallback: true,
      allowOtherSpecialAsOrdinary: true,
      liveRequirementsAvailable: exclusiveRoles.length > 0
        && exclusiveRoles.every((role) => role.minCount === 1 && role.maxCount === 1),
    },
  };
}

export function rollingPrimaryDuplicateRelaxationOrder(input = {}) {
  const entries = input.ledger?.classifiedEntries?.() || input.entries || [];
  const primaryDuplicateRefs = uniqueRefs(input.primaryDuplicateRefs || []);
  return entries
    .filter(({ item, classification }) => (
      primaryDuplicateRefs.some((ref) => refMatchesItem(ref, item))
        && classification.protected !== true
        && classification.requiredSpecial !== true
    ))
    .sort((left, right) => (
      normalizedRating(right.item?.rating) - normalizedRating(left.item?.rating)
        || Number(right.item?.id || right.item?.ref?.id || 0) - Number(left.item?.id || left.item?.ref?.id || 0)
    ))
    .map(({ item }) => primaryDuplicateRefs.find((ref) => refMatchesItem(ref, item)))
    .filter(Boolean);
}

export function validateRollingPrimaryDuplicateIdentity(input = {}) {
  const refs = uniqueRefs(input.primaryDuplicateRefs || []);
  const missingRefs = refs.filter((ref) => !input.ledger?.resolveItem?.(ref));
  if (!missingRefs.length) return { ok: true, refs, missingRefs: [] };
  return {
    ok: false,
    refs,
    missingRefs,
    reason: `${missingRefs.length} reserved primary duplicate identity reference(s) are no longer available`,
    reasonCode: 'PRIMARY_DUPLICATE_IDENTITY_CHANGED',
  };
}

export function releaseRollingPrimaryDuplicateRefs(primaryRefs = [], releasedRefs = []) {
  const refs = uniqueRefs(primaryRefs);
  const released = uniqueRefs(releasedRefs);
  const remainingRefs = refs.filter((ref) => (
    !released.some((releasedRef) => refMatchesItem(releasedRef, ref))
  ));
  return {
    refs: remainingRefs,
    releasedRefs: refs.filter((ref) => (
      !remainingRefs.some((remaining) => refMatchesItem(remaining, ref))
    )),
  };
}

export function releaseRollingRoutingItemsAfterConsumption(routing = null, consumedRefs = []) {
  if (!routing || typeof routing !== 'object') {
    return { routing, removedItemCount: 0, removedByField: {} };
  }
  const refs = uniqueRefs(consumedRefs);
  if (!refs.length) {
    return { routing, removedItemCount: 0, removedByField: {} };
  }
  const matchesConsumed = (item) => refs.some((ref) => refMatchesItem(ref, item));
  const removedKeys = new Set();
  const removedByField = {};
  const next = { ...routing };
  for (const field of ['storageItems', 'pendingItems', 'provisionsItems', 'reservedItems']) {
    if (!Array.isArray(routing[field])) continue;
    const removed = routing[field].filter(matchesConsumed);
    next[field] = routing[field].filter((item) => !matchesConsumed(item));
    removedByField[field] = removed.length;
    removed.forEach((item) => {
      const ref = itemRef(item);
      removedKeys.add(ref.id ? `id:${ref.id}` : `definition:${ref.definitionId}`);
    });
  }
  if (Array.isArray(routing.entries)) {
    const removed = routing.entries.filter((entry) => matchesConsumed(entry?.item));
    next.entries = routing.entries.filter((entry) => !matchesConsumed(entry?.item));
    removedByField.entries = removed.length;
    removed.forEach((entry) => {
      const ref = itemRef(entry.item);
      removedKeys.add(ref.id ? `id:${ref.id}` : `definition:${ref.definitionId}`);
    });
  }
  return {
    routing: next,
    removedItemCount: removedKeys.size,
    removedByField,
  };
}

export function createRollingRecoveryProtection(input = {}) {
  const entries = input.ledger?.classifiedEntries?.() || input.entries || [];
  const additionalProtected = uniqueRefs(input.protectedItems || []);
  const transientCounterparts = uniqueRefs(entries
    .filter(({ item }) => additionalProtected.some((ref) => refMatchesItem(ref, item)))
    .flatMap(({ item }) => {
      const duplicateId = Number(item?.duplicateId || 0);
      return duplicateId > 0
        ? [{ id: duplicateId, definitionId: Number(item?.definitionId || 0), pile: 'unknown' }]
        : [];
    }));
  const hardProtected = entries
    .filter(({ classification }) => (
      !classification
        || (classification.requiredSpecial === true && input.allowRequiredSpecial !== true)
        || classification?.protected === true
    ))
    .map(({ item }) => itemRef(item));
  const clubOtherSpecial = entries
    .filter(({ item, pile, classification }) => (
      String(pile || item?.pile || item?.ref?.pile || '') === 'club'
        && classification?.otherSpecial === true
        && classification?.requiredSpecial !== true
        && classification?.protected !== true
    ))
    .map(({ item }) => itemRef(item));
  const protectedItems = uniqueRefs([
    ...hardProtected,
    ...additionalProtected,
    ...transientCounterparts,
  ]);

  return {
    protectedItems,
    protectedItemIds: protectedItems.map((ref) => Number(ref.id || 0)).filter(Boolean),
    protectedDefinitionIds: protectedItems
      .filter((ref) => !Number(ref.id || 0))
      .map((ref) => Number(ref.definitionId || 0))
      .filter(Boolean),
    softProtectedItems: uniqueRefs(clubOtherSpecial),
  };
}

export function createRollingRatingRecoverySelectionPolicy(input = {}) {
  const protection = createRollingRecoveryProtection(input);
  return {
    requiredItems: uniqueRefs(input.requiredItems || []),
    preferredItems: uniqueRefs(input.preferredItems || []),
    protectedItems: protection.protectedItems,
    exclusiveRoles: [...(input.exclusiveRoles || [])],
    maxOrdinaryRating: Math.max(1, Number(
      input.maxOrdinaryRating || input.protectionRating || 95,
    ) || 95),
    protectionPolicy: {
      reserveRatings: normalizedReserveRatings(input.reserveRatings),
      softProtectSpecialPiles: ['club'],
      allowSoftProtectedFallback: input.allowSoftProtectedFallback !== false,
      allowOtherSpecialAsOrdinary: true,
      liveRequirementsAvailable: true,
    },
  };
}
