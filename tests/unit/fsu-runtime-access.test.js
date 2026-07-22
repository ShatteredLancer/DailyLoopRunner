import { describe, expect, it, vi } from 'vitest';
import { createItemSnapshot } from '../../src/domain/contracts.js';
import { prepareFsuProvisionalClubAccess } from '../../src/sbc/fsu-runtime-access.js';

function player(id, definitionId, overrides = {}) {
  return {
    id,
    definitionId,
    type: 'player',
    rating: 84,
    rareflag: 1,
    rare: true,
    special: false,
    tradeable: false,
    leagueId: 13,
    evolution: false,
    limitedUse: false,
    concept: false,
    academyEnrolled: false,
    activeTrade: false,
    endTime: -1,
    groups: [4],
    ...overrides,
  };
}

function options(overrides = {}) {
  const clubPlayer = player(10, 20);
  return {
    readiness: { detected: true, ready: true, fullyValidated: false, state: 'provisional' },
    label: 'Test SBC',
    players: [clubPlayer],
    itemRefs: [{ id: 10, definitionId: 20, pile: 'club' }],
    snapshotItem: createItemSnapshot,
    validateClubPlayers: vi.fn(async () => ({
      ok: true,
      items: [player(10, 20)],
      missing: [],
      elapsed: 12,
    })),
    log: vi.fn(),
    ...overrides,
  };
}

describe('prepareFsuProvisionalClubAccess', () => {
  it.each([
    { detected: false, ready: true, state: 'not-detected' },
    { detected: true, ready: true, fullyValidated: true, state: 'ready' },
  ])('skips targeted validation when FSU is not provisional: $state', async (readiness) => {
    const input = options({ readiness });
    await expect(prepareFsuProvisionalClubAccess(input)).resolves.toEqual({ ok: true });
    expect(input.validateClubPlayers).not.toHaveBeenCalled();
  });

  it('does not validate Storage, Transfer or Unassigned players', async () => {
    const input = options({
      players: [player(1, 11), player(2, 12), player(3, 13)],
      itemRefs: [
        { id: 1, definitionId: 11, pile: 'storage' },
        { id: 2, definitionId: 12, pile: 'transfer' },
        { id: 3, definitionId: 13, pile: 'unassigned' },
      ],
    });
    await expect(prepareFsuProvisionalClubAccess(input)).resolves.toEqual({ ok: true });
    expect(input.validateClubPlayers).not.toHaveBeenCalled();
  });

  it('validates only Club refs and preserves squad order while replacing Club entities', async () => {
    const storage = player(1, 11);
    const oldClub = player(2, 12);
    const transfer = player(3, 13);
    const freshClub = player(2, 12);
    const input = options({
      players: [storage, oldClub, transfer],
      itemRefs: [
        { id: 1, definitionId: 11, pile: 'storage' },
        { id: 2, definitionId: 12, pile: 'club' },
        { id: 3, definitionId: 13, pile: 'transfer' },
      ],
      validateClubPlayers: vi.fn(async () => ({ ok: true, items: [freshClub], missing: [], elapsed: 7 })),
    });

    const result = await prepareFsuProvisionalClubAccess(input);
    expect(input.validateClubPlayers).toHaveBeenCalledWith(
      [{ id: 2, definitionId: 12, pile: 'club' }],
      { label: 'Test SBC targeted Club validation' },
    );
    expect(result.players).toEqual([storage, freshClub, transfer]);
    expect(result.players[0]).toBe(storage);
    expect(result.players[1]).toBe(freshClub);
    expect(result.players[2]).toBe(transfer);
    expect(result).toMatchObject({
      refreshedClubPlayers: true,
      validatedClubRefs: [{ id: 2, definitionId: 12, pile: 'club' }],
    });
  });

  it('blocks a loading FSU state when targeted validation is unavailable', async () => {
    const input = options({
      readiness: { detected: true, ready: false, fullyValidated: false, state: 'loading' },
      validateClubPlayers: vi.fn(async () => ({
        ok: false,
        items: [],
        missing: [{ id: 10, definitionId: 20, pile: 'club' }],
        reason: 'Club cache state is loading',
      })),
    });
    await expect(prepareFsuProvisionalClubAccess(input)).resolves.toEqual({
      ok: false,
      reason: 'Club cache state is loading',
    });
  });

  it('blocks when an exact item ID and definition ID match is missing', async () => {
    const input = options({
      validateClubPlayers: vi.fn(async () => ({
        ok: true,
        items: [player(10, 21)],
        missing: [],
      })),
    });
    const result = await prepareFsuProvisionalClubAccess(input);
    expect(result).toMatchObject({ ok: false });
    expect(result.reason).toContain('#10/def:20');
  });

  it.each([
    ['rating', { rating: 85 }],
    ['rarity', { rareflag: 2, special: true }],
    ['tradeable state', { tradeable: true }],
    ['league', { leagueId: 99 }],
    ['Evolution state', { evolution: true }],
    ['limited-use state', { limitedUse: true }],
    ['academy state', { academyEnrolled: true }],
    ['active trade state', { activeTrade: true }],
    ['groups', { groups: [4, 27] }],
  ])('blocks when the refreshed Club entity changes a critical %s attribute', async (_name, change) => {
    const input = options({
      validateClubPlayers: vi.fn(async () => ({
        ok: true,
        items: [player(10, 20, change)],
        missing: [],
      })),
    });
    const result = await prepareFsuProvisionalClubAccess(input);
    expect(result).toMatchObject({ ok: false });
    expect(result.reason).toContain('restart the Loop');
  });
});
