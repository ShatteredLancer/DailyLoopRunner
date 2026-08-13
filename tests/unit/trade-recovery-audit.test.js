import { describe, expect, it } from 'vitest';
import { createTradeBuyJournal } from '../../src/trade/buy-journal.js';
import { createTradeBulkRelistJournal } from '../../src/trade/bulk-relist-journal.js';
import {
  acknowledgeTradeExpiredLeaseRecovery,
  acknowledgeTradeRecovery,
  createTradeRecoveryHistoryReceipt,
  createTradeRecoveryAudit,
  inspectTradeRecoveryJournal,
  inspectTradeExpiredLeaseReview,
  partitionTradeRecoveryReviews,
  TRADE_RECOVERY_AUDIT_LIMIT,
} from '../../src/trade/recovery-audit.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function uncertainJournal(storage) {
  const journal = createTradeBuyJournal({ storage, key: 'journal', now: () => 1000 });
  journal.begin({ runId: 'buy-uncertain', jobId: 'buy-job', expectedDestination: 'transfer', requested: 1 });
  journal.checkpoint('buy-uncertain', {
    phase: 'buy-request-started', itemIndex: 1, status: 'mutation-pending',
    item: { id: 70, definitionId: 8401, pile: 'market', token: 'secret' },
    destination: 'transfer', mutationBoundaryCrossed: true,
  });
  return journal;
}

