import { selectGuardedScheduledListingJob } from './guarded-scheduled-listing.js';

export const EXPIRED_LEASE_VALIDATION_CONFIRMATION = 'EXPIRE LEASE 1';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function stageExpiredTradeLeaseValidation(options = {}) {
  requireCondition(
    String(options.confirmationText || '') === EXPIRED_LEASE_VALIDATION_CONFIRMATION,
    `Confirmation must exactly match ${EXPIRED_LEASE_VALIDATION_CONFIRMATION}`,
  );

  const snapshot = options.snapshot || {};
  requireCondition(snapshot.paused === true, 'Trade Scheduler must be paused');
  requireCondition(snapshot.liveExecutionEnabled !== true, 'Trade Scheduler live execution must be disabled');

  const selected = selectGuardedScheduledListingJob(snapshot);
  requireCondition(selected.ready === true, selected.reason || 'Exactly one eligible armed Job is required');

  const inspectLease = options.inspectLease;
  const writeLease = options.writeLease;
  requireCondition(typeof inspectLease === 'function', 'Trade Run Lease inspection is required');
  requireCondition(typeof writeLease === 'function', 'Trade Run Lease storage is required');

  const before = inspectLease();
  requireCondition(!before?.lease, 'A Trade Run Lease already exists; reconcile or clear it before validation');

  const now = Number(options.now ?? Date.now());
  const runAt = Number(selected.job.schedule?.runAt || 0);
  requireCondition(runAt >= now + 15_000, 'The once Job must be scheduled at least 15 seconds in the future');
  requireCondition(runAt <= now + 15 * 60_000, 'The validation Job must run within 15 minutes');

  const runId = `expired-lease-validation-${now}`;
  const expiredAt = Math.max(0, now - 1_000);
  writeLease({
    schemaVersion: 1,
    ownerId: `expired-validation-owner-${now}`,
    runId,
    jobId: selected.job.id,
    token: String(options.createToken?.() || `${runId}-internal-token`),
    acquiredAt: Math.max(0, now - 60_000),
    heartbeatAt: Math.max(0, now - 31_000),
    expiresAt: expiredAt,
  });

  const confirmed = inspectLease();
  requireCondition(
    confirmed?.expired === true && confirmed?.lease?.runId === runId,
    'Expired Trade Run Lease validation setup could not be confirmed',
  );

  return {
    staged: true,
    jobId: selected.job.id,
    runAt,
    lease: confirmed.lease,
  };
}
