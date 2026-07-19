export function createWaitAdapter(options = {}) {
  const now = options.now || Date.now;
  const sleep = options.sleep;
  const stopPoint = options.stopPoint;
  const pageRuntime = options.pageRuntime;
  const log = options.log || (() => {});
  if (typeof sleep !== 'function') throw new TypeError('sleep is required');
  if (typeof stopPoint !== 'function') throw new TypeError('stopPoint is required');

  async function until(predicate, timeoutMs = 15000, label = 'condition') {
    const start = now();
    while (now() - start < timeoutMs) {
      stopPoint();
      try {
        const value = predicate();
        if (value) return value;
      } catch { }
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }

  async function appReady() {
    return until(() => pageRuntime?.isReady?.(), 30000, 'FUT main UI');
  }

  async function loadingEnd(stableMs = 700, timeoutMs = 30000) {
    const start = now();
    while (now() - start < timeoutMs) {
      stopPoint();
      if (!pageRuntime?.loadingShieldShowing?.()) {
        await sleep(stableMs);
        if (!pageRuntime?.loadingShieldShowing?.()) return true;
      }
      await sleep(250);
    }
    log('Loading shield wait timed out; continuing');
    return false;
  }

  function observableOnce(observable, controller, timeoutMs = 20000, label = 'observable') {
    return new Promise((resolve, reject) => {
      let done = false;
      const timeoutId = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error(`${label} timed out`));
      }, timeoutMs);

      try {
        const observedController = controller || pageRuntime?.currentController?.();
        observable.observe(observedController, (sender, result) => {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          try { sender?.unobserve?.(controller || pageRuntime?.currentController?.()); } catch { }
          resolve(result);
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  return Object.freeze({ appReady, loadingEnd, observableOnce, until });
}
