import { describe, expect, it } from 'vitest';
import {
  createBackgroundSubmitTelemetry,
  sanitizeBackgroundSubmitResult,
  summarizeBackgroundSubmitPackCounts,
  summarizeBackgroundSubmitState,
  summarizeBackgroundSubmitItems,
} from '../../src/sbc/background-submit-diagnostics.js';

describe('background submit diagnostics', () => {
  it('separates transport and EA error fields while keeping diagnostics bounded and sanitized', () => {
    let currentTime = 100_000;
    const telemetry = createBackgroundSubmitTelemetry({ now: () => currentTime });

    const first = telemetry.begin({
      setId: 10,
      challengeId: 20,
      attempt: 1,
      maxAttempts: 3,
      playerCount: 11,
    });
    currentTime += 800;
    telemetry.complete(first, { success: true, status: 200 });

    currentTime += 14_200;
    const second = telemetry.begin({
      setId: 10,
      challengeId: 21,
      attempt: 1,
      maxAttempts: 3,
      playerCount: 11,
      submittedItemIds: [21],
    });
    currentTime += 900;
    const diagnostic = telemetry.complete(second, {
      success: false,
      status: 429,
      message: 'request rejected',
      privateToken: 'must-not-leak',
      data: {
        itemViolations: [{ itemId: 21, reason: 'ACTIVE_SQUAD' }],
      },
      error: {
        code: 429,
        status: 503,
        message: 'Too Many Requests',
        privatePayload: 'must-not-leak',
        response: {
          status: 429,
          headers: { 'retry-after': '30', authorization: 'must-not-leak' },
        },
      },
    });

    expect(diagnostic).toMatchObject({
      request: {
        setId: 10,
        challengeId: 21,
        attempt: 1,
        maxAttempts: 3,
        playerCount: 11,
      },
      timing: {
        durationMs: 900,
        sincePreviousAttemptMs: 15_000,
        sincePreviousSuccessMs: 14_200,
        attemptsLast60s: 2,
        successesLast60s: 1,
        failuresLast60s: 1,
      },
      result: {
        success: false,
        status: 429,
        message: 'request rejected',
        error: {
          code: 429,
          status: 503,
          message: 'Too Many Requests',
        },
        response: {
          status: null,
          retryAfter: null,
        },
        errorResponse: {
          status: 429,
          retryAfter: '30',
        },
      },
    });
    expect(diagnostic.result.visibleKeys.result).toContain('privateToken');
    expect(diagnostic.result.visibleKeys.error).toContain('privatePayload');
    expect(diagnostic.result.data.itemViolations.items[0]).toMatchObject({
      itemId: 21,
      reason: 'ACTIVE_SQUAD',
      submittedMatch: true,
    });
    expect(JSON.stringify(diagnostic)).not.toContain('must-not-leak');
    expect(JSON.stringify(diagnostic).length).toBeLessThan(4000);
  });

  it('summarizes exact selected-item residency without retaining full item objects', () => {
    const refs = [
      { id: 1, definitionId: 101, pile: 'club' },
      { id: 2, definitionId: 102, pile: 'unassigned' },
      { id: 3, definitionId: 103, pile: 'storage' },
    ];
    const liveById = new Map([
      [1, { id: 1, definitionId: 101, rating: 88, pile: 'club', privatePayload: 'must-not-leak' }],
      [2, { id: 2, definitionId: 102, rating: 86, ref: { pile: 'storage' }, privatePayload: 'must-not-leak' }],
    ]);

    const diagnostic = summarizeBackgroundSubmitItems(refs, {
      resolveItem: (ref) => liveById.get(Number(ref.id)) || null,
      ledgerSummary: {
        inventoryVersion: 7,
        itemCount: 414,
        pileCounts: { unassigned: 6, storage: 29, transfer: 7, club: 372 },
        readiness: { state: 'ready', fullyValidated: true },
        privatePayload: 'must-not-leak',
      },
    });

    expect(diagnostic).toEqual({
      selectedCount: 3,
      exactFound: 2,
      exactMissing: 1,
      currentPiles: { club: 1, storage: 1 },
      ledger: {
        inventoryVersion: 7,
        itemCount: 414,
        pileCounts: { unassigned: 6, storage: 29, transfer: 7, club: 372 },
        readiness: { state: 'ready', fullyValidated: true },
      },
      items: [
        { id: 1, definitionId: 101, expectedPile: 'club', found: true, currentPile: 'club', rating: 88 },
        { id: 2, definitionId: 102, expectedPile: 'unassigned', found: true, currentPile: 'storage', rating: 86 },
        { id: 3, definitionId: 103, expectedPile: 'storage', found: false, currentPile: null, rating: null },
      ],
    });
    expect(JSON.stringify(diagnostic)).not.toContain('must-not-leak');
  });

  it('captures bounded nested EA conflict fields without leaking unrelated payload values', () => {
    const inherited = Object.create({ statusCode: 409, reason: 'prototype conflict reason' });
    inherited.errorCode = 'SBC_CONFLICT';
    inherited.privateToken = 'must-not-leak';

    const diagnostic = sanitizeBackgroundSubmitResult({
      success: false,
      status: 409,
      statusCode: 409,
      data: {
        code: 'SUBMIT_REJECTED',
        message: 'Challenge state changed',
        authorization: 'must-not-leak',
      },
      error: {
        code: 409,
        reason: 'conflict',
        response: {
          status: 409,
          data: inherited,
          body: { errorCode: 'SBC_CONFLICT_BODY', reason: 'stale squad', secret: 'must-not-leak' },
        },
      },
    });

    expect(diagnostic).toMatchObject({
      status: 409,
      statusCode: 409,
      data: {
        code: 'SUBMIT_REJECTED',
        message: 'Challenge state changed',
      },
      error: {
        code: 409,
        reason: 'conflict',
      },
      errorResponse: {
        status: 409,
        data: {
          statusCode: 409,
          errorCode: 'SBC_CONFLICT',
          reason: 'prototype conflict reason',
        },
        body: {
          errorCode: 'SBC_CONFLICT_BODY',
          reason: 'stale squad',
        },
      },
    });
    expect(diagnostic.errorResponse.data.prototypeKeys).toContain('reason');
    expect(diagnostic.data.visibleKeys).toContain('authorization');
    expect(JSON.stringify(diagnostic)).not.toContain('must-not-leak');
    expect(JSON.stringify(diagnostic).length).toBeLessThan(8000);
  });

  it('captures bounded item violations and resolves them against submitted item ids', () => {
    const enumReason = Object.create({
      value() { return 'ITEM_NOT_ELIGIBLE'; },
    });
    const diagnostic = sanitizeBackgroundSubmitResult({
      success: false,
      status: 409,
      data: {
        itemViolations: {
          921708501037: {
            reason: enumReason,
            code: 466,
            slot: 0,
            item: {
              id: 921708501037,
              definitionId: 84118660,
              rating: 96,
              privatePayload: 'must-not-leak',
            },
            privateToken: 'must-not-leak',
          },
          unrelated: {
            itemId: 123,
            reason: 'ITEM_CHANGED',
          },
        },
      },
      error: {
        code: 466,
        reason: enumReason,
      },
    }, {
      submittedItemIds: [921708501037, 921878765691],
    });

    expect(diagnostic.error.reason).toBe('ITEM_NOT_ELIGIBLE');
    expect(diagnostic.data.itemViolations).toMatchObject({
      type: 'Object',
      count: 2,
      truncated: false,
      items: [
        {
          key: '921708501037',
          itemId: 921708501037,
          code: 466,
          reason: 'ITEM_NOT_ELIGIBLE',
          slot: 0,
          submittedMatch: true,
          item: {
            id: 921708501037,
            definitionId: 84118660,
            rating: 96,
            submittedMatch: true,
          },
        },
        {
          key: 'unrelated',
          itemId: 123,
          reason: 'ITEM_CHANGED',
          submittedMatch: false,
        },
      ],
    });
    expect(JSON.stringify(diagnostic)).not.toContain('must-not-leak');
  });

  it('captures EA item violation names and item id arrays', () => {
    const diagnostic = sanitizeBackgroundSubmitResult({
      success: false,
      status: 409,
      data: {
        itemViolations: [{
          name: 'ACTIVE_SQUAD',
          itemIds: [911203217502, 123, 'invalid'],
          privatePayload: 'must-not-leak',
        }],
      },
    }, {
      submittedItemIds: [911203217502, 921895014553],
    });

    expect(diagnostic.data.itemViolations.items[0]).toMatchObject({
      name: 'ACTIVE_SQUAD',
      itemIds: [911203217502, 123],
      submittedItemIds: [911203217502],
      submittedMatch: true,
    });
    expect(JSON.stringify(diagnostic)).not.toContain('must-not-leak');
  });

  it('reads collection-like item violations without retaining the source collection', () => {
    const collection = {
      models: [
        { itemId: 11, errorCode: 'ITEM_MISSING' },
        { item: { id: 12, definitionId: 112 }, status: 'INVALID' },
      ],
      authorization: 'must-not-leak',
    };
    const diagnostic = sanitizeBackgroundSubmitResult({
      success: false,
      status: 409,
      data: { itemViolations: collection },
    }, { submittedItemIds: [12] });

    expect(diagnostic.data.itemViolations).toMatchObject({
      type: 'Object',
      count: 2,
      source: 'models',
      items: [
        { itemId: 11, errorCode: 'ITEM_MISSING', submittedMatch: false },
        { itemId: 12, status: 'INVALID', submittedMatch: true },
      ],
    });
    expect(JSON.stringify(diagnostic)).not.toContain('must-not-leak');
  });

  it('snapshots Set, Challenge, cached Challenge and squad identity around a failed submit', () => {
    const challenge = {
      id: 3874,
      state: 'IN_PROGRESS',
      completed: false,
      formation: 4,
      revision: 17,
      squad: { version: 9 },
      isCompleted: () => false,
      isInProgress: () => true,
      canSubmit: () => true,
    };
    Object.defineProperty(challenge, 'status', { get() { throw new Error('unreadable'); } });
    const completed = {
      id: 3800,
      status: 'COMPLETED',
      completed: true,
      isCompleted: () => true,
    };
    const set = {
      id: 1200,
      name: '10x 85+ Upgrade',
      status: 'ACTIVE',
      timesCompleted: 41,
      repeats: 0,
      isComplete: () => false,
    };

    const diagnostic = summarizeBackgroundSubmitState({
      set,
      challenge,
      cachedChallenges: [challenge, completed],
      squadItems: [
        { id: 1, definitionId: 101, rating: 96 },
        { id: 2, definitionId: 102, rating: 83 },
      ],
      submissionOptions: { skipValidation: true, chemistryEnabled: false },
      controllerName: 'UTSBCSquadSplitViewController',
    });

    expect(diagnostic).toMatchObject({
      controllerName: 'UTSBCSquadSplitViewController',
      submissionOptions: { skipValidation: true, chemistryEnabled: false },
      set: {
        id: 1200,
        name: '10x 85+ Upgrade',
        status: 'ACTIVE',
        timesCompleted: 41,
        repeats: 0,
        isComplete: false,
      },
      challenge: {
        id: 3874,
        status: null,
        state: 'IN_PROGRESS',
        completed: false,
        formation: 4,
        isCompleted: false,
        isInProgress: true,
        canSubmit: true,
        scalarHints: { id: 3874, revision: 17, state: 'IN_PROGRESS' },
      },
      squad: {
        count: 2,
        ids: [1, 2],
        definitionIds: [101, 102],
        ratings: [96, 83],
        uniqueDefinitions: 2,
      },
    });
    expect(diagnostic.cachedChallenges).toEqual([
      expect.objectContaining({ id: 3874, sameObject: true, isInProgress: true }),
      expect.objectContaining({ id: 3800, sameObject: false, isCompleted: true }),
    ]);
  });

  it('reports local My Packs count changes without retaining pack objects', () => {
    expect(summarizeBackgroundSubmitPackCounts(
      new Map([['1082', 2], ['21346', 4]]),
      new Map([['1082', 3], ['21346', 3], ['999', 1]]),
    )).toEqual({
      beforeTotal: 6,
      afterTotal: 7,
      changed: [
        { packId: 999, before: 0, after: 1, delta: 1 },
        { packId: 1082, before: 2, after: 3, delta: 1 },
        { packId: 21346, before: 4, after: 3, delta: -1 },
      ],
      truncated: false,
    });
  });
});
