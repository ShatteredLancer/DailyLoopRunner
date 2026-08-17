import { describe, expect, it } from 'vitest';
import {
  isRetryableBackgroundSubmitError,
  normalizeSubmitErrorCode,
  planBackgroundSubmitRetry,
  planItemViolationOverride,
} from '../../src/sbc/background-submit-retry.js';

describe('background submit retry helpers', () => {
  it('recognizes bare and embedded 409/429 codes', () => {
    expect(normalizeSubmitErrorCode(409)).toBe('409');
    expect(normalizeSubmitErrorCode('429')).toBe('429');
    expect(normalizeSubmitErrorCode('background submit failed: 409')).toBe('409');
    expect(isRetryableBackgroundSubmitError('409')).toBe(true);
    expect(isRetryableBackgroundSubmitError('429')).toBe(true);
    expect(isRetryableBackgroundSubmitError('500')).toBe(false);
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
