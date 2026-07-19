import { describe, expect, it, vi } from 'vitest';
import { createPlayerPickRecapModel, showPlayerPickRecap } from '../../src/ui/player-pick-recap.js';

function createUiHarness() {
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
      children,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { children.push(...items); },
      appendChild(item) { children.push(item); },
      remove() { element.removed = true; },
      click() { listeners.get('click')?.({ target: element }); },
      dispatch(type, event) { listeners.get(type)?.(event); },
    };
    created.push(element);
    return element;
  };
  return {
    body,
    created,
    dom: {
      create,
      appendToBody(element) { body.push(element); },
    },
  };
}

const PICK_RESULTS = [
  {
    resumed: true,
    pickedCards: [
      { item: { name: 'Player A' }, rating: 88, special: false, duplicate: true, destination: 'storage', price: 12000 },
    ],
  },
  {
    pickedCards: [
      { item: { name: 'Player B' }, rating: 92, special: true, duplicate: false, destination: 'club', price: 80000 },
    ],
  },
];

describe('Player Pick recap UI', () => {
  it('builds a stable summary and sorts rows by rating before pick order', () => {
    const model = createPlayerPickRecapModel(PICK_RESULTS);
    expect(model).toEqual(expect.objectContaining({
      minRating: 88,
      maxRating: 92,
      specialCount: 1,
      duplicateCount: 1,
      highRatedCount: 1,
      resumedCount: 1,
      destinations: { storage: 1, club: 1 },
    }));
    expect(model.rows.map((row) => row.card.item.name)).toEqual(['Player B', 'Player A']);
    expect(createPlayerPickRecapModel([])).toBeNull();
  });

  it('renders recap prices and resolves when Close is clicked', async () => {
    const harness = createUiHarness();
    const cancelStopCheck = vi.fn();
    const celebrate = vi.fn();
    const onClose = vi.fn();
    const promise = showPlayerPickRecap({
      dom: harness.dom,
      name: '84+ Pick',
      pickResults: PICK_RESULTS,
      itemDisplayName: (item) => item.name,
      formatPrice: (price) => `${price / 1000}K`,
      scheduleStopCheck: () => 17,
      cancelStopCheck,
      isStopping: () => false,
      celebrate,
      onClose,
    });

    expect(harness.created.find((element) => element.textContent === 'Player Pick Recap: 84+ Pick')).toBeTruthy();
    expect(harness.created.find((element) => element.textContent.includes('2 pick(s), 2 card(s), rating 88-92'))).toBeTruthy();
    expect(harness.created.find((element) => element.textContent === 'special, price:80K')).toBeTruthy();
    expect(harness.created.find((element) => element.textContent === 'normal, duplicate, price:12K')).toBeTruthy();
    expect(celebrate).toHaveBeenCalledWith(expect.anything(), 1);

    harness.created.find((element) => element.textContent === 'Close').click();
    await expect(promise).resolves.toBe(true);
    expect(harness.body[0].removed).toBe(true);
    expect(cancelStopCheck).toHaveBeenCalledWith(17);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes at the next stop check without requiring user input', async () => {
    const harness = createUiHarness();
    let stopCheck;
    const promise = showPlayerPickRecap({
      dom: harness.dom,
      name: 'Pick',
      pickResults: PICK_RESULTS,
      itemDisplayName: (item) => item.name,
      formatPrice: () => '',
      scheduleStopCheck: (callback) => { stopCheck = callback; return 5; },
      cancelStopCheck: vi.fn(),
      isStopping: () => true,
    });

    stopCheck();
    await expect(promise).resolves.toBe(true);
    expect(harness.body[0].removed).toBe(true);
  });
});
