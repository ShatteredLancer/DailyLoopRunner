function boundedAttempts(value, fallback = 3) {
  const number = Number(value);
  return Math.max(1, Math.min(10, Number.isFinite(number) ? Math.floor(number) : fallback));
}

function itemKey(item) {
  const id = Number(item?.id || item?.ref?.id || 0);
  if (id) return `id:${id}`;
  const definition = Number(item?.definitionId || item?.ref?.definitionId || 0);
  const pile = String(item?.pile || item?.ref?.pile || 'unknown');
  return definition ? `definition:${definition}:${pile}` : null;
}

function exactPileContainsId(items, id) {
  return (items || []).some((item) => Number(item?.id || 0) === id);
}

// An EA native duplicate swap is unusual: the response entity itself moves
// into Club and EA creates the former Club entity in Unassigned.  The action
// executor sees both exact IDs immediately after the successful move, while a
// later full Club refresh can legitimately return a stale cache.  Preserve
// only that narrow, exact post-move fact for the current receipt; never infer
// a route from definition, rating, or a duplicate counterpart.
export function collectNativeSwapRoutingEvidence(actionState, trackedItemIds = []) {
  if (actionState?.action?.type !== 'swap') return [];
  const tracked = new Set((trackedItemIds || []).map(Number).filter(Boolean));
  if (!tracked.size) return [];

  const evidence = [];
  for (const location of actionState?.exactLocations || []) {
    const id = Number(location?.ref?.id || 0);
    if (!id || !tracked.has(id)) continue;
    const piles = location?.piles || {};
    if (!exactPileContainsId(piles.club, id)) continue;
    if (['unassigned', 'storage', 'transfer'].some((pile) => exactPileContainsId(piles[pile], id))) continue;
    evidence.push({
      itemId: id,
      destination: 'club',
      source: 'native-swap-exact-location',
    });
  }
  return evidence;
}

function applyConfirmedRouteEvidence(routing, cleanup) {
  const current = routing || { reservedItems: [], routedItems: [], pendingItems: [] };
  const safeIds = new Set((cleanup?.routeEvidence || [])
    .filter((entry) => entry?.source === 'native-swap-exact-location' && entry?.destination === 'club')
    .map((entry) => Number(entry?.itemId || 0))
    .filter(Boolean));
  if (!safeIds.size) return current;

  const confirmed = (current.pendingItems || []).filter((item) => safeIds.has(Number(item?.id || 0)));
  if (!confirmed.length) return current;
  const routed = new Map((current.routedItems || []).map((item) => [itemKey(item), item]));
  for (const item of confirmed) routed.set(itemKey(item), item);
  return {
    ...current,
    routedItems: [...routed.values()],
    pendingItems: (current.pendingItems || []).filter((item) => !safeIds.has(Number(item?.id || 0))),
  };
}

function mergeRoutingProgress(routing, settled) {
  const current = routing || { reservedItems: [], routedItems: [], pendingItems: [] };
  const remember = (items, kind) => {
    for (const item of items || []) {
      const key = itemKey(item);
      if (!key) continue;
      const previous = settled.get(key) || {};
      // A destination/reservation that was already confirmed is terminal for
      // this receipt. Never let a later stale repository read re-open it or
      // change its route.
      if (previous.reserved || previous.routed) continue;
      settled.set(key, {
        ...previous,
        [kind]: item,
      });
    }
  };
  remember(current.reservedItems, 'reserved');
  remember(current.routedItems, 'routed');

  const reservedItems = [];
  const routedItems = [];
  for (const entry of settled.values()) {
    if (entry.reserved) reservedItems.push(entry.reserved);
    if (entry.routed) routedItems.push(entry.routed);
  }
  const settledKeys = new Set(settled.keys());
  const pendingItems = (current.pendingItems || []).filter((item) => !settledKeys.has(itemKey(item)));
  const aliasRoutes = (current.aliasRoutes || []).filter((route) => !settledKeys.has(itemKey(route?.item)));

  return {
    ...current,
    reservedItems,
    routedItems,
    pendingItems,
    aliasRoutes,
  };
}

export async function settleOpenedItems(options = {}) {
  if (typeof options.materialize !== 'function') throw new TypeError('materialize is required');
  if (typeof options.cleanup !== 'function') throw new TypeError('cleanup is required');
  if (typeof options.confirmRouting !== 'function') throw new TypeError('confirmRouting is required');
  const attempts = boundedAttempts(options.attempts, 3);
  const materialized = await options.materialize();
  let cleanup = null;
  let routing = { reservedItems: [], routedItems: [], pendingItems: [] };
  const settled = new Map();
  let pendingItems = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    cleanup = await options.cleanup({ attempt, materialized, routing, pendingItems });
    routing = mergeRoutingProgress(
      applyConfirmedRouteEvidence(
        await options.confirmRouting({ attempt, materialized, cleanup, pendingItems }) || routing,
        cleanup,
      ),
      settled,
    );
    pendingItems = routing.pendingItems || [];
    if (!(routing.pendingItems || []).length) {
      return { status: cleanup?.status || 'resolved', attempts: attempt, materialized, cleanup, routing };
    }
    if (cleanup?.status === 'preserved') {
      return { status: 'preserved', attempts: attempt, materialized, cleanup, routing };
    }
    if (attempt < attempts) {
      await options.onRetry?.({ attempt, materialized, cleanup, routing });
    }
  }

  const pendingCount = (routing.pendingItems || []).length;
  return {
    status: 'pending',
    reason: `${pendingCount} opened item(s) remain unresolved after ${attempts} settlement attempt(s)`,
    attempts,
    materialized,
    cleanup,
    routing,
  };
}
