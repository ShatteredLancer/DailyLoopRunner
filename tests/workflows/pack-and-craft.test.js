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
});
