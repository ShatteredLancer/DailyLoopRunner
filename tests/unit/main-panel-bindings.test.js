import { describe, expect, it, vi } from 'vitest';
import { bindMainPanelCommands, hydrateMainPanelOptions } from '../../src/ui/main-panel-bindings.js';

const IDS = [
  'bronze-loop-select',
  'bronze-loop-json',
  'bronze-loop-edit',
  'bronze-loop-pick-protect-high-gold',
  'bronze-loop-pick-auto-below-90',
  'bronze-loop-pick-prefer-scanned',
  'bronze-loop-pick-high-gold-threshold',
  'bronze-loop-pick-auto-threshold',
  'bronze-loop-show-mvp',
  'bronze-loop-start',
  'bronze-loop-recap-reopen',
  'bronze-loop-refresh',
  'bronze-loop-scan-picks',
  'bronze-loop-load-json',
  'bronze-loop-built-in',
  'bronze-loop-stop',
  'bronze-loop-copy',
  'bronze-loop-clear',
  'bronze-loop-download',
];

function classList() {
  const values = new Set();
  return {
    contains: (name) => values.has(name),
    toggle(name) {
      if (values.has(name)) {
        values.delete(name);
        return false;
      }
      values.add(name);
      return true;
    },
  };
}

function control(id) {
  const listeners = new Map();
  return {
    id,
    value: '',
    classList: classList(),
    addEventListener(type, callback) { listeners.set(type, callback); },
    emit(type, event = {}) {
      const payload = { target: controlElement, ...event };
      return listeners.get(type)?.(payload);
    },
  };
  function controlElement() {}
}

function harness() {
  const controls = new Map(IDS.map((id) => [id, control(id)]));
  // The emitted target must be the actual control, not a placeholder function.
  controls.forEach((item) => {
    item.emit = function emit(type, event = {}) {
      return item._listeners?.get(type)?.({ target: item, ...event });
    };
    const listeners = new Map();
    item._listeners = listeners;
    item.addEventListener = (type, callback) => listeners.set(type, callback);
  });
  return {
    controls,
    panel: { querySelector: (selector) => controls.get(selector.replace(/^#/, '')) || null },
  };
}

describe('main panel bindings', () => {
  it('binds every command control and forwards the selected loop id', () => {
    const { panel, controls } = harness();
    const commands = Object.fromEntries([
      'selectLoop', 'editJson', 'jsonInput', 'savePickOptions', 'saveLoopOptions', 'start', 'reopenRecap',
      'refresh', 'scanPicks', 'loadJson', 'useBuiltIn', 'stop', 'copyLog', 'clearLog', 'downloadLog',
    ].map((name) => [name, vi.fn()]));
    bindMainPanelCommands({ panel, commands });

    controls.get('bronze-loop-select').value = 'daily-routine';
    controls.get('bronze-loop-select').emit('change');
    expect(commands.selectLoop).toHaveBeenCalledWith('daily-routine', expect.any(Object));

    for (const [id, event, command] of [
      ['bronze-loop-json', 'input', 'jsonInput'],
      ['bronze-loop-show-mvp', 'change', 'saveLoopOptions'],
      ['bronze-loop-start', 'click', 'start'],
      ['bronze-loop-recap-reopen', 'click', 'reopenRecap'],
      ['bronze-loop-refresh', 'click', 'refresh'],
      ['bronze-loop-scan-picks', 'click', 'scanPicks'],
      ['bronze-loop-load-json', 'click', 'loadJson'],
      ['bronze-loop-built-in', 'click', 'useBuiltIn'],
      ['bronze-loop-stop', 'click', 'stop'],
      ['bronze-loop-copy', 'click', 'copyLog'],
      ['bronze-loop-clear', 'click', 'clearLog'],
      ['bronze-loop-download', 'click', 'downloadLog'],
    ]) {
      controls.get(id).emit(event);
      expect(commands[command], id).toHaveBeenCalled();
    }
    controls.get('bronze-loop-pick-protect-high-gold').emit('change');
    controls.get('bronze-loop-pick-auto-threshold').emit('change');
    expect(commands.savePickOptions).toHaveBeenCalledTimes(2);
  });

  it('owns Edit JSON visibility and switches the selector to custom', () => {
    const { panel, controls } = harness();
    const editJson = vi.fn();
    bindMainPanelCommands({ panel, commands: { editJson } });
    controls.get('bronze-loop-select').value = 'daily-routine';

    controls.get('bronze-loop-edit').emit('click');
    expect(controls.get('bronze-loop-json').classList.contains('show')).toBe(true);
    expect(controls.get('bronze-loop-select').value).toBe('custom');
    expect(editJson).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));

    controls.get('bronze-loop-edit').emit('click');
    expect(controls.get('bronze-loop-json').classList.contains('show')).toBe(false);
    expect(editJson).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
  });

  it('fails fast when a required template control is missing', () => {
    expect(() => bindMainPanelCommands({
      panel: { querySelector: () => null },
      commands: {},
    })).toThrow(/control is missing/);
  });

  it('hydrates saved MVP and Player Pick options', () => {
    const { panel, controls } = harness();
    hydrateMainPanelOptions({
      panel,
      loopOptions: { showMvpLoops: true },
      pickOptions: {
        protectHighGold: true,
        autoSelectBelow90: false,
        preferScannedMetadata: true,
        highGoldThreshold: 83,
        autoPickThreshold: 91,
      },
    });
    expect(controls.get('bronze-loop-show-mvp').checked).toBe(true);
    expect(controls.get('bronze-loop-pick-protect-high-gold').checked).toBe(true);
    expect(controls.get('bronze-loop-pick-auto-below-90').checked).toBe(false);
    expect(controls.get('bronze-loop-pick-prefer-scanned').checked).toBe(true);
    expect(controls.get('bronze-loop-pick-high-gold-threshold').value).toBe(83);
    expect(controls.get('bronze-loop-pick-auto-threshold').value).toBe(91);
  });
});
