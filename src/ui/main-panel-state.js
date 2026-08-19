import { renderRuntimeTelemetry } from './runtime-telemetry.js';

function query(panel, selector) {
  return panel?.querySelector?.(selector) || null;
}

export function renderMainPanelLoopOptions(options = {}) {
  const panel = options.panel;
  const createOption = options.createOption;
  const select = query(panel, '#bronze-loop-select');
  if (!select || typeof createOption !== 'function') return null;
  const loops = options.loops || [];
  const previous = String(options.selectedId || select.value || '');
  select.textContent = '';
  for (const loop of loops) {
    const option = createOption();
    option.value = loop.id;
    option.textContent = loop.name;
    select.appendChild(option);
  }
  const values = Array.from(select.options || []).map((option) => option.value);
  const nextValue = values.includes(previous) ? previous : loops[0]?.id;
  if (nextValue) select.value = nextValue;
  return select.value || null;
}

export function renderMainPanelRounds(options = {}) {
  const panel = options.panel;
  const display = options.show === true ? '' : 'none';
  for (const selector of ['#bronze-loop-rounds-row', '#bronze-loop-rounds-label', '#bronze-loop-rounds']) {
    const element = query(panel, selector);
    if (element) element.style.display = display;
  }
  if (display === 'none') return;
  const quantity = options.quantity || {};
  const label = query(panel, '#bronze-loop-rounds-label');
  const input = query(panel, '#bronze-loop-rounds');
  if (label) label.textContent = quantity.label || 'Rounds';
  if (!input) return;
  input.min = String(quantity.min ?? 1);
  input.max = String(quantity.max ?? 50);
  const quantityKey = String(options.quantityKey || '');
  if (input.dataset?.quantityKey !== quantityKey) {
    input.value = String(quantity.default ?? 1);
    if (input.dataset) input.dataset.quantityKey = quantityKey;
  }
}

export function renderMainPanelProfileOptions(options = {}) {
  const panel = options.panel;
  const createOption = options.createOption;
  const select = query(panel, '#bronze-loop-profile-select');
  if (!select || typeof createOption !== 'function') return null;
  const profiles = options.profiles || [];
  select.textContent = '';
  for (const profile of profiles) {
    const option = createOption();
    option.value = profile.id;
    option.textContent = profile.name;
    select.appendChild(option);
  }
  const values = Array.from(select.options || []).map((option) => option.value);
  const selectedId = String(options.selectedId || '');
  select.value = values.includes(selectedId) ? selectedId : values[0] || '';
  return select.value || null;
}

export function renderMainPanelRecap(options = {}) {
  const button = query(options.panel, '#bronze-loop-recap-reopen');
  if (!button) return;
  const recap = options.recap;
  button.style.display = recap ? '' : 'none';
  if (recap) {
    const label = recap.type === 'batch' ? 'Batch Open' : recap.type === 'loop' ? 'Loop' : 'Player Pick';
    button.title = `Last ${label} recap: ${recap.name} (${Number(recap.totalCards || 0)} card(s))`;
  }
}

export function renderRewardAlertSummary(options = {}) {
  const panel = options.panel;
  const settings = options.settings || {};
  const summary = query(panel, '#bronze-loop-reward-alert-summary');
  const enabled = query(panel, '#bronze-loop-reward-alert-enabled');
  if (enabled) enabled.checked = settings.enabled !== false;
  if (!summary) return;
  if (settings.enabled === false) {
    summary.textContent = 'Off';
    return;
  }
  const channels = [];
  if (settings.highlightEnabled !== false) channels.push('highlight');
  if (settings.desktopEnabled === true) channels.push('desktop');
  if (settings.ntfyEnabled === true) channels.push('ntfy');
  summary.textContent = `${Number(settings.minimumRating || 94)}+ special${channels.length ? ` | ${channels.join(' | ')}` : ''}`;
}

export function renderSelectionPolicySummary(options = {}) {
  const summary = query(options.panel, '#bronze-loop-selection-policy-summary');
  if (!summary) return;
  const pickOptions = options.pickOptions || {};
  const sbcFodderOptions = options.sbcFodderOptions || {};
  const lowRatedGold = Number(sbcFodderOptions.lowRatedGoldMaxRating || 82) || 82;
  const standardRating = Number(sbcFodderOptions.ratingSbcMaxCardRating || 88) || 88;
  const automaticUse = Number(pickOptions.protectionRating || pickOptions.autoPickThreshold || 90) || 90;
  const pickMode = pickOptions.autoSelectBelow90 === false ? 'Review' : 'Auto';
  const storageSink = pickOptions.rollingStorageSinkMode === 'selected'
    ? `Set #${pickOptions.rollingStorageSinkSetId || '?'}`
    : pickOptions.rollingStorageSinkMode === 'automatic' || pickOptions.rollingStorageSinkEnabled === true
      ? 'automatic'
      : 'off';
  const surplusCrafting = pickOptions.rollingSurplusCraftingEnabled === true ? 'enabled' : 'off';
  const provisionsShortageRecovery = pickOptions.rollingProvisionsShortageRecoveryEnabled === true
    ? 'allowed'
    : 'off';
  const requiredSpecialRecovery = pickOptions.rollingRequiredSpecialRecoveryEnabled === true
    ? 'allowed'
    : 'off';
  const clubSpecialProtection = pickOptions.rollingProtectAllClubNonTotwSpecials === true
    ? 'protected'
    : 'fallback allowed';
  const provisionsMaxRating = Number(pickOptions.rollingProvisionsMaxRating || 88) === 89 ? 89 : 88;
  const duplicateProvisionsRewards = pickOptions.rollingOpenDuplicateProvisionsRewards === true
    ? 'immediate'
    : 'on shortage';
  const shortageProvisionsPackLimit = Number(pickOptions.rollingShortageProvisionsPackLimit || 2) || 2;
  summary.textContent = `Std card <=${standardRating} | Auto-use <=${automaticUse} | Picks ${pickMode}`;
  summary.title = `Non-rating Gold <=${lowRatedGold}; Standard Rating SBC cards <=${standardRating}; Rolling/Pick automatic-use <=${automaticUse}; Pick mode ${pickMode}; Provisions reserve 87-${provisionsMaxRating}; shortage Provisions batch ${shortageProvisionsPackLimit}; surplus Provisions/TOTW ${surplusCrafting}; Provisions shortage recovery ${provisionsShortageRecovery}; Required Special/TOTW recovery ${requiredSpecialRecovery}; Club non-TOTW specials ${clubSpecialProtection}; duplicate Provisions rewards ${duplicateProvisionsRewards}; Storage pressure SBC ${storageSink}`;
}

