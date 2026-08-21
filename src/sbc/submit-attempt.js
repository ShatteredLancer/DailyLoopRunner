import { createSubmissionResult } from '../domain/contracts.js';

async function runValidators(validators, context, phase) {
  for (const validator of validators || []) {
    const result = await validator(context);
    if (result === false) throw new Error(`${phase} validator rejected the SBC attempt`);
    if (result?.ok === false) throw new Error(result.reason || `${phase} validator rejected the SBC attempt`);
  }
}

async function resolveSubmitReadiness(options, context) {
  const maxAttempts = Math.max(1, Math.min(5, Number(options.submitReadyAttempts || 1) || 1));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ready = options.isSubmitReady ? await options.isSubmitReady(context) : true;
    if (ready || attempt >= maxAttempts) return ready;
    await options.onSubmitNotReady?.({ context, attempt, maxAttempts });
  }
  return false;
}

async function publishResult(options, result, context = {}) {
  if (typeof options.onResult !== 'function') return result;
  try {
    await options.onResult(result, context);
  } catch (error) {
    try { await options.onResultError?.(error, { result, context }); } catch { }
  }
  return result;
}

export async function submitSbcAttempt(options = {}) {
  const challengeContext = await options.challengeProvider?.();
  if (!challengeContext?.challenge || !challengeContext?.set) {
    return publishResult(options, createSubmissionResult({
      status: 'unavailable',
      submitted: false,
      reason: challengeContext?.reason || 'no available SBC challenge',
    }), { phase: 'challenge' });
  }

  const context = {
    ...challengeContext,
    label: options.label || challengeContext.set?.name || 'SBC',
    dryRun: options.dryRun === true,
  };
  const squadPlan = await options.squadProvider?.(context);
  if (!squadPlan?.ok) {
    return publishResult(options, createSubmissionResult({
      status: 'blocked',
      submitted: false,
      challengeRef: context.challengeRef || { id: context.challenge?.id || null },
      reason: squadPlan?.reason || 'squad provider did not produce a valid plan',
    }), { phase: 'squad', context });
  }
  context.squadPlan = squadPlan;
  context.players = squadPlan.players || [];

  if (context.dryRun) {
    await runValidators(options.preSaveValidators, context, 'pre-save');
    return publishResult(options, createSubmissionResult({
      status: 'planned',
      submitted: false,
      challengeRef: context.challengeRef || { id: context.challenge?.id || null },
      consumedItemRefs: squadPlan.itemRefs || [],
    }), { phase: 'dry-run', context });
  }

  let accessToken;
  try {
    if (options.prepareRuntimeAccess) {
      const access = await options.prepareRuntimeAccess(context);
      context.runtimeAccess = access || null;
      if (access?.ok === false) {
        return publishResult(options, createSubmissionResult({
          status: 'blocked',
          submitted: false,
          challengeRef: context.challengeRef || { id: context.challenge?.id || null },
          consumedItemRefs: squadPlan.itemRefs || [],
          reason: access.reason || 'runtime inventory validation failed',
        }), { phase: 'runtime-access', context });
      }
      if (Array.isArray(access?.players)) {
        context.players = access.players;
        context.squadPlan = {
          ...context.squadPlan,
          players: access.players,
          itemRefs: access.itemRefs || context.squadPlan.itemRefs,
        };
      }
      accessToken = access?.token;
    }

    if (options.preparePlayers) {
      const prepared = await options.preparePlayers(context);
      context.playerPreparation = prepared || null;
      if (prepared?.ok === false) {
        return publishResult(options, createSubmissionResult({
          status: 'blocked',
          submitted: false,
          challengeRef: context.challengeRef || { id: context.challenge?.id || null },
          consumedItemRefs: context.squadPlan.itemRefs || [],
          reason: prepared.reason || 'SBC player preparation failed',
        }), { phase: 'player-preparation', context });
      }
      if (prepared?.replan === true || prepared?.status === 'replan') {
        return publishResult(options, createSubmissionResult({
          status: 'replan',
          submitted: false,
          challengeRef: context.challengeRef || { id: context.challenge?.id || null },
          consumedItemRefs: context.squadPlan.itemRefs || [],
          reason: prepared.reason || 'inventory changed during player preparation; replan required',
          reasonCode: prepared.reasonCode || 'PLAYER_PREPARATION_REPLAN',
          details: prepared.details,
        }), { phase: 'player-preparation-replan', context });
      }
      if (Array.isArray(prepared?.players)) {
        context.players = prepared.players;
        context.squadPlan = {
          ...context.squadPlan,
          players: prepared.players,
          itemRefs: prepared.itemRefs || context.squadPlan.itemRefs,
          ...(prepared.selection ? { selection: prepared.selection } : {}),
        };
      }
    }

    await runValidators(options.preSaveValidators, context, 'pre-save');
    await options.saveSquad?.(context);
    if (options.reloadSquad) await options.reloadSquad(context);
    if (options.readSavedPlayers) context.savedPlayers = await options.readSavedPlayers(context);
    await runValidators(options.postSaveValidators, context, 'post-save');

    if (options.prepareOnly === true) {
      return publishResult(options, createSubmissionResult({
        status: 'prepared',
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: context.squadPlan.itemRefs || [],
      }), { phase: 'prepared', context });
    }

    const submitReady = await resolveSubmitReadiness(options, context);
    if (!submitReady) {
      return publishResult(options, createSubmissionResult({
        status: 'blocked',
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: context.squadPlan.itemRefs || [],
        reason: 'saved squad is not submit ready',
      }), { phase: 'readiness', context });
    }

    if (options.readFinalPlayers) {
      context.finalPlayers = await options.readFinalPlayers(context);
    }
    await runValidators(options.finalValidators, context, 'final');

    const runCommittedSubmit = typeof options.runCommittedSubmit === 'function'
      ? options.runCommittedSubmit
      : async (operation) => operation();
    return await runCommittedSubmit(async () => {
      const transportResult = await options.submitTransport?.(context);
      if (transportResult?.submitted === false || transportResult?.ok === false) {
        return publishResult(options, createSubmissionResult({
          status: transportResult?.status || 'blocked',
          submitted: false,
          challengeRef: context.challengeRef || { id: context.challenge?.id || null },
          consumedItemRefs: context.squadPlan.itemRefs || [],
          reason: transportResult?.reason || 'SBC submit transport failed',
          reasonCode: transportResult?.reasonCode,
          details: transportResult?.details,
        }), { phase: 'transport', context, transportResult });
      }

      const result = createSubmissionResult({
        status: 'submitted',
        submitted: true,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: context.squadPlan.itemRefs || [],
        rewardPackId: transportResult?.rewardPackId,
      });
      await publishResult(options, result, { phase: 'submitted', context, transportResult });
      if (options.afterSubmit) {
        const afterSubmit = await options.afterSubmit({ ...context, result, transportResult });
        if (afterSubmit?.ok === false) {
          return {
            ...result,
            postSubmitBlocked: true,
            reason: afterSubmit.reason || 'post-submit inventory finalization failed',
            reasonCode: afterSubmit.reasonCode || 'POST_SUBMIT_FINALIZATION_BLOCKED',
            details: afterSubmit.details || result.details,
          };
        }
      }
      return result;
    }, context);
  } finally {
    if (options.releaseRuntimeAccess) await options.releaseRuntimeAccess({ ...context, token: accessToken });
  }
}

