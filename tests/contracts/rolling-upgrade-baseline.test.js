import { describe, expect, it } from 'vitest';
import { parseDynamicUpgradeSbcSnapshot } from '../../src/config/upgrade-discovery.js';
import {
  applyLoopRuntimeOptions,
  normalizePickRuntimeOptions,
} from '../../src/config/runtime-options.js';
import { createInventorySnapshot, createItemSnapshot } from '../../src/domain/contracts.js';
import { createLoopRecapModel } from '../../src/reward/loop-recap.js';
import { selectRatingPlayers } from '../../src/selection/rating.js';
import { resolveUnassigned } from '../../src/unassigned/resolve.js';
import { loadFixture } from '../helpers/fixtures.js';

function ratingEntry(id, pileName, pileRank, options = {}) {
  return {
    item: {
      id,
      definitionId: 10000 + id,
      rating: 84,
      ref: { id, definitionId: 10000 + id, pile: pileName },
    },
    signal: null,
    pileName,
    pileRank,
    requirementMatches: [options.requirementMatch === true],
    special: options.special === true,
  };
}

async function baseline() {
  return loadFixture('challenges/rolling-10x85-baseline.json');
}

describe('10x85+ Rolling pre-implementation baseline', () => {
  it('materializes the current generic high-rated x10 policy from live metadata', async () => {
    const fixture = await baseline();
    const result = parseDynamicUpgradeSbcSnapshot({ set: fixture.set });
    const expected = fixture.currentPolicy;

    expect(result.status).toBe('supported');
    expect(result.loop).toMatchObject({
      dynamicSbcFamily: expected.dynamicSbcFamily,
      dynamicRewardCount: expected.rewardCount,
      dynamicRewardMinRating: expected.rewardMinRating,
      expectedPlayerCount: expected.requiredPlayerCount,
      requiredSpecialCount: expected.requiredSpecialCount,
      allowedSpecialCount: expected.requiredSpecialCount,
      maxCompletions: expected.maxCompletions,
      runtimeQuantity: expected.runtimeQuantity,
      openRewardPacks: expected.openRewardPacks,
      ratingSbcFill: {
        targetRating: expected.targetRating,
        priorityPiles: expected.priorityPiles,
      },
      autoTotwUpgrade: {
        activityBinding: { family: expected.totwRecoveryFamily },
      },
      autoFodderUpgrade: {
        activityBinding: { family: expected.fodderRecoveryFamily },
      },
    });
    expect(result.loop.dynamicChallenges[0].eligibilityRequirements).toEqual([
      { key: 'TEAM_RATING', values: [84], count: 11 },
      { key: 'PLAYER_RARITY_GROUP', values: [83], count: 1 },
    ]);
  });

  it('keeps the current Pick threshold independent from the rating-SBC card cap', async () => {
    const fixture = await baseline();
    const parsed = parseDynamicUpgradeSbcSnapshot({ set: fixture.set });
    const pickOptions = normalizePickRuntimeOptions({
      autoPickThreshold: fixture.runtimeOptions.autoPickThreshold,
    });
    const loop = applyLoopRuntimeOptions(structuredClone(parsed.loop), {
      rounds: 10,
      openRewardPacks: true,
      pickOptions,
      sbcFodderPolicy: {
        mode: 'rating-constrained',
        ratingSbcMaxCardRating: fixture.runtimeOptions.ratingSbcMaxCardRating,
      },
    });

    expect(loop.runtimePickOptions.protectionRating).toBe(95);
    expect(loop.runtimeSbcFodderPolicy.ratingSbcMaxCardRating).toBe(88);
    expect(loop.maxCompletions).toBe(10);
    expect(loop.openRewardPacks).toBe(true);
  });

  it('selects one matching special and then honors pile priority for the rating vector', async () => {
    const fixture = await baseline();
    const selectionFixture = fixture.ratingSelection;
    const entries = [
      ratingEntry(1, 'unassigned', 0, { special: true, requirementMatch: true }),
      ...Array.from({ length: 10 }, (_, index) => ratingEntry(index + 2, 'storage', 1)),
      ratingEntry(50, 'storage', 1, { special: true, requirementMatch: true }),
      ...Array.from({ length: 10 }, (_, index) => ratingEntry(index + 100, 'transfer', 2)),
      ...Array.from({ length: 10 }, (_, index) => ratingEntry(index + 200, 'club', 3)),
    ];
    const result = await selectRatingPlayers({
      candidateEntries: entries,
      ratingModel: {
        requiredPlayerCount: selectionFixture.requiredPlayerCount,
        targetRating: selectionFixture.targetRating,
        maxSpecialCount: selectionFixture.requiredSpecialCount,
        constraints: [{ label: 'EA player group x1', count: selectionFixture.requiredSpecialCount }],
      },
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
    });

    expect(result.ok).toBe(true);
    expect(result.selected.map((item) => item.id).sort((a, b) => a - b))
      .toEqual(selectionFixture.expectedSelectedIds);
    expect(result.selected.filter((item) => [1, 50].includes(item.id))).toHaveLength(1);
    expect(result.pileCounts).toEqual(selectionFixture.expectedPileCounts);
  });

  it('keeps generic Unassigned blocked when Storage is full and no resolver is injected', async () => {
    const fixture = await baseline();
    const duplicate = createItemSnapshot({
      id: 1,
      definitionId: 1001,
      type: 'player',
      rating: 84,
      duplicate: true,
      duplicateId: 2001,
      tradeable: false,
    }, 'unassigned');
    const snapshot = createInventorySnapshot({
      piles: { unassigned: [duplicate] },
      capacities: {
        storage: {
          used: fixture.unassigned.storageUsed,
          max: fixture.unassigned.storageCapacity,
        },
        transfer: { used: 0, max: 100 },
      },
    });
    const result = await resolveUnassigned({
      getSnapshot: async () => snapshot,
      executeAction: async () => {},
    });

    expect(result).toMatchObject({
      status: fixture.unassigned.expectedStatus,
      reason: fixture.unassigned.expectedReason,
    });
  });

  it('keeps the existing generic Loop recap unbounded and retains source receipts', async () => {
    const fixture = await baseline();
    let id = 1;
    const receipts = Array.from({ length: fixture.recap.packCount }, (_, packIndex) => ({
      status: 'opened',
      packRef: { name: `Pack ${packIndex + 1}` },
      openedItems: Array.from({ length: fixture.recap.playersPerPack }, () => ({
        id,
        definitionId: 20000 + id++,
        type: 'player',
        name: 'Rare Gold Player',
        rating: 85,
        tier: 'gold',
        rareflag: 1,
      })),
    }));
    const model = createLoopRecapModel({ name: 'Current 10x85+', receipts });

    expect(model.rows).toHaveLength(fixture.recap.expectedRows);
    expect(model.receipts).toBe(receipts);
    expect(model.rows.every((row) => row.item)).toBe(true);
  });
});
