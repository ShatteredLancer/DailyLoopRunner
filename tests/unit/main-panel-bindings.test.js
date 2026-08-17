import { describe, expect, it, vi } from 'vitest';
import { bindMainPanelCommands, hydrateMainPanelOptions } from '../../src/ui/main-panel-bindings.js';

const IDS = [
  'bronze-loop-select',
  'bronze-loop-profile-select',
  'bronze-loop-layout-mode',
  'bronze-loop-open-builder',
  'bronze-loop-help-overview',
  'bronze-loop-help-run-options',
  'bronze-loop-help-config',
  'bronze-loop-help-log',
  'bronze-loop-selection-policy-settings',
  'bronze-loop-daily-inventory-only',
  'bronze-loop-reward-alert-enabled',
  'bronze-loop-reward-alert-settings',
  'bronze-loop-start',
  'bronze-loop-batch-open',
  'bronze-loop-trade',
  'bronze-loop-recap-reopen',
  'bronze-loop-refresh',
  'bronze-loop-scan-picks',
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
      'selectLoop', 'selectProfile', 'setLayoutMode', 'openBuilder', 'openHelp', 'openSelectionPolicySettings', 'saveLoopOptions', 'start', 'openBatch', 'openTrade', 'reopenRecap',
      'refresh', 'scanPicks', 'stop', 'copyLog', 'clearLog', 'downloadLog',
      'saveRewardAlertEnabled', 'openRewardAlertSettings',
    ].map((name) => [name, vi.fn()]));
    bindMainPanelCommands({ panel, commands });

    controls.get('bronze-loop-select').value = 'daily-routine';
    controls.get('bronze-loop-select').emit('change');
    expect(commands.selectLoop).toHaveBeenCalledWith('daily-routine', expect.any(Object));
    controls.get('bronze-loop-profile-select').value = 'inventory-only';
    controls.get('bronze-loop-profile-select').emit('change');
    expect(commands.selectProfile).toHaveBeenCalledWith('inventory-only', expect.any(Object));
    controls.get('bronze-loop-layout-mode').value = 'mobile';
    controls.get('bronze-loop-layout-mode').emit('change');
    expect(commands.setLayoutMode).toHaveBeenCalledWith('mobile', expect.any(Object));

    for (const [id, event, command] of [
      ['bronze-loop-open-builder', 'click', 'openBuilder'],
      ['bronze-loop-daily-inventory-only', 'change', 'saveLoopOptions'],
      ['bronze-loop-selection-policy-settings', 'click', 'openSelectionPolicySettings'],
      ['bronze-loop-reward-alert-enabled', 'change', 'saveRewardAlertEnabled'],
      ['bronze-loop-reward-alert-settings', 'click', 'openRewardAlertSettings'],
      ['bronze-loop-start', 'click', 'start'],
      ['bronze-loop-batch-open', 'click', 'openBatch'],
      ['bronze-loop-trade', 'click', 'openTrade'],
      ['bronze-loop-recap-reopen', 'click', 'reopenRecap'],
      ['bronze-loop-refresh', 'click', 'refresh'],
      ['bronze-loop-scan-picks', 'click', 'scanPicks'],
      ['bronze-loop-stop', 'click', 'stop'],
      ['bronze-loop-copy', 'click', 'copyLog'],
      ['bronze-loop-clear', 'click', 'clearLog'],
      ['bronze-loop-download', 'click', 'downloadLog'],
    ]) {
      controls.get(id).emit(event);
      expect(commands[command], id).toHaveBeenCalled();
    }
    for (const [id, topic] of [
      ['bronze-loop-help-overview', 'overview'],
      ['bronze-loop-help-run-options', 'run-options'],
      ['bronze-loop-help-config', 'config'],
      ['bronze-loop-help-log', 'log'],
    ]) {
      controls.get(id).emit('click');
      expect(commands.openHelp).toHaveBeenCalledWith(topic, expect.any(Object));
    }
  });

  it('fails fast when a required template control is missing', () => {
    expect(() => bindMainPanelCommands({
      panel: { querySelector: () => null },
      commands: {},
    })).toThrow(/control is missing/);
  });

  it('hydrates the remaining inline options', () => {
    const { panel, controls } = harness();
    hydrateMainPanelOptions({
      panel,
      loopOptions: { dailyRecycleInventoryOnly: true },
      rewardAlertSettings: { enabled: true },
      layoutMode: 'mobile',
    });
    expect(controls.get('bronze-loop-daily-inventory-only').checked).toBe(true);
    expect(controls.get('bronze-loop-reward-alert-enabled').checked).toBe(true);
    expect(controls.get('bronze-loop-layout-mode').value).toBe('mobile');
  });
});
