import { describe, expect, it } from 'vitest';
import {
  controllerName,
  createPageRuntimeAdapter,
  isMainFutControllerName,
} from '../../src/adapters/browser/page-runtime.js';

function readyRuntime(controller) {
  return {
    services: { Store: {}, SBC: {}, Item: {} },
    repositories: { Store: {}, Item: {} },
    getAppMain: () => ({
      getRootViewController: () => ({
        getPresentedViewController: () => ({
          getCurrentViewController: () => ({
            getCurrentController: () => controller,
          }),
        }),
      }),
    }),
  };
}

describe('Browser page runtime adapter', () => {
  it('reads the current controller through the EA controller chain', () => {
    const controller = { className: 'UTStorePackViewController' };
    const adapter = createPageRuntimeAdapter(readyRuntime(controller), { query: () => null });
    expect(adapter.currentController()).toBe(controller);
    expect(adapter.currentControllerName()).toBe('UTStorePackViewController');
  });

  it('returns null when the controller chain is unavailable', () => {
    const adapter = createPageRuntimeAdapter({ getAppMain: () => { throw new Error('not ready'); } }, { query: () => null });
    expect(adapter.currentController()).toBeNull();
    expect(adapter.currentControllerName()).toBe('');
    expect(adapter.isReady()).toBe(false);
  });

  it('recognizes main FUT controllers while excluding loading/login controllers', () => {
    expect(controllerName({ constructor: { name: 'UTSBCHubViewController' } })).toBe('UTSBCHubViewController');
    expect(isMainFutControllerName('UTSBCHubViewController')).toBe(true);
    expect(isMainFutControllerName('UTStoreLoadingViewController')).toBe(false);
    expect(isMainFutControllerName('UTLoginViewController')).toBe(false);
    expect(isMainFutControllerName('UnrelatedController')).toBe(false);
  });

  it('requires services plus either main DOM or a main controller', () => {
    const domReady = createPageRuntimeAdapter(readyRuntime({ className: 'UnknownController' }), {
      query: (selector) => selector === '.ut-tab-bar-item.icon-home' ? {} : null,
    });
    expect(domReady.servicesReady()).toBe(true);
    expect(domReady.hasMainDom()).toBe(true);
    expect(domReady.isReady()).toBe(true);

    const controllerReady = createPageRuntimeAdapter(readyRuntime({ className: 'UTClubViewController' }), { query: () => null });
    expect(controllerReady.hasMainDom()).toBe(false);
    expect(controllerReady.isReady()).toBe(true);
  });

  it('reads navigation, roots, shields, and popup controller candidates without side effects', () => {
    const popupFromMethod = { id: 1 };
    const popupFromProperty = { id: 2 };
    const navigation = { id: 'nav' };
    const root = { id: 'root' };
    const controller = {
      className: 'UTSBCViewController',
      getNavigationController: () => navigation,
      getView: () => ({ getRootElement: () => root }),
    };
    const runtime = readyRuntime(controller);
    runtime.gClickShield = { isShowing: () => true };
    runtime.gPopupClickShield = {
      isShowing: () => true,
      getActivePopup: () => popupFromMethod,
      activePopup: popupFromProperty,
    };
    const adapter = createPageRuntimeAdapter(runtime, { query: () => null });
    expect(adapter.navigationController()).toBe(navigation);
    expect(adapter.controllerRoot(controller)).toBe(root);
    expect(adapter.loadingShieldShowing()).toBe(true);
    expect(adapter.popupShieldShowing()).toBe(true);
    expect(adapter.popupControllerCandidates()).toEqual(expect.arrayContaining([popupFromMethod, popupFromProperty]));
  });

  it('falls back safely when shield and controller accessors throw', () => {
    const controller = {
      getNavigationController: () => { throw new Error('nav'); },
      getView: () => { throw new Error('view'); },
    };
    const runtime = readyRuntime(controller);
    runtime.gClickShield = { isShowing: () => { throw new Error('shield'); } };
    runtime.gPopupClickShield = { isShowing: () => { throw new Error('popup'); } };
    const adapter = createPageRuntimeAdapter(runtime, { query: () => null });
    expect(adapter.navigationController()).toBeNull();
    expect(adapter.controllerRoot(controller)).toBeNull();
    expect(adapter.loadingShieldShowing()).toBe(false);
    expect(adapter.popupShieldShowing()).toBe(false);
  });

  it('uses current and prototype gotoUnassigned fallbacks and exposes the runtime origin', () => {
    const calls = [];
    const direct = readyRuntime({ gotoUnassigned: () => calls.push('direct') });
    direct.location = { origin: 'https://example.test' };
    const directAdapter = createPageRuntimeAdapter(direct, { query: () => null });
    expect(directAdapter.gotoUnassigned()).toBe(true);
    expect(directAdapter.origin()).toBe('https://example.test');

    const fallbackController = {};
    const fallback = readyRuntime(fallbackController);
    fallback.UTStoreViewController = { prototype: { gotoUnassigned() { calls.push(this === fallbackController ? 'fallback' : 'wrong'); } } };
    const fallbackAdapter = createPageRuntimeAdapter(fallback, { query: () => null });
    expect(fallbackAdapter.gotoUnassigned()).toBe(true);
    expect(calls).toEqual(['direct', 'fallback']);
  });

  it('pops the current navigation controller through the runtime boundary', () => {
    const calls = [];
    const controller = {
      getNavigationController: () => ({ popViewController: (animated) => calls.push(animated) }),
    };
    const adapter = createPageRuntimeAdapter(readyRuntime(controller), { query: () => null });
    expect(adapter.popViewController(false)).toBe(true);
    expect(calls).toEqual([false]);

    const unavailable = createPageRuntimeAdapter(readyRuntime({}), { query: () => null });
    expect(unavailable.popViewController()).toBe(false);
  });
});
