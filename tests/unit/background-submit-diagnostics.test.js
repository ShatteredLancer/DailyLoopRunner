import { describe, expect, it } from 'vitest';
import {
  createBackgroundSubmitTelemetry,
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
    });
    currentTime += 900;
    const diagnostic = telemetry.complete(second, {
      success: false,
      status: 429,
      message: 'request rejected',
      privateToken: 'must-not-leak',
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
});
