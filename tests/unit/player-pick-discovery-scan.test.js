import { describe, expect, it, vi } from 'vitest';
import { scanPlayerPickSbcSnapshots } from '../../src/sbc/player-pick-discovery-scan.js';

function snapshot(set, challenges = set.challenges || []) {
  return { ...set, challenges };
}

describe('Player Pick SBC discovery scan', () => {
  it('refreshes Sets, filters Pick rewards, and loads Challenge metadata before parsing', async () => {
    const refreshSets = vi.fn(async () => {});
    const loadChallenges = vi.fn(async (set) => [{ id: set.id + 100 }]);
    const parseSnapshot = vi.fn((set) => ({ status: 'supported', loop: { id: `pick-${set.id}` } }));
    const onResult = vi.fn();
    const result = await scanPlayerPickSbcSnapshots({
      refreshSets,
      listSets: () => [
        { id: 1, rewards: [{ type: 'PACK' }] },
        { id: 2, rewards: [{ type: 'PLAYER_PICK' }] },
      ],
      snapshotSet: snapshot,
      loadChallenges,
      parseSnapshot,
      onResult,
    });

    expect(refreshSets).toHaveBeenCalledOnce();
    expect(loadChallenges).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), expect.any(Object));
    expect(parseSnapshot).toHaveBeenCalledWith(expect.objectContaining({ challenges: [{ id: 102 }] }));
    expect(result).toMatchObject({ setsScanned: 2, pickSets: 1 });
    expect(onResult).toHaveBeenCalledOnce();
  });

  it('keeps completed Pick Sets readable without requesting Challenges', async () => {
    const loadChallenges = vi.fn();
    const result = await scanPlayerPickSbcSnapshots({
      refreshSets: async () => {},
      listSets: () => [{ id: 3, complete: true, rewards: [{ type: 'PLAYER_PICK' }] }],
      snapshotSet: snapshot,
      loadChallenges,
      parseSnapshot: () => ({ status: 'completed' }),
    });
    expect(loadChallenges).not.toHaveBeenCalled();
    expect(result.results[0].parsed.status).toBe('completed');
  });

  it('returns a diagnostic instead of exposing a runnable loop when Challenge loading fails', async () => {
    const result = await scanPlayerPickSbcSnapshots({
      refreshSets: async () => {},
      listSets: () => [{ id: 4, rewards: [{ type: 'PLAYER_PICK' }] }],
      snapshotSet: snapshot,
      loadChallenges: async () => { throw new Error('DAO offline'); },
      parseSnapshot: () => ({ status: 'supported', loop: { id: 'unsafe' }, diagnostics: [] }),
    });
    expect(result.results[0].parsed).toEqual({
      status: 'unsupported',
      loop: null,
      diagnostics: ['challenge metadata load failed: DAO offline'],
    });
  });
});
