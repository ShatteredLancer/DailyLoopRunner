import { describe, expect, it, vi } from 'vitest';
import { runRepeatedSubmissionWorkflow } from '../../src/workflows/repeated-submission.js';

describe('runRepeatedSubmissionWorkflow', () => {
  it('runs until the completion limit', async () => {
    const executeAttempt = vi.fn(async () => ({ status: 'submitted', rewardPacksOpened: 1 }));
    const result = await runRepeatedSubmissionWorkflow({ maxCompletions: 3, executeAttempt });
    expect(result).toMatchObject({ status: 'completed', completions: 3, rewardPacksOpened: 3 });
    expect(executeAttempt).toHaveBeenCalledTimes(3);
  });

  it('retries the same completion without incrementing it', async () => {
    let attempts = 0;
    const result = await runRepeatedSubmissionWorkflow({
      maxCompletions: 1,
      executeAttempt: async () => ++attempts === 1 ? { status: 'retry' } : { status: 'submitted' },
    });
    expect(result).toMatchObject({ completions: 1, retries: 1, attempts: 2 });
  });

  it('returns a dry-run plan without a side-effect completion', async () => {
    const result = await runRepeatedSubmissionWorkflow({
      executeAttempt: async () => ({ status: 'planned', reason: 'dry run', details: { ok: true } }),
    });
    expect(result).toMatchObject({ status: 'planned', completions: 0, reason: 'dry run', details: { ok: true } });
  });

  it('stops when the target challenge is unavailable', async () => {
    const result = await runRepeatedSubmissionWorkflow({
      executeAttempt: async () => ({ status: 'unavailable', reason: 'complete' }),
    });
    expect(result).toMatchObject({ status: 'unavailable', completions: 0, reason: 'complete' });
  });

  it('records a submitted reward failure and stops before another completion', async () => {
    const executeAttempt = vi.fn(async () => ({
      status: 'submitted',
      rewardPacksPending: 1,
      stopAfterCompletion: true,
      reason: 'required reward pack unavailable',
    }));
    const result = await runRepeatedSubmissionWorkflow({ maxCompletions: 5, executeAttempt });
    expect(result).toMatchObject({ status: 'stopped', completions: 1, rewardPacksPending: 1 });
    expect(executeAttempt).toHaveBeenCalledOnce();
  });

  it('returns blocked attempts without incrementing completions', async () => {
    const result = await runRepeatedSubmissionWorkflow({
      executeAttempt: async () => ({ status: 'blocked', reason: 'unsafe squad' }),
    });
    expect(result).toMatchObject({ status: 'blocked', completions: 0, reason: 'unsafe squad' });
  });
});
