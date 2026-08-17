import { describe, expect, it, vi } from 'vitest';
import { createInventorySnapshot, createItemSnapshot } from '../../src/domain/contracts.js';
import { createInventoryLedgerCoordinator } from '../../src/inventory/ledger-coordinator.js';

function player(id, overrides = {}) {
  return { id, definitionId: 1000 + id, type: 'player', rating: 84, rareflag: 1, ...overrides };
}

function snapshot(players = [], piles = {}) {
  return createInventorySnapshot({ piles: { club: players, ...piles }, capacities: { storage: { max: 100 } } });
}

function coordinatorOptions(overrides = {}) {
  return {
    readSnapshot: vi.fn(async () => snapshot([player(1)])),
    readReadiness: vi.fn(async () => ({ detected: false, ready: true, fullyValidated: true, state: 'not-detected' })),
    snapshotItem: createItemSnapshot,
    ...overrides,
  };
}

describe('Inventory Ledger coordinator', () => {
  it('supports original/no FSU and ready FSU local snapshots', async () => {
    const original = createInventoryLedgerCoordinator(coordinatorOptions());
    await expect(original.initialize()).resolves.toMatchObject({ ok: true, summary: { source: 'ea-local-repository' } });

    const ready = createInventoryLedgerCoordinator(coordinatorOptions({
      readReadiness: async () => ({ detected: true, ready: true, fullyValidated: true, state: 'ready', cacheStatus: 'finalizing' }),
    }));
    await expect(ready.initialize()).resolves.toMatchObject({ ok: true, summary: { source: 'fsu-ready' } });
  });

  it('rejects loading/not-ready FSU inventory before reading a snapshot', async () => {
    const options = coordinatorOptions({
      readReadiness: async () => ({ detected: true, ready: false, fullyValidated: false, state: 'loading' }),
    });
    const coordinator = createInventoryLedgerCoordinator(options);

    await expect(coordinator.initialize()).resolves.toMatchObject({ ok: false, reason: 'inventory source is loading' });
    expect(options.readSnapshot).not.toHaveBeenCalled();
  });

  it('accepts provisional cache and targeted-validates selected Club refs', async () => {
    const fresh = player(1);
    const validateClubPlayers = vi.fn(async () => ({ ok: true, items: [fresh], missing: [], elapsed: 12 }));
    const coordinator = createInventoryLedgerCoordinator(coordinatorOptions({
      readReadiness: async () => ({ detected: true, ready: true, fullyValidated: false, state: 'provisional', cacheStatus: 'validating' }),
      validateClubPlayers,
    }));
    await coordinator.initialize();

    await expect(coordinator.validateBeforeSubmit([{ id: 1, definitionId: 1001, pile: 'club' }]))
      .resolves.toMatchObject({ ok: true, targeted: true, refreshedItems: [fresh] });
    expect(validateClubPlayers).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing', { ok: false, items: [], missing: [{ id: 1 }], reason: 'missing Club player' }],
    ['changed', { ok: true, items: [player(1, { leagueId: 99 })], missing: [] }],
  ])('blocks provisional submission when targeted validation is %s', async (_name, validationResult) => {
    const coordinator = createInventoryLedgerCoordinator(coordinatorOptions({
      readReadiness: async () => ({ detected: true, ready: true, fullyValidated: false, state: 'provisional' }),
      validateClubPlayers: async () => validationResult,
    }));
    await coordinator.initialize();

    const result = await coordinator.validateBeforeSubmit([{ id: 1, definitionId: 1001, pile: 'club' }]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missing Club player|changed before submit/);
  });

  it('reconciles immediately after ambiguous mutations without applying their guessed delta', async () => {
    const current = snapshot([player(1)], { unassigned: [player(2)] });
    const readSnapshot = vi.fn(async () => current);
    const coordinator = createInventoryLedgerCoordinator(coordinatorOptions({ readSnapshot }));
    await coordinator.initialize();

    const result = await coordinator.recordPackReceipt({
      status: 'opened',
      openedItems: [player(2)],
      pendingItemRefs: [{ id: 2, definitionId: 1002, pile: 'unassigned' }],
    });

    expect(result).toMatchObject({ delta: { status: 'ambiguous' }, applied: { applied: false }, reconciliation: { ok: true } });
    expect(coordinator.getLedger().summary()).toMatchObject({ itemCount: 2, needsReconciliation: false });
    expect(readSnapshot).toHaveBeenCalledTimes(2);
  });

  it('reconciles every ten confirmed primary submissions', async () => {
    let ids = Array.from({ length: 10 }, (_, index) => index + 1);
    const readSnapshot = vi.fn(async () => snapshot(ids.map((id) => player(id))));
    const coordinator = createInventoryLedgerCoordinator(coordinatorOptions({ readSnapshot }));
    await coordinator.initialize();

    for (let id = 1; id <= 10; id++) {
      ids = ids.filter((value) => value !== id);
      const result = await coordinator.recordSubmission({
        status: 'submitted',
        submitted: true,
        consumedItemRefs: [{ id, definitionId: 1000 + id, pile: 'club' }],
      }, { primary: true });
      expect(result.applied.applied).toBe(true);
      expect(result.reconciliation === null, `submission ${id}`).toBe(id !== 10);
    }

    expect(readSnapshot).toHaveBeenCalledTimes(2);
    expect(coordinator.diagnostics()).toMatchObject({ primarySubmissions: 10, reconcileEvery: 10 });
  });

  it('bounds diagnostics and never stores full card objects', async () => {
    const coordinator = createInventoryLedgerCoordinator(coordinatorOptions());
    await coordinator.initialize();
    for (let index = 0; index < 110; index++) {
      await coordinator.recordCapacities({ storage: { used: index % 100, max: 100 } });
    }
    const diagnostics = coordinator.diagnostics();

    expect(diagnostics.events).toHaveLength(100);
    expect(JSON.stringify(diagnostics.events)).not.toContain('definitionId');
    expect(JSON.stringify(diagnostics.events).length).toBeLessThan(30000);
  });
});
