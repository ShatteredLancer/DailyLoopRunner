import { describe, expect, it } from 'vitest';
import {
  classifyRollingInventoryItem,
  createRollingPrimarySelectionPolicy,
  createRollingRatingRecoverySelectionPolicy,
  createRollingRecoveryProtection,
  createRollingRequiredSpecialSourceFilter,
  createRollingStorageSinkCandidateFilter,
  diagnoseRollingInventoryRefs,
  planRollingStorageMaintenance,
  planRollingOpenedItemRouting,
  releaseRollingPrimaryDuplicateRefs,
  releaseRollingRoutingItemsAfterConsumption,
  rollingDuplicateTargetProtectionReasons,
  rollingPrimaryDuplicateProtectionConflicts,
  rollingPrimaryDuplicateRelaxationOrder,
  validateRollingPrimaryDuplicateIdentity,
} from '../../src/inventory/rolling-policy.js';

function item(id, rating, overrides = {}) {
  const pile = overrides.pile || 'unassigned';
  return {
    id,
    definitionId: 1000 + id,
    type: 'player',
    rating,
    special: overrides.special === true,
    duplicate: overrides.duplicate !== false,
    duplicateId: overrides.duplicateId || 2000 + id,
    pile,
    ref: { id, definitionId: 1000 + id, pile },
    ...overrides,
  };
}

