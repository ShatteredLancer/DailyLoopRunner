import { readPlayerRareFlag } from '../domain/player-rarity.js';

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
      message: primitiveOrNull(value.message),
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

export function diagnosticJson(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({ serializationError: error?.message || String(error) });
  }
}
