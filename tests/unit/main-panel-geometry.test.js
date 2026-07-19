import { describe, expect, it, vi } from 'vitest';
import {
  clampMainPanelDefaultSize,
  createMainPanelGeometry,
  getMainPanelDefaultSize,
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
  const controls = new Map([
    ['#bronze-loop-options-toggle', element()],
    ['#bronze-loop-collapse', element()],
    ['#bronze-loop-drag', element()],
    ...['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => [`#bronze-loop-resize-${dir}`, element()]),
  ]);
  const panel = {
    classList: classList(),
    dataset: {},
    style: {},
    querySelector: (selector) => controls.get(selector) || null,
    getBoundingClientRect() {
      return {
        left: Number.parseFloat(panel.style.left) || 100,
        top: Number.parseFloat(panel.style.top) || 80,
        width: Number.parseFloat(panel.style.width) || 300,
        height: Number.parseFloat(panel.style.height) || 178,
      };
    },
  };
  const saved = [];
  const modes = [];
  const scheduled = [];
  const geometry = createMainPanelGeometry({
    panel,
    getViewport: () => ({ width: 1200, height: 800 }),
    loadPosition: () => options.savedPosition || null,
    savePosition: (position) => saved.push(position),
    onModeChange: (mode) => modes.push(mode),
    schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
  });
  return { panel, controls, geometry, saved, modes, scheduled };
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
});
