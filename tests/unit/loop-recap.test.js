import { describe, expect, it } from 'vitest';
import {
  createLoopRecapModel,
  hasRecapRareGoldOrAbove,
  isRecapRareGoldOrAbove,
} from '../../src/reward/loop-recap.js';

function item(overrides = {}) {
  return {
    id: 1,
    definitionId: 101,
    type: 'player',
    name: 'Player',
    rating: 84,
    tier: 'gold',
    rare: false,
    rareflag: 0,
    ...overrides,
  };
}

describe('generic Loop recap', () => {
  it('requires a Rare Gold or Special player before creating a recap', () => {
    expect(isRecapRareGoldOrAbove(item())).toBe(false);
    expect(isRecapRareGoldOrAbove(item({ rare: true }))).toBe(true);
    expect(isRecapRareGoldOrAbove(item({ special: true, rareflag: 7 }))).toBe(true);
    expect(hasRecapRareGoldOrAbove([{ type: 'non-player' }, item({ rare: true })])).toBe(true);
    expect(createLoopRecapModel({ name: 'Bronze Loop', openedItems: [item()] })).toBeNull();
  });

  it('projects all opened players, preserves status, and uses receipt pack labels', () => {
    const special = item({ id: 2, definitionId: 202, name: 'Special Player', rating: 96, rare: true, rareflag: 8, special: true });
    const rareGold = item({ id: 3, definitionId: 303, name: 'Rare Gold Player', rating: 84, rare: true, rareflag: 1 });
    const model = createLoopRecapModel({
      name: 'Daily Rare',
      status: 'stopped',
      reason: 'stopped by user',
      receipts: [{ status: 'opened', packRef: { name: 'Rare Gold Pack' }, openedItems: [special, rareGold] }],
      prices: new Map([[202, 125000]]),
    });
    expect(model).toMatchObject({
      kind: 'loop', title: 'Daily Rare Recap', status: 'stopped', reason: 'stopped by user',
      packsOpened: 1, itemCount: 2, qualifyingCount: 2, hasQualifyingCards: true,
    });
    expect(model.rows).toHaveLength(2);
    expect(model.rows[0]).toMatchObject({ name: 'Special Player', price: 125000, sourceLabel: 'Rare Gold Pack' });
    expect(model.rows[1]).toMatchObject({ name: 'Rare Gold Player', showPrice: false, tierLabel: 'Rare Gold' });
  });
});
