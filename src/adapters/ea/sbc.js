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

  function snapshotDiscoverySet(set, challenges = null) {
    const rawAwards = collectionValues(set?.awards || set?.data?.awards);
    const rawChallenges = challenges === null
      ? collectionValues(set?.challenges || set?._challenges)
      : collectionValues(challenges);
    return {
      id: positiveInteger(set?.id),
      name: String(set?.name || set?.data?.name || '').trim(),
      status: String(set?.status || set?.state || ''),
      complete: (() => {
        try { return set?.isComplete?.() === true || set?.complete === true || set?.completed === true; } catch { return false; }
      })(),
      timesCompleted: Number.isFinite(Number(set?.timesCompleted)) ? Number(set.timesCompleted) : null,
      repeats: Number.isFinite(Number(set?.repeats)) ? Number(set.repeats) : null,
      rewards: rawAwards.map(normalizeDiscoveryReward).filter(Boolean),
      challenges: rawChallenges.map(normalizeDiscoveryChallenge),
    };
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
    snapshotDiscoverySet,
    canLoadChallengeData,
    submissionOptions,
    saveChallenge,
    loadChallengeData,
    submitChallenge,
  });
}
