const PICK_OPTION_IDS = [
  'bronze-loop-pick-protect-high-gold',
  'bronze-loop-pick-auto-below-90',
  'bronze-loop-pick-prefer-scanned',
  'bronze-loop-pick-open-at-end',
  'bronze-loop-pick-high-gold-threshold',
  'bronze-loop-pick-auto-threshold',
];

function required(panel, selector) {
  const element = panel?.querySelector?.(selector);
  if (!element) throw new Error(`Main panel control is missing: ${selector}`);
  return element;
}

export function bindMainPanelCommands(options = {}) {
  const panel = options.panel;
  const commands = options.commands || {};
  if (!panel?.querySelector) throw new TypeError('panel element is required');

  const select = required(panel, '#bronze-loop-select');
  const editor = required(panel, '#bronze-loop-json');

  select.addEventListener('change', (event) => commands.selectLoop?.(event.target?.value, event));
  required(panel, '#bronze-loop-edit').addEventListener('click', (event) => {
    editor.classList.toggle('show');
    if (editor.classList.contains('show')) select.value = 'custom';
    commands.editJson?.({ visible: editor.classList.contains('show'), event });
  });
  editor.addEventListener('input', (event) => commands.jsonInput?.(event));
  PICK_OPTION_IDS.forEach((id) => {
    required(panel, `#${id}`).addEventListener('change', (event) => commands.savePickOptions?.(event));
  });
  required(panel, '#bronze-loop-show-mvp').addEventListener('change', (event) => commands.saveLoopOptions?.(event));
  required(panel, '#bronze-loop-reward-alert-enabled').addEventListener('change', (event) => commands.saveRewardAlertEnabled?.(event));
  required(panel, '#bronze-loop-reward-alert-settings').addEventListener('click', (event) => commands.openRewardAlertSettings?.(event));
  required(panel, '#bronze-loop-start').addEventListener('click', (event) => commands.start?.(event));
  required(panel, '#bronze-loop-batch-open').addEventListener('click', (event) => commands.openBatch?.(event));
  required(panel, '#bronze-loop-recap-reopen').addEventListener('click', (event) => commands.reopenRecap?.(event));
  required(panel, '#bronze-loop-refresh').addEventListener('click', (event) => commands.refresh?.(event));
  required(panel, '#bronze-loop-scan-picks').addEventListener('click', (event) => commands.scanPicks?.(event));
  required(panel, '#bronze-loop-load-json').addEventListener('click', (event) => commands.loadJson?.(event));
  required(panel, '#bronze-loop-built-in').addEventListener('click', (event) => commands.useBuiltIn?.(event));
  required(panel, '#bronze-loop-stop').addEventListener('click', (event) => commands.stop?.(event));
  required(panel, '#bronze-loop-copy').addEventListener('click', (event) => commands.copyLog?.(event));
  required(panel, '#bronze-loop-clear').addEventListener('click', (event) => commands.clearLog?.(event));
  required(panel, '#bronze-loop-download').addEventListener('click', (event) => commands.downloadLog?.(event));
}

export function hydrateMainPanelOptions(options = {}) {
  const panel = options.panel;
  if (!panel?.querySelector) throw new TypeError('panel element is required');
  const loopOptions = options.loopOptions || {};
  const pickOptions = options.pickOptions || {};
  const rewardAlertSettings = options.rewardAlertSettings || {};
  required(panel, '#bronze-loop-show-mvp').checked = loopOptions.showMvpLoops === true;
  required(panel, '#bronze-loop-pick-protect-high-gold').checked = pickOptions.protectHighGold === true;
  required(panel, '#bronze-loop-pick-auto-below-90').checked = pickOptions.autoSelectBelow90 === true;
  required(panel, '#bronze-loop-pick-prefer-scanned').checked = pickOptions.preferScannedMetadata === true;
  required(panel, '#bronze-loop-pick-open-at-end').checked = pickOptions.openPicksAtEnd === true;
  required(panel, '#bronze-loop-pick-high-gold-threshold').value = pickOptions.highGoldThreshold;
  required(panel, '#bronze-loop-pick-auto-threshold').value = pickOptions.autoPickThreshold;
  required(panel, '#bronze-loop-reward-alert-enabled').checked = rewardAlertSettings.enabled !== false;
}
