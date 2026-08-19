import { normalizePlayerPickSelectionMode } from '../domain/player-pick.js';

function itemDefinitionId(item) {
  return Number(item?.definitionId || 0);
}

function rankRatingFirst(candidates, random) {
  const groups = new Map();
  candidates.forEach((candidate) => {
    const key = `${candidate.rating}:${candidate.special ? 1 : 0}:${candidate.duplicate ? 1 : 0}`;
    const group = groups.get(key) || [];
    group.push(candidate);
    groups.set(key, group);
  });
  return [...groups.values()]
    .sort((left, right) =>
      right[0].rating - left[0].rating
      || Number(right[0].special) - Number(left[0].special)
      || Number(left[0].duplicate) - Number(right[0].duplicate)
      || left[0].index - right[0].index
    )
    .flatMap((group) => {
      if (group.every((candidate) => candidate.price !== null)) {
        return group.sort((left, right) => right.price - left.price || left.index - right.index);
      }
      const shuffled = [...group];
      for (let index = shuffled.length - 1; index > 0; index--) {
        const sample = Number(random());
        const bounded = Number.isFinite(sample)
          ? Math.max(0, Math.min(0.9999999999999999, sample))
          : 0;
        const swapIndex = Math.floor(bounded * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      return shuffled;
    });
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
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const selectionMode = normalizePlayerPickSelectionMode(options.selectionMode);
  const candidates = (items || []).map((item, index) => {
    const priceValue = prices.has(itemDefinitionId(item)) ? prices.get(itemDefinitionId(item)) : null;
    const rawPrice = priceValue === null || priceValue === undefined || priceValue === ''
      ? null
      : Number(priceValue);
    return {
      item,
      index,
      rating: Number(item?.rating || 0),
      rare: isRare(item) === true,
      special: isSpecial(item) === true,
      duplicate: isDuplicate(item) === true,
      price: Number.isFinite(rawPrice) ? rawPrice : null,
    };
  });
  if (selectionMode === 'special-price') {
    const specials = candidates
      .filter((candidate) => candidate.special)
      .sort((left, right) => {
        const leftHasPrice = left.price !== null;
        const rightHasPrice = right.price !== null;
        if (leftHasPrice !== rightHasPrice) return Number(rightHasPrice) - Number(leftHasPrice);
        if (leftHasPrice && rightHasPrice && left.price !== right.price) return right.price - left.price;
        return Number(left.duplicate) - Number(right.duplicate)
          || right.rating - left.rating
          || left.index - right.index;
      });
    const normalCards = rankRatingFirst(
      candidates.filter((candidate) => !candidate.special),
      random,
    );
    return [...specials, ...normalCards];
  }
  return rankRatingFirst(candidates, random);
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
  const topSpecials = ranked.filter((candidate) => (
    candidate.rating === topRating
      && candidate.special
      && candidate.duplicate !== true
  ));
  const availableSelections = Math.max(1, Number(pickCount || 1) || 1);
  if (topSpecials.length > availableSelections) {
    return `${topSpecials.length} non-duplicate special card(s) share the highest rating ${topRating} but only ${availableSelections} can be selected`;
  }
  return '';
}

export function planPlayerPickSelection(items, prices = new Map(), options = {}) {
  const mode = normalizePlayerPickSelectionMode(options.selectionMode);
  const pickCount = Math.max(1, Number(options.pickCount || 1) || 1);
  const ranked = rankPlayerPickCandidates(items, prices, { ...options, selectionMode: mode });
  const selected = ranked.slice(0, pickCount);
  let manualReason = '';

  if (mode === 'special-manual' && ranked.some((candidate) => candidate.special)) {
    manualReason = 'Player Pick contains special card(s); manual selection is required by the selected strategy';
  } else if (mode === 'special-price') {
    const specials = ranked.filter((candidate) => candidate.special);
    if (specials.length > pickCount) {
      const selectedSpecials = selected.filter((candidate) => candidate.special);
      const excludedSpecials = ranked.slice(pickCount).filter((candidate) => candidate.special);
      const selectedDuplicate = selectedSpecials.some((candidate) => candidate.duplicate);
      const excludedNonDuplicate = excludedSpecials.some((candidate) => !candidate.duplicate);
      const missingCompetingPrice = specials.some((candidate) => candidate.price === null);
      if (selectedDuplicate && excludedNonDuplicate) {
        manualReason = 'A high-price duplicate special card competes with an excluded non-duplicate special card';
      } else if (missingCompetingPrice) {
        manualReason = 'Special-card price ranking is incomplete; manual selection is required';
      }
    }
  } else {
    const autoSelectWithinProtection = mode === 'rating-auto'
      && options.autoSelectWithinProtection === true;
    manualReason = autoSelectWithinProtection ? '' : getManualPlayerPickReason(ranked, pickCount);
  }

  return {
    mode,
    ranked,
    selected,
    manualReason,
  };
}
