export function createTradeSchedulerWakeups(options = {}) {
  const windowTarget = options.windowTarget;
  const documentTarget = options.documentTarget;
  if (typeof options.tick !== 'function') throw new TypeError('tick is required');
  let started = false;

  const wake = () => { void options.tick(); };
  const onVisibilityChange = () => {
    if (documentTarget?.visibilityState === 'visible' || documentTarget?.hidden === false) wake();
  };

  function start() {
    if (started) return false;
    started = true;
    documentTarget?.addEventListener?.('visibilitychange', onVisibilityChange);
    windowTarget?.addEventListener?.('focus', wake);
    windowTarget?.addEventListener?.('online', wake);
    return true;
  }

  function stop() {
    if (!started) return false;
    started = false;
    documentTarget?.removeEventListener?.('visibilitychange', onVisibilityChange);
    windowTarget?.removeEventListener?.('focus', wake);
    windowTarget?.removeEventListener?.('online', wake);
    return true;
  }

  return Object.freeze({ start, stop });
}
