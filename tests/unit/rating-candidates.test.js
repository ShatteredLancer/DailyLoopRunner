import { describe, expect, it, vi } from 'vitest';
import { createItemSnapshot } from '../../src/domain/contracts.js';
import { loadUserscript } from '../helpers/load-userscript.js';
import {
  buildRatingCandidateEntries,
  finalizeRequiredCandidateDiagnostics,
  selectRatingCandidateEntries,
} from '../../src/selection/rating-candidates.js';

function item(id, definitionId, rating, overrides = {}) {
  return { id, definitionId, rating, ...overrides };
}

describe('rating candidate integration planning', () => {
  it('evaluates requirements against a resolved EA entity while retaining the Ledger snapshot', () => {
    const snapshot = createItemSnapshot({
      id: 41,
      definitionId: 401,
      type: 'player',
      rating: 91,
      groups: [44, 83],
    }, 'club');
    const live = {
      ...snapshot,
      isRuntimeEntity: true,
    };

    const candidates = buildRatingCandidateEntries({
      model: {
        constraints: [{ matches: (candidate) => candidate.isRuntimeEntity === true }],
      },
      settings: {},
      piles: ['club'],
      getPileItems: () => [snapshot],
      submissionItems: [snapshot],
      isSafe: () => true,
      isDuplicate: () => false,
      pileNeedsDuplicateSignalResolution: () => false,
      sortFodder: (entries) => [...entries],
      isSpecialItem: () => true,
      resolveRequirementItem: (candidate) => (candidate.id === live.id ? live : candidate),
    });

    expect(candidates.entries).toEqual([
      expect.objectContaining({
        item: snapshot,
        requirementMatches: [true],
      }),
    ]);
  });

  it('recognizes normalized Ledger duplicate snapshots without EA prototype methods', async () => {
    const { api } = await loadUserscript();
    const signal = createItemSnapshot({
      id: 20,
      definitionId: 200,
      type: 'player',
      rating: 84,
      duplicate: true,
      duplicateId: 30,
    }, 'unassigned');
    const resolved = createItemSnapshot({
      id: 30,
      definitionId: 200,
      type: 'player',
      rating: 84,
    }, 'club');

    expect(signal.isDuplicate).toBeUndefined();
    expect(api.isDuplicate(signal)).toBe(true);
    expect(api.isDuplicate({ duplicate: true, duplicateId: 0 })).toBe(true);
    expect(api.isDuplicate({ duplicate: false, duplicateId: 30 })).toBe(true);
    expect(api.isDuplicate({ duplicate: false, duplicateId: 0 })).toBe(false);

    const candidates = buildRatingCandidateEntries({
      model: { constraints: [] },
      settings: {},
      piles: ['unassigned', 'club'],
      getPileItems: (pileName) => (pileName === 'unassigned' ? [signal] : [resolved]),
      submissionItems: [resolved],
      isSafe: () => true,
      isDuplicate: api.isDuplicate,
      pileNeedsDuplicateSignalResolution: (pileName) => pileName === 'unassigned',
      sortFodder: (entries) => [...entries],
      isSpecialItem: () => false,
    });
    expect(candidates.entries).toEqual([
      expect.objectContaining({ item: resolved, signal, pileName: 'unassigned' }),
    ]);
    expect(candidates.resolvedSignals).toEqual({ unassigned: 1 });
  });

  it('keeps the live EA duplicate method authoritative over stale scalar metadata', async () => {
    const { api } = await loadUserscript();

    expect(api.isDuplicate({
      duplicate: true,
      duplicateId: 30,
      isDuplicate: () => false,
    })).toBe(false);
    expect(api.isDuplicate({
      duplicate: false,
      duplicateId: 0,
      isDuplicate: () => true,
    })).toBe(true);
  });

  it('resolves duplicate signals to submit-cache items and keeps the highest-priority definition', () => {
    const signal = item(20, 200, 84, { duplicateId: 30, duplicate: true });
    const resolved = item(30, 200, 84);
    const storage = item(10, 100, 83);
    const lowerPrioritySameDefinition = item(11, 100, 83);
    const piles = {
      unassigned: [signal],
      storage: [storage],
      club: [resolved, lowerPrioritySameDefinition],
    };
    let clock = 100;

    const result = buildRatingCandidateEntries({
      model: { constraints: [{ matches: (candidate) => candidate.rating >= 84 }] },
      settings: {},
      piles: ['unassigned', 'storage', 'club'],
      getPileItems: (pileName) => piles[pileName],
      submissionItems: [resolved, storage, lowerPrioritySameDefinition],
      isSafe: () => true,
      isDuplicate: (candidate) => candidate.duplicate === true,
      pileNeedsDuplicateSignalResolution: (pileName) => pileName === 'unassigned',
      sortFodder: (entries) => [...entries].sort((a, b) => a.id - b.id),
      isSpecialItem: () => false,
      now: () => clock++,
    });

    expect(result.entries).toEqual([
      expect.objectContaining({ item: resolved, signal, pileName: 'unassigned', pileRank: 0, requirementMatches: [true] }),
      expect.objectContaining({ item: storage, signal: null, pileName: 'storage', pileRank: 1, requirementMatches: [false] }),
    ]);
    expect(result.resolvedSignals).toEqual({ unassigned: 1 });
    expect(result.scannedItems).toBe(4);
    expect(result.buildMs).toBe(1);
  });

  it('converts live entries to snapshots and resolves a successful plan back to live items', async () => {
    const liveItem = item(10, 100, 84);
    const liveSignal = item(20, 100, 84, { duplicateId: 10 });
    const selectPlayers = vi.fn(async ({ candidateEntries }) => ({
      ok: true,
      entries: [{
        itemRef: candidateEntries[0].item.ref,
        signalRef: candidateEntries[0].signal.ref,
        pileName: 'unassigned',
        pileRank: 0,
        requirementMatches: [true],
        special: false,
      }],
      pileCounts: { unassigned: 1 },
      details: {
        rating: 84,
        ratings: [84],
        recipeAttempts: 1,
        recipeTransitions: 3,
        ratingLevels: 1,
        ratingRange: { min: 84, max: 84 },
      },
    }));

    const result = await selectRatingCandidateEntries({
      candidateEntries: [{
        item: liveItem,
        signal: liveSignal,
        pileName: 'unassigned',
        pileRank: 0,
        requirementMatches: [true],
        special: false,
      }],
      model: { requiredPlayerCount: 1 },
      piles: ['unassigned'],
      requiredItems: [{ id: 10 }],
      preferredItems: [{ id: 10 }],
      protectedItems: [{ id: 99 }],
      exclusiveRoles: [{ id: 'required-special', constraintIndex: 0, minCount: 1, maxCount: 1 }],
      maxOrdinaryRating: 95,
      protectionPolicy: { reserveRatings: [87, 88, 89] },
      createSnapshot: (candidate, pile) => ({ ...candidate, pile, ref: { id: candidate.id, definitionId: candidate.definitionId } }),
      selectPlayers,
      control: { shouldStop: () => false },
    });

    expect(result).toMatchObject({
      ok: true,
      selected: [liveItem],
      resolvedSignals: { unassigned: 1 },
      rating: 84,
      ratings: [84],
      pileCounts: { unassigned: 1 },
      recipeAttempts: 1,
      recipeTransitions: 3,
      ratingLevels: 1,
      ratingRange: { min: 84, max: 84 },
    });
    expect(result.entries[0]).toMatchObject({ item: liveItem, signal: liveSignal });
    expect(selectPlayers).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'rating',
      priorityPiles: ['unassigned'],
      requiredItems: [{ id: 10 }],
      preferredItems: [{ id: 10 }],
      protectedItems: [{ id: 99 }],
      exclusiveRoles: [{ id: 'required-special', constraintIndex: 0, minCount: 1, maxCount: 1 }],
      maxOrdinaryRating: 95,
      protectionPolicy: { reserveRatings: [87, 88, 89] },
    }));
  });

  it('rejects a plan whose selected item cannot be resolved back to a live entry', async () => {
    const result = await selectRatingCandidateEntries({
      candidateEntries: [{
        item: item(10, 100, 84),
        signal: null,
        pileName: 'storage',
        pileRank: 0,
        requirementMatches: [],
        special: false,
      }],
      model: { requiredPlayerCount: 1 },
      piles: ['storage'],
      createSnapshot: (candidate) => ({ ...candidate, ref: { id: candidate.id } }),
      selectPlayers: async () => ({
        ok: true,
        entries: [{ itemRef: { id: 999 }, signalRef: null }],
        pileCounts: {},
        details: { recipeAttempts: 2, recipeTransitions: 5, ratingLevels: 1 },
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'rating selection item became stale during plan resolution',
      recipeAttempts: 2,
      recipeTransitions: 5,
      ratingLevels: 1,
      ratingRange: null,
      recipeCacheHit: false,
    });
  });

  it('keeps an exact required item as the same-definition representative', () => {
    const representative = item(10, 100, 88, { privatePayload: 'must-not-leak' });
    const required = item(20, 100, 88, { privatePayload: 'must-not-leak' });
    const piles = { storage: [representative, required] };

    const result = buildRatingCandidateEntries({
      model: { constraints: [] },
      settings: {},
      piles: ['storage'],
      getPileItems: (pileName) => piles[pileName],
      submissionItems: piles.storage,
      requiredItems: [{ id: 20, definitionId: 100, pile: 'storage' }],
      isSafe: () => true,
      isDuplicate: () => false,
      pileNeedsDuplicateSignalResolution: () => false,
      sortFodder: (entries) => [...entries].sort((a, b) => a.id - b.id),
      isSpecialItem: () => false,
      now: () => 100,
    });

    expect(result.entries.map((entry) => entry.item.id)).toEqual([20]);
    expect(result.requiredItemDiagnostics).toEqual([{
      ref: { id: 20, definitionId: 100, pile: 'storage' },
      scannedLocations: [{ id: 20, definitionId: 100, pile: 'storage', rating: 88 }],
      candidateBeforeDefinition: true,
      candidateAfterDefinition: true,
      candidateAfterPolicy: true,
      representative: { id: 20, definitionId: 100, pile: 'storage', rating: 88 },
      competingCandidates: [
        { id: 10, definitionId: 100, pile: 'storage', rating: 88 },
        { id: 20, definitionId: 100, pile: 'storage', rating: 88 },
      ],
      reason: 'candidate-available',
    }]);
    expect(JSON.stringify(result.requiredItemDiagnostics)).not.toContain('must-not-leak');
  });

  it('distinguishes policy filtering from definition de-duplication', () => {
    const diagnostics = [{
      ref: { id: 10, definitionId: 100, pile: 'storage' },
      scannedLocations: [{ id: 10, definitionId: 100, pile: 'storage', rating: 88 }],
      candidateBeforeDefinition: true,
      candidateAfterDefinition: true,
      candidateAfterPolicy: true,
      representative: { id: 10, definitionId: 100, pile: 'storage', rating: 88 },
      competingCandidates: [{ id: 10, definitionId: 100, pile: 'storage', rating: 88 }],
      reason: 'candidate-available',
    }];

    expect(finalizeRequiredCandidateDiagnostics(diagnostics, [])).toEqual([
      expect.objectContaining({
        candidateBeforeDefinition: true,
        candidateAfterDefinition: true,
        candidateAfterPolicy: false,
        reason: 'policy-filtered',
      }),
    ]);
  });
});
