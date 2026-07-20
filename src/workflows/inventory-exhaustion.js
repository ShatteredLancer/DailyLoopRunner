async function emit(options, event, payload = {}) {
  await options.onEvent?.(event, payload);
}

export async function runInventoryExhaustionWorkflow(options = {}) {
  if (!Array.isArray(options.stages) || !options.stages.length) {
    throw new TypeError('stages must be a non-empty array');
  }
  if (typeof options.runStage !== 'function') throw new TypeError('runStage is required');

  const result = {
    status: 'completed',
    completedStages: [],
    totalCompletions: 0,
    reason: null,
  };

  for (let index = 0; index < options.stages.length; index++) {
    await options.stopPoint?.();
    const stage = options.stages[index];
    await emit(options, 'stage-start', { result, stage, index, total: options.stages.length });
    const stageResult = await options.runStage({ result, stage, index }) || { status: 'blocked' };
    await emit(options, 'stage-complete', { result, stage, index, stageResult });

    result.completedStages.push({ id: stage.id || `stage-${index + 1}`, result: stageResult });
    result.totalCompletions += Number(stageResult.completions || 0);

    if (stageResult.status === 'planned') {
      result.status = 'planned';
      result.reason ||= stageResult.reason || 'inventory exhaustion plan complete';
      continue;
    }
    if (stageResult.status === 'blocked' || stageResult.status === 'stopped') {
      result.status = stageResult.status;
      result.reason = stageResult.reason || `${stage.name || `stage ${index + 1}`} stopped`;
      break;
    }
  }

  await options.finalize?.(result);
  return result;
}
