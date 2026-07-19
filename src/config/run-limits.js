export function getPlayerPickChallengeCount(loopDef = {}) {
  return Math.max(1, Number(loopDef.challengeRequirements?.length || loopDef.challengesPerPick || 1) || 1);
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
    return Number(loopDef.maxPacks || 100);
  }
  if (loopDef.strategy === 'playerPickSbc') {
    return Number(loopDef.maxCompletions || 1) * getPlayerPickChallengeCount(loopDef);
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
    const unit = step.strategy === 'rarePackTo84Upgrade' ? 'pack(s)' : 'SBC(s)';
    return {
      name: step.name || step.id || step.strategy || 'step',
      limit,
      unit,
    };
  });
  return {
    limits,
    max: limits.reduce((maxLimit, step) => Math.max(maxLimit, step.limit), 1),
    total: limits.reduce((sum, step) => sum + step.limit, 0),
    text: limits.map((step) => `${step.name} max ${step.limit} ${step.unit}`).join('; '),
  };
}
