export function getPlayerPickChallengeCount(loopDef = {}) {
  return Math.max(1, Number(loopDef.challengeRequirements?.length || loopDef.challengesPerPick || 1) || 1);
}

export function resolvePlayerPickRunTarget(loopDef = {}, options = {}) {
  if (loopDef.exhaustSbcSet !== true) {
    return {
      maxPicks: Math.max(1, Math.min(50, Math.floor(Number(loopDef.maxCompletions) || 1))),
      pendingCount: 0,
      remainingCompletions: null,
      usedSafetyLimit: false,
    };
  }

  const pendingCount = Math.max(0, Math.floor(Number(options.pendingCount) || 0));
  const rawRemaining = options.remainingCompletions;
  const hasKnownRemaining = rawRemaining !== null
    && rawRemaining !== undefined
    && Number.isFinite(Number(rawRemaining));
  const safetyLimit = Math.max(
    1,
    Math.min(100, Math.floor(Number(loopDef.setCompletionSafetyLimit) || 100)),
  );
  const remainingCompletions = hasKnownRemaining
    ? Math.max(0, Math.floor(Number(rawRemaining)))
    : safetyLimit;
  return {
    maxPicks: Math.min(200, pendingCount + remainingCompletions),
    pendingCount,
    remainingCompletions,
    usedSafetyLimit: !hasKnownRemaining,
  };
}

export function getLiveRunLimit(loopDef = {}, rounds = 1, options = {}) {
  if (loopDef.strategy === 'validationBronzeUpgrade') {
    return Number(rounds || loopDef.maxRounds || 1);
  }
  if (loopDef.strategy === 'fillAndVerifySbc') {
    const completions = Number(loopDef.maxCompletions || 1);
    return completions + (options.needsAutoTotwPreflight?.(loopDef) ? completions : 0);
  }
  if (loopDef.strategy === 'rarePackTo84Upgrade') {
    return loopDef.useRoundsAsCompletions === true
      ? Number(loopDef.maxCompletions || 1)
      : Number(loopDef.maxPacks || 100);
  }
  if (loopDef.strategy === 'playerPickSbc') {
    const completions = loopDef.exhaustSbcSet === true
      ? Number(loopDef.remainingCompletions ?? loopDef.setCompletionSafetyLimit ?? 100)
      : Number(loopDef.maxCompletions || 1);
    return completions * getPlayerPickChallengeCount(loopDef);
  }
  if (loopDef.strategy === 'dailyRoutine') {
    return summarizeRoutineStepLimits(options.getRoutineSteps?.(loopDef) || [], options).max;
  }
  return Number(loopDef.maxCompletions || loopDef.rounds || loopDef.maxRounds || 1);
}

export function summarizeRoutineStepLimits(steps = [], options = {}) {
  const limits = steps.map((step) => {
    const rawLimit = getLiveRunLimit(step, 1, options);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.floor(rawLimit)) : 1;
    const unit = 'SBC(s)';
    const policy = step.consumeAllSourcePacks === true
      ? 'all matching source packs'
      : (Number(step.dailyCompletionLimit) > 0
        ? 'current EA daily remaining'
        : `up to ${limit} ${unit}`);
    return {
      name: step.name || step.id || step.strategy || 'step',
      limit,
      unit,
      policy,
    };
  });
  return {
    limits,
    max: limits.reduce((maxLimit, step) => Math.max(maxLimit, step.limit), 1),
    total: limits.reduce((sum, step) => sum + step.limit, 0),
    text: limits.map((step) => `${step.name}: ${step.policy}`).join('; '),
  };
}
