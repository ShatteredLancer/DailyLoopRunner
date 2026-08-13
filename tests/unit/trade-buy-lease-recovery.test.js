import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import {
  reconcileExpiredPreBuyLease,
  reconcileExpiredTradeLease,
} from '../../src/trade/buy-lease-recovery.js';
import { createTradeBuyJournal } from '../../src/trade/buy-journal.js';
import { createTradeBulkRelistJournal } from '../../src/trade/bulk-relist-journal.js';
import { createTradeJobStore } from '../../src/trade/job-store.js';
import { createTradeListingJournal } from '../../src/trade/listing-journal.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function buyJob() {
  return normalizeTradeJob({
    id: 'buy-1', name: 'Buy one', type: 'buy', enabled: true, armed: false,
    schedule: { type: 'manual' },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 5,
      searchDelaySeconds: [8, 15], maxConsecutiveEmptySearches: 5,
    },
  }, { now: 1 });
}

function listingJob() {
  return normalizeTradeJob({
    id: 'listing-1', name: 'List two', type: 'listing', enabled: true, armed: false,
    schedule: { type: 'manual' },
    policy: {
      sources: ['club'], cardClass: 'common-gold',
      ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      maxListings: 2, expiredPolicy: 'skip',
    },
  }, { now: 1 });
}

