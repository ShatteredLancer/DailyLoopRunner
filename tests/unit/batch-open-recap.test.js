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
        { id: 10, type: 'player', name: 'Nested Rare', rating: 84, tier: 'gold', _staticData: { rareflag: 1 } },
        { id: 9, type: 'consumable' },
      ],
      prices: new Map([[101, 125000], [102, 48000]]),
      resolveFutbinPlayerId: (openedItem) => openedItem.definitionId === 101 ? 16453 : null,
    });
    expect(model).toMatchObject({
      requestedPacks: 4,
      packsOpened: 3,
      skippedPacks: 1,
      itemCount: 10,
      totalRows: 9,
      specialCount: 2,
      normalGoldCount: 5,
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
      '84 Nested Rare',
      '74 Silver A',
      '63 Bronze A',
    ]);
    expect(model.rows[0]).toMatchObject({ price: 125000, tierLabel: 'Special 95-97' });
    expect(model.rows[0].futbinUrl).toBe('https://www.futbin.com/26/player/16453/1');
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

  it('hydrates lightweight pack entities and projects receipt destinations', () => {
    const model = createBatchOpenRecapModel({
      receipts: [{
        status: 'opened',
        packRef: { name: '10x 85+ Rare Gold Players Pack' },
        openedItems: [
          { id: 41, definitionId: 401, rating: 96, rareflag: 7 },
          { id: 42, definitionId: 402, type: 'player', rating: 88, rareflag: 1 },
        ],
        routedItemRefs: [{ id: 41, definitionId: 401, pile: 'transfer' }],
        reservedItemRefs: [{ id: 42, definitionId: 402, pile: 'unassigned' }],
      }],
      hydrateItem: (item) => item.id === 41
        ? { ...item, type: 'player', _staticData: { commonName: 'Hydrated Star' } }
        : item,
    });
    expect(model).toMatchObject({ qualifyingCount: 2, hasQualifyingCards: true });
    expect(model.rows[0]).toMatchObject({ name: 'Hydrated Star', destination: 'transfer', sourceLabel: '10x85+' });
    expect(model.rows[1]).toMatchObject({ destination: 'unassigned' });
  });
});
