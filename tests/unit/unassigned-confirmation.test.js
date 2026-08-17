import { describe, expect, it, vi } from 'vitest';
import { confirmUnassignedView } from '../../src/unassigned/confirmation.js';

function harness(overrides = {}) {
  const calls = [];
  const logs = [];
  const options = {
    reason: 'Daily Rare end',
    openUnassigned: vi.fn(() => true),
    clickFallback: vi.fn(() => calls.push('fallback')),
    waitLoadingEnd: vi.fn(async () => calls.push('wait')),
    refreshUnassigned: vi.fn(async () => calls.push('refresh')),
    getItems: vi.fn(() => []),
    log: (message) => logs.push(message),
    ...overrides,
  };
  return { calls, logs, options };
}

describe('Unassigned view confirmation', () => {
  it('opens, waits, refreshes, and reports an empty Unassigned pile', async () => {
    const current = harness();
    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(current.options.openUnassigned).toHaveBeenCalledOnce();
    expect(current.options.clickFallback).not.toHaveBeenCalled();
    expect(current.calls).toEqual(['wait', 'refresh']);
    expect(current.logs).toEqual([
      'Opening unassigned items view for confirmation: Daily Rare end',
      'Unassigned confirmation (Daily Rare end): empty after 1 stable read(s)',
    ]);
  });

  it('requires consecutive empty reads when pack recovery requests stable confirmation', async () => {
    const snapshots = [[], [], []];
    const current = harness({
      stableEmptyReads: 3,
      emptyReadDelayMs: 250,
      sleep: vi.fn(async (ms) => current.calls.push(`sleep:${ms}`)),
      getItems: vi.fn(() => snapshots.shift() || []),
    });
    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(current.options.refreshUnassigned).toHaveBeenCalledTimes(3);
    expect(current.options.sleep).toHaveBeenCalledTimes(2);
  });

  it('returns a delayed Unassigned item instead of accepting the first empty cache read', async () => {
    const delayed = { id: 77 };
    const snapshots = [[], [delayed]];
    const current = harness({
      stableEmptyReads: 2,
      sleep: vi.fn(async () => {}),
      getItems: vi.fn(() => snapshots.shift() || []),
    });
    await expect(confirmUnassignedView(current.options)).resolves.toEqual([delayed]);
    expect(current.logs.at(-1)).toContain('1 item(s) still present');
  });

  it('uses the text-button fallback and returns remaining items', async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const current = harness({
      openUnassigned: vi.fn(() => false),
      getItems: vi.fn(() => items),
    });
    await expect(confirmUnassignedView(current.options)).resolves.toBe(items);
    expect(current.options.clickFallback).toHaveBeenCalledOnce();
    expect(current.logs.at(-1)).toBe('Unassigned confirmation (Daily Rare end): 2 item(s) still present');
  });

  it('reports navigation, controller transition, and refresh state in diagnostic mode', async () => {
    const current = harness({
      diagnostic: true,
      getControllerName: vi.fn()
        .mockReturnValueOnce('UTStorePackViewController')
        .mockReturnValue('UTUnassignedItemsSplitViewController'),
      refreshUnassigned: vi.fn(async () => ({ success: true })),
    });

    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(current.logs).toContain('Unassigned navigation (Daily Rare end): method:controller; controller:UTStorePackViewController->UTUnassignedItemsSplitViewController');
    expect(current.logs).toContain('Unassigned read (Daily Rare end) 1/1: items:0; refresh:success; controller:UTUnassignedItemsSplitViewController');
  });

  it('rejects an empty read when navigation and the text fallback leave the controller on the pack view', async () => {
    const recoverNavigation = vi.fn(() => ({
      requested: true,
      confirmed: false,
      steps: [{
        id: 'materialize-store-pack',
        requested: true,
        confirmed: false,
        before: 'UTStorePackViewController',
        after: 'UTStorePackViewController',
        error: null,
      }],
    }));
    const current = harness({
      diagnostic: true,
      verifyNavigation: true,
      getControllerName: vi.fn(() => 'UTStorePackViewController'),
      clickFallback: vi.fn(() => false),
      recoverNavigation,
      navigationRetryAttempts: 2,
      navigationRetryDelayMs: 250,
      sleep: vi.fn(async () => {}),
    });

    await expect(confirmUnassignedView(current.options)).rejects.toMatchObject({
      code: 'UNASSIGNED_NAVIGATION_NOT_CONFIRMED',
      navigation: {
        status: 'blocked',
        attempts: [
          expect.objectContaining({ id: 'controller', requested: true, confirmed: false }),
          expect.objectContaining({ id: 'text-fallback', requested: false, confirmed: false }),
          expect.objectContaining({ id: 'controller-recovery', requested: true, confirmed: false }),
        ],
      },
    });
    expect(current.options.clickFallback).toHaveBeenCalledOnce();
    expect(current.options.refreshUnassigned).not.toHaveBeenCalled();
    expect(current.logs).toContain(
      'Unassigned recovery steps (Daily Rare end): materialize-store-pack:requested:UTStorePackViewController->UTStorePackViewController:not-confirmed',
    );
  });

  it('requires confirmed navigation even when diagnostic logging is disabled', async () => {
    const current = harness({
      diagnostic: false,
      requireNavigation: true,
      getControllerName: vi.fn(() => 'UTStorePackViewController'),
      clickFallback: vi.fn(() => false),
      navigationRetryAttempts: 1,
      navigationRetryDelayMs: 0,
      sleep: vi.fn(async () => {}),
      stableEmptyReads: 3,
    });

    await expect(confirmUnassignedView(current.options)).rejects.toMatchObject({
      code: 'UNASSIGNED_NAVIGATION_NOT_CONFIRMED',
    });
    expect(current.options.refreshUnassigned).not.toHaveBeenCalled();
    expect(current.logs.some((message) => message.startsWith('Unassigned navigation ('))).toBe(false);
  });

  it('accepts a delayed controller transition before reading the Unassigned pile', async () => {
    let controller = 'UTStorePackViewController';
    const current = harness({
      diagnostic: true,
      verifyNavigation: true,
      getControllerName: vi.fn(() => controller),
      clickFallback: vi.fn(() => false),
      navigationRetryAttempts: 2,
      navigationRetryDelayMs: 250,
      sleep: vi.fn(async () => { controller = 'UTUnassignedItemsSplitViewController'; }),
    });

    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(current.options.sleep).toHaveBeenCalledWith(250);
    expect(current.options.refreshUnassigned).toHaveBeenCalledOnce();
    expect(current.logs).toContain('Unassigned navigation (Daily Rare end): method:controller+delayed; controller:UTStorePackViewController->UTUnassignedItemsSplitViewController');
  });

  it('uses controller recovery after the pack view cannot expose an Unassigned button', async () => {
    let controller = 'UTStorePackViewController';
    const recoverNavigation = vi.fn(async () => {
      controller = 'UTUnassignedItemsSplitViewController';
      return true;
    });
    const current = harness({
      diagnostic: true,
      verifyNavigation: true,
      getControllerName: vi.fn(() => controller),
      clickFallback: vi.fn(() => false),
      navigationRetryAttempts: 1,
      navigationRetryDelayMs: 0,
      recoverNavigation,
      sleep: vi.fn(async () => {}),
    });

    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(recoverNavigation).toHaveBeenCalledOnce();
    expect(current.options.refreshUnassigned).toHaveBeenCalledOnce();
    expect(current.logs).toContain('Unassigned navigation (Daily Rare end): method:controller+controller-recovery; controller:UTStorePackViewController->UTUnassignedItemsSplitViewController');
  });

  it('uses the Unassigned text fallback when controller navigation remains on Home', async () => {
    let controller = 'UTHomeHubViewController';
    const clickFallback = vi.fn(() => {
      controller = 'UTUnassignedItemsSplitViewController';
      return true;
    });
    const current = harness({
      diagnostic: true,
      verifyNavigation: true,
      getControllerName: vi.fn(() => controller),
      clickFallback,
      navigationRetryAttempts: 1,
      navigationRetryDelayMs: 0,
      sleep: vi.fn(async () => {}),
    });

    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(clickFallback).toHaveBeenCalledOnce();
    expect(current.logs).toContain('Unassigned navigation (Daily Rare end): method:controller+text-fallback; controller:UTHomeHubViewController->UTUnassignedItemsSplitViewController');
  });

  it('waits through a Store Hub intermediate controller before confirming Unassigned', async () => {
    let controller = 'UTStorePackViewController';
    let recovered = false;
    const recoverNavigation = vi.fn(async () => {
      controller = 'UTStoreHubViewController';
      recovered = true;
      return true;
    });
    const current = harness({
      diagnostic: true,
      verifyNavigation: true,
      getControllerName: vi.fn(() => controller),
      clickFallback: vi.fn(() => false),
      navigationRetryAttempts: 1,
      navigationRetryDelayMs: 0,
      recoverNavigation,
      sleep: vi.fn(async () => {
        if (recovered) controller = 'UTUnassignedItemsSplitViewController';
      }),
    });

    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(recoverNavigation).toHaveBeenCalledOnce();
    expect(current.logs).toContain('Unassigned navigation (Daily Rare end): method:controller+controller-recovery+delayed; controller:UTStorePackViewController->UTUnassignedItemsSplitViewController');
  });

  it('logs navigation errors but still waits and refreshes the inventory', async () => {
    const current = harness({
      openUnassigned: vi.fn(() => { throw new Error('controller unavailable'); }),
    });
    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(current.calls).toEqual(['fallback', 'wait', 'refresh']);
    expect(current.logs).toContain('Could not open unassigned view automatically: controller unavailable');
  });
});
