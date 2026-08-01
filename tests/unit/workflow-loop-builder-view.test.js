import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_LOOP_BUILDER_STYLE,
  mountWorkflowLoopBuilder,
  workflowLoopBuilderHtml,
} from '../../src/ui/workflow-loop-builder-view.js';

function config() {
  return {
    loops: [
      { id: 'flow', name: 'Flow', strategy: 'workflowRoutine', steps: ['child'] },
      { id: 'child', name: 'Child', strategy: 'fillAndVerifySbc', sbcNames: ['SBC'], requirements: [{ tier: 'gold', count: 1 }] },
    ],
    recoveryRecipes: [{ id: 'recipe', name: 'Recipe', sbcNames: ['SBC'], requirements: [{ tier: 'gold', count: 1 }] }],
    unassignedRecoveryPolicies: [{ id: 'policy', match: { tier: 'gold' }, steps: [{ recipeId: 'recipe' }] }],
    defaultUnassignedRecoveryPolicyIds: ['policy'],
  };
}

function model(overrides = {}) {
  const draft = config();
  return {
    store: { activeProfileId: null, profiles: [{ id: 'default', name: 'Default' }] },
    profile: { id: 'default', name: 'Default', draftRevision: 2, savedRevision: 1 },
    tab: 'workflows',
    search: '',
    config: draft,
    discoveredLoops: [],
    sources: {
      loops: draft.loops.map((loop) => ({ id: loop.id, source: 'built-in' })),
      recoveryRecipes: [{ id: 'recipe', source: 'built-in' }],
      unassignedRecoveryPolicies: [{ id: 'policy', source: 'built-in' }],
    },
    selectedKind: 'loops',
    selectedId: 'flow',
    selectedObject: draft.loops[0],
    selectedSource: 'built-in',
    selectedStep: 0,
    selectedStepData: { loopId: 'child' },
    editorReadOnly: true,
    references: [],
    validation: { valid: true, errors: [], conflicts: [], unavailableBindings: [], config: draft },
    generatedJson: JSON.stringify(draft, null, 2),
    jsonInput: '',
    jsonMessage: '',
    jsonValid: false,
    ...overrides,
  };
}

