import { describe, expect, it, vi } from 'vitest';
import { runSequenceWorkflow } from '../../src/workflows/sequence.js';

const steps = [{ id: 'bronze' }, { id: 'silver' }, { id: 'common' }, { id: 'rare' }];

describe('runSequenceWorkflow', () => {
  it('runs steps in configured order', async () => {
    const order = [];
    const result = await runSequenceWorkflow({
      steps,
      runStep: async ({ step }) => { order.push(step.id); return { status: 'completed' }; },
    });
    expect(order).toEqual(['bronze', 'silver', 'common', 'rare']);
    expect(result.completedSteps.map((entry) => entry.id)).toEqual(order);
  });

  it('skips completed and unavailable daily steps', async () => {
    const runStep = vi.fn(async () => ({ status: 'completed' }));
    const result = await runSequenceWorkflow({
      steps,
      getAvailability: async ({ step }) => ({ available: step.id === 'common', reason: 'complete' }),
      runStep,
    });
    expect(runStep).toHaveBeenCalledOnce();
    expect(result.skippedSteps.map((entry) => entry.id)).toEqual(['bronze', 'silver', 'rare']);
  });

  it('configures a step with the actual remaining completion count', async () => {
    let configured;
    await runSequenceWorkflow({
      steps: [{ id: 'common', maxCompletions: 7 }],
      getAvailability: async () => ({ available: true, completed: 3, dailyLimit: 7, remaining: 4 }),
      configureStep: async ({ step, availability }) => ({ ...step, maxCompletions: Math.min(step.maxCompletions, availability.remaining) }),
      runStep: async ({ step }) => { configured = step; return { status: 'completed' }; },
    });
    expect(configured.maxCompletions).toBe(4);
  });

  it('runs a step with its configured limit when progress count is unknown', async () => {
    let configured;
    await runSequenceWorkflow({
      steps: [{ id: 'common', maxCompletions: 7 }],
      getAvailability: async () => ({ available: true, remaining: null }),
      configureStep: async ({ step }) => ({ ...step }),
      runStep: async ({ step }) => { configured = step; return { status: 'completed' }; },
    });
    expect(configured.maxCompletions).toBe(7);
  });

  it('runs preflight before availability so overflow recovery can make progress', async () => {
    const calls = [];
    await runSequenceWorkflow({
      steps: [{ id: 'bronze' }],
      beforeStep: async () => { calls.push('overflow'); return { status: 'ready' }; },
      getAvailability: async () => { calls.push('availability'); return { available: false }; },
      runStep: async () => { calls.push('run'); },
    });
    expect(calls).toEqual(['overflow', 'availability']);
  });

  it('stops the sequence when a step is blocked', async () => {
    const result = await runSequenceWorkflow({
      steps,
      runStep: async ({ step }) => step.id === 'silver'
        ? { status: 'blocked', reason: 'storage full' }
        : { status: 'completed' },
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'storage full' });
    expect(result.completedSteps.map((entry) => entry.id)).toEqual(['bronze']);
  });
});
