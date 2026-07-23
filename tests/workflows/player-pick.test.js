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

  it('queues matching Pick rewards to the limit before redeeming them together', async () => {
    const pending = [{ id: 40 }];
    let nextId = 50;
    const events = [];
    const options = baseOptions({
      maxPicks: 3,
      openPicksAtEnd: true,
      listPendingPicks: vi.fn(async () => [...pending]),
      submitChallenge: vi.fn(async () => {
        pending.push({ id: nextId++ });
        return { status: 'submitted', submitted: true };
      }),
      redeemPick: vi.fn(async ({ pickItem }) => {
        pending.splice(pending.findIndex((item) => item.id === pickItem.id), 1);
        return { status: 'selected', pickedCards: [{ id: pickItem.id + 100 }] };
      }),
      onEvent: vi.fn(async (event) => { events.push(event); }),
    });

    const result = await runPlayerPickWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      picksQueued: 3,
      picksCompleted: 3,
      challengesSubmitted: 2,
    });
    expect(options.submitChallenge).toHaveBeenCalledTimes(2);
    expect(options.redeemPick).toHaveBeenCalledTimes(3);
    expect(events.indexOf('batch-open')).toBeGreaterThan(events.lastIndexOf('challenge'));
    expect(pending).toEqual([]);
  });

  it('opens already queued Picks after a later submission is blocked', async () => {
    const pending = [{ id: 40 }, { id: 41 }];
    const options = baseOptions({
      maxPicks: 3,
      openPicksAtEnd: true,
      listPendingPicks: vi.fn(async () => [...pending]),
      submitChallenge: vi.fn(async () => ({ status: 'blocked', reason: 'missing rare gold' })),
      redeemPick: vi.fn(async ({ pickItem }) => {
        pending.splice(pending.findIndex((item) => item.id === pickItem.id), 1);
        return { status: 'selected', pickedCards: [{ id: pickItem.id + 100 }] };
      }),
    });

    const result = await runPlayerPickWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'missing rare gold',
      picksQueued: 2,
      picksCompleted: 2,
    });
    expect(options.redeemPick).toHaveBeenCalledTimes(2);
    expect(pending).toEqual([]);
  });

  it('stops batch submission when the Pick SBC has no incomplete challenge', async () => {
    const options = baseOptions({
      maxPicks: 3,
      openPicksAtEnd: true,
      listPendingPicks: vi.fn(async () => []),
      loadChallenges: vi.fn(async () => ({ incomplete: [] })),
    });

    const result = await runPlayerPickWorkflow(options);

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'No incomplete Player Pick challenge remains',
      picksCompleted: 0,
    });
    expect(options.redeemPick).not.toHaveBeenCalled();
  });

  it('finishes normally when a limited Pick Set has no incomplete challenge left', async () => {
    const immediate = baseOptions({
      maxPicks: 5,
      completeWhenNoChallengeRemains: true,
      loadChallenges: vi.fn(async () => ({ incomplete: [] })),
    });
    const immediateResult = await runPlayerPickWorkflow(immediate);
    expect(immediateResult).toMatchObject({ status: 'completed', picksCompleted: 0, reason: null });
    expect(immediate.findRewardPick).not.toHaveBeenCalled();

    const deferred = baseOptions({
      maxPicks: 5,
      openPicksAtEnd: true,
      completeWhenNoChallengeRemains: true,
      listPendingPicks: vi.fn(async () => []),
      loadChallenges: vi.fn(async () => ({ incomplete: [] })),
    });
    const deferredResult = await runPlayerPickWorkflow(deferred);
    expect(deferredResult).toMatchObject({ status: 'completed', picksCompleted: 0, reason: null });
  });

  it('returns a structured stopped result while preserving already selected Picks', async () => {
    let checks = 0;
    const finalize = vi.fn(async () => {});
    const options = baseOptions({
      maxPicks: 2,
      stopPoint: vi.fn(async () => {
        checks++;
        if (checks > 1) throw new Error('Stopped by user');
      }),
      finalize,
    });
    const result = await runPlayerPickWorkflow(options);
    expect(result).toMatchObject({ status: 'stopped', reason: 'stopped by user', picksCompleted: 1 });
    expect(result.pickResults).toHaveLength(1);
    expect(finalize).toHaveBeenCalledWith(result);
  });
});
