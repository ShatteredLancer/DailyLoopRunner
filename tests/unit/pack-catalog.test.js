import { describe, expect, it } from 'vitest';
import {
  bindPackCatalogLoops,
  createPackCatalog,
  recordObservedSbcReward,
  resolveSourcePackIdentity,
  updatePackCatalogInventory,
} from '../../src/pack/catalog.js';

describe('pack catalog', () => {
  it('groups current My Packs by identity and replaces inventory on refresh', () => {
    const initial = createPackCatalog({
      packs: [
        { id: 10, name: 'Pack A' },
        { id: 10, name: 'Pack A' },
        { id: 20, name: 'Pack B' },
      ],
    });
    expect(initial.inventory).toEqual([
      { id: 10, name: 'Pack A', count: 2 },
      { id: 20, name: 'Pack B', count: 1 },
    ]);

    const refreshed = updatePackCatalogInventory(initial, [{ id: 20, name: 'Pack B', count: 4 }], 2);
    expect(refreshed.inventory).toEqual([{ id: 20, name: 'Pack B', count: 4 }]);
    expect(refreshed.updatedAt).toBe(2);
  });

  it('binds Loop rewards by Set ID before falling back to a unique Set name', () => {
    const catalog = createPackCatalog({
      sbcIndexes: [
        { id: 100, name: 'Daily Common Gold Upgrade', rewards: [{ type: 'PACK', packId: 20060, name: 'Old reward' }] },
        { id: 101, name: 'Daily Common Gold Upgrade', rewards: [{ type: 'PACK', packId: 30060, name: 'New reward' }] },
      ],
      loopDefs: [
        { id: 'by-id', sbcSetIds: [101], sbcNames: ['Daily Common Gold Upgrade'] },
        { id: 'ambiguous-name', sbcNames: ['Daily Common Gold Upgrade'] },
      ],
    });

    expect(catalog.loopRewards['by-id']).toMatchObject({
      setIds: [101],
      packIds: [30060],
      matchSource: 'set-id',
    });
    expect(catalog.loopRewards['ambiguous-name']).toBeUndefined();
    expect(catalog.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'ambiguous-loop-sbc', loopId: 'ambiguous-name' }),
    ]));
  });

  it('resolves dynamic ID and name before static compatibility fallbacks', () => {
    const catalog = createPackCatalog({
      sbcIndexes: [
        { id: 1037, name: 'Daily Common Gold Upgrade', rewards: [{ type: 'PACK', packId: 30060, name: '11x Gold Players Pack' }] },
      ],
      loopDefs: [{ id: 'daily-common', sbcSetIds: [1037], sbcNames: ['Daily Common Gold Upgrade'] }],
    });
    const identity = resolveSourcePackIdentity({
      sourcePackRef: { rewardOfLoopId: 'daily-common' },
      sourcePackIds: [20060],
      sourcePackNames: ['Legacy 11x Pack'],
      catalog,
    });

    expect(identity.dynamicResolved).toBe(true);
    expect(identity.candidates).toEqual([
      { type: 'id', value: 30060, source: 'catalog' },
      { type: 'name', value: '11x Gold Players Pack', source: 'catalog' },
      { type: 'id', value: 20060, source: 'fallback' },
      { type: 'name', value: 'Legacy 11x Pack', source: 'fallback' },
    ]);
  });

  it('excludes a loop output pack from source candidates and reports the overlap', () => {
    const identity = resolveSourcePackIdentity({
      sourcePackRef: { rewardOfLoopId: 'daily-rare' },
      sourcePackIds: [20059, 30060],
      sourcePackNames: ['Daily Rare source', '5x 80+ Rare Gold Players Pack'],
      producedRewardPackIds: [30060],
      producedRewardPackNames: ['5x 80+ Rare Gold Players Pack'],
      catalog: {
        loopRewards: {
          'daily-rare': {
            packIds: [30060],
            packNames: ['5x 80+ Rare Gold Players Pack'],
          },
        },
      },
    });

    expect(identity.sourceOutputOverlap).toEqual([
      { type: 'id', value: 30060, source: 'catalog' },
      { type: 'name', value: '5x 80+ Rare Gold Players Pack', source: 'catalog' },
      { type: 'id', value: 30060, source: 'fallback' },
      { type: 'name', value: '5x 80+ Rare Gold Players Pack', source: 'fallback' },
    ]);
    expect(identity.candidates).toEqual([
      { type: 'id', value: 20059, source: 'fallback' },
      { type: 'name', value: 'Daily Rare source', source: 'fallback' },
    ]);
    expect(identity.packIds).toEqual([20059]);
    expect(identity.packNames).toEqual(['Daily Rare source']);
  });

  it('keeps static identity usable when the referenced SBC reward is unavailable', () => {
    const identity = resolveSourcePackIdentity({
      sourcePackRef: { rewardOfLoopId: 'expired-loop' },
      sourcePackIds: [20059],
      sourcePackNames: ['Rare Pack'],
      catalog: createPackCatalog(),
    });
    expect(identity.dynamicResolved).toBe(false);
    expect(identity.candidates).toEqual([
      { type: 'id', value: 20059, source: 'fallback' },
      { type: 'name', value: 'Rare Pack', source: 'fallback' },
    ]);
  });

  it('records observed reward IDs and preserves them across metadata refreshes', () => {
    const initial = createPackCatalog({
      sbcIndexes: [{ id: 1037, name: 'Daily Common Gold Upgrade', rewards: [] }],
      loopDefs: [{ id: 'daily-common', sbcSetIds: [1037] }],
    });
    const observed = recordObservedSbcReward(initial, {
      setId: 1037,
      setName: 'Daily Common Gold Upgrade',
      packId: 40060,
      packName: 'Observed Pack',
    });
    const rebound = bindPackCatalogLoops(observed, [{ id: 'daily-common', sbcSetIds: [1037] }]);
    expect(rebound.loopRewards['daily-common'].packIds).toEqual([40060]);

    const refreshed = createPackCatalog({
      sbcIndexes: [{ id: 1037, name: 'Daily Common Gold Upgrade', rewards: [] }],
      loopDefs: [{ id: 'daily-common', sbcSetIds: [1037] }],
      previousCatalog: rebound,
    });
    expect(refreshed.loopRewards['daily-common']).toMatchObject({
      packIds: [40060],
      packNames: ['Observed Pack'],
    });
  });
});
