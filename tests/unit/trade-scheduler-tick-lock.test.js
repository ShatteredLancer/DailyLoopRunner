import { describe, expect, it, vi } from 'vitest';
import { createTradeSchedulerTickLock, TRADE_SCHEDULER_WEB_LOCK } from '../../src/trade/scheduler-tick-lock.js';

describe('Trade Scheduler Web Lock', () => {
  it('runs under an available exclusive browser lock', async () => {
    const task = vi.fn(async () => ({ status: 'completed' }));
    const request = vi.fn(async (name, options, callback) => callback({ name }));
    const result = await createTradeSchedulerTickLock({ lockManager: { request } }).run(task);
    expect(result).toEqual({ status: 'completed' });
    expect(request).toHaveBeenCalledWith(
      TRADE_SCHEDULER_WEB_LOCK,
      { mode: 'exclusive', ifAvailable: true },
      expect.any(Function),
    );
    expect(task).toHaveBeenCalledOnce();
    expect(createTradeSchedulerTickLock({ lockManager: { request } }).inspect()).toEqual({
      name: TRADE_SCHEDULER_WEB_LOCK,
      supported: true,
    });
  });

  it('does not run when another tab holds the browser lock and falls back only when unsupported', async () => {
    const blockedTask = vi.fn();
    const unavailable = createTradeSchedulerTickLock({
      lockManager: { request: async (name, options, callback) => callback(null) },
    });
    expect(await unavailable.run(blockedTask)).toEqual({ status: 'busy', reason: 'browser-lock-held' });
    expect(blockedTask).not.toHaveBeenCalled();
    const fallbackTask = vi.fn(async () => ({ status: 'idle' }));
    expect(await createTradeSchedulerTickLock().run(fallbackTask)).toEqual({ status: 'idle' });
    expect(fallbackTask).toHaveBeenCalledOnce();
    expect(createTradeSchedulerTickLock().inspect()).toEqual({ name: TRADE_SCHEDULER_WEB_LOCK, supported: false });
  });
});
