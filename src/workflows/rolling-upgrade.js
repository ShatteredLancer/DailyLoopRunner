export const ROLLING_UPGRADE_PHASES = Object.freeze({
  PREFLIGHT: 'PREFLIGHT',
  INDEX_INVENTORY: 'INDEX_INVENTORY',
  BOOTSTRAP_OR_FIND_REWARD: 'BOOTSTRAP_OR_FIND_REWARD',
  OPEN_PRIMARY_REWARD: 'OPEN_X10',
  CLASSIFY_OPENED_ITEMS: 'CLASSIFY_OPENED_ITEMS',
  RESOLVE_PROTECTED_STORAGE: 'RESOLVE_PROTECTED_STORAGE',
  PROCESS_RECOVERY_REWARD: 'PROCESS_RECOVERY_REWARD',
  DRAIN_RECOVERY_DUPLICATES: 'DRAIN_RECOVERY_DUPLICATES',
  RECOVER_PROVISIONS: 'RECOVER_PROVISIONS',
  RECOVER_STORAGE_SINK: 'RECOVER_STORAGE_SINK',
  RECOVER_REQUIRED_SPECIAL: 'RECOVER_REQUIRED_SPECIAL',
  MAINTAIN_STORAGE: 'MAINTAIN_STORAGE',
  REDEEM_RARE_GOLD_PICK: 'REDEEM_RARE_GOLD_PICK',
  CRAFT_5X80: 'CRAFT_5X80',
  PLAN_PRIMARY_SQUAD: 'PLAN_PRIMARY_SQUAD',
  SUBMIT_PRIMARY: 'SUBMIT_PRIMARY',
  RECONCILE_LEDGER: 'RECONCILE_LEDGER',
});

const DEFAULT_MAX_ITERATIONS = 10000;
const DEFAULT_MAX_RECEIPTS = 100;
const DEFAULT_SHORTAGE_PROVISIONS_PACK_LIMIT = 2;
const DEFAULT_RECOVERY_BUDGETS = Object.freeze({
  total: 100,
  reward: 30,
  goldDrain: 40,
  provisions: 20,
  storageSink: 3,
  requiredSpecial: 10,
  storageMaintenance: 40,
});

const FODDER_SHORTAGE_CODES = new Set([
  'PLAYER_COUNT_SHORTAGE',
  'SQUAD_RATING_SHORTAGE',
  'SQUAD_RATING_EXCESS',
  'RESERVED_FODDER_BLOCKED',
]);

export function chooseRollingRequiredSpecialRecoveryAction(input = {}) {
  if (input.trigger === 'storage-sink-required-special-shortage'
    && input.hasPendingUnassignedPrimaryDuplicates === true) {
    return 'craft-storage-pressure';
  }
  if (input.hasExistingPack === true) return 'open-existing-pack';
  return input.trigger === 'storage-sink-required-special-shortage'
    ? 'craft-storage-pressure'
    : 'craft-standard';
}

function completionLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1000, Math.floor(number)));
}

function boundedPositive(value, fallback, max) {
  const number = Number(value);
  return Math.max(1, Math.min(max, Number.isFinite(number) ? Math.floor(number) : fallback));
}

function reasonCode(value = {}) {
  const source = value || {};
  return source.reasonCode || source.code || source.missing?.code || source.details?.reasonCode || null;
}

function effectReason(value, fallback) {
  return value?.reason || value?.missing?.reason || fallback;
}

function isBlocked(value) {
  return value?.ok === false
    || ['blocked', 'unavailable', 'insufficient', 'failed'].includes(String(value?.status || ''));
}

function isStopped(value) {
  return value === true || value?.stopped === true || value?.status === 'stopped';
}

function isProgressed(value) {
  return value?.progressed === true
    || value?.submitted === true
    || ['progressed', 'submitted', 'opened', 'selected'].includes(String(value?.status || ''));
}

function boundedBudget(value, fallback) {
  const number = Number(value);
  return Math.max(1, Math.min(1000, Number.isFinite(number) ? Math.floor(number) : fallback));
}

function recoveryBudgets(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_RECOVERY_BUDGETS).map(([key, fallback]) => [
    key,
    boundedBudget(value?.[key], fallback),
  ]));
}

