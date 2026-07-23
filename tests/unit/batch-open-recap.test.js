import { describe, expect, it } from 'vitest';
import {
  createBatchOpenRecapModel,
  createBatchOpenRecapPreviewModel,
} from '../../src/reward/batch-open-recap.js';

describe('Batch Open recap model', () => {
  it('lists every player individually while retaining pack and tier summaries', () => {
    const model = createBatchOpenRecapModel({
      requestedPacks: 4,
      packsOpened: 3,
      skippedPacks: 1,
      openedItems: [
        { id: 1, definitionId: 101, type: 'player', name: 'Special 95', rating: 95, special: true, rareflag: 2 },
        { id: 2, definitionId: 102, type: 'player', name: 'Special 88', rating: 88, rareflag: 2 },
        { id: 3, type: 'player', name: 'Gold A', rating: 89, tier: 'gold', rare: true },
        { id: 4, type: 'player', name: 'Gold B', rating: 89, tier: 'gold', rareflag: 1 },
        { id: 5, type: 'player', name: 'Gold C', rating: 89, tier: 'gold', rare: false },
        { id: 6, type: 'player', name: 'Gold D', rating: 84, tier: 'gold', rare: false },
        { id: 7, type: 'player', name: 'Silver A', rating: 74, tier: 'silver', rare: true },
        { id: 8, type: 'player', name: 'Bronze A', rating: 63, tier: 'bronze', rare: false },
        { id: 9, type: 'consumable' },
      ],
      prices: new Map([[101, 125000], [102, 48000]]),
    });
    expect(model).toMatchObject({
      requestedPacks: 4,
      packsOpened: 3,
      skippedPacks: 1,
      itemCount: 9,
      totalRows: 8,
      specialCount: 2,
      normalGoldCount: 4,
      normalSilverCount: 1,
      normalBronzeCount: 1,
      omittedCount: 1,
    });
    expect(model.rows.map((row) => `${row.rating} ${row.name}`)).toEqual([
      '95 Special 95',
      '89 Gold A',
      '89 Gold B',
      '89 Gold C',
      '88 Special 88',
      '84 Gold D',
      '74 Silver A',
      '63 Bronze A',
    ]);
    expect(model.rows[0]).toMatchObject({ price: 125000, tierLabel: 'Special 95-97' });
    expect(model.rows[1].tierLabel).toBe('Rare Gold');
    expect(model.rows[3].tierLabel).toBe('Common Gold');
  });

  it('provides 23 deterministic preview rows to exercise pagination without side effects', () => {
    const model = createBatchOpenRecapPreviewModel();
    expect(model).toMatchObject({ status: 'preview', totalRows: 23, pageCount: 2 });
    expect(model.reason).toContain('no pack was opened');
    expect(model.specialCount).toBeGreaterThan(2);
    expect(model.rows[0].rating).toBe(99);
  });
});
