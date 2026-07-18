export function createEaSbcAdapter(runtime) {
  const service = runtime?.services?.SBC;
  if (!service) throw new Error('EA SBC service is unavailable');

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

  return Object.freeze({ saveChallenge, loadChallengeData, submitChallenge });
}
