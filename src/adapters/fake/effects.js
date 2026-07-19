export function createFakePackAdapter(initialPacks = [], openedById = {}) {
  const packs = [...initialPacks];
  const calls = [];
  return Object.freeze({
    calls,
    list: () => [...packs],
    resolve(ref = {}) {
      const id = Number(ref.id || 0);
      return packs.find((pack) => (id && Number(pack.id) === id) || (!id && ref.name && pack.name === ref.name)) || null;
    },
    async open(pack) {
      calls.push({ method: 'open', packId: Number(pack?.id || 0) });
      return openedById[pack?.id] || { success: true, response: { items: [] } };
    },
    async refreshAll() {
      calls.push({ method: 'refreshAll' });
      return { success: true, response: { packs: [...packs] } };
    },
  });
}

export function createFakeSbcAdapter(results = {}) {
  const calls = [];
  return Object.freeze({
    calls,
    listSets: () => [...(results.sets || [])],
    async requestSets() {
      calls.push({ method: 'requestSets' });
      return results.requestSets || { success: true };
    },
    async requestChallengesForSet(set) {
      calls.push({ method: 'requestChallengesForSet', setId: Number(set?.id || 0) });
      return results.requestChallengesForSet || { success: true, data: { challenges: [] } };
    },
    async loadChallenge(challenge) {
      calls.push({ method: 'loadChallenge', challengeId: Number(challenge?.id || 0) });
      return results.loadChallenge || { success: true };
    },
    hasDaoGetChallengesForSet: () => true,
    async getChallengesForSet(setId) {
      calls.push({ method: 'getChallengesForSet', setId: Number(setId || 0) });
      return results.getChallengesForSet || { success: true, response: { challenges: [] } };
    },
    hasDaoLoadChallenge: () => true,
    async loadDaoChallenge(challengeId, inProgress) {
      calls.push({ method: 'loadDaoChallenge', challengeId: Number(challengeId || 0), inProgress: inProgress === true });
      return results.loadDaoChallenge || { success: true, response: { squad: {} } };
    },
    formation: (formationId) => results.formations?.[formationId] || null,
    createSquadController: () => ({ className: 'FakeSbcSquadController' }),
    eligibilityKeyName: (key) => String(key || ''),
    snapshotDiscoverySet(set, challenges = null) {
      calls.push({ method: 'snapshotDiscoverySet', setId: Number(set?.id || 0) });
      return results.snapshotDiscoverySet?.(set, challenges) || { ...set, challenges: challenges || set?.challenges || [] };
    },
    canLoadChallengeData: () => true,
    submissionOptions: () => ({ skipValidation: false, chemistryEnabled: false }),
    async saveChallenge(challenge) {
      calls.push({ method: 'saveChallenge', challengeId: challenge?.id });
      return results.saveChallenge || { success: true };
    },
    async loadChallengeData(challenge) {
      calls.push({ method: 'loadChallengeData', challengeId: challenge?.id });
      return results.loadChallengeData || null;
    },
    async submitChallenge(challenge, set, options = {}) {
      calls.push({ method: 'submitChallenge', challengeId: challenge?.id, setId: set?.id, options });
      return results.submitChallenge || { success: true };
    },
  });
}

export function createFakePlayerPickAdapter(results = {}) {
  const calls = [];
  const pendingPicks = [...(results.pendingPicks || [])];
  const duplicateDefinitionIds = new Set((results.duplicateDefinitionIds || []).map(Number));
  return Object.freeze({
    calls,
    listUnassignedPlayerPicks() {
      calls.push({ method: 'listUnassignedPlayerPicks' });
      return [...pendingPicks];
    },
    isOwnedDuplicate(item) {
      calls.push({ method: 'isOwnedDuplicate', itemId: Number(item?.id || 0) });
      return duplicateDefinitionIds.has(Number(item?.definitionId || 0));
    },
    async redeem(pickItem) {
      calls.push({ method: 'redeem', itemId: Number(pickItem?.id || 0) });
      return results.redeem || { success: true, data: { items: [] } };
    },
    async confirmSelection(items) {
      calls.push({ method: 'confirmSelection', itemIds: (items || []).map((item) => Number(item?.id || 0)) });
      return results.confirmSelection || { success: true };
    },
  });
}
