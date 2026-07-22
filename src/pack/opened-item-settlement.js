function boundedAttempts(value, fallback = 3) {
  const number = Number(value);
  return Math.max(1, Math.min(10, Number.isFinite(number) ? Math.floor(number) : fallback));
}

export async function settleOpenedItems(options = {}) {
  if (typeof options.materialize !== 'function') throw new TypeError('materialize is required');
  if (typeof options.cleanup !== 'function') throw new TypeError('cleanup is required');
  if (typeof options.confirmRouting !== 'function') throw new TypeError('confirmRouting is required');
  const attempts = boundedAttempts(options.attempts, 3);
  const materialized = await options.materialize();
  let cleanup = null;
  let routing = { reservedItems: [], routedItems: [], pendingItems: [] };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    cleanup = await options.cleanup({ attempt, materialized });
    routing = await options.confirmRouting({ attempt, materialized, cleanup }) || routing;
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
