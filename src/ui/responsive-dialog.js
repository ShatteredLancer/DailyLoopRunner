function rootAttribute(root, attribute, datasetKey) {
  return root?.getAttribute?.(attribute) || root?.dataset?.[datasetKey] || '';
}

export function readResponsiveUiMode(dom) {
  const root = dom?.query?.(':root') || null;
  const layout = rootAttribute(root, 'data-dlr-layout', 'dlrLayout') || 'desktop';
  const input = rootAttribute(root, 'data-dlr-input', 'dlrInput') || 'pointer';
  return Object.freeze({
    layout,
    input,
    mobile: layout === 'mobile',
    touchTargets: layout === 'mobile' || input === 'touch',
  });
}

export function responsiveControlHeight(mode, desktopHeight = 30) {
  return `${mode?.touchTargets ? 44 : Math.max(24, Number(desktopHeight || 30))}px`;
}

export function applyResponsiveDialogLayout(options = {}) {
  const mode = options.mode || readResponsiveUiMode(options.dom);
  const overlay = options.overlay;
  const dialog = options.dialog;
  if (mode.mobile) {
    Object.assign(overlay?.style || {}, {
      alignItems: 'stretch',
      justifyContent: 'stretch',
      padding: '0',
    });
    Object.assign(dialog?.style || {}, {
      width: '100%',
      height: '100dvh',
      maxHeight: '100dvh',
      overflow: 'auto',
      overscrollBehavior: 'contain',
      border: '0',
      padding: 'max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px))',
    });
    Object.assign(options.title?.style || {}, {
      position: 'sticky',
      top: '0',
      zIndex: '2',
      background: '#171b21',
      padding: '6px 0 10px',
    });
    Object.assign(options.actions?.style || {}, {
      position: 'sticky',
      bottom: '0',
      zIndex: '2',
      background: '#171b21',
      padding: '10px 0 max(4px, env(safe-area-inset-bottom, 0px))',
    });
  }
  if (mode.touchTargets) {
    for (const control of options.controls || []) {
      if (!control?.style) continue;
      control.style.minHeight = '44px';
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(String(control.tagName || '').toUpperCase())) {
        control.style.fontSize = '16px';
      }
    }
  }
  return mode;
}
