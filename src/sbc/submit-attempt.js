import { createSubmissionResult } from '../domain/contracts.js';

async function runValidators(validators, context, phase) {
  for (const validator of validators || []) {
    const result = await validator(context);
    if (result === false) throw new Error(`${phase} validator rejected the SBC attempt`);
    if (result?.ok === false) throw new Error(result.reason || `${phase} validator rejected the SBC attempt`);
  }
}

export async function submitSbcAttempt(options = {}) {
  const challengeContext = await options.challengeProvider?.();
  if (!challengeContext?.challenge || !challengeContext?.set) {
    return createSubmissionResult({
      status: 'unavailable',
      submitted: false,
      reason: challengeContext?.reason || 'no available SBC challenge',
    });
  }

  const context = {
    ...challengeContext,
    label: options.label || challengeContext.set?.name || 'SBC',
    dryRun: options.dryRun === true,
  };
  const squadPlan = await options.squadProvider?.(context);
  if (!squadPlan?.ok) {
    return createSubmissionResult({
      status: 'blocked',
      submitted: false,
      challengeRef: context.challengeRef || { id: context.challenge?.id || null },
      reason: squadPlan?.reason || 'squad provider did not produce a valid plan',
    });
  }
  context.squadPlan = squadPlan;
  context.players = squadPlan.players || [];

  if (context.dryRun) {
    await runValidators(options.preSaveValidators, context, 'pre-save');
    return createSubmissionResult({
      status: 'planned',
      submitted: false,
      challengeRef: context.challengeRef || { id: context.challenge?.id || null },
      consumedItemRefs: squadPlan.itemRefs || [],
    });
  }

  let accessToken;
  try {
    if (options.prepareRuntimeAccess) {
      const access = await options.prepareRuntimeAccess(context);
      context.runtimeAccess = access || null;
      if (access?.ok === false) {
        return createSubmissionResult({
          status: 'blocked',
          submitted: false,
          challengeRef: context.challengeRef || { id: context.challenge?.id || null },
          consumedItemRefs: squadPlan.itemRefs || [],
          reason: access.reason || 'runtime inventory validation failed',
        });
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

    await runValidators(options.preSaveValidators, context, 'pre-save');
    await options.saveSquad?.(context);
    if (options.reloadSquad) await options.reloadSquad(context);
    if (options.readSavedPlayers) context.savedPlayers = await options.readSavedPlayers(context);
    await runValidators(options.postSaveValidators, context, 'post-save');

    if (options.prepareOnly === true) {
      return createSubmissionResult({
        status: 'prepared',
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: context.squadPlan.itemRefs || [],
      });
    }

    const submitReady = options.isSubmitReady ? await options.isSubmitReady(context) : true;
    if (!submitReady) {
      return createSubmissionResult({
        status: 'blocked',
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: context.squadPlan.itemRefs || [],
        reason: 'saved squad is not submit ready',
      });
    }

    const transportResult = await options.submitTransport?.(context);
    if (transportResult?.submitted === false || transportResult?.ok === false) {
      return createSubmissionResult({
        status: 'blocked',
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: context.squadPlan.itemRefs || [],
        reason: transportResult?.reason || 'SBC submit transport failed',
      });
    }

    const result = createSubmissionResult({
      status: 'submitted',
      submitted: true,
      challengeRef: context.challengeRef || { id: context.challenge?.id || null },
      consumedItemRefs: context.squadPlan.itemRefs || [],
      rewardPackId: transportResult?.rewardPackId,
    });
    if (options.afterSubmit) await options.afterSubmit({ ...context, result, transportResult });
    return result;
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

export function createExistingSquadProvider({ getPlayers, itemRef, source = 'existing-squad' }) {
  return async (context) => {
    const players = await getPlayers(context);
    if (!Array.isArray(players) || !players.length) {
      return { ok: false, reason: `${source} did not expose any players` };
    }
    return {
      ok: true,
      players,
      itemRefs: players.map(itemRef),
      source,
    };
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
