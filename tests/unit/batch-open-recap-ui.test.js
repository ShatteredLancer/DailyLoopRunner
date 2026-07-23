import { describe, expect, it, vi } from 'vitest';
import { createBatchOpenRecapPreviewModel } from '../../src/reward/batch-open-recap.js';
import { showBatchOpenRecap } from '../../src/ui/batch-open-recap.js';

function harness() {
  const created = [];
  const body = [];
  const create = (tagName) => {
    const listeners = new Map();
    const element = {
      tagName, style: {}, children: [], textContent: '', disabled: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { element.children.push(...items); },
      appendChild(item) { element.children.push(item); },
      remove() { element.removed = true; },
      click() { listeners.get('click')?.({ target: element }); },
    };
    created.push(element);
    return element;
  };
  return { created, body, dom: { create, query: () => null, appendToBody: (element) => body.push(element) } };
}

describe('Batch Open recap UI', () => {
  it('renders single-card preview rows, pages after 20, and celebrates special cards', async () => {
    const ui = harness();
    const celebrate = vi.fn();
    const promise = showBatchOpenRecap({
      dom: ui.dom,
      model: createBatchOpenRecapPreviewModel(),
      celebrate,
      formatPrice: (price) => `${price / 1000}k`,
    });
    expect(ui.created.find((element) => element.textContent === 'Batch Open Recap Preview')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === 'Preview Player 01')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === 'Page 1/2 | 1-20 of 23')).toBeTruthy();
    expect(celebrate).toHaveBeenCalled();
    ui.created.find((element) => element.textContent === 'Next').click();
    expect(ui.created.find((element) => element.textContent === 'Page 2/2 | 21-23 of 23')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === '74').style.background).toBe('#AEB7C2');
    expect(ui.created.find((element) => element.textContent === '63').style.background).toBe('#B7793E');
    ui.created.find((element) => element.textContent === 'Close').click();
    await expect(promise).resolves.toBe(true);
  });

  it('shows the reason when a batch stops with preserved Unassigned items', () => {
    const ui = harness();
    void showBatchOpenRecap({
      dom: ui.dom,
      model: {
        modalId: 'bronze-loop-batch-recap-modal', title: 'Batch Open Recap', summary: '1/2 pack(s) opened',
        status: 'preserved', reason: 'storage capacity 0/3', specialCount: 0, pageCount: 1, pageSize: 20,
        totalRows: 0, rows: [],
      },
    });
    expect(ui.created.find((element) => element.textContent === 'preserved: storage capacity 0/3')).toBeTruthy();
  });
});
