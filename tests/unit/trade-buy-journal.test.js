import { describe, expect, it } from 'vitest';
import { createTradeBuyJournal } from '../../src/trade/buy-journal.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

describe('Trade Buy persistent journal', () => {
  it('retains the last safe phase across reloads and removes private fields', () => {
    const storage = memoryStorage();
    const first = createTradeBuyJournal({ storage, key: 'journal', now: () => 1000 });
    first.begin({ runId: 'buy-run-1', jobId: 'buy-job-1', expectedDestination: 'transfer' });
    first.checkpoint('buy-run-1', {
      phase: 'buy-request-started',
      item: { id: 70, definitionId: 8401, pile: 'market', accessToken: 'secret' },
      tradeId: 700,
      price: 900,
      response: { success: true, status: 200, privatePayload: 'secret' },
      privateContext: 'secret',
    });

    const reloaded = createTradeBuyJournal({ storage, key: 'journal', now: () => 2000 });
    expect(reloaded.snapshot()).toMatchObject({
      runId: 'buy-run-1',
      jobId: 'buy-job-1',
      expectedDestination: 'transfer',
      status: 'active',
      phase: 'buy-request-started',
      events: [
        { phase: 'started' },
        { phase: 'buy-request-started', item: { id: 70, definitionId: 8401, pile: 'market' }, tradeId: 700, price: 900 },
      ],
    });
    expect(JSON.stringify(reloaded.snapshot())).not.toContain('secret');

    reloaded.finish('buy-run-1', { phase: 'receipt-recorded', status: 'completed' });
    expect(first.snapshot()).toMatchObject({ status: 'completed', phase: 'receipt-recorded' });
  });

  it('does not coerce absent optional numeric fields to zero', () => {
    const journal = createTradeBuyJournal({ storage: memoryStorage(), key: 'journal-null', now: () => 1000 });
    journal.begin({ runId: 'buy-run-null', jobId: 'buy-job-null' });
    journal.checkpoint('buy-run-null', {
      phase: 'preview-complete',
      tradeId: null,
      price: '',
      search: { rating: 84, definitionId: undefined, maxBuyNow: 1000, page: null },
      response: { success: false, status: null, code: '' },
    });

    expect(journal.snapshot().events[1]).toMatchObject({
      tradeId: null,
      price: null,
      search: { rating: 84, definitionId: null, maxBuyNow: 1000, page: null },
      response: { success: false, status: null, code: null },
    });
  });
});
