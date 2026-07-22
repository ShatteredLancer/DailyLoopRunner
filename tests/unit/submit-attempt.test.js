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
    const prepareRuntimeAccess = vi.fn(async () => ({ ok: true }));
    const options = baseOptions({ dryRun: true, preSaveValidators: [pre], prepareRuntimeAccess });
    const result = await submitSbcAttempt(options);
    expect(result.status).toBe('planned');
    expect(pre).toHaveBeenCalledOnce();
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
    const existing = createExistingSquadProvider({ getPlayers: async () => [{ id: 1 }], itemRef });
    const fsu = createFsuFillProvider({
      fill: async () => ({ submitReady: true }),
      getPlayers: async () => [{ id: 2 }],
      itemRef,
    });
    await expect(existing({})).resolves.toMatchObject({ ok: true, source: 'existing-squad', itemRefs: [{ id: 1 }] });
    await expect(fsu({})).resolves.toMatchObject({ ok: true, source: 'fsu-fill', itemRefs: [{ id: 2 }] });
  });
});
