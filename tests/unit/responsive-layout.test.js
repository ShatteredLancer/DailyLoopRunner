import { describe, expect, it, vi } from 'vitest';
import {
  createResponsiveLayoutController,
  normalizeLayoutOverride,
  resolveResponsiveLayout,
} from '../../src/ui/responsive-layout.js';

function eventTarget(values = {}) {
  const listeners = new Map();
  return {
    ...values,
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    emit(type) { listeners.get(type)?.(); },
  };
}

describe('responsive layout', () => {
  it('separates viewport layout from touch input capability', () => {
    expect(resolveResponsiveLayout({ width: 1440, height: 900 })).toMatchObject({ layout: 'desktop', input: 'pointer' });
    expect(resolveResponsiveLayout({ width: 1440, height: 900, coarsePointer: true })).toMatchObject({ layout: 'desktop', input: 'touch' });
    expect(resolveResponsiveLayout({ width: 900, height: 1100, coarsePointer: true })).toMatchObject({ layout: 'tablet', input: 'touch' });
    expect(resolveResponsiveLayout({ width: 390, height: 844, coarsePointer: true })).toMatchObject({ layout: 'mobile', input: 'touch' });
    expect(resolveResponsiveLayout({ width: 844, height: 390, coarsePointer: true })).toMatchObject({ layout: 'mobile', input: 'touch' });
  });

  it('lets a valid manual override win without changing input sizing', () => {
    expect(resolveResponsiveLayout({ width: 390, height: 844, coarsePointer: true }, 'desktop'))
      .toMatchObject({ layout: 'desktop', input: 'touch', override: 'desktop' });
    expect(resolveResponsiveLayout({ width: 1440, height: 900 }, 'mobile'))
      .toMatchObject({ layout: 'mobile', input: 'pointer', override: 'mobile' });
    expect(normalizeLayoutOverride('invalid')).toBe('auto');
  });

  it('persists overrides and responds to visual viewport changes', () => {
    const root = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    const visualViewport = eventTarget({ width: 390, height: 844 });
    const coarse = eventTarget({ matches: true });
    const hover = eventTarget({ matches: true });
    const windowObject = eventTarget({
      innerWidth: 390,
      innerHeight: 844,
      visualViewport,
      matchMedia: (query) => query.includes('pointer') ? coarse : hover,
    });
    const saveOverride = vi.fn();
    const changes = [];
    const controller = createResponsiveLayoutController({
      windowObject,
      root,
      loadOverride: () => 'auto',
      saveOverride,
      onChange: (snapshot) => changes.push(snapshot),
    });

    expect(controller.getSnapshot()).toMatchObject({ layout: 'mobile', input: 'touch' });
    expect(root.attributes['data-dlr-layout']).toBe('mobile');
    controller.setOverride('desktop');
    expect(saveOverride).toHaveBeenCalledWith('desktop');
    expect(controller.getSnapshot().layout).toBe('desktop');
    controller.setOverride('auto');
    visualViewport.width = 800;
    visualViewport.height = 1000;
    visualViewport.emit('resize');
    expect(controller.getSnapshot().layout).toBe('tablet');
    expect(changes.length).toBeGreaterThanOrEqual(4);
    controller.destroy();
  });
});
