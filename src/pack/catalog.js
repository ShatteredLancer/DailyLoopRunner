import { isPlainObject } from '../domain/objects.js';

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function unique(values, normalizer = (value) => value) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const normalized = normalizer(value);
    if (normalized === null || normalized === undefined || normalized === '') continue;
    const key = String(normalized).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function cleanName(value) {
  return String(value || '').trim();
}

function normalizedName(value) {
  return cleanName(value).toLowerCase().replace(/\s+/g, ' ');
}

function packIdFromReward(reward = {}) {
  return positiveInteger(reward.packId)
    || positiveInteger(reward.resourceId)
    || positiveInteger(reward.definitionId);
}

function normalizeInventory(packs = []) {
  const groups = new Map();
  for (const pack of packs || []) {
    if (!pack) continue;
    const id = positiveInteger(pack.id ?? pack.packId ?? pack.packDefinitionId ?? pack.packAssetId);
    const name = cleanName(pack.name ?? pack.packName ?? pack.displayName);
    if (!id && !name) continue;
    const countValue = Number(pack.count);
    const count = Number.isInteger(countValue) && countValue >= 0 ? countValue : 1;
    const key = id ? `id:${id}` : `name:${normalizedName(name)}`;
    const existing = groups.get(key) || { id, name, count: 0 };
    existing.count += count;
    if (!existing.name && name) existing.name = name;
    groups.set(key, existing);
  }
  return [...groups.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function normalizeSbcRewardIndex(index = {}, previousEntry = null) {
  const rewards = (index.rewards || []).filter((reward) => reward?.type === 'PACK');
  const metadataPackIds = unique([
    ...(index.packIds || []),
    ...rewards.map(packIdFromReward),
  ], positiveInteger);
  const metadataPackNames = unique([
    ...(index.packNames || []),
    ...rewards.flatMap((reward) => [reward?.name, reward?.description]),
  ], cleanName);
  const observedPackIds = unique(previousEntry?.observedPackIds || [], positiveInteger);
  const observedPackNames = unique(previousEntry?.observedPackNames || [], cleanName);
  return {
    setId: positiveInteger(index.setId ?? index.id),
    setName: cleanName(index.setName ?? index.name),
    packIds: unique([...observedPackIds, ...metadataPackIds], positiveInteger),
    packNames: unique([...observedPackNames, ...metadataPackNames], cleanName),
    observedPackIds,
    observedPackNames,
  };
}

function sbcRewardKey(entry = {}) {
  if (entry.setId) return `id:${entry.setId}`;
  const name = normalizedName(entry.setName);
  return name ? `name:${name}` : '';
}

function normalizeSbcRewards(indexes = [], previousCatalog = null) {
  const previousByKey = new Map((previousCatalog?.sbcRewards || []).map((entry) => [sbcRewardKey(entry), entry]));
  const rewards = new Map();
  for (const index of indexes || []) {
    const candidate = normalizeSbcRewardIndex(index);
    const key = sbcRewardKey(candidate);
    if (!key) continue;
    const entry = normalizeSbcRewardIndex(index, previousByKey.get(key));
    rewards.set(key, entry);
  }
  return [...rewards.values()].sort((left, right) => (
    Number(left.setId || Number.MAX_SAFE_INTEGER) - Number(right.setId || Number.MAX_SAFE_INTEGER)
      || left.setName.localeCompare(right.setName)
  ));
}

function setNameMatches(setName, aliases = []) {
  const actual = normalizedName(setName);
  if (!actual) return false;
  return (aliases || []).some((alias) => {
    const expected = normalizedName(alias);
    return expected && actual.includes(expected);
  });
}

function matchLoopRewardSets(loopDef = {}, sbcRewards = []) {
  const setIds = new Set((loopDef.sbcSetIds || []).map(positiveInteger).filter(Boolean));
  if (setIds.size) {
    const idMatches = sbcRewards.filter((entry) => setIds.has(entry.setId));
    if (idMatches.length) return { matches: idMatches, matchSource: 'set-id', ambiguous: false };
  }

  const names = (loopDef.sbcNames || []).map(cleanName).filter(Boolean);
  if (!names.length) return { matches: [], matchSource: null, ambiguous: false };
  const nameMatches = sbcRewards.filter((entry) => setNameMatches(entry.setName, names));
  if (nameMatches.length === 1) return { matches: nameMatches, matchSource: 'set-name', ambiguous: false };
  return { matches: [], matchSource: 'set-name', ambiguous: nameMatches.length > 1, candidates: nameMatches };
}

export function bindPackCatalogLoops(catalog = {}, loopDefs = [], now = Date.now()) {
  const sbcRewards = Array.isArray(catalog.sbcRewards) ? catalog.sbcRewards : [];
  const loopRewards = {};
  const diagnostics = [];

  for (const loopDef of loopDefs || []) {
    const loopId = cleanName(loopDef?.id);
    const hasSbcIdentity = Boolean(loopDef?.sbcSetIds?.length || loopDef?.sbcNames?.length);
    if (!loopId || !hasSbcIdentity) continue;
    const match = matchLoopRewardSets(loopDef, sbcRewards);
    if (match.ambiguous) {
      diagnostics.push({
        type: 'ambiguous-loop-sbc',
        loopId,
        message: `${loopId}: SBC aliases matched multiple Sets (${(match.candidates || []).map((entry) => `#${entry.setId || '?'} ${entry.setName}`).join(', ')})`,
      });
      continue;
    }
    if (!match.matches.length) {
      diagnostics.push({
        type: 'loop-sbc-not-found',
        loopId,
        message: `${loopId}: no current SBC Set matched its configured Set IDs or names`,
      });
      continue;
    }
    const packIds = unique(match.matches.flatMap((entry) => entry.packIds || []), positiveInteger);
    const packNames = unique(match.matches.flatMap((entry) => entry.packNames || []), cleanName);
    loopRewards[loopId] = {
      loopId,
      setIds: unique(match.matches.map((entry) => entry.setId), positiveInteger),
      setNames: unique(match.matches.map((entry) => entry.setName), cleanName),
      packIds,
      packNames,
      matchSource: match.matchSource,
    };
    if (!packIds.length && !packNames.length) {
      diagnostics.push({
        type: 'loop-reward-not-found',
        loopId,
        message: `${loopId}: matched SBC Set has no PACK reward metadata`,
      });
    }
  }

  return {
    updatedAt: Number(now) || Date.now(),
    inventory: normalizeInventory(catalog.inventory || []),
    sbcRewards,
    loopRewards,
    diagnostics,
  };
}

export function createPackCatalog(options = {}) {
  const now = Number(options.now ?? Date.now()) || Date.now();
  const catalog = {
    updatedAt: now,
    inventory: normalizeInventory(options.packs || []),
    sbcRewards: normalizeSbcRewards(options.sbcIndexes || [], options.previousCatalog),
    loopRewards: {},
    diagnostics: [],
  };
  return bindPackCatalogLoops(catalog, options.loopDefs || [], now);
}

export function updatePackCatalogInventory(catalog = {}, packs = [], now = Date.now()) {
  return {
    ...catalog,
    updatedAt: Number(now) || Date.now(),
    inventory: normalizeInventory(packs),
  };
}

export function resolveSourcePackIdentity(options = {}) {
  const sourcePackRef = isPlainObject(options.sourcePackRef) ? options.sourcePackRef : {};
  const rewardOfLoopId = cleanName(sourcePackRef.rewardOfLoopId);
  const dynamic = rewardOfLoopId ? options.catalog?.loopRewards?.[rewardOfLoopId] : null;
  const dynamicPackIds = unique(dynamic?.packIds || [], positiveInteger);
  const dynamicPackNames = unique(dynamic?.packNames || [], cleanName);
  const staticPackIds = unique(options.sourcePackIds || [], positiveInteger);
  const staticPackNames = unique(options.sourcePackNames || [], cleanName);
  const producedPackIds = unique([
    ...(options.producedRewardPackIds || []),
    ...(options.rewardPackIds || []),
  ], positiveInteger);
  const producedPackNames = unique([
    ...(options.producedRewardPackNames || []),
    ...(options.rewardPackNames || []),
  ], cleanName);
  const excludedIds = new Set(producedPackIds.map((value) => String(value)));
  const excludedNames = new Set(producedPackNames.map(normalizedName).filter(Boolean));
  const allCandidates = [
    ...dynamicPackIds.map((value) => ({ type: 'id', value, source: 'catalog' })),
    ...dynamicPackNames.map((value) => ({ type: 'name', value, source: 'catalog' })),
    ...staticPackIds.map((value) => ({ type: 'id', value, source: 'fallback' })),
    ...staticPackNames.map((value) => ({ type: 'name', value, source: 'fallback' })),
  ];
  const sourceOutputOverlap = allCandidates.filter((candidate) => (
    candidate.type === 'id'
      ? excludedIds.has(String(candidate.value))
      : excludedNames.has(normalizedName(candidate.value))
  ));
  const candidates = allCandidates.filter((candidate) => !sourceOutputOverlap.includes(candidate));
  const availableDynamicPackIds = dynamicPackIds.filter((value) => !excludedIds.has(String(value)));
  const availableDynamicPackNames = dynamicPackNames.filter((value) => !excludedNames.has(normalizedName(value)));
  const availableStaticPackIds = staticPackIds.filter((value) => !excludedIds.has(String(value)));
  const availableStaticPackNames = staticPackNames.filter((value) => !excludedNames.has(normalizedName(value)));
  return {
    rewardOfLoopId: rewardOfLoopId || null,
    dynamicResolved: availableDynamicPackIds.length > 0 || availableDynamicPackNames.length > 0,
    dynamicPackIds: availableDynamicPackIds,
    dynamicPackNames: availableDynamicPackNames,
    staticPackIds: availableStaticPackIds,
    staticPackNames: availableStaticPackNames,
    producedPackIds,
    producedPackNames,
    sourceOutputOverlap,
    packIds: unique([...availableDynamicPackIds, ...availableStaticPackIds], positiveInteger),
    packNames: unique([...availableDynamicPackNames, ...availableStaticPackNames], cleanName),
    candidates,
  };
}

export function recordObservedSbcReward(catalog = {}, observation = {}, now = Date.now()) {
  const setId = positiveInteger(observation.setId);
  const setName = cleanName(observation.setName);
  const key = setId ? `id:${setId}` : setName ? `name:${normalizedName(setName)}` : '';
  if (!key) return catalog;
  const packId = positiveInteger(observation.packId);
  const packName = cleanName(observation.packName);
  if (!packId && !packName) return catalog;

  const entries = new Map((catalog.sbcRewards || []).map((entry) => [sbcRewardKey(entry), { ...entry }]));
  const current = entries.get(key) || {
    setId,
    setName,
    packIds: [],
    packNames: [],
    observedPackIds: [],
    observedPackNames: [],
  };
  current.setId ||= setId;
  current.setName ||= setName;
  current.observedPackIds = unique([packId, ...(current.observedPackIds || [])], positiveInteger);
  current.observedPackNames = unique([packName, ...(current.observedPackNames || [])], cleanName);
  current.packIds = unique([...current.observedPackIds, ...(current.packIds || [])], positiveInteger);
  current.packNames = unique([...current.observedPackNames, ...(current.packNames || [])], cleanName);
  entries.set(key, current);
  return {
    ...catalog,
    updatedAt: Number(now) || Date.now(),
    sbcRewards: [...entries.values()],
  };
}
