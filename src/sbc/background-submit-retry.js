/**
 * Pure helpers for background rating SBC submit retries after EA conflicts
 * and transient service failures.
 */

const RETRYABLE_SUBMIT_CODES = new Set(['409', '426', '429', '512', '521']);
const RECOGNIZED_SUBMIT_CODES = [...RETRYABLE_SUBMIT_CODES].join('|');

function hasScalar(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isZeroScalar(value) {
  return hasScalar(value) && Number(value) === 0;
}

function hasMessage(value) {
  return hasScalar(value) && String(value).trim() !== '0';
}

function numericScalar(value) {
  if (!hasScalar(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function completionCounter(state) {
  return numericScalar(state?.challenge?.scalarHints?.timesCompleted)
    ?? numericScalar(state?.challenge?.timesCompleted)
    ?? numericScalar(state?.set?.timesCompleted);
}

function completedChallenge(state) {
  const challenge = state?.challenge || {};
  if (challenge.completed === true || challenge.isCompleted === true) return true;
  return [challenge.status, challenge.state]
    .some((value) => /^(?:COMPLETED|COMPLETE)$/i.test(String(value || '').trim()));
}

function unchangedSubmittedItems(before, after) {
  const selectedCount = Math.max(0, Number(before?.selectedCount || 0));
  if (!selectedCount || before?.truncated === true || after?.truncated === true) return false;
  if (Number(before?.exactFound || 0) !== selectedCount
    || Number(after?.selectedCount || 0) !== selectedCount
    || Number(after?.exactFound || 0) !== selectedCount
    || Number(after?.exactMissing || 0) !== 0) return false;

  const beforeItems = Array.isArray(before?.items) ? before.items : [];
  const afterItems = new Map((Array.isArray(after?.items) ? after.items : [])
    .map((item) => [Number(item?.id || 0), item]));
  if (beforeItems.length !== selectedCount || afterItems.size !== selectedCount) return false;
  return beforeItems.every((item) => {
    const id = Number(item?.id || 0);
    const current = afterItems.get(id);
    const expectedPile = String(item?.expectedPile || '').trim();
    const originalPile = String(item?.currentPile || '').trim();
    return id > 0
      && item?.found === true
      && current?.found === true
      && Number(current?.definitionId || 0) === Number(item?.definitionId || 0)
      && Boolean(expectedPile)
      && originalPile === expectedPile
      && String(current?.expectedPile || '').trim() === expectedPile
      && String(current?.currentPile || '').trim() === expectedPile;
  });
}

/**
 * EA occasionally returns UTServerErrorVO { code: 0 } after the transport
 * observer times out, without an HTTP status, service code, or message. That
 * shape is ambiguous rather than a normal retryable service error.
 */
export function isAmbiguousBackgroundSubmitResult(result = null) {
  if (!result || result?.success === true) return false;
  if (!isZeroScalar(result?.status) || !isZeroScalar(result?.error?.code)) return false;

  const layers = [result, result?.error, result?.response, result?.errorResponse].filter(Boolean);
  const codeKeys = ['status', 'statusCode', 'httpStatus', 'code', 'errorCode'];
  if (layers.some((layer) => codeKeys.some((key) => hasScalar(layer?.[key]) && !isZeroScalar(layer[key])))) {
    return false;
  }
  const messageKeys = ['message', 'reason'];
  if (layers.some((layer) => messageKeys.some((key) => hasMessage(layer?.[key])))) return false;
  if (layers.some((layer) => ['data', 'body'].some((key) => layer?.[key] !== undefined && layer[key] !== null))) {
    return false;
  }
  return true;
}

export function normalizeSubmitErrorCode(detail) {
  const text = String(detail ?? '').trim();
  if (!text) return '';
  const exact = text.match(new RegExp(`^(${RECOGNIZED_SUBMIT_CODES})$`));
  if (exact) return exact[1];
  const embedded = text.match(new RegExp(`\\b(${RECOGNIZED_SUBMIT_CODES})\\b`));
  return embedded ? embedded[1] : text;
}

export function isRetryableBackgroundSubmitError(detail) {
  return RETRYABLE_SUBMIT_CODES.has(normalizeSubmitErrorCode(detail));
}

/**
 * @returns {{ retry: boolean, delayMs: number, reason: string }}
 */
export function planBackgroundSubmitRetry({
  attempt = 1,
  maxAttempts = 3,
  detail = '',
  result = null,
  baseDelayMs = 800,
} = {}) {
  const max = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  const current = Math.max(1, Number(attempt) || 1);
  if (isAmbiguousBackgroundSubmitResult(result)) {
    if (current > 1 || current >= max) {
      return { retry: false, delayMs: 0, reason: 'ambiguous-retry-exhausted' };
    }
    return {
      retry: true,
      delayMs: 3000,
      reason: 'ambiguous-transport',
      requiresNoMutationEvidence: true,
    };
  }
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

/**
 * Allows one retry after an ambiguous status-0 result only when independently
 * refreshed Challenge, pack, and exact-item evidence all prove that the first
 * request did not mutate server state.
 */
export function planAmbiguousBackgroundSubmitRetry({
  attempt = 1,
  maxAttempts = 3,
  refreshOutcome = 'failed',
  reloadOutcome = 'unavailable',
  stateBefore = null,
  stateAfter = null,
  selectedItemsBefore = null,
  selectedItemsAfter = null,
  packInventory = null,
} = {}) {
  const current = Math.max(1, Number(attempt) || 1);
  const max = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  const stop = (reason) => ({ retry: false, reason });
  if (current > 1 || current >= max) return stop('ambiguous-retry-exhausted');
  if (refreshOutcome !== 'confirmed') return stop('evidence-refresh-failed');
  if (reloadOutcome !== 'current-challenge-loaded') return stop('original-challenge-not-reloaded');

  const beforeSetId = numericScalar(stateBefore?.set?.id);
  const afterSetId = numericScalar(stateAfter?.set?.id);
  const beforeChallengeId = numericScalar(stateBefore?.challenge?.id);
  const afterChallengeId = numericScalar(stateAfter?.challenge?.id);
  if (!beforeSetId || beforeSetId !== afterSetId
    || !beforeChallengeId || beforeChallengeId !== afterChallengeId) {
    return stop('challenge-identity-changed');
  }
  const beforeCounter = completionCounter(stateBefore);
  const afterCounter = completionCounter(stateAfter);
  if (beforeCounter === null || afterCounter === null) return stop('completion-counter-unavailable');
  if (beforeCounter !== afterCounter) return stop('completion-counter-changed');
  if (completedChallenge(stateAfter)) return stop('challenge-completed');

  const changedPacks = Array.isArray(packInventory?.changed) ? packInventory.changed : null;
  if (!changedPacks
    || packInventory?.truncated === true
    || numericScalar(packInventory?.beforeTotal) === null
    || numericScalar(packInventory?.afterTotal) === null
    || Number(packInventory.beforeTotal) !== Number(packInventory.afterTotal)
    || changedPacks.length) {
    return stop('pack-inventory-changed');
  }
  if (!unchangedSubmittedItems(selectedItemsBefore, selectedItemsAfter)) {
    return stop('submitted-item-state-changed');
  }
  return { retry: true, reason: 'no-server-mutation-confirmed' };
}

/**
 * A submit retry is only safe after EA supplied a fresh challenge instance.
 * Reusing the old squad after a failed reload turns one ambiguous conflict
 * into a burst of duplicate submissions and rate-limit errors.
 */
export function planChallengeReloadRetry({ reloadOutcome = 'unavailable' } = {}) {
  const outcome = String(reloadOutcome || '').trim();
  if (outcome === 'current-challenge-loaded' || outcome === 'next-challenge-loaded') {
    return { retry: true, reason: 'challenge-reloaded' };
  }
  return {
    retry: false,
    reason: outcome === 'failed' ? 'challenge-reload-failed' : 'challenge-reload-unavailable',
  };
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
  if (protectionEnabled !== true || !hasItemViolationConflict(result, detail)) return false;
  return result.data.itemViolations.some((violation) => {
    const kind = classifyItemViolationName(violation?.name);
    return kind === 'active-squad' || kind === 'unknown';
  });
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
    violations: [],
    activeSquadItemIds: [],
    evolutionItemIds: [],
    unknownItemIds: [],
  };
}

function normalizeItemViolationName(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function classifyItemViolationName(value) {
  const name = normalizeItemViolationName(value);
  if (name === 'ACTIVE_SQUAD' || name === 'ACTIVESQUAD') return 'active-squad';
  if (name === 'EVO' || name === 'EVOLUTION') return 'evolution';
  return 'unknown';
}

export function inspectItemViolationConflict({
  detail = '',
  result = null,
  submittedItemIds = [],
} = {}) {
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
  const structuredViolations = [];
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
    structuredViolations.push({
      name,
      normalizedName: normalizeItemViolationName(name),
      kind: classifyItemViolationName(name),
      itemIds: [...new Set(ids)],
    });
  }

  const idsForKind = (kind) => [...new Set(structuredViolations
    .filter((violation) => violation.kind === kind)
    .flatMap((violation) => violation.itemIds))];

  return {
    retry: false,
    reason: 'item-violations',
    skipValidation: false,
    reloadChallenge: false,
    violationNames: [...new Set(violationNames)],
    violationItemIds: [...new Set(violationItemIds)],
    violations: structuredViolations,
    activeSquadItemIds: idsForKind('active-squad'),
    evolutionItemIds: idsForKind('evolution'),
    unknownItemIds: idsForKind('unknown'),
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

  const inspected = inspectItemViolationConflict({ detail, result, submittedItemIds });
  if (inspected.reason !== 'item-violations') return inspected;

  return {
    retry: true,
    reason: 'item-violations',
    skipValidation: true,
    reloadChallenge: false,
    violationNames: inspected.violationNames,
    violationItemIds: inspected.violationItemIds,
    violations: inspected.violations,
    activeSquadItemIds: inspected.activeSquadItemIds,
    evolutionItemIds: inspected.evolutionItemIds,
    unknownItemIds: inspected.unknownItemIds,
  };
}
