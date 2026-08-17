import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeTelemetryController,
  createRuntimeTelemetrySnapshot,
} from '../../src/runtime/telemetry.js';
import {
  renderRuntimeTelemetry,
  runtimeTelemetryPhaseLabel,
} from '../../src/ui/runtime-telemetry.js';

function classList(initial = []) {
  const values = new Set(initial);
  return {
    contains: (value) => values.has(value),
    toggle(value, force) {
      if (force === true) values.add(value);
      else if (force === false) values.delete(value);
      else if (values.has(value)) values.delete(value);
      else values.add(value);
    },
  };
}

function element(id) {
  return {
    id,
    style: {},
    dataset: {},
    attributes: {},
    textContent: '',
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
  };
}

function telemetryHarness() {
  const ids = [
    'bronze-loop-runtime-telemetry',
    'bronze-loop-runtime-phase',
    'bronze-loop-runtime-cycle',
    'bronze-loop-runtime-refreshing',
    'bronze-loop-runtime-special',
    'bronze-loop-runtime-direct',
    'bronze-loop-runtime-provisions',
    'bronze-loop-runtime-totw',
    'bronze-loop-runtime-storage-value',
    'bronze-loop-runtime-storage-track',
    'bronze-loop-runtime-storage-bar',
  ];
  const controls = new Map(ids.map((id) => [id, element(id)]));
  const panel = {
    classList: classList(),
    dataset: { layout: 'desktop', input: 'pointer' },
    querySelector: (selector) => controls.get(selector.replace(/^#/, '')) || null,
  };
  return { controls, panel };
}

describe('runtime telemetry model', () => {
  it('keeps unknown metrics distinct from zero and preserves trusted values while refreshing', () => {
    const initial = createRuntimeTelemetrySnapshot({
      visible: true,
      phase: 'INDEX_INVENTORY',
      specialSlots: null,
      storageUsed: 0,
      storageCapacity: 100,
      calculating: false,
    });
    expect(initial).toMatchObject({ specialSlots: null, storageUsed: 0, storageCapacity: 100 });

    const refreshing = createRuntimeTelemetrySnapshot({
      phase: 'OPEN_X10',
      calculating: true,
    }, createRuntimeTelemetrySnapshot({
      ...initial,
      specialSlots: 7,
      directCycles: 4,
      directCyclesLimited: true,
    }));
    expect(refreshing).toMatchObject({
      phase: 'OPEN_X10',
      specialSlots: 7,
      directCycles: 4,
      directCyclesLimited: true,
      calculating: true,
    });
  });

  it('bounds untrusted counters and text', () => {
    const snapshot = createRuntimeTelemetrySnapshot({
      phase: 'x'.repeat(200),
      completedCycles: -4,
      directCycles: Number.POSITIVE_INFINITY,
      storageCapacity: 5000000,
      updatedAt: 'y'.repeat(200),
    });
    expect(snapshot.phase).toHaveLength(80);
    expect(snapshot.completedCycles).toBe(0);
    expect(snapshot.directCycles).toBeNull();
    expect(snapshot.storageCapacity).toBe(1000000);
    expect(snapshot.updatedAt).toHaveLength(80);
  });

  it('coalesces 10,000 updates into one scheduled render and supports an immediate final flush', () => {
    const callbacks = [];
    const snapshots = [];
    const controller = createRuntimeTelemetryController({
      schedule: (callback) => { callbacks.push(callback); return callbacks.length; },
      cancel: vi.fn(),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    for (let index = 0; index < 10000; index++) {
      controller.publish({ visible: true, completedCycles: index, inventoryVersion: index });
    }
    expect(callbacks).toHaveLength(1);
    callbacks[0]();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ completedCycles: 9999, inventoryVersion: 9999 });

    controller.hide();
    controller.flushNow();
    expect(snapshots.at(-1).visible).toBe(false);
  });
});

describe('runtime telemetry renderer', () => {
  it('renders phase, cycle, resources, refreshing state, and warning Storage pressure', () => {
    const { panel, controls } = telemetryHarness();
    const rendered = renderRuntimeTelemetry({
      panel,
      running: true,
      snapshot: {
        visible: true,
        phase: 'OPEN_X10',
        completedCycles: 3,
        cycleLimit: 0,
        specialSlots: 7,
        directCycles: 4,
        directCyclesLimited: true,
        provisionsBatches: 3,
        totwRecoveries: 2,
        totwRecoveriesLimited: true,
        storageUsed: 83,
        storageCapacity: 100,
        calculating: true,
      },
    });

    expect(rendered).toBe(true);
    expect(panel.classList.contains('has-runtime-telemetry')).toBe(true);
    expect(controls.get('bronze-loop-runtime-telemetry').style.display).toBe('block');
    expect(controls.get('bronze-loop-runtime-phase').textContent).toBe('Opening 10x85+ reward');
    expect(controls.get('bronze-loop-runtime-cycle').textContent).toBe('Cycle 4 / No limit');
    expect(controls.get('bronze-loop-runtime-refreshing').textContent).toBe('Refreshing');
    expect(controls.get('bronze-loop-runtime-special').textContent).toBe('7');
    expect(controls.get('bronze-loop-runtime-direct').textContent).toBe('4+');
    expect(controls.get('bronze-loop-runtime-provisions').textContent).toBe('3');
    expect(controls.get('bronze-loop-runtime-totw').textContent).toBe('2+');
    expect(controls.get('bronze-loop-runtime-storage-value').textContent).toBe('83 / 100');
    expect(controls.get('bronze-loop-runtime-storage-bar').style.width).toBe('83%');
    expect(controls.get('bronze-loop-runtime-telemetry').dataset.storagePressure).toBe('warning');
    expect(controls.get('bronze-loop-runtime-storage-track').attributes).toMatchObject({
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '83',
    });
  });

  it('uses dashes for unknown values, danger styling at 95%, and hides outside an active Rolling run', () => {
    const { panel, controls } = telemetryHarness();
    renderRuntimeTelemetry({
      panel,
      running: true,
      stopping: true,
      snapshot: {
        visible: true,
        phase: 'PLAN_PRIMARY_SQUAD',
        specialSlots: null,
        directCycles: null,
        provisionsBatches: null,
        totwRecoveries: null,
        storageUsed: 95,
        storageCapacity: 100,
      },
    });
    expect(controls.get('bronze-loop-runtime-phase').textContent).toBe('Stopping');
    expect(controls.get('bronze-loop-runtime-special').textContent).toBe('-');
    expect(controls.get('bronze-loop-runtime-telemetry').dataset.storagePressure).toBe('danger');

    renderRuntimeTelemetry({ panel, running: false, snapshot: { visible: true } });
    expect(controls.get('bronze-loop-runtime-telemetry').style.display).toBe('none');
    expect(panel.classList.contains('has-runtime-telemetry')).toBe(false);
    expect(runtimeTelemetryPhaseLabel('REDEEM_RARE_GOLD_PICK')).toBe('Redeeming Rare Gold Pick');
    expect(runtimeTelemetryPhaseLabel('CRAFT_5X80')).toBe('Crafting 5x80+');
    expect(runtimeTelemetryPhaseLabel('MAINTAIN_STORAGE')).toBe('Maintaining Storage');
  });
});
