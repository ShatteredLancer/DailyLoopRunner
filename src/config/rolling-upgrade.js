import { cloneLoopDef, isPlainObject } from '../domain/objects.js';
import {
  createProvisionsUpgradePolicy,
  createTotwUpgradePolicy,
} from './upgrade-policies.js';
import { readPlayerPickRewardCounts } from './player-pick-discovery.js';

const ALL_INVENTORY_PILES = Object.freeze(['unassigned', 'storage', 'transfer', 'club']);

export const ROLLING_UPGRADE_STRATEGY = 'rollingUpgrade';

export function resolveRollingAutomaticUseMaxRating(loopDef = {}) {
  return Math.max(1, Math.min(99, Number(
    loopDef.runtimeProtectionRating
      || loopDef.runtimePickOptions?.protectionRating
      || loopDef.autoPickRatingThreshold
      || 90,
  ) || 90));
}

export function applyRollingAutomaticUseFodderPolicy(activeLoopDef = {}, parentLoopDef = activeLoopDef) {
  const result = clone(activeLoopDef);
  result.runtimeSbcFodderPolicy = {
    ...(result.runtimeSbcFodderPolicy || {}),
    mode: 'rating-constrained',
    ratingSbcMaxCardRating: resolveRollingAutomaticUseMaxRating(parentLoopDef),
  };
  return result;
}

export const ROLLING_PLAYER_PICK_SELECTOR = Object.freeze({
  rewardMinRating: 85,
  candidateCount: 3,
  selectionCount: 1,
  rareGoldCost: 6,
});

export const ROLLING_PROVISIONS_RATING_RANGE = Object.freeze({
  min: 87,
  max: 88,
});

export const ROLLING_PROVISIONS_MAX_RATINGS = Object.freeze([88, 89]);
export const DEFAULT_ROLLING_SHORTAGE_PROVISIONS_PACK_LIMIT = 2;
export const MAX_ROLLING_SHORTAGE_PROVISIONS_PACK_LIMIT = 30;

export function normalizeRollingProvisionsMaxRating(value) {
  const rating = Number(value);
  return ROLLING_PROVISIONS_MAX_RATINGS.includes(rating)
    ? rating
    : ROLLING_PROVISIONS_RATING_RANGE.max;
}

export function normalizeRollingShortageProvisionsPackLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_ROLLING_SHORTAGE_PROVISIONS_PACK_LIMIT;
  return Math.max(1, Math.min(
    MAX_ROLLING_SHORTAGE_PROVISIONS_PACK_LIMIT,
    Math.floor(parsed),
  ));
}

export function resolveRollingProvisionsReserveRatings(loopDef = {}) {
  const maxRating = normalizeRollingProvisionsMaxRating(
    loopDef.runtimeProvisionsMaxRating
      ?? loopDef.runtimePickOptions?.rollingProvisionsMaxRating
      ?? loopDef.pickOptions?.rollingProvisionsMaxRating
      ?? loopDef.rollingProvisionsMaxRating,
  );
  return Array.from(
    { length: maxRating - ROLLING_PROVISIONS_RATING_RANGE.min + 1 },
    (_, index) => ROLLING_PROVISIONS_RATING_RANGE.min + index,
  );
}

export function shouldQueueRollingProvisionsReward(trigger, loopDef = {}) {
  const reason = String(trigger || '');
  if (['primary-fodder-shortage', 'required-special-fodder-shortage'].includes(reason)) return true;
  return reason === 'duplicate-reserve'
    && loopDef.rollingOpenDuplicateProvisionsRewards === true;
}

export const ROLLING_STORAGE_SINK_PICK_SELECTOR = Object.freeze({
  rewardMinRating: 95,
  candidateCount: 3,
  selectionCount: 1,
  challengeRatings: Object.freeze([88, 89]),
});

