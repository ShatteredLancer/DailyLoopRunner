function boundedCount(value, fallback = 1, max = 1000) {
  const number = Number(value);
  return Math.max(1, Math.min(max, Number.isFinite(number) ? Math.floor(number) : fallback));
}

async function emit(options, event, payload = {}) {
  await options.onEvent?.(event, payload);
}

export async function runPackAndCraftWorkflow(options = {}) {
  for (const name of ['findPack', 'openPack', 'runStages']) {
    if (typeof options[name] !== 'function') throw new TypeError(`${name} is required`);
  }

  const result = {
    status: 'completed',
    packsOpened: 0,
    stageCompletions: {},
    iterations: 0,
    reason: null,
  };
  const maxPacks = boundedCount(options.maxPacks, 1);
  const completionTarget = options.completionTarget?.id
    ? {
        id: String(options.completionTarget.id),
        max: boundedCount(options.completionTarget.max, 1),
      }
    : null;

  const recordStages = (stageResult = {}) => {
    for (const [id, count] of Object.entries(stageResult.completions || {})) {
      result.stageCompletions[id] = Number(result.stageCompletions[id] || 0) + Number(count || 0);
    }
  };
  const targetCompleted = () => completionTarget
    ? Number(result.stageCompletions[completionTarget.id] || 0)
    : 0;
  const targetRemaining = () => completionTarget
    ? Math.max(0, completionTarget.max - targetCompleted())
    : null;
  const targetReached = () => completionTarget !== null && targetRemaining() === 0;

  const resumed = await options.resume?.({ result });
  if (resumed?.status === 'blocked') {
    result.status = 'blocked';
    result.reason = resumed.reason || 'resume blocked';
  } else if (resumed?.status === 'planned') {
    result.status = 'planned';
    result.reason = resumed.reason || 'resume planned';
  } else if (resumed?.hasItems) {
    const stageResult = await options.runStages({ result, phase: 'resume', context: resumed });
    recordStages(stageResult);
    await emit(options, 'stages', { result, phase: 'resume', stageResult, context: resumed });
    if (stageResult?.status === 'blocked' || stageResult?.status === 'planned') {
      result.status = stageResult.status;
      result.reason = stageResult.reason || `resume stages ${stageResult.status}`;
    }
    await options.afterStages?.({ result, phase: 'resume', stageResult, context: resumed });
  }

  while (
    result.status === 'completed'
    && result.packsOpened < maxPacks
    && (!targetReached() || options.requireSourceExhaustion === true)
  ) {
    await options.stopPoint?.();
    result.iterations++;
    const before = await options.beforePack?.({ result });
    if (before?.status === 'blocked' || before?.status === 'planned') {
      result.status = before.status;
      result.reason = before.reason || `pre-pack ${before.status}`;
      break;
    }

    const pack = await options.findPack({ result });
    if (!pack) {
      await emit(options, 'pack-unavailable', { result });
      if (targetReached()) {
        result.reason = null;
      } else if (typeof options.onSourceExhausted === 'function') {
        const fallbackResult = await options.onSourceExhausted({
          result,
          completionTarget,
          remainingCompletions: targetRemaining(),
        }) || { status: 'unavailable', reason: 'source-exhausted fallback returned no result' };
        recordStages(fallbackResult);
        await emit(options, 'source-exhausted', { result, fallbackResult, completionTarget });
        if (fallbackResult.status === 'blocked' || fallbackResult.status === 'planned') {
          result.status = fallbackResult.status;
        } else if (fallbackResult.status === 'unavailable' && !targetReached()) {
          result.status = 'unavailable';
        } else if (completionTarget && !targetReached()) {
          result.status = 'unavailable';
        }
        result.reason = targetReached()
          ? null
          : (fallbackResult.reason || (!completionTarget
            ? null
            : 'source-exhausted fallback did not reach the completion target'));
      } else {
        result.status = 'unavailable';
        result.reason = 'no matching pack remains';
      }
      break;
    }

    const receipt = await options.openPack({ result, pack });
    await emit(options, 'pack', { result, pack, receipt });
    if (receipt?.status === 'planned') {
      result.status = 'planned';
      result.reason = receipt.reason || 'pack open planned';
      break;
    }
    if (receipt?.status === 'stale' || receipt?.status === 'unavailable') {
      await options.afterStalePack?.({ result, pack, receipt });
      continue;
    }
    if (receipt?.status !== 'opened') {
      result.status = 'blocked';
      result.reason = receipt?.reason || 'pack open blocked';
      break;
    }

    result.packsOpened++;
    const stageResult = await options.runStages({ result, phase: 'pack', pack, receipt, context: receipt.details || {} });
    recordStages(stageResult);
    await emit(options, 'stages', { result, phase: 'pack', pack, receipt, stageResult });
    if (stageResult?.status === 'blocked' || stageResult?.status === 'planned') {
      result.status = stageResult.status;
      result.reason = stageResult.reason || `pack stages ${stageResult.status}`;
      break;
    }
    await options.afterStages?.({ result, phase: 'pack', pack, receipt, stageResult });
  }

  if (result.status === 'completed' && completionTarget && !targetReached() && result.packsOpened >= maxPacks) {
    result.status = 'unavailable';
    result.reason = `source pack limit ${maxPacks} reached before the completion target`;
  } else if (result.status === 'completed' && options.requireSourceExhaustion === true && result.packsOpened >= maxPacks) {
    result.status = 'unavailable';
    result.reason = `source pack safety limit ${maxPacks} reached before source exhaustion`;
  }

  await options.finalize?.(result);
  return result;
}
