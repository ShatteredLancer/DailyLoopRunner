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

    const interval = listingJob({ type: 'interval', everyMinutes: 10, anchorAt: 1000 });
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
    expect(evaluateTradeJob(job, runtime, { now: 1000, sessionReady: true, operationBusy: true, liveExecutionEnabled: true })).toMatchObject({ status: 'waiting-operation' });
    expect(evaluateTradeJob(job, runtime, { now: 1000, sessionReady: true, circuitAllowed: false, liveExecutionEnabled: true })).toMatchObject({ status: 'blocked', reason: 'trade-circuit-open' });
    expect(evaluateTradeJob(job, runtime, { now: 1000, sessionReady: true, liveExecutionEnabled: false })).toMatchObject({ status: 'blocked', reason: 'live-execution-disabled' });
    expect(evaluateTradeJob(job, runtime, { now: 1000, sessionReady: true, liveExecutionEnabled: true })).toMatchObject({ status: 'running', action: 'run' });

    const skip = listingJob({ type: 'once', runAt: 1000 }, { type: 'skip' });
    expect(evaluateTradeJob(skip, createTradeJobRuntime(skip, { now: 0 }), {
      now: 32000, sessionReady: true, liveExecutionEnabled: true, tickToleranceMs: 30000,
    })).toMatchObject({ status: 'missed', reason: 'misfire-skip', action: 'advance' });
  });

  it('advances recurring schedules from an absolute scheduled time', () => {
    const job = listingJob({ type: 'interval', everyMinutes: 10, anchorAt: 1000 });
    const runtime = createTradeJobRuntime(job, { now: 0 });
    const advanced = advanceTradeJobRuntime(job, runtime, { at: 1000, scheduledFor: 1000, runId: 'run-1' });
    expect(advanced).toMatchObject({ nextRunAt: 601000, lastRunId: 'run-1', runCount: 1, status: 'waiting-time' });
  });
});
