import { describe, expect, it, vi } from 'vitest';
import {
  EXPIRED_LEASE_VALIDATION_CONFIRMATION,
  stageExpiredTradeLeaseValidation,
} from '../../src/trade/expired-lease-validation.js';
import { createTradeRunLease } from '../../src/trade/run-lease.js';

function memoryStorage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function snapshot(now = 1_000_000) {
  return {
    paused: true,
    liveExecutionEnabled: false,
    jobs: [{
      id: 'listing-1',
      name: 'Listing Job',
      type: 'listing',
      enabled: true,
      armed: true,
      schedule: { type: 'once', runAt: now + 60_000 },
      misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
      policy: { sources: ['club'], maxListings: 1, expiredPolicy: 'skip' },
    }],
    runtimes: { 'listing-1': { nextRunAt: now + 60_000 } },
  };
}

describe('Expired Trade Run Lease validation setup', () => {
  it('stages only a sanitized expired lease for one guarded Job', () => {
    const now = 1_000_000;
    const storage = memoryStorage();
    const lease = createTradeRunLease({ storage, key: 'lease', ownerId: 'current-tab', now: () => now });
    const result = stageExpiredTradeLeaseValidation({
      confirmationText: EXPIRED_LEASE_VALIDATION_CONFIRMATION,
      snapshot: snapshot(now),
      inspectLease: lease.inspect,
      writeLease: (value) => storage.set('lease', value),
      createToken: () => 'internal-secret',
      now,
    });

    expect(result).toMatchObject({
      staged: true,
      jobId: 'listing-1',
      runAt: now + 60_000,
      lease: { runId: `expired-lease-validation-${now}`, expiresAt: now - 1_000 },
    });
    expect(lease.inspect()).toMatchObject({ active: false, expired: true });
    expect(JSON.stringify(result)).not.toContain('internal-secret');
  });

  it('rejects unsafe setup states before writing storage', () => {
    const now = 1_000_000;
    const writeLease = vi.fn();
    const valid = snapshot(now);
    const base = {
      snapshot: valid,
      inspectLease: () => ({ lease: null, active: false, expired: false }),
      writeLease,
      now,
    };

    expect(() => stageExpiredTradeLeaseValidation(base)).toThrow('EXPIRE LEASE 1');
    expect(() => stageExpiredTradeLeaseValidation({
      ...base,
      confirmationText: EXPIRED_LEASE_VALIDATION_CONFIRMATION,
      snapshot: { ...valid, paused: false, liveExecutionEnabled: true },
    })).toThrow('must be paused');
    expect(() => stageExpiredTradeLeaseValidation({
      ...base,
      confirmationText: EXPIRED_LEASE_VALIDATION_CONFIRMATION,
      inspectLease: () => ({ lease: { runId: 'existing' }, active: false, expired: true }),
    })).toThrow('already exists');
    expect(writeLease).not.toHaveBeenCalled();
  });
});
