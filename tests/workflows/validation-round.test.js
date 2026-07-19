import { describe, expect, it, vi } from 'vitest';
import { runValidationRoundWorkflow } from '../../src/workflows/validation-round.js';

function baseOptions(overrides = {}) {
  return {
    inspectSourcePack: vi.fn(async () => ({ id: 105 })),
    inspectSbc: vi.fn(async () => ({ set: { id: 1000 }, challenge: { id: 2000 } })),
    openSourcePack: vi.fn(async () => ({ status: 'opened' })),
    submitSbc: vi.fn(async () => ({ status: 'submitted', submitted: true, rewardPackId: 205 })),
    openReward: vi.fn(async () => ({ status: 'opened' })),
    ...overrides,
  };
}

describe('runValidationRoundWorkflow', () => {
  it('inspects the same source and SBC in dry run without side effects', async () => {
    const options = baseOptions({ dryRun: true });
    const result = await runValidationRoundWorkflow(options);
    expect(result).toMatchObject({
      status: 'planned',
      sourcePack: { id: 105 },
      sbc: { set: { id: 1000 }, challenge: { id: 2000 } },
    });
    expect(options.openSourcePack).not.toHaveBeenCalled();
    expect(options.submitSbc).not.toHaveBeenCalled();
    expect(options.openReward).not.toHaveBeenCalled();
  });

  it('runs the complete live validation sequence', async () => {
    const calls = [];
    const result = await runValidationRoundWorkflow(baseOptions({
      inspectSourcePack: async () => { calls.push('inspect-pack'); return { id: 105 }; },
      inspectSbc: async () => { calls.push('inspect-sbc'); return { set: { id: 1000 }, challenge: { id: 2000 } }; },
      openSourcePack: async () => { calls.push('open-pack'); return { status: 'opened' }; },
      submitSbc: async () => { calls.push('submit'); return { submitted: true, rewardPackId: 205 }; },
      openReward: async () => { calls.push('open-reward'); return { status: 'opened' }; },
    }));
    expect(calls).toEqual(['inspect-pack', 'inspect-sbc', 'open-pack', 'submit', 'open-reward']);
    expect(result).toMatchObject({ status: 'completed', rewardPackId: 205 });
  });

  it('does not open a pack when the SBC is unavailable', async () => {
    const options = baseOptions({ inspectSbc: async () => null });
    const result = await runValidationRoundWorkflow(options);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'SBC unavailable' });
    expect(options.openSourcePack).not.toHaveBeenCalled();
  });

  it('stops before reward handling when submit is blocked', async () => {
    const options = baseOptions({ submitSbc: async () => ({ status: 'blocked', reason: 'unsafe squad' }) });
    const result = await runValidationRoundWorkflow(options);
    expect(result).toMatchObject({ status: 'blocked', reason: 'unsafe squad' });
    expect(options.openReward).not.toHaveBeenCalled();
  });
});
