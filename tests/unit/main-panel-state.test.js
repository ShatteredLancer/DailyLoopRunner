import { describe, expect, it } from 'vitest';
import {
  renderMainPanelLoopOptions,
  renderMainPanelRecap,
  renderMainPanelRounds,
  renderMainPanelRuntimeState,
  renderRewardAlertSummary,
} from '../../src/ui/main-panel-state.js';

function element(id) {
  return { id, style: {}, disabled: false, textContent: '', value: '', title: '' };
}

function harness(ids = []) {
  const controls = new Map(ids.map((id) => [id, element(id)]));
  return {
    controls,
    panel: { querySelector: (selector) => controls.get(selector.replace(/^#/, '')) || null },
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
    expect(select.children.map((option) => option.value)).toEqual(['daily', 'provision', 'custom']);
    expect(select.children.map((option) => option.textContent)).toEqual(['Daily', 'Provision', 'Custom JSON']);

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
  });

  it('renders recap availability and summary title', () => {
    const { panel, controls } = harness(['bronze-loop-recap-reopen']);
    const button = controls.get('bronze-loop-recap-reopen');
    renderMainPanelRecap({ panel, recap: null });
    expect(button.style.display).toBe('none');
    renderMainPanelRecap({ panel, recap: { name: '84+ Pick', totalCards: 5 } });
    expect(button.style.display).toBe('');
    expect(button.title).toBe('Last Player Pick recap: 84+ Pick (5 card(s))');
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

  it('applies the complete runtime disabled-state matrix', () => {
    const ids = [
      'bronze-loop-start', 'bronze-loop-stop', 'bronze-loop-select', 'bronze-loop-edit',
      'bronze-loop-refresh', 'bronze-loop-scan-picks', 'bronze-loop-load-json', 'bronze-loop-built-in', 'bronze-loop-dry-run',
      'bronze-loop-open-rewards', 'bronze-loop-pick-protect-high-gold', 'bronze-loop-pick-auto-below-90',
      'bronze-loop-pick-prefer-scanned',
      'bronze-loop-pick-high-gold-threshold', 'bronze-loop-pick-auto-threshold', 'bronze-loop-show-mvp',
      'bronze-loop-rounds', 'bronze-loop-json',
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
    expect(controls.get('bronze-loop-load-json').disabled).toBe(true);
    expect(controls.get('bronze-loop-built-in').disabled).toBe(true);
    expect(controls.get('bronze-loop-select').disabled).toBe(true);

    renderMainPanelRuntimeState({ panel, state: { running: true } });
    expect(controls.get('bronze-loop-start').disabled).toBe(true);
    expect(controls.get('bronze-loop-stop').disabled).toBe(false);
    for (const id of ids.filter((id) => !['bronze-loop-stop'].includes(id))) {
      expect(controls.get(id).disabled, id).toBe(id !== 'bronze-loop-reward-alert-enabled');
    }
  });
});
