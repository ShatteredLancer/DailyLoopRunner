import { describe, expect, it } from 'vitest';
import { createTradeBuyDiagnostics } from '../../src/trade/buy-diagnostics.js';

describe('Trade Buy diagnostics', () => {
  it('allowlists Buy receipts and excludes raw EA response fields', () => {
    const diagnostics = createTradeBuyDiagnostics({
      capturedAt: 123,
      runnerVersion: '0.7.33',
      operation: { running: true, tradeBuyRunning: true },
      receipt: {
        runId: 'run-1',
        jobId: 'buy-1',
        jobType: 'buy',
        status: 'blocked',
        reason: 'trade-auction-operation-blocked',
        receipts: [{
          index: 1,
          status: 'blocked',
          item: { id: 70, definitionId: 8401, pile: 'market', privateItem: 'must-not-leak' },
          tradeId: 700,
          rating: 84,
          price: 900,
          priceLimit: 1000,
          coinsBefore: 5000,
          coinsAfter: 4100,
          destination: 'club',
          response: { status: 427, token: 'must-not-leak' },
          error: { message: 'private response', accessToken: 'must-not-leak' },
        }],
      },
      error: Object.assign(new Error('Buy stopped'), { code: 427, response: { token: 'must-not-leak' } }),
    });
    expect(diagnostics).toMatchObject({
      operation: { running: true, tradeBuyRunning: true },
      receipt: {
        runId: 'run-1',
        status: 'blocked',
        receipts: [{
          item: { id: 70, definitionId: 8401, pile: 'market' }, tradeId: 700,
          price: 900, priceLimit: 1000, coinsBefore: 5000, coinsAfter: 4100,
        }],
      },
      error: { name: 'Error', message: 'Buy stopped', code: '427' },
    });
    expect(JSON.stringify(diagnostics)).not.toContain('must-not-leak');
    expect(JSON.stringify(diagnostics)).not.toContain('private response');
  });
});
