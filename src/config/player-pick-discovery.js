import { readEligibilityRequirements } from '../selection/rating-model.js';

const DEFAULT_PRIORITY_PILES = Object.freeze(['unassigned', 'storage', 'transfer', 'club']);
const SUPPORTED_REQUIREMENT_KEYS = new Set([
  'PLAYER_QUALITY',
  'PLAYER_LEVEL',
  'PLAYER_RARITY',
  'PLAYER_RARITY_GROUP',
]);

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

function isCompleted(value) {
  const status = normalizedText(value?.status || value?.state).toUpperCase();
  return value?.complete === true
    || value?.completed === true
    || status === 'COMPLETE'
    || status === 'COMPLETED';
}

function rewardType(reward) {
  return normalizedText(reward?.type || reward?.rewardType || reward?.kind).toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_');
}

function isPlayerPickReward(reward) {
  return reward?.playerPick === true || ['PLAYER_PICK', 'PLAYERPICK'].includes(rewardType(reward));
}

function rewardIdentityValues(reward) {
  return unique([
    reward?.resourceId,
    reward?.itemResourceId,
    reward?.definitionId,
    reward?.itemDefinitionId,
  ].map(normalizedText));
}

function rewardIdentityKey(reward) {
  const values = rewardIdentityValues(reward);
  return values.length ? values.join('|') : '';
}

export function readPlayerPickRewardCounts(reward = {}) {
  const explicitCandidateCount = positiveInteger(reward.candidateCount ?? reward.totalCandidates);
  const explicitSelectionCount = positiveInteger(reward.selectionCount ?? reward.availablePicks);
  if (explicitCandidateCount && explicitSelectionCount) {
    return { candidateCount: explicitCandidateCount, selectionCount: explicitSelectionCount, source: 'fields' };
  }
  const description = normalizedText(reward.description);
  const match = /^(\d+)\s+of\s+(\d+)(?:\s|$)/i.exec(description);
  if (!match) {
    return {
      candidateCount: explicitCandidateCount,
      selectionCount: explicitSelectionCount,
      source: explicitCandidateCount || explicitSelectionCount ? 'partial-fields' : null,
    };
  }
  return {
    candidateCount: explicitCandidateCount || positiveInteger(match[2]),
    selectionCount: explicitSelectionCount || positiveInteger(match[1]),
    source: explicitCandidateCount || explicitSelectionCount ? 'fields-and-description' : 'description',
  };
}

function canonicalQuality(value, options = {}) {
  const text = normalizedText(value).toUpperCase();
  if (['GOLD', 'QUALITY_GOLD', 'LEVEL_GOLD'].includes(text)) return 'gold';
  const goldValues = new Set((options.goldQualityValues || [3]).map((entry) => normalizedText(entry)));
  return goldValues.has(normalizedText(value)) ? 'gold' : null;
}

function canonicalRarity(value, options = {}, keyName = 'PLAYER_RARITY') {
  if (keyName === 'PLAYER_RARITY_GROUP') {
    const rareGroupValues = new Set((options.rareRarityGroupValues || [4]).map((entry) => normalizedText(entry)));
    return rareGroupValues.has(normalizedText(value)) ? 'rare' : null;
  }
  const text = normalizedText(value).toUpperCase();
  if (['COMMON', 'NORMAL', 'NON_RARE', 'NONRARE'].includes(text)) return 'common';
  if (['RARE'].includes(text)) return 'rare';
  const commonValues = new Set((options.commonRarityValues || [0]).map((entry) => normalizedText(entry)));
  const rareValues = new Set((options.rareRarityValues || [1]).map((entry) => normalizedText(entry)));
  if (commonValues.has(normalizedText(value))) return 'common';
  if (rareValues.has(normalizedText(value))) return 'rare';
  return null;
}

function requirementSummary(entry) {
  return `${entry.keyName || '?'}(count:${entry.count || '?'}, values:${entry.values.join('/') || '?'})`;
}

