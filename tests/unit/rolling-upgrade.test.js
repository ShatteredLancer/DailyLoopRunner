import { describe, expect, it } from 'vitest';
import { buildActivityBindingSession } from '../../src/config/activity-discovery.js';
import { validateLoopDef } from '../../src/config/loop-schema.js';
import { parsePlayerPickSbcSnapshot } from '../../src/config/player-pick-discovery.js';
import {
  applyRollingAutomaticUseFodderPolicy,
  bindRollingPlayerPickCapabilities,
  parseRollingStorageSinkPickSnapshot,
  resolveRollingStorageSinkPickCapability,
  resolveRollingAutomaticUseMaxRating,
  shouldQueueRollingProvisionsReward,
} from '../../src/config/rolling-upgrade.js';
import {
  buildUpgradeDiscoverySession,
  collectScannedUpgradeActivities,
} from '../../src/config/upgrade-discovery.js';
import { loadFixture } from '../helpers/fixtures.js';

function totwSet() {
  return {
    id: 20841,
    name: '84+ TOTW Upgrade',
    inUpgradesCategory: true,
    timesCompleted: 0,
    repeats: null,
    rewards: [{ type: 'PACK', packId: 30841, name: '84+ TOTW Pack' }],
    challenges: [{
      id: 21841,
      requiredPlayerCount: 11,
      eligibilityRequirements: [{ key: 'TEAM_RATING', values: [84], count: -1 }],
    }],
  };
}

function provisionsSet() {
  return {
    id: 20987,
    name: 'Repeatable FUTTIES Provisions Upgrade',
    inUpgradesCategory: true,
    timesCompleted: 0,
    repeats: null,
    rewards: [{ type: 'PACK', packId: 30987, name: 'FUTTIES Provisions Pack' }],
    challenges: [{
      id: 21987,
      requiredPlayerCount: 4,
      eligibilityRequirements: [{ key: 'PLAYER_MIN_OVR', values: [87], count: -1 }],
    }],
  };
}

function goldSinkSet() {
  return {
    id: 20805,
    name: '5x 80+ Upgrade',
    inUpgradesCategory: true,
    timesCompleted: 0,
    repeats: null,
    rewards: [{ type: 'PACK', packId: 30805, name: '5x 80+ Rare Gold Players Pack' }],
    challenges: [{
      id: 21805,
      requiredPlayerCount: 9,
      eligibilityRequirements: [{ key: 'PLAYER_QUALITY', values: [3], count: -1 }],
    }],
  };
}

function rareGoldPickSet() {
  return {
    id: 20853,
    name: '1 of 3 85+ Player Pick',
    timesCompleted: 0,
    repeats: null,
    rewards: [{
      type: 'PLAYER_PICK',
      name: '1 of 3 85+ Player Pick',
      resourceId: 30853,
      candidateCount: 3,
      selectionCount: 1,
    }],
    challenges: [{
      id: 21853,
      requiredPlayerCount: 6,
      eligibilityRequirements: [
        { key: 'PLAYER_QUALITY', values: [3], count: -1 },
        { key: 'PLAYER_RARITY', values: [1], count: -1 },
      ],
    }],
  };
}

function storageSinkPickSet(overrides = {}) {
  const base = {
    id: 20995,
    name: '1 of 3 95+ FOF or FUTTIES T1-T3 Player Pick',
    timesCompleted: 0,
    repeats: null,
    rewards: [{
      type: 'PLAYER_PICK',
      name: '1 of 3 95+ FOF or FUTTIES T1-T3 Player Pick',
      resourceId: 30995,
      candidateCount: 3,
      selectionCount: 1,
    }],
    challenges: [
      {
        id: 21995,
        requiredPlayerCount: 11,
        eligibilityRequirements: [{ key: 'TEAM_RATING', values: [88], count: -1 }],
      },
      {
        id: 21996,
        requiredPlayerCount: 11,
        eligibilityRequirements: [{ key: 'TEAM_RATING', values: [89], count: -1 }],
      },
    ],
  };
  return {
    ...base,
    ...overrides,
    rewards: overrides.rewards || base.rewards,
    challenges: overrides.challenges || base.challenges,
  };
}

