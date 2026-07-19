import { describe, expect, it, vi } from 'vitest';
import { createBatchOpenRecapPreviewModel } from '../../src/reward/batch-open-recap.js';
import { showBatchOpenRecap } from '../../src/ui/batch-open-recap.js';

function harness() {
  const created = [];
  const body = [];
  const create = (tagName) => {
    const listeners = new Map();
    const element = {
      tagName, style: {}, children: [], textContent: '',
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
  it('renders preview rows and celebrates special cards', async () => {
    const ui = harness();
    const celebrate = vi.fn();
    const promise = showBatchOpenRecap({
      dom: ui.dom,
      model: createBatchOpenRecapPreviewModel(),
      celebrate,
      formatPrice: (price) => `${price / 1000}k`,
    });
    expect(ui.created.find((element) => element.textContent === 'Batch Open Recap Preview')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === 'Preview Special A')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === 'Rare Gold x2')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === 'Common Gold x1')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === 'Rare Silver x1')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === 'Common Bronze x1')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent.includes('price:1250k'))).toBeTruthy();
    expect(celebrate).toHaveBeenCalledWith(expect.anything(), 2);
    ui.created.find((element) => element.textContent === 'Close').click();
    await expect(promise).resolves.toBe(true);
  });

  it('shows the reason when a batch stops with preserved Unassigned items', () => {
    const ui = harness();
    void showBatchOpenRecap({
      dom: ui.dom,
      model: {
        status: 'preserved', reason: 'storage capacity 0/3', requestedPacks: 2, packsOpened: 1,
        skippedPacks: 1, itemCount: 4, specialCount: 0, normalGoldCount: 4,
        normalSilverCount: 0, normalBronzeCount: 0, omittedCount: 0, rows: [],
      },
    });
    expect(ui.created.find((element) => element.textContent === 'preserved: storage capacity 0/3')).toBeTruthy();
  });
});
