import { cloneLoopDef } from '../domain/objects.js';
import { readEligibilityRequirements } from '../selection/rating-model.js';
import {
  classifyMaterialSinkCandidate,
  MATERIAL_SINK_BASELINES,
  MATERIAL_SINK_FAMILIES,
  parseMaterialSinkReward,
  selectMaterialSinkCandidate,
} from './material-sink.js';

const SUPPORTED_REQUIREMENT_KEYS = new Set([
  'PLAYER_QUALITY',
  'PLAYER_LEVEL',
  'PLAYER_RARITY',
  'PLAYER_RARITY_GROUP',
]);

const FAMILY_DEFS = Object.freeze([
  Object.freeze({ id: 'daily-bronze-upgrade', requirements: [{ tier: 'bronze', count: 1 }] }),
  Object.freeze({ id: 'daily-silver-upgrade', requirements: [{ tier: 'silver', count: 1 }] }),
  Object.freeze({
    id: 'daily-common-gold-upgrade',
    requirements: [{ tier: 'bronze', count: 5 }, { tier: 'silver', count: 5 }],
  }),
  Object.freeze({
    id: 'daily-rare-gold-upgrade',
    requirements: [{ tier: 'gold', rarity: 'common', count: 5 }],
  }),
  Object.freeze({ id: 'bronze-upgrade', requirements: [{ tier: 'bronze', count: 11 }] }),
  Object.freeze({ id: 'silver-upgrade', requirements: [{ tier: 'silver', count: 11 }] }),
  Object.freeze({
    id: 'gold-upgrade',
    requirements: [{ tier: 'gold', rarity: 'common', count: 11 }],
  }),
  Object.freeze({
    id: 'common-gold-crafting-upgrade',
    requirements: [{ tier: 'gold', rarity: 'common', count: 9 }],
    identityPattern: /\b5\s*x\s*80\+|\b5\s+80\+/i,
  }),
  Object.freeze({
    id: '2x84-upgrade',
    requirements: [{ tier: 'gold', rarity: 'rare', count: 6 }],
    identityPattern: /\b2\s*x\s*84\+|\b2\s+84\+/i,
  }),
]);

export const SBC_ACTIVITY_FAMILIES = FAMILY_DEFS;
export const SBC_ACTIVITY_FAMILY_IDS = Object.freeze([
  ...FAMILY_DEFS.map((family) => family.id),
  ...Object.values(MATERIAL_SINK_FAMILIES),
  'totw-upgrade',
  'high-rated-x10',
  'high-rated-pack-upgrade',
]);

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

export function collectActivityBindingSbcNames(values = []) {
  const names = new Set();
  const visited = new WeakSet();
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);
    if (value.activityBinding?.family && Array.isArray(value.sbcNames)) {
      value.sbcNames.forEach((name) => {
        const normalized = normalizedText(name).toLowerCase();
        if (normalized) names.add(normalized);
      });
    }
    Object.values(value).forEach(visit);
  };
  visit(values);
  return [...names];
}

function canonicalTier(value) {
  const text = normalizedText(value).toUpperCase();
  if (['BRONZE', 'QUALITY_BRONZE', 'LEVEL_BRONZE', '1'].includes(text)) return 'bronze';
  if (['SILVER', 'QUALITY_SILVER', 'LEVEL_SILVER', '2'].includes(text)) return 'silver';
  if (['GOLD', 'QUALITY_GOLD', 'LEVEL_GOLD', '3'].includes(text)) return 'gold';
  return null;
}

function canonicalRarity(value, keyName) {
  const text = normalizedText(value).toUpperCase();
  if (keyName === 'PLAYER_RARITY_GROUP') {
    return ['4', 'RARE'].includes(text) ? 'rare' : null;
  }
  if (['0', 'COMMON', 'NORMAL', 'NON_RARE', 'NONRARE'].includes(text)) return 'common';
  if (['1', 'RARE'].includes(text)) return 'rare';
  return null;
}

function requirementKey(requirement = {}) {
  return `${requirement.tier}:${requirement.rarity || '*'}:${Number(requirement.count || 0)}`;
}

