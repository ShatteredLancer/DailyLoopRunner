import { matchOpenedItemsToNewPileAliases } from '../pack/opened-item-materialization.js';

function itemId(item) {
  return Number(item?.id || item?.ref?.id || 0);
}

function uniqueItems(items = []) {
  const seenIds = new Set();
  const seenObjects = new Set();
  return (items || []).filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const id = itemId(item);
    if (id) {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    }
    if (seenObjects.has(item)) return false;
    seenObjects.add(item);
    return true;
  });
}

function responseItems(result) {
  const candidates = [
    result?.items,
    result?.response?.items,
    result?.data?.items,
    result?.response?.data?.items,
  ];
  return uniqueItems(candidates.flatMap((items) => Array.isArray(items) ? items : []));
}

function requestSummary(result, error = null) {
  return {
    success: result?.success === true,
    status: Number(result?.status ?? result?.statusCode ?? result?.response?.status) || null,
    error: error ? String(error?.message || error) : null,
    responseItemCount: responseItems(result).length,
    responseItemIds: responseItems(result).map(itemId).filter(Boolean),
  };
}

export function matchOpenedItemsToLiveUnassigned(options = {}) {
  const openedItems = uniqueItems(options.openedItems || []);
  const baselineIds = new Set((options.baselineIds || []).map(Number).filter(Boolean));
  const liveItems = uniqueItems(options.liveItems || [])
    .filter((item) => !baselineIds.has(itemId(item)));
  const usedLiveIds = new Set();
  const matches = [];
  const unresolved = [];

  for (const opened of openedItems) {
    const id = itemId(opened);
    const exact = id
      ? liveItems.find((live) => itemId(live) === id && !usedLiveIds.has(id))
      : null;
    if (!exact) {
      unresolved.push(opened);
      continue;
    }
    usedLiveIds.add(id);
    matches.push({ opened, live: exact, via: 'id' });
  }

  const unmatchedLive = liveItems.filter((item) => !usedLiveIds.has(itemId(item)));
  const aliases = matchOpenedItemsToNewPileAliases({
    items: unresolved,
    pileItems: unmatchedLive,
    baselineIds: [],
  });
  const aliasByOpened = new Map(aliases.map(({ item, alias }) => [item, alias]));
  const aliasMatches = [];
  const stillUnresolved = [];
  for (const opened of unresolved) {
    const live = aliasByOpened.get(opened);
    if (!live) {
      stillUnresolved.push(opened);
      continue;
    }
    aliasMatches.push({ opened, live, via: 'same-version-alias' });
  }

  const matchByOpened = new Map([...matches, ...aliasMatches].map((entry) => [entry.opened, entry]));
  return {
    matches: openedItems.map((item) => matchByOpened.get(item)).filter(Boolean),
    unresolvedItems: stillUnresolved,
    liveItems,
  };
}

export async function materializeFreshUnassigned(options = {}) {
  if (typeof options.invalidate !== 'function') throw new TypeError('invalidate is required');
  if (typeof options.requestFresh !== 'function') throw new TypeError('requestFresh is required');
  if (typeof options.readRepositoryItems !== 'function') throw new TypeError('readRepositoryItems is required');
  const openedItems = uniqueItems(options.openedItems || []);
  const attempts = Math.max(1, Math.min(2, Number(options.attempts || 2) || 2));
  const records = [];
  let latest = matchOpenedItemsToLiveUnassigned({ openedItems, liveItems: [], baselineIds: options.baselineIds });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const repositoryBefore = typeof options.readRepositoryState === 'function'
      ? options.readRepositoryState()
      : null;
    let invalidation = { invalidated: false, actions: [] };
    let invalidationError = null;
    try {
      invalidation = await options.invalidate();
    } catch (error) {
      invalidationError = error?.message || String(error);
    }

    let requestResult = null;
    let requestError = null;
    try {
      requestResult = await options.requestFresh();
    } catch (error) {
      requestError = error;
    }
    const repositoryItems = uniqueItems(options.readRepositoryItems() || []);
    const repositoryAfter = typeof options.readRepositoryState === 'function'
      ? options.readRepositoryState()
      : null;
    latest = matchOpenedItemsToLiveUnassigned({
      openedItems,
      liveItems: repositoryItems,
      baselineIds: options.baselineIds || [],
    });
    const record = {
      attempt,
      invalidation: {
        ...(invalidation || {}),
        error: invalidationError,
      },
      request: requestSummary(requestResult, requestError),
      repositoryBefore,
      repositoryAfter,
      repositoryCount: repositoryItems.length,
      repositoryItemIds: repositoryItems.map(itemId).filter(Boolean),
      matchedCount: latest.matches.length,
      unresolvedCount: latest.unresolvedItems.length,
      navigationTrigger: null,
    };
    records.push(record);

    if (!latest.unresolvedItems.length) {
      return {
        status: 'confirmed',
        attempt,
        attempts: attempt,
        matchedCount: latest.matches.length,
        unresolvedCount: 0,
        matches: latest.matches,
        unresolvedItems: [],
        records,
      };
    }

    if (attempt < attempts && typeof options.triggerNavigation === 'function') {
      try {
        record.navigationTrigger = await options.triggerNavigation();
      } catch (error) {
        record.navigationTrigger = { requested: false, confirmed: false, error: error?.message || String(error) };
      }
    }
  }

  return {
    status: 'blocked',
    attempts: records.length,
    matchedCount: latest.matches.length,
    unresolvedCount: latest.unresolvedItems.length,
    matches: latest.matches,
    unresolvedItems: latest.unresolvedItems,
    records,
  };
}