function recoveryFingerprint(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

async function emit(options, event, payload) {
  await options.onEvent?.(event, payload);
}

export async function runRollingUpgradeWorkflow(options = {}) {
  const requiredCallbacks = [
    'initializeInventory',
    'findPrimaryPack',
    'openPrimaryPack',
    'planPrimarySquad',
    'submitPrimary',
  ];
  for (const name of requiredCallbacks) {
    if (typeof options[name] !== 'function') throw new TypeError(`${name} is required`);
  }

  const maxCompletions = completionLimit(options.maxCompletions);
  const maxIterations = boundedPositive(options.maxIterations, DEFAULT_MAX_ITERATIONS, 100000);
  const maxReceipts = boundedPositive(options.maxReceipts, DEFAULT_MAX_RECEIPTS, 1000);
  const retainReceipts = options.retainReceipts !== false;
  const surplusCraftingEnabled = options.surplusCraftingEnabled === true;
  const provisionsShortageRecoveryEnabled = options.provisionsShortageRecoveryEnabled === true;
  const requiredSpecialRecoveryEnabled = options.requiredSpecialRecoveryEnabled === true;
  const shortageProvisionsPackLimit = boundedPositive(
    options.shortageProvisionsPackLimit,
    DEFAULT_SHORTAGE_PROVISIONS_PACK_LIMIT,
    30,
  );
  const budgets = recoveryBudgets(options.recoveryBudgets);
  const result = {
    status: 'completed',
    phase: ROLLING_UPGRADE_PHASES.PREFLIGHT,
    completions: 0,
    iterations: 0,
    packsOpened: 0,
    bootstrapSubmissions: 0,
    receiptCount: 0,
    receipts: [],
    inventoryDelta: null,
    reason: null,
    reasonCode: null,
    lastPlan: null,
    recoveries: {
      total: 0,
      reward: 0,
      goldDrain: 0,
      provisions: 0,
      storageSink: 0,
      requiredSpecial: 0,
      storageMaintenance: 0,
    },
    details: {},
  };
  let cycleRecoveries = {
    total: 0,
    reward: 0,
    goldDrain: 0,
    provisions: 0,
    storageSink: 0,
    requiredSpecial: 0,
    storageMaintenance: 0,
  };

  function rememberReceipt(receipt) {
    if (!receipt) return;
    result.receiptCount++;
    if (!retainReceipts) return;
    result.receipts.push(receipt);
    if (result.receipts.length > maxReceipts) {
      result.receipts.splice(0, result.receipts.length - maxReceipts);
    }
  }

  async function enter(phase, details = {}) {
    result.phase = phase;
    await emit(options, 'phase', {
      phase,
      completions: result.completions,
      iterations: result.iterations,
      ...details,
    });
  }

  function finish(status, value, fallbackReason, fallbackCode = null) {
    result.status = status;
    result.reason = effectReason(value, fallbackReason);
    result.reasonCode = reasonCode(value) || fallbackCode;
    if (value?.details) result.details = { ...result.details, ...value.details };
    if (value?.inventoryDelta) result.inventoryDelta = value.inventoryDelta;
    return result;
  }

  async function stopRequested() {
    if (isStopped(await options.shouldStop?.({ result, phase: result.phase }))) return true;
    if (isStopped(await options.stopPoint?.({ result, phase: result.phase }))) return true;
    return false;
  }

  async function runRecovery(kind, phase, callback, context = {}) {
    if (typeof callback !== 'function') return { status: 'skipped', reason: `${kind} recovery is unavailable` };
    if (cycleRecoveries.total >= budgets.total || cycleRecoveries[kind] >= budgets[kind]) {
      return {
        status: 'blocked',
        reason: `${kind} recovery budget reached before primary progress`,
        reasonCode: 'RECOVERY_BUDGET_REACHED',
        details: { kind, budgets: { ...budgets }, cycleRecoveries: { ...cycleRecoveries } },
      };
    }
    if (await stopRequested()) return { status: 'stopped', reason: 'stopped by user', reasonCode: 'USER_STOPPED' };
    await enter(phase, { recovery: kind, trigger: context.trigger || null });
    const before = recoveryFingerprint(await options.getProgressFingerprint?.({
      result,
      phase,
      kind,
      context,
    }));
    const value = await callback({
      result,
      phase,
      kind,
      context,
      cycleRecoveries: { ...cycleRecoveries },
      budgets: { ...budgets },
      reportPhase: (nextPhase, details = {}) => enter(nextPhase, {
        recovery: kind,
        trigger: context.trigger || null,
        ...details,
      }),
    }) || { status: 'unavailable', reason: `${kind} recovery returned no result` };
    if (!isProgressed(value)) return value;

    const after = recoveryFingerprint(await options.getProgressFingerprint?.({
      result,
      phase,
      kind,
      context,
      value,
    }));
    if (before !== null && after !== null && before === after) {
      return {
        status: 'blocked',
        reason: `${kind} recovery reported progress without changing the progress fingerprint`,
        reasonCode: 'RECOVERY_NO_PROGRESS',
        details: { kind, fingerprint: after },
      };
    }

    cycleRecoveries.total++;
    cycleRecoveries[kind]++;
    result.recoveries.total++;
    result.recoveries[kind]++;
    const receipts = value.receipts || [value.receipt || value].filter(Boolean);
    receipts.forEach(rememberReceipt);
    await emit(options, 'recovery', {
      kind,
      phase,
      trigger: context.trigger || null,
      recoveries: { ...result.recoveries },
      cycleRecoveries: { ...cycleRecoveries },
      budgets: { ...budgets },
      details: value.details || null,
    });
    return value;
  }

  function disabledRecovery(reason, reasonCodeValue) {
    return {
      status: 'skipped',
      reason,
      reasonCode: reasonCodeValue,
    };
  }

  async function recoverProvisions(context = {}) {
    const proactiveDuplicateReserve = context.trigger === 'duplicate-reserve';
    if (!proactiveDuplicateReserve && !provisionsShortageRecoveryEnabled) {
      return disabledRecovery(
        'Provisions shortage recovery is disabled in Settings',
        'PROVISIONS_SHORTAGE_RECOVERY_DISABLED',
      );
    }
    return runRecovery(
      'provisions',
      ROLLING_UPGRADE_PHASES.RECOVER_PROVISIONS,
      options.recoverProvisions,
      context,
    );
  }

  function requiredSpecialRecoveryDisabled() {
    return {
      ...disabledRecovery(
        'Required Special/TOTW recovery is disabled in Settings',
        'REQUIRED_SPECIAL_RECOVERY_DISABLED',
      ),
      status: 'blocked',
    };
  }

  async function recoverStorageSink(context = {}) {
    const storageSink = await runRecovery(
      'storageSink',
      ROLLING_UPGRADE_PHASES.RECOVER_STORAGE_SINK,
      options.recoverStorageSink,
      context,
    );
    if (isProgressed(storageSink) || reasonCode(storageSink) !== 'REQUIRED_SPECIAL_SHORTAGE') {
      return storageSink;
    }

    if (!requiredSpecialRecoveryEnabled) return requiredSpecialRecoveryDisabled();

    const requiredSpecial = await runRecovery(
      'requiredSpecial',
      ROLLING_UPGRADE_PHASES.RECOVER_REQUIRED_SPECIAL,
      options.recoverRequiredSpecial,
      {
        trigger: 'storage-sink-required-special-shortage',
        source: 'storage-sink-dependency',
        storageSink,
        storageContext: context,
      },
    );
    if (isProgressed(requiredSpecial)) return requiredSpecial;
    if (requiredSpecial?.status === 'skipped') return storageSink;
    return {
      ...requiredSpecial,
      status: requiredSpecial?.status || 'unavailable',
      reason: effectReason(requiredSpecial, 'Storage sink Required Special recovery is unavailable'),
      reasonCode: reasonCode(requiredSpecial) || 'REQUIRED_SPECIAL_RECOVERY_BLOCKED',
      details: {
        ...(requiredSpecial?.details || {}),
        storageSinkDependency: {
          reason: effectReason(storageSink, 'Required Special shortage'),
          reasonCode: reasonCode(storageSink),
        },
      },
    };
  }

  async function recoverBlockedRewardStorage(reward, context = {}) {
    if (!isBlocked(reward) || reasonCode(reward) !== 'PROTECTED_STORAGE_BLOCKED') {
      return { matched: false };
    }
    if (options.storageSinkEnabled !== true) {
      return {
        matched: true,
        failure: finishRecoveryFailure(
          reward,
          context.blockedReason || 'recovery reward needs more Storage headroom',
          'PROTECTED_STORAGE_BLOCKED',
        ),
      };
    }
    const storageSink = await recoverStorageSink({
      trigger: 'storage-pressure',
      storage: reward,
      source: context.source || 'recovery-reward-pre-open',
    });
    if (isProgressed(storageSink)) return { matched: true, progressed: true };
    return {
      matched: true,
      failure: finishRecoveryFailure(
        storageSink,
        context.recoveryReason || 'Storage pressure SBC could not clear room for the recovery reward',
        'STORAGE_SINK_RECOVERY_BLOCKED',
      ),
    };
  }

  function finishRecoveryFailure(value, fallbackReason, fallbackCode) {
    if (isStopped(value)) return finish('stopped', value, fallbackReason, 'USER_STOPPED');
    if (value?.status === 'planned') return finish('planned', value, fallbackReason, fallbackCode);
    return finish(
      value?.status === 'unavailable' ? 'unavailable' : 'blocked',
      value,
      fallbackReason,
      fallbackCode,
    );
  }

  if (typeof options.preflight === 'function') {
    const preflight = await options.preflight({ result });
    if (isStopped(preflight)) return finish('stopped', preflight, 'stopped before Rolling preflight');
    if (isBlocked(preflight)) {
      return finish(
        preflight?.status === 'unavailable' ? 'unavailable' : 'blocked',
        preflight,
        'Rolling preflight failed',
        'PREFLIGHT_BLOCKED',
      );
    }
  }

  await enter(ROLLING_UPGRADE_PHASES.INDEX_INVENTORY);
  const initialized = await options.initializeInventory({ result });
  if (isStopped(initialized)) return finish('stopped', initialized, 'stopped while indexing inventory');
  if (isBlocked(initialized)) {
    return finish(
      initialized?.status === 'unavailable' ? 'unavailable' : 'blocked',
      initialized,
      'inventory index is unavailable',
      'INVENTORY_INDEX_UNAVAILABLE',
    );
  }

  if (typeof options.resumePendingPlayerPick === 'function') {
    await enter(ROLLING_UPGRADE_PHASES.RECOVER_STORAGE_SINK, {
      recovery: 'storageSink',
      trigger: 'startup-pending-pick',
    });
    const resumedPick = await options.resumePendingPlayerPick({ result });
    if (isStopped(resumedPick)) {
      return finish('stopped', resumedPick, 'stopped while resuming a pending Storage pressure SBC reward');
    }
    if (resumedPick?.status === 'planned') {
      return finish('planned', resumedPick, 'dry run stopped at a pending Storage pressure SBC reward');
    }
    if (isBlocked(resumedPick)) {
      return finish(
        resumedPick?.status === 'unavailable' ? 'unavailable' : 'blocked',
        resumedPick,
        'pending Storage pressure SBC reward could not be resumed safely',
        'STORAGE_SINK_PICK_RESUME_BLOCKED',
      );
    }
  }

  let resumedPrimaryPending = false;
  if (typeof options.resumePendingUnassigned === 'function') {
    const resumed = await options.resumePendingUnassigned({ result });
    if (isStopped(resumed)) {
      return finish('stopped', resumed, 'stopped while resuming existing Unassigned cards');
    }
    if (isBlocked(resumed)) {
      return finish(
        resumed?.status === 'unavailable' ? 'unavailable' : 'blocked',
        resumed,
        'existing Unassigned cards could not be resumed safely',
        'UNASSIGNED_RESUME_BLOCKED',
      );
    }
    resumedPrimaryPending = resumed?.primaryPending === true;
  }

  while (maxCompletions === 0 || result.completions < maxCompletions) {
    if (await stopRequested()) return finish('stopped', null, 'stopped by user', 'USER_STOPPED');
    if (result.iterations >= maxIterations) {
      return finish('blocked', null, `Rolling safety limit reached after ${maxIterations} iteration(s)`, 'SAFETY_LIMIT_REACHED');
    }
    result.iterations++;
    let progressed = false;
    let leftoverRecoveryBatchActive = false;
    let leftoverRecoveryRewardsExhausted = false;
    let shortageProvisionsPacksOpened = 0;

    const resumedPrimary = resumedPrimaryPending;
    await enter(ROLLING_UPGRADE_PHASES.BOOTSTRAP_OR_FIND_REWARD, { resumedPrimary });
    const packResult = resumedPrimary
      ? null
      : await options.findPrimaryPack({ result, iteration: result.iterations });
    if (isStopped(packResult)) return finish('stopped', packResult, 'stopped while finding primary reward');
    if (packResult?.status === 'blocked' || packResult?.status === 'failed') {
      return finish('blocked', packResult, 'primary reward lookup failed', 'PRIMARY_REWARD_LOOKUP_FAILED');
    }
    const pack = packResult?.pack || (
      packResult && !packResult.status && !packResult.reason ? packResult : null
    );

    if (pack) {
      await enter(ROLLING_UPGRADE_PHASES.OPEN_PRIMARY_REWARD);
      const opened = await options.openPrimaryPack({ pack, result, iteration: result.iterations });
      rememberReceipt(opened?.receipt || opened);
      if (opened?.inventoryDelta) result.inventoryDelta = opened.inventoryDelta;
      if (isStopped(opened)) return finish('stopped', opened, 'stopped while opening primary reward');
      if (opened?.status === 'planned') {
        return finish('planned', opened, 'dry run stops at the unknown primary reward boundary');
      }
      if (opened?.status !== 'opened') {
        return finish(
          opened?.status === 'unavailable' ? 'unavailable' : 'blocked',
          opened,
          'primary reward pack could not be opened',
          'PRIMARY_REWARD_OPEN_BLOCKED',
        );
      }
      result.packsOpened++;
      progressed = true;

      await enter(ROLLING_UPGRADE_PHASES.CLASSIFY_OPENED_ITEMS);
      const classified = await options.classifyOpenedItems?.({ opened, pack, result, iteration: result.iterations })
        || { status: 'ready' };
      if (classified?.inventoryDelta) result.inventoryDelta = classified.inventoryDelta;
      if (isStopped(classified)) return finish('stopped', classified, 'stopped while classifying opened items');
      if (isBlocked(classified)) {
        return finish('blocked', classified, 'opened items could not be classified', 'OPENED_ITEM_CLASSIFICATION_BLOCKED');
      }

    }

    let plan = null;
    let primaryDuplicateReserveResolved = !pack || !surplusCraftingEnabled;
    while (!plan) {
      if (await stopRequested()) return finish('stopped', null, 'stopped by user', 'USER_STOPPED');

      await enter(ROLLING_UPGRADE_PHASES.RESOLVE_PROTECTED_STORAGE);
      const storage = await options.resolveProtectedStorage?.({
        pack,
        result,
        iteration: result.iterations,
      }) || { status: 'ready' };
      if (storage?.inventoryDelta) result.inventoryDelta = storage.inventoryDelta;
      if (isStopped(storage)) return finish('stopped', storage, 'stopped while routing protected cards');
      if (isBlocked(storage)) {
        const storageCode = reasonCode(storage) || 'PROTECTED_STORAGE_BLOCKED';
        if (storageCode !== 'PROTECTED_STORAGE_BLOCKED') {
          return finish(
            storage?.status === 'unavailable' ? 'unavailable' : 'blocked',
            storage,
            'opened items could not be routed safely',
            storageCode,
          );
        }
        const provisions = await recoverProvisions({ trigger: 'storage-pressure', storage });
        if (isProgressed(provisions)) continue;
        if (isStopped(provisions) || provisions?.status === 'planned'
          || ['blocked', 'failed'].includes(String(provisions?.status || ''))) {
          return finishRecoveryFailure(
            provisions,
            'protected cards cannot be stored',
            'PROTECTED_STORAGE_BLOCKED',
          );
        }

        if (options.storageSinkEnabled !== true) {
          return finishRecoveryFailure(
            storage,
            'protected cards cannot be stored',
            'PROTECTED_STORAGE_BLOCKED',
          );
        }

        const storageSink = await recoverStorageSink({ trigger: 'storage-pressure', storage, provisions });
        if (isProgressed(storageSink)) continue;
        if (isStopped(storageSink) || isBlocked(storageSink) || storageSink?.status === 'planned') {
          return finishRecoveryFailure(
            storageSink,
            'Storage pressure SBC recovery failed',
            'STORAGE_SINK_RECOVERY_BLOCKED',
          );
        }
        return finishRecoveryFailure(
          storage,
          'protected cards cannot be stored',
          'PROTECTED_STORAGE_BLOCKED',
        );
      }

      if (!primaryDuplicateReserveResolved) {
        const recoveryState = await options.readRecoveryState?.({
          result,
          iteration: result.iterations,
        }) || {};
        if (Number(recoveryState.duplicateProvisionBatches || 0) > 0) {
          const duplicateProvision = await recoverProvisions({
            trigger: 'duplicate-reserve',
            recoveryState,
          });
          if (isProgressed(duplicateProvision)) continue;
          return finishRecoveryFailure(
            duplicateProvision,
            'duplicate Reserve cards could not be consumed by Provisions',
            'PROVISIONS_RECOVERY_BLOCKED',
          );
        }
        primaryDuplicateReserveResolved = true;
      }

      const pendingReward = await runRecovery(
        'reward',
        ROLLING_UPGRADE_PHASES.PROCESS_RECOVERY_REWARD,
        options.processPendingRecoveryReward,
        { trigger: 'pending-recovery-reward' },
      );
      if (isProgressed(pendingReward)) continue;
      const pendingStorage = await recoverBlockedRewardStorage(pendingReward, {
        source: 'pending-recovery-pre-open',
        blockedReason: 'pending recovery reward needs more Storage headroom',
        recoveryReason: 'Storage pressure SBC could not clear room for the pending recovery reward',
      });
      if (pendingStorage.matched) {
        if (pendingStorage.progressed) continue;
        return pendingStorage.failure;
      }
      if (isStopped(pendingReward) || isBlocked(pendingReward) || pendingReward?.status === 'planned') {
        return finishRecoveryFailure(
          pendingReward,
          'pending recovery reward could not be processed',
          'RECOVERY_REWARD_BLOCKED',
        );
      }

      const drain = await runRecovery(
        'goldDrain',
        ROLLING_UPGRADE_PHASES.DRAIN_RECOVERY_DUPLICATES,
        options.drainRecoveryDuplicates,
        { trigger: 'recovery-duplicates' },
      );
      if (isProgressed(drain)) continue;
      if (isStopped(drain) || isBlocked(drain) || drain?.status === 'planned') {
        return finishRecoveryFailure(
          drain,
          'recovery duplicates could not be drained',
          'RECOVERY_DUPLICATE_DRAIN_BLOCKED',
        );
      }

      if (leftoverRecoveryBatchActive) {
        const leftoverReward = await runRecovery(
          'reward',
          ROLLING_UPGRADE_PHASES.PROCESS_RECOVERY_REWARD,
          options.processLeftoverRecoveryReward,
          {
            trigger: 'primary-fodder-shortage-leftovers',
            shortageProvisionsPacksOpened,
            shortageProvisionsPackLimit,
          },
        );
        if (isProgressed(leftoverReward)) {
          const recoveryFamily = String(leftoverReward?.details?.recoveryFamily || 'provisions-upgrade');
          if (recoveryFamily === 'provisions-upgrade') {
            shortageProvisionsPacksOpened++;
            if (shortageProvisionsPacksOpened >= shortageProvisionsPackLimit) {
              leftoverRecoveryBatchActive = false;
            }
          }
          continue;
        }
        const leftoverStorage = await recoverBlockedRewardStorage(leftoverReward, {
          source: 'leftover-recovery-pre-open',
          blockedReason: 'leftover recovery reward needs more Storage headroom',
          recoveryReason: 'Storage pressure SBC could not clear room for the leftover recovery reward',
        });
        if (leftoverStorage.matched) {
          if (leftoverStorage.progressed) continue;
          return leftoverStorage.failure;
        }
        if (isStopped(leftoverReward) || isBlocked(leftoverReward) || leftoverReward?.status === 'planned') {
          return finishRecoveryFailure(
            leftoverReward,
            'leftover recovery rewards could not be cleared',
            'LEFTOVER_RECOVERY_REWARD_BLOCKED',
          );
        }
        leftoverRecoveryBatchActive = false;
        leftoverRecoveryRewardsExhausted = true;
      }

      const bootstrap = !pack && !resumedPrimary;
      await enter(ROLLING_UPGRADE_PHASES.PLAN_PRIMARY_SQUAD, { bootstrap, resumedPrimary });
      const planned = await options.planPrimarySquad({
        result,
        iteration: result.iterations,
        bootstrap,
        resumedPrimary,
      });
      result.lastPlan = planned || null;
      if (isStopped(planned)) return finish('stopped', planned, 'stopped while planning the primary squad');
      if (planned?.ok || planned?.status === 'ready') {
        plan = planned;
        break;
      }

      const planCode = reasonCode(planned) || 'PRIMARY_SQUAD_INFEASIBLE';
      if (planCode === 'REQUIRED_SPECIAL_SHORTAGE') {
        if (!requiredSpecialRecoveryEnabled) {
          return finish(
            'blocked',
            requiredSpecialRecoveryDisabled(),
            'Required Special/TOTW recovery is disabled in Settings',
            'REQUIRED_SPECIAL_RECOVERY_DISABLED',
          );
        }
        const recovery = await runRecovery(
          'requiredSpecial',
          ROLLING_UPGRADE_PHASES.RECOVER_REQUIRED_SPECIAL,
          options.recoverRequiredSpecial,
          { trigger: 'required-special-shortage', plan: planned },
        );
        if (isProgressed(recovery)) continue;
        const requiredSpecialStorage = await recoverBlockedRewardStorage(recovery, {
          source: 'required-special-reward-pre-open',
          blockedReason: 'Required Special reward needs more Storage headroom',
          recoveryReason: 'Storage pressure SBC could not clear room for the Required Special reward',
        });
        if (requiredSpecialStorage.matched) {
          if (requiredSpecialStorage.progressed) continue;
          return requiredSpecialStorage.failure;
        }
        if (recovery?.status === 'skipped') {
          return finish('blocked', planned, 'primary squad is infeasible', planCode);
        }
        if (recovery?.recoverableByProvisions === true) {
          const provisions = await recoverProvisions({
            trigger: 'required-special-fodder-shortage',
            plan: planned,
            dependency: recovery,
          });
          if (isProgressed(provisions)) continue;
          return finishRecoveryFailure(
            provisions,
            'Required Special recovery needs unavailable Provisions fodder',
            'REQUIRED_SPECIAL_RECOVERY_BLOCKED',
          );
        }
        return finishRecoveryFailure(
          recovery?.status ? recovery : planned,
          'Required Special recovery is unavailable',
          'REQUIRED_SPECIAL_RECOVERY_BLOCKED',
        );
      }

      if (planCode === 'PROTECTED_STORAGE_BLOCKED') {
        const provisions = await recoverProvisions({
          trigger: 'storage-pressure',
          storage: planned,
        });
        if (isProgressed(provisions)) continue;
        if (isStopped(provisions) || provisions?.status === 'planned'
          || ['blocked', 'failed'].includes(String(provisions?.status || ''))) {
          return finishRecoveryFailure(
            provisions,
            'primary-pack duplicates cannot be stored safely',
            'PROTECTED_STORAGE_BLOCKED',
          );
        }
        if (options.storageSinkEnabled !== true) {
          return finishRecoveryFailure(
            planned,
            'primary-pack duplicates cannot be stored safely',
            'PROTECTED_STORAGE_BLOCKED',
          );
        }
        const storageSink = await recoverStorageSink({
          trigger: 'storage-pressure',
          storage: planned,
          provisions,
        });
        if (isProgressed(storageSink)) continue;
        return finishRecoveryFailure(
          storageSink?.status ? storageSink : planned,
          'primary-pack duplicate Storage recovery failed',
          'PROTECTED_STORAGE_BLOCKED',
        );
      }

      if (FODDER_SHORTAGE_CODES.has(planCode)) {
        if (!leftoverRecoveryRewardsExhausted
          && typeof options.processLeftoverRecoveryReward === 'function') {
          leftoverRecoveryBatchActive = true;
          shortageProvisionsPacksOpened = 0;
          continue;
        }
        const recovery = await recoverProvisions({
          trigger: 'primary-fodder-shortage',
          plan: planned,
        });
        if (isProgressed(recovery)) continue;
        if (recovery?.status === 'skipped') {
          if (reasonCode(recovery) === 'PROVISIONS_SHORTAGE_RECOVERY_DISABLED') {
            return finish(
              'blocked',
              recovery,
              'Provisions shortage recovery is disabled in Settings',
              'PROVISIONS_SHORTAGE_RECOVERY_DISABLED',
            );
          }
          return finish('blocked', planned, 'primary squad is infeasible', planCode);
        }
        return finishRecoveryFailure(
          recovery?.status ? recovery : planned,
          'primary squad fodder recovery is unavailable',
          planCode,
        );
      }

      return finish('blocked', planned, 'primary squad is infeasible', planCode);
    }

    const bootstrap = !pack && !resumedPrimary;
    await enter(ROLLING_UPGRADE_PHASES.SUBMIT_PRIMARY, { bootstrap, resumedPrimary });
    const submission = await options.submitPrimary({
      plan,
      result,
      iteration: result.iterations,
      bootstrap,
      resumedPrimary,
    });
    rememberReceipt(submission?.receipt || submission);
    if (submission?.inventoryDelta) result.inventoryDelta = submission.inventoryDelta;
    if (isStopped(submission)) return finish('stopped', submission, 'stopped while submitting the primary squad');
    if (submission?.status === 'planned') {
      return finish('planned', submission, 'dry-run primary squad plan complete');
    }
    if (submission?.submitted !== true && submission?.status !== 'submitted') {
      return finish('blocked', submission, 'primary SBC submission did not complete', 'PRIMARY_SUBMISSION_BLOCKED');
    }
    result.completions++;
    if (bootstrap) result.bootstrapSubmissions++;
    if (resumedPrimary) resumedPrimaryPending = false;
    progressed = true;
    if (submission?.postSubmitBlocked === true) {
      return finish(
        'blocked',
        submission,
        'primary SBC submitted but deferred duplicate routing failed',
        'PROTECTED_STORAGE_BLOCKED',
      );
    }
    cycleRecoveries = {
      total: 0,
      reward: 0,
      goldDrain: 0,
      provisions: 0,
      storageSink: 0,
      requiredSpecial: 0,
      storageMaintenance: 0,
    };
    await enter(ROLLING_UPGRADE_PHASES.RECONCILE_LEDGER);
    const reconciliation = await options.reconcile?.({
      submission,
      result,
      iteration: result.iterations,
    }) || { status: 'ready' };
    if (reconciliation?.inventoryDelta) result.inventoryDelta = reconciliation.inventoryDelta;
    if (isStopped(reconciliation)) return finish('stopped', reconciliation, 'stopped while reconciling inventory');
    if (isBlocked(reconciliation)) {
      return finish('blocked', reconciliation, 'inventory reconciliation failed', 'INVENTORY_RECONCILIATION_FAILED');
    }

    // Opt-in Storage maintenance starts only after a primary submission. Each
    // callback performs one bounded SBC action and must return a changed fingerprint.
    // Replanning after every action prevents stale Storage entries from being
    // submitted again when EA updates the inventory asynchronously.
    while (surplusCraftingEnabled && typeof options.maintainStorage === 'function') {
      const maintenance = await runRecovery(
        'storageMaintenance',
        ROLLING_UPGRADE_PHASES.MAINTAIN_STORAGE,
        options.maintainStorage,
        { trigger: 'post-primary-storage-maintenance' },
      );
      if (isProgressed(maintenance)) continue;
      if (maintenance?.status === 'skipped' || maintenance?.status === 'unavailable') break;
      if (isStopped(maintenance) || maintenance?.status === 'planned'
        || ['blocked', 'failed'].includes(String(maintenance?.status || ''))) {
        return finishRecoveryFailure(
          maintenance,
          'Storage maintenance could not complete safely',
          'STORAGE_MAINTENANCE_BLOCKED',
        );
      }
      break;
    }

    if (!progressed) {
      return finish('blocked', null, 'Rolling iteration made no progress', 'NO_PROGRESS');
    }
    await emit(options, 'progress', {
      completions: result.completions,
      packsOpened: result.packsOpened,
      bootstrapSubmissions: result.bootstrapSubmissions,
      iterations: result.iterations,
    });
  }

  result.status = 'completed';
  result.phase = ROLLING_UPGRADE_PHASES.RECONCILE_LEDGER;
  return result;
}
