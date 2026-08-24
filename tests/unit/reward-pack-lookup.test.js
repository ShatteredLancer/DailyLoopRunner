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

  it('finds a previously scanned reward from the same activity family after the selected SBC reward ID changes', async () => {
    const olderProvision = { id: 20643, name: '85+ Provisions Pack' };
    const unrelated = { id: 99999, name: 'Provisions Pack Preview' };
    const { api } = await loadUserscript({ packs: [unrelated, olderProvision] });
    const definition = {
      rewardPackIds: [21346],
      rewardPackNames: ['87+ Repeatable Provisions Pack'],
      activityFamilyRewardPackIds: [20643, 21346],
      activityFamilyRewardPackNames: ['85+ Provisions Pack', '87+ Repeatable Provisions Pack'],
    };

    expect(api.findRewardPackInCache(definition, null, { repositoryOnly: true })).toBe(olderProvision);
  });

  it('does not use a similar unverified name as an activity-family reward fallback', async () => {
    const unrelated = { id: 99999, name: '85+ Provisions Pack Preview' };
    const { api } = await loadUserscript({ packs: [unrelated] });

    expect(api.findRewardPackInCache({
      rewardPackNames: ['85+ Provisions Pack'],
      activityFamilyRewardPackNames: ['85+ Provisions Pack'],
    }, null, { repositoryOnly: true })).toBeNull();
  });

  it('does not use an exact but unverified name when scanned family reward IDs are available', async () => {
    const unrelated = { id: 99999, name: '85+ Provisions Pack' };
    const { api } = await loadUserscript({ packs: [unrelated] });

    expect(api.findRewardPackInCache({
      rewardPackIds: [21346],
      rewardPackNames: ['85+ Provisions Pack'],
      activityFamilyRewardPackIds: [20643, 21346],
      activityFamilyRewardPackNames: ['85+ Provisions Pack'],
    }, null, { repositoryOnly: true })).toBeNull();
  });
});
