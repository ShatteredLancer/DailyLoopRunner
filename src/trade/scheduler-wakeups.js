export function createTradeSchedulerWakeups(options = {}) {
  const windowTarget = options.windowTarget;
  const documentTarget = options.documentTarget;
  if (typeof options.tick !== 'function') throw new TypeError('tick is required');
  let started = false;

  const wake = (trigger) => { void options.tick({ trigger }); };
  const onVisibilityChange = () => {
    if (documentTarget?.visibilityState === 'visible' || documentTarget?.hidden === false) wake('visibility');
  };
  const onFocus = () => wake('focus');
  const onOnline = () => wake('online');

  function start() {
    if (started) return false;
    started = true;
    documentTarget?.addEventListener?.('visibilitychange', onVisibilityChange);
    windowTarget?.addEventListener?.('focus', onFocus);
    windowTarget?.addEventListener?.('online', onOnline);
    return true;
  }

  function stop() {
    if (!started) return false;
    started = false;
    documentTarget?.removeEventListener?.('visibilitychange', onVisibilityChange);
    windowTarget?.removeEventListener?.('focus', onFocus);
    windowTarget?.removeEventListener?.('online', onOnline);
    return true;
  }

  return Object.freeze({ start, stop });
}
