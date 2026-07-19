export function isSbcSquadControllerName(name) {
  return /UTSBCSquadSplitViewController/i.test(String(name || ''));
}

export function isSbcControllerName(name) {
  return /^UTSBC/i.test(String(name || ''));
}

export async function unwindSbcSquadControllers(options = {}) {
  const label = String(options.label || 'SBC navigation');
  const maxPops = Math.max(0, Number(options.maxPops ?? 20) || 0);
  const currentController = options.currentController;
  const currentControllerName = options.currentControllerName;
  const popController = options.popController;
  const waitLoadingEnd = options.waitLoadingEnd;
  const sleep = options.sleep;
  const log = options.log || (() => {});
  if (typeof currentController !== 'function') throw new TypeError('currentController is required');
  if (typeof currentControllerName !== 'function') throw new TypeError('currentControllerName is required');
  if (typeof popController !== 'function') throw new TypeError('popController is required');
  if (typeof waitLoadingEnd !== 'function') throw new TypeError('waitLoadingEnd is required');
  if (typeof sleep !== 'function') throw new TypeError('sleep is required');

  let popped = 0;
  while (isSbcSquadControllerName(currentControllerName()) && popped < maxPops) {
    const controller = currentController();
    if (popController(true) !== true) {
      log(`${label}: cannot exit ${currentControllerName() || 'SBC squad'}; navigation pop method is unavailable`);
      break;
    }

    popped++;
    await waitLoadingEnd(350, 10000).catch(() => null);
    for (let wait = 0; wait < 12 && currentController() === controller; wait++) await sleep(250);
    if (currentController() === controller) {
      log(`${label}: SBC squad controller did not change after navigation pop ${popped}`);
      break;
    }
  }

  if (popped) {
    log(`${label}: removed ${popped} stale SBC squad view(s); current controller ${currentControllerName() || 'unknown'}`);
  }
  return popped;
}

export async function synchronizeAfterSbcSubmit(options = {}) {
  const label = String(options.label || 'SBC submit');
  const currentControllerName = options.currentControllerName;
  const unwind = options.unwind;
  const showUnassigned = options.showUnassigned;
  const openStorePacks = options.openStorePacks;
  const log = options.log || (() => {});
  if (typeof currentControllerName !== 'function') throw new TypeError('currentControllerName is required');
  if (typeof unwind !== 'function') throw new TypeError('unwind is required');
  if (typeof showUnassigned !== 'function') throw new TypeError('showUnassigned is required');
  if (typeof openStorePacks !== 'function') throw new TypeError('openStorePacks is required');

  const before = currentControllerName() || 'unknown';
  await unwind(`${label} post-submit`);
  await showUnassigned(`${label} post-submit navigation sync`);
  let after = currentControllerName() || 'unknown';

  if (isSbcSquadControllerName(after)) {
    await unwind(`${label} post-unassigned`);
    after = currentControllerName() || 'unknown';
  }

  if (isSbcControllerName(after)) {
    log(`${label}: controller is still ${after} in the SBC area after navigation cleanup; opening Store Packs as a final fallback`);
    await openStorePacks(`${label} post-submit Store sync`).catch((error) => {
      log(`${label}: post-submit Store sync skipped: ${error?.message || error}`);
      return false;
    });
    after = currentControllerName() || 'unknown';
  }

  log(`${label}: post-submit controller ${before} -> ${after}`);
  return { before, after };
}
