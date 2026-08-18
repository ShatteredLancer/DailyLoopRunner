import { describe, expect, it } from 'vitest';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

describe('Rolling runtime recovery helpers', () => {
  it('counts duplicate players from both selected arrays and selection objects', async () => {
    const duplicate = makePlayer({ id: 1, duplicate: true });
    const ordinary = makePlayer({ id: 2 });
    const { api } = await loadUserscript();

    expect(api.rollingDuplicatePlayerCount([duplicate, ordinary])).toBe(1);
    expect(api.rollingDuplicatePlayerCount({ selected: [duplicate, ordinary] })).toBe(1);
    expect(api.rollingDuplicatePlayerCount({
      selected: [ordinary],
      entries: [{ pileName: 'unassigned', signal: duplicate, item: ordinary }],
    })).toBe(1);
    expect(api.rollingDuplicatePlayerCount({ status: 'submitted' })).toBe(0);
  });

  it('does not treat configured Provisions reserve ratings as Rare Gold Pick triggers', async () => {
    const { api } = await loadUserscript();
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 86, rating: 86, rareflag: 1, duplicate: true }), {})).toBe(true);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 87, rating: 87, rareflag: 1, duplicate: true }), {})).toBe(false);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 88, rating: 88, rareflag: 1, duplicate: true }), {})).toBe(false);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 89, rating: 89, rareflag: 1, duplicate: true }), {})).toBe(true);
    expect(api.rollingOrdinaryGoldDuplicate(
      makePlayer({ id: 189, rating: 89, rareflag: 1, duplicate: true }),
      { runtimeProvisionsMaxRating: 89 },
    )).toBe(false);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 90, rating: 90, rareflag: 2, duplicate: true }), {})).toBe(false);
  });

  it('detects a pending Player Pick from its exact live entity instead of the ledger snapshot', async () => {
    const livePick = makePlayer({ id: 501, definitionId: 9501 });
    livePick.isPlayerPickItem = () => true;
    const snapshot = { type: 'misc', id: 501, definitionId: 9501 };
    const { api } = await loadUserscript({ unassigned: [livePick] });

    expect(api.inspectRollingLiveUnassignedEntries([{ item: snapshot, pile: 'unassigned' }]))
      .toMatchObject({ ok: true, playerPickCount: 1, playerPickIds: [501] });
  });

  it('fails closed when a reconciled Unassigned snapshot has no exact live item', async () => {
    const { api } = await loadUserscript();

    expect(api.inspectRollingLiveUnassignedEntries([{
      item: { type: 'player', id: 502, definitionId: 9502 },
      pile: 'unassigned',
    }])).toMatchObject({
      ok: false,
      reasonCode: 'UNASSIGNED_RESUME_IDENTITY_CHANGED',
    });
  });

  it('refreshes pending Rolling refs from current Unassigned players only', async () => {
    const { api } = await loadUserscript();
    const runtime = {
      pendingUnassignedRefs: [{ id: 999, definitionId: 999, pile: 'unassigned' }],
      coordinator: {
        getLedger: () => ({
          classifiedEntries: () => [
            { item: { type: 'player', id: 601, definitionId: 9601 }, pile: 'unassigned' },
            { item: { type: 'player', id: 602, definitionId: 9602 }, pile: 'storage' },
            { item: { type: 'consumable', id: 603, definitionId: 9603 }, pile: 'unassigned' },
          ],
        }),
      },
    };

    expect(api.refreshRollingPendingUnassignedRefs(runtime)).toEqual([
      { id: 601, definitionId: 9601, pile: 'unassigned' },
    ]);
    expect(runtime.pendingUnassignedRefs).toEqual([
      { id: 601, definitionId: 9601, pile: 'unassigned' },
    ]);
  });

  it('rejects emergency Provisions unless actual Storage consumption fits every pending card', async () => {
    const pendingOne = makePlayer({ id: 701, definitionId: 9701, duplicate: true });
    const pendingTwo = makePlayer({ id: 702, definitionId: 9702, duplicate: true });
    const { api } = await loadUserscript({ unassigned: [pendingOne, pendingTwo] });
    const runtime = {
      openRouting: { storageItems: [pendingOne, pendingTwo] },
      coordinator: {
        getLedger: () => ({
          summary: () => ({ capacities: { storage: { free: 0 } } }),
        }),
      },
    };

    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 0)).toMatchObject({
      ok: false,
      reasonCode: 'RECOVERY_STORAGE_HEADROOM_INSUFFICIENT',
      details: { projectedFree: 0, requiredFree: 2 },
    });
    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 1)).toMatchObject({
      ok: false,
      reasonCode: 'RECOVERY_STORAGE_HEADROOM_INSUFFICIENT',
      details: { projectedFree: 1, requiredFree: 2 },
    });
    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 2)).toMatchObject({
      ok: true,
      projectedFree: 2,
      requiredFree: 2,
    });
  });

  it('checks EA Storage Sink challenge readiness only after the selected squad is saved', async () => {
    const { api } = await loadUserscript();
    const players = Array.from({ length: 11 }, (_, index) => makePlayer({
      id: 800 + index,
      definitionId: 9800 + index,
      rating: 89,
      rareflag: 1,
    }));
    let readinessChecks = 0;
    let squadSaved = false;
    const context = {
      model: {
        requiredPlayerCount: 11,
        targetRating: 89,
        constraints: [],
        maxSpecialCount: 11,
      },
      challenge: {
        meetsRequirements() {
          readinessChecks++;
          return squadSaved;
        },
      },
    };
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      primaryContext: {},
      coordinator: {
        getLedger: () => ({ classifiedEntries: () => [] }),
      },
    };
    const loopDef = {
      name: 'Rolling Storage Sink',
      runtimeProtectionRating: 95,
      expectedPlayers: 11,
    };

    const validators = api.createRollingStorageSinkSubmissionValidators(
      loopDef,
      runtime,
      context,
      'Storage Sink test',
    );

    expect(validators.validatePlannedPlayers(players)).toBe(true);
    expect(validators.preSave({ players })).toBe(true);
    expect(readinessChecks).toBe(0);

    squadSaved = true;
    expect(validators.postSave({ players, savedPlayers: players })).toBe(true);
    expect(readinessChecks).toBe(1);
  });

  it('reuses an already loaded Set challenge squad without replacing fresh metadata', async () => {
    const { api } = await loadUserscript();
    const cachedSquad = { id: 'cached-squad' };
    const cachedChallenge = { id: 3870, squad: cachedSquad, eligibilityRequirements: ['stale'] };
    const freshChallenge = { id: 3870, squad: null, eligibilityRequirements: ['fresh'] };
    const set = { challenges: { _collection: [cachedChallenge] } };

    expect(api.synchronizeCachedSbcChallengeSquad(set, freshChallenge)).toBe(freshChallenge);
    expect(freshChallenge.squad).toBe(cachedSquad);
    expect(freshChallenge.eligibilityRequirements).toEqual(['fresh']);

    const newlyLoadedSquad = { id: 'newly-loaded-squad' };
    freshChallenge.squad = newlyLoadedSquad;
    cachedChallenge.squad = null;
    api.synchronizeCachedSbcChallengeSquad(set, freshChallenge);
    expect(cachedChallenge.squad).toBe(newlyLoadedSquad);
  });
});
