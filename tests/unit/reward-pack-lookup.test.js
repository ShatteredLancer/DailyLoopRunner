import { describe, expect, it } from 'vitest';
import { loadUserscript } from '../helpers/load-userscript.js';

describe('reward pack lookup', () => {
  it('excludes Store catalog fallback objects from repository-only Rolling lookups', async () => {
    const repositoryPack = { id: 1039, name: '4x 84+ Rare Gold Players Pack' };
    const catalogPack = { id: 20503, name: '5x 80+ Gold Players Pack' };
    const { api } = await loadUserscript({ packs: [repositoryPack] });
    api.state.lastStorePacks = [catalogPack];
    const definition = {
      rewardPackIds: [20503],
      rewardPackNames: ['5x 80+ Gold Players Pack'],
    };

    expect(api.findRewardPackInCache(definition, null)).toBe(catalogPack);
    expect(api.findRewardPackInCache(definition, null, { repositoryOnly: true })).toBeNull();
  });

  it('still returns real My Packs instances for repository-only lookups', async () => {
    const first = { id: 20503, name: '5x 80+ Gold Players Pack', instance: 1 };
    const second = { id: 20503, name: '5x 80+ Gold Players Pack', instance: 2 };
    const { api } = await loadUserscript({ packs: [first, second] });
    api.state.lastStorePacks = [{ id: 20503, name: 'catalog fallback' }];

    expect(api.findRewardPackInCache({ rewardPackIds: [20503] }, null, {
      repositoryOnly: true,
    })).toBe(first);
  });
});
