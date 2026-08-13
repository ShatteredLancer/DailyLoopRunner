import { describe, expect, it } from 'vitest';
import { createTradeBulkRelistJournal } from '../../src/trade/bulk-relist-journal.js';

function storage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function snapshot() {
  return {
    unsoldCount: 2,
    items: [1, 2].map((id) => ({
      item: { id, definitionId: 100 + id, pile: 'transfer' },
      auction: { state: 'inactive', tradeId: 1000 + id, startingBid: 650, buyNowPrice: 700 },
    })),
  };
}

describe('Trade bulk relist Journal', () => {
  it('keeps a legacy ambiguous Available Item mutation review after eligibility rules change', () => {
    const store = storage();
    store.set('journal', {
      schemaVersion: 1,
      runId: 'legacy-available',
      jobId: 'bulk-job',
      status: 'ambiguous',
      phase: 'receipt-recorded',
      startedAt: 900,
      updatedAt: 1000,
      requested: 1,
      mutationBoundaryCrossed: true,
      before: {
        total: 1,
        unsoldCount: 1,
        items: [{
          item: { id: 9, definitionId: 109, pile: 'transfer' },
          auction: { state: 'inactive', tradeId: null, startingBid: null, buyNowPrice: null },
        }],
      },
      items: [{
        status: 'unknown',
        mutationBoundaryCrossed: true,
        item: { id: 9, definitionId: 109, pile: 'transfer' },
      }],
    });

    const journal = createTradeBulkRelistJournal({ storage: store, key: 'journal', now: () => 1000 });
    expect(journal.snapshot()).toMatchObject({
      runId: 'legacy-available',
      requested: 1,
      before: { unsoldCount: 0, items: [] },
      items: [{ item: { id: 9 }, status: 'unknown', mutationBoundaryCrossed: true }],
    });
    expect(journal.inspectRecovery()).toMatchObject({
      canSupersede: false,
      uncertainMutation: true,
      reason: 'bulk-relist-journal-mutation-review-required',
    });
  });

  it('keeps one aggregate mutation boundary and requires Recovery only for unknown items', () => {
    const journal = createTradeBulkRelistJournal({ storage: storage(), key: 'journal', now: () => 1000 });
    journal.begin({ runId: 'bulk-1', before: snapshot() });
    expect(journal.inspectRecovery()).toMatchObject({ canSupersede: true, mutationBoundaryCrossed: false });
    journal.checkpoint('bulk-1', { phase: 'bulk-relist-request-started', mutationBoundaryCrossed: true });
    expect(journal.inspectRecovery()).toMatchObject({
      canSupersede: false, uncertainMutation: true, reason: 'bulk-relist-journal-mutation-review-required',
    });
    journal.checkpoint('bulk-1', {
      phase: 'bulk-relist-reconciliation-finished', mutationBoundaryCrossed: true,
      items: snapshot().items.map((entry) => ({ ...entry, status: 'relisted' })),
    });
    journal.finish('bulk-1', { status: 'completed', phase: 'receipt-recorded' });
    expect(journal.inspectRecovery()).toMatchObject({ canSupersede: true, uncertainMutation: false });
  });

  it('keeps persisted snapshots bounded and strips raw response data', () => {
    const journal = createTradeBulkRelistJournal({ storage: storage(), key: 'journal', now: () => 1000 });
    journal.begin({ runId: 'bulk-2', before: snapshot() });
    journal.checkpoint('bulk-2', {
      phase: 'bulk-relist-response-received', mutationBoundaryCrossed: true,
      response: { success: false, status: 427, body: { token: 'secret' } },
    });
    const serialized = JSON.stringify(journal.snapshot());
    expect(serialized).toContain('427');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('body');
  });
});