function clone(value) {
  return value === undefined ? undefined : cloneLoopDef(value);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizedText(value) {
  return String(value ?? '').trim();
}

function normalizedIdentityText(value) {
  return normalizedText(value)
    .toLowerCase()
    .replaceAll(/[\u2010-\u2015]/g, '-')
    .replaceAll(/[^a-z0-9+]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function pickReward(reward = {}) {
  const type = normalizedText(reward.type || reward.rewardType || reward.kind)
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, '_');
  return reward.playerPick === true || ['PLAYER_PICK', 'PLAYERPICK'].includes(type);
}

function rewardIdentity(reward = {}) {
  return normalizedText(
    reward.resourceId
      ?? reward.itemResourceId
      ?? reward.definitionId
      ?? reward.itemDefinitionId,
  );
}

function minimumRating(...values) {
  const match = /\b(\d{2})\+/.exec(values.map(normalizedText).filter(Boolean).join(' '));
  const rating = positiveInteger(match?.[1]);
  return rating && rating <= 99 ? rating : null;
}

function eligibilityKey(requirement = {}) {
  return normalizedText(requirement.key || requirement.keyName || requirement.type)
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, '_');
}

function eligibilityValues(requirement = {}) {
  const values = requirement.values ?? requirement.value ?? requirement.scope;
  return Array.isArray(values) ? values : values === undefined || values === null ? [] : [values];
}

function challengeTargetRating(challenge = {}) {
  const requirement = (challenge.eligibilityRequirements || challenge.requirements || [])
    .find((entry) => eligibilityKey(entry) === 'TEAM_RATING');
  return positiveInteger(eligibilityValues(requirement)[0]);
}

function storageSinkNameMatches(set = {}, reward = {}) {
  const text = normalizedIdentityText([
    set.name,
    reward.name,
    reward.displayName,
    reward.description,
  ].filter(Boolean).join(' '));
  return /(?:^| )fof(?: |$)/.test(text)
    && /(?:^| )futties(?: |$)/.test(text)
    && /(?:^| )t1 t3(?: |$)/.test(text);
}

function challengeSnapshot(challenge = {}) {
  return {
    ...clone(challenge),
    challengeId: positiveInteger(challenge.id),
    requiredPlayerCount: positiveInteger(challenge.requiredPlayerCount),
    targetRating: challengeTargetRating(challenge),
  };
}

export function parseRollingStorageSinkPickSnapshot(input = {}) {
  const set = input.set || {};
  const selector = input.selector || ROLLING_STORAGE_SINK_PICK_SELECTOR;
  const rewards = (set.rewards || []).filter(pickReward);
  if (rewards.length !== 1) return { status: 'ignored', diagnostics: ['exactly one Player Pick reward is required'] };
  const reward = rewards[0];
  const counts = readPlayerPickRewardCounts(reward);
  const rewardMinRating = minimumRating(set.name, reward.name, reward.displayName, reward.description);
  if (rewardMinRating !== Number(selector.rewardMinRating)
    || counts.candidateCount !== Number(selector.candidateCount)
    || counts.selectionCount !== Number(selector.selectionCount)
    || !storageSinkNameMatches(set, reward)) {
    return { status: 'ignored', diagnostics: ['Player Pick does not match the Rolling Storage sink identity'] };
  }

  const setId = positiveInteger(set.id);
  const identity = rewardIdentity(reward);
  const challenges = (set.challenges || []).map(challengeSnapshot);
  const ratings = challenges.map((challenge) => challenge.targetRating).sort((left, right) => left - right);
  const expectedRatings = [...selector.challengeRatings].map(Number).sort((left, right) => left - right);
  const diagnostics = [];
  if (!setId) diagnostics.push('stable SBC Set id is missing');
  if (!identity) diagnostics.push('stable Player Pick reward identity is missing');
  if (challenges.length !== expectedRatings.length) {
    diagnostics.push(`expected ${expectedRatings.length} Challenge(s), found ${challenges.length}`);
  }
  if (ratings.join(',') !== expectedRatings.join(',')) {
    diagnostics.push(`expected Challenge ratings ${expectedRatings.join('/')}, found ${ratings.map((value) => value || '?').join('/')}`);
  }
  challenges.forEach((challenge, index) => {
    if (!challenge.challengeId) diagnostics.push(`challenge ${index + 1}: stable Challenge id is missing`);
    if (!challenge.requiredPlayerCount) diagnostics.push(`challenge ${index + 1}: required player count is missing`);
    if (!Array.isArray(challenge.eligibilityRequirements) || !challenge.eligibilityRequirements.length) {
      diagnostics.push(`challenge ${index + 1}: eligibility requirements are missing`);
    }
  });
  if (diagnostics.length) {
    return {
      status: 'unsupported',
      setId,
      rewardMinRating,
      pickCandidateCount: counts.candidateCount,
      pickCount: counts.selectionCount,
      diagnostics,
    };
  }

  const setName = normalizedText(set.name);
  const rewardName = normalizedText(reward.name || reward.displayName || reward.description);
  return {
    status: 'supported',
    setId,
    diagnostics: [],
    loop: {
      id: `rolling-storage-sink-pick-${setId}-${identity}`,
      name: setName,
      strategy: 'playerPickSbc',
      discovered: true,
      rollingStorageSink: true,
      sbcSetIds: [setId],
      sbcNames: [setName],
      pickItemResourceIds: [identity],
      pickItemNames: [rewardName],
      pickCandidateCount: counts.candidateCount,
      pickCount: counts.selectionCount,
      dynamicRewardMinRating: rewardMinRating,
      challengesPerPick: challenges.length,
      dynamicChallenges: challenges,
      maxCompletions: 1,
      pricePlatform: normalizedText(input.pricePlatform || 'pc').toLowerCase(),
    },
  };
}

export function resolveRollingStorageSinkPickCapability(
  sets = [],
  selector = ROLLING_STORAGE_SINK_PICK_SELECTOR,
) {
  const results = (sets || []).map((set) => parseRollingStorageSinkPickSnapshot({ set, selector }));
  const matches = results.filter((result) => result.status === 'supported');
  if (matches.length === 1) return { status: 'resolved', loop: matches[0].loop, matches, results };
  return {
    status: matches.length ? 'ambiguous' : 'unavailable',
    loop: null,
    matches,
    results,
  };
}

function requirementGroups(loop = {}) {
  if (Array.isArray(loop.challengeRequirements) && loop.challengeRequirements.length) {
    return loop.challengeRequirements;
  }
  return Array.isArray(loop.requirements) && loop.requirements.length ? [loop.requirements] : [];
}

function isMatchingRareGoldPick(loop = {}, selector = ROLLING_PLAYER_PICK_SELECTOR) {
  if (loop.strategy !== 'playerPickSbc') return false;
  if (loop.discovered !== true && loop.scannedMetadata !== true) return false;
  if (Number(loop.dynamicRewardMinRating || 0) !== Number(selector.rewardMinRating)) return false;
  if (Number(loop.pickCandidateCount || 0) !== Number(selector.candidateCount)) return false;
  if (Number(loop.pickCount || 0) !== Number(selector.selectionCount)) return false;
  const groups = requirementGroups(loop);
  if (groups.length !== 1 || !groups[0].length) return false;
  const requirements = groups[0];
  return requirements.every((requirement) => (
    requirement?.tier === 'gold'
      && requirement?.rarity === 'rare'
      && Number(requirement.count || 0) > 0
  )) && requirements.reduce((total, requirement) => total + Number(requirement.count || 0), 0)
    === Number(selector.rareGoldCost);
}

export function resolveRollingPlayerPickCapability(
  loops = [],
  selector = ROLLING_PLAYER_PICK_SELECTOR,
) {
  const matches = (loops || []).filter((loop) => isMatchingRareGoldPick(loop, selector));
  if (matches.length === 1) return { status: 'resolved', loop: matches[0], matches };
  return {
    status: matches.length ? 'ambiguous' : 'unavailable',
    loop: null,
    matches,
  };
}

export function createRollingUpgradeLoopDef(primaryLoop = {}) {
  if (primaryLoop.dynamicSbcFamily !== 'high-rated-x10'
    || Number(primaryLoop.dynamicRewardCount || 0) !== 10
    || Number(primaryLoop.dynamicRewardMinRating || 0) !== 85
    || Number(primaryLoop.requiredSpecialCount || 0) !== 1
    || Number(primaryLoop.allowedSpecialCount || 0) !== 1) return null;
  const setId = positiveInteger(primaryLoop.sbcSetIds?.[0]);
  if (!setId) return null;
  const result = {
    ...clone(primaryLoop),
    id: `rolling-upgrade-${setId}-${Number(primaryLoop.dynamicRewardMinRating || 0) || 'x'}`,
    name: `${primaryLoop.name} Rolling Loop`,
    strategy: ROLLING_UPGRADE_STRATEGY,
    hidden: false,
    mvp: false,
    rollingWorkflowEnabled: true,
    defaultOpenRewardPacksOnSelect: true,
    openRewardPacks: false,
    maxCompletions: 0,
    useRoundsAsCompletions: true,
    runtimeQuantity: {
      mode: 'user',
      target: 'maxCompletions',
      default: 0,
      min: 0,
      max: 1000,
      allowZero: true,
      label: 'SBC completions',
    },
    rollingTotwUpgrade: {
      name: 'Scanned Required Special Recovery',
      activityBinding: {
        family: 'totw-upgrade',
        category: 'Upgrades',
        required: true,
      },
      ...createTotwUpgradePolicy({
        forceOpenRewardPacks: false,
        openRewardPacks: false,
      }),
    },
    rollingProvisionsUpgrade: {
      name: 'Scanned Provisions Recovery',
      activityBinding: {
        family: 'provisions-upgrade',
        category: 'Upgrades',
        required: true,
      },
      ...createProvisionsUpgradePolicy({
        requirements: [{
          tier: 'gold',
          count: 4,
          minRating: ROLLING_PROVISIONS_RATING_RANGE.min,
          maxRating: ROLLING_PROVISIONS_RATING_RANGE.max,
          playerOnly: true,
          allowSpecial: true,
          priorityPiles: [...ALL_INVENTORY_PILES],
        }],
      }),
    },
    rollingPlayerPick: {
      status: 'unavailable',
      required: true,
      selector: clone(ROLLING_PLAYER_PICK_SELECTOR),
    },
    rollingStorageSinkPick: {
      status: 'unavailable',
      required: false,
      selector: clone(ROLLING_STORAGE_SINK_PICK_SELECTOR),
    },
    rollingGoldSinkUpgrade: {
      name: 'Scanned Gold Duplicate Sink',
      strategy: 'fillAndVerifySbc',
      activityBinding: {
        family: '5x80-upgrade',
        category: 'Upgrades',
        required: true,
      },
      requirements: [{
        tier: 'gold',
        count: 1,
        goldConsumption: 'common-first',
        playerOnly: true,
        allowSpecial: false,
        priorityPiles: [...ALL_INVENTORY_PILES],
      }],
      priorityPiles: [...ALL_INVENTORY_PILES],
      blockSpecial: true,
      blockTradeable: false,
      openRewardPacks: false,
    },
  };
  delete result.autoTotwUpgrade;
  delete result.autoFodderUpgrade;
  return result;
}

export function bindRollingPlayerPickCapability(loopDef = {}, loopDefs = []) {
  if (loopDef.strategy !== ROLLING_UPGRADE_STRATEGY) return clone(loopDef);
  const result = clone(loopDef);
  const configured = isPlainObject(result.rollingPlayerPick) ? result.rollingPlayerPick : {};
  const selector = isPlainObject(configured.selector)
    ? configured.selector
    : ROLLING_PLAYER_PICK_SELECTOR;
  const resolution = resolveRollingPlayerPickCapability(loopDefs, selector);
  result.rollingPlayerPick = {
    ...configured,
    status: resolution.status,
  };
  delete result.rollingPlayerPick.loop;
  if (resolution.loop) result.rollingPlayerPick.loop = clone(resolution.loop);
  return result;
}

export function bindRollingStorageSinkPickCapability(loopDef = {}, sets = []) {
  if (loopDef.strategy !== ROLLING_UPGRADE_STRATEGY) return clone(loopDef);
  const result = clone(loopDef);
  const configured = isPlainObject(result.rollingStorageSinkPick)
    ? result.rollingStorageSinkPick
    : {};
  const selector = isPlainObject(configured.selector)
    ? configured.selector
    : ROLLING_STORAGE_SINK_PICK_SELECTOR;
  const resolution = resolveRollingStorageSinkPickCapability(sets, selector);
  result.rollingStorageSinkPick = {
    ...configured,
    status: resolution.status,
  };
  delete result.rollingStorageSinkPick.loop;
  if (resolution.loop) result.rollingStorageSinkPick.loop = clone(resolution.loop);
  return result;
}

export function bindRollingPlayerPickCapabilities(rollingLoops = [], loopDefs = [], options = {}) {
  return (rollingLoops || []).map((loopDef) => bindRollingStorageSinkPickCapability(
    bindRollingPlayerPickCapability(loopDef, loopDefs),
    options.storageSinkSets || [],
  ));
}
