import { cloneLoopDef } from '../domain/objects.js';
import { applyDisabledPiles } from './loop-presentation.js';
import { assertValidLoopDef } from './loop-schema.js';
import { applyRewardFlow, resolveRewardPackOpenEnabled } from './reward-flow.js';

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
    if (step.maxCompletions !== undefined) childDef.maxCompletions = step.maxCompletions;
    applyRewardFlow(childDef, step.rewardFlow);
    if (loopDef.disabledPiles?.length && !childDef.disabledPiles?.length) {
      childDef.disabledPiles = [...loopDef.disabledPiles];
    }
    if (childDef.rewardOpenMode) {
      childDef.openRewardPacks = resolveRewardPackOpenEnabled(childDef, loopDef.openRewardPacks === true);
    } else if (loopDef.openRewardPacks !== undefined) {
      childDef.openRewardPacks = childDef.forceOpenRewardPacks === true || loopDef.openRewardPacks === true;
    }
    if (childDef.strategy === 'dailySingleCardRecycle' && loopDef.dailyRecycleInventoryOnly !== undefined) {
      childDef.dailyRecycleInventoryOnly = loopDef.dailyRecycleInventoryOnly === true;
    }
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
