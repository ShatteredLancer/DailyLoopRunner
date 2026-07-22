import { describe, expect, it, vi } from 'vitest';
import { settleOpenedItems } from '../../src/pack/opened-item-settlement.js';

describe('opened item settlement', () => {
  it('re-cleans a delayed Unassigned item and succeeds after routing settles', async () => {
    const materialize = vi.fn(async () => ({ duplicates: [{ id: 1 }] }));
    const cleanup = vi.fn(async ({ attempt }) => ({ status: 'resolved', attempt }));
    const confirmRouting = vi.fn(async ({ attempt }) => attempt === 1
      ? { routedItems: [], reservedItems: [], pendingItems: [{ id: 1 }] }
      : { routedItems: [{ id: 1 }], reservedItems: [], pendingItems: [] });
    const onRetry = vi.fn(async () => {});

    const result = await settleOpenedItems({ materialize, cleanup, confirmRouting, onRetry, attempts: 3 });
    expect(result).toMatchObject({ status: 'resolved', attempts: 2 });
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(confirmRouting).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('returns pending after bounded settlement attempts', async () => {
    const result = await settleOpenedItems({
      attempts: 2,
      materialize: async () => ({}),
      cleanup: async () => ({ status: 'resolved' }),
      confirmRouting: async () => ({ pendingItems: [{ id: 1 }, { id: 2 }] }),
    });
    expect(result).toMatchObject({ status: 'pending', attempts: 2 });
    expect(result.reason).toContain('2 opened item(s) remain unresolved');
  });

  it('preserves an explicit capacity stop without replacing its reason or retrying', async () => {
    const cleanup = vi.fn(async () => ({ status: 'preserved', reason: 'storage capacity 0/3' }));
    const result = await settleOpenedItems({
      attempts: 3,
      materialize: async () => ({}),
      cleanup,
      confirmRouting: async () => ({ pendingItems: [{ id: 1 }] }),
    });
    expect(result).toMatchObject({
      status: 'preserved',
      attempts: 1,
      cleanup: { reason: 'storage capacity 0/3' },
    });
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
