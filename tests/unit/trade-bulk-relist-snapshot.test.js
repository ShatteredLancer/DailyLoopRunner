import { describe, expect, it } from 'vitest';
import {
  bulkRelistSnapshotFingerprint,
  normalizeBulkRelistSnapshot,
  reconcileBulkRelistSnapshots,
  sameBulkRelistSnapshot,
} from '../../src/trade/bulk-relist-snapshot.js';

function item(id, state = 'inactive') {
  return {
    item: { id, definitionId: 100 + id, pile: 'transfer' },
    name: `Player ${id}`,
    rating: 80 + id,
    auction: { state, tradeId: 1000 + id, startingBid: 650, buyNowPrice: 700 },
  };
}

describe('Trade bulk relist snapshots', () => {
  it('excludes Transfer Available Items that EA exposes as inactive without an auction identity', () => {
    const available = {
      item: { id: 9, definitionId: 109, pile: 'transfer' },
      name: 'Available Player',
      rating: 88,
      auction: {
        state: 'inactive', tradeId: null, startingBid: null, buyNowPrice: null, expires: null,
      },
    };
    expect(normalizeBulkRelistSnapshot({
      total: 2,
      unsoldCount: 2,
      items: [item(1), available],
      auctions: [item(1), available],
    })).toMatchObject({
      total: 2,
      unsoldCount: 1,
      items: [{ item: { id: 1 } }],
      auctions: [{ item: { id: 1 } }, { item: { id: 9 } }],
    });
  });

  it('fingerprints the bounded Unsold identity and exact EA prices independent of order', () => {
    const first = { unsoldCount: 2, items: [item(1), item(2)] };
    const reordered = { unsoldCount: 2, items: [item(2), item(1)] };
    const changed = { unsoldCount: 2, items: [item(1), { ...item(2), auction: { ...item(2).auction, buyNowPrice: 750 } }] };
    expect(bulkRelistSnapshotFingerprint(first)).toBe(bulkRelistSnapshotFingerprint(reordered));
    expect(sameBulkRelistSnapshot(first, reordered)).toBe(true);
    expect(sameBulkRelistSnapshot(first, changed)).toBe(false);
  });

  it('classifies aggregate reconciliation as completed, partial or unknown by exact item identity', () => {
    const before = { unsoldCount: 2, items: [item(1), item(2)] };
    expect(reconcileBulkRelistSnapshots(before, {
      auctions: [item(1, 'active'), item(2, 'active')],
    })).toMatchObject({ status: 'completed', requested: 2, relisted: 2, unknown: 0 });
    expect(reconcileBulkRelistSnapshots(before, {
      auctions: [item(1, 'active'), item(2, 'inactive')],
    })).toMatchObject({ status: 'partial', relisted: 1, unknown: 1 });
    expect(reconcileBulkRelistSnapshots(before, { auctions: [] }))
      .toMatchObject({ status: 'unknown', relisted: 0, unknown: 2 });
  });
});