describe('Trade recovery audit', () => {
  it('treats only the Journal owned by the current active Lease as in flight', () => {
    const buy = {
      reviewRequired: true,
      journalType: 'buy',
      runId: 'active-run',
      jobId: 'buy-job',
    };
    const listing = {
      reviewRequired: true,
      journalType: 'listing',
      runId: 'stale-run',
      jobId: 'listing-job',
    };
    expect(partitionTradeRecoveryReviews([buy, listing], {
      active: true,
      lease: { runId: 'active-run', jobId: 'buy-job' },
    })).toEqual({ reviews: [listing], inFlightReviews: [buy] });
    expect(partitionTradeRecoveryReviews([buy], {
      active: true,
      lease: { runId: 'active-run', jobId: 'different-job' },
    })).toEqual({ reviews: [buy], inFlightReviews: [] });
    expect(partitionTradeRecoveryReviews([buy], {
      active: false,
      expired: true,
      lease: { runId: 'active-run', jobId: 'buy-job' },
    })).toEqual({ reviews: [buy], inFlightReviews: [] });
  });

  it('requires a locked idle state, exact evidence, a fixed resolution and risk acceptance', () => {
    const storage = memoryStorage();
    const journal = uncertainJournal(storage);
    const audit = createTradeRecoveryAudit({ storage, key: 'audit', now: () => 2000 });
    const review = inspectTradeRecoveryJournal('buy', journal.snapshot());
    expect(review).toMatchObject({
      reviewRequired: true,
      risk: 'high',
      mutationItemCount: 1,
      uncertainItemCount: 1,
    });

    const base = {
      schedulerSnapshot: { paused: true, liveExecutionEnabled: false },
      operation: { active: false },
      lease: { active: false, owned: false },
      journalType: 'buy', journal, audit,
      evidenceHash: review.evidenceHash,
      resolution: 'archive-unknown',
      riskAccepted: true,
      now: () => 2000,
    };
    expect(() => acknowledgeTradeRecovery({ ...base, schedulerSnapshot: { paused: false } }))
      .toThrow('locked-scheduler');
    expect(() => acknowledgeTradeRecovery({
      ...base,
      operation: { active: { id: 'loop-1', type: 'loop' }, external: { busy: false } },
    })).toThrow('operation-active');
    expect(() => acknowledgeTradeRecovery({ ...base, lease: { active: true } })).toThrow('lease-active');
    expect(() => acknowledgeTradeRecovery({ ...base, evidenceHash: 'stale' })).toThrow('evidence-changed');
    expect(() => acknowledgeTradeRecovery({ ...base, riskAccepted: false })).toThrow('risk-not-accepted');
    expect(() => acknowledgeTradeRecovery({ ...base, resolution: '' })).toThrow('resolution-invalid');
    expect(() => acknowledgeTradeRecovery({ ...base, resolution: 'free-form-result' })).toThrow('resolution-invalid');
    expect(journal.snapshot()).toMatchObject({ status: 'active', phase: 'buy-request-started' });

    expect(acknowledgeTradeRecovery(base)).toMatchObject({ status: 'acknowledged', resolution: 'archive-unknown' });
    expect(() => acknowledgeTradeRecovery(base)).toThrow('not-required');
    expect(journal.snapshot()).toMatchObject({ status: 'acknowledged', phase: 'manual-recovery-acknowledged' });
    expect(inspectTradeRecoveryJournal('buy', journal.snapshot())).toMatchObject({ reviewRequired: false });
    expect(journal.inspectRecovery()).toMatchObject({ canSupersede: true });
    expect(audit.snapshot().entries).toEqual([expect.objectContaining({
      journalType: 'buy', runId: 'buy-uncertain', jobId: 'buy-job',
      evidenceHash: review.evidenceHash, resolution: 'archive-unknown', reason: 'archive-unknown',
    })]);
    expect(JSON.stringify(audit.snapshot())).not.toContain('secret');
    expect(createTradeRecoveryHistoryReceipt(review, journal.snapshot(), { now: () => 2500 })).toMatchObject({
      runId: 'buy-uncertain', jobId: 'buy-job', jobType: 'buy', status: 'blocked',
      reason: 'manual-recovery-acknowledged', requested: 1, succeeded: 0, skipped: 1,
      finishedAt: 2500,
    });
  });

  it('rejects a changed Journal and retains only bounded audit entries', () => {
    const storage = memoryStorage();
    const journal = uncertainJournal(storage);
    const audit = createTradeRecoveryAudit({ storage, key: 'audit', now: () => 3000 });
    const review = inspectTradeRecoveryJournal('buy', journal.snapshot());
    journal.checkpoint('buy-uncertain', { phase: 'new-evidence', reason: 'changed' });
    expect(() => acknowledgeTradeRecovery({
      schedulerSnapshot: { paused: true, liveExecutionEnabled: false },
      operation: { active: false }, lease: { active: false },
      journalType: 'buy', journal, audit,
      evidenceHash: review.evidenceHash,
      resolution: 'archive-unknown',
      riskAccepted: true,
    })).toThrow('evidence-changed');
    expect(audit.snapshot().entries).toEqual([]);

    const current = inspectTradeRecoveryJournal('buy', journal.snapshot());
    for (let index = 0; index < TRADE_RECOVERY_AUDIT_LIMIT + 3; index += 1) {
      audit.record({ ...current, runId: `run-${index}` }, 'archive-unknown');
    }
    expect(audit.snapshot().entries).toHaveLength(TRADE_RECOVERY_AUDIT_LIMIT);
    expect(audit.snapshot().entries[0].runId).toBe('run-3');
  });

  it('acknowledges an expired pre-mutation Lease without clearing it or calling EA', () => {
    const storage = memoryStorage();
    const audit = createTradeRecoveryAudit({ storage, key: 'audit', now: () => 4000 });
    const leaseState = {
      active: false,
      owned: false,
      expired: true,
      lease: { ownerId: 'old-tab', runId: 'lease-run', jobId: 'listing-job', acquiredAt: 1000, heartbeatAt: 1000, expiresAt: 3000 },
    };
    const review = inspectTradeExpiredLeaseReview({ leaseState, history: [], journalReviews: [] });
    expect(review).toMatchObject({
      reviewRequired: true, journalType: 'lease', runId: 'lease-run',
      risk: 'high',
    });
    const result = acknowledgeTradeExpiredLeaseRecovery({
      schedulerSnapshot: { paused: true, liveExecutionEnabled: false },
      operation: { active: null, external: { busy: false } },
      leaseState,
      history: [],
      journalReviews: [],
      jobType: 'listing',
      audit,
      evidenceHash: review.evidenceHash,
      resolution: 'confirmed-not-completed',
      riskAccepted: true,
      now: () => 4000,
    });
    expect(result).toMatchObject({
      status: 'acknowledged',
      resolution: 'confirmed-not-completed',
      receipt: {
        runId: 'lease-run', jobId: 'listing-job', jobType: 'listing', status: 'blocked',
        reason: 'manual-lease-recovery-acknowledged', requested: 0,
      },
    });
    expect(audit.snapshot().entries).toEqual([expect.objectContaining({
      journalType: 'lease', runId: 'lease-run', evidenceHash: review.evidenceHash,
      resolution: 'confirmed-not-completed',
    })]);
    expect(inspectTradeExpiredLeaseReview({
      leaseState, history: [result.receipt], journalReviews: [],
    })).toMatchObject({ reviewRequired: false });
  });

  it('retains the bulk-relist Job type in expired Lease recovery History', () => {
    const storage = memoryStorage();
    const audit = createTradeRecoveryAudit({ storage, key: 'audit', now: () => 4000 });
    const leaseState = {
      active: false,
      owned: false,
      expired: true,
      lease: { ownerId: 'old-tab', runId: 'bulk-lease-run', jobId: 'bulk-job', acquiredAt: 1000, heartbeatAt: 1000, expiresAt: 3000 },
    };
    const review = inspectTradeExpiredLeaseReview({ leaseState, history: [], journalReviews: [] });
    const result = acknowledgeTradeExpiredLeaseRecovery({
      schedulerSnapshot: { paused: true, liveExecutionEnabled: false },
      operation: { active: null, external: { busy: false } },
      leaseState,
      history: [],
      journalReviews: [],
      jobType: 'bulk-relist',
      audit,
      evidenceHash: review.evidenceHash,
      resolution: 'confirmed-not-completed',
      riskAccepted: true,
      now: () => 4000,
    });
    expect(result.receipt).toMatchObject({
      runId: 'bulk-lease-run', jobId: 'bulk-job', jobType: 'bulk-relist',
      status: 'blocked', reason: 'manual-lease-recovery-acknowledged',
    });
  });

  it('does not treat a non-terminal History snapshot as expired Lease reconciliation', () => {
    const leaseState = {
      active: false,
      owned: false,
      expired: true,
      lease: { ownerId: 'old-tab', runId: 'lease-run', jobId: 'listing-job', acquiredAt: 1000, heartbeatAt: 1000, expiresAt: 3000 },
    };
    expect(inspectTradeExpiredLeaseReview({
      leaseState,
      history: [{ runId: 'lease-run', status: 'running' }],
      journalReviews: [],
    })).toMatchObject({
      reviewRequired: true,
      reason: 'expired-lease-terminal-history-missing',
      runId: 'lease-run',
    });
  });

  it('does not request manual recovery for a matching persisted continuation', () => {
    const journal = {
      runId: 'continued-run', jobId: 'listing-job', status: 'active', phase: 'slice-checkpoint-persisted',
      items: [{ status: 'listed', mutationBoundaryCrossed: true }],
    };
    expect(inspectTradeRecoveryJournal('listing', journal, { continuationActive: true })).toMatchObject({
      reviewRequired: false, continuationReserved: true, uncertainItemCount: 0,
    });
    expect(inspectTradeExpiredLeaseReview({
      leaseState: {
        expired: true,
        lease: { runId: 'continued-run', jobId: 'listing-job', acquiredAt: 1000, heartbeatAt: 1000, expiresAt: 2000 },
      },
      history: [],
      journalReviews: [],
      continuation: { runId: 'continued-run', jobId: 'listing-job' },
    })).toMatchObject({
      reviewRequired: false, reason: 'expired-lease-persisted-continuation-confirmed', runId: 'continued-run',
    });
  });

  it('archives an unknown bulk Re-list All Journal into aggregate History without retrying EA', () => {
    const storage = memoryStorage();
    const journal = createTradeBulkRelistJournal({ storage, key: 'bulk-journal', now: () => 1000 });
    journal.begin({
      runId: 'bulk-unknown', jobId: 'manual-bulk-relist',
      before: {
        unsoldCount: 1,
        items: [{
          item: { id: 70, definitionId: 8401, pile: 'transfer' },
          auction: { state: 'inactive', tradeId: 700, startingBid: 650, buyNowPrice: 700 },
        }],
      },
    });
    journal.checkpoint('bulk-unknown', {
      phase: 'bulk-relist-reconciliation-finished', status: 'ambiguous', mutationBoundaryCrossed: true,
      items: [{ item: { id: 70, definitionId: 8401, pile: 'transfer' }, status: 'unknown' }],
    });
    journal.finish('bulk-unknown', { phase: 'receipt-recorded', status: 'ambiguous' });
    const audit = createTradeRecoveryAudit({ storage, key: 'audit', now: () => 2000 });
    const review = inspectTradeRecoveryJournal('bulk-relist', journal.snapshot());
    const result = acknowledgeTradeRecovery({
      schedulerSnapshot: { paused: true, liveExecutionEnabled: false },
      operation: { active: false }, lease: { active: false },
      journalType: 'bulk-relist', journal, audit,
      evidenceHash: review.evidenceHash,
      resolution: 'archive-unknown', riskAccepted: true, now: () => 2000,
    });
    expect(result).toMatchObject({
      status: 'acknowledged',
      review: { journalType: 'bulk-relist', uncertainItemCount: 1 },
    });
    expect(createTradeRecoveryHistoryReceipt(result.review, result.journal, { now: () => 2500 })).toMatchObject({
      runId: 'bulk-unknown', jobId: 'manual-bulk-relist', jobType: 'bulk-relist',
      status: 'blocked', reason: 'manual-recovery-acknowledged', requested: 1, succeeded: 0, skipped: 1,
    });
    expect(audit.snapshot().entries).toEqual([
      expect.objectContaining({ journalType: 'bulk-relist', runId: 'bulk-unknown', resolution: 'archive-unknown' }),
    ]);
  });
});
