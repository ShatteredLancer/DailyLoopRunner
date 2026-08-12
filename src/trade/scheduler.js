import { createTradeRunReceipt } from './contracts.js';
import { advanceTradeJobRuntime, evaluateTradeJob, normalizeTradeJobRuntime } from './schedule.js';
import { tradeScheduleFingerprint } from './schedule-authorization.js';
import { selectFairTradeCandidate } from './scheduler-fairness.js';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createTradeScheduler(options = {}) {
  const store = options.store;
  const lease = options.lease;
  if (!store?.read || !store?.updateRuntime || !store?.addHistory) throw new TypeError('Trade Job Store is required');
  if (!lease?.acquire || !lease?.release) throw new TypeError('Trade Run Lease is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const executeJob = options.executeJob;
  const getContext = typeof options.getContext === 'function' ? options.getContext : () => ({});
  const createRunId = typeof options.createRunId === 'function'
    ? options.createRunId
    : () => `trade-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let ticking = false;

  function schedulerContext(snapshot, job = null, extra = {}) {
    const circuit = options.circuitBreaker?.availability?.();
    return {
      ...getContext(job, snapshot),
      ...extra,
      now: Number(now()),
      liveExecutionEnabled: snapshot.liveExecutionEnabled === true,
      circuitAllowed: circuit ? circuit.allowed === true : true,
      circuitReason: circuit?.state?.reason || null,
    };
  }

  function missedReceipt(job, runtime, decision, at) {
    return createTradeRunReceipt({
      runId: createRunId(), jobId: job.id, jobType: job.type,
      scheduledFor: runtime.nextRunAt, startedAt: at, finishedAt: at,
      status: 'missed', reason: decision.reason,
    });
  }

  function persistAdvancedRuntime(job, advanced, terminalStatus, terminalReason = null) {
    const latest = store.read();
    const latestJob = latest.jobs.find((entry) => entry.id === job.id);
    if (!latestJob || tradeScheduleFingerprint(latestJob) !== tradeScheduleFingerprint(job)) {
      return latest.runtimes[job.id] || advanced;
    }
    const finalized = latestJob.armed === true
      ? advanced
      : normalizeTradeJobRuntime({
        ...advanced,
        status: terminalStatus,
        reason: terminalReason,
        nextRunAt: null,
      });
    store.updateRuntime(job.id, finalized);
    return finalized;
  }

  async function execute(job, runtime, context) {
    const startedAt = Number(now());
    const runId = createRunId();
    let acquired = lease.acquire({ runId, jobId: job.id });
    if (acquired.recoveryRequired) {
      const recovery = await options.reconcileExpiredLease?.(acquired.previousLease);
      const cleared = recovery?.status === 'reconciled'
        && lease.clearExpired?.(acquired.previousLease?.runId) === true;
      if (cleared) acquired = lease.acquire({ runId, jobId: job.id });
      else {
        const finishedAt = Number(now());
        const reason = recovery?.status === 'reconciled'
          ? 'expired-lease-clear-failed'
          : 'expired-lease-reconciliation-required';
        const receipt = createTradeRunReceipt({
          runId,
          jobId: job.id,
          jobType: job.type,
          scheduledFor: runtime.nextRunAt,
          startedAt,
          finishedAt,
          status: 'blocked',
          reason,
          receipts: [{
            status: 'blocked',
            reason,
            recoveryReason: recovery?.reason || null,
            previousLease: acquired.previousLease ? {
              runId: acquired.previousLease.runId,
              jobId: acquired.previousLease.jobId,
              acquiredAt: acquired.previousLease.acquiredAt,
              heartbeatAt: acquired.previousLease.heartbeatAt,
              expiresAt: acquired.previousLease.expiresAt,
            } : null,
          }],
        });
        const blocked = normalizeTradeJobRuntime({
          ...runtime,
          status: 'blocked',
          reason,
          lastScheduledFor: runtime.nextRunAt,
          lastStartedAt: startedAt,
          lastFinishedAt: finishedAt,
          lastRunId: runId,
          updatedAt: finishedAt,
        });
        store.updateRuntime(job.id, blocked);
        store.addHistory(receipt);
        return { status: 'blocked', jobId: job.id, receipt, runtime: blocked, previousLease: acquired.previousLease };
      }
    }
    if (!acquired.acquired) {
      const waiting = normalizeTradeJobRuntime({
        ...runtime, status: 'waiting-operation', reason: acquired.reason || 'lease-held', updatedAt: startedAt,
      });
      store.updateRuntime(job.id, waiting);
      return { status: 'waiting-operation', jobId: job.id, runtime: waiting };
    }
    store.updateRuntime(job.id, {
      ...runtime, status: 'running', reason: null, lastScheduledFor: runtime.nextRunAt,
      lastStartedAt: startedAt, lastRunId: runId, updatedAt: startedAt,
    });
    store.recordDispatch?.(job.id);
    let receipt;
    try {
      if (typeof executeJob !== 'function') throw new Error('Trade Scheduler executor is unavailable');
      receipt = await executeJob({
        job,
        runId,
        scheduledFor: runtime.nextRunAt,
        startedAt,
        context,
        heartbeat: () => lease.heartbeat(runId),
      });
      receipt = createTradeRunReceipt({
        ...receipt,
        runId,
        jobId: job.id,
        jobType: job.type,
        scheduledFor: runtime.nextRunAt,
        startedAt,
        finishedAt: receipt?.finishedAt ?? now(),
      });
    } catch (error) {
      receipt = createTradeRunReceipt({
        runId, jobId: job.id, jobType: job.type, scheduledFor: runtime.nextRunAt,
        startedAt, finishedAt: now(), status: 'blocked',
        reason: error?.message || String(error),
      });
    } finally {
      lease.release(runId);
    }
    store.addHistory(receipt);
    const advanced = advanceTradeJobRuntime(job, runtime, {
      at: receipt.finishedAt,
      scheduledFor: runtime.nextRunAt,
      startedAt,
      finishedAt: receipt.finishedAt,
      runId,
      reason: receipt.status === 'completed' ? null : receipt.reason,
    });
    const finalized = persistAdvancedRuntime(
      job,
      advanced,
      receipt.status === 'completed' ? 'completed' : 'blocked',
      receipt.status === 'completed' ? null : receipt.reason,
    );
    return { status: receipt.status, jobId: job.id, receipt, runtime: finalized };
  }

  async function tick(extraContext = {}) {
    if (ticking) return { status: 'busy' };
    ticking = true;
    try {
      const snapshot = store.read();
      if (snapshot.paused) return { status: 'paused' };
      const jobs = [...snapshot.jobs].sort((left, right) => {
        const leftAt = snapshot.runtimes[left.id]?.nextRunAt ?? Number.POSITIVE_INFINITY;
        const rightAt = snapshot.runtimes[right.id]?.nextRunAt ?? Number.POSITIVE_INFINITY;
        return leftAt - rightAt || left.id.localeCompare(right.id);
      });
      const runnable = [];
      for (const job of jobs) {
        const context = schedulerContext(snapshot, job, extraContext);
        const runtime = snapshot.runtimes[job.id] || {};
        const decision = evaluateTradeJob(job, runtime, context);
        store.updateRuntime(job.id, decision.runtime);
        if (decision.action === 'advance') {
          const receipt = missedReceipt(job, runtime, decision, context.now);
          store.addHistory(receipt);
          const advanced = advanceTradeJobRuntime(job, runtime, {
            at: context.now, scheduledFor: runtime.nextRunAt, runId: receipt.runId,
            reason: decision.reason, countRun: false,
          });
          store.updateRuntime(job.id, advanced);
          store.consumeAuthorization?.(job.id, receipt.runId);
          const finalized = persistAdvancedRuntime(job, advanced, 'missed', decision.reason);
          return { status: 'missed', jobId: job.id, receipt, runtime: finalized };
        }
        if (decision.action === 'run') runnable.push({ job, runtime, decision, context });
      }
      const selected = selectFairTradeCandidate(runnable, snapshot.dispatch);
      if (selected) return execute(selected.job, selected.runtime, selected.context);
      return { status: 'idle' };
    } finally {
      ticking = false;
    }
  }

  return Object.freeze({ tick });
}
