import { describe, expect, it, vi } from 'vitest';
import {
  collectNativeSwapRoutingEvidence,
  settleOpenedItems,
} from '../../src/pack/opened-item-settlement.js';

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

  it('keeps unresolved response items pending when Unassigned cleanup made no progress', async () => {
    const cleanup = vi.fn(async () => ({ status: 'blocked', reason: 'Unassigned action made no progress' }));
    const result = await settleOpenedItems({
      attempts: 2,
      materialize: async () => ({}),
      cleanup,
      confirmRouting: async () => ({ pendingItems: [{ id: 1 }] }),
    });

    expect(result).toMatchObject({ status: 'pending', attempts: 2 });
    expect(cleanup).toHaveBeenCalledTimes(2);
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

  it('retries only the unresolved receipt items and retains earlier confirmed routes', async () => {
    const openedClubItem = { id: 101, definitionId: 501 };
    const delayedItem = { id: 102, definitionId: 502 };
    const cleanup = vi.fn(async () => ({ status: 'resolved' }));
    const confirmRouting = vi.fn(async ({ pendingItems }) => {
      if (!pendingItems) {
        return {
          routedItems: [openedClubItem],
          reservedItems: [],
          pendingItems: [delayedItem],
        };
      }
      expect(pendingItems).toEqual([delayedItem]);
      return {
        routedItems: [delayedItem],
        reservedItems: [],
        pendingItems: [],
      };
    });

    const result = await settleOpenedItems({
      attempts: 2,
      materialize: async () => ({}),
      cleanup,
      confirmRouting,
    });

    expect(result).toMatchObject({ status: 'resolved', attempts: 2 });
    expect(result.routing.routedItems).toEqual([openedClubItem, delayedItem]);
    expect(cleanup.mock.calls[1][0].pendingItems).toEqual([delayedItem]);
  });

  it('does not re-open an already confirmed route when a later cache read is stale', async () => {
    const openedClubItem = { id: 101, definitionId: 501 };
    const delayedItem = { id: 102, definitionId: 502 };
    const result = await settleOpenedItems({
      attempts: 2,
      materialize: async () => ({}),
      cleanup: async () => ({ status: 'resolved' }),
      confirmRouting: async ({ pendingItems }) => {
        if (!pendingItems) {
          return {
            routedItems: [openedClubItem],
            reservedItems: [],
            pendingItems: [delayedItem],
          };
        }
        return {
          routedItems: [],
          reservedItems: [],
          // The stale source incorrectly claims that the first response item
          // is pending again. Its exact Club route must remain terminal.
          pendingItems: [openedClubItem, delayedItem],
        };
      },
    });

    expect(result).toMatchObject({ status: 'pending', attempts: 2 });
    expect(result.routing.routedItems).toEqual([openedClubItem]);
    expect(result.routing.pendingItems).toEqual([delayedItem]);
  });

  it('uses only an exact native-swap Club observation when a later Club cache is stale', async () => {
    const opened = { id: 101, definitionId: 501 };
    const cleanup = vi.fn(async () => ({
      status: 'resolved',
      routeEvidence: [{
        itemId: 101,
        destination: 'club',
        source: 'native-swap-exact-location',
      }],
    }));
    const result = await settleOpenedItems({
      attempts: 3,
      materialize: async () => ({}),
      cleanup,
      // The later Club refresh lost the just-swapped entity, but the executor
      // had already confirmed its exact id in Club after the successful move.
      confirmRouting: async () => ({ routedItems: [], reservedItems: [], pendingItems: [opened] }),
    });

    expect(result).toMatchObject({ status: 'resolved', attempts: 1 });
    expect(result.routing.routedItems).toEqual([opened]);
    expect(result.routing.pendingItems).toEqual([]);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('accepts only the exact response id observed in Club after a native swap', () => {
    const completedSwap = {
      action: { type: 'swap' },
      exactLocations: [{
        ref: { id: 101 },
        piles: {
          club: [{ id: 101 }],
          // The original Club counterpart is a distinct new Unassigned item.
          unassigned: [{ id: 201 }],
          storage: [],
          transfer: [],
        },
      }],
    };
    expect(collectNativeSwapRoutingEvidence(completedSwap, [101])).toEqual([{
      itemId: 101,
      destination: 'club',
      source: 'native-swap-exact-location',
    }]);
    expect(collectNativeSwapRoutingEvidence(completedSwap, [999])).toEqual([]);
    const ambiguousSwap = {
      ...completedSwap,
      exactLocations: [{
        ...completedSwap.exactLocations[0],
        piles: { ...completedSwap.exactLocations[0].piles, unassigned: [{ id: 101 }] },
      }],
    };
    expect(collectNativeSwapRoutingEvidence(ambiguousSwap, [101])).toEqual([]);
    expect(collectNativeSwapRoutingEvidence({ ...completedSwap, action: { type: 'move' } }, [101])).toEqual([]);
  });
});
