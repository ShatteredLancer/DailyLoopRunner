import { cloneLoopDef } from '../domain/objects.js';
import { readEligibilityRequirements } from '../selection/rating-model.js';

const SUPPORTED_PLAYER_KEYS = new Set([
  'PLAYER_QUALITY',
  'PLAYER_LEVEL',
  'PLAYER_RARITY',
  'PLAYER_RARITY_GROUP',
  'PLAYER_MIN_OVR',
  'PLAYER_EXACT_OVR',
]);
const UNSUPPORTED_TEAM_KEYS = new Set(['CHEMISTRY_POINTS', 'ALL_PLAYERS_CHEMISTRY_POINTS']);

function clone(value) {
  return cloneLoopDef(value);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizedText(value) {
  return String(value ?? '').trim();
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

function remainingCompletions(set = {}) {
  if (set.timesCompleted === null || set.timesCompleted === undefined
    || set.repeats === null || set.repeats === undefined) return null;
  const completed = Number(set.timesCompleted);
  const repeats = Number(set.repeats);
  if (!Number.isFinite(completed) || !Number.isFinite(repeats) || repeats <= 0 || repeats < completed) return null;
  return Math.max(0, Math.floor(repeats - completed));
}

export function detectDynamicUpgradeFamily(set = {}) {
  const text = `${normalizedText(set.name)} ${(set.rewards || []).map((reward) => `${reward.name || ''} ${reward.description || ''}`).join(' ')}`;
  if (/\b84\+\s*TOTW\b.*\bUpgrade\b|\bTOTW\b.*\bUpgrade\b/i.test(text)) {
    return { id: 'totw-upgrade', rewardCount: 1, rewardMinRating: 84 };
  }
  const prefix = /\b10\s*x\s*(\d{2})\+(?:\s*Players?)?\s*Upgrade\b/i.exec(text);
  const suffix = /\b(\d{2})\+\s*x\s*10(?:\s*Players?)?(?:\s*Upgrade)?\b/i.exec(text);
  const rating = positiveInteger(prefix?.[1] || suffix?.[1]);
  if (rating && rating >= 84 && rating <= 99) {
    return { id: 'high-rated-x10', rewardCount: 10, rewardMinRating: rating };
  }
  return null;
}

function requirementSummary(entry = {}) {
  return `${entry.keyName || '?'}(count:${entry.count || '?'}, values:${entry.values?.join('/') || '?'})`;
}

function parseUpgradeChallenge(challenge, family) {
  const requiredPlayerCount = positiveInteger(challenge?.requiredPlayerCount);
  const diagnostics = [];
  if (!requiredPlayerCount) diagnostics.push('required player count is missing or invalid');
  const entries = readEligibilityRequirements(challenge, {
    requiredPlayerCount: requiredPlayerCount || 0,
    eligibilityKeyName: (key) => String(key || ''),
  });
  const teamRatings = [];
  let specialCount = 0;

  for (const entry of entries) {
    if (!entry.values.length || !entry.count) {
      diagnostics.push(`incomplete eligibility condition ${requirementSummary(entry)}`);
      continue;
    }
    if (entry.keyName === 'TEAM_RATING') {
      const ratings = entry.values.map(Number).filter(Number.isFinite);
      if (ratings.length !== 1) diagnostics.push(`ambiguous TEAM_RATING condition ${requirementSummary(entry)}`);
      else teamRatings.push(ratings[0]);
      continue;
    }
    if (UNSUPPORTED_TEAM_KEYS.has(entry.keyName)) {
      diagnostics.push(`unsupported chemistry condition ${requirementSummary(entry)}`);
      continue;
    }
    if (!SUPPORTED_PLAYER_KEYS.has(entry.keyName)) {
      diagnostics.push(`unsupported eligibility condition ${requirementSummary(entry)}`);
      continue;
    }
    if (entry.keyName === 'PLAYER_RARITY_GROUP') {
      const values = entry.values.map(Number).filter(Number.isFinite);
      const unknown = values.filter((value) => ![4, 83].includes(value));
      if (unknown.length) diagnostics.push(`unknown PLAYER_RARITY_GROUP encoding ${unknown.join('/')}`);
      if (values.includes(83)) specialCount = Math.max(specialCount, entry.count);
    }
  }

  if (teamRatings.length !== 1) diagnostics.push('exactly one TEAM_RATING condition is required');
  if (family.id === 'high-rated-x10' && specialCount > 1) {
    diagnostics.push(`more than one required special card is unsupported (${specialCount})`);
  }
  if (family.id === 'totw-upgrade' && specialCount) {
    diagnostics.push('TOTW Upgrade unexpectedly requires a special card');
  }
  return {
    ok: diagnostics.length === 0,
    diagnostics: unique(diagnostics),
    requiredPlayerCount,
    targetRating: teamRatings[0] || null,
    specialCount,
  };
}

function rewardPackIdentity(set = {}) {
  const packs = (set.rewards || []).filter((reward) => String(reward?.type || '').toUpperCase() === 'PACK');
  return {
    packs,
    ids: unique(packs.map((reward) => positiveInteger(reward.packId || reward.resourceId || reward.definitionId)).filter(Boolean)),
    names: unique(packs.map((reward) => normalizedText(reward.name || reward.description)).filter(Boolean)),
  };
}

function runtimeQuantityForRemaining(remaining) {
  const max = remaining === null ? 50 : Math.max(1, Math.min(50, remaining));
  return {
    mode: 'user',
    target: 'maxCompletions',
    default: Math.min(3, max),
    min: 1,
    max,
    label: 'SBC completions',
  };
}

export function parseDynamicUpgradeSbcSnapshot(input = {}) {
  const set = input.set || {};
  const setId = positiveInteger(set.id);
  const setName = normalizedText(set.name);
  const family = detectDynamicUpgradeFamily(set);
  const diagnostics = [];
  if (!setId) diagnostics.push('stable SBC Set id is missing');
  if (!setName) diagnostics.push('SBC Set display name is missing');
  if (set.inUpgradesCategory !== true) diagnostics.push('SBC Set is not confirmed in the Upgrades category');
  if (!family) return { status: 'ignored', setId, diagnostics: ['SBC Set is not an allowed dynamic Upgrade family'] };

  const rewards = rewardPackIdentity(set);
  if (rewards.packs.length !== 1) diagnostics.push(`exactly one Pack reward is required; found ${rewards.packs.length}`);
  if (!rewards.ids.length && !rewards.names.length) diagnostics.push('stable Pack reward identity is missing');

  const challenges = Array.isArray(set.challenges) ? set.challenges : [];
  if (challenges.length !== 1) diagnostics.push(`exactly one Challenge is required; found ${challenges.length}`);
  const parsedChallenge = challenges.length === 1
    ? parseUpgradeChallenge(challenges[0], family)
    : { ok: false, diagnostics: [], requiredPlayerCount: null, targetRating: null, specialCount: 0 };
  diagnostics.push(...parsedChallenge.diagnostics);

  const remaining = remainingCompletions(set);
  if (remaining === 0) {
    return {
      status: 'completed',
      setId,
      family,
      remainingCompletions: 0,
      diagnostics: unique(diagnostics),
    };
  }
  if (diagnostics.length) {
    return {
      status: 'unsupported',
      setId,
      family,
      remainingCompletions: remaining,
      diagnostics: unique(diagnostics),
    };
  }

  const template = family.id === 'totw-upgrade' ? input.totwTemplate : input.x10Template;
  if (!template) {
    return { status: 'unsupported', setId, family, diagnostics: ['safe built-in Upgrade template is unavailable'] };
  }
  const loop = {
    ...clone(template),
    id: `discovered-upgrade-${setId}-${family.id}-${family.rewardMinRating}`,
    name: setName,
    discovered: true,
    discoveryKind: 'upgrade',
    dynamicSbcFamily: family.id,
    dynamicRewardMinRating: family.rewardMinRating,
    sbcSetIds: [setId],
    sbcNames: [setName],
    rewardPackIds: rewards.ids,
    rewardPackNames: rewards.names,
    remainingCompletions: remaining,
    scannedMetadata: true,
    ratingSbcFill: {
      ...(clone(template.ratingSbcFill) || {}),
      targetRating: parsedChallenge.targetRating,
    },
    expectedPlayerCount: parsedChallenge.requiredPlayerCount,
  };
  if (family.id === 'high-rated-x10') {
    loop.requiredSpecialCount = parsedChallenge.specialCount;
    loop.allowedSpecialCount = parsedChallenge.specialCount;
    if (!parsedChallenge.specialCount) {
      delete loop.requiredSpecialKind;
      delete loop.requiredSpecialMinRating;
      loop.autoTotwUpgrade = false;
    }
  }
  if (remaining !== null) loop.maxCompletions = Math.max(1, Math.min(50, remaining));
  else loop.maxCompletions = 50;
  loop.allowMultipleCompletions = true;
  loop.useRoundsAsCompletions = true;
  loop.runtimeQuantity = runtimeQuantityForRemaining(remaining);
  return {
    status: 'supported',
    setId,
    family,
    loop,
    remainingCompletions: remaining,
    targetRating: parsedChallenge.targetRating,
    requiredPlayerCount: parsedChallenge.requiredPlayerCount,
    specialCount: parsedChallenge.specialCount,
    diagnostics: [],
  };
}

function configuredUpgradeMatches(result, loop = {}) {
  if (loop.strategy !== 'fillAndVerifySbc') return false;
  if ((loop.sbcSetIds || []).map(Number).includes(Number(result.setId))) return true;
  if (result.family?.id === 'totw-upgrade') return loop.id === 'auto-totw-upgrade';
  if (result.family?.id === 'high-rated-x10' && Number(result.family.rewardMinRating) === 84) {
    return ['84x10', '84x10-mvp'].includes(String(loop.id));
  }
  return false;
}

export function mergeScannedUpgradeMetadata(configuredLoop, discoveredLoop) {
  const merged = {
    ...clone(configuredLoop),
    sbcSetIds: [...(discoveredLoop.sbcSetIds || [])],
    sbcNames: unique([...(discoveredLoop.sbcNames || []), ...(configuredLoop.sbcNames || [])]),
    rewardPackIds: unique([...(discoveredLoop.rewardPackIds || []), ...(configuredLoop.rewardPackIds || [])]),
    rewardPackNames: unique([...(discoveredLoop.rewardPackNames || []), ...(configuredLoop.rewardPackNames || [])]),
    remainingCompletions: discoveredLoop.remainingCompletions,
    dynamicSbcFamily: discoveredLoop.dynamicSbcFamily,
    dynamicRewardMinRating: discoveredLoop.dynamicRewardMinRating,
    expectedPlayerCount: discoveredLoop.expectedPlayerCount,
    requiredSpecialCount: discoveredLoop.requiredSpecialCount,
    allowedSpecialCount: discoveredLoop.allowedSpecialCount,
    ratingSbcFill: {
      ...(clone(configuredLoop.ratingSbcFill) || {}),
      targetRating: discoveredLoop.ratingSbcFill?.targetRating,
    },
    scannedMetadata: true,
  };
  if (discoveredLoop.requiredSpecialCount) {
    merged.requiredSpecialKind = discoveredLoop.requiredSpecialKind || configuredLoop.requiredSpecialKind;
    merged.requiredSpecialMinRating = discoveredLoop.requiredSpecialMinRating || configuredLoop.requiredSpecialMinRating;
  } else {
    delete merged.requiredSpecialKind;
    delete merged.requiredSpecialMinRating;
    delete merged.specialRequirementAdd;
    merged.autoTotwUpgrade = false;
  }
  return merged;
}

export function buildUpgradeDiscoverySession(input = {}) {
  const configuredLoops = [...(input.configuredLoops || [])];
  const discoveredLoops = [];
  const loopOverrides = {};
  const results = [];
  for (const set of input.sets || []) {
    const parsed = parseDynamicUpgradeSbcSnapshot({
      set,
      x10Template: input.x10Template,
      totwTemplate: input.totwTemplate,
    });
    if (parsed.status !== 'supported') {
      results.push(parsed);
      continue;
    }
    const matches = configuredLoops.filter((loop) => configuredUpgradeMatches(parsed, loop));
    if (matches.length) {
      matches.forEach((loop) => {
        loopOverrides[loop.id] = mergeScannedUpgradeMetadata(loop, parsed.loop);
      });
      results.push({ ...parsed, status: 'duplicate', discoveredLoop: parsed.loop, matchingLoopIds: matches.map((loop) => loop.id) });
      continue;
    }
    const duplicate = discoveredLoops.some((loop) => (loop.sbcSetIds || []).includes(parsed.setId));
    if (duplicate) {
      results.push({ ...parsed, status: 'duplicate', discoveredLoop: parsed.loop, matchingLoopIds: [] });
      continue;
    }
    discoveredLoops.push(parsed.loop);
    results.push(parsed);
  }
  return { discoveredLoops, loopOverrides, results };
}

export function collectScannedUpgradeLoopDefs(results = []) {
  const loops = [];
  const seen = new Set();
  for (const result of results || []) {
    const loop = result?.discoveredLoop || result?.loop;
    const id = normalizedText(loop?.id);
    if (!loop || !id || seen.has(id)) continue;
    seen.add(id);
    loops.push(loop);
  }
  return loops;
}

export function collectScannedUpgradeActivities(results = []) {
  const activities = [];
  const seen = new Set();
  for (const result of results || []) {
    const loop = result?.discoveredLoop || result?.loop;
    const familyId = normalizedText(loop?.dynamicSbcFamily);
    const setId = positiveInteger(loop?.sbcSetIds?.[0]);
    if (!loop || !familyId || !setId) continue;
    const key = `${familyId}:${setId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    activities.push({
      familyId,
      setId,
      setName: normalizedText(loop.sbcNames?.[0] || loop.name),
      rewardPackIds: [...(loop.rewardPackIds || [])],
      rewardPackNames: [...(loop.rewardPackNames || [])],
      remainingCompletions: loop.remainingCompletions ?? null,
      requirements: [],
    });
  }
  return activities;
}
