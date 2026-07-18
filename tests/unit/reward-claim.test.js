import { describe, expect, it } from 'vitest';
import { hasPackCountIncrease, hasSbcProgressAdvanced } from '../../src/sbc/reward-claim.js';

describe('SBC reward claim completion signals', () => {
  it('detects a newly granted pack even when that pack type already existed', () => {
    expect(hasPackCountIncrease(
      new Map([['1031', 4], ['1078', 1]]),
      new Map([['1031', 5], ['1078', 1]]),
    )).toBe(true);
    expect(hasPackCountIncrease(
      new Map([['1031', 5]]),
      new Map([['1031', 5]]),
    )).toBe(false);
  });

  it('detects set or challenge progress after an SBC submit callback settles', () => {
    expect(hasSbcProgressAdvanced(
      { setComplete: false, setTimesCompleted: 2, challenges: [{ id: 10, completed: false, timesCompleted: 2 }] },
      { setComplete: false, setTimesCompleted: 3, challenges: [{ id: 10, completed: false, timesCompleted: 3 }] },
    )).toBe(true);
    expect(hasSbcProgressAdvanced(
      { setComplete: false, challenges: [{ id: 10, completed: false }] },
      { setComplete: true, challenges: [{ id: 10, completed: true }] },
    )).toBe(true);
    expect(hasSbcProgressAdvanced(
      { setComplete: false, setTimesCompleted: 3, challenges: [{ id: 10, completed: false, timesCompleted: 3 }] },
      { setComplete: false, setTimesCompleted: 3, challenges: [{ id: 10, completed: false, timesCompleted: 3 }] },
    )).toBe(false);
  });
});
