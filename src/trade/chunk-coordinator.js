import { createTradeRunReceipt } from './contracts.js';

export const TRADE_RUN_ITEM_LIMIT = 4;
export const TRADE_CHUNK_ITEM_LIMIT = 2;
export const TRADE_CHUNK_WAIT_LIMIT_MS = 15 * 60_000;
export const TRADE_CHUNK_WAIT_SLICE_MS = 1000;

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
  const requestBudget = options.requestBudget;
  if (typeof requestBudget?.reserve !== 'function') throw new TypeError('Trade request budget is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitSliceMs = Math.max(50, Number(options.waitSliceMs || TRADE_CHUNK_WAIT_SLICE_MS));

  async function waitForReservation(required, input, deadlineAt, chunkIndex) {
    const deadlineReason = String(input.deadlineReason || 'trade-request-budget-wait-timeout');
    while (true) {
      if (input.shouldStop?.() === true) return { ready: false, reason: 'stopped-by-user' };
      if (input.heartbeat && await input.heartbeat() !== true) {
        return { ready: false, reason: 'trade-run-lease-lost' };
      }
      if (Number(now()) >= deadlineAt) {
        return { ready: false, reason: deadlineReason };
      }
      const reservation = await requestBudget.reserve(required);
      if (reservation.ready) return reservation;
      const currentTime = Number(now());
      if (currentTime >= deadlineAt) return { ready: false, reason: deadlineReason };
      const retryAt = Number(reservation.retryAt || currentTime + waitSliceMs);
      const waitUntil = Math.min(deadlineAt, Math.max(currentTime + 1, retryAt));
      options.onCheckpoint?.({
        phase: 'chunk-budget-waiting',
        at: currentTime,
        chunkIndex,
        required,
        remaining: Number(reservation.remaining || 0),
        retryAt: waitUntil,
      });
      while (Number(now()) < waitUntil) {
        if (input.shouldStop?.() === true) return { ready: false, reason: 'stopped-by-user' };
        if (input.heartbeat && await input.heartbeat() !== true) {
          return { ready: false, reason: 'trade-run-lease-lost' };
        }
        await sleep(Math.min(waitSliceMs, waitUntil - Number(now())));
      }
    }
  }

  async function run(input = {}) {
    if (typeof input.executeChunk !== 'function') throw new TypeError('executeChunk is required');
    if (typeof input.requestReserve !== 'function') throw new TypeError('requestReserve is required');
    const startedAt = Number(input.startedAt ?? now());
    const requested = boundedInteger(input.requested, 1, TRADE_RUN_ITEM_LIMIT);
    const chunkSize = boundedInteger(input.chunkSize, TRADE_CHUNK_ITEM_LIMIT, TRADE_CHUNK_ITEM_LIMIT);
    const deadlineAt = Math.max(
      startedAt + 1,
      Number(input.deadlineAt || startedAt + TRADE_CHUNK_WAIT_LIMIT_MS),
    );
    const receipts = [];
    let status = 'completed';
    let reason = null;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let coinsBefore = null;
    let coinsAfter = null;
    let chunkIndex = 0;

    while (succeeded + failed + skipped < requested) {
      if (input.shouldStop?.() === true) {
        status = 'stopped';
        reason = 'stopped-by-user';
        break;
      }
      const offset = succeeded + failed + skipped;
      const quantity = Math.min(chunkSize, requested - offset);
      chunkIndex += 1;
      const required = Math.max(1, Math.floor(Number(input.requestReserve(quantity)) || 1));
      options.onCheckpoint?.({ phase: 'chunk-started', at: Number(now()), chunkIndex, offset, quantity, required });
      const reservation = await waitForReservation(required, input, deadlineAt, chunkIndex);
      if (!reservation.ready) {
        status = ['stopped-by-user', 'runtime-limit'].includes(reservation.reason) ? 'stopped' : 'blocked';
        reason = reservation.reason || 'trade-request-budget-insufficient';
        break;
      }

      let receipt;
      try {
        receipt = await input.executeChunk({ chunkIndex, offset, quantity, reservation });
      } finally {
        try { await reservation.release?.(); } catch { }
      }
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
      coinsBefore,
      coinsAfter,
      receipts,
    });
  }

  return Object.freeze({ run });
}
