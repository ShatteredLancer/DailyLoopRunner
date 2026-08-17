import { describe, expect, it, vi } from 'vitest';
import { navigateToUnassigned } from '../../src/unassigned/navigation.js';

function harness(overrides = {}) {
  let controller = overrides.initialController || 'UTHomeHubViewController';
  const setController = (name) => { controller = name; };
  const options = {
    verifyNavigation: true,
    getControllerName: () => controller,
    requestController: vi.fn(() => true),
    requestTextFallback: vi.fn(() => false),
    waitLoadingEnd: vi.fn(async () => {}),
    sleep: vi.fn(async () => {}),
    retryAttempts: 1,
    retryDelayMs: 0,
    ...overrides,
  };
  delete options.initialController;
  return { options, setController, getController: () => controller };
}

describe('Unassigned navigation state machine', () => {
  it('does not treat a truthy controller request as a confirmed transition', async () => {
    const recoverySteps = [{
      id: 'materialize-after-home',
      requested: true,
      confirmed: false,
      before: 'UTHomeHubViewController',
      after: 'UTHomeHubViewController',
      error: null,
    }];
    const current = harness({
      requestController: vi.fn(() => true),
      requestTextFallback: vi.fn(() => true),
      requestRecovery: vi.fn(() => ({ requested: true, confirmed: false, steps: recoverySteps })),
    });

    const result = await navigateToUnassigned(current.options);

    expect(result).toMatchObject({
      status: 'blocked',
      from: 'UTHomeHubViewController',
      to: 'UTHomeHubViewController',
      method: 'controller+text-fallback+controller-recovery',
    });
    expect(result.attempts).toEqual([
      expect.objectContaining({ id: 'controller', requested: true, confirmed: false }),
      expect.objectContaining({ id: 'text-fallback', requested: true, confirmed: false }),
      expect.objectContaining({
        id: 'controller-recovery',
        requested: true,
        confirmed: false,
        steps: recoverySteps,
      }),
    ]);
  });

  it('confirms a Home text fallback after a no-op controller request', async () => {
    const current = harness();
    current.options.requestTextFallback = vi.fn(() => {
      current.setController('UTUnassignedItemsSplitViewController');
      return true;
    });

    const result = await navigateToUnassigned(current.options);

    expect(result).toMatchObject({
      status: 'confirmed',
      method: 'controller+text-fallback',
      to: 'UTUnassignedItemsSplitViewController',
    });
  });

  it('confirms a delayed controller transition from observed state', async () => {
    const current = harness({ initialController: 'UTStorePackViewController' });
    current.options.sleep = vi.fn(async () => {
      current.setController('UTUnassignedItemsSplitViewController');
    });

    const result = await navigateToUnassigned(current.options);

    expect(result).toMatchObject({
      status: 'confirmed',
      method: 'controller+delayed',
      to: 'UTUnassignedItemsSplitViewController',
    });
    expect(current.options.requestTextFallback).not.toHaveBeenCalled();
  });

  it('handles consecutive cycles whose controller origins differ', async () => {
    const current = harness({ initialController: 'UTStorePackViewController' });
    current.options.requestController = vi.fn(() => {
      if (current.getController() === 'UTStorePackViewController') {
        current.setController('UTUnassignedItemsSplitViewController');
      }
      return true;
    });
    current.options.requestTextFallback = vi.fn(() => {
      current.setController('UTUnassignedItemsSplitViewController');
      return true;
    });

    const first = await navigateToUnassigned(current.options);
    current.setController('UTHomeHubViewController');
    const second = await navigateToUnassigned(current.options);

    expect(first).toMatchObject({ status: 'confirmed', method: 'controller' });
    expect(second).toMatchObject({ status: 'confirmed', method: 'controller+text-fallback' });
  });
});
