const MAX_VISIBLE_KEYS = 24;
const MAX_MESSAGE_LENGTH = 240;
const MAX_EVENTS = 80;
const EVENT_WINDOW_MS = 10 * 60 * 1000;

function safeRead(value, key) {
  try {
    return value?.[key];
  } catch {
    return undefined;
  }
}

function diagnosticScalar(value, maxLength = MAX_MESSAGE_LENGTH) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  return value.slice(0, maxLength);
}

function visibleKeys(value) {
  try {
    return Object.keys(value || {})
      .map((key) => String(key).slice(0, 80))
      .sort()
      .slice(0, MAX_VISIBLE_KEYS);
  } catch {
    return [];
  }
}

function retryAfter(headers) {
  if (!headers) return null;
  try {
    if (typeof headers.get === 'function') {
      return diagnosticScalar(headers.get('retry-after') ?? headers.get('Retry-After'), 80);
    }
  } catch { }
  for (const key of visibleKeys(headers)) {
    if (key.toLowerCase() !== 'retry-after') continue;
    return diagnosticScalar(safeRead(headers, key), 80);
  }
  return null;
}

function responseSummary(response) {
  const headers = safeRead(response, 'headers');
  return {
    status: diagnosticScalar(safeRead(response, 'status')),
    code: diagnosticScalar(safeRead(response, 'code')),
    message: diagnosticScalar(safeRead(response, 'message')),
    retryAfter: diagnosticScalar(safeRead(response, 'retryAfter'), 80) ?? retryAfter(headers),
  };
}

export function sanitizeBackgroundSubmitResult(result) {
  const error = safeRead(result, 'error');
  const response = safeRead(result, 'response');
  const errorResponse = safeRead(error, 'response');
  return {
    success: safeRead(result, 'success') === true,
    status: diagnosticScalar(safeRead(result, 'status')),
    code: diagnosticScalar(safeRead(result, 'code')),
    message: diagnosticScalar(safeRead(result, 'message')),
    error: {
      name: diagnosticScalar(safeRead(error, 'name'), 80),
      code: diagnosticScalar(safeRead(error, 'code')),
      status: diagnosticScalar(safeRead(error, 'status')),
      message: diagnosticScalar(safeRead(error, 'message')),
    },
    response: responseSummary(response),
    errorResponse: responseSummary(errorResponse),
    visibleKeys: {
      result: visibleKeys(result),
      error: visibleKeys(error),
      response: visibleKeys(response),
      errorResponse: visibleKeys(errorResponse),
    },
  };
}

function resultCode(summary) {
  return summary?.error?.code
    ?? summary?.errorResponse?.status
    ?? summary?.status
    ?? summary?.code
    ?? summary?.response?.status
    ?? null;
}

function normalizeRequest(context = {}) {
  return {
    setId: Number(context.setId || 0) || null,
    challengeId: Number(context.challengeId || 0) || null,
    attempt: Math.max(1, Number(context.attempt || 1) || 1),
    maxAttempts: Math.max(1, Number(context.maxAttempts || 1) || 1),
    playerCount: Math.max(0, Number(context.playerCount || 0) || 0),
  };
}

export function createBackgroundSubmitTelemetry(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const events = [];

  function prune(referenceTime) {
    const cutoff = referenceTime - EVENT_WINDOW_MS;
    while (events.length && (events[0].startedAt < cutoff || events.length > MAX_EVENTS)) events.shift();
  }

  function begin(context = {}) {
    const startedAt = Number(now());
    prune(startedAt);
    const event = {
      startedAt,
      endedAt: null,
      request: normalizeRequest(context),
      success: null,
      code: null,
    };
    events.push(event);
    prune(startedAt);
    return event;
  }

  function complete(event, result) {
    const endedAt = Number(now());
    const summary = sanitizeBackgroundSubmitResult(result);
    event.endedAt = endedAt;
    event.success = summary.success;
    event.code = resultCode(summary);
    prune(endedAt);

    const currentIndex = events.indexOf(event);
    const previousEvents = currentIndex > 0 ? events.slice(0, currentIndex) : [];
    const previousAttempt = previousEvents.at(-1) || null;
    const previousSuccess = previousEvents.findLast((entry) => entry.success === true) || null;
    const recent = events.filter((entry) => entry.startedAt >= endedAt - 60_000);

    return {
      request: event.request,
      timing: {
        durationMs: Math.max(0, endedAt - event.startedAt),
        sincePreviousAttemptMs: previousAttempt
          ? Math.max(0, event.startedAt - previousAttempt.startedAt)
          : null,
        sincePreviousSuccessMs: previousSuccess
          ? Math.max(0, event.startedAt - Number(previousSuccess.endedAt || previousSuccess.startedAt))
          : null,
        attemptsLast60s: recent.length,
        successesLast60s: recent.filter((entry) => entry.success === true).length,
        failuresLast60s: recent.filter((entry) => entry.success === false).length,
      },
      result: summary,
    };
  }

  return Object.freeze({ begin, complete });
}

function normalizedPile(value) {
  const pile = String(value || 'unknown');
  return pile || 'unknown';
}

export function summarizeBackgroundSubmitItems(itemRefs = [], options = {}) {
  const refs = (Array.isArray(itemRefs) ? itemRefs : []).slice(0, 32);
  const resolveItem = typeof options.resolveItem === 'function' ? options.resolveItem : () => null;
  const items = refs.map((ref) => {
    let live = null;
    try { live = resolveItem(ref) || null; } catch { }
    const currentPile = live
      ? normalizedPile(safeRead(live, 'pile') || safeRead(safeRead(live, 'ref'), 'pile'))
      : null;
    return {
      id: Number(ref?.id || 0),
      definitionId: Number(ref?.definitionId || 0),
      expectedPile: normalizedPile(ref?.pile),
      found: Boolean(live),
      currentPile,
      rating: live ? (Number(safeRead(live, 'rating') || 0) || null) : null,
    };
  });
  const currentPiles = {};
  for (const item of items) {
    if (!item.found || !item.currentPile) continue;
    currentPiles[item.currentPile] = Number(currentPiles[item.currentPile] || 0) + 1;
  }
  const summary = options.ledgerSummary || {};
  const readiness = safeRead(summary, 'readiness') || {};
  const output = {
    selectedCount: Array.isArray(itemRefs) ? itemRefs.length : 0,
    exactFound: items.filter((item) => item.found).length,
    exactMissing: items.filter((item) => !item.found).length,
    currentPiles,
    ledger: {
      inventoryVersion: Number(safeRead(summary, 'inventoryVersion') || 0) || null,
      itemCount: Number(safeRead(summary, 'itemCount') || 0) || 0,
      pileCounts: { ...(safeRead(summary, 'pileCounts') || {}) },
      readiness: {
        state: diagnosticScalar(safeRead(readiness, 'state'), 80),
        fullyValidated: safeRead(readiness, 'fullyValidated') === true,
      },
    },
    items,
  };
  if (Array.isArray(itemRefs) && itemRefs.length > refs.length) output.truncated = true;
  return output;
}
