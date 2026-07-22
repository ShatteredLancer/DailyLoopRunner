import { cloneLoopDef, isPlainObject } from '../domain/objects.js';
import { applyDisabledPiles } from './loop-presentation.js';
import { assertValidLoopDef } from './loop-schema.js';
import { applyRewardFlow, resolveRewardPackOpenEnabled } from './reward-flow.js';
import {
  applyInventoryMode,
  applyPickRuntimeOptions,
  resolveInventoryMode,
} from './runtime-options.js';

function normalizeRoutineStep(step = {}) {
  return typeof step === 'string' ? { loopId: step } : step;
}

export function resolveRoutineStepLoopDefs(loopDef = {}, loopDefs = []) {
  return (loopDef.steps || []).map((rawStep, index) => {
    const step = normalizeRoutineStep(rawStep);
    const stepId = step.loopId;
    if (stepId === loopDef.id) {
      throw new Error(`${loopDef.name}: step ${index + 1} cannot reference itself`);
    }
    const baseDef = loopDefs.find((definition) => definition.id === stepId);
    if (!baseDef) {
      throw new Error(`${loopDef.name}: step ${index + 1} loop not found: ${stepId}`);
    }

    const childDef = cloneLoopDef(baseDef);
    const stepOverride = loopDef.stepOverrides?.[stepId];
    if (stepOverride && typeof stepOverride === 'object' && !Array.isArray(stepOverride)) {
      Object.assign(childDef, cloneLoopDef(stepOverride));
      childDef.id = baseDef.id;
      childDef.strategy = baseDef.strategy;
    }
    if (childDef.strategy === 'dailyRoutine' || childDef.strategy === 'workflowRoutine') {
      throw new Error(`${loopDef.name}: nested routine steps are not supported`);
    }
    applyRewardFlow(childDef);
    if (step.name) childDef.name = step.name;
    applyRewardFlow(childDef, step.rewardFlow);
    if (loopDef.disabledPiles?.length) {
      childDef.disabledPiles = [...new Set([
        ...(childDef.disabledPiles || []),
        ...loopDef.disabledPiles,
      ])];
    }
    if (childDef.unassignedRecoveryPolicyIds === undefined && loopDef.unassignedRecoveryPolicyIds !== undefined) {
      childDef.unassignedRecoveryPolicyIds = [...loopDef.unassignedRecoveryPolicyIds];
    }
    childDef.openRewardPacks = resolveRewardPackOpenEnabled(
      childDef,
      loopDef.openRewardPacks === true,
    );
    const parentPickOptions = isPlainObject(loopDef.runtimePickOptions)
      ? loopDef.runtimePickOptions
      : loopDef.pickOptions;
    if (isPlainObject(parentPickOptions)) {
      applyPickRuntimeOptions(childDef, parentPickOptions);
    }
    const parentInventoryMode = loopDef.runtimeInventoryMode
      || resolveInventoryMode('normal', loopDef);
    applyInventoryMode(childDef, parentInventoryMode);
    childDef.dryRun = loopDef.dryRun === true || childDef.dryRun === true;
    assertValidLoopDef(childDef, childDef.name || stepId);
    return applyDisabledPiles(childDef);
  });
}

export function configureRoutineStepForAvailability(step = {}, availability = null) {
  const configured = cloneLoopDef(step);
  if (availability && availability.remaining !== null && availability.remaining !== undefined) {
    const remaining = Math.max(1, Math.floor(Number(availability.remaining) || 1));
    configured.maxCompletions = configured.mvp === true
      ? Math.min(remaining, Math.max(1, Math.floor(Number(configured.maxCompletions) || 1)))
      : remaining;
  } else if (availability?.available === true && configured.mvp !== true) {
    configured.maxCompletions = Math.max(1, Math.floor(Number(availability.safetyLimit) || 100));
  }
  return configured;
}
