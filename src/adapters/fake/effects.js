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
  });
}

export function createFakeSbcAdapter(results = {}) {
  const calls = [];
  return Object.freeze({
    calls,
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
