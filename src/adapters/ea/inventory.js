import { createInventorySnapshot, createItemSnapshot, INVENTORY_PILES } from '../../domain/contracts.js';
import {
  hasPlayerCosmetics,
  isPlayerEvolutionCard,
  readPlayerRareFlag,
} from '../../domain/player-rarity.js';
import { classifyUnassignedDuplicateIdentity } from '../../inventory/unassigned-duplicate-identity.js';

function collectionValues(collection) {
  if (!collection) return [];
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (Array.isArray(collection._collection)) return collection._collection;
  if (collection._collection && typeof collection._collection === 'object') return Object.values(collection._collection);
  if (Array.isArray(collection)) return collection;
  return [];
}

function mergeInventoryEntities(...collections) {
  const merged = [];
  const seenIds = new Set();
  const seenObjects = new Set();
  for (const item of collections.flatMap((collection) => collectionValues(collection))) {
    if (!item || typeof item !== 'object') continue;
    const id = Number(item.id || 0);
    if (id ? seenIds.has(id) : seenObjects.has(item)) continue;
    if (id) seenIds.add(id);
    else seenObjects.add(item);
    merged.push(item);
  }
  return merged;
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
  const rareflag = readPlayerRareFlag(item);
  const duplicateId = Number(item?.duplicateId || 0);
  const tradeable = typeof item?.isUntradeable === 'function'
    ? !callBoolean(item, 'isUntradeable', true)
    : item?.untradeable === false;
  let fullName = '';
  try { fullName = String(item?._staticData?.getFullName?.() || item?.getFullName?.() || '').trim(); } catch { }
  return createItemSnapshot({
    id: item?.id,
    definitionId: item?.definitionId,
    type: item?.type || (callBoolean(item, 'isPlayer') ? 'player' : 'unknown'),
    name: fullName || item?.name || item?.commonName || item?.lastName || item?._staticData?.name,
    rating,
    rareflag,
    rare: callBoolean(item, 'isRare', rareflag > 0),
    special: callBoolean(item, 'isSpecial', rareflag > 1),
    duplicate: callBoolean(item, 'isDuplicate', duplicateId > 0),
    duplicateId,
    tradeable,
    leagueId: itemLeagueId(item),
    identityIds: identityIds(item),
    evolution: isPlayerEvolutionCard(item),
    cosmetic: hasPlayerCosmetics(item),
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
  const service = runtime?.services?.Item;

  function readUnassignedSources() {
    let repositoryGetter = [];
    try { repositoryGetter = Array.from(repository.getUnassignedItems?.() || []); } catch { }
    return {
      repositoryGetter,
      repositoryCollection: collectionValues(repository?.unassigned),
      daoCollection: collectionValues(service?.itemDao?.itemRepo?.unassigned),
    };
  }

  function unassignedState() {
    const sources = readUnassignedSources();
    const merged = mergeInventoryEntities(...Object.values(sources));
    const summarize = (items) => ({
      count: items.length,
      itemIds: items.map((item) => Number(item?.id || 0)).filter(Boolean),
    });
    return {
      mergedCount: merged.length,
      mergedItemIds: merged.map((item) => Number(item?.id || 0)).filter(Boolean),
      sources: Object.fromEntries(Object.entries(sources).map(([name, items]) => [name, summarize(items)])),
    };
  }

  function readPile(pile) {
    if (pile === 'unassigned') {
      return mergeInventoryEntities(...Object.values(readUnassignedSources()));
    }
    if (pile === 'storage') {
      try {
        if (typeof repository.getStorageItems === 'function') {
          return Array.from(repository.getStorageItems() || []);
        }
      } catch { }
      try {
        if (typeof repository.getStorage === 'function') {
          return collectionValues(repository.getStorage());
        }
      } catch { }
      return collectionValues(repository.storage);
    }
    if (pile === 'transfer') {
      try {
        if (typeof repository.getTransferItems === 'function') {
          return Array.from(repository.getTransferItems() || []);
        }
      } catch { }
      return collectionValues(repository.transfer);
    }
    if (pile === 'club') {
      return mergeInventoryEntities(
        repository.club?.items,
        runtime.services?.Item?.itemDao?.itemRepo?.club?.items,
      );
    }
    return [];
  }

  function pileValue(pile) {
    return runtime.ItemPile?.[String(pile || '').toUpperCase()] ?? pile;
  }

  function preparePurchasedItem(item) {
    if (!item || typeof item !== 'object') return item;
    item.pile = pileValue('purchased');
    item.injuryType = runtime.PlayerInjury?.NONE ?? 0;
    return item;
  }

  function capacity(pile, rawItems = readPile(pile)) {
    const resolvedPile = pileValue(pile);
    let max = null;
    let used = rawItems.length;
    try {
      const value = Number(repository.getPileSize?.(resolvedPile));
      if (Number.isFinite(value)) max = value;
    } catch { }
    if (max === null) {
      const fallback = Number(options.capacityFallbacks?.[pile]);
      if (Number.isFinite(fallback)) max = fallback;
    }
    try {
      const value = Number(repository.numItemsInCache?.(resolvedPile));
      if (Number.isFinite(value)) used = value;
    } catch { }
    return { max, used, free: max === null ? null : Math.max(0, max - used) };
  }

  function requestUnassigned() {
    if (typeof service?.requestUnassignedItems !== 'function') {
      throw new Error('EA Unassigned refresh is unavailable');
    }
    return service.requestUnassignedItems();
  }

  async function invalidateUnassigned() {
    const resolvedPile = pileValue('purchased');
    const actions = [];
    const run = async (id, owner, methodName, args = []) => {
      const method = owner?.[methodName];
      if (typeof method !== 'function') {
        actions.push({ id, available: false, succeeded: false, error: null });
        return;
      }
      try {
        await method.apply(owner, args);
        actions.push({ id, available: true, succeeded: true, error: null });
      } catch (error) {
        actions.push({
          id,
          available: true,
          succeeded: false,
          error: error?.message || String(error),
        });
      }
    };

    const repositoryUnassigned = repository?.unassigned;
    const daoUnassigned = service?.itemDao?.itemRepo?.unassigned;
    await run('repository-unassigned-reset', repositoryUnassigned, 'reset');
    if (daoUnassigned === repositoryUnassigned) {
      const original = actions.find((action) => action.id === 'repository-unassigned-reset');
      actions.push({
        id: 'dao-unassigned-reset',
        available: original?.available === true,
        succeeded: original?.succeeded === true,
        deduplicated: true,
        error: original?.error || null,
      });
    } else {
      await run('dao-unassigned-reset', daoUnassigned, 'reset');
    }
    await run('repository-set-dirty', repository, 'setDirty', [resolvedPile]);

    return {
      pile: resolvedPile,
      invalidated: actions.some((action) => action.succeeded),
      actions,
    };
  }

  function refreshActions(pile) {
    const resolvedPile = pileValue(pile);
    const specificNames = {
      club: ['requestClubItems'],
      storage: ['requestStorageItems', 'requestSBCStorageItems'],
      transfer: ['requestTransferItems'],
    }[pile] || [];
    const genericNames = ['requestItems', 'requestPileItems', 'requestItemsForPile', 'requestItemsByPile'];
    return [
      ...specificNames.map((methodName) => ({
        label: `Item.${methodName}`,
        methodName,
        invoke: () => service[methodName](),
      })),
      ...genericNames.map((methodName) => ({
        label: `${pile} via Item.${methodName}`,
        methodName,
        invoke: () => service[methodName](resolvedPile),
      })),
    ].filter((action) => typeof service?.[action.methodName] === 'function');
  }

  function move(items, pile, allowStorage = true) {
    if (typeof service?.move !== 'function') throw new Error('EA Item move is unavailable');
    return service.move(items, pile, allowStorage);
  }

  function snapshot() {
    const rawPiles = Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, readPile(pile)]));
    const piles = Object.fromEntries(INVENTORY_PILES.map((pile) => [
      pile,
      rawPiles[pile].map((item) => toSnapshot(item, pile)),
    ]));
    // EA duplicateId identifies the Club counterpart. A same-version Storage
    // card remains usable SBC inventory, but cannot keep Unassigned duplicated
    // after the Club counterpart has been submitted.
    const clubItems = piles.club;
    piles.unassigned = piles.unassigned.map((item) => {
      const identity = classifyUnassignedDuplicateIdentity(item, clubItems);
      if (identity.duplicate === item.duplicate && identity.duplicateId === item.duplicateId) return item;
      return createItemSnapshot({
        ...item,
        duplicate: identity.duplicate,
        duplicateId: identity.duplicateId,
      }, 'unassigned');
    });
    return createInventorySnapshot({
      piles,
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

  return Object.freeze({
    snapshot,
    resolveItem,
    readPile,
    unassignedState,
    pileValue,
    preparePurchasedItem,
    capacity,
    requestUnassigned,
    invalidateUnassigned,
    refreshActions,
    move,
    snapshotItem: toSnapshot,
  });
}
