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

function store() {
  const value = createTradeJobStore({ storage: memoryStorage(), now: () => 2000 });
  value.upsert(job());
  value.setMinimumRetainedCoins(4000);
  value.setLiveExecutionEnabled(true);
  value.setPaused(false);
  return value;
}

function readyPreview() {
  return {
    liveExecutionAllowed: false,
    plan: { ready: true, lanes: [{ rating: 84, maxBuyNow: 1000, definitionIds: [8401] }] },
  };
}

describe('Guarded scheduled Buy executor', () => {
  it('atomically relocks and passes one attempt plus the global reserve to the transaction', async () => {
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
    expect(heartbeat).toHaveBeenCalledOnce();
    expect(requestBudget.reserve).toHaveBeenCalledOnce();
    expect(getTradeAdapter).toHaveBeenCalledWith({ requestBudget: reservation });
    expect(transactionFactory).toHaveBeenCalledWith(expect.objectContaining({ tradeAdapter: scopedAdapter }));
    expect(reservation.release).toHaveBeenCalledOnce();
  });

  it('blocks after Preview when another tab takes the inspected request capacity', async () => {
    const transactionFactory = vi.fn();
    const buyPreview = { preview: vi.fn(async () => readyPreview()) };
    const requestBudget = {
      inspect: () => ({ remaining: 12 }),
      reserve: vi.fn(async () => ({ ready: false, required: 12, remaining: 11, retryAt: 5000 })),
    };
    const result = await createGuardedScheduledBuyExecutor({
      store: store(),
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      buyPreview,
      getTradeAdapter: () => createFakeTradeAdapter({ coins: 6000 }),
      transactionFactory,
      requestBudget,
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: job(), runId: 'scheduled-buy-reservation-race', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'trade-request-budget-insufficient', requested: 0 });
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

  it('relocks and blocks before Preview when the shared request reserve is unavailable', async () => {
    const jobStore = store();
    const buyPreview = { preview: vi.fn() };
    const adapter = createFakeTradeAdapter({ coins: 6000 });
    const result = await createGuardedScheduledBuyExecutor({
      store: jobStore,
      operationCoordinator: createOperationCoordinator({ now: () => 2000 }),
      buyPreview,
      getTradeAdapter: () => adapter,
      requestBudget: { inspect: () => ({ remaining: 11, retryAt: 5000 }) },
      validationGateEnabled: true,
      now: () => 2000,
    }).execute({
      job: job(), runId: 'scheduled-buy-budget', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'trade-request-budget-insufficient', requested: 0 });
    expect(jobStore.read()).toMatchObject({ paused: true, liveExecutionEnabled: false, jobs: [{ armed: false }] });
    expect(buyPreview.preview).not.toHaveBeenCalled();
    expect(adapter.calls.some((call) => call.method === 'searchMarket')).toBe(false);
  });

  it('relocks but refuses execution while the production validation gate is disabled', async () => {
    const jobStore = store();
    const buyPreview = { preview: vi.fn() };
    const result = await createGuardedScheduledBuyExecutor({
      store: jobStore,
      operationCoordinator: createOperationCoordinator(),
      buyPreview,
      getTradeAdapter: () => createFakeTradeAdapter({ coins: 6000 }),
    }).execute({
      job: job(), runId: 'scheduled-buy-disabled', scheduledFor: 2000,
      context: { liveExecutionEnabled: true }, heartbeat: () => true,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'scheduled-buy-validation-gate-disabled' });
    expect(jobStore.read()).toMatchObject({ paused: true, liveExecutionEnabled: false, jobs: [{ armed: false }] });
    expect(buyPreview.preview).not.toHaveBeenCalled();
  });

  it('executes exactly once after an in-grace page resume and persists one safe History receipt', async () => {
    const storage = memoryStorage();
    let time = 0;
    const scheduledJob = job();
    const jobStore = createTradeJobStore({ storage, key: 'jobs', now: () => time });
    jobStore.upsert(scheduledJob);
    jobStore.setMinimumRetainedCoins(4000);
    jobStore.setLiveExecutionEnabled(true);
    jobStore.setPaused(false);
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
