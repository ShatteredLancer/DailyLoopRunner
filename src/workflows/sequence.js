async function emit(options, event, payload = {}) {
  await options.onEvent?.(event, payload);
}

export async function runSequenceWorkflow(options = {}) {
  if (!Array.isArray(options.steps)) throw new TypeError('steps must be an array');
  if (typeof options.runStep !== 'function') throw new TypeError('runStep is required');
  const result = {
    status: 'completed',
    completedSteps: [],
    skippedSteps: [],
    reason: null,
  };

  for (let index = 0; index < options.steps.length; index++) {
    await options.stopPoint?.();
    const baseStep = options.steps[index];
    await emit(options, 'step-start', { result, step: baseStep, index, total: options.steps.length });
    const before = await options.beforeStep?.({ result, step: baseStep, index, total: options.steps.length });
    if (before?.status === 'blocked') {
      result.status = 'blocked';
      result.reason = before.reason || `step ${index + 1} preflight blocked`;
      break;
    }

    const availability = await options.getAvailability?.({ result, step: baseStep, index, total: options.steps.length });
    if (availability && availability.available === false) {
      result.skippedSteps.push({ id: baseStep.id, reason: availability.reason || 'unavailable' });
      await emit(options, 'step-skipped', { result, step: baseStep, index, availability });
      continue;
    }

    const step = options.configureStep
      ? await options.configureStep({ result, step: baseStep, index, availability })
      : baseStep;
    const stepResult = await options.runStep({ result, step, index, availability });
    await emit(options, 'step-complete', { result, step, index, availability, stepResult });
    if (stepResult?.status === 'blocked') {
      result.status = 'blocked';
      result.reason = stepResult.reason || `step ${index + 1} blocked`;
      break;
    }
    result.completedSteps.push({ id: step.id, result: stepResult || null });
    await options.afterStep?.({ result, step, index, availability, stepResult });
  }

  await options.finalize?.(result);
  return result;
}
