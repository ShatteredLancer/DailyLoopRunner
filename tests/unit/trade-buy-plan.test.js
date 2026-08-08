import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { buildBuyLanePlan, nextBuySearch, selectBuyCandidate } from '../../src/trade/buy-plan.js';

function job(overrides = {}) {
  return normalizeTradeJob({
    id: 'buy-84-85', name: 'Buy 84-85', type: 'buy', enabled: true, armed: false,
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 85, maxBuyNow: 1000,
      ratingPriceOverrides: { 85: 1200 }, quantity: 2, totalBudget: 2200,
      ...overrides,
    },
  }, { now: 1 });
}

function candidate(id, definitionId, rating, buyNowPrice, options = {}) {
  return {
    item: { id, definitionId, pile: 'market' },
    type: 'player', rating, tier: 'gold', rare: options.rare !== false, special: options.special === true,
    auction: {
      present: true, state: 'active', tradeId: options.tradeId || id + 1000,
      buyNowPrice, expires: options.expires ?? 100,
    },
  };
}

describe('Trade Buy Planner', () => {
  it('materializes every exact rating lane and rotates deterministic cursors', () => {
    const catalog = {
      lanes: [
        { rating: 84, definitionIds: [8401, 8402], source: 'cache' },
        { rating: 85, definitionIds: [8501, 8502], source: 'cache' },
      ],
    };
    const first = buildBuyLanePlan({ job: job(), catalog, runId: 'run-a' });
    const same = buildBuyLanePlan({ job: job(), catalog, runId: 'run-a' });
    expect(first).toEqual(same);
    expect(first.ready).toBe(true);
    expect(first.lanes.map((lane) => [lane.rating, lane.maxBuyNow]).sort()).toEqual([[84, 1000], [85, 1200]]);
    const searches = [];
    let cursor = first.cursor;
    for (let index = 0; index < 4; index += 1) {
      const next = nextBuySearch(first, cursor);
      searches.push(next.search);
      cursor = next.cursor;
    }
    expect(new Set(searches.map((entry) => entry.rating))).toEqual(new Set([84, 85]));
    expect(new Set(searches.map((entry) => entry.definitionId))).toEqual(new Set([8401, 8402, 8501, 8502]));
  });

  it('fails closed when any requested rating lane is unavailable', () => {
    const plan = buildBuyLanePlan({
      job: job(),
      catalog: { lanes: [{ rating: 84, definitionIds: [8401] }] },
      runId: 'run-a',
    });
    expect(plan).toMatchObject({ ready: false, missingRatings: [85] });
    expect(nextBuySearch(plan).search).toBeNull();
  });

  it('selects the lowest valid Buy Now with expires and trade ID tie-breaks', () => {
    const currentJob = job();
    const search = { rating: 84, definitionId: 8401, maxBuyNow: 1000 };
    const result = selectBuyCandidate({
      job: currentJob,
      search,
      limits: { remainingBudget: 1000, coins: 5000 },
      candidates: [
        candidate(1, 8401, 84, 950, { expires: 50, tradeId: 100 }),
        candidate(2, 8401, 84, 900, { expires: 80, tradeId: 200 }),
        candidate(3, 8401, 84, 900, { expires: 40, tradeId: 300 }),
        candidate(4, 8401, 84, 900, { expires: 40, tradeId: 250 }),
        candidate(5, 8402, 84, 500),
        candidate(6, 8401, 84, 1100),
        candidate(7, 8401, 84, 800, { rare: false }),
      ],
    });
    expect(result.selected.item.id).toBe(4);
    expect(result).toMatchObject({
      eligibleCount: 4,
      rejectedCount: 3,
      rejectionCounts: { 'definition-mismatch': 1, 'rating-price-limit': 1, 'card-class-mismatch': 1 },
    });
  });
});
