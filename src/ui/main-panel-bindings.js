const HELP_BUTTON_TOPICS = Object.freeze({
  'bronze-loop-help-overview': 'overview',
  'bronze-loop-help-run-options': 'run-options',
  'bronze-loop-help-config': 'config',
  'bronze-loop-help-log': 'log',
});

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

  select.addEventListener('change', (event) => commands.selectLoop?.(event.target?.value, event));
  required(panel, '#bronze-loop-profile-select').addEventListener('change', (event) => commands.selectProfile?.(event.target?.value, event));
  required(panel, '#bronze-loop-layout-mode').addEventListener('change', (event) => commands.setLayoutMode?.(event.target?.value, event));
  required(panel, '#bronze-loop-open-builder').addEventListener('click', (event) => commands.openBuilder?.(event));
  Object.entries(HELP_BUTTON_TOPICS).forEach(([id, topic]) => {
    required(panel, `#${id}`).addEventListener('click', (event) => commands.openHelp?.(topic, event));
  });
  required(panel, '#bronze-loop-daily-inventory-only').addEventListener('change', (event) => commands.saveLoopOptions?.(event));
  required(panel, '#bronze-loop-selection-policy-settings').addEventListener('click', (event) => commands.openSelectionPolicySettings?.(event));
  required(panel, '#bronze-loop-reward-alert-enabled').addEventListener('change', (event) => commands.saveRewardAlertEnabled?.(event));
  required(panel, '#bronze-loop-reward-alert-settings').addEventListener('click', (event) => commands.openRewardAlertSettings?.(event));
  required(panel, '#bronze-loop-start').addEventListener('click', (event) => commands.start?.(event));
  required(panel, '#bronze-loop-batch-open').addEventListener('click', (event) => commands.openBatch?.(event));
  required(panel, '#bronze-loop-trade').addEventListener('click', (event) => commands.openTrade?.(event));
  required(panel, '#bronze-loop-recap-reopen').addEventListener('click', (event) => commands.reopenRecap?.(event));
  required(panel, '#bronze-loop-refresh').addEventListener('click', (event) => commands.refresh?.(event));
  required(panel, '#bronze-loop-resolve-primary-reward').addEventListener('click', (event) => commands.resolvePendingPrimaryReward?.(event));
  required(panel, '#bronze-loop-scan-picks').addEventListener('click', (event) => commands.scanPicks?.(event));
  required(panel, '#bronze-loop-stop').addEventListener('click', (event) => commands.stop?.(event));
  required(panel, '#bronze-loop-copy').addEventListener('click', (event) => commands.copyLog?.(event));
  required(panel, '#bronze-loop-clear').addEventListener('click', (event) => commands.clearLog?.(event));
  required(panel, '#bronze-loop-download').addEventListener('click', (event) => commands.downloadLog?.(event));
}

export function hydrateMainPanelOptions(options = {}) {
  const panel = options.panel;
  if (!panel?.querySelector) throw new TypeError('panel element is required');
  const loopOptions = options.loopOptions || {};
  const rewardAlertSettings = options.rewardAlertSettings || {};
  required(panel, '#bronze-loop-daily-inventory-only').checked = loopOptions.inventoryOnly === true
    || loopOptions.dailyRecycleInventoryOnly === true;
  required(panel, '#bronze-loop-reward-alert-enabled').checked = rewardAlertSettings.enabled !== false;
  required(panel, '#bronze-loop-layout-mode').value = options.layoutMode || 'auto';
}
