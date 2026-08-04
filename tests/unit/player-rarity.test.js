import { describe, expect, it } from 'vitest';
import {
  isRarePlayerCard,
  isSpecialPlayerCard,
  normalPlayerRarity,
  readPlayerRareFlag,
} from '../../src/domain/player-rarity.js';

describe('canonical player rarity', () => {
  it('reads every EA rarity location through one conservative rule', () => {
    expect(readPlayerRareFlag({ _staticData: { rareflag: 1 } })).toBe(1);
    expect(readPlayerRareFlag({ _data: { rareFlag: 2 } })).toBe(2);
    expect(readPlayerRareFlag({ rareflag: 0, _staticData: { rareflag: 1 } })).toBe(1);
    expect(readPlayerRareFlag({ rareflag: 0, isSpecial: () => true })).toBe(2);
  });

  it('uses the same classification for selection, diagnostics, and recap snapshots', () => {
    const common = { rareflag: 0 };
    const rare = { _staticData: { rareflag: 1 } };
    const special = { _data: { rareflag: 7 } };

    expect([isRarePlayerCard(common), isSpecialPlayerCard(common), normalPlayerRarity(common)])
      .toEqual([false, false, 'common']);
    expect([isRarePlayerCard(rare), isSpecialPlayerCard(rare), normalPlayerRarity(rare)])
      .toEqual([true, false, 'rare']);
    expect([isRarePlayerCard(special), isSpecialPlayerCard(special), normalPlayerRarity(special)])
      .toEqual([true, true, 'special']);
  });
});
