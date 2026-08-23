import {
  hasPlayerCosmetics,
  hasPlayerUpgrades,
  isPlayerEvolutionCard,
  readPlayerRareFlag,
} from '../domain/player-rarity.js';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function primitiveOrNull(value) {
  if (value === null || value === undefined) return null;
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return String(value);
}

function callBoolean(item, methodName) {
  try {
    if (typeof item?.[methodName] === 'function') return item[methodName]() === true;
  } catch { }
  return null;
}

const RUNTIME_ITEM_FIELD_GROUPS = Object.freeze([
  ['upgrades', ['upgrades']],
  ['evolution', ['evolution', 'isEvolution', 'isEvo', 'evolutionId', 'evoId', 'evolutionStatus']],
  ['cosmetics', ['cosmetics', 'cosmetic']],
  ['definitionId', ['definitionId', 'definitionID', 'defId']],
  ['rating', ['rating', '_rating']],
  ['rareflag', ['rareflag', 'rareFlag', '_rareflag']],
  ['chemistryStyle', ['chemistryStyle', 'chemStyle', 'styleId', 'playStyle']],
  ['preferredPosition', ['preferredPosition', '_preferredPosition']],
  ['attributes', ['attributes']],
  ['skillMoves', ['skillMoves', '_skillMoves', 'skillmoves']],
  ['weakFoot', ['weakFoot', '_weakFoot', 'weakfoot']],
  ['groups', ['groups']],
  ['tradeability', ['tradeable', 'tradable', 'untradeable', 'untradeableCount']],
]);

function diagnosticValueSummary(value) {
  if (value === undefined) return { type: 'undefined' };
  if (value === null) return { type: 'null', value: null };
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return { type: typeof value, value: primitiveOrNull(value) };
  }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      itemIds: value.slice(0, 8).map((entry) => numberOrNull(entry?.id ?? entry?.itemId)),
    };
  }
  if (typeof value === 'object') {
    let keys = [];
    try { keys = Object.keys(value).sort(); } catch { }
    return {
      type: value?.constructor?.name || 'Object',
      keys: keys.slice(0, 16),
      keyCount: keys.length,
    };
  }
  return { type: typeof value };
}

function inspectRuntimeItemField(item, name, aliases) {
  const holders = [
    ['item', item],
    ['ref', item?.ref],
    ['_data', item?._data],
    ['data', item?.data],
    ['_staticData', item?._staticData],
    ['staticData', item?.staticData],
  ].filter(([, holder]) => holder && typeof holder === 'object');
  const sources = [];
  for (const [holderName, holder] of holders) {
    for (const alias of aliases) {
      let inObject = false;
      let own = false;
      let descriptor = null;
      let descriptorOwner = null;
      try {
        inObject = alias in holder;
        own = Object.prototype.hasOwnProperty.call(holder, alias);
        let current = holder;
        let depth = 0;
        while (current && depth < 8) {
          descriptor = Object.getOwnPropertyDescriptor(current, alias) || null;
          if (descriptor) {
            descriptorOwner = depth === 0
              ? holderName
              : `prototype:${current?.constructor?.name || 'Object'}`;
            break;
          }
          current = Object.getPrototypeOf(current);
          depth++;
        }
      } catch { }
      if (!inObject && !own) continue;
      let value;
      let readError = null;
      try { value = holder[alias]; } catch (error) { readError = error?.message || String(error); }
      sources.push({
        holder: holderName,
        field: alias,
        own,
        inherited: inObject && !own,
        descriptor: descriptor?.get || descriptor?.set ? 'accessor' : 'data',
        getter: typeof descriptor?.get === 'function',
        descriptorOwner,
        value: readError ? { readError } : diagnosticValueSummary(value),
      });
    }
  }
  const hasDefinedValue = sources.some((source) => source.value?.type !== 'undefined');
  return {
    state: !sources.length ? 'missing' : hasDefinedValue ? 'present' : 'present-undefined',
    aliases,
    sources,
  };
}

export function captureRuntimeInventoryFieldDiagnostics(item) {
  if (!item || typeof item !== 'object') return null;
  try {
    return Object.fromEntries(RUNTIME_ITEM_FIELD_GROUPS.map(([name, aliases]) => [
      name,
      inspectRuntimeItemField(item, name, aliases),
    ]));
  } catch (error) {
    return { diagnosticError: error?.message || String(error) };
  }
}

