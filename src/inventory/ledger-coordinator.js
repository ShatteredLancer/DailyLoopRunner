import { createInventoryLedger } from './ledger.js';
import {
  capacityInventoryDelta,
  moveInventoryDelta,
  packReceiptInventoryDelta,
  playerPickInventoryDelta,
  submissionInventoryDelta,
} from './deltas.js';

const DEFAULT_RECONCILE_INTERVAL = 10;
const MAX_EVENTS = 100;

function normalizeReadiness(value = {}) {
  return {
    detected: value.detected === true,
    ready: value.ready !== false,
    fullyValidated: value.fullyValidated !== false,
    state: String(value.state || (value.ready === false ? 'not-ready' : 'ready')),
    cacheStatus: value.cacheStatus ? String(value.cacheStatus) : null,
  };
}

function refKey(value = {}) {
  return `${Number(value.id || value.ref?.id || 0)}:${Number(value.definitionId || value.ref?.definitionId || 0)}`;
}

function snapshotSignature(value = {}) {
  return JSON.stringify({
    id: Number(value.id || 0),
    definitionId: Number(value.definitionId || 0),
    rating: Number(value.rating || 0),
    rareflag: Number(value.rareflag || 0),
    rare: value.rare === true,
    special: value.special === true,
    tradeable: value.tradeable === true,
    leagueId: Number(value.leagueId || 0),
    duplicate: value.duplicate === true,
    duplicateId: Number(value.duplicateId || 0),
    limitedUse: value.limitedUse === true,
    concept: value.concept === true,
    evolution: value.evolution === true,
    academyEnrolled: value.academyEnrolled === true,
    activeTrade: value.activeTrade === true,
    endTime: value.endTime === undefined || value.endTime === null ? -1 : Number(value.endTime),
    groups: [...(value.groups || [])].map(Number).sort((a, b) => a - b),
  });
}

function safeReason(value) {
  return String(value || 'unknown').slice(0, 240);
}

