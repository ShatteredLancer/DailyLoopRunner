import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { selectGuardedScheduledTradeJob } from '../../src/trade/guarded-scheduled-job.js';

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
      requiredText: 'RUN BUY ONCE 1 RESERVE 100000',
    });
  });

  it('rejects mixed Buy and Listing Jobs when more than one is armed', () => {
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
      ready: false,
      reason: 'validation-gate-multiple-armed-jobs',
      job: null,
    });
  });
});
