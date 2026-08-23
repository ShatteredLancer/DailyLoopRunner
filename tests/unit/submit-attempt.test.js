import { describe, expect, it, vi } from 'vitest';
import {
  createExistingSquadProvider,
  createFsuFillProvider,
  createInventorySquadProvider,
  submitSbcAttempt,
} from '../../src/sbc/submit-attempt.js';

function baseOptions(overrides = {}) {
  return {
    label: 'Test SBC',
    challengeProvider: async () => ({ set: { id: 1, name: 'Test SBC' }, challenge: { id: 2 } }),
    squadProvider: async () => ({ ok: true, players: [{ id: 10 }], itemRefs: [{ id: 10, definitionId: 20, pile: 'club' }] }),
    saveSquad: vi.fn(async () => {}),
    reloadSquad: vi.fn(async () => {}),
    readSavedPlayers: vi.fn(async () => [{ id: 10 }]),
    isSubmitReady: vi.fn(async () => true),
    submitTransport: vi.fn(async () => ({ submitted: true, rewardPackId: 105 })),
    ...overrides,
  };
}

describe('submitSbcAttempt', () => {
  it('runs challenge, squad, validation, save, reload and submit in order', async () => {
    const calls = [];
    const options = baseOptions({
      preSaveValidators: [async () => { calls.push('pre'); }],
      saveSquad: async () => { calls.push('save'); },
      reloadSquad: async () => { calls.push('reload'); },
      readSavedPlayers: async () => { calls.push('read'); return [{ id: 10 }]; },
      postSaveValidators: [async () => { calls.push('post'); }],
      isSubmitReady: async () => { calls.push('ready'); return true; },
      submitTransport: async () => { calls.push('submit'); return { submitted: true, rewardPackId: 105 }; },
      afterSubmit: async () => { calls.push('after'); },
    });
    const result = await submitSbcAttempt(options);
    expect(result).toMatchObject({ status: 'submitted', submitted: true, rewardPackId: 105 });
    expect(calls).toEqual(['pre', 'save', 'reload', 'read', 'post', 'ready', 'submit', 'after']);
  });

  it('refreshes runtime players before pre-save validation and releases access afterward', async () => {
    const calls = [];
    const refreshed = { id: 10, rating: 84 };
    const options = baseOptions({
      prepareRuntimeAccess: async () => {
        calls.push('refresh');
        return { ok: true, players: [refreshed], itemRefs: [{ id: 10, definitionId: 20, pile: 'club' }], token: 'access' };
      },
      preSaveValidators: [async ({ players }) => {
        calls.push('pre');
        expect(players).toEqual([refreshed]);
      }],
      saveSquad: async ({ players, runtimeAccess }) => {
        calls.push('save');
        expect(players).toEqual([refreshed]);
        expect(runtimeAccess).toMatchObject({ ok: true, token: 'access' });
      },
      releaseRuntimeAccess: async ({ token }) => {
        calls.push(`release:${token}`);
      },
    });

    await expect(submitSbcAttempt(options)).resolves.toMatchObject({ submitted: true });
    expect(calls).toEqual(['refresh', 'pre', 'save', 'release:access']);
  });

  it('applies a bounded player preparation after runtime refresh and before validation', async () => {
    const calls = [];
    const refreshed = { id: 10, rating: 84 };
    const swapped = { id: 20, rating: 84 };
    const selection = { entries: [{ item: refreshed }] };
    const options = baseOptions({
      squadProvider: async () => ({
        ok: true,
        players: [{ id: 1 }],
        itemRefs: [{ id: 1, definitionId: 101, pile: 'club' }],
        selection,
      }),
      prepareRuntimeAccess: async () => {
        calls.push('refresh');
        return { ok: true, players: [refreshed] };
      },
      preparePlayers: async ({ players, squadPlan }) => {
        calls.push('prepare');
        expect(players).toEqual([refreshed]);
        expect(squadPlan.selection).toBe(selection);
        return {
          ok: true,
          changed: true,
          players: [swapped],
          itemRefs: [{ id: 20, definitionId: 120, pile: 'club' }],
          selection: { entries: [{ item: swapped }] },
        };
      },
      preSaveValidators: [async ({ players, squadPlan }) => {
        calls.push('pre');
        expect(players).toEqual([swapped]);
        expect(squadPlan.selection.entries[0].item).toBe(swapped);
      }],
      saveSquad: async ({ players, playerPreparation }) => {
        calls.push('save');
        expect(players).toEqual([swapped]);
        expect(playerPreparation).toMatchObject({ ok: true, changed: true });
      },
      readSavedPlayers: async () => {
        calls.push('read');
        return [swapped];
      },
      postSaveValidators: [async ({ players, savedPlayers }) => {
        calls.push('post');
        expect(players).toEqual([swapped]);
        expect(savedPlayers).toEqual([swapped]);
      }],
      submitTransport: async ({ players, savedPlayers }) => {
        calls.push('submit');
        expect(players).toEqual([swapped]);
        expect(savedPlayers).toEqual([swapped]);
        return { submitted: true };
      },
    });

    await expect(submitSbcAttempt(options)).resolves.toMatchObject({ submitted: true });
    expect(calls).toEqual(['refresh', 'prepare', 'pre', 'save', 'read', 'post', 'submit']);
  });

  it('never reaches save or transport when a pre-save guard rejects the final prepared players', async () => {
    const options = baseOptions({
      preparePlayers: async () => ({ ok: true, players: [{ id: 20 }] }),
      preSaveValidators: [async () => { throw new Error('FSU locked player selected'); }],
    });

    await expect(submitSbcAttempt(options)).rejects.toThrow('FSU locked player selected');
    expect(options.saveSquad).not.toHaveBeenCalled();
    expect(options.submitTransport).not.toHaveBeenCalled();
  });

  it('never reaches transport when a post-save guard rejects the saved squad', async () => {
    const options = baseOptions({
      postSaveValidators: [async () => { throw new Error('saved squad contains a protected player'); }],
    });

    await expect(submitSbcAttempt(options)).rejects.toThrow('saved squad contains a protected player');
    expect(options.saveSquad).toHaveBeenCalledOnce();
    expect(options.submitTransport).not.toHaveBeenCalled();
  });

  it('blocks before validation and save when player preparation fails closed', async () => {
    const options = baseOptions({
      preparePlayers: async () => ({
        ok: false,
        reason: 'duplicate swap response is incomplete',
        reasonCode: 'DUPLICATE_SWAP_RESPONSE_INVALID',
        details: { field: 'cosmetics', state: 'missing' },
      }),
      preSaveValidators: [vi.fn(async () => {})],
    });

    await expect(submitSbcAttempt(options)).resolves.toMatchObject({
      status: 'blocked',
      submitted: false,
      reason: 'duplicate swap response is incomplete',
      reasonCode: 'DUPLICATE_SWAP_RESPONSE_INVALID',
      details: { field: 'cosmetics', state: 'missing' },
    });
    expect(options.preSaveValidators[0]).not.toHaveBeenCalled();
    expect(options.saveSquad).not.toHaveBeenCalled();
    expect(options.submitTransport).not.toHaveBeenCalled();
  });

  it('returns to the planner when player preparation materializes inventory', async () => {
    const options = baseOptions({
      preparePlayers: async () => ({
        ok: true,
        replan: true,
        reason: 'duplicate materialized; old squad plan invalidated',
        reasonCode: 'DUPLICATE_MATERIALIZED_REPLAN',
      }),
      preSaveValidators: [vi.fn(async () => {})],
    });

    await expect(submitSbcAttempt(options)).resolves.toMatchObject({
      status: 'replan',
      submitted: false,
      reasonCode: 'DUPLICATE_MATERIALIZED_REPLAN',
    });
    expect(options.preSaveValidators[0]).not.toHaveBeenCalled();
    expect(options.saveSquad).not.toHaveBeenCalled();
    expect(options.submitTransport).not.toHaveBeenCalled();
  });

  it('blocks before save when runtime inventory validation fails', async () => {
    const options = baseOptions({
      prepareRuntimeAccess: async () => ({ ok: false, reason: 'Club item #10 is stale' }),
      releaseRuntimeAccess: vi.fn(async () => {}),
    });

    const result = await submitSbcAttempt(options);
    expect(result).toMatchObject({
      status: 'blocked',
      submitted: false,
      reason: 'Club item #10 is stale',
    });
    expect(options.saveSquad).not.toHaveBeenCalled();
    expect(options.submitTransport).not.toHaveBeenCalled();
    expect(options.releaseRuntimeAccess).toHaveBeenCalledOnce();
  });

  it('returns unavailable without side effects when no challenge exists', async () => {
    const options = baseOptions({ challengeProvider: async () => null });
    const result = await submitSbcAttempt(options);
    expect(result.status).toBe('unavailable');
    expect(options.saveSquad).not.toHaveBeenCalled();
    expect(options.submitTransport).not.toHaveBeenCalled();
  });

  it('uses the same squad provider and validators in dry run without saving or submitting', async () => {
    const pre = vi.fn(async () => {});
    const preparePlayers = vi.fn(async () => ({
      ok: true,
      changed: true,
      replan: true,
    }));
    const prepareRuntimeAccess = vi.fn(async () => ({ ok: true }));
    const options = baseOptions({
      dryRun: true,
      preSaveValidators: [pre],
      prepareRuntimeAccess,
      preparePlayers,
    });
    const result = await submitSbcAttempt(options);
    expect(result.status).toBe('planned');
    expect(pre).toHaveBeenCalledOnce();
    expect(preparePlayers).not.toHaveBeenCalled();
    expect(options.saveSquad).not.toHaveBeenCalled();
    expect(options.submitTransport).not.toHaveBeenCalled();
    expect(prepareRuntimeAccess).not.toHaveBeenCalled();
  });

  it('can prepare and validate a saved squad without checking submit readiness or submitting', async () => {
    const post = vi.fn(async () => {});
    const options = baseOptions({ prepareOnly: true, postSaveValidators: [post] });
    const result = await submitSbcAttempt(options);
    expect(result).toMatchObject({ status: 'prepared', submitted: false });
    expect(options.saveSquad).toHaveBeenCalledOnce();
    expect(options.reloadSquad).toHaveBeenCalledOnce();
    expect(options.readSavedPlayers).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledOnce();
    expect(options.isSubmitReady).not.toHaveBeenCalled();
    expect(options.submitTransport).not.toHaveBeenCalled();
  });

  it('blocks when saved squad is not submit ready', async () => {
    const options = baseOptions({ isSubmitReady: async () => false });
    const result = await submitSbcAttempt(options);
    expect(result).toMatchObject({ status: 'blocked', submitted: false, reason: 'saved squad is not submit ready' });
    expect(options.submitTransport).not.toHaveBeenCalled();
  });

  it('re-reads and validates the final squad after readiness and before transport', async () => {
    const calls = [];
    const finalPlayers = [{ id: 20 }];
    const result = await submitSbcAttempt(baseOptions({
      isSubmitReady: async () => { calls.push('ready'); return true; },
      readFinalPlayers: async () => { calls.push('read-final'); return finalPlayers; },
      finalValidators: [async ({ finalPlayers: actual }) => {
        calls.push('final');
        expect(actual).toBe(finalPlayers);
      }],
      submitTransport: async () => { calls.push('submit'); return { submitted: true }; },
    }));

    expect(result).toMatchObject({ submitted: true });
    expect(calls).toEqual(['ready', 'read-final', 'final', 'submit']);
  });

  it('never reaches transport when the final saved-squad guard rejects', async () => {
    const options = baseOptions({
      readFinalPlayers: async () => [{ id: 99 }],
      finalValidators: [async () => { throw new Error('final squad identity drift'); }],
    });

    await expect(submitSbcAttempt(options)).rejects.toThrow('final squad identity drift');
    expect(options.submitTransport).not.toHaveBeenCalled();
  });

  it('passes a structured transport replan through without finalizing a submission', async () => {
    const afterSubmit = vi.fn(async () => {});
    const result = await submitSbcAttempt(baseOptions({
      submitTransport: async () => ({
        status: 'replan',
        submitted: false,
        reason: 'replace Active Squad item #10',
        reasonCode: 'ACTIVE_SQUAD_CONFLICT_REPLAN',
        details: { excludedItemIds: [10] },
      }),
      afterSubmit,
    }));

    expect(result).toMatchObject({
      status: 'replan',
      submitted: false,
      reasonCode: 'ACTIVE_SQUAD_CONFLICT_REPLAN',
      details: { excludedItemIds: [10] },
    });
    expect(afterSubmit).not.toHaveBeenCalled();
  });

  it('publishes a confirmed result before afterSubmit and isolates observer failures', async () => {
    const calls = [];
    const result = await submitSbcAttempt(baseOptions({
      onResult: async (value, metadata) => {
        calls.push(['result', value.status, metadata.phase]);
        throw new Error('ledger unavailable');
      },
      onResultError: async (error, { result: value }) => calls.push(['error', error.message, value.status]),
      afterSubmit: async () => calls.push(['after']),
    }));

    expect(result).toMatchObject({ status: 'submitted', submitted: true });
    expect(calls).toEqual([
      ['result', 'submitted', 'submitted'],
      ['error', 'ledger unavailable', 'submitted'],
      ['after'],
    ]);
  });

  it('keeps transport, result publication and after-submit work inside the committed wrapper', async () => {
    const calls = [];
    const result = await submitSbcAttempt(baseOptions({
      runCommittedSubmit: async (operation, context) => {
        calls.push(['commit-start', context.label]);
        const value = await operation();
        calls.push(['commit-end', value.status]);
        return value;
      },
      submitTransport: async () => {
        calls.push(['transport']);
        return { submitted: true, rewardPackId: 105 };
      },
      onResult: async (value) => calls.push(['result', value.status]),
      afterSubmit: async () => calls.push(['after']),
    }));

    expect(result).toMatchObject({ status: 'submitted', submitted: true });
    expect(calls).toEqual([
      ['commit-start', 'Test SBC'],
      ['transport'],
      ['result', 'submitted'],
      ['after'],
      ['commit-end', 'submitted'],
    ]);
  });

  it('preserves a confirmed submission while exposing a blocked post-submit finalizer', async () => {
    const result = await submitSbcAttempt(baseOptions({
      afterSubmit: async () => ({
        ok: false,
        reason: 'protected counterpart could not return to Club',
        reasonCode: 'DUPLICATE_COUNTERPART_RESTORE_BLOCKED',
      }),
    }));

    expect(result).toMatchObject({
      status: 'submitted',
      submitted: true,
      postSubmitBlocked: true,
      reasonCode: 'DUPLICATE_COUNTERPART_RESTORE_BLOCKED',
    });
  });

  it('rechecks submit readiness when the saved squad button appears late', async () => {
    let checks = 0;
    const onSubmitNotReady = vi.fn(async () => {});
    const result = await submitSbcAttempt(baseOptions({
      submitReadyAttempts: 3,
      isSubmitReady: async () => {
        checks++;
        return checks === 3;
      },
      onSubmitNotReady,
    }));

    expect(result).toMatchObject({ status: 'submitted', submitted: true });
    expect(checks).toBe(3);
    expect(onSubmitNotReady).toHaveBeenCalledTimes(2);
  });

  it('adapts an inventory selection through createInventorySquadProvider', async () => {
    const provider = createInventorySquadProvider({
      selection: { ok: true, selected: [{ id: 10 }] },
      prepareSelection: async (_context, selection) => selection,
      itemRef: (item) => ({ id: item.id, definitionId: item.id + 1, pile: 'club' }),
    });
    await expect(provider({ challenge: { id: 2 } })).resolves.toEqual({
      ok: true,
      players: [{ id: 10 }],
      itemRefs: [{ id: 10, definitionId: 11, pile: 'club' }],
      selection: { ok: true, selected: [{ id: 10 }] },
    });
  });

  it('supports existing-squad and FSU providers through the same contract', async () => {
    const itemRef = (item) => ({ id: item.id, definitionId: item.id + 100, pile: 'club' });
    const selection = { entries: [{ itemRef: { id: 1 } }] };
    const existing = createExistingSquadProvider({ getPlayers: async () => [{ id: 1 }], itemRef, selection });
    const fsu = createFsuFillProvider({
      fill: async () => ({ submitReady: true }),
      getPlayers: async () => [{ id: 2 }],
      itemRef,
    });
    await expect(existing({})).resolves.toMatchObject({
      ok: true,
      source: 'existing-squad',
      itemRefs: [{ id: 1 }],
      selection,
    });
    await expect(fsu({})).resolves.toMatchObject({ ok: true, source: 'fsu-fill', itemRefs: [{ id: 2 }] });
  });
});