describe('Rolling inventory policy', () => {
  it('plans complete Storage 87/88 batches before low-card TOTW maintenance', () => {
    const entries = [
      item(1, 87, { pile: 'storage', duplicate: false }),
      item(2, 88, { pile: 'storage', duplicate: false }),
      item(3, 87, { pile: 'storage', duplicate: false }),
      item(4, 88, { pile: 'storage', duplicate: false }),
      ...Array.from({ length: 11 }, (_, index) => item(20 + index, index === 0 ? 89 : 85, {
        pile: 'storage',
        duplicate: false,
      })),
    ].map((value) => ({
      item: value,
      pile: value.pile,
      classification: { requiredSpecial: false, protected: false },
    }));

    const plan = planRollingStorageMaintenance({ entries });

    expect(plan).toMatchObject({
      status: 'ready',
      action: 'provisions',
      provisions: { eligible: 4, batches: 1 },
      totw: { eligible: 11, ready: true },
    });
    expect(plan.provisions.nextBatchRefs.map((ref) => ref.id)).toEqual([1, 3, 2, 4]);
  });

  it('retains an incomplete 87/88 batch and plans TOTW only from Storage <=86 or 89', () => {
    const entries = [
      item(1, 87, { pile: 'storage', duplicate: false }),
      item(2, 88, { pile: 'storage', duplicate: false }),
      ...Array.from({ length: 10 }, (_, index) => item(20 + index, 85, {
        pile: 'storage',
        duplicate: false,
      })),
      item(30, 89, { pile: 'storage', duplicate: false }),
      item(31, 85, { pile: 'club', duplicate: false }),
    ].map((value) => ({
      item: value,
      pile: value.pile,
      classification: { requiredSpecial: false, protected: false },
    }));

    const plan = planRollingStorageMaintenance({ entries });

    expect(plan).toMatchObject({
      action: 'totw',
      provisions: { eligible: 2, batches: 0 },
      totw: { eligible: 11, ready: true },
    });
    expect(plan.totw.candidateRefs.map((ref) => ref.id)).not.toContain(31);
  });

  it('excludes Required Special, protected, uncertain, and current primary cards from Storage maintenance', () => {
    const values = [
      { value: item(1, 88, { pile: 'storage', duplicate: false }), classification: { requiredSpecial: true, protected: false } },
      { value: item(2, 88, { pile: 'storage', duplicate: false }), classification: { requiredSpecial: false, protected: true } },
      { value: item(3, 88, { pile: 'storage', duplicate: false }), classification: { requiredSpecial: null, protected: false } },
      { value: item(4, 88, { pile: 'storage', duplicate: false }), classification: { requiredSpecial: false, protected: false } },
      { value: item(5, 88, { pile: 'storage', duplicate: false }), classification: { requiredSpecial: false, protected: false } },
      { value: item(6, 85, { pile: 'storage', duplicate: false }), classification: { requiredSpecial: false, protected: false } },
    ];
    const plan = planRollingStorageMaintenance({
      entries: values.map(({ value, classification }) => ({ item: value, pile: value.pile, classification })),
      protectedItems: [values[3].value.ref],
    });

    expect(plan).toMatchObject({
      status: 'idle',
      provisions: { eligible: 1, batches: 0 },
      totw: { eligible: 1, ready: false },
    });
    expect(plan.provisions.nextBatchRefs.map((ref) => ref.id)).toEqual([5]);
  });

  it('allows every eligible Required Special outside Club but only TOTW from Club', () => {
    const filter = createRollingRequiredSpecialSourceFilter({
      constraintIndexes: [0],
      isClubTotw: (candidate) => candidate.totw === true,
    });
    const entry = (pileName, options = {}) => ({
      pileName,
      item: { id: options.id || 1, totw: options.totw === true },
      requirementMatches: [options.matches !== false],
    });

    expect(filter(entry('unassigned'))).toBe(true);
    expect(filter(entry('storage'))).toBe(true);
    expect(filter(entry('transfer'))).toBe(true);
    expect(filter(entry('club', { totw: true }))).toBe(true);
    expect(filter(entry('club'))).toBe(false);
    expect(filter(entry('club', { matches: false }))).toBe(true);
  });

  it('uses the actual submission pile when filtering a resolved duplicate signal', () => {
    const filter = createRollingRequiredSpecialSourceFilter({
      constraintIndexes: [0],
      isClubTotw: (candidate) => candidate.totw === true,
    });

    expect(filter({
      pileName: 'unassigned',
      submissionPileName: 'club',
      item: { id: 30, totw: false },
      requirementMatches: [true],
    })).toBe(false);
    expect(filter({
      pileName: 'unassigned',
      submissionPileName: 'club',
      item: { id: 31, totw: true },
      requirementMatches: [true],
    })).toBe(true);
    expect(filter({
      pileName: 'storage',
      submissionPileName: 'storage',
      item: { id: 32, totw: false },
      requirementMatches: [true],
    })).toBe(true);
  });

  it('fails closed for an unknown Required Special submission pile', () => {
    const filter = createRollingRequiredSpecialSourceFilter({
      constraintIndexes: [0],
      isClubTotw: () => true,
    });

    expect(filter({
      submissionPileName: 7,
      item: { id: 30, pile: 7 },
      requirementMatches: [true],
    })).toBe(false);
  });

  it('classifies high duplicates, Required Special, and Provisions reserves independently', () => {
    expect(classifyRollingInventoryItem(item(1, 96), {
      protectionRating: 95,
      requiredSpecial: false,
    })).toMatchObject({ protected: true, requiredSpecial: false });
    expect(classifyRollingInventoryItem(item(2, 88, { special: true }), {
      protectionRating: 95,
      requiredSpecial: true,
    })).toMatchObject({ requiredSpecial: true, provisionsReserve: false });
    expect(classifyRollingInventoryItem(item(3, 88, { special: true }), {
      protectionRating: 95,
      requiredSpecial: false,
    })).toMatchObject({ otherSpecial: true, provisionsReserve: true, protected: false });
    expect(classifyRollingInventoryItem(item(4, 89, { special: true }), {
      requiredSpecial: false,
    }).provisionsReserve).toBe(false);
    expect(classifyRollingInventoryItem(item(5, 89, { special: true }), {
      requiredSpecial: false,
      provisionsMaxRating: 89,
    }).provisionsReserve).toBe(true);
  });

  it('keeps one low-cost Required Special and stores extras, reserves, and protected duplicates', () => {
    const requiredIds = new Set([1, 2, 3]);
    const plan = planRollingOpenedItemRouting([
      item(1, 91, { special: true }),
      item(2, 87, { special: true }),
      item(3, 93, { special: true }),
      item(4, 88, { special: true }),
      item(5, 96),
      item(6, 86),
      item(7, 90, { duplicate: false }),
    ], {
      protectionRating: 95,
      storageFree: 10,
      proactiveProvisionsEnabled: true,
      isRequiredSpecial: (value) => requiredIds.has(value.id),
    });

    expect(plan.status).toBe('ready');
    expect(plan.reservedItems.map((value) => value.id)).toEqual([2, 6]);
    expect(plan.storageItems.map((value) => value.id).sort()).toEqual([1, 3, 4, 5]);
    expect(plan.directClubItems.map((value) => value.id)).toEqual([7]);
    expect(plan.counts).toMatchObject({ requiredSpecial: 3, keptRequiredSpecial: 1, storageRequired: 4 });
  });

  it('stores non-required special duplicates when the primary special slots are exclusive', () => {
    const plan = planRollingOpenedItemRouting([
      item(1, 93, { special: true }),
      item(2, 89, { special: true }),
      item(3, 86),
    ], {
      protectionRating: 96,
      storageFree: 2,
      storeOtherSpecialDuplicates: true,
      isRequiredSpecial: () => false,
    });

    expect(plan.status).toBe('ready');
    expect(plan.storageItems.map((value) => value.id)).toEqual([1, 2]);
    expect(plan.reservedItems.map((value) => value.id)).toEqual([3]);
    expect(plan.counts).toMatchObject({
      otherSpecialStored: 2,
      primaryDuplicates: 1,
      storageRequired: 2,
    });
  });

  it('routes primary-pack Provisions reserves to Storage instead of the next primary squad', () => {
    const plan = planRollingOpenedItemRouting([
      item(1, 88),
      item(2, 88),
      item(3, 88),
      item(4, 87),
    ], {
      protectionRating: 95,
      storageFree: 4,
      proactiveProvisionsEnabled: true,
      isRequiredSpecial: () => false,
    });

    expect(plan.status).toBe('ready');
    expect(plan.reservedItems).toEqual([]);
    expect(plan.storageItems).toEqual([]);
    expect(plan.provisionsItems.map((value) => value.id)).toEqual([1, 2, 3, 4]);
    expect(plan.counts).toMatchObject({
      provisionsReserve: 4,
      provisionsImmediate: 4,
      primaryDuplicates: 0,
      storageRequired: 0,
    });
  });

  it('stores only the remainder when opened Reserve duplicates exceed a complete Provisions squad', () => {
    const plan = planRollingOpenedItemRouting([
      item(1, 87),
      item(2, 88),
      item(3, 88),
      item(4, 87),
      item(5, 88),
    ], {
      protectionRating: 95,
      storageFree: 1,
      provisionsRequiredCount: 4,
      proactiveProvisionsEnabled: true,
      isRequiredSpecial: () => false,
    });

    expect(plan.status).toBe('ready');
    expect(plan.provisionsItems.map((value) => value.id)).toEqual([1, 2, 3, 4]);
    expect(plan.storageItems.map((value) => value.id)).toEqual([5]);
  });

  it('routes 85-89 duplicates to the primary squad when proactive surplus crafting is disabled', () => {
    const primary = planRollingOpenedItemRouting([
      item(1, 85),
      item(2, 86),
      item(3, 87),
      item(4, 88),
      item(5, 89),
    ], {
      storageFree: 0,
      provisionsRequiredCount: 4,
      provisionsMaxRating: 89,
      isRequiredSpecial: () => false,
    });
    expect(primary).toMatchObject({
      status: 'ready',
      counts: {
        provisionsReserve: 3,
        provisionsImmediate: 0,
        primaryDuplicates: 5,
        storageRequired: 0,
      },
    });
    expect(primary.provisionsItems).toEqual([]);
    expect(primary.storageItems).toEqual([]);
    expect(primary.reservedItems.map((value) => value.id)).toEqual([1, 2, 3, 4, 5]);

    const unavailable = planRollingOpenedItemRouting([
      item(7, 87),
      item(8, 87),
      item(9, 88),
      item(10, 88),
    ], {
      storageFree: 4,
      provisionsRequiredCount: 4,
      proactiveProvisionsEnabled: true,
      provisionsRecoveryAvailable: false,
      isRequiredSpecial: () => false,
    });
    expect(unavailable.counts).toMatchObject({ provisionsImmediate: 0, storageRequired: 4 });
    expect(unavailable.storageItems.map((value) => value.id)).toEqual([7, 8, 9, 10]);
  });

  it('fails closed when protected/reserved duplicates exceed Storage space', () => {
    const plan = planRollingOpenedItemRouting([
      item(1, 96),
      item(2, 97),
    ], {
      protectionRating: 95,
      storageFree: 1,
      isRequiredSpecial: () => false,
    });

    expect(plan).toMatchObject({
      status: 'blocked',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      counts: { storageRequired: 2, storageFree: 1 },
    });
    expect(plan.pendingItems).toHaveLength(2);
  });

  it('classifies live EA entities through explicit duplicate and special adapters', () => {
    const liveDuplicate = {
      id: 1,
      definitionId: 1001,
      type: 'player',
      rating: 96,
      duplicateId: 2001,
      isDuplicate: () => true,
      isSpecial: () => true,
    };
    const plan = planRollingOpenedItemRouting([liveDuplicate], {
      protectionRating: 95,
      storageFree: 1,
      isDuplicate: (value) => value.isDuplicate(),
      isSpecial: (value) => value.isSpecial(),
      isRequiredSpecial: () => false,
    });

    expect(plan.status).toBe('ready');
    expect(plan.counts).toMatchObject({ duplicates: 1, protectedDuplicates: 1, storageRequired: 1 });
    expect(plan.entries[0].classification).toMatchObject({ duplicate: true, special: true, protected: true });
    expect(plan.storageItems).toEqual([liveDuplicate]);
    expect(plan.directClubItems).toEqual([]);
  });

  it('routes a duplicate signal to Storage when its exact submission target is protected', () => {
    const signal = item(1, 86, { duplicateId: 7001 });
    const plan = planRollingOpenedItemRouting([signal], {
      protectionRating: 95,
      storageFree: 1,
      isRequiredSpecial: () => false,
      duplicateTargetProtectionReasons: () => ['duplicate-target-fsu-locked'],
    });

    expect(plan.status).toBe('ready');
    expect(plan.reservedItems).toEqual([]);
    expect(plan.storageItems).toEqual([signal]);
    expect(plan.entries[0].classification).toMatchObject({
      protected: true,
      protectionReasons: ['duplicate-target-fsu-locked'],
    });
  });

  it('describes an unavailable or protected exact duplicate target without relaxing identity', () => {
    const signal = item(1, 86, { duplicateId: 7001 });
    const target = item(7001, 86, { duplicate: false, pile: 'club' });

    expect(rollingDuplicateTargetProtectionReasons(signal, {
      isDuplicate: () => true,
      resolveTarget: () => target,
      protectionReasons: () => ['fsu-locked'],
    })).toEqual(['duplicate-target-fsu-locked']);
    expect(rollingDuplicateTargetProtectionReasons(signal, {
      isDuplicate: () => true,
      resolveTarget: () => null,
    })).toEqual(['duplicate-target-unavailable']);
    expect(rollingDuplicateTargetProtectionReasons(signal, {
      isDuplicate: () => true,
      resolveTarget: () => item(7002, 86, { duplicate: false, pile: 'club' }),
    })).toEqual(['duplicate-target-unavailable']);
    expect(rollingDuplicateTargetProtectionReasons({ ...signal, duplicate: false }, {
      isDuplicate: () => false,
    })).toEqual([]);
  });

  it('stores a protected Required Special instead of reserving it for the current squad', () => {
    const plan = planRollingOpenedItemRouting([
      item(1, 96, { special: true }),
      item(2, 92, { special: true }),
    ], {
      protectionRating: 95,
      storageFree: 2,
      isRequiredSpecial: () => true,
    });

    expect(plan.status).toBe('ready');
    expect(plan.reservedItems.map((value) => value.id)).toEqual([2]);
    expect(plan.storageItems.map((value) => value.id)).toEqual([1]);
  });

  it('fails closed when Storage capacity or special classification is unknown', () => {
    const blocked = planRollingOpenedItemRouting([item(1, 96)], {
      protectionRating: 95,
      storageFree: null,
      isRequiredSpecial: () => false,
    });
    expect(blocked).toMatchObject({ status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' });

    const policy = createRollingPrimarySelectionPolicy({
      entries: [{
        item: item(2, 90, { special: true }),
        classification: { requiredSpecial: null, protected: false, provisionsReserve: false },
      }],
      model: { constraints: [] },
    });
    expect(policy.requiredItems).toEqual([]);
    expect(policy.preferredItems).toEqual([]);
  });

  it('builds a role-aware primary policy from ledger classifications', () => {
    const entries = [
      { item: item(1, 85, { duplicateId: 101 }), classification: { requiredSpecial: false, protected: false, provisionsReserve: false } },
      { item: item(2, 86, { pile: 'storage', duplicateId: 102 }), classification: { requiredSpecial: false, protected: false, provisionsReserve: false } },
      { item: item(3, 96, { pile: 'storage' }), classification: { requiredSpecial: false, protected: true, provisionsReserve: false } },
      { item: item(4, 88, { special: true }), classification: { requiredSpecial: false, protected: false, provisionsReserve: true } },
      { item: item(5, 89, { special: true }), classification: { requiredSpecial: true, protected: false, provisionsReserve: false } },
    ];
    const policy = createRollingPrimarySelectionPolicy({
      entries,
      protectionRating: 95,
      model: {
        constraints: [{
          id: 'challenge-0',
          source: 'ea',
          keyName: 'PLAYER_RARITY_GROUP',
          count: 1,
          label: 'Required Special x1',
        }],
      },
    });

    expect(policy.requiredItems).toEqual([{ id: 101, definitionId: 1001, pile: 'unknown' }]);
    expect(policy.preferredItems.map((ref) => ref.id)).toEqual([101, 102]);
    expect(policy.protectedItems.map((ref) => ref.id)).toEqual([3]);
    expect(policy.exclusiveRoles).toEqual([
      expect.objectContaining({ id: 'required-special', constraintIndex: 0, minCount: 1, maxCount: 1 }),
    ]);
    expect(policy.protectionPolicy).toMatchObject({
      reserveRatings: [87, 88],
      softProtectSpecialPiles: ['club'],
      liveRequirementsAvailable: true,
    });
  });

  it('does not inherit unrouted Unassigned duplicates into a recovery SBC policy', () => {
    const pendingDuplicates = [
      item(11, 88, { duplicateId: 111 }),
      item(12, 92, { duplicateId: 112 }),
      item(13, 87, { duplicateId: 113 }),
    ];
    const policy = createRollingPrimarySelectionPolicy({
      entries: pendingDuplicates.map((value) => ({
        item: value,
        classification: { requiredSpecial: false, protected: false, provisionsReserve: false },
      })),
      primaryDuplicateRefs: [],
      includeUnroutedUnassignedDuplicates: false,
      model: { constraints: [] },
    });

    expect(policy.requiredItems).toEqual([]);
    expect(policy.preferredItems).toEqual([]);

    const explicitlyRouted = createRollingPrimarySelectionPolicy({
      entries: pendingDuplicates.map((value) => ({
        item: value,
        classification: { requiredSpecial: false, protected: false, provisionsReserve: false },
      })),
      primaryDuplicateRefs: [pendingDuplicates[0].ref],
      includeUnroutedUnassignedDuplicates: false,
      model: { constraints: [] },
    });
    expect(explicitlyRouted.requiredItems).toEqual([{
      id: pendingDuplicates[0].duplicateId,
      definitionId: pendingDuplicates[0].definitionId,
      pile: 'unknown',
    }]);
    expect(explicitlyRouted.preferredItems).toEqual(explicitlyRouted.requiredItems);
  });

  it('allows a protected Club entity only while an eligible transient duplicate signal authorizes it', () => {
    const clubEventCard = item(20, 93, {
      pile: 'club',
      duplicate: false,
      duplicateId: 0,
      special: true,
    });
    const unassignedSignal = item(21, 93, {
      pile: 'unassigned',
      definitionId: clubEventCard.definitionId,
      duplicateId: clubEventCard.id,
      special: true,
    });
    const entries = [
      {
        item: clubEventCard,
        classification: { requiredSpecial: false, protected: true, provisionsReserve: false },
      },
      {
        item: unassignedSignal,
        classification: { requiredSpecial: true, protected: false, provisionsReserve: false },
      },
    ];

    const authorized = createRollingPrimarySelectionPolicy({ entries, model: { constraints: [] } });
    expect(authorized.protectedItems).toEqual([]);

    const withoutSignal = createRollingPrimarySelectionPolicy({
      entries: entries.slice(0, 1),
      model: { constraints: [] },
    });
    expect(withoutSignal.protectedItems).toEqual([clubEventCard.ref]);

    const protectedSignal = createRollingPrimarySelectionPolicy({
      entries: [
        entries[0],
        { ...entries[1], classification: { ...entries[1].classification, protected: true } },
      ],
      model: { constraints: [] },
    });
    expect(protectedSignal.protectedItems).toEqual([clubEventCard.ref, unassignedSignal.ref]);

    const signalWithoutDuplicateId = createRollingPrimarySelectionPolicy({
      entries: [
        entries[0],
        { ...entries[1], item: { ...entries[1].item, duplicateId: 0 } },
      ],
      model: { constraints: [] },
    });
    expect(signalWithoutDuplicateId.protectedItems).toEqual([clubEventCard.ref]);
  });

  it('does not let an Unassigned signal bypass Club non-TOTW protection', () => {
    const clubTots = item(30, 93, {
      pile: 'club',
      duplicate: false,
      special: true,
    });
    const signal = item(31, 93, {
      pile: 'unassigned',
      duplicate: true,
      duplicateId: clubTots.id,
      special: true,
    });
    const entries = [
      {
        item: clubTots,
        classification: { requiredSpecial: false, protected: true, provisionsReserve: false },
      },
      {
        item: signal,
        classification: { requiredSpecial: true, protected: false, provisionsReserve: false },
      },
    ];
    const policy = createRollingPrimarySelectionPolicy({
      entries,
      model: { constraints: [] },
      isTransientSubmissionAllowed: (target) => target.id !== clubTots.id,
    });

    expect(policy.protectedItems).toEqual([clubTots.ref]);
  });

  it('keeps a routed 87/88 duplicate reserved for Provisions instead of the primary squad', () => {
    const reserve = item(6, 88, { pile: 'storage', special: false });
    const policy = createRollingPrimarySelectionPolicy({
      entries: [{
        item: reserve,
        classification: { requiredSpecial: false, protected: false, provisionsReserve: true },
      }],
      primaryDuplicateRefs: [{ id: reserve.id, definitionId: reserve.definitionId, pile: 'storage' }],
      model: { constraints: [] },
    });

    expect(policy.requiredItems).toEqual([]);
    expect(policy.preferredItems).toEqual([]);
  });

  it('requires a routed 87/88 duplicate in the primary squad when surplus reserve protection is disabled', () => {
    const reserve = item(6, 88, { pile: 'storage', special: false });
    const policy = createRollingPrimarySelectionPolicy({
      entries: [{
        item: reserve,
        classification: { requiredSpecial: false, protected: false, provisionsReserve: true },
      }],
      primaryDuplicateRefs: [{ id: reserve.id, definitionId: reserve.definitionId, pile: 'storage' }],
      reserveRatings: false,
      model: { constraints: [] },
    });

    expect(policy.requiredItems).toEqual([reserve.ref]);
    expect(policy.preferredItems).toEqual([reserve.ref]);
    expect(policy.protectionPolicy.reserveRatings).toEqual([]);
  });

  it('detects a mandatory duplicate whose exact submission target is hard protected', () => {
    const signal = item(60, 91, {
      special: true,
      duplicateId: 1060,
      pile: 'unassigned',
    });
    const safeSignal = item(61, 87, {
      duplicateId: 1061,
      pile: 'unassigned',
    });
    const target = item(1060, 91, {
      special: true,
      duplicate: false,
      duplicateId: 0,
      definitionId: signal.definitionId,
      pile: 'club',
      ref: { id: 1060, definitionId: signal.definitionId, pile: 'club' },
    });
    const safeTarget = item(1061, 87, {
      duplicate: false,
      duplicateId: 0,
      definitionId: safeSignal.definitionId,
      pile: 'club',
      ref: { id: 1061, definitionId: safeSignal.definitionId, pile: 'club' },
    });
    const entries = [
      {
        item: signal,
        classification: { requiredSpecial: true, protected: false, provisionsReserve: false },
      },
      {
        item: target,
        classification: { requiredSpecial: true, protected: true, provisionsReserve: false },
      },
      {
        item: safeSignal,
        classification: { requiredSpecial: false, protected: false, provisionsReserve: false },
      },
      {
        item: safeTarget,
        classification: { requiredSpecial: false, protected: false, provisionsReserve: false },
      },
    ];

    expect(rollingPrimaryDuplicateProtectionConflicts({
      entries,
      primaryDuplicateRefs: [signal.ref, safeSignal.ref],
      model: { constraints: [] },
      isTransientSubmissionAllowed: () => false,
    })).toEqual({
      refs: [signal.ref],
      submissionRefs: [{ id: target.id, definitionId: signal.definitionId, pile: 'unknown' }],
    });
    expect(rollingPrimaryDuplicateProtectionConflicts({
      entries,
      primaryDuplicateRefs: [signal.ref, safeSignal.ref],
      model: { constraints: [] },
      isTransientSubmissionAllowed: () => true,
    })).toEqual({ refs: [], submissionRefs: [] });
  });

  it('removes relaxed primary-pack duplicates from required and preferred inputs', () => {
    const high = item(7, 92, { pile: 'unassigned', duplicateId: 107 });
    const low = item(8, 86, { pile: 'unassigned', duplicateId: 108 });
    const entries = [high, low].map((value) => ({
      item: value,
      classification: { requiredSpecial: false, protected: false, provisionsReserve: false },
    }));
    const primaryDuplicateRefs = entries.map(({ item: value }) => value.ref);
    const policy = createRollingPrimarySelectionPolicy({
      entries,
      primaryDuplicateRefs,
      relaxedPrimaryDuplicateRefs: [high.ref],
      model: { constraints: [] },
    });

    expect(policy.requiredItems).toEqual([{ id: 108, definitionId: low.definitionId, pile: 'unknown' }]);
    expect(policy.preferredItems.map((ref) => ref.id)).toEqual([108]);
    expect(policy.protectedItems).toEqual([{ id: 107, definitionId: high.definitionId, pile: 'unknown' }]);
    expect(policy.relaxedPrimaryDuplicateRefs).toEqual([high.ref]);
  });

  it('relaxes ordinary primary duplicates from highest rating first and never relaxes Required Special', () => {
    const high = item(9, 94);
    const low = item(10, 86);
    const requiredSpecial = item(11, 91, { special: true });
    const protectedCard = item(12, 96);
    const entries = [
      { item: low, classification: { requiredSpecial: false, protected: false } },
      { item: requiredSpecial, classification: { requiredSpecial: true, protected: false } },
      { item: high, classification: { requiredSpecial: false, protected: false } },
      { item: protectedCard, classification: { requiredSpecial: false, protected: true } },
    ];

    expect(rollingPrimaryDuplicateRelaxationOrder({
      entries,
      primaryDuplicateRefs: entries.map(({ item: value }) => value.ref),
    })).toEqual([high.ref, low.ref]);
  });

  it('keeps lower 85-89 duplicates in the primary squad by relaxing the highest rating first', () => {
    const duplicates = [85, 86, 87, 88, 89].map((rating, index) => item(20 + index, rating));
    const entries = duplicates.map((value) => ({
      item: value,
      classification: { requiredSpecial: false, protected: false },
    }));

    expect(rollingPrimaryDuplicateRelaxationOrder({
      entries,
      primaryDuplicateRefs: duplicates.map((value) => value.ref),
    }).map((ref) => ref.id)).toEqual([24, 23, 22, 21, 20]);
  });

  it('releases confirmed recovery consumption from every routing ownership set by exact item id', () => {
    const consumedReserve = item(30, 87, { pile: 'storage' });
    const sameVersionOtherItem = item(31, 87, { pile: 'storage' });
    sameVersionOtherItem.definitionId = consumedReserve.definitionId;
    sameVersionOtherItem.ref = { ...sameVersionOtherItem.ref, definitionId: consumedReserve.definitionId };
    const deferredHigh = item(32, 93, { pile: 'unassigned' });
    const routing = {
      status: 'blocked',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      storageItems: [consumedReserve, sameVersionOtherItem, deferredHigh],
      pendingItems: [deferredHigh],
      provisionsItems: [consumedReserve],
      reservedItems: [consumedReserve, deferredHigh],
      entries: [consumedReserve, sameVersionOtherItem, deferredHigh].map((value) => ({
        item: value,
        classification: { provisionsReserve: value === consumedReserve },
      })),
    };

    const released = releaseRollingRoutingItemsAfterConsumption(routing, [consumedReserve.ref]);

    expect(released.removedItemCount).toBe(1);
    expect(released.removedByField).toEqual({
      storageItems: 1,
      pendingItems: 0,
      provisionsItems: 1,
      reservedItems: 1,
      entries: 1,
    });
    expect(released.routing).toMatchObject({
      status: 'blocked',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
    });
    expect(released.routing.storageItems.map((value) => value.id)).toEqual([31, 32]);
    expect(released.routing.pendingItems.map((value) => value.id)).toEqual([32]);
    expect(released.routing.provisionsItems).toEqual([]);
    expect(released.routing.reservedItems.map((value) => value.id)).toEqual([32]);
    expect(released.routing.entries.map(({ item: value }) => value.id)).toEqual([31, 32]);
  });

  it('releases only deferred primary duplicates that were safely routed to Storage', () => {
    const retained = item(40, 86, { pile: 'unassigned' });
    const deferred = item(41, 93, { pile: 'unassigned' });
    const sameVersionOtherItem = item(42, 93, { pile: 'storage' });
    sameVersionOtherItem.definitionId = deferred.definitionId;
    sameVersionOtherItem.ref = { ...sameVersionOtherItem.ref, definitionId: deferred.definitionId };

    const released = releaseRollingPrimaryDuplicateRefs(
      [retained.ref, deferred.ref, sameVersionOtherItem.ref],
      [deferred.ref],
    );

    expect(released.refs.map((ref) => ref.id)).toEqual([retained.id, sameVersionOtherItem.id]);
    expect(released.releasedRefs).toEqual([deferred.ref]);
  });

  it('hard-protects Required Special and protected cards from every recovery SBC', () => {
    const entries = [
      { item: item(1, 84, { special: true, pile: 'storage' }), pile: 'storage', classification: { requiredSpecial: true, protected: false } },
      { item: item(2, 96, { pile: 'storage' }), pile: 'storage', classification: { requiredSpecial: false, protected: true } },
      { item: item(3, 90, { special: true, pile: 'club' }), pile: 'club', classification: { requiredSpecial: false, otherSpecial: true, protected: false } },
      { item: item(4, 88, { pile: 'club' }), pile: 'club', classification: { requiredSpecial: false, protected: false } },
    ];

    const protection = createRollingRecoveryProtection({ entries });

    expect(protection.protectedItemIds).toEqual([1, 2]);
    expect(protection.softProtectedItems.map((ref) => ref.id)).toEqual([3]);
  });

  it('protects the Club submission entity behind a transient primary duplicate signal', () => {
    const signal = item(10, 85, {
      pile: 'unassigned',
      duplicate: true,
      duplicateId: 5010,
    });
    const counterpart = item(5010, 85, {
      pile: 'club',
      duplicate: false,
      duplicateId: 0,
    });
    counterpart.definitionId = signal.definitionId;
    counterpart.ref = { id: counterpart.id, definitionId: signal.definitionId, pile: 'club' };
    const entries = [signal, counterpart].map((value) => ({
      item: value,
      pile: value.pile,
      classification: { requiredSpecial: false, protected: false },
    }));

    const protection = createRollingRecoveryProtection({
      entries,
      protectedItems: [signal.ref],
    });

    expect(protection.protectedItemIds).toEqual([10, 5010]);
  });

  it('reports a dedicated identity failure when a reserved primary duplicate disappears', () => {
    const available = item(10, 85);
    const ledger = {
      resolveItem: (ref) => Number(ref?.id || 0) === available.id ? available : null,
    };

    expect(validateRollingPrimaryDuplicateIdentity({
      ledger,
      primaryDuplicateRefs: [available.ref, { id: 11, definitionId: 1011, pile: 'unassigned' }],
    })).toMatchObject({
      ok: false,
      reasonCode: 'PRIMARY_DUPLICATE_IDENTITY_CHANGED',
      missingRefs: [{ id: 11, definitionId: 1011, pile: 'unassigned' }],
    });
  });

  it('reserves 87/88 and soft-protects Club Other Special in rating recovery', () => {
    const policy = createRollingRatingRecoverySelectionPolicy({
      entries: [
        { item: item(1, 84, { special: true, pile: 'storage' }), pile: 'storage', classification: { requiredSpecial: true, protected: false } },
        { item: item(2, 90, { special: true, pile: 'club' }), pile: 'club', classification: { requiredSpecial: false, otherSpecial: true, protected: false } },
      ],
      protectionRating: 95,
    });

    expect(policy.protectedItems.map((ref) => ref.id)).toEqual([1]);
    expect(policy.exclusiveRoles).toEqual([]);
    expect(policy.maxOrdinaryRating).toBe(95);
    expect(policy.protectionPolicy).toMatchObject({
      reserveRatings: [87, 88],
      softProtectSpecialPiles: ['club'],
      allowOtherSpecialAsOrdinary: true,
      liveRequirementsAvailable: true,
    });
  });

  it('uses Inventory Ledger classifications instead of unclassified rating candidates', () => {
    const protectedItem = item(1, 94, { special: true, pile: 'storage' });
    const ledger = {
      classifiedEntries: () => [{
        item: protectedItem,
        pile: 'storage',
        classification: { requiredSpecial: true, otherSpecial: false, protected: false },
      }],
    };

    const policy = createRollingRatingRecoverySelectionPolicy({
      ledger,
      entries: [{ item: item(2, 89), pileName: 'storage' }],
      protectionRating: 95,
    });

    expect(policy.protectedItems).toEqual([protectedItem.ref]);
  });

  it('releases a classified Required Special only for an explicit Storage Sink role', () => {
    const requiredSpecial = item(1, 91, { special: true, pile: 'club' });
    const entries = [{
      item: requiredSpecial,
      pile: 'club',
      classification: { requiredSpecial: true, otherSpecial: false, protected: false },
    }];

    const ordinaryRecovery = createRollingRatingRecoverySelectionPolicy({ entries });
    const storageSink = createRollingRatingRecoverySelectionPolicy({
      entries,
      allowRequiredSpecial: true,
      exclusiveRoles: [{
        id: 'storage-sink-required-special',
        constraintIndex: 0,
        minCount: 1,
        maxCount: 1,
      }],
    });

    expect(ordinaryRecovery.protectedItems).toEqual([requiredSpecial.ref]);
    expect(storageSink.protectedItems).toEqual([]);
    expect(storageSink.exclusiveRoles).toHaveLength(1);
  });

  it('protects an Active Squad conflict by exact item ID without protecting the card definition', () => {
    const conflicted = item(70, 84, { pile: 'club', definitionId: 700 });
    const sameVersionAlternative = item(71, 84, { pile: 'club', definitionId: 700 });
    const policy = createRollingPrimarySelectionPolicy({
      entries: [
        { item: conflicted, classification: { protected: false, requiredSpecial: false } },
        { item: sameVersionAlternative, classification: { protected: false, requiredSpecial: false } },
      ],
      protectedItems: [{ id: conflicted.id, definitionId: 0, pile: 'unknown' }],
      model: { constraints: [] },
    });

    expect(policy.protectedItems).toContainEqual({ id: 70, definitionId: 0, pile: 'unknown' });
    expect(policy.protectedItems.some((ref) => ref.id === 71)).toBe(false);
    expect(policy.protectedItems.some((ref) => ref.definitionId === 700 && !ref.id)).toBe(false);
  });

  it('keeps a primary Required Special out of a Storage Sink that has no matching role', () => {
    const requiredSignal = item(10, 91, { special: true, pile: 'unassigned' });
    const requiredCounterpart = item(2010, 91, { special: true, pile: 'club' });
    const ordinarySignal = item(11, 90, { pile: 'unassigned' });
    const ordinaryCounterpart = item(2011, 90, { pile: 'club' });
    const filter = createRollingStorageSinkCandidateFilter({
      isPrimaryRequiredSpecial: (candidate) => candidate.special === true,
      resolveSubmissionPile: (entry) => entry.submissionPileName,
    });

    expect(filter({
      item: requiredCounterpart,
      signal: requiredSignal,
      pileName: 'unassigned',
      submissionPileName: 'club',
      requirementMatches: [],
    })).toBe(false);
    expect(filter({
      item: ordinaryCounterpart,
      signal: ordinarySignal,
      pileName: 'unassigned',
      submissionPileName: 'club',
      requirementMatches: [],
    })).toBe(true);
  });

  it('admits a primary Required Special only when the Storage Sink explicitly requires it', () => {
    const requiredSignal = item(10, 91, { special: true, pile: 'unassigned' });
    const requiredCounterpart = item(2010, 91, { special: true, pile: 'club' });
    const filter = createRollingStorageSinkCandidateFilter({
      constraintIndexes: [0],
      isPrimaryRequiredSpecial: (candidate) => candidate.special === true,
      resolveSubmissionPile: (entry) => entry.signal ? 'unassigned' : entry.submissionPileName,
    });

    expect(filter({
      item: requiredCounterpart,
      signal: requiredSignal,
      pileName: 'unassigned',
      submissionPileName: 'club',
      requirementMatches: [true],
    })).toBe(true);
    expect(filter({
      item: requiredCounterpart,
      signal: requiredSignal,
      pileName: 'unassigned',
      submissionPileName: 'club',
      requirementMatches: [false],
    })).toBe(false);
  });

  it('fail-closes malformed unclassified protection entries instead of crashing', () => {
    const malformed = item(1, 89);
    expect(createRollingRecoveryProtection({
      entries: [{ item: malformed, pileName: 'storage' }],
    }).protectedItems).toEqual([malformed.ref]);
  });

  it('diagnoses exact identity and same-definition candidates without collapsing pile information', () => {
    const deferred = item(101, 93, { definitionId: 7001, pile: 'unassigned', duplicateId: 8101 });
    const storageCounterpart = item(202, 93, { definitionId: 7001, pile: 'storage', duplicateId: 0 });
    const otherVersion = item(303, 94, { definitionId: 7001, pile: 'club', duplicateId: 0 });

    const deferredRef = { id: deferred.id, definitionId: deferred.definitionId, pile: 'unassigned' };
    const diagnostics = diagnoseRollingInventoryRefs([deferredRef], {
      unassigned: [deferred],
      storage: [storageCounterpart],
      club: [otherVersion],
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].exact).toMatchObject([{
      id: 101,
      definitionId: 7001,
      pile: 'unassigned',
      rating: 93,
      duplicateId: 8101,
    }]);
    expect(diagnostics[0].sameDefinition.map(({ id, pile }) => ({ id, pile }))).toEqual([
      { id: 101, pile: 'unassigned' },
      { id: 202, pile: 'storage' },
      { id: 303, pile: 'club' },
    ]);
  });

  it('supports a lower ordinary-card ceiling for Storage-maintenance rating recovery', () => {
    const policy = createRollingRatingRecoverySelectionPolicy({
      entries: [],
      protectionRating: 95,
      maxOrdinaryRating: 89,
      requiredItems: [{ id: 1 }],
      preferredItems: [{ id: 1 }, { id: 2 }],
    });

    expect(policy).toMatchObject({
      maxOrdinaryRating: 89,
      requiredItems: [{ id: 1, definitionId: 0, pile: 'unknown' }],
      preferredItems: [
        { id: 1, definitionId: 0, pile: 'unknown' },
        { id: 2, definitionId: 0, pile: 'unknown' },
      ],
    });
  });

  it('preserves Storage Sink source roles in the rating recovery policy', () => {
    const role = {
      id: 'storage-sink-club-fill',
      piles: ['club'],
      minCount: 0,
      maxCount: 1,
    };
    const policy = createRollingRatingRecoverySelectionPolicy({
      entries: [],
      exclusiveRoles: [role],
    });

    expect(policy.exclusiveRoles).toEqual([role]);
  });
});
