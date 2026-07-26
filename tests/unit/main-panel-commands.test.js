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
    expect(success.setPanelState).toHaveBeenCalledTimes(2);

    const failure = harness({ scanPlayerPicks: vi.fn(async () => { throw new Error('metadata unavailable'); }) });
    await expect(failure.commands.scanPicks()).resolves.toBe(false);
    expect(failure.log).toHaveBeenCalledWith('Dynamic SBC scan failed: metadata unavailable');
    expect(failure.state.scanningPicks).toBe(false);

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
    const current = harness({ updateLoopControls });
    current.commands.selectLoop('daily');
    expect(updateLoopControls).toHaveBeenCalledOnce();
  });

  it('opens the visual Builder with the busy guard', () => {
    const success = harness();
    expect(success.commands.openBuilder()).toBe(true);
    expect(success.options.openBuilder).toHaveBeenCalledWith('workflows');

    success.state.running = true;
    expect(success.commands.openBuilder()).toBe(false);
  });

  it('does not start or overlap panel operations while another operation is active', async () => {
    const start = vi.fn();
    const openBatch = vi.fn();
    const current = harness({ start, openBatch });
    current.state.scanningPicks = true;
    expect(current.commands.start()).toBe(false);
    expect(current.commands.openBatch()).toBe(false);
    await expect(current.commands.refresh()).resolves.toBe(false);
    expect(current.commands.selectProfile('default')).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(openBatch).not.toHaveBeenCalled();

    current.state.scanningPicks = false;
    expect(current.commands.start()).toBe(true);
    expect(start).toHaveBeenCalledOnce();
    expect(current.commands.openBatch()).toBe(true);
    expect(openBatch).toHaveBeenCalledOnce();
  });

  it('saves Player Pick options without starting an SBC scan', () => {
    const savePickOptions = vi.fn();
    const current = harness({ savePickOptions });
    current.commands.savePickOptions({ target: { id: 'bronze-loop-pick-auto-threshold', checked: true } });
    expect(savePickOptions).toHaveBeenCalledOnce();
    expect(current.options.scanPlayerPicks).not.toHaveBeenCalled();
  });
});
