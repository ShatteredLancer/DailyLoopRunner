import { describe, expect, it } from 'vitest';
import { resolveRoutineStepLoopDefs } from '../../src/config/routine-steps.js';

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

  it('preserves child-specific reward and disabled-pile settings', () => {
    const resolved = resolveRoutineStepLoopDefs(dailyLoop({
      openRewardPacks: false,
      disabledPiles: ['club'],
    }), [childLoop({
      openRewardPacks: true,
      disabledPiles: ['transfer'],
    })]);

    expect(resolved[0]).toMatchObject({
      openRewardPacks: true,
      disabledPiles: ['transfer'],
      priorityPiles: ['unassigned', 'storage', 'club'],
    });
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
