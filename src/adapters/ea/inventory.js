import { createInventorySnapshot, createItemSnapshot, INVENTORY_PILES } from '../../domain/contracts.js';

function collectionValues(collection) {
  if (!collection) return [];
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (Array.isArray(collection._collection)) return collection._collection;
  if (collection._collection && typeof collection._collection === 'object') return Object.values(collection._collection);
  if (Array.isArray(collection)) return collection;
  return [];
}

function callBoolean(item, method, fallback = false) {
  try {
    if (typeof item?.[method] === 'function') return item[method]() === true;
  } catch { }
  return fallback;
}

function itemGroups(item) {
  const groups = item?.groups || item?._groups || item?._staticData?.groups || item?._data?.groups;
  return Array.isArray(groups) ? groups : [];
}

function itemLeagueId(item) {
  const values = [item?.leagueId, item?.league, item?._leagueId, item?._data?.leagueId, item?._staticData?.leagueId];
  const value = values.map(Number).find((entry) => Number.isFinite(entry) && entry > 0);
  return value || 0;
}

const IDENTITY_FIELDS = [
  'id', 'itemId', 'instanceId', 'resourceId', 'cardId', 'playerId', 'guidAssetId',
  'definitionId', 'defId', 'assetId', '_assetId', 'baseId', 'baseResourceId',
];
const IDENTITY_HOLDERS = [
  '_data', 'data', '_staticData', 'staticData', 'assetData', '_assetData', '_item', 'item', '_player', 'player', 'raw', 'rawData', '_rawData',
];

function identityIds(item) {
  const holders = [item, ...IDENTITY_HOLDERS.map((field) => item?.[field])]
    .filter((holder) => holder && typeof holder === 'object');
  const values = holders.flatMap((holder) => IDENTITY_FIELDS.flatMap((field) => {
    const value = holder?.[field];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.match(/\d+/g) || [];
    return [value];
  }));
  return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))];
}

function isLimitedUse(item) {
  const loans = Number(item?.loans ?? item?._data?.loans);
  if (Number.isFinite(loans) && loans >= 0) return true;
  return callBoolean(item, 'isLoan') || callBoolean(item, 'isLimitedUse');
}

function isConcept(item) {
  return callBoolean(item, 'isConcept') || callBoolean(item, 'isConceptItem') || item?.concept === true;
}

function isActiveTrade(item) {
  try {
    const auction = item?.getAuctionData?.() || item?._auction;
    if (!auction) return false;
    if (typeof auction.isActiveTrade === 'function' && auction.isActiveTrade()) return true;
    if (typeof auction.isClosedTrade === 'function' && auction.isClosedTrade()) return true;
  } catch { }
  return false;
}

function isAcademyEnrolled(item) {
  return callBoolean(item, 'isEnrolledInAcademy');
}

function toSnapshot(item, pile) {
  const rating = Number(item?.rating || 0);
  const rareflag = Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? 0);
  const duplicateId = Number(item?.duplicateId || 0);
  const tradeable = typeof item?.isUntradeable === 'function'
    ? !callBoolean(item, 'isUntradeable', true)
    : item?.untradeable === false;
  return createItemSnapshot({
    id: item?.id,
    definitionId: item?.definitionId,
    type: item?.type || (callBoolean(item, 'isPlayer') ? 'player' : 'unknown'),
    name: item?.name || item?.commonName || item?.lastName || item?._staticData?.name,
    rating,
    rareflag,
    rare: callBoolean(item, 'isRare', rareflag > 0),
    special: callBoolean(item, 'isSpecial', rareflag > 1),
    duplicate: callBoolean(item, 'isDuplicate', duplicateId > 0),
    duplicateId,
    tradeable,
    leagueId: itemLeagueId(item),
    identityIds: identityIds(item),
    evolution: callBoolean(item, 'isEvolution') || callBoolean(item, 'isEvo') || Number(item?.evolutionId || 0) > 0,
    limitedUse: isLimitedUse(item),
    concept: isConcept(item),
    academyEnrolled: isAcademyEnrolled(item),
    activeTrade: isActiveTrade(item),
    endTime: item?.endTime,
    groups: itemGroups(item),
  }, pile);
}

export function createEaInventoryAdapter(runtime, options = {}) {
  if (!runtime?.repositories?.Item) throw new Error('EA Item repository is unavailable');
  const repository = runtime.repositories.Item;

  function readPile(pile) {
    if (pile === 'unassigned') {
      try { return Array.from(repository.getUnassignedItems?.() || []); } catch { return []; }
    }
    if (pile === 'storage') {
      try { return Array.from(repository.getStorageItems?.() || []); } catch { return collectionValues(repository.storage); }
    }
    if (pile === 'transfer') {
      try { return Array.from(repository.getTransferItems?.() || []); } catch { return collectionValues(repository.transfer); }
    }
    if (pile === 'club') {
      return collectionValues(repository.club?.items)
        .concat(collectionValues(runtime.services?.Item?.itemDao?.itemRepo?.club?.items));
    }
    return [];
  }

  function capacity(pile, rawItems) {
    const pileValue = runtime.ItemPile?.[pile.toUpperCase()] ?? pile;
    let max = null;
    let used = rawItems.length;
    try {
      const value = Number(repository.getPileSize?.(pileValue));
      if (Number.isFinite(value)) max = value;
    } catch { }
    if (max === null) {
      const fallback = Number(options.capacityFallbacks?.[pile]);
      if (Number.isFinite(fallback)) max = fallback;
    }
    try {
      const value = Number(repository.numItemsInCache?.(pileValue));
      if (Number.isFinite(value)) used = value;
    } catch { }
    return { max, used };
  }

  function snapshot() {
    const rawPiles = Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, readPile(pile)]));
    return createInventorySnapshot({
      piles: Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, rawPiles[pile].map((item) => toSnapshot(item, pile))])),
      capacities: Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, capacity(pile, rawPiles[pile])])),
    });
  }

  function resolveItem(ref, preferredPiles = INVENTORY_PILES) {
    const id = Number(ref?.id || 0);
    const definitionId = Number(ref?.definitionId || 0);
    const piles = [...new Set([ref?.pile, ...(preferredPiles || [])].filter((pile) => INVENTORY_PILES.includes(pile)))];
    for (const pile of piles) {
      const items = readPile(pile);
      const byId = id ? items.find((item) => Number(item?.id || 0) === id) : null;
      if (byId) return { item: byId, pile };
      const byDefinition = !id && definitionId ? items.find((item) => Number(item?.definitionId || 0) === definitionId) : null;
      if (byDefinition) return { item: byDefinition, pile };
    }
    return null;
  }

  return Object.freeze({ snapshot, resolveItem, readPile, snapshotItem: toSnapshot });
}
