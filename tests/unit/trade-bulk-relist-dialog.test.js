import { describe, expect, it, vi } from 'vitest';
import { showTradeBulkRelistDialog } from '../../src/ui/trade-bulk-relist-dialog.js';

function uiHarness() {
  const created = [];
  const root = { dataset: { dlrLayout: 'desktop', dlrInput: 'pointer' }, getAttribute: () => null };
  const create = (tagName) => {
    const listeners = new Map();
    const attributes = new Map();
    const element = {
      tagName, style: {}, dataset: {}, children: [], value: '', checked: false, disabled: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { element.children.push(...items); },
      appendChild(item) { element.children.push(item); return item; },
      remove() { element.removed = true; },
      click() { return listeners.get('click')?.({ target: element }); },
      change() { return listeners.get('change')?.({ target: element }); },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) || null; },
    };
    let text = '';
    Object.defineProperty(element, 'textContent', {
      get: () => text,
      set(value) { text = String(value); if (text === '') element.children = []; },
    });
    created.push(element);
    return element;
  };
  return {
    created,
    byId: (id) => created.find((element) => element.id === id),
    dom: { create, query: (selector) => selector === ':root' ? root : null, appendToBody: vi.fn() },
  };
}

function preview(unsoldCount = 2) {
  return {
    ready: true,
    blockers: [],
    snapshot: {
      unsoldCount,
      byState: unsoldCount ? { inactive: unsoldCount } : {},
      items: Array.from({ length: unsoldCount }, (_, index) => ({
        item: { id: index + 1 }, name: `Player ${index + 1}`, rating: 84,
        auction: { tradeId: 1001 + index, startingBid: 650, buyNowPrice: 700 },
      })),
    },
    confirmation: { token: 'secret', action: 'bulk-relist', itemCount: unsoldCount },
  };
}

describe('Trade bulk relist dialog', () => {
  it('renders above the Trade Scheduler overlay', () => {
    const ui = uiHarness();
    showTradeBulkRelistDialog({ dom: ui.dom });
    const overlay = ui.byId('bronze-loop-trade-bulk-relist-modal');
    expect(Number(overlay.style.zIndex)).toBeGreaterThan(1_000_000);
  });

  it('uses a checkbox and direct button instead of requiring confirmation text', async () => {
    const ui = uiHarness();
    const onExecute = vi.fn(async () => ({ status: 'completed', requested: 2, succeeded: 2 }));
    showTradeBulkRelistDialog({
      dom: ui.dom,
      onPreview: async () => preview(2),
      onExecute,
    });
    expect(ui.created.some((element) => element.type === 'text')).toBe(false);
    await ui.byId('bronze-loop-trade-bulk-relist-preview').click();
    const execute = ui.byId('bronze-loop-trade-bulk-relist-execute');
    expect(execute.disabled).toBe(true);
    const risk = ui.byId('bronze-loop-trade-bulk-relist-risk');
    risk.checked = true;
    risk.change();
    expect(execute.disabled).toBe(false);
    await execute.click();
    expect(onExecute).toHaveBeenCalledWith({ approved: true, preview: expect.any(Object), confirmationToken: 'secret' });
  });

  it('allows an empty check without risk acceptance and sends no hidden text', async () => {
    const ui = uiHarness();
    const onExecute = vi.fn(async () => ({ status: 'completed', reason: 'skipped-empty', requested: 0, succeeded: 0 }));
    showTradeBulkRelistDialog({ dom: ui.dom, onPreview: async () => preview(0), onExecute });
    await ui.byId('bronze-loop-trade-bulk-relist-preview').click();
    const execute = ui.byId('bronze-loop-trade-bulk-relist-execute');
    expect(execute.textContent).toBe('Confirm empty check');
    expect(execute.disabled).toBe(false);
    await execute.click();
    expect(onExecute).toHaveBeenCalledOnce();
  });
});
