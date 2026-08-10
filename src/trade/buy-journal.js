export const TRADE_BUY_JOURNAL_SCHEMA_VERSION = 1;
export const TRADE_BUY_JOURNAL_EVENT_LIMIT = 50;

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
    events: (Array.isArray(input.events) ? input.events : [])
      .slice(-TRADE_BUY_JOURNAL_EVENT_LIMIT)
      .map(safeEvent),
  };
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

  return Object.freeze({ begin, checkpoint, finish, snapshot: read });
}
