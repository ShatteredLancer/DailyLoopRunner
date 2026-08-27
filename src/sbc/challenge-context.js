function collectionValues(collection) {
  if (!collection) return [];
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (Array.isArray(collection._collection)) return collection._collection;
  if (collection._collection && typeof collection._collection === 'object') {
    return Object.values(collection._collection);
  }
  if (Array.isArray(collection)) return collection;
  if (typeof collection === 'object') return Object.values(collection);
  return [];
}

export function findRegisteredSbcChallenge(set, challengeId) {
  const expectedId = Number(challengeId || 0);
  if (!set || !expectedId) return null;

  try {
    const challenge = set.getChallenge?.(expectedId) || null;
    if (Number(challenge?.id || 0) === expectedId) return challenge;
  } catch { }

  const candidates = [
    ...collectionValues(set.challenges),
    ...collectionValues(set._challenges),
  ];
  return candidates.find((challenge) => Number(challenge?.id || 0) === expectedId) || null;
}
