import { describe, expect, it } from 'vitest';
import {
  configureRoutineStepForAvailability,
  resolveRoutineStepLoopDefs,
} from '../../src/config/routine-steps.js';

function dailyLoop(overrides = {}) {
  return {
    id: 'one-click',
    name: 'One-click Daily Loop',
    strategy: 'dailyRoutine',
    steps: ['daily-bronze'],
    ...overrides,
  };
}

function childLoop(overrides = {}) {
  return {
    id: 'daily-bronze',
    name: 'Daily Bronze Loop',
    strategy: 'dailySingleCardRecycle',
    sbcNames: ['Daily Bronze Upgrade'],
    targetDuplicate: { tier: 'bronze' },
    priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
    ...overrides,
  };
}

describe('daily routine step projection', () => {
  it('inherits dry run, reward policy, and disabled piles without mutating the built-in child', () => {
    const child = childLoop();
    const resolved = resolveRoutineStepLoopDefs(dailyLoop({
      dryRun: true,
      openRewardPacks: false,
      disabledPiles: ['club'],
    }), [child]);

    expect(resolved[0]).toMatchObject({
      dryRun: true,
      openRewardPacks: false,
      disabledPiles: ['club'],
      priorityPiles: ['unassigned', 'storage', 'transfer'],
    });
    expect(child).not.toHaveProperty('dryRun');
    expect(child.priorityPiles).toEqual(['unassigned', 'storage', 'transfer', 'club']);
  });

  it('uses rewardFlow for child overrides while preserving forced rewards', () => {
    const resolved = resolveRoutineStepLoopDefs(dailyLoop({
      openRewardPacks: false,
      disabledPiles: ['club'],
    }), [childLoop({
      rewardFlow: { open: 'always' },
      disabledPiles: ['transfer'],
    })]);

    expect(resolved[0]).toMatchObject({
      openRewardPacks: true,
      disabledPiles: ['transfer', 'club'],
      priorityPiles: ['unassigned', 'storage'],
    });

    const forced = resolveRoutineStepLoopDefs(dailyLoop({ openRewardPacks: false }), [childLoop({
      forceOpenRewardPacks: true,
    })]);
    expect(forced[0].openRewardPacks).toBe(true);
  });

  it('projects inventory-only mode to every child strategy that supports it', () => {
    const recycle = childLoop();
    const common = childLoop({
      id: 'daily-common',
      strategy: 'supplyAndCraft',
      requirements: [{ tier: 'bronze', count: 5 }],
    });
    const resolved = resolveRoutineStepLoopDefs(dailyLoop({
      steps: ['daily-bronze', 'daily-common'],
      dailyRecycleInventoryOnly: true,
    }), [recycle, common]);

    expect(resolved[0].inventoryOnly).toBe(true);
    expect(resolved[1].inventoryOnly).toBe(true);
  });

  it('applies a One-click-only Rare Pack override without mutating the standalone loop', () => {
    const standalone = childLoop({
      id: 'daily-rare-pack-84',
      strategy: 'rarePackTo84Upgrade',
      sourcePackNames: ['Rare Pack'],
      rareUpgrade: { name: '2x84+', sbcNames: ['2x84+'], requirements: [{ count: 6 }] },
      useRoundsAsCompletions: true,
      maxCompletions: 3,
      consumeAllSourcePacks: true,
    });
    const [resolved] = resolveRoutineStepLoopDefs(dailyLoop({
      steps: ['daily-rare-pack-84'],
      stepOverrides: {
        'daily-rare-pack-84': {
          useRoundsAsCompletions: false,
          sourceExhaustedFallbackMaxCompletions: 1,
        },
      },
    }), [standalone]);

    expect(resolved).toMatchObject({
      id: 'daily-rare-pack-84',
      strategy: 'rarePackTo84Upgrade',
      useRoundsAsCompletions: false,
      sourceExhaustedFallbackMaxCompletions: 1,
    });
    expect(standalone.useRoundsAsCompletions).toBe(true);
    expect(standalone).not.toHaveProperty('sourceExhaustedFallbackMaxCompletions');
  });

  it('keeps child business limits on the child loop and applies contextual reward flow', () => {
    const [resolved] = resolveRoutineStepLoopDefs({
      id: 'custom-workflow',
      name: 'Custom workflow',
      strategy: 'workflowRoutine',
      openRewardPacks: false,
      steps: [{
        loopId: 'daily-bronze',
        name: 'Bronze with reward handling',
        rewardFlow: {
          open: 'always',
          packIds: [105],
          packNames: ['Bronze Players Premium'],
        },
      }],
    }, [childLoop({ maxCompletions: 2, rewardPackIds: [999] })]);

    expect(resolved).toMatchObject({
      id: 'daily-bronze',
      name: 'Bronze with reward handling',
      maxCompletions: 2,
      openRewardPacks: true,
      rewardPackIds: [105],
      rewardPackNames: ['Bronze Players Premium'],
    });
  });

  it('inherits parent recovery defaults while preserving child and step-specific policies', () => {
    const parentDefault = resolveRoutineStepLoopDefs(dailyLoop({
      strategy: 'workflowRoutine',
      unassignedRecoveryPolicyIds: ['parent-policy'],
    }), [childLoop()]);
    expect(parentDefault[0].unassignedRecoveryPolicyIds).toEqual(['parent-policy']);

    const [childSpecific] = resolveRoutineStepLoopDefs(dailyLoop({
      strategy: 'workflowRoutine',
      unassignedRecoveryPolicyIds: ['parent-policy'],
      steps: [{
        loopId: 'daily-bronze',
        rewardFlow: { unassignedRecoveryPolicyIds: ['step-policy'] },
      }],
    }), [childLoop({ unassignedRecoveryPolicyIds: ['child-policy'] })]);
    expect(childSpecific.unassignedRecoveryPolicyIds).toEqual(['step-policy']);
  });

  it('projects global Pick and Daily inventory-only settings to matching child loops', () => {
    const pick = childLoop({
      id: 'dynamic-pick',
      strategy: 'playerPickSbc',
      requirements: [{ tier: 'gold', count: 4, maxRating: 85 }],
      sbcNames: ['Dynamic Pick'],
      pickItemNames: ['Dynamic Pick Reward'],
    });
    const [recycle, resolvedPick] = resolveRoutineStepLoopDefs(dailyLoop({
      strategy: 'workflowRoutine',
      steps: ['daily-bronze', 'dynamic-pick'],
      dailyRecycleInventoryOnly: true,
      runtimePickOptions: {
        protectHighGold: true,
        autoSelectBelow90: false,
        openPicksAtEnd: true,
        highGoldThreshold: 84,
        autoPickThreshold: 91,
      },
    }), [childLoop(), pick]);

    expect(recycle.inventoryOnly).toBe(true);
    expect(resolvedPick).toMatchObject({
      protectHighGold: true,
      autoSelectBelow90: false,
      openPicksAtEnd: true,
      pickHighGoldThreshold: 84,
      autoPickRatingThreshold: 91,
      requirements: [{ maxRating: 83 }],
    });
  });

  it('inherits declarative parent Pick options before runtime projection', () => {
    const pick = childLoop({
      id: 'pick-child',
      strategy: 'playerPickSbc',
      requirements: [{ tier: 'gold', count: 4, maxRating: 85 }],
      sbcNames: ['Pick Child'],
      pickItemNames: ['Pick Reward'],
      pickOptions: { openAtEnd: false },
    });
    const [resolved] = resolveRoutineStepLoopDefs(dailyLoop({
      strategy: 'workflowRoutine',
      steps: ['pick-child'],
      pickOptions: { highGoldThreshold: 84, openAtEnd: true },
    }), [pick]);

    expect(resolved).toMatchObject({
      pickHighGoldThreshold: 84,
      openPicksAtEnd: false,
      requirements: [{ maxRating: 83, maxRatingBeforeHighGoldProtection: 85 }],
    });
  });

  it('uses the current EA remaining count instead of capping it with stale local limits', () => {
    const configured = configureRoutineStepForAvailability(
      childLoop({ maxCompletions: 7 }),
      { remaining: 12 },
    );
    expect(configured.maxCompletions).toBe(12);
  });

  it('preserves the intentional single-completion cap for MVP Daily validation steps', () => {
    const configured = configureRoutineStepForAvailability(
      childLoop({ mvp: true, maxCompletions: 1 }),
      { remaining: 6 },
    );
    expect(configured.maxCompletions).toBe(1);
  });

  it('uses an internal safety cap instead of the stale Daily count when EA progress is unavailable', () => {
    const configured = configureRoutineStepForAvailability(
      childLoop({ maxCompletions: 7 }),
      { available: true, remaining: null, safetyLimit: 100 },
    );
    expect(configured.maxCompletions).toBe(100);
  });

  it('rejects self references, missing steps, and nested routines with the existing messages', () => {
    expect(() => resolveRoutineStepLoopDefs(dailyLoop({ steps: ['one-click'] }), []))
      .toThrow('One-click Daily Loop: step 1 cannot reference itself');
    expect(() => resolveRoutineStepLoopDefs(dailyLoop({ steps: ['missing'] }), []))
      .toThrow('One-click Daily Loop: step 1 loop not found: missing');
    expect(() => resolveRoutineStepLoopDefs(dailyLoop(), [childLoop({ strategy: 'dailyRoutine', steps: ['other'] })]))
      .toThrow('One-click Daily Loop: nested routine steps are not supported');
  });
});
