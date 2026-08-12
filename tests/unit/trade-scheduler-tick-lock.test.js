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

  it.each([
    ['with Web Locks', { request: async (name, options, callback) => callback({ name }) }],
    ['without Web Locks', null],
  ])('keeps a same-page overlapping tick out %s', async (label, lockManager) => {
    let finish;
    const pending = new Promise((resolve) => { finish = resolve; });
    const task = vi.fn(async () => {
      await pending;
      return { status: 'completed' };
    });
    const lock = createTradeSchedulerTickLock({ lockManager });
    const first = lock.run(task);
    await Promise.resolve();
    expect(await lock.run(task)).toEqual({ status: 'busy', reason: 'local-tick-active' });
    expect(task).toHaveBeenCalledOnce();
    finish();
    expect(await first).toEqual({ status: 'completed' });
    expect(await lock.run(async () => ({ status: 'idle' }))).toEqual({ status: 'idle' });
  });

  it('does not let a polling tick relock other Jobs while a same-page Run is in flight', async () => {
    let finishRun;
    const pendingRun = new Promise((resolve) => { finishRun = resolve; });
    const state = {
      paused: false,
      jobs: {
        buy: { armed: true, authorizedRuns: 1 },
        listing: { armed: true, authorizedRuns: 1 },
      },
    };
    const relock = vi.fn(() => {
      state.paused = true;
      for (const job of Object.values(state.jobs)) {
        job.armed = false;
        job.authorizedRuns = 0;
      }
    });
    const lock = createTradeSchedulerTickLock();
    const activeRun = lock.run(async () => {
      state.jobs.buy.authorizedRuns -= 1;
      await pendingRun;
      return { status: 'completed', jobId: 'buy' };
    });
    await Promise.resolve();

    const pollingTick = await lock.run(async () => {
      relock();
      return { status: 'blocked', reason: 'buy-journal-mutation-review-required' };
    });

    expect(pollingTick).toEqual({ status: 'busy', reason: 'local-tick-active' });
    expect(relock).not.toHaveBeenCalled();
    expect(state).toEqual({
      paused: false,
      jobs: {
        buy: { armed: true, authorizedRuns: 0 },
        listing: { armed: true, authorizedRuns: 1 },
      },
    });
    finishRun();
    await expect(activeRun).resolves.toEqual({ status: 'completed', jobId: 'buy' });
  });

  it('does not run cross-tab preflight when another tab owns the Web Lock', async () => {
    let held = false;
    let finishRun;
    const pendingRun = new Promise((resolve) => { finishRun = resolve; });
    const lockManager = {
      request: async (name, options, callback) => {
        if (held) return callback(null);
        held = true;
        try {
          return await callback({ name });
        } finally {
          held = false;
        }
      },
    };
    const firstTab = createTradeSchedulerTickLock({ lockManager });
    const secondTab = createTradeSchedulerTickLock({ lockManager });
    const secondTabPreflight = vi.fn(() => ({ status: 'blocked' }));
    const activeRun = firstTab.run(async () => {
      await pendingRun;
      return { status: 'completed' };
    });
    await Promise.resolve();

    await expect(secondTab.run(secondTabPreflight)).resolves.toEqual({
      status: 'busy',
      reason: 'browser-lock-held',
    });
    expect(secondTabPreflight).not.toHaveBeenCalled();
    finishRun();
    await expect(activeRun).resolves.toEqual({ status: 'completed' });
  });
});
