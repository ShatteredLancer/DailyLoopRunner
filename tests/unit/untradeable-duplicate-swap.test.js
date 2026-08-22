import { describe, expect, it } from 'vitest';
import moveFailure from '../fixtures/ea-untradeable-duplicate-move-failure.json' with { type: 'json' };
import http200NoMapping from '../fixtures/ea-untradeable-duplicate-move-http200-no-mapping.json' with { type: 'json' };
import {
  evaluateDuplicateSwapEligibility,
  normalizeDuplicateSwapMode,
  planUntradeableDuplicateSwaps,
  readDuplicateCardTradeability,
  readDuplicateSpecialClassification,
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
    upgrades: null,
    cosmetics: null,
    chemistryStyle: 250,
    preferredPosition: 18,
    attributes: [85, 85, 85, 85, 85, 85],
    skillMoves: 3,
    weakFoot: 3,
    groups: [19, 35],
    pile: 'unassigned',
    ...overrides,
  };
}

describe('untradeable duplicate SBC swap planning', () => {
  it('normalizes legacy boolean opt-in without making controlled modes implicit', () => {
    expect(normalizeDuplicateSwapMode(undefined, false)).toBe('off');
    expect(normalizeDuplicateSwapMode(undefined, true)).toBe('special-only');
    expect(normalizeDuplicateSwapMode('special-only', true)).toBe('special-only');
    expect(normalizeDuplicateSwapMode('unknown', true)).toBe('off');
  });

  it('keeps unknown tradeability and special classification out of controlled swaps', () => {
    expect(readDuplicateCardTradeability({ id: 1 })).toBeNull();
    expect(readDuplicateCardTradeability({ id: 2, tradable: false })).toBe(false);
    expect(readDuplicateSpecialClassification({ id: 1 })).toBeNull();
    expect(evaluateDuplicateSwapEligibility({
      source: card(101, { tradeable: undefined, duplicateId: 201, rareflag: 64 }),
      target: card(201, { pile: 'club', rareflag: 64 }),
      mode: 'special-only',
    })).toEqual({ eligible: false, reason: 'duplicate source must be confirmed untradeable' });
  });

  it('fails closed when a controlled pair lacks complete value evidence', () => {
    const source = card(101, { duplicateId: 201, duplicateFingerprintComplete: false, rareflag: 64 });
    const target = card(201, { pile: 'club', duplicateFingerprintComplete: false, rareflag: 64 });
    expect(evaluateDuplicateSwapEligibility({ source, target, mode: 'special-only' }))
      .toEqual({ eligible: false, reason: 'controlled duplicate swap value fingerprint is incomplete' });
  });

  it('allows only identical untradeable special pairs in special-only mode', () => {
    const source = card(101, { duplicate: true, duplicateId: 201, rareflag: 64 });
    const target = card(201, { pile: 'club', rareflag: 64 });
    expect(evaluateDuplicateSwapEligibility({ source, target, mode: 'special-only' }))
      .toMatchObject({ eligible: true, mode: 'special-only' });
    expect(evaluateDuplicateSwapEligibility({
      source: card(101, { duplicate: true, duplicateId: 201 }),
      target: card(201, { pile: 'club' }),
      mode: 'special-only',
    })).toEqual({ eligible: false, reason: 'duplicate swap mode only permits special cards' });
  });

  it('rejects a special-only pair when its value fingerprint has changed', () => {
    expect(evaluateDuplicateSwapEligibility({
      source: card(101, { duplicate: true, duplicateId: 201, rareflag: 64 }),
      target: card(201, { pile: 'club', rareflag: 64, chemistryStyle: 251 }),
      mode: 'special-only',
    })).toEqual({ eligible: false, reason: 'controlled duplicate swap value fingerprint is not identical' });
  });

  it('keeps safe-only ordinary swaps narrower than special-only and all-eligible', () => {
    expect(evaluateDuplicateSwapEligibility({
      source: card(101, { duplicate: true, duplicateId: 201 }),
      target: card(201, { pile: 'club' }),
      mode: 'safe-only',
    })).toMatchObject({ eligible: true, mode: 'safe-only' });
    expect(evaluateDuplicateSwapEligibility({
      source: card(101, { duplicate: true, duplicateId: 201, rareflag: 64 }),
      target: card(201, { pile: 'club', rareflag: 64 }),
      mode: 'safe-only',
    })).toEqual({ eligible: false, reason: 'safe duplicate swap mode excludes special cards' });
    expect(evaluateDuplicateSwapEligibility({
      source: card(101, { duplicate: true, duplicateId: 201 }),
      target: card(201, { pile: 'club', tradeable: true }),
      mode: 'all-eligible',
    })).toMatchObject({ eligible: true, mode: 'all-eligible' });
  });

  it('replaces a selected tradeable Club entity with its Unassigned untradeable version', () => {
    const signal = card(101, { duplicate: true, duplicateId: 201 });
    const selected = card(201, { tradeable: true, pile: 'club' });
    const plan = planUntradeableDuplicateSwaps({
      selection: {
        entries: [{ pileName: 'unassigned', signal, item: selected }],
      },
      players: [selected, card(301, { definitionId: 601, pile: 'storage' })],
      swapMode: 'all-eligible',
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

  it('also replaces a selected untradeable Club entity with the exact Unassigned duplicate', () => {
    const signal = card(101, { duplicate: true, duplicateId: 201 });
    const selected = card(201, { tradeable: false, pile: 'club' });
    expect(planUntradeableDuplicateSwaps({
      selection: {
        entries: [{ pileName: 'unassigned', signal, item: selected }],
      },
      players: [selected],
      swapMode: 'all-eligible',
    })).toEqual({
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
    ['non-Club target', { pile: 'storage' }],
  ])('does not plan a swap for a %s', (_name, targetOverrides) => {
    const signal = card(101, { duplicate: true, duplicateId: 201 });
    const selected = card(201, { tradeable: true, pile: 'club', ...targetOverrides });
    expect(planUntradeableDuplicateSwaps({
      selection: { entries: [{ pileName: 'unassigned', signal, item: selected }] },
      players: [selected],
    })).toEqual({ ok: true, swaps: [] });
  });

  it('fails closed when the exact Club counterpart has unknown tradeability', () => {
    const signal = card(101, { duplicate: true, duplicateId: 201 });
    const selected = card(201, { tradeable: undefined, pile: 'club' });
    expect(planUntradeableDuplicateSwaps({
      selection: { entries: [{ pileName: 'unassigned', signal, item: selected }] },
      players: [selected],
    })).toEqual({
      ok: false,
      reason: 'duplicate Club counterpart tradeability is unknown',
      swaps: [],
    });
  });

  it('rejects a stale duplicate id instead of swapping a same-version bystander', () => {
    const signal = card(101, { duplicate: true, duplicateId: 999 });
    const selected = card(201, { tradeable: true, pile: 'club' });
    expect(planUntradeableDuplicateSwaps({
      selection: { entries: [{ pileName: 'unassigned', signal, item: selected }] },
      players: [selected],
      swapMode: 'all-eligible',
    })).toEqual({ ok: false, reason: 'duplicate target identity changed', swaps: [] });
  });

  it('rejects a swap when the duplicate signal does not identify the Club target', () => {
    const signal = card(101, { duplicate: true });
    const selected = card(201, { tradeable: true, pile: 'club' });
    expect(planUntradeableDuplicateSwaps({
      selection: { entries: [{ pileName: 'unassigned', signal, item: selected }] },
      players: [selected],
      swapMode: 'all-eligible',
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
    ['extra mapping', { success: true, data: { clubDuplicates: [{ id: 201 }, { id: 202 }], itemIds: [101, 102] } }, 'duplicate swap response mapping count does not match the planned pair count'],
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

  it('replays the observed EA zero-status untradeable move failure without inventing identities', () => {
    expect(resolveUntradeableDuplicateSwapIds({
      swaps: [{ signalId: 101, targetId: 201, definitionId: 501 }],
    }, moveFailure.response)).toEqual({
      ok: false,
      reason: 'duplicate swap move failed',
      replacements: [],
    });
    expect(moveFailure.inventory.after).toEqual(moveFailure.inventory.before);
  });

  it('rejects an observed HTTP 200 move when EA did not return exchange identities', () => {
    expect(resolveUntradeableDuplicateSwapIds({
      swaps: [{
        signalId: http200NoMapping.source.id,
        targetId: http200NoMapping.source.duplicateId,
        definitionId: http200NoMapping.source.definitionId,
      }],
    }, http200NoMapping.response)).toEqual(http200NoMapping.expected);
  });

  it('verifies an untradeable Club counterpart without changing its tradeability', () => {
    expect(validateUntradeableDuplicateSwapMaterialization({
      replacement: { signalId: 101, targetId: 201, newItemId: 301 },
      originalSignal: card(101),
      originalTarget: card(201, { tradeable: false, pile: 'club' }),
      newClubItem: card(301, { tradeable: false, pile: 'club' }),
      displacedTarget: card(201, { tradeable: false, pile: 'unassigned' }),
    })).toEqual({
      ok: true,
      signalId: 101,
      targetId: 201,
      newItemId: 301,
    });
  });

  it.each([
    [
      'a missing displaced protected card',
      { displacedTarget: null },
      'duplicate swap protected Club counterpart #201 disappeared after move',
    ],
    [
      'a displaced card in the wrong pile',
      { displacedTarget: card(201, { tradeable: true, pile: 'transfer' }) },
      'duplicate swap protected Club counterpart #201 moved to transfer, expected unassigned',
    ],
    [
      'a displaced card with a changed version',
      { displacedTarget: card(201, { tradeable: true, pile: 'unassigned', rating: 86 }) },
      'duplicate swap protected Club counterpart #201 changed card version',
    ],
    [
      'a displaced card that became untradeable',
      { displacedTarget: card(201, { tradeable: false, pile: 'unassigned' }) },
      'duplicate swap protected Club counterpart #201 changed tradeability',
    ],
    [
      'a displaced untradeable card that became tradeable',
      {
        originalTarget: card(201, { tradeable: false, pile: 'club' }),
        displacedTarget: card(201, { tradeable: true, pile: 'unassigned' }),
      },
      'duplicate swap protected Club counterpart #201 changed tradeability',
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