export function createInventoryLedgerCoordinator(options = {}) {
  if (typeof options.readSnapshot !== 'function') throw new TypeError('readSnapshot is required');
  const readReadiness = typeof options.readReadiness === 'function'
    ? options.readReadiness
    : () => ({ detected: false, ready: true, fullyValidated: true, state: 'not-detected' });
  const now = options.now || (() => new Date().toISOString());
  const reconcileEvery = Math.max(1, Number(options.reconcileEvery || DEFAULT_RECONCILE_INTERVAL) || DEFAULT_RECONCILE_INTERVAL);
  const events = [];
  let ledger = null;
  let primarySubmissions = 0;

  function emit(type, details = {}) {
    const event = Object.freeze({
      at: String(now()),
      type: String(type),
      inventoryVersion: ledger?.summary().inventoryVersion || 0,
      details: Object.freeze({ ...details }),
    });
    events.push(event);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    options.log?.(`[Inventory Ledger] ${event.type} ${JSON.stringify(event.details)}`);
    return event;
  }

  async function currentReadiness() {
    return normalizeReadiness(await readReadiness());
  }

  async function initialize(reason = 'initial-index') {
    const readiness = await currentReadiness();
    if (!readiness.ready) {
      emit('initialize-blocked', { reason: `inventory source is ${readiness.state}`, readiness: readiness.state });
      return { ok: false, reason: `inventory source is ${readiness.state}`, readiness };
    }
    const snapshot = await options.readSnapshot({ reason, refresh: false });
    if (!snapshot?.piles) {
      emit('initialize-blocked', { reason: 'inventory snapshot is unavailable' });
      return { ok: false, reason: 'inventory snapshot is unavailable', readiness };
    }
    ledger = createInventoryLedger({
      snapshot,
      readiness,
      source: options.source || (readiness.detected ? `fsu-${readiness.state}` : 'ea-local-repository'),
      classifyItem: options.classifyItem,
      now,
      measureTime: options.measureTime,
    });
    const summary = ledger.summary();
    emit('initialized', {
      items: summary.itemCount,
      piles: summary.pileCounts,
      elapsedMs: summary.lastBuild?.elapsedMs || 0,
      readiness: readiness.state,
    });
    return { ok: true, summary };
  }

  function requireLedger() {
    if (!ledger) throw new Error('Inventory Ledger is not initialized');
    return ledger;
  }

  async function reconcile(reason = 'manual-reconciliation', optionsOverride = {}) {
    const active = requireLedger();
    const readiness = await currentReadiness();
    if (!readiness.ready) {
      active.markReconciliationRequired(`inventory source is ${readiness.state}`);
      emit('reconcile-blocked', { reason: safeReason(reason), readiness: readiness.state });
      return { ok: false, reason: `inventory source is ${readiness.state}` };
    }
    if (optionsOverride.refreshUnassigned === true && typeof options.refreshUnassigned === 'function') {
      await options.refreshUnassigned({ reason });
    }
    const snapshot = await options.readSnapshot({ reason, refresh: false });
    const result = active.reconcile(snapshot, {
      readiness,
      source: options.source || (readiness.detected ? `fsu-${readiness.state}` : 'ea-local-repository'),
    });
    emit(result.ok ? 'reconciled' : 'reconcile-blocked', {
      reason: safeReason(reason),
      drift: result.drift || null,
      readiness: readiness.state,
    });
    return result;
  }

  function applyDelta(delta) {
    const result = requireLedger().applyDelta(delta);
    emit(result.applied ? 'delta-applied' : 'delta-not-applied', {
      operation: String(delta.operation || 'unknown'),
      status: String(delta.status || 'unknown'),
      additions: delta.additions?.length || 0,
      removals: delta.removals?.length || 0,
      moves: delta.moves?.length || 0,
      reason: result.applied ? null : safeReason(result.reason),
    });
    return result;
  }

  async function recordPackReceipt(receipt, context = {}) {
    const delta = packReceiptInventoryDelta(receipt, {
      snapshotItem: options.snapshotItem,
      confirmedAt: context.confirmedAt || now(),
      ambiguous: context.ambiguous === true,
    });
    const applied = applyDelta(delta);
    if (context.reconcile === true || delta.status === 'ambiguous' || requireLedger().summary().needsReconciliation) {
      const reconciliation = await reconcile('post-pack-open', { refreshUnassigned: true });
      return { delta, applied, reconciliation };
    }
    return { delta, applied, reconciliation: null };
  }

  async function recordMove(input = {}) {
    const delta = moveInventoryDelta({ ...input, confirmedAt: input.confirmedAt || now() });
    const applied = applyDelta(delta);
    const reconciliation = delta.status === 'ambiguous' || requireLedger().summary().needsReconciliation
      ? await reconcile('post-move-anomaly', { refreshUnassigned: true })
      : null;
    return { delta, applied, reconciliation };
  }

  async function recordSubmission(result, context = {}) {
    const delta = submissionInventoryDelta(result, {
      confirmedAt: context.confirmedAt || now(),
      ambiguous: context.ambiguous === true,
      primary: context.primary === true,
    });
    const applied = applyDelta(delta);
    let reconciliation = null;
    if (applied.applied && context.primary === true) {
      primarySubmissions++;
      if (primarySubmissions % reconcileEvery === 0) {
        reconciliation = await reconcile(`periodic-primary-${primarySubmissions}`);
      }
    }
    if (!reconciliation && (delta.status === 'ambiguous' || requireLedger().summary().needsReconciliation)) {
      reconciliation = await reconcile('post-submission-anomaly');
    }
    return { delta, applied, reconciliation };
  }

  async function recordPickSelection(result, context = {}) {
    const delta = playerPickInventoryDelta(result, {
      snapshotItem: options.snapshotItem,
      confirmedAt: context.confirmedAt || now(),
      ambiguous: context.ambiguous === true,
      pile: context.pile,
    });
    const applied = applyDelta(delta);
    const reconciliation = delta.status === 'ambiguous' || requireLedger().summary().needsReconciliation
      ? await reconcile('post-pick-anomaly', { refreshUnassigned: true })
      : null;
    return { delta, applied, reconciliation };
  }

  async function recordCapacities(capacities, context = {}) {
    const delta = capacityInventoryDelta(capacities, {
      confirmed: context.confirmed !== false,
      confirmedAt: context.confirmedAt || now(),
      reason: context.reason,
    });
    const applied = applyDelta(delta);
    const reconciliation = delta.status === 'ambiguous' || requireLedger().summary().needsReconciliation
      ? await reconcile('post-capacity-anomaly')
      : null;
    return { delta, applied, reconciliation };
  }

  async function validateBeforeSubmit(itemRefs = [], context = {}) {
    const active = requireLedger();
    if (active.summary().needsReconciliation) {
      const reconciled = await reconcile(context.reason || 'pre-submit-stale-ledger');
      if (!reconciled.ok) return { ok: false, reason: reconciled.reason };
    }
    let validation = active.validateItemRefs(itemRefs);
    if (!validation.ok) {
      const reconciled = await reconcile(context.reason || 'pre-submit-item-drift');
      if (!reconciled.ok) return { ok: false, reason: reconciled.reason };
      validation = active.validateItemRefs(itemRefs);
      if (!validation.ok) {
        active.markReconciliationRequired('pre-submit item refs do not match the reconciled ledger');
        emit('pre-submit-blocked', { missing: validation.missing.length, moved: validation.moved.length });
        return { ok: false, reason: 'selected inventory items changed before submit', validation };
      }
    }

    const readiness = await currentReadiness();
    if (!readiness.ready) return { ok: false, reason: `inventory source is ${readiness.state}` };
    const clubRefs = itemRefs.filter((ref) => ref?.pile === 'club');
    if (readiness.fullyValidated !== false || !clubRefs.length) {
      emit('pre-submit-validated', { refs: itemRefs.length, clubRefs: clubRefs.length, targeted: false });
      return { ok: true, validation, targeted: false };
    }
    if (typeof options.validateClubPlayers !== 'function' || typeof options.snapshotItem !== 'function') {
      active.markReconciliationRequired('provisional Club targeted validation is unavailable');
      return { ok: false, reason: 'provisional Club targeted validation is unavailable' };
    }
    const targeted = await options.validateClubPlayers(clubRefs, {
      label: context.label || 'Inventory Ledger pre-submit validation',
    });
    if (!targeted?.ok) {
      active.markReconciliationRequired(targeted?.reason || 'provisional Club targeted validation failed');
      emit('pre-submit-blocked', { clubRefs: clubRefs.length, targeted: true, missing: targeted?.missing?.length || 0 });
      return { ok: false, reason: targeted?.reason || 'provisional Club targeted validation failed' };
    }
    const refreshedByRef = new Map((targeted.items || []).map((item) => [refKey(item), item]));
    const changed = [];
    const missing = [];
    for (const ref of clubRefs) {
      const refreshed = refreshedByRef.get(refKey(ref));
      const current = active.resolveItem(ref);
      if (!refreshed || !current) {
        missing.push(ref);
        continue;
      }
      const nextSnapshot = options.snapshotItem(refreshed, 'club');
      if (snapshotSignature(current) !== snapshotSignature(nextSnapshot)) changed.push(ref);
    }
    if (missing.length || changed.length) {
      active.markReconciliationRequired('provisional Club targeted validation changed selected inventory data');
      await reconcile('provisional-club-validation-drift');
      emit('pre-submit-blocked', { clubRefs: clubRefs.length, targeted: true, missing: missing.length, changed: changed.length });
      return { ok: false, reason: 'provisional Club data changed before submit; replan the squad' };
    }
    emit('pre-submit-validated', {
      refs: itemRefs.length,
      clubRefs: clubRefs.length,
      targeted: true,
      elapsedMs: Number(targeted.elapsed || 0),
    });
    return { ok: true, validation, targeted: true, refreshedItems: targeted.items || [] };
  }

  async function markAnomaly(reason) {
    const summary = requireLedger().markReconciliationRequired(reason);
    emit('anomaly', { reason: safeReason(reason) });
    const reconciliation = await reconcile(`anomaly: ${safeReason(reason)}`);
    return { summary, reconciliation };
  }

  function diagnostics() {
    return Object.freeze({
      summary: ledger?.summary() || null,
      primarySubmissions,
      reconcileEvery,
      events: Object.freeze([...events]),
    });
  }

  return Object.freeze({
    applyDelta,
    diagnostics,
    getLedger: () => ledger,
    initialize,
    markAnomaly,
    reconcile,
    recordCapacities,
    recordMove,
    recordPackReceipt,
    recordPickSelection,
    recordSubmission,
    validateBeforeSubmit,
  });
}
