import { describe, expect, it, vi } from 'vitest';
import { createPlayerPickRecapPreviewModel } from '../../src/reward/player-pick-recap.js';
import { createPlayerPickRecapModel, showPlayerPickRecap } from '../../src/ui/player-pick-recap.js';

function createUiHarness() {
  const created = [];
  const body = [];
  const create = (tagName) => {
    const listeners = new Map();
    const children = [];
    const element = {
      tagName, style: {}, textContent: '', removed: false, children, disabled: false,
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
  return { body, created, dom: { create, query: () => null, appendToBody(element) { body.push(element); } } };
}

const PICK_RESULTS = [
  { resumed: true, pickedCards: [{ item: { name: 'Player A', rating: 88, tier: 'gold', rare: true }, rating: 88, special: false, duplicate: true, destination: 'storage', price: 12000 }] },
  { pickedCards: [{ item: { name: 'Player B', rating: 92, tier: 'gold', rareflag: 2 }, rating: 92, special: true, duplicate: false, destination: 'club', price: 80000 }] },
];

describe('Player Pick recap UI', () => {
  it('builds a stable summary, keeps compatibility fields, and sorts by rating', () => {
    const model = createPlayerPickRecapModel(PICK_RESULTS);
    expect(model).toEqual(expect.objectContaining({
      minRating: 88, maxRating: 92, specialCount: 1, duplicateCount: 1,
      highRatedCount: 1, resumedCount: 1, destinations: { storage: 1, club: 1 },
    }));
    expect(model.rows.map((row) => row.card.item.name)).toEqual(['Player B', 'Player A']);
    expect(model.rows.map((row) => row.tierLabel)).toEqual(['Special 94-', 'Rare Gold']);
    expect(createPlayerPickRecapModel([])).toBeNull();
    expect(createPlayerPickRecapModel([], { status: 'blocked', reason: 'missing fodder', name: 'Pick' }))
      .toMatchObject({ status: 'blocked', reason: 'missing fodder', totalRows: 0, pageCount: 1 });
  });

  it('renders a selected card as Rare Gold when the captured Pick metadata confirms its rarity', () => {
    const model = createPlayerPickRecapModel([{
      pickedCards: [{
        item: { name: 'Static Rare Flag', rating: 84, tier: 'gold' },
        rating: 84,
        rare: true,
        special: false,
        duplicate: false,
        destination: 'club',
      }],
    }]);
    expect(model.rows[0]).toMatchObject({ rare: true, tierLabel: 'Rare Gold' });
  });

  it('renders prices, destinations, stopped reason, and resolves when Close is clicked', async () => {
    const harness = createUiHarness();
    const cancelStopCheck = vi.fn();
    const celebrate = vi.fn();
    const onClose = vi.fn();
    const promise = showPlayerPickRecap({
      dom: harness.dom, name: '84+ Pick', pickResults: PICK_RESULTS, status: 'stopped', reason: 'stopped by user',
      itemDisplayName: (item) => item.name, formatPrice: (price) => `${price / 1000}K`,
      scheduleStopCheck: () => 17, cancelStopCheck, isStopping: () => false, celebrate, onClose,
    });
    expect(harness.created.find((element) => element.textContent === 'Player Pick Recap: 84+ Pick')).toBeTruthy();
    expect(harness.created.find((element) => element.textContent.includes('2 pick(s), 2 card(s), rating 88-92'))).toBeTruthy();
    expect(harness.created.find((element) => element.textContent === 'stopped: stopped by user')).toBeTruthy();
    expect(harness.created.find((element) => element.textContent.includes('price:80K'))).toBeTruthy();
    expect(harness.created.find((element) => element.textContent === '->CLUB')).toBeTruthy();
    expect(celebrate).toHaveBeenCalledWith(expect.anything(), 1);
    harness.created.find((element) => element.textContent === 'Close').click();
    await expect(promise).resolves.toBe(true);
    expect(harness.body[0].removed).toBe(true);
    expect(cancelStopCheck).toHaveBeenCalledWith(17);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('provides a 23-card Preview and closes at the next stop check', async () => {
    const model = createPlayerPickRecapPreviewModel();
    expect(model).toMatchObject({ status: 'preview', totalRows: 23, pageCount: 2 });
    const harness = createUiHarness();
    let stopCheck;
    const promise = showPlayerPickRecap({
      dom: harness.dom, model, formatPrice: () => '',
      scheduleStopCheck: (callback) => { stopCheck = callback; return 5; },
      cancelStopCheck: vi.fn(), isStopping: () => true,
    });
    stopCheck();
    await expect(promise).resolves.toBe(true);
    expect(harness.body[0].removed).toBe(true);
  });
});