export function renderMainPanelScanProgress(options = {}) {
  const panel = options.panel;
  const state = options.state || {};
  const container = query(panel, '#bronze-loop-scan-progress');
  if (!container) return;
  const scanning = state.scanningPicks === true;
  const progress = state.dynamicSbcScanProgress || {};
  const completed = Math.max(0, Number(progress.completed || 0) || 0);
  const total = Math.max(0, Number(progress.total || 0) || 0);
  const determinate = scanning && total > 0;
  const boundedCompleted = determinate ? Math.min(completed, total) : completed;
  const percentage = determinate ? Math.round((boundedCompleted / total) * 100) : 0;
  const label = query(panel, '#bronze-loop-scan-progress-label');
  const count = query(panel, '#bronze-loop-scan-progress-count');
  const track = query(panel, '#bronze-loop-scan-progress-track');
  const bar = query(panel, '#bronze-loop-scan-progress-bar');

  container.style.display = scanning ? 'block' : 'none';
  container.dataset.mode = determinate ? 'determinate' : 'indeterminate';
  if (label) label.textContent = progress.label || 'Scanning dynamic SBCs';
  if (count) count.textContent = determinate ? `${boundedCompleted} / ${total}` : '';
  if (bar) bar.style.width = determinate ? `${percentage}%` : '35%';
  track?.setAttribute?.('aria-valuemin', '0');
  if (determinate) {
    track?.setAttribute?.('aria-valuemax', String(total));
    track?.setAttribute?.('aria-valuenow', String(boundedCompleted));
  } else {
    track?.removeAttribute?.('aria-valuemax');
    track?.removeAttribute?.('aria-valuenow');
  }
}

export function renderMainPanelRuntimeState(options = {}) {
  const panel = options.panel;
  const state = options.state || {};
  if (!panel) return;
  renderSelectionPolicySummary({
    panel,
    pickOptions: state.pickOptions,
    sbcFodderOptions: state.sbcFodderOptions,
  });
  const wasRunning = panel.dataset?.running === 'true';
  panel.classList?.toggle?.('is-running', state.running === true);
  panel.classList?.toggle?.('is-stopping', state.running === true && state.stopping === true);
  if (panel.dataset) panel.dataset.running = state.running === true ? 'true' : 'false';
  if (state.running === true && !wasRunning && panel.dataset?.layout === 'mobile') options.setMobileTab?.('run');
  const status = query(panel, '#bronze-loop-run-status');
  const name = query(panel, '#bronze-loop-run-name');
  if (status) status.textContent = state.stopping === true ? 'Stopping' : 'Running';
  if (name) {
    const selected = query(panel, '#bronze-loop-select');
    name.textContent = selected?.selectedOptions?.[0]?.textContent || selected?.value || '';
  }
  const busy = state.running === true
    || state.refreshing === true
    || state.scanningPicks === true
    || state.loadingLoops === true;
  const disabled = {
    'bronze-loop-start': busy,
    'bronze-loop-batch-open': busy,
    'bronze-loop-trade': busy,
    'bronze-loop-stop': state.running !== true,
    'bronze-loop-select': state.running === true || state.scanningPicks === true || state.loadingLoops === true,
    'bronze-loop-profile-select': busy,
    'bronze-loop-open-builder': busy,
    'bronze-loop-refresh': busy,
    'bronze-loop-scan-mode': busy,
    'bronze-loop-scan-picks': busy,
    'bronze-loop-open-rewards': state.running === true,
    'bronze-loop-daily-inventory-only': state.running === true,
    'bronze-loop-selection-policy-settings': state.running === true,
    'bronze-loop-reward-alert-settings': state.running === true,
    'bronze-loop-rounds': state.running === true,
  };
  for (const [id, value] of Object.entries(disabled)) {
    const element = query(panel, `#${id}`);
    if (element) element.disabled = value;
  }
  const scanButton = query(panel, '#bronze-loop-scan-picks');
  if (scanButton) scanButton.textContent = state.scanningPicks === true ? 'Scanning...' : 'Scan SBCs';
  renderMainPanelScanProgress({ panel, state });
  renderRuntimeTelemetry({
    panel,
    snapshot: state.runtimeTelemetry,
    running: state.running === true,
    stopping: state.stopping === true,
  });
}
