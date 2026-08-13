import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createBulkRelistPreview } from '../../src/trade/bulk-relist-preview.js';

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

describe('Trade bulk relist Preview', () => {
  it('refreshes Transfer and creates a short-lived internal approval for all Unsold items', async () => {
    const adapter = createFakeTradeAdapter({ items: [unsold(1), unsold(2)] });
    const preview = createBulkRelistPreview({
      getTradeAdapter: () => adapter,
      now: () => 1000,
      createToken: () => 'secret-token',
    });
    await expect(preview.preview()).resolves.toMatchObject({
      ready: true,
      snapshot: { unsoldCount: 2, items: [{ item: { id: 1 } }, { item: { id: 2 } }] },
      confirmation: { token: 'secret-token', action: 'bulk-relist', createdAt: 1000, itemCount: 2 },
    });
    expect(adapter.calls.map((call) => call.method)).toEqual([
      'inspectCapabilities', 'refreshTransferItems', 'inspectBulkRelistSnapshot',
    ]);
    expect(adapter.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);
  });

  it('treats Transfer Available Items as an empty Re-list All scope', async () => {
    const adapter = createFakeTradeAdapter({ items: [available(1)] });
    const result = await createBulkRelistPreview({
      getTradeAdapter: () => adapter,
      now: () => 1000,
      createToken: () => 'empty-token',
    }).preview();

    expect(result).toMatchObject({
      ready: true,
      snapshot: { total: 1, unsoldCount: 0, byState: { inactive: 1 }, items: [] },
      confirmation: { itemCount: 0 },
    });
    expect(adapter.calls.some((call) => call.method === 'relistExpiredAuctions')).toBe(false);
  });

  it('blocks when the aggregate capability or bounded snapshot is unavailable', async () => {
    const unsupported = createFakeTradeAdapter({
      methods: { relistExpiredAuctions: false },
      items: [unsold(1)],
    });
    const first = await createBulkRelistPreview({ getTradeAdapter: () => unsupported }).preview();
    expect(first).toMatchObject({ ready: false, confirmation: null });
    expect(first.blockers).toContainEqual({ reason: 'bulk-relist-capability-unavailable' });

    const base = createFakeTradeAdapter({ items: [unsold(1)] });
    const adapter = {
      ...base,
      inspectBulkRelistSnapshot: vi.fn(() => ({
        status: 'loaded', unsoldCount: 101, truncated: true, items: [unsold(1)],
      })),
    };
    const second = await createBulkRelistPreview({ getTradeAdapter: () => adapter }).preview();
    expect(second.blockers).toContainEqual({ reason: 'bulk-relist-snapshot-truncated' });
  });
});
