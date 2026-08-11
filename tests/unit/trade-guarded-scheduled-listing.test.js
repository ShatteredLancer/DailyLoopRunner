import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { createOperationCoordinator } from '../../src/trade/operation-coordinator.js';
import {
  createGuardedScheduledListingExecutor,
  guardedTradeSessionReadiness,
  guardedScheduledListingReason,
  selectGuardedScheduledListingJob,
} from '../../src/trade/guarded-scheduled-listing.js';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { createTradeJobStore } from '../../src/trade/job-store.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';
import { createTradeScheduler } from '../../src/trade/scheduler.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => value === null ? values.delete(key) : values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function job(overrides = {}) {
  return normalizeTradeJob({
    id: 'once-listing', name: 'One guarded listing', type: 'listing', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 2000 }, misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      sources: ['club'], cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      marketOverride: { enabled: false, markupPercent: 5, maxQuoteAgeMinutes: 10 },
      startPricePolicy: 'one-step-below', durationSeconds: 3600, listingDelaySeconds: [4, 8],
      maxListings: 1, expiredPolicy: 'skip',
    },
    ...overrides,
  }, { now: 1000 });
}

function store() {
  return {
    relock: vi.fn(),
  };
}

describe('Guarded scheduled Listing validation executor', () => {
  it('waits for FSU loading but allows provisional data for targeted validation', () => {
    expect(guardedTradeSessionReadiness({ pageReady: false })).toEqual({ ready: false, reason: 'ea-session-unavailable' });
    expect(guardedTradeSessionReadiness({ pageReady: true, fsuReadiness: { detected: false } }))
      .toEqual({ ready: true, reason: null });
    expect(guardedTradeSessionReadiness({
      pageReady: true,
      fsuReadiness: { detected: true, ready: false, state: 'loading' },
    })).toEqual({ ready: false, reason: 'fsu-club-loading' });
    expect(guardedTradeSessionReadiness({
      pageReady: true,
      fsuReadiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional' },
    })).toEqual({ ready: true, reason: null });
    expect(guardedTradeSessionReadiness({
      pageReady: true,
      fsuReadiness: { detected: true, ready: true, fullyValidated: true, state: 'ready' },
    })).toEqual({ ready: true, reason: null });
  });

  it('selects exactly one armed once/Club/one-item Listing Job', () => {
    const valid = job();
    expect(guardedScheduledListingReason(valid)).toBeNull();
    expect(selectGuardedScheduledListingJob({ jobs: [valid] })).toEqual({ ready: true, reason: null, job: valid });
    expect(selectGuardedScheduledListingJob({ jobs: [] })).toMatchObject({ ready: false, reason: 'validation-gate-no-armed-job' });
    expect(selectGuardedScheduledListingJob({ jobs: [valid, job({ id: 'second' })] }))
      .toMatchObject({ ready: false, reason: 'validation-gate-multiple-armed-jobs' });
    expect(guardedScheduledListingReason(job({ schedule: { type: 'daily', time: '09:00', timezone: 'UTC' } })))
      .toBe('validation-gate-once-only');
    expect(guardedScheduledListingReason(job({ misfirePolicy: { type: 'next-login' } })))
      .toBe('validation-gate-next-login-disabled');
    expect(guardedScheduledListingReason(job({ misfirePolicy: { type: 'grace-window', graceMinutes: 30 } })))
      .toBe('validation-gate-grace-too-long');
    expect(selectGuardedScheduledListingJob({
      jobs: [valid], runtimes: { [valid.id]: { nextRunAt: null } },
    })).toMatchObject({ ready: false, reason: 'validation-gate-no-pending-run' });
  });

  it('relocks and disarms before preparing and executing one item', async () => {
    const jobStore = store();
    const order = [];
    jobStore.relock.mockImplementation(() => order.push('relock'));
    const prepared = {
      ready: true,
      job: job(),
      plan: { entries: [{ item: { id: 1, definitionId: 2, pile: 'club' } }] },
      confirmation: { token: 'secret', requiredText: 'LIST 1' },
    };
    const listingPreparation = { prepare: vi.fn(async () => { order.push('prepare'); return prepared; }) };
    const transaction = { run: vi.fn(async () => {
      order.push('transaction');
      return { status: 'completed', requested: 1, succeeded: 1, receipts: [] };
    }) };
    const baseAdapter = createFakeTradeAdapter();
    const scopedAdapter = createFakeTradeAdapter();
    const reservation = { ready: true, take: vi.fn(), release: vi.fn(async () => {}) };
    const requestBudget = {
      inspect: () => ({ remaining: 30 }),
      reserve: vi.fn(async () => reservation),
    };
    const getTradeAdapter = vi.fn((options = {}) => (
      options.requestBudget === reservation ? scopedAdapter : baseAdapter
    ));
    const transactionFactory = vi.fn(() => transaction);
    const onRunningChange = vi.fn();
    const executor = createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter,
      transactionFactory,
      requestBudget,
      circuitBreaker: { availability: () => ({ allowed: true }) },
      validationGateEnabled: true,
      now: () => 2000,
      onRunningChange,
    });
    const heartbeat = vi.fn(() => true);
    const result = await executor.execute({
      job: job(), runId: 'run-1', scheduledFor: 2000, context: { liveExecutionEnabled: true }, heartbeat,
    });
    expect(result).toMatchObject({ status: 'completed', requested: 1, succeeded: 1 });
    expect(order).toEqual(['relock', 'prepare', 'transaction']);
    expect(jobStore.relock).toHaveBeenCalledOnce();
    expect(transaction.run).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1', confirmationToken: 'secret', confirmationText: 'LIST 1', scheduledFor: 2000,
    }));
    expect(transaction.run.mock.calls[0][0].beforeMutation()).toBe(true);
    expect(heartbeat).toHaveBeenCalledOnce();
    expect(onRunningChange.mock.calls.map((call) => call[0])).toEqual([true, false]);
    expect(requestBudget.reserve).toHaveBeenCalledOnce();
    expect(getTradeAdapter).toHaveBeenCalledWith({ requestBudget: reservation });
    expect(transactionFactory).toHaveBeenCalledWith(expect.objectContaining({ tradeAdapter: scopedAdapter }));
    expect(reservation.release).toHaveBeenCalledOnce();
  });

  it('blocks after preparation when another tab takes the inspected request capacity', async () => {
    const prepared = {
      ready: true,
      job: job(),
      plan: { entries: [{ item: { id: 1, definitionId: 2, pile: 'club' } }] },
      confirmation: { token: 'secret', requiredText: 'LIST 1' },
    };
    const listingPreparation = { prepare: vi.fn(async () => prepared) };
    const transactionFactory = vi.fn();
    const requestBudget = {
      inspect: () => ({ remaining: 12 }),
      reserve: vi.fn(async () => ({ ready: false, required: 12, remaining: 11, retryAt: 5000 })),
    };
    const result = await createGuardedScheduledListingExecutor({
      store: store(),
      listingPreparation,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory,
      requestBudget,
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: job(), runId: 'listing-reservation-race', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'trade-request-budget-insufficient', requested: 0 });
    expect(listingPreparation.prepare).toHaveBeenCalledOnce();
    expect(requestBudget.reserve).toHaveBeenCalledOnce();
    expect(transactionFactory).not.toHaveBeenCalled();
  });

  it('relocks and blocks before preparation when the shared request reserve is unavailable', async () => {
    const jobStore = store();
    const listingPreparation = { prepare: vi.fn() };
    const result = await createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      requestBudget: { inspect: () => ({ remaining: 11, retryAt: 5000 }) },
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: job(), runId: 'budget-blocked', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'trade-request-budget-insufficient', requested: 0 });
    expect(jobStore.relock).toHaveBeenCalledOnce();
    expect(listingPreparation.prepare).not.toHaveBeenCalled();
  });

  it('target-validates the selected Club item when FSU is provisional', async () => {
    const jobStore = store();
    const order = [];
    jobStore.relock.mockImplementation(() => order.push('relock'));
    const prepared = {
      ready: true,
      job: job(),
      plan: { entries: [{ item: { id: 10, definitionId: 20, pile: 'club' } }] },
      confirmation: { token: 'secret', requiredText: 'LIST 1' },
    };
    const validateClubPlayers = vi.fn(async () => {
      order.push('validate');
      return { ok: true, items: [{ id: 10, definitionId: 20 }], missing: [], elapsed: 12 };
    });
    const transaction = { run: vi.fn(async () => {
      order.push('transaction');
      return { status: 'completed', requested: 1, succeeded: 1, receipts: [] };
    }) };
    const onReceipt = vi.fn();
    const result = await createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation: { prepare: vi.fn(async () => { order.push('prepare'); return prepared; }) },
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory: () => transaction,
      validateClubPlayers,
      validationGateEnabled: true,
      now: () => 2000,
      onReceipt,
    }).execute({
      job: job(),
      runId: 'provisional-run',
      scheduledFor: 2000,
      context: {
        liveExecutionEnabled: true,
        fsuReadiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional', cacheStatus: 'trusted-provisional' },
      },
      heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'completed', succeeded: 1 });
    expect(validateClubPlayers).toHaveBeenCalledWith(
      [{ id: 10, definitionId: 20, pile: 'club' }],
      { label: 'One guarded listing targeted Club validation' },
    );
    expect(order).toEqual(['relock', 'prepare', 'validate', 'transaction']);
    expect(onReceipt).toHaveBeenCalledWith(result, expect.objectContaining({
      clubValidation: expect.objectContaining({ status: 'passed', elapsed: 12 }),
    }));
  });

  it('fails closed when provisional Club validation cannot confirm the selected item', async () => {
    const transactionFactory = vi.fn();
    const onReceipt = vi.fn();
    const result = await createGuardedScheduledListingExecutor({
      store: store(),
      listingPreparation: {
        prepare: vi.fn(async () => ({
          ready: true,
          job: job(),
          plan: { entries: [{ item: { id: 10, definitionId: 20, pile: 'club' } }] },
          confirmation: { token: 'secret', requiredText: 'LIST 1' },
        })),
      },
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory,
      validateClubPlayers: vi.fn(async () => ({ ok: true, items: [], missing: [{ id: 10, definitionId: 20 }] })),
      validationGateEnabled: true,
      now: () => 2000,
      onReceipt,
    }).execute({
      job: job(),
      runId: 'provisional-blocked',
      scheduledFor: 2000,
      context: {
        liveExecutionEnabled: true,
        fsuReadiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional', cacheStatus: 'trusted-provisional' },
      },
      heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'fsu-targeted-club-validation-item-not-returned', requested: 0 });
    expect(transactionFactory).not.toHaveBeenCalled();
    expect(onReceipt).toHaveBeenCalledWith(result, expect.objectContaining({
      clubValidation: expect.objectContaining({ status: 'item-not-returned' }),
    }));
  });

  it('relocks but refuses invalid or disabled validation gates before any preparation', async () => {
    const jobStore = store();
    const listingPreparation = { prepare: vi.fn() };
    const base = {
      store: jobStore,
      listingPreparation,
      operationCoordinator: createOperationCoordinator(),
      getTradeAdapter: () => createFakeTradeAdapter(),
      now: () => 2000,
    };
    const disabled = await createGuardedScheduledListingExecutor(base).execute({
      job: job(), runId: 'run-disabled', scheduledFor: 2000, context: { liveExecutionEnabled: true },
    });
    expect(disabled).toMatchObject({ status: 'blocked', reason: 'scheduled-listing-validation-gate-disabled' });
    const invalid = await createGuardedScheduledListingExecutor({ ...base, validationGateEnabled: true }).execute({
      job: job({ policy: { ...job().policy, maxListings: 2 } }),
      runId: 'run-invalid', scheduledFor: 2000, context: { liveExecutionEnabled: true },
    });
    expect(invalid).toMatchObject({ status: 'blocked', reason: 'validation-gate-one-item-only' });
    expect(listingPreparation.prepare).not.toHaveBeenCalled();
    expect(jobStore.relock).toHaveBeenCalledTimes(2);
  });

  it('retains a blocked Prepared scan for diagnostics without starting a transaction', async () => {
    const jobStore = store();
    const prepared = {
      ready: false,
      blockers: [{ reason: 'no-eligible-listing-candidates' }],
      scan: { counts: { club: 0 }, total: 0 },
      plan: { entries: [], counts: { scanned: 0, eligible: 0, selected: 0 } },
    };
    const transactionFactory = vi.fn();
    const onReceipt = vi.fn();
    const result = await createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation: { prepare: vi.fn(async () => prepared) },
      operationCoordinator: createOperationCoordinator(),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory,
      validationGateEnabled: true,
      now: () => 2000,
      onReceipt,
    }).execute({
      job: job(), runId: 'blocked-run', scheduledFor: 2000, context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'no-eligible-listing-candidates', requested: 0 });
    expect(transactionFactory).not.toHaveBeenCalled();
    expect(onReceipt).toHaveBeenCalledWith(result, expect.objectContaining({ prepared }));
  });

  it('runs through the Scheduler once and persists the relocked, disarmed state', async () => {
    const storage = memoryStorage();
    let time = 1000;
    const jobStore = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    jobStore.upsert(job());
    jobStore.setLiveExecutionEnabled(true);
    jobStore.setPaused(false);
    time = 2000;
    const transaction = { run: vi.fn(async () => ({ status: 'completed', requested: 1, succeeded: 1, receipts: [] })) };
    const executor = createGuardedScheduledListingExecutor({
      store: jobStore,
      listingPreparation: {
        prepare: async (preparedJob) => ({
          ready: true,
          job: preparedJob,
          plan: { entries: [{ item: { id: 1, definitionId: 2, pile: 'club' } }] },
          confirmation: { token: 'token', requiredText: 'LIST 1' },
        }),
      },
      operationCoordinator: createOperationCoordinator({ now: () => time }),
      getTradeAdapter: () => createFakeTradeAdapter(),
      transactionFactory: () => transaction,
      validationGateEnabled: true,
      now: () => time,
    });
    const scheduler = createTradeScheduler({
      store: jobStore,
      lease: createTradeRunLease({ storage, key: 'lease', ownerId: 'tab-a', now: () => time, createToken: () => 'lease-token' }),
      now: () => time,
      createRunId: () => 'scheduled-run-1',
      getContext: () => ({ sessionReady: true, operationBusy: false }),
      executeJob: executor.execute,
    });
    const result = await scheduler.tick();
    expect(result).toMatchObject({ status: 'completed', receipt: { runId: 'scheduled-run-1', succeeded: 1 } });
    expect(transaction.run).toHaveBeenCalledOnce();
    expect(jobStore.read()).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ id: 'once-listing', armed: false }],
      runtimes: { 'once-listing': { status: 'completed', nextRunAt: null, runCount: 1 } },
      history: [{ runId: 'scheduled-run-1', status: 'completed', succeeded: 1 }],
    });
  });
});
