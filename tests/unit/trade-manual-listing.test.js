import { describe, expect, it } from 'vitest';
import {
  createManualListingJob,
  createManualListingPreviewJob,
  createManualTransferRepriceJob,
  MANUAL_LISTING_LIVE_LIMIT,
} from '../../src/trade/manual-listing.js';
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

  it('creates a valid read-only Transfer preview job with expired candidates included', () => {
    const job = createManualListingPreviewJob({
      id: 'transfer-observation',
      name: 'Transfer Observation',
      sources: ['transfer'],
      cardClass: 'rare-gold',
      ratingRules: [{ min: 83, max: 85, buyNow: 1800 }],
      expiredPolicy: 'reprice',
    }, { now: 456 });

    expect(job).toMatchObject({
      id: 'transfer-observation',
      name: 'Transfer Observation',
      type: 'listing',
      enabled: true,
      armed: false,
      schedule: { type: 'manual' },
      policy: {
        sources: ['transfer'],
        expiredPolicy: 'reprice',
        maxListings: MANUAL_LISTING_LIVE_LIMIT,
      },
    });
    expect(validateTradeJob(job)).toEqual([]);
  });

  it('does not let preview-only source and expiry settings broaden the live job', () => {
    const job = createManualListingJob({
      sources: ['club', 'transfer'],
      expiredPolicy: 'reprice',
    }, { now: 789 });

    expect(job.policy.sources).toEqual(['club']);
    expect(job.policy.expiredPolicy).toBe('skip');
    expect(job.policy.maxListings).toBe(MANUAL_LISTING_LIVE_LIMIT);
  });

  it('creates a separate manual one-item Transfer reprice job', () => {
    const job = createManualTransferRepriceJob({
      id: 'transfer-reprice',
      name: 'Transfer Reprice',
      sources: ['club', 'transfer'],
      expiredPolicy: 'skip',
      ratingRules: [{ min: 85, max: 85, buyNow: 700 }],
    }, { now: 999 });

    expect(job).toMatchObject({
      id: 'transfer-reprice',
      name: 'Transfer Reprice',
      armed: false,
      schedule: { type: 'manual' },
      policy: {
        sources: ['transfer'],
        expiredPolicy: 'reprice',
        maxListings: MANUAL_LISTING_LIVE_LIMIT,
      },
    });
    expect(validateTradeJob(job)).toEqual([]);
  });
});
