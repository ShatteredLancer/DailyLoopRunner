import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { createListingConfirmation } from '../../src/trade/listing-plan.js';
import { createListingTransaction } from '../../src/trade/listing-transaction.js';

function job(overrides = {}) {
  return normalizeTradeJob({
    id: 'listing-run',
    name: 'Listing Run',
    type: 'listing',
    policy: {
      sources: ['club'],
      cardClass: 'common-gold',
      ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      maxListings: 1,
      listingDelaySeconds: [1, 1],
      marketOverride: { enabled: false, markupPercent: 5, maxQuoteAgeMinutes: 10 },
      ...overrides,
    },
  }, { now: 1 });
}

function prepared(entries, now = 1000) {
  const plan = {
    job: { id: 'listing-run', name: 'Listing Run', type: 'listing' },
    entries,
  };
  return {
    mode: 'prepared',
    ready: true,
    plan,
    confirmation: createListingConfirmation(plan, { now }),
  };
}

function entry(id = 1) {
  return {
    index: 1,
    item: { id, definitionId: id + 100, pile: 'club' },
    name: `Player ${id}`,
    rating: 80,
    cardClass: 'common-gold',
    auctionState: 'none',
    startPrice: 700,
    buyNow: 750,
    durationSeconds: 3600,
    priceLimitStatus: 'loaded',
    priceLimits: { minimum: 700, maximum: 10_000 },
  };
}

function transferEntry(id = 2) {
  return {
    ...entry(id),
    item: { id, definitionId: id + 100, pile: 'transfer' },
    name: `Transfer Player ${id}`,
    rating: 85,
    cardClass: 'rare-gold',
    auctionState: 'inactive',
    startPrice: 700,
    buyNow: 750,
  };
}

function transaction(adapter, times = [1100, 1200]) {
  let index = 0;
  return createListingTransaction({
    tradeAdapter: adapter,
    now: () => times[Math.min(index++, times.length - 1)],
    sleep: async () => {},
    random: () => 0,
    createRunId: () => 'run-1',
  });
}

