import { describe, expect, it, vi } from 'vitest';
import { createTradeRequestPacer, tradeActionDelay } from '../../src/trade/request-pacing.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
  };
}

function serialLockManager() {
  let queue = Promise.resolve();
  return {
    request(_name, _options, callback) {
      const result = queue.then(callback);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

describe('Trade request pacing', () => {
  it('maps Job policy to action-level delays without pacing reconciliation reads', () => {
    const policy = { searchDelaySeconds: [7, 15], buyDelaySeconds: [0, 1], listingDelaySeconds: [3, 8] };
    expect(tradeActionDelay(policy, 'market-search')).toEqual([7, 15]);
    expect(tradeActionDelay(policy, 'buy')).toEqual([0, 1]);
    expect(tradeActionDelay(policy, 'list')).toEqual([3, 8]);
    expect(tradeActionDelay(policy, 'purchase-refresh')).toEqual([0, 0]);
  });

  it('serializes the same action across tabs and waits until its selected interval', async () => {
    let time = 1000;
    const sleep = vi.fn(async (ms) => { time += ms; });
    const storage = memoryStorage();
    const options = { storage, lockManager: serialLockManager(), now: () => time, sleep, random: () => 0 };
    const first = createTradeRequestPacer(options);
    const second = createTradeRequestPacer(options);
    await expect(first.acquire('list', { delaySeconds: [3, 8], jobId: 'one' })).resolves.toMatchObject({ allowed: true, nextAllowedAt: 4000 });
    await expect(second.acquire('list', { delaySeconds: [3, 8], jobId: 'two' })).resolves.toMatchObject({ allowed: true, at: 4000 });
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(second.inspect({ action: 'list' })).toMatchObject({ status: 'waiting', nextAllowedAt: 7000, lastAction: { jobId: 'two' } });
  });

  it('returns a non-blocking deferred permit without sleeping or consuming the next action slot', async () => {
    let time = 1000;
    const sleep = vi.fn(async (ms) => { time += ms; });
    const storage = memoryStorage();
    const pacer = createTradeRequestPacer({ storage, now: () => time, sleep, random: () => 0 });
    await expect(pacer.acquire('list', { delaySeconds: [3, 3] })).resolves.toMatchObject({
      allowed: true, nextAllowedAt: 4000,
    });
    await expect(pacer.acquire('list', { delaySeconds: [3, 3], wait: false })).resolves.toMatchObject({
      allowed: false, deferred: true, reason: 'trade-action-pacing', retryAt: 4000,
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(pacer.inspect({ action: 'list' })).toMatchObject({ nextAllowedAt: 4000 });
  });

  it('opens a shared adaptive 429 cooldown without opening a Trade Circuit', async () => {
    let time = 1000;
    const storage = memoryStorage();
    const pacer = createTradeRequestPacer({ storage, now: () => time });
    await expect(pacer.recordRateLimit('market-search', {
      initialCooldownSeconds: 60, maximumCooldownSeconds: 1800,
    })).resolves.toMatchObject({ status: 'cooldown', level: 1, retryAt: 61000 });
    await expect(pacer.acquire('buy')).resolves.toMatchObject({
      allowed: false, reason: 'trade-rate-limit-cooldown', retryAt: 61000,
    });
    time = 61001;
    await expect(pacer.recordRateLimit('buy', {
      initialCooldownSeconds: 60, maximumCooldownSeconds: 1800,
    })).resolves.toMatchObject({ status: 'cooldown', level: 2, retryAt: 181001 });
  });

  it('persists bounded search-cycle pauses and never stores market item data', async () => {
    let time = 1000;
    const storage = memoryStorage();
    const sleep = vi.fn(async (ms) => { time += ms; });
    const pacer = createTradeRequestPacer({ storage, now: () => time, sleep, random: () => 0 });
    const context = {
      jobId: 'buy-job', runId: 'run', ownerId: 'tab', delaySeconds: [0, 0],
      searchCyclePauseEnabled: true,
      searchCyclePauseEvery: [2, 2], searchCyclePauseSeconds: [5, 5],
      candidate: { id: 999, token: 'secret' },
    };
    await pacer.acquire('market-search', context);
    await pacer.acquire('market-search', context);
    const waiting = pacer.inspect({ action: 'market-search', jobId: 'buy-job' });
    expect(waiting).toMatchObject({ status: 'waiting', reason: 'cycle-pause', nextAllowedAt: 6000 });
    await pacer.acquire('market-search', context);
    expect(sleep).toHaveBeenCalledWith(5000);
    expect(JSON.stringify(waiting)).not.toContain('secret');
    expect(JSON.stringify(waiting)).not.toContain('999');
  });
});
