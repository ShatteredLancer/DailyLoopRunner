import { describe, expect, it } from 'vitest';
import { requestActiveSquadConflictDecision } from '../../src/ui/active-squad-conflict-dialog.js';

function harness() {
  const created = [];
  const body = [];
  const create = (tagName) => {
    const listeners = new Map();
    const children = [];
    const element = {
      tagName,
      style: {},
      textContent: '',
      removed: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { children.push(...items); },
      appendChild(item) { children.push(item); },
      remove() { element.removed = true; },
      click(event = {}) { return listeners.get('click')?.({ target: element, ...event }); },
      emit(type, event) { return listeners.get(type)?.(event); },
      children,
    };
    created.push(element);
    return element;
  };
  return {
    created,
    body,
    dom: {
      create,
      query: () => null,
      appendToBody(element) { body.push(element); },
    },
  };
}

describe('Active Squad conflict dialog', () => {
  it.each([
    ['Use this card', 'use'],
    ['Replace card', 'replace'],
  ])('returns %s and removes the overlay', async (buttonText, expected) => {
    const ui = harness();
    const pending = requestActiveSquadConflictDecision({
      dom: ui.dom,
      items: [{ id: 10, name: 'Special Player', rating: 94, pile: 'storage' }],
    });

    expect(ui.created.find((element) => element.textContent === 'Special Player')).toBeTruthy();
    ui.created.find((element) => element.textContent === buttonText).click();
    await expect(pending).resolves.toBe(expected);
    expect(ui.body[0].removed).toBe(true);
  });

  it('treats clicking outside the dialog as the safe replace action', async () => {
    const ui = harness();
    const pending = requestActiveSquadConflictDecision({
      dom: ui.dom,
      items: [{ id: 10, name: 'Special Player', rating: 94, pile: 'storage' }],
    });

    const overlay = ui.body[0];
    overlay.emit('click', { target: overlay });
    await expect(pending).resolves.toBe('replace');
    expect(overlay.removed).toBe(true);
  });
});
