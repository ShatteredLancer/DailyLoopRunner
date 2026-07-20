export function normalizePickRuntimeOptions(input = {}) {
  return {
    protectHighGold: input.protectHighGold !== false,
    autoSelectBelow90: input.autoSelectBelow90 !== false,
    preferScannedMetadata: input.preferScannedMetadata === true,
    openPicksAtEnd: input.openPicksAtEnd === true,
    highGoldThreshold: Math.max(2, Math.min(99, Number(input.highGoldThreshold || 82) || 82)),
    autoPickThreshold: Math.max(1, Math.min(99, Number(input.autoPickThreshold || 90) || 90)),
  };
}

export function applyPickRuntimeOptions(loopDef, input = {}) {
  if (loopDef.strategy !== 'playerPickSbc') return loopDef;
  const options = normalizePickRuntimeOptions(input);
  loopDef.protectHighGold = options.protectHighGold;
  loopDef.autoSelectBelow90 = options.autoSelectBelow90;
  loopDef.openPicksAtEnd = options.openPicksAtEnd;
  loopDef.pickHighGoldThreshold = options.highGoldThreshold;
  loopDef.autoPickRatingThreshold = options.autoPickThreshold;
  const requirementGroups = [loopDef.requirements, ...(loopDef.challengeRequirements || [])];
  requirementGroups.forEach((requirements) => (requirements || []).forEach((requirement) => {
    const previousThreshold = Number(requirement.highGoldThreshold);
    const hadLegacyGeneratedMaxRating = requirement.highGoldProtectionMaxRating !== true
      && requirement.protectHighGold === true
      && Number.isFinite(previousThreshold)
      && Number(requirement.maxRating) === previousThreshold - 1;
    const hadGeneratedMaxRating = requirement.highGoldProtectionMaxRating === true
      || hadLegacyGeneratedMaxRating;
    requirement.protectHighGold = options.protectHighGold;
    if (options.protectHighGold) {
      if (!hadGeneratedMaxRating) {
        const existingMaxRating = Number(requirement.maxRating);
        if (Number.isFinite(existingMaxRating) && existingMaxRating > 81) {
          requirement.maxRatingBeforeHighGoldProtection = existingMaxRating;
        }
      }
      requirement.highGoldProtectionMaxRating = true;
      requirement.highGoldThreshold = options.highGoldThreshold;
      requirement.maxRating = options.highGoldThreshold - 1;
    } else {
      delete requirement.highGoldThreshold;
      if (hadGeneratedMaxRating) {
        if (requirement.maxRatingBeforeHighGoldProtection !== undefined) {
          requirement.maxRating = requirement.maxRatingBeforeHighGoldProtection;
        } else {
          delete requirement.maxRating;
        }
        delete requirement.highGoldProtectionMaxRating;
        delete requirement.maxRatingBeforeHighGoldProtection;
      } else if (Number(requirement.maxRating) <= 81) {
        delete requirement.maxRating;
      }
    }
  }));
  return loopDef;
}

export function loopUsesRounds(loopDef = {}) {
  return loopDef.useRoundsAsCompletions === true
    || ['validationBronzeUpgrade', 'provisionPackCrafting', 'provisionPackDualCrafting']
      .includes(loopDef.strategy);
}

export function applyLoopRuntimeOptions(loopDef, options = {}) {
  const rounds = Math.max(1, Math.min(50, Number(options.rounds || 1) || 1));
  loopDef.dryRun = options.dryRun === true || loopDef.dryRun === true;
  loopDef.openRewardPacks = loopDef.forceOpenRewardPacks === true || options.openRewardPacks === true;
  applyPickRuntimeOptions(loopDef, options.pickOptions);
  if (loopDef.strategy === 'dailySingleCardRecycle' || loopDef.strategy === 'dailyRoutine') {
    loopDef.dailyRecycleInventoryOnly = options.dailyRecycleInventoryOnly === true;
  }
  if (loopDef.strategy === 'provisionPackCrafting' || loopDef.strategy === 'provisionPackDualCrafting') {
    loopDef.rounds = rounds;
  }
  if (loopDef.useRoundsAsCompletions === true) loopDef.maxCompletions = rounds;
  return loopDef;
}
