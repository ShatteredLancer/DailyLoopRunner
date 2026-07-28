import { describe, expect, it } from 'vitest';
import {
  buildActivityBindingSession,
  parseBasicUpgradeActivitySnapshot,
} from '../../src/config/activity-discovery.js';
import {
  buildUpgradeDiscoverySession,
  collectScannedUpgradeActivities,
} from '../../src/config/upgrade-discovery.js';

function quality(tier, count) {
  return { key: 'PLAYER_QUALITY', values: [{ bronze: 1, silver: 2, gold: 3 }[tier]], count };
}

function rarity(value, count) {
  return { key: 'PLAYER_RARITY', values: [value === 'rare' ? 1 : 0], count };
}

function set({ id = 100, name = 'Upgrade', requirements, players, reward = 'Reward Pack', repeats = 10 } = {}) {
  return {
    id,
    name,
    inUpgradesCategory: true,
    timesCompleted: 0,
    repeats,
    rewards: [{ type: 'PACK', packId: id + 1000, name: reward }],
    challenges: [{
      id: id + 1,
      requiredPlayerCount: players,
      eligibilityRequirements: requirements,
    }],
  };
}

describe('basic Upgrade activity discovery', () => {
  it.each([
    ['daily-bronze-upgrade', set({ players: 1, requirements: [quality('bronze', -1)] })],
    ['daily-silver-upgrade', set({ players: 1, requirements: [quality('silver', -1)] })],
    ['daily-common-gold-upgrade', set({ players: 10, requirements: [quality('bronze', 5), quality('silver', 5)] })],
    ['daily-rare-gold-upgrade', set({ players: 5, requirements: [quality('gold', -1), rarity('common', -1)] })],
    ['bronze-upgrade', set({ players: 11, requirements: [quality('bronze', -1)] })],
    ['silver-upgrade', set({ players: 11, requirements: [quality('silver', -1)] })],
    ['gold-upgrade', set({ players: 11, requirements: [quality('gold', -1), rarity('common', -1)] })],
    ['common-gold-crafting-upgrade', set({ name: '5x 80+ Upgrade', reward: '5x 80+ Rare Gold Players Pack', players: 9, requirements: [quality('gold', -1), rarity('common', -1)] })],
    ['2x84-upgrade', set({ name: '2x 84+ Upgrade', reward: '2x 84+ Rare Gold Players Pack', players: 6, requirements: [quality('gold', -1), rarity('rare', -1)] })],
  ])('classifies %s from verified Challenge structure', (familyId, snapshot) => {
    expect(parseBasicUpgradeActivitySnapshot({ set: snapshot })).toMatchObject({
      status: 'supported',
      familyId,
      activity: { familyId, setId: snapshot.id },
    });
  });

  it('rejects unsupported or incomplete Challenge conditions', () => {
    const snapshot = set({
      players: 5,
      requirements: [quality('gold', -1), rarity('common', -1), { key: 'CHEMISTRY_POINTS', values: [10], count: -1 }],
    });
    const parsed = parseBasicUpgradeActivitySnapshot({ set: snapshot });
    expect(parsed.status).toBe('unsupported');
    expect(parsed.diagnostics.join(' ')).toContain('CHEMISTRY_POINTS');
  });

  it('materializes direct, nested and recovery bindings while preserving safety policy', () => {
    const snapshot = set({
      id: 500,
      name: 'Current 5x 80+ Upgrade',
      reward: 'Current 5x 80+ Rare Gold Players Pack',
      players: 9,
      requirements: [quality('gold', -1), rarity('common', -1)],
    });
    const boundUpgrade = {
      name: 'Compatibility Upgrade',
      activityBinding: { family: 'common-gold-crafting-upgrade', category: 'Upgrades', required: true },
      sbcNames: ['Old Upgrade'],
      requirements: [{
        tier: 'gold', rarity: 'common', count: 9, maxRating: 81, protectHighGold: true,
        priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      }],
    };
    const session = buildActivityBindingSession({
      sets: [snapshot],
      configuredLoops: [{
        id: 'nested',
        strategy: 'inventoryExhaustion',
        stages: [boundUpgrade],
      }],
      recoveryRecipes: [{ id: 'recovery', ...boundUpgrade }],
    });

    expect(session.loopOverrides.nested.stages[0]).toMatchObject({
      sbcSetIds: [500],
      sbcNames: ['Current 5x 80+ Upgrade', 'Old Upgrade'],
      rewardPackIds: [1500],
      scannedMetadata: true,
      requirements: [expect.objectContaining({ maxRating: 81, protectHighGold: true, count: 9 })],
    });
    expect(session.recoveryRecipeOverrides.recovery).toMatchObject({ sbcSetIds: [500], activityResolved: true });
    expect(session.activities[0].consumers).toEqual(['Loop:nested', 'Recovery:recovery']);
  });

  it('keeps configured requirement order while refreshing scanned counts', () => {
    const session = buildActivityBindingSession({
      sets: [set({
        id: 510,
        name: 'Daily Common Gold Upgrade',
        players: 10,
        requirements: [quality('bronze', 5), quality('silver', 5)],
      })],
      configuredLoops: [{
        id: 'daily-common',
        strategy: 'supplyAndCraft',
        activityBinding: { family: 'daily-common-gold-upgrade', category: 'Upgrades', required: true },
        sbcNames: ['Compatibility Daily Common'],
        requirements: [
          { tier: 'silver', count: 4, priorityPiles: ['unassigned', 'storage'] },
          { tier: 'bronze', count: 6, priorityPiles: ['storage', 'club'] },
        ],
      }],
    });

    expect(session.loopOverrides['daily-common'].requirements).toEqual([
      expect.objectContaining({ tier: 'silver', count: 5, priorityPiles: ['unassigned', 'storage'] }),
      expect.objectContaining({ tier: 'bronze', count: 5, priorityPiles: ['storage', 'club'] }),
    ]);
  });

  it('preserves x10 rating metadata while resolving nested TOTW and 2x84 activities', () => {
    const x10Template = {
      id: '84x10',
      name: '84x10 Loop',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['Compatibility 84x10'],
      ratingSbcFill: { targetRating: 87, priorityPiles: ['unassigned', 'storage', 'club'] },
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      requiredSpecialKind: 'totw-tots-fof',
      autoTotwUpgrade: {
        name: 'Compatibility TOTW',
        activityBinding: { family: 'totw-upgrade', category: 'Upgrades', required: true },
        sbcNames: ['Old TOTW Upgrade'],
      },
      autoFodderUpgrade: {
        name: 'Compatibility 2x84',
        activityBinding: { family: '2x84-upgrade', category: 'Upgrades', required: false },
        sbcNames: ['Old 2x84 Upgrade'],
      },
    };
    const totwTemplate = {
      id: 'auto-totw-upgrade',
      name: 'TOTW Loop',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['Old TOTW Upgrade'],
      ratingSbcFill: { targetRating: 84 },
    };
    const x10 = {
      id: 840,
      name: '10x 84+ Upgrade',
      inUpgradesCategory: true,
      timesCompleted: 0,
      repeats: 5,
      rewards: [{ type: 'PACK', packId: 284, name: '10x 84+ Players Pack' }],
      challenges: [{
        id: 8401,
        requiredPlayerCount: 11,
        eligibilityRequirements: [
          { key: 'TEAM_RATING', values: [88], count: -1 },
          { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
        ],
      }],
    };
    const totw = {
      id: 841,
      name: '84+ TOTW Upgrade',
      inUpgradesCategory: true,
      timesCompleted: 0,
      repeats: 10,
      rewards: [{ type: 'PACK', packId: 20707, name: '84+ TOTW Pack' }],
      challenges: [{
        id: 8411,
        requiredPlayerCount: 11,
        eligibilityRequirements: [{ key: 'TEAM_RATING', values: [84], count: -1 }],
      }],
    };
    const fodder = set({
      id: 842,
      name: '2x 84+ Upgrade',
      reward: '2x 84+ Rare Gold Players Pack',
      players: 6,
      requirements: [quality('gold', -1), rarity('rare', -1)],
    });
    const upgradeSession = buildUpgradeDiscoverySession({
      sets: [x10, totw, fodder],
      configuredLoops: [x10Template, totwTemplate],
      x10Template,
      totwTemplate,
    });
    const specializedX10 = upgradeSession.loopOverrides['84x10'];
    const activitySession = buildActivityBindingSession({
      sets: [x10, totw, fodder],
      configuredLoops: [specializedX10],
      additionalActivities: collectScannedUpgradeActivities(upgradeSession.results),
    });

    expect(activitySession.loopOverrides['84x10']).toMatchObject({
      sbcSetIds: [840],
      dynamicRewardMinRating: 84,
      ratingSbcFill: { targetRating: 88 },
      autoTotwUpgrade: { sbcSetIds: [841], dynamicSbcFamily: 'totw-upgrade', activityResolved: true },
      autoFodderUpgrade: { sbcSetIds: [842], dynamicSbcFamily: '2x84-upgrade', activityResolved: true },
    });
    expect(activitySession.activities.find((activity) => activity.familyId === 'totw-upgrade').consumers)
      .toEqual(['Loop:84x10']);
    expect(activitySession.activities.find((activity) => activity.familyId === '2x84-upgrade').consumers)
      .toEqual(['Loop:84x10']);
  });

  it('does not choose between multiple Sets for the same family', () => {
    const first = set({ id: 1, players: 1, requirements: [quality('bronze', -1)] });
    const second = set({ id: 2, players: 1, requirements: [quality('bronze', -1)] });
    const loop = {
      id: 'daily-bronze',
      strategy: 'dailySingleCardRecycle',
      activityBinding: { family: 'daily-bronze-upgrade', category: 'Upgrades', required: true },
      sbcNames: ['Fallback'],
    };
    const session = buildActivityBindingSession({ sets: [first, second], configuredLoops: [loop] });
    expect(session.loopOverrides).toEqual({});
    expect(session.diagnostics.join(' ')).toContain('ambiguous');
  });
});
