function completionLimit(value) {
  const number = Number(value);
  return Math.max(1, Math.min(1000, Number.isFinite(number) ? Math.floor(number) : 1));
}

async function emit(options, event, payload = {}) {
  await options.onEvent?.(event, payload);
}

export async function runRepeatedSubmissionWorkflow(options = {}) {
  if (typeof options.executeAttempt !== 'function') throw new TypeError('executeAttempt is required');
  const result = {
    status: 'completed',
    completions: 0,
    attempts: 0,
    retries: 0,
    rewardPacksOpened: 0,
    rewardPacksPending: 0,
    reason: null,
    details: {},
  };
  const maxCompletions = completionLimit(options.maxCompletions);

  while (result.completions < maxCompletions) {
    await options.stopPoint?.();
    result.attempts++;
    const attempt = await options.executeAttempt({ result, attemptNo: result.attempts }) || { status: 'blocked' };
    await emit(options, 'attempt', { result, attempt });

    if (attempt.status === 'retry') {
      result.retries++;
      await options.afterRetry?.({ result, attempt });
      continue;
    }
    if (attempt.status === 'submitted' || attempt.submitted === true) {
      result.completions++;
      result.rewardPacksOpened += Number(attempt.rewardPacksOpened || 0);
      result.rewardPacksPending += Number(attempt.rewardPacksPending || 0);
      result.details = { ...result.details, ...(attempt.details || {}) };
      await options.afterCompletion?.({ result, attempt });
      if (attempt.stopAfterCompletion === true) {
        result.status = 'stopped';
        result.reason = attempt.reason || 'stopped after completion';
        break;
      }
      continue;
    }
    if (attempt.status === 'planned') {
      result.status = 'planned';
      result.reason = attempt.reason || 'submission planned';
      result.details = { ...result.details, ...(attempt.details || {}) };
      break;
    }
    if (attempt.status === 'unavailable') {
      result.status = 'unavailable';
      result.reason = attempt.reason || 'submission unavailable';
      break;
    }
    result.status = 'blocked';
    result.reason = attempt.reason || 'submission blocked';
    break;
  }

  await options.finalize?.(result);
  return result;
}
