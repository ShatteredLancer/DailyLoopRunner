function itemDefinitionId(item) {
  return Number(item?.definitionId || 0);
}

function itemIdentityIds(item) {
  const definitionId = Number(item?.definitionId || 0);
  const itemId = Number(item?.id || 0);
  return [...new Set([
    definitionId,
    Number(item?.resourceId || 0),
    Number(item?._data?.resourceId || 0),
    Number(item?._staticData?.resourceId || 0),
    itemId && definitionId && itemId === definitionId ? itemId : 0,
  ].filter((value) => Number.isFinite(value) && value > 0))];
}

export function playerPickItemName(item) {
  return String(item?._staticData?.name || item?.name || item?.description || `Player Pick #${item?.id || '?'}`);
}

export function playerPickMatchesReward(item, acceptedNames = [], acceptedResourceIds = []) {
  const patterns = Array.isArray(acceptedNames)
    ? acceptedNames
    : (acceptedNames === undefined || acceptedNames === null ? [] : [acceptedNames]);
  const resourceIds = new Set((acceptedResourceIds || []).map(Number).filter((value) => Number.isFinite(value) && value > 0));
  if (resourceIds.size) return itemIdentityIds(item).some((id) => resourceIds.has(id));
  const name = playerPickItemName(item).toLowerCase();
  return patterns.some((pattern) => name.includes(String(pattern).toLowerCase()));
}

export function partitionPendingPlayerPicks(items, acceptedNames = [], acceptedResourceIds = []) {
  const matches = (item) => playerPickMatchesReward(item, acceptedNames, acceptedResourceIds);
  const picks = items || [];
  return {
    matching: picks.filter(matches),
    unexpected: picks.filter((item) => !matches(item)),
  };
}

export function classifyPendingPlayerPicks(items, acceptedNames = [], acceptedResourceIds = []) {
  const partitioned = partitionPendingPlayerPicks(items, acceptedNames, acceptedResourceIds);
  return {
    matching: partitioned.matching[0] || null,
    unexpected: partitioned.unexpected[0] || null,
  };
}

export function rankPlayerPickCandidates(items, prices = new Map(), options = {}) {
  const isSpecial = options.isSpecial || (() => false);
  const isDuplicate = options.isDuplicate || (() => false);
  const isRare = options.isRare || (() => false);
  return (items || []).map((item, index) => ({
    item,
    index,
    rating: Number(item?.rating || 0),
    rare: isRare(item) === true,
    special: isSpecial(item) === true,
    duplicate: isDuplicate(item) === true,
    price: prices.has(itemDefinitionId(item)) ? prices.get(itemDefinitionId(item)) : null,
  })).sort((a, b) =>
    b.rating - a.rating ||
    Number(b.special) - Number(a.special) ||
    Number(a.duplicate) - Number(b.duplicate) ||
    (b.price ?? -1) - (a.price ?? -1) ||
    a.index - b.index
  );
}

export function capturePlayerPickSelections(selected, ranked, options = {}) {
  const isSpecial = options.isSpecial || (() => false);
  const isDuplicate = options.isDuplicate || (() => false);
  const isRare = options.isRare || (() => false);
  return (selected || []).map((item) => {
    const candidate = ranked.find((entry) => entry.item === item);
    return {
      item,
      rating: candidate?.rating ?? Number(item?.rating || 0),
      rare: (candidate?.rare ?? isRare(item)) === true,
      special: candidate?.special ?? isSpecial(item) === true,
      duplicate: candidate?.duplicate ?? isDuplicate(item) === true,
      price: candidate?.price ?? null,
    };
  });
}

export function getManualPlayerPickReason(ranked, pickCount) {
  const topRating = ranked[0]?.rating;
  const topSpecials = ranked.filter((candidate) => candidate.rating === topRating && candidate.special);
  if (topSpecials.length > 1) {
    return `${topSpecials.length} special card(s) share the highest rating ${topRating}`;
  }

  const groups = new Map();
  ranked.forEach((candidate, index) => {
    const key = `${candidate.rating}:${candidate.special ? 1 : 0}:${candidate.duplicate ? 1 : 0}`;
    const group = groups.get(key) || { candidates: [], firstIndex: index };
    group.candidates.push(candidate);
    groups.set(key, group);
  });
  for (const group of groups.values()) {
    if (group.firstIndex >= pickCount || group.candidates.length < 2) continue;
    if (group.candidates.some((candidate) => candidate.price === null)) {
      return 'price data is missing for a tie that affects the selected card(s)';
    }
  }
  return '';
}
