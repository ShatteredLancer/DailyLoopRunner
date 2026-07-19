import { FSU_COMPAT_DEFAULTS } from './runtime.js';

const FSU_SETTING_ALIASES = {
  ignorePlayerPosition: [/ignore.*player.*position/i, /ignore.*position/i, /忽略.*位置/],
  onlyUntradeable: [/only.*untrad/i, /untrad.*only/i, /仅.*不可交易/, /只.*不可交易/],
  excludeDesignatedLeagues: [/exclude.*designated.*league/i, /exclude.*league/i, /排除.*联赛/, /排除.*聯賽/],
  useRarityPlayer: [/use.*rarity.*player/i, /rarity.*player/i, /使用.*稀有/, /使用.*特殊/],
  excludeEvolution: [/exclude.*evo/i, /exclude.*evolution/i, /排除.*进化/, /排除.*進化/],
  playerPickStrictCommonRare: [/player.*pick.*strict/i, /strictly.*common.*rare/i, /球员选择.*严格/, /球員選擇.*嚴格/],
  priorityRareWithinGoldRange: [/priority.*rare.*gold.*range/i, /rare.*within.*gold.*range/i, /golden.*player.*range/i, /稀有.*金/],
  priorityNonSpecialPlayers: [/priority.*non.*special/i, /non.*special.*player/i, /优先.*非.*特殊/, /優先.*非.*特殊/],
  priorityStoragePlayers: [/priority.*storage/i, /storage.*player/i, /优先.*仓库/, /優先.*倉庫/, /storage.*priority/i],
  silverBronzePrioritizeNormal: [/silver.*bronze.*normal/i, /quality.*prioritize.*normal/i, /银.*铜.*普通/, /銀.*銅.*普通/],
};

const ITEM_ID_FIELDS = [
  'id', 'itemId', 'itemid', 'itemID', 'instanceId', 'instanceid', 'resourceId', 'resourceid',
  'resourceID', 'cardId', 'cardid', 'cardID', 'playerId', 'playerid', 'playerID',
  'guidAssetId', 'guidassetid', 'guidAssetID',
];

const DEFINITION_ID_FIELDS = [
  'definitionId', 'definitionid', 'definitionID', 'defId', 'defid', 'defID', 'assetId', 'assetid',
  'assetID', '_assetId', '_assetid', '_assetID', 'baseId', 'baseid', 'baseID', 'baseResourceId',
  'baseResourceID', 'resourceId', 'resourceid', 'resourceID', 'guidAssetId', 'guidassetid', 'guidAssetID',
];

function boolFromAny(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enabled', 'enable'].includes(text)) return true;
    if (['false', '0', 'no', 'off', 'disabled', 'disable'].includes(text)) return false;
  }
  return null;
}

function safeRead(holder, key) {
  try { return holder?.[key]; } catch { return undefined; }
}

function isInspectableObject(value) {
  if (!value || typeof value !== 'object') return false;
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Object]' || tag === '[object Array]';
}

function flattenConfigValues(value, path = '', rows = [], depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined || depth > 5) return rows;
  if (typeof value !== 'object') {
    rows.push({ path, value });
    return rows;
  }
  if (!isInspectableObject(value) || seen.has(value)) return rows;
  seen.add(value);
  const keys = Array.isArray(value) ? value.map((_, index) => String(index)) : Object.keys(value);
  for (const key of keys.slice(0, 250)) {
    const child = safeRead(value, key);
    const nextPath = path ? `${path}.${key}` : key;
    if (isInspectableObject(child)) flattenConfigValues(child, nextPath, rows, depth + 1, seen);
    else rows.push({ path: nextPath, value: child });
  }
  return rows;
}

function parseJsonMaybe(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || !['{', '['].includes(text[0])) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function numberListFromAny(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => numberListFromAny(entry))
      .filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return [Number(value)];
  if (typeof value === 'string') return (value.match(/\d+/g) || []).map(Number).filter(Number.isFinite);
  if (isInspectableObject(value)) {
    return flattenConfigValues(value).flatMap((row) => numberListFromAny(row.value))
      .filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
  }
  return [];
}

function uniquePositiveNumbers(values = []) {
  return values.map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function isLikelyLockedPlayerPath(path = '') {
  const text = String(path || '');
  if (!text || /unlock/i.test(text)) return false;
  const compact = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/((lock|locked)players?|players?(lock|locked)|(lock|locked)cards?|cards?(lock|locked)|(lock|locked)items?|items?(lock|locked)|protectedplayers?|protectedcards?|protecteditems?)/i.test(compact)) return true;
  return /(^|[._\-\s])(lock|locked|protect|protected)([._\-\s]|$)/i.test(text) &&
    /player|card|item|resource|definition|asset|info[._\-\s]*lock|(^|[._\-\s])lock([._\-\s]|$)/i.test(text);
}

