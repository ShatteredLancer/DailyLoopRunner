import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..', '..');

describe('Trade recovery boundaries', () => {
  it('excludes only active-Lease Journal evidence from the global Recovery list', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    const start = source.indexOf('function inspectTradeRecoveryState');
    const end = source.indexOf('function acknowledgeTradeRecoveryFromUi', start);
    const inspectRecovery = source.slice(start, end);

    expect(inspectRecovery).toContain('partitionTradeRecoveryReviews(journalReviews, leaseState)');
    expect(inspectRecovery).toContain('journalReviews: partitioned.reviews');
    expect(inspectRecovery).toContain('const reviews = [...partitioned.reviews, leaseReview]');
    expect(inspectRecovery).toContain('inFlightReviews: partitioned.inFlightReviews');
  });

  it('runs Scheduler recovery and authorization preflight inside the tick lock', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    const start = source.indexOf('async function tickTradeScheduler');
    const end = source.indexOf('function tradeDiagnosticsFilename', start);
    const tick = source.slice(start, end);
    const lock = tick.indexOf('tradeSchedulerTickLock.run(async () => {');
    const snapshot = tick.indexOf('const snapshot = tradeJobStore.read()', lock);
    const recovery = tick.indexOf('const recovery = inspectTradeRecoveryState()', snapshot);
    const authorization = tick.indexOf('inspectTradeScheduleAuthorization', recovery);
    const scheduler = tick.indexOf('await tradeScheduler.tick()', authorization);
    const lockEnd = tick.indexOf('\n      });', scheduler);
    const relocks = [...tick.matchAll(/disableGuardedTradeScheduling\(/g)].map((match) => match.index);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(snapshot).toBeGreaterThan(lock);
    expect(recovery).toBeGreaterThan(snapshot);
    expect(authorization).toBeGreaterThan(recovery);
    expect(scheduler).toBeGreaterThan(authorization);
    expect(lockEnd).toBeGreaterThan(scheduler);
    expect(relocks.length).toBeGreaterThan(0);
    expect(relocks.every((index) => index > lock && index < lockEnd)).toBe(true);
  });

  it('rechecks global recovery after the manual Listing Lease is acquired', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    const start = source.indexOf('async function executePreparedTradeListing');
    const end = source.indexOf('async function executeManualTradeBuy', start);
    const executeListing = source.slice(start, end);
    const firstRecovery = executeListing.indexOf('const recovery = inspectTradeRecoveryState()');
    const coordinator = executeListing.indexOf('tradeOperationCoordinator.acquire', firstRecovery);
    const lease = executeListing.indexOf('tradeRunLease.acquire', coordinator);
    const recoveryAfterLease = executeListing.indexOf('const recoveryAfterLease = inspectTradeRecoveryState()', lease);
    const mutationState = executeListing.indexOf('state.tradeListingRunning = true', recoveryAfterLease);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(firstRecovery).toBeGreaterThanOrEqual(0);
    expect(coordinator).toBeGreaterThan(firstRecovery);
    expect(lease).toBeGreaterThan(coordinator);
    expect(recoveryAfterLease).toBeGreaterThan(lease);
    expect(mutationState).toBeGreaterThan(recoveryAfterLease);
  });
});
