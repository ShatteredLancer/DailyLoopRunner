function itemId(item) {
  return Number(item?.id || item?.ref?.id || 0);
}

function definitionId(item) {
  return Number(item?.definitionId || item?.ref?.definitionId || 0);
}

function itemIds(items = []) {
  return new Set((items || []).map(itemId).filter(Boolean));
}

function itemRoutingSignature(item) {
  const definition = definitionId(item);
  if (!definition) return null;
  const type = String(item?.type || item?._itemType || item?._type || 'unknown').toLowerCase();
  const rating = Number(item?.rating ?? item?._rating ?? item?._staticData?.rating ?? 0);
  const rareflag = Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? item?._staticData?.rareflag ?? 0);
  let untradeable = 'unknown';
  try {
    if (typeof item?.isUntradeable === 'function') untradeable = item.isUntradeable() ? 'yes' : 'no';
  } catch {
    // Some stale EA entities expose the method but throw until their data is hydrated.
  }
  if (untradeable === 'unknown' && item?.untradeable === true) untradeable = 'yes';
  if (untradeable === 'unknown' && item?.untradeable === false) untradeable = 'no';
  if (untradeable === 'unknown' && item?.untradeableCount !== undefined) {
    untradeable = Number(item.untradeableCount || 0) > 0 ? 'yes' : 'no';
  }
  return `${type}:${definition}:${rating}:${rareflag}:${untradeable}`;
}

function itemStaticRoutingSignature(item) {
  const definition = definitionId(item);
  if (!definition) return null;
  const type = String(item?.type || item?._itemType || item?._type || 'unknown').toLowerCase();
  const rating = Number(item?.rating ?? item?._rating ?? item?._staticData?.rating ?? 0);
  const rareflag = Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? item?._staticData?.rareflag ?? 0);
  return `${type}:${definition}:${rating}:${rareflag}`;
}

function destinationEntries(piles = {}) {
  return ['club', 'storage', 'transfer'].flatMap((pile) =>
    (piles[pile] || []).map((item) => ({ pile, item })),
  );
}

export function createOpenedItemRoutingBaseline(piles = {}) {
  return {
    destinationIds: [...itemIds(destinationEntries(piles).map((entry) => entry.item))],
    unassignedIds: [...itemIds(piles.unassigned)],
  };
}

