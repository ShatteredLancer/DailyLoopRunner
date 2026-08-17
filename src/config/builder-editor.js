import { cloneLoopDef, isPlainObject } from '../domain/objects.js';
import { LOOP_STRATEGIES } from '../domain/strategies.js';
import { normalizeLoopConfig } from './loop-schema.js';

function clone(value) {
  return cloneLoopDef(value);
}

function slug(value) {
  return String(value || 'custom-loop')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom-loop';
}

function uniqueId(config, requested) {
  const ids = new Set((config.loops || []).map((loop) => String(loop.id)));
  const base = slug(requested);
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function requirement(tier = 'gold') {
  return { tier, count: 1, playerOnly: true, allowSpecial: false };
}

function upgrade(name = 'Upgrade') {
  return { name, sbcNames: [name], requirements: [requirement()] };
}

export function createLoopTemplate(strategy, options = {}) {
  if (!LOOP_STRATEGIES.includes(strategy)) throw new Error(`Unsupported Loop strategy: ${strategy}`);
  const name = String(options.name || 'Custom Loop');
  const loop = { id: slug(options.id || name), name, strategy };
  switch (strategy) {
    case 'validationBronzeUpgrade':
      return { ...loop, sbcNames: ['SBC name'], targetDuplicate: { tier: 'bronze', playerOnly: true, allowSpecial: false }, maxRounds: 1 };
    case 'dailySingleCardRecycle':
      return { ...loop, sbcNames: ['SBC name'], targetDuplicate: { tier: 'bronze', playerOnly: true, allowSpecial: false }, maxCompletions: 1 };
    case 'supplyAndCraft':
    case 'inventoryMixedUpgrade':
    case 'commonGoldToRareUpgrade':
      return { ...loop, sbcNames: ['SBC name'], requirements: [requirement()], priorityPiles: ['unassigned', 'storage', 'transfer', 'club'], maxCompletions: 1 };
    case 'provisionPackCrafting':
    case 'provisionPackDualCrafting':
      return { ...loop, sourcePackNames: ['Source pack'], craftingUpgrades: [upgrade()], rounds: 1 };
    case 'rarePackTo84Upgrade':
      return { ...loop, sourcePackNames: ['Source pack'], rareUpgrade: upgrade(), maxPacks: 1 };
    case 'playerPickSbc':
      return { ...loop, sbcNames: ['Player Pick SBC'], pickItemNames: ['Player Pick'], requirements: [requirement()], pickCandidateCount: 3, pickCount: 1, maxCompletions: 1 };
    case 'dailyRoutine':
    case 'workflowRoutine':
      return { ...loop, steps: [] };
    case 'fillAndVerifySbc':
      return { ...loop, sbcNames: ['SBC name'], requirements: [requirement()], priorityPiles: ['unassigned', 'storage', 'transfer', 'club'], maxCompletions: 1 };
    case 'rollingUpgrade':
      return {
        ...loop,
        hidden: true,
        mvp: true,
        rollingWorkflowEnabled: false,
        defaultOpenRewardPacksOnSelect: true,
        runtimeQuantity: {
          mode: 'user', target: 'maxCompletions', default: 0, min: 0, max: 1000, allowZero: true, label: 'SBC completions',
        },
      };
    case 'inventoryExhaustion':
      return { ...loop, stages: [{ id: 'stage-1', ...upgrade('Upgrade'), maxCompletions: 1 }] };
    default:
      return loop;
  }
}

export function addBuilderLoop(config, strategy, options = {}) {
  const normalized = clone(normalizeLoopConfig(config));
  const template = createLoopTemplate(strategy, options);
  template.id = uniqueId(normalized, template.id);
  normalized.loops.push(template);
  return { config: normalized, loop: template };
}

export function duplicateBuilderLoop(config, loopId, options = {}) {
  const normalized = clone(normalizeLoopConfig(config));
  const source = normalized.loops.find((loop) => String(loop.id) === String(loopId));
  if (!source) throw new Error(`Loop not found: ${loopId}`);
  const copy = clone(source);
  copy.id = uniqueId(normalized, options.id || `${source.id}-copy`);
  copy.name = String(options.name || `${source.name} Copy`);
  delete copy.discoveryReportedCompleted;
  normalized.loops.push(copy);
  return { config: normalized, loop: copy };
}

export function findBuilderReferences(config, id) {
  const normalized = normalizeLoopConfig(config);
  const references = [];
  for (const loop of normalized.loops) {
    (loop.steps || []).forEach((step, index) => {
      const loopId = typeof step === 'string' ? step : step?.loopId;
      if (String(loopId || '') === String(id)) references.push({ type: 'workflow-step', ownerId: loop.id, index });
    });
    if (String(loop.sourceExhaustedFallbackLoopId || '') === String(id)) {
      references.push({ type: 'fallback-loop', ownerId: loop.id, path: 'sourceExhaustedFallbackLoopId' });
    }
    if (String(loop.preCraftPlayerPickLoopId || '') === String(id)) {
      references.push({ type: 'pre-craft-pick', ownerId: loop.id, path: 'preCraftPlayerPickLoopId' });
    }
    if (String(loop.sourcePackRef?.rewardOfLoopId || '') === String(id)) {
      references.push({ type: 'source-pack-reward', ownerId: loop.id, path: 'sourcePackRef.rewardOfLoopId' });
    }
    (loop.shortagePacks || []).forEach((source, index) => {
      if (String(source?.sourcePackRef?.rewardOfLoopId || '') === String(id)) {
        references.push({ type: 'shortage-pack-reward', ownerId: loop.id, path: `shortagePacks.${index}.sourcePackRef.rewardOfLoopId` });
      }
    });
  }
  return references;
}

export function removeBuilderLoop(config, loopId) {
  const normalized = clone(normalizeLoopConfig(config));
  const references = findBuilderReferences(normalized, loopId);
  if (references.length) throw new Error(`Loop ${loopId} is referenced by ${references.length} configuration location(s)`);
  const previousLength = normalized.loops.length;
  normalized.loops = normalized.loops.filter((loop) => String(loop.id) !== String(loopId));
  if (normalized.loops.length === previousLength) throw new Error(`Loop not found: ${loopId}`);
  return normalized;
}

export function renameBuilderLoopId(config, oldId, requestedId) {
  const normalized = clone(normalizeLoopConfig(config));
  const nextId = slug(requestedId);
  const target = normalized.loops.find((loop) => String(loop.id) === String(oldId));
  if (!target) throw new Error(`Loop not found: ${oldId}`);
  if (normalized.loops.some((loop) => String(loop.id) === nextId && loop !== target)) {
    throw new Error(`Loop ID already exists: ${nextId}`);
  }
  target.id = nextId;
  for (const loop of normalized.loops) {
    loop.steps = (loop.steps || []).map((step) => {
      if (typeof step === 'string') return step === oldId ? nextId : step;
      if (step?.loopId !== oldId) return step;
      return { ...step, loopId: nextId };
    });
    if (loop.sourceExhaustedFallbackLoopId === oldId) loop.sourceExhaustedFallbackLoopId = nextId;
    if (loop.preCraftPlayerPickLoopId === oldId) loop.preCraftPlayerPickLoopId = nextId;
    if (loop.sourcePackRef?.rewardOfLoopId === oldId) loop.sourcePackRef.rewardOfLoopId = nextId;
    for (const source of loop.shortagePacks || []) {
      if (source?.sourcePackRef?.rewardOfLoopId === oldId) source.sourcePackRef.rewardOfLoopId = nextId;
    }
    if (isPlainObject(loop.stepOverrides) && Object.hasOwn(loop.stepOverrides, oldId)) {
      loop.stepOverrides[nextId] = loop.stepOverrides[oldId];
      delete loop.stepOverrides[oldId];
    }
  }
  return { config: normalized, id: nextId };
}

export function findBuilderRecoveryReferences(config, kind, id) {
  const normalized = normalizeLoopConfig(config);
  const references = [];
  if (kind === 'recoveryRecipes') {
    for (const policy of normalized.unassignedRecoveryPolicies) {
      (policy.steps || []).forEach((step, index) => {
        if (String(step?.recipeId || '') === String(id)) {
          references.push({ type: 'recovery-step', ownerId: policy.id, index });
        }
      });
    }
    return references;
  }
  if (kind !== 'unassignedRecoveryPolicies') throw new Error(`Unsupported recovery collection: ${kind}`);
  normalized.defaultUnassignedRecoveryPolicyIds.forEach((policyId, index) => {
    if (String(policyId) === String(id)) references.push({ type: 'default-policy', ownerId: 'config', index });
  });
  for (const loop of normalized.loops) {
    for (const [path, policyIds] of [
      ['unassignedRecoveryPolicyIds', loop.unassignedRecoveryPolicyIds],
      ['rewardFlow.unassignedRecoveryPolicyIds', loop.rewardFlow?.unassignedRecoveryPolicyIds],
    ]) {
      (policyIds || []).forEach((policyId, index) => {
        if (String(policyId) === String(id)) references.push({ type: 'loop-policy', ownerId: loop.id, path, index });
      });
    }
    (loop.steps || []).forEach((step, stepIndex) => {
      if (!isPlainObject(step)) return;
      (step.rewardFlow?.unassignedRecoveryPolicyIds || []).forEach((policyId, index) => {
        if (String(policyId) === String(id)) {
          references.push({ type: 'workflow-step-policy', ownerId: loop.id, stepIndex, index });
        }
      });
    });
  }
  return references;
}

export function renameBuilderRecoveryId(config, kind, oldId, requestedId) {
  if (!['recoveryRecipes', 'unassignedRecoveryPolicies'].includes(kind)) {
    throw new Error(`Unsupported recovery collection: ${kind}`);
  }
  const normalized = clone(normalizeLoopConfig(config));
  const nextId = slug(requestedId);
  const target = normalized[kind].find((item) => String(item.id) === String(oldId));
  if (!target) throw new Error(`Recovery object not found: ${oldId}`);
  if (normalized[kind].some((item) => String(item.id) === nextId && item !== target)) {
    throw new Error(`Recovery ID already exists: ${nextId}`);
  }
  target.id = nextId;
  if (kind === 'recoveryRecipes') {
    for (const policy of normalized.unassignedRecoveryPolicies) {
      for (const step of policy.steps || []) {
        if (step.recipeId === oldId) step.recipeId = nextId;
      }
    }
  } else {
    normalized.defaultUnassignedRecoveryPolicyIds = normalized.defaultUnassignedRecoveryPolicyIds
      .map((policyId) => policyId === oldId ? nextId : policyId);
    for (const loop of normalized.loops) {
      if (Array.isArray(loop.unassignedRecoveryPolicyIds)) {
        loop.unassignedRecoveryPolicyIds = loop.unassignedRecoveryPolicyIds
          .map((policyId) => policyId === oldId ? nextId : policyId);
      }
      if (Array.isArray(loop.rewardFlow?.unassignedRecoveryPolicyIds)) {
        loop.rewardFlow.unassignedRecoveryPolicyIds = loop.rewardFlow.unassignedRecoveryPolicyIds
          .map((policyId) => policyId === oldId ? nextId : policyId);
      }
      for (const step of loop.steps || []) {
        if (!Array.isArray(step?.rewardFlow?.unassignedRecoveryPolicyIds)) continue;
        step.rewardFlow.unassignedRecoveryPolicyIds = step.rewardFlow.unassignedRecoveryPolicyIds
          .map((policyId) => policyId === oldId ? nextId : policyId);
      }
    }
  }
  return { config: normalized, id: nextId };
}

export function removeBuilderRecovery(config, kind, id) {
  const normalized = clone(normalizeLoopConfig(config));
  const references = findBuilderRecoveryReferences(normalized, kind, id);
  if (references.length) throw new Error(`Recovery object ${id} is referenced by ${references.length} configuration location(s)`);
  const previousLength = normalized[kind]?.length;
  if (!Number.isFinite(previousLength)) throw new Error(`Unsupported recovery collection: ${kind}`);
  normalized[kind] = normalized[kind].filter((item) => String(item.id) !== String(id));
  if (normalized[kind].length === previousLength) throw new Error(`Recovery object not found: ${id}`);
  return normalized;
}

export function addBuilderWorkflowStep(config, workflowId, loopId, options = {}) {
  const normalized = clone(normalizeLoopConfig(config));
  const workflow = normalized.loops.find((loop) => String(loop.id) === String(workflowId));
  const child = normalized.loops.find((loop) => String(loop.id) === String(loopId));
  if (!workflow || !['dailyRoutine', 'workflowRoutine'].includes(workflow.strategy)) throw new Error(`Workflow not found: ${workflowId}`);
  if (!child) throw new Error(`Child Loop not found: ${loopId}`);
  if (['dailyRoutine', 'workflowRoutine'].includes(child.strategy)) throw new Error('Nested workflows are not supported');
  const step = options.name || options.rewardFlow
    ? { loopId: child.id, ...(options.name ? { name: options.name } : {}), ...(options.rewardFlow ? { rewardFlow: clone(options.rewardFlow) } : {}) }
    : child.id;
  workflow.steps = [...(workflow.steps || []), step];
  return normalized;
}

export function moveBuilderWorkflowStep(config, workflowId, fromIndex, toIndex) {
  const normalized = clone(normalizeLoopConfig(config));
  const workflow = normalized.loops.find((loop) => String(loop.id) === String(workflowId));
  if (!workflow || !Array.isArray(workflow.steps)) throw new Error(`Workflow not found: ${workflowId}`);
  const from = Number(fromIndex);
  const to = Math.max(0, Math.min(workflow.steps.length - 1, Number(toIndex)));
  if (!Number.isInteger(from) || from < 0 || from >= workflow.steps.length) throw new Error(`Invalid Workflow step index: ${fromIndex}`);
  const [step] = workflow.steps.splice(from, 1);
  workflow.steps.splice(to, 0, step);
  return normalized;
}

export function removeBuilderWorkflowStep(config, workflowId, index) {
  const normalized = clone(normalizeLoopConfig(config));
  const workflow = normalized.loops.find((loop) => String(loop.id) === String(workflowId));
  if (!workflow || !Array.isArray(workflow.steps)) throw new Error(`Workflow not found: ${workflowId}`);
  if (!Number.isInteger(Number(index)) || Number(index) < 0 || Number(index) >= workflow.steps.length) {
    throw new Error(`Invalid Workflow step index: ${index}`);
  }
  workflow.steps.splice(Number(index), 1);
  return normalized;
}

export function setBuilderWorkflowStepPath(config, workflowId, index, path, value) {
  const normalized = clone(normalizeLoopConfig(config));
  const workflow = normalized.loops.find((loop) => String(loop.id) === String(workflowId));
  const stepIndex = Number(index);
  if (!workflow || !Array.isArray(workflow.steps)) throw new Error(`Workflow not found: ${workflowId}`);
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= workflow.steps.length) {
    throw new Error(`Invalid Workflow step index: ${index}`);
  }
  const rawStep = workflow.steps[stepIndex];
  const step = typeof rawStep === 'string' ? { loopId: rawStep } : clone(rawStep);
  if (!step?.loopId) throw new Error(`Workflow step has no Loop reference: ${workflowId}[${index}]`);
  workflow.steps[stepIndex] = setBuilderPath(step, path, value);
  return normalized;
}

