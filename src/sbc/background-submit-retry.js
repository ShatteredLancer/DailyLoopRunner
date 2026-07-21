/**
 * Pure helpers for background rating SBC submit retries after EA conflicts.
 */

export function normalizeSubmitErrorCode(detail) {
  const text = String(detail ?? '').trim();
  if (!text) return '';
  const exact = text.match(/^(409|429)$/);
  if (exact) return exact[1];
  const embedded = text.match(/\b(409|429)\b/);
  return embedded ? embedded[1] : text;
}

export function isRetryableBackgroundSubmitError(detail) {
  const code = normalizeSubmitErrorCode(detail);
  return code === '409' || code === '429';
}

/**
 * @returns {{ retry: boolean, delayMs: number, reason: string }}
 */
export function planBackgroundSubmitRetry({
  attempt = 1,
  maxAttempts = 3,
  detail = '',
  baseDelayMs = 800,
} = {}) {
  const max = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  const current = Math.max(1, Number(attempt) || 1);
  const code = normalizeSubmitErrorCode(detail);
  if (!isRetryableBackgroundSubmitError(code)) {
    return { retry: false, delayMs: 0, reason: 'non-retryable' };
  }
  if (current >= max) {
    return { retry: false, delayMs: 0, reason: 'attempts-exhausted' };
  }
  const base = Math.max(200, Math.min(5000, Number(baseDelayMs) || 800));
  const delayMs = Math.min(3000, base + current * 500);
  return { retry: true, delayMs, reason: code };
}
