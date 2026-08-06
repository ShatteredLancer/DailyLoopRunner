export const RESPONSIVE_LAYOUT_OVERRIDES = Object.freeze(['auto', 'desktop', 'mobile']);

export function normalizeLayoutOverride(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return RESPONSIVE_LAYOUT_OVERRIDES.includes(normalized) ? normalized : 'auto';
}

export function resolveResponsiveLayout(metrics = {}, override = 'auto') {
  const normalizedOverride = normalizeLayoutOverride(override);
  const width = Math.max(0, Number(metrics.width || 0));
  const height = Math.max(0, Number(metrics.height || 0));
  const touchInput = metrics.coarsePointer === true || metrics.hoverNone === true;
  let layout;
  if (normalizedOverride !== 'auto') {
    layout = normalizedOverride;
  } else if (width <= 620 || (touchInput && height <= 620)) {
    layout = 'mobile';
  } else if (width <= 1024) {
    layout = 'tablet';
  } else {
    layout = 'desktop';
  }
  return Object.freeze({
    layout,
    input: touchInput ? 'touch' : 'pointer',
    override: normalizedOverride,
    width,
    height,
  });
}

function setRootSnapshot(root, snapshot) {
  if (!root?.setAttribute) return;
  root.setAttribute('data-dlr-layout', snapshot.layout);
  root.setAttribute('data-dlr-input', snapshot.input);
  root.setAttribute('data-dlr-layout-override', snapshot.override);
}

export function createResponsiveLayoutController(options = {}) {
  const windowObject = options.windowObject;
  const root = options.root;
  const loadOverride = options.loadOverride || (() => 'auto');
  const saveOverride = options.saveOverride || (() => {});
  const onChange = options.onChange || (() => {});
  const coarseQuery = windowObject?.matchMedia?.('(pointer: coarse)') || null;
  const hoverQuery = windowObject?.matchMedia?.('(hover: none)') || null;
  let override = normalizeLayoutOverride(loadOverride());
  let snapshot = null;

  function readMetrics() {
    const viewport = windowObject?.visualViewport;
    return {
      width: Number(viewport?.width || windowObject?.innerWidth || 0),
      height: Number(viewport?.height || windowObject?.innerHeight || 0),
      coarsePointer: coarseQuery?.matches === true,
      hoverNone: hoverQuery?.matches === true,
    };
  }

  function refresh() {
    const next = resolveResponsiveLayout(readMetrics(), override);
    const changed = !snapshot
      || snapshot.layout !== next.layout
      || snapshot.input !== next.input
      || snapshot.override !== next.override
      || snapshot.width !== next.width
      || snapshot.height !== next.height;
    snapshot = next;
    setRootSnapshot(root, snapshot);
    if (changed) onChange(snapshot);
    return snapshot;
  }

  function setOverride(value) {
    override = normalizeLayoutOverride(value);
    saveOverride(override);
    return refresh();
  }

  const listeners = [
    [windowObject, 'resize'],
    [windowObject, 'orientationchange'],
    [windowObject?.visualViewport, 'resize'],
    [coarseQuery, 'change'],
    [hoverQuery, 'change'],
  ].filter(([target]) => target?.addEventListener);
  listeners.forEach(([target, event]) => target.addEventListener(event, refresh));
  refresh();

  function destroy() {
    listeners.forEach(([target, event]) => target.removeEventListener?.(event, refresh));
  }

  return Object.freeze({
    destroy,
    refresh,
    setOverride,
    getSnapshot: () => snapshot,
  });
}
