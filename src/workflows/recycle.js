function completionLimit(value) {
  const number = Number(value);
  return Math.max(1, Math.min(1000, Number.isFinite(number) ? Math.floor(number) : 1));
}

async function emit(options, event, payload = {}) {
  await options.onEvent?.(event, payload);
}

function submissionOutcome(submission) {
  if (submission?.submitted === true || submission?.status === 'submitted') return 'submitted';
  if (submission?.status === 'planned') return 'planned';
  if (submission?.status === 'unavailable') return 'unavailable';
  return 'blocked';
}

export async function runRecycleWorkflow(options = {}) {
  for (const name of ['inspectTargets', 'findPack', 'consumeTarget', 'openPack', 'submitSeed']) {
    if (typeof options[name] !== 'function') throw new TypeError(`${name} is required`);
  }

  const result = {
    status: 'completed',
    completions: 0,
    packsOpened: 0,
    lastRewardPackId: null,
    iterations: 0,
    reason: null,
  };
  const maxCompletions = completionLimit(options.maxCompletions);

  while (result.completions < maxCompletions) {
    await options.stopPoint?.();
    result.iterations++;
    const targets = await options.inspectTargets({ result }) || [];
    await emit(options, 'targets', { result, targets });

    if (targets.length) {
      const submission = await options.consumeTarget({ result, targets, target: targets[0] });
      await emit(options, 'target-submission', { result, targets, submission });
      const outcome = submissionOutcome(submission);
      if (outcome === 'submitted') {
        result.completions++;
        result.lastRewardPackId = submission.rewardPackId ?? null;
        await options.afterSubmission?.({ result, submission, source: 'target' });
        continue;
      }
      result.status = outcome;
      result.reason = submission?.reason || `target submission ${outcome}`;
      break;
    }

    const pack = await options.findPack({ result, rewardPackId: result.lastRewardPackId });
    if (pack) {
      const receipt = await options.openPack({ result, pack });
      await emit(options, 'pack', { result, pack, receipt });
      if (receipt?.status === 'opened') {
        result.packsOpened++;
        result.lastRewardPackId = null;
        await options.afterPack?.({ result, pack, receipt });
        continue;
      }
      if (receipt?.status === 'planned') {
        result.status = 'planned';
        result.reason = receipt.reason || 'pack open planned';
        break;
      }
      if (receipt?.status === 'stale' || receipt?.status === 'unavailable') {
        result.lastRewardPackId = null;
        await options.afterStalePack?.({ result, pack, receipt });
        continue;
      }
      result.status = 'blocked';
      result.reason = receipt?.reason || 'pack open blocked';
      break;
    }

    const submission = await options.submitSeed({ result });
    await emit(options, 'seed-submission', { result, submission });
    const outcome = submissionOutcome(submission);
    if (outcome === 'submitted') {
      result.completions++;
      result.lastRewardPackId = submission.rewardPackId ?? null;
      await options.afterSubmission?.({ result, submission, source: 'seed' });
      continue;
    }
    result.status = outcome;
    result.reason = submission?.reason || `seed submission ${outcome}`;
    break;
  }

  if (result.lastRewardPackId !== null && options.openFinalReward) {
    const finalReceipt = await options.openFinalReward({ result, rewardPackId: result.lastRewardPackId });
    await emit(options, 'final-reward', { result, receipt: finalReceipt });
    if (finalReceipt?.status === 'opened') {
      result.packsOpened++;
      result.lastRewardPackId = null;
    } else if (finalReceipt?.status === 'blocked') {
      result.status = 'blocked';
      result.reason = finalReceipt.reason || 'final reward pack blocked';
    }
  }

  await options.finalize?.(result);
  return result;
}
