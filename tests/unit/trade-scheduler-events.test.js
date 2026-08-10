import { describe, expect, it } from 'vitest';
import {
  createTradeSchedulerEventLog,
  summarizeTradeSchedulerRuntime,
} from '../../src/trade/scheduler-events.js';

describe('Trade Scheduler event diagnostics', () => {
  it('retains a bounded allowlisted timeline without arbitrary input fields', () => {
    let time = 100;
    const log = createTradeSchedulerEventLog({ now: () => time, limit: 2 });
    log.record({ trigger: 'interval', status: 'waiting-operation', runtimeReason: 'runner-operation-active' });
    time = 150;
    const repeated = log.record({ trigger: 'interval', status: 'waiting-operation', runtimeReason: 'runner-operation-active' });
    expect(repeated).toMatchObject({ firstAt: 100, at: 150, count: 2 });
    time = 200;
    log.record({ trigger: 'focus', status: 'busy', reason: 'browser-lock-held', token: 'secret' });
    time = 300;
    const latest = log.record({
      trigger: 'interval', status: 'completed', jobId: 'job-1', runId: 'run-1', runtimeNextRunAt: null,
    });

    expect(latest).toMatchObject({ at: 300, trigger: 'interval', status: 'completed', jobId: 'job-1', runId: 'run-1' });
    expect(log.snapshot()).toEqual([
      expect.objectContaining({ firstAt: 200, at: 200, count: 1, trigger: 'focus', status: 'busy', reason: 'browser-lock-held' }),
      expect.objectContaining({ firstAt: 300, at: 300, count: 1, trigger: 'interval', status: 'completed', jobId: 'job-1', runId: 'run-1' }),
    ]);
    expect(JSON.stringify(log.snapshot())).not.toContain('secret');
  });

  it('selects the preferred runtime or the most actionable waiting state', () => {
    const snapshot = {
      runtimes: {
        disabled: { status: 'disabled', reason: 'not-armed', nextRunAt: null },
        waiting: { status: 'waiting-operation', reason: 'runner-operation-active', nextRunAt: 500 },
      },
    };
    expect(summarizeTradeSchedulerRuntime(snapshot)).toEqual({
      jobId: 'waiting',
      runtimeStatus: 'waiting-operation',
      runtimeReason: 'runner-operation-active',
      runtimeNextRunAt: 500,
    });
    expect(summarizeTradeSchedulerRuntime(snapshot, 'disabled')).toMatchObject({
      jobId: 'disabled', runtimeStatus: 'disabled', runtimeReason: 'not-armed', runtimeNextRunAt: null,
    });
  });
});
