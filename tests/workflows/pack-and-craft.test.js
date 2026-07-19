import { describe, expect, it, vi } from 'vitest';
import { runPackAndCraftWorkflow } from '../../src/workflows/pack-and-craft.js';

function baseOptions(overrides = {}) {
  return {
    maxPacks: 1,
    findPack: vi.fn(async () => ({ id: 1 })),
    openPack: vi.fn(async () => ({ status: 'opened', details: { lowRare: 2 } })),
    runStages: vi.fn(async () => ({ status: 'completed', completions: { rare: 1 } })),
    ...overrides,
  };
}

describe('runPackAndCraftWorkflow', () => {
  it('opens a pack and records crafting stage completions', async () => {
    const result = await runPackAndCraftWorkflow(baseOptions());
    expect(result).toMatchObject({ status: 'completed', packsOpened: 1, stageCompletions: { rare: 1 } });
  });

  it('runs resume stages before opening the next pack', async () => {
    const calls = [];
    const result = await runPackAndCraftWorkflow(baseOptions({
      resume: async () => { calls.push('resume'); return { hasItems: true }; },
      runStages: async ({ phase }) => { calls.push(phase); return { completions: { rare: 1 } }; },
      findPack: async () => { calls.push('find'); return null; },
    }));
    expect(calls).toEqual(['resume', 'resume', 'find']);
    expect(result.stageCompletions).toEqual({ rare: 1 });
  });

  it('continues after a stale pack without counting it', async () => {
    let opens = 0;
    const result = await runPackAndCraftWorkflow(baseOptions({
      openPack: async () => ++opens === 1 ? { status: 'stale' } : { status: 'opened' },
    }));
    expect(result.packsOpened).toBe(1);
    expect(opens).toBe(2);
  });

  it('stops before opening when pre-pack cleanup is blocked', async () => {
    const options = baseOptions({ beforePack: async () => ({ status: 'blocked', reason: 'storage full' }) });
    const result = await runPackAndCraftWorkflow(options);
    expect(result).toMatchObject({ status: 'blocked', packsOpened: 0, reason: 'storage full' });
    expect(options.findPack).not.toHaveBeenCalled();
  });

  it('stops on a dry-run planned pack without running stages', async () => {
    const options = baseOptions({ openPack: async () => ({ status: 'planned', reason: 'would open pack' }) });
    const result = await runPackAndCraftWorkflow(options);
    expect(result).toMatchObject({ status: 'planned', packsOpened: 0 });
    expect(options.runStages).not.toHaveBeenCalled();
  });

  it('respects the configured maximum pack count', async () => {
    const options = baseOptions({ maxPacks: 3 });
    const result = await runPackAndCraftWorkflow(options);
    expect(result.packsOpened).toBe(3);
    expect(options.openPack).toHaveBeenCalledTimes(3);
  });

  it('stops opening source packs when the configured stage completion target is reached', async () => {
    const options = baseOptions({
      maxPacks: 10,
      completionTarget: { id: 'rare', max: 2 },
    });
    const result = await runPackAndCraftWorkflow(options);
    expect(result).toMatchObject({ status: 'completed', packsOpened: 2, stageCompletions: { rare: 2 } });
    expect(options.openPack).toHaveBeenCalledTimes(2);
  });

  it('keeps opening source packs after reaching a completion target when source exhaustion is required', async () => {
    let packsRemaining = 3;
    const options = baseOptions({
      maxPacks: 10,
      completionTarget: { id: 'rare', max: 1 },
      requireSourceExhaustion: true,
      findPack: vi.fn(async () => packsRemaining-- > 0 ? { id: packsRemaining + 1 } : null),
    });
    const result = await runPackAndCraftWorkflow(options);
    expect(result).toMatchObject({ status: 'completed', packsOpened: 3, stageCompletions: { rare: 3 } });
    expect(options.openPack).toHaveBeenCalledTimes(3);
  });

  it('runs a generic fallback after the source packs are exhausted', async () => {
    const onSourceExhausted = vi.fn(async ({ remainingCompletions }) => ({
      status: 'completed',
      completions: { rare: remainingCompletions },
    }));
    const result = await runPackAndCraftWorkflow(baseOptions({
      maxPacks: 10,
      completionTarget: { id: 'rare', max: 3 },
      findPack: async () => null,
      onSourceExhausted,
    }));
    expect(onSourceExhausted).toHaveBeenCalledWith(expect.objectContaining({ remainingCompletions: 3 }));
    expect(result).toMatchObject({ status: 'completed', packsOpened: 0, stageCompletions: { rare: 3 } });
  });

  it('subtracts source-pack completions before asking fallback to fill the remaining target', async () => {
    let packsRemaining = 3;
    const onSourceExhausted = vi.fn(async ({ remainingCompletions }) => ({
      status: 'completed',
      completions: { rare: remainingCompletions },
    }));
    const result = await runPackAndCraftWorkflow(baseOptions({
      maxPacks: 10,
      completionTarget: { id: 'rare', max: 5 },
      requireSourceExhaustion: true,
      findPack: async () => packsRemaining-- > 0 ? { id: packsRemaining + 1 } : null,
      onSourceExhausted,
    }));
    expect(onSourceExhausted).toHaveBeenCalledWith(expect.objectContaining({ remainingCompletions: 2 }));
    expect(result).toMatchObject({ status: 'completed', packsOpened: 3, stageCompletions: { rare: 5 } });
  });

  it('keeps source exhaustion unavailable when the fallback cannot finish the target', async () => {
    const result = await runPackAndCraftWorkflow(baseOptions({
      completionTarget: { id: 'rare', max: 2 },
      findPack: async () => null,
      onSourceExhausted: async () => ({
        status: 'unavailable',
        reason: 'safe inventory is insufficient',
        completions: { rare: 1 },
      }),
    }));
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'safe inventory is insufficient',
      stageCompletions: { rare: 1 },
    });
  });

  it('treats an exhausted fallback as success when its final completion reaches the target', async () => {
    const result = await runPackAndCraftWorkflow(baseOptions({
      completionTarget: { id: 'rare', max: 2 },
      findPack: async () => null,
      onSourceExhausted: async () => ({
        status: 'unavailable',
        reason: 'no challenge remains',
        completions: { rare: 2 },
      }),
    }));
    expect(result).toMatchObject({
      status: 'completed',
      reason: null,
      stageCompletions: { rare: 2 },
    });
  });

  it('does not report success when a fallback completes without reaching the target', async () => {
    const result = await runPackAndCraftWorkflow(baseOptions({
      completionTarget: { id: 'rare', max: 2 },
      findPack: async () => null,
      onSourceExhausted: async () => ({ status: 'completed', completions: { rare: 1 } }),
    }));
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'source-exhausted fallback did not reach the completion target',
      stageCompletions: { rare: 1 },
    });
  });

  it('runs without an artificial completion target for a source-driven caller', async () => {
    const result = await runPackAndCraftWorkflow(baseOptions({
      findPack: async () => null,
      onSourceExhausted: async () => ({ status: 'completed', completions: { rare: 1 } }),
    }));
    expect(result).toMatchObject({ status: 'completed', stageCompletions: { rare: 1 } });
  });

  it('reports an unmet completion target when the source pack safety limit is reached', async () => {
    const result = await runPackAndCraftWorkflow(baseOptions({
      maxPacks: 2,
      completionTarget: { id: 'rare', max: 3 },
    }));
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'source pack limit 2 reached before the completion target',
      packsOpened: 2,
      stageCompletions: { rare: 2 },
    });
  });

  it('does not report source-driven success when only the pack safety limit stopped the workflow', async () => {
    const result = await runPackAndCraftWorkflow(baseOptions({
      maxPacks: 2,
      requireSourceExhaustion: true,
    }));
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'source pack safety limit 2 reached before source exhaustion',
      packsOpened: 2,
    });
  });
});
