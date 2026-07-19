import { describe, expect, it } from 'vitest';
import {
  getLiveRunLimit,
  getPlayerPickChallengeCount,
  resolvePlayerPickRunTarget,
  summarizeRoutineStepLimits,
} from '../../src/config/run-limits.js';

describe('configured run limits', () => {
  it('calculates validation, rating, Player Pick, and Rare Pack limits', () => {
    expect(getLiveRunLimit({ strategy: 'validationBronzeUpgrade', maxRounds: 3 }, 5)).toBe(5);
    expect(getLiveRunLimit({
      strategy: 'rarePackTo84Upgrade',
      maxPacks: 100,
      maxCompletions: 3,
      useRoundsAsCompletions: true,
      consumeAllSourcePacks: true,
    })).toBe(3);
    expect(getPlayerPickChallengeCount({ challengeRequirements: [[], []] })).toBe(2);
    expect(getLiveRunLimit({
      strategy: 'playerPickSbc',
      maxCompletions: 5,
      challengesPerPick: 2,
    })).toBe(10);
    expect(getLiveRunLimit({
      strategy: 'fillAndVerifySbc',
      maxCompletions: 50,
    }, 1, { needsAutoTotwPreflight: () => true })).toBe(100);
  });

  it('preserves One-click stage labels, units, total, and maximum', () => {
    const summary = summarizeRoutineStepLimits([
      { name: 'Daily Bronze Loop', strategy: 'dailySingleCardRecycle', dailyCompletionLimit: 7, maxCompletions: 7 },
      {
        name: 'Daily Rare Pack to 2x84+ Loop',
        strategy: 'rarePackTo84Upgrade',
        maxPacks: 100,
        useRoundsAsCompletions: false,
        consumeAllSourcePacks: true,
      },
    ]);
    expect(summary).toEqual({
      limits: [
        { name: 'Daily Bronze Loop', limit: 7, unit: 'SBC(s)', policy: 'current EA daily remaining' },
        { name: 'Daily Rare Pack to 2x84+ Loop', limit: 100, unit: 'SBC(s)', policy: 'all matching source packs' },
      ],
      max: 100,
      total: 107,
      text: 'Daily Bronze Loop: current EA daily remaining; Daily Rare Pack to 2x84+ Loop: all matching source packs',
    });
  });

  it('describes source-driven Daily stages without presenting their safety cap as rounds', () => {
    const summary = summarizeRoutineStepLimits([{
      name: 'Daily Rare Pack to 2x84+ Loop',
      strategy: 'rarePackTo84Upgrade',
      maxCompletions: 1,
      useRoundsAsCompletions: false,
      consumeAllSourcePacks: true,
    }]);
    expect(summary.text).toBe('Daily Rare Pack to 2x84+ Loop: all matching source packs');
  });

  it('calculates a routine limit through the injected child resolver', () => {
    const routine = { strategy: 'dailyRoutine', steps: ['daily-bronze', 'rare-pack'] };
    const steps = [
      { strategy: 'dailySingleCardRecycle', maxCompletions: 7 },
      {
        strategy: 'rarePackTo84Upgrade',
        maxPacks: 100,
        useRoundsAsCompletions: false,
        consumeAllSourcePacks: true,
      },
    ];
    expect(getLiveRunLimit(routine, 1, { getRoutineSteps: () => steps })).toBe(100);
  });

  it('combines pending rewards with the live remaining count for limited Player Picks', () => {
    const limited = { strategy: 'playerPickSbc', exhaustSbcSet: true, setCompletionSafetyLimit: 20 };
    expect(resolvePlayerPickRunTarget(limited, { pendingCount: 2, remainingCompletions: 3 })).toEqual({
      maxPicks: 5,
      pendingCount: 2,
      remainingCompletions: 3,
      usedSafetyLimit: false,
    });
    expect(resolvePlayerPickRunTarget(limited, { pendingCount: 5, remainingCompletions: null })).toEqual({
      maxPicks: 25,
      pendingCount: 5,
      remainingCompletions: 20,
      usedSafetyLimit: true,
    });
    expect(resolvePlayerPickRunTarget(limited, { pendingCount: 0, remainingCompletions: 0 }).maxPicks).toBe(0);
  });
});
