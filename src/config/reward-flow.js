import { isPlainObject } from '../domain/objects.js';

export const REWARD_OPEN_MODES = Object.freeze(['inherit', 'always', 'never']);

function validateNumberList(value, path, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  value.forEach((entry, index) => {
    if (!Number.isFinite(Number(entry))) errors.push(`${path}[${index}] must be a number`);
  });
}

function validateStringList(value, path, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) errors.push(`${path}[${index}] must be a non-empty string`);
  });
}

export function validateRewardFlow(value, path, errors) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (value.open !== undefined && !REWARD_OPEN_MODES.includes(value.open)) {
    errors.push(`${path}.open must be one of: ${REWARD_OPEN_MODES.join(', ')}`);
  }
  validateNumberList(value.packIds, `${path}.packIds`, errors);
  validateStringList(value.packNames, `${path}.packNames`, errors);
  validateStringList(value.unassignedRecoveryPolicyIds, `${path}.unassignedRecoveryPolicyIds`, errors);
}

export function applyRewardFlow(loopDef = {}, rewardFlow = loopDef.rewardFlow) {
  if (!isPlainObject(rewardFlow)) return loopDef;
  if (rewardFlow.open !== undefined) loopDef.rewardOpenMode = rewardFlow.open;
  if (rewardFlow.packIds?.length || rewardFlow.packNames?.length) {
    delete loopDef.rewardPackIds;
    delete loopDef.rewardPackNames;
    if (rewardFlow.packIds?.length) loopDef.rewardPackIds = [...rewardFlow.packIds];
    if (rewardFlow.packNames?.length) loopDef.rewardPackNames = [...rewardFlow.packNames];
  }
  if (rewardFlow.unassignedRecoveryPolicyIds) {
    loopDef.unassignedRecoveryPolicyIds = [...rewardFlow.unassignedRecoveryPolicyIds];
  }
  return loopDef;
}

export function resolveRewardPackOpenEnabled(loopDef = {}, runtimeOpenEnabled = false) {
  const mode = loopDef.rewardOpenMode || loopDef.rewardFlow?.open || 'inherit';
  if (loopDef.forceOpenRewardPacks === true) return true;
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  return runtimeOpenEnabled === true;
}
