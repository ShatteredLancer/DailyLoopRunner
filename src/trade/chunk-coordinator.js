import { createTradeRunReceipt } from './contracts.js';

export const TRADE_RUN_ITEM_LIMIT = 4;
export const TRADE_CHUNK_ITEM_LIMIT = 2;
export const TRADE_CHUNK_WAIT_LIMIT_MS = 15 * 60_000;

function boundedInteger(value, fallback, maximum) {
  const number = Math.floor(Number(value));
  return Math.min(maximum, Number.isFinite(number) && number > 0 ? number : fallback);
}

function summarizeChunkReceipt(receipt = {}, chunkIndex, offset) {
  return {
    status: 'chunk-summary',
    chunkIndex,
    offset,
    requested: Math.max(0, Number(receipt.requested || 0)),
    succeeded: Math.max(0, Number(receipt.succeeded || 0)),
    failed: Math.max(0, Number(receipt.failed || 0)),
    skipped: Math.max(0, Number(receipt.skipped || 0)),
    resultStatus: String(receipt.status || 'blocked'),
    reason: receipt.reason ? String(receipt.reason) : null,
    startedAt: Number(receipt.startedAt || 0) || null,
    finishedAt: Number(receipt.finishedAt || 0) || null,
  };
}

export function createTradeChunkCoordinator(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();

  async function run(input = {}) {
    if (typeof input.executeChunk !== 'function') throw new TypeError('executeChunk is required');
    const startedAt = Number(input.startedAt ?? now());
    const requested = boundedInteger(input.requested, 1, TRADE_RUN_ITEM_LIMIT);
    const chunkSize = boundedInteger(input.chunkSize, TRADE_CHUNK_ITEM_LIMIT, TRADE_CHUNK_ITEM_LIMIT);
    const deadlineAt = Math.max(
      startedAt + 1,
      Number(input.deadlineAt || startedAt + TRADE_CHUNK_WAIT_LIMIT_MS),
    );
    const continuation = input.continuation || null;
    const receipts = Array.isArray(continuation?.receipts) ? [...continuation.receipts] : [];
    let status = 'completed';
    let reason = null;
    let resumeAt = null;
    let succeeded = Math.max(0, Number(continuation?.succeeded || 0));
    let failed = Math.max(0, Number(continuation?.failed || 0));
    let skipped = Math.max(0, Number(continuation?.skipped || 0));
    let coinsBefore = continuation?.coinsBefore ?? null;
    let coinsAfter = continuation?.coinsAfter ?? null;
    let chunkIndex = Math.max(0, Number(continuation?.chunkIndex || 0));

    while (succeeded + failed + skipped < requested) {
      if (input.shouldStop?.() === true) {
        status = 'stopped';
        reason = 'stopped-by-user';
        break;
      }
      const offset = succeeded + failed + skipped;
      const quantity = Math.min(chunkSize, requested - offset);
      chunkIndex += 1;
      options.onCheckpoint?.({ phase: 'chunk-started', at: Number(now()), chunkIndex, offset, quantity });
      if (input.heartbeat && await input.heartbeat() !== true) {
        status = 'blocked';
        reason = 'trade-run-lease-lost';
        break;
      }
      if (Number(now()) >= deadlineAt) {
        status = 'stopped';
        reason = String(input.deadlineReason || 'runtime-limit');
        break;
      }

      const receipt = await input.executeChunk({ chunkIndex, offset, quantity });
      const chunkReceipt = createTradeRunReceipt(receipt || {});
      if (coinsBefore === null) coinsBefore = chunkReceipt.coinsBefore;
      coinsAfter = chunkReceipt.coinsAfter;
      receipts.push(summarizeChunkReceipt(chunkReceipt, chunkIndex, offset), ...(chunkReceipt.receipts || []));
      succeeded += chunkReceipt.succeeded;
      failed += chunkReceipt.failed;
      skipped += chunkReceipt.skipped;
      options.onCheckpoint?.({
        phase: 'chunk-finished', at: Number(now()), chunkIndex, offset, quantity,
        status: chunkReceipt.status, reason: chunkReceipt.reason,
      });

      const processed = chunkReceipt.succeeded + chunkReceipt.failed + chunkReceipt.skipped;
      if (chunkReceipt.status === 'deferred') {
        status = 'deferred';
        reason = chunkReceipt.reason || 'trade-action-pacing';
        resumeAt = chunkReceipt.resumeAt ?? chunkReceipt.continuation?.resumeAt ?? null;
        break;
      }
      if (chunkReceipt.status !== 'completed' || processed < quantity) {
        status = chunkReceipt.status || 'blocked';
        reason = chunkReceipt.reason || 'trade-chunk-incomplete';
        break;
      }
    }

    const accounted = succeeded + failed + skipped;
    return createTradeRunReceipt({
      runId: input.runId,
      jobId: input.jobId,
      jobType: input.jobType,
      scheduledFor: input.scheduledFor ?? startedAt,
      startedAt,
      finishedAt: Number(now()),
      status,
      reason,
      requested,
      succeeded,
      failed,
      skipped: skipped + Math.max(0, requested - accounted),
      ...(status === 'deferred' ? {
        resumeAt,
        skipped,
        continuation: {
          runId: input.runId,
          scheduledFor: input.scheduledFor ?? startedAt,
          startedAt,
          resumeAt,
          yieldedAt: Number(now()),
          sliceCount: Math.max(1, Number(continuation?.sliceCount || 0) + 1),
          requested,
          succeeded,
          failed,
          skipped,
          coinsBefore,
          coinsAfter,
          chunkIndex,
          receipts,
        },
      } : {}),
      coinsBefore,
      coinsAfter,
      receipts,
    });
  }

  return Object.freeze({ run });
}
