import { assertValidTradeJob } from './contracts.js';

const MIN_EA_LISTING_PRICE = 150;
const REJECTION_SAMPLE_LIMIT = 20;
export const TRADE_LISTING_MAX_BUY_NOW = 10_000;
export const TRADE_LISTING_QUOTE_POOL_MULTIPLIER = 4;
export const TRADE_LISTING_QUOTE_POOL_MAX = 16;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function diagnosticNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function diagnosticAuction(auction) {
  if (!auction || typeof auction !== 'object') return null;
  return {
    present: auction.present === true,
    state: String(auction.state || 'none'),
    stateSource: String(auction.stateSource || 'unknown'),
    rawState: auction.rawState === null || ['string', 'number', 'boolean'].includes(typeof auction.rawState)
      ? auction.rawState
      : null,
    signals: {
      active: auction.signals?.active === true ? true : auction.signals?.active === false ? false : null,
      closed: auction.signals?.closed === true ? true : auction.signals?.closed === false ? false : null,
      inactive: auction.signals?.inactive === true ? true : auction.signals?.inactive === false ? false : null,
    },
    tradeId: diagnosticNumber(auction.tradeId),
    startingBid: diagnosticNumber(auction.startingBid),
    currentBid: diagnosticNumber(auction.currentBid),
    buyNowPrice: diagnosticNumber(auction.buyNowPrice),
    expires: diagnosticNumber(auction.expires),
  };
}

function priceStep(value) {
  const price = Math.max(0, finiteNumber(value));
  if (price <= 1000) return 50;
  if (price <= 10_000) return 100;
  if (price <= 50_000) return 250;
  if (price <= 100_000) return 500;
  return 1000;
}

export function roundEaListingPrice(value) {
  const price = Math.max(MIN_EA_LISTING_PRICE, finiteNumber(value, MIN_EA_LISTING_PRICE));
  const step = priceStep(price);
  return Math.ceil(price / step) * step;
}

export function eaListingPriceBelow(value) {
  const price = roundEaListingPrice(value);
  return Math.max(MIN_EA_LISTING_PRICE, price - priceStep(price));
}

export function eaListingPriceAbove(value) {
  const price = roundEaListingPrice(value);
  return roundEaListingPrice(price + priceStep(price));
}

export function matchesTradeCardClass(candidate, cardClass) {
  const gold = candidate?.tier === 'gold' || (Number(candidate?.rating) >= 75 && Number(candidate?.rating) <= 99);
  const special = candidate?.special === true || Number(candidate?.rareflag || 0) > 1;
  const rare = candidate?.rare === true || Number(candidate?.rareflag || 0) > 0;
  if (cardClass === 'common-gold') return gold && !special && !rare;
  if (cardClass === 'rare-gold') return gold && !special && rare;
  if (cardClass === 'special') return special;
  if (cardClass === 'normal-gold' || cardClass === 'gold') return gold && !special;
  return false;
}

function matchingRatingRule(rules, rating) {
  return rules.find((rule) => rating >= Number(rule.min) && rating <= Number(rule.max)) || null;
}

export function listingCandidateRejection(candidate, policy) {
  const pile = String(candidate?.item?.pile || 'unknown');
  if (!policy.sources.includes(pile)) return 'source-not-allowed';
  if (String(candidate?.type || '').toLowerCase() !== 'player') return 'not-player';
  if (candidate?.tradeable !== true) return 'untradeable';
  if (candidate?.limitedUse === true) return 'limited-use';
  if (candidate?.concept === true) return 'concept';
  if (candidate?.academyEnrolled === true) return 'academy-enrolled';
  if (candidate?.evolution === true) return 'evolution';
  const auctionState = String(candidate?.auction?.state || 'none');
  if (auctionState === 'active') return 'active-trade';
  if (auctionState === 'closed') return 'closed-trade';
  if (candidate?.auction?.present === true && auctionState === 'unknown') return 'unknown-trade-state';
  if (pile === 'transfer' && auctionState === 'inactive' && policy.expiredPolicy !== 'reprice') {
    return 'expired-trade-skipped';
  }
  if (!matchesTradeCardClass(candidate, policy.cardClass)) return 'card-class-mismatch';
  if (!matchingRatingRule(policy.ratingRules, Number(candidate?.rating || 0))) return 'rating-rule-mismatch';
  if (!Number.isFinite(Number(candidate?.item?.id)) || Number(candidate.item.id) <= 0) return 'missing-item-id';
  if (!Number.isFinite(Number(candidate?.item?.definitionId)) || Number(candidate.item.definitionId) <= 0) return 'missing-definition-id';
  return null;
}

