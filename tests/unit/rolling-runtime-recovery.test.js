import { describe, expect, it, vi } from 'vitest';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';
import {
  createDuplicateSubmissionManifest,
  createDuplicateMaterializationTransaction,
  materializeDuplicateTransaction,
  transitionDuplicateMaterializationTransaction,
  validateDuplicateSubmissionManifest,
} from '../../src/inventory/duplicate-materialization-transaction.js';
import { submitSbcAttempt } from '../../src/sbc/submit-attempt.js';
import { ROLLING_DUPLICATE_TRANSACTION_KEY } from '../../src/config/runtime.js';

function materializedDuplicateTransaction() {
  const source = {
    id: 101,
    definitionId: 7001,
    rating: 95,
    rareflag: 64,
    pile: 'unassigned',
  };
  const counterpart = {
    id: 102,
    definitionId: 7001,
    rating: 95,
    rareflag: 64,
    pile: 'club',
  };
  const consume = { ...source, id: 103, pile: 'club' };
  const displaced = { ...counterpart, pile: 'unassigned' };
  const planned = createDuplicateMaterializationTransaction({
    transactionId: 'tx-persist-recovery',
    challengeRef: { setId: 500, challengeId: 501 },
    beforeInventoryVersion: 8,
    pairs: [{ sourceSignal: source, protectedCounterpart: counterpart }],
  });
  const result = materializeDuplicateTransaction(planned, {
    replacements: [{ signalId: 101, targetId: 102, newItemId: 103 }],
    afterInventoryVersion: 9,
    resolveItem: (id, pile) => [consume, displaced]
      .find((item) => item.id === id && item.pile === pile) || null,
  });
  return { transaction: result.transaction, consume, displaced };
}

