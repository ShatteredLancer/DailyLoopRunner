import { describe, expect, it, vi } from 'vitest';
import { createFakeTradeAdapter } from '../../src/adapters/fake/trade.js';
import { normalizeTradeJob } from '../../src/trade/contracts.js';
import { createGuardedScheduledBuyExecutor } from '../../src/trade/guarded-scheduled-buy.js';
import { createTradeJobStore } from '../../src/trade/job-store.js';
import { createOperationCoordinator } from '../../src/trade/operation-coordinator.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';
import { createTradeScheduler } from '../../src/trade/scheduler.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function job() {
  return normalizeTradeJob({
    id: 'buy-once', name: 'Buy once', type: 'buy', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 2000 }, misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 15,
      searchDelaySeconds: [8, 15], maxConsecutiveEmptySearches: 20,
    },
  }, { now: 1 });
}

function dualJob() {
  const base = job();
  return normalizeTradeJob({
    ...base,
    id: 'buy-once-dual',
    name: 'Buy adjacent ratings once',
    policy: {
      ...base.policy,
      ratingMax: 85,
      quantity: 2,
      totalBudget: 2000,
    },
  }, { now: 1 });
}

function store() {
  const value = createTradeJobStore({ storage: memoryStorage(), now: () => 2000 });
  value.upsert(job());
  value.setMinimumRetainedCoins(4000);
  value.authorize('buy-once');
  return value;
}

function safeRequestBudget() {
  return {
    inspect: () => ({ remaining: 30 }),
    reserve: vi.fn(async () => ({ ready: true, release: vi.fn(async () => {}) })),
  };
}

function readyPreview() {
  return {
    liveExecutionAllowed: false,
    plan: { ready: true, lanes: [{ rating: 84, maxBuyNow: 1000, definitionIds: [8401] }] },
  };
}

