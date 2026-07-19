const MAIN_FUT_SELECTORS = [
  '.ut-tab-bar-item.icon-home',
  '.ut-navigation-container-view--content',
  '.ut-navigation-container-view',
  '.ut-navigation-bar-view',
  '.ut-tab-bar',
  '.ut-home-hub-view',
  '.ut-store-hub-view',
  '.ut-sbc-hub-view',
  '.ut-sbc-set-view',
  '.ut-sbc-challenges-view',
  '.ut-squad-hub-view',
  '.ut-club-view',
  '.ut-transfer-list-view',
  '.ut-unassigned-items-view',
];

export function controllerName(controller) {
  return String(controller?.className || controller?.constructor?.name || '');
}

export function isMainFutControllerName(name) {
  return /^UT(Home|Store|SBC|Squad|Club|Transfer|Unassigned|Evolutions|Objectives|Market|Pack)/.test(String(name || '')) &&
    !/Loading|Splash|Login|Preload|Startup/i.test(String(name || ''));
}

export function createPageRuntimeAdapter(runtime, dom) {
  function currentController() {
    try {
      return runtime.getAppMain()
        .getRootViewController()
        .getPresentedViewController()
        .getCurrentViewController()
        .getCurrentController();
    } catch {
      return null;
    }
  }

  function currentControllerName() {
    return controllerName(currentController());
  }

  function navigationController(controller = currentController()) {
    try { return controller?.getNavigationController?.() || controller?.navigationController || null; } catch { return null; }
  }

  function controllerRoot(controller) {
    try {
      return controller?.getView?.()?.getRootElement?.() || controller?.getView?.()?.getRootElement || null;
    } catch {
      return null;
    }
  }

  function shieldShowing(shieldName) {
    try { return runtime?.[shieldName]?.isShowing?.() === true; } catch { return false; }
  }

  function loadingShieldShowing() {
    return shieldShowing('gClickShield');
  }

  function popupShieldShowing() {
    return shieldShowing('gPopupClickShield');
  }

  function popupControllerCandidates() {
    const shield = runtime?.gPopupClickShield;
    if (!shield) return [];
    const candidates = [];
    for (const method of ['getActivePopup', 'getActivePopupController', 'getPopup', 'getPopupController']) {
      try {
        if (typeof shield?.[method] === 'function') candidates.push(shield[method]());
      } catch { }
    }
    for (const property of [
      'activePopup', '_activePopup', 'popup', '_popup', 'popupController', '_popupController',
      'activeController', '_activeController', 'presentedController', '_presentedController',
    ]) {
      try { candidates.push(shield?.[property]); } catch { }
    }
    try { candidates.push(...Object.values(shield).slice(0, 80)); } catch { }
    return candidates.filter(Boolean);
  }

  function gotoUnassigned(controller = currentController()) {
    if (typeof controller?.gotoUnassigned === 'function') {
      controller.gotoUnassigned();
      return true;
    }
    const fallback = runtime?.UTStoreViewController?.prototype?.gotoUnassigned;
    if (typeof fallback === 'function') {
      fallback.call(controller);
      return true;
    }
    return false;
  }

  function popViewController(animated = true, controller = currentController()) {
    const navigation = navigationController(controller);
    if (typeof navigation?.popViewController !== 'function') return false;
    navigation.popViewController(animated);
    return true;
  }

  function origin() {
    return String(runtime?.location?.origin || globalThis.location?.origin || '');
  }

  function servicesReady() {
    return !!(
      runtime?.services?.Store &&
      runtime?.services?.SBC &&
      runtime?.services?.Item &&
      runtime?.repositories?.Store &&
      runtime?.repositories?.Item
    );
  }

  function hasMainDom() {
    return MAIN_FUT_SELECTORS.some((selector) => dom?.query?.(selector));
  }

  function isReady() {
    return servicesReady() && (hasMainDom() || isMainFutControllerName(currentControllerName()));
  }

  return Object.freeze({
    controllerName,
    controllerRoot,
    currentController,
    currentControllerName,
    hasMainDom,
    isMainFutControllerName,
    isReady,
    loadingShieldShowing,
    navigationController,
    popViewController,
    gotoUnassigned,
    origin,
    popupControllerCandidates,
    popupShieldShowing,
    servicesReady,
  });
}
