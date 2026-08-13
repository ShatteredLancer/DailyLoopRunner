import { describe, expect, it } from 'vitest';
import {
  classifyTradeError,
  createTradeCircuitState,
  reduceTradeCircuit,
  tradeCircuitAvailability,
} from '../../src/trade/error-policy.js';

describe('Trade error policy', () => {
  it('classifies hard stops, bounded failures and ambiguous transport results', () => {
    expect(classifyTradeError({ status: 427 })).toMatchObject({
      kind: 'auction-operation-blocked',
      action: 'stop-and-require-manual-reset',
      persistent: true,
      retryable: false,
    });
    expect(classifyTradeError(new Error('HTTP 429'))).toMatchObject({ kind: 'rate-limit', action: 'stop-and-cooldown', retryable: false });
    expect(classifyTradeError({ status: 401 })).toMatchObject({ kind: 'session-expired', action: 'wait-session' });
    expect(classifyTradeError(new Error('Captcha required'))).toMatchObject({ kind: 'captcha', disarm: true });
    expect(classifyTradeError({ code: 512 })).toMatchObject({ kind: 'transient-service', retryable: true });
    expect(classifyTradeError(new Error('request timed out'))).toMatchObject({ kind: 'ambiguous-transport', ambiguous: true });
    expect(classifyTradeError(new Error('Destination full'))).toMatchObject({ kind: 'destination-full', ambiguous: false });
  });

  it('keeps an EA 427 circuit open until an explicit reset', () => {
    const open = reduceTradeCircuit(createTradeCircuitState(), {
      type: 'failure',
      at: 1000,
      classification: classifyTradeError({ status: 427 }),
    }, { cooldownMs: 1 });
    expect(open).toMatchObject({
      state: 'open',
      retryAt: null,
      reason: 'auction-operation-blocked',
      persistent: true,
    });
    expect(tradeCircuitAvailability(open, 999999)).toMatchObject({ allowed: false, probe: false });
    expect(reduceTradeCircuit(open, { type: 'reset', at: 1000000 })).toEqual(createTradeCircuitState());
  });

  it('leaves 429 cooldown ownership to Request Pacing instead of opening Circuit', () => {
    const state = reduceTradeCircuit(createTradeCircuitState(), {
      type: 'failure',
      at: 1000,
      classification: classifyTradeError({ status: 429 }),
    }, { cooldownMs: 5000 });
    expect(state).toMatchObject({ state: 'closed', failureTimes: [], persistent: false, reason: null });
    expect(tradeCircuitAvailability(state, 5999)).toMatchObject({ allowed: true, probe: false });
  });

  it('opens at the rolling failure threshold and closes after a successful probe', () => {
    const config = { failureThreshold: 3, windowMs: 1000, cooldownMs: 100 };
    let state = createTradeCircuitState();
    state = reduceTradeCircuit(state, { type: 'failure', at: 100, error: { status: 512 } }, config);
    state = reduceTradeCircuit(state, { type: 'failure', at: 200, error: { status: 512 } }, config);
    expect(state.state).toBe('closed');
    state = reduceTradeCircuit(state, { type: 'failure', at: 300, error: { status: 512 } }, config);
    expect(state.state).toBe('open');
    state = reduceTradeCircuit(state, { type: 'tick', at: 400 }, config);
    expect(state.state).toBe('half-open');
    expect(reduceTradeCircuit(state, { type: 'success', at: 401 }, config)).toEqual(createTradeCircuitState());
  });
});
