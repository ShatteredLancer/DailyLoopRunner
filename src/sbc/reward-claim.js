function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function hasPackCountIncrease(before = new Map(), after = new Map()) {
  for (const [id, count] of after.entries()) {
    if (Number(count || 0) > Number(before.get(id) || 0)) return true;
  }
  return false;
}

export function hasSbcProgressAdvanced(before = {}, after = {}) {
  if (after.setComplete === true && before.setComplete !== true) return true;

  const beforeSetCount = finiteNumber(before.setTimesCompleted);
  const afterSetCount = finiteNumber(after.setTimesCompleted);
  if (beforeSetCount !== null && afterSetCount !== null && afterSetCount > beforeSetCount) return true;

  const beforeChallenges = new Map((before.challenges || []).map((challenge) => [Number(challenge.id || 0), challenge]));
  return (after.challenges || []).some((challenge) => {
    const previous = beforeChallenges.get(Number(challenge.id || 0));
    if (!previous) return challenge.completed === true;
    if (challenge.completed === true && previous.completed !== true) return true;
    const beforeCount = finiteNumber(previous.timesCompleted);
    const afterCount = finiteNumber(challenge.timesCompleted);
    return beforeCount !== null && afterCount !== null && afterCount > beforeCount;
  });
}
