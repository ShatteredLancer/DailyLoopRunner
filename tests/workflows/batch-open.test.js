import { describe, expect, it, vi } from 'vitest';
import { runBatchOpenWorkflow } from '../../src/workflows/batch-open.js';

function receipt(id, items = []) {
  return { status: 'opened', packRef: { id }, openedItems: items };
}

describe('runBatchOpenWorkflow', () => {
  it('opens requested quantities in entry order and resolves a fresh pack every time', async () => {
    let instance = 0;
    const resolvePack = vi.fn(async (entry) => ({ id: entry.packId, instance: ++instance }));
    const openPack = vi.fn(async ({ pack }) => receipt(pack.id, [{ id: pack.instance, type: 'player' }]));
    const result = await runBatchOpenWorkflow({
      plan: { entries: [
        { packId: 1, packName: 'One', quantity: 2 },
        { packId: 2, packName: 'Two', quantity: 1 },
      ] },
      resolvePack,
      openPack,
    });
    expect(result).toMatchObject({ status: 'completed', requestedPacks: 3, packsOpened: 3, skippedPacks: 0 });
    expect(resolvePack).toHaveBeenCalledTimes(3);
    expect(openPack.mock.calls.map(([call]) => call.pack.instance)).toEqual([1, 2, 3]);
    expect(openPack.mock.calls.map(([call]) => call.entry.packId)).toEqual([1, 1, 2]);
    expect(result.openedItems.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('skips the unavailable remainder while preserving later remembered entries', async () => {
    const resolvePack = vi.fn(async (entry) => entry.packId === 2 ? { id: 2 } : null);
    const result = await runBatchOpenWorkflow({
      plan: { entries: [
        { packId: 1, packName: 'Unavailable', quantity: 3 },
        { packId: 2, packName: 'Available', quantity: 1 },
      ] },
      resolvePack,
      openPack: async ({ pack }) => receipt(pack.id),
    });
    expect(result).toMatchObject({ status: 'completed', packsOpened: 1, skippedPacks: 3 });
    expect(result.entries).toEqual([
      expect.objectContaining({ packId: 1, opened: 0, skipped: 3, reason: 'matching pack is unavailable' }),
      expect.objectContaining({ packId: 2, opened: 1, skipped: 0 }),
    ]);
  });

  it('stops before the next pack without opening further entries', async () => {
    let stopping = false;
    const openPack = vi.fn(async ({ pack }) => {
      stopping = true;
      return receipt(pack.id);
    });
    const result = await runBatchOpenWorkflow({
      plan: { entries: [
        { packId: 1, packName: 'One', quantity: 3 },
        { packId: 2, packName: 'Two', quantity: 2 },
      ] },
      resolvePack: async () => ({ id: 1 }),
      openPack,
      shouldStop: () => stopping,
    });
    expect(result).toMatchObject({ status: 'stopped', requestedPacks: 5, packsOpened: 1, skippedPacks: 4 });
    expect(openPack).toHaveBeenCalledOnce();
  });

  it('blocks later opens when the shared open or cleanup path fails', async () => {
    const result = await runBatchOpenWorkflow({
      plan: { entries: [
        { packId: 1, packName: 'One', quantity: 3 },
        { packId: 2, packName: 'Two', quantity: 2 },
      ] },
      resolvePack: async () => ({ id: 1 }),
      openPack: async () => { throw new Error('Unassigned cleanup failed'); },
    });
    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'Unassigned cleanup failed',
      packsOpened: 0,
      requestedPacks: 5,
      skippedPacks: 5,
    });
  });

  it('counts an opened pack and stops before the next one when Unassigned is preserved', async () => {
    const openPack = vi.fn(async ({ pack }) => ({
      ...receipt(pack.id, [{ id: 84, type: 'player', rating: 84 }]),
      details: {
        cleanupStatus: 'preserved',
        cleanupReason: 'storage capacity 0/3',
        blockedDestination: 'storage',
        blockedFree: 0,
        blockedRequired: 3,
      },
    }));
    const result = await runBatchOpenWorkflow({
      plan: { entries: [{ packId: 1039, packName: '4x 84+', quantity: 2 }] },
      resolvePack: async () => ({ id: 1039 }),
      openPack,
    });
    expect(result).toMatchObject({
      status: 'preserved',
      reason: 'storage capacity 0/3',
      requestedPacks: 2,
      packsOpened: 1,
      skippedPacks: 1,
    });
    expect(result.openedItems).toEqual([{ id: 84, type: 'player', rating: 84 }]);
    expect(openPack).toHaveBeenCalledOnce();
  });

  it('does not open another pack when existing Unassigned is already preserved at preflight', async () => {
    const openPack = vi.fn();
    const resolvePack = vi.fn();
    const result = await runBatchOpenWorkflow({
      plan: { entries: [{ packId: 1039, packName: '4x 84+', quantity: 2 }] },
      beforeStart: async () => ({ status: 'preserved', reason: 'storage capacity 0/3' }),
      resolvePack,
      openPack,
    });
    expect(result).toMatchObject({
      status: 'preserved',
      reason: 'storage capacity 0/3',
      requestedPacks: 2,
      packsOpened: 0,
      skippedPacks: 2,
    });
    expect(resolvePack).not.toHaveBeenCalled();
    expect(openPack).not.toHaveBeenCalled();
  });
});
