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

  it('lets the current routine reward option override child defaults while preserving forced rewards', () => {
    const resolved = resolveRoutineStepLoopDefs(dailyLoop({
      openRewardPacks: false,
      disabledPiles: ['club'],
    }), [childLoop({
      openRewardPacks: true,
      disabledPiles: ['transfer'],
    })]);

    expect(resolved[0]).toMatchObject({
      openRewardPacks: false,
      disabledPiles: ['transfer'],
      priorityPiles: ['unassigned', 'storage', 'club'],
    });

    const forced = resolveRoutineStepLoopDefs(dailyLoop({ openRewardPacks: false }), [childLoop({
      forceOpenRewardPacks: true,
    })]);
    expect(forced[0].openRewardPacks).toBe(true);
  });

  it('projects inventory-only mode only to Daily Bronze and Silver recycle steps', () => {
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

    expect(resolved[0].dailyRecycleInventoryOnly).toBe(true);
    expect(resolved[1]).not.toHaveProperty('dailyRecycleInventoryOnly');
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
      .toThrow('One-click Daily Loop: nested dailyRoutine steps are not supported');
  });
});
