import { describe, expect, it } from 'vitest';
import {
  buildPlayerPickDiscoverySession,
  discoverPlayerPickSbcLoops,
  mergeScannedPlayerPickMetadata,
  parsePlayerPickSbcSnapshot,
  readPlayerPickRewardCounts,
} from '../../src/config/player-pick-discovery.js';
import { validateLoopDef } from '../../src/config/loop-schema.js';
import { loadFixture } from '../helpers/fixtures.js';

describe('dynamic Player Pick SBC discovery', () => {
  it('reads Pick counts only from explicit fields or an official reward description prefix', () => {
    expect(readPlayerPickRewardCounts({ candidateCount: 5, selectionCount: 1 })).toEqual({
      candidateCount: 5, selectionCount: 1, source: 'fields',
    });
    expect(readPlayerPickRewardCounts({ description: '5 of 10 82+ Rare Gold Player Pick' })).toEqual({
      candidateCount: 10, selectionCount: 5, source: 'description',
    });
    expect(readPlayerPickRewardCounts({ description: 'Reward includes 1 of 3 players' })).toEqual({
      candidateCount: null, selectionCount: null, source: null,
    });
  });

  it('builds a protected single-Challenge Player Pick config from stable metadata', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const result = parsePlayerPickSbcSnapshot(fixture.singleChallenge);

    expect(result.status).toBe('supported');
    expect(result.loop).toMatchObject({
      id: 'discovered-player-pick-4101-91001',
      strategy: 'playerPickSbc',
      discovered: true,
      sbcSetIds: [4101],
      pickItemResourceIds: ['91001'],
      challengesPerPick: 1,
      pickCandidateCount: 3,
      pickCount: 1,
      maxCompletions: 1,
    });
    expect(result.loop.requirements).toEqual([
      expect.objectContaining({
        tier: 'gold', rarity: 'rare', count: 4, maxRating: 81,
        allowSpecial: false, protectHighGold: true, highGoldThreshold: 82,
        highGoldProtectionMaxRating: true,
        priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      }),
    ]);
    expect(result.loop.challengeRequirements).toBeUndefined();
    expect(validateLoopDef(result.loop, 'discovered Player Pick')).toEqual([]);
  });

  it('records the configured protection threshold so runtime disabling can remove its cap', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const result = parsePlayerPickSbcSnapshot({
      ...fixture.singleChallenge,
      highGoldThreshold: 84,
    });

    expect(result.status).toBe('supported');
    expect(result.loop.requirements).toEqual([
      expect.objectContaining({
        maxRating: 83,
        protectHighGold: true,
        highGoldThreshold: 84,
        highGoldProtectionMaxRating: true,
      }),
    ]);
  });

  it('preserves independent requirements for every Challenge and remaining set count', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const result = parsePlayerPickSbcSnapshot(fixture.multiChallenge);

    expect(result.status).toBe('supported');
    expect(result.loop).toMatchObject({
      challengesPerPick: 2,
      pickCandidateCount: 10,
      pickCount: 4,
      remainingCompletions: 2,
    });
    expect(result.loop.challengeRequirements).toHaveLength(2);
    result.loop.challengeRequirements.forEach((requirements) => {
      expect(requirements).toEqual([
        expect.objectContaining({ tier: 'gold', rarity: 'common', count: 9, maxRating: 81 }),
      ]);
    });
  });

  it('turns a minimum rare requirement into an exact safe rare/common ratio', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const result = parsePlayerPickSbcSnapshot(fixture.mixedRatio);

    expect(result.status).toBe('supported');
    expect(result.loop.requirements.map(({ rarity, count }) => ({ rarity, count }))).toEqual([
      { rarity: 'rare', count: 3 },
      { rarity: 'common', count: 1 },
    ]);
  });

  it('keeps a reported-completed Pick runnable when its Challenge metadata is complete', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const result = parsePlayerPickSbcSnapshot({
      set: {
        ...fixture.singleChallenge.set,
        complete: true,
        timesCompleted: 1,
        repeats: 1,
      },
    });

    expect(result).toMatchObject({
      status: 'supported',
      setId: 4101,
      reportedCompleted: true,
      remainingCompletions: 0,
      loop: {
        maxCompletions: 1,
        useRoundsAsCompletions: false,
        discoveryReportedCompleted: true,
      },
    });
  });

  it('adds a fully described reported-completed Pick to the session Loop list', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const completedSet = {
      ...fixture.singleChallenge.set,
      complete: true,
      timesCompleted: 1,
      repeats: 1,
    };
    const session = buildPlayerPickDiscoverySession({
      sets: [completedSet],
      configuredLoops: [{ id: 'daily', name: 'Daily' }],
    });

    expect(session.discoveredLoops).toEqual([
      expect.objectContaining({
        sbcSetIds: [4101],
        discoveryReportedCompleted: true,
        maxCompletions: 1,
      }),
    ]);
  });

  it('does not add a reported-completed Pick when Challenge metadata is unavailable', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const result = parsePlayerPickSbcSnapshot(fixture.completed);
    expect(result).toMatchObject({ status: 'unsupported', setId: 4104 });
    expect(result.diagnostics).toContain('SBC Set challenge list is missing');
    expect(result.loop).toBeUndefined();
  });

  it('does not treat missing repeat counters as a completed Set', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const result = parsePlayerPickSbcSnapshot({
      set: {
        ...fixture.singleChallenge.set,
        timesCompleted: null,
        repeats: null,
      },
    });

    expect(result).toMatchObject({
      status: 'supported',
      reportedCompleted: false,
      remainingCompletions: null,
    });
  });

  it('rejects missing reward identity and unsupported eligibility conditions', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const missingIdentity = parsePlayerPickSbcSnapshot(fixture.missingRewardIdentity);
    const unsupported = parsePlayerPickSbcSnapshot(fixture.unsupportedCondition);

    expect(missingIdentity.status).toBe('unsupported');
    expect(missingIdentity.diagnostics).toContain('stable Player Pick reward identity is missing');
    expect(unsupported.status).toBe('unsupported');
    expect(unsupported.diagnostics.join('\n')).toMatch(/unsupported eligibility condition TEAM_RATING/);
  });

  it('rejects unknown rarity encodings instead of guessing', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const result = parsePlayerPickSbcSnapshot(fixture.unknownRarity);
    expect(result.status).toBe('unsupported');
    expect(result.diagnostics.join('\n')).toMatch(/unknown PLAYER_RARITY encoding 99/);
  });

  it('recognizes EA rarity group 4 as the rare-gold group confirmed by the live model', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const result = parsePlayerPickSbcSnapshot(fixture.rarityGroup);
    expect(result.status).toBe('supported');
    expect(result.loop.requirements).toEqual([
      expect.objectContaining({ tier: 'gold', rarity: 'rare', count: 4, maxRating: 81 }),
    ]);
    expect(result.loop).toMatchObject({ pickCandidateCount: 5, pickCount: 1 });
  });

  it('deduplicates the live 83+ snapshot against its static Set and reward identities', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const discovered = discoverPlayerPickSbcLoops({
      sets: [fixture.rarityGroup.set],
      existingLoops: [{
        id: '83-plus-player-pick-1of5',
        sbcSetIds: [1188],
        pickItemResourceIds: [5004333],
      }],
    });
    expect(discovered.loops).toEqual([]);
    expect(discovered.results[0].status).toBe('duplicate');
  });

  it('deduplicates discovered Picks only by stable Set or reward identity', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const staticLoop = {
      id: 'static-tournament-pick',
      strategy: 'playerPickSbc',
      sbcSetIds: [4101],
      pickItemResourceIds: ['91001'],
    };
    const discovered = discoverPlayerPickSbcLoops({
      sets: [fixture.singleChallenge.set, fixture.multiChallenge.set],
      existingLoops: [staticLoop],
    });

    expect(discovered.loops).toHaveLength(1);
    expect(discovered.loops[0].sbcSetIds).toEqual([4102]);
    expect(discovered.results.map(({ status }) => status)).toEqual(['duplicate', 'supported']);
  });

  it('builds a replaceable session list without duplicating static Picks', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const configuredLoops = [
      { id: 'daily', name: 'Daily' },
      {
        id: '83-plus-player-pick-1of5',
        name: '1 of 5 83+ Player Pick',
        sbcSetIds: [1188],
        pickItemResourceIds: [5004333],
      },
    ];
    const session = buildPlayerPickDiscoverySession({
      sets: [fixture.rarityGroup.set, fixture.singleChallenge.set],
      configuredLoops,
      selectedId: 'daily',
    });

    expect(session.results.map(({ status }) => status)).toEqual(['duplicate', 'supported']);
    expect(session.discoveredLoops).toHaveLength(1);
    expect(session.discoveredLoops[0]).toMatchObject({
      sbcSetIds: [4101],
      pickItemResourceIds: ['91001'],
    });
    expect(session.loopDefs.map(({ id }) => id)).toEqual([
      'daily',
      '83-plus-player-pick-1of5',
      'discovered-player-pick-4101-91001',
    ]);
    expect(session.selectedId).toBe('daily');
  });

  it('overlays fully supported scanned metadata while preserving the configured loop identity', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const staticPick = {
      id: '83-plus-player-pick-1of5',
      name: 'Static 83+ Pick',
      strategy: 'playerPickSbc',
      sbcSetIds: [1188],
      sbcNames: ['Static SBC fallback'],
      pickItemResourceIds: [5004333],
      pickItemNames: ['Static reward fallback'],
      requirements: [{ tier: 'gold', rarity: 'common', count: 11, maxRating: 81 }],
      challengesPerPick: 2,
      pickCandidateCount: 3,
      pickCount: 1,
      maxCompletions: 7,
    };
    const session = buildPlayerPickDiscoverySession({
      sets: [fixture.rarityGroup.set],
      configuredLoops: [
        staticPick,
        { id: 'provision', name: 'Provision', preCraftPlayerPickLoopId: staticPick.id },
      ],
      preferScannedMetadata: true,
    });

    expect(session.discoveredLoops).toEqual([]);
    expect(session.loopOverrides[staticPick.id]).toMatchObject({
      id: staticPick.id,
      name: staticPick.name,
      scannedMetadata: true,
      sbcSetIds: [1188],
      pickItemResourceIds: ['5004333'],
      challengesPerPick: 1,
      pickCandidateCount: 5,
      pickCount: 1,
      maxCompletions: 7,
      requirements: [{ tier: 'gold', rarity: 'rare', count: 4, maxRating: 81 }],
    });
    expect(session.loopDefs.find((loop) => loop.id === 'provision').preCraftPlayerPickLoopId).toBe(staticPick.id);
    expect(session.loopDefs.find((loop) => loop.id === staticPick.id).requirements[0]).toMatchObject({
      rarity: 'rare', count: 4,
    });
  });

  it('keeps static fallback metadata unless scanned preference is enabled and the scan is supported', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const staticPick = {
      id: 'static-pick',
      name: 'Static Pick',
      strategy: 'playerPickSbc',
      sbcSetIds: [1188],
      pickItemResourceIds: [5004333],
      requirements: [{ tier: 'gold', rarity: 'common', count: 9 }],
    };
    const disabled = buildPlayerPickDiscoverySession({
      sets: [fixture.rarityGroup.set],
      configuredLoops: [staticPick],
      preferScannedMetadata: false,
    });
    expect(disabled.loopOverrides).toEqual({});
    expect(disabled.loopDefs[0]).toBe(staticPick);

    const completedFallback = buildPlayerPickDiscoverySession({
      sets: [fixture.completed.set],
      configuredLoops: [staticPick],
      preferScannedMetadata: true,
    });
    expect(completedFallback.loopOverrides).toEqual({});
    expect(completedFallback.loopDefs[0]).toBe(staticPick);
  });

  it('refuses an ambiguous scanned override when multiple configured Picks share the same identity', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const base = {
      name: 'Duplicate static Pick',
      strategy: 'playerPickSbc',
      sbcSetIds: [1188],
      pickItemResourceIds: [5004333],
      requirements: [{ tier: 'gold', rarity: 'rare', count: 4 }],
    };
    const session = buildPlayerPickDiscoverySession({
      sets: [fixture.rarityGroup.set],
      configuredLoops: [{ ...base, id: 'pick-a' }, { ...base, id: 'pick-b' }],
      preferScannedMetadata: true,
    });
    expect(session.loopOverrides).toEqual({});
    expect(session.overrideDiagnostics.join('\n')).toMatch(/matches multiple configured loops: pick-a, pick-b/);
  });

  it('does not merge scanned metadata into a non-Pick loop', () => {
    expect(mergeScannedPlayerPickMetadata(
      { id: 'daily', strategy: 'dailyRoutine' },
      { id: 'discovered', strategy: 'playerPickSbc' },
    )).toBeNull();
  });

  it('uses only the latest supported snapshots and falls back when a stale session selection disappears', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const staleId = 'discovered-player-pick-4101-91001';
    const rescanned = buildPlayerPickDiscoverySession({
      sets: [fixture.completed.set, fixture.unsupportedCondition.set],
      configuredLoops: [{ id: 'daily', name: 'Daily' }],
      selectedId: staleId,
    });

    expect(rescanned.discoveredLoops).toEqual([]);
    expect(rescanned.results.map(({ status }) => status)).toEqual(['unsupported', 'unsupported']);
    expect(rescanned.selectedId).toBe('daily');
  });

  it('preserves the Custom JSON selection across a session scan', async () => {
    const fixture = await loadFixture('challenges/player-pick-discovery.json');
    const session = buildPlayerPickDiscoverySession({
      sets: [fixture.singleChallenge.set],
      configuredLoops: [{ id: 'daily', name: 'Daily' }],
      selectedId: 'custom',
    });
    expect(session.selectedId).toBe('custom');
  });

  it('ignores non-Pick rewards without inferring behavior from the SBC name', () => {
    const result = parsePlayerPickSbcSnapshot({
      set: {
        id: 4199,
        name: 'Definitely Player Pick By Name',
        rewards: [{ type: 'PACK', name: 'Player Pick Looking Pack', resourceId: 91999 }],
      },
    });
    expect(result.status).toBe('ignored');
  });
});
