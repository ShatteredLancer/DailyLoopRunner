import { describe, expect, it, vi } from 'vitest';
import { runInventoryExhaustionWorkflow } from '../../src/workflows/inventory-exhaustion.js';

const stages = [
  { id: 'bronze', name: 'Bronze Upgrade' },
  { id: 'silver', name: 'Silver Upgrade' },
  { id: 'gold', name: 'Gold Upgrade' },
];

describe('runInventoryExhaustionWorkflow', () => {
  it('continues after an exhausted or unavailable stage and totals submissions', async () => {
    const results = [
      { status: 'insufficient', completions: 3 },
      { status: 'unavailable', completions: 0 },
      { status: 'completed', completions: 2 },
    ];
    const runStage = vi.fn(async () => results.shift());
    const result = await runInventoryExhaustionWorkflow({ stages, runStage });
    expect(runStage.mock.calls.map(([call]) => call.stage.id)).toEqual(['bronze', 'silver', 'gold']);
    expect(result).toMatchObject({ status: 'completed', totalCompletions: 5 });
  });

  it('stops before later stages when a stage is blocked', async () => {
    const runStage = vi.fn(async ({ stage }) => stage.id === 'silver'
      ? { status: 'blocked', completions: 1, reason: 'unsafe selection' }
      : { status: 'completed', completions: 2 });
    const result = await runInventoryExhaustionWorkflow({ stages, runStage });
    expect(result).toMatchObject({ status: 'blocked', totalCompletions: 3, reason: 'unsafe selection' });
    expect(runStage).toHaveBeenCalledTimes(2);
  });

  it('inspects every stage during Dry Run and reports a planned result', async () => {
    const runStage = vi.fn(async () => ({ status: 'planned', completions: 0, reason: 'dry-run plan' }));
    const result = await runInventoryExhaustionWorkflow({ stages, runStage });
    expect(runStage).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: 'planned', totalCompletions: 0, reason: 'dry-run plan' });
  });

  it('invokes finalize after stages so callers can open deferred reward packs', async () => {
    const finalize = vi.fn(async (result) => {
      result.deferredRewardPacksOpened = 2;
    });
    const runStage = vi.fn(async () => ({ status: 'insufficient', completions: 4 }));
    const result = await runInventoryExhaustionWorkflow({
      stages: [{ id: 'fof', name: 'FOF Glory Hunters Crafting Upgrade' }],
      runStage,
      finalize,
    });
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'completed', totalCompletions: 4, deferredRewardPacksOpened: 2 });
  });

  it('does not finalize after a blocked stage', async () => {
    const finalize = vi.fn();
    const result = await runInventoryExhaustionWorkflow({
      stages: [{ id: 'fof', name: 'FOF Glory Hunters Crafting Upgrade' }],
      runStage: async () => ({ status: 'blocked', completions: 1, reason: 'unsafe selection' }),
      finalize,
    });
    expect(result).toMatchObject({ status: 'blocked', totalCompletions: 1, reason: 'unsafe selection' });
    expect(finalize).not.toHaveBeenCalled();
  });
});