describe('Rolling runtime recovery helpers', () => {
  it('persists recovery-required before returning an identity validation block', async () => {
    const { transaction, consume, displaced } = materializedDuplicateTransaction();
    const { api, userscriptValues } = await loadUserscript({
      userscriptStorage: { [ROLLING_DUPLICATE_TRANSACTION_KEY]: transaction },
    });
    const runtime = {
      duplicateMaterializationTransaction: transaction,
      coordinator: {
        getLedger: () => ({
          summary: () => ({ inventoryVersion: 10 }),
          resolveItem: ({ id }) => [consume, displaced].find((item) => item.id === id) || null,
        }),
      },
    };

    const result = api.rollingDuplicateTransactionPlanningContext(
      runtime,
      { id: 500 },
      { id: 501 },
    );

    expect(result).toMatchObject({
      ok: false,
      reasonCode: 'DUPLICATE_MATERIALIZATION_IDENTITY_CHANGED',
    });
    expect(runtime.duplicateMaterializationTransaction).toMatchObject({
      status: 'recovery-required',
    });
    expect(userscriptValues.get(ROLLING_DUPLICATE_TRANSACTION_KEY)).toMatchObject({
      status: 'recovery-required',
    });
    expect(api.readPersistedRollingDuplicateTransaction()).toMatchObject({
      status: 'recovery-required',
    });
  });

  it('compensates a materialized duplicate transaction when submission blocks', async () => {
    const { api } = await loadUserscript();
    const runtime = { duplicateMaterializationTransaction: { status: 'materialized' } };
    const finalize = vi.fn(async () => ({ ok: true }));

    const result = await api.runRollingDuplicateSubmissionAttempt(
      runtime,
      'Rolling main',
      async () => ({ status: 'blocked', submitted: false, reason: 'saved squad changed' }),
      { finalize },
    );

    expect(result).toMatchObject({ status: 'blocked', submitted: false });
    expect(finalize).toHaveBeenCalledWith(
      runtime,
      'Rolling main pre-submit compensation',
      { submissionConfirmed: false },
    );
  });

  it('clears an untouched planned journal immediately when swap preparation blocks', async () => {
    const { api } = await loadUserscript();
    const runtime = { duplicateMaterializationTransaction: { status: 'planned' } };
    const finalize = vi.fn();
    const recover = vi.fn(async () => {
      runtime.duplicateMaterializationTransaction = null;
      return { status: 'ready' };
    });

    const result = await api.runRollingDuplicateSubmissionAttempt(
      runtime,
      'Rolling swap',
      async () => ({ status: 'blocked', submitted: false, reason: 'swap response incomplete' }),
      { finalize, recover },
    );

    expect(result).toMatchObject({ status: 'blocked', reason: 'swap response incomplete' });
    expect(recover).toHaveBeenCalledWith(runtime, 'Rolling swap pre-submit compensation');
    expect(finalize).not.toHaveBeenCalled();
  });

  it('surfaces ambiguous immediate recovery after an interrupted unrecorded swap', async () => {
    const { api } = await loadUserscript();
    const runtime = { duplicateMaterializationTransaction: { status: 'recovery-required' } };
    const recover = vi.fn(async () => ({
      status: 'blocked',
      reason: 'protected counterpart restored but consume identity is unknown',
      reasonCode: 'DUPLICATE_SUBMISSION_OUTCOME_AMBIGUOUS',
    }));

    const result = await api.runRollingDuplicateSubmissionAttempt(
      runtime,
      'Rolling swap',
      async () => ({ status: 'blocked', submitted: false, reason: 'reconcile failed' }),
      { recover },
    );

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'DUPLICATE_SUBMISSION_OUTCOME_AMBIGUOUS',
      details: { originalFailure: { reason: 'reconcile failed' } },
    });
  });

  it('compensates a materialized duplicate transaction when validation throws', async () => {
    const { api } = await loadUserscript();
    const runtime = { duplicateMaterializationTransaction: { status: 'materialized' } };
    const finalize = vi.fn(async () => ({ ok: true }));

    await expect(api.runRollingDuplicateSubmissionAttempt(
      runtime,
      'Rolling main',
      async () => { throw new Error('final squad identity drift'); },
      { finalize },
    )).rejects.toThrow('final squad identity drift');
    expect(finalize).toHaveBeenCalledOnce();
  });

  it('rolls back and preserves the transport timeout when A prime is still recoverable', async () => {
    const { api } = await loadUserscript();
    const runtime = { duplicateMaterializationTransaction: { status: 'materialized' } };
    const finalize = vi.fn(async () => {
      runtime.duplicateMaterializationTransaction = { status: 'completed' };
      return { ok: true };
    });

    await expect(api.runRollingDuplicateSubmissionAttempt(
      runtime,
      'Rolling timeout',
      async () => { throw new Error('transport timeout'); },
      { finalize },
    )).rejects.toThrow('transport timeout');
    expect(finalize).toHaveBeenCalledOnce();
    expect(runtime.duplicateMaterializationTransaction.status).toBe('completed');
  });

  it('reports an ambiguous transport timeout when A prime disappeared', async () => {
    const { api } = await loadUserscript();
    const runtime = { duplicateMaterializationTransaction: { status: 'materialized' } };
    const finalize = vi.fn(async () => ({
      ok: false,
      reason: 'materialized consume item disappeared before outcome confirmation',
      reasonCode: 'DUPLICATE_SUBMISSION_OUTCOME_AMBIGUOUS',
    }));

    let caught = null;
    try {
      await api.runRollingDuplicateSubmissionAttempt(
        runtime,
        'Rolling timeout',
        async () => { throw new Error('transport timeout'); },
        { finalize },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ reasonCode: 'DUPLICATE_SUBMISSION_OUTCOME_AMBIGUOUS' });
    expect(caught.message).toContain('transport timeout');
    expect(caught.message).toContain('materialized consume item disappeared');
  });

  it('preserves a materialized transaction when submission requests a replan', async () => {
    const { api } = await loadUserscript();
    const runtime = { duplicateMaterializationTransaction: { status: 'materialized' } };
    const finalize = vi.fn(async () => ({ ok: true }));

    const result = await api.runRollingDuplicateSubmissionAttempt(
      runtime,
      'Rolling main',
      async () => ({ status: 'replan', submitted: false }),
      { finalize },
    );

    expect(result).toMatchObject({ status: 'replan', submitted: false });
    expect(finalize).not.toHaveBeenCalled();
  });

  it('keeps duplicate and Active Squad replans inside one bounded transaction attempt', async () => {
    const { api } = await loadUserscript();
    const runtime = {};
    const attempt = vi.fn()
      .mockImplementationOnce(async () => {
        runtime.duplicateMaterializationTransaction = {
          status: 'materialized',
          transactionId: 'tx-local-replan',
        };
        return { status: 'replan', submitted: false, reasonCode: 'DUPLICATE_MATERIALIZED_REPLAN' };
      })
      .mockResolvedValueOnce({
        status: 'replan',
        submitted: false,
        reasonCode: 'ACTIVE_SQUAD_CONFLICT_REPLAN',
      })
      .mockImplementationOnce(async () => {
        runtime.duplicateMaterializationTransaction = { status: 'completed' };
        return { status: 'submitted', submitted: true };
      });
    const finalize = vi.fn();

    const result = await api.runBoundedRollingDuplicateTransactionReplans(
      runtime,
      'same Challenge',
      attempt,
      { maxReplans: 3, finalize },
    );

    expect(result).toMatchObject({ status: 'submitted', submitted: true });
    expect(attempt.mock.calls.map(([context]) => context.replan)).toEqual([0, 1, 2]);
    expect(finalize).not.toHaveBeenCalled();
  });

  it('rolls back when transaction-local replanning becomes infeasible', async () => {
    const { api } = await loadUserscript();
    const runtime = {};
    const attempt = vi.fn()
      .mockImplementationOnce(async () => {
        runtime.duplicateMaterializationTransaction = {
          status: 'materialized',
          transactionId: 'tx-shortage',
        };
        return { status: 'replan', submitted: false, reasonCode: 'DUPLICATE_MATERIALIZED_REPLAN' };
      })
      .mockResolvedValueOnce({
        status: 'blocked',
        submitted: false,
        reason: 'required material disappeared after swap',
        reasonCode: 'RECOVERY_MATERIAL_SHORTAGE',
      });
    const finalize = vi.fn(async () => {
      runtime.duplicateMaterializationTransaction = { status: 'completed' };
      return { ok: true };
    });

    const result = await api.runBoundedRollingDuplicateTransactionReplans(
      runtime,
      'same Challenge',
      attempt,
      { finalize },
    );

    expect(result).toMatchObject({
      status: 'blocked',
      submitted: false,
      reasonCode: 'RECOVERY_MATERIAL_SHORTAGE',
      details: { transactionReplanStopped: true, compensationSucceeded: true },
    });
    expect(finalize).toHaveBeenCalledWith(
      runtime,
      'same Challenge transaction replan compensation',
      { submissionConfirmed: false },
    );
  });

  it('does not capture an ordinary Active Squad replan without a duplicate transaction', async () => {
    const { api } = await loadUserscript();
    const attempt = vi.fn(async () => ({
      status: 'replan',
      submitted: false,
      reasonCode: 'ACTIVE_SQUAD_CONFLICT_REPLAN',
    }));
    const finalize = vi.fn();

    const result = await api.runBoundedRollingDuplicateTransactionReplans(
      {},
      'ordinary replan',
      attempt,
      { finalize },
    );

    expect(result).toMatchObject({ status: 'replan', reasonCode: 'ACTIVE_SQUAD_CONFLICT_REPLAN' });
    expect(attempt).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
  });

  it('fails closed and compensates when transaction-local replans exceed the limit', async () => {
    const { api } = await loadUserscript();
    const runtime = {
      duplicateMaterializationTransaction: { status: 'materialized', transactionId: 'tx-loop' },
    };
    const attempt = vi.fn(async () => ({ status: 'replan', submitted: false }));
    const finalize = vi.fn(async () => ({ ok: true }));

    const result = await api.runBoundedRollingDuplicateTransactionReplans(
      runtime,
      'bounded Challenge',
      attempt,
      { maxReplans: 2, finalize },
    );

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'DUPLICATE_TRANSACTION_REPLAN_LIMIT',
      details: { compensationSucceeded: true },
    });
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(finalize).toHaveBeenCalledOnce();
  });

  it('surfaces a failed compensation instead of the original submission block', async () => {
    const { api } = await loadUserscript();
    const runtime = { duplicateMaterializationTransaction: { status: 'materialized' } };
    const finalize = vi.fn(async () => ({
      ok: false,
      reason: 'materialized consume item disappeared',
      reasonCode: 'DUPLICATE_SUBMISSION_OUTCOME_AMBIGUOUS',
    }));

    const result = await api.runRollingDuplicateSubmissionAttempt(
      runtime,
      'Rolling main',
      async () => ({ status: 'blocked', submitted: false, reason: 'saved squad changed' }),
      { finalize },
    );

    expect(result).toMatchObject({
      status: 'blocked',
      submitted: false,
      reasonCode: 'DUPLICATE_SUBMISSION_OUTCOME_AMBIGUOUS',
      details: { originalFailure: { reason: 'saved squad changed' } },
    });
  });

  it('runs swap, local replan, all identity guards, transport, and B restoration in order', async () => {
    const { api } = await loadUserscript();
    const { transaction, consume, displaced } = materializedDuplicateTransaction();
    const ordinary = { id: 201, definitionId: 7201, rating: 84, pile: 'club' };
    const runtime = { duplicateMaterializationTransaction: null };
    const events = [];
    const attempt = vi.fn(async ({ replan }) => {
      if (replan === 0) {
        events.push('swap');
        runtime.duplicateMaterializationTransaction = transaction;
        return {
          status: 'replan',
          submitted: false,
          reasonCode: 'DUPLICATE_MATERIALIZED_REPLAN',
        };
      }
      events.push('replan');
      const players = [consume, ordinary];
      const created = createDuplicateSubmissionManifest({
        transaction: runtime.duplicateMaterializationTransaction,
        inventoryVersion: 9,
        players,
      });
      expect(created.ok).toBe(true);
      const validate = (phase, actual) => {
        events.push(phase);
        expect(validateDuplicateSubmissionManifest(created.manifest, actual, {
          inventoryVersion: 9,
        })).toMatchObject({ ok: true });
      };
      return submitSbcAttempt({
        label: 'duplicate identity transaction',
        challengeProvider: async () => ({ set: { id: 500 }, challenge: { id: 501 } }),
        squadProvider: async () => ({ ok: true, players, itemRefs: players }),
        preSaveValidators: [({ players: actual }) => validate('pre-save', actual)],
        saveSquad: async () => { events.push('save'); },
        readSavedPlayers: async () => players,
        postSaveValidators: [({ savedPlayers }) => validate('post-save', savedPlayers)],
        readFinalPlayers: async () => players,
        finalValidators: [({ finalPlayers }) => validate('final', finalPlayers)],
        submitTransport: async ({ finalPlayers }) => {
          validate('transport', finalPlayers);
          return { submitted: true };
        },
        afterSubmit: async () => {
          events.push('restore-b');
          displaced.pile = 'club';
          runtime.duplicateMaterializationTransaction = transitionDuplicateMaterializationTransaction(
            runtime.duplicateMaterializationTransaction,
            'completed',
          );
          return { ok: true };
        },
      });
    });

    const result = await api.runBoundedRollingDuplicateTransactionReplans(
      runtime,
      'same exact Challenge',
      attempt,
    );

    expect(result).toMatchObject({ status: 'submitted', submitted: true });
    expect(events).toEqual([
      'swap',
      'replan',
      'pre-save',
      'save',
      'post-save',
      'final',
      'transport',
      'restore-b',
    ]);
    expect(displaced.pile).toBe('club');
    expect(runtime.duplicateMaterializationTransaction.status).toBe('completed');
  });

  it('compensates and blocks when the materialized journal cannot be persisted', async () => {
    const { api } = await loadUserscript({
      gmSetValue: () => { throw new Error('journal quota exceeded'); },
    });
    const { transaction } = materializedDuplicateTransaction();
    const runtime = { duplicateMaterializationTransaction: transaction };
    const finalize = vi.fn(async () => ({ ok: true }));

    const result = await api.persistMaterializedRollingDuplicateTransaction(
      runtime,
      'Rolling persistence failure',
      { finalize },
    );

    expect(result).toMatchObject({
      ok: false,
      reasonCode: 'DUPLICATE_JOURNAL_WRITE_FAILED',
      details: { compensationSucceeded: true },
    });
    expect(finalize).toHaveBeenCalledWith(
      runtime,
      'Rolling persistence failure journal-write compensation',
      { submissionConfirmed: false },
    );
  });

  it('does not report a cleared journal when userscript deletion is unavailable', async () => {
    const { api, userscriptValues } = await loadUserscript({
      userscriptStorage: {
        [ROLLING_DUPLICATE_TRANSACTION_KEY]: { transactionId: 'tx-still-present', status: 'planned' },
      },
      gmDeleteValue: null,
    });

    expect(api.persistRollingDuplicateTransaction(null)).toBe(false);
    expect(userscriptValues.has(ROLLING_DUPLICATE_TRANSACTION_KEY)).toBe(true);
  });

  it('keeps recovery-required when physical restoration succeeds but journal clearing fails', async () => {
    const { transaction } = materializedDuplicateTransaction();
    const { api } = await loadUserscript({
      userscriptStorage: { [ROLLING_DUPLICATE_TRANSACTION_KEY]: transaction },
      gmDeleteValue: null,
    });
    const runtime = { duplicateMaterializationTransaction: transaction };

    const result = api.completeRollingDuplicateTransaction(runtime, transaction);

    expect(result).toMatchObject({
      ok: false,
      reasonCode: 'DUPLICATE_JOURNAL_CLEAR_FAILED',
      details: { physicalRestorationSucceeded: true },
    });
    expect(runtime.duplicateMaterializationTransaction).toMatchObject({
      status: 'recovery-required',
    });
  });

  it('compensates an unsupported Requirements recovery replan and stops', async () => {
    const { api } = await loadUserscript();
    const runtime = {};
    const submitAttempt = vi.fn(async () => {
      runtime.duplicateMaterializationTransaction = {
        status: 'materialized',
        transactionId: 'tx-requirements-unsupported',
      };
      return {
        status: 'replan',
        submitted: false,
        reasonCode: 'DUPLICATE_MATERIALIZED_REPLAN',
      };
    });
    const finalize = vi.fn(async () => {
      runtime.duplicateMaterializationTransaction = { status: 'completed' };
      return { ok: true };
    });

    const result = await api.submitRollingRequirementRecovery(
      { name: 'Rolling main' },
      runtime,
      { name: 'Requirements Recovery' },
      { submitAttempt, finalize },
    );

    expect(result).toMatchObject({
      status: 'blocked',
      submitted: false,
      reasonCode: 'DUPLICATE_REQUIREMENTS_REPLAN_UNSUPPORTED',
      details: { compensationSucceeded: true },
    });
    expect(submitAttempt).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledOnce();
  });

  it('does not enter the legacy 88 squad after the 89 transaction replan fails', async () => {
    const { api } = await loadUserscript();
    const contexts = [
      { targetRating: 89, model: { targetRating: 89 } },
      { targetRating: 88, model: { targetRating: 88 } },
    ];
    const plannedRatings = [];
    const runtime = {
      coordinator: { reconcile: vi.fn(async () => ({ ok: true })) },
    };
    const planSquad = vi.fn(async (_loopDef, _runtime, context) => {
      plannedRatings.push(context.targetRating);
      return {
        ok: true,
        plans: [{ selection: { selected: [] }, signalRefs: [] }],
        pileCounts: { storage: 11 },
        storageItemsConsumed: 11,
        details: { sourceOrder: ['storage'], maxClubPerSquad: 0 },
      };
    });
    const runReplans = vi.fn(async () => ({
      status: 'blocked',
      submitted: false,
      reason: '89 transaction-local replanning became infeasible',
      reasonCode: 'RECOVERY_MATERIAL_SHORTAGE',
      details: { compensationSucceeded: true },
    }));

    const result = await api.runRollingLegacyStorageSinkRecovery(
      { name: 'Rolling main', runtimeProtectionRating: 95 },
      runtime,
      { status: 'resolved', loop: { name: 'Legacy 95+ Pick', setId: 500 } },
      {
        selectPending: vi.fn(async () => ({ status: 'missing' })),
        refreshCaches: vi.fn(async () => {}),
        loadContexts: vi.fn(async () => ({
          status: 'ready',
          contexts,
          completedCount: 0,
        })),
        planSquad,
        validateHeadroom: vi.fn(() => ({ ok: true, projectedFree: 11, requiredFree: 1 })),
        runReplans,
        submitSquad: vi.fn(),
      },
    );

    expect(result).toMatchObject({
      status: 'blocked',
      submitted: false,
      reasonCode: 'RECOVERY_MATERIAL_SHORTAGE',
    });
    expect(plannedRatings).toEqual([89]);
    expect(runReplans).toHaveBeenCalledOnce();
  });

  it('refreshes Storage before a final fresh Unassigned read during protected routing', async () => {
    const { api } = await loadUserscript();
    const events = [];
    const refreshStorage = vi.fn(async () => { events.push('refresh-storage'); });
    const states = [
      { mergedCount: 2, mergedItemIds: [101, 102] },
      { mergedCount: 0, mergedItemIds: [] },
      { mergedCount: 2, mergedItemIds: [101, 102] },
    ];
    const invalidatePurchased = vi.fn(async () => {
      events.push('invalidate-unassigned');
      return { invalidated: true };
    });
    const refreshPurchased = vi.fn(async () => {
      events.push('refresh-unassigned');
      return { success: true, response: { items: [{ id: 101 }, { id: 102 }] } };
    });
    const readPurchasedState = vi.fn(() => states.shift());
    const refreshTransfer = vi.fn(async () => { events.push('refresh-transfer'); });

    const result = await api.refreshRollingProtectedStorageCaches({
      refreshStorage,
      invalidatePurchased,
      refreshPurchased,
      readPurchasedState,
      onStage: (stage) => { events.push(`stage-${stage}`); },
    });

    expect(result).toMatchObject({
      purchasedResult: { success: true },
      evidence: {
        beforeInvalidation: { mergedItemIds: [101, 102] },
        invalidation: { invalidated: true },
        afterInvalidation: { mergedItemIds: [] },
        response: {
          itemArrays: [{ source: 'response.items', count: 2 }],
        },
        afterRequest: { mergedItemIds: [101, 102] },
      },
    });
    expect(events).toEqual([
      'refresh-storage',
      'stage-storage',
      'invalidate-unassigned',
      'refresh-unassigned',
      'stage-unassigned',
    ]);
    expect(refreshStorage).toHaveBeenCalledOnce();
    expect(invalidatePurchased).toHaveBeenCalledOnce();
    expect(refreshPurchased).toHaveBeenCalledOnce();
    expect(readPurchasedState).toHaveBeenCalledTimes(3);
    expect(refreshTransfer).not.toHaveBeenCalled();
  });

  it('fails the protected Storage refresh before routing when fresh Unassigned evidence is unavailable', async () => {
    const { api } = await loadUserscript();
    const events = [];

    await expect(api.refreshRollingProtectedStorageCaches({
      refreshStorage: async () => { events.push('refresh-storage'); },
      invalidatePurchased: async () => {
        events.push('invalidate-unassigned');
        return { invalidated: true };
      },
      refreshPurchased: async () => {
        events.push('refresh-unassigned');
        throw new Error('Purchased request failed');
      },
      readPurchasedState: () => ({ mergedCount: 0, mergedItemIds: [] }),
      onStage: (stage) => { events.push(`stage-${stage}`); },
    })).rejects.toThrow('Purchased request failed');
    expect(events).toEqual([
      'refresh-storage',
      'stage-storage',
      'invalidate-unassigned',
      'refresh-unassigned',
    ]);
  });

  it('classifies an explicitly empty Purchased response as absent from the response', async () => {
    const { api } = await loadUserscript();
    const result = api.classifyRollingProtectedRefreshEvidence([
      { id: 101, definitionId: 1001, pile: 'unassigned' },
    ], {
      response: { itemArrays: [{ source: 'response.items', count: 0, items: [] }] },
      afterRequest: { mergedItemIds: [] },
    });

    expect(result).toEqual([expect.objectContaining({
      outcome: 'absent-from-response',
      responseHasExactId: false,
      repositoryHasExactId: false,
    })]);
  });

  it('distinguishes an EA response item that the Purchased repository did not materialize', async () => {
    const { api } = await loadUserscript();
    const ref = { id: 101, definitionId: 1001, pile: 'unassigned' };
    const evidence = {
      response: {
        itemArrays: [{
          source: 'response.items',
          count: 1,
          items: [{ id: 101, definitionId: 1001, rating: 95, pile: 'unassigned' }],
        }],
      },
      afterRequest: { mergedItemIds: [] },
    };

    expect(api.classifyRollingProtectedRefreshEvidence([ref], evidence)).toEqual([
      expect.objectContaining({
        outcome: 'response-not-materialized',
        responseHasExactId: true,
        repositoryHasExactId: false,
        sameDefinitionResponseIds: [101],
      }),
    ]);

    evidence.afterRequest.mergedItemIds = [101];
    expect(api.classifyRollingProtectedRefreshEvidence([ref], evidence)).toEqual([
      expect.objectContaining({
        outcome: 'verified',
        responseHasExactId: true,
        repositoryHasExactId: true,
      }),
    ]);
  });

  it('counts duplicate players from both selected arrays and selection objects', async () => {
    const duplicate = makePlayer({ id: 1, duplicate: true });
    const ordinary = makePlayer({ id: 2 });
    const { api } = await loadUserscript();

    expect(api.rollingDuplicatePlayerCount([duplicate, ordinary])).toBe(1);
    expect(api.rollingDuplicatePlayerCount({ selected: [duplicate, ordinary] })).toBe(1);
    expect(api.rollingDuplicatePlayerCount({
      selected: [ordinary],
      entries: [{ pileName: 'unassigned', signal: duplicate, item: ordinary }],
    })).toBe(1);
    expect(api.rollingDuplicatePlayerCount({ status: 'submitted' })).toBe(0);
  });

  it('does not treat configured Provisions reserve ratings as Rare Gold Pick triggers', async () => {
    const { api } = await loadUserscript();
    const permissiveRolling = {
      runtimeProvisionsMaxRating: 91,
      runtimePickOptions: { protectionRating: 97 },
    };
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 86, rating: 86, rareflag: 1, duplicate: true }), {})).toBe(true);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 87, rating: 87, rareflag: 1, duplicate: true }), permissiveRolling)).toBe(false);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 88, rating: 88, rareflag: 1, duplicate: true }), permissiveRolling)).toBe(false);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 89, rating: 89, rareflag: 1, duplicate: true }), permissiveRolling)).toBe(false);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 90, rating: 90, rareflag: 1, duplicate: true }), permissiveRolling)).toBe(false);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 91, rating: 91, rareflag: 1, duplicate: true }), permissiveRolling)).toBe(false);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 92, rating: 92, rareflag: 1, duplicate: true }), permissiveRolling)).toBe(true);
    expect(api.rollingOrdinaryGoldDuplicate(
      makePlayer({ id: 189, rating: 89, rareflag: 1, duplicate: true }),
      { runtimePickOptions: { protectionRating: 97 } },
    )).toBe(true);
    expect(api.rollingOrdinaryGoldDuplicate(
      makePlayer({ id: 190, rating: 90, rareflag: 1, duplicate: true }),
      { runtimeProvisionsMaxRating: 89, runtimePickOptions: { protectionRating: 97 } },
    )).toBe(true);
    expect(api.rollingOrdinaryGoldDuplicate(makePlayer({ id: 90, rating: 90, rareflag: 2, duplicate: true }), {})).toBe(false);
  });

  it('ignores unsupported Player Item subtype methods and reads event names only from EA rarity metadata', async () => {
    const ordinaryClubGold = makePlayer({
      id: 191,
      definitionId: 9191,
      rating: 77,
      rareflag: 0,
      name: 'Ordinary first-owner Gold',
    });
    ordinaryClubGold.isFOF = () => true;
    ordinaryClubGold.isTOTW = () => true;
    ordinaryClubGold.isTOTS = () => true;
    ordinaryClubGold.isFUTTIES = () => true;
    const actualFof = makePlayer({
      id: 192,
      definitionId: 9192,
      rating: 95,
      rareflag: 117,
      name: 'Actual event player',
      rarityName: 'Festival of Football',
    });
    const methodOnlySpecial = makePlayer({
      id: 196,
      definitionId: 9196,
      rating: 95,
      rareflag: 118,
      name: 'Method-only special',
    });
    methodOnlySpecial.isFOF = () => true;
    const repositoryFutties = makePlayer({
      id: 197,
      definitionId: 9197,
      rating: 96,
      rareflag: 120,
      name: 'Repository event player',
    });
    const { api } = await loadUserscript({
      club: [ordinaryClubGold, actualFof, methodOnlySpecial, repositoryFutties],
      rarities: { 120: { name: 'FUTTIES' } },
    });
    const loopDef = {
      name: 'Rolling Gold recovery',
      runtimeProtectionRating: 95,
    };
    const runtime = {
      primaryContext: { activeLoopDef: loopDef },
      coordinator: { getLedger: () => null },
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
    };

    expect([
      api.isTotwItem(ordinaryClubGold),
      api.isTotsItem(ordinaryClubGold),
      api.isFofItem(ordinaryClubGold),
      api.isFuttiesItem(ordinaryClubGold),
    ]).toEqual([false, false, false, false]);
    expect(api.isSbcSpecialItem(ordinaryClubGold)).toBe(false);
    expect(api.assertRollingRecoveryItems(loopDef, runtime, [ordinaryClubGold], {
      allowProvisionsReserve: true,
    })).toBe(true);
    expect(api.isFofItem(actualFof)).toBe(true);
    expect(api.isFofItem(methodOnlySpecial)).toBe(false);
    expect(api.isFuttiesItem(repositoryFutties)).toBe(true);
    expect(() => api.assertRollingRecoveryItems(loopDef, runtime, [actualFof], {
      allowProvisionsReserve: true,
    })).toThrow(/special/);
  });

  it('does not block Player Pick fodder when EA isSpecial contradicts explicit normal rarity', async () => {
    const common = makePlayer({ id: 193, definitionId: 9193, rating: 75, rareflag: 0 });
    const rare = makePlayer({ id: 194, definitionId: 9194, rating: 81, rareflag: 1 });
    common.isSpecial = () => true;
    rare.isSpecial = () => true;
    const actualSpecial = makePlayer({ id: 195, definitionId: 9195, rating: 88, rareflag: 97 });
    actualSpecial.isSpecial = () => false;
    const { api } = await loadUserscript();
    const pickDef = {
      name: 'Rare Gold Player Pick',
      blockSpecial: true,
      expectedPlayerCount: 2,
      requirements: [{ count: 2, tier: 'gold' }],
    };

    expect(api.inspectSbcItems(pickDef, [common, rare])).toMatchObject({
      specialCount: 0,
      blocked: [],
    });
    expect(api.inspectSbcItems(pickDef, [rare, actualSpecial])).toMatchObject({
      specialCount: 1,
      blocked: [expect.objectContaining({
        item: actualSpecial,
        reasons: expect.arrayContaining(['special-blocked']),
      })],
    });
  });

  it('detects a pending Player Pick from its exact live entity instead of the ledger snapshot', async () => {
    const livePick = makePlayer({ id: 501, definitionId: 9501 });
    livePick.isPlayerPickItem = () => true;
    const snapshot = { type: 'misc', id: 501, definitionId: 9501 };
    const { api } = await loadUserscript({ unassigned: [livePick] });

    expect(api.inspectRollingLiveUnassignedEntries([{ item: snapshot, pile: 'unassigned' }]))
      .toMatchObject({ ok: true, playerPickCount: 1, playerPickIds: [501] });
  });

  it('fails closed when a reconciled Unassigned snapshot has no exact live item', async () => {
    const { api } = await loadUserscript();

    expect(api.inspectRollingLiveUnassignedEntries([{
      item: { type: 'player', id: 502, definitionId: 9502 },
      pile: 'unassigned',
    }])).toMatchObject({
      ok: false,
      reasonCode: 'UNASSIGNED_RESUME_IDENTITY_CHANGED',
    });
  });

  it('refreshes pending Rolling refs from current Unassigned players only', async () => {
    const { api } = await loadUserscript();
    const runtime = {
      pendingUnassignedRefs: [{ id: 999, definitionId: 999, pile: 'unassigned' }],
      coordinator: {
        getLedger: () => ({
          classifiedEntries: () => [
            { item: { type: 'player', id: 601, definitionId: 9601 }, pile: 'unassigned' },
            { item: { type: 'player', id: 602, definitionId: 9602 }, pile: 'storage' },
            { item: { type: 'consumable', id: 603, definitionId: 9603 }, pile: 'unassigned' },
          ],
        }),
      },
    };

    expect(api.refreshRollingPendingUnassignedRefs(runtime)).toEqual([
      { id: 601, definitionId: 9601, pile: 'unassigned' },
    ]);
    expect(runtime.pendingUnassignedRefs).toEqual([
      { id: 601, definitionId: 9601, pile: 'unassigned' },
    ]);
  });

  it('preserves materialized primary duplicates while protected Storage routing is blocked', async () => {
    const primaryDuplicates = Array.from({ length: 7 }, (_, index) => makePlayer({
      id: 650 + index,
      definitionId: 9650 + index,
      rating: 85 + (index % 3),
      duplicate: true,
      duplicateId: 1650 + index,
    }));
    const protectedDuplicate = makePlayer({
      id: 699,
      definitionId: 9699,
      rating: 96,
      duplicate: true,
      duplicateId: 1699,
    });
    const runtime = { primaryDuplicateRefs: [] };
    const routing = {
      status: 'blocked',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      counts: { unresolved: 0 },
      reservedItems: primaryDuplicates,
      storageItems: [protectedDuplicate],
    };
    const { api } = await loadUserscript();

    expect(api.preserveRollingPrimaryDuplicateRefs(runtime, routing, { replace: true }))
      .toMatchObject({ captured: true, count: 7 });
    expect(runtime.primaryDuplicateRefs.map((ref) => ref.id))
      .toEqual(primaryDuplicates.map((item) => item.id));
    expect(runtime.primaryDuplicateRefs.map((ref) => ref.id)).not.toContain(protectedDuplicate.id);
  });

  it('marks live resumed duplicates resolved before protected Storage recovery', async () => {
    const primaryDuplicates = Array.from({ length: 5 }, (_, index) => makePlayer({
      id: 710 + index,
      definitionId: 9710 + index,
      rating: 85 + index,
      duplicate: true,
      duplicateId: 1710 + index,
    }));
    const storageDuplicates = Array.from({ length: 4 }, (_, index) => makePlayer({
      id: 720 + index,
      definitionId: 9720 + index,
      rating: 96 + index,
      duplicate: true,
      duplicateId: 1720 + index,
    }));
    const pendingRefs = [...primaryDuplicates, ...storageDuplicates]
      .map((item) => ({ id: item.id, definitionId: item.definitionId, pile: 'unassigned' }));
    const { api } = await loadUserscript();
    const routing = api.buildRollingResumedRouting({
      status: 'blocked',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      reservedItems: primaryDuplicates,
      storageItems: storageDuplicates,
      pendingItems: storageDuplicates,
      counts: {
        duplicates: 9,
        primaryDuplicates: 5,
        storageRequired: 4,
      },
    }, 9, pendingRefs);
    const runtime = { primaryDuplicateRefs: [] };

    expect(routing).toMatchObject({
      status: 'blocked',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      counts: { unresolved: 0, resumed: 9, pending: 9 },
    });
    expect(api.preserveRollingPrimaryDuplicateRefs(runtime, routing, { replace: true }))
      .toMatchObject({ captured: true, count: 5, recoveredFromBlockedStorage: true });
    expect(runtime.primaryDuplicateRefs.map((ref) => ref.id))
      .toEqual(primaryDuplicates.map((item) => item.id));
  });

  it('preserves the existing primary duplicate behavior for a ready route', async () => {
    const duplicate = makePlayer({
      id: 660,
      definitionId: 9660,
      rating: 86,
      duplicate: true,
      duplicateId: 1660,
    });
    const runtime = { primaryDuplicateRefs: [{ id: 999, definitionId: 9999, pile: 'unassigned' }] };
    const { api } = await loadUserscript();

    expect(api.preserveRollingPrimaryDuplicateRefs(runtime, {
      status: 'ready',
      reasonCode: null,
      counts: { unresolved: 0 },
      reservedItems: [duplicate],
      storageItems: [],
    }, { replace: true })).toMatchObject({ captured: true, count: 1 });
    expect(runtime.primaryDuplicateRefs).toMatchObject([{
      id: duplicate.id,
      definitionId: duplicate.definitionId,
      pile: 'unassigned',
    }]);
  });

  it('does not preserve primary refs from unresolved or unrelated blocked routing', async () => {
    const duplicate = makePlayer({
      id: 670,
      definitionId: 9670,
      rating: 88,
      duplicate: true,
      duplicateId: 1670,
    });
    const { api } = await loadUserscript();

    for (const routing of [
      {
        status: 'blocked',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
        counts: { unresolved: 1 },
        reservedItems: [duplicate],
      },
      {
        status: 'blocked',
        reasonCode: 'OPENED_DUPLICATE_NOT_MATERIALIZED',
        counts: { unresolved: 0 },
        reservedItems: [duplicate],
      },
    ]) {
      const runtime = { primaryDuplicateRefs: [] };
      expect(api.preserveRollingPrimaryDuplicateRefs(runtime, routing, { replace: true }))
        .toMatchObject({ captured: false, count: 0 });
      expect(runtime.primaryDuplicateRefs).toEqual([]);
    }
  });

  it('rejects emergency Provisions unless actual Storage consumption fits every pending card', async () => {
    const pendingOne = makePlayer({ id: 701, definitionId: 9701, duplicate: true });
    const pendingTwo = makePlayer({ id: 702, definitionId: 9702, duplicate: true });
    const { api } = await loadUserscript({ unassigned: [pendingOne, pendingTwo] });
    const runtime = {
      openRouting: { storageItems: [pendingOne, pendingTwo] },
      coordinator: {
        getLedger: () => ({
          summary: () => ({ capacities: { storage: { free: 0 } } }),
        }),
      },
    };

    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 0)).toMatchObject({
      ok: false,
      reasonCode: 'RECOVERY_STORAGE_HEADROOM_INSUFFICIENT',
      details: { projectedFree: 0, requiredFree: 2 },
    });
    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 1)).toMatchObject({
      ok: false,
      reasonCode: 'RECOVERY_STORAGE_HEADROOM_INSUFFICIENT',
      details: { projectedFree: 1, requiredFree: 2 },
    });
    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 2)).toMatchObject({
      ok: true,
      projectedFree: 2,
      requiredFree: 2,
    });
  });

  it('does not require Storage headroom for pending cards consumed by the recovery squad', async () => {
    const pendingOne = makePlayer({ id: 711, definitionId: 9711, duplicate: true });
    const pendingTwo = makePlayer({ id: 712, definitionId: 9712, duplicate: true });
    const { api } = await loadUserscript({ unassigned: [pendingOne, pendingTwo] });
    const runtime = {
      openRouting: { storageItems: [pendingOne, pendingTwo] },
      coordinator: {
        getLedger: () => ({
          summary: () => ({ capacities: { storage: { free: 0 } } }),
        }),
      },
    };

    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 0, {
      consumedPendingRefs: [pendingOne, pendingTwo],
    })).toMatchObject({
      ok: true,
      projectedFree: 0,
      requiredFree: 0,
    });
    expect(api.validateRollingEmergencyProvisionsSelection(runtime, 1, {
      consumedPendingRefs: [pendingOne],
    })).toMatchObject({
      ok: true,
      projectedFree: 1,
      requiredFree: 1,
    });
  });

  it('turns pending Storage headroom into a pre-plan real-Storage role', async () => {
    const primary = Array.from({ length: 5 }, (_, index) => makePlayer({
      id: 731 + index,
      definitionId: 9731 + index,
      rating: 85 + index,
      duplicate: true,
    }));
    const pending = Array.from({ length: 4 }, (_, index) => makePlayer({
      id: 741 + index,
      definitionId: 9741 + index,
      rating: 90 + index,
      duplicate: true,
    }));
    const storage = [
      makePlayer({ id: 751, definitionId: 9751, rating: 87, pile: 'storage' }),
      makePlayer({ id: 752, definitionId: 9752, rating: 89, pile: 'storage' }),
      makePlayer({ id: 753, definitionId: 9753, rating: 97, pile: 'storage' }),
    ];
    const { api } = await loadUserscript({ unassigned: [...primary, ...pending], storage });
    const runtime = {
      openRouting: { storageItems: pending },
      coordinator: {
        getLedger: () => ({
          summary: () => ({ capacities: { storage: { free: 2 } } }),
          classifiedEntries: () => storage.map((item) => ({
            item,
            pile: 'storage',
            classification: { requiredSpecial: false, protected: false },
          })),
        }),
      },
    };

    const pressure = api.rollingRatingRecoveryStoragePressure(runtime, {
      consumedPendingRefs: primary,
      maxRating: 96,
      maxCount: 11,
    });

    expect(pressure).toMatchObject({
      ok: true,
      currentFree: 2,
      pendingStorageItems: 4,
      minimumConsumption: 2,
      pressureItemRefs: [
        expect.objectContaining({ id: 751, pile: 'storage' }),
        expect.objectContaining({ id: 752, pile: 'storage' }),
      ],
      role: expect.objectContaining({
        id: 'storage-pressure-release',
        minCount: 2,
        maxCount: 11,
      }),
    });
    expect(pressure.role.matches(storage[0])).toBe(true);
    expect(pressure.role.matches(storage[2])).toBe(false);
  });

  it('releases only explicitly eligible pending Storage cards from Sink protection', async () => {
    const pending = makePlayer({
      id: 721,
      definitionId: 9721,
      rating: 91,
      duplicate: true,
      duplicateId: 1721,
    });
    const counterpart = makePlayer({ id: 1721, definitionId: 9721, rating: 91 });
    const stillProtected = makePlayer({ id: 1722, definitionId: 9722, rating: 92 });
    const { api } = await loadUserscript({ unassigned: [pending] });
    const ledger = {
      classifiedEntries: () => [
        { item: counterpart, pile: 'club', classification: { protected: true } },
        { item: stillProtected, pile: 'club', classification: { protected: true } },
      ],
    };
    const runtime = {
      pendingUnassignedRefs: [pending],
      primaryDuplicateRefs: [],
      coordinator: { getLedger: () => ledger },
    };

    const policy = api.rollingStorageSinkSelectionPolicy({}, runtime, {
      model: { constraints: [] },
      consumablePendingRefs: [pending],
      consumableItemRefs: [counterpart],
      additionalRoles: [{
        id: 'storage-pressure-release',
        itemRefs: [counterpart],
        minCount: 1,
        maxCount: 1,
      }],
    });

    expect(policy.protectedItems).toEqual([
      expect.objectContaining({ id: stillProtected.id }),
    ]);
    expect(policy.exclusiveRoles).toEqual([
      expect.objectContaining({ id: 'storage-pressure-release', minCount: 1 }),
    ]);
  });

  it('allows only an explicitly selected primary duplicate to bypass reserve-rating protection', async () => {
    const primarySignal = makePlayer({
      id: 721,
      definitionId: 9721,
      rating: 88,
      duplicate: true,
      duplicateId: 1721,
    });
    const primarySubmission = makePlayer({ id: 1721, definitionId: 9721, rating: 88 });
    const sameDefinitionClubCard = makePlayer({ id: 1723, definitionId: 9721, rating: 88 });
    const unrelatedReserve = makePlayer({ id: 1722, definitionId: 9722, rating: 88 });
    const { api } = await loadUserscript();
    const runtime = {
      primaryDuplicateRefs: [{ id: primarySignal.id, definitionId: primarySignal.definitionId }],
      pendingUnassignedRefs: [{ id: primarySignal.id, definitionId: primarySignal.definitionId }],
      primaryContext: {},
      coordinator: {
        getLedger: () => ({ classifiedEntries: () => [] }),
      },
    };
    const loopDef = {
      name: 'Rolling reserve recovery',
      runtimeProtectionRating: 95,
      runtimeProvisionsMaxRating: 88,
    };

    expect(api.assertRollingRecoveryItems(loopDef, runtime, [primarySubmission], {
      allowPrimaryDuplicates: true,
      allowSpecial: true,
      allowedPrimaryDuplicateRefs: [{
        id: primarySubmission.id,
        definitionId: primarySubmission.definitionId,
      }],
    })).toBe(true);
    expect(() => api.assertRollingRecoveryItems(loopDef, runtime, [sameDefinitionClubCard], {
      allowPrimaryDuplicates: true,
      allowSpecial: true,
      allowedPrimaryDuplicateRefs: [{
        id: primarySubmission.id,
        definitionId: primarySubmission.definitionId,
      }],
    })).toThrow('recovery squad attempted to consume a reserved 88 card');
    expect(() => api.assertRollingRecoveryItems(loopDef, runtime, [unrelatedReserve], {
      allowPrimaryDuplicates: true,
      allowSpecial: true,
      allowedPrimaryDuplicateRefs: [{
        id: primarySubmission.id,
        definitionId: primarySubmission.definitionId,
      }],
    })).toThrow('recovery squad attempted to consume a reserved 88 card');
  });

  it('allows only the exact Storage-pressure selection to bypass reserve-rating protection', async () => {
    const selectedReserve = makePlayer({ id: 1731, definitionId: 9731, rating: 87, rareflag: 22 });
    const unrelatedReserve = makePlayer({ id: 1732, definitionId: 9732, rating: 87, rareflag: 22 });
    const protectedReserve = makePlayer({ id: 1733, definitionId: 9733, rating: 87, rareflag: 22 });
    const { api } = await loadUserscript();
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      primaryContext: {},
      coordinator: {
        getLedger: () => ({
          classifiedEntries: () => [{
            item: protectedReserve,
            pile: 'storage',
            classification: { requiredSpecial: false, protected: true },
          }],
        }),
      },
    };
    const loopDef = {
      name: 'Rolling Storage-pressure reserve recovery',
      runtimeProtectionRating: 95,
      runtimeProvisionsMaxRating: 88,
      blockSpecial: false,
    };

    expect(api.assertRollingRecoveryItems(loopDef, runtime, [selectedReserve], {
      allowSpecial: true,
      allowedProvisionsReserveItems: [{
        id: selectedReserve.id,
        definitionId: selectedReserve.definitionId,
      }],
    })).toBe(true);
    expect(() => api.assertRollingRecoveryItems(loopDef, runtime, [unrelatedReserve], {
      allowSpecial: true,
      allowedProvisionsReserveItems: [{
        id: selectedReserve.id,
        definitionId: selectedReserve.definitionId,
      }],
    })).toThrow('recovery squad attempted to consume a reserved 87 card');
    expect(() => api.assertRollingRecoveryItems(loopDef, runtime, [protectedReserve], {
      allowSpecial: true,
      allowedProvisionsReserveItems: [{
        id: protectedReserve.id,
        definitionId: protectedReserve.definitionId,
      }],
    })).toThrow('recovery squad attempted to consume a protected card');
  });

  it('does not transfer protected-item authorization to same-definition B or C cards', async () => {
    const allowedA = makePlayer({ id: 1801, definitionId: 9801, rating: 86 });
    const protectedB = makePlayer({ id: 1802, definitionId: 9801, rating: 86 });
    const protectedC = makePlayer({ id: 1803, definitionId: 9801, rating: 86 });
    const { api } = await loadUserscript();
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      primaryContext: {},
      coordinator: {
        getLedger: () => ({
          classifiedEntries: () => [allowedA, protectedB, protectedC].map((item) => ({
            item,
            pile: 'club',
            classification: { requiredSpecial: false, protected: true },
          })),
        }),
      },
    };
    const loopDef = {
      name: 'Rolling exact protected authorization',
      runtimeProtectionRating: 95,
      blockSpecial: false,
    };

    expect(api.assertRollingRecoveryItems(loopDef, runtime, [allowedA], {
      allowSpecial: true,
      allowedProtectedItems: [{ id: allowedA.id, definitionId: allowedA.definitionId }],
    })).toBe(true);
    expect(() => api.assertRollingRecoveryItems(loopDef, runtime, [protectedB], {
      allowSpecial: true,
      allowedProtectedItems: [{ id: allowedA.id, definitionId: allowedA.definitionId }],
    })).toThrow('recovery squad attempted to consume a protected card');
    expect(() => api.assertRollingRecoveryItems(loopDef, runtime, [protectedC], {
      allowSpecial: true,
      allowedProtectedItems: [{ id: allowedA.id, definitionId: allowedA.definitionId }],
    })).toThrow('recovery squad attempted to consume a protected card');
  });

  it('checks EA Storage Sink challenge readiness only after the selected squad is saved', async () => {
    const { api } = await loadUserscript();
    const players = Array.from({ length: 11 }, (_, index) => makePlayer({
      id: 800 + index,
      definitionId: 9800 + index,
      rating: 89,
      rareflag: 1,
    }));
    let readinessChecks = 0;
    let squadSaved = false;
    const context = {
      model: {
        requiredPlayerCount: 11,
        targetRating: 89,
        constraints: [],
        maxSpecialCount: 11,
      },
      challenge: {
        meetsRequirements() {
          readinessChecks++;
          return squadSaved;
        },
      },
    };
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      primaryContext: {},
      coordinator: {
        getLedger: () => ({ classifiedEntries: () => [] }),
      },
    };
    const loopDef = {
      name: 'Rolling Storage Sink',
      runtimeProtectionRating: 95,
      expectedPlayerCount: 11,
    };

    const validators = api.createRollingStorageSinkSubmissionValidators(
      loopDef,
      runtime,
      context,
      'Storage Sink test',
    );

    expect(validators.validatePlannedPlayers(players)).toBe(true);
    expect(validators.preSave({ players })).toBe(true);
    expect(readinessChecks).toBe(0);

    squadSaved = true;
    expect(validators.postSave({ players, savedPlayers: players })).toBe(true);
    expect(readinessChecks).toBe(1);
  });

  it('treats a completed Storage Sink as unavailable with an explicit exhaustion reason', async () => {
    const { api } = await loadUserscript();
    const sinkDef = { name: '1 of 4 95+ Player Pick', setId: 1400 };
    const set = { id: 1400 };

    expect(api.completedRollingStorageSinkUnavailable(sinkDef, set, [{ id: 1 }, { id: 2 }]))
      .toMatchObject({
        status: 'unavailable',
        reason: '1 of 4 95+ Player Pick is already complete and has no incomplete Storage pressure challenge',
        reasonCode: 'STORAGE_SINK_COMPLETED',
        sinkDef,
        set,
        contexts: [],
        completedCount: 2,
        incompleteCount: 0,
        details: {
          setId: 1400,
          completedCount: 2,
          totalChallengeCount: 2,
        },
      });
  });

  it('falls back from an exhausted automatic Storage Sink to the next cached candidate', async () => {
    const { api } = await loadUserscript();
    const first = { setId: 1401, setName: 'Limited 95+ Pick', loop: {} };
    const second = { setId: 1402, setName: 'Player SBC', loop: {} };
    const runCapability = vi.fn(async (capability) => (
      capability.setId === first.setId
        ? {
            status: 'unavailable',
            reason: 'Limited 95+ Pick is already complete',
            reasonCode: 'STORAGE_SINK_COMPLETED',
          }
        : { status: 'submitted', submitted: true }
    ));
    const runtime = {};

    expect(await api.runRollingStorageSinkRecovery(
      { name: 'Rolling Loop' },
      runtime,
      { mode: 'automatic', capability: first, alternatives: [second] },
      { runCapability, refreshCapabilities: vi.fn() },
    )).toMatchObject({ status: 'submitted', submitted: true });
    expect(runCapability.mock.calls.map(([capability]) => capability.setId)).toEqual([1401, 1402]);
    expect([...runtime.storageSinkExhaustedSetIds]).toEqual([1401]);
  });

  it('skips session-exhausted candidates and retries once with a newly scanned automatic Sink', async () => {
    const { api } = await loadUserscript();
    const exhausted = { setId: 1411, setName: 'Completed Pick', loop: {} };
    const stale = { setId: 1412, setName: 'Expired Player SBC', loop: {} };
    const fresh = { setId: 1413, setName: 'Fresh Player SBC', loop: {} };
    const runtime = { storageSinkExhaustedSetIds: new Set([exhausted.setId]) };
    const runCapability = vi.fn(async (capability) => (
      capability.setId === stale.setId
        ? { status: 'unavailable', reason: 'expired', reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE' }
        : { status: 'submitted', submitted: true }
    ));
    const refreshCapabilities = vi.fn(async () => ({
      status: 'ready',
      definition: { mode: 'automatic', capability: fresh, alternatives: [] },
    }));

    expect(await api.runRollingStorageSinkRecovery(
      { name: 'Rolling Loop' },
      runtime,
      { mode: 'automatic', capability: exhausted, alternatives: [stale] },
      { runCapability, refreshCapabilities },
    )).toMatchObject({ status: 'submitted', submitted: true });
    expect(runCapability.mock.calls.map(([capability]) => capability.setId)).toEqual([1412, 1413]);
    expect(refreshCapabilities).toHaveBeenCalledOnce();
    expect(runtime.storageSinkRefreshAttempted).toBe(true);
  });

  it('does not replace an explicitly selected exhausted Storage Sink', async () => {
    const { api } = await loadUserscript();
    const selected = { setId: 1421, setName: 'Selected Limited Pick', loop: {} };
    const refreshCapabilities = vi.fn();

    expect(await api.runRollingStorageSinkRecovery(
      { name: 'Rolling Loop' },
      {},
      { mode: 'selected', capability: selected, alternatives: [] },
      {
        runCapability: vi.fn(async () => ({
          status: 'unavailable',
          reason: 'Selected Limited Pick is already complete',
          reasonCode: 'STORAGE_SINK_COMPLETED',
        })),
        refreshCapabilities,
      },
    )).toMatchObject({
      status: 'unavailable',
      reasonCode: 'STORAGE_SINK_COMPLETED',
      details: { exhaustedSetIds: [1421], runtimeRefreshAttempted: false },
    });
    expect(refreshCapabilities).not.toHaveBeenCalled();
  });

  it('stops automatic recovery explicitly after its one live refresh finds no Sink', async () => {
    const { api } = await loadUserscript();
    const completed = { setId: 1431, setName: 'Completed Pick', loop: {} };
    const refreshCapabilities = vi.fn(async () => ({
      status: 'unavailable',
      reason: 'live scan found no candidate',
      reasonCode: 'NO_STORAGE_SINK_AVAILABLE',
    }));
    const runtime = {};

    expect(await api.runRollingStorageSinkRecovery(
      { name: 'Rolling Loop' },
      runtime,
      { mode: 'automatic', capability: completed, alternatives: [] },
      {
        runCapability: vi.fn(async () => ({
          status: 'unavailable',
          reason: 'Completed Pick is already complete',
          reasonCode: 'STORAGE_SINK_COMPLETED',
        })),
        refreshCapabilities,
      },
    )).toMatchObject({
      status: 'unavailable',
      reasonCode: 'NO_STORAGE_SINK_AVAILABLE',
      details: {
        exhaustedSetIds: [1431],
        runtimeRefreshAttempted: true,
        refreshReasonCode: 'NO_STORAGE_SINK_AVAILABLE',
      },
    });
    expect(refreshCapabilities).toHaveBeenCalledOnce();
    expect(runtime.storageSinkRefreshAttempted).toBe(true);
  });

  it('allows exactly one Required Special through final Storage Sink validation', async () => {
    const requiredSpecial = makePlayer({
      id: 900,
      definitionId: 9900,
      rating: 95,
      rareflag: 120,
      groups: [19, 33, 44, 83],
    });
    requiredSpecial.pile = 'club';
    const ordinary = Array.from({ length: 10 }, (_, index) => makePlayer({
      id: 901 + index,
      definitionId: 9901 + index,
      rating: 89,
      rareflag: 1,
    }));
    const groupConstraint = {
      source: 'ea',
      keyName: 'PLAYER_RARITY_GROUP',
      label: 'PLAYER_RARITY_GROUP 83 x1',
      count: 1,
      matches: (item) => (item.groups || []).includes(83),
    };
    const context = {
      model: {
        requiredPlayerCount: 11,
        targetRating: 88,
        constraints: [groupConstraint],
        maxSpecialCount: 1,
      },
    };
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      primaryContext: { model: context.model },
      coordinator: {
        getLedger: () => ({
          classifiedEntries: () => [{
            item: requiredSpecial,
            pile: 'club',
            classification: { requiredSpecial: true, protected: false },
          }],
        }),
      },
    };
    const loopDef = {
      name: 'Rolling Storage Sink',
      runtimeProtectionRating: 95,
      expectedPlayerCount: 11,
    };
    const { api } = await loadUserscript({ club: [requiredSpecial] });
    const validators = api.createRollingStorageSinkSubmissionValidators(
      loopDef,
      runtime,
      context,
      'Storage Sink exact-one test',
    );

    expect(validators.validatePlannedPlayers([requiredSpecial, ...ordinary])).toBe(true);

    const secondRequiredSpecial = makePlayer({
      id: 920,
      definitionId: 9920,
      rating: 89,
      rareflag: 120,
      groups: [44, 83],
    });
    expect(() => validators.validatePlannedPlayers([
      requiredSpecial,
      secondRequiredSpecial,
      ...ordinary.slice(1),
    ])).toThrow(/role-count 2\/1-1/);
  });

  it('keeps Required Special protection when a Storage Sink squad has no explicit role', async () => {
    const requiredSpecial = makePlayer({
      id: 930,
      definitionId: 9930,
      rating: 91,
      rareflag: 120,
      groups: [44, 83],
    });
    const ordinary = Array.from({ length: 10 }, (_, index) => makePlayer({
      id: 931 + index,
      definitionId: 9931 + index,
      rating: 89,
      rareflag: 1,
    }));
    const primaryModel = {
      constraints: [{
        source: 'ea',
        keyName: 'PLAYER_RARITY_GROUP',
        count: 1,
        matches: (item) => (item.groups || []).includes(83),
      }],
    };
    const context = {
      model: {
        requiredPlayerCount: 11,
        targetRating: 88,
        constraints: [],
        maxSpecialCount: 11,
      },
    };
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      primaryContext: { model: primaryModel },
      coordinator: {
        getLedger: () => ({ classifiedEntries: () => [] }),
      },
    };
    const { api } = await loadUserscript();
    const validators = api.createRollingStorageSinkSubmissionValidators(
      { name: 'Rolling Storage Sink', runtimeProtectionRating: 95, expectedPlayerCount: 11 },
      runtime,
      context,
      'Storage Sink protected-special test',
    );

    expect(() => validators.validatePlannedPlayers([requiredSpecial, ...ordinary]))
      .toThrow(/attempted to consume a Required Special card/);
  });

  it('validates a threshold-safe pending Unassigned special selected for Storage pressure', async () => {
    const pending = makePlayer({
      id: 950,
      definitionId: 9950,
      rating: 88,
      rareflag: 120,
      duplicate: true,
      duplicateId: 1950,
    });
    const counterpart = makePlayer({
      id: 1950,
      definitionId: 9950,
      rating: 88,
      rareflag: 120,
    });
    const ordinary = Array.from({ length: 10 }, (_, index) => makePlayer({
      id: 1960 + index,
      definitionId: 9960 + index,
      rating: 88,
      rareflag: 1,
    }));
    const loopDef = {
      name: 'Rolling Storage pressure',
      runtimeProtectionRating: 95,
      expectedPlayerCount: 11,
      rollingProtectAllClubNonTotwSpecials: true,
    };
    const context = {
      model: {
        requiredPlayerCount: 11,
        targetRating: 88,
        constraints: [],
        maxSpecialCount: 11,
      },
    };
    const runtime = {
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [pending],
      openRouting: { storageItems: [pending] },
      primaryContext: { activeLoopDef: loopDef, model: { constraints: [] } },
      coordinator: {
        getLedger: () => ({
          classifiedEntries: () => [{
            item: counterpart,
            pile: 'club',
            classification: { protected: true, otherSpecial: true },
          }],
        }),
      },
    };
    const selection = {
      entries: [{
        item: counterpart,
        signal: pending,
        pileName: 'unassigned',
        submissionPileName: 'club',
      }],
    };
    const { api } = await loadUserscript({
      unassigned: [pending],
      club: [counterpart, ...ordinary],
    });
    const validators = api.createRollingStorageSinkSubmissionValidators(
      loopDef,
      runtime,
      context,
      'Storage pressure pending-special test',
    );

    expect(validators.validatePlannedPlayers([counterpart, ...ordinary], selection)).toBe(true);
  });

  it('reuses an already loaded Set challenge squad without replacing fresh metadata', async () => {
    const { api } = await loadUserscript();
    const cachedSquad = { id: 'cached-squad' };
    const cachedChallenge = { id: 3870, squad: cachedSquad, eligibilityRequirements: ['stale'] };
    const freshChallenge = { id: 3870, squad: null, eligibilityRequirements: ['fresh'] };
    const set = { challenges: { _collection: [cachedChallenge] } };

    expect(api.synchronizeCachedSbcChallengeSquad(set, freshChallenge)).toBe(freshChallenge);
    expect(freshChallenge.squad).toBe(cachedSquad);
    expect(freshChallenge.eligibilityRequirements).toEqual(['fresh']);

    const newlyLoadedSquad = { id: 'newly-loaded-squad' };
    freshChallenge.squad = newlyLoadedSquad;
    cachedChallenge.squad = null;
    api.synchronizeCachedSbcChallengeSquad(set, freshChallenge);
    expect(cachedChallenge.squad).toBe(newlyLoadedSquad);
  });
});