function normalizedRequirements(requirements = []) {
  return [...requirements]
    .map((requirement) => ({
      tier: requirement.tier,
      ...(requirement.rarity ? { rarity: requirement.rarity } : {}),
      count: Number(requirement.count || 0),
    }))
    .sort((left, right) => requirementKey(left).localeCompare(requirementKey(right)));
}

function requirementsEqual(left = [], right = []) {
  const a = normalizedRequirements(left);
  const b = normalizedRequirements(right);
  return a.length === b.length && a.every((entry, index) => requirementKey(entry) === requirementKey(b[index]));
}

function requirementSummary(entry = {}) {
  return `${entry.keyName || '?'}(count:${entry.count || '?'}, values:${entry.values?.join('/') || '?'})`;
}

export function parseBasicUpgradeChallenge(challenge = {}) {
  const requiredPlayerCount = positiveInteger(challenge.requiredPlayerCount);
  const diagnostics = [];
  if (!requiredPlayerCount) {
    return { ok: false, diagnostics: ['required player count is missing or invalid'] };
  }

  const entries = readEligibilityRequirements(challenge, {
    requiredPlayerCount,
    eligibilityKeyName: (key) => String(key || ''),
  });
  const qualityEntries = [];
  const rarityEntries = [];
  if (!entries.length) diagnostics.push('eligibility requirements are missing');

  for (const entry of entries) {
    if (!SUPPORTED_REQUIREMENT_KEYS.has(entry.keyName)) {
      diagnostics.push(`unsupported eligibility condition ${requirementSummary(entry)}`);
      continue;
    }
    if (!entry.values.length || !entry.count) {
      diagnostics.push(`incomplete eligibility condition ${requirementSummary(entry)}`);
      continue;
    }
    if (entry.values.length !== 1) {
      diagnostics.push(`ambiguous eligibility condition ${requirementSummary(entry)}`);
      continue;
    }
    if (entry.keyName === 'PLAYER_RARITY' || entry.keyName === 'PLAYER_RARITY_GROUP') {
      const rarity = canonicalRarity(entry.values[0], entry.keyName);
      if (!rarity) diagnostics.push(`unknown ${entry.keyName} encoding ${entry.values[0]}`);
      else rarityEntries.push({ rarity, count: entry.count });
      continue;
    }
    const tier = canonicalTier(entry.values[0]);
    if (!tier) diagnostics.push(`unknown ${entry.keyName} encoding ${entry.values[0]}`);
    else qualityEntries.push({ tier, count: entry.count });
  }

  if (!qualityEntries.length) diagnostics.push('at least one player quality condition is required');
  const qualityCount = qualityEntries.reduce((total, entry) => total + entry.count, 0);
  if (qualityCount !== requiredPlayerCount) {
    diagnostics.push(`quality conditions cover ${qualityCount}/${requiredPlayerCount} players`);
  }
  if (new Set(qualityEntries.map((entry) => entry.tier)).size !== qualityEntries.length) {
    diagnostics.push('duplicate player quality conditions are unsupported');
  }

  if (rarityEntries.length > 1) diagnostics.push('multiple rarity conditions are unsupported');
  if (rarityEntries.length && qualityEntries.length !== 1) {
    diagnostics.push('rarity conditions with mixed player qualities are unsupported');
  }
  if (rarityEntries.length && rarityEntries[0].count !== requiredPlayerCount) {
    diagnostics.push(`rarity condition covers ${rarityEntries[0].count}/${requiredPlayerCount} players`);
  }
  if (diagnostics.length) return { ok: false, diagnostics: unique(diagnostics) };

  const rarity = rarityEntries[0]?.rarity || null;
  const requirements = qualityEntries.map((entry) => ({
    tier: entry.tier,
    ...(rarity ? { rarity } : {}),
    count: entry.count,
  }));
  return { ok: true, requiredPlayerCount, requirements: normalizedRequirements(requirements), diagnostics: [] };
}

function rewardPackIdentity(set = {}) {
  const packs = (set.rewards || []).filter((reward) => normalizedText(reward?.type).toUpperCase() === 'PACK');
  return {
    packs,
    ids: unique(packs.map((reward) => positiveInteger(reward.packId || reward.resourceId || reward.definitionId)).filter(Boolean)),
    names: unique(packs.flatMap((reward) => [normalizedText(reward.name), normalizedText(reward.description)]).filter(Boolean)),
  };
}

