export const TRADE_LISTING_JOURNAL_SCHEMA_VERSION = 1;
export const TRADE_LISTING_JOURNAL_EVENT_LIMIT = 80;
export const TRADE_LISTING_JOURNAL_ITEM_LIMIT = 2;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeRef(value) {
  if (!value) return null;
  return {
    id: safeNumber(value.id),
    definitionId: safeNumber(value.definitionId),
    pile: value.pile ? String(value.pile) : null,
  };
}

function safeResponse(value) {
  if (!value) return null;
  return {
    success: value.success === true,
    status: safeNumber(value.status),
    code: safeNumber(value.code ?? value.error?.code),
  };
}

function safeEvent(input = {}) {
  return {
    at: Math.max(0, safeNumber(input.at) ?? Date.now()),
    phase: String(input.phase || 'unknown'),
    itemIndex: safeNumber(input.itemIndex),
    status: input.status ? String(input.status) : null,
    reason: input.reason ? String(input.reason).slice(0, 160) : null,
    mutationBoundaryCrossed: input.mutationBoundaryCrossed === true,
    item: safeRef(input.item),
    listing: input.listing ? {
      startPrice: safeNumber(input.listing.startPrice),
      buyNow: safeNumber(input.listing.buyNow),
      durationSeconds: safeNumber(input.listing.durationSeconds),
    } : null,
    response: safeResponse(input.response),
  };
}

function safeItemState(input = {}, fallbackIndex = 0) {
  return {
    index: Math.max(1, Math.floor(safeNumber(input.index ?? input.itemIndex) ?? fallbackIndex + 1)),
    phase: String(input.phase || 'pending'),
    status: String(input.status || 'pending'),
    reason: input.reason ? String(input.reason).slice(0, 160) : null,
    mutationBoundaryCrossed: input.mutationBoundaryCrossed === true,
    item: safeRef(input.item),
    listing: input.listing ? {
      startPrice: safeNumber(input.listing.startPrice),
      buyNow: safeNumber(input.listing.buyNow),
      durationSeconds: safeNumber(input.listing.durationSeconds),
    } : null,
    updatedAt: Math.max(0, safeNumber(input.updatedAt ?? input.at) ?? 0),
  };
}

function preparedItems(input = []) {
  return (Array.isArray(input) ? input : [])
    .slice(0, TRADE_LISTING_JOURNAL_ITEM_LIMIT)
    .map((entry, index) => safeItemState({
      index: index + 1,
      phase: 'prepared',
      status: 'pending',
      item: entry.item,
      listing: {
        startPrice: entry.startPrice,
        buyNow: entry.buyNow,
        durationSeconds: entry.durationSeconds,
      },
      updatedAt: entry.updatedAt,
    }, index));
}

function updateItemStates(items, event) {
  const itemIndex = Math.floor(safeNumber(event.itemIndex) ?? 0);
  if (itemIndex < 1 || itemIndex > TRADE_LISTING_JOURNAL_ITEM_LIMIT) return items;
  const existing = items.find((entry) => entry.index === itemIndex) || { index: itemIndex };
  const next = safeItemState({
    ...existing,
    ...event,
    index: itemIndex,
    status: event.status || existing.status,
    reason: event.reason || existing.reason,
    mutationBoundaryCrossed: existing.mutationBoundaryCrossed === true || event.mutationBoundaryCrossed === true,
    item: event.item || existing.item,
    listing: event.listing || existing.listing,
    updatedAt: event.at,
  });
  return [...items.filter((entry) => entry.index !== itemIndex), next]
    .sort((left, right) => left.index - right.index)
    .slice(0, TRADE_LISTING_JOURNAL_ITEM_LIMIT);
}

