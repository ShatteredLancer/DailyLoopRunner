import { normalizeTradeJob } from './contracts.js';

export const MANUAL_LISTING_LIVE_LIMIT = 1;

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function createManualListingJob(input = {}, options = {}) {
  const now = Math.max(0, Number(options.now ?? Date.now()) || 0);
  const rules = Array.isArray(input.ratingRules) && input.ratingRules.length
    ? input.ratingRules
    : [{ min: 75, max: 82, buyNow: 700 }];
  return normalizeTradeJob({
    schemaVersion: 1,
    id: String(input.id || 'manual-club-listing'),
    name: String(input.name || 'Manual Club Listing'),
    type: 'listing',
    enabled: true,
    armed: false,
    schedule: { type: 'manual' },
    misfirePolicy: { type: 'skip' },
    policy: {
      sources: ['club'],
      cardClass: String(input.cardClass || 'common-gold'),
      ratingRules: rules.map((rule) => ({
        min: positiveInteger(rule?.min, 75),
        max: positiveInteger(rule?.max, positiveInteger(rule?.min, 75)),
        buyNow: positiveInteger(rule?.buyNow, 700),
      })),
      marketOverride: {
        enabled: input.marketOverride?.enabled === true,
        markupPercent: Math.max(0, Number(input.marketOverride?.markupPercent ?? 5) || 0),
        maxQuoteAgeMinutes: positiveInteger(input.marketOverride?.maxQuoteAgeMinutes, 10),
      },
      startPricePolicy: String(input.startPricePolicy || 'one-step-below'),
      durationSeconds: positiveInteger(input.durationSeconds, 3600),
      listingDelaySeconds: [4, 8],
      maxListings: MANUAL_LISTING_LIVE_LIMIT,
      expiredPolicy: 'skip',
    },
    createdAt: now,
    updatedAt: now,
  }, { now });
}