function isLikelyLockedIdValuePath(path = '', key = '') {
  const field = String(key || '').replace(/^_+/, '');
  if (/^\d+$/.test(field)) return true;
  if (/^(id|itemid|instanceid|resourceid|cardid|playerid|definitionid|defid|assetid|baseid|baseresourceid|guidassetid)$/i.test(field)) return true;
  return /(^|[._\-\s])(lock|locked|protect|protected)([._\-\s]|$)$/i.test(String(path || ''));
}

function addLockedPlayerValue(result, value, path = '', key = '') {
  const numbers = numberListFromAny(value);
  if (!numbers.length) return;
  const text = `${key || ''} ${path || ''}`;
  const definitionLike = /definition|defid|asset|base|resource|guid/i.test(text);
  const itemLike = !definitionLike || /(^|[^a-z])(id|item|instance|card|player)([^a-z]|$)/i.test(text);
  if (definitionLike) numbers.forEach((number) => result.definitionIds.push(number));
  if (itemLike || /resource|guid/i.test(text)) numbers.forEach((number) => result.itemIds.push(number));
}

function collectLockedPlayerIds(value, path = '', result = { itemIds: [], definitionIds: [], sources: [] }, depth = 0, seen = new WeakSet(), inLockContext = false) {
  if (value === null || value === undefined || depth > 6) return result;
  const lockContext = inLockContext || isLikelyLockedPlayerPath(path);
  if (!isInspectableObject(value)) {
    if (lockContext && isLikelyLockedIdValuePath(path)) {
      addLockedPlayerValue(result, value, path);
      if (!result.sources.includes(path)) result.sources.push(path);
    }
    return result;
  }
  if (seen.has(value)) return result;
  seen.add(value);
  const keys = Array.isArray(value) ? value.map((_, index) => String(index)) : Object.keys(value);
  for (const key of keys.slice(0, 250)) {
    const child = safeRead(value, key);
    const nextPath = path ? `${path}.${key}` : key;
    const childLockContext = lockContext || isLikelyLockedPlayerPath(nextPath);
    if (childLockContext && !isInspectableObject(child) && isLikelyLockedIdValuePath(nextPath, key)) {
      addLockedPlayerValue(result, child, nextPath, key);
      if (!result.sources.includes(nextPath)) result.sources.push(nextPath);
    } else if (childLockContext && isInspectableObject(child)) {
      ITEM_ID_FIELDS.forEach((field) => addLockedPlayerValue(result, safeRead(child, field), nextPath, field));
      DEFINITION_ID_FIELDS.forEach((field) => addLockedPlayerValue(result, safeRead(child, field), nextPath, field));
    }
    if (isInspectableObject(child)) collectLockedPlayerIds(child, nextPath, result, depth + 1, seen, childLockContext);
  }
  return result;
}

export function normalizeLockedPlayerIds(raw, source = '') {
  const result = collectLockedPlayerIds(raw, source || 'lock');
  return {
    itemIds: uniquePositiveNumbers(result.itemIds),
    definitionIds: uniquePositiveNumbers(result.definitionIds),
    sources: [...new Set(result.sources || [])],
  };
}

function normalizeGoldRange(settings, rows) {
  const direct = numberListFromAny(settings.goldRange || settings.goldenRange || settings.goldRatingRange).slice(0, 2);
  if (direct.length === 2) return direct.sort((a, b) => a - b);
  if (direct.length === 1 && direct[0] >= 75 && direct[0] <= 99) return [75, direct[0]];
  let min = null;
  let max = null;
  for (const row of rows) {
    const path = row.path.toLowerCase();
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    if (/gold.*(min|from|start)|golden.*(min|from|start)/i.test(path)) min = value;
    if (/gold.*(max|to|end)|golden.*(max|to|end)/i.test(path)) max = value;
  }
  if (Number.isFinite(min) && Number.isFinite(max)) return [min, max].sort((a, b) => a - b);
  return [...FSU_COMPAT_DEFAULTS.goldRange];
}

