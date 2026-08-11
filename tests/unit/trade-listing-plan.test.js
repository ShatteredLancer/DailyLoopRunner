import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import {
  buildListingPlan,
  applyListingPriceLimits,
  eaListingPriceAbove,
  eaListingPriceBelow,
  matchesTradeCardClass,
  roundEaListingPrice,
} from '../../src/trade/listing-plan.js';

function listingJob(policy = {}) {
  return normalizeTradeJob({
    id: 'listing-preview',
    name: 'Listing Preview',
    type: 'listing',
    policy: {
      sources: ['transfer', 'club'],
      cardClass: 'normal-gold',
      ratingRules: [{ min: 75, max: 84, buyNow: 700 }],
      maxListings: 10,
      marketOverride: { enabled: false, markupPercent: 5, maxQuoteAgeMinutes: 10 },
      ...policy,
    },
  }, { now: 1 });
}

function candidate(id, overrides = {}) {
  const pile = overrides.pile || 'club';
  return {
    item: { id, definitionId: overrides.definitionId || id + 1000, pile },
    name: overrides.name || `Player ${id}`,
    type: overrides.type || 'player',
    rating: overrides.rating || 80,
    tier: overrides.tier || 'gold',
    rare: overrides.rare === true,
    special: overrides.special === true,
    rareflag: overrides.rareflag ?? (overrides.special ? 2 : overrides.rare ? 1 : 0),
    tradeable: overrides.tradeable !== false,
    evolution: overrides.evolution === true,
    limitedUse: overrides.limitedUse === true,
    concept: overrides.concept === true,
    academyEnrolled: overrides.academyEnrolled === true,
    auction: overrides.auction || { present: false, state: 'none' },
  };
}

