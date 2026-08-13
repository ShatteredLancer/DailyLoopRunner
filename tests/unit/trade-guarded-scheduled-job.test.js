import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import {
  selectGuardedScheduledTradeJob,
  summarizeGuardedScheduledTradeSelection,
} from '../../src/trade/guarded-scheduled-job.js';

function buyJob() {
  return normalizeTradeJob({
    id: 'buy-once', name: 'Buy once', type: 'buy', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 60_000 },
    misfirePolicy: { type: 'skip' },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 5,
      searchDelaySeconds: [8, 15], maxConsecutiveEmptySearches: 5,
    },
  }, { now: 1 });
}

function listingJob() {
  return normalizeTradeJob({
    id: 'listing-once', name: 'List once', type: 'listing', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 60_000 },
    misfirePolicy: { type: 'skip' },
    policy: {
      sources: ['club'], cardClass: 'common-gold',
      ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      maxListings: 1,
    },
  }, { now: 1 });
}

function transferRepriceJob() {
  return normalizeTradeJob({
    id: 'transfer-reprice-once', name: 'Transfer reprice once', type: 'listing', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 60_000 },
    misfirePolicy: { type: 'skip' },
    policy: {
      sources: ['transfer'], cardClass: 'rare-gold',
      ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      maxListings: 1, expiredPolicy: 'reprice',
    },
  }, { now: 1 });
}

function bulkRelistJob() {
  return normalizeTradeJob({
    id: 'bulk-relist-once', name: 'Re-list all once', type: 'bulk-relist', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 60_000 },
    misfirePolicy: { type: 'skip' },
    policy: { relistDelaySeconds: [3, 8] },
  }, { now: 1 });
}

