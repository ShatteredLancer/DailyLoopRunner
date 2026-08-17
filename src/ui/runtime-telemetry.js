const PHASE_LABELS = Object.freeze({
  PREFLIGHT: 'Indexing inventory',
  INDEX_INVENTORY: 'Indexing inventory',
  BOOTSTRAP_OR_FIND_REWARD: 'Building 10x85+ squad',
  OPEN_X10: 'Opening 10x85+ reward',
  CLASSIFY_OPENED_ITEMS: 'Clearing duplicates',
  RESOLVE_PROTECTED_STORAGE: 'Clearing duplicates',
  PROCESS_RECOVERY_REWARD: 'Clearing duplicates',
  DRAIN_RECOVERY_DUPLICATES: 'Clearing duplicates',
  RECOVER_PROVISIONS: 'Crafting Provisions',
  RECOVER_STORAGE_SINK: 'Freeing Storage with 95+ Pick',
  RECOVER_REQUIRED_SPECIAL: 'Recovering TOTW',
  MAINTAIN_STORAGE: 'Maintaining Storage',
  REDEEM_RARE_GOLD_PICK: 'Redeeming Rare Gold Pick',
  CRAFT_5X80: 'Crafting 5x80+',
  PLAN_PRIMARY_SQUAD: 'Building 10x85+ squad',
  SUBMIT_PRIMARY: 'Building 10x85+ squad',
  RECONCILE_LEDGER: 'Reconciling inventory',
});

function query(panel, selector) {
  return panel?.querySelector?.(selector) || null;
}

function metricText(value, limited = false) {
  if (value === null || value === undefined || value === '') return '-';
  if (!Number.isFinite(Number(value))) return '-';
  const text = String(Math.max(0, Math.floor(Number(value))));
  return limited ? `${text}+` : text;
}

export function runtimeTelemetryPhaseLabel(phase, stopping = false) {
  if (stopping) return 'Stopping';
  return PHASE_LABELS[String(phase || '')] || 'Preparing Rolling loop';
}

export function renderRuntimeTelemetry(options = {}) {
  const panel = options.panel;
  const snapshot = options.snapshot || {};
  const visible = options.running === true && snapshot.visible === true;
  const container = query(panel, '#bronze-loop-runtime-telemetry');
  if (!container || !panel) return false;

  container.style.display = visible ? 'block' : 'none';
  container.setAttribute?.('aria-hidden', visible ? 'false' : 'true');
  panel.classList?.toggle?.('has-runtime-telemetry', visible);
  if (!visible) return false;

  const phase = query(panel, '#bronze-loop-runtime-phase');
  const cycle = query(panel, '#bronze-loop-runtime-cycle');
  const refreshing = query(panel, '#bronze-loop-runtime-refreshing');
  if (phase) phase.textContent = runtimeTelemetryPhaseLabel(snapshot.phase, options.stopping === true);
  if (cycle) {
    const currentCycle = Math.max(1, Number(snapshot.completedCycles || 0) + 1);
    const limit = Number(snapshot.cycleLimit || 0);
    cycle.textContent = `Cycle ${currentCycle} / ${limit > 0 ? limit : 'No limit'}`;
  }
  if (refreshing) {
    refreshing.textContent = snapshot.calculating === true ? 'Refreshing' : '';
    refreshing.style.visibility = snapshot.calculating === true ? 'visible' : 'hidden';
  }

  const metrics = {
    'bronze-loop-runtime-special': { value: snapshot.specialSlots, limited: false },
    'bronze-loop-runtime-direct': { value: snapshot.directCycles, limited: snapshot.directCyclesLimited === true },
    'bronze-loop-runtime-provisions': { value: snapshot.provisionsBatches, limited: false },
    'bronze-loop-runtime-totw': { value: snapshot.totwRecoveries, limited: snapshot.totwRecoveriesLimited === true },
  };
  Object.entries(metrics).forEach(([id, metric]) => {
    const element = query(panel, `#${id}`);
    if (element) element.textContent = metricText(metric.value, metric.limited);
  });

  const storageValue = query(panel, '#bronze-loop-runtime-storage-value');
  const storageTrack = query(panel, '#bronze-loop-runtime-storage-track');
  const storageBar = query(panel, '#bronze-loop-runtime-storage-bar');
  const used = Number(snapshot.storageUsed);
  const capacity = Number(snapshot.storageCapacity);
  const known = snapshot.storageUsed !== null
    && snapshot.storageUsed !== undefined
    && snapshot.storageCapacity !== null
    && snapshot.storageCapacity !== undefined
    && Number.isFinite(used)
    && Number.isFinite(capacity)
    && capacity > 0;
  const percentage = known ? Math.max(0, Math.min(100, Math.round((used / capacity) * 100))) : 0;
  const pressure = !known ? 'unknown' : percentage >= 95 ? 'danger' : percentage >= 80 ? 'warning' : 'normal';
  container.dataset.storagePressure = pressure;
  if (storageValue) storageValue.textContent = known ? `${Math.max(0, Math.floor(used))} / ${Math.floor(capacity)}` : '- / -';
  if (storageBar) storageBar.style.width = `${percentage}%`;
  storageTrack?.setAttribute?.('aria-valuemin', '0');
  if (known) {
    storageTrack?.setAttribute?.('aria-valuemax', String(Math.floor(capacity)));
    storageTrack?.setAttribute?.('aria-valuenow', String(Math.max(0, Math.floor(used))));
  } else {
    storageTrack?.removeAttribute?.('aria-valuemax');
    storageTrack?.removeAttribute?.('aria-valuenow');
  }
  return true;
}
