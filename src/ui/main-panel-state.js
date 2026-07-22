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
  const custom = createOption();
  custom.value = 'custom';
  custom.textContent = 'Custom JSON';
  select.appendChild(custom);
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
  input.min = String(quantity.min || 1);
  input.max = String(quantity.max || 50);
  const quantityKey = String(options.quantityKey || '');
  if (input.dataset?.quantityKey !== quantityKey) {
    input.value = String(quantity.default || 1);
    if (input.dataset) input.dataset.quantityKey = quantityKey;
  }
}

export function renderMainPanelRecap(options = {}) {
  const button = query(options.panel, '#bronze-loop-recap-reopen');
  if (!button) return;
  const recap = options.recap;
  button.style.display = recap ? '' : 'none';
  if (recap) {
    const label = recap.type === 'batch' ? 'Batch Open' : 'Player Pick';
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

export function renderMainPanelRuntimeState(options = {}) {
  const panel = options.panel;
  const state = options.state || {};
  const busy = state.running === true
    || state.refreshing === true
    || state.scanningPicks === true
    || state.loadingLoops === true;
  const disabled = {
    'bronze-loop-start': busy,
    'bronze-loop-batch-open': busy,
    'bronze-loop-stop': state.running !== true,
    'bronze-loop-select': state.running === true || state.scanningPicks === true || state.loadingLoops === true,
    'bronze-loop-edit': state.running === true || state.scanningPicks === true || state.loadingLoops === true,
    'bronze-loop-edit-config': busy,
    'bronze-loop-apply-config': busy,
    'bronze-loop-refresh': busy,
    'bronze-loop-scan-picks': busy,
    'bronze-loop-load-json': busy,
    'bronze-loop-built-in': busy || state.usingBuiltIn === true,
    'bronze-loop-dry-run': state.running === true,
    'bronze-loop-open-rewards': state.running === true,
    'bronze-loop-daily-inventory-only': state.running === true,
    'bronze-loop-pick-protect-high-gold': state.running === true,
    'bronze-loop-pick-auto-below-90': state.running === true,
    'bronze-loop-pick-prefer-scanned': state.running === true || state.scanningPicks === true,
    'bronze-loop-pick-open-at-end': state.running === true,
    'bronze-loop-pick-high-gold-threshold': state.running === true,
    'bronze-loop-pick-auto-threshold': state.running === true,
    'bronze-loop-show-mvp': state.running === true,
    'bronze-loop-reward-alert-settings': state.running === true,
    'bronze-loop-rounds': state.running === true,
    'bronze-loop-json': state.running === true,
  };
  for (const [id, value] of Object.entries(disabled)) {
    const element = query(panel, `#${id}`);
    if (element) element.disabled = value;
  }
}
