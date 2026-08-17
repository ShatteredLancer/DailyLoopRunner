const MAX_VISIBLE_KEYS = 24;
const MAX_PROTOTYPE_KEYS = 24;
const MAX_MESSAGE_LENGTH = 240;
const MAX_STATE_ITEMS = 32;
const MAX_PACK_CHANGES = 24;
const MAX_EVENTS = 80;
const EVENT_WINDOW_MS = 10 * 60 * 1000;
const STATE_SCALAR_KEYS = [
  'id', 'status', 'state', 'complete', 'completed', 'timesCompleted', 'repeats',
  'revision', '_revision', 'version', '_version', 'progress', 'formation',
  'challengeId', 'setId', 'instanceId', 'updatedAt', 'timestamp',
];

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

function prototypeKeys(value) {
  try {
    return Object.getOwnPropertyNames(Object.getPrototypeOf(value) || {})
      .filter((key) => key !== 'constructor')
      .map((key) => String(key).slice(0, 80))
      .sort()
      .slice(0, MAX_PROTOTYPE_KEYS);
  } catch {
    return [];
  }
}

function valueType(value) {
  try { return String(value?.constructor?.name || typeof value).slice(0, 80); } catch { return typeof value; }
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

function diagnosticLayer(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' && typeof value !== 'function') {
    return { value: diagnosticScalar(value) };
  }
  return {
    type: valueType(value),
    status: diagnosticScalar(safeRead(value, 'status')),
    statusCode: diagnosticScalar(safeRead(value, 'statusCode')),
    httpStatus: diagnosticScalar(safeRead(value, 'httpStatus')),
    code: diagnosticScalar(safeRead(value, 'code')),
    errorCode: diagnosticScalar(safeRead(value, 'errorCode')),
    reason: diagnosticScalar(safeRead(value, 'reason')),
    message: diagnosticScalar(safeRead(value, 'message')),
    retryAfter: diagnosticScalar(safeRead(value, 'retryAfter'), 80) ?? retryAfter(safeRead(value, 'headers')),
    visibleKeys: visibleKeys(value),
    prototypeKeys: prototypeKeys(value),
  };
}

function emptyDiagnosticLayer() {
  return {
    type: null,
    status: null,
    statusCode: null,
    httpStatus: null,
    code: null,
    errorCode: null,
    reason: null,
    message: null,
    retryAfter: null,
    visibleKeys: [],
    prototypeKeys: [],
  };
}

function responseSummary(response) {
  const summary = diagnosticLayer(response) || emptyDiagnosticLayer();
  return {
    ...summary,
    data: diagnosticLayer(safeRead(response, 'data')),
    body: diagnosticLayer(safeRead(response, 'body')),
    error: diagnosticLayer(safeRead(response, 'error')),
  };
}

function errorSummary(error) {
  const summary = diagnosticLayer(error) || emptyDiagnosticLayer();
  return {
    ...summary,
    name: diagnosticScalar(safeRead(error, 'name'), 80),
    data: diagnosticLayer(safeRead(error, 'data')),
    body: diagnosticLayer(safeRead(error, 'body')),
  };
}

export function sanitizeBackgroundSubmitResult(result) {
  const error = safeRead(result, 'error');
  const response = safeRead(result, 'response');
  const errorResponse = safeRead(error, 'response');
  return {
    success: safeRead(result, 'success') === true,
    status: diagnosticScalar(safeRead(result, 'status')),
    statusCode: diagnosticScalar(safeRead(result, 'statusCode')),
    httpStatus: diagnosticScalar(safeRead(result, 'httpStatus')),
    code: diagnosticScalar(safeRead(result, 'code')),
    errorCode: diagnosticScalar(safeRead(result, 'errorCode')),
    reason: diagnosticScalar(safeRead(result, 'reason')),
    message: diagnosticScalar(safeRead(result, 'message')),
    data: diagnosticLayer(safeRead(result, 'data')),
    body: diagnosticLayer(safeRead(result, 'body')),
    error: errorSummary(error),
    response: responseSummary(response),
    errorResponse: responseSummary(errorResponse),
    visibleKeys: {
      result: visibleKeys(result),
      error: visibleKeys(error),
      response: visibleKeys(response),
      errorResponse: visibleKeys(errorResponse),
    },
    prototypeKeys: {
      result: prototypeKeys(result),
      error: prototypeKeys(error),
      response: prototypeKeys(response),
      errorResponse: prototypeKeys(errorResponse),
    },
  };
}

function resultCode(summary) {
  return summary?.error?.code
    ?? summary?.error?.errorCode
    ?? summary?.error?.status
    ?? summary?.error?.statusCode
    ?? summary?.errorResponse?.status
    ?? summary?.errorResponse?.statusCode
    ?? summary?.errorResponse?.code
    ?? summary?.errorResponse?.errorCode
    ?? summary?.status
    ?? summary?.statusCode
    ?? summary?.code
    ?? summary?.errorCode
    ?? summary?.response?.status
    ?? summary?.response?.statusCode
    ?? null;
}