describe('Guarded scheduled Trade Job selection', () => {
  it('keeps scheduled Buy unavailable unless its separate gate is enabled', () => {
    const job = buyJob();
    const snapshot = {
      jobs: [job],
      runtimes: { [job.id]: { nextRunAt: job.schedule.runAt } },
      safety: { minimumRetainedCoins: 100000 },
    };
    expect(selectGuardedScheduledTradeJob(snapshot)).toMatchObject({
      ready: false,
      reason: 'scheduled-buy-validation-gate-disabled',
    });
    expect(selectGuardedScheduledTradeJob(snapshot, { scheduledBuyEnabled: true })).toMatchObject({
      ready: true,
      job,
      approval: { action: 'enable-trade-jobs', jobCount: 1, jobIds: [job.id], totalRuns: 1 },
    });
  });

  it('keeps Scheduled Transfer reprice disabled until its separate gate is enabled', () => {
    const job = transferRepriceJob();
    const snapshot = {
      jobs: [job],
      runtimes: { [job.id]: { nextRunAt: job.schedule.runAt } },
    };
    expect(selectGuardedScheduledTradeJob(snapshot)).toMatchObject({
      ready: false,
      reason: 'scheduled-transfer-reprice-validation-gate-disabled',
      approval: null,
    });
    expect(summarizeGuardedScheduledTradeSelection(snapshot)).toEqual({
      ready: false,
      reason: 'scheduled-transfer-reprice-validation-gate-disabled',
      jobId: job.id,
      jobType: 'listing',
      jobIds: [],
      jobTypes: [],
      totalRuns: 0,
      approval: null,
    });
    expect(selectGuardedScheduledTradeJob(snapshot, { scheduledTransferRepriceEnabled: true })).toMatchObject({
      ready: true,
      job,
      approval: { action: 'enable-trade-jobs', jobIds: [job.id] },
    });
    expect(summarizeGuardedScheduledTradeSelection(snapshot, { scheduledTransferRepriceEnabled: true })).toEqual({
      ready: true,
      reason: null,
      jobId: job.id,
      jobType: 'listing',
      jobIds: [job.id],
      jobTypes: ['listing'],
      totalRuns: 1,
      approval: {
        risk: 'attention', action: 'enable-trade-jobs', jobCount: 1, jobIds: [job.id], totalRuns: 1,
      },
    });
    expect(selectGuardedScheduledTradeJob({
      ...snapshot,
      jobs: [{ ...job, policy: { ...job.policy, expiredPolicy: 'skip' } }],
    }, { scheduledTransferRepriceEnabled: true })).toMatchObject({
      ready: false,
      reason: 'validation-gate-transfer-reprice-required',
    });
  });

  it('validates mixed Buy and Listing Jobs under one bounded session approval', () => {
    const buy = buyJob();
    const listing = listingJob();
    expect(selectGuardedScheduledTradeJob({
      jobs: [buy, listing],
      runtimes: {
        [buy.id]: { nextRunAt: buy.schedule.runAt },
        [listing.id]: { nextRunAt: listing.schedule.runAt },
      },
      safety: { minimumRetainedCoins: 100000 },
    }, { scheduledBuyEnabled: true })).toMatchObject({
      ready: true,
      job: null,
      jobs: [buy, listing],
      totalRuns: 2,
      approval: { action: 'enable-trade-jobs', jobCount: 2, jobIds: [buy.id, listing.id], totalRuns: 2 },
    });
  });

  it('requires the scheduled bulk Re-list All gate and describes its aggregate scope', () => {
    const job = bulkRelistJob();
    const snapshot = {
      jobs: [job],
      runtimes: { [job.id]: { nextRunAt: job.schedule.runAt } },
    };
    expect(selectGuardedScheduledTradeJob(snapshot)).toMatchObject({
      ready: false,
      reason: 'scheduled-bulk-relist-validation-gate-disabled',
    });
    expect(selectGuardedScheduledTradeJob(snapshot, { scheduledBulkRelistEnabled: true })).toMatchObject({
      ready: true,
      job,
      gates: [{ approval: { action: 'bulk-relist', scope: 'all-unsold', itemLimit: 100 } }],
      approval: { action: 'enable-trade-jobs', jobIds: [job.id], totalRuns: 1 },
    });
  });

  it('validates Buy, Listing, and bulk Re-list All under one bounded session approval', () => {
    const jobs = [buyJob(), listingJob(), bulkRelistJob()];
    const selection = selectGuardedScheduledTradeJob({
      jobs,
      runtimes: Object.fromEntries(jobs.map((job) => [job.id, { nextRunAt: job.schedule.runAt }])),
      safety: { minimumRetainedCoins: 100000 },
    }, {
      scheduledBuyEnabled: true,
      scheduledBulkRelistEnabled: true,
    });
    expect(selection).toMatchObject({
      ready: true,
      jobs,
      totalRuns: 3,
      approval: { jobCount: 3, jobIds: jobs.map((job) => job.id), totalRuns: 3 },
    });
  });

  it('ignores a legacy armed manual Job when selecting the scheduled gate', () => {
    const listing = listingJob();
    const legacyManual = {
      ...listing,
      id: 'legacy-manual',
      armed: true,
      schedule: { type: 'manual' },
    };
    expect(selectGuardedScheduledTradeJob({
      jobs: [legacyManual, listing],
      runtimes: {
        [legacyManual.id]: { nextRunAt: null },
        [listing.id]: { nextRunAt: listing.schedule.runAt },
      },
    })).toMatchObject({
      ready: true,
      job: listing,
      approval: { action: 'enable-trade-jobs', jobIds: [listing.id] },
    });
  });

  it('describes exact two-item approvals for Club, Transfer, and Buy Jobs', () => {
    const club = { ...listingJob(), policy: { ...listingJob().policy, maxListings: 2 } };
    const transfer = { ...transferRepriceJob(), policy: { ...transferRepriceJob().policy, maxListings: 2 } };
    const buy = {
      ...buyJob(),
      policy: {
        ...buyJob().policy,
        ratingMax: 85,
        ratingPriceOverrides: { 85: 1500 },
        quantity: 2,
        totalBudget: 2500,
      },
    };
    const selection = (job, options = {}) => selectGuardedScheduledTradeJob({
      jobs: [job],
      runtimes: { [job.id]: { nextRunAt: job.schedule.runAt } },
      safety: { minimumRetainedCoins: 100000 },
    }, options);

    expect(selection(club)).toMatchObject({ ready: true, approval: { jobIds: [club.id], totalRuns: 1 } });
    expect(selection(transfer, { scheduledTransferRepriceEnabled: true })).toMatchObject({
      ready: true, approval: { jobIds: [transfer.id], totalRuns: 1 },
    });
    expect(selection(buy, { scheduledBuyEnabled: true })).toMatchObject({
      ready: true, approval: { jobIds: [buy.id], totalRuns: 1 },
    });
  });
});
