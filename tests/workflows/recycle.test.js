import { describe, expect, it, vi } from 'vitest';
import { runRecycleWorkflow } from '../../src/workflows/recycle.js';

function baseOptions(overrides = {}) {
  return {
    maxCompletions: 1,
    inspectTargets: vi.fn(async () => []),
    findPack: vi.fn(async () => null),
    consumeTarget: vi.fn(async () => ({ status: 'submitted', submitted: true, rewardPackId: 105 })),
    openPack: vi.fn(async () => ({ status: 'opened' })),
    submitSeed: vi.fn(async () => ({ status: 'submitted', submitted: true, rewardPackId: 105 })),
    ...overrides,
  };
}

describe('runRecycleWorkflow', () => {
  it('consumes existing targets before looking for a pack', async () => {
    const options = baseOptions({ inspectTargets: async () => [{ id: 1 }] });
    const result = await runRecycleWorkflow(options);
    expect(result).toMatchObject({ status: 'completed', completions: 1, lastRewardPackId: 105 });
    expect(options.consumeTarget).toHaveBeenCalledOnce();
    expect(options.findPack).not.toHaveBeenCalled();
  });

  it('opens an existing pack before submitting a seed SBC', async () => {
    let inspected = 0;
    const options = baseOptions({
      inspectTargets: async () => ++inspected === 1 ? [] : [{ id: 2 }],
      findPack: async () => ({ id: 105 }),
    });
    const result = await runRecycleWorkflow(options);
    expect(result).toMatchObject({ completions: 1, packsOpened: 1 });
    expect(options.openPack).toHaveBeenCalledOnce();
    expect(options.submitSeed).not.toHaveBeenCalled();
  });

  it('submits a seed when there is no target or pack', async () => {
    const options = baseOptions();
    const result = await runRecycleWorkflow(options);
    expect(result.completions).toBe(1);
    expect(options.submitSeed).toHaveBeenCalledOnce();
  });

  it('skips existing and final packs when pack opening is disabled', async () => {
    const openFinalReward = vi.fn(async () => ({ status: 'opened' }));
    const options = baseOptions({
      packOpeningEnabled: false,
      findPack: vi.fn(async () => ({ id: 105 })),
      openFinalReward,
    });
    const result = await runRecycleWorkflow(options);
    expect(result).toMatchObject({ completions: 1, packsOpened: 0, lastRewardPackId: 105 });
    expect(options.findPack).not.toHaveBeenCalled();
    expect(options.openPack).not.toHaveBeenCalled();
    expect(options.submitSeed).toHaveBeenCalledOnce();
    expect(openFinalReward).not.toHaveBeenCalled();
  });

  it('retries the state after a stale pack without counting it', async () => {
    let findCalls = 0;
    const options = baseOptions({
      findPack: async () => ++findCalls === 1 ? { id: 105 } : null,
      openPack: async () => ({ status: 'stale' }),
    });
    const result = await runRecycleWorkflow(options);
    expect(result).toMatchObject({ completions: 1, packsOpened: 0 });
    expect(options.submitSeed).toHaveBeenCalledOnce();
  });

  it('opens the final reward only when configured', async () => {
    const openFinalReward = vi.fn(async () => ({ status: 'opened' }));
    const result = await runRecycleWorkflow(baseOptions({ openFinalReward }));
    expect(openFinalReward).toHaveBeenCalledWith(expect.objectContaining({ rewardPackId: 105 }));
    expect(result).toMatchObject({ packsOpened: 1, lastRewardPackId: null });
  });

  it('uses the same branch for dry run and stops on a planned action', async () => {
    const consumeTarget = vi.fn(async () => ({ status: 'planned', reason: 'would submit target' }));
    const options = baseOptions({ inspectTargets: async () => [{ id: 1 }], consumeTarget });
    const result = await runRecycleWorkflow(options);
    expect(result).toMatchObject({ status: 'planned', completions: 0, reason: 'would submit target' });
    expect(options.openPack).not.toHaveBeenCalled();
    expect(options.submitSeed).not.toHaveBeenCalled();
  });
});
