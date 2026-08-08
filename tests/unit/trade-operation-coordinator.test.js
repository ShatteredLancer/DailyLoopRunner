import { describe, expect, it } from 'vitest';
import { createOperationCoordinator } from '../../src/trade/operation-coordinator.js';

describe('Trade Operation Coordinator', () => {
  it('serializes write operations and releases only the current operation', () => {
    const coordinator = createOperationCoordinator({ now: () => 1000 });
    const acquired = coordinator.acquire({ id: 'trade-1', type: 'trade-listing', ownerId: 'tab-a' });
    expect(acquired).toMatchObject({ acquired: true, operation: { id: 'trade-1', type: 'trade-listing', startedAt: 1000 } });
    expect(coordinator.acquire({ id: 'loop-1', type: 'loop' })).toMatchObject({ acquired: false, reason: 'operation-active' });
    expect(coordinator.release('wrong')).toBe(false);
    expect(coordinator.release('trade-1')).toBe(true);
    expect(coordinator.availability('loop')).toMatchObject({ allowed: true });
  });

  it('honors legacy Runner activity without owning its mutable state', () => {
    let running = true;
    const coordinator = createOperationCoordinator({
      externalBusy: () => running ? { busy: true, type: 'loop', reason: 'runner-operation-active' } : { busy: false },
    });
    expect(coordinator.availability('trade-listing')).toMatchObject({ allowed: false, reason: 'runner-operation-active' });
    expect(coordinator.acquire({ id: 'trade-1', type: 'trade-listing' })).toMatchObject({ acquired: false, reason: 'runner-operation-active' });
    running = false;
    expect(coordinator.acquire({ id: 'trade-1', type: 'trade-listing' })).toMatchObject({ acquired: true });
  });
});
