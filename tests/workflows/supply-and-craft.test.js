import { describe, expect, it, vi } from 'vitest';
import { runSupplyAndCraftWorkflow } from '../../src/workflows/supply-and-craft.js';

function selection(ok, count = ok ? 10 : 5) {
  return { ok, selected: Array.from({ length: count }, (_, index) => ({ id: index + 1 })), missing: ok ? null : { count: 10 - count } };
}

function baseOptions(overrides = {}) {
  return {
    maxCompletions: 1,
    challengeProvider: vi.fn(async () => ({ set: { id: 1 }, challenge: { id: 2 } })),
    selectPrimary: vi.fn(async () => selection(true)),
    submit: vi.fn(async () => ({ status: 'submitted', submitted: true })),
    ...overrides,
  };
}

describe('runSupplyAndCraftWorkflow', () => {
  it('submits immediately when primary inventory is sufficient', async () => {
    const supply = { id: 'bronze', provide: vi.fn() };
    const options = baseOptions({ supplies: [supply] });
    const result = await runSupplyAndCraftWorkflow(options);
    expect(result).toMatchObject({ status: 'completed', completions: 1 });
    expect(supply.provide).not.toHaveBeenCalled();
    expect(options.submit).toHaveBeenCalledOnce();
  });

  it('runs supplies in order and reloads the challenge after inventory changes', async () => {
    const primary = [selection(false, 0), selection(false, 5), selection(true)];
    const challengeProvider = vi.fn(async () => ({ set: { id: 1 }, challenge: { id: 2 } }));
    const result = await runSupplyAndCraftWorkflow(baseOptions({
      challengeProvider,
      selectPrimary: vi.fn(async () => primary.shift()),
      supplies: [
        { id: 'bronze', provide: async () => ({ status: 'provided', openedCount: 1 }) },
        { id: 'silver', provide: async () => ({ status: 'provided', openedCount: 1 }) },
      ],
    }));
    expect(result.completions).toBe(1);
    expect(result.supplyRuns.map((entry) => entry.id)).toEqual(['bronze', 'silver']);
    expect(challengeProvider).toHaveBeenCalledTimes(2);
    expect(challengeProvider.mock.calls[1][0].refresh).toBe(true);
  });

  it('stops opening later supplies when Unassigned must be preserved and uses fallback', async () => {
    const silver = { id: 'silver', provide: vi.fn() };
    const result = await runSupplyAndCraftWorkflow(baseOptions({
      selectPrimary: async () => selection(false, 5),
      supplies: [
        { id: 'bronze', provide: async () => ({ status: 'preserved', reason: 'storage full' }) },
        silver,
      ],
      selectFallback: async () => selection(true),
    }));
    expect(result.completions).toBe(1);
    expect(silver.provide).not.toHaveBeenCalled();
  });

  it('uses fallback after all supplies are unavailable', async () => {
    const fallback = vi.fn(async () => selection(true));
    const result = await runSupplyAndCraftWorkflow(baseOptions({
      selectPrimary: async () => selection(false, 2),
      supplies: [{ id: 'bronze', provide: async () => ({ status: 'unavailable' }) }],
      selectFallback: fallback,
    }));
    expect(result.completions).toBe(1);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('can repeat one supply until the primary selection is satisfied', async () => {
    const selections = [selection(false, 0), selection(false, 3), selection(true)];
    const provide = vi.fn(async () => ({ status: 'provided', openedCount: 1 }));
    const result = await runSupplyAndCraftWorkflow(baseOptions({
      selectPrimary: async () => selections.shift(),
      supplies: [{ id: 'gold-pack', repeatUntilSatisfied: true, maxRuns: 5, provide }],
    }));
    expect(result.completions).toBe(1);
    expect(provide).toHaveBeenCalledTimes(2);
    expect(result.supplyRuns.map((entry) => entry.run)).toEqual([1, 2]);
  });

  it('stops cleanly when no challenge remains', async () => {
    const submit = vi.fn();
    const result = await runSupplyAndCraftWorkflow(baseOptions({
      challengeProvider: async () => null,
      submit,
    }));
    expect(result).toMatchObject({ status: 'unavailable', completions: 0 });
    expect(submit).not.toHaveBeenCalled();
  });

  it('records a dry-run supply plan without opening or submitting', async () => {
    const submit = vi.fn();
    const secondSupply = { id: 'silver', provide: vi.fn() };
    const result = await runSupplyAndCraftWorkflow(baseOptions({
      selectPrimary: async () => selection(false, 0),
      supplies: [
        { id: 'bronze', provide: async () => ({ status: 'planned', reason: 'would open bronze pack' }) },
        secondSupply,
      ],
      submit,
    }));
    expect(result).toMatchObject({ status: 'planned', completions: 0, reason: 'would open bronze pack' });
    expect(secondSupply.provide).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