export function normalizeFsuSettings(raw = {}, source = 'manual') {
  const rows = flattenConfigValues(raw);
  const settings = { ...FSU_COMPAT_DEFAULTS, detected: true, source };
  let matched = false;
  for (const [field, aliases] of Object.entries(FSU_SETTING_ALIASES)) {
    const row = rows.find((entry) => aliases.some((pattern) => pattern.test(entry.path)) && boolFromAny(entry.value) !== null);
    if (!row) continue;
    settings[field] = boolFromAny(row.value);
    matched = true;
  }
  const excludedLeagueRows = rows.filter((entry) =>
    /exclude|ignore|black|ban|designated|league|联赛|聯賽/i.test(entry.path) && /league|联赛|聯賽/i.test(entry.path)
  );
  const excludedLeagueIds = excludedLeagueRows.flatMap((entry) => numberListFromAny(entry.value))
    .filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
  if (excludedLeagueIds.length) {
    settings.excludedLeagueIds = excludedLeagueIds;
    settings.excludeDesignatedLeagues = true;
    matched = true;
  }
  const lockedPlayers = normalizeLockedPlayerIds(raw, source);
  if (lockedPlayers.itemIds.length || lockedPlayers.definitionIds.length) {
    settings.lockedItemIds = lockedPlayers.itemIds;
    settings.lockedDefinitionIds = lockedPlayers.definitionIds;
    matched = true;
  }
  const explicitGoldRange = numberListFromAny(raw.goldRange || raw.goldenRange || raw.goldRatingRange);
  settings.goldRange = normalizeGoldRange(raw, rows);
  if (explicitGoldRange.length) matched = true;
  return matched ? settings : null;
}

function likelyFsuStorageKey(key) {
  const text = String(key || '');
  return /fsu|enhancer|sbc.*(?:ignore|setting)|(?:ignore|rarity|untrad|league|evo|evolution|golden|player.*range).*settings?/i.test(text);
}

export function mergeLockedPlayersIntoSettings(settings, locked, sourceLabel = '') {
  const base = settings || {
    ...FSU_COMPAT_DEFAULTS,
    excludedLeagueIds: [...FSU_COMPAT_DEFAULTS.excludedLeagueIds],
    goldRange: [...FSU_COMPAT_DEFAULTS.goldRange],
    lockedItemIds: [],
    lockedDefinitionIds: [],
  };
  if (!locked || (!locked.itemIds?.length && !locked.definitionIds?.length)) return base;
  base.lockedItemIds = uniquePositiveNumbers([...(base.lockedItemIds || []), ...(locked.itemIds || [])]);
  base.lockedDefinitionIds = uniquePositiveNumbers([...(base.lockedDefinitionIds || []), ...(locked.definitionIds || [])]);
  base.detected = true;
  if (sourceLabel) base.source = base.source && base.source !== 'compat-defaults' ? `${base.source}+${sourceLabel}` : sourceLabel;
  return base;
}

export function readFsuSettingsFromStorage(storage, label) {
  if (!storage) return null;
  const exactKeys = [
    'sbcIgnorePlayerConfiguration', 'sbcIgnorePlayerConfig', 'sbc_ignore_player_configuration',
    'sbcIgnorePlayers', 'sbcSettings', 'fsuSbcSettings', 'fsuSettings', 'enhancerSettings', 'fcEnhancerSettings',
  ];
  for (const key of exactKeys) {
    const value = storage.get(key, null);
    if (value === null || value === undefined) continue;
    const parsed = parseJsonMaybe(value);
    const settings = normalizeFsuSettings(parsed || { [key]: value }, `${label}:${key}`);
    if (settings) return settings;
  }
  for (const [key, value] of storage.entries(250)) {
    if (!key || !likelyFsuStorageKey(key)) continue;
    const parsed = parseJsonMaybe(value);
    const settings = normalizeFsuSettings(parsed || { [key]: value }, `${label}:${key}`);
    if (settings) return settings;
  }
  return null;
}

export function readFsuLockedPlayersFromStorage(storage, label) {
  const combined = { itemIds: [], definitionIds: [], sources: [] };
  if (!storage) return combined;
  for (const [key, value] of storage.entries(250)) {
    if (!key || !isLikelyLockedPlayerPath(key)) continue;
    const parsed = parseJsonMaybe(value);
    const locked = normalizeLockedPlayerIds(parsed || { [key]: value }, `${label}:${key}`);
    combined.itemIds.push(...locked.itemIds);
    combined.definitionIds.push(...locked.definitionIds);
    combined.sources.push(...locked.sources);
  }
  return {
    itemIds: uniquePositiveNumbers(combined.itemIds),
    definitionIds: uniquePositiveNumbers(combined.definitionIds),
    sources: [...new Set(combined.sources)].slice(0, 8),
  };
}
