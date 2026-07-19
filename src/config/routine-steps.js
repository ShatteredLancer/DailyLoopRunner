import { cloneLoopDef } from '../domain/objects.js';
import { applyDisabledPiles } from './loop-presentation.js';
import { assertValidLoopDef } from './loop-schema.js';

export function resolveRoutineStepLoopDefs(loopDef = {}, loopDefs = []) {
  return (loopDef.steps || []).map((stepId, index) => {
    if (stepId === loopDef.id) {
      throw new Error(`${loopDef.name}: step ${index + 1} cannot reference itself`);
    }
    const baseDef = loopDefs.find((definition) => definition.id === stepId);
    if (!baseDef) {
      throw new Error(`${loopDef.name}: step ${index + 1} loop not found: ${stepId}`);
    }

    const childDef = cloneLoopDef(baseDef);
    if (childDef.strategy === 'dailyRoutine') {
      throw new Error(`${loopDef.name}: nested dailyRoutine steps are not supported`);
    }
    if (loopDef.disabledPiles?.length && !childDef.disabledPiles?.length) {
      childDef.disabledPiles = [...loopDef.disabledPiles];
    }
    if (loopDef.openRewardPacks !== undefined && childDef.openRewardPacks === undefined) {
      childDef.openRewardPacks = loopDef.openRewardPacks;
    }
    childDef.dryRun = loopDef.dryRun === true || childDef.dryRun === true;
    assertValidLoopDef(childDef, childDef.name || stepId);
    return applyDisabledPiles(childDef);
  });
}
