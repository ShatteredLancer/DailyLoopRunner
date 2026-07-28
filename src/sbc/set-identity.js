function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function findSbcSetByPreferredId(sets = [], setIds = []) {
  const available = Array.isArray(sets) ? sets : [];
  const seen = new Set();
  for (const value of setIds || []) {
    const setId = positiveInteger(value);
    if (!setId || seen.has(setId)) continue;
    seen.add(setId);
    const match = available.find((set) => positiveInteger(set?.id) === setId);
    if (match) return match;
  }
  return null;
}
