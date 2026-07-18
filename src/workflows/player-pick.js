function pickLimit(value) {
  const number = Number(value);
  return Math.max(1, Math.min(100, Number.isFinite(number) ? Math.floor(number) : 1));
}

function outcome(value) {
  if (value?.status === 'selected') return 'selected';
  if (value?.submitted === true || value?.status === 'submitted') return 'submitted';
  if (value?.status === 'planned') return 'planned';
  if (value?.status === 'unavailable') return 'unavailable';
  return 'blocked';
}

async function emit(options, event, payload = {}) {
  await options.onEvent?.(event, payload);
}

export async function runPlayerPickWorkflow(options = {}) {
  for (const name of ['findPendingPick', 'redeemPick', 'loadChallenges', 'submitChallenge', 'findRewardPick']) {
    if (typeof options[name] !== 'function') throw new TypeError(`${name} is required`);
  }

  const result = {
    status: 'completed',
    picksCompleted: 0,
    challengesSubmitted: 0,
    challengesPlanned: 0,
    pickResults: [],
    reason: null,
  };
  const maxPicks = pickLimit(options.maxPicks);

  while (result.picksCompleted < maxPicks) {
    const pendingPick = await options.findPendingPick({ result });
    if (!pendingPick) break;
    const selected = await options.redeemPick({ result, pickItem: pendingPick, resumed: true });
    await emit(options, 'pick', { result, pickItem: pendingPick, resumed: true, selected });
    const selectedOutcome = outcome(selected);
    if (selectedOutcome === 'selected') {
      result.pickResults.push({ resumed: true, pickedCards: selected.pickedCards || [] });
      result.picksCompleted++;
      await options.afterPick?.({ result, resumed: true, selected });
      continue;
    }
    result.status = selectedOutcome;
    result.reason = selected?.reason || `pending Pick ${selectedOutcome}`;
    break;
  }

  while (result.status === 'completed' && result.picksCompleted < maxPicks) {
    await options.stopPoint?.();
    const before = await options.beforePick?.({ result });
    if (before?.status === 'blocked' || before?.status === 'planned') {
      result.status = before.status;
      result.reason = before.reason || `pre-Pick ${before.status}`;
      break;
    }

    const challengeContext = await options.loadChallenges({ result });
    if (!challengeContext) {
      result.status = 'unavailable';
      result.reason = 'Player Pick challenge list unavailable';
      break;
    }
    const incomplete = challengeContext.incomplete || [];
    let planned = false;
    for (const entry of incomplete) {
      const submission = await options.submitChallenge({ result, challengeContext, entry });
      await emit(options, 'challenge', { result, challengeContext, entry, submission });
      const submissionOutcome = outcome(submission);
      if (submissionOutcome === 'submitted') {
        result.challengesSubmitted++;
        await options.afterChallenge?.({ result, challengeContext, entry, submission });
        continue;
      }
      if (submissionOutcome === 'planned') {
        result.challengesPlanned++;
        planned = true;
        continue;
      }
      result.status = submissionOutcome;
      result.reason = submission?.reason || `Player Pick challenge ${submissionOutcome}`;
      break;
    }
    if (result.status !== 'completed') break;
    if (planned) {
      result.status = 'planned';
      result.reason = 'Player Pick challenges planned';
      break;
    }

    const rewardPick = await options.findRewardPick({ result, challengeContext });
    if (!rewardPick) {
      result.status = 'unavailable';
      result.reason = 'Player Pick reward was not found';
      break;
    }
    const selected = await options.redeemPick({ result, pickItem: rewardPick, resumed: false });
    await emit(options, 'pick', { result, pickItem: rewardPick, resumed: false, selected });
    const selectedOutcome = outcome(selected);
    if (selectedOutcome !== 'selected') {
      result.status = selectedOutcome;
      result.reason = selected?.reason || `Player Pick selection ${selectedOutcome}`;
      break;
    }
    result.pickResults.push({ resumed: false, pickedCards: selected.pickedCards || [] });
    result.picksCompleted++;
    await options.afterPick?.({ result, resumed: false, selected });
  }

  await options.finalize?.(result);
  return result;
}
