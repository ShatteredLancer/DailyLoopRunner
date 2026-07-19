const DEFAULT_SIZES = Object.freeze({
  compact: Object.freeze({ width: 300, height: 178 }),
  options: Object.freeze({ width: 360, height: 620 }),
});

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

export function createMainPanelGeometry(options = {}) {
  const panel = options.panel;
  if (!panel?.querySelector || !panel?.classList) throw new TypeError('panel element is required');
  const getViewport = options.getViewport || (() => ({ width: 0, height: 0 }));
  const savePosition = options.savePosition || (() => {});
  const loadPosition = options.loadPosition || (() => null);
  const onModeChange = options.onModeChange || (() => {});
  const schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));

  function persistPosition() {
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
    const size = getMainPanelDefaultSize(panel.classList.contains('options-open'));
    const clamped = clampMainPanelDefaultSize(size, viewportSize(getViewport));
    panel.dataset.minWidth = String(clamped.width);
    panel.dataset.minHeight = String(clamped.height);
    panel.style.width = `${clamped.width}px`;
    panel.style.height = `${clamped.height}px`;
    return clamped;
  }

  function updateOptionsButton() {
    const button = panel.querySelector('#bronze-loop-options-toggle');
    if (!button) return;
    const open = panel.classList.contains('options-open');
    button.textContent = open ? 'Hide' : 'Options';
    button.title = open ? 'Hide advanced options' : 'Show advanced options';
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
    });
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
    } else {
      resetSize();
    }
    notifyModeChange();
    persistPosition();
  }

  function toggleOptions() {
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

    handle.addEventListener('pointerdown', (event) => {
      if (!panel.classList.contains('icon-only') && event.target?.closest?.('button,select,input,textarea')) return;
      dragging = true;
      moved = false;
      const rect = panel.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault?.();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) moved = true;
      const viewport = viewportSize(getViewport);
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
      persistPosition();
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
        if (panel.classList.contains('icon-only')) return;
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

  restoreSavedPosition();
  resetSize();
  makeDraggable();
  makeResizable();
  panel.querySelector('#bronze-loop-collapse')?.addEventListener('click', toggleIconOnly);
  panel.querySelector('#bronze-loop-options-toggle')?.addEventListener('click', toggleOptions);
  notifyModeChange();

  return Object.freeze({ resetSize, restorePanel, toggleIconOnly, toggleOptions, persistPosition });
}
