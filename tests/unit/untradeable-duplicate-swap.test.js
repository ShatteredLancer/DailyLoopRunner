import { describe, expect, it } from 'vitest';
import {
  planUntradeableDuplicateSwaps,
  resolveUntradeableDuplicateSwapIds,
  validateUntradeableDuplicateSwapMaterialization,
} from '../../src/sbc/untradeable-duplicate-swap.js';

function card(id, overrides = {}) {
  return {
    id,
    definitionId: 501,
    rating: 85,
    rareflag: 1,
    tradeable: false,
    evolution: false,
    cosmetic: false,
    pile: 'unassigned',
    ...overrides,
  };
}

describe('untradeable duplicate SBC swap planning', () => {
  it('replaces a selected tradeable Club entity with its Unassigned untradeable version', () => {
    const signal = card(101, { duplicate: true, duplicateId: 201 });
    const selected = card(201, { tradeable: true, pile: 'club' });
    const plan = planUntradeableDuplicateSwaps({
      selection: {
        entries: [{ pileName: 'unassigned', signal, item: selected }],
      },
      players: [selected, card(301, { definitionId: 601, pile: 'storage' })],
    });

    expect(plan).toEqual({
      ok: true,
      swaps: [{
        signalId: 101,
        targetId: 201,
        definitionId: 501,
      }],
    });
  });

  it.each([
    ['different rating', { rating: 86 }],
    ['different rarity', { rareflag: 2 }],
    ['EVO mismatch', { evolution: true }],
    ['cosmetic mismatch', { cosmetic: true }],
    ['untradeable Club target', { tradeable: false }],
    ['non-Club target', { pile: 'storage' }],
  ])('does not plan a swap for a %s', (_name, targetOverrides) => {
    const signal = card(101, { duplicate: true, duplicateId: 201 });
    const selected = card(201, { tradeable: true, pile: 'club', ...targetOverrides });
    expect(planUntradeableDuplicateSwaps({
      selection: { entries: [{ pileName: 'unassigned', signal, item: selected }] },
      players: [selected],
    })).toEqual({ ok: true, swaps: [] });
  });

  it('rejects a stale duplicate id instead of swapping a same-version bystander', () => {
    const signal = card(101, { duplicate: true, duplicateId: 999 });
    const selected = card(201, { tradeable: true, pile: 'club' });
    expect(planUntradeableDuplicateSwaps({
      selection: { entries: [{ pileName: 'unassigned', signal, item: selected }] },
      players: [selected],
    })).toEqual({ ok: false, reason: 'duplicate target identity changed', swaps: [] });
  });

  it('rejects a swap when the duplicate signal does not identify the Club target', () => {
    const signal = card(101, { duplicate: true });
    const selected = card(201, { tradeable: true, pile: 'club' });
    expect(planUntradeableDuplicateSwaps({
      selection: { entries: [{ pileName: 'unassigned', signal, item: selected }] },
      players: [selected],
    })).toEqual({ ok: false, reason: 'duplicate target identity is missing', swaps: [] });
  });

  it('maps every expected old Club id to the new Club item id from EA', () => {
    expect(resolveUntradeableDuplicateSwapIds({
      swaps: [
        { signalId: 101, targetId: 201, definitionId: 501 },
        { signalId: 102, targetId: 202, definitionId: 502 },
      ],
    }, {
      success: true,
      data: {
        clubDuplicates: [{ id: 202 }, { id: 201 }],
        itemIds: [102, 101],
      },
    })).toEqual({
      ok: true,
      replacements: [
        { signalId: 101, targetId: 201, newItemId: 101, definitionId: 501 },
        { signalId: 102, targetId: 202, newItemId: 102, definitionId: 502 },
      ],
    });
  });

  it.each([
    ['failed move', { success: false, data: {} }, 'duplicate swap move failed'],
    ['missing arrays', { success: true, data: {} }, 'duplicate swap response has no identity mapping'],
    ['unequal arrays', { success: true, data: { clubDuplicates: [{ id: 201 }], itemIds: [] } }, 'duplicate swap response mapping is incomplete'],
    ['missing target', { success: true, data: { clubDuplicates: [{ id: 999 }], itemIds: [101] } }, 'duplicate swap response omitted selected Club item #201'],
  ])('fails closed for a %s response', (_name, result, reason) => {
    expect(resolveUntradeableDuplicateSwapIds({
      swaps: [{ signalId: 101, targetId: 201, definitionId: 501 }],
    }, result)).toEqual({ ok: false, reason, replacements: [] });
  });

  it('verifies both sides of the EA Club duplicate swap', () => {
    expect(validateUntradeableDuplicateSwapMaterialization({
      replacement: { signalId: 101, targetId: 201, newItemId: 101 },
      originalSignal: card(101),
      originalTarget: card(201, { tradeable: true, pile: 'club' }),
      newClubItem: card(101, { pile: 'club' }),
      displacedTarget: card(201, { tradeable: true, pile: 'unassigned' }),
    })).toEqual({
      ok: true,
      signalId: 101,
      targetId: 201,
      newItemId: 101,
    });
  });

  it.each([
    [
      'a missing displaced tradeable card',
      { displacedTarget: null },
      'duplicate swap displaced tradeable Club item #201 disappeared after move',
    ],
    [
      'a displaced card in the wrong pile',
      { displacedTarget: card(201, { tradeable: true, pile: 'transfer' }) },
      'duplicate swap displaced tradeable Club item #201 moved to transfer, expected unassigned',
    ],
    [
      'a displaced card with a changed version',
      { displacedTarget: card(201, { tradeable: true, pile: 'unassigned', rating: 86 }) },
      'duplicate swap displaced tradeable Club item #201 changed card version',
    ],
    [
      'a displaced card that became untradeable',
      { displacedTarget: card(201, { tradeable: false, pile: 'unassigned' }) },
      'duplicate swap displaced Club item #201 is no longer tradeable',
    ],
    [
      'a replacement in the wrong pile',
      { newClubItem: card(101, { pile: 'unassigned' }) },
      'duplicate swap replacement #101 materialized in unassigned, expected club',
    ],
  ])('fails closed for %s', (_name, overrides, reason) => {
    expect(validateUntradeableDuplicateSwapMaterialization({
      replacement: { signalId: 101, targetId: 201, newItemId: 101 },
      originalSignal: card(101),
      originalTarget: card(201, { tradeable: true, pile: 'club' }),
      newClubItem: card(101, { pile: 'club' }),
      displacedTarget: card(201, { tradeable: true, pile: 'unassigned' }),
      ...overrides,
    })).toEqual({ ok: false, reason });
  });
});
