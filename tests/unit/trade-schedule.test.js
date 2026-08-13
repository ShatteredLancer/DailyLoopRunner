import { describe, expect, it } from 'vitest';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import {
  advanceTradeJobRuntime,
  createTradeJobRuntime,
  evaluateTradeJob,
  nextTradeRunAt,
} from '../../src/trade/schedule.js';

function listingJob(schedule, misfirePolicy = { type: 'grace-window', graceMinutes: 15 }) {
  return normalizeTradeJob({
    id: 'scheduled-listing', name: 'Scheduled Listing', type: 'listing', enabled: true, armed: true,
    schedule, misfirePolicy,
    policy: { cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }] },
  }, { now: Date.parse('2026-03-01T00:00:00Z') });
}

describe('Trade schedule', () => {
  it('calculates absolute once, interval and timezone-aware daily times', () => {
    const once = listingJob({ type: 'once', runAt: 2000 });
    expect(nextTradeRunAt(once, 1000)).toBe(2000);
    expect(nextTradeRunAt(once, 2001)).toBeNull();

    const interval = listingJob({ type: 'interval', intervalSeconds: 600, anchorAt: 1000 });
    expect(nextTradeRunAt(interval, 1000)).toBe(1000);
    expect(nextTradeRunAt(interval, 1001)).toBe(601000);

    const daily = listingJob({ type: 'daily', time: '09:30', timezone: 'Asia/Shanghai' });
    expect(nextTradeRunAt(daily, Date.parse('2026-08-08T01:00:00Z'))).toBe(Date.parse('2026-08-08T01:30:00Z'));
    expect(nextTradeRunAt(daily, Date.parse('2026-08-08T02:00:00Z'))).toBe(Date.parse('2026-08-09T01:30:00Z'));

    const dstDaily = listingJob({ type: 'daily', time: '09:30', timezone: 'America/New_York' });
    expect(nextTradeRunAt(dstDaily, Date.parse('2026-03-08T12:00:00Z'))).toBe(Date.parse('2026-03-08T13:30:00Z'));
    expect(nextTradeRunAt(dstDaily, Date.parse('2026-11-01T13:00:00Z'))).toBe(Date.parse('2026-11-01T14:30:00Z'));
  });

  it('evaluates session, operation, circuit and misfire states without UI input', () => {
    const job = listingJob({ type: 'once', runAt: 1000 });
    const runtime = createTradeJobRuntime(job, { now: 0 });
    expect(evaluateTradeJob(job, runtime, { now: 1000, sessionReady: false, liveExecutionEnabled: true })).toMatchObject({ status: 'waiting-session' });
    expect(evaluateTradeJob(job, runtime, {
      now: 1000, sessionReady: false, sessionReason: 'fsu-club-loading', liveExecutionEnabled: true,
    })).toMatchObject({ status: 'waiting-session', reason: 'fsu-club-loading' });
    expect(evaluateTradeJob(job, runtime, { now: 1000, sessionReady: true, operationBusy: true, liveExecutionEnabled: true })).toMatchObject({ status: 'waiting-operation' });
    expect(evaluateTradeJob(job, runtime, { now: 1000, sessionReady: true, circuitAllowed: false, liveExecutionEnabled: true })).toMatchObject({ status: 'blocked', reason: 'trade-circuit-open' });
    expect(evaluateTradeJob(job, runtime, { now: 1000, sessionReady: true, liveExecutionEnabled: false })).toMatchObject({ status: 'blocked', reason: 'live-execution-disabled' });
    expect(evaluateTradeJob(job, runtime, {
      now: 1000, sessionReady: true, liveExecutionEnabled: true,
      tradeRecoveryReviewRequired: true, tradeRecoveryReason: 'buy-journal-mutation-review-required',
    })).toMatchObject({ status: 'blocked', reason: 'buy-journal-mutation-review-required' });
    expect(evaluateTradeJob(job, runtime, { now: 1000, sessionReady: true, liveExecutionEnabled: true })).toMatchObject({ status: 'running', action: 'run' });

    const skip = listingJob({ type: 'once', runAt: 1000 }, { type: 'skip' });
    expect(evaluateTradeJob(skip, createTradeJobRuntime(skip, { now: 0 }), {
      now: 32000, sessionReady: true, liveExecutionEnabled: true, tickToleranceMs: 30000,
    })).toMatchObject({ status: 'missed', reason: 'misfire-skip', action: 'advance' });
  });

  it('keeps manual Jobs outside the armed Scheduler lifecycle', () => {
    const job = listingJob({ type: 'manual' });
    const runtime = createTradeJobRuntime(job, { now: 1000 });
    expect(job.armed).toBe(false);
    expect(runtime).toMatchObject({ status: 'disabled', reason: 'manual-only', nextRunAt: null });
    expect(evaluateTradeJob({ ...job, armed: true }, runtime, {
      now: 1000,
      sessionReady: true,
      liveExecutionEnabled: true,
    })).toMatchObject({ status: 'disabled', reason: 'manual-only', action: 'wait' });
  });

  it('advances recurring schedules from an absolute scheduled time', () => {
    const job = listingJob({ type: 'interval', intervalSeconds: 600, anchorAt: 1000 });
    const runtime = createTradeJobRuntime(job, { now: 0 });
    const advanced = advanceTradeJobRuntime(job, runtime, { at: 1000, scheduledFor: 1000, runId: 'run-1' });
    expect(advanced).toMatchObject({ nextRunAt: 601000, lastRunId: 'run-1', runCount: 1, status: 'waiting-time' });
  });

  it('merges elapsed interval occurrences after a long terminal Run', () => {
    const job = listingJob({ type: 'interval', intervalSeconds: 2, anchorAt: 1000 });
    const runtime = createTradeJobRuntime(job, { now: 0 });
    expect(advanceTradeJobRuntime(job, runtime, {
      at: 7500, scheduledFor: 1000, runId: 'long-run',
    })).toMatchObject({
      nextRunAt: 9000, lastScheduledFor: 1000, lastRunId: 'long-run', runCount: 1,
    });
  });

  it('treats a schedule window as one terminal occurrence', () => {
    const job = listingJob({ type: 'window', startAt: 1000, endAt: 60_000 });
    const runtime = createTradeJobRuntime(job, { now: 0 });
    expect(runtime.nextRunAt).toBe(1000);
    expect(advanceTradeJobRuntime(job, runtime, {
      at: 2000, scheduledFor: 1000, runId: 'window-run',
    })).toMatchObject({ nextRunAt: null, runCount: 1, status: 'completed' });
  });

  it('resumes a persisted continuation only after its pacing time without applying misfire again', () => {
    const job = listingJob({ type: 'once', runAt: 1000 }, { type: 'skip' });
    const runtime = {
      ...createTradeJobRuntime(job, { now: 0 }),
      continuation: {
        runId: 'sliced-run', scheduledFor: 1000, startedAt: 1000, resumeAt: 5000,
        requested: 2, succeeded: 1, sliceCount: 1,
      },
    };
    expect(evaluateTradeJob(job, runtime, {
      now: 4000, sessionReady: true, liveExecutionEnabled: true,
    })).toMatchObject({ status: 'waiting-pace', reason: 'trade-action-pacing', action: 'wait' });
    expect(evaluateTradeJob(job, runtime, {
      now: 5000, sessionReady: true, liveExecutionEnabled: true,
    })).toMatchObject({ status: 'running', action: 'run' });
  });
});
