import { describe, expect, it } from 'vitest';
import {
  hasItemViolationConflict,
  inspectItemViolationConflict,
  isAmbiguousBackgroundSubmitResult,
  isRetryableBackgroundSubmitError,
  planAmbiguousBackgroundSubmitRetry,
  planChallengeReloadRetry,
  normalizeSubmitErrorCode,
  planBackgroundSubmitRetry,
  planItemViolationOverride,
  shouldStopForProtectedItemViolation,
} from '../../src/sbc/background-submit-retry.js';

describe('background submit retry helpers', () => {
  it('only retries after a fresh challenge instance was loaded', () => {
    expect(planChallengeReloadRetry({ reloadOutcome: 'current-challenge-loaded' })).toEqual({
      retry: true,
      reason: 'challenge-reloaded',
    });
    expect(planChallengeReloadRetry({ reloadOutcome: 'next-challenge-loaded' })).toEqual({
      retry: true,
      reason: 'challenge-reloaded',
    });
    expect(planChallengeReloadRetry({ reloadOutcome: 'failed' })).toEqual({
      retry: false,
      reason: 'challenge-reload-failed',
    });
    expect(planChallengeReloadRetry({ reloadOutcome: 'unavailable' })).toEqual({
      retry: false,
      reason: 'challenge-reload-unavailable',
    });
  });

  it('recognizes only a 409 response with non-empty item violations as an item conflict', () => {
    expect(hasItemViolationConflict({ status: 409, data: { itemViolations: [{ itemIds: [1] }] } })).toBe(true);
    expect(hasItemViolationConflict({ status: 409, data: { itemViolations: [] } })).toBe(false);
    expect(hasItemViolationConflict({ status: 429, data: { itemViolations: [{ itemIds: [1] }] } })).toBe(false);
    expect(hasItemViolationConflict({ status: 409, data: { itemViolations: [{ itemIds: [1] }] } }, '429')).toBe(true);
    const activeSquad = { status: 409, data: { itemViolations: [{ name: 'ACTIVE_SQUAD', itemIds: [1] }] } };
    const evolution = { status: 409, data: { itemViolations: [{ name: 'Evo', itemIds: [1] }] } };
    const unknown = { status: 409, data: { itemViolations: [{ name: 'NEW_EA_WARNING', itemIds: [1] }] } };
    const unnamed = { status: 409, data: { itemViolations: [{ itemIds: [1] }] } };
    expect(shouldStopForProtectedItemViolation({ protectionEnabled: false, result: activeSquad })).toBe(false);
    expect(shouldStopForProtectedItemViolation({ protectionEnabled: true, result: activeSquad })).toBe(true);
    expect(shouldStopForProtectedItemViolation({ protectionEnabled: true, result: evolution })).toBe(false);
    expect(shouldStopForProtectedItemViolation({ protectionEnabled: true, result: unknown })).toBe(true);
    expect(shouldStopForProtectedItemViolation({ protectionEnabled: true, result: unnamed })).toBe(true);
  });

  it('recognizes conflicts, rate limits, and transient EA service codes', () => {
    expect(normalizeSubmitErrorCode(409)).toBe('409');
    expect(normalizeSubmitErrorCode('429')).toBe('429');
    expect(normalizeSubmitErrorCode('background submit failed: 409')).toBe('409');
    expect(normalizeSubmitErrorCode('background submit failed: 512')).toBe('512');
    expect(isRetryableBackgroundSubmitError('409')).toBe(true);
    expect(isRetryableBackgroundSubmitError('429')).toBe(true);
    expect(isRetryableBackgroundSubmitError('426')).toBe(true);
    expect(isRetryableBackgroundSubmitError('512')).toBe(true);
    expect(isRetryableBackgroundSubmitError('521')).toBe(true);
    expect(isRetryableBackgroundSubmitError('500')).toBe(false);
    expect(isRetryableBackgroundSubmitError('471')).toBe(false);
    expect(isRetryableBackgroundSubmitError('unknown')).toBe(false);
  });

  it('plans bounded delays for retryable conflicts and stops at max attempts', () => {
    expect(planBackgroundSubmitRetry({ attempt: 1, maxAttempts: 3, detail: '409', baseDelayMs: 800 })).toEqual({
      retry: true,
      delayMs: 1300,
      reason: '409',
    });
    expect(planBackgroundSubmitRetry({ attempt: 2, maxAttempts: 3, detail: '429', baseDelayMs: 800 })).toEqual({
      retry: true,
      delayMs: 1800,
      reason: '429',
    });
    expect(planBackgroundSubmitRetry({ attempt: 1, maxAttempts: 3, detail: '512', baseDelayMs: 800 })).toEqual({
      retry: true,
      delayMs: 1300,
      reason: '512',
    });
    expect(planBackgroundSubmitRetry({ attempt: 3, maxAttempts: 3, detail: '409', baseDelayMs: 800 })).toEqual({
      retry: false,
      delayMs: 0,
      reason: 'attempts-exhausted',
    });
    expect(planBackgroundSubmitRetry({ attempt: 1, maxAttempts: 3, detail: '471', baseDelayMs: 800 })).toEqual({
      retry: false,
      delayMs: 0,
      reason: 'non-retryable',
    });
  });

  it('classifies only an empty status-0 transport result as ambiguous', () => {
    const emptyTransport = {
      success: false,
      status: 0,
      error: { code: 0, message: null, reason: null },
      response: { status: null },
      errorResponse: { status: null },
    };
    expect(isAmbiguousBackgroundSubmitResult(emptyTransport)).toBe(true);
    expect(isAmbiguousBackgroundSubmitResult({
      ...emptyTransport,
      message: 'EA rejected the squad',
    })).toBe(false);
    expect(isAmbiguousBackgroundSubmitResult({
      ...emptyTransport,
      error: { code: 429 },
    })).toBe(false);
    expect(isAmbiguousBackgroundSubmitResult({ success: false, status: null, error: { code: 0 } }))
      .toBe(false);
  });

  it('allows one ambiguous transport result to reach reconciliation, never a blind second retry', () => {
    const result = { success: false, status: 0, error: { code: 0 } };
    expect(planBackgroundSubmitRetry({
      attempt: 1,
      maxAttempts: 3,
      detail: 'unknown',
      result,
      baseDelayMs: 800,
    })).toEqual({
      retry: true,
      delayMs: 3000,
      reason: 'ambiguous-transport',
      requiresNoMutationEvidence: true,
    });
    expect(planBackgroundSubmitRetry({
      attempt: 2,
      maxAttempts: 3,
      detail: 'unknown',
      result,
      baseDelayMs: 800,
    })).toEqual({
      retry: false,
      delayMs: 0,
      reason: 'ambiguous-retry-exhausted',
    });
  });

  it('retries an ambiguous submit only after fresh evidence proves no server mutation', () => {
    const item = {
      id: 101,
      definitionId: 1001,
      expectedPile: 'storage',
      found: true,
      currentPile: 'storage',
      rating: 90,
    };
    const state = (timesCompleted = 97) => ({
      set: { id: 1419, timesCompleted },
      challenge: {
        id: 4115,
        status: 'NOT_STARTED',
        completed: false,
        isCompleted: false,
        scalarHints: { timesCompleted },
      },
    });
    const selectedItems = {
      selectedCount: 1,
      exactFound: 1,
      exactMissing: 0,
      currentPiles: { storage: 1 },
      items: [item],
    };
    const input = {
      attempt: 1,
      maxAttempts: 3,
      refreshOutcome: 'confirmed',
      reloadOutcome: 'current-challenge-loaded',
      stateBefore: state(),
      stateAfter: state(),
      selectedItemsBefore: selectedItems,
      selectedItemsAfter: selectedItems,
      packInventory: { beforeTotal: 20, afterTotal: 20, changed: [], truncated: false },
    };

    expect(planAmbiguousBackgroundSubmitRetry(input)).toEqual({
      retry: true,
      reason: 'no-server-mutation-confirmed',
    });
    expect(planAmbiguousBackgroundSubmitRetry({
      ...input,
      stateAfter: state(98),
    })).toEqual({ retry: false, reason: 'completion-counter-changed' });
    expect(planAmbiguousBackgroundSubmitRetry({
      ...input,
      selectedItemsAfter: { ...selectedItems, exactFound: 0, exactMissing: 1, items: [{ ...item, found: false }] },
    })).toEqual({ retry: false, reason: 'submitted-item-state-changed' });
    expect(planAmbiguousBackgroundSubmitRetry({
      ...input,
      packInventory: {
        beforeTotal: 20,
        afterTotal: 21,
        changed: [{ packId: 1082, before: 0, after: 1, delta: 1 }],
        truncated: false,
      },
    })).toEqual({ retry: false, reason: 'pack-inventory-changed' });
    expect(planAmbiguousBackgroundSubmitRetry({
      ...input,
      reloadOutcome: 'next-challenge-loaded',
    })).toEqual({ retry: false, reason: 'original-challenge-not-reloaded' });
    expect(planAmbiguousBackgroundSubmitRetry({
      ...input,
      refreshOutcome: 'failed',
    })).toEqual({ retry: false, reason: 'evidence-refresh-failed' });
  });

  it('confirms item violations only when every violating item belongs to the submitted squad', () => {
    expect(planItemViolationOverride({
      allowOverride: true,
      attempt: 1,
      maxAttempts: 3,
      detail: '409',
      skipValidation: false,
      submittedItemIds: [101, 102, 103],
      result: {
        status: 409,
        data: {
          itemViolations: [
            { name: 'ACTIVE_SQUAD', itemIds: [101, 102] },
            { name: 'ANOTHER_WARNING', itemIds: [103] },
          ],
        },
      },
    })).toEqual({
      retry: true,
      reason: 'item-violations',
      skipValidation: true,
      reloadChallenge: false,
      violationNames: ['ACTIVE_SQUAD', 'ANOTHER_WARNING'],
      violationItemIds: [101, 102, 103],
      violations: [
        {
          name: 'ACTIVE_SQUAD',
          normalizedName: 'ACTIVE_SQUAD',
          kind: 'active-squad',
          itemIds: [101, 102],
        },
        {
          name: 'ANOTHER_WARNING',
          normalizedName: 'ANOTHER_WARNING',
          kind: 'unknown',
          itemIds: [103],
        },
      ],
      activeSquadItemIds: [101, 102],
      evolutionItemIds: [],
      unknownItemIds: [103],
    });
  });

  it('extracts exact submitted item IDs for protected Rolling replanning without enabling an override', () => {
    expect(inspectItemViolationConflict({
      detail: '409',
      submittedItemIds: [101, 102, 103],
      result: {
        status: 409,
        data: { itemViolations: [{ name: 'ACTIVE_SQUAD', itemIds: [102] }] },
      },
    })).toEqual({
      retry: false,
      reason: 'item-violations',
      skipValidation: false,
      reloadChallenge: false,
      violationNames: ['ACTIVE_SQUAD'],
      violationItemIds: [102],
      violations: [{
        name: 'ACTIVE_SQUAD',
        normalizedName: 'ACTIVE_SQUAD',
        kind: 'active-squad',
        itemIds: [102],
      }],
      activeSquadItemIds: [102],
      evolutionItemIds: [],
      unknownItemIds: [],
    });
    expect(inspectItemViolationConflict({
      detail: '409',
      submittedItemIds: [101],
      result: {
        status: 409,
        data: { itemViolations: [{ name: 'ACTIVE_SQUAD', itemIds: [999] }] },
      },
    })).toMatchObject({ reason: 'foreign-item-violation', violationItemIds: [] });
  });

  it('preserves the exact item IDs for mixed Active Squad and Evo warnings', () => {
    expect(inspectItemViolationConflict({
      detail: '409',
      submittedItemIds: [101, 102, 103],
      result: {
        status: 409,
        data: {
          itemViolations: [
            { name: 'ACTIVE_SQUAD', itemIds: [101] },
            { name: 'Evo', itemIds: [102, 103] },
          ],
        },
      },
    })).toMatchObject({
      violations: [
        {
          name: 'ACTIVE_SQUAD',
          normalizedName: 'ACTIVE_SQUAD',
          kind: 'active-squad',
          itemIds: [101],
        },
        {
          name: 'Evo',
          normalizedName: 'EVO',
          kind: 'evolution',
          itemIds: [102, 103],
        },
      ],
      activeSquadItemIds: [101],
      evolutionItemIds: [102, 103],
      unknownItemIds: [],
    });
  });

  it.each([
    {
      name: 'override is disabled',
      input: { allowOverride: false },
      reason: 'disabled',
    },
    {
      name: 'response is not a 409',
      input: { detail: '429', result: { status: 429, data: { itemViolations: [{ itemIds: [101] }] } } },
      reason: 'not-item-violation-conflict',
    },
    {
      name: 'violations are missing',
      input: { result: { status: 409, data: {} } },
      reason: 'missing-item-violations',
    },
    {
      name: 'a violation has no item ids',
      input: { result: { status: 409, data: { itemViolations: [{ name: 'ACTIVE_SQUAD', itemIds: [] }] } } },
      reason: 'invalid-item-violations',
    },
    {
      name: 'a violation contains an invalid item id',
      input: { result: { status: 409, data: { itemViolations: [{ name: 'ACTIVE_SQUAD', itemIds: [101, 'invalid'] }] } } },
      reason: 'invalid-item-violations',
    },
    {
      name: 'a violation contains an out-of-squad item id',
      input: { result: { status: 409, data: { itemViolations: [{ name: 'ACTIVE_SQUAD', itemIds: [999] }] } } },
      reason: 'foreign-item-violation',
    },
    {
      name: 'validation is already skipped',
      input: { skipValidation: true },
      reason: 'validation-already-skipped',
    },
    {
      name: 'retry budget is exhausted',
      input: { attempt: 3, maxAttempts: 3 },
      reason: 'attempts-exhausted',
    },
  ])('rejects an item-violation override when $name', ({ input, reason }) => {
    const base = {
      allowOverride: true,
      attempt: 1,
      maxAttempts: 3,
      detail: '409',
      skipValidation: false,
      submittedItemIds: [101, 102],
      result: {
        status: 409,
        data: { itemViolations: [{ name: 'ACTIVE_SQUAD', itemIds: [101] }] },
      },
    };
    expect(planItemViolationOverride({ ...base, ...input })).toMatchObject({
      retry: false,
      reason,
    });
  });
});
