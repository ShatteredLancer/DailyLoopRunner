import { describe, expect, it } from 'vitest';
import { createTradeCircuitBreaker } from '../../src/trade/circuit-breaker.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
  };
}

describe('Trade circuit breaker', () => {
  it('persists a sanitized EA 427 event and requires a manual reset', () => {
    const storage = memoryStorage();
    const breaker = createTradeCircuitBreaker({ storage, key: 'trade-circuit', now: () => 1000 });
    breaker.recordFailure({ status: 427, token: 'secret' }, {
      action: 'list',
      endpoint: '/auctionhouse',
      jobId: 'job-1',
      runId: 'run-1',
      response: { status: 427, success: false, privatePayload: 'secret' },
      capabilities: {
        runtimeReady: true,
        canTrade: true,
        tradeAccess: { available: true, allowed: true, level: 2 },
        transferCapacity: { used: 11, max: 100, free: 89 },
        coins: 123456,
      },
    });

    const reloaded = createTradeCircuitBreaker({ storage, key: 'trade-circuit', now: () => 999999 });
    expect(reloaded.availability()).toMatchObject({
      allowed: false,
      state: { state: 'open', reason: 'auction-operation-blocked', persistent: true },
      record: {
        recentEvents: [{
          action: 'list', endpoint: '/auctionhouse', jobId: 'job-1', runId: 'run-1',
          classification: { kind: 'auction-operation-blocked', code: 427 },
          response: { success: false, status: 427, code: null },
          capabilities: { runtimeReady: true, canTrade: true },
        }],
      },
    });
    expect(JSON.stringify(reloaded.snapshot())).not.toContain('secret');
    expect(reloaded.reset('manual-user-reset').circuit.state).toBe('closed');
    expect(reloaded.availability().allowed).toBe(true);
  });
});
