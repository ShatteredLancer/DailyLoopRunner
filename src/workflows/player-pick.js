function pickLimit(value) {
  const number = Number(value);
  return Math.max(1, Math.min(200, Number.isFinite(number) ? Math.floor(number) : 1));
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

async function submitPickChallenges(options, result) {
  await options.stopPoint?.();
  const before = await options.beforePick?.({ result });
  if (before?.status === 'blocked' || before?.status === 'planned') {
    return {
      status: before.status,
      reason: before.reason || `pre-Pick ${before.status}`,
    };
  }

  const challengeContext = await options.loadChallenges({ result });
  if (!challengeContext) {
    return { status: 'unavailable', reason: 'Player Pick challenge list unavailable' };
  }
  const incomplete = challengeContext.incomplete || [];
  let planned = false;
  let submittedCount = 0;
  for (const entry of incomplete) {
    const submission = await options.submitChallenge({ result, challengeContext, entry });
    await emit(options, 'challenge', { result, challengeContext, entry, submission });
    const submissionOutcome = outcome(submission);
    if (submissionOutcome === 'submitted') {
      result.challengesSubmitted++;
      submittedCount++;
      await options.afterChallenge?.({ result, challengeContext, entry, submission });
      continue;
    }
    if (submissionOutcome === 'planned') {
      result.challengesPlanned++;
      planned = true;
      continue;
    }
    return {
      status: submissionOutcome,
      reason: submission?.reason || `Player Pick challenge ${submissionOutcome}`,
      challengeContext,
    };
  }
  if (planned) {
    return { status: 'planned', reason: 'Player Pick challenges planned', challengeContext };
  }
  return { status: 'submitted', challengeContext, submittedCount };
}

async function selectPick(options, result, pickItem, metadata = {}) {
  const selected = await options.redeemPick({ result, pickItem, ...metadata });
  await emit(options, 'pick', { result, pickItem, ...metadata, selected });
  const selectedOutcome = outcome(selected);
  if (selectedOutcome !== 'selected') {
    return {
      status: selectedOutcome,
      reason: selected?.reason || `Player Pick selection ${selectedOutcome}`,
    };
  }
  result.pickResults.push({ ...metadata, pickedCards: selected.pickedCards || [] });
  result.picksCompleted++;
  await options.afterPick?.({ result, ...metadata, selected });
  return { status: 'selected' };
}

async function runDeferredPlayerPicks(options, result, maxPicks) {
  if (typeof options.listPendingPicks !== 'function') throw new TypeError('listPendingPicks is required');
  let pending = await options.listPendingPicks({ result, minimumCount: 0, phase: 'initial' });
  pending = Array.isArray(pending) ? pending : [];
  let queuedCount = Math.min(maxPicks, pending.length);
  const initialQueuedCount = queuedCount;
  result.picksQueued = queuedCount;
  if (queuedCount) await emit(options, 'queue', { result, queuedCount, maxPicks, initial: true });

  while (result.status === 'completed' && queuedCount < maxPicks) {
    const submission = await submitPickChallenges(options, result);
    if (submission.status !== 'submitted') {
      result.status = submission.status;
      result.reason = submission.reason;
      break;
    }
    const noIncompleteChallenge = !submission.submittedCount && !submission.challengeContext?.incomplete?.length;

    pending = await options.listPendingPicks({
      result,
      minimumCount: queuedCount + 1,
      phase: 'queued-reward',
    });
    pending = Array.isArray(pending) ? pending : [];
    if (pending.length <= queuedCount) {
      if (noIncompleteChallenge && options.completeWhenNoChallengeRemains === true) {
        result.reason = null;
      } else {
        result.status = 'unavailable';
        result.reason = noIncompleteChallenge
          ? 'No incomplete Player Pick challenge remains'
          : 'Player Pick reward was not found';
      }
      break;
    }
    const previousCount = queuedCount;
    queuedCount = Math.min(maxPicks, pending.length);
    result.picksQueued = Math.max(result.picksQueued, queuedCount);
    await emit(options, 'queue', {
      result,
      queuedCount,
      added: queuedCount - previousCount,
      maxPicks,
      initial: false,
    });
  }

  const queuedStatus = result.status;
  const queuedReason = result.reason;
  if (queuedCount) await emit(options, 'batch-open', { result, queuedCount, maxPicks });
  while (result.picksCompleted < queuedCount) {
    await options.stopPoint?.();
    pending = await options.listPendingPicks({ result, minimumCount: 1, phase: 'redeem' });
    pending = Array.isArray(pending) ? pending : [];
    if (!pending.length) {
      result.status = 'unavailable';
      result.reason = 'Queued Player Pick reward was not found';
      break;
    }
    const selected = await selectPick(options, result, pending[0], {
      resumed: result.picksCompleted < initialQueuedCount,
      deferred: true,
    });
    if (selected.status !== 'selected') {
      result.status = selected.status;
      result.reason = selected.reason;
      break;
    }
  }
  if (result.picksCompleted === queuedCount && queuedStatus !== 'completed') {
    result.status = queuedStatus;
    result.reason = queuedReason;
  }
}

export async function runPlayerPickWorkflow(options = {}) {
  const deferred = options.openPicksAtEnd === true;
  const requiredCallbacks = deferred
    ? ['listPendingPicks', 'redeemPick', 'loadChallenges', 'submitChallenge']
    : ['findPendingPick', 'redeemPick', 'loadChallenges', 'submitChallenge', 'findRewardPick'];
  for (const name of requiredCallbacks) {
    if (typeof options[name] !== 'function') throw new TypeError(`${name} is required`);
  }

  const result = {
    status: 'completed',
    picksCompleted: 0,
    challengesSubmitted: 0,
    challengesPlanned: 0,
    picksQueued: 0,
    pickResults: [],
    reason: null,
  };
  const maxPicks = pickLimit(options.maxPicks);

  if (deferred) {
    await runDeferredPlayerPicks(options, result, maxPicks);
    await options.finalize?.(result);
    return result;
  }

  while (result.picksCompleted < maxPicks) {
    const pendingPick = await options.findPendingPick({ result });
    if (!pendingPick) break;
    const selected = await selectPick(options, result, pendingPick, { resumed: true, deferred: false });
    if (selected.status === 'selected') continue;
    result.status = selected.status;
    result.reason = selected.reason || `pending Pick ${selected.status}`;
    break;
  }

  while (result.status === 'completed' && result.picksCompleted < maxPicks) {
    const submission = await submitPickChallenges(options, result);
    if (submission.status !== 'submitted') {
      result.status = submission.status;
      result.reason = submission.reason;
      break;
    }
    if (!submission.submittedCount && !submission.challengeContext?.incomplete?.length) {
      if (options.completeWhenNoChallengeRemains === true) {
        result.reason = null;
        break;
      }
      result.status = 'unavailable';
      result.reason = 'No incomplete Player Pick challenge remains';
      break;
    }

    const rewardPick = await options.findRewardPick({ result, challengeContext: submission.challengeContext });
    if (!rewardPick) {
      result.status = 'unavailable';
      result.reason = 'Player Pick reward was not found';
      break;
    }
    const selected = await selectPick(options, result, rewardPick, { resumed: false, deferred: false });
    if (selected.status !== 'selected') {
      result.status = selected.status;
      result.reason = selected.reason;
      break;
    }
  }

  await options.finalize?.(result);
  return result;
}
