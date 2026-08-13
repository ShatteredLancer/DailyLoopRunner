import { describe, expect, it } from 'vitest';
import {
  inspectExpiredTradeLeaseRecovery,
  summarizeTradeRunCorrelations,
} from '../../src/trade/scheduler-correlation.js';

describe('Trade Scheduler run correlation', () => {
  it('correlates bounded History, Journal, Lease, scheduler events and pacing waits by runId', () => {
    const result = summarizeTradeRunCorrelations({
      scheduler: { history: [{ runId: 'run-1', jobId: 'buy-1', jobType: 'buy', status: 'blocked', reason: 'budget', startedAt: 100 }] },
      buyJournal: {
        runId: 'run-1', jobId: 'buy-1', status: 'active', phase: 'buy-request-permit-waiting', updatedAt: 200,
        items: [{ status: 'mutation-pending', mutationBoundaryCrossed: true }],
        events: [{ phase: 'buy-request-permit-waiting', retryAt: 500 }],
      },
      lease: { active: false, expired: true, lease: { runId: 'run-1', jobId: 'buy-1', acquiredAt: 100, expiresAt: 300 } },
      events: [{ runId: 'run-1', jobId: 'buy-1', status: 'blocked' }],
    });
    expect(result).toEqual([expect.objectContaining({
      runId: 'run-1', jobId: 'buy-1', jobType: 'buy',
      history: { status: 'blocked', reason: 'budget', startedAt: 100, finishedAt: null },
      journal: expect.objectContaining({ mutationBoundaryCrossed: true, uncertainItems: 1 }),
      lease: expect.objectContaining({ expired: true }),
      schedulerEvents: 1, pacingWaits: 1, latestPacingRetryAt: 500,
    })]);
  });

  it('reconciles an expired Lease only from matching terminal History without uncertain Journal evidence', () => {
    const previousLease = { runId: 'run-1', jobId: 'listing-1' };
    expect(inspectExpiredTradeLeaseRecovery({ previousLease, history: [] })).toMatchObject({
      status: 'blocked', reason: 'expired-lease-terminal-history-missing',
    });
    expect(inspectExpiredTradeLeaseRecovery({
      previousLease,
      history: [{ runId: 'run-1', status: 'running' }],
    })).toMatchObject({
      status: 'blocked', reason: 'expired-lease-terminal-history-missing',
    });
    expect(inspectExpiredTradeLeaseRecovery({
      previousLease,
      history: [{ runId: 'run-1', status: 'completed' }],
      listingJournal: { runId: 'run-1' },
      inspectJournal: () => true,
    })).toMatchObject({ status: 'blocked', reason: 'expired-lease-journal-mutation-review-required' });
    expect(inspectExpiredTradeLeaseRecovery({
      previousLease,
      history: [{ runId: 'run-1', status: 'completed' }],
      listingJournal: { runId: 'run-1' },
      inspectJournal: () => false,
    })).toEqual({
      status: 'reconciled', reason: 'expired-lease-terminal-history-confirmed',
      runId: 'run-1', jobId: 'listing-1', historyStatus: 'completed',
    });
  });

  it('reconciles an expired Lease from a matching persisted continuation without terminal History', () => {
    expect(inspectExpiredTradeLeaseRecovery({
      previousLease: { runId: 'continued-run', jobId: 'buy-1' },
      history: [],
      buyJournal: { runId: 'continued-run', jobId: 'buy-1' },
      inspectJournal: () => false,
      continuation: { runId: 'continued-run', jobId: 'buy-1' },
    })).toEqual({
      status: 'reconciled', reason: 'expired-lease-persisted-continuation-confirmed',
      runId: 'continued-run', jobId: 'buy-1', historyStatus: null,
    });
  });

  it('blocks an expired manual bulk Re-list All Lease while its aggregate Journal remains unknown', () => {
    expect(inspectExpiredTradeLeaseRecovery({
      previousLease: { runId: 'bulk-run', jobId: 'manual-bulk-relist' },
      history: [{ runId: 'bulk-run', status: 'ambiguous' }],
      bulkRelistJournal: { runId: 'bulk-run', jobId: 'manual-bulk-relist' },
      inspectJournal: (journal, type) => journal.runId === 'bulk-run' && type === 'bulk-relist',
    })).toMatchObject({
      status: 'blocked', reason: 'expired-lease-journal-mutation-review-required',
      runId: 'bulk-run', jobId: 'manual-bulk-relist',
    });
  });
});
