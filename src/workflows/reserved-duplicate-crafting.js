function completionLimit(value) {
  const number = Number(value);
  return Math.max(1, Math.min(1000, Number.isFinite(number) ? Math.floor(number) : 100));
}

function forcedAttemptCount(value) {
  const number = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(number) ? Math.floor(number) : 0));
}

function outcome(value) {
  if (value?.submitted === true || value?.status === 'submitted') return 'submitted';
  if (value?.status === 'planned') return 'planned';
  if (value?.status === 'blocked') return 'blocked';
  if (value?.status === 'unavailable') return 'unavailable';
  if (value?.status === 'done' || value?.status === 'insufficient') return 'done';
  return 'blocked';
}

export async function runReservedDuplicateCraftingWorkflow(options = {}) {
  if (typeof options.planAttempt !== 'function') throw new TypeError('planAttempt is required');
  if (typeof options.executeAttempt !== 'function') throw new TypeError('executeAttempt is required');

  const result = {
    status: 'completed',
    completions: 0,
    attempts: 0,
    forcedAttemptsRemaining: forcedAttemptCount(options.forceAttempts),
    transientSignals: [...(options.transientSignals || [])],
    reason: null,
  };
  const maxCompletions = completionLimit(options.maxCompletions);

  while (result.completions < maxCompletions) {
    await options.stopPoint?.();
    const forceAttempt = result.forcedAttemptsRemaining > 0;
    const plan = await options.planAttempt({
      result,
      forceAttempt,
      transientSignals: result.transientSignals,
    }) || { status: 'blocked', reason: 'attempt planning returned no result' };
    const planOutcome = outcome(plan);
    if (planOutcome === 'done') {
      result.reason = plan.reason || null;
      break;
    }
    if (planOutcome !== 'submitted' && plan.status !== 'ready') {
      result.status = planOutcome;
      result.reason = plan.reason || `attempt planning ${planOutcome}`;
      break;
    }

    result.attempts++;
    if (forceAttempt && plan.consumeForcedAttempt !== false) result.forcedAttemptsRemaining--;
    const attempt = await options.executeAttempt({
      result,
      plan,
      forceAttempt,
      transientSignals: result.transientSignals,
    }) || { status: 'blocked', reason: 'attempt execution returned no result' };
    const attemptOutcome = outcome(attempt);
    if (attemptOutcome === 'submitted') {
      result.completions++;
      result.transientSignals = [...(attempt.transientSignals || [])];
      await options.afterCompletion?.({ result, plan, attempt });
      continue;
    }
    if (attemptOutcome === 'done') {
      result.reason = attempt.reason || null;
      break;
    }
    result.status = attemptOutcome;
    result.reason = attempt.reason || `attempt execution ${attemptOutcome}`;
    break;
  }

  await options.finalize?.(result);
  return result;
}
