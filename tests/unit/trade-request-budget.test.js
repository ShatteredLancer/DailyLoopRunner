import { describe, expect, it } from 'vitest';
import {
  createTradeRequestBudget,
  inspectTradeRequestCapacity,
  tradeBuyRequestReserve,
  tradeListingRequestReserve,
} from '../../src/trade/request-budget.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
  };
}

function serialLockManager() {
  let queue = Promise.resolve();
  const calls = [];
  return {
    calls,
    request(name, options, callback) {
      calls.push({ name, options });
      const result = queue.then(callback);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

describe('Trade request budget', () => {
  it('computes bounded worst-case reserves per one/two-card chunk, including four-item Runs', () => {
    expect(tradeListingRequestReserve({ maxListings: 1 })).toBe(12);
    expect(tradeListingRequestReserve({ maxListings: 2 })).toBe(12);
    expect(tradeBuyRequestReserve({ quantity: 1, maxConsecutiveEmptySearches: 5 })).toBe(14);
    expect(tradeBuyRequestReserve({ quantity: 2, maxConsecutiveEmptySearches: 5 })).toBe(28);
    expect(tradeListingRequestReserve({ maxListings: 4 })).toBe(12);
    expect(tradeBuyRequestReserve({ quantity: 4, maxConsecutiveEmptySearches: 5 })).toBe(28);
    expect(inspectTradeRequestCapacity({ remaining: 27 }, 28)).toMatchObject({
      ready: false, required: 28, reason: 'trade-request-budget-insufficient',
    });
  });
  it('counts actual attempts in a fixed sliding window and recovers only after expiry', async () => {
    let time = 1000;
    const budget = createTradeRequestBudget({ storage: memoryStorage(), now: () => time, limit: 3, windowMs: 5000 });
    expect(await budget.take('market-search')).toMatchObject({ allowed: true, remaining: 2 });
    time = 2000;
    expect(await budget.take('buy')).toMatchObject({ allowed: true, remaining: 1 });
    time = 3000;
    expect(await budget.take('purchase-refresh')).toMatchObject({ allowed: true, remaining: 0 });
    expect(await budget.take('list')).toMatchObject({ allowed: false, remaining: 0, retryAt: 6000 });
    expect(budget.inspect()).toMatchObject({
      status: 'cooldown', used: 3, remaining: 0,
      byAction: { 'market-search': 1, buy: 1, 'purchase-refresh': 1 },
    });
    time = 6001;
    expect(budget.inspect()).toMatchObject({ status: 'available', used: 2, remaining: 1 });
  });

  it('serializes cross-tab permits and never exposes the persisted request entries', async () => {
    const lockManager = serialLockManager();
    const budget = createTradeRequestBudget({
      storage: memoryStorage(), now: () => 1000, limit: 2, windowMs: 5000, lockManager,
    });
    const results = await Promise.all([
      budget.take('list'), budget.take('buy'), budget.take('market-search'),
    ]);
    expect(results.filter((entry) => entry.allowed)).toHaveLength(2);
    expect(results.filter((entry) => !entry.allowed)).toHaveLength(1);
    expect(lockManager.calls).toHaveLength(3);
    const snapshot = budget.inspect();
    expect(snapshot.lock.supported).toBe(true);
    expect(snapshot).not.toHaveProperty('requests');
    expect(JSON.stringify(snapshot)).not.toContain('definitionId');
  });

  it('requires a reconciliation reserve without consuming it during inspection', () => {
    expect(inspectTradeRequestCapacity({ remaining: 12 })).toMatchObject({ ready: true, required: 12 });
    expect(inspectTradeRequestCapacity({ remaining: 11, retryAt: 5000 })).toEqual({
      ready: false,
      required: 12,
      remaining: 11,
      retryAt: 5000,
      reason: 'trade-request-budget-insufficient',
    });
  });

  it('atomically reserves slots from general callers and releases only unused slots', async () => {
    const budget = createTradeRequestBudget({
      storage: memoryStorage(),
      now: () => 1000,
      limit: 5,
      windowMs: 5000,
      createReservationId: () => 'reservation-a',
    });
    const reservation = await budget.reserve(3);
    expect(reservation).toMatchObject({ ready: true, required: 3, remaining: 2 });
    expect(await budget.take('market-search')).toMatchObject({ allowed: true, remaining: 1, reserved: false });
    expect(await budget.take('transfer-refresh')).toMatchObject({ allowed: true, remaining: 0, reserved: false });
    expect(await budget.take('list')).toMatchObject({ allowed: false, remaining: 0 });

    expect(await reservation.take('buy')).toMatchObject({ allowed: true, remaining: 0, reserved: true });
    expect(await reservation.release()).toMatchObject({ used: 3, remaining: 2 });
    expect(budget.inspect()).toMatchObject({
      used: 3,
      remaining: 2,
      byAction: { 'market-search': 1, 'transfer-refresh': 1, buy: 1 },
    });
    expect(await reservation.take('purchase-refresh')).toMatchObject({ allowed: false, reserved: false });
  });

  it('caps scoped callers at their reservation even when general capacity remains', async () => {
    const budget = createTradeRequestBudget({
      storage: memoryStorage(),
      now: () => 1000,
      limit: 5,
      windowMs: 5000,
      createReservationId: () => 'reservation-b',
    });
    const reservation = await budget.reserve(1);
    expect(await reservation.take('list')).toMatchObject({ allowed: true, reserved: true });
    expect(await reservation.take('transfer-refresh')).toMatchObject({ allowed: false, remaining: 4, reserved: false });
    expect(await budget.take('transfer-refresh')).toMatchObject({ allowed: true, remaining: 3, reserved: false });
  });

  it('expires abandoned reservations and reports when a full run reserve becomes available', async () => {
    let time = 1000;
    let reservationId = 0;
    const budget = createTradeRequestBudget({
      storage: memoryStorage(),
      now: () => time,
      limit: 15,
      windowMs: 5000,
      createReservationId: () => `reservation-${reservationId += 1}`,
    });
    const abandoned = await budget.reserve(4);
    expect(inspectTradeRequestCapacity(budget.inspect())).toEqual({
      ready: false,
      required: 12,
      remaining: 11,
      retryAt: 6000,
      reason: 'trade-request-budget-insufficient',
    });
    expect(await budget.reserve(12)).toMatchObject({ ready: false, remaining: 11, retryAt: 6000 });

    time = 6001;
    expect(budget.inspect()).toMatchObject({ used: 0, remaining: 15, runCapacity: { ready: true, retryAt: null } });
    expect(await abandoned.take('buy')).toMatchObject({ allowed: false, reserved: false });
    const recovered = await budget.reserve(12);
    expect(recovered).toMatchObject({ ready: true, required: 12, remaining: 3 });
  });
});
