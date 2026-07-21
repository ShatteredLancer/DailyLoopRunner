import { describe, expect, it } from 'vitest';
import {
  isRetryableBackgroundSubmitError,
  normalizeSubmitErrorCode,
  planBackgroundSubmitRetry,
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
});
