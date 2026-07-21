import { describe, expect, it, vi } from 'vitest';
import { openPackTransaction } from '../../src/pack/open-transaction.js';

describe('openPackTransaction', () => {
  it('publishes normalized opened items before routing without letting observer failures block the policy', async () => {
    const calls = [];
    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 105, name: 'Pack' }),
      openTransport: async () => ({ success: true, items: [{ id: 1 }] }),
      normalizeItems: async () => ({
        items: [{ id: 1, raw: true }],
        receiptItems: [{ id: 1, normalized: true }],
      }),
      onItemsOpened: ({ openedItems }) => {
        calls.push(['opened', openedItems]);
        throw new Error('preview failed');
      },
      onItemsOpenedError: (error) => calls.push(['observer-error', error.message]),
      openedItemPolicy: async () => {
        calls.push(['policy']);
        return {};
      },
    });

    expect(receipt.status).toBe('opened');
    expect(calls).toEqual([
      ['opened', [{ id: 1, normalized: true }]],
      ['observer-error', 'preview failed'],
      ['policy'],
    ]);
  });

  it('runs pre-open, selection, transport, normalization and policy in order', async () => {
    const calls = [];
    const receipt = await openPackTransaction({
      preOpenResolver: async () => { calls.push('pre'); return { status: 'resolved' }; },
      packSelector: async () => { calls.push('select'); return { id: 105, name: 'Bronze' }; },
      openTransport: async () => { calls.push('open'); return { success: true, response: { items: [{ id: 1 }] } }; },
      normalizeItems: async (items) => { calls.push('normalize'); return items.map((item) => ({ ...item, normalized: true })); },
      openedItemPolicy: async (items) => { calls.push('policy'); return { reservedItemRefs: [{ id: items[0].id }] }; },
    });
    expect(receipt).toMatchObject({ status: 'opened', packRef: { id: 105 }, attempts: 1 });
    expect(receipt.openedItems[0]).toMatchObject({ id: 1, normalized: true });
    expect(receipt.reservedItemRefs).toEqual([{ id: 1 }]);
    expect(calls).toEqual(['pre', 'select', 'open', 'normalize', 'policy']);
  });

  it('keeps live normalized items for policy execution and serializable items in the receipt', async () => {
    const liveItem = { id: 7, definitionId: 700, mark() { this.marked = true; } };
    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 105, name: 'Bronze' }),
      openTransport: async () => ({ success: true, response: { items: [liveItem] } }),
      normalizeItems: async (items) => ({
        items,
        receiptItems: items.map((item) => ({ id: item.id, definitionId: item.definitionId, pile: 'unassigned' })),
      }),
      openedItemPolicy: async (items) => {
        items[0].mark();
        return {
          routedItemRefs: [{ id: 7, definitionId: 700, pile: 'club' }],
          details: { route: 'club' },
        };
      },
    });
    expect(liveItem.marked).toBe(true);
    expect(receipt.openedItems).toEqual([{ id: 7, definitionId: 700, pile: 'unassigned' }]);
    expect(receipt.routedItemRefs).toEqual([{ id: 7, definitionId: 700, pile: 'club' }]);
    expect(receipt.details).toEqual({ route: 'club' });
  });

  it('marks all opened items pending when no policy is supplied', async () => {
    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 105 }),
      openTransport: async () => ({ success: true, response: { items: [{ id: 9, definitionId: 90 }] } }),
    });
    expect(receipt.pendingItemRefs).toEqual([{ id: 9, definitionId: 90 }]);
  });

  it('retries configured errors with a fresh pack selection', async () => {
    const selector = vi.fn(async ({ attempt }) => ({ id: 100 + attempt }));
    const transport = vi.fn(async (_pack, { attempt }) => attempt === 1
      ? { success: false, error: { code: 471 } }
      : { success: true, response: { items: [] } });
    const beforeRetry = vi.fn(async () => {});
    const receipt = await openPackTransaction({
      packSelector: selector,
      openTransport: transport,
      retryPolicy: { attempts: 2, retryCodes: ['471'] },
      beforeRetry,
    });
    expect(receipt).toMatchObject({ status: 'opened', attempts: 2 });
    expect(selector).toHaveBeenCalledTimes(2);
    expect(beforeRetry).toHaveBeenCalledOnce();
  });

  it('returns the final error code after a bounded retry is exhausted', async () => {
    const beforeRetry = vi.fn(async () => {});
    const receipt = await openPackTransaction({
      packSelector: async ({ attempt }) => ({ id: 200 + attempt }),
      openTransport: async () => ({ success: false, error: { code: 471 } }),
      retryPolicy: { attempts: 2, retryCodes: ['471'] },
      beforeRetry,
    });
    expect(receipt).toMatchObject({ status: 'blocked', reason: '471', attempts: 2 });
    expect(beforeRetry).toHaveBeenCalledOnce();
  });

  it('returns stale for an allowed 404', async () => {
    const onGone = vi.fn(async () => {});
    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 105 }),
      openTransport: async () => ({ success: false, error: { code: 404 } }),
      allowGone: true,
      onGone,
    });
    expect(receipt).toMatchObject({ status: 'stale', reason: '404' });
    expect(onGone).toHaveBeenCalledOnce();
  });

  it('blocks before selection when Unassigned cannot be resolved', async () => {
    const selector = vi.fn();
    const receipt = await openPackTransaction({
      preOpenResolver: async () => ({ status: 'blocked', reason: 'storage full' }),
      packSelector: selector,
      openTransport: async () => ({ success: true, response: { items: [] } }),
    });
    expect(receipt).toMatchObject({ status: 'blocked', reason: 'storage full', attempts: 0 });
    expect(selector).not.toHaveBeenCalled();
  });
});
