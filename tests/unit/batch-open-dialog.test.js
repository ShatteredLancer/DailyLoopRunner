import { describe, expect, it, vi } from 'vitest';
import { showBatchOpenDialog } from '../../src/ui/batch-open-dialog.js';

function createUiHarness() {
  const created = [];
  const body = [];
  const create = (tagName) => {
    const listeners = new Map();
    const attributes = new Map();
    const element = {
      tagName,
      style: {},
      dataset: {},
      children: [],
      value: '',
      disabled: false,
      removed: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { element.children.push(...items); },
      appendChild(item) { element.children.push(item); },
      remove() { element.removed = true; },
      click() { return listeners.get('click')?.({ target: element }); },
      change() { return listeners.get('change')?.({ target: element }); },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) || null; },
      querySelector(selector) {
        if (selector === 'input') return element.children.find((child) => child.tagName === 'input') || null;
        return null;
      },
    };
    let text = '';
    Object.defineProperty(element, 'textContent', {
      get: () => text,
      set(value) {
        text = String(value);
        if (text === '') element.children = [];
      },
    });
    created.push(element);
    return element;
  };
  return {
    body,
    created,
    dom: {
      create,
      query: () => null,
      appendToBody(element) { body.push(element); },
    },
  };
}

describe('Batch Open dialog', () => {
  it('shows remembered unavailable entries, edits quantity, previews independently, and starts with normalized plan', async () => {
    const ui = createUiHarness();
    const onPreview = vi.fn();
    const onStart = vi.fn(async () => true);
    const onPlanChange = vi.fn();
    showBatchOpenDialog({
      dom: ui.dom,
      plan: { entries: [{ packId: 999, packName: 'Remembered Pack', quantity: 2 }] },
      snapshot: { total: 1, groups: [{ id: 105, name: 'Bronze Pack', count: 1 }] },
      onPreview,
      onStart,
      onPlanChange,
    });

    expect(ui.created.find((element) => element.textContent === 'Remembered Pack (#999)')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === 'unavailable')).toBeTruthy();
    const quantity = ui.created.find((element) => element.getAttribute?.('aria-label') === 'Quantity for Remembered Pack');
    quantity.value = '5';
    quantity.change();
    expect(onPlanChange).toHaveBeenLastCalledWith({
      version: 1,
      entries: [{ packId: 999, packName: 'Remembered Pack', quantity: 5 }],
    });

    ui.created.find((element) => element.textContent === 'Preview recap').click();
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();

    await ui.created.find((element) => element.textContent === 'Start batch').click();
    expect(onStart).toHaveBeenCalledWith({
      version: 1,
      entries: [{ packId: 999, packName: 'Remembered Pack', quantity: 5 }],
    });
    expect(ui.body[0].removed).toBe(true);
  });

  it('rescans My Packs and adds one pack through the Add dropdown', async () => {
    const ui = createUiHarness();
    const onScan = vi.fn(async () => ({ total: 3, groups: [{ id: 205, name: 'Silver Pack', count: 3 }] }));
    const onPlanChange = vi.fn();
    showBatchOpenDialog({ dom: ui.dom, plan: { entries: [] }, snapshot: { total: 0, groups: [] }, onScan, onPlanChange });

    await ui.created.find((element) => element.textContent === 'Scan My Packs').click();
    expect(onScan).toHaveBeenCalledOnce();
    expect(ui.created.find((element) => element.textContent === 'Silver Pack (#205) x3')).toBeTruthy();
    const addMenu = ui.created.find((element) => element.textContent === 'Add v');
    addMenu.click();
    expect(addMenu.getAttribute('aria-expanded')).toBe('true');
    ui.created.find((element) => element.textContent === 'Add 1').click();
    const quantity = ui.created.find((element) => element.getAttribute?.('aria-label') === 'Quantity for Silver Pack');
    expect(quantity.value).toBe('1');
    expect(onPlanChange).toHaveBeenCalledWith({
      version: 1,
      entries: [{ packId: 205, packName: 'Silver Pack', quantity: 1 }],
    });
  });

  it('adds every currently available pack through Add all without quantity input', () => {
    const ui = createUiHarness();
    const onPlanChange = vi.fn();
    showBatchOpenDialog({
      dom: ui.dom,
      plan: { entries: [] },
      snapshot: { total: 6, groups: [{ id: 1039, name: '4x 84+ Pack', count: 6 }] },
      onPlanChange,
    });

    ui.created.find((element) => element.textContent === 'Add v').click();
    ui.created.find((element) => element.textContent === 'Add all (6)').click();
    const quantity = ui.created.find((element) => element.getAttribute?.('aria-label') === 'Quantity for 4x 84+ Pack');
    expect(quantity.value).toBe('6');
    expect(onPlanChange).toHaveBeenCalledWith({
      version: 1,
      entries: [{ packId: 1039, packName: '4x 84+ Pack', quantity: 6 }],
    });
  });

  it('updates an existing entry to all currently available packs', () => {
    const ui = createUiHarness();
    const onPlanChange = vi.fn();
    showBatchOpenDialog({
      dom: ui.dom,
      plan: { entries: [{ packId: 1039, packName: '4x 84+ Pack', quantity: 2 }] },
      snapshot: { total: 5, groups: [{ id: 1039, name: '4x 84+ Pack', count: 5 }] },
      onPlanChange,
    });

    ui.created.find((element) => element.textContent === 'Added v').click();
    ui.created.find((element) => element.textContent === 'Set to all (5)').click();
    expect(onPlanChange).toHaveBeenCalledWith({
      version: 1,
      entries: [{ packId: 1039, packName: '4x 84+ Pack', quantity: 5 }],
    });
  });
});