function resultLayer(value) {
  if (!value || typeof value !== 'object') return primitiveOrNull(value);
  try {
    return {
      type: value?.constructor?.name || 'Object',
      keys: Object.keys(value).sort().slice(0, 40),
      success: typeof value.success === 'boolean' ? value.success : null,
      status: primitiveOrNull(value.status),
      statusCode: primitiveOrNull(value.statusCode),
      code: primitiveOrNull(value.code),
      reason: primitiveOrNull(value.reason),
      message: primitiveOrNull(value.message),
    };
  } catch (error) {
    return { diagnosticError: error?.message || String(error) };
  }
}

function boundedScalarValues(value, maxKeys = 60) {
  if (!value || typeof value !== 'object') return null;
  const entries = [];
  for (const key of Object.keys(value).sort()) {
    let scalar;
    try { scalar = value[key]; } catch { continue; }
    if (!['string', 'number', 'boolean'].includes(typeof scalar) && scalar !== null) continue;
    entries.push([key, primitiveOrNull(scalar)]);
    if (entries.length >= maxKeys) break;
  }
  return Object.fromEntries(entries);
}

export function captureRuntimePack(pack, options = {}) {
  if (!pack || typeof pack !== 'object') return null;
  try {
    const identify = typeof options.identify === 'function' ? options.identify : () => null;
    const data = pack._data ?? pack.data ?? null;
    return {
      objectRef: identify(pack),
      type: pack?.constructor?.name || 'Object',
      keys: Object.keys(pack).sort().slice(0, 80),
      scalars: boundedScalarValues(pack),
      dataType: data?.constructor?.name || null,
      dataKeys: data && typeof data === 'object' ? Object.keys(data).sort().slice(0, 80) : [],
      dataScalars: boundedScalarValues(data),
    };
  } catch (error) {
    return { diagnosticError: error?.message || String(error) };
  }
}

export function createRuntimeObjectIdentityTracker(prefix = 'ea-item') {
  const identities = new WeakMap();
  let sequence = 0;
  return (value) => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
    try {
      if (!identities.has(value)) identities.set(value, `${prefix}-${++sequence}`);
      return identities.get(value);
    } catch {
      return null;
    }
  };
}

export function captureRuntimeInventoryItem(item, options = {}) {
  if (!item || typeof item !== 'object') return null;
  try {
    const identify = typeof options.identify === 'function' ? options.identify : () => null;
    return {
      objectRef: identify(item),
      type: primitiveOrNull(item.type),
      id: numberOrNull(item.id ?? item.itemId ?? item._data?.id),
      definitionId: numberOrNull(item.definitionId ?? item.defId ?? item._data?.definitionId),
      rating: numberOrNull(item.rating ?? item._data?.rating),
      rareflag: readPlayerRareFlag(item),
      evolution: isPlayerEvolutionCard(item),
      hasUpgrades: hasPlayerUpgrades(item),
      hasCosmetics: hasPlayerCosmetics(item),
      ...(options.includeFieldDiagnostics === true
        ? { fieldDiagnostics: captureRuntimeInventoryFieldDiagnostics(item) }
        : {}),
      pile: primitiveOrNull(item.pile),
      privatePile: primitiveOrNull(item._pile),
      dataPile: primitiveOrNull(item._data?.pile),
      duplicateId: numberOrNull(item.duplicateId),
      privateDuplicateId: numberOrNull(item._duplicateId),
      dataDuplicateId: numberOrNull(item._data?.duplicateId),
      isDuplicate: callBoolean(item, 'isDuplicate'),
      isUntradeable: callBoolean(item, 'isUntradeable'),
      rawUntradeable: typeof item.untradeable === 'boolean' ? item.untradeable : null,
      rawTradeable: typeof item.tradeable === 'boolean' ? item.tradeable : null,
      injuryType: primitiveOrNull(item.injuryType),
      dataInjuryType: primitiveOrNull(item._data?.injuryType),
    };
  } catch (error) {
    return { diagnosticError: error?.message || String(error) };
  }
}

export function captureDefinitionPileState(piles = {}, definitionId, options = {}) {
  try {
    const target = numberOrNull(definitionId);
    const identify = typeof options.identify === 'function' ? options.identify : () => null;
    const maxItems = Math.max(1, Math.min(100, Number(options.maxItems || 20) || 20));
    return Object.fromEntries(['unassigned', 'storage', 'transfer', 'club'].map((pileName) => {
      const matches = (piles[pileName] || []).filter((item) =>
        numberOrNull(item?.definitionId ?? item?.defId ?? item?._data?.definitionId) === target
      );
      return [pileName, {
        count: matches.length,
        items: matches.slice(0, maxItems).map((item) => captureRuntimeInventoryItem(item, { identify })),
        truncated: matches.length > maxItems,
      }];
    }));
  } catch (error) {
    return { diagnosticError: error?.message || String(error) };
  }
}

