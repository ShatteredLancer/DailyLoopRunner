import { describe, expect, it } from 'vitest';
import { LOOP_STRATEGIES } from '../../src/domain/strategies.js';
import { LOOP_DEFS } from '../../src/config/loops.js';
import {
  BUILDER_COMMON_FIELDS,
  BUILDER_STRATEGY_DESCRIPTORS,
  getBuilderLoopFields,
} from '../../src/config/builder-descriptors.js';
import {
  addBuilderLoop,
  addBuilderWorkflowStep,
  createBuilderStepVariant,
  createLoopTemplate,
  findBuilderReferences,
  findBuilderRecoveryReferences,
  moveBuilderWorkflowStep,
  removeBuilderLoop,
  removeBuilderRecovery,
  renameBuilderLoopId,
  renameBuilderRecoveryId,
  setBuilderWorkflowStepPath,
} from '../../src/config/builder-editor.js';

function config() {
  return {
    loops: [
      { id: 'flow', name: 'Flow', strategy: 'workflowRoutine', steps: ['child'] },
      { id: 'child', name: 'Child', strategy: 'fillAndVerifySbc', sbcNames: ['SBC'], maxCompletions: 1 },
    ],
    recoveryRecipes: [],
    unassignedRecoveryPolicies: [],
    defaultUnassignedRecoveryPolicyIds: [],
  };
}

describe('Builder editor model', () => {
  it('has a visual descriptor and constructible template for every strategy', () => {
    expect(Object.keys(BUILDER_STRATEGY_DESCRIPTORS).sort()).toEqual([...LOOP_STRATEGIES].sort());
    for (const strategy of LOOP_STRATEGIES) {
      const template = createLoopTemplate(strategy);
      expect(template.strategy).toBe(strategy);
      expect(getBuilderLoopFields(template).length).toBeGreaterThan(3);
    }
  });

  it('covers every top-level field used by built-in Loops', () => {
    const common = new Set(BUILDER_COMMON_FIELDS.map((field) => field.path));
    for (const loop of LOOP_DEFS) {
      const strategy = new Set(BUILDER_STRATEGY_DESCRIPTORS[loop.strategy].fields.map((field) => field.path));
      const missing = Object.keys(loop).filter((key) => !common.has(key) && !strategy.has(key));
      expect(missing, `${loop.id} is missing Builder fields`).toEqual([]);
    }
  });

  it('uses structured descriptors for nested objects that cannot be scalar inputs', () => {
    const fields = new Map(BUILDER_STRATEGY_DESCRIPTORS.fillAndVerifySbc.fields.map((field) => [field.path, field.type]));
    expect(fields.get('specialRequirementAdd')).toBe('special-requirement-control');
    expect(fields.get('autoTotwUpgrade')).toBe('auto-totw-upgrade');
    expect(fields.get('autoFodderUpgrade')).toBe('auto-fodder-upgrade');
  });

  it('adds unique custom Loops and rejects nested Workflow steps', () => {
    const added = addBuilderLoop(config(), 'fillAndVerifySbc', { id: 'child', name: 'Child' });
    expect(added.loop.id).toBe('child-2');
    expect(() => addBuilderWorkflowStep(added.config, 'flow', 'flow')).toThrow(/Nested workflows/);
  });

  it('renames Loop IDs and every established reference transactionally', () => {
    const input = config();
    input.loops.push({
      id: 'fallback-owner',
      name: 'Fallback owner',
      strategy: 'rarePackTo84Upgrade',
      sourcePackNames: ['Pack'],
      rareUpgrade: { name: 'Upgrade', sbcNames: ['Upgrade'], requirements: [{ tier: 'gold', count: 1 }] },
      sourceExhaustedFallbackLoopId: 'child',
    });
    const renamed = renameBuilderLoopId(input, 'child', 'renamed-child');
    expect(renamed.config.loops[0].steps).toEqual(['renamed-child']);
    expect(renamed.config.loops[2].sourceExhaustedFallbackLoopId).toBe('renamed-child');
  });

  it('reports references before delete and creates private Step Variants', () => {
    expect(findBuilderReferences(config(), 'child')).toEqual([
      { type: 'workflow-step', ownerId: 'flow', index: 0 },
    ]);
    expect(() => removeBuilderLoop(config(), 'child')).toThrow(/referenced/);
    const variant = createBuilderStepVariant(config(), 'flow', 0);
    expect(variant.loop.hidden).toBe(true);
    expect(variant.config.loops[0].steps[0]).toMatchObject({ loopId: variant.loop.id });
  });

  it('reorders Workflow steps without changing referenced Loops', () => {
    let input = addBuilderLoop(config(), 'fillAndVerifySbc', { id: 'second', name: 'Second' }).config;
    input = addBuilderWorkflowStep(input, 'flow', 'second');
    input = moveBuilderWorkflowStep(input, 'flow', 1, 0);
    expect(input.loops.find((loop) => loop.id === 'flow').steps).toEqual(['second', 'child']);
  });

  it('promotes string Workflow steps to objects without losing the Loop reference', () => {
    const updated = setBuilderWorkflowStepPath(config(), 'flow', 0, 'name', 'Custom child');
    expect(updated.loops[0].steps[0]).toEqual({ loopId: 'child', name: 'Custom child' });
    const withReward = setBuilderWorkflowStepPath(updated, 'flow', 0, 'rewardFlow.open', 'never');
    expect(withReward.loops[0].steps[0]).toEqual({
      loopId: 'child',
      name: 'Custom child',
      rewardFlow: { open: 'never' },
    });
  });

  it('renames Recovery IDs and all policy references transactionally', () => {
    const input = config();
    input.recoveryRecipes = [{ id: 'recipe', name: 'Recipe', sbcNames: ['SBC'], requirements: [{ tier: 'gold', count: 1 }] }];
    input.unassignedRecoveryPolicies = [{ id: 'policy', match: { tier: 'gold' }, steps: [{ recipeId: 'recipe' }] }];
    input.defaultUnassignedRecoveryPolicyIds = ['policy'];
    input.loops[1].unassignedRecoveryPolicyIds = ['policy'];
    const recipe = renameBuilderRecoveryId(input, 'recoveryRecipes', 'recipe', 'renamed-recipe');
    expect(recipe.config.unassignedRecoveryPolicies[0].steps[0].recipeId).toBe('renamed-recipe');
    const policy = renameBuilderRecoveryId(recipe.config, 'unassignedRecoveryPolicies', 'policy', 'renamed-policy');
    expect(policy.config.defaultUnassignedRecoveryPolicyIds).toEqual(['renamed-policy']);
    expect(policy.config.loops[1].unassignedRecoveryPolicyIds).toEqual(['renamed-policy']);
  });

  it('blocks deleting referenced Recovery objects', () => {
    const input = config();
    input.recoveryRecipes = [{ id: 'recipe', name: 'Recipe', sbcNames: ['SBC'], requirements: [{ tier: 'gold', count: 1 }] }];
    input.unassignedRecoveryPolicies = [{ id: 'policy', match: { tier: 'gold' }, steps: [{ recipeId: 'recipe' }] }];
    expect(findBuilderRecoveryReferences(input, 'recoveryRecipes', 'recipe')).toHaveLength(1);
    expect(() => removeBuilderRecovery(input, 'recoveryRecipes', 'recipe')).toThrow(/referenced/);
  });
});