export function normalizeTradeListingJournal(input = {}) {
  if (!input || typeof input !== 'object' || !input.runId) return null;
  return {
    schemaVersion: TRADE_LISTING_JOURNAL_SCHEMA_VERSION,
    runId: String(input.runId),
    jobId: String(input.jobId || ''),
    source: ['club', 'transfer'].includes(String(input.source || '')) ? String(input.source) : null,
    status: String(input.status || 'active'),
    phase: String(input.phase || 'started'),
    startedAt: Math.max(0, safeNumber(input.startedAt) ?? 0),
    updatedAt: Math.max(0, safeNumber(input.updatedAt) ?? 0),
    requested: Math.min(
      TRADE_LISTING_JOURNAL_ITEM_LIMIT,
      Math.max(0, Math.floor(safeNumber(input.requested) ?? 0)),
    ),
    items: (Array.isArray(input.items) ? input.items : [])
      .slice(0, TRADE_LISTING_JOURNAL_ITEM_LIMIT)
      .map(safeItemState),
    events: (Array.isArray(input.events) ? input.events : [])
      .slice(-TRADE_LISTING_JOURNAL_EVENT_LIMIT)
      .map(safeEvent),
  };
}

export function createTradeListingJournal(options = {}) {
  const storage = options.storage;
  const key = String(options.key || 'fc-loop-runner-trade-listing-journal-v1');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let memory = null;

  function read() {
    const stored = storage?.get?.(key, null);
    if (stored && typeof stored === 'object') memory = normalizeTradeListingJournal(stored);
    return normalizeTradeListingJournal(memory);
  }

  function write(value) {
    memory = normalizeTradeListingJournal(value);
    if (memory) storage?.set?.(key, clone(memory));
    else storage?.remove?.(key);
    return read();
  }

  function begin(input = {}) {
    const recovery = inspectRecovery();
    if (!recovery.canSupersede) throw new Error(recovery.reason);
    const at = Math.max(0, safeNumber(input.at) ?? Number(now()));
    const event = safeEvent({ at, phase: input.phase || 'prepare-started' });
    return write({
      runId: input.runId,
      jobId: input.jobId,
      source: input.source,
      status: 'active',
      phase: event.phase,
      startedAt: at,
      updatedAt: at,
      requested: input.requested,
      items: preparedItems(input.items).map((entry) => ({ ...entry, updatedAt: at })),
      events: [event],
    });
  }

  function checkpoint(runId, input = {}) {
    const current = read();
    if (!current || current.runId !== String(runId || '')) return current;
    const event = safeEvent({ ...input, at: input.at ?? now() });
    const replacementItems = Array.isArray(input.items)
      ? preparedItems(input.items).map((entry) => ({ ...entry, updatedAt: event.at }))
      : null;
    return write({
      ...current,
      status: 'active',
      phase: event.phase,
      updatedAt: event.at,
      requested: replacementItems ? replacementItems.length : current.requested,
      items: replacementItems || updateItemStates(current.items, event),
      events: [...current.events, event].slice(-TRADE_LISTING_JOURNAL_EVENT_LIMIT),
    });
  }

  function finish(runId, input = {}) {
    const current = read();
    if (!current || current.runId !== String(runId || '')) return current;
    const event = safeEvent({ ...input, phase: input.phase || 'finished', at: input.at ?? now() });
    return write({
      ...current,
      status: String(input.status || 'completed'),
      phase: event.phase,
      updatedAt: event.at,
      items: updateItemStates(current.items, event),
      events: [...current.events, event].slice(-TRADE_LISTING_JOURNAL_EVENT_LIMIT),
    });
  }

  function inspectRecovery() {
    const current = read();
    const active = current?.status === 'active';
    const mutationBoundaryCrossed = Boolean(current?.items.some((entry) => entry.mutationBoundaryCrossed));
    const uncertainMutation = Boolean(current?.items.some((entry) => (
      entry.mutationBoundaryCrossed
      && !['listed', 'failed'].includes(entry.status)
    )));
    const requiresReview = mutationBoundaryCrossed && (active || uncertainMutation);
    return {
      active,
      runId: current?.runId || null,
      mutationBoundaryCrossed,
      uncertainMutation,
      canSupersede: !requiresReview,
      reason: requiresReview ? 'listing-journal-mutation-review-required' : null,
    };
  }

  return Object.freeze({ begin, checkpoint, finish, inspectRecovery, snapshot: read });
}
