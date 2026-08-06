const DEFAULT_SIZES = Object.freeze({
  compact: Object.freeze({ width: 300, height: 178 }),
  options: Object.freeze({ width: 360, height: 620 }),
});
const DEFAULT_LOG_HEIGHT = 110;
const MIN_LOG_HEIGHT = 64;
const MAX_LOG_HEIGHT = 720;
const MOBILE_ICON_SIZE = 48;
const MOBILE_ICON_EDGE = 6;

function viewportSize(getViewport) {
  const value = getViewport?.() || {};
  return {
    width: Math.max(0, Number(value.width || 0)),
    height: Math.max(0, Number(value.height || 0)),
  };
}

export function getMainPanelDefaultSize(optionsOpen = false) {
  return optionsOpen ? { ...DEFAULT_SIZES.options } : { ...DEFAULT_SIZES.compact };
}

export function clampMainPanelDefaultSize(size, viewport) {
  return {
    width: Math.min(Number(size.width), Math.max(220, Number(viewport.width) - 20)),
    height: Math.min(Number(size.height), Math.max(180, Number(viewport.height) - 20)),
  };
}

export function normalizeMainPanelLogHeight(value) {
  const height = Number(value);
  if (!Number.isFinite(height)) return DEFAULT_LOG_HEIGHT;
  return Math.max(MIN_LOG_HEIGHT, Math.min(MAX_LOG_HEIGHT, Math.round(height)));
}

export function normalizeMobileIconPosition(value, viewport) {
  const left = Number(value?.left);
  const top = Number(value?.top);
  const width = Math.max(0, Number(viewport?.width || 0));
  const height = Math.max(0, Number(viewport?.height || 0));
  if (!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) return null;
  return Object.freeze({
    left: Math.round(Math.max(MOBILE_ICON_EDGE, Math.min(Math.max(MOBILE_ICON_EDGE, width - MOBILE_ICON_SIZE - MOBILE_ICON_EDGE), left))),
    top: Math.round(Math.max(MOBILE_ICON_EDGE, Math.min(Math.max(MOBILE_ICON_EDGE, height - MOBILE_ICON_SIZE - MOBILE_ICON_EDGE), top))),
  });
}

