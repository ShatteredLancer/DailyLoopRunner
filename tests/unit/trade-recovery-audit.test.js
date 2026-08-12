import { describe, expect, it } from 'vitest';
import { createTradeBuyJournal } from '../../src/trade/buy-journal.js';
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

  it('requires a locked idle state, exact evidence and explicit confirmation', () => {
    const storage = memoryStorage();
    const journal = uncertainJournal(storage);
    const audit = createTradeRecoveryAudit({ storage, key: 'audit', now: () => 2000 });
    const review = inspectTradeRecoveryJournal('buy', journal.snapshot());
    expect(review).toMatchObject({
      reviewRequired: true,
      requiredText: 'ACKNOWLEDGE BUY buy-uncertain',
      mutationItemCount: 1,
      uncertainItemCount: 1,
    });

    const base = {
      schedulerSnapshot: { paused: true, liveExecutionEnabled: false },
      operation: { active: false },
      lease: { active: false, owned: false },
      journalType: 'buy', journal, audit,
      evidenceHash: review.evidenceHash,
      confirmationText: review.requiredText,
      reason: 'EA state checked manually after reload',
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
    expect(() => acknowledgeTradeRecovery({ ...base, confirmationText: 'ACKNOWLEDGE' })).toThrow('exactly match');
    expect(() => acknowledgeTradeRecovery({ ...base, reason: 'short' })).toThrow('reason-too-short');
    expect(journal.snapshot()).toMatchObject({ status: 'active', phase: 'buy-request-started' });

    expect(acknowledgeTradeRecovery(base)).toMatchObject({ status: 'acknowledged' });
    expect(() => acknowledgeTradeRecovery(base)).toThrow('not-required');
    expect(journal.snapshot()).toMatchObject({ status: 'acknowledged', phase: 'manual-recovery-acknowledged' });
    expect(inspectTradeRecoveryJournal('buy', journal.snapshot())).toMatchObject({ reviewRequired: false });
    expect(journal.inspectRecovery()).toMatchObject({ canSupersede: true });
    expect(audit.snapshot().entries).toEqual([expect.objectContaining({
      journalType: 'buy', runId: 'buy-uncertain', jobId: 'buy-job',
      evidenceHash: review.evidenceHash, reason: 'EA state checked manually after reload',
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
      confirmationText: review.requiredText,
      reason: 'EA state checked manually after reload',
    })).toThrow('evidence-changed');
    expect(audit.snapshot().entries).toEqual([]);

    const current = inspectTradeRecoveryJournal('buy', journal.snapshot());
    for (let index = 0; index < TRADE_RECOVERY_AUDIT_LIMIT + 3; index += 1) {
      audit.record({ ...current, runId: `run-${index}` }, `manual reason ${index}`);
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
      requiredText: 'ACKNOWLEDGE LEASE lease-run',
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
      confirmationText: review.requiredText,
      reason: 'Confirmed no EA mutation was started',
      now: () => 4000,
    });
    expect(result).toMatchObject({
      status: 'acknowledged',
      receipt: {
        runId: 'lease-run', jobId: 'listing-job', jobType: 'listing', status: 'blocked',
        reason: 'manual-lease-recovery-acknowledged', requested: 0,
      },
    });
    expect(audit.snapshot().entries).toEqual([expect.objectContaining({
      journalType: 'lease', runId: 'lease-run', evidenceHash: review.evidenceHash,
    })]);
    expect(inspectTradeExpiredLeaseReview({
      leaseState, history: [result.receipt], journalReviews: [],
    })).toMatchObject({ reviewRequired: false });
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
});
