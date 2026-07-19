import { describe, expect, it, vi } from 'vitest';
import { showPackHighlightToast } from '../../src/ui/reward-highlight.js';

function harness() {
  const byId = new Map();
  const body = [];
  const created = [];
  const create = (tagName) => {
    const listeners = new Map();
    const children = [];
    const element = {
      tagName,
      style: {},
      children,
      textContent: '',
      parent: null,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { items.forEach((item) => element.appendChild(item)); },
      appendChild(item) { children.push(item); item.parent = element; if (item.id) byId.set(`#${item.id}`, item); },
      remove() {
        if (element.parent) element.parent.children.splice(element.parent.children.indexOf(element), 1);
        const bodyIndex = body.indexOf(element);
        if (bodyIndex >= 0) body.splice(bodyIndex, 1);
        if (element.id) byId.delete(`#${element.id}`);
      },
      click() { listeners.get('click')?.({ target: element }); },
    };
    Object.defineProperty(element, 'firstChild', { get: () => children[0] || null });
    created.push(element);
    return element;
  };
  return {
    body,
    created,
    dom: {
      create,
      query: (selector) => byId.get(selector) || null,
      appendToBody(element) { body.push(element); element.parent = { children: body }; if (element.id) byId.set(`#${element.id}`, element); },
    },
  };
}

describe('pack reward highlight UI', () => {
  it('shows a non-blocking stacked toast, celebrates, and schedules dismissal', () => {
    const ui = harness();
    const callbacks = [];
    const celebrate = vi.fn();
    const shown = showPackHighlightToast({
      dom: ui.dom,
      panel: { getBoundingClientRect: () => ({ right: 900, top: 600, bottom: 778 }) },
      viewport: () => ({ width: 1200, height: 800 }),
      model: {
        pack: { name: 'Reward Pack' },
        maxRating: 96,
        cards: [{ name: 'Player A', rating: 96, duplicate: true, tradeable: false }],
      },
      schedule: (callback, delay) => { callbacks.push({ callback, delay }); return callbacks.length; },
      cancel: vi.fn(),
      celebrate,
    });

    expect(shown).toBe(true);
    expect(ui.body).toHaveLength(1);
    expect(ui.created.find((item) => item.textContent === '96 Special Highlight')).toBeTruthy();
    expect(ui.created.find((item) => item.textContent.includes('Player A - 96'))).toBeTruthy();
    expect(celebrate).toHaveBeenCalledWith(expect.anything(), 1);
    expect(callbacks[0].delay).toBe(7000);
  });

  it('positions below a panel near the top of the viewport', () => {
    const ui = harness();
    showPackHighlightToast({
      dom: ui.dom,
      panel: { getBoundingClientRect: () => ({ right: 900, top: 10, bottom: 188 }) },
      viewport: () => ({ width: 1200, height: 800 }),
      model: { pack: { name: 'Pack' }, maxRating: 96, cards: [{ name: 'A', rating: 96 }] },
      schedule: () => 1,
    });
    expect(ui.body[0].style.top).toBe('198px');
    expect(ui.body[0].style.bottom).toBe('auto');
  });

  it('does nothing when there are no matching cards', () => {
    expect(showPackHighlightToast({ dom: harness().dom, model: { cards: [] } })).toBe(false);
  });
});