describe('Trade listing preview planner', () => {
  it('keeps common, rare, normal Gold and Special card classes distinct', () => {
    const common = candidate(1);
    const rare = candidate(2, { rare: true });
    const special = candidate(3, { rare: true, special: true });
    expect(matchesTradeCardClass(common, 'common-gold')).toBe(true);
    expect(matchesTradeCardClass(rare, 'common-gold')).toBe(false);
    expect(matchesTradeCardClass(rare, 'rare-gold')).toBe(true);
    expect(matchesTradeCardClass(special, 'rare-gold')).toBe(false);
    expect(matchesTradeCardClass(common, 'normal-gold')).toBe(true);
    expect(matchesTradeCardClass(rare, 'normal-gold')).toBe(true);
    expect(matchesTradeCardClass(special, 'normal-gold')).toBe(false);
    expect(matchesTradeCardClass(special, 'special')).toBe(true);
  });

  it('filters unsafe entities and orders eligible items by configured source then rating', () => {
    const job = listingJob({ maxListings: 2, expiredPolicy: 'reprice' });
    const plan = buildListingPlan({
      job,
      now: 1000,
      candidates: [
        candidate(4, { pile: 'club', rating: 79 }),
        candidate(3, { pile: 'transfer', rating: 81, auction: { present: true, state: 'inactive' } }),
        candidate(2, { pile: 'transfer', rating: 80, auction: { present: true, state: 'active' } }),
        candidate(1, { pile: 'club', rating: 78, tradeable: false }),
        candidate(5, { pile: 'club', rating: 80, special: true }),
      ],
    });
    expect(plan.entries.map((entry) => entry.item.id)).toEqual([3, 4]);
    expect(plan.counts).toEqual({ scanned: 5, eligible: 2, selected: 2, deferred: 0, rejected: 3 });
    expect(plan.rejectionCounts).toEqual({
      'active-trade': 1,
      untradeable: 1,
      'card-class-mismatch': 1,
    });
  });

  it('skips expired Transfer items unless the read-only reprice policy includes them', () => {
    const expired = candidate(1, {
      pile: 'transfer',
      auction: { present: true, state: 'inactive' },
    });
    const skipped = buildListingPlan({
      job: listingJob({ sources: ['transfer'], expiredPolicy: 'skip' }),
      candidates: [expired],
      now: 100,
    });
    const included = buildListingPlan({
      job: listingJob({ sources: ['transfer'], expiredPolicy: 'reprice' }),
      candidates: [expired],
      now: 100,
    });

    expect(skipped.entries).toEqual([]);
    expect(skipped.rejectionCounts).toEqual({ 'expired-trade-skipped': 1 });
    expect(skipped.rejectionSamples[0]).toMatchObject({
      reason: 'expired-trade-skipped',
      auction: {
        present: true,
        state: 'inactive',
        stateSource: 'unknown',
        signals: { active: null, closed: null, inactive: null },
      },
    });
    expect(skipped.policy.expiredPolicy).toBe('skip');
    expect(included.entries).toHaveLength(1);
    expect(included.entries[0]).toMatchObject({
      item: { id: 1, pile: 'transfer' },
      auctionState: 'inactive',
    });
    expect(included.policy.expiredPolicy).toBe('reprice');
  });

  it('always rejects active Transfer items even when expired items are included', () => {
    const plan = buildListingPlan({
      job: listingJob({ sources: ['transfer'], expiredPolicy: 'reprice' }),
      candidates: [candidate(1, {
        pile: 'transfer',
        auction: { present: true, state: 'active' },
      })],
      now: 100,
    });

    expect(plan.entries).toEqual([]);
    expect(plan.rejectionCounts).toEqual({ 'active-trade': 1 });
  });

  it('applies a fresh higher quote with markup and falls back for stale quotes', () => {
    const now = 1_000_000;
    const job = listingJob({
      maxListings: 2,
      marketOverride: { enabled: true, markupPercent: 5, maxQuoteAgeMinutes: 10 },
    });
    const candidates = [candidate(1), candidate(2)];
    const plan = buildListingPlan({
      job,
      candidates,
      now,
      quotes: [
        { definitionId: 1001, price: 800, source: 'FUTNext', quotedAt: now - 1000, expiresAt: now + 1000 },
        { definitionId: 1002, price: 900, source: 'FUTNext', quotedAt: now - 700_000, expiresAt: now + 1000 },
      ],
    });
    expect(plan.entries[0]).toMatchObject({
      configuredPrice: 700,
      quotedPrice: 800,
      quoteStatus: 'applied',
      buyNow: 850,
      startPrice: 800,
    });
    expect(plan.entries[1]).toMatchObject({
      configuredPrice: 700,
      quotedPrice: 900,
      quoteStatus: 'stale',
      buyNow: 700,
      startPrice: 650,
    });
    expect(plan.warnings[0]).toMatch(/1 selected item/);
  });

  it('uses EA listing price increments at each threshold', () => {
    expect(roundEaListingPrice(149)).toBe(150);
    expect(roundEaListingPrice(999)).toBe(1000);
    expect(roundEaListingPrice(1001)).toBe(1100);
    expect(roundEaListingPrice(10_001)).toBe(10_250);
    expect(roundEaListingPrice(50_001)).toBe(50_500);
    expect(roundEaListingPrice(100_001)).toBe(101_000);
    expect(eaListingPriceBelow(1000)).toBe(950);
    expect(eaListingPriceBelow(10_000)).toBe(9900);
    expect(eaListingPriceBelow(100_000)).toBe(99_500);
    expect(eaListingPriceAbove(700)).toBe(750);
    expect(eaListingPriceAbove(1000)).toBe(1100);
    expect(eaListingPriceAbove(10_000)).toBe(10_250);
  });

  it('treats the EA minimum as the Bid floor and derives the next-step Buy Now floor', () => {
    expect(applyListingPriceLimits({ startPrice: 650, buyNow: 700 }, {
      status: 'loaded', after: { minimum: 650, maximum: 10_000 },
    })).toMatchObject({
      ok: true,
      changed: false,
      entry: {
        startPrice: 650,
        buyNow: 700,
        priceLimits: { bidMinimum: 650, buyNowMinimum: 700 },
      },
    });
    expect(applyListingPriceLimits({ startPrice: 650, buyNow: 700 }, {
      status: 'loaded', after: { minimum: 700, maximum: 10_000 },
    })).toMatchObject({
      ok: true,
      changed: true,
      entry: { startPrice: 700, buyNow: 750 },
    });
    expect(applyListingPriceLimits({ startPrice: 700, buyNow: 700 }, {
      status: 'loaded', after: { minimum: 700, maximum: 10_000 },
    })).toMatchObject({
      ok: true,
      changed: true,
      entry: { startPrice: 750, buyNow: 750 },
    });
    expect(applyListingPriceLimits({ startPrice: 650, buyNow: 700 }, {
      status: 'loaded', after: { minimum: 700, maximum: 700 },
    })).toMatchObject({ ok: false, reason: 'price-limits-no-valid-buy-now' });
  });

  it('limits selected entries and returns detached serializable output', () => {
    const raw = candidate(1);
    const plan = buildListingPlan({
      job: listingJob({ maxListings: 1 }),
      candidates: [raw, candidate(2)],
      now: 100,
    });
    raw.item.id = 99;
    expect(plan.entries[0].item.id).toBe(1);
    expect(plan.counts.deferred).toBe(1);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});
