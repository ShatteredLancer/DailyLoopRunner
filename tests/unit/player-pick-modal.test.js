import { describe, expect, it, vi } from 'vitest';
import { waitForManualPlayerPickSelection } from '../../src/ui/player-pick-modal.js';

function createUiHarness() {
  const created = [];
  const body = [];
  const create = (tagName) => {
    const listeners = new Map();
    const children = [];
    const element = {
      tagName,
      style: {},
      disabled: false,
      textContent: '',
      removed: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { children.push(...items); },
      appendChild(item) { children.push(item); },
      remove() { element.removed = true; },
      click() { listeners.get('click')?.(); },
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
      appendToBody(element) { body.push(element); },
    },
  };
}

describe('manual Player Pick modal', () => {
  it('requires exactly the configured number of selections before confirming', async () => {
    const harness = createUiHarness();
    const cancelStopCheck = vi.fn();
    const promise = waitForManualPlayerPickSelection({
      dom: harness.dom,
      ranked: [
        { item: { id: 1 }, rating: 90 },
        { item: { id: 2 }, rating: 89 },
        { item: { id: 3 }, rating: 88 },
      ],
      pickCount: 2,
      reason: 'tie',
      describeCandidate: (candidate) => `Player ${candidate.item.id}`,
      scheduleStopCheck: () => 7,
      cancelStopCheck,
      isStopping: () => false,
    });

    const cards = harness.created.filter((element) => /^Player \d+$/.test(element.textContent));
    const confirm = harness.created.find((element) => element.textContent === 'Confirm selection');
    expect(confirm.disabled).toBe(true);
    cards[0].click();
    expect(confirm.disabled).toBe(true);
    cards[1].click();
    expect(confirm.disabled).toBe(false);
    confirm.click();

    await expect(promise).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(harness.body[0].removed).toBe(true);
    expect(cancelStopCheck).toHaveBeenCalledWith(7);
  });

  it('rejects and removes the modal when Stop is requested', async () => {
    const harness = createUiHarness();
    let stopCheck;
    const promise = waitForManualPlayerPickSelection({
      dom: harness.dom,
      ranked: [{ item: { id: 1 }, rating: 90 }],
      pickCount: 1,
      reason: 'manual',
      describeCandidate: () => 'Player 1',
      scheduleStopCheck: (callback) => { stopCheck = callback; return 9; },
      cancelStopCheck: vi.fn(),
      isStopping: () => true,
    });

    stopCheck();
    await expect(promise).rejects.toThrow(/Stopped by user/);
    expect(harness.body[0].removed).toBe(true);
  });
});
