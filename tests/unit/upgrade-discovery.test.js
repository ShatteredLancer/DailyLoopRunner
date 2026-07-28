import { describe, expect, it } from 'vitest';
import {
  buildUpgradeDiscoverySession,
  collectScannedUpgradeActivities,
  parseDynamicUpgradeSbcSnapshot,
} from '../../src/config/upgrade-discovery.js';

const x10Template = {
  id: '84x10',
  name: '84x10 Loop',
  strategy: 'fillAndVerifySbc',
  sbcNames: ['10x 84+ Upgrade'],
  maxCompletions: 50,
  maxSubmittedRating: 88,
  maxNormalGoldSubmittedRating: 99,
  ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
  requiredSpecialCount: 1,
  allowedSpecialCount: 1,
  requiredSpecialKind: 'totw-tots-fof',
  requiredSpecialMinRating: 84,
  autoTotwUpgrade: { name: '84+ TOTW Upgrade' },
  blockSpecial: true,
};

const totwTemplate = {
  id: 'auto-totw-upgrade',
  name: '84+ TOTW Upgrade Loop',
  strategy: 'fillAndVerifySbc',
  sbcNames: ['84+ TOTW Upgrade'],
  maxCompletions: 1,
  maxSubmittedRating: 88,
  maxNormalGoldSubmittedRating: 99,
  ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
  requiredSpecialCount: 0,
  allowedSpecialCount: 0,
  blockSpecial: true,
};

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

describe('dynamic Upgrade discovery', () => {
  it('creates a new safe dynamic 85x10 Loop from the 84x10 template', () => {
    const result = parseDynamicUpgradeSbcSnapshot({ set: set(), x10Template, totwTemplate });
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
      maxCompletions: 5,
    });
    expect(result.loop.ratingSbcFill.targetRating).toBe(88);
  });

  it('overlays scanned 84x10 and TOTW metadata onto built-in Loops', () => {
    const x10Mvp = { ...x10Template, id: '84x10-mvp' };
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [x10Template, x10Mvp, totwTemplate],
      x10Template,
      totwTemplate,
      sets: [
        set({ id: 840, name: '10x 84+ Upgrade', rewards: [{ type: 'PACK', packId: 284 }] }),
        set({
          id: 841,
          name: '84+ TOTW Upgrade',
          rewards: [{ type: 'PACK', packId: 20707 }],
          challenges: [{ id: 842, requiredPlayerCount: 11, eligibilityRequirements: [{ key: 'TEAM_RATING', values: [84], count: -1 }] }],
        }),
      ],
    });

    expect(session.discoveredLoops).toEqual([]);
    expect(Object.keys(session.loopOverrides).sort()).toEqual(['84x10', '84x10-mvp', 'auto-totw-upgrade']);
    expect(session.loopOverrides['84x10']).toMatchObject({ sbcSetIds: [840], scannedMetadata: true });
    expect(session.loopOverrides['auto-totw-upgrade']).toMatchObject({
      sbcSetIds: [841],
      requiredSpecialCount: 0,
      autoTotwUpgrade: false,
    });
  });

  it('adds 85x10 only once when no configured Loop matches its stable identity', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [x10Template, totwTemplate],
      x10Template,
      totwTemplate,
      sets: [set()],
    });
    expect(session.discoveredLoops).toHaveLength(1);
    expect(session.discoveredLoops[0].name).toBe('10x 85+ Upgrade');
  });

  it('collects supported x10 and TOTW metadata as activity bindings', () => {
    const session = buildUpgradeDiscoverySession({
      configuredLoops: [x10Template, totwTemplate],
      x10Template,
      totwTemplate,
      sets: [
        set({ id: 840, name: '10x 84+ Upgrade', rewards: [{ type: 'PACK', packId: 284 }] }),
        set({
          id: 841,
          name: '84+ TOTW Upgrade',
          rewards: [{ type: 'PACK', packId: 20707 }],
          challenges: [{ id: 842, requiredPlayerCount: 11, eligibilityRequirements: [{ key: 'TEAM_RATING', values: [84], count: -1 }] }],
        }),
        set({ id: 850, name: '10x 85+ Upgrade', timesCompleted: 5 }),
      ],
    });

    expect(collectScannedUpgradeActivities(session.results)).toEqual([
      expect.objectContaining({ familyId: 'high-rated-x10', setId: 840, rewardPackIds: [284] }),
      expect.objectContaining({ familyId: 'totw-upgrade', setId: 841, rewardPackIds: [20707] }),
    ]);
  });

  it.each([
    ['non-Upgrades category', { inUpgradesCategory: false }],
    ['multiple Challenges', { challenges: [...set().challenges, { ...set().challenges[0], id: 902 }] }],
    ['chemistry', { challenges: [{ ...set().challenges[0], eligibilityRequirements: [...set().challenges[0].eligibilityRequirements, { key: 'CHEMISTRY_POINTS', values: [20], count: -1 }] }] }],
    ['unsupported condition', { challenges: [{ ...set().challenges[0], eligibilityRequirements: [...set().challenges[0].eligibilityRequirements, { key: 'LEAGUE_ID', values: [13], count: 1 }] }] }],
  ])('rejects %s', (_label, overrides) => {
    expect(parseDynamicUpgradeSbcSnapshot({ set: set(overrides), x10Template, totwTemplate }).status).toBe('unsupported');
  });

  it('does not expose a completed Upgrade as runnable', () => {
    const result = parseDynamicUpgradeSbcSnapshot({ set: set({ timesCompleted: 5 }), x10Template, totwTemplate });
    expect(result.status).toBe('completed');
  });
});
