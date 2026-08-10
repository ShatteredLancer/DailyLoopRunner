import { describe, expect, it, vi } from 'vitest';
import { createTradeSchedulerWakeups } from '../../src/trade/scheduler-wakeups.js';

function eventTarget(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    dispatch(type) { listeners.get(type)?.(); },
    listenerCount: () => listeners.size,
  };
}

describe('Trade Scheduler wakeups', () => {
  it('ticks on visible, focus and online recovery and removes listeners on stop', () => {
    const windowTarget = eventTarget();
    const documentTarget = eventTarget({ visibilityState: 'hidden', hidden: true });
    const tick = vi.fn();
    const wakeups = createTradeSchedulerWakeups({ windowTarget, documentTarget, tick });
    expect(wakeups.start()).toBe(true);
    expect(wakeups.start()).toBe(false);
    documentTarget.dispatch('visibilitychange');
    expect(tick).not.toHaveBeenCalled();
    documentTarget.visibilityState = 'visible';
    documentTarget.hidden = false;
    documentTarget.dispatch('visibilitychange');
    windowTarget.dispatch('focus');
    windowTarget.dispatch('online');
    expect(tick).toHaveBeenCalledTimes(3);
    expect(wakeups.stop()).toBe(true);
    expect(wakeups.stop()).toBe(false);
    expect(windowTarget.listenerCount()).toBe(0);
    expect(documentTarget.listenerCount()).toBe(0);
  });
});
