const MAX_VISIBLE_KEYS = 24;
const MAX_PROTOTYPE_KEYS = 24;
const MAX_MESSAGE_LENGTH = 240;
const MAX_STATE_ITEMS = 32;
const MAX_PACK_CHANGES = 24;
const MAX_ITEM_VIOLATIONS = 16;
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

function diagnosticValue(value, maxLength = MAX_MESSAGE_LENGTH) {
  const scalar = diagnosticScalar(value, maxLength);
  if (scalar !== null) return scalar;
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;

  const direct = diagnosticScalar(safeRead(value, '_value'), maxLength)
    ?? diagnosticScalar(safeRead(value, 'name'), maxLength);
  if (direct !== null) return direct;

  const valueMethod = safeRead(value, 'value');
  if (typeof valueMethod !== 'function' || valueMethod.length > 0) return null;
  try {
    return diagnosticScalar(valueMethod.call(value), maxLength);
  } catch {
    return null;
  }
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

function numericId(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function submittedIdSet(values = []) {
  return new Set((Array.isArray(values) ? values : [])
    .slice(0, MAX_STATE_ITEMS)
    .map(numericId)
    .filter((id) => id !== null));
}

function looksLikeItemViolation(value) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false;
  return [
    'id', 'itemId', 'definitionId', 'code', 'errorCode', 'reason', 'message',
    'type', 'slot', 'index', 'status', 'value', 'name', 'itemIds', 'item', 'player', 'resource',
  ].some((key) => safeRead(value, key) !== undefined);
}

function numericIdList(value) {
  let values = [];
  if (Array.isArray(value)) values = value;
  else if (value instanceof Set) values = [...value];
  else if (value instanceof Map) values = [...value.values()];
  return [...new Set(values
    .slice(0, MAX_STATE_ITEMS)
    .map((entry) => numericId(entry?.id ?? entry?.itemId ?? entry))
    .filter((id) => id !== null))];
}

function collectionEntries(value) {
  if (Array.isArray(value)) {
    return { source: 'array', total: value.length, entries: value.map((entry, index) => [String(index), entry]) };
  }
  if (value instanceof Map) {
    return { source: 'map', total: value.size, entries: [...value.entries()] };
  }
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return { source: 'scalar', total: value === undefined || value === null ? 0 : 1, entries: [[null, value]] };
  }

  for (const key of ['models', 'items', '_items', '_array', 'list']) {
    const nested = safeRead(value, key);
    if (!Array.isArray(nested) && !(nested instanceof Map)) continue;
    const collection = collectionEntries(nested);
    return { ...collection, source: key };
  }

  const toArray = safeRead(value, 'toArray');
  if (typeof toArray === 'function' && toArray.length === 0) {
    try {
      const nested = toArray.call(value);
      if (Array.isArray(nested)) {
        const collection = collectionEntries(nested);
        return { ...collection, source: 'toArray' };
      }
    } catch { }
  }

  if (looksLikeItemViolation(value)) return { source: 'single', total: 1, entries: [[null, value]] };

  let keys = [];
  try { keys = Object.keys(value); } catch { }
  return {
    source: 'object',
    total: keys.length,
    entries: keys.map((key) => [key, safeRead(value, key)]),
  };
}

function violationItemReference(value, submittedIds) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
  const id = numericId(safeRead(value, 'id')) ?? numericId(safeRead(value, 'itemId'));
  const itemId = numericId(safeRead(value, 'itemId')) ?? id;
  return {
    id,
    itemId,
    definitionId: numericId(safeRead(value, 'definitionId')),
    rating: numericId(safeRead(value, 'rating')),
    submittedMatch: itemId === null ? null : submittedIds.has(itemId),
  };
}

function itemViolation(entryKey, value, submittedIds, ordinal) {
  const key = entryKey === null || entryKey === undefined
    ? null
    : diagnosticScalar(String(entryKey), 80);
  const keyItemId = numericId(key);
  const nestedValue = value && (typeof value === 'object' || typeof value === 'function') ? value : null;
  const nestedItem = ['item', 'player', 'resource']
    .map((field) => safeRead(nestedValue, field))
    .find((candidate) => candidate && (typeof candidate === 'object' || typeof candidate === 'function'));
  const item = violationItemReference(nestedItem, submittedIds);
  const id = numericId(safeRead(nestedValue, 'id'));
  const itemIds = numericIdList(safeRead(nestedValue, 'itemIds'));
  const itemId = numericId(safeRead(nestedValue, 'itemId'))
    ?? item?.itemId
    ?? keyItemId
    ?? id
    ?? (itemIds.length === 1 ? itemIds[0] : null);
  const candidateIds = [...new Set([itemId, ...itemIds].filter((candidate) => candidate !== null))];
  const matchedSubmittedIds = candidateIds.filter((candidate) => submittedIds.has(candidate));
  return {
    key,
    ordinal,
    id,
    itemId,
    definitionId: numericId(safeRead(nestedValue, 'definitionId')) ?? item?.definitionId ?? null,
    name: diagnosticValue(safeRead(nestedValue, 'name'), 120),
    itemIds,
    submittedItemIds: matchedSubmittedIds,
    code: diagnosticValue(safeRead(nestedValue, 'code')),
    errorCode: diagnosticValue(safeRead(nestedValue, 'errorCode')),
    reason: diagnosticValue(safeRead(nestedValue, 'reason')),
    message: diagnosticValue(safeRead(nestedValue, 'message')),
    type: diagnosticValue(safeRead(nestedValue, 'type'), 80),
    slot: diagnosticValue(safeRead(nestedValue, 'slot'), 80),
    index: diagnosticValue(safeRead(nestedValue, 'index'), 80),
    status: diagnosticValue(safeRead(nestedValue, 'status'), 80),
    value: nestedValue
      ? diagnosticValue(safeRead(nestedValue, 'value'))
      : diagnosticValue(value),
    submittedMatch: candidateIds.length ? matchedSubmittedIds.length > 0 : null,
    item,
    visibleKeys: visibleKeys(nestedValue),
    prototypeKeys: prototypeKeys(nestedValue),
  };
}

