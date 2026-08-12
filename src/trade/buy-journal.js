export const TRADE_BUY_JOURNAL_SCHEMA_VERSION = 2;
export const TRADE_BUY_JOURNAL_EVENT_LIMIT = 80;
export const TRADE_BUY_JOURNAL_ITEM_LIMIT = 4;

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
    chunkIndex: safeNumber(input.chunkIndex),
    offset: safeNumber(input.offset),
    quantity: safeNumber(input.quantity),
    required: safeNumber(input.required),
    remaining: safeNumber(input.remaining),
    retryAt: safeNumber(input.retryAt),
    mutationBoundaryCrossed: input.mutationBoundaryCrossed === true,
    status: input.status ? String(input.status) : null,
    reason: input.reason ? String(input.reason).slice(0, 160) : null,
    destination: input.destination ? String(input.destination) : null,
    item: safeRef(input.item),
    tradeId: safeNumber(input.tradeId),
    price: safeNumber(input.price),
    search: input.search ? {
      rating: safeNumber(input.search.rating),
      definitionId: safeNumber(input.search.definitionId),
      maxBuyNow: safeNumber(input.search.maxBuyNow),
      page: safeNumber(input.search.page),
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
    tradeId: safeNumber(input.tradeId),
    price: safeNumber(input.price),
    destination: input.destination ? String(input.destination) : null,
    updatedAt: Math.max(0, safeNumber(input.updatedAt ?? input.at) ?? 0),
  };
}

function updateItemStates(items, event) {
  const itemIndex = Math.floor(safeNumber(event.itemIndex) ?? 0);
  if (itemIndex < 1 || itemIndex > TRADE_BUY_JOURNAL_ITEM_LIMIT) return items;
  const existing = items.find((entry) => entry.index === itemIndex) || { index: itemIndex };
  const next = safeItemState({
    ...existing,
    ...event,
    index: itemIndex,
    status: event.status || existing.status,
    reason: event.reason || existing.reason,
    mutationBoundaryCrossed: existing.mutationBoundaryCrossed === true || event.mutationBoundaryCrossed === true,
    item: event.item || existing.item,
    tradeId: event.tradeId ?? existing.tradeId,
    price: event.price ?? existing.price,
    destination: event.destination || existing.destination,
    updatedAt: event.at,
  });
  return [...items.filter((entry) => entry.index !== itemIndex), next]
    .sort((left, right) => left.index - right.index)
    .slice(0, TRADE_BUY_JOURNAL_ITEM_LIMIT);
}

export function normalizeTradeBuyJournal(input = {}) {
  if (!input || typeof input !== 'object' || !input.runId) return null;
  return {
    schemaVersion: TRADE_BUY_JOURNAL_SCHEMA_VERSION,
    runId: String(input.runId),
    jobId: String(input.jobId || ''),
    expectedDestination: ['auto', 'club', 'transfer'].includes(String(input.expectedDestination || ''))
      ? String(input.expectedDestination)
      : null,
    status: String(input.status || 'active'),
    phase: String(input.phase || 'started'),
    startedAt: Math.max(0, safeNumber(input.startedAt) ?? 0),
    updatedAt: Math.max(0, safeNumber(input.updatedAt) ?? 0),
    requested: Math.min(
      TRADE_BUY_JOURNAL_ITEM_LIMIT,
      Math.max(0, Math.floor(safeNumber(input.requested) ?? 0)),
    ),
    items: (Array.isArray(input.items) ? input.items : [])
      .slice(0, TRADE_BUY_JOURNAL_ITEM_LIMIT)
      .map(safeItemState),
    events: (Array.isArray(input.events) ? input.events : [])
      .slice(-TRADE_BUY_JOURNAL_EVENT_LIMIT)
      .map(safeEvent),
  };
}

