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
      click(event = {}) { listeners.get('click')?.(event); },
      keydown(event = {}) { listeners.get('keydown')?.(event); },
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
        { item: { id: 1, name: 'Player One' }, rating: 90, special: true, duplicate: false, price: 135000 },
        { item: { id: 2, name: 'Player Two' }, rating: 89, special: false, duplicate: true, price: 85000 },
        { item: { id: 3, name: 'Player Three' }, rating: 88, special: false, duplicate: false, price: null },
      ],
      pickCount: 2,
      reason: 'tie',
      describeCandidate: (candidate) => `Player ${candidate.item.id}`,
      formatPrice: (price) => `${price / 1000}k`,
      resolveFutbinPlayerId: (item) => (item.id === 1 ? 12345 : null),
      scheduleStopCheck: () => 7,
      cancelStopCheck,
      isStopping: () => false,
    });

    const cards = harness.created.filter((element) => element.role === 'button');
    const confirm = harness.created.find((element) => element.textContent === 'Confirm selection');
    const linkedName = harness.created.find((element) => element.textContent === 'Player One');
    expect(linkedName).toMatchObject({
      tagName: 'a',
      href: 'https://www.futbin.com/26/player/12345/1',
      target: '_blank',
      rel: 'noopener noreferrer',
      style: expect.objectContaining({ gridColumn: '1', gridRow: '1', textDecoration: 'underline' }),
    });
    expect(harness.created.find((element) => element.textContent === 'Player Two')).toMatchObject({ tagName: 'span' });
    const ratingBadge = harness.created.find((element) => element.textContent === '90'
      && element.style?.background && element.style?.borderRadius === '2px');
    expect(ratingBadge).toMatchObject({ style: expect.objectContaining({ fontWeight: '700' }) });
    expect(harness.created.find((element) => element.textContent === 'new')).toBeTruthy();
    expect(harness.created.find((element) => element.textContent === 'dupe')).toBeTruthy();
    const priceNode = harness.created.find((element) => element.textContent === 'price:135k');
    expect(priceNode).toMatchObject({
      style: expect.objectContaining({ marginLeft: 'auto', fontWeight: '700' }),
    });
    expect(confirm.disabled).toBe(true);
    const stopPropagation = vi.fn();
    linkedName.click({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(confirm.disabled).toBe(true);
    cards[0].click();
    expect(confirm.disabled).toBe(true);
    cards[1].click();
    expect(confirm.disabled).toBe(false);
    confirm.click();

    await expect(promise).resolves.toEqual([{ id: 1, name: 'Player One' }, { id: 2, name: 'Player Two' }]);
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

  it('uses the EA native theme accent when resolveNativeTheme is provided', () => {
    const harness = createUiHarness();
    const resolveNativeTheme = vi.fn((item) => ({
      background: { r: 0xC4, g: 0x66, b: 0x9F },
      foreground: { r: 0xFF, g: 0xFF, b: 0xFF },
      accent: { r: 0xFF, g: 0xC2, b: 0xD6 },
      source: 'EA Rarity',
    }));
    const cancelStopCheck = vi.fn();
    const promise = waitForManualPlayerPickSelection({
      dom: harness.dom,
      ranked: [{ item: { id: 1, name: 'Special 96' }, rating: 96, special: true, rare: false, duplicate: false, price: 220000 }],
      pickCount: 1,
      reason: 'special',
      describeCandidate: () => 'Special 96',
      formatPrice: (price) => `${price / 1000}k`,
      resolveNativeTheme,
      scheduleStopCheck: () => 11,
      cancelStopCheck,
      isStopping: () => false,
    });

    expect(resolveNativeTheme).toHaveBeenCalledWith({ id: 1, name: 'Special 96' });
    const card = harness.created.find((element) => element.role === 'button');
    expect(card.style.borderLeft).toContain('#FFC2D6');
    expect(card.style.background).toContain('#C4669F');
    card.click();
    harness.created.find((element) => element.textContent === 'Confirm selection').click();
    return expect(promise).resolves.toEqual([{ id: 1, name: 'Special 96' }]).then(() => {
      expect(cancelStopCheck).toHaveBeenCalledWith(11);
    });
  });

  it('adds a green NEW ribbon only on non-duplicate candidates', () => {
    const harness = createUiHarness();
    waitForManualPlayerPickSelection({
      dom: harness.dom,
      ranked: [
        { item: { id: 1, name: 'New Card' }, rating: 95, special: true, duplicate: false, price: 100000 },
        { item: { id: 2, name: 'Owned Card' }, rating: 96, special: true, duplicate: true, price: 50000 },
      ],
      pickCount: 1,
      reason: 'special',
      describeCandidate: () => '',
      scheduleStopCheck: () => 13,
      cancelStopCheck: vi.fn(),
      isStopping: () => false,
    });
    const ribbons = harness.created.filter((element) => element.textContent === 'NEW' && element.style?.position === 'absolute');
    expect(ribbons).toHaveLength(1);
    expect(ribbons[0]).toMatchObject({ style: expect.objectContaining({ background: '#64d77a', fontWeight: '800' }) });
    const dupeCard = harness.created.filter((element) => element.role === 'button')[1];
    expect(dupeCard.style.opacity).toBeFalsy();
    expect(dupeCard.style.filter).toBeFalsy();
  });
});