describe('Workflow and Loop Builder view', () => {
  it('renders the full workspace, source library, Workflow steps, and inspector', () => {
    const html = workflowLoopBuilderHtml(model());
    expect(html).toContain('Workflow Builder');
    expect(html).toContain('data-tab="workflows"');
    expect(html).toContain('data-tab="loops"');
    expect(html).toContain('data-tab="recovery"');
    expect(html).toContain('data-tab="dynamic"');
    expect(html).toContain('data-tab="json"');
    expect(html).toContain('data-builder-action="add-step"');
    expect(html).toContain('data-builder-action="variant-step"');
    expect(html).toContain('Selected step');
    expect(html).toContain('Override');
    expect(html).toContain('data-builder-action="undo-draft"');
    expect(html).toContain('data-builder-action="redo-draft"');
    expect(html).toContain('data-builder-action="preview-profile"');
    expect(html).toContain('data-builder-action="show-import"');
    expect(html).toContain('data-builder-action="export-json"');
  });

  it('renders every major structured editor instead of a raw Loop JSON input', () => {
    const producer = {
      id: 'producer',
      name: 'Producer',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['Producer SBC'],
      requirements: [{ tier: 'gold', count: 1 }],
    };
    const loop = {
      id: 'supply',
      name: 'Supply',
      strategy: 'supplyAndCraft',
      sbcNames: ['SBC'],
      requirements: [{ tier: 'gold', rarity: 'common', count: 5 }],
      sourcePackRef: { rewardOfLoopId: 'producer' },
      shortagePacks: [{
        requirement: { tier: 'gold' },
        sourcePackRef: { rewardOfLoopId: 'producer' },
        packNames: ['Pack'],
      }],
      primaryPiles: ['unassigned', 'storage'],
    };
    const html = workflowLoopBuilderHtml(model({
      tab: 'loops',
      config: { ...config(), loops: [producer, loop] },
      selectedId: loop.id,
      selectedObject: loop,
      selectedSource: 'custom',
      editorReadOnly: false,
      sources: { loops: [{ id: producer.id, source: 'custom' }, { id: loop.id, source: 'custom' }], recoveryRecipes: [], unassignedRecoveryPolicies: [] },
    }));
    expect(html).toContain('Requirements');
    expect(html).toContain('Shortage packs');
    expect(html).toContain('Primary pile order');
    expect(html).toContain('Duplicate routing');
    expect(html).toContain('Reward produced by Loop');
    expect(html).toContain('data-builder-field="sourcePackRef.rewardOfLoopId"');
    expect(html).toContain('data-builder-field="shortagePacks.0.sourcePackRef.rewardOfLoopId"');
    expect(html).not.toContain('Edit loop JSON');
  });

  it('keeps JSON as a validation and generated-output view', () => {
    const html = workflowLoopBuilderHtml(model({ tab: 'json' }));
    expect(html).toContain('Paste / validate');
    expect(html).toContain('Generated draft');
    expect(html).toContain('Validate pasted JSON');
    expect(html).toContain('Import valid JSON');
  });

  it('previews the materialized Workflow without exposing execution controls', () => {
    const html = workflowLoopBuilderHtml(model({ previewOpen: true }));
    expect(html).toContain('Configuration preview');
    expect(html).toContain('Read-only');
    expect(html).toContain('Flow');
    expect(html).toContain('Child');
    expect(html).toContain('data-builder-action="close-preview"');
    expect(html).not.toContain('data-builder-action="add-step"');
  });

  it('edits the default Recovery policy set visually', () => {
    const draft = config();
    const policy = draft.unassignedRecoveryPolicies[0];
    const html = workflowLoopBuilderHtml(model({
      tab: 'recovery',
      config: draft,
      selectedKind: 'unassignedRecoveryPolicies',
      selectedId: policy.id,
      selectedObject: policy,
      selectedSource: 'custom',
      editorReadOnly: false,
    }));
    expect(html).toContain('Use by default');
    expect(html).toContain('data-builder-action="toggle-default-policy"');
    expect(html).toContain('<option value="true" selected>Enabled</option>');
  });

  it('renders requirement pile order and complete automatic recovery editors', () => {
    const loop = {
      id: 'rating',
      name: 'Rating SBC',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['SBC'],
      requirements: [{ tier: 'gold', count: 1, priorityPiles: ['unassigned', 'club'] }],
      autoTotwUpgrade: {
        name: 'TOTW Upgrade',
        sbcNames: ['TOTW Upgrade'],
        rewardPackIds: [1],
        rewardPackNames: ['TOTW Pack'],
        sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 88 },
        blockSpecial: true,
      },
      autoFodderUpgrade: { maxAttemptsPerCompletion: 3 },
    };
    const html = workflowLoopBuilderHtml(model({
      tab: 'loops',
      config: { ...config(), loops: [loop] },
      selectedId: loop.id,
      selectedObject: loop,
      selectedSource: 'custom',
      editorReadOnly: false,
      sources: { loops: [{ id: loop.id, source: 'custom' }], recoveryRecipes: [], unassignedRecoveryPolicies: [] },
    }));
    expect(html).toContain('data-path="requirements.0.priorityPiles"');
    expect(html).toContain('data-builder-field="autoTotwUpgrade.sbcNames.0"');
    expect(html).toContain('data-builder-field="autoTotwUpgrade.rewardPackIds.0"');
    expect(html).toContain('data-builder-field="autoTotwUpgrade.sbcFodderPolicy.ratingSbcMaxCardRating"');
    expect(html).toContain('data-builder-add-select="autoTotwUpgrade.ratingSbcFill.priorityPiles"');
    expect(html).toContain('data-builder-field="autoFodderUpgrade.maxAttemptsPerCompletion"');
  });

  it('renders stable stage IDs and nested reward pack selectors', () => {
    const loop = {
      id: 'exhaust',
      name: 'Exhaust',
      strategy: 'inventoryExhaustion',
      stages: [{
        id: 'stage-one',
        name: 'Stage one',
        sbcNames: ['SBC'],
        requirements: [{ tier: 'gold', count: 1 }],
        rewardPackIds: [105],
        rewardPackNames: ['Pack'],
      }],
    };
    const html = workflowLoopBuilderHtml(model({
      tab: 'loops',
      config: { ...config(), loops: [loop] },
      selectedId: loop.id,
      selectedObject: loop,
      selectedSource: 'custom',
      editorReadOnly: false,
      sources: { loops: [{ id: loop.id, source: 'custom' }], recoveryRecipes: [], unassignedRecoveryPolicies: [] },
    }));
    expect(html).toContain('data-builder-field="stages.0.id"');
    expect(html).toContain('data-builder-field="stages.0.rewardPackIds.0"');
    expect(html).toContain('data-builder-field="stages.0.rewardPackNames.0"');
  });

  it('renders dynamic activity bindings and the Provision common-Gold Pick selector', () => {
    const loop = {
      id: 'provision',
      name: 'Provision',
      strategy: 'provisionPackCrafting',
      preCraftPlayerPickSelector: { material: 'common-gold' },
      craftingUpgrades: [{
        id: 'craft',
        name: 'Crafting Upgrade',
        activityBinding: {
          family: 'common-gold-material-upgrade',
          classes: ['premium'],
          preference: 'reward-first',
          selectionMaterial: 'rare-gold',
          category: 'Upgrades',
          required: true,
        },
        sbcNames: ['Compatibility Upgrade'],
        requirements: [{ tier: 'gold', rarity: 'common', count: 9 }],
      }],
    };
    const html = workflowLoopBuilderHtml(model({
      tab: 'loops',
      config: { ...config(), loops: [loop] },
      selectedId: loop.id,
      selectedObject: loop,
      selectedSource: 'custom',
      editorReadOnly: false,
      sources: { loops: [{ id: loop.id, source: 'custom' }], recoveryRecipes: [], unassignedRecoveryPolicies: [] },
    }));

    expect(html).toContain('data-builder-field="preCraftPlayerPickSelector.material"');
    expect(html).toContain('data-builder-field="craftingUpgrades.0.activityBinding.family"');
    expect(html).toContain('data-builder-field="craftingUpgrades.0.activityBinding.required"');
    expect(html).toContain('common-gold-material-upgrade');
    expect(html).toContain('data-builder-field="craftingUpgrades.0.activityBinding.classes"');
    expect(html).toContain('<option value="premium" selected>premium</option>');
    expect(html).toContain('data-builder-field="craftingUpgrades.0.activityBinding.preference"');
    expect(html).toContain('data-builder-field="craftingUpgrades.0.activityBinding.selectionMaterial"');
    expect(html).toContain('<option value="rare-gold" selected>Rare Gold only</option>');
  });

  it('renders a dynamic activity family selector for source-exhausted fallback', () => {
    const loop = {
      id: 'rare-pack',
      name: 'Rare pack',
      strategy: 'rarePackTo84Upgrade',
      sourcePackNames: ['Pack'],
      sourceExhaustedFallbackActivityFamily: 'rare-gold-material-upgrade',
      rareUpgrade: {
        name: 'Upgrade',
        sbcNames: ['Upgrade'],
        requirements: [{ tier: 'gold', rarity: 'rare', count: 6 }],
      },
    };
    const html = workflowLoopBuilderHtml(model({
      tab: 'loops',
      config: { ...config(), loops: [loop] },
      selectedId: loop.id,
      selectedObject: loop,
      selectedSource: 'custom',
      editorReadOnly: false,
      sources: { loops: [{ id: loop.id, source: 'custom' }], recoveryRecipes: [], unassignedRecoveryPolicies: [] },
    }));
    expect(html).toContain('data-builder-field="sourceExhaustedFallbackActivityFamily"');
    expect(html).toContain('<option value="rare-gold-material-upgrade" selected>rare-gold-material-upgrade</option>');
  });

  it('renders special controls, complete Recovery behavior, and Workflow step reward flow', () => {
    const draft = config();
    draft.loops[0].steps = [{
      loopId: 'child',
      rewardFlow: { open: 'always', packIds: [105], packNames: ['Pack'], unassignedRecoveryPolicyIds: ['policy'] },
    }];
    const flowHtml = workflowLoopBuilderHtml(model({
      config: draft,
      selectedObject: draft.loops[0],
      selectedStepData: draft.loops[0].steps[0],
      selectedSource: 'custom',
      editorReadOnly: false,
    }));
    expect(flowHtml).toContain('data-builder-field="steps.0.rewardFlow.packIds.0"');
    expect(flowHtml).toContain('data-builder-field="steps.0.rewardFlow.packNames.0"');
    expect(flowHtml).toContain('data-builder-field="steps.0.rewardFlow.unassignedRecoveryPolicyIds.0"');

    const specialLoop = {
      id: 'special',
      name: 'Special',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['SBC'],
      specialRequirementAdd: { patterns: ['TOTW'], buttonTexts: ['Add'] },
    };
    const specialHtml = workflowLoopBuilderHtml(model({
      tab: 'loops',
      config: { ...draft, loops: [specialLoop] },
      selectedId: specialLoop.id,
      selectedObject: specialLoop,
      selectedSource: 'custom',
      editorReadOnly: false,
      sources: { loops: [{ id: specialLoop.id, source: 'custom' }], recoveryRecipes: [], unassignedRecoveryPolicies: [] },
    }));
    expect(specialHtml).toContain('data-builder-field="specialRequirementAdd.patterns.0"');
    expect(specialHtml).toContain('data-builder-field="specialRequirementAdd.buttonTexts.0"');

    const recipe = {
      ...draft.recoveryRecipes[0],
      maxSubmissions: 1,
      mustConsumeTrigger: true,
      onUnavailable: 'continue',
      onInsufficient: 'continue',
      onBlocked: 'stop',
    };
    const recoveryHtml = workflowLoopBuilderHtml(model({
      tab: 'recovery',
      config: { ...draft, recoveryRecipes: [recipe] },
      selectedKind: 'recoveryRecipes',
      selectedId: recipe.id,
      selectedObject: recipe,
      selectedSource: 'custom',
      editorReadOnly: false,
    }));
    expect(recoveryHtml).toContain('data-builder-field="maxSubmissions"');
    expect(recoveryHtml).toContain('data-builder-field="mustConsumeTrigger"');
    expect(recoveryHtml).toContain('data-builder-field="onBlocked"');
  });

  it('defines stable desktop and narrow responsive layouts', () => {
    expect(WORKFLOW_LOOP_BUILDER_STYLE).toContain('grid-template-columns: 260px minmax(420px, 1fr) 340px');
    expect(WORKFLOW_LOOP_BUILDER_STYLE).toContain('.dlr-builder-body { min-height: 0;');
    expect(WORKFLOW_LOOP_BUILDER_STYLE).toContain('@media (max-width: 900px)');
    expect(WORKFLOW_LOOP_BUILDER_STYLE).toContain('@media (max-width: 620px)');
    expect(WORKFLOW_LOOP_BUILDER_STYLE).not.toContain('letter-spacing: -');
  });

  it('renders actionable built-in conflict choices', () => {
    const current = model();
    const html = workflowLoopBuilderHtml({
      ...current,
      validation: {
        ...current.validation,
        valid: false,
        errors: ['1 built-in conflict(s) require resolution'],
        conflicts: [{ collection: 'loops', id: 'flow', path: 'name', reason: 'both-changed' }],
      },
    });
    expect(html).toContain('Built-in conflicts');
    expect(html).toContain('Use built-in');
    expect(html).toContain('Keep mine');
  });

  it('mounts one full-screen dialog through the DOM adapter', () => {
    const existing = new Map();
    const head = [];
    const body = [];
    const dom = {
      query: (selector) => existing.get(selector) || null,
      create: (tagName) => ({ tagName, setAttribute() {} }),
      appendToHead: (element) => { head.push(element); existing.set(`#${element.id}`, element); },
      appendToBody: (element) => { body.push(element); existing.set(`#${element.id}`, element); },
    };
    const first = mountWorkflowLoopBuilder({ dom });
    const second = mountWorkflowLoopBuilder({ dom });
    expect(first.created).toBe(true);
    expect(second).toEqual({ root: first.root, created: false });
    expect(head[0].textContent).toBe(WORKFLOW_LOOP_BUILDER_STYLE);
    expect(body[0].id).toBe('dlr-workflow-builder');
  });
});