export function reconcileResolvedTradeBuyJournal(options = {}) {
  const journal = options.journal;
  const adapter = options.adapter;
  const recovery = journal?.inspectRecovery?.();
  if (!recovery || recovery.canSupersede !== false) {
    return { status: 'not-needed', reason: null, items: [] };
  }
  if (typeof adapter?.inspectPurchase !== 'function') {
    return { status: 'blocked', reason: 'buy-journal-inspection-unavailable', items: [] };
  }
  const snapshot = journal.snapshot?.();
  const uncertain = (snapshot?.items || []).filter((entry) => (
    entry.mutationBoundaryCrossed === true
    && !['purchased', 'competition-lost', 'failed'].includes(entry.status)
  ));
  if (!snapshot?.runId || !uncertain.length) {
    return { status: 'blocked', reason: recovery.reason || 'buy-journal-mutation-review-required', items: [] };
  }
  const items = uncertain.map((entry) => {
    const inspected = adapter.inspectPurchase({
      ...entry.item,
      pile: entry.destination,
      tradeId: entry.tradeId,
      price: entry.price,
    });
    const actual = inspected?.candidate?.item || null;
    const exactId = Number(actual?.id || 0) > 0 && Number(actual.id) === Number(entry.item?.id || 0);
    const atDestination = exactId && String(actual?.pile || '') === String(entry.destination || '');
    return {
      index: entry.index,
      status: inspected?.status || 'not-found',
      item: actual,
      destination: entry.destination,
      resolved: atDestination,
    };
  });
  if (!items.every((entry) => entry.resolved)) {
    return { status: 'blocked', reason: 'buy-journal-item-destination-unconfirmed', items };
  }
  const at = Math.max(0, Number(options.now?.() ?? Date.now()));
  for (const entry of items) {
    journal.checkpoint(snapshot.runId, {
      at,
      phase: 'journal-destination-reconciled',
      itemIndex: entry.index,
      item: entry.item,
      destination: entry.destination,
      status: 'purchased',
      reason: 'journal-destination-reconciled',
      mutationBoundaryCrossed: true,
    });
  }
  journal.finish(snapshot.runId, {
    at,
    phase: 'journal-reconciliation-completed',
    status: 'completed',
    reason: 'journal-destination-reconciled',
  });
  return { status: 'reconciled', reason: 'buy-journal-reconciled-retry-required', items };
}

export function createTradeBuyJournal(options = {}) {
  const storage = options.storage;
  const key = String(options.key || 'fc-loop-runner-trade-buy-journal-v1');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let memory = null;

  function read() {
    const stored = storage?.get?.(key, null);
    if (stored && typeof stored === 'object') memory = normalizeTradeBuyJournal(stored);
    return normalizeTradeBuyJournal(memory);
  }

  function write(value) {
    memory = normalizeTradeBuyJournal(value);
    if (memory) storage?.set?.(key, clone(memory));
    else storage?.remove?.(key);
    return read();
  }

  function begin(input = {}) {
    const recovery = inspectRecovery();
    if (!recovery.canSupersede) throw new Error(recovery.reason);
    const at = Math.max(0, safeNumber(input.at) ?? Number(now()));
    const event = safeEvent({ at, phase: 'started', destination: input.expectedDestination });
    return write({
      runId: input.runId,
      jobId: input.jobId,
      expectedDestination: input.expectedDestination,
      status: 'active',
      phase: event.phase,
      startedAt: at,
      updatedAt: at,
      requested: input.requested,
      items: [],
      events: [event],
    });
  }

  function checkpoint(runId, input = {}) {
    const current = read();
    if (!current || current.runId !== String(runId || '')) return current;
    const event = safeEvent({ ...input, at: input.at ?? now() });
    return write({
      ...current,
      status: 'active',
      phase: event.phase,
      updatedAt: event.at,
      items: updateItemStates(current.items, event),
      events: [...current.events, event].slice(-TRADE_BUY_JOURNAL_EVENT_LIMIT),
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
      events: [...current.events, event].slice(-TRADE_BUY_JOURNAL_EVENT_LIMIT),
    });
  }

  function inspectRecovery() {
    const current = read();
    const active = current?.status === 'active';
    const mutationBoundaryCrossed = Boolean(current?.items.some((entry) => entry.mutationBoundaryCrossed));
    const uncertainMutation = Boolean(current?.items.some((entry) => (
      entry.mutationBoundaryCrossed
      && !['purchased', 'competition-lost', 'failed'].includes(entry.status)
    )));
    const requiresReview = current?.status !== 'acknowledged'
      && mutationBoundaryCrossed
      && (active || uncertainMutation);
    return {
      active,
      runId: current?.runId || null,
      mutationBoundaryCrossed,
      uncertainMutation,
      canSupersede: !requiresReview,
      reason: requiresReview ? 'buy-journal-mutation-review-required' : null,
    };
  }

  function acknowledge(input = {}) {
    const current = read();
    if (!current || current.runId !== String(input.runId || '')) return current;
    if (typeof input.evidenceHashFor !== 'function'
      || input.evidenceHashFor(current) !== String(input.evidenceHash || '')) return current;
    const at = Math.max(0, safeNumber(input.at) ?? Number(now()));
    return write({
      ...current,
      status: 'acknowledged',
      phase: 'manual-recovery-acknowledged',
      updatedAt: at,
      events: [...current.events, safeEvent({
        at,
        phase: 'manual-recovery-acknowledged',
        status: 'acknowledged',
        reason: input.reason,
      })].slice(-TRADE_BUY_JOURNAL_EVENT_LIMIT),
    });
  }

  return Object.freeze({ acknowledge, begin, checkpoint, finish, inspectRecovery, snapshot: read });
}
