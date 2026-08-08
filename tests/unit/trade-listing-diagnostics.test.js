import { describe, expect, it } from 'vitest';
import { createTradeListingDiagnostics } from '../../src/trade/listing-diagnostics.js';

describe('Trade listing diagnostics', () => {
  it('removes confirmation tokens from Preview and Prepared artifacts', () => {
    const confirmation = {
      token: 'listing-secret-token',
      createdAt: 100,
      expiresAt: 200,
      itemCount: 1,
      requiredText: 'LIST 1',
    };
    const diagnostics = createTradeListingDiagnostics({
      capturedAt: 123,
      runnerVersion: '0.7.33',
      platform: 'pc',
      userAgent: 'test-agent',
      operation: { running: true, tradeListingRunning: true },
      circuit: { circuit: { state: 'open', reason: 'auction-operation-blocked' }, token: 'not-a-token-field' },
      preview: { mode: 'prepared', confirmation },
      prepared: { mode: 'prepared', confirmation },
      error: Object.assign(new Error('EA listing failed'), { code: 'LIST_FAILED', response: { token: 'private' } }),
    });

    expect(diagnostics.preview.confirmation).toEqual({
      createdAt: 100,
      expiresAt: 200,
      itemCount: 1,
      requiredText: 'LIST 1',
    });
    expect(diagnostics.prepared.confirmation).toEqual(diagnostics.preview.confirmation);
    expect(diagnostics.error).toMatchObject({ name: 'Error', message: 'EA listing failed', code: 'LIST_FAILED' });
    expect(diagnostics.circuit).toMatchObject({ circuit: { state: 'open', reason: 'auction-operation-blocked' } });
    expect(JSON.stringify(diagnostics)).not.toContain('listing-secret-token');
    expect(JSON.stringify(diagnostics)).not.toContain('private');
  });
});
