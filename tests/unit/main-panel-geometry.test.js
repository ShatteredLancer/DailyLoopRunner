import { describe, expect, it, vi } from 'vitest';
import {
  clampMainPanelDefaultSize,
  createMainPanelGeometry,
  getMainPanelDefaultSize,
  normalizeMainPanelLogHeight,
  normalizeMobileIconPosition,
} from '../../src/ui/main-panel-geometry.js';

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle(name) {
      if (values.has(name)) {
        values.delete(name);
        return false;
      }
      values.add(name);
      return true;
    },
  };
}

function element() {
  const listeners = new Map();
  return {
    textContent: '',
    title: '',
    addEventListener(type, callback) { listeners.set(type, callback); },
    emit(type, event = {}) { listeners.get(type)?.(event); },
    setPointerCapture: vi.fn(),
  };
}

function harness(options = {}) {
  const viewport = options.viewport || { width: 1200, height: 800 };
  const controls = new Map([
    ['#bronze-loop-options-toggle', element()],
    ['#bronze-loop-collapse', element()],
    ['#bronze-loop-drag', element()],
    ['#bronze-loop-mobile-tab-run', element()],
    ['#bronze-loop-mobile-tab-options', element()],
    ['#bronze-loop-mobile-tab-log', element()],
    ...['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => [`#bronze-loop-resize-${dir}`, element()]),
  ]);
  const log = element();
  log.style = {};
  log.getBoundingClientRect = () => ({ height: Number.parseFloat(log.style.height) || 110 });
  controls.set('#bronze-loop-log', log);
  controls.set('#bronze-loop-log-resize', element());
  const panel = {
    classList: classList(),
    dataset: {},
    style: {},
    querySelector: (selector) => controls.get(selector) || null,
    getBoundingClientRect() {
      if (panel.dataset.layout === 'mobile' && panel.classList.contains('icon-only')) {
        return {
          left: Number.parseFloat(panel.style['--dlr-mobile-icon-left']) || viewport.width - 58,
          top: Number.parseFloat(panel.style['--dlr-mobile-icon-top']) || viewport.height - 58,
          width: 48,
          height: 48,
        };
      }
      return {
        left: Number.parseFloat(panel.style.left) || 100,
        top: Number.parseFloat(panel.style.top) || 80,
        width: Number.parseFloat(panel.style.width) || 300,
        height: Number.parseFloat(panel.style.height) || 178,
      };
    },
  };
  const saved = [];
  const savedLogHeights = [];
  const modes = [];
  const scheduled = [];
  const savedMobileTabs = [];
  const savedMobileIconPositions = [];
  const geometry = createMainPanelGeometry({
    panel,
    getViewport: () => viewport,
    loadPosition: () => options.savedPosition || null,
    savePosition: (position) => saved.push(position),
    loadLogHeight: () => options.savedLogHeight ?? null,
    saveLogHeight: (height) => savedLogHeights.push(height),
    loadMobileTab: () => options.mobileTab || 'run',
    saveMobileTab: (tab) => savedMobileTabs.push(tab),
    loadMobileIconPosition: () => options.savedMobileIconPosition || null,
    saveMobileIconPosition: (position) => savedMobileIconPositions.push(position),
    onModeChange: (mode) => modes.push(mode),
    schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
  });
  return {
    panel,
    controls,
    geometry,
    saved,
    savedLogHeights,
    savedMobileTabs,
    savedMobileIconPositions,
    modes,
    scheduled,
    viewport,
  };
}

function pointerEvent(values = {}) {
  return {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    target: { closest: () => null },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...values,
  };
}

describe('main panel geometry', () => {
  it('uses complete compact/options defaults and clamps them to the viewport', () => {
    expect(getMainPanelDefaultSize(false)).toEqual({ width: 300, height: 178 });
    expect(getMainPanelDefaultSize(true)).toEqual({ width: 360, height: 620 });
    expect(clampMainPanelDefaultSize({ width: 360, height: 620 }, { width: 340, height: 500 }))
      .toEqual({ width: 320, height: 480 });
    expect(normalizeMobileIconPosition({ left: 500, top: -20 }, { width: 390, height: 844 }))
      .toEqual({ left: 336, top: 6 });
    expect(normalizeMobileIconPosition(null, { width: 390, height: 844 })).toBeNull();
  });

  it('starts compact, toggles Options/Hide, and resets each mode to its full default size', () => {
    const { panel, controls } = harness();
    const optionsButton = controls.get('#bronze-loop-options-toggle');
    expect(panel.style.width).toBe('300px');
    expect(panel.style.height).toBe('178px');
    expect(optionsButton.textContent).toBe('Options');

    optionsButton.emit('click');
    expect(panel.classList.contains('options-open')).toBe(true);
    expect(panel.style.width).toBe('360px');
    expect(panel.style.height).toBe('620px');
    expect(panel.dataset.minWidth).toBe('360');
    expect(panel.dataset.minHeight).toBe('620');
    expect(optionsButton.textContent).toBe('Hide');

    optionsButton.emit('click');
    expect(panel.classList.contains('options-open')).toBe(false);
    expect(panel.style.width).toBe('300px');
    expect(panel.style.height).toBe('178px');
    expect(optionsButton.textContent).toBe('Options');
  });

  it('keeps the L button and restores the compact panel from icon-only mode', () => {
    const { panel, controls } = harness();
    const collapse = controls.get('#bronze-loop-collapse');
    expect(collapse.textContent).toBe('L');
    expect(collapse.title).toBe('Collapse to icon');

    collapse.emit('click', pointerEvent());
    expect(panel.classList.contains('icon-only')).toBe(true);
    expect(collapse.textContent).toBe('L');
    expect(collapse.title).toBe('Restore panel');

    collapse.emit('click', pointerEvent());
    expect(panel.classList.contains('icon-only')).toBe(false);
    expect(panel.style.width).toBe('300px');
    expect(panel.style.height).toBe('178px');
    expect(collapse.textContent).toBe('L');
  });

  it('allows icon dragging without an immediate click toggling it back', () => {
    const { panel, controls, scheduled } = harness();
    const collapse = controls.get('#bronze-loop-collapse');
    const drag = controls.get('#bronze-loop-drag');
    collapse.emit('click', pointerEvent());
    expect(panel.classList.contains('icon-only')).toBe(true);

    drag.emit('pointerdown', pointerEvent({ clientX: 100, clientY: 80 }));
    drag.emit('pointermove', pointerEvent({ clientX: 130, clientY: 100 }));
    drag.emit('pointerup', pointerEvent({ clientX: 130, clientY: 100 }));
    const click = pointerEvent();
    collapse.emit('click', click);
    expect(panel.classList.contains('icon-only')).toBe(true);
    expect(click.preventDefault).toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delay).toBe(150);
  });

  it('prevents resize below the active mode default size', () => {
    const { panel, controls } = harness();
    controls.get('#bronze-loop-options-toggle').emit('click');
    const southeast = controls.get('#bronze-loop-resize-se');
    southeast.emit('pointerdown', pointerEvent({ clientX: 460, clientY: 700 }));
    southeast.emit('pointermove', pointerEvent({ clientX: 100, clientY: 100 }));
    southeast.emit('pointerup', pointerEvent({ clientX: 100, clientY: 100 }));
    expect(panel.style.width).toBe('360px');
    expect(panel.style.height).toBe('620px');
  });

  it('restores and persists an independently resized full log height', () => {
    const { controls, savedLogHeights } = harness({ savedLogHeight: 236 });
    const log = controls.get('#bronze-loop-log');
    const resize = controls.get('#bronze-loop-log-resize');
    expect(log.style.height).toBe('236px');
    resize.emit('pointerdown', pointerEvent({ clientY: 100 }));
    resize.emit('pointermove', pointerEvent({ clientY: 148 }));
    resize.emit('pointerup', pointerEvent({ clientY: 148 }));
    expect(log.style.height).toBe('284px');
    expect(savedLogHeights).toEqual([284]);
    expect(normalizeMainPanelLogHeight(10)).toBe(64);
    expect(normalizeMainPanelLogHeight(9999)).toBe(720);
  });

  it('switches to a non-draggable mobile sheet and persists mobile tabs separately', () => {
    const { panel, controls, geometry, savedMobileTabs } = harness();
    geometry.setResponsiveMode({ layout: 'mobile', input: 'touch' });
    expect(panel.dataset).toMatchObject({ layout: 'mobile', input: 'touch', mobileTab: 'run' });
    expect(panel.style).toMatchObject({ left: '', top: '', width: '', height: '' });

    controls.get('#bronze-loop-drag').emit('pointerdown', pointerEvent({ clientX: 100, clientY: 80 }));
    controls.get('#bronze-loop-drag').emit('pointermove', pointerEvent({ clientX: 200, clientY: 180 }));
    expect(panel.style.left).toBe('');
    controls.get('#bronze-loop-mobile-tab-log').emit('click');
    expect(panel.dataset.mobileTab).toBe('log');
    expect(savedMobileTabs).toEqual(['log']);

    geometry.setResponsiveMode({ layout: 'desktop', input: 'pointer' });
    expect(panel.dataset.layout).toBe('desktop');
    expect(panel.style.width).toBe('300px');
  });

  it('drags and persists the collapsed mobile icon without overwriting Desktop geometry', () => {
    const { panel, controls, geometry, saved, savedMobileIconPositions, scheduled } = harness();
    geometry.setResponsiveMode({ layout: 'mobile', input: 'touch' });
    const desktopSaveCount = saved.length;
    controls.get('#bronze-loop-collapse').emit('click', pointerEvent());
    expect(panel.classList.contains('icon-only')).toBe(true);

    const drag = controls.get('#bronze-loop-drag');
    drag.emit('pointerdown', pointerEvent({ clientX: 1150, clientY: 750 }));
    drag.emit('pointermove', pointerEvent({ clientX: 250, clientY: 180 }));
    drag.emit('pointerup', pointerEvent({ clientX: 250, clientY: 180 }));

    expect(panel.style).toMatchObject({
      '--dlr-mobile-icon-left': '242px',
      '--dlr-mobile-icon-right': 'auto',
      '--dlr-mobile-icon-top': '172px',
      '--dlr-mobile-icon-bottom': 'auto',
    });
    expect(savedMobileIconPositions).toEqual([{ left: 242, top: 172 }]);
    expect(saved).toHaveLength(desktopSaveCount);

    const click = pointerEvent();
    controls.get('#bronze-loop-collapse').emit('click', click);
    expect(panel.classList.contains('icon-only')).toBe(true);
    expect(click.preventDefault).toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
  });
});
