import {
  GUARDED_SCHEDULE_CONFIRMATION,
  guardedScheduledListingReason,
} from './guarded-scheduled-listing.js';
import {
  inspectScheduledBuyValidationJob,
} from './scheduled-buy-validation.js';

export function selectGuardedScheduledTradeJob(snapshot = {}, options = {}) {
  const armed = (snapshot.jobs || []).filter((job) => job.enabled === true && job.armed === true);
  if (armed.length !== 1) {
    return {
      ready: false,
      reason: armed.length ? 'validation-gate-multiple-armed-jobs' : 'validation-gate-no-armed-job',
      job: null,
      gate: null,
      requiredText: null,
    };
  }

  const job = armed[0];
  let gate;
  if (job.type === 'listing') {
    const reason = guardedScheduledListingReason(job);
    gate = { ready: reason === null, reason, job, requiredText: GUARDED_SCHEDULE_CONFIRMATION };
  } else if (job.type === 'buy') {
    if (options.scheduledBuyEnabled !== true) {
      gate = { ready: false, reason: 'scheduled-buy-validation-gate-disabled', job, requiredText: null };
    } else {
      gate = inspectScheduledBuyValidationJob(job, {
        minimumRetainedCoins: options.minimumRetainedCoins ?? snapshot.safety?.minimumRetainedCoins,
        now: options.now,
      });
    }
  } else {
    gate = { ready: false, reason: 'validation-gate-job-type-unsupported', job, requiredText: null };
  }

  const runtime = snapshot.runtimes?.[job.id];
  if (gate.ready && runtime && runtime.nextRunAt === null) {
    return { ready: false, reason: 'validation-gate-no-pending-run', job: null, gate, requiredText: null };
  }
  return {
    ready: gate.ready === true,
    reason: gate.reason || null,
    job: gate.ready ? job : null,
    gate,
    requiredText: gate.ready ? gate.requiredText : null,
  };
}
