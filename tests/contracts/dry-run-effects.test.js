import { describe, expect, it, vi } from 'vitest';
import { createInventorySnapshot, createItemSnapshot } from '../../src/domain/contracts.js';
import { openPackTransaction } from '../../src/pack/open-transaction.js';
import { submitSbcAttempt } from '../../src/sbc/submit-attempt.js';
import { resolveUnassigned } from '../../src/unassigned/resolve.js';

function unassignedSnapshot(items, storageFree = 100) {
  return createInventorySnapshot({
    capturedAt: '2026-01-01T00:00:00.000Z',
    piles: { unassigned: items },
    capacities: {
      storage: { used: 100 - storageFree, max: 100 },
      transfer: { used: 0, max: 100 },
    },
  });
}

describe('dry-run effect contracts', () => {
  it('reads a matching pack but never resolves Unassigned, opens it, or handles rewards', async () => {
    const preOpenResolver = vi.fn(async () => ({ status: 'resolved' }));
    const openTransport = vi.fn(async () => ({ success: true, items: [{ id: 1 }] }));
    const normalizeItems = vi.fn(async (items) => items);
    const openedItemPolicy = vi.fn(async () => ({}));

    const receipt = await openPackTransaction({
      dryRun: true,
      preOpenResolver,
      packSelector: vi.fn(async () => ({ id: 105, name: 'Bronze Players Pack' })),
      openTransport,
      normalizeItems,
      openedItemPolicy,
    });

    expect(receipt).toMatchObject({
      status: 'planned',
      packRef: { id: 105, name: 'Bronze Players Pack' },
      attempts: 0,
      reason: 'dry run would open pack',
    });
    expect(preOpenResolver).not.toHaveBeenCalled();
    expect(openTransport).not.toHaveBeenCalled();
    expect(normalizeItems).not.toHaveBeenCalled();
    expect(openedItemPolicy).not.toHaveBeenCalled();
  });

  it('plans the SBC after pre-save validation without saving, reloading, or submitting', async () => {
    const squadProvider = vi.fn(async () => ({ ok: true, players: [{ id: 10 }], itemRefs: [{ id: 10, definitionId: 20, pile: 'club' }] }));
    const preSaveValidator = vi.fn(async () => {});
    const sideEffects = {
      prepareRuntimeAccess: vi.fn(async () => ({ ok: true })),
      saveSquad: vi.fn(async () => {}),
      reloadSquad: vi.fn(async () => {}),
      readSavedPlayers: vi.fn(async () => [{ id: 10 }]),
      postSaveValidator: vi.fn(async () => {}),
      isSubmitReady: vi.fn(async () => true),
      submitTransport: vi.fn(async () => ({ submitted: true })),
      afterSubmit: vi.fn(async () => {}),
      releaseRuntimeAccess: vi.fn(async () => {}),
    };

    const result = await submitSbcAttempt({
      dryRun: true,
      challengeProvider: async () => ({ set: { id: 1 }, challenge: { id: 2 } }),
      squadProvider,
      preSaveValidators: [preSaveValidator],
      prepareRuntimeAccess: sideEffects.prepareRuntimeAccess,
      saveSquad: sideEffects.saveSquad,
      reloadSquad: sideEffects.reloadSquad,
      readSavedPlayers: sideEffects.readSavedPlayers,
      postSaveValidators: [sideEffects.postSaveValidator],
      isSubmitReady: sideEffects.isSubmitReady,
      submitTransport: sideEffects.submitTransport,
      afterSubmit: sideEffects.afterSubmit,
      releaseRuntimeAccess: sideEffects.releaseRuntimeAccess,
    });

    expect(result).toMatchObject({ status: 'planned', submitted: false });
    expect(squadProvider).toHaveBeenCalledOnce();
    expect(preSaveValidator).toHaveBeenCalledOnce();
    for (const effect of Object.values(sideEffects)) expect(effect).not.toHaveBeenCalled();
  });

  it('plans Unassigned routing without moving items or invoking overflow recovery', async () => {
    const executeAction = vi.fn(async () => {});
    const overflowResolver = vi.fn(async () => ({ status: 'progress' }));
    const item = createItemSnapshot({ id: 1, definitionId: 101, type: 'player', rating: 64 }, 'unassigned');

    const result = await resolveUnassigned({
      dryRun: true,
      getSnapshot: async () => unassignedSnapshot([item]),
      executeAction,
      overflowResolvers: [{ id: 'would-submit-recovery', resolve: overflowResolver }],
    });

    expect(result).toMatchObject({ status: 'planned', iterations: 1 });
    expect(result.reason).toMatch(/^dry run would /);
    expect(executeAction).not.toHaveBeenCalled();
    expect(overflowResolver).not.toHaveBeenCalled();
  });

  it('does not invoke overflow recovery when a dry-run plan is capacity-blocked', async () => {
    const overflowResolver = vi.fn(async () => ({ status: 'progress' }));
    const duplicate = createItemSnapshot({
      id: 2,
      definitionId: 102,
      type: 'player',
      rating: 64,
      duplicate: true,
      duplicateId: 1002,
    }, 'unassigned');

    const result = await resolveUnassigned({
      dryRun: true,
      getSnapshot: async () => unassignedSnapshot([duplicate], 0),
      executeAction: vi.fn(async () => {}),
      overflowResolvers: [{ id: 'would-submit-recovery', resolve: overflowResolver }],
    });

    expect(result).toMatchObject({ status: 'planned' });
    expect(result.reason).toContain('dry run would preserve blocked Unassigned recovery');
    expect(overflowResolver).not.toHaveBeenCalled();
  });
});
