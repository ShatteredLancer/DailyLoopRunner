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

  it('retains bounded phases for two mutation attempts and blocks superseding an uncertain Run', () => {
    const journal = createTradeBuyJournal({ storage: memoryStorage(), key: 'journal-two', now: () => 1000 });
    journal.begin({ runId: 'buy-two', jobId: 'buy-job', expectedDestination: 'auto', requested: 2 });
    journal.checkpoint('buy-two', {
      phase: 'buy-request-started', itemIndex: 1, item: { id: 70, definitionId: 8401, pile: 'market' },
      tradeId: 1070, price: 900, destination: 'club', mutationBoundaryCrossed: true,
    });
    journal.checkpoint('buy-two', {
      phase: 'item-finished', itemIndex: 1, status: 'purchased', mutationBoundaryCrossed: true,
    });
    journal.checkpoint('buy-two', {
      phase: 'buy-request-started', itemIndex: 2, item: { id: 71, definitionId: 8501, pile: 'market' },
      tradeId: 1071, price: 1000, destination: 'transfer', mutationBoundaryCrossed: true,
    });

    expect(journal.snapshot()).toMatchObject({
      requested: 2,
      items: [
        { index: 1, status: 'purchased', mutationBoundaryCrossed: true, price: 900 },
        { index: 2, status: 'pending', mutationBoundaryCrossed: true, price: 1000 },
      ],
    });
    expect(journal.inspectRecovery()).toMatchObject({ active: true, canSupersede: false, mutationBoundaryCrossed: true });
  });

  it('blocks a terminal uncertain second purchase but supersedes a terminal two-item success', () => {
    const journal = createTradeBuyJournal({ storage: memoryStorage(), key: 'journal-terminal', now: () => 1000 });
    journal.begin({ runId: 'buy-two', jobId: 'buy-job', expectedDestination: 'auto', requested: 2 });
    journal.checkpoint('buy-two', {
      phase: 'item-finished', itemIndex: 1, status: 'purchased', mutationBoundaryCrossed: true,
    });
    journal.checkpoint('buy-two', {
      phase: 'buy-request-started', itemIndex: 2, status: 'mutation-pending', mutationBoundaryCrossed: true,
    });
    journal.finish('buy-two', { phase: 'receipt-recorded', status: 'ambiguous' });
    expect(journal.inspectRecovery()).toMatchObject({
      active: false, uncertainMutation: true, canSupersede: false,
      reason: 'buy-journal-mutation-review-required',
    });
    expect(() => journal.begin({
      runId: 'must-not-overwrite', jobId: 'buy-job', expectedDestination: 'auto', requested: 2,
    })).toThrow('buy-journal-mutation-review-required');

    const completed = createTradeBuyJournal({ storage: memoryStorage(), key: 'journal-success', now: () => 1000 });
    completed.begin({ runId: 'buy-success', jobId: 'buy-job', expectedDestination: 'auto', requested: 2 });
    for (const itemIndex of [1, 2]) {
      completed.checkpoint('buy-success', {
        phase: 'item-finished', itemIndex, status: 'purchased', mutationBoundaryCrossed: true,
      });
    }
    completed.finish('buy-success', { phase: 'receipt-recorded', status: 'completed' });
    expect(completed.inspectRecovery()).toMatchObject({
      active: false, uncertainMutation: false, canSupersede: true,
    });
    expect(() => completed.begin({
      runId: 'buy-next', jobId: 'buy-job', expectedDestination: 'auto', requested: 2,
    })).not.toThrow();
  });
});