function parseChallengeRequirements(challenge, challengeIndex, options = {}) {
  const challengeLabel = `challenge ${challengeIndex + 1}${challenge?.id ? ` (#${challenge.id})` : ''}`;
  const requiredPlayerCount = positiveInteger(challenge?.requiredPlayerCount);
  if (!requiredPlayerCount) {
    return { ok: false, diagnostics: [`${challengeLabel}: required player count is missing or invalid`] };
  }

  const entries = readEligibilityRequirements(challenge, {
    requiredPlayerCount,
    eligibilityKeyName: options.eligibilityKeyName,
  });
  const diagnostics = [];
  const qualityEntries = [];
  const rarityEntries = [];

  if (!entries.length) diagnostics.push(`${challengeLabel}: eligibility requirements are missing`);
  for (const entry of entries) {
    if (!SUPPORTED_REQUIREMENT_KEYS.has(entry.keyName)) {
      diagnostics.push(`${challengeLabel}: unsupported eligibility condition ${requirementSummary(entry)}`);
      continue;
    }
    if (!entry.values.length || !entry.count) {
      diagnostics.push(`${challengeLabel}: incomplete eligibility condition ${requirementSummary(entry)}`);
      continue;
    }
    if (entry.keyName === 'PLAYER_RARITY' || entry.keyName === 'PLAYER_RARITY_GROUP') rarityEntries.push(entry);
    else qualityEntries.push(entry);
  }

  if (qualityEntries.length !== 1) {
    diagnostics.push(`${challengeLabel}: exactly one all-player gold quality condition is required`);
  } else {
    const quality = qualityEntries[0];
    const values = unique(quality.values.map((value) => canonicalQuality(value, options)));
    if (values.length !== 1 || values[0] !== 'gold' || quality.count !== requiredPlayerCount) {
      diagnostics.push(`${challengeLabel}: quality condition does not prove that all ${requiredPlayerCount} players are gold`);
    }
  }

  const rarityCounts = { common: null, rare: null };
  for (const entry of rarityEntries) {
    if (entry.values.length !== 1) {
      diagnostics.push(`${challengeLabel}: rarity condition is ambiguous: ${requirementSummary(entry)}`);
      continue;
    }
    const rarity = canonicalRarity(entry.values[0], options, entry.keyName);
    if (!rarity) {
      diagnostics.push(`${challengeLabel}: unknown ${entry.keyName} encoding ${normalizedText(entry.values[0]) || '?'}`);
      continue;
    }
    if (rarityCounts[rarity] !== null) {
      diagnostics.push(`${challengeLabel}: duplicate ${rarity} rarity conditions are unsupported`);
      continue;
    }
    rarityCounts[rarity] = entry.count;
  }

  if (!rarityEntries.length) {
    diagnostics.push(`${challengeLabel}: exact common/rare ratio is unavailable`);
  } else if (rarityCounts.common !== null && rarityCounts.rare !== null) {
    if (rarityCounts.common + rarityCounts.rare !== requiredPlayerCount) {
      diagnostics.push(`${challengeLabel}: common/rare counts do not equal required player count`);
    }
  } else if (rarityCounts.common !== null) {
    rarityCounts.rare = requiredPlayerCount - rarityCounts.common;
  } else if (rarityCounts.rare !== null) {
    rarityCounts.common = requiredPlayerCount - rarityCounts.rare;
  }

  if (rarityCounts.common < 0 || rarityCounts.rare < 0) {
    diagnostics.push(`${challengeLabel}: rarity count exceeds required player count`);
  }
  if (diagnostics.length) return { ok: false, diagnostics };

  const highGoldThreshold = Math.max(2, Math.min(99, Number(options.highGoldThreshold || 82) || 82));
  const maxRating = highGoldThreshold - 1;
  const requirement = (rarity, count) => ({
    tier: 'gold',
    rarity,
    count,
    maxRating,
    playerOnly: true,
    allowSpecial: false,
    protectHighGold: true,
    highGoldThreshold,
    highGoldProtectionMaxRating: true,
    priorityPiles: [...(options.priorityPiles || DEFAULT_PRIORITY_PILES)],
  });
  const requirements = [];
  if (rarityCounts.rare > 0) requirements.push(requirement('rare', rarityCounts.rare));
  if (rarityCounts.common > 0) requirements.push(requirement('common', rarityCounts.common));
  return { ok: true, requiredPlayerCount, requirements };
}

function remainingCompletions(set) {
  if (set?.timesCompleted === undefined || set?.timesCompleted === null
    || set?.repeats === undefined || set?.repeats === null) return null;
  const completed = Number(set?.timesCompleted);
  const repeats = Number(set?.repeats);
  if (!Number.isFinite(completed) || !Number.isFinite(repeats) || repeats < completed) return null;
  return Math.max(0, Math.floor(repeats - completed));
}

function discoveryIdentity(set, reward) {
  return Object.freeze({
    setId: positiveInteger(set?.id),
    rewardKey: rewardIdentityKey(reward),
    rewardIdentityValues: Object.freeze(rewardIdentityValues(reward)),
  });
}

export function parsePlayerPickSbcSnapshot(input = {}) {
  const set = input.set || {};
  const setId = positiveInteger(set.id);
  const setName = normalizedText(set.name);
  const diagnostics = [];
  if (!setId) diagnostics.push('stable SBC Set id is missing');
  if (!setName) diagnostics.push('SBC Set display name is missing');

  const playerPickRewards = (set.rewards || []).filter(isPlayerPickReward);
  if (!playerPickRewards.length) {
    return { status: 'ignored', setId, diagnostics: ['SBC Set has no Player Pick reward'] };
  }
  if (playerPickRewards.length !== 1) diagnostics.push(`SBC Set exposes ${playerPickRewards.length} Player Pick rewards`);
  const reward = playerPickRewards[0] || {};
  const identity = discoveryIdentity(set, reward);
  if (!identity.rewardKey) diagnostics.push('stable Player Pick reward identity is missing');

  const rewardName = normalizedText(reward.name || reward.displayName);
  if (!rewardName) diagnostics.push('Player Pick reward display name is missing');
  const rewardCounts = readPlayerPickRewardCounts(reward);
  const candidateCount = rewardCounts.candidateCount;
  const selectionCount = rewardCounts.selectionCount;
  if (!candidateCount) diagnostics.push('Player Pick candidate count is missing or invalid');
  if (!selectionCount) diagnostics.push('Player Pick selection count is missing or invalid');
  if (candidateCount && selectionCount && selectionCount > candidateCount) {
    diagnostics.push('Player Pick selection count exceeds candidate count');
  }

  const setRemaining = remainingCompletions(set);
  const reportedCompleted = isCompleted(set) || setRemaining === 0;

  const challenges = Array.isArray(set.challenges) ? set.challenges : [];
  if (!challenges.length) diagnostics.push('SBC Set challenge list is missing');
  const challengeRequirements = [];
  for (let index = 0; index < challenges.length; index++) {
    const parsed = parseChallengeRequirements(challenges[index], index, input);
    if (parsed.ok) challengeRequirements.push(parsed.requirements);
    else diagnostics.push(...parsed.diagnostics);
  }
  if (diagnostics.length) {
    return {
      status: 'unsupported',
      setId,
      identity,
      pickCandidateCount: candidateCount,
      pickCount: selectionCount,
      diagnostics: unique(diagnostics),
    };
  }

  const priorityPiles = [...(input.priorityPiles || DEFAULT_PRIORITY_PILES)];
  const loop = {
    id: `discovered-player-pick-${setId}-${identity.rewardIdentityValues[0]}`,
    name: setName,
    strategy: 'playerPickSbc',
    discovered: true,
    sbcSetIds: [setId],
    sbcNames: [setName],
    pickItemResourceIds: [...identity.rewardIdentityValues],
    pickItemNames: [rewardName],
    challengeRequirements,
    priorityPiles,
    challengesPerPick: challenges.length,
    pickCandidateCount: candidateCount,
    pickCount: selectionCount,
    remainingCompletions: setRemaining,
    maxCompletions: 1,
    useRoundsAsCompletions: !reportedCompleted,
    discoveryReportedCompleted: reportedCompleted,
    pricePlatform: normalizedText(input.pricePlatform || 'pc').toLowerCase(),
    discoveryIdentity: identity,
  };
  if (challengeRequirements.length === 1) {
    loop.requirements = challengeRequirements[0];
    delete loop.challengeRequirements;
  }
  return {
    status: 'supported',
    setId,
    identity,
    loop,
    pickCandidateCount: candidateCount,
    pickCount: selectionCount,
    reportedCompleted,
    remainingCompletions: setRemaining,
    diagnostics: [],
  };
}

function loopSetIds(loop) {
  return new Set((loop?.sbcSetIds || []).map(positiveInteger).filter(Boolean));
}

function loopRewardIds(loop) {
  return new Set((loop?.pickItemResourceIds || []).map(normalizedText).filter(Boolean));
}

function matchingPlayerPickLoops(loop, existingLoops = []) {
  const setIds = loopSetIds(loop);
  const rewardIds = loopRewardIds(loop);
  return (existingLoops || []).filter((existing) => {
    if (existing === loop) return false;
    const existingSetIds = loopSetIds(existing);
    const existingRewardIds = loopRewardIds(existing);
    return [...setIds].some((id) => existingSetIds.has(id))
      || [...rewardIds].some((id) => existingRewardIds.has(id));
  });
}

export function isDuplicateDiscoveredPlayerPick(loop, existingLoops = []) {
  return matchingPlayerPickLoops(loop, existingLoops).length > 0;
}

export function discoverPlayerPickSbcLoops(input = {}) {
  const loops = [];
  const results = [];
  const existingLoops = [...(input.existingLoops || [])];
  for (const set of input.sets || []) {
    const result = parsePlayerPickSbcSnapshot({ ...input, set });
    const matches = result.status === 'supported'
      ? matchingPlayerPickLoops(result.loop, [...existingLoops, ...loops])
      : [];
    if (matches.length) {
      results.push({
        ...result,
        status: 'duplicate',
        loop: null,
        discoveredLoop: result.loop,
        matchingLoopIds: matches.map((loop) => normalizedText(loop?.id)).filter(Boolean),
        diagnostics: ['matching static or discovered Player Pick already exists'],
      });
      continue;
    }
    results.push(result);
    if (result.status === 'supported') loops.push(result.loop);
  }
  return { loops, results };
}

export function mergeScannedPlayerPickMetadata(configuredLoop, discoveredLoop) {
  if (configuredLoop?.strategy !== 'playerPickSbc' || discoveredLoop?.strategy !== 'playerPickSbc') return null;
  const merged = {
    ...configuredLoop,
    sbcSetIds: [...(discoveredLoop.sbcSetIds || [])],
    sbcNames: unique([...(discoveredLoop.sbcNames || []), ...(configuredLoop.sbcNames || [])]),
    pickItemResourceIds: [...(discoveredLoop.pickItemResourceIds || [])],
    pickItemNames: unique([...(discoveredLoop.pickItemNames || []), ...(configuredLoop.pickItemNames || [])]),
    priorityPiles: [...(discoveredLoop.priorityPiles || configuredLoop.priorityPiles || DEFAULT_PRIORITY_PILES)],
    challengesPerPick: discoveredLoop.challengesPerPick,
    pickCandidateCount: discoveredLoop.pickCandidateCount,
    pickCount: discoveredLoop.pickCount,
    remainingCompletions: discoveredLoop.remainingCompletions,
    pricePlatform: discoveredLoop.pricePlatform || configuredLoop.pricePlatform,
    discoveryIdentity: discoveredLoop.discoveryIdentity,
    scannedMetadata: true,
  };
  if (Array.isArray(discoveredLoop.challengeRequirements)) {
    merged.challengeRequirements = discoveredLoop.challengeRequirements.map((requirements) =>
      requirements.map((requirement) => ({ ...requirement, priorityPiles: [...(requirement.priorityPiles || [])] }))
    );
    delete merged.requirements;
  } else {
    merged.requirements = (discoveredLoop.requirements || []).map((requirement) => ({
      ...requirement,
      priorityPiles: [...(requirement.priorityPiles || [])],
    }));
    delete merged.challengeRequirements;
  }
  return merged;
}

export function buildPlayerPickDiscoverySession(input = {}) {
  const configuredLoops = [...(input.configuredLoops || [])];
  const discovery = discoverPlayerPickSbcLoops({
    ...input,
    existingLoops: configuredLoops,
  });
  const loopOverrides = {};
  const overrideDiagnostics = [];
  if (input.preferScannedMetadata === true) {
    for (const result of discovery.results) {
      if (result.status !== 'duplicate' || !result.discoveredLoop) continue;
      const matches = matchingPlayerPickLoops(result.discoveredLoop, configuredLoops)
        .filter((loop) => loop?.strategy === 'playerPickSbc');
      if (matches.length !== 1) {
        if (matches.length > 1) {
          overrideDiagnostics.push(`scanned Pick #${result.setId || '?'} matches multiple configured loops: ${matches.map((loop) => loop.id).join(', ')}`);
        }
        continue;
      }
      const merged = mergeScannedPlayerPickMetadata(matches[0], result.discoveredLoop);
      if (merged) loopOverrides[matches[0].id] = merged;
    }
  }
  const configuredSessionLoops = configuredLoops.map((loop) => loopOverrides[loop?.id] || loop);
  const discoveredLoops = [...discovery.loops];
  const loopDefs = [...configuredSessionLoops, ...discoveredLoops];
  const requestedSelection = normalizedText(input.selectedId);
  const selectedId = requestedSelection === 'custom' || loopDefs.some((loop) => loop?.id === requestedSelection)
    ? requestedSelection
    : loopDefs[0]?.id || null;
  return {
    ...discovery,
    configuredSessionLoops,
    discoveredLoops,
    loopOverrides,
    overrideDiagnostics,
    loopDefs,
    selectedId,
  };
}
