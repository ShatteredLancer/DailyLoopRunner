import { describe, expect, it, vi } from 'vitest';
import { createWaitAdapter } from '../../src/adapters/browser/wait.js';

function harness(options = {}) {
  let clock = 0;
  const logs = [];
  const sleep = vi.fn(async (milliseconds) => { clock += milliseconds; });
  const stopPoint = vi.fn(() => {
    if (options.stopError) throw options.stopError;
  });
  const adapter = createWaitAdapter({
    now: () => clock,
    sleep,
    stopPoint,
    log: (message) => logs.push(message),
    pageRuntime: options.pageRuntime || {},
  });
  return { adapter, logs, sleep, stopPoint };
}

describe('Browser wait adapter', () => {
  it('polls a predicate at the legacy interval and returns its truthy value', async () => {
    let attempts = 0;
    const { adapter, sleep, stopPoint } = harness();
    await expect(adapter.until(() => ++attempts === 3 ? { ready: true } : null, 2000, 'example'))
      .resolves.toEqual({ ready: true });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 250);
    expect(stopPoint).toHaveBeenCalledTimes(3);
  });

  it('uses the existing timeout message and propagates Stop immediately', async () => {
    const timedOut = harness();
    await expect(timedOut.adapter.until(() => false, 500, 'SBC squad object')).rejects.toThrow('Timed out waiting for SBC squad object');
    const stopped = harness({ stopError: new Error('Stopped by user') });
    await expect(stopped.adapter.until(() => true)).rejects.toThrow('Stopped by user');
  });

  it('waits for FUT readiness through the Page Runtime adapter', async () => {
    let checks = 0;
    const { adapter } = harness({ pageRuntime: { isReady: () => ++checks === 2 } });
    await expect(adapter.appReady()).resolves.toBe(true);
    expect(checks).toBe(2);
  });

  it('requires the loading shield to remain hidden for the stable interval', async () => {
    const states = [true, false, true, false, false];
    const { adapter, sleep } = harness({
      pageRuntime: { loadingShieldShowing: () => states.shift() ?? false },
    });
    await expect(adapter.loadingEnd(700, 5000)).resolves.toBe(true);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([250, 700, 250, 700]);
  });

  it('logs and continues after the loading shield timeout', async () => {
    const { adapter, logs } = harness({ pageRuntime: { loadingShieldShowing: () => true } });
    await expect(adapter.loadingEnd(700, 500)).resolves.toBe(false);
    expect(logs).toEqual(['Loading shield wait timed out; continuing']);
  });

  it('observes one EA result and unobserves the sender with the same controller', async () => {
    const controller = { id: 'controller' };
    const sender = { unobserve: vi.fn() };
    const observable = {
      observe: vi.fn((receivedController, callback) => {
        expect(receivedController).toBe(controller);
        callback(sender, { success: true });
      }),
    };
    const { adapter } = harness({ pageRuntime: { currentController: () => controller } });

    await expect(adapter.observableOnce(observable, null, 500, 'Store.getPacks')).resolves.toEqual({ success: true });
    expect(sender.unobserve).toHaveBeenCalledWith(controller);
  });

  it('preserves observable timeout text and synchronous observe failures', async () => {
    vi.useFakeTimers();
    try {
      const { adapter } = harness();
      const pending = adapter.observableOnce({ observe() {} }, null, 20000, 'requestUnassignedItems');
      const timeoutAssertion = expect(pending).rejects.toThrow('requestUnassignedItems timed out');
      await vi.advanceTimersByTimeAsync(20000);
      await timeoutAssertion;
      await expect(adapter.observableOnce({ observe() { throw new Error('observe failed'); } }))
        .rejects.toThrow('observe failed');
    } finally {
      vi.useRealTimers();
    }
  });
});
