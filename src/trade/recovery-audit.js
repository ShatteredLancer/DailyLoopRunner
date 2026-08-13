export const TRADE_RECOVERY_AUDIT_SCHEMA_VERSION = 1;
export const TRADE_RECOVERY_AUDIT_LIMIT = 20;
export const TRADE_RECOVERY_RESOLUTIONS = Object.freeze([
  'confirmed-completed',
  'confirmed-not-completed',
  'archive-unknown',
]);

const TERMINAL_HISTORY_STATUSES = new Set([
  'completed',
  'blocked',
  'missed',
  'stopped',
  'failed',
  'error',
  'ambiguous',
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function evidence(journalType, journal = {}) {
  const items = (Array.isArray(journal.items) ? journal.items : []).map((item) => ({
    index: Number(item.index || 0),
    status: String(item.status || ''),
    mutationBoundaryCrossed: item.mutationBoundaryCrossed === true,
    item: item.item ? {
      id: Number(item.item.id || 0) || null,
      definitionId: Number(item.item.definitionId || 0) || null,
      pile: item.item.pile ? String(item.item.pile) : null,
    } : null,
    destination: item.destination ? String(item.destination) : null,
  }));
  return {
    journalType: String(journalType || ''),
    runId: String(journal.runId || ''),
    jobId: String(journal.jobId || ''),
    status: String(journal.status || ''),
    phase: String(journal.phase || ''),
    updatedAt: Math.max(0, Number(journal.updatedAt || 0)),
    items,
  };
}

function leaseEvidence(leaseState = {}) {
  const lease = leaseState.lease || {};
  return {
    journalType: 'lease',
    runId: String(lease.runId || ''),
    jobId: String(lease.jobId || ''),
    ownerId: String(lease.ownerId || ''),
    acquiredAt: Math.max(0, Number(lease.acquiredAt || 0)),
    heartbeatAt: Math.max(0, Number(lease.heartbeatAt || 0)),
    expiresAt: Math.max(0, Number(lease.expiresAt || 0)),
    expired: leaseState.expired === true,
  };
}

export function tradeRecoveryEvidenceHash(journalType, journal = {}) {
  return stableHash(JSON.stringify(evidence(journalType, journal)));
}

export function tradeLeaseRecoveryEvidenceHash(leaseState = {}) {
  return stableHash(JSON.stringify(leaseEvidence(leaseState)));
}

export function inspectTradeRecoveryJournal(journalType, journal = null, options = {}) {
  if (!journal?.runId) return { reviewRequired: false, reason: null, journalType, journal: null };
  const mutationItems = (journal.items || []).filter((item) => item.mutationBoundaryCrossed === true);
  const terminal = journalType === 'buy'
    ? new Set(['purchased', 'competition-lost', 'failed'])
    : journalType === 'bulk-relist'
      ? new Set(['relisted', 'failed'])
      : new Set(['listed', 'failed']);
  const uncertainItems = mutationItems.filter((item) => !terminal.has(item.status));
  const continuationReserved = options.continuationActive === true
    && ['active', 'deferred'].includes(journal.status)
    && uncertainItems.length === 0;
  const reviewRequired = journal.status !== 'acknowledged'
    && mutationItems.length > 0
    && ((journal.status === 'active' && !continuationReserved) || uncertainItems.length > 0);
  const evidenceHash = tradeRecoveryEvidenceHash(journalType, journal);
  return {
    reviewRequired,
    reason: reviewRequired ? `${journalType}-journal-mutation-review-required` : null,
    journalType,
    runId: String(journal.runId),
    jobId: String(journal.jobId || ''),
    status: String(journal.status || ''),
    phase: String(journal.phase || ''),
    mutationItemCount: mutationItems.length,
    uncertainItemCount: uncertainItems.length,
    continuationReserved,
    evidenceHash,
    risk: reviewRequired ? 'high' : null,
  };
}

export function partitionTradeRecoveryReviews(journalReviews = [], leaseState = {}) {
  const lease = leaseState.active === true ? leaseState.lease : null;
  const reviews = [];
  const inFlightReviews = [];
  for (const review of Array.isArray(journalReviews) ? journalReviews : []) {
    if (review.reviewRequired !== true) continue;
    const belongsToActiveLease = review.reviewRequired === true
      && lease?.runId
      && String(review.runId || '') === String(lease.runId)
      && String(review.jobId || '') === String(lease.jobId || '');
    (belongsToActiveLease ? inFlightReviews : reviews).push(review);
  }
  return { reviews, inFlightReviews };
}

export function inspectTradeExpiredLeaseReview(input = {}) {
  const leaseState = input.leaseState || {};
  const lease = leaseState.lease || null;
  if (leaseState.expired !== true || !lease?.runId) {
    return { reviewRequired: false, reason: null, journalType: 'lease', runId: null };
  }
  const history = (input.history || []).find((entry) => (
    String(entry.runId || '') === String(lease.runId)
    && TERMINAL_HISTORY_STATUSES.has(String(entry.status || ''))
  ));
  const journalReviews = Array.isArray(input.journalReviews) ? input.journalReviews : [];
  const matchingJournalReview = journalReviews.find((review) => (
    review.reviewRequired === true && String(review.runId || '') === String(lease.runId)
  ));
  const continuation = input.continuation || null;
  const matchingContinuation = continuation?.runId
    && String(continuation.runId) === String(lease.runId)
    && (!lease.jobId || !continuation.jobId || String(continuation.jobId) === String(lease.jobId));
  if (history || matchingJournalReview || matchingContinuation) {
    return {
      reviewRequired: false,
      reason: matchingJournalReview?.reason
        || (matchingContinuation ? 'expired-lease-persisted-continuation-confirmed' : null),
      journalType: 'lease',
      runId: String(lease.runId),
    };
  }
  const evidenceHash = tradeLeaseRecoveryEvidenceHash(leaseState);
  return {
    reviewRequired: true,
    reason: 'expired-lease-terminal-history-missing',
    journalType: 'lease',
    runId: String(lease.runId),
    jobId: String(lease.jobId || ''),
    status: 'expired',
    phase: 'terminal-history-missing',
    mutationItemCount: 0,
    uncertainItemCount: 0,
    evidenceHash,
    risk: 'high',
  };
}

export function validateTradeRecoveryAuditEntry(review = {}, resolution = '') {
  if (review.reviewRequired !== true || !review.runId || !review.evidenceHash) {
    throw new Error('recovery-audit-review-invalid');
  }
  const normalizedResolution = String(resolution || '');
  if (!TRADE_RECOVERY_RESOLUTIONS.includes(normalizedResolution)) {
    throw new Error('recovery-audit-resolution-invalid');
  }
  return normalizedResolution;
}

export function createTradeRecoveryHistoryReceipt(review = {}, journal = {}, options = {}) {
  const journalType = String(review.journalType || '');
  if (!['buy', 'listing', 'bulk-relist'].includes(journalType) || !review.runId || !review.evidenceHash) {
    throw new Error('recovery-history-review-invalid');
  }
  const items = Array.isArray(journal.items) ? journal.items : [];
  const succeeded = items.filter((item) => (
    journalType === 'buy'
      ? item.status === 'purchased'
      : journalType === 'bulk-relist' ? item.status === 'relisted' : item.status === 'listed'
  )).length;
  const failed = items.filter((item) => ['failed', 'competition-lost'].includes(item.status)).length;
  const requested = Math.max(Number(journal.requested || 0), items.length);
  const finishedAt = Math.max(0, Number(options.now?.() ?? Date.now()));
  return createTradeRunReceipt({
    runId: review.runId,
    jobId: review.jobId,
    jobType: journalType,
    scheduledFor: journal.startedAt,
    startedAt: journal.startedAt,
    finishedAt,
    status: 'blocked',
    reason: 'manual-recovery-acknowledged',
    requested,
    succeeded,
    failed,
    skipped: Math.max(0, requested - succeeded - failed),
    receipts: items.map((item) => ({
      index: Number(item.index || 0),
      status: String(item.status || ''),
      mutationBoundaryCrossed: item.mutationBoundaryCrossed === true,
      item: item.item ? {
        id: Number(item.item.id || 0) || null,
        definitionId: Number(item.item.definitionId || 0) || null,
        pile: item.item.pile ? String(item.item.pile) : null,
      } : null,
      destination: item.destination ? String(item.destination) : null,
    })),
  });
}

export function createTradeLeaseRecoveryHistoryReceipt(review = {}, options = {}) {
  if (review.journalType !== 'lease' || !review.runId || !review.evidenceHash) {
    throw new Error('lease-recovery-history-review-invalid');
  }
  const lease = options.leaseState?.lease || {};
  const jobType = ['buy', 'listing', 'bulk-relist'].includes(options.jobType) ? options.jobType : 'unknown';
  const finishedAt = Math.max(0, Number(options.now?.() ?? Date.now()));
  return createTradeRunReceipt({
    runId: review.runId,
    jobId: review.jobId,
    jobType,
    scheduledFor: lease.acquiredAt,
    startedAt: lease.acquiredAt,
    finishedAt,
    status: 'blocked',
    reason: 'manual-lease-recovery-acknowledged',
    requested: 0,
    receipts: [{
      status: 'blocked',
      reason: 'manual-lease-recovery-acknowledged',
      evidenceHash: review.evidenceHash,
    }],
  });
}

export function normalizeTradeRecoveryAudit(input = {}) {
  return {
    schemaVersion: TRADE_RECOVERY_AUDIT_SCHEMA_VERSION,
    entries: (Array.isArray(input.entries) ? input.entries : [])
      .slice(-TRADE_RECOVERY_AUDIT_LIMIT)
      .map((entry) => ({
        acknowledgedAt: Math.max(0, Number(entry.acknowledgedAt || 0)),
        journalType: ['buy', 'listing', 'bulk-relist', 'lease'].includes(entry.journalType) ? entry.journalType : 'unknown',
        runId: String(entry.runId || ''),
        jobId: String(entry.jobId || ''),
        status: String(entry.status || ''),
        phase: String(entry.phase || ''),
        mutationItemCount: Math.max(0, Math.floor(Number(entry.mutationItemCount || 0))),
        uncertainItemCount: Math.max(0, Math.floor(Number(entry.uncertainItemCount || 0))),
        evidenceHash: String(entry.evidenceHash || '').slice(0, 32),
        resolution: TRADE_RECOVERY_RESOLUTIONS.includes(entry.resolution) ? entry.resolution : null,
        reason: String(entry.reason || '').slice(0, 160),
      })),
  };
}

export function createTradeRecoveryAudit(options = {}) {
  const storage = options.storage;
  const key = String(options.key || 'fc-loop-runner-trade-recovery-audit-v1');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let memory = normalizeTradeRecoveryAudit();

  function read() {
    const stored = storage?.get?.(key, null);
    if (stored && typeof stored === 'object') memory = normalizeTradeRecoveryAudit(stored);
    return clone(memory);
  }

  function record(review = {}, resolution = '') {
    const normalizedResolution = validateTradeRecoveryAuditEntry(review, resolution);
    const current = read();
    memory = normalizeTradeRecoveryAudit({
      entries: [...current.entries, {
        acknowledgedAt: Number(now()),
        journalType: review.journalType,
        runId: review.runId,
        jobId: review.jobId,
        status: review.status,
        phase: review.phase,
        mutationItemCount: review.mutationItemCount,
        uncertainItemCount: review.uncertainItemCount,
        evidenceHash: review.evidenceHash,
        resolution: normalizedResolution,
        reason: normalizedResolution,
      }],
    });
    storage?.set?.(key, clone(memory));
    return read();
  }

  return Object.freeze({ record, snapshot: read });
}

export function acknowledgeTradeRecovery(options = {}) {
  const snapshot = options.schedulerSnapshot || {};
  if (snapshot.paused !== true || snapshot.liveExecutionEnabled === true) {
    throw new Error('recovery-acknowledgement-requires-locked-scheduler');
  }
  if (options.operation?.active || options.operation?.external?.busy === true) {
    throw new Error('recovery-acknowledgement-operation-active');
  }
  if (options.lease?.active === true || options.lease?.owned === true) {
    throw new Error('recovery-acknowledgement-lease-active');
  }
  const journalType = String(options.journalType || '');
  const current = options.journal?.snapshot?.();
  const review = inspectTradeRecoveryJournal(journalType, current);
  if (!review.reviewRequired) throw new Error('recovery-acknowledgement-not-required');
  if (String(options.evidenceHash || '') !== review.evidenceHash) {
    throw new Error('recovery-acknowledgement-evidence-changed');
  }
  if (options.riskAccepted !== true) throw new Error('recovery-acknowledgement-risk-not-accepted');
  const resolution = validateTradeRecoveryAuditEntry(review, options.resolution);
  const archived = options.journal?.acknowledge?.({
    runId: review.runId,
    evidenceHash: review.evidenceHash,
    evidenceHashFor: (journal) => tradeRecoveryEvidenceHash(journalType, journal),
    at: Number(options.now?.() ?? Date.now()),
    reason: resolution,
  });
  if (!archived || archived.status !== 'acknowledged') throw new Error('recovery-acknowledgement-journal-changed');
  options.audit?.record?.(review, resolution);
  return { status: 'acknowledged', resolution, review, journal: archived };
}

export function acknowledgeTradeExpiredLeaseRecovery(options = {}) {
  const snapshot = options.schedulerSnapshot || {};
  if (snapshot.paused !== true || snapshot.liveExecutionEnabled === true) {
    throw new Error('recovery-acknowledgement-requires-locked-scheduler');
  }
  if (options.operation?.active || options.operation?.external?.busy === true) {
    throw new Error('recovery-acknowledgement-operation-active');
  }
  const review = inspectTradeExpiredLeaseReview({
    leaseState: options.leaseState,
    history: options.history,
    journalReviews: options.journalReviews,
  });
  if (!review.reviewRequired) throw new Error('recovery-acknowledgement-not-required');
  if (String(options.evidenceHash || '') !== review.evidenceHash) {
    throw new Error('recovery-acknowledgement-evidence-changed');
  }
  if (options.riskAccepted !== true) throw new Error('recovery-acknowledgement-risk-not-accepted');
  const resolution = validateTradeRecoveryAuditEntry(review, options.resolution);
  options.audit?.record?.(review, resolution);
  return {
    status: 'acknowledged',
    resolution,
    review,
    receipt: createTradeLeaseRecoveryHistoryReceipt(review, {
      leaseState: options.leaseState,
      jobType: options.jobType,
      now: options.now,
    }),
  };
}
import { createTradeRunReceipt } from './contracts.js';
