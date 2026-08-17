import { describe, expect, it, vi } from 'vitest';
import { recoverRuntimeUnassignedNavigation } from '../../src/unassigned/runtime-navigation.js';

function runtimeHarness(initialController) {
  let controller = initialController;
  const setController = (name) => { controller = name; };
  return {
    setController,
    getController: () => controller,
    options: {
      getControllerName: () => controller,
      popCurrent: vi.fn(() => false),
      requestController: vi.fn(() => true),
      clickHome: vi.fn(() => false),
      requestTextFallback: vi.fn(() => false),
      settle: vi.fn(async () => {}),
    },
  };
}

describe('runtime Unassigned navigation recovery', () => {
  it('pops a Store Pack controller before retrying controller navigation', async () => {
    const current = runtimeHarness('UTStorePackViewController');
    current.options.popCurrent = vi.fn(() => {
      current.setController('UTStoreHubViewController');
      return true;
    });
    current.options.requestController = vi.fn(() => {
      current.setController('UTUnassignedItemsSplitViewController');
      return true;
    });

    const result = await recoverRuntimeUnassignedNavigation(current.options);

    expect(result).toMatchObject({ requested: true, confirmed: true });
    expect(result.steps.map((step) => step.id)).toEqual(['pop-store-pack', 'controller']);
  });

  it('materializes all-duplicate rewards before leaving Store Pack and retries navigation', async () => {
    const current = runtimeHarness('UTStorePackViewController');
    let materialized = false;
    current.options.materializeUnassigned = vi.fn(async () => {
      materialized = true;
    });
    current.options.requestController = vi.fn(() => {
      if (materialized) current.setController('UTUnassignedItemsSplitViewController');
      return true;
    });

    const result = await recoverRuntimeUnassignedNavigation(current.options);

    expect(result).toMatchObject({ requested: true, confirmed: true });
    expect(result.steps.map((step) => step.id)).toEqual([
      'materialize-store-pack',
      'controller-after-materialize',
    ]);
    expect(current.options.popCurrent).not.toHaveBeenCalled();
    expect(current.options.clickHome).not.toHaveBeenCalled();
  });

  it('materializes again after reaching Home and keeps recovery retries bounded', async () => {
    const current = runtimeHarness('UTStorePackViewController');
    let materializationCount = 0;
    current.options.materializeUnassigned = vi.fn(async () => {
      materializationCount += 1;
    });
    current.options.popCurrent = vi.fn(() => {
      current.setController('UTStoreHubViewController');
      return true;
    });
    current.options.clickHome = vi.fn(() => {
      current.setController('UTHomeHubViewController');
      return true;
    });
    current.options.requestController = vi.fn(() => {
      if (materializationCount >= 2) current.setController('UTUnassignedItemsSplitViewController');
      return true;
    });

    const result = await recoverRuntimeUnassignedNavigation(current.options);

    expect(result).toMatchObject({ requested: true, confirmed: true });
    expect(result.steps.map((step) => step.id)).toEqual([
      'materialize-store-pack',
      'controller-after-materialize',
      'pop-store-pack',
      'controller',
      'home',
      'materialize-after-home',
      'controller-after-home',
    ]);
    expect(current.options.materializeUnassigned).toHaveBeenCalledTimes(2);
    expect(current.options.requestController).toHaveBeenCalledTimes(3);
  });

  it('stops after the bounded Store Pack and Home materialization attempts remain no-ops', async () => {
    const current = runtimeHarness('UTStorePackViewController');
    current.options.materializeUnassigned = vi.fn(async () => {});
    current.options.popCurrent = vi.fn(() => {
      current.setController('UTStoreHubViewController');
      return true;
    });
    current.options.clickHome = vi.fn(() => {
      current.setController('UTHomeHubViewController');
      return true;
    });
    current.options.requestTextFallback = vi.fn(() => true);

    const result = await recoverRuntimeUnassignedNavigation(current.options);

    expect(result).toMatchObject({
      requested: true,
      confirmed: false,
      to: 'UTHomeHubViewController',
    });
    expect(result.steps.map((step) => step.id)).toEqual([
      'materialize-store-pack',
      'controller-after-materialize',
      'pop-store-pack',
      'controller',
      'home',
      'materialize-after-home',
      'controller-after-home',
      'text-fallback-after-home',
    ]);
    expect(current.options.materializeUnassigned).toHaveBeenCalledTimes(2);
    expect(current.options.requestController).toHaveBeenCalledTimes(3);
    expect(current.options.requestTextFallback).toHaveBeenCalledOnce();
  });

  it('returns through Home and retries the text fallback when controller requests are no-ops', async () => {
    const current = runtimeHarness('UTSBCSquadSplitViewController');
    current.options.clickHome = vi.fn(() => {
      current.setController('UTHomeHubViewController');
      return true;
    });
    current.options.requestTextFallback = vi.fn(() => {
      current.setController('UTUnassignedItemsSplitViewController');
      return true;
    });

    const result = await recoverRuntimeUnassignedNavigation(current.options);

    expect(result).toMatchObject({ requested: true, confirmed: true });
    expect(result.steps.map((step) => step.id)).toEqual([
      'controller',
      'home',
      'controller-after-home',
      'text-fallback-after-home',
    ]);
  });

  it('reports an unconfirmed recovery when every request is a no-op', async () => {
    const current = runtimeHarness('UTHomeHubViewController');
    current.options.clickHome = vi.fn(() => true);
    current.options.requestTextFallback = vi.fn(() => true);

    const result = await recoverRuntimeUnassignedNavigation(current.options);

    expect(result).toMatchObject({
      requested: true,
      confirmed: false,
      from: 'UTHomeHubViewController',
      to: 'UTHomeHubViewController',
    });
  });
});
