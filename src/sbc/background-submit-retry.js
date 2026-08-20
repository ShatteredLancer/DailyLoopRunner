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

export function hasItemViolationConflict(result, detail = '') {
  const codes = [detail, result?.status, result?.error?.code]
    .map(normalizeSubmitErrorCode)
    .filter(Boolean);
  return codes.includes('409')
    && Array.isArray(result?.data?.itemViolations)
    && result.data.itemViolations.length > 0;
}

export function shouldStopForProtectedItemViolation({
  protectionEnabled = false,
  result = null,
  detail = '',
} = {}) {
  return protectionEnabled === true && hasItemViolationConflict(result, detail);
}

function positiveItemId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function rejectedItemViolationOverride(reason) {
  return {
    retry: false,
    reason,
    skipValidation: false,
    reloadChallenge: false,
    violationNames: [],
    violationItemIds: [],
  };
}

/**
 * Plans EA's explicit validation-confirmation retry for warnings attached only
 * to entities in the already validated squad. Unknown response shapes fail
 * closed so an unrelated 409 can never become a forced submission.
 */
export function planItemViolationOverride({
  allowOverride = false,
  attempt = 1,
  maxAttempts = 3,
  detail = '',
  result = null,
  submittedItemIds = [],
  skipValidation = false,
} = {}) {
  if (allowOverride !== true) return rejectedItemViolationOverride('disabled');
  if (skipValidation === true) return rejectedItemViolationOverride('validation-already-skipped');

  const current = Math.max(1, Number(attempt) || 1);
  const max = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  if (current >= max) return rejectedItemViolationOverride('attempts-exhausted');

  const code = normalizeSubmitErrorCode(detail || result?.status || result?.error?.code || '');
  if (code !== '409') return rejectedItemViolationOverride('not-item-violation-conflict');

  const violations = result?.data?.itemViolations;
  if (!Array.isArray(violations) || !violations.length) {
    return rejectedItemViolationOverride('missing-item-violations');
  }

  const submittedIds = new Set((submittedItemIds || []).map(positiveItemId).filter(Boolean));
  if (!submittedIds.size) return rejectedItemViolationOverride('missing-submitted-items');

  const violationItemIds = [];
  const violationNames = [];
  for (const violation of violations) {
    if (!violation || typeof violation !== 'object' || !Array.isArray(violation.itemIds) || !violation.itemIds.length) {
      return rejectedItemViolationOverride('invalid-item-violations');
    }
    const ids = violation.itemIds.map(positiveItemId);
    if (ids.some((id) => !id)) return rejectedItemViolationOverride('invalid-item-violations');
    if (ids.some((id) => !submittedIds.has(id))) {
      return rejectedItemViolationOverride('foreign-item-violation');
    }
    violationItemIds.push(...ids);
    const name = String(violation.name || '').trim();
    if (name) violationNames.push(name);
  }

  return {
    retry: true,
    reason: 'item-violations',
    skipValidation: true,
    reloadChallenge: false,
    violationNames: [...new Set(violationNames)],
    violationItemIds: [...new Set(violationItemIds)],
  };
}
