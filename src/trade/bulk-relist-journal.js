import { normalizeBulkRelistSnapshot, TRADE_BULK_RELIST_ITEM_LIMIT } from './bulk-relist-snapshot.js';

export const TRADE_BULK_RELIST_JOURNAL_SCHEMA_VERSION = 1;
export const TRADE_BULK_RELIST_JOURNAL_EVENT_LIMIT = 40;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
    mutationBoundaryCrossed: input.mutationBoundaryCrossed === true,
    response: safeResponse(input.response),
  };
}

function safeItem(input = {}, index = 0) {
  return {
    index: index + 1,
    status: String(input.status || 'pending'),
    mutationBoundaryCrossed: input.mutationBoundaryCrossed === true,
    item: {
      id: safeNumber(input.item?.id),
      definitionId: safeNumber(input.item?.definitionId),
      pile: 'transfer',
    },
    auction: input.auction ? {
      state: String(input.auction.state || 'unknown'),
      tradeId: safeNumber(input.auction.tradeId),
      startingBid: safeNumber(input.auction.startingBid),
      buyNowPrice: safeNumber(input.auction.buyNowPrice),
    } : null,
  };
}

export function normalizeTradeBulkRelistJournal(input = {}) {
  if (!input || typeof input !== 'object' || !input.runId) return null;
  return {
    schemaVersion: TRADE_BULK_RELIST_JOURNAL_SCHEMA_VERSION,
    runId: String(input.runId),
    jobId: String(input.jobId || 'manual-bulk-relist'),
    status: String(input.status || 'active'),
    phase: String(input.phase || 'started'),
    startedAt: Math.max(0, safeNumber(input.startedAt) ?? 0),
    updatedAt: Math.max(0, safeNumber(input.updatedAt) ?? 0),
    requested: Math.min(TRADE_BULK_RELIST_ITEM_LIMIT, Math.max(0, Math.floor(safeNumber(input.requested) ?? 0))),
    mutationBoundaryCrossed: input.mutationBoundaryCrossed === true,
    before: input.before ? normalizeBulkRelistSnapshot(input.before) : null,
    after: input.after ? normalizeBulkRelistSnapshot(input.after) : null,
    items: (Array.isArray(input.items) ? input.items : [])
      .slice(0, TRADE_BULK_RELIST_ITEM_LIMIT)
      .map(safeItem),
    events: (Array.isArray(input.events) ? input.events : [])
      .slice(-TRADE_BULK_RELIST_JOURNAL_EVENT_LIMIT)
      .map(safeEvent),
  };
}

export function createTradeBulkRelistJournal(options = {}) {
  const storage = options.storage;
  const key = String(options.key || 'fc-loop-runner-trade-bulk-relist-journal-v1');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let memory = null;

  function read() {
    const stored = storage?.get?.(key, null);
    if (stored && typeof stored === 'object') memory = normalizeTradeBulkRelistJournal(stored);
    return normalizeTradeBulkRelistJournal(memory);
  }

  function write(value) {
    memory = normalizeTradeBulkRelistJournal(value);
    if (memory) storage?.set?.(key, clone(memory));
    else storage?.remove?.(key);
    return read();
  }

  function inspectRecovery(input = {}) {
    const current = read();
    const matchingRun = String(input.runId || '') === String(current?.runId || '');
    const uncertain = current?.mutationBoundaryCrossed === true
      && current?.items.some((item) => item.status !== 'relisted' && item.status !== 'failed');
    const requiresReview = current?.status !== 'acknowledged'
      && current?.mutationBoundaryCrossed === true
      && (current.status === 'active' || uncertain);
    return {
      active: current?.status === 'active',
      runId: current?.runId || null,
      mutationBoundaryCrossed: current?.mutationBoundaryCrossed === true,
      uncertainMutation: Boolean(uncertain),
      canResume: false,
      canSupersede: matchingRun || !requiresReview,
      reason: requiresReview ? 'bulk-relist-journal-mutation-review-required' : null,
    };
  }

  function begin(input = {}) {
    const recovery = inspectRecovery({ runId: input.runId });
    if (!recovery.canSupersede) throw new Error(recovery.reason);
    const at = Math.max(0, safeNumber(input.at) ?? Number(now()));
    const before = normalizeBulkRelistSnapshot(input.before);
    return write({
      runId: input.runId,
      jobId: input.jobId,
      status: 'active',
      phase: 'preview-confirmed',
      startedAt: at,
      updatedAt: at,
      requested: before.unsoldCount,
      mutationBoundaryCrossed: false,
      before,
      after: null,
      items: before.items.map((entry) => ({ ...entry, status: 'pending', mutationBoundaryCrossed: false })),
      events: [safeEvent({ at, phase: 'preview-confirmed' })],
    });
  }

  function checkpoint(runId, input = {}) {
    const current = read();
    if (!current || current.runId !== String(runId || '')) return current;
    const event = safeEvent({ ...input, at: input.at ?? now() });
    const statuses = new Map((input.items || []).map((item) => [Number(item.item?.id), item]));
    const mutationBoundaryCrossed = current.mutationBoundaryCrossed || event.mutationBoundaryCrossed;
    const items = current.items.map((item) => {
      const replacement = statuses.get(Number(item.item.id));
      return safeItem({
        ...item,
        status: replacement?.status || input.itemStatus || item.status,
        mutationBoundaryCrossed: item.mutationBoundaryCrossed || event.mutationBoundaryCrossed,
      }, item.index - 1);
    });
    return write({
      ...current,
      status: 'active',
      phase: event.phase,
      updatedAt: event.at,
      mutationBoundaryCrossed,
      after: input.after || current.after,
      items,
      events: [...current.events, event].slice(-TRADE_BULK_RELIST_JOURNAL_EVENT_LIMIT),
    });
  }

  function finish(runId, input = {}) {
    const current = read();
    if (!current || current.runId !== String(runId || '')) return current;
    const event = safeEvent({ ...input, phase: input.phase || 'finished', at: input.at ?? now() });
    const updated = checkpoint(runId, { ...input, phase: event.phase, at: event.at });
    return write({ ...updated, status: String(input.status || 'completed'), phase: event.phase, updatedAt: event.at });
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
        at, phase: 'manual-recovery-acknowledged', status: 'acknowledged', reason: input.reason,
      })].slice(-TRADE_BULK_RELIST_JOURNAL_EVENT_LIMIT),
    });
  }

  return Object.freeze({ acknowledge, begin, checkpoint, finish, inspectRecovery, snapshot: read });
}