export function createBuilderStepVariant(config, workflowId, stepIndex) {
  let normalized = clone(normalizeLoopConfig(config));
  const workflow = normalized.loops.find((loop) => String(loop.id) === String(workflowId));
  const rawStep = workflow?.steps?.[Number(stepIndex)];
  const sourceId = typeof rawStep === 'string' ? rawStep : rawStep?.loopId;
  if (!workflow || !sourceId) throw new Error(`Workflow step not found: ${workflowId}[${stepIndex}]`);
  const source = normalized.loops.find((loop) => String(loop.id) === String(sourceId));
  if (!source) throw new Error(`Child Loop not found: ${sourceId}`);
  const result = duplicateBuilderLoop(normalized, source.id, {
    id: `${workflow.id}-${source.id}-step-${Number(stepIndex) + 1}`,
    name: `${source.name} (${workflow.name} step ${Number(stepIndex) + 1})`,
  });
  normalized = result.config;
  result.loop.hidden = true;
  const nextWorkflow = normalized.loops.find((loop) => String(loop.id) === String(workflowId));
  const step = typeof rawStep === 'string' ? { loopId: result.loop.id } : { ...clone(rawStep), loopId: result.loop.id };
  nextWorkflow.steps[Number(stepIndex)] = step;
  return { config: normalized, loop: result.loop };
}

export function setBuilderPath(object, path, value) {
  const result = clone(object);
  const parts = Array.isArray(path) ? path : String(path).split('.').filter(Boolean);
  let target = result;
  const parents = [];
  for (let index = 0; index < parts.length - 1; index++) {
    const key = parts[index];
    if (!isPlainObject(target[key]) && !Array.isArray(target[key])) target[key] = {};
    parents.push({ target, key });
    target = target[key];
  }
  const finalKey = parts.at(-1);
  if (value === undefined) delete target[finalKey];
  else target[finalKey] = clone(value);
  if (value === undefined) {
    for (let index = parents.length - 1; index >= 0; index--) {
      const parent = parents[index];
      const child = parent.target[parent.key];
      if (!isPlainObject(child) || Object.keys(child).length) break;
      delete parent.target[parent.key];
    }
  }
  return result;
}
