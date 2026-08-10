import { describe, expect, it } from 'vitest';
import { createTradeBuyDiagnostics, sanitizeTradeBuyReceipt } from '../../src/trade/buy-diagnostics.js';

describe('Trade Buy diagnostics', () => {
  it('allowlists Buy receipts and excludes raw EA response fields', () => {
    const diagnostics = createTradeBuyDiagnostics({
      capturedAt: 123,
      runnerVersion: '0.7.33',
      operation: { running: true, tradeBuyRunning: true },
      expectedDestination: 'transfer',
      journal: {
        schemaVersion: 1,
        runId: 'journal-run',
        jobId: 'buy-1',
        expectedDestination: 'transfer',
        status: 'active',
        phase: 'buy-request-started',
        startedAt: 100,
        updatedAt: 110,
        privateValue: 'must-not-leak',
        events: [{
          at: 110,
          phase: 'buy-request-started',
          item: { id: 70, definitionId: 8401, pile: 'market', token: 'must-not-leak' },
          tradeId: 700,
          price: 900,
          response: { success: true, status: 200, privatePayload: 'must-not-leak' },
        }],
      },
      receipt: {
        runId: 'run-1',
        jobId: 'buy-1',
        jobType: 'buy',
        status: 'blocked',
        reason: 'trade-auction-operation-blocked',
        receipts: [{
          status: 'run-summary', searches: 1, buyAttempts: 1, spent: 900, expectedDestination: 'transfer',
        }, {
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
      validation: { expectedDestination: 'transfer' },
      journal: {
        runId: 'journal-run', phase: 'buy-request-started',
        events: [{ phase: 'buy-request-started', item: { id: 70, definitionId: 8401, pile: 'market' }, tradeId: 700, price: 900 }],
      },
      receipt: {
        runId: 'run-1',
        status: 'blocked',
        receipts: [{
          status: 'run-summary', searches: 1, buyAttempts: 1, spent: 900, expectedDestination: 'transfer',
        }, {
          item: { id: 70, definitionId: 8401, pile: 'market' }, tradeId: 700,
          price: 900, priceLimit: 1000, coinsBefore: 5000, coinsAfter: 4100,
        }],
      },
      error: { name: 'Error', message: 'Buy stopped', code: '427' },
    });
    expect(JSON.stringify(diagnostics)).not.toContain('must-not-leak');
    expect(JSON.stringify(diagnostics)).not.toContain('private response');
    expect(sanitizeTradeBuyReceipt({
      runId: 'history-run',
      receipts: [{ status: 'failed', response: { token: 'history-secret' }, error: { message: 'raw' } }],
    })).toEqual(expect.objectContaining({
      runId: 'history-run',
      receipts: [expect.objectContaining({ status: 'failed' })],
    }));
    expect(JSON.stringify(sanitizeTradeBuyReceipt({
      receipts: [{ response: { token: 'history-secret' } }],
    }))).not.toContain('history-secret');
  });

  it('preserves absent optional numeric fields as null', () => {
    const diagnostics = createTradeBuyDiagnostics({
      journal: {
        runId: 'journal-null-numbers',
        events: [{
          phase: 'preview-complete',
          tradeId: null,
          price: undefined,
          search: { rating: 84, definitionId: '', maxBuyNow: 1000, page: null },
          response: { success: false, status: null, code: '' },
        }],
      },
      receipt: {
        runId: 'receipt-null-numbers',
        receipts: [{ status: 'blocked', tradeId: null, price: '', coinsAfter: undefined }],
      },
    });

    expect(diagnostics.journal.events[0]).toMatchObject({
      tradeId: null,
      price: null,
      search: { rating: 84, definitionId: null, maxBuyNow: 1000, page: null },
      response: { success: false, status: null, code: null },
    });
    expect(diagnostics.receipt.receipts[0]).toMatchObject({
      tradeId: null,
      price: null,
      coinsAfter: null,
    });
  });
});
