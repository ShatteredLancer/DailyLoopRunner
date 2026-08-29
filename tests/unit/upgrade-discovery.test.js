import { describe, expect, it } from 'vitest';
import {
  buildUpgradeDiscoverySession,
  classifyUpgradeRepeatability,
  collectScannedUpgradeActivities,
  detectDynamicUpgradeFamily,
  materializeDynamicUpgradeChallengeLoopDef,
  parseDynamicUpgradeSbcSnapshot,
} from '../../src/config/upgrade-discovery.js';
import { buildActivityBindingSession } from '../../src/config/activity-discovery.js';

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

function noSpecialHighRatedSet(overrides = {}) {
  const base = set();
  return {
    ...base,
    ...overrides,
    challenges: overrides.challenges || [{
      ...base.challenges[0],
      eligibilityRequirements: [
        { key: 'TEAM_RATING', values: [89], count: -1 },
      ],
    }],
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
  it('classifies Upgrade repeatability while preserving null as legacy unlimited', () => {
    expect(classifyUpgradeRepeatability({ repeats: null, timesCompleted: 4 })).toMatchObject({
      repeatability: 'unlimited',
      completionLimit: null,
      remainingCompletions: null,
    });
    expect(classifyUpgradeRepeatability({ repeats: 4, timesCompleted: 1 })).toMatchObject({
      repeatability: 'bounded',
      completionLimit: 4,
      remainingCompletions: 3,
    });
    expect(classifyUpgradeRepeatability({ repeats: undefined, timesCompleted: 0 }).repeatability)
      .toBe('unknown');
    expect(classifyUpgradeRepeatability({ repeats: 4, timesCompleted: 9 }).repeatability)
      .toBe('unknown');
  });

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
      sbcFodderPolicy: { mode: 'rating-constrained' },
      requiredSpecialCount: 1,
      maxCompletions: 5,
      autoTotwUpgrade: { activityBinding: { family: 'totw-upgrade', required: true } },
      autoFodderUpgrade: { activityBinding: { family: 'rare-gold-material-upgrade', required: false } },
    });
    expect(result.loop.ratingSbcFill.targetRating).toBe(88);
    expect(result.loop).not.toHaveProperty('requiredSpecialKind');
    expect(result.loop).not.toHaveProperty('requiredSpecialMinRating');
    expect(result.loop.dynamicChallenges[0].eligibilityRequirements).toEqual([
      { key: 'TEAM_RATING', values: [88], count: 11 },
      { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
    ]);
  });

  it('keeps Set 1356 Challenge 3874 on the group-83 contract until live expansion is proven', () => {
    const current = parseDynamicUpgradeSbcSnapshot({
      set: set({
        id: 1356,
        challenges: [{ ...set().challenges[0], id: 3874 }],
      }),
    });
    const unrelated = parseDynamicUpgradeSbcSnapshot({
      set: set({
        id: 1356,
        challenges: [{ ...set().challenges[0], id: 9999 }],
      }),
    });

    expect(current.loop).toMatchObject({
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicChallenges: [expect.objectContaining({
        challengeId: 3874,
        requiredSpecialAllowanceMode: 'required-only',
        requiredSpecialAllowanceDecisionSource: 'fail-closed',
      })],
    });
    expect(unrelated.loop).toMatchObject({
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      dynamicChallenges: [expect.objectContaining({
        requiredSpecialAllowanceMode: 'required-only',
        requiredSpecialAllowanceDecisionSource: 'fail-closed',
      })],
    });
  });

  it('stages a separate selectable Rolling Loop without changing the generic x10 Loop', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [set({ repeats: null })],
    });
    expect(session.discoveredLoops).toHaveLength(1);
    expect(session.discoveredLoops[0]).toMatchObject({
      strategy: 'fillAndVerifySbc',
      id: 'discovered-upgrade-900-high-rated-x10-85',
      runtimeQuantity: { default: 3, min: 1 },
      openRewardPacks: false,
    });
    expect(session.rollingLoops).toEqual([
      expect.objectContaining({
        id: 'rolling-upgrade-900-85',
        strategy: 'rollingUpgrade',
        hidden: false,
        mvp: false,
        rollingWorkflowEnabled: true,
        defaultOpenRewardPacksOnSelect: true,
        runtimeQuantity: expect.objectContaining({ default: 0, min: 0, allowZero: true }),
        rollingTotwUpgrade: expect.objectContaining({
          activityBinding: expect.objectContaining({ family: 'totw-upgrade', required: true }),
        }),
        rollingProvisionsUpgrade: expect.objectContaining({
          activityBinding: expect.objectContaining({ family: 'provisions-upgrade', required: true }),
          requirements: [expect.objectContaining({ count: 4, minRating: 87 })],
        }),
        rollingGoldSinkUpgrade: expect.objectContaining({
          activityBinding: expect.objectContaining({ family: '5x80-upgrade', required: true }),
        }),
      }),
    ]);
  });

  it('does not stage Rolling for a high-rated x10 whose live special contract requires more than one card', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [set({
        challenges: [{
          ...set().challenges[0],
          eligibilityRequirements: [
            { key: 'TEAM_RATING', values: [88], count: -1 },
            { key: 'PLAYER_RARITY_GROUP', values: [83], count: 2 },
          ],
        }],
      })],
    });
    expect(session.discoveredLoops).toHaveLength(1);
    expect(session.rollingLoops).toEqual([]);
  });

  it('keeps 10x84+ as a generic Upgrade and does not expose it as a Rolling Loop', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [set({
        id: 840,
        name: '10x 84+ Upgrade',
        rewards: [{ type: 'PACK', packId: 284, name: '10x 84+ Players Pack' }],
      })],
    });

    expect(session.discoveredLoops).toHaveLength(1);
    expect(session.discoveredLoops[0]).toMatchObject({
      dynamicSbcFamily: 'high-rated-x10',
      dynamicRewardMinRating: 84,
    });
    expect(session.rollingLoops).toEqual([]);
  });

  it('preserves an EA player-group count greater than one without expanding the group into card names', () => {
    const result = parseDynamicUpgradeSbcSnapshot({
      set: set({
        challenges: [{
          ...set().challenges[0],
          eligibilityRequirements: [
            { key: 'TEAM_RATING', values: [88], count: -1 },
            { key: 'PLAYER_RARITY_GROUP', values: [83], count: 2 },
          ],
        }],
      }),
    });

    expect(result.status).toBe('supported');
    expect(result.loop.requiredSpecialCount).toBe(2);
    expect(result.loop.allowedSpecialCount).toBe(2);
    expect(result.loop.dynamicChallenges[0].eligibilityRequirements).toContainEqual({
      key: 'PLAYER_RARITY_GROUP',
      values: [83],
      count: 2,
    });
    expect(result.loop).not.toHaveProperty('requiredSpecialKind');
  });

  it('accepts an unknown EA player-group id as opaque runtime metadata', () => {
    const result = parseDynamicUpgradeSbcSnapshot({
      set: set({
        challenges: [{
          ...set().challenges[0],
          eligibilityRequirements: [
            { key: 'TEAM_RATING', values: [88], count: -1 },
            { key: 'PLAYER_RARITY_GROUP', values: [999], count: 1 },
          ],
        }],
      }),
    });

    expect(result.status).toBe('supported');
    expect(result.loop.dynamicChallenges[0].eligibilityRequirements).toContainEqual({
      key: 'PLAYER_RARITY_GROUP',
      values: [999],
      count: 1,
    });
    expect(result.diagnostics).toEqual([]);
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
      dynamicActiveEligibilityRequirements: [
        { key: 'TEAM_RATING', values: [83], count: 11 },
        { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
      ],
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
      requirements: [expect.objectContaining({ tier: 'gold', rarity: 'rare', count: 6 })],
      sbcFodderPolicy: { mode: 'low-gold' },
      priorityPiles: ['storage', 'club'],
      blockSpecial: true,
    });
    expect(result.loop.ratingSbcFill).toEqual({});
  });

  it('discovers Provisions from live minimum-rating requirements without static IDs', () => {
    const result = parseDynamicUpgradeSbcSnapshot({
      set: set({
        id: 910,
        name: 'Repeatable FUTTIES Provisions Upgrade',
        repeats: null,
        rewards: [{ type: 'PACK', packId: 3910, name: 'FUTTIES Provisions Pack' }],
        challenges: [{
          id: 911,
          requiredPlayerCount: 4,
          eligibilityRequirements: [{ key: 'PLAYER_MIN_OVR', values: [87], count: -1 }],
        }],
      }),
    });
    expect(result.status).toBe('supported');
    expect(result.loop).toMatchObject({
      strategy: 'fillAndVerifySbc',
      hidden: true,
      dynamicSbcFamily: 'provisions-upgrade',
      sbcSetIds: [910],
      rewardPackIds: [3910],
      requirements: [expect.objectContaining({ tier: 'gold', minRating: 87, count: 4 })],
    });
    expect(collectScannedUpgradeActivities([result])).toEqual([
      expect.objectContaining({
        familyId: 'provisions-upgrade',
        setId: 910,
        requirements: [{ tier: 'gold', minRating: 87, count: 4 }],
      }),
    ]);
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
      expect.objectContaining({ tier: 'gold', rarity: 'rare', count: 7 }),
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
    expect(session.loopOverrides['84x10']).not.toHaveProperty('requiredSpecialKind');
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

  it('publishes one 86x10 Rolling loop when both 86x10 and 85x10 are unlimited', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 860, name: '10x 86+ Upgrade', repeats: null }),
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null }),
      ],
    });
    expect(session.rollingLoops).toHaveLength(1);
    expect(session.rollingLoops[0]).toMatchObject({
      id: 'rolling-upgrade-860-86',
      sbcSetIds: [860],
      rollingPrimaryComposite: false,
      rollingPrimaryStages: [expect.objectContaining({ setId: 860, dynamicRewardMinRating: 86 })],
    });
    expect(session.suppressedSetIds).toEqual([860, 850]);
  });

  it('publishes one composite 86 bounded -> 85 unlimited Rolling loop', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 860, name: '10x 86+ Upgrade', repeats: 3, timesCompleted: 1, rewards: [{ type: 'PACK', packId: 3860 }] }),
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null, rewards: [{ type: 'PACK', packId: 3850 }] }),
      ],
    });
    expect(session.rollingLoops).toHaveLength(1);
    expect(session.rollingLoops[0]).toMatchObject({
      id: 'rolling-upgrade-composite-860-850',
      rollingPrimaryComposite: true,
      rollingPrimaryStages: [
        expect.objectContaining({ setId: 860, dynamicRewardMinRating: 86, repeatability: 'bounded', remainingCompletions: 2 }),
        expect.objectContaining({ setId: 850, dynamicRewardMinRating: 85, repeatability: 'unlimited' }),
      ],
    });
    expect(session.suppressedSetIds).toEqual([860, 850]);
  });

  it('publishes a composite Rolling loop when the 86x10 stage has no Required Special', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        noSpecialHighRatedSet({
          id: 860,
          name: '10x 86+ Upgrade',
          repeats: 3,
          timesCompleted: 1,
          rewards: [{ type: 'PACK', packId: 3860 }],
        }),
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null, rewards: [{ type: 'PACK', packId: 3850 }] }),
      ],
    });

    expect(session.rollingLoops).toHaveLength(1);
    expect(session.rollingLoops[0]).toMatchObject({
      id: 'rolling-upgrade-composite-860-850',
      rollingPrimaryComposite: true,
      rollingPrimaryStages: [
        expect.objectContaining({
          setId: 860,
          dynamicRewardMinRating: 86,
          requiredSpecialCount: 0,
          allowedSpecialCount: 0,
        }),
        expect.objectContaining({
          setId: 850,
          dynamicRewardMinRating: 85,
          requiredSpecialCount: 1,
          allowedSpecialCount: 1,
        }),
      ],
    });
  });

  it('matches the live 86x10 TEAM_RATING-only Challenge shape', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        noSpecialHighRatedSet({
          id: 1423,
          name: '10x 86+ Upgrade',
          repeats: 10,
          timesCompleted: 0,
          rewards: [{ type: 'PACK', packId: 1089 }],
          challenges: [{
            id: 4132,
            requiredPlayerCount: 11,
            eligibilityRequirements: [
              { key: 'TEAM_RATING', values: [89], count: -1 },
            ],
          }],
        }),
        set({
          id: 1356,
          name: '10x 85+ Upgrade',
          repeats: 0,
          timesCompleted: 1800,
          rewards: [{ type: 'PACK', packId: 1082 }],
          challenges: [{
            id: 3874,
            requiredPlayerCount: 11,
            eligibilityRequirements: [
              { key: 'TEAM_RATING', values: [84], count: -1 },
              { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
            ],
          }],
        }),
      ],
    });

    expect(session.rollingPlan).toMatchObject({
      status: 'resolved',
      mode: 'bounded-then-unlimited',
    });
    expect(session.rollingLoops[0].rollingPrimaryStages[0]).toMatchObject({
      setId: 1423,
      challengeIds: [4132],
      requiredSpecialCount: 0,
      allowedSpecialCount: 0,
      repeatability: 'bounded',
      remainingCompletions: 10,
    });
  });

  it('falls back to a valid unlimited 85x10 Rolling loop when the composite 86 stage contract is invalid', () => {
    const invalid86 = set({
      id: 860,
      name: '10x 86+ Upgrade',
      repeats: 3,
      timesCompleted: 1,
      rewards: [{ type: 'PACK', packId: 3860 }],
      challenges: [{
        ...set().challenges[0],
        eligibilityRequirements: [
          { key: 'TEAM_RATING', values: [89], count: -1 },
          { key: 'PLAYER_RARITY_GROUP', values: [83], count: 2 },
        ],
      }],
    });
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [invalid86, set({ id: 850, name: '10x 85+ Upgrade', repeats: null })],
    });

    expect(session.rollingLoops).toHaveLength(1);
    expect(session.rollingLoops[0]).toMatchObject({
      id: 'rolling-upgrade-850-85',
      rollingPrimaryComposite: false,
      sbcSetIds: [850],
    });
    expect(session.rollingPlan).toMatchObject({ status: 'resolved', mode: 'single' });
    expect(session.suppressedSetIds).toEqual([850]);
  });

  it('keeps composite stage identities after activity binding', async () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 860, name: '10x 86+ Upgrade', repeats: 3, timesCompleted: 1, rewards: [{ type: 'PACK', packId: 3860 }] }),
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null, rewards: [{ type: 'PACK', packId: 3850 }] }),
      ],
    });
    const activitySession = buildActivityBindingSession({
      sets: [
        set({ id: 860, name: '10x 86+ Upgrade', repeats: 3, timesCompleted: 1 }),
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null }),
      ],
      configuredLoops: session.rollingLoops,
      additionalActivities: collectScannedUpgradeActivities(session.results),
    });
    const bound = activitySession.loopOverrides[session.rollingLoops[0].id] || session.rollingLoops[0];
    expect(bound.rollingPrimaryStages.map((stage) => stage.setId)).toEqual([860, 850]);
    expect(bound.rollingPrimaryStages.map((stage) => stage.rewardPackIds[0])).toEqual([3860, 3850]);
  });

  it('falls back to 85 only after a bounded 86x10 is exhausted', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 860, name: '10x 86+ Upgrade', repeats: 3, timesCompleted: 3 }),
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null }),
      ],
    });
    expect(session.rollingLoops).toHaveLength(1);
    expect(session.rollingLoops[0]).toMatchObject({ id: 'rolling-upgrade-850-85', sbcSetIds: [850] });
  });

  it('does not expose a bounded 85x10 as a standalone Rolling loop', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [set({ id: 850, name: '10x 85+ Upgrade', repeats: 3, timesCompleted: 0 })],
    });
    expect(session.discoveredLoops).toHaveLength(1);
    expect(session.rollingLoops).toEqual([]);
  });

  it('does not expose an unknown-repeatability 85x10 as a standalone Rolling loop', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [set({ id: 850, name: '10x 85+ Upgrade', repeats: undefined })],
    });
    expect(session.rollingLoops).toEqual([]);
    expect(session.rollingPlan.reason).toContain('no confirmed unlimited Rolling stage');
  });

  it('does not choose between duplicate 85x10 candidates', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null }),
        set({ id: 851, name: '10x 85+ Upgrade', repeats: null }),
      ],
    });
    expect(session.rollingLoops).toEqual([]);
    expect(session.rollingPlan.reason).toContain('multiple 85x10 candidates are ambiguous');
  });

  it('falls back to verified unlimited 85 when the 86 repeatability is unknown', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 860, name: '10x 86+ Upgrade', repeats: undefined }),
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null }),
      ],
    });
    expect(session.rollingLoops).toHaveLength(1);
    expect(session.rollingLoops[0]).toMatchObject({
      id: 'rolling-upgrade-850-85',
      rollingPrimaryComposite: false,
      sbcSetIds: [850],
    });
    expect(session.rollingPlan).toMatchObject({
      status: 'resolved',
      mode: 'single',
      fallbackFrom: '86x10',
      fallbackReason: '86x10 repeatability is unknown',
    });
  });

  it('falls back to verified unlimited 85 when an 86x10 candidate has incomplete identity', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({
          id: 860,
          name: '10x 86+ Upgrade',
          repeats: 3,
          timesCompleted: 0,
          challenges: [{ ...set().challenges[0], id: null }],
        }),
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null }),
      ],
    });
    expect(session.rollingLoops).toHaveLength(1);
    expect(session.rollingLoops[0]).toMatchObject({
      id: 'rolling-upgrade-850-85',
      rollingPrimaryComposite: false,
      sbcSetIds: [850],
    });
    expect(session.rollingPlan).toMatchObject({
      status: 'resolved',
      mode: 'single',
      fallbackFrom: '86x10',
      fallbackReason: expect.stringContaining('86x10 Set #860 unsupported'),
    });
  });

  it('falls back to one verified 85 when multiple 86x10 candidates are ambiguous', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 860, name: '10x 86+ Upgrade', repeats: 3, timesCompleted: 0 }),
        set({ id: 861, name: '10x 86+ Upgrade', repeats: 2, timesCompleted: 0 }),
        set({ id: 850, name: '10x 85+ Upgrade', repeats: null }),
      ],
    });

    expect(session.rollingLoops).toHaveLength(1);
    expect(session.rollingLoops[0]).toMatchObject({ id: 'rolling-upgrade-850-85', sbcSetIds: [850] });
    expect(session.rollingPlan).toMatchObject({
      status: 'resolved',
      fallbackReason: 'multiple 86x10 candidates are ambiguous',
    });
  });

  it('does not use a valid 86 candidate to bypass incomplete 85 identity evidence', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [],
      sets: [
        set({ id: 860, name: '10x 86+ Upgrade', repeats: null }),
        set({
          id: 850,
          name: '10x 85+ Upgrade',
          repeats: null,
          challenges: [{ ...set().challenges[0], id: null }],
        }),
      ],
    });

    expect(session.rollingLoops).toEqual([]);
    expect(session.rollingPlan).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('85x10 Set #850 unsupported'),
    });
  });

  it('rejects duplicate Challenge identity inside a Rolling candidate', () => {
    const duplicateChallenge = set({
      id: 850,
      name: '10x 85+ Upgrade',
      repeats: null,
      challenges: [
        set().challenges[0],
        { ...set().challenges[0] },
      ],
    });
    const session = buildUpgradeDiscoverySession({ configuredLoops: [], sets: [duplicateChallenge] });
    expect(session.rollingLoops).toEqual([]);
    expect(session.rollingPlan.reason).toContain('identity is incomplete');
  });
});
