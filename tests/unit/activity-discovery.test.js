import { describe, expect, it } from 'vitest';
import {
  buildActivityBindingSession,
  collectActivityBindingSbcNames,
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

  it('uses the Set name when EA omits Pack text and preserves unrestricted Gold eligibility', () => {
    const common = parseBasicUpgradeActivitySnapshot({
      set: set({
        id: 501,
        name: '5x 80+ Upgrade',
        reward: '',
        players: 9,
        requirements: [quality('gold', -1)],
      }),
    });
    expect(common).toMatchObject({
      status: 'supported',
      activities: expect.arrayContaining([
        expect.objectContaining({ familyId: '5x80-upgrade' }),
        expect.objectContaining({
          familyId: 'common-gold-material-upgrade',
          requirements: [{ tier: 'gold', count: 9 }],
          eligibilityRequirements: [{ tier: 'gold', count: 9 }],
          materialSink: expect.objectContaining({
            material: 'common-gold',
            className: 'premium',
            cost: 9,
            reward: expect.objectContaining({ guaranteedCount: 5, minimumRating: 80 }),
          }),
        }),
      ]),
    });

    const rare = parseBasicUpgradeActivitySnapshot({
      set: set({
        id: 502,
        name: '2x 85+ Upgrade',
        reward: '',
        players: 10,
        requirements: [quality('gold', -1), rarity('rare', -1)],
      }),
    });
    expect(rare.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        familyId: 'rare-gold-material-upgrade',
        materialSink: expect.objectContaining({ className: 'baseline' }),
      }),
    ]));
  });

  it('allows a Rare-only consumer to use an unrestricted Gold Premium but rejects Common-only eligibility', () => {
    const unrestricted = set({
      id: 503,
      name: '5x 80+ Upgrade',
      reward: '5x 80+ Rare Gold Players Pack',
      players: 9,
      requirements: [quality('gold', -1)],
    });
    const commonOnly = set({
      id: 504,
      name: '5x 80+ Common Only Upgrade',
      reward: '5x 80+ Rare Gold Players Pack',
      players: 9,
      requirements: [quality('gold', -1), rarity('common', -1)],
    });
    const loop = {
      id: 'rare-via-common-premium',
      strategy: 'rarePackTo84Upgrade',
      sourcePackNames: ['Rare source'],
      rareUpgrade: {
        name: 'Quantity-first Rare recycling',
        activityBinding: {
          family: 'common-gold-material-upgrade',
          classes: ['premium'],
          preference: 'quantity-first',
          selectionMaterial: 'rare-gold',
          required: true,
        },
        sbcNames: ['Compatibility'],
        requirements: [{ tier: 'gold', rarity: 'rare', count: 9, maxRating: 81 }],
      },
    };

    const session = buildActivityBindingSession({ sets: [commonOnly, unrestricted], configuredLoops: [loop] });
    expect(session.loopOverrides[loop.id].rareUpgrade).toMatchObject({
      name: '5x 80+ Upgrade',
      sbcSetIds: [503],
      dynamicSbcFamily: 'common-gold-material-upgrade',
      materialSinkClass: 'premium',
      requirements: [{ tier: 'gold', count: 9, maxRating: 81, goldConsumption: 'rare-only' }],
    });

    const rejected = buildActivityBindingSession({ sets: [commonOnly], configuredLoops: [loop] });
    expect(rejected.loopOverrides).toEqual({});
    expect(rejected.diagnostics.join(' ')).toContain('selection material rare-gold');
  });

  it('preserves unrestricted Gold eligibility for Common-first consumers', () => {
    const commonOnly = set({
      id: 504,
      name: '5x 80+ Common Only Upgrade',
      reward: '5x 80+ Rare Gold Players Pack',
      players: 8,
      requirements: [quality('gold', -1), rarity('common', -1)],
    });
    const unrestricted = set({
      id: 505,
      name: '5x 80+ Upgrade',
      reward: '5x 80+ Rare Gold Players Pack',
      players: 8,
      requirements: [quality('gold', -1)],
    });
    const loop = {
      id: 'common-first-recycling',
      strategy: 'rarePackTo84Upgrade',
      sourcePackNames: ['Rare source'],
      rareUpgrade: {
        name: 'Common-first recycling',
        activityBinding: {
          family: 'common-gold-material-upgrade',
          classes: ['premium'],
          preference: 'quantity-first',
          required: true,
        },
        sbcNames: ['Compatibility'],
        requirements: [{ tier: 'gold', count: 9, goldConsumption: 'common-first' }],
      },
    };

    const session = buildActivityBindingSession({ sets: [commonOnly, unrestricted], configuredLoops: [loop] });
    expect(session.loopOverrides[loop.id].rareUpgrade).toMatchObject({
      name: '5x 80+ Upgrade',
      sbcSetIds: [505],
      dynamicSbcFamily: 'common-gold-material-upgrade',
      requirements: [{ tier: 'gold', count: 8, goldConsumption: 'common-first' }],
    });
    expect(session.loopOverrides[loop.id].rareUpgrade.requirements[0].rarity).toBeUndefined();

    const rejected = buildActivityBindingSession({ sets: [commonOnly], configuredLoops: [loop] });
    expect(rejected.loopOverrides).toEqual({});
    expect(rejected.diagnostics.join(' ')).toContain('has no candidate');
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
      sbcFodderPolicy: { mode: 'low-gold', lowRatedGoldMaxRating: 82 },
      requirements: [{
        tier: 'gold', rarity: 'common', count: 9,
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
      sbcFodderPolicy: { mode: 'low-gold', lowRatedGoldMaxRating: 82 },
      requirements: [expect.objectContaining({ count: 9 })],
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

  it('preserves dynamic rating metadata while resolving nested TOTW and Rare Gold recycling activities', () => {
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
      name: '2x 85+ Upgrade',
      reward: '2x 85+ Rare Gold Players Pack',
      players: 10,
      requirements: [quality('gold', -1), rarity('rare', -1)],
    });
    const upgradeSession = buildUpgradeDiscoverySession({
      sets: [x10, totw, fodder],
      configuredLoops: [],
    });
    const specializedX10 = upgradeSession.discoveredLoops.find((loop) => loop.dynamicSbcFamily === 'high-rated-x10');
    const activitySession = buildActivityBindingSession({
      sets: [x10, totw, fodder],
      configuredLoops: [specializedX10],
      additionalActivities: collectScannedUpgradeActivities(upgradeSession.results),
    });
    const materialized = activitySession.loopOverrides[specializedX10.id];

    expect(materialized).toMatchObject({
      sbcSetIds: [840],
      dynamicRewardMinRating: 84,
      ratingSbcFill: { targetRating: 88 },
      autoTotwUpgrade: { sbcSetIds: [841], dynamicSbcFamily: 'totw-upgrade', activityResolved: true },
      autoFodderUpgrade: {
        sbcSetIds: [842],
        dynamicSbcFamily: 'rare-gold-material-upgrade',
        activityResolved: true,
        requirements: [expect.objectContaining({ tier: 'gold', rarity: 'rare', count: 10 })],
      },
    });
    expect(activitySession.activities.find((activity) => activity.familyId === 'totw-upgrade').consumers)
      .toEqual([`Loop:${specializedX10.id}`]);
    expect(activitySession.activities.find((activity) => activity.familyId === 'rare-gold-material-upgrade').consumers)
      .toEqual([`Loop:${specializedX10.id}`]);
  });

  it('selects the best Common Gold Premium while leaving Gold Upgrade as the explicit baseline', () => {
    const baseline = set({
      id: 600,
      name: 'Gold Upgrade',
      reward: 'Two Rare Gold Players Pack',
      players: 11,
      requirements: [quality('gold', -1), rarity('common', -1)],
    });
    const quantityPremium = set({
      id: 601,
      name: '6x 80+ Upgrade',
      reward: '6x 80+ Rare Gold Players Pack',
      players: 9,
      requirements: [quality('gold', -1), rarity('common', -1)],
    });
    const ratingPremium = set({
      id: 602,
      name: '3x 82+ Upgrade',
      reward: '3x 82+ Rare Gold Players Pack',
      players: 8,
      requirements: [quality('gold', -1), rarity('common', -1)],
    });
    const loop = {
      id: 'common-premium',
      strategy: 'inventoryExhaustion',
      stages: [{
        name: 'Common Gold Premium',
        activityBinding: {
          family: 'common-gold-material-upgrade',
          classes: ['premium'],
          preference: 'reward-first',
          required: true,
        },
        sbcNames: ['Compatibility'],
        requirements: [{ tier: 'gold', rarity: 'common', count: 9, maxRating: 81 }],
      }],
    };
    const session = buildActivityBindingSession({
      sets: [baseline, quantityPremium, ratingPremium],
      configuredLoops: [loop],
    });

    expect(session.loopOverrides['common-premium'].stages[0]).toMatchObject({
      name: '3x 82+ Upgrade',
      sbcSetIds: [602],
      materialSinkClass: 'premium',
      materialSinkCost: 8,
      requirements: [expect.objectContaining({ count: 8, maxRating: 81 })],
    });
    expect(session.activities.find((activity) => (
      activity.familyId === 'common-gold-material-upgrade' && activity.setId === 600
    )).materialSink.className).toBe('baseline');
    expect(session.activities.find((activity) => (
      activity.familyId === 'common-gold-material-upgrade' && activity.setId === 600
    )).consumers).toEqual([]);
    expect(session.activities.find((activity) => (
      activity.familyId === 'common-gold-material-upgrade' && activity.setId === 602
    )).consumers).toEqual(['Loop:common-premium']);
  });

  it('does not authorize an unknown reward or choose incomparable Premium candidates without a preference', () => {
    const unknown = set({
      id: 610,
      name: 'Mystery Upgrade',
      reward: 'Mystery Players Pack',
      players: 8,
      requirements: [quality('gold', -1), rarity('common', -1)],
    });
    const quantity = set({
      id: 611,
      name: '6x 80+ Upgrade',
      reward: '6x 80+ Rare Gold Players Pack',
      players: 9,
      requirements: [quality('gold', -1), rarity('common', -1)],
    });
    const rating = set({
      id: 612,
      name: '3x 82+ Upgrade',
      reward: '3x 82+ Rare Gold Players Pack',
      players: 9,
      requirements: [quality('gold', -1), rarity('common', -1)],
    });
    const loop = {
      id: 'ambiguous',
      strategy: 'inventoryExhaustion',
      stages: [{
        name: 'Common Premium',
        activityBinding: { family: 'common-gold-material-upgrade', classes: ['premium'] },
        sbcNames: ['Compatibility'],
        requirements: [{ tier: 'gold', rarity: 'common', count: 9 }],
      }],
    };
    const session = buildActivityBindingSession({ sets: [unknown, quantity, rating], configuredLoops: [loop] });
    expect(session.activities.some((activity) => activity.setId === 610)).toBe(false);
    expect(session.loopOverrides).toEqual({});
    expect(session.diagnostics.join(' ')).toContain('ambiguous');
  });

  it('materializes a future Rare Gold Premium without a 2x84 identity template', () => {
    const futurePremium = set({
      id: 620,
      name: '3x 85+ Upgrade',
      reward: '3x 85+ Rare Gold Players Pack',
      players: 5,
      requirements: [quality('gold', -1), rarity('rare', -1)],
    });
    const session = buildActivityBindingSession({
      sets: [futurePremium],
      configuredLoops: [{
        id: 'rare-recycling',
        strategy: 'rarePackTo84Upgrade',
        sourcePackNames: ['Source'],
        rareUpgrade: {
          name: 'Rare Gold Recycling',
          activityBinding: {
            family: 'rare-gold-material-upgrade',
            classes: ['premium', 'baseline'],
            preference: 'reward-first',
            required: true,
          },
          sbcNames: ['2x 84+ Upgrade'],
          requirements: [{ tier: 'gold', rarity: 'rare', count: 6, maxRating: 81 }],
        },
      }],
    });

    expect(session.loopOverrides['rare-recycling'].rareUpgrade).toMatchObject({
      name: '3x 85+ Upgrade',
      sbcSetIds: [620],
      dynamicSbcFamily: 'rare-gold-material-upgrade',
      materialSinkClass: 'premium',
      requirements: [expect.objectContaining({ count: 5, maxRating: 81 })],
    });
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

  it('binds Rolling Provisions to the live four-player 87+ contract when an older Set also exists', () => {
    const loop = {
      id: 'rolling-provisions-contract',
      strategy: 'rollingUpgrade',
      rollingProvisionsUpgrade: {
        activityBinding: { family: 'provisions-upgrade', category: 'Upgrades', required: true },
        requirements: [{ tier: 'gold', count: 4, minRating: 87, maxRating: 88 }],
      },
    };
    const session = buildActivityBindingSession({
      sets: [],
      configuredLoops: [loop],
      additionalActivities: [
        {
          familyId: 'provisions-upgrade',
          setId: 1039,
          setName: 'Provisions Upgrade',
          rewardPackIds: [20643],
          requirements: [{ tier: 'gold', count: 3, minRating: 85 }],
        },
        {
          familyId: 'provisions-upgrade',
          setId: 1354,
          setName: 'Repeatable FUTTIES Provisions Upgrade',
          rewardPackIds: [21346],
          requirements: [{ tier: 'gold', count: 4, minRating: 87 }],
        },
      ],
    });

    expect(session.loopOverrides[loop.id].rollingProvisionsUpgrade).toMatchObject({
      activityResolved: true,
      sbcSetIds: [1354],
      rewardPackIds: [21346],
      requirements: [expect.objectContaining({ count: 4, minRating: 87, maxRating: 88 })],
    });
    expect(session.diagnostics).toEqual([]);
  });

  it('collects activity-bound SBC aliases from direct and nested consumers for scan prefiltering', () => {
    const names = collectActivityBindingSbcNames([
      {
        activityBinding: { family: 'daily-bronze-upgrade' },
        sbcNames: ['Daily Bronze Upgrade'],
        stages: [{
          activityBinding: { family: 'common-gold-crafting-upgrade' },
          sbcNames: ['5x 80+ Upgrade'],
        }],
      },
      {
        activityBinding: { family: 'daily-bronze-upgrade' },
        sbcNames: ['DAILY BRONZE UPGRADE'],
      },
    ]);

    expect(names.sort()).toEqual(['5x 80+ upgrade', 'daily bronze upgrade']);
  });
});