export function createInventorySquadProvider({ prepareSelection, selection, itemRef }) {
  return async (context) => {
    const prepared = await prepareSelection(context, selection);
    if (!prepared?.ok) return { ok: false, reason: prepared?.missing ? `missing ${prepared.missing.count} player(s)` : 'inventory preparation failed' };
    return {
      ok: true,
      players: prepared.selected || [],
      itemRefs: (prepared.selected || []).map(itemRef),
      selection: prepared,
    };
  };
}

export function createExistingSquadProvider({ getPlayers, itemRef, selection = null, source = 'existing-squad' }) {
  return async (context) => {
    const players = await getPlayers(context);
    if (!Array.isArray(players) || !players.length) {
      return { ok: false, reason: `${source} did not expose any players` };
    }
    const result = {
      ok: true,
      players,
      itemRefs: players.map(itemRef),
      source,
    };
    if (selection) result.selection = selection;
    return result;
  };
}

export function createFsuFillProvider({ fill, getPlayers, itemRef }) {
  return async (context) => {
    const fillResult = await fill(context);
    const players = await getPlayers({ ...context, fillResult });
    if (!Array.isArray(players) || !players.length) {
      return { ok: false, reason: 'FSU fill did not expose any players', fillResult };
    }
    return {
      ok: true,
      players,
      itemRefs: players.map(itemRef),
      fillResult,
      source: 'fsu-fill',
    };
  };
}
