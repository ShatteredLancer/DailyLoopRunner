import { describe, expect, it, vi } from 'vitest';
import { runReservedDuplicateCraftingWorkflow } from '../../src/workflows/reserved-duplicate-crafting.js';

describe('runReservedDuplicateCraftingWorkflow', () => {
  it('submits until planning reports no reserved duplicates', async () => {
    let plans = 0;
    const executeAttempt = vi.fn(async () => ({ status: 'submitted' }));
    const result = await runReservedDuplicateCraftingWorkflow({
      planAttempt: async () => ++plans <= 2 ? { status: 'ready' } : { status: 'done' },
      executeAttempt,
    });
    expect(result).toMatchObject({ status: 'completed', completions: 2, attempts: 2 });
    expect(executeAttempt).toHaveBeenCalledTimes(2);
  });

  it('uses a forced attempt when response signals require one', async () => {
    const forceFlags = [];
    const result = await runReservedDuplicateCraftingWorkflow({
      forceAttempts: 1,
      transientSignals: [{ id: 10 }],
      planAttempt: async ({ forceAttempt }) => {
        forceFlags.push(forceAttempt);
        return forceFlags.length === 1 ? { status: 'ready' } : { status: 'done' };
      },
      executeAttempt: async () => ({ status: 'submitted', transientSignals: [] }),
    });
    expect(forceFlags).toEqual([true, false]);
    expect(result).toMatchObject({ completions: 1, forcedAttemptsRemaining: 0, transientSignals: [] });
  });

  it('returns the same planned result for dry-run execution', async () => {
    const result = await runReservedDuplicateCraftingWorkflow({
      planAttempt: async () => ({ status: 'ready', selection: [1, 2, 3] }),
      executeAttempt: async () => ({ status: 'planned', reason: 'would submit upgrade' }),
    });
    expect(result).toMatchObject({ status: 'planned', completions: 0, attempts: 1, reason: 'would submit upgrade' });
  });

  it('stops without executing when the challenge is unavailable', async () => {
    const executeAttempt = vi.fn();
    const result = await runReservedDuplicateCraftingWorkflow({
      planAttempt: async () => ({ status: 'unavailable', reason: 'complete' }),
      executeAttempt,
    });
    expect(result).toMatchObject({ status: 'unavailable', completions: 0, reason: 'complete' });
    expect(executeAttempt).not.toHaveBeenCalled();
  });

  it('keeps transient signals when an attempt is blocked', async () => {
    const result = await runReservedDuplicateCraftingWorkflow({
      transientSignals: [{ id: 20 }],
      planAttempt: async () => ({ status: 'ready' }),
      executeAttempt: async () => ({ status: 'blocked', reason: 'cannot resolve signal' }),
    });
    expect(result).toMatchObject({ status: 'blocked', completions: 0, transientSignals: [{ id: 20 }] });
  });
});
