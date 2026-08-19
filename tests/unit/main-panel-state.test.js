import { describe, expect, it } from 'vitest';
import {
  renderMainPanelLoopOptions,
  renderMainPanelProfileOptions,
  renderMainPanelRecap,
  renderMainPanelRounds,
  renderMainPanelRuntimeState,
  renderMainPanelScanProgress,
  renderRewardAlertSummary,
  renderSelectionPolicySummary,
} from '../../src/ui/main-panel-state.js';

function element(id) {
  return { id, style: {}, disabled: false, textContent: '', value: '', title: '', dataset: {} };
}

function harness(ids = []) {
  const controls = new Map(ids.map((id) => [id, element(id)]));
  const classes = new Set();
  return {
    controls,
    panel: {
      dataset: {},
      classList: {
        contains: (value) => classes.has(value),
        toggle(value, force) {
          if (force === true) classes.add(value);
          else if (force === false) classes.delete(value);
          else if (classes.has(value)) classes.delete(value);
          else classes.add(value);
        },
      },
      querySelector: (selector) => controls.get(selector.replace(/^#/, '')) || null,
    },
  };
}

describe('main panel state rendering', () => {
  it('renders loop options, preserves a valid selection, and falls back to the first loop', () => {
    const { panel, controls } = harness(['bronze-loop-select']);
    const select = controls.get('bronze-loop-select');
    select.children = [];
    select.appendChild = (option) => select.children.push(option);
    Object.defineProperty(select, 'options', { get: () => select.children });
    const createOption = () => element('option');
    const loops = [{ id: 'daily', name: 'Daily' }, { id: 'provision', name: 'Provision' }];

    expect(renderMainPanelLoopOptions({ panel, loops, selectedId: 'provision', createOption })).toBe('provision');
    expect(select.children.map((option) => option.value)).toEqual(['daily', 'provision']);
    expect(select.children.map((option) => option.textContent)).toEqual(['Daily', 'Provision']);

    expect(renderMainPanelLoopOptions({ panel, loops, selectedId: 'missing', createOption })).toBe('daily');
    expect(select.value).toBe('daily');
  });

  it('shows or hides the rounds row, label, and input together', () => {
    const { panel, controls } = harness([
      'bronze-loop-rounds-row', 'bronze-loop-rounds-label', 'bronze-loop-rounds',
    ]);
    renderMainPanelRounds({ panel, show: false });
    controls.forEach((control) => expect(control.style.display).toBe('none'));
    renderMainPanelRounds({ panel, show: true });
    controls.forEach((control) => expect(control.style.display).toBe(''));
    renderMainPanelRounds({
      panel,
      show: true,
      quantityKey: 'provision:rounds',
      quantity: { label: 'Provision packs', default: 4, min: 2, max: 20 },
    });
    expect(controls.get('bronze-loop-rounds-label').textContent).toBe('Provision packs');
    expect(controls.get('bronze-loop-rounds')).toMatchObject({ value: '4', min: '2', max: '20' });
    renderMainPanelRounds({
      panel,
      show: true,
      quantityKey: 'rolling:maxCompletions',
      quantity: { label: 'SBC completions', default: 0, min: 0, max: 1000 },
    });
    expect(controls.get('bronze-loop-rounds')).toMatchObject({ value: '0', min: '0', max: '1000' });
  });

  it('renders recap availability and summary title', () => {
    const { panel, controls } = harness(['bronze-loop-recap-reopen']);
    const button = controls.get('bronze-loop-recap-reopen');
    renderMainPanelRecap({ panel, recap: null });
    expect(button.style.display).toBe('none');
    renderMainPanelRecap({ panel, recap: { name: '84+ Pick', totalCards: 5 } });
    expect(button.style.display).toBe('');
    expect(button.title).toBe('Last Player Pick recap: 84+ Pick (5 card(s))');
    renderMainPanelRecap({ panel, recap: { type: 'batch', name: 'Batch Open', totalCards: 20 } });
    expect(button.title).toBe('Last Batch Open recap: Batch Open (20 card(s))');
    renderMainPanelRecap({ panel, recap: { type: 'loop', name: 'Daily Rare', totalCards: 3 } });
    expect(button.title).toBe('Last Loop recap: Daily Rare (3 card(s))');
  });

  it('renders built-in, starter, and user profiles with the active selection', () => {
    const { panel, controls } = harness(['bronze-loop-profile-select']);
    const select = controls.get('bronze-loop-profile-select');
    select.children = [];
    select.appendChild = (option) => select.children.push(option);
    Object.defineProperty(select, 'options', { get: () => select.children });
    const profiles = [
      { id: '__built-in__', name: 'Built-in' },
      { id: 'default', name: 'Default' },
      { id: 'starter-bronze-silver-inventory-only', name: 'Bronze/Silver Inventory Only' },
      { id: 'custom', name: 'Custom' },
    ];
    expect(renderMainPanelProfileOptions({
      panel,
      profiles,
      selectedId: 'custom',
      createOption: () => element('option'),
    })).toBe('custom');
    expect(select.children.map((option) => option.textContent)).toEqual([
      'Built-in', 'Default', 'Bronze/Silver Inventory Only', 'Custom',
    ]);
  });

  it('renders the compact reward alert summary', () => {
    const { panel, controls } = harness(['bronze-loop-reward-alert-summary', 'bronze-loop-reward-alert-enabled']);
    renderRewardAlertSummary({
      panel,
      settings: { enabled: true, minimumRating: 94, highlightEnabled: true, desktopEnabled: true, ntfyEnabled: false },
    });
    expect(controls.get('bronze-loop-reward-alert-enabled').checked).toBe(true);
    expect(controls.get('bronze-loop-reward-alert-summary').textContent).toBe('94+ special | highlight | desktop');
    renderRewardAlertSummary({ panel, settings: { enabled: false } });
    expect(controls.get('bronze-loop-reward-alert-summary').textContent).toBe('Off');
  });

  it('renders a scoped selection policy summary', () => {
    const { panel, controls } = harness(['bronze-loop-selection-policy-summary']);
    renderSelectionPolicySummary({
      panel,
      sbcFodderOptions: { lowRatedGoldMaxRating: 82, ratingSbcMaxCardRating: 88 },
      pickOptions: { protectionRating: 90, autoSelectBelow90: true },
    });
    expect(controls.get('bronze-loop-selection-policy-summary').textContent)
      .toBe('Std card <=88 | Auto-use <=90 | Picks Auto');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Non-rating Gold <=82');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Storage pressure SBC off');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Provisions reserve 87-88');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('shortage Provisions batch 2');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('surplus Provisions/TOTW off');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Provisions shortage recovery off');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Required Special/TOTW recovery off');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Club non-TOTW specials fallback allowed');
    renderSelectionPolicySummary({
      panel,
      sbcFodderOptions: { ratingSbcMaxCardRating: 87 },
      pickOptions: {
        protectionRating: 94,
        autoSelectBelow90: false,
        rollingStorageSinkEnabled: true,
        rollingSurplusCraftingEnabled: true,
        rollingProvisionsShortageRecoveryEnabled: true,
        rollingRequiredSpecialRecoveryEnabled: true,
        rollingProtectAllClubNonTotwSpecials: true,
        rollingProvisionsMaxRating: 89,
        rollingOpenDuplicateProvisionsRewards: true,
        rollingShortageProvisionsPackLimit: 5,
      },
    });
    expect(controls.get('bronze-loop-selection-policy-summary').textContent)
      .toBe('Std card <=87 | Auto-use <=94 | Picks Review');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Storage pressure SBC automatic');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('duplicate Provisions rewards immediate');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('shortage Provisions batch 5');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('surplus Provisions/TOTW enabled');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Provisions shortage recovery allowed');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Required Special/TOTW recovery allowed');
    expect(controls.get('bronze-loop-selection-policy-summary').title)
      .toContain('Club non-TOTW specials protected');
  });

  it('renders indeterminate and determinate Dynamic SBC scan progress', () => {
    const { panel, controls } = harness([
      'bronze-loop-scan-progress',
      'bronze-loop-scan-progress-label',
      'bronze-loop-scan-progress-count',
      'bronze-loop-scan-progress-track',
      'bronze-loop-scan-progress-bar',
    ]);
    renderMainPanelScanProgress({
      panel,
      state: {
        scanningPicks: true,
        dynamicSbcScanProgress: { label: 'Refreshing SBC index', completed: 0, total: 0 },
      },
    });
    expect(controls.get('bronze-loop-scan-progress')).toMatchObject({
      style: { display: 'block' },
      dataset: { mode: 'indeterminate' },
    });
    expect(controls.get('bronze-loop-scan-progress-label').textContent).toBe('Refreshing SBC index');
    expect(controls.get('bronze-loop-scan-progress-count').textContent).toBe('');
    expect(controls.get('bronze-loop-scan-progress-bar').style.width).toBe('35%');

    renderMainPanelScanProgress({
      panel,
      state: {
        scanningPicks: true,
        dynamicSbcScanProgress: { label: 'Checking 85x10 Upgrade', completed: 3, total: 10 },
      },
    });
    expect(controls.get('bronze-loop-scan-progress').dataset.mode).toBe('determinate');
    expect(controls.get('bronze-loop-scan-progress-count').textContent).toBe('3 / 10');
    expect(controls.get('bronze-loop-scan-progress-bar').style.width).toBe('30%');

    renderMainPanelScanProgress({ panel, state: { scanningPicks: false } });
    expect(controls.get('bronze-loop-scan-progress').style.display).toBe('none');
  });

  it('applies the complete runtime disabled-state matrix', () => {
    const ids = [
      'bronze-loop-start', 'bronze-loop-stop', 'bronze-loop-batch-open', 'bronze-loop-trade', 'bronze-loop-select',
      'bronze-loop-profile-select', 'bronze-loop-open-builder',
      'bronze-loop-refresh', 'bronze-loop-scan-mode', 'bronze-loop-scan-picks',
      'bronze-loop-open-rewards', 'bronze-loop-selection-policy-settings',
      'bronze-loop-daily-inventory-only',
      'bronze-loop-rounds',
      'bronze-loop-reward-alert-enabled', 'bronze-loop-reward-alert-settings',
    ];
    const { panel, controls } = harness(ids);
    renderMainPanelRuntimeState({
      panel,
      state: { running: false, refreshing: true, scanningPicks: true, loadingLoops: true, usingBuiltIn: true },
    });
    expect(controls.get('bronze-loop-start').disabled).toBe(true);
    expect(controls.get('bronze-loop-stop').disabled).toBe(true);
    expect(controls.get('bronze-loop-refresh').disabled).toBe(true);
    expect(controls.get('bronze-loop-scan-picks').disabled).toBe(true);
    expect(controls.get('bronze-loop-scan-mode').disabled).toBe(true);
    expect(controls.get('bronze-loop-profile-select').disabled).toBe(true);
    expect(controls.get('bronze-loop-select').disabled).toBe(true);

    renderMainPanelRuntimeState({ panel, state: { running: true } });
    expect(controls.get('bronze-loop-start').disabled).toBe(true);
    expect(controls.get('bronze-loop-stop').disabled).toBe(false);
    for (const id of ids.filter((id) => !['bronze-loop-stop'].includes(id))) {
      expect(controls.get(id).disabled, id).toBe(id !== 'bronze-loop-reward-alert-enabled');
    }
  });

  it('projects running and stopping state and returns a new mobile run to the Run tab', () => {
    const { panel, controls } = harness([
      'bronze-loop-run-status', 'bronze-loop-run-name', 'bronze-loop-select',
    ]);
    panel.dataset.layout = 'mobile';
    controls.get('bronze-loop-select').selectedOptions = [{ textContent: 'One-click Daily Loop' }];
    const selectedTabs = [];

    renderMainPanelRuntimeState({ panel, state: { running: true }, setMobileTab: (tab) => selectedTabs.push(tab) });
    expect(panel.classList.contains('is-running')).toBe(true);
    expect(panel.classList.contains('is-stopping')).toBe(false);
    expect(panel.dataset.running).toBe('true');
    expect(controls.get('bronze-loop-run-status').textContent).toBe('Running');
    expect(controls.get('bronze-loop-run-name').textContent).toBe('One-click Daily Loop');
    expect(selectedTabs).toEqual(['run']);

    renderMainPanelRuntimeState({ panel, state: { running: true, stopping: true }, setMobileTab: (tab) => selectedTabs.push(tab) });
    expect(panel.classList.contains('is-stopping')).toBe(true);
    expect(controls.get('bronze-loop-run-status').textContent).toBe('Stopping');
    expect(selectedTabs).toEqual(['run']);

    renderMainPanelRuntimeState({ panel, state: { running: false } });
    expect(panel.classList.contains('is-running')).toBe(false);
    expect(panel.classList.contains('is-stopping')).toBe(false);
  });
});
