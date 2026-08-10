export const TRADE_SCHEDULER_WEB_LOCK = 'fc-loop-runner-trade-scheduler-v1';

export function createTradeSchedulerTickLock(options = {}) {
  const lockManager = options.lockManager;
  const name = String(options.name || TRADE_SCHEDULER_WEB_LOCK);

  async function run(task) {
    if (typeof task !== 'function') throw new TypeError('task is required');
    if (typeof lockManager?.request !== 'function') return task();
    return lockManager.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => (
      lock ? task() : { status: 'busy', reason: 'browser-lock-held' }
    ));
  }

  function inspect() {
    return { name, supported: typeof lockManager?.request === 'function' };
  }

  return Object.freeze({ run, inspect });
}