function remainingCompletions(set = {}) {
  if (set.timesCompleted === null || set.timesCompleted === undefined
    || set.repeats === null || set.repeats === undefined) return null;
  const completed = Number(set.timesCompleted);
  const repeats = Number(set.repeats);
  if (!Number.isFinite(completed) || !Number.isFinite(repeats) || repeats <= 0 || repeats < completed) return null;
  return Math.max(0, Math.floor(repeats - completed));
}

function activityIdentityText(set, rewards) {
  return [
    normalizedText(set.name),
    ...rewards.names,
  ].join(' ');
}

function materialSinkFamily(requirements = []) {
  if (requirements.length !== 1 || requirements[0].tier !== 'gold') return null;
  if (requirements[0].rarity === 'rare') return MATERIAL_SINK_FAMILIES.rareGold;
  return MATERIAL_SINK_FAMILIES.commonGold;
}

function materialSinkSelectionRequirements(requirements = [], familyId) {
  if (familyId !== MATERIAL_SINK_FAMILIES.commonGold) return requirements;
  return requirements.map((requirement) => (
    requirement.tier === 'gold' && !requirement.rarity
      ? { ...requirement, rarity: 'common' }
      : requirement
  ));
}

function createActivity({ familyId, setId, setName, requirements, rewards, remaining, challenges, materialSink = null }) {
  return {
    familyId,
    setId,
    setName,
    requirements,
    rewardPackIds: rewards.ids,
    rewardPackNames: rewards.names,
    remainingCompletions: remaining,
    challengeIds: challenges.map((challenge) => positiveInteger(challenge.id)).filter(Boolean),
    ...(materialSink ? { materialSink } : {}),
  };
}

export function parseBasicUpgradeActivitySnapshot(input = {}) {
  const set = input.set || {};
  const setId = positiveInteger(set.id);
  const setName = normalizedText(set.name);
  if (set.inUpgradesCategory !== true) {
    return { status: 'ignored', setId, diagnostics: ['SBC Set is not confirmed in the Upgrades category'] };
  }

  const diagnostics = [];
  if (!setId) diagnostics.push('stable SBC Set id is missing');
  if (!setName) diagnostics.push('SBC Set display name is missing');
  const challenges = Array.isArray(set.challenges) ? set.challenges : [];
  if (challenges.length !== 1) diagnostics.push(`exactly one Challenge is required; found ${challenges.length}`);
  const parsedChallenge = challenges.length === 1
    ? parseBasicUpgradeChallenge(challenges[0])
    : { ok: false, diagnostics: [] };
  diagnostics.push(...(parsedChallenge.diagnostics || []));

  const rewards = rewardPackIdentity(set);
  if (rewards.packs.length !== 1) diagnostics.push(`exactly one Pack reward is required; found ${rewards.packs.length}`);
  if (!rewards.ids.length && !rewards.names.length) diagnostics.push('stable Pack reward identity is missing');
  if (diagnostics.length) return { status: 'unsupported', setId, diagnostics: unique(diagnostics) };

  const identityText = activityIdentityText(set, rewards);
  const sinkFamilyId = materialSinkFamily(parsedChallenge.requirements);
  const sinkRequirements = materialSinkSelectionRequirements(parsedChallenge.requirements, sinkFamilyId);
  const family = FAMILY_DEFS.find((candidate) => (
    (requirementsEqual(candidate.requirements, parsedChallenge.requirements)
      || requirementsEqual(candidate.requirements, sinkRequirements))
      && (!candidate.identityPattern || candidate.identityPattern.test(identityText))
  ));
  const sinkBaseline = MATERIAL_SINK_BASELINES[sinkFamilyId];
  const sinkReward = sinkFamilyId
    ? parseMaterialSinkReward(rewards.packs[0], { fallbackText: setName, fallbackRarity: 'rare' })
    : null;
  const sinkClassification = sinkBaseline && sinkReward
    ? classifyMaterialSinkCandidate({
      familyId: sinkFamilyId,
      cost: parsedChallenge.requiredPlayerCount,
      reward: sinkReward,
    })
    : null;
  if (!family && !sinkClassification) {
    return {
      status: 'ignored',
      setId,
      diagnostics: [`no supported basic Upgrade family matches ${parsedChallenge.requirements.map(requirementKey).join(', ')}`],
    };
  }

  const remaining = remainingCompletions(set);
  if (remaining === 0) {
    return {
      status: 'completed',
      setId,
      familyId: family?.id || sinkFamilyId,
      remainingCompletions: 0,
      diagnostics: [],
    };
  }
  const activities = [];
  if (family) {
    activities.push(createActivity({
      familyId: family.id,
      setId,
      setName,
      requirements: parsedChallenge.requirements,
      rewards,
      remaining,
      challenges,
    }));
  }
  if (sinkClassification) {
    activities.push(createActivity({
      familyId: sinkFamilyId,
      setId,
      setName,
      requirements: sinkRequirements,
      rewards,
      remaining,
      challenges,
      materialSink: {
        material: sinkBaseline.material,
        className: sinkClassification.className,
        relation: sinkClassification.relation,
        cost: parsedChallenge.requiredPlayerCount,
        reward: sinkReward,
      },
    }));
  }
  const primaryActivity = activities[0];
  return {
    status: 'supported',
    setId,
    familyId: primaryActivity.familyId,
    activity: primaryActivity,
    activities,
    diagnostics: [],
  };
}