describe('Trade Buy expired pre-mutation lease recovery', () => {
  it('records and clears a crashed Buy Run that never heartbeat', () => {
    const storage = memoryStorage();
    let time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(buyJob());
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'old-tab', now: () => time, ttlMs: 5000, createToken: () => 'token' });
    lease.acquire({ runId: 'crashed-buy', jobId: 'buy-1' });
    time = 7000;

    const result = reconcileExpiredPreBuyLease({ lease, store, now: () => time });

    expect(result).toMatchObject({
      status: 'reconciled',
      receipt: { runId: 'crashed-buy', status: 'blocked', reason: 'browser-terminated-before-buy-mutation-boundary', requested: 0 },
    });
    expect(lease.inspect().lease).toBeNull();
    expect(store.read().history).toEqual([expect.objectContaining({ runId: 'crashed-buy', requested: 0 })]);
    expect(JSON.stringify(store.read())).not.toContain('token');
  });

  it('does not clear an expired Run that crossed the Buy heartbeat boundary', () => {
    const storage = memoryStorage();
    let time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(buyJob());
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'old-tab', now: () => time, ttlMs: 5000, createToken: () => 'token' });
    lease.acquire({ runId: 'ambiguous-buy', jobId: 'buy-1' });
    time = 2000;
    lease.heartbeat('ambiguous-buy');
    time = 8000;

    expect(reconcileExpiredPreBuyLease({ lease, store, now: () => time })).toMatchObject({
      status: 'blocked', reason: 'expired-lease-crossed-buy-boundary', receipt: null,
    });
    expect(lease.inspect()).toMatchObject({ expired: true, lease: { runId: 'ambiguous-buy', heartbeatAt: 2000 } });
    expect(store.read().history).toEqual([]);
  });

  it('reconciles and retains a Listing journal that crashed before any mutation boundary', () => {
    const storage = memoryStorage();
    let time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(listingJob());
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'old-tab', now: () => time, ttlMs: 5000, createToken: () => 'token' });
    const journal = createTradeListingJournal({ storage, key: 'listing-journal', now: () => time });
    lease.acquire({ runId: 'prepare-only-listing', jobId: 'listing-1' });
    journal.begin({ runId: 'prepare-only-listing', jobId: 'listing-1', source: 'club', requested: 2 });
    journal.checkpoint('prepare-only-listing', {
      phase: 'prepare-finished',
      items: [{ item: { id: 1, definitionId: 101, pile: 'club' }, startPrice: 650, buyNow: 700 }],
    });
    time = 7000;

    const result = reconcileExpiredTradeLease({ lease, store, journals: [journal], now: () => time });

    expect(result).toMatchObject({
      status: 'reconciled',
      receipt: {
        runId: 'prepare-only-listing', jobType: 'listing', status: 'blocked',
        reason: 'browser-terminated-before-listing-mutation-boundary', requested: 2, succeeded: 0,
      },
    });
    expect(lease.inspect().lease).toBeNull();
    expect(journal.snapshot()).toMatchObject({
      runId: 'prepare-only-listing', status: 'blocked', phase: 'expired-lease-reconciled',
      items: [{ index: 1, mutationBoundaryCrossed: false }],
    });
  });

  it.each([
    ['listing', createTradeListingJournal, listingJob, 'listed'],
    ['buy', createTradeBuyJournal, buyJob, 'purchased'],
  ])('retains an expired Lease and %s Journal after an uncertain mutation boundary', (
    kind, createJournal, createJob, firstTerminalStatus,
  ) => {
    const storage = memoryStorage();
    let time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    const job = createJob();
    store.upsert(job);
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'old-tab', now: () => time, ttlMs: 5000, createToken: () => 'token' });
    const journal = createJournal({ storage, key: `${kind}-journal`, now: () => time });
    const runId = `uncertain-${kind}`;
    lease.acquire({ runId, jobId: job.id });
    journal.begin({ runId, jobId: job.id, source: 'club', expectedDestination: 'auto', requested: 2 });
    journal.checkpoint(runId, {
      phase: `${kind}-request-started`, itemIndex: 1,
      item: { id: 1, definitionId: 101, pile: kind === 'buy' ? 'market' : 'club' },
      status: firstTerminalStatus, mutationBoundaryCrossed: true,
    });
    journal.checkpoint(runId, {
      phase: `${kind}-request-started`, itemIndex: 2,
      item: { id: 2, definitionId: 102, pile: kind === 'buy' ? 'market' : 'club' },
      status: 'mutation-pending', mutationBoundaryCrossed: true,
    });
    journal.finish(runId, { phase: 'receipt-recorded', status: 'ambiguous' });
    time = 7000;

    expect(reconcileExpiredTradeLease({ lease, store, journals: [journal], now: () => time })).toMatchObject({
      status: 'blocked', reason: `expired-lease-crossed-${kind}-boundary`, receipt: null,
    });
    expect(lease.inspect()).toMatchObject({ expired: true, lease: { runId } });
    expect(journal.snapshot()).toMatchObject({
      runId, status: 'ambiguous',
      items: [
        { index: 1, status: firstTerminalStatus, mutationBoundaryCrossed: true },
        { index: 2, status: 'mutation-pending', mutationBoundaryCrossed: true },
      ],
    });
    expect(store.read().history).toEqual([]);
  });

  it('recovers a terminal successful two-item Listing Journal without authorizing a retry', () => {
    const storage = memoryStorage();
    let time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    store.upsert(listingJob());
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'old-tab', now: () => time, ttlMs: 5000, createToken: () => 'token' });
    const journal = createTradeListingJournal({ storage, key: 'listing-journal', now: () => time });
    lease.acquire({ runId: 'listed-two', jobId: 'listing-1' });
    journal.begin({ runId: 'listed-two', jobId: 'listing-1', source: 'club', requested: 2 });
    for (const index of [1, 2]) {
      journal.checkpoint('listed-two', {
        phase: 'item-finished', itemIndex: index, status: 'listed',
        item: { id: index, definitionId: 100 + index, pile: 'club' },
        listing: { startPrice: 650, buyNow: 700 }, mutationBoundaryCrossed: true,
      });
    }
    journal.finish('listed-two', { phase: 'receipt-recorded', status: 'completed' });
    time = 2000;
    lease.heartbeat('listed-two');
    time = 8000;

    const result = reconcileExpiredTradeLease({ lease, store, journals: [journal], now: () => time });

    expect(result).toMatchObject({
      status: 'reconciled',
      receipt: {
        runId: 'listed-two', status: 'blocked',
        reason: 'browser-terminated-after-listing-journal-terminal',
        requested: 2, succeeded: 2, failed: 0, skipped: 0,
      },
    });
    expect(lease.inspect().lease).toBeNull();
    expect(journal.inspectRecovery()).toMatchObject({ canSupersede: true, uncertainMutation: false });
    expect(store.read().history).toHaveLength(1);
  });

  it('recovers a terminal aggregate Re-list All Journal as bulk-relist instead of Buy', () => {
    const storage = memoryStorage();
    let time = 1000;
    const store = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    const lease = createTradeRunLease({
      storage, key: 'lease', ownerId: 'old-tab', now: () => time, ttlMs: 5000, createToken: () => 'token',
    });
    const journal = createTradeBulkRelistJournal({ storage, key: 'bulk-journal', now: () => time });
    const items = [1, 2].map((id) => ({
      item: { id, definitionId: 100 + id, pile: 'transfer' },
      auction: { state: 'inactive', tradeId: 1000 + id, startingBid: 650, buyNowPrice: 700 },
    }));
    lease.acquire({ runId: 'bulk-two', jobId: 'bulk-job' });
    journal.begin({ runId: 'bulk-two', jobId: 'bulk-job', before: { unsoldCount: 2, items } });
    journal.checkpoint('bulk-two', {
      phase: 'bulk-relist-reconciliation-finished', mutationBoundaryCrossed: true,
      items: items.map((entry) => ({ ...entry, status: 'relisted' })),
    });
    journal.finish('bulk-two', { phase: 'receipt-recorded', status: 'completed' });
    time = 2000;
    lease.heartbeat('bulk-two');
    time = 8000;

    const result = reconcileExpiredTradeLease({ lease, store, journals: [journal], now: () => time });

    expect(result).toMatchObject({
      status: 'reconciled',
      receipt: {
        runId: 'bulk-two', jobType: 'bulk-relist', status: 'blocked',
        reason: 'browser-terminated-after-bulk-relist-journal-terminal',
        requested: 2, succeeded: 2, failed: 0, skipped: 0,
      },
    });
    expect(lease.inspect().lease).toBeNull();
    expect(store.read().metrics).toMatchObject({
      runs: { byJobType: { 'bulk-relist': 1 } },
      bulkRelist: { relisted: 2 },
    });
  });
});