describe('Trade listing transaction', () => {
  it('lists one exact Club item and verifies the active Transfer auction', async () => {
    const adapter = createFakeTradeAdapter({
      coins: 100_000,
      transferCapacity: { used: 10, max: 100 },
      items: [{
        id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
      }],
    });
    const plan = prepared([entry()]);
    const result = await transaction(adapter).run({
      job: job(),
      prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });
    expect(result).toMatchObject({
      runId: 'run-1',
      status: 'completed',
      reason: null,
      requested: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      coinsBefore: 100_000,
      coinsAfter: 100_000,
      receipts: [{
        status: 'listed',
        item: { id: 1, definitionId: 101, pile: 'club' },
        priceLimitRefresh: {
          status: 'completed',
          limitsSource: 'refreshed',
          response: { success: true, status: null, code: null },
          error: null,
        },
        verification: {
          item: { id: 1, definitionId: 101, pile: 'transfer' },
          auction: { state: 'active', startingBid: 700, buyNowPrice: 750 },
        },
      }],
    });
    expect(adapter.inspectCapabilities().transferCapacity).toEqual({ used: 11, max: 100, free: 89 });
    expect(adapter.calls.filter((call) => call.method === 'listItem')).toHaveLength(1);
  });

  it('reprices one exact inactive Transfer item and verifies the active auction', async () => {
    const adapter = createFakeTradeAdapter({
      coins: 100_000,
      transferCapacity: { used: 10, max: 100 },
      items: [{
        id: 2, definitionId: 102, pile: 'transfer', type: 'player', rating: 85, tier: 'gold', rare: true,
        tradeable: true, minimum: 300, maximum: 10_000,
        auction: { present: true, state: 'inactive', tradeId: 2002, startingBid: 1800, buyNowPrice: 1900 },
      }],
    });
    const plan = prepared([transferEntry()]);
    expect(plan.confirmation.requiredText).toBe('REPRICE 1');

    const result = await transaction(adapter).run({
      job: job({
        sources: ['transfer'],
        cardClass: 'rare-gold',
        ratingRules: [{ min: 85, max: 85, buyNow: 700 }],
        expiredPolicy: 'reprice',
      }),
      prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });

    expect(result).toMatchObject({
      status: 'completed',
      succeeded: 1,
      failed: 0,
      receipts: [{
        status: 'listed',
        item: { id: 2, definitionId: 102, pile: 'transfer' },
        verification: { auction: { state: 'active', startingBid: 700, buyNowPrice: 750 } },
      }],
    });
    expect(adapter.inspectCapabilities().transferCapacity).toEqual({ used: 10, max: 100, free: 90 });
    expect(adapter.calls.filter((call) => call.method === 'refreshTransferItems')).toHaveLength(2);
    expect(adapter.calls.filter((call) => call.method === 'listItem')).toHaveLength(1);
  });

  it('blocks a stale Transfer reprice when the live auction is no longer inactive', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{
        id: 2, definitionId: 102, pile: 'transfer', type: 'player', rating: 85, tier: 'gold', rare: true,
        tradeable: true, minimum: 300, maximum: 10_000,
        auction: { present: true, state: 'active', tradeId: 2002, startingBid: 700, buyNowPrice: 700 },
      }],
    });
    const plan = prepared([transferEntry()]);
    const result = await transaction(adapter).run({
      job: job({
        sources: ['transfer'],
        cardClass: 'rare-gold',
        ratingRules: [{ min: 85, max: 85, buyNow: 700 }],
        expiredPolicy: 'reprice',
      }),
      prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });

    expect(result).toMatchObject({ status: 'blocked', reason: 'listing-item-active-trade', failed: 1 });
    expect(adapter.calls.filter((call) => call.method === 'listItem')).toHaveLength(0);
  });

  it('uses the Scheduler run identity and scheduled time when provided', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{
        id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
      }],
    });
    const plan = prepared([entry()]);
    const result = await transaction(adapter).run({
      job: job(),
      prepared: plan,
      runId: 'scheduler-run-1',
      scheduledFor: 900,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });
    expect(result).toMatchObject({ runId: 'scheduler-run-1', scheduledFor: 900, status: 'completed' });
  });

  it('blocks before listItem when the scheduled execution lease is lost', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{
        id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
      }],
    });
    const plan = prepared([entry()]);
    const beforeMutation = vi.fn(() => false);
    const result = await transaction(adapter).run({
      job: job(),
      prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
      beforeMutation,
    });
    expect(result).toMatchObject({
      status: 'blocked', reason: 'listing-execution-lease-lost', succeeded: 0, failed: 1,
    });
    expect(beforeMutation).toHaveBeenCalledOnce();
    expect(adapter.calls.filter((call) => call.method === 'listItem')).toHaveLength(0);
  });

  it('blocks before every write when confirmation does not match', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{ id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true, minimum: 700, maximum: 10_000 }],
    });
    const plan = prepared([entry()]);
    const result = await transaction(adapter).run({
      job: job(),
      prepared: plan,
      confirmationToken: 'wrong',
      confirmationText: 'LIST 1',
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'listing-confirmation-mismatch', succeeded: 0, skipped: 1 });
    expect(adapter.calls.some((call) => call.method === 'listItem')).toBe(false);
  });

  it('refreshes Transfer and blocks a stale Club plan for an item already in Transfer', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{
        id: 1, definitionId: 101, pile: 'transfer', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
        auction: { present: true, state: 'active', tradeId: 1001, startingBid: 700, buyNowPrice: 700 },
      }],
    });
    const plan = prepared([entry()]);
    const result = await transaction(adapter).run({
      job: job(), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });
    expect(result).toMatchObject({
      status: 'blocked', reason: 'listing-item-already-in-transfer', failed: 1, succeeded: 0,
      receipts: [{
        status: 'blocked', reason: 'listing-item-already-in-transfer',
        transferPreflight: { status: 'completed' },
        live: { id: 1, definitionId: 101, pile: 'transfer' },
      }],
    });
    expect(adapter.calls.filter((call) => call.method === 'refreshTransferItems')).toHaveLength(1);
    expect(adapter.calls.some((call) => call.method === 'listItem')).toBe(false);
  });

  it('blocks expired confirmations and plans above the configured item limit', async () => {
    const adapter = createFakeTradeAdapter({
      items: [1, 2].map((id) => ({
        id, definitionId: id + 100, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
      })),
    });
    const expired = prepared([entry()]);
    const expiredResult = await transaction(adapter, [700_000, 700_001]).run({
      job: job(), prepared: expired,
      confirmationToken: expired.confirmation.token,
      confirmationText: expired.confirmation.requiredText,
    });
    expect(expiredResult).toMatchObject({ status: 'blocked', reason: 'listing-confirmation-expired' });

    const oversized = prepared([entry(1), { ...entry(2), index: 2 }]);
    const oversizedResult = await transaction(adapter).run({
      job: job(), prepared: oversized,
      confirmationToken: oversized.confirmation.token,
      confirmationText: oversized.confirmation.requiredText,
    });
    expect(oversizedResult).toMatchObject({ status: 'blocked', reason: 'listing-plan-exceeds-job-limit' });
    expect(adapter.calls.some((call) => call.method === 'listItem')).toBe(false);
  });

  it('blocks when Transfer capacity is full', async () => {
    const adapter = createFakeTradeAdapter({
      transferCapacity: { used: 100, max: 100 },
      items: [{ id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true, minimum: 700, maximum: 10_000 }],
    });
    const plan = prepared([entry()]);
    const result = await transaction(adapter).run({
      job: job(), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'transfer-list-full', failed: 1 });
    expect(adapter.calls.some((call) => call.method === 'listItem')).toBe(false);
  });

  it('requires a new confirmation when live price limits change the listing price', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{ id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true, minimum: 800, maximum: 10_000 }],
    });
    const plan = prepared([entry()]);
    const result = await transaction(adapter).run({
      job: job(), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'listing-price-changed-after-confirmation', failed: 1 });
    expect(adapter.calls.some((call) => call.method === 'listItem')).toBe(false);
  });

  it('honors Stop between items without issuing another list call', async () => {
    const adapter = createFakeTradeAdapter({
      items: [1, 2].map((id) => ({
        id, definitionId: id + 100, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
      })),
    });
    const entries = [entry(1), { ...entry(2), index: 2 }];
    const plan = prepared(entries);
    const result = await transaction(adapter).run({
      job: job({ maxListings: 2 }), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
      shouldStop: () => adapter.calls.filter((call) => call.method === 'listItem').length >= 1,
    });
    expect(result).toMatchObject({ status: 'stopped', reason: 'stopped-by-user', succeeded: 1, failed: 0, skipped: 1 });
    expect(adapter.calls.filter((call) => call.method === 'listItem')).toHaveLength(1);
  });

  it('preserves the first listed item and stops after an uncertain second mutation', async () => {
    const adapter = createFakeTradeAdapter({
      items: [1, 2].map((id) => ({
        id, definitionId: id + 100, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
      })),
      listResults: {
        2: { status: 'ambiguous', response: null, error: { kind: 'ambiguous-transport' } },
      },
    });
    const entries = [entry(1), { ...entry(2), index: 2 }];
    const plan = prepared(entries);
    const result = await transaction(adapter).run({
      job: job({ maxListings: 2 }), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });

    expect(result).toMatchObject({
      status: 'ambiguous', succeeded: 1, failed: 1, skipped: 0,
      receipts: [{ status: 'listed' }, { status: 'ambiguous' }],
    });
    expect(adapter.calls.filter((call) => call.method === 'listItem')).toHaveLength(2);
  });

  it('checkpoints both item mutation boundaries and terminal states', async () => {
    const adapter = createFakeTradeAdapter({
      items: [1, 2].map((id) => ({
        id, definitionId: id + 100, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 700, maximum: 10_000,
      })),
    });
    const entries = [entry(1), { ...entry(2), index: 2 }];
    const plan = prepared(entries);
    const checkpoints = [];
    const result = await createListingTransaction({
      tradeAdapter: adapter,
      now: () => 1100,
      sleep: async () => {},
      onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
    }).run({
      job: job({ maxListings: 2 }), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });

    expect(result).toMatchObject({ status: 'completed', succeeded: 2 });
    expect(checkpoints.filter((entry) => entry.phase === 'listing-request-started')).toEqual([
      expect.objectContaining({ itemIndex: 1, mutationBoundaryCrossed: true }),
      expect.objectContaining({ itemIndex: 2, mutationBoundaryCrossed: true }),
    ]);
    expect(checkpoints.filter((entry) => entry.phase === 'item-finished')).toEqual([
      expect.objectContaining({ itemIndex: 1, status: 'listed' }),
      expect.objectContaining({ itemIndex: 2, status: 'listed' }),
    ]);
  });

  it('stops as ambiguous instead of retrying when an accepted listing cannot be refreshed', async () => {
    const adapter = createFakeTradeAdapter({
      refreshTransferResults: [
        { status: 'completed', response: { success: true, status: 200, code: null }, error: null },
        { status: 'ambiguous', response: null, error: { kind: 'ambiguous-transport' } },
      ],
      items: [{ id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true, minimum: 700, maximum: 10_000 }],
    });
    const plan = prepared([entry()]);
    const result = await transaction(adapter).run({
      job: job(), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });
    expect(result).toMatchObject({ status: 'ambiguous', reason: 'listing-accepted-but-not-verified', succeeded: 0, failed: 1 });
    expect(adapter.calls.filter((call) => call.method === 'listItem')).toHaveLength(1);
  });

  it('keeps an accepted listing ambiguous when local budget blocks verification without opening Circuit', async () => {
    const base = createFakeTradeAdapter({
      items: [{ id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true, minimum: 700, maximum: 10_000 }],
    });
    let refreshCount = 0;
    const adapter = {
      ...base,
      refreshTransferItems: vi.fn(async () => {
        refreshCount += 1;
        return refreshCount === 1
          ? { status: 'completed', response: { success: true, status: 200, code: null }, error: null }
          : {
            status: 'blocked', response: null,
            error: { kind: 'request-budget-exhausted', action: 'wait-until-budget-reset', retryAt: 6000 },
          };
      }),
    };
    const circuit = { availability: () => ({ allowed: true }), recordFailure: vi.fn(), recordSuccess: vi.fn() };
    const plan = prepared([entry()]);
    const result = await createListingTransaction({
      tradeAdapter: adapter,
      circuitBreaker: circuit,
      now: () => 1100,
      createRunId: () => 'listing-run-budget-verification',
    }).run({
      job: job(), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });
    expect(result).toMatchObject({
      status: 'ambiguous',
      reason: 'listing-accepted-request-budget-exhausted-before-verification',
      succeeded: 0,
      failed: 1,
    });
    expect(base.calls.filter((call) => call.method === 'listItem')).toHaveLength(1);
    expect(circuit.recordFailure).not.toHaveBeenCalled();
    expect(circuit.recordSuccess).not.toHaveBeenCalled();
  });

  it('opens the persistent circuit and never retries an EA 427 listing rejection', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{ id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true, minimum: 700, maximum: 10_000 }],
      listResults: {
        1: { status: 'rejected', response: { success: false, status: 427 }, error: { kind: 'auction-operation-blocked', code: 427 } },
      },
    });
    const circuit = {
      availability: () => ({ allowed: true }),
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
    };
    const plan = prepared([entry()]);
    const result = await createListingTransaction({
      tradeAdapter: adapter,
      circuitBreaker: circuit,
      now: () => 1100,
      createRunId: () => 'run-427',
    }).run({
      job: job(), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });
    expect(result).toMatchObject({
      runId: 'run-427', status: 'blocked', reason: 'trade-auction-operation-blocked',
      failed: 1, succeeded: 0,
    });
    expect(adapter.calls.filter((call) => call.method === 'listItem')).toHaveLength(1);
    expect(circuit.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 427 }),
      expect.objectContaining({ action: 'list', endpoint: '/auctionhouse', jobId: 'listing-run', runId: 'run-427' }),
    );
    expect(circuit.recordSuccess).not.toHaveBeenCalled();
  });

  it('blocks before any EA write when the trade circuit is open', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{ id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80, tradeable: true, minimum: 700, maximum: 10_000 }],
    });
    const plan = prepared([entry()]);
    const result = await createListingTransaction({
      tradeAdapter: adapter,
      circuitBreaker: { availability: () => ({ allowed: false, state: { reason: 'auction-operation-blocked' } }) },
      now: () => 1100,
    }).run({
      job: job(), prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'trade-circuit-open', skipped: 1 });
    expect(adapter.calls.some((call) => call.method === 'listItem')).toBe(false);
  });

  it('rechecks the high-value cap after EA raises live price limits and before listing', async () => {
    const adapter = createFakeTradeAdapter({
      items: [{
        id: 1, definitionId: 101, pile: 'club', type: 'player', rating: 80,
        tradeable: true, minimum: 10_000, maximum: 50_000,
      }],
    });
    const highEntry = {
      ...entry(),
      startPrice: 9900,
      buyNow: 10_000,
      priceLimits: { minimum: 9900, maximum: 50_000 },
    };
    const plan = prepared([highEntry]);
    const result = await transaction(adapter).run({
      job: job({ ratingRules: [{ min: 75, max: 82, buyNow: 10_000 }] }),
      prepared: plan,
      confirmationToken: plan.confirmation.token,
      confirmationText: plan.confirmation.requiredText,
    });

    expect(result).toMatchObject({
      status: 'blocked', reason: 'high-value-listing-excluded', succeeded: 0, failed: 1,
    });
    expect(adapter.calls.some((call) => call.method === 'listItem')).toBe(false);
  });
});