function requirementPolicyMatch(requirement, configured = []) {
  return configured.find((candidate) => (
    candidate?.tier === requirement.tier
      && (candidate?.rarity || null) === (requirement.rarity || null)
  )) || null;
}

function mergeRequirements(scanned = [], configured = []) {
  const remaining = [...scanned];
  const merged = [];
  for (const configuredRequirement of configured) {
    const index = remaining.findIndex((requirement) => (
      requirement.tier === configuredRequirement?.tier
        && (requirement.rarity || null) === (configuredRequirement?.rarity || null)
    ));
    if (index < 0) continue;
    const [requirement] = remaining.splice(index, 1);
    merged.push({ ...clone(configuredRequirement), ...clone(requirement) });
  }
  return [
    ...merged,
    ...remaining.map((requirement) => ({
      ...(clone(requirementPolicyMatch(requirement, configured) || {})),
      ...clone(requirement),
    })),
  ];
}

export function mergeScannedActivityMetadata(target = {}, activity = {}) {
  const merged = {
    ...clone(target),
    ...(activity.materialSink ? { name: activity.setName } : {}),
    sbcSetIds: unique([activity.setId, ...(target.sbcSetIds || [])].map(positiveInteger).filter(Boolean)),
    sbcNames: unique([activity.setName, ...(target.sbcNames || [])].map(normalizedText).filter(Boolean)),
    rewardPackIds: unique([...(activity.rewardPackIds || []), ...(target.rewardPackIds || [])].map(positiveInteger).filter(Boolean)),
    rewardPackNames: unique([...(activity.rewardPackNames || []), ...(target.rewardPackNames || [])].map(normalizedText).filter(Boolean)),
    remainingCompletions: activity.remainingCompletions,
    dynamicSbcFamily: activity.familyId,
    scannedMetadata: true,
    activityResolved: true,
    ...(activity.materialSink ? {
      materialSinkClass: activity.materialSink.className,
      materialSinkCost: activity.materialSink.cost,
      materialSinkReward: clone(activity.materialSink.reward),
    } : {}),
  };
  if (Array.isArray(target.requirements)) {
    merged.requirements = mergeRequirements(activity.requirements, target.requirements);
  }
  return merged;
}

