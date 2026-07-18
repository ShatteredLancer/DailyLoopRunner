import { describe, expect, it, vi } from 'vitest';
import { runPlayerPickWorkflow } from '../../src/workflows/player-pick.js';

function baseOptions(overrides = {}) {
  return {
    maxPicks: 1,
    findPendingPick: vi.fn(async () => null),
    redeemPick: vi.fn(async () => ({ status: 'selected', pickedCards: [{ id: 99 }] })),
    loadChallenges: vi.fn(async () => ({ incomplete: [{ challengeNo: 1 }] })),
    submitChallenge: vi.fn(async () => ({ status: 'submitted', submitted: true })),
    findRewardPick: vi.fn(async () => ({ id: 50 })),
    ...overrides,
  };
}

describe('runPlayerPickWorkflow', () => {
  it('resumes an existing Pick before submitting another challenge', async () => {
    let calls = 0;
    const options = baseOptions({ findPendingPick: async () => ++calls === 1 ? { id: 40 } : null });
    const result = await runPlayerPickWorkflow(options);
    expect(result).toMatchObject({ picksCompleted: 1, pickResults: [{ resumed: true }] });
    expect(options.loadChallenges).not.toHaveBeenCalled();
  });

  it('submits all incomplete challenges and selects the reward', async () => {
    const options = baseOptions({
      loadChallenges: async () => ({ incomplete: [{ challengeNo: 1 }, { challengeNo: 2 }] }),
    });
    const result = await runPlayerPickWorkflow(options);
    expect(result).toMatchObject({ status: 'completed', picksCompleted: 1, challengesSubmitted: 2 });
    expect(options.submitChallenge).toHaveBeenCalledTimes(2);
  });

  it('stops when one challenge cannot be submitted', async () => {
    const options = baseOptions({ submitChallenge: async () => ({ status: 'blocked', reason: 'missing common gold' }) });
    const result = await runPlayerPickWorkflow(options);
    expect(result).toMatchObject({ status: 'blocked', picksCompleted: 0, reason: 'missing common gold' });
    expect(options.findRewardPick).not.toHaveBeenCalled();
  });

  it('reports an unavailable reward without redeeming another item', async () => {
    const options = baseOptions({ findRewardPick: async () => null });
    const result = await runPlayerPickWorkflow(options);
    expect(result).toMatchObject({ status: 'unavailable', picksCompleted: 0 });
    expect(options.redeemPick).not.toHaveBeenCalled();
  });

  it('plans every incomplete challenge in dry run and does not find a reward', async () => {
    const options = baseOptions({
      loadChallenges: async () => ({ incomplete: [{ challengeNo: 1 }, { challengeNo: 2 }] }),
      submitChallenge: async () => ({ status: 'planned' }),
    });
    const result = await runPlayerPickWorkflow(options);
    expect(result).toMatchObject({ status: 'planned', challengesPlanned: 2, picksCompleted: 0 });
    expect(options.findRewardPick).not.toHaveBeenCalled();
  });

  it('respects the requested Pick count', async () => {
    const options = baseOptions({ maxPicks: 3 });
    const result = await runPlayerPickWorkflow(options);
    expect(result.picksCompleted).toBe(3);
    expect(options.findRewardPick).toHaveBeenCalledTimes(3);
  });
});
