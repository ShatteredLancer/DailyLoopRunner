import { describe, expect, it } from 'vitest';
import { createBulkRelistDiagnostics } from '../../src/trade/bulk-relist-diagnostics.js';

describe('Trade bulk relist diagnostics', () => {
  it('removes confirmation token and raw error response while retaining aggregate evidence', () => {
    const diagnostics = createBulkRelistDiagnostics({
      capturedAt: 1000,
      runnerVersion: '0.7.91',
      preview: {
        ready: true,
        snapshot: { unsoldCount: 2 },
        confirmation: {
          token: 'secret-token', action: 'bulk-relist', createdAt: 1000, expiresAt: 2000,
          itemCount: 2, fingerprint: 'secret-fingerprint',
        },
      },
      journal: { runId: 'bulk-1', status: 'active', mutationBoundaryCrossed: true },
      error: Object.assign(new Error('EA refresh failed'), { response: { authorization: 'private' } }),
    });
    expect(diagnostics.eligibilityContract).toBe('expired-auction-v2');
    expect(diagnostics.preview.confirmation).toEqual({
      action: 'bulk-relist', createdAt: 1000, expiresAt: 2000, itemCount: 2,
    });
    expect(diagnostics.journal).toMatchObject({ runId: 'bulk-1', mutationBoundaryCrossed: true });
    expect(diagnostics.error).toMatchObject({ name: 'Error', message: 'EA refresh failed' });
    expect(JSON.stringify(diagnostics)).not.toContain('secret-token');
    expect(JSON.stringify(diagnostics)).not.toContain('secret-fingerprint');
    expect(JSON.stringify(diagnostics)).not.toContain('private');
  });
});
