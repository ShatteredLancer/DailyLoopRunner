export function normalizePickRuntimeOptions(input = {}) {
  return {
    protectHighGold: input.protectHighGold !== false,
    autoSelectBelow90: input.autoSelectBelow90 !== false,
    preferScannedMetadata: input.preferScannedMetadata === true,
    highGoldThreshold: Math.max(2, Math.min(99, Number(input.highGoldThreshold || 82) || 82)),
    autoPickThreshold: Math.max(1, Math.min(99, Number(input.autoPickThreshold || 90) || 90)),
  };
}

export function applyPickRuntimeOptions(loopDef, input = {}) {
  if (loopDef.strategy !== 'playerPickSbc') return loopDef;
  const options = normalizePickRuntimeOptions(input);
  loopDef.protectHighGold = options.protectHighGold;
  loopDef.autoSelectBelow90 = options.autoSelectBelow90;
  loopDef.pickHighGoldThreshold = options.highGoldThreshold;
  loopDef.autoPickRatingThreshold = options.autoPickThreshold;
  const requirementGroups = [loopDef.requirements, ...(loopDef.challengeRequirements || [])];
  requirementGroups.forEach((requirements) => (requirements || []).forEach((requirement) => {
    requirement.protectHighGold = options.protectHighGold;
    if (options.protectHighGold) {
      requirement.maxRating = options.highGoldThreshold - 1;
    } else if (Number(requirement.maxRating) <= 81) {
      delete requirement.maxRating;
    }
  }));
  return loopDef;
}

export function applyLoopRuntimeOptions(loopDef, options = {}) {
  const rounds = Math.max(1, Math.min(50, Number(options.rounds || 1) || 1));
  loopDef.dryRun = options.dryRun === true || loopDef.dryRun === true;
  loopDef.openRewardPacks = loopDef.forceOpenRewardPacks === true || options.openRewardPacks === true;
  applyPickRuntimeOptions(loopDef, options.pickOptions);
  if (loopDef.strategy === 'provisionPackCrafting' || loopDef.strategy === 'provisionPackDualCrafting') {
    loopDef.rounds = rounds;
  }
  if (loopDef.useRoundsAsCompletions === true) loopDef.maxCompletions = rounds;
  return loopDef;
}
