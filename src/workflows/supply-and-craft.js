function positiveInteger(value, fallback = 1, max = 1000) {
  const number = Number(value);
  return Math.max(1, Math.min(max, Number.isFinite(number) ? Math.floor(number) : fallback));
}

async function emit(options, event, payload = {}) {
  await options.onEvent?.(event, payload);
}

export async function runSupplyAndCraftWorkflow(options = {}) {
  if (typeof options.challengeProvider !== 'function') throw new TypeError('challengeProvider is required');
  if (typeof options.selectPrimary !== 'function') throw new TypeError('selectPrimary is required');
  if (typeof options.submit !== 'function') throw new TypeError('submit is required');

  const maxCompletions = positiveInteger(options.maxCompletions, 1);
  const result = {
    status: 'completed',
    completions: 0,
    iterations: 0,
    supplyRuns: [],
    reason: null,
    lastSelection: null,
  };

  while (result.completions < maxCompletions) {
    await options.stopPoint?.();
    result.iterations++;
    const iteration = result.iterations;
    const before = await options.beforeIteration?.({ iteration, result }) || {};
    let preserveSupply = before.preserveSupply === true;
    let challengeContext = await options.challengeProvider({ iteration, result, refresh: false });
    if (!challengeContext?.challenge || !challengeContext?.set) {
      result.status = 'unavailable';
      result.reason = challengeContext?.reason || 'no available SBC challenge';
      await emit(options, 'challenge-unavailable', { iteration, result });
      break;
    }

    await options.refreshInventory?.({ iteration, result, challengeContext });
    let selection = await options.selectPrimary({ iteration, result, challengeContext });
    result.lastSelection = selection;
    await emit(options, 'selection', { phase: 'primary', iteration, selection, preserveSupply });

    let supplied = false;
    if (!selection?.ok && !preserveSupply) {
      for (const supply of options.supplies || []) {
        const maxRuns = supply.repeatUntilSatisfied === true
          ? positiveInteger(supply.maxRuns, 100, 1000)
          : 1;
        for (let run = 1; run <= maxRuns && !selection?.ok && !preserveSupply; run++) {
          await options.stopPoint?.();
          const supplyResult = await supply.provide({
            iteration,
            result,
            challengeContext,
            selection,
            supply,
            run,
          }) || { status: 'unavailable' };
          const record = { id: String(supply.id || 'supply'), run, ...supplyResult };
          result.supplyRuns.push(record);
          await emit(options, 'supply', { iteration, supply, supplyResult: record, selection });

          if (supplyResult.status === 'planned') {
            result.status = 'planned';
            result.reason = supplyResult.reason || `supply ${record.id} would be opened`;
            break;
          }
          if (supplyResult.status === 'blocked') {
            result.status = 'blocked';
            result.reason = supplyResult.reason || `supply ${record.id} is blocked`;
            break;
          }
          if (supplyResult.status === 'preserved') {
            preserveSupply = true;
            break;
          }
          if (supplyResult.status !== 'provided') break;

          supplied = true;
          await options.refreshInventory?.({ iteration, result, challengeContext, supply, supplyResult });
          selection = await options.selectPrimary({ iteration, result, challengeContext, supply, supplyResult });
          result.lastSelection = selection;
          await emit(options, 'selection', { phase: 'after-supply', iteration, selection, supply, preserveSupply });
          preserveSupply = supplyResult.preserveSupply === true;
        }
        if (result.status === 'planned' || result.status === 'blocked' || selection?.ok || preserveSupply) break;
      }
    } else if (!selection?.ok && preserveSupply) {
      await emit(options, 'supply-skipped', { iteration, selection, reason: 'preserved-unassigned' });
    }

    if (result.status === 'planned' || result.status === 'blocked') break;

    if (!selection?.ok && typeof options.selectFallback === 'function') {
      selection = await options.selectFallback({ iteration, result, challengeContext, preserveSupply });
      result.lastSelection = selection;
      await emit(options, 'selection', { phase: 'fallback', iteration, selection, preserveSupply });
    }

    if (!selection?.ok) {
      result.status = 'insufficient';
      result.reason = selection?.missing
        ? `missing ${Number(selection.missing.count || 0)} player(s)`
        : 'inventory selection is incomplete';
      await emit(options, 'selection-insufficient', { iteration, selection, preserveSupply });
      break;
    }

    if (supplied && typeof options.challengeProvider === 'function') {
      challengeContext = await options.challengeProvider({ iteration, result, refresh: true, previous: challengeContext });
      if (!challengeContext?.challenge || !challengeContext?.set) {
        result.status = 'unavailable';
        result.reason = challengeContext?.reason || 'no available SBC challenge after supply';
        await emit(options, 'challenge-unavailable', { iteration, result, afterSupply: true });
        break;
      }
    }

    const submission = await options.submit({ iteration, result, challengeContext, selection });
    await emit(options, 'submission', { iteration, submission, selection });
    if (submission?.submitted === true || submission?.status === 'submitted') {
      result.completions++;
      await options.afterSubmission?.({ iteration, result, challengeContext, selection, submission });
      continue;
    }
    if (submission?.status === 'planned') {
      result.status = 'planned';
      result.reason = submission.reason || 'submission planned';
      break;
    }
    result.status = submission?.status === 'unavailable' ? 'unavailable' : 'blocked';
    result.reason = submission?.reason || 'SBC submission did not complete';
    break;
  }

  await options.finalize?.(result);
  return result;
}
