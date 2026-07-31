import { describe, expect, it } from 'vitest';
import {
  buildUpgradeDiscoverySession,
  collectScannedUpgradeActivities,
  detectDynamicUpgradeFamily,
  materializeDynamicUpgradeChallengeLoopDef,
  parseDynamicUpgradeSbcSnapshot,
} from '../../src/config/upgrade-discovery.js';

function set(overrides = {}) {
  return {
    id: 900,
    name: '10x 85+ Upgrade',
    inUpgradesCategory: true,
    timesCompleted: 0,
    repeats: 5,
    rewards: [{ type: 'PACK', packId: 300, name: '10x 85+ Players Pack' }],
    challenges: [{
      id: 901,
      requiredPlayerCount: 11,
      eligibilityRequirements: [
        { key: 'TEAM_RATING', values: [88], count: -1 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
    }],
    ...overrides,
  };
}

function totwSet(overrides = {}) {
  return set({
    id: 841,
    name: '84+ TOTW Upgrade',
    rewards: [{ type: 'PACK', packId: 20707, name: '84+ TOTW Pack' }],
    challenges: [{
      id: 842,
      requiredPlayerCount: 11,
      eligibilityRequirements: [{ key: 'TEAM_RATING', values: [84], count: -1 }],
    }],
    ...overrides,
  });
}

function twoBy84Set(overrides = {}) {
  return set({
    id: 843,
    name: '2x 84+ Upgrade',
    rewards: [{ type: 'PACK', packId: 1031, name: '2x 84+ Rare Gold Players Pack' }],
    challenges: [{
      id: 844,
      requiredPlayerCount: 6,
      eligibilityRequirements: [
        { key: 'PLAYER_QUALITY', values: ['gold'], count: -1 },
        { key: 'PLAYER_RARITY', values: ['rare'], count: -1 },
      ],
    }],
    ...overrides,
  });
}

describe('dynamic Upgrade discovery', () => {
  it('creates a safe dynamic 85x10 Loop from generic policy', () => {
    const result = parseDynamicUpgradeSbcSnapshot({ set: set() });
    expect(result.status).toBe('supported');
    expect(result.loop).toMatchObject({
      strategy: 'fillAndVerifySbc',
      discoveryKind: 'upgrade',
      dynamicSbcFamily: 'high-rated-x10',
      dynamicRewardMinRating: 85,
      sbcSetIds: [900],
      rewardPackIds: [300],
      expectedPlayerCount: 11,
      maxSubmittedRating: 88,
      requiredSpecialCount: 1,
      requiredSpecialKind: 'totw-tots-fof',
      maxCompletions: 5,
      autoTotwUpgrade: { activityBinding: { family: 'totw-upgrade', required: true } },
      autoFodderUpgrade: { activityBinding: { family: 'rare-gold-material-upgrade', required: false } },
    });
    expect(result.loop.ratingSbcFill.targetRating).toBe(88);
  });

  it('creates a safe dynamic high-rated xN Loop for 7x 87+', () => {
    const result = parseDynamicUpgradeSbcSnapshot({
      set: set({
        name: '7x 87+ Upgrade',
        rewards: [{ type: 'PACK', packId: 1095, name: '7x 87+ Rare Gold Players Pack' }],
        challenges: [
          {
            id: 3720,
            requiredPlayerCount: 11,
            eligibilityRequirements: [
              { key: 'TEAM_RATING', values: [83], count: -1 },
              { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
            ],
          },
          {
            id: 3721,
            requiredPlayerCount: 11,
            eligibilityRequirements: [
              { key: 'TEAM_RATING', values: [84], count: -1 },
              { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
            ],
          },
        ],
      }),
    });

    expect(result.status).toBe('supported');
    expect(result.family).toEqual({
      id: 'high-rated-pack-upgrade',
      rewardCount: 7,
      rewardMinRating: 87,
    });
    expect(result.loop).toMatchObject({
      name: '7x 87+ Upgrade',
      dynamicSbcFamily: 'high-rated-pack-upgrade',
      dynamicRewardCount: 7,
      dynamicRewardMinRating: 87,
      rewardPackIds: [1095],
      expectedPlayerCount: 11,
      requiredSpecialCount: 1,
      dynamicChallengeCount: 2,
      dynamicChallenges: [
        { challengeId: 3720, requiredPlayerCount: 11, targetRating: 83, specialCount: 1 },
        { challengeId: 3721, requiredPlayerCount: 11, targetRating: 84, specialCount: 1 },
      ],
    });
    expect(result.loop.ratingSbcFill.targetRating).toBeUndefined();
    expect(materializeDynamicUpgradeChallengeLoopDef(result.loop, { id: 3720 })).toMatchObject({
      expectedPlayerCount: 11,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      ratingSbcFill: { targetRating: 83 },
    });
    expect(materializeDynamicUpgradeChallengeLoopDef(result.loop, { id: 3721 }).ratingSbcFill.targetRating).toBe(84);
  });

  it('creates 2x84+ directly from scanned requirements without a built-in Loop', () => {
    expect(detectDynamicUpgradeFamily(twoBy84Set())).toEqual({
      id: '2x84-upgrade',
      rewardCount: 2,
      rewardMinRating: 84,
    });
    const result = parseDynamicUpgradeSbcSnapshot({ set: twoBy84Set() });
    expect(result.status).toBe('supported');
    expect(result.loop).toMatchObject({
      hidden: true,
      dynamicSbcFamily: '2x84-upgrade',
      sbcSetIds: [843],
      rewardPackIds: [1031],
      expectedPlayerCount: 6,
      requirements: [expect.objectContaining({ tier: 'gold', rarity: 'rare', count: 6, maxRating: 81 })],
      priorityPiles: ['storage', 'club'],
      blockSpecial: true,
    });
    expect(result.loop.ratingSbcFill).toEqual({});
  });

  it('uses the scanned Rare Gold player count instead of a fixed 2x84+ template count', () => {
    const result = parseDynamicUpgradeSbcSnapshot({
      set: twoBy84Set({
        challenges: [{
          id: 844,
          requiredPlayerCount: 7,
          eligibilityRequirements: [
            { key: 'PLAYER_QUALITY', values: ['gold'], count: -1 },
            { key: 'PLAYER_RARITY', values: ['rare'], count: -1 },
          ],
        }],
      }),
    });

    expect(result.status).toBe('supported');
    expect(result.loop.expectedPlayerCount).toBe(7);
    expect(result.loop.requirements).toEqual([
      expect.objectContaining({ tier: 'gold', rarity: 'rare', count: 7, maxRating: 81 }),
    ]);
    expect(collectScannedUpgradeActivities([{ loop: result.loop }])[0].requirements)
      .toEqual([{ tier: 'gold', rarity: 'rare', count: 7 }]);
  });

  it('does not misclassify a pure Rare Gold material sink as a TEAM_RATING Upgrade', () => {
    const pureRare = twoBy84Set({
      id: 845,
      name: '3x 85+ Upgrade',
      rewards: [{ type: 'PACK', packId: 1032, name: '3x 85+ Rare Gold Players Pack' }],
      challenges: [{
        id: 846,
        requiredPlayerCount: 5,
        eligibilityRequirements: [
          { key: 'PLAYER_QUALITY', values: ['gold'], count: -1 },
          { key: 'PLAYER_RARITY', values: ['rare'], count: -1 },
        ],
      }],
    });
    const parsed = parseDynamicUpgradeSbcSnapshot({ set: pureRare });
    expect(parsed.status).toBe('unsupported');
    expect(parsed.diagnostics).toContain('exactly one TEAM_RATING condition is required');
    expect(buildUpgradeDiscoverySession({ sets: [pureRare], configuredLoops: [] }).discoveredLoops)
      .toEqual([]);
  });

  it('discovers current 84x10, TOTW, and 2x84+ as session Loops', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 840, name: '10x 84+ Upgrade', rewards: [{ type: 'PACK', packId: 284 }] }),
        totwSet(),
        twoBy84Set(),
      ],
    });

    expect(session.loopOverrides).toEqual({});
    expect(session.discoveredLoops.map((loop) => loop.dynamicSbcFamily).sort())
      .toEqual(['2x84-upgrade', 'high-rated-x10', 'totw-upgrade']);
  });

  it('keeps legacy configured templates compatible without requiring them', () => {
    const legacy = {
      id: '84x10',
      name: 'Legacy 84x10',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['Legacy'],
      ratingSbcFill: { priorityPiles: ['club'] },
      requiredSpecialCount: 1,
    };
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [legacy],
      sets: [set({ id: 840, name: '10x 84+ Upgrade', rewards: [{ type: 'PACK', packId: 284 }] })],
    });
    expect(session.discoveredLoops).toEqual([]);
    expect(session.loopOverrides['84x10']).toMatchObject({
      id: '84x10',
      sbcSetIds: [840],
      dynamicSbcFamily: 'high-rated-x10',
      scannedMetadata: true,
    });
  });

  it('collects supported Upgrade metadata as activity bindings', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 840, name: '10x 84+ Upgrade', rewards: [{ type: 'PACK', packId: 284 }] }),
        totwSet(),
        twoBy84Set(),
        set({ id: 850, name: '10x 85+ Upgrade', timesCompleted: 5 }),
      ],
    });

    expect(collectScannedUpgradeActivities(session.results)).toEqual([
      expect.objectContaining({ familyId: 'high-rated-x10', setId: 840, rewardPackIds: [284] }),
      expect.objectContaining({ familyId: 'totw-upgrade', setId: 841, rewardPackIds: [20707] }),
      expect.objectContaining({ familyId: '2x84-upgrade', setId: 843, rewardPackIds: [1031] }),
    ]);
  });

  it.each([
    ['non-Upgrades category', { inUpgradesCategory: false }],
    ['chemistry', { challenges: [{ ...set().challenges[0], eligibilityRequirements: [...set().challenges[0].eligibilityRequirements, { key: 'CHEMISTRY_POINTS', values: [20], count: -1 }] }] }],
    ['unsupported condition', { challenges: [{ ...set().challenges[0], eligibilityRequirements: [...set().challenges[0].eligibilityRequirements, { key: 'LEAGUE_ID', values: [13], count: 1 }] }] }],
  ])('rejects %s', (_label, overrides) => {
    expect(parseDynamicUpgradeSbcSnapshot({ set: set(overrides) }).status).toBe('unsupported');
  });

  it('keeps multi-Challenge support limited to high-rated xN Upgrades', () => {
    const result = parseDynamicUpgradeSbcSnapshot({
      set: totwSet({
        challenges: [
          ...totwSet().challenges,
          { ...totwSet().challenges[0], id: 845 },
        ],
      }),
    });
    expect(result.status).toBe('unsupported');
    expect(result.diagnostics).toContain('exactly one Challenge is required; found 2');
  });

  it('rejects a 2x84+ identity with non-Rare-Gold requirements', () => {
    const result = parseDynamicUpgradeSbcSnapshot({
      set: twoBy84Set({
        challenges: [{
          id: 844,
          requiredPlayerCount: 6,
          eligibilityRequirements: [{ key: 'PLAYER_QUALITY', values: ['gold'], count: -1 }],
        }],
      }),
    });
    expect(result.status).toBe('unsupported');
    expect(result.diagnostics.join(' ')).toContain('Rare Gold');
  });

  it('does not expose a completed Upgrade as runnable', () => {
    const result = parseDynamicUpgradeSbcSnapshot({ set: set({ timesCompleted: 5 }) });
    expect(result.status).toBe('completed');
  });
});
