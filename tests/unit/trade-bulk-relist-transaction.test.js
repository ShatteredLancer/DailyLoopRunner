import { describe, expect, it } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createBulkRelistPreview } from '../../src/trade/bulk-relist-preview.js';
import { createBulkRelistTransaction } from '../../src/trade/bulk-relist-transaction.js';

function unsold(id) {
  return {
    id, definitionId: 100 + id, pile: 'transfer', name: `Player ${id}`, rating: 84,
    auction: { present: true, state: 'inactive', tradeId: 1000 + id, startingBid: 650, buyNowPrice: 700 },
  };
}

function available(id) {
  return {
    id, definitionId: 100 + id, pile: 'transfer', name: `Available ${id}`, rating: 84,
    auction: { present: true, state: 'inactive', tradeId: null, startingBid: null, buyNowPrice: null, expires: null },
  };
}

async function prepared(adapter, now = () => 1000) {
  return createBulkRelistPreview({
    getTradeAdapter: () => adapter,
    now,
    createToken: () => 'approval-token',
  }).preview();
}

function transaction(adapter, checkpoints = []) {
  return createBulkRelistTransaction({
    getTradeAdapter: () => adapter,
    now: () => 1000,
    onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
  });
}

describe('Trade bulk relist transaction', () => {
  it('completes as skipped-empty without a permit or mutation when only Available Items are present', async () => {
    const adapter = createFakeTradeAdapter({ items: [available(9)] });
    const preview = await createBulkRelistPreview({
      getTradeAdapter: () => adapter,
      now: () => 1000,
      createToken: () => 'available-token',
    }).preview();
    const transaction = createBulkRelistTransaction({ getTradeAdapter: () => adapter, now: () => 1001 });

    await expect(transaction.run({
      runId: 'bulk-available', jobId: 'manual-bulk-relist', preview,
      confirmation: preview.confirmation, confirmationToken: preview.confirmation.token,
    })).resolves.toMatchObject({
      status: 'completed', reason: 'skipped-empty', requested: 0, succeeded: 0, failed: 0,
    });
    expect(adapter.calls.some((call) => ['acquireRequestPermit', 'relistExpiredAuctions'].includes(call.method))).toBe(false);
  });

  it('completes an empty Preview without acquiring a permit or sending a mutation', async () => {
    const adapter = createFakeTradeAdapter();
    const preview = await prepared(adapter);
    const receipt = await transaction(adapter).run({
      runId: 'bulk-empty', jobId: 'manual-bulk-relist', preview,
      confirmation: preview.confirmation, confirmationToken: 'approval-token',
    });
    expect(receipt).toMatchObject({ status: 'completed', reason: 'skipped-empty', requested: 0, succeeded: 0 });
    expect(adapter.calls.some((call) => ['acquireRequestPermit', 'relistExpiredAuctions'].includes(call.method))).toBe(false);
  });

  it('sends exactly one aggregate mutation and reconciles every exact item Active', async () => {
    const adapter = createFakeTradeAdapter({ items: [unsold(1), unsold(2)] });
    const preview = await prepared(adapter);
    const checkpoints = [];
    const receipt = await transaction(adapter, checkpoints).run({
      runId: 'bulk-success', jobId: 'manual-bulk-relist', preview,
      confirmation: preview.confirmation, confirmationToken: 'approval-token', beforeMutation: () => true,
    });
    expect(receipt).toMatchObject({ status: 'completed', requested: 2, succeeded: 2, failed: 0 });
    expect(adapter.calls.filter((call) => call.method === 'relistExpiredAuctions')).toHaveLength(1);
    expect(adapter.calls.filter((call) => call.method === 'acquireRequestPermit')).toEqual([
      expect.objectContaining({ action: 'bulk-relist' }),
    ]);
    expect(checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'bulk-relist-request-started', mutationBoundaryCrossed: true }),
      expect.objectContaining({ phase: 'bulk-relist-reconciliation-finished', status: 'completed' }),
    ]));
  });

  it('fails before mutation when the approval or exact Unsold snapshot changed', async () => {
    const adapter = createFakeTradeAdapter({ items: [unsold(1)] });
    const preview = await prepared(adapter);
    await expect(transaction(adapter).run({
      runId: 'bad-token', jobId: 'manual-bulk-relist', preview,
      confirmation: preview.confirmation, confirmationToken: 'wrong',
    })).resolves.toMatchObject({ status: 'blocked', reason: 'bulk-relist-approval-mismatch' });
    const listPermit = await adapter.acquireRequestPermit('list');
    await adapter.listItem(
      { id: 1, definitionId: 101, pile: 'transfer' },
      { startPrice: 700, buyNow: 750, durationSeconds: 3600 },
      { requestPermit: listPermit.permit },
    );
    await expect(transaction(adapter).run({
      runId: 'changed', jobId: 'manual-bulk-relist', preview,
      confirmation: preview.confirmation, confirmationToken: 'approval-token',
    })).resolves.toMatchObject({ status: 'blocked', reason: 'bulk-relist-snapshot-changed' });
    expect(adapter.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);
  });

  it('returns ambiguous aggregate evidence when only part of the accepted mutation reconciles', async () => {
    const adapter = createFakeTradeAdapter({
      items: [unsold(1), unsold(2)],
      bulkRelistResult: { status: 'accepted', itemIds: [1] },
    });
    const preview = await prepared(adapter);
    const checkpoints = [];
    const receipt = await transaction(adapter, checkpoints).run({
      runId: 'bulk-partial', jobId: 'manual-bulk-relist', preview,
      confirmation: preview.confirmation, confirmationToken: 'approval-token', beforeMutation: () => true,
    });
    expect(receipt).toMatchObject({ status: 'ambiguous', reason: 'bulk-relist-partial', requested: 2, succeeded: 1, failed: 1 });
    expect(checkpoints.at(-1).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: expect.objectContaining({ id: 1 }), status: 'relisted' }),
      expect.objectContaining({ item: expect.objectContaining({ id: 2 }), status: 'unknown' }),
    ]));
  });

  it('keeps every aggregate item unknown when EA accepted the mutation but Transfer refresh failed', async () => {
    const adapter = createFakeTradeAdapter({
      items: [unsold(1), unsold(2)],
      refreshTransferResults: [
        { status: 'completed', response: { success: true }, error: null },
        { status: 'completed', response: { success: true }, error: null },
        { status: 'rejected', response: { success: false, status: 512 }, error: { kind: 'transient-service', code: 512 } },
      ],
    });
    const preview = await prepared(adapter);
    const checkpoints = [];
    const receipt = await transaction(adapter, checkpoints).run({
      runId: 'bulk-refresh-failed', jobId: 'manual-bulk-relist', preview,
      confirmation: preview.confirmation, confirmationToken: 'approval-token', beforeMutation: () => true,
    });
    expect(receipt).toMatchObject({
      status: 'ambiguous', reason: 'bulk-relist-accepted-refresh-failed',
      requested: 2, succeeded: 0, failed: 2,
    });
    expect(receipt.receipts).toEqual([
      expect.objectContaining({ status: 'unknown', item: expect.objectContaining({ id: 1 }) }),
      expect.objectContaining({ status: 'unknown', item: expect.objectContaining({ id: 2 }) }),
    ]);
    expect(checkpoints.at(-1)).toMatchObject({
      phase: 'bulk-relist-reconciliation-finished',
      status: 'ambiguous',
      reason: 'bulk-relist-accepted-refresh-failed',
    });
  });

  it('defers a pre-mutation 429 cooldown but never retries a 429 returned by the mutation', async () => {
    const base = createFakeTradeAdapter({ items: [unsold(1)] });
    const preview = await prepared(base);
    const cooldownAdapter = {
      ...base,
      acquireRequestPermit: async () => ({
        status: 'blocked', permit: null,
        error: { kind: 'rate-limit', code: 429, action: 'stop-and-cooldown', retryAt: 5000 },
      }),
    };
    await expect(transaction(cooldownAdapter).run({
      runId: 'bulk-cooldown', jobId: 'bulk-job', preview,
      confirmation: preview.confirmation, confirmationToken: 'approval-token', deferWhenWaiting: true,
    })).resolves.toMatchObject({
      status: 'deferred', reason: 'trade-rate-limit-cooldown', resumeAt: 5000, requested: 1,
    });
    expect(base.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);

    const rejected = createFakeTradeAdapter({
      items: [unsold(1)],
      bulkRelistResult: {
        status: 'rejected', response: { success: false, status: 429 },
        error: { kind: 'rate-limit', code: 429, action: 'stop-and-cooldown' },
      },
    });
    const rejectedPreview = await prepared(rejected);
    await expect(transaction(rejected).run({
      runId: 'bulk-mutation-429', jobId: 'bulk-job', preview: rejectedPreview,
      confirmation: rejectedPreview.confirmation, confirmationToken: 'approval-token', deferWhenWaiting: true,
    })).resolves.toMatchObject({ status: 'blocked', reason: 'trade-rate-limit', requested: 1 });
    expect(rejected.calls.filter((call) => call.method === 'relistExpiredAuctions')).toHaveLength(1);
  });
});
