import { describe, expect, it } from 'vitest';
import {
  getLiveRunLimit,
  getPlayerPickChallengeCount,
  summarizeRoutineStepLimits,
} from '../../src/config/run-limits.js';

describe('configured run limits', () => {
  it('calculates validation, rating, Player Pick, and Rare Pack limits', () => {
    expect(getLiveRunLimit({ strategy: 'validationBronzeUpgrade', maxRounds: 3 }, 5)).toBe(5);
    expect(getLiveRunLimit({ strategy: 'rarePackTo84Upgrade', maxPacks: 100 })).toBe(100);
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
      { name: 'Daily Bronze Loop', strategy: 'dailySingleCardRecycle', maxCompletions: 7 },
      { name: 'Daily Rare Pack to 2x84+ Loop', strategy: 'rarePackTo84Upgrade', maxPacks: 100 },
    ]);
    expect(summary).toEqual({
      limits: [
        { name: 'Daily Bronze Loop', limit: 7, unit: 'SBC(s)' },
        { name: 'Daily Rare Pack to 2x84+ Loop', limit: 100, unit: 'pack(s)' },
      ],
      max: 100,
      total: 107,
      text: 'Daily Bronze Loop max 7 SBC(s); Daily Rare Pack to 2x84+ Loop max 100 pack(s)',
    });
  });

  it('calculates a routine limit through the injected child resolver', () => {
    const routine = { strategy: 'dailyRoutine', steps: ['daily-bronze', 'rare-pack'] };
    const steps = [
      { strategy: 'dailySingleCardRecycle', maxCompletions: 7 },
      { strategy: 'rarePackTo84Upgrade', maxPacks: 100 },
    ];
    expect(getLiveRunLimit(routine, 1, { getRoutineSteps: () => steps })).toBe(100);
  });
});
