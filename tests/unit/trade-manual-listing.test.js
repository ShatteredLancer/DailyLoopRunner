import { describe, expect, it } from 'vitest';
import { createManualListingJob, MANUAL_LISTING_LIVE_LIMIT } from '../../src/trade/manual-listing.js';
import { validateTradeJob } from '../../src/trade/contracts.js';

describe('manual Trade listing job', () => {
  it('creates a valid disarmed manual job behind the single-item Club gate', () => {
    const job = createManualListingJob({
      cardClass: 'rare-gold',
      ratingRules: [{ min: 83, max: 85, buyNow: 1800 }],
      durationSeconds: 10800,
      startPricePolicy: 'same',
      marketOverride: { enabled: true, markupPercent: 7, maxQuoteAgeMinutes: 15 },
      sources: ['transfer'],
      maxListings: 20,
    }, { now: 123 });

    expect(job).toMatchObject({
      type: 'listing',
      enabled: true,
      armed: false,
      schedule: { type: 'manual' },
      policy: {
        sources: ['club'],
        cardClass: 'rare-gold',
        ratingRules: [{ min: 83, max: 85, buyNow: 1800 }],
        maxListings: MANUAL_LISTING_LIVE_LIMIT,
        durationSeconds: 10800,
        expiredPolicy: 'skip',
      },
    });
    expect(validateTradeJob(job)).toEqual([]);
  });
});
