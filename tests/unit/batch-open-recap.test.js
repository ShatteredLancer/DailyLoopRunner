import { describe, expect, it } from 'vitest';
import {
  createBatchOpenRecapModel,
  createBatchOpenRecapPreviewModel,
} from '../../src/reward/batch-open-recap.js';

describe('Batch Open recap model', () => {
  it('lists priced special cards individually and groups every normal player by rating, rarity, and tier', () => {
    const model = createBatchOpenRecapModel({
      requestedPacks: 4,
      packsOpened: 3,
      skippedPacks: 1,
      openedItems: [
        { id: 1, definitionId: 101, type: 'player', name: 'Special 95', rating: 95, special: true },
        { id: 2, definitionId: 102, type: 'player', name: 'Special 88', rating: 88, rareflag: 2 },
        { id: 3, type: 'player', rating: 89, tier: 'gold', rare: true },
        { id: 4, type: 'player', rating: 89, tier: 'gold', rareflag: 1 },
        { id: 5, type: 'player', rating: 89, tier: 'gold', rare: false },
        { id: 6, type: 'player', rating: 84, tier: 'gold', rare: false },
        { id: 7, type: 'player', rating: 74, tier: 'silver', rare: true },
        { id: 8, type: 'player', rating: 63, tier: 'bronze', rare: false },
        { id: 9, type: 'consumable' },
      ],
      prices: new Map([[101, 125000], [102, 48000]]),
    });
    expect(model).toMatchObject({
      requestedPacks: 4,
      packsOpened: 3,
      skippedPacks: 1,
      itemCount: 9,
      specialCount: 2,
      normalGoldCount: 4,
      normalSilverCount: 1,
      normalBronzeCount: 1,
      omittedCount: 1,
    });
    expect(model.rows.map((row) => row.kind === 'special'
      ? `${row.rating} ${row.name} ${row.price}`
      : `${row.rating} ${row.label} x${row.count}`))
      .toEqual([
        '95 Special 95 125000',
        '89 Rare Gold x2',
        '89 Common Gold x1',
        '88 Special 88 48000',
        '84 Common Gold x1',
        '74 Rare Silver x1',
        '63 Common Bronze x1',
      ]);
  });

  it('provides deterministic preview content without notification side effects', () => {
    const model = createBatchOpenRecapPreviewModel();
    expect(model.status).toBe('preview');
    expect(model.rows.map((row) => row.rating)).toEqual([97, 95, 89, 84, 74, 63]);
    expect(model.specialCount).toBe(2);
    expect(model.rows[0].price).toBe(1250000);
  });
});
