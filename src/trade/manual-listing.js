import { normalizeTradeJob } from './contracts.js';

export const MANUAL_LISTING_LIVE_LIMIT = 1;

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function previewSources(value) {
  const sources = [...new Set((Array.isArray(value) ? value : ['club'])
    .map(String)
    .filter((source) => source === 'club' || source === 'transfer'))];
  return sources.length ? sources : ['club'];
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

export function createManualListingPreviewJob(input = {}, options = {}) {
  const job = createManualListingJob(input, options);
  return normalizeTradeJob({
    ...job,
    id: String(input.id || 'manual-listing-preview'),
    name: String(input.name || 'Manual Listing Preview'),
    policy: {
      ...job.policy,
      sources: previewSources(input.sources),
      expiredPolicy: input.expiredPolicy === 'reprice' ? 'reprice' : 'skip',
    },
  }, { now: options.now });
}

export function createManualTransferRepriceJob(input = {}, options = {}) {
  const job = createManualListingJob(input, options);
  return normalizeTradeJob({
    ...job,
    id: String(input.id || 'manual-transfer-reprice'),
    name: String(input.name || 'Manual Transfer Reprice'),
    policy: {
      ...job.policy,
      sources: ['transfer'],
      expiredPolicy: 'reprice',
    },
  }, { now: options.now });
}