function itemViolationsSummary(value, submittedIds) {
  if (value === undefined || value === null) return null;
  const collection = collectionEntries(value);
  return {
    type: valueType(value),
    source: collection.source,
    count: collection.total,
    truncated: collection.total > MAX_ITEM_VIOLATIONS,
    items: collection.entries
      .slice(0, MAX_ITEM_VIOLATIONS)
      .map(([key, entry], index) => itemViolation(key, entry, submittedIds, index)),
    visibleKeys: visibleKeys(value),
    prototypeKeys: prototypeKeys(value),
  };
}

function diagnosticLayer(value, options = {}) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' && typeof value !== 'function') {
    return { value: diagnosticScalar(value) };
  }
  const submittedIds = options.submittedIds || new Set();
  return {
    type: valueType(value),
    status: diagnosticValue(safeRead(value, 'status')),
    statusCode: diagnosticValue(safeRead(value, 'statusCode')),
    httpStatus: diagnosticValue(safeRead(value, 'httpStatus')),
    code: diagnosticValue(safeRead(value, 'code')),
    errorCode: diagnosticValue(safeRead(value, 'errorCode')),
    reason: diagnosticValue(safeRead(value, 'reason')),
    message: diagnosticValue(safeRead(value, 'message')),
    retryAfter: diagnosticValue(safeRead(value, 'retryAfter'), 80) ?? retryAfter(safeRead(value, 'headers')),
    itemViolations: itemViolationsSummary(safeRead(value, 'itemViolations'), submittedIds),
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

function responseSummary(response, options = {}) {
  const summary = diagnosticLayer(response, options) || emptyDiagnosticLayer();
  return {
    ...summary,
    data: diagnosticLayer(safeRead(response, 'data'), options),
    body: diagnosticLayer(safeRead(response, 'body'), options),
    error: diagnosticLayer(safeRead(response, 'error'), options),
  };
}

function errorSummary(error, options = {}) {
  const summary = diagnosticLayer(error, options) || emptyDiagnosticLayer();
  return {
    ...summary,
    name: diagnosticScalar(safeRead(error, 'name'), 80),
    data: diagnosticLayer(safeRead(error, 'data'), options),
    body: diagnosticLayer(safeRead(error, 'body'), options),
  };
}

export function sanitizeBackgroundSubmitResult(result, options = {}) {
  const error = safeRead(result, 'error');
  const response = safeRead(result, 'response');
  const errorResponse = safeRead(error, 'response');
  const diagnosticOptions = { submittedIds: submittedIdSet(options.submittedItemIds) };
  return {
    success: safeRead(result, 'success') === true,
    status: diagnosticScalar(safeRead(result, 'status')),
    statusCode: diagnosticScalar(safeRead(result, 'statusCode')),
    httpStatus: diagnosticScalar(safeRead(result, 'httpStatus')),
    code: diagnosticScalar(safeRead(result, 'code')),
    errorCode: diagnosticScalar(safeRead(result, 'errorCode')),
    reason: diagnosticValue(safeRead(result, 'reason')),
    message: diagnosticValue(safeRead(result, 'message')),
    data: diagnosticLayer(safeRead(result, 'data'), diagnosticOptions),
    body: diagnosticLayer(safeRead(result, 'body'), diagnosticOptions),
    error: errorSummary(error, diagnosticOptions),
    response: responseSummary(response, diagnosticOptions),
    errorResponse: responseSummary(errorResponse, diagnosticOptions),
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
      submittedItemIds: [...submittedIdSet(context.submittedItemIds)],
      success: null,
      code: null,
    };
    events.push(event);
    prune(startedAt);
    return event;
  }

  function complete(event, result) {
    const endedAt = Number(now());
    const summary = sanitizeBackgroundSubmitResult(result, {
      submittedItemIds: event?.submittedItemIds,
    });
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
