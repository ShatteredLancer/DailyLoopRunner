import { describe, expect, it } from 'vitest';
import { loadUserscript } from '../helpers/load-userscript.js';

describe('Rare Pack recycling preflight', () => {
  it('stops before app or pack access when the required semantic activity is unresolved', async () => {
    const { api } = await loadUserscript();
    const result = await api.runRarePackCraftLoop({
      id: 'daily-rare-pack-84',
      name: 'Daily Rare Pack Recycling Loop',
      strategy: 'rarePackTo84Upgrade',
      sourcePackNames: ['Source Pack'],
      rareUpgrade: {
        name: 'Rare Gold Recycling Upgrade',
        activityBinding: {
          family: 'rare-gold-material-upgrade',
          classes: ['premium', 'baseline'],
          preference: 'reward-first',
          required: true,
        },
        sbcNames: ['Compatibility Upgrade'],
        requirements: [{ tier: 'gold', rarity: 'rare', count: 6 }],
      },
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'unavailable',
      packsOpened: 0,
      stageCompletions: { rare: 0 },
      reason: 'required scanned activity unavailable: rare-gold-material-upgrade',
    }));
    expect(api.state.logLines.join(' ')).toContain('stopping before opening a source pack');
  });

  it('reuses the selected semantic activity for source-exhausted inventory fallback', async () => {
    const { api } = await loadUserscript();
    const fallback = api.getBoundRarePackFallbackDef({ id: 'daily-rare-pack-84' }, {
      name: '3x 85+ Upgrade',
      activityResolved: true,
      activityBinding: { family: 'rare-gold-material-upgrade' },
      sbcSetIds: [1900],
      sbcNames: ['3x 85+ Upgrade'],
      requirements: [{ tier: 'gold', rarity: 'rare', count: 5 }],
    }, 'rare-gold-material-upgrade');

    expect(fallback).toMatchObject({
      id: 'daily-rare-pack-84-inventory-fallback',
      name: '3x 85+ Upgrade',
      strategy: 'fillAndVerifySbc',
      sbcSetIds: [1900],
      requirements: [{ tier: 'gold', rarity: 'rare', count: 5 }],
    });
    expect(api.getBoundRarePackFallbackDef({}, {
      activityResolved: false,
      activityBinding: { family: 'rare-gold-material-upgrade' },
    }, 'rare-gold-material-upgrade')).toBeNull();
  });

  it('blocks a source pack when it is also produced by the same recycling loop', async () => {
    const { api } = await loadUserscript({
      packs: [{ id: 30060, name: '5x 80+ Rare Gold Players Pack' }],
    });
    api.state.packCatalog = {
      loopRewards: {
        'daily-rare': {
          packIds: [30060],
          packNames: ['5x 80+ Rare Gold Players Pack'],
        },
      },
    };

    const result = await api.runRarePackCraftLoop({
      id: 'daily-rare-pack-80x5',
      name: 'Daily Rare Pack to 5x80+ Loop',
      strategy: 'rarePackTo84Upgrade',
      sourcePackRef: { rewardOfLoopId: 'daily-rare' },
      sourcePackIds: [30060],
      sourcePackNames: ['5x 80+ Rare Gold Players Pack'],
      rareUpgrade: {
        name: '5x80+ Rare Gold Recycling Upgrade',
        activityResolved: true,
        activityBinding: { family: 'common-gold-material-upgrade', required: true },
        rewardPackIds: [30060],
        rewardPackNames: ['5x 80+ Rare Gold Players Pack'],
        sbcNames: ['5x 80+ Upgrade'],
        requirements: [{ tier: 'gold', count: 9, goldConsumption: 'common-first' }],
      },
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      packsOpened: 0,
      stageCompletions: { rare: 0 },
      reason: 'source/output pack identity overlap',
    }));
    expect(api.state.logLines.join(' ')).toContain('source/output pack identity overlap detected');
  });

  it('finds unresolved required material stages in any Loop container', async () => {
    const { api } = await loadUserscript();
    expect(api.unresolvedRequiredMaterialActivities({
      name: 'Provision',
      craftingUpgrades: [{
        name: 'Common Premium',
        activityBinding: { family: 'common-gold-material-upgrade', required: true },
      }, {
        name: 'Rare Recycling',
        activityResolved: true,
        activityBinding: { family: 'rare-gold-material-upgrade', required: true },
      }],
    })).toEqual([
      expect.objectContaining({ family: 'common-gold-material-upgrade' }),
    ]);
  });
});
