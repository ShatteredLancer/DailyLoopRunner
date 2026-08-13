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
  it('executes a four-item Run as two chunks without request reservations', async () => {
    const executeChunk = vi.fn(async (input) => completedChunk(input));
    const checkpoints = [];
    const coordinator = createTradeChunkCoordinator({
      now: () => 1000,
      onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
    });

    const receipt = await coordinator.run({
      runId: 'run', jobId: 'job', jobType: 'listing', requested: 4,
      executeChunk,
    });

    expect(receipt).toMatchObject({ status: 'completed', requested: 4, succeeded: 4, failed: 0, skipped: 0 });
    expect(executeChunk.mock.calls.map(([input]) => ({
      offset: input.offset, quantity: input.quantity, reservation: input.reservation,
    }))).toEqual([
      { offset: 0, quantity: 2, reservation: undefined },
      { offset: 2, quantity: 2, reservation: undefined },
    ]);
    expect(checkpoints.filter((entry) => entry.phase === 'chunk-started')).toHaveLength(2);
  });

  it('stops the whole Run after an ambiguous chunk and preserves completed items', async () => {
    const executeChunk = vi.fn()
      .mockResolvedValueOnce(completedChunk({ offset: 0, quantity: 2 }))
      .mockResolvedValueOnce({
        runId: 'run', jobId: 'job', jobType: 'listing', status: 'ambiguous', reason: 'listing-not-reconciled',
        requested: 2, succeeded: 0, failed: 1, skipped: 1,
        receipts: [{ index: 3, status: 'ambiguous' }],
      });
    const receipt = await createTradeChunkCoordinator({ now: () => 1000 }).run({
      runId: 'run', jobId: 'job', jobType: 'listing', requested: 4, executeChunk,
    });

    expect(receipt).toMatchObject({
      status: 'ambiguous', reason: 'listing-not-reconciled', requested: 4, succeeded: 2, failed: 1, skipped: 1,
    });
    expect(executeChunk).toHaveBeenCalledTimes(2);
  });

  it('honors Stop between chunks', async () => {
    let stopped = false;
    const executeChunk = vi.fn(async (input) => {
      stopped = true;
      return completedChunk(input);
    });
    const receipt = await createTradeChunkCoordinator({ now: () => 1000 }).run({
      runId: 'run', jobId: 'job', jobType: 'listing', requested: 4,
      shouldStop: () => stopped,
      executeChunk,
    });
    expect(receipt).toMatchObject({
      status: 'stopped', reason: 'stopped-by-user', requested: 4, succeeded: 2, skipped: 2,
    });
    expect(executeChunk).toHaveBeenCalledOnce();
  });

  it('stops before a chunk when the shared Run deadline is reached', async () => {
    let currentTime = 1000;
    const executeChunk = vi.fn(async (input) => {
      currentTime = 61_000;
      return completedChunk(input);
    });
    const receipt = await createTradeChunkCoordinator({ now: () => currentTime }).run({
      runId: 'run', jobId: 'job', jobType: 'buy', requested: 4,
      deadlineAt: 61_000, deadlineReason: 'runtime-limit', executeChunk,
    });
    expect(receipt).toMatchObject({
      status: 'stopped', reason: 'runtime-limit', requested: 4, succeeded: 2, skipped: 2,
    });
    expect(executeChunk).toHaveBeenCalledOnce();
  });

  it('blocks before a chunk when Lease heartbeat fails', async () => {
    const executeChunk = vi.fn();
    const receipt = await createTradeChunkCoordinator({ now: () => 1000 }).run({
      runId: 'run', jobId: 'job', jobType: 'listing', requested: 2,
      heartbeat: () => false,
      executeChunk,
    });
    expect(receipt).toMatchObject({
      status: 'blocked', reason: 'trade-run-lease-lost', requested: 2, succeeded: 0, skipped: 2,
    });
    expect(executeChunk).not.toHaveBeenCalled();
  });
});