export function applyListingPriceLimits(entry, limitResult = {}) {
  const limits = limitResult.after || limitResult;
  const bidMinimum = Number(limits.minimum);
  const maximum = Number(limits.maximum);
  if (limitResult.status && limitResult.status !== 'loaded') {
    return { ok: false, reason: `price-limits-${limitResult.status}`, entry: { ...entry } };
  }
  if (!Number.isFinite(bidMinimum) || !Number.isFinite(maximum) || bidMinimum <= 0 || maximum < bidMinimum) {
    return { ok: false, reason: 'invalid-price-limits', entry: { ...entry } };
  }
  const requestedStart = Number(entry.startPrice);
  const requestedBuyNow = Number(entry.buyNow);
  if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedBuyNow)) {
    return { ok: false, reason: 'invalid-listing-prices', entry: { ...entry } };
  }
  const buyNowMinimum = eaListingPriceAbove(bidMinimum);
  if (buyNowMinimum > maximum) {
    return { ok: false, reason: 'price-limits-no-valid-buy-now', entry: { ...entry } };
  }
  const requiresLowerStart = requestedStart < requestedBuyNow;
  let buyNow = Math.min(maximum, Math.max(buyNowMinimum, requestedBuyNow));
  let startPrice = requiresLowerStart
    ? Math.min(buyNow, Math.min(maximum, Math.max(bidMinimum, requestedStart)))
    : buyNow;
  if (requiresLowerStart && startPrice >= buyNow) {
    const lower = eaListingPriceBelow(buyNow);
    if (lower >= bidMinimum) {
      startPrice = lower;
    } else {
      const higher = eaListingPriceAbove(buyNow);
      if (higher > maximum) {
        return { ok: false, reason: 'price-limits-no-valid-buy-now', entry: { ...entry } };
      }
      startPrice = buyNow;
      buyNow = higher;
    }
  }
  return {
    ok: true,
    reason: null,
    changed: buyNow !== Number(entry.buyNow) || startPrice !== Number(entry.startPrice),
    entry: {
      ...entry,
      startPrice,
      buyNow,
      priceLimitStatus: 'loaded',
      priceLimits: {
        minimum: bidMinimum,
        maximum,
        bidMinimum,
        buyNowMinimum,
      },
    },
  };
}