export function captureMoveResult(result) {
  try {
    if (!result || typeof result !== 'object') {
      return { result: primitiveOrNull(result) };
    }
    const data = result.data ?? result._data;
    return {
      result: resultLayer(result),
      error: resultLayer(result.error),
      response: resultLayer(result.response),
      data: resultLayer(data),
      dataValues: data && typeof data === 'object' ? {
        sourcePile: primitiveOrNull(data.sourcePile),
        destinationPile: primitiveOrNull(data.destinationPile),
        itemIds: Array.isArray(data.itemIds) ? data.itemIds.map(numberOrNull) : primitiveOrNull(data.itemIds),
        clubDuplicates: Array.isArray(data.clubDuplicates)
          ? data.clubDuplicates.map((item) => numberOrNull(item?.id ?? item?.itemId ?? item))
          : primitiveOrNull(data.clubDuplicates),
        untradeableSwap: primitiveOrNull(data.untradeableSwap),
      } : null,
    };
  } catch (error) {
    return { diagnosticError: error?.message || String(error) };
  }
}

function collectionItems(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value._collection)) return value._collection;
  if (Array.isArray(value.models)) return value.models;
  try {
    if (typeof value.values === 'function') return Array.from(value.values());
  } catch { }
  return [];
}

function boundedDiagnosticValue(value, options = {}, depth = 0, seen = new WeakSet(), budget = null) {
  const state = budget || { remaining: Math.max(100, Number(options.maxNodes || 1500) || 1500) };
  if (state.remaining-- <= 0) return '[Node budget exhausted]';
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') {
    const maxString = Math.max(80, Number(options.maxString || 1000) || 1000);
    return value.length > maxString ? `${value.slice(0, maxString)}...[truncated]` : value;
  }
  if (['number', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  const maxDepth = Math.max(1, Number(options.maxDepth || 5) || 5);
  if (depth >= maxDepth) return `[${value?.constructor?.name || 'Object'} depth limit]`;
  seen.add(value);
  const maxArray = Math.max(1, Number(options.maxArray || 100) || 100);
  if (Array.isArray(value)) {
    const captured = value.slice(0, maxArray).map((entry) => (
      boundedDiagnosticValue(entry, options, depth + 1, seen, state)
    ));
    if (value.length > maxArray) captured.push(`[${value.length - maxArray} more item(s)]`);
    return captured;
  }
  const maxKeys = Math.max(1, Number(options.maxKeys || 60) || 60);
  let keys = [];
  try { keys = Object.keys(value); } catch (error) { return `[Keys unavailable: ${error?.message || error}]`; }
  const captured = { $type: value?.constructor?.name || 'Object' };
  for (const key of keys.slice(0, maxKeys)) {
    try {
      captured[key] = boundedDiagnosticValue(value[key], options, depth + 1, seen, state);
    } catch (error) {
      captured[key] = `[Read failed: ${error?.message || error}]`;
    }
  }
  if (keys.length > maxKeys) captured.$truncatedKeys = keys.length - maxKeys;
  return captured;
}

export function captureUnassignedRefreshResult(result, options = {}) {
  const maxItems = Math.max(1, Math.min(200, Number(options.maxItems || 100) || 100));
  const paths = [
    ['items'],
    ['response', 'items'],
    ['response', 'data', 'items'],
    ['response', '_data', 'items'],
    ['response', 'payload', 'items'],
    ['data', 'items'],
    ['_data', 'items'],
    ['payload', 'items'],
  ];
  const itemArrays = [];
  for (const path of paths) {
    let value = result;
    try {
      for (const key of path) value = value?.[key];
    } catch {
      value = null;
    }
    const items = collectionItems(value);
    if (!items.length && !Array.isArray(value)) continue;
    itemArrays.push({
      source: path.join('.'),
      count: items.length,
      items: items.slice(0, maxItems).map((item) => ({
        id: numberOrNull(item?.id ?? item?.itemId ?? item?._data?.id),
        definitionId: numberOrNull(item?.definitionId ?? item?.defId ?? item?._data?.definitionId),
        rating: numberOrNull(item?.rating ?? item?._data?.rating),
        pile: primitiveOrNull(item?.pile ?? item?._pile ?? item?._data?.pile),
        name: primitiveOrNull(item?.name ?? item?.commonName ?? item?._staticData?.name),
      })),
      truncated: items.length > maxItems,
    });
  }
  return {
    transport: captureMoveResult(result),
    itemArrays,
    raw: boundedDiagnosticValue(result, options),
  };
}

export function diagnosticJson(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({ serializationError: error?.message || String(error) });
  }
}
