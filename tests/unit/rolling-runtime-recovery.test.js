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

  it('preserves materialized primary duplicates while protected Storage routing is blocked', async () => {
    const primaryDuplicates = Array.from({ length: 7 }, (_, index) => makePlayer({
      id: 650 + index,
      definitionId: 9650 + index,
      rating: 85 + (index % 3),
      duplicate: true,
      duplicateId: 1650 + index,
    }));
    const protectedDuplicate = makePlayer({
      id: 699,
      definitionId: 9699,
      rating: 96,
      duplicate: true,
      duplicateId: 1699,
    });
    const runtime = { primaryDuplicateRefs: [] };
    const routing = {
      status: 'blocked',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      counts: { unresolved: 0 },
      reservedItems: primaryDuplicates,
      storageItems: [protectedDuplicate],
    };
    const { api } = await loadUserscript();

    expect(api.preserveRollingPrimaryDuplicateRefs(runtime, routing, { replace: true }))
      .toMatchObject({ captured: true, count: 7 });
    expect(runtime.primaryDuplicateRefs.map((ref) => ref.id))
      .toEqual(primaryDuplicates.map((item) => item.id));
    expect(runtime.primaryDuplicateRefs.map((ref) => ref.id)).not.toContain(protectedDuplicate.id);
  });

  it('preserves the existing primary duplicate behavior for a ready route', async () => {
    const duplicate = makePlayer({
      id: 660,
      definitionId: 9660,
      rating: 86,
      duplicate: true,
      duplicateId: 1660,
    });
    const runtime = { primaryDuplicateRefs: [{ id: 999, definitionId: 9999, pile: 'unassigned' }] };
    const { api } = await loadUserscript();

    expect(api.preserveRollingPrimaryDuplicateRefs(runtime, {
      status: 'ready',
      reasonCode: null,
      counts: { unresolved: 0 },
      reservedItems: [duplicate],
      storageItems: [],
    }, { replace: true })).toMatchObject({ captured: true, count: 1 });
    expect(runtime.primaryDuplicateRefs).toMatchObject([{
      id: duplicate.id,
      definitionId: duplicate.definitionId,
      pile: 'unassigned',
    }]);
  });

  it('does not preserve primary refs from unresolved or unrelated blocked routing', async () => {
    const duplicate = makePlayer({
      id: 670,
      definitionId: 9670,
      rating: 88,
      duplicate: true,
      duplicateId: 1670,
    });
    const { api } = await loadUserscript();

    for (const routing of [
      {
        status: 'blocked',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
        counts: { unresolved: 1 },
        reservedItems: [duplicate],
      },
      {
        status: 'blocked',
        reasonCode: 'OPENED_DUPLICATE_NOT_MATERIALIZED',
        counts: { unresolved: 0 },
        reservedItems: [duplicate],
      },
    ]) {
      const runtime = { primaryDuplicateRefs: [] };
      expect(api.preserveRollingPrimaryDuplicateRefs(runtime, routing, { replace: true }))
        .toMatchObject({ captured: false, count: 0 });
      expect(runtime.primaryDuplicateRefs).toEqual([]);
    }
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

  it('does not require Storage headroom for pending cards consumed by the recovery squad', async () => {
    const pendingOne = makePlayer({ id: 711, definitionId: 9711, duplicate: true });
    const pendingTwo = makePlayer({ id: 712, definitionId: 9712, duplicate: true });
    const { api } = await loadUserscript({ unassigned: [pendingOne, pendingTwo] });
    const runtime = {
      openRouting: { storageItems: [pendingOne, pendingTwo] },
      coordinator: {
        getLedger: () => ({
          summary: () => ({ capacities: { storage: { free: 0 } } }),
        }),
      },
    };

    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 0, {
      consumedPendingRefs: [pendingOne, pendingTwo],
    })).toMatchObject({
      ok: true,
      projectedFree: 0,
      requiredFree: 0,
    });
    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 1, {
      consumedPendingRefs: [pendingOne],
    })).toMatchObject({
      ok: true,
      projectedFree: 1,
      requiredFree: 1,
    });
  });

  it('releases only explicitly eligible pending Storage cards from Sink protection', async () => {
    const pending = makePlayer({
      id: 721,
      definitionId: 9721,
      rating: 91,
      duplicate: true,
      duplicateId: 1721,
    });
    const counterpart = makePlayer({ id: 1721, definitionId: 9721, rating: 91 });
    const stillProtected = makePlayer({ id: 1722, definitionId: 9722, rating: 92 });
    const { api } = await loadUserscript({ unassigned: [pending] });
    const ledger = {
      classifiedEntries: () => [
        { item: counterpart, pile: 'club', classification: { protected: true } },
        { item: stillProtected, pile: 'club', classification: { protected: true } },
      ],
    };
    const runtime = {
      pendingUnassignedRefs: [pending],
      primaryDuplicateRefs: [],
      coordinator: { getLedger: () => ledger },
    };

    const policy = api.rollingStorageSinkSelectionPolicy({}, runtime, {
      model: { constraints: [] },
      consumablePendingRefs: [pending],
      consumableItemRefs: [counterpart],
      additionalRoles: [{
        id: 'storage-pressure-release',
        itemRefs: [counterpart],
        minCount: 1,
        maxCount: 1,
      }],
    });

    expect(policy.protectedItems).toEqual([
      expect.objectContaining({ id: stillProtected.id }),
    ]);
    expect(policy.exclusiveRoles).toEqual([
      expect.objectContaining({ id: 'storage-pressure-release', minCount: 1 }),
    ]);
  });

  it('allows only an explicitly selected primary duplicate to bypass reserve-rating protection', async () => {
    const primarySignal = makePlayer({
      id: 721,
      definitionId: 9721,
      rating: 88,
      duplicate: true,
      duplicateId: 1721,
    });
    const primarySubmission = makePlayer({ id: 1721, definitionId: 9721, rating: 88 });
    const unrelatedReserve = makePlayer({ id: 1722, definitionId: 9722, rating: 88 });
    const { api } = await loadUserscript();
    const runtime = {
      primaryDuplicateRefs: [{ id: primarySignal.id, definitionId: primarySignal.definitionId }],
      pendingUnassignedRefs: [{ id: primarySignal.id, definitionId: primarySignal.definitionId }],
      primaryContext: {},
      coordinator: {
        getLedger: () => ({ classifiedEntries: () => [] }),
      },
    };
    const loopDef = {
      name: 'Rolling reserve recovery',
      runtimeProtectionRating: 95,
      runtimeProvisionsMaxRating: 88,
    };

    expect(api.assertRollingRecoveryItems(loopDef, runtime, [primarySubmission], {
      allowPrimaryDuplicates: true,
      allowSpecial: true,
      allowedPrimaryDuplicateRefs: [{
        id: primarySignal.id,
        definitionId: primarySignal.definitionId,
      }],
    })).toBe(true);
    expect(() => api.assertRollingRecoveryItems(loopDef, runtime, [unrelatedReserve], {
      allowPrimaryDuplicates: true,
      allowSpecial: true,
      allowedPrimaryDuplicateRefs: [{
        id: primarySignal.id,
        definitionId: primarySignal.definitionId,
      }],
    })).toThrow('recovery squad attempted to consume a reserved 88 card');
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
      expectedPlayerCount: 11,
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

  it('allows exactly one Required Special through final Storage Sink validation', async () => {
    const requiredSpecial = makePlayer({
      id: 900,
      definitionId: 9900,
      rating: 95,
      rareflag: 120,
      groups: [19, 33, 44, 83],
    });
    requiredSpecial.pile = 'club';
    const ordinary = Array.from({ length: 10 }, (_, index) => makePlayer({
      id: 901 + index,
      definitionId: 9901 + index,
      rating: 89,
      rareflag: 1,
    }));
    const groupConstraint = {
      source: 'ea',
      keyName: 'PLAYER_RARITY_GROUP',
      label: 'PLAYER_RARITY_GROUP 83 x1',
      count: 1,
      matches: (item) => (item.groups || []).includes(83),
    };
    const context = {
      model: {
        requiredPlayerCount: 11,
        targetRating: 88,
        constraints: [groupConstraint],
        maxSpecialCount: 1,
      },
    };
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      primaryContext: { model: context.model },
      coordinator: {
        getLedger: () => ({
          classifiedEntries: () => [{
            item: requiredSpecial,
            pile: 'club',
            classification: { requiredSpecial: true, protected: false },
          }],
        }),
      },
    };
    const loopDef = {
      name: 'Rolling Storage Sink',
      runtimeProtectionRating: 95,
      expectedPlayerCount: 11,
    };
    const { api } = await loadUserscript({ club: [requiredSpecial] });
    const validators = api.createRollingStorageSinkSubmissionValidators(
      loopDef,
      runtime,
      context,
      'Storage Sink exact-one test',
    );

    expect(validators.validatePlannedPlayers([requiredSpecial, ...ordinary])).toBe(true);

    const secondRequiredSpecial = makePlayer({
      id: 920,
      definitionId: 9920,
      rating: 89,
      rareflag: 120,
      groups: [44, 83],
    });
    expect(() => validators.validatePlannedPlayers([
      requiredSpecial,
      secondRequiredSpecial,
      ...ordinary.slice(1),
    ])).toThrow(/role-count 2\/1-1/);
  });

  it('keeps Required Special protection when a Storage Sink squad has no explicit role', async () => {
    const requiredSpecial = makePlayer({
      id: 930,
      definitionId: 9930,
      rating: 91,
      rareflag: 120,
      groups: [44, 83],
    });
    const ordinary = Array.from({ length: 10 }, (_, index) => makePlayer({
      id: 931 + index,
      definitionId: 9931 + index,
      rating: 89,
      rareflag: 1,
    }));
    const primaryModel = {
      constraints: [{
        source: 'ea',
        keyName: 'PLAYER_RARITY_GROUP',
        count: 1,
        matches: (item) => (item.groups || []).includes(83),
      }],
    };
    const context = {
      model: {
        requiredPlayerCount: 11,
        targetRating: 88,
        constraints: [],
        maxSpecialCount: 11,
      },
    };
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      primaryContext: { model: primaryModel },
      coordinator: {
        getLedger: () => ({ classifiedEntries: () => [] }),
      },
    };
    const { api } = await loadUserscript();
    const validators = api.createRollingStorageSinkSubmissionValidators(
      { name: 'Rolling Storage Sink', runtimeProtectionRating: 95, expectedPlayerCount: 11 },
      runtime,
      context,
      'Storage Sink protected-special test',
    );

    expect(() => validators.validatePlannedPlayers([requiredSpecial, ...ordinary]))
      .toThrow(/attempted to consume a Required Special card/);
  });

  it('validates a threshold-safe pending Unassigned special selected for Storage pressure', async () => {
    const pending = makePlayer({
      id: 950,
      definitionId: 9950,
      rating: 88,
      rareflag: 120,
      duplicate: true,
      duplicateId: 1950,
    });
    const counterpart = makePlayer({
      id: 1950,
      definitionId: 9950,
      rating: 88,
      rareflag: 120,
    });
    const ordinary = Array.from({ length: 10 }, (_, index) => makePlayer({
      id: 1960 + index,
      definitionId: 9960 + index,
      rating: 88,
      rareflag: 1,
    }));
    const loopDef = {
      name: 'Rolling Storage pressure',
      runtimeProtectionRating: 95,
      expectedPlayerCount: 11,
      rollingProtectAllClubNonTotwSpecials: true,
    };
    const context = {
      model: {
        requiredPlayerCount: 11,
        targetRating: 88,
        constraints: [],
        maxSpecialCount: 11,
      },
    };
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [pending],
      openRouting: { storageItems: [pending] },
      primaryContext: { activeLoopDef: loopDef, model: { constraints: [] } },
      coordinator: {
        getLedger: () => ({
          classifiedEntries: () => [{
            item: counterpart,
            pile: 'club',
            classification: { protected: true, otherSpecial: true },
          }],
        }),
      },
    };
    const selection = {
      entries: [{
        item: counterpart,
        signal: pending,
        pileName: 'unassigned',
        submissionPileName: 'club',
      }],
    };
    const { api } = await loadUserscript({
      unassigned: [pending],
      club: [counterpart, ...ordinary],
    });
    const validators = api.createRollingStorageSinkSubmissionValidators(
      loopDef,
      runtime,
      context,
      'Storage pressure pending-special test',
    );

    expect(validators.validatePlannedPlayers([counterpart, ...ordinary], selection)).toBe(true);
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
