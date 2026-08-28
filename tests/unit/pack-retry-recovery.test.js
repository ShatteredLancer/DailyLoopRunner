import { describe, expect, it, vi } from 'vitest';
import {
  recoverPackOpenRetry,
  shouldDiscardFailedPack,
} from '../../src/pack/retry-recovery.js';

describe('pack open retry recovery', () => {
  it('discards a failed 471 instance and refreshes Store after confirmed Unassigned navigation', async () => {
    const calls = [];
    const pack = { id: 20707 };
    const result = await recoverPackOpenRetry({
      label: 'Batch Open 3/6',
      code: 471,
      pack,
      log: (message) => calls.push(`log:${message}`),
      markFailedPack: (item) => calls.push(`mark:${item.id}`),
      sleep: async (ms) => calls.push(`sleep:${ms}`),
      pauseMs: 800,
      settleMs: 700,
      unwind: async () => calls.push('unwind'),
      showUnassigned: async () => { calls.push('unassigned'); return []; },
      openStorePacks: async () => { calls.push('store'); return true; },
      resolveUnassigned: async () => calls.push('resolve'),
      refreshInventory: async ({ storeRefreshed }) => calls.push(`refresh:${storeRefreshed}`),
    });

    expect(result).toMatchObject({
      code: '471',
      discarded: true,
      status: 'ready',
      storeRefreshed: true,
      evidence: { source: 'confirmed-unassigned-page', verified: true, pendingCount: 0 },
    });
    expect(calls.indexOf('mark:20707')).toBeLessThan(calls.indexOf('store'));
    expect(calls.indexOf('unassigned')).toBeLessThan(calls.indexOf('store'));
    expect(calls).toEqual(expect.arrayContaining([
      'unwind',
      'unassigned',
      'store',
      'refresh:true',
    ]));
  });

  it('keeps a transient 500 instance eligible when the fresh API proves Unassigned is empty', async () => {
    const markFailedPack = vi.fn();
    const refreshInventory = vi.fn(async () => {});
    const logs = [];
    const result = await recoverPackOpenRetry({
      label: 'Reward pack',
      code: '500',
      pack: { id: 1039 },
      markFailedPack,
      log: (message) => logs.push(message),
      sleep: async () => {},
      inspectFreshUnassigned: async () => ({
        verified: true,
        source: 'fresh-purchased-api',
        items: [],
      }),
      openStorePacks: async () => false,
      refreshInventory,
    });

    expect(shouldDiscardFailedPack('500')).toBe(false);
    expect(result).toMatchObject({
      code: '500',
      discarded: false,
      status: 'ready',
      storeRefreshed: false,
      evidence: { source: 'fresh-purchased-api', verified: true, pendingCount: 0 },
    });
    expect(markFailedPack).not.toHaveBeenCalled();
    expect(refreshInventory).toHaveBeenCalledWith({ storeRefreshed: false });
    expect(logs).toContain('Reward pack: Store Packs view refresh unavailable; continuing with repository refresh');
  });

  it('blocks another open when fresh Purchased API data exposes hidden pending items', async () => {
    const showUnassigned = vi.fn();
    const openStorePacks = vi.fn();
    const resolveUnassigned = vi.fn(async () => ({ status: 'resolved' }));
    const result = await recoverPackOpenRetry({
      label: '10x85 reward',
      code: 471,
      pack: { id: 1082 },
      sleep: async () => {},
      inspectFreshUnassigned: async () => ({
        verified: true,
        source: 'fresh-purchased-api',
        items: [{ id: 901 }, { id: 902 }],
      }),
      showUnassigned,
      openStorePacks,
      resolveUnassigned,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'PACK_OPEN_RESPONSE_LOST',
      details: {
        reasonCode: 'PACK_OPEN_RESPONSE_LOST',
        unassignedEvidence: {
          source: 'fresh-purchased-api',
          verified: true,
          pendingCount: 2,
          pendingItemIds: [901, 902],
        },
      },
    });
    expect(resolveUnassigned).toHaveBeenCalledOnce();
    expect(showUnassigned).not.toHaveBeenCalled();
    expect(openStorePacks).not.toHaveBeenCalled();
  });

  it('resolves a known delayed pending item before retrying the unopened pack', async () => {
    const inspectFreshUnassigned = vi.fn()
      .mockResolvedValueOnce({
        verified: true,
        source: 'fresh-purchased-api',
        items: [{ id: 933760205603, type: 'player-pick' }],
      })
      .mockResolvedValueOnce({
        verified: true,
        source: 'fresh-purchased-api',
        items: [],
      });
    const resolvePendingItems = vi.fn(async () => ({
      status: 'resolved',
      details: { delayedPlayerPickCount: 1 },
    }));
    const resolveUnassigned = vi.fn();
    const refreshInventory = vi.fn(async () => {});
    const result = await recoverPackOpenRetry({
      label: 'Scanned Provisions reward',
      code: 471,
      pack: { id: 21346 },
      sleep: async () => {},
      inspectFreshUnassigned,
      resolvePendingItems,
      resolveUnassigned,
      openStorePacks: async () => true,
      refreshInventory,
    });

    expect(result).toMatchObject({
      status: 'ready',
      resetRetryBaseline: true,
      evidence: {
        source: 'fresh-purchased-api',
        verified: true,
        pendingCount: 0,
      },
    });
    expect(resolvePendingItems).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ id: 933760205603, type: 'player-pick' }],
    }));
    expect(inspectFreshUnassigned).toHaveBeenCalledTimes(2);
    expect(resolveUnassigned).not.toHaveBeenCalled();
    expect(refreshInventory).toHaveBeenCalledWith({ storeRefreshed: true });
  });

  it('preserves an unresolved Player Pick instead of misreporting a lost pack response', async () => {
    const resolveUnassigned = vi.fn();
    const result = await recoverPackOpenRetry({
      label: 'Scanned Provisions reward',
      code: 471,
      pack: { id: 21346 },
      sleep: async () => {},
      inspectFreshUnassigned: async () => ({
        verified: true,
        source: 'fresh-purchased-api',
        items: [{ id: 933760205603, type: 'player-pick' }],
      }),
      resolvePendingItems: async () => ({
        status: 'blocked',
        reason: 'manual Player Pick selection is still pending',
        reasonCode: 'UNASSIGNED_PLAYER_PICK_PENDING',
      }),
      resolveUnassigned,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'UNASSIGNED_PLAYER_PICK_PENDING',
      details: {
        reasonCode: 'UNASSIGNED_PLAYER_PICK_PENDING',
        pendingItemReason: 'manual Player Pick selection is still pending',
      },
    });
    expect(resolveUnassigned).not.toHaveBeenCalled();
  });

  it('defers the unopened pack after a known Player Pick is selected for later routing', async () => {
    const resolveUnassigned = vi.fn();
    const markFailedPack = vi.fn();
    const inspectFreshUnassigned = vi.fn(async () => ({
      verified: true,
      source: 'fresh-purchased-api',
      items: [{ id: 933760205603, type: 'player-pick' }],
    }));
    const result = await recoverPackOpenRetry({
      label: 'Scanned Provisions reward',
      code: 471,
      pack: { id: 21346 },
      markFailedPack,
      sleep: async () => {},
      inspectFreshUnassigned,
      resolvePendingItems: async () => ({
        status: 'deferred',
        reason: 'Player Pick selected; selected card needs Rolling routing',
        reasonCode: 'PACK_OPEN_DEFERRED_FOR_PLAYER_PICK',
        details: { selectedCardCount: 1 },
      }),
      resolveUnassigned,
    });

    expect(result).toMatchObject({
      status: 'deferred',
      discarded: false,
      reasonCode: 'PACK_OPEN_DEFERRED_FOR_PLAYER_PICK',
      details: { selectedCardCount: 1 },
    });
    expect(inspectFreshUnassigned).toHaveBeenCalledOnce();
    expect(markFailedPack).not.toHaveBeenCalled();
    expect(resolveUnassigned).not.toHaveBeenCalled();
  });

  it('fails closed when neither fresh API nor page navigation can verify Unassigned state', async () => {
    const openStorePacks = vi.fn();
    const result = await recoverPackOpenRetry({
      label: '10x85 reward',
      code: 471,
      pack: { id: 1082 },
      sleep: async () => {},
      inspectFreshUnassigned: async () => ({
        verified: false,
        source: 'fresh-purchased-api',
        items: [],
        details: { error: 'request failed' },
      }),
      showUnassigned: async () => {
        const error = new Error('controller remained Home');
        error.code = 'UNASSIGNED_NAVIGATION_NOT_CONFIRMED';
        throw error;
      },
      openStorePacks,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'PACK_OPEN_RESULT_AMBIGUOUS',
      details: {
        reasonCode: 'PACK_OPEN_RESULT_AMBIGUOUS',
        unassignedEvidence: { verified: false, source: 'fresh-purchased-api' },
      },
    });
    expect(openStorePacks).not.toHaveBeenCalled();
  });
});
