import { describe, expect, it } from 'vitest';
import { showLoopRecap } from '../../src/ui/loop-recap.js';

function harness() {
  const created = [];
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
  return { created, dom: { create, query: () => null, appendToBody: () => {} } };
}

describe('Rolling recap UI', () => {
  it('renders bounded-run details without changing the shared pagination contract', async () => {
    const ui = harness();
    const promise = showLoopRecap({
      dom: ui.dom,
      model: {
        modalId: 'rolling-recap',
        title: 'Rolling Recap',
        summary: '2 cycles, 2 packs',
        status: 'stopped',
        reason: 'Storage full',
        details: [
          { label: 'Recoveries', value: 'TOTW 1 | Provisions 2' },
          { label: 'Retention', value: '50 retained row(s); omitted top:10' },
        ],
        specialCount: 0,
        pageCount: 1,
        pageSize: 15,
        totalRows: 0,
        rows: [],
      },
    });

    expect(ui.created.find((element) => element.textContent === 'Recoveries')).toBeTruthy();
    expect(ui.created.find((element) => element.textContent.includes('TOTW 1'))).toBeTruthy();
    expect(ui.created.find((element) => element.textContent === 'Retention')).toBeTruthy();
    ui.created.find((element) => element.textContent === 'Close').click();
    await expect(promise).resolves.toBe(true);
  });
});
