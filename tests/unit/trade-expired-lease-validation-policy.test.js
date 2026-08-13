import { describe, expect, it } from 'vitest';
import { requireExpiredLeaseValidationJob } from '../../src/trade/expired-lease-validation-policy.js';

function job(overrides = {}) {
  return {
    id: 'lease-validation', type: 'listing', enabled: true, armed: true,
    schedule: { type: 'once', runAt: 2000 },
    policy: { sources: ['club'], maxListings: 1, expiredPolicy: 'skip' },
    ...overrides,
  };
}

describe('Expired Lease validation public policy', () => {
  it('accepts only the controlled once Club single-card shape', () => {
    const value = job();
    expect(requireExpiredLeaseValidationJob({ jobs: [value] })).toBe(value);
  });

  it.each([
    [[], 'Exactly one armed'],
    [[job(), job({ id: 'second' })], 'Exactly one armed'],
    [[job({ type: 'buy' })], 'Listing Job'],
    [[job({ schedule: { type: 'interval', intervalSeconds: 300 } })], 'once Job'],
    [[job({ policy: { sources: ['transfer'], maxListings: 1, expiredPolicy: 'reprice' } })], 'Club-only'],
    [[job({ policy: { sources: ['club'], maxListings: 2, expiredPolicy: 'skip' } })], 'maxListings=1'],
    [[job({ policy: { sources: ['club'], maxListings: 1, expiredPolicy: 'reprice' } })], 'expiredPolicy=skip'],
  ])('rejects an unsafe public staging shape', (jobs, message) => {
    expect(() => requireExpiredLeaseValidationJob({ jobs })).toThrow(message);
  });
});
