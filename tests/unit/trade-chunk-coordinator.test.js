import { describe, expect, it, vi } from 'vitest';
import { createTradeChunkCoordinator } from '../../src/trade/chunk-coordinator.js';

function completedChunk(input = {}) {
  return {
    runId: 'run', jobId: 'job', jobType: 'listing',
    startedAt: input.startedAt || 1, finishedAt: input.finishedAt || 2,
    status: 'completed', requested: input.quantity, succeeded: input.quantity,
    receipts: Array.from({ length: input.quantity }, (_, index) => ({
      index: input.offset + index + 1, status: 'listed',
    })),
  };
}

describe('Trade chunk coordinator', () => {
  it('executes a four-item Run as two independently reserved chunks', async () => {
    const releases = [];
    const requestBudget = {
      reserve: vi.fn(async () => {
        const release = vi.fn(async () => {});
        releases.push(release);
        return { ready: true, release };
      }),
    };
    const executeChunk = vi.fn(async (input) => completedChunk(input));
    const coordinator = createTradeChunkCoordinator({ requestBudget, now: () => 1000, sleep: async () => {} });

    const receipt = await coordinator.run({
      runId: 'run', jobId: 'job', jobType: 'listing', requested: 4,
      requestReserve: (quantity) => quantity * 6,
      executeChunk,
    });

    expect(receipt).toMatchObject({ status: 'completed', requested: 4, succeeded: 4, failed: 0, skipped: 0 });
    expect(requestBudget.reserve.mock.calls).toEqual([[12], [12]]);
    expect(executeChunk.mock.calls.map(([input]) => ({ offset: input.offset, quantity: input.quantity })))
      .toEqual([{ offset: 0, quantity: 2 }, { offset: 2, quantity: 2 }]);
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true);
  });

  it('waits locally for request capacity without executing an EA chunk early', async () => {
    let currentTime = 1000;
    const requestBudget = {
      reserve: vi.fn()
        .mockResolvedValueOnce({ ready: false, remaining: 3, retryAt: 3000 })
        .mockResolvedValueOnce({ ready: true, release: vi.fn(async () => {}) }),
    };
    const executeChunk = vi.fn(async (input) => completedChunk(input));
    const checkpoints = [];
    const coordinator = createTradeChunkCoordinator({
      requestBudget,
      now: () => currentTime,
      sleep: async (ms) => { currentTime += ms; },
      onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
    });

    const receipt = await coordinator.run({
      runId: 'run', jobId: 'job', jobType: 'listing', requested: 1,
      requestReserve: () => 12,
      executeChunk,
    });

    expect(receipt.status).toBe('completed');
    expect(executeChunk).toHaveBeenCalledOnce();
    expect(checkpoints).toContainEqual(expect.objectContaining({ phase: 'chunk-budget-waiting', retryAt: 3000 }));
    expect(currentTime).toBe(3000);
  });

  it('stops the whole Run after an ambiguous chunk and preserves completed items', async () => {
    const requestBudget = { reserve: vi.fn(async () => ({ ready: true, release: vi.fn(async () => {}) })) };
    const executeChunk = vi.fn()
      .mockResolvedValueOnce(completedChunk({ offset: 0, quantity: 2 }))
      .mockResolvedValueOnce({
        runId: 'run', jobId: 'job', jobType: 'listing', status: 'ambiguous', reason: 'listing-not-reconciled',
        requested: 2, succeeded: 0, failed: 1, skipped: 1,
        receipts: [{ index: 3, status: 'ambiguous' }],
      });
    const coordinator = createTradeChunkCoordinator({ requestBudget, now: () => 1000, sleep: async () => {} });

    const receipt = await coordinator.run({
      runId: 'run', jobId: 'job', jobType: 'listing', requested: 4,
      requestReserve: () => 12,
      executeChunk,
    });

    expect(receipt).toMatchObject({
      status: 'ambiguous', reason: 'listing-not-reconciled', requested: 4, succeeded: 2, failed: 1, skipped: 1,
    });
    expect(executeChunk).toHaveBeenCalledTimes(2);
  });

  it('honors Stop between chunks without reserving or executing the next chunk', async () => {
    let stopped = false;
    const requestBudget = { reserve: vi.fn(async () => ({ ready: true, release: vi.fn(async () => {}) })) };
    const executeChunk = vi.fn(async (input) => {
      stopped = true;
      return completedChunk(input);
    });
    const coordinator = createTradeChunkCoordinator({ requestBudget, now: () => 1000, sleep: async () => {} });

    const receipt = await coordinator.run({
      runId: 'run', jobId: 'job', jobType: 'listing', requested: 4,
      requestReserve: () => 12,
      shouldStop: () => stopped,
      executeChunk,
    });

    expect(receipt).toMatchObject({
      status: 'stopped', reason: 'stopped-by-user', requested: 4, succeeded: 2, skipped: 2,
    });
    expect(requestBudget.reserve).toHaveBeenCalledOnce();
    expect(executeChunk).toHaveBeenCalledOnce();
  });

  it('times out a local budget wait without any EA chunk execution', async () => {
    let currentTime = 1000;
    const requestBudget = {
      reserve: vi.fn(async () => ({ ready: false, remaining: 3, retryAt: currentTime + 60_000 })),
    };
    const executeChunk = vi.fn();
    const coordinator = createTradeChunkCoordinator({
      requestBudget,
      now: () => currentTime,
      sleep: async () => { currentTime = 901_000; },
    });

    const receipt = await coordinator.run({
      runId: 'run', jobId: 'job', jobType: 'buy', requested: 2,
      requestReserve: () => 28,
      executeChunk,
    });

    expect(receipt).toMatchObject({
      status: 'blocked', reason: 'trade-request-budget-wait-timeout', requested: 2, succeeded: 0, skipped: 2,
    });
    expect(requestBudget.reserve).toHaveBeenCalledOnce();
    expect(executeChunk).not.toHaveBeenCalled();
  });

  it('does not reserve a second chunk after the shared Run deadline', async () => {
    let currentTime = 1000;
    const requestBudget = { reserve: vi.fn(async () => ({ ready: true, release: vi.fn(async () => {}) })) };
    const executeChunk = vi.fn(async (input) => {
      currentTime = 61_000;
      return completedChunk(input);
    });
    const coordinator = createTradeChunkCoordinator({ requestBudget, now: () => currentTime, sleep: async () => {} });

    const receipt = await coordinator.run({
      runId: 'run', jobId: 'job', jobType: 'buy', requested: 4, deadlineAt: 61_000,
      deadlineReason: 'runtime-limit',
      requestReserve: () => 28,
      executeChunk,
    });

    expect(receipt).toMatchObject({
      status: 'stopped', reason: 'runtime-limit', requested: 4, succeeded: 2, skipped: 2,
    });
    expect(requestBudget.reserve).toHaveBeenCalledOnce();
    expect(executeChunk).toHaveBeenCalledOnce();
  });
});