function materializeBoundTarget(target, activitiesByFamily, diagnostics, path) {
  if (!target?.activityBinding?.family) return clone(target);
  const family = target.activityBinding.family;
  const matches = activitiesByFamily.get(family) || [];
  if (MATERIAL_SINK_BASELINES[family]) {
    const resolution = selectMaterialSinkCandidate(matches, target.activityBinding);
    if (resolution.status === 'resolved') {
      return mergeScannedActivityMetadata(target, resolution.candidate);
    }
    if (resolution.status === 'ambiguous') {
      diagnostics.push(`${path}: activity family ${family} is ambiguous (${resolution.matches.map((entry) => `#${entry.setId} ${entry.setName}`).join(', ')})`);
    } else {
      diagnostics.push(`${path}: activity family ${family} has no candidate in classes ${(target.activityBinding.classes || ['premium', 'baseline']).join('/')}; ${target.activityBinding.required === true ? 'runtime preflight will block this consumer' : 'compatibility fallback remains active'}`);
    }
    return clone(target);
  }
  if (matches.length === 1) return mergeScannedActivityMetadata(target, matches[0]);
  if (matches.length > 1) {
    diagnostics.push(`${path}: activity family ${family} is ambiguous (${matches.map((entry) => `#${entry.setId} ${entry.setName}`).join(', ')})`);
  } else {
    diagnostics.push(`${path}: activity family ${family} is unavailable; compatibility fallback remains active`);
  }
  return clone(target);
}

function materializeLoop(loop, activitiesByFamily, diagnostics) {
  let result = materializeBoundTarget(loop, activitiesByFamily, diagnostics, `Loop ${loop.id || loop.name || '?'}`);
  for (const field of ['stages', 'craftingUpgrades']) {
    if (!Array.isArray(result[field])) continue;
    result[field] = result[field].map((entry, index) => materializeBoundTarget(
      entry,
      activitiesByFamily,
      diagnostics,
      `Loop ${loop.id || loop.name || '?'}.${field}[${index}]`,
    ));
  }
  for (const field of ['commonUpgrade', 'rareUpgrade', 'autoTotwUpgrade', 'autoFodderUpgrade']) {
    if (!result[field] || typeof result[field] !== 'object') continue;
    result[field] = materializeBoundTarget(
      result[field],
      activitiesByFamily,
      diagnostics,
      `Loop ${loop.id || loop.name || '?'}.${field}`,
    );
  }
  return result;
}

function containsResolvedActivity(value, familyId, setId) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => containsResolvedActivity(entry, familyId, setId));
  if (value.dynamicSbcFamily === familyId
    && value.activityResolved === true
    && (value.sbcSetIds || []).map(Number).includes(Number(setId))) return true;
  return Object.values(value).some((entry) => containsResolvedActivity(entry, familyId, setId));
}

function activityConsumers(activity, loopOverrides, recoveryRecipeOverrides) {
  return unique([
    ...Object.values(loopOverrides)
      .filter((loop) => containsResolvedActivity(loop, activity.familyId, activity.setId))
      .map((loop) => `Loop:${loop.id}`),
    ...Object.values(recoveryRecipeOverrides)
      .filter((recipe) => containsResolvedActivity(recipe, activity.familyId, activity.setId))
      .map((recipe) => `Recovery:${recipe.id}`),
  ]);
}

export function buildActivityBindingSession(input = {}) {
  const results = (input.sets || []).map((set) => parseBasicUpgradeActivitySnapshot({ set }));
  const activitiesByFamily = new Map();
  const activities = [
    ...results
      .filter((result) => result.status === 'supported')
      .flatMap((result) => result.activities || (result.activity ? [result.activity] : [])),
    ...(input.additionalActivities || []),
  ];
  const seenActivities = new Set();
  for (const activity of activities) {
    if (!activity?.familyId || !activity?.setId) continue;
    const family = activity.familyId;
    const key = `${family}:${activity.setId}`;
    if (seenActivities.has(key)) continue;
    seenActivities.add(key);
    activitiesByFamily.set(family, [...(activitiesByFamily.get(family) || []), clone(activity)]);
  }

  const diagnostics = [];
  const loopOverrides = {};
  for (const loop of input.configuredLoops || []) {
    const materialized = materializeLoop(loop, activitiesByFamily, diagnostics);
    if (JSON.stringify(materialized) !== JSON.stringify(loop)) loopOverrides[loop.id] = materialized;
  }

  const recoveryRecipeOverrides = {};
  for (const recipe of input.recoveryRecipes || []) {
    const materialized = materializeBoundTarget(
      recipe,
      activitiesByFamily,
      diagnostics,
      `Recovery ${recipe.id || recipe.name || '?'}`,
    );
    if (JSON.stringify(materialized) !== JSON.stringify(recipe)) recoveryRecipeOverrides[recipe.id] = materialized;
  }

  return {
    loopOverrides,
    recoveryRecipeOverrides,
    results,
    diagnostics: unique(diagnostics),
    activities: [...activitiesByFamily.values()].flat().map((activity) => ({
      ...clone(activity),
      consumers: activityConsumers(activity, loopOverrides, recoveryRecipeOverrides),
    })),
  };
}
