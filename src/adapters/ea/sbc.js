export function createEaSbcAdapter(runtime) {
  const service = runtime?.services?.SBC;
  if (!service) throw new Error('EA SBC service is unavailable');

  function collectionValues(collection) {
    if (!collection) return [];
    if (typeof collection.values === 'function') return Array.from(collection.values());
    if (Array.isArray(collection._collection)) return collection._collection;
    if (collection._collection && typeof collection._collection === 'object') return Object.values(collection._collection);
    if (Array.isArray(collection)) return collection;
    if (typeof collection === 'object') return Object.values(collection);
    return [];
  }

  function listSets() {
    return collectionValues(service?.repository?.sets?._collection);
  }

  function requestSets() {
    if (typeof service.requestSets !== 'function') throw new Error('EA SBC set request is unavailable');
    return service.requestSets();
  }

  function requestChallengesForSet(set) {
    if (typeof service.requestChallengesForSet !== 'function') {
      throw new Error('EA SBC challenge request is unavailable');
    }
    return service.requestChallengesForSet(set);
  }

  function loadChallenge(challenge) {
    if (typeof service.loadChallenge !== 'function') throw new Error('EA SBC challenge load is unavailable');
    return service.loadChallenge(challenge);
  }

  function hasDaoGetChallengesForSet() {
    return typeof service?.sbcDAO?.getChallengesForSet === 'function';
  }

  function getChallengesForSet(setId) {
    if (!hasDaoGetChallengesForSet()) throw new Error('EA SBC challenge DAO is unavailable');
    return service.sbcDAO.getChallengesForSet(Number(setId || 0));
  }

  function hasDaoLoadChallenge() {
    return typeof service?.sbcDAO?.loadChallenge === 'function';
  }

  function loadDaoChallenge(challengeId, inProgress = false) {
    if (!hasDaoLoadChallenge()) throw new Error('EA SBC challenge DAO loader is unavailable');
    return service.sbcDAO.loadChallenge(Number(challengeId || 0), inProgress === true);
  }

  function formation(formationId) {
    try { return runtime?.repositories?.Squad?.getFormation?.(formationId) || null; } catch { return null; }
  }

  function createSquadController() {
    if (typeof runtime?.UTSBCSquadSplitViewController !== 'function') {
      throw new Error('EA SBC squad controller is unavailable');
    }
    return new runtime.UTSBCSquadSplitViewController();
  }

  function eligibilityKeyName(key) {
    const keyText = String(key ?? '').trim();
    const known = Object.entries(runtime?.SBCEligibilityKey || {}).find(([, value]) => String(value) === keyText);
    if (known) return known[0];
    if (/^[A-Z][A-Z0-9_]+$/.test(keyText)) return keyText;
    return `UNKNOWN_${keyText || '?'}`;
  }

  function firstRequirementKey(requirement) {
    if (requirement?.key !== undefined && requirement?.key !== null) return requirement.key;
    try {
      const key = requirement?.getFirstKey?.();
      if (key !== undefined && key !== null) return key;
    } catch { }
    const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
    return Object.keys(collection)[0];
  }

  function flattenValues(value) {
    if (Array.isArray(value)) return value.flat(Infinity).filter((entry) => entry !== undefined && entry !== null);
    if (value === undefined || value === null) return [];
    return [value];
  }

  function requirementValues(requirement, key) {
    const normalized = flattenValues(requirement?.values);
    if (normalized.length) return normalized;
    try {
      const values = flattenValues(requirement?.getValue?.(key));
      if (values.length) return values;
    } catch { }
    const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
    const direct = flattenValues(collection?.[key]);
    if (direct.length) return direct;
    try { return flattenValues(requirement?.getFirstValue?.(key)); } catch { return []; }
  }

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function finiteNumberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function firstPositiveInteger(values = []) {
    for (const value of values) {
      const number = positiveInteger(value);
      if (number) return number;
    }
    return null;
  }

  function staticItemData(item) {
    try { return item?.getStaticData?.() || item?._staticData || item?.staticData || {}; } catch { return item?._staticData || {}; }
  }

  function isPlayerPickItem(item) {
    try { return item?.isPlayerPickItem?.() === true; } catch { return false; }
  }

  function metadataFieldHints(value) {
    if (!value || typeof value !== 'object') return { keys: [], prototypeKeys: [], values: {} };
    let keys = [];
    let prototypeKeys = [];
    try { keys = Object.getOwnPropertyNames(value).sort().slice(0, 80); } catch { }
    try {
      const prototype = Object.getPrototypeOf(value);
      prototypeKeys = Object.getOwnPropertyNames(prototype || {})
        .filter((key) => key !== 'constructor' && /(pick|choice|select|count|amount|option|resource|definition|asset|item)/i.test(key))
        .sort()
        .slice(0, 40);
    } catch { }
    const values = {};
    for (const key of keys) {
      if (!/(pick|choice|select|count|amount|option|resource|definition|asset|item|name|description|id)/i.test(key)) continue;
      let field;
      try { field = value[key]; } catch { continue; }
      if (!['string', 'number', 'boolean'].includes(typeof field)) continue;
      values[key] = typeof field === 'string' ? field.slice(0, 160) : field;
    }
    return { keys, prototypeKeys, values };
  }

  function normalizeDiscoveryReward(award) {
    const item = award?.item || award?.utItem || award?.data?.item || null;
    if (!item || !isPlayerPickItem(item)) return null;
    const staticData = staticItemData(item);
    const definitionId = firstPositiveInteger([
      item?.definitionId,
      item?._data?.definitionId,
      staticData?.definitionId,
    ]);
    const itemId = positiveInteger(item?.id);
    return {
      type: 'PLAYER_PICK',
      name: String(item?.name || staticData?.name || staticData?.description || '').trim(),
      description: String(item?.description || staticData?.description || '').trim(),
      resourceId: firstPositiveInteger([
        item?.resourceId,
        item?._data?.resourceId,
        staticData?.resourceId,
        itemId && definitionId && itemId === definitionId ? itemId : null,
      ]),
      definitionId,
      candidateCount: firstPositiveInteger([
        item?.candidateCount,
        item?.totalCandidates,
        item?.numberOfChoices,
        item?.numChoices,
        staticData?.candidateCount,
        staticData?.totalCandidates,
        staticData?.numberOfChoices,
        staticData?.numChoices,
      ]),
      selectionCount: firstPositiveInteger([
        item?.selectionCount,
        item?.availablePicks,
        item?.numberToSelect,
        staticData?.selectionCount,
        staticData?.availablePicks,
        staticData?.numberToSelect,
      ]),
      metadataHints: {
        award: metadataFieldHints(award),
        item: metadataFieldHints(item),
        data: metadataFieldHints(item?._data || item?.data),
        staticData: metadataFieldHints(staticData),
      },
    };
  }

  function normalizeDiscoveryPackReward(award) {
    const item = award?.item || award?.utItem || award?.data?.item || null;
    if (item && isPlayerPickItem(item)) return null;
    const typeText = String(
      award?.type || award?.rewardType || award?.awardType || award?.kind || award?.data?.type || ''
    ).trim().toUpperCase();
    const packId = firstPositiveInteger([
      award?.packId,
      award?.packDefinitionId,
      award?.packAssetId,
      award?.value,
      award?.data?.packId,
      award?.data?.value,
    ]);
    let isPack = /PACK/.test(typeText);
    try { isPack = isPack || award?.isPack?.() === true || award?.isPack === true; } catch { }
    if (!isPack && packId && !item && !/COIN|CURRENCY|ITEM|PLAYER/i.test(typeText)) isPack = true;
    if (!isPack) return null;
    return {
      type: 'PACK',
      name: String(
        award?.name || award?.displayName || award?.description || award?.data?.name || award?.data?.description || ''
      ).trim(),
      description: String(award?.description || award?.data?.description || '').trim(),
      packId,
      resourceId: firstPositiveInteger([award?.resourceId, award?.data?.resourceId, packId]),
      definitionId: firstPositiveInteger([award?.definitionId, award?.data?.definitionId]),
      count: firstPositiveInteger([award?.count, award?.amount, award?.quantity, award?.data?.count]) || 1,
      metadataHints: {
        award: metadataFieldHints(award),
        data: metadataFieldHints(award?.data),
      },
    };
  }

  function normalizeDiscoveryAward(award) {
    return normalizeDiscoveryReward(award) || normalizeDiscoveryPackReward(award);
  }

  function currentController() {
    try {
      return runtime?.getAppMain?.()
        ?.getRootViewController?.()
        ?.getPresentedViewController?.()
        ?.getCurrentViewController?.()
        ?.getCurrentController?.() || null;
    } catch { return null; }
  }

  function safeScalar(value, keys = []) {
    for (const key of keys) {
      try {
        const candidate = value?.[key];
        if (['string', 'number', 'boolean'].includes(typeof candidate)) return candidate;
      } catch { }
    }
    return null;
  }

  function categoryRoots(refreshResult = null) {
    const controller = currentController();
    const roots = [
      service?.repository?.categories,
      service?.repository?.category,
      service?.categories,
      service?.categoriesIterator,
      service?.viewmodel,
      service?.viewModel,
      refreshResult?.data?.categories,
      refreshResult?.response?.categories,
      controller?.viewmodel,
      controller?.viewModel,
      controller?._viewmodel,
      controller?._viewModel,
    ];
    return roots.filter(Boolean);
  }

  function categoriesFromRoot(root) {
    const candidates = [];
    try {
      if (typeof root?.getCategories === 'function') candidates.push(...collectionValues(root.getCategories()));
    } catch { }
    try { candidates.push(...collectionValues(root?.categoriesIterator)); } catch { }
    try { candidates.push(...collectionValues(root?.categories)); } catch { }
    candidates.push(...collectionValues(root));
    return candidates;
  }

  function normalizeDiscoveryCategory(category) {
    const setIds = collectionValues(
      category?.setIds || category?.sets || category?.data?.setIds || category?.data?.sets
    ).map((entry) => positiveInteger(entry?.id || entry)).filter(Boolean);
    return {
      id: positiveInteger(category?.id || category?.categoryId || category?.data?.id),
      name: String(
        category?.name || category?.description || category?.displayName ||
        category?.data?.name || category?.data?.description || ''
      ).trim(),
      setIds: [...new Set(setIds)],
    };
  }

  function listDiscoveryCategories(refreshResult = null) {
    const byKey = new Map();
    for (const root of categoryRoots(refreshResult)) {
      for (const category of categoriesFromRoot(root)) {
        const normalized = normalizeDiscoveryCategory(category);
        if (!normalized.id && !normalized.name && !normalized.setIds.length) continue;
        const key = `${normalized.id || '?'}:${normalized.name}`;
        const existing = byKey.get(key);
        byKey.set(key, existing ? {
          ...existing,
          setIds: [...new Set([...existing.setIds, ...normalized.setIds])],
        } : normalized);
      }
    }
    return [...byKey.values()];
  }

  function discoveryCategoryMembership(set, refreshResult = null) {
    const setId = positiveInteger(set?.id);
    const directCategories = collectionValues(
      set?.categoryIds || set?.categories || set?.data?.categoryIds || set?.data?.categories
    ).map((entry) => (typeof entry === 'object'
      ? normalizeDiscoveryCategory(entry)
      : { id: positiveInteger(entry), name: '', setIds: [] }));
    const directIds = directCategories.map((category) => category.id).filter(Boolean);
    const directCategoryId = positiveInteger(set?.categoryId || set?.data?.categoryId);
    if (directCategoryId) directIds.push(directCategoryId);
    const categories = listDiscoveryCategories(refreshResult);
    const matching = [
      ...directCategories,
      ...categories.filter((category) => (
        (setId && category.setIds.includes(setId))
        || (category.id && directIds.includes(category.id))
      )),
    ];
    const categoryIds = [...new Set([...directIds, ...matching.map((category) => category.id).filter(Boolean)])];
    const categoryNames = [...new Set(matching.map((category) => category.name).filter(Boolean))];
    return {
      categoryIds,
      categoryNames,
      inUpgradesCategory: matching.some((category) => /\bupgrades?\b/i.test(category.name)),
      categoriesAvailable: directCategories.length > 0 || Boolean(directCategoryId) || categories.length > 0,
    };
  }

  function discoveryChallengeIds(set) {
    const sources = [
      set?.challengeIds,
      set?.data?.challengeIds,
      set?.challenges,
      set?._challenges,
    ];
    return [...new Set(sources.flatMap((source) => collectionValues(source))
      .map((entry) => positiveInteger(entry?.id || entry)).filter(Boolean))];
  }

  function discoveryRequiredPlayerCount(challenge) {
    const explicit = firstPositiveInteger([
      challenge?.requiredPlayerCount,
      challenge?.playerCount,
      challenge?.numPlayers,
    ]);
    if (explicit) return explicit;
    try {
      const squadCount = positiveInteger(challenge?.squad?.getNumOfRequiredPlayers?.());
      if (squadCount) return squadCount;
    } catch { }
    if (!challenge?.squad) return null;
    const challengeFormation = formation(challenge?.formation);
    const formationCount = positiveInteger(challengeFormation?.generalPositions?.length);
    if (!formationCount) return null;
    try {
      const brickCount = challenge.squad.getAllBrickIndices?.()?.length;
      if (Number.isInteger(brickCount) && brickCount >= 0 && brickCount < formationCount) {
        return formationCount - brickCount;
      }
    } catch { }
    const simpleBrickCount = Array.isArray(challenge.squad?.simpleBrickIndices)
      ? challenge.squad.simpleBrickIndices.length
      : null;
    if (Number.isInteger(simpleBrickCount) && simpleBrickCount >= 0 && simpleBrickCount < formationCount) {
      return formationCount - simpleBrickCount;
    }
    return null;
  }

  function normalizeDiscoveryChallenge(challenge) {
    return {
      id: positiveInteger(challenge?.id),
      status: String(challenge?.status || challenge?.state || ''),
      completed: challenge?.completed === true || (() => {
        try { return challenge?.isCompleted?.() === true; } catch { return false; }
      })(),
      requiredPlayerCount: discoveryRequiredPlayerCount(challenge),
      eligibilityRequirements: (challenge?.eligibilityRequirements || []).map((requirement) => {
        const key = firstRequirementKey(requirement);
        return {
          key: eligibilityKeyName(key),
          values: requirementValues(requirement, key),
          count: Number.isFinite(Number(requirement?.count)) ? Number(requirement.count) : null,
        };
      }),
    };
  }

  function snapshotDiscoveryIndex(set, refreshResult = null) {
    const rawAwards = collectionValues(set?.awards || set?.data?.awards);
    const category = discoveryCategoryMembership(set, refreshResult);
    return {
      id: positiveInteger(set?.id),
      name: String(set?.name || set?.data?.name || '').trim(),
      status: String(set?.status || set?.state || ''),
      complete: (() => {
        try { return set?.isComplete?.() === true || set?.complete === true || set?.completed === true; } catch { return false; }
      })(),
      timesCompleted: finiteNumberOrNull(set?.timesCompleted),
      repeats: finiteNumberOrNull(set?.repeats),
      startTime: finiteNumberOrNull(safeScalar(set, ['startTime', 'start', 'startsAt', 'startDate'])),
      endTime: finiteNumberOrNull(safeScalar(set, ['endTime', 'end', 'expires', 'expiresAt', 'endDate'])),
      rewards: rawAwards.map(normalizeDiscoveryAward).filter(Boolean),
      challengeIds: discoveryChallengeIds(set),
      challenges: [],
      ...category,
    };
  }

  function snapshotDiscoverySet(set, challenges = null, refreshResult = null) {
    const index = snapshotDiscoveryIndex(set, refreshResult);
    const rawChallenges = challenges === null
      ? collectionValues(set?.challenges || set?._challenges)
      : collectionValues(challenges);
    return {
      ...index,
      challenges: rawChallenges.map(normalizeDiscoveryChallenge),
    };
  }

  function cacheScope() {
    const roots = [
      runtime?.services?.User,
      runtime?.services?.Session,
      runtime?.services?.Authentication,
      runtime?.repositories?.User,
      runtime?.repositories?.Persona,
      runtime?.repositories?.Account,
    ].filter(Boolean);
    const keys = ['personaId', 'personaID', 'userId', 'accountId', 'nucleusId', 'id'];
    for (const root of roots) {
      const candidates = [root];
      for (const method of ['getUser', 'getCurrentUser', 'getPersona', 'getCurrentPersona', 'getAccount']) {
        try { if (typeof root?.[method] === 'function') candidates.push(root[method]()); } catch { }
      }
      for (const candidate of candidates.filter(Boolean)) {
        const value = safeScalar(candidate, keys);
        if (value !== null && value !== '') return String(value);
      }
    }
    return 'default';
  }

  function canLoadChallengeData() {
    return typeof service.loadChallengeData === 'function';
  }

  function submissionOptions() {
    let skipValidation = false;
    let chemistryEnabled = false;
    try { skipValidation = runtime?.services?.UserSettings?.getSBCValidationSkip?.() || false; } catch { }
    try { chemistryEnabled = runtime?.services?.Chemistry?.isFeatureEnabled?.() || false; } catch { }
    return { skipValidation: skipValidation === true, chemistryEnabled: chemistryEnabled === true };
  }

  function saveChallenge(challenge) {
    if (typeof service.saveChallenge !== 'function') throw new Error('EA saveChallenge is unavailable');
    return service.saveChallenge(challenge);
  }

  function loadChallengeData(challenge) {
    if (typeof service.loadChallengeData !== 'function') return null;
    return service.loadChallengeData(challenge);
  }

  function submitChallenge(challenge, set, options = {}) {
    if (typeof service.submitChallenge !== 'function') throw new Error('EA submitChallenge is unavailable');
    return service.submitChallenge(
      challenge,
      set,
      options.skipValidation === true,
      options.chemistryEnabled !== false,
    );
  }

  return Object.freeze({
    listSets,
    requestSets,
    requestChallengesForSet,
    loadChallenge,
    hasDaoGetChallengesForSet,
    getChallengesForSet,
    hasDaoLoadChallenge,
    loadDaoChallenge,
    formation,
    createSquadController,
    eligibilityKeyName,
    listDiscoveryCategories,
    snapshotDiscoveryIndex,
    snapshotDiscoverySet,
    cacheScope,
    canLoadChallengeData,
    submissionOptions,
    saveChallenge,
    loadChallengeData,
    submitChallenge,
  });
}