describe('Rolling Upgrade configuration contracts', () => {
  it('uses the shared automatic-use rating for Rolling instead of the standard Rating SBC cap', () => {
    expect(resolveRollingAutomaticUseMaxRating({ runtimePickOptions: { protectionRating: 90 } })).toBe(90);
    expect(applyRollingAutomaticUseFodderPolicy({
      runtimeSbcFodderPolicy: { ratingSbcMaxCardRating: 88 },
    }, {
      runtimePickOptions: { protectionRating: 90 },
    })).toMatchObject({
      runtimeSbcFodderPolicy: {
        mode: 'rating-constrained',
        ratingSbcMaxCardRating: 90,
      },
    });
  });

  it('binds every recovery capability from the current scan without configured SBC IDs', async () => {
    const fixture = await loadFixture('challenges/rolling-10x85-baseline.json');
    const sets = [fixture.set, totwSet(), provisionsSet(), goldSinkSet(), storageSinkPickSet()];
    const upgradeSession = buildUpgradeDiscoverySession({ sets, configuredLoops: [] });
    expect(upgradeSession.rollingLoops).toHaveLength(1);

    const activitySession = buildActivityBindingSession({
      sets,
      configuredLoops: upgradeSession.rollingLoops,
      additionalActivities: collectScannedUpgradeActivities(upgradeSession.results),
    });
    const pick = parsePlayerPickSbcSnapshot({ set: rareGoldPickSet() });
    expect(pick.status).toBe('supported');
    const [rolling] = bindRollingPlayerPickCapabilities([
      activitySession.loopOverrides[upgradeSession.rollingLoops[0].id],
    ], [pick.loop], { storageSinkSets: sets });

    expect(rolling).toMatchObject({
      strategy: 'rollingUpgrade',
      sbcSetIds: [1085],
      rollingTotwUpgrade: {
        activityResolved: true,
        sbcSetIds: [20841],
        dynamicSbcFamily: 'totw-upgrade',
      },
      rollingProvisionsUpgrade: {
        activityResolved: true,
        sbcSetIds: [20987],
        dynamicSbcFamily: 'provisions-upgrade',
        requirements: [expect.objectContaining({ minRating: 87, maxRating: 88, count: 4 })],
      },
      rollingPlayerPick: {
        status: 'resolved',
        loop: expect.objectContaining({
          sbcSetIds: [20853],
          dynamicRewardMinRating: 85,
          pickCandidateCount: 3,
          pickCount: 1,
        }),
      },
      rollingStorageSinkPick: {
        status: 'resolved',
        required: false,
        loop: expect.objectContaining({
          sbcSetIds: [20995],
          dynamicRewardMinRating: 95,
          pickCandidateCount: 3,
          pickCount: 1,
          challengesPerPick: 2,
        }),
      },
      rollingGoldSinkUpgrade: {
        activityResolved: true,
        sbcSetIds: [20805],
        dynamicSbcFamily: '5x80-upgrade',
        requirements: [expect.objectContaining({ tier: 'gold', count: 9 })],
      },
    });
    expect(validateLoopDef(rolling, 'Rolling Upgrade')).toEqual([]);
  });

  it('opens Provisions rewards only for explicit fodder shortages or the duplicate-reserve opt-in', () => {
    expect(shouldQueueRollingProvisionsReward('duplicate-reserve', {})).toBe(false);
    expect(shouldQueueRollingProvisionsReward('duplicate-reserve', {
      rollingOpenDuplicateProvisionsRewards: true,
    })).toBe(true);
    expect(shouldQueueRollingProvisionsReward('storage-maintenance', {})).toBe(false);
    expect(shouldQueueRollingProvisionsReward('storage-pressure', {})).toBe(false);
    expect(shouldQueueRollingProvisionsReward('primary-fodder-shortage', {})).toBe(true);
    expect(shouldQueueRollingProvisionsReward('required-special-fodder-shortage', {})).toBe(true);
    expect(shouldQueueRollingProvisionsReward('unknown', {})).toBe(false);
  });

  it('keeps an unresolved or ambiguous 85+ Pick capability fail-closed', async () => {
    const fixture = await loadFixture('challenges/rolling-10x85-baseline.json');
    const rolling = buildUpgradeDiscoverySession({ sets: [fixture.set], configuredLoops: [] }).rollingLoops[0];
    expect(bindRollingPlayerPickCapabilities([rolling], [])[0].rollingPlayerPick.status)
      .toBe('unavailable');

    const pick = parsePlayerPickSbcSnapshot({ set: rareGoldPickSet() }).loop;
    const ambiguous = bindRollingPlayerPickCapabilities([rolling], [
      pick,
      { ...structuredClone(pick), id: 'second-85-pick', sbcSetIds: [99999] },
    ])[0];
    expect(ambiguous.rollingPlayerPick).toMatchObject({ status: 'ambiguous' });
    expect(ambiguous.rollingPlayerPick).not.toHaveProperty('loop');
  });

  it('parses only the exact dynamic 95+ FOF/FUTTIES 88+89 Storage sink contract', () => {
    const parsed = parseRollingStorageSinkPickSnapshot({ set: storageSinkPickSet() });
    expect(parsed).toMatchObject({
      status: 'supported',
      loop: {
        strategy: 'playerPickSbc',
        rollingStorageSink: true,
        sbcSetIds: [20995],
        pickItemResourceIds: ['30995'],
        dynamicChallenges: [
          expect.objectContaining({ challengeId: 21995, targetRating: 88, requiredPlayerCount: 11 }),
          expect.objectContaining({ challengeId: 21996, targetRating: 89, requiredPlayerCount: 11 }),
        ],
      },
    });

    expect(parseRollingStorageSinkPickSnapshot({
      set: storageSinkPickSet({
        name: '1 of 3 95+ Player Pick',
        rewards: [{ ...storageSinkPickSet().rewards[0], name: '1 of 3 95+ Player Pick' }],
      }),
    }).status).toBe('ignored');
    expect(parseRollingStorageSinkPickSnapshot({
      set: storageSinkPickSet({
        rewards: [{ ...storageSinkPickSet().rewards[0], candidateCount: 4 }],
      }),
    }).status).toBe('ignored');
    expect(parseRollingStorageSinkPickSnapshot({
      set: storageSinkPickSet({
        challenges: storageSinkPickSet().challenges.map((challenge) => ({
          ...challenge,
          eligibilityRequirements: [{ key: 'TEAM_RATING', values: [88], count: -1 }],
        })),
      }),
    }).status).toBe('unsupported');
    expect(parseRollingStorageSinkPickSnapshot({
      set: storageSinkPickSet({
        challenges: storageSinkPickSet().challenges.map((challenge, index) => (
          index ? { ...challenge, id: null } : challenge
        )),
      }),
    }).status).toBe('unsupported');
  });

  it('keeps missing and ambiguous Storage sink capabilities optional and fail-closed', async () => {
    const fixture = await loadFixture('challenges/rolling-10x85-baseline.json');
    const rolling = buildUpgradeDiscoverySession({ sets: [fixture.set], configuredLoops: [] }).rollingLoops[0];
    expect(bindRollingPlayerPickCapabilities([rolling], [], { storageSinkSets: [] })[0])
      .toMatchObject({ rollingStorageSinkPick: { status: 'unavailable', required: false } });

    const first = storageSinkPickSet();
    const second = storageSinkPickSet({ id: 20996 });
    expect(resolveRollingStorageSinkPickCapability([first, second]).status).toBe('ambiguous');
    const ambiguous = bindRollingPlayerPickCapabilities([rolling], [], {
      storageSinkSets: [first, second],
    })[0];
    expect(ambiguous.rollingStorageSinkPick).toMatchObject({ status: 'ambiguous', required: false });
    expect(ambiguous.rollingStorageSinkPick).not.toHaveProperty('loop');
    expect(validateLoopDef(ambiguous, 'Rolling Upgrade')).toEqual([]);
  });
});
