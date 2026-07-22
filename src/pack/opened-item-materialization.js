function itemId(item) {
  return Number(item?.id || item?.ref?.id || 0);
}

function definitionId(item) {
  return Number(item?.definitionId || item?.ref?.definitionId || 0);
}

function itemIds(items = []) {
  return new Set((items || []).map(itemId).filter(Boolean));
}

export function materializeOpenedPlayerDuplicates(options = {}) {
  const items = options.items || [];
  const clubItems = options.clubItems || [];
  const isPlayer = options.isPlayer || ((item) => item?.type === 'player');
  const isDuplicate = options.isDuplicate || ((item) => Number(item?.duplicateId || 0) > 0);
  const preparePurchasedItem = options.preparePurchasedItem || (() => {});
  const clubById = new Map(clubItems.map((item) => [itemId(item), item]).filter(([id]) => id));
  const clubByDefinition = new Map();
  for (const item of clubItems) {
    const key = definitionId(item);
    if (!key) continue;
    const matches = clubByDefinition.get(key) || [];
    matches.push(item);
    clubByDefinition.set(key, matches);
  }

  const duplicates = [];
  const nonDuplicates = [];
  const inferredDuplicates = [];
  for (const item of items) {
    if (!isPlayer(item)) continue;
    const duplicateId = Number(item?.duplicateId || 0);
    const clubDuplicate = (duplicateId && clubById.get(duplicateId))
      || (clubByDefinition.get(definitionId(item)) || [])
        .find((candidate) => itemId(candidate) !== itemId(item))
      || null;
    if (!isDuplicate(item) && !clubDuplicate) {
      nonDuplicates.push(item);
      continue;
    }
    if (!duplicateId && clubDuplicate) {
      item.duplicateId = itemId(clubDuplicate);
      if (item._duplicateId !== undefined) item._duplicateId = itemId(clubDuplicate);
      inferredDuplicates.push(item);
    }
    preparePurchasedItem(item);
    duplicates.push(item);
  }

  return {
    duplicates,
    nonDuplicates,
    inferredDuplicates,
    directItems: nonDuplicates,
    deferredDuplicates: duplicates,
  };
}

export function classifyOpenedItemRouting(options = {}) {
  const items = options.items || [];
  const piles = options.piles || {};
  const reserveItem = options.reserveItem || (() => false);
  const unassignedIds = itemIds(piles.unassigned);
  const destinationIds = itemIds([
    ...(piles.club || []),
    ...(piles.storage || []),
    ...(piles.transfer || []),
  ]);
  const reservedItems = [];
  const routedItems = [];
  const pendingItems = [];

  for (const item of items) {
    const id = itemId(item);
    if (id && unassignedIds.has(id)) {
      if (reserveItem(item)) reservedItems.push(item);
      else pendingItems.push(item);
    } else if (id && destinationIds.has(id)) {
      routedItems.push(item);
    } else {
      pendingItems.push(item);
    }
  }

  return { reservedItems, routedItems, pendingItems };
}
