import { describe, expect, it, vi } from 'vitest';
import { createInventorySnapshot, createItemSnapshot } from '../../src/domain/contracts.js';
import { resolveUnassigned } from '../../src/unassigned/resolve.js';

function duplicate(id, options = {}) {
  return createItemSnapshot({
    id,
    definitionId: id + 100,
    type: 'player',
    rating: 64,
    duplicate: true,
    duplicateId: id + 1000,
    tradeable: options.tradeable === true,
  }, 'unassigned');
}

function stateSnapshot(items, storageFree = 0) {
  return createInventorySnapshot({
    capturedAt: '2026-01-01T00:00:00.000Z',
    piles: { unassigned: items },
    capacities: { storage: { used: 100 - storageFree, max: 100 }, transfer: { used: 0, max: 100 } },
  });
}

describe('resolveUnassigned', () => {
  it('executes planned actions until empty', async () => {
    let items = [createItemSnapshot({ id: 1, definitionId: 101, type: 'player', rating: 64 }, 'unassigned')];
    const executeAction = vi.fn(async () => { items = []; });
    const result = await resolveUnassigned({
      getSnapshot: async () => stateSnapshot(items, 100),
      executeAction,
    });
    expect(result.status).toBe('resolved');
    expect(executeAction).toHaveBeenCalledOnce();
  });

  it('waits for delayed repository progress after a successful action', async () => {
    const original = [createItemSnapshot({ id: 1, definitionId: 101, type: 'player', rating: 64 }, 'unassigned')];
    let readsAfterAction = 0;
    let actionExecuted = false;
    const onActionProgressRetry = vi.fn(async () => {});
    const result = await resolveUnassigned({
      getSnapshot: async () => {
        if (!actionExecuted) return stateSnapshot(original, 100);
        readsAfterAction++;
        return stateSnapshot(readsAfterAction < 3 ? original : [], 100);
      },
      executeAction: async () => { actionExecuted = true; },
      actionProgressAttempts: 3,
      onActionProgressRetry,
    });

    expect(result.status).toBe('resolved');
    expect(onActionProgressRetry).toHaveBeenCalledTimes(2);
  });

  it('runs ordered overflow resolvers and verifies actual progress', async () => {
    let items = [duplicate(1)];
    const first = vi.fn(async () => ({ status: 'unavailable' }));
    const second = vi.fn(async () => { items = []; return { status: 'progress' }; });
    const result = await resolveUnassigned({
      getSnapshot: async () => stateSnapshot(items, 0),
      executeAction: async () => {},
      overflowResolvers: [
        { id: 'first', resolve: first },
        { id: 'second', resolve: second },
      ],
    });
    expect(result.status).toBe('resolved');
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('blocks a resolver that claims progress without changing Unassigned', async () => {
    const items = [duplicate(1)];
    const result = await resolveUnassigned({
      getSnapshot: async () => stateSnapshot(items, 0),
      executeAction: async () => {},
      overflowResolvers: [{ id: 'false-progress', resolve: async () => ({ status: 'progress' }) }],
    });
    expect(result.status).toBe('blocked');
    expect(result.resolverResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'false-progress', reason: 'resolver reported progress without changing Unassigned' }),
    ]));
  });

  it('supports preserve policy without hiding the capacity reason', async () => {
    const result = await resolveUnassigned({
      getSnapshot: async () => stateSnapshot([duplicate(1)], 0),
      executeAction: async () => {},
      blockedPolicy: 'preserve',
    });
    expect(result).toMatchObject({ status: 'preserved', reason: 'storage capacity 0/1' });
  });
});
