import {
  GUARDED_SCHEDULE_CONFIRMATION,
  inspectGuardedScheduledListingJob,
} from './guarded-scheduled-listing.js';
import {
  inspectScheduledBuyValidationJob,
} from './scheduled-buy-validation.js';
import { TRADE_SCHEDULE_AUTHORIZATION_JOB_LIMIT, tradeScheduleAuthorizationRuns } from './schedule-authorization.js';

function inspectGuardedJob(job, snapshot, options) {
  if (job.type === 'listing') {
    const inspected = inspectGuardedScheduledListingJob(job, {
      scheduledTransferRepriceEnabled: options.scheduledTransferRepriceEnabled === true,
    });
    const reason = inspected.reason;
    return {
      ready: reason === null,
      reason,
      job,
      requiredText: reason === null
        ? (inspected.requiredText || GUARDED_SCHEDULE_CONFIRMATION)
        : null,
    };
  }
  if (job.type === 'buy') {
    if (options.scheduledBuyEnabled !== true) {
      return { ready: false, reason: 'scheduled-buy-validation-gate-disabled', job, requiredText: null };
    }
    return inspectScheduledBuyValidationJob(job, {
      minimumRetainedCoins: options.minimumRetainedCoins ?? snapshot.safety?.minimumRetainedCoins,
      now: options.now,
    });
  }
  return { ready: false, reason: 'validation-gate-job-type-unsupported', job, requiredText: null };
}

export function selectGuardedScheduledTradeJob(snapshot = {}, options = {}) {
  const armed = (snapshot.jobs || []).filter((job) => (
    job.enabled === true && job.armed === true && job.schedule?.type !== 'manual'
  ));
  if (!armed.length || armed.length > TRADE_SCHEDULE_AUTHORIZATION_JOB_LIMIT) {
    return {
      ready: false,
      reason: armed.length
        ? 'validation-gate-armed-job-limit-exceeded'
        : 'validation-gate-no-armed-job',
      job: null,
      jobs: [],
      gate: null,
      gates: [],
      requiredText: null,
    };
  }

  const gates = armed.map((job) => inspectGuardedJob(job, snapshot, options));
  for (const gate of gates) {
    const runtime = snapshot.runtimes?.[gate.job.id];
    if (gate.ready && runtime && runtime.nextRunAt === null) {
      return {
        ready: false,
        reason: 'validation-gate-no-pending-run',
        job: null,
        jobs: [],
        gate,
        gates,
        requiredText: null,
      };
    }
  }
  const blocked = gates.find((gate) => gate.ready !== true);
  if (blocked) {
    return {
      ready: false,
      reason: blocked.reason || null,
      job: null,
      jobs: [],
      gate: blocked,
      gates,
      requiredText: null,
    };
  }
  const totalRuns = armed.reduce((total, job) => total + tradeScheduleAuthorizationRuns(job), 0);
  const requiredText = armed.length === 1
    ? gates[0].requiredText
    : `ENABLE ${armed.length} TRADE JOBS FOR ${totalRuns} RUNS`;
  return {
    ready: true,
    reason: null,
    job: armed.length === 1 ? armed[0] : null,
    jobs: armed,
    gate: armed.length === 1 ? gates[0] : null,
    gates,
    totalRuns,
    requiredText,
  };
}

export function summarizeGuardedScheduledTradeSelection(snapshot = {}, options = {}) {
  const selected = selectGuardedScheduledTradeJob(snapshot, options);
  const job = selected.job || selected.gate?.job || null;
  return {
    ready: selected.ready === true,
    reason: selected.reason || null,
    jobId: job?.id ? String(job.id) : null,
    jobType: job?.type ? String(job.type) : null,
    jobIds: (selected.jobs || []).map((entry) => String(entry.id)),
    jobTypes: (selected.jobs || []).map((entry) => String(entry.type)),
    totalRuns: Number(selected.totalRuns || 0),
    requiredText: selected.requiredText || null,
  };
}
