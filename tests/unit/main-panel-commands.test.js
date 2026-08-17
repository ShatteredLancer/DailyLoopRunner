import { describe, expect, it, vi } from 'vitest';
import { createMainPanelCommands } from '../../src/ui/main-panel-commands.js';

function harness(overrides = {}) {
  const state = { running: false, refreshing: false, scanningPicks: false, loadingLoops: false, stopping: false };
  const log = vi.fn();
  const setPanelState = vi.fn();
  const userEffects = { copyText: vi.fn(async () => true), downloadText: vi.fn(() => true) };
  const options = {
    state,
    log,
    setPanelState,
    userEffects,
    refreshInventoryCaches: vi.fn(async () => {}),
    scanPlayerPicks: vi.fn(async () => {}),
    openBuilder: vi.fn(),
    selectProfile: vi.fn(),
    renderProfiles: vi.fn(),
    getLogText: () => 'line 1\nline 2',
    now: () => 123,
    ...overrides,
  };
  return { commands: createMainPanelCommands(options), log, options, setPanelState, state, userEffects };
}

describe('main panel command orchestration', () => {
  it('guards refresh and always restores the runtime state', async () => {
    const success = harness();
    await expect(success.commands.refresh()).resolves.toBe(true);
    expect(success.options.refreshInventoryCaches).toHaveBeenCalledWith('manual button');
    expect(success.state.refreshing).toBe(false);
    expect(success.setPanelState).toHaveBeenCalledTimes(2);

    const failure = harness({ refreshInventoryCaches: vi.fn(async () => { throw new Error('offline'); }) });
    await expect(failure.commands.refresh()).resolves.toBe(false);
    expect(failure.log).toHaveBeenCalledWith('Cache refresh failed: offline');
    expect(failure.state.refreshing).toBe(false);

    failure.state.running = true;
    await expect(failure.commands.refresh()).resolves.toBe(false);
    expect(failure.options.refreshInventoryCaches).toHaveBeenCalledOnce();
  });

  it('runs a read-only Player Pick scan and restores scan state on failure', async () => {
    const success = harness();
    await expect(success.commands.scanPicks()).resolves.toBe(true);
    expect(success.options.scanPlayerPicks).toHaveBeenCalledOnce();
    expect(success.state.scanningPicks).toBe(false);
    expect(success.state.dynamicSbcScanProgress).toBeNull();
    expect(success.setPanelState).toHaveBeenCalledTimes(2);

    const failure = harness({ scanPlayerPicks: vi.fn(async () => { throw new Error('metadata unavailable'); }) });
    await expect(failure.commands.scanPicks()).resolves.toBe(false);
    expect(failure.log).toHaveBeenCalledWith('Dynamic SBC scan failed: metadata unavailable');
    expect(failure.state.scanningPicks).toBe(false);
    expect(failure.state.dynamicSbcScanProgress).toBeNull();

    failure.state.running = true;
    await expect(failure.commands.scanPicks()).resolves.toBe(false);
    expect(failure.options.scanPlayerPicks).toHaveBeenCalledOnce();
  });

  it('switches saved profiles and restores the selector after success or failure', () => {
    const success = harness();
    expect(success.commands.selectProfile('starter-bronze-silver-inventory-only')).toBe(true);
    expect(success.options.selectProfile).toHaveBeenCalledWith('starter-bronze-silver-inventory-only');
    expect(success.options.renderProfiles).toHaveBeenCalledOnce();
    expect(success.setPanelState).toHaveBeenCalledOnce();

    const failure = harness({ selectProfile: vi.fn(() => { throw new Error('dynamic Pick unavailable'); }) });
    expect(failure.commands.selectProfile('custom')).toBe(false);
    expect(failure.log).toHaveBeenCalledWith('Profile switch failed: dynamic Pick unavailable');
    expect(failure.options.renderProfiles).toHaveBeenCalledOnce();
  });

  it('passes the selected Dynamic SBC scan mode and resets it after the scan', async () => {
    const scanDynamicSbcs = vi.fn(async () => {});
    const resetDynamicSbcScanMode = vi.fn();
    const current = harness({
      scanDynamicSbcs,
      getDynamicSbcScanOptions: () => ({ forceFull: true, clearCache: true }),
      resetDynamicSbcScanMode,
    });
    await expect(current.commands.scanPicks()).resolves.toBe(true);
    expect(scanDynamicSbcs).toHaveBeenCalledWith({ forceFull: true, clearCache: true });
    expect(resetDynamicSbcScanMode).toHaveBeenCalledOnce();
  });

  it('automatically retries only unresolved Dynamic SBC metadata', async () => {
    const scanDynamicSbcs = vi.fn()
      .mockResolvedValueOnce({ stats: { loadFailures: 4, circuitBreakers: 1 } })
      .mockResolvedValueOnce({ stats: { loadFailures: 1, circuitBreakers: 0 } })
      .mockResolvedValueOnce({ stats: { loadFailures: 0, circuitBreakers: 0 } });
    const wait = vi.fn(async () => {});
    const current = harness({
      scanDynamicSbcs,
      getDynamicSbcScanOptions: () => ({ forceFull: true, clearCache: true }),
      wait,
    });

    await expect(current.commands.scanPicks()).resolves.toBe(true);

    expect(scanDynamicSbcs).toHaveBeenNthCalledWith(1, { forceFull: true, clearCache: true });
    expect(scanDynamicSbcs).toHaveBeenNthCalledWith(2, { forceFull: false, clearCache: false });
    expect(scanDynamicSbcs).toHaveBeenNthCalledWith(3, { forceFull: false, clearCache: false });
    expect(wait).toHaveBeenNthCalledWith(1, 5000);
    expect(wait).toHaveBeenNthCalledWith(2, 3000);
    expect(current.log).toHaveBeenCalledWith(expect.stringContaining('retrying unresolved SBCs automatically'));
    expect(current.state.scanningPicks).toBe(false);
    expect(current.state.dynamicSbcScanProgress).toBeNull();
  });

  it('bounds automatic Dynamic SBC recovery at three passes', async () => {
    const scanDynamicSbcs = vi.fn(async () => ({
      stats: { loadFailures: 2, circuitBreakers: 0 },
    }));
    const wait = vi.fn(async () => {});
    const current = harness({ scanDynamicSbcs, wait });

    await expect(current.commands.scanPicks()).resolves.toBe(true);

    expect(scanDynamicSbcs).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(current.log).toHaveBeenCalledWith(
      'Dynamic SBC scan remains incomplete after 3 pass(es): 2 Challenge metadata load(s) unavailable',
    );
  });

  it('preserves Stop, copy, and download command effects', async () => {
    const current = harness();
    current.commands.stop();
    expect(current.state.stopping).toBe(true);
    expect(current.log).toHaveBeenCalledWith('Stop requested; waiting for current safe point');

    await current.commands.copyLog();
    expect(current.userEffects.copyText).toHaveBeenCalledWith('line 1\nline 2');
    current.commands.downloadLog();
    expect(current.userEffects.downloadText).toHaveBeenCalledWith('line 1\nline 2', 'bronze-loop-123.log');
  });

  it('updates controls when the selected loop changes', () => {
    const updateLoopControls = vi.fn();
    const setOpenRewardPacksEnabled = vi.fn();
    const current = harness({
      updateLoopControls,
      getLoopSelectionDefaults: (loopId) => ({ openRewardPacks: loopId === 'rolling' }),
      setOpenRewardPacksEnabled,
    });
    current.commands.selectLoop('daily');
    expect(updateLoopControls).toHaveBeenCalledOnce();
    expect(setOpenRewardPacksEnabled).not.toHaveBeenCalled();
    current.commands.selectLoop('rolling');
    expect(setOpenRewardPacksEnabled).toHaveBeenCalledOnce();
    expect(setOpenRewardPacksEnabled).toHaveBeenCalledWith(true);
    expect(updateLoopControls).toHaveBeenCalledTimes(2);
  });

  it('applies a manual responsive layout override', () => {
    const setLayoutMode = vi.fn();
    const current = harness({ setLayoutMode });
    expect(current.commands.setLayoutMode('mobile')).toBe(true);
    expect(setLayoutMode).toHaveBeenCalledWith('mobile');
    expect(current.setPanelState).toHaveBeenCalledOnce();
  });

  it('opens the visual Builder with the busy guard', () => {
    const success = harness();
    expect(success.commands.openBuilder()).toBe(true);
    expect(success.options.openBuilder).toHaveBeenCalledWith('workflows');

    success.state.running = true;
    expect(success.commands.openBuilder()).toBe(false);
  });

  it('opens help without blocking a running Loop', () => {
    const openHelp = vi.fn();
    const current = harness({ openHelp });
    current.state.running = true;
    expect(current.commands.openHelp('log')).toBe(true);
    expect(openHelp).toHaveBeenCalledWith('log');
  });

  it('does not start or overlap panel operations while another operation is active', async () => {
    const start = vi.fn();
    const openBatch = vi.fn();
    const openTrade = vi.fn();
    const current = harness({ start, openBatch, openTrade });
    current.state.scanningPicks = true;
    expect(current.commands.start()).toBe(false);
    expect(current.commands.openBatch()).toBe(false);
    expect(current.commands.openTrade()).toBe(false);
    await expect(current.commands.refresh()).resolves.toBe(false);
    expect(current.commands.selectProfile('default')).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(openBatch).not.toHaveBeenCalled();
    expect(openTrade).not.toHaveBeenCalled();

    current.state.scanningPicks = false;
    expect(current.commands.start()).toBe(true);
    expect(start).toHaveBeenCalledOnce();
    expect(current.commands.openBatch()).toBe(true);
    expect(openBatch).toHaveBeenCalledOnce();
    expect(current.commands.openTrade()).toBe(true);
    expect(openTrade).toHaveBeenCalledOnce();
  });

  it('opens Selection Policy settings without starting an SBC scan', () => {
    const openSelectionPolicySettings = vi.fn();
    const current = harness({ openSelectionPolicySettings });
    current.commands.openSelectionPolicySettings();
    expect(openSelectionPolicySettings).toHaveBeenCalledOnce();
    expect(current.options.scanPlayerPicks).not.toHaveBeenCalled();
  });
});