describe('Guarded scheduled Buy executor', () => {
  it('consumes the one-run authorization and passes one attempt plus the global reserve to the transaction', async () => {
    const jobStore = store();
    const baseAdapter = createFakeTradeAdapter({ coins: 6000 });
    const scopedAdapter = createFakeTradeAdapter({ coins: 6000 });
    const reservation = { ready: true, take: vi.fn(), release: vi.fn(async () => {}) };
    const requestBudget = {
      inspect: () => ({ remaining: 30 }),
      reserve: vi.fn(async () => reservation),
    };
    const getTradeAdapter = vi.fn((options = {}) => (
      options.requestBudget === reservation ? scopedAdapter : baseAdapter
    ));
    const transaction = { run: vi.fn(async () => ({ status: 'completed', requested: 1, succeeded: 1, receipts: [] })) };
    const transactionFactory = vi.fn(() => transaction);
    const heartbeat = vi.fn(() => true);
    const result = await createGuardedScheduledBuyExecutor({
      store: jobStore,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      buyPreview: { preview: vi.fn(async () => readyPreview()) },
      getTradeAdapter,
      transactionFactory,
      requestBudget,
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: job(), runId: 'scheduled-buy-run', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat,
    });

    expect(result).toMatchObject({ status: 'completed', succeeded: 1 });
    expect(jobStore.read()).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ id: 'buy-once', armed: false }],
    });
    expect(transaction.run).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'scheduled-buy-run',
      expectedDestination: 'auto',
      minimumRetainedCoins: 4000,
      maxBuyAttempts: 1,
      beforeBuy: expect.any(Function),
    }));
    expect(transaction.run.mock.calls[0][0].beforeBuy()).toBe(true);
    expect(heartbeat).toHaveBeenCalledTimes(2);
    expect(requestBudget.reserve).toHaveBeenCalledWith(14);
    expect(getTradeAdapter).toHaveBeenCalledWith({ requestBudget: reservation });
    expect(transactionFactory).toHaveBeenCalledWith(expect.objectContaining({ tradeAdapter: scopedAdapter }));
    expect(reservation.release).toHaveBeenCalledOnce();
  });

  it('waits locally and blocks without market work when request capacity stays unavailable', async () => {
    let time = 2000;
    const transactionFactory = vi.fn();
    const buyPreview = { preview: vi.fn(async () => readyPreview()) };
    const requestBudget = {
      inspect: () => ({ remaining: 14 }),
      reserve: vi.fn(async () => ({ ready: false, required: 14, remaining: 13, retryAt: time + 60_000 })),
    };
    const result = await createGuardedScheduledBuyExecutor({
      store: store(),
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      buyPreview,
      getTradeAdapter: () => createFakeTradeAdapter({ coins: 6000 }),
      transactionFactory,
      requestBudget,
      validationGateEnabled: true,
      now: () => time,
      sleep: async () => { time = 902_000; },
    }).execute({
      job: job(), runId: 'scheduled-buy-reservation-race', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({
      status: 'stopped', reason: 'runtime-limit', requested: 1, skipped: 1,
    });
    expect(buyPreview.preview).toHaveBeenCalledOnce();
    expect(requestBudget.reserve).toHaveBeenCalledOnce();
    expect(transactionFactory).not.toHaveBeenCalled();
  });

  it('blocks below the reserve plus maximum price before Preview or market work', async () => {
    const buyPreview = { preview: vi.fn() };
    const adapter = createFakeTradeAdapter({ coins: 4999 });
    const result = await createGuardedScheduledBuyExecutor({
      store: store(),
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      buyPreview,
      getTradeAdapter: () => adapter,
      requestBudget: safeRequestBudget(),
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: job(), runId: 'scheduled-buy-blocked', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });

    expect(result).toMatchObject({ status: 'blocked', reason: 'scheduled-buy-minimum-coins-not-met', requested: 0 });
    expect(buyPreview.preview).not.toHaveBeenCalled();
    expect(adapter.calls.some((call) => call.method === 'searchMarket')).toBe(false);
    expect(adapter.calls.some((call) => call.method === 'buyNowItem')).toBe(false);
  });

  it('previews first, then waits for the shared request reserve without market writes', async () => {
    let time = 2000;
    const jobStore = store();
    const buyPreview = { preview: vi.fn(async () => readyPreview()) };
    const adapter = createFakeTradeAdapter({ coins: 6000 });
    const reserve = vi.fn(async () => ({
      ready: false, required: 14, remaining: 11, retryAt: time + 60_000,
    }));
    const result = await createGuardedScheduledBuyExecutor({
      store: jobStore,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      buyPreview,
      getTradeAdapter: () => adapter,
      requestBudget: { inspect: () => ({ remaining: 11, retryAt: 5000 }), reserve },
      validationGateEnabled: true,
      now: () => time,
      sleep: async () => { time = 902_000; },
    }).execute({
      job: job(), runId: 'scheduled-buy-budget', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({
      status: 'stopped', reason: 'runtime-limit', requested: 1, skipped: 1,
    });
    expect(jobStore.read()).toMatchObject({ paused: true, liveExecutionEnabled: false, jobs: [{ armed: false }] });
    expect(buyPreview.preview).toHaveBeenCalledOnce();
    expect(reserve).toHaveBeenCalledOnce();
    expect(adapter.calls.some((call) => call.method === 'searchMarket')).toBe(false);
  });

  it('refuses execution without consuming authorization while the production validation gate is disabled', async () => {
    const jobStore = store();
    const buyPreview = { preview: vi.fn() };
    const result = await createGuardedScheduledBuyExecutor({
      store: jobStore,
      operationCoordinator: createOperationCoordinator(),
      buyPreview,
      getTradeAdapter: () => createFakeTradeAdapter({ coins: 6000 }),
      requestBudget: safeRequestBudget(),
    }).execute({
      job: job(), runId: 'scheduled-buy-disabled', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'scheduled-buy-validation-gate-disabled' });
    expect(jobStore.read()).toMatchObject({
      paused: false,
      liveExecutionEnabled: true,
      jobs: [{ armed: true }],
      authorization: { jobId: 'buy-once', remainingRuns: 1 },
    });
    expect(buyPreview.preview).not.toHaveBeenCalled();
  });

  it('relocks and authorizes exactly two scheduled Buy attempts with a 28-slot reserve', async () => {
    const jobStore = createTradeJobStore({ storage: memoryStorage(), now: () => 2000 });
    jobStore.upsert(dualJob());
    jobStore.setMinimumRetainedCoins(4000);
    jobStore.authorize('buy-once-dual');
    const reservation = { ready: true, release: vi.fn(async () => {}) };
    const requestBudget = {
      inspect: () => ({ remaining: 30 }),
      reserve: vi.fn(async () => reservation),
    };
    const lanes = [
      { rating: 84, maxBuyNow: 1000, definitionIds: [8401] },
      { rating: 85, maxBuyNow: 1000, definitionIds: [8501] },
    ];
    const transaction = { run: vi.fn(async () => ({ status: 'completed', requested: 2, succeeded: 2, receipts: [] })) };
    const result = await createGuardedScheduledBuyExecutor({
      store: jobStore,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      buyPreview: { preview: vi.fn(async () => ({ liveExecutionAllowed: false, plan: { ready: true, lanes } })) },
      getTradeAdapter: () => createFakeTradeAdapter({ coins: 7000 }),
      transactionFactory: () => transaction,
      requestBudget,
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: dualJob(), runId: 'scheduled-buy-dual', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });

    expect(result).toMatchObject({ status: 'completed', requested: 2, succeeded: 2 });
    expect(requestBudget.reserve).toHaveBeenCalledWith(28);
    expect(transaction.run).toHaveBeenCalledWith(expect.objectContaining({ maxBuyAttempts: 2 }));
  });

  it('releases the Coordinator when Journal begin detects a cross-tab conflict', async () => {
    const operationCoordinator = createOperationCoordinator({ now: () => 2000 });
    const buyPreview = { preview: vi.fn() };
    const onRunningChange = vi.fn();
    const journal = {
      inspectRecovery: vi.fn(() => ({ canSupersede: true })),
      begin: vi.fn(() => { throw new Error('buy-journal-mutation-review-required'); }),
      finish: vi.fn(),
    };

    await expect(createGuardedScheduledBuyExecutor({
      store: store(),
      operationCoordinator,
      buyPreview,
      journal,
      getTradeAdapter: () => createFakeTradeAdapter({ coins: 6000 }),
      requestBudget: safeRequestBudget(),
      validationGateEnabled: true,
      now: () => 2000,
      onRunningChange,
    }).execute({
      job: job(), runId: 'scheduled-buy-journal-race', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    })).rejects.toThrow('buy-journal-mutation-review-required');

    expect(operationCoordinator.inspect().active).toBeNull();
    expect(buyPreview.preview).not.toHaveBeenCalled();
    expect(onRunningChange).not.toHaveBeenCalled();
  });

  it('executes exactly once after an in-grace page resume and persists one safe History receipt', async () => {
    const storage = memoryStorage();
    let time = 0;
    const scheduledJob = job();
    const jobStore = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    jobStore.upsert(scheduledJob);
    jobStore.setMinimumRetainedCoins(4000);
    jobStore.authorize(scheduledJob.id);
    const adapter = createFakeTradeAdapter({
      coins: 6000,
      marketItems: [{
        id: 70, definitionId: 8401, type: 'player', rating: 84, tier: 'gold', rare: true,
        auction: { present: true, state: 'active', tradeId: 1070, buyNowPrice: 900, expires: 100 },
      }],
    });
    const executor = createGuardedScheduledBuyExecutor({
      store: jobStore,
      operationCoordinator: createOperationCoordinator({ now: () => time }),
      buyPreview: { preview: vi.fn(async () => readyPreview()) },
      getTradeAdapter: () => adapter,
      requestBudget: safeRequestBudget(),
      playerCatalogProvider: {
        load: vi.fn(async () => ({ ok: true, lanes: [{ rating: 84, definitionIds: [8401] }] })),
      },
      validationGateEnabled: true,
      sleep: async () => {},
      now: () => time,
    });
    const lease = createTradeRunLease({
      storage, key: 'lease', ownerId: 'resumed-tab', now: () => time, createToken: () => 'lease-token',
    });
    const scheduler = createTradeScheduler({
      store: jobStore,
      lease,
      now: () => time,
      createRunId: () => 'resumed-scheduled-buy',
      getContext: () => ({ sessionReady: true, operationBusy: false, tickToleranceMs: 15_000 }),
      executeJob: executor.execute,
    });

    time = 61_000;
    const result = await scheduler.tick();

    expect(result).toMatchObject({
      status: 'completed',
      receipt: { runId: 'resumed-scheduled-buy', requested: 1, succeeded: 1, coinsBefore: 6000, coinsAfter: 5100 },
    });
    expect(await scheduler.tick()).toMatchObject({ status: 'paused' });
    expect(adapter.calls.filter((call) => call.method === 'buyNowItem')).toHaveLength(1);
    expect(jobStore.read()).toMatchObject({
      paused: true,
      liveExecutionEnabled: false,
      jobs: [{ id: 'buy-once', armed: false }],
      runtimes: { 'buy-once': { status: 'completed', nextRunAt: null, runCount: 1 } },
      history: [{ runId: 'resumed-scheduled-buy', status: 'completed', succeeded: 1 }],
    });
    expect(lease.inspect().lease).toBeNull();
    expect(JSON.stringify(jobStore.read().history)).not.toContain('lease-token');
  });
});