export function createMainPanelGeometry(options = {}) {
  const panel = options.panel;
  if (!panel?.querySelector || !panel?.classList) throw new TypeError('panel element is required');
  const getViewport = options.getViewport || (() => ({ width: 0, height: 0 }));
  const savePosition = options.savePosition || (() => {});
  const loadPosition = options.loadPosition || (() => null);
  const saveLogHeight = options.saveLogHeight || (() => {});
  const loadLogHeight = options.loadLogHeight || (() => null);
  const onModeChange = options.onModeChange || (() => {});
  const schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
  const saveMobileTab = options.saveMobileTab || (() => {});
  const saveMobileIconPosition = options.saveMobileIconPosition || (() => {});
  const loadedMobileTab = String(options.loadMobileTab?.() || 'run');
  let mobileTab = ['run', 'options', 'log'].includes(loadedMobileTab) ? loadedMobileTab : 'run';
  let mobileIconPosition = options.loadMobileIconPosition?.() || null;

  function isMobileLayout() {
    return panel.dataset?.layout === 'mobile';
  }

  function setPanelStyleProperty(name, value) {
    if (typeof panel.style?.setProperty === 'function') panel.style.setProperty(name, value);
    else if (panel.style) panel.style[name] = value;
  }

  function clearPanelStyleProperty(name) {
    if (typeof panel.style?.removeProperty === 'function') panel.style.removeProperty(name);
    else if (panel.style) delete panel.style[name];
  }

  function applyMobileIconPosition(value = mobileIconPosition) {
    const normalized = normalizeMobileIconPosition(value, viewportSize(getViewport));
    const properties = [
      '--dlr-mobile-icon-left', '--dlr-mobile-icon-right',
      '--dlr-mobile-icon-top', '--dlr-mobile-icon-bottom',
    ];
    if (!normalized) {
      properties.forEach(clearPanelStyleProperty);
      mobileIconPosition = null;
      return null;
    }
    mobileIconPosition = normalized;
    setPanelStyleProperty('--dlr-mobile-icon-left', `${normalized.left}px`);
    setPanelStyleProperty('--dlr-mobile-icon-right', 'auto');
    setPanelStyleProperty('--dlr-mobile-icon-top', `${normalized.top}px`);
    setPanelStyleProperty('--dlr-mobile-icon-bottom', 'auto');
    return normalized;
  }

  function persistPosition() {
    if (isMobileLayout()) return;
    try {
      const rect = panel.getBoundingClientRect();
      savePosition({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    } catch { }
  }

  function resetSize() {
    if (isMobileLayout()) {
      panel.style.width = '';
      panel.style.height = '';
      return { width: 0, height: 0 };
    }
    const size = getMainPanelDefaultSize(panel.classList.contains('options-open'));
    const clamped = clampMainPanelDefaultSize(size, viewportSize(getViewport));
    panel.dataset.minWidth = String(clamped.width);
    panel.dataset.minHeight = String(clamped.height);
    panel.style.width = `${clamped.width}px`;
    panel.style.height = `${clamped.height}px`;
    return clamped;
  }

  function persistLogHeight() {
    const log = panel.querySelector('#bronze-loop-log');
    if (!log) return;
    const height = Number(log.getBoundingClientRect?.().height || Number.parseFloat(log.style?.height));
    if (!Number.isFinite(height)) return;
    saveLogHeight(normalizeMainPanelLogHeight(height));
  }

  function restoreLogHeight() {
    const log = panel.querySelector('#bronze-loop-log');
    const saved = loadLogHeight();
    if (!log || saved === null || saved === undefined) return;
    log.style.height = `${normalizeMainPanelLogHeight(saved)}px`;
  }

  function updateOptionsButton() {
    const button = panel.querySelector('#bronze-loop-options-toggle');
    if (!button) return;
    const mobile = isMobileLayout();
    const open = mobile ? mobileTab !== 'run' : panel.classList.contains('options-open');
    button.textContent = open ? (mobile ? 'Run' : 'Hide') : (panel.classList.contains('is-running') ? 'Details' : 'Options');
    button.title = open ? 'Return to Run view' : 'Show advanced options';
  }

  function updateCollapseButton() {
    const button = panel.querySelector('#bronze-loop-collapse');
    if (!button) return;
    button.textContent = 'L';
    button.title = panel.classList.contains('icon-only') ? 'Restore panel' : 'Collapse to icon';
  }

  function notifyModeChange() {
    updateOptionsButton();
    updateCollapseButton();
    onModeChange({
      iconOnly: panel.classList.contains('icon-only'),
      optionsOpen: panel.classList.contains('options-open'),
      mobileTab,
      layout: panel.dataset?.layout || 'desktop',
    });
  }

  function setMobileTab(nextTab, persist = true) {
    const normalized = ['run', 'options', 'log'].includes(String(nextTab)) ? String(nextTab) : 'run';
    mobileTab = normalized;
    if (panel.dataset) panel.dataset.mobileTab = mobileTab;
    if (persist) saveMobileTab(mobileTab);
    notifyModeChange();
    return mobileTab;
  }

  function setResponsiveMode(snapshot = {}) {
    const previous = panel.dataset?.layout || 'desktop';
    const layout = ['desktop', 'tablet', 'mobile'].includes(snapshot.layout) ? snapshot.layout : 'desktop';
    if (previous !== 'mobile' && layout === 'mobile') persistPosition();
    if (panel.dataset) {
      panel.dataset.layout = layout;
      panel.dataset.input = snapshot.input === 'touch' ? 'touch' : 'pointer';
    }
    if (layout === 'mobile') {
      panel.classList.remove('options-open');
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '';
      panel.style.bottom = '';
      panel.style.width = '';
      panel.style.height = '';
      applyMobileIconPosition();
      setMobileTab(mobileTab, false);
    } else if (previous === 'mobile') {
      panel.classList.remove('icon-only');
      resetSize();
      restoreSavedPosition();
      notifyModeChange();
    } else {
      notifyModeChange();
    }
    return layout;
  }

  function restorePanel() {
    panel.classList.remove('icon-only');
    resetSize();
    notifyModeChange();
    persistPosition();
  }

  function toggleIconOnly(event) {
    if (panel.dataset.dragJustEnded === '1') {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return;
    }
    panel.classList.toggle('icon-only');
    if (panel.classList.contains('icon-only')) {
      panel.classList.remove('options-open');
      panel.style.width = '';
      panel.style.height = '';
      if (isMobileLayout()) applyMobileIconPosition();
    } else {
      resetSize();
    }
    notifyModeChange();
    persistPosition();
  }

  function toggleOptions() {
    if (isMobileLayout()) {
      setMobileTab(mobileTab === 'run' ? 'options' : 'run');
      return;
    }
    panel.classList.toggle('options-open');
    resetSize();
    notifyModeChange();
    persistPosition();
  }

  function restoreSavedPosition() {
    const saved = loadPosition();
    if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
    const viewport = viewportSize(getViewport);
    panel.style.left = `${Math.max(0, Math.min(viewport.width - 80, saved.left))}px`;
    panel.style.top = `${Math.max(0, Math.min(viewport.height - 40, saved.top))}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function makeDraggable() {
    const handle = panel.querySelector('#bronze-loop-drag');
    if (!handle) return;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let moved = false;
    let mobileIconDrag = false;

    handle.addEventListener('pointerdown', (event) => {
      mobileIconDrag = isMobileLayout() && panel.classList.contains('icon-only');
      if (isMobileLayout() && !mobileIconDrag) return;
      if (!panel.classList.contains('icon-only') && event.target?.closest?.('button,select,input,textarea')) return;
      dragging = true;
      moved = false;
      const rect = panel.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      if (!mobileIconDrag) {
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault?.();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) moved = true;
      const viewport = viewportSize(getViewport);
      if (mobileIconDrag) {
        applyMobileIconPosition({ left: startLeft + deltaX, top: startTop + deltaY });
        event.preventDefault?.();
        return;
      }
      panel.style.left = `${Math.max(0, Math.min(viewport.width - 36, startLeft + deltaX))}px`;
      panel.style.top = `${Math.max(0, Math.min(viewport.height - 36, startTop + deltaY))}px`;
      event.preventDefault?.();
    });

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (panel.classList.contains('icon-only') && !moved) {
        panel.dataset.dragJustEnded = '1';
        restorePanel();
        schedule(() => { delete panel.dataset.dragJustEnded; }, 150);
        return;
      }
      if (moved) {
        panel.dataset.dragJustEnded = '1';
        schedule(() => { delete panel.dataset.dragJustEnded; }, 150);
      }
      if (mobileIconDrag) {
        if (mobileIconPosition) saveMobileIconPosition(mobileIconPosition);
      } else {
        persistPosition();
      }
      mobileIconDrag = false;
    };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
  }

  function makeResizable() {
    const edgePad = 20;
    const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    let resizing = null;

    const onMove = (event) => {
      if (!resizing) return;
      const dx = event.clientX - resizing.startX;
      const dy = event.clientY - resizing.startY;
      const dir = resizing.dir;
      let newLeft = resizing.startLeft;
      let newTop = resizing.startTop;
      let newWidth = resizing.startWidth;
      let newHeight = resizing.startHeight;
      const minWidth = Number(panel.dataset.minWidth || DEFAULT_SIZES.compact.width);
      const minHeight = Number(panel.dataset.minHeight || DEFAULT_SIZES.compact.height);
      if (dir.includes('e')) newWidth = Math.max(minWidth, resizing.startWidth + dx);
      if (dir.includes('s')) newHeight = Math.max(minHeight, resizing.startHeight + dy);
      if (dir.includes('w')) {
        newWidth = Math.max(minWidth, resizing.startWidth - dx);
        if (newWidth > minWidth) newLeft = resizing.startLeft + (resizing.startWidth - newWidth);
      }
      if (dir.includes('n')) {
        newHeight = Math.max(minHeight, resizing.startHeight - dy);
        if (newHeight > minHeight) newTop = resizing.startTop + (resizing.startHeight - newHeight);
      }
      const viewport = viewportSize(getViewport);
      const maxWidth = viewport.width - edgePad;
      const maxHeight = viewport.height - edgePad;
      if (newWidth > maxWidth) {
        const overflow = newWidth - maxWidth;
        newWidth = maxWidth;
        if (dir.includes('w')) newLeft += overflow;
      }
      if (newHeight > maxHeight) {
        const overflow = newHeight - maxHeight;
        newHeight = maxHeight;
        if (dir.includes('n')) newTop += overflow;
      }
      newLeft = Math.max(0, Math.min(viewport.width - newWidth, newLeft));
      newTop = Math.max(0, Math.min(viewport.height - newHeight, newTop));
      panel.style.left = `${newLeft}px`;
      panel.style.top = `${newTop}px`;
      panel.style.width = `${newWidth}px`;
      panel.style.height = `${newHeight}px`;
      event.preventDefault?.();
    };

    const onUp = () => {
      if (!resizing) return;
      resizing = null;
      persistPosition();
    };

    directions.forEach((dir) => {
      const element = panel.querySelector(`#bronze-loop-resize-${dir}`);
      if (!element) return;
      element.addEventListener('pointerdown', (event) => {
        if (panel.classList.contains('icon-only') || isMobileLayout()) return;
        const rect = panel.getBoundingClientRect();
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.width = `${rect.width}px`;
        panel.style.height = `${rect.height}px`;
        resizing = {
          dir,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: rect.left,
          startTop: rect.top,
          startWidth: rect.width,
          startHeight: rect.height,
        };
        element.setPointerCapture?.(event.pointerId);
        event.preventDefault?.();
      });
      element.addEventListener('pointermove', onMove);
      element.addEventListener('pointerup', onUp);
      element.addEventListener('pointercancel', onUp);
    });
  }

  function makeLogResizable() {
    const log = panel.querySelector('#bronze-loop-log');
    const handle = panel.querySelector('#bronze-loop-log-resize');
    if (!log || !handle) return;
    let resizing = null;

    const onMove = (event) => {
      if (!resizing) return;
      const height = normalizeMainPanelLogHeight(resizing.startHeight + event.clientY - resizing.startY);
      log.style.height = `${height}px`;
      event.preventDefault?.();
    };
    const onUp = () => {
      if (!resizing) return;
      resizing = null;
      persistLogHeight();
    };

    handle.addEventListener('pointerdown', (event) => {
      if (isMobileLayout()) return;
      const startHeight = Number(log.getBoundingClientRect?.().height || Number.parseFloat(log.style?.height));
      if (!Number.isFinite(startHeight)) return;
      resizing = { startY: event.clientY, startHeight };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault?.();
    });
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  restoreSavedPosition();
  resetSize();
  restoreLogHeight();
  if (panel.dataset) panel.dataset.mobileTab = mobileTab;
  makeDraggable();
  makeResizable();
  makeLogResizable();
  panel.querySelector('#bronze-loop-collapse')?.addEventListener('click', toggleIconOnly);
  panel.querySelector('#bronze-loop-options-toggle')?.addEventListener('click', toggleOptions);
  for (const tab of ['run', 'options', 'log']) {
    panel.querySelector(`#bronze-loop-mobile-tab-${tab}`)?.addEventListener('click', () => setMobileTab(tab));
  }
  notifyModeChange();

  return Object.freeze({
    resetSize,
    restorePanel,
    toggleIconOnly,
    toggleOptions,
    setMobileTab,
    setResponsiveMode,
    persistPosition,
    persistLogHeight,
  });
}
