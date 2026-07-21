import { describe, expect, it, vi } from 'vitest';
import {
  recoverPackOpenRetry,
  shouldDiscardFailedPack,
} from '../../src/pack/retry-recovery.js';

describe('pack open retry recovery', () => {
  it('discards a failed 471 instance and refreshes Store after Unassigned navigation', async () => {
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
      showUnassigned: async () => calls.push('unassigned'),
      openStorePacks: async () => { calls.push('store'); return true; },
      resolveUnassigned: async () => calls.push('resolve'),
      refreshInventory: async ({ storeRefreshed }) => calls.push(`refresh:${storeRefreshed}`),
    });

    expect(result).toEqual({ code: '471', discarded: true, storeRefreshed: true });
    expect(calls.indexOf('mark:20707')).toBeLessThan(calls.indexOf('store'));
    expect(calls.indexOf('unassigned')).toBeLessThan(calls.indexOf('store'));
    expect(calls.indexOf('resolve')).toBeLessThan(calls.indexOf('store'));
    expect(calls).toEqual(expect.arrayContaining([
      'unwind',
      'unassigned',
      'store',
      'resolve',
      'refresh:true',
    ]));
  });

  it('keeps a transient 500 instance eligible and continues when Store navigation is unavailable', async () => {
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
      openStorePacks: async () => false,
      refreshInventory,
    });

    expect(shouldDiscardFailedPack('500')).toBe(false);
    expect(result).toEqual({ code: '500', discarded: false, storeRefreshed: false });
    expect(markFailedPack).not.toHaveBeenCalled();
    expect(refreshInventory).toHaveBeenCalledWith({ storeRefreshed: false });
    expect(logs).toContain('Reward pack: Store Packs view refresh unavailable; continuing with repository refresh');
  });
});
