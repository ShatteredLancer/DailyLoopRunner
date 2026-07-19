function unavailableReason(value, fallback) {
  return value?.reason || fallback;
}

export async function runValidationRoundWorkflow(options = {}) {
  for (const name of ['inspectSourcePack', 'inspectSbc']) {
    if (typeof options[name] !== 'function') throw new TypeError(`${name} is required`);
  }

  const result = {
    status: 'completed',
    sourcePack: null,
    sbc: null,
    rewardPackId: null,
    reason: null,
  };

  result.sourcePack = await options.inspectSourcePack({ result });
  result.sbc = await options.inspectSbc({ result });
  if (!result.sourcePack) {
    result.status = 'unavailable';
    result.reason = 'source pack unavailable';
    await options.finalize?.(result);
    return result;
  }

  if (!result.sbc) {
    result.status = 'unavailable';
    result.reason = 'SBC unavailable';
    await options.finalize?.(result);
    return result;
  }

  if (options.dryRun === true) {
    result.status = 'planned';
    result.reason = 'validation round planned';
    await options.finalize?.(result);
    return result;
  }

  for (const name of ['openSourcePack', 'submitSbc', 'openReward']) {
    if (typeof options[name] !== 'function') throw new TypeError(`${name} is required for live validation`);
  }

  const opened = await options.openSourcePack({ result, sourcePack: result.sourcePack });
  if (opened?.status && opened.status !== 'opened') {
    result.status = opened.status === 'unavailable' ? 'unavailable' : 'blocked';
    result.reason = unavailableReason(opened, 'source pack open failed');
    await options.finalize?.(result);
    return result;
  }

  const submission = await options.submitSbc({ result, sbc: result.sbc });
  if (!submission?.submitted && submission?.status !== 'submitted') {
    result.status = submission?.status === 'unavailable' ? 'unavailable' : 'blocked';
    result.reason = unavailableReason(submission, 'SBC submit failed');
    await options.finalize?.(result);
    return result;
  }
  result.rewardPackId = submission.rewardPackId ?? null;

  const reward = await options.openReward({ result, rewardPackId: result.rewardPackId });
  if (reward?.status && reward.status !== 'opened') {
    result.status = reward.status === 'unavailable' ? 'unavailable' : 'blocked';
    result.reason = unavailableReason(reward, 'reward pack open failed');
  }

  await options.finalize?.(result);
  return result;
}