function confirmationHash(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createListingConfirmation(plan, options = {}) {
  const createdAt = Math.max(0, finiteNumber(options.now, Date.now()));
  const ttlMs = Math.max(1, finiteNumber(options.ttlMs, 10 * 60_000));
  const entries = (plan.entries || []).map((entry) => ({
    item: entry.item,
    startPrice: entry.startPrice,
    buyNow: entry.buyNow,
    durationSeconds: entry.durationSeconds,
    priceLimits: entry.priceLimits,
  }));
  const action = entries.length > 0 && entries.every((entry) => entry.item?.pile === 'transfer')
    ? 'reprice'
    : 'list';
  const token = `listing-${confirmationHash(JSON.stringify({ job: plan.job, entries, createdAt }))}`;
  return {
    token,
    createdAt,
    expiresAt: createdAt + ttlMs,
    itemCount: entries.length,
    action,
  };
}

function quoteForCandidate(candidate, quotesByDefinitionId, policy, now) {
  if (policy.marketOverride.enabled !== true) {
    return { status: 'disabled', quote: null };
  }
  const quote = quotesByDefinitionId.get(Number(candidate.item.definitionId));
  if (!quote || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0) {
    return { status: 'unavailable', quote: null };
  }
  const maxAgeMs = Number(policy.marketOverride.maxQuoteAgeMinutes) * 60_000;
  const quotedAt = Number(quote.quotedAt);
  const expiresAt = Number(quote.expiresAt);
  if (!Number.isFinite(quotedAt) || quotedAt < now - maxAgeMs || !Number.isFinite(expiresAt) || expiresAt <= now) {
    return { status: 'stale', quote };
  }
  return {
    status: Number(quote.price) > Number(candidate.rule.buyNow) ? 'applied' : 'below-configured',
    quote,
  };
}

function plannedPrice(candidate, quotesByDefinitionId, policy, now) {
  const configuredPrice = Number(candidate.rule.buyNow);
  const quoteResult = quoteForCandidate(candidate, quotesByDefinitionId, policy, now);
  const markedUp = quoteResult.status === 'applied'
    ? Number(quoteResult.quote.price) * (1 + Number(policy.marketOverride.markupPercent) / 100)
    : configuredPrice;
  const buyNow = roundEaListingPrice(markedUp);
  const startPrice = policy.startPricePolicy === 'same' ? buyNow : eaListingPriceBelow(buyNow);
  return {
    ok: !(
      policy.marketOverride.enabled === true
      && ['unavailable', 'stale'].includes(quoteResult.status)
      && policy.marketOverride.fallbackPolicy === 'skip'
    ) && buyNow <= TRADE_LISTING_MAX_BUY_NOW,
    reason: buyNow > TRADE_LISTING_MAX_BUY_NOW
      ? 'high-value-listing-excluded'
      : policy.marketOverride.enabled === true
        && ['unavailable', 'stale'].includes(quoteResult.status)
        && policy.marketOverride.fallbackPolicy === 'skip'
        ? `market-quote-${quoteResult.status}`
        : null,
    configuredPrice,
    quotedPrice: quoteResult.quote ? Number(quoteResult.quote.price) : null,
    quoteSource: quoteResult.quote ? String(quoteResult.quote.source || 'unknown') : null,
    quoteQuotedAt: quoteResult.quote && Number.isFinite(Number(quoteResult.quote.quotedAt)) ? Number(quoteResult.quote.quotedAt) : null,
    quoteExpiresAt: quoteResult.quote && Number.isFinite(Number(quoteResult.quote.expiresAt)) ? Number(quoteResult.quote.expiresAt) : null,
    quoteStatus: quoteResult.status,
    startPrice,
    buyNow,
  };
}

function sourceOrder(policy, pile) {
  const index = policy.sources.indexOf(pile);
  return index >= 0 ? index : policy.sources.length;
}

export function listingQuoteCandidatePoolLimit(maxListings) {
  const requested = Math.max(1, Math.floor(finiteNumber(maxListings, 1)));
  return Math.min(
    TRADE_LISTING_QUOTE_POOL_MAX,
    requested * TRADE_LISTING_QUOTE_POOL_MULTIPLIER,
  );
}

export function buildListingCandidatePool(input = {}) {
  const job = input.job;
  assertValidTradeJob(job, 'Listing job');
  if (job.type !== 'listing') throw new Error('Listing job.type must be listing');
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const requestedLimit = Number.isFinite(Number(input.limit))
    ? Math.max(0, Math.floor(Number(input.limit)))
    : candidates.length;
  const rejectionCounts = {};
  const rejectionSamples = [];
  const eligible = [];

  for (const candidate of candidates) {
    const reason = listingCandidateRejection(candidate, job.policy);
    if (reason) {
      rejectionCounts[reason] = Number(rejectionCounts[reason] || 0) + 1;
      if (rejectionSamples.length < REJECTION_SAMPLE_LIMIT) {
        rejectionSamples.push({ item: { ...candidate?.item }, reason, auction: diagnosticAuction(candidate?.auction) });
      }
      continue;
    }
    eligible.push({
      ...candidate,
      rule: matchingRatingRule(job.policy.ratingRules, Number(candidate.rating)),
    });
  }

  eligible.sort((left, right) => (
    sourceOrder(job.policy, left.item.pile) - sourceOrder(job.policy, right.item.pile)
    || Number(left.rating) - Number(right.rating)
    || Number(left.item.id) - Number(right.item.id)
  ));

  const poolCandidates = eligible.slice(0, requestedLimit);
  return {
    schemaVersion: 1,
    limit: requestedLimit,
    truncated: eligible.length > poolCandidates.length,
    candidates: poolCandidates,
    definitionIds: [...new Set(poolCandidates.map((candidate) => Number(candidate.item.definitionId)))],
    counts: {
      scanned: candidates.length,
      eligible: eligible.length,
      pooled: poolCandidates.length,
      deferred: Math.max(0, eligible.length - poolCandidates.length),
      rejected: candidates.length - eligible.length,
    },
    rejectionCounts,
    rejectionSamples,
  };
}

export function buildListingPlan(input = {}) {
  const job = input.job;
  assertValidTradeJob(job, 'Listing job');
  if (job.type !== 'listing') throw new Error('Listing job.type must be listing');
  const now = Math.max(0, finiteNumber(input.now, Date.now()));
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const quotesByDefinitionId = new Map((input.quotes || []).map((quote) => [Number(quote.definitionId), quote]));
  const candidatePool = input.candidatePool || buildListingCandidatePool({
    job,
    candidates,
    limit: input.candidatePoolLimit,
  });
  const rejectionCounts = { ...candidatePool.rejectionCounts };
  const rejectionSamples = [...candidatePool.rejectionSamples];
  const maxListings = Number(job.policy.maxListings);
  const entries = [];
  let evaluated = 0;
  let priceRejected = 0;
  for (const candidate of candidatePool.candidates) {
    if (entries.length >= maxListings) break;
    evaluated += 1;
    const price = plannedPrice(candidate, quotesByDefinitionId, job.policy, now);
    if (!price.ok) {
      priceRejected += 1;
      rejectionCounts[price.reason] = Number(rejectionCounts[price.reason] || 0) + 1;
      if (rejectionSamples.length < REJECTION_SAMPLE_LIMIT) {
        rejectionSamples.push({ item: { ...candidate.item }, reason: price.reason, auction: diagnosticAuction(candidate.auction) });
      }
      continue;
    }
    const { ok: _priceReady, reason: _priceReason, ...priceFields } = price;
    entries.push({
      index: entries.length + 1,
      item: { ...candidate.item },
      name: String(candidate.name || candidate.item.definitionId),
      rating: Number(candidate.rating),
      cardClass: job.policy.cardClass,
      auctionState: String(candidate.auction?.state || 'none'),
      ...priceFields,
      durationSeconds: Number(job.policy.durationSeconds),
      priceLimitStatus: 'pending',
    });
  }
  const quoteWarnings = entries.filter((entry) => ['unavailable', 'stale'].includes(entry.quoteStatus)).length;
  return {
    schemaVersion: 1,
    createdAt: now,
    job: { id: job.id, name: job.name, type: job.type },
    policy: {
      sources: [...job.policy.sources],
      cardClass: job.policy.cardClass,
      durationSeconds: job.policy.durationSeconds,
      maxListings: job.policy.maxListings,
      expiredPolicy: job.policy.expiredPolicy,
      marketOverride: { ...job.policy.marketOverride },
    },
    counts: {
      scanned: candidatePool.counts.scanned,
      eligible: candidatePool.counts.eligible,
      evaluated,
      selected: entries.length,
      deferred: Math.max(0, candidatePool.counts.eligible - evaluated),
      rejected: candidatePool.counts.rejected + priceRejected,
    },
    candidatePool: {
      limit: candidatePool.limit,
      size: candidatePool.candidates.length,
      truncated: candidatePool.truncated,
    },
    entries,
    rejectionCounts,
    rejectionSamples,
    warnings: [
      ...(quoteWarnings ? [`${quoteWarnings} selected item(s) have unavailable or stale market quotes`] : []),
      ...(entries.length ? ['EA price limits will be refreshed and applied immediately before listing'] : []),
    ],
  };
}