export function matchOpenedItemsToNewPileAliases(options = {}) {
  const items = options.items || [];
  const pileItems = options.pileItems || [];
  const baselineIds = new Set(options.baselineIds || []);
  const currentPileIds = itemIds(pileItems);
  const openedIds = itemIds(items);
  const sourcesBySignature = new Map();
  const aliasesBySignature = new Map();

  for (const item of items) {
    const id = itemId(item);
    if (!id || currentPileIds.has(id)) continue;
    const signature = itemStaticRoutingSignature(item);
    if (!signature) continue;
    const matches = sourcesBySignature.get(signature) || [];
    matches.push(item);
    sourcesBySignature.set(signature, matches);
  }
  for (const item of pileItems) {
    const id = itemId(item);
    if (!id || baselineIds.has(id) || openedIds.has(id)) continue;
    const signature = itemStaticRoutingSignature(item);
    if (!signature) continue;
    const matches = aliasesBySignature.get(signature) || [];
    matches.push(item);
    aliasesBySignature.set(signature, matches);
  }

  const aliases = [];
  for (const [signature, sources] of sourcesBySignature) {
    const candidates = aliasesBySignature.get(signature) || [];
    // The pre-open baseline and a one-to-one response group make this safe even
    // when EA replaces the response entity id while materializing Unassigned.
    if (!candidates.length || candidates.length !== sources.length) continue;
    const orderedSources = [...sources].sort((a, b) => itemId(a) - itemId(b));
    const orderedCandidates = [...candidates].sort((a, b) => itemId(a) - itemId(b));
    orderedSources.forEach((item, index) => aliases.push({ item, alias: orderedCandidates[index] }));
  }
  return aliases;
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

export function needsUnassignedViewMaterialization(materialized = {}) {
  return (materialized.deferredDuplicates || []).length > 0
    && (materialized.directItems || []).length === 0;
}

export function planUnmaterializedDuplicateFallback(options = {}) {
  const items = options.items || [];
  const isTradeable = options.isTradeable || ((item) => item?.tradeable === true);
  const findClubDuplicate = options.findClubDuplicate || (() => null);
  const capacities = options.capacities || {};
  const groups = new Map();
  const capacityNeeds = new Map();

  for (const item of items) {
    let route;
    if (isTradeable(item)) {
      route = {
        key: 'transfer',
        capacityKey: 'transfer',
        allowStorage: false,
        description: 'tradeable duplicate fallback',
      };
    } else {
      const clubDuplicate = findClubDuplicate(item);
      route = clubDuplicate && isTradeable(clubDuplicate)
        ? {
            key: 'club',
            capacityKey: 'transfer',
            allowStorage: true,
            description: 'untradeable duplicate swap fallback',
          }
        : {
            key: 'storage',
            capacityKey: 'storage',
            allowStorage: true,
            description: 'untradeable duplicate fallback',
          };
    }

    const group = groups.get(route.key) || { ...route, items: [] };
    group.items.push(item);
    groups.set(route.key, group);
    capacityNeeds.set(route.capacityKey, (capacityNeeds.get(route.capacityKey) || 0) + 1);
  }

  for (const [destination, required] of capacityNeeds) {
    const rawFree = capacities[destination];
    const free = rawFree === null || rawFree === undefined || !Number.isFinite(Number(rawFree))
      ? null
      : Math.max(0, Number(rawFree));
    if (free !== null && required > free) {
      return {
        status: 'blocked',
        blocked: { destination, required, free },
        groups: [...groups.values()],
      };
    }
  }

  return { status: 'ready', blocked: null, groups: [...groups.values()] };
}

export function classifyOpenedItemRouting(options = {}) {
  const items = options.items || [];
  const piles = options.piles || {};
  const reserveItem = options.reserveItem || (() => false);
  const unassignedIds = itemIds(piles.unassigned);
  const destinations = destinationEntries(piles);
  const destinationIds = itemIds(destinations.map((entry) => entry.item));
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

  const hasRoutingBaseline = Array.isArray(options.routingBaseline?.destinationIds);
  const baselineIds = new Set(options.routingBaseline?.destinationIds || []);
  const openedIds = itemIds(items);
  const aliasesBySignature = new Map();
  for (const entry of destinations) {
    const id = itemId(entry.item);
    if (!id || baselineIds.has(id) || openedIds.has(id)) continue;
    const signature = itemRoutingSignature(entry.item);
    if (!signature) continue;
    const matches = aliasesBySignature.get(signature) || [];
    matches.push(entry);
    aliasesBySignature.set(signature, matches);
  }

  const pendingBySignature = new Map();
  for (const item of pendingItems) {
    const id = itemId(item);
    if (!id || unassignedIds.has(id)) continue;
    const signature = itemRoutingSignature(item);
    if (!signature) continue;
    const matches = pendingBySignature.get(signature) || [];
    matches.push(item);
    pendingBySignature.set(signature, matches);
  }

  const aliasRoutes = [];
  if (hasRoutingBaseline) {
    for (const [signature, pending] of pendingBySignature) {
      const destinationsForSignature = aliasesBySignature.get(signature) || [];
      // A fallback route is safe only when the pre-open baseline proves every
      // newly observed destination entity belongs to this exact response group.
      if (!destinationsForSignature.length || destinationsForSignature.length !== pending.length) continue;
      pending.forEach((item, index) => aliasRoutes.push({ item, destination: destinationsForSignature[index] }));
    }

    // EA can hydrate a response entity with an unknown tradeability state, then
    // materialize the same card in a destination pile with its final state. Keep
    // the stricter route above first; this one-to-one static fallback only accepts
    // entities that were absent from the pre-open snapshot.
    const strictSourceIds = new Set(aliasRoutes.map((route) => itemId(route.item)));
    const strictDestinationIds = new Set(aliasRoutes.map((route) => itemId(route.destination.item)));
    const staticAliases = matchOpenedItemsToNewPileAliases({
      items: pendingItems.filter((item) => {
        const id = itemId(item);
        return !strictSourceIds.has(id) && !unassignedIds.has(id);
      }),
      pileItems: destinations
        .filter((entry) => !strictDestinationIds.has(itemId(entry.item)))
        .map((entry) => entry.item),
      baselineIds: options.routingBaseline?.destinationIds || [],
    });
    const destinationById = new Map(destinations.map((entry) => [itemId(entry.item), entry]));
    for (const { item, alias } of staticAliases) {
      const destination = destinationById.get(itemId(alias));
      if (destination) aliasRoutes.push({ item, destination });
    }
  }
  const routedAliasItems = new Set(aliasRoutes.map((route) => route.item));

  return {
    reservedItems,
    routedItems: [...routedItems, ...aliasRoutes.map((route) => route.item)],
    pendingItems: pendingItems.filter((item) => !routedAliasItems.has(item)),
    aliasRoutes,
  };
}
