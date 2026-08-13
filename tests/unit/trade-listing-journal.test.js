import { describe, expect, it } from 'vitest';
import { createTradeListingJournal } from '../../src/trade/listing-journal.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

describe('Trade Listing persistent journal', () => {
  it('persists two prepared items and per-item mutation phases without private payloads', () => {
    const storage = memoryStorage();
    const journal = createTradeListingJournal({ storage, key: 'listing-journal', now: () => 1000 });
    journal.begin({ runId: 'listing-run', jobId: 'listing-job', source: 'club', requested: 2 });
    journal.checkpoint('listing-run', {
      phase: 'prepare-finished',
      items: [1, 2].map((id) => ({
        item: { id, definitionId: 100 + id, pile: 'club', token: 'secret' },
        startPrice: 650,
        buyNow: 700,
        durationSeconds: 3600,
      })),
      response: { success: true, raw: 'secret' },
    });
    journal.checkpoint('listing-run', {
      phase: 'listing-request-started',
      itemIndex: 1,
      item: { id: 1, definitionId: 101, pile: 'club' },
      listing: { startPrice: 650, buyNow: 700, durationSeconds: 3600 },
      status: 'mutation-pending',
      mutationBoundaryCrossed: true,
    });
    journal.checkpoint('listing-run', {
      phase: 'listing-request-permit-waiting', chunkIndex: 2, offset: 2, quantity: 2, retryAt: 6000,
    });
    journal.checkpoint('listing-run', {
      phase: 'item-finished',
      itemIndex: 1,
      status: 'listed',
      mutationBoundaryCrossed: true,
    });

    const reloaded = createTradeListingJournal({ storage, key: 'listing-journal', now: () => 2000 });
    expect(reloaded.snapshot()).toMatchObject({
      runId: 'listing-run',
      requested: 2,
      items: [
        { index: 1, status: 'listed', mutationBoundaryCrossed: true, item: { id: 1, definitionId: 101, pile: 'club' } },
        { index: 2, status: 'pending', mutationBoundaryCrossed: false, item: { id: 2, definitionId: 102, pile: 'club' } },
      ],
      events: expect.arrayContaining([
        expect.objectContaining({
          phase: 'listing-request-permit-waiting', chunkIndex: 2, offset: 2, quantity: 2, retryAt: 6000,
        }),
      ]),
    });
    expect(reloaded.inspectRecovery()).toMatchObject({
      active: true, mutationBoundaryCrossed: true, canSupersede: false,
    });
    expect(JSON.stringify(reloaded.snapshot())).not.toContain('secret');
  });

  it('allows an interrupted Prepare to be superseded but not a crossed mutation boundary', () => {
    const journal = createTradeListingJournal({ storage: memoryStorage(), now: () => 1000 });
    journal.begin({ runId: 'prepare-only', jobId: 'listing-job', source: 'transfer', requested: 2 });
    expect(journal.inspectRecovery()).toMatchObject({ active: true, canSupersede: true, mutationBoundaryCrossed: false });
    journal.checkpoint('prepare-only', {
      phase: 'listing-request-started', itemIndex: 1, mutationBoundaryCrossed: true,
    });
    expect(journal.inspectRecovery()).toMatchObject({ active: true, canSupersede: false, mutationBoundaryCrossed: true });
  });

  it('blocks a terminal uncertain second item but supersedes a terminal two-item success', () => {
    const journal = createTradeListingJournal({ storage: memoryStorage(), now: () => 1000 });
    journal.begin({ runId: 'listing-two', jobId: 'listing-job', source: 'club', requested: 2 });
    journal.checkpoint('listing-two', {
      phase: 'item-finished', itemIndex: 1, status: 'listed', mutationBoundaryCrossed: true,
    });
    journal.checkpoint('listing-two', {
      phase: 'listing-request-started', itemIndex: 2, status: 'mutation-pending', mutationBoundaryCrossed: true,
    });
    journal.finish('listing-two', { phase: 'receipt-recorded', status: 'ambiguous' });
    expect(journal.inspectRecovery()).toMatchObject({
      active: false, uncertainMutation: true, canSupersede: false,
      reason: 'listing-journal-mutation-review-required',
    });
    expect(() => journal.begin({
      runId: 'must-not-overwrite', jobId: 'listing-job', source: 'club', requested: 2,
    })).toThrow('listing-journal-mutation-review-required');

    const completed = createTradeListingJournal({ storage: memoryStorage(), now: () => 1000 });
    completed.begin({ runId: 'listing-success', jobId: 'listing-job', source: 'club', requested: 2 });
    for (const itemIndex of [1, 2]) {
      completed.checkpoint('listing-success', {
        phase: 'item-finished', itemIndex, status: 'listed', mutationBoundaryCrossed: true,
      });
    }
    completed.finish('listing-success', { phase: 'receipt-recorded', status: 'completed' });
    expect(completed.inspectRecovery()).toMatchObject({
      active: false, uncertainMutation: false, canSupersede: true,
    });
    expect(() => completed.begin({
      runId: 'listing-next', jobId: 'listing-job', source: 'club', requested: 2,
    })).not.toThrow();
  });

  it('reserves a deferred Journal for only its persisted continuation Run', () => {
    let continuationRunId = 'listing-sliced';
    const journal = createTradeListingJournal({
      storage: memoryStorage(),
      key: 'listing-deferred',
      now: () => 1000,
      isContinuationActive: (runId) => runId === continuationRunId,
    });
    journal.begin({ runId: 'listing-sliced', jobId: 'listing-job', source: 'club', requested: 2 });
    journal.checkpoint('listing-sliced', {
      phase: 'item-finished', itemIndex: 1, status: 'listed', mutationBoundaryCrossed: true,
    });
    journal.finish('listing-sliced', { phase: 'slice-deferred', status: 'deferred' });

    expect(journal.inspectRecovery()).toMatchObject({
      active: false, deferred: true, reserved: true, canResume: false,
      canSupersede: false, reason: 'listing-journal-continuation-reserved', uncertainMutation: false,
    });
    expect(journal.inspectRecovery({ runId: 'listing-sliced' })).toMatchObject({
      canResume: true, canSupersede: true,
    });
    expect(() => journal.begin({ runId: 'different-run', jobId: 'listing-job' }))
      .toThrow('listing-journal-continuation-reserved');
    expect(() => journal.begin({ runId: 'listing-sliced', jobId: 'listing-job' })).not.toThrow();

    continuationRunId = null;
    expect(journal.inspectRecovery()).toMatchObject({ reserved: false, canSupersede: true });
  });

  it('does not let a persisted continuation hide an uncertain active mutation', () => {
    const journal = createTradeListingJournal({
      storage: memoryStorage(),
      key: 'listing-active-uncertain',
      now: () => 1000,
      isContinuationActive: (runId) => runId === 'listing-active-sliced',
    });
    journal.begin({ runId: 'listing-active-sliced', jobId: 'listing-job', source: 'club', requested: 2 });
    journal.checkpoint('listing-active-sliced', {
      phase: 'listing-request-started', itemIndex: 2, status: 'mutation-pending', mutationBoundaryCrossed: true,
    });
    expect(journal.inspectRecovery({ runId: 'listing-active-sliced' })).toMatchObject({
      active: true, reserved: false, canResume: false, uncertainMutation: true,
      canSupersede: false, reason: 'listing-journal-mutation-review-required',
    });
  });
});