function normalizeRequest(context = {}) {
  return {
    setId: Number(context.setId || 0) || null,
    challengeId: Number(context.challengeId || 0) || null,
    attempt: Math.max(1, Number(context.attempt || 1) || 1),
    maxAttempts: Math.max(1, Number(context.maxAttempts || 1) || 1),
    playerCount: Math.max(0, Number(context.playerCount || 0) || 0),
    skipValidation: context.skipValidation === true,
    chemistryEnabled: context.chemistryEnabled === true,
  };
}

function methodBoolean(value, name) {
  try {
    if (typeof value?.[name] !== 'function') return null;
    return value[name]() === true;
  } catch {
    return null;
  }
}

function directBoolean(value, key) {
  const candidate = safeRead(value, key);
  return typeof candidate === 'boolean' ? candidate : null;
}

function numberValue(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scalarHints(value) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return {};
  const hints = {};
  for (const key of STATE_SCALAR_KEYS) {
    const scalar = diagnosticScalar(safeRead(value, key));
    if (scalar === null) continue;
    hints[key] = scalar;
    if (Object.keys(hints).length >= MAX_VISIBLE_KEYS) break;
  }
  return hints;
}

function setState(set) {
  return {
    id: numberValue(safeRead(set, 'id')),
    name: diagnosticScalar(safeRead(set, 'name')),
    status: diagnosticScalar(safeRead(set, 'status')),
    state: diagnosticScalar(safeRead(set, 'state')),
    complete: directBoolean(set, 'complete'),
    completed: directBoolean(set, 'completed'),
    timesCompleted: numberValue(safeRead(set, 'timesCompleted')),
    repeats: numberValue(safeRead(set, 'repeats')),
    isComplete: methodBoolean(set, 'isComplete'),
    scalarHints: scalarHints(set),
    visibleKeys: visibleKeys(set),
    prototypeKeys: prototypeKeys(set),
  };
}

function challengeState(challenge, activeChallenge = null) {
  return {
    id: numberValue(safeRead(challenge, 'id')),
    status: diagnosticScalar(safeRead(challenge, 'status')),
    state: diagnosticScalar(safeRead(challenge, 'state')),
    completed: directBoolean(challenge, 'completed'),
    formation: numberValue(safeRead(challenge, 'formation')),
    hasSquad: Boolean(safeRead(challenge, 'squad')),
    isCompleted: methodBoolean(challenge, 'isCompleted'),
    isInProgress: methodBoolean(challenge, 'isInProgress'),
    canSubmit: methodBoolean(challenge, 'canSubmit'),
    sameObject: activeChallenge ? challenge === activeChallenge : undefined,
    scalarHints: scalarHints(challenge),
    visibleKeys: visibleKeys(challenge),
    prototypeKeys: prototypeKeys(challenge),
  };
}

function squadState(items = []) {
  const bounded = (Array.isArray(items) ? items : []).filter(Boolean).slice(0, MAX_STATE_ITEMS);
  const ids = bounded.map((item) => numberValue(safeRead(item, 'id')));
  const definitionIds = bounded.map((item) => numberValue(safeRead(item, 'definitionId')));
  const ratings = bounded.map((item) => numberValue(safeRead(item, 'rating')));
  return {
    count: Array.isArray(items) ? items.filter(Boolean).length : 0,
    ids,
    definitionIds,
    ratings,
    uniqueDefinitions: new Set(definitionIds.filter((id) => id !== null)).size,
    truncated: Array.isArray(items) && items.filter(Boolean).length > bounded.length,
  };
}

export function summarizeBackgroundSubmitState(input = {}) {
  const challenge = input.challenge || null;
  return {
    controllerName: diagnosticScalar(input.controllerName, 120),
    submissionOptions: {
      skipValidation: input.submissionOptions?.skipValidation === true,
      chemistryEnabled: input.submissionOptions?.chemistryEnabled === true,
    },
    set: setState(input.set || null),
    challenge: challengeState(challenge),
    cachedChallenges: (Array.isArray(input.cachedChallenges) ? input.cachedChallenges : [])
      .filter(Boolean)
      .slice(0, MAX_VISIBLE_KEYS)
      .map((entry) => challengeState(entry, challenge)),
    squad: squadState(input.squadItems),
  };
}

function normalizedPackCounts(value) {
  const entries = value instanceof Map
    ? [...value.entries()]
    : Object.entries(value && typeof value === 'object' ? value : {});
  const counts = new Map();
  for (const [rawId, rawCount] of entries) {
    const packId = Number(rawId);
    const count = Math.max(0, Number(rawCount) || 0);
    if (!Number.isInteger(packId) || packId <= 0) continue;
    counts.set(packId, count);
  }
  return counts;
}

export function summarizeBackgroundSubmitPackCounts(beforeValue, afterValue) {
  const before = normalizedPackCounts(beforeValue);
  const after = normalizedPackCounts(afterValue);
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort((left, right) => left - right);
  const changes = ids.map((packId) => ({
    packId,
    before: Number(before.get(packId) || 0),
    after: Number(after.get(packId) || 0),
    delta: Number(after.get(packId) || 0) - Number(before.get(packId) || 0),
  })).filter((entry) => entry.delta !== 0);
  return {
    beforeTotal: [...before.values()].reduce((total, count) => total + count, 0),
    afterTotal: [...after.values()].reduce((total, count) => total + count, 0),
    changed: changes.slice(0, MAX_PACK_CHANGES),
    truncated: changes.length > MAX_PACK_CHANGES,
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
