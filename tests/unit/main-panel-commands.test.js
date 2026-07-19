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
    loopConfigUrl: 'http://127.0.0.1/loops.json',
    refreshInventoryCaches: vi.fn(async () => {}),
    scanPlayerPicks: vi.fn(async () => {}),
    loadLoopConfig: vi.fn(async () => {}),
    resetLoopDefs: vi.fn(),
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

  it('loads external config with the existing logs and restores loading state on failure', async () => {
    const success = harness();
    await expect(success.commands.loadJson()).resolves.toBe(true);
    expect(success.log).toHaveBeenCalledWith('Loading loop definitions from http://127.0.0.1/loops.json');
    expect(success.options.loadLoopConfig).toHaveBeenCalledWith('http://127.0.0.1/loops.json');
    expect(success.state.loadingLoops).toBe(false);

    const failure = harness({ loadLoopConfig: vi.fn(async () => { throw new Error('bad json'); }) });
    await expect(failure.commands.loadJson()).resolves.toBe(false);
    expect(failure.log).toHaveBeenCalledWith('Loop JSON load failed: bad json');
    expect(failure.state.loadingLoops).toBe(false);
  });

  it('runs a read-only Player Pick scan and restores scan state on failure', async () => {
    const success = harness();
    await expect(success.commands.scanPicks()).resolves.toBe(true);
    expect(success.options.scanPlayerPicks).toHaveBeenCalledOnce();
    expect(success.state.scanningPicks).toBe(false);
    expect(success.setPanelState).toHaveBeenCalledTimes(2);

    const failure = harness({ scanPlayerPicks: vi.fn(async () => { throw new Error('metadata unavailable'); }) });
    await expect(failure.commands.scanPicks()).resolves.toBe(false);
    expect(failure.log).toHaveBeenCalledWith('Player Pick scan failed: metadata unavailable');
    expect(failure.state.scanningPicks).toBe(false);

    failure.state.running = true;
    await expect(failure.commands.scanPicks()).resolves.toBe(false);
    expect(failure.options.scanPlayerPicks).toHaveBeenCalledOnce();
  });

  it('preserves built-in, Stop, copy, and download command effects', async () => {
    const current = harness();
    expect(current.commands.useBuiltIn()).toBe(true);
    expect(current.options.resetLoopDefs).toHaveBeenCalledOnce();

    current.commands.stop();
    expect(current.state.stopping).toBe(true);
    expect(current.log).toHaveBeenCalledWith('Stop requested; waiting for current safe point');

    await current.commands.copyLog();
    expect(current.userEffects.copyText).toHaveBeenCalledWith('line 1\nline 2');
    current.commands.downloadLog();
    expect(current.userEffects.downloadText).toHaveBeenCalledWith('line 1\nline 2', 'bronze-loop-123.log');
  });

  it('updates the selected loop without duplicating JSON editor behavior', () => {
    const setLoopJson = vi.fn();
    const updateLoopControls = vi.fn();
    const loop = { id: 'daily' };
    const current = harness({
      getLoopDefById: () => loop,
      setLoopJson,
      updateLoopControls,
    });
    current.commands.selectLoop('daily');
    expect(setLoopJson).toHaveBeenCalledWith(loop);
    current.commands.selectLoop('custom');
    expect(setLoopJson).toHaveBeenCalledOnce();
    expect(updateLoopControls).toHaveBeenCalledTimes(2);
  });

  it('does not start or overlap panel operations while another operation is active', async () => {
    const start = vi.fn();
    const openBatch = vi.fn();
    const current = harness({ start, openBatch });
    current.state.scanningPicks = true;
    expect(current.commands.start()).toBe(false);
    expect(current.commands.openBatch()).toBe(false);
    await expect(current.commands.refresh()).resolves.toBe(false);
    await expect(current.commands.loadJson()).resolves.toBe(false);
    expect(current.commands.useBuiltIn()).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(openBatch).not.toHaveBeenCalled();

    current.state.scanningPicks = false;
    expect(current.commands.start()).toBe(true);
    expect(start).toHaveBeenCalledOnce();
    expect(current.commands.openBatch()).toBe(true);
    expect(openBatch).toHaveBeenCalledOnce();
  });

  it('rescans only when scanned Pick metadata is enabled', async () => {
    const savePickOptions = vi.fn();
    const current = harness({ savePickOptions });
    await current.commands.savePickOptions({ target: { id: 'bronze-loop-pick-auto-threshold', checked: true } });
    expect(savePickOptions).toHaveBeenCalledOnce();
    expect(current.options.scanPlayerPicks).not.toHaveBeenCalled();

    await current.commands.savePickOptions({ target: { id: 'bronze-loop-pick-prefer-scanned', checked: true } });
    expect(savePickOptions).toHaveBeenCalledTimes(2);
    expect(current.options.scanPlayerPicks).toHaveBeenCalledOnce();
  });
});
