import { describe, expect, it, vi } from 'vitest';
import {
  capturePlayerPickSelections,
  classifyPendingPlayerPicks,
  getManualPlayerPickReason,
  partitionPendingPlayerPicks,
  playerPickMatchesReward,
  playerPickItemName,
  rankPlayerPickCandidates,
} from '../../src/reward/player-pick.js';

const special = (item) => item.special === true;
const duplicate = (item) => item.duplicate === true;
const rare = (item) => Number(item?._staticData?.rareflag || 0) > 0;

describe('Player Pick reward planning', () => {
  it('classifies matching and unrelated pending Pick rewards by configured aliases', () => {
    const matching = { id: 1, _staticData: { name: '1 of 3 84+ Summer Tournament Nations Player Pick' } };
    const unexpected = { id: 2, name: '1 of 5 83+ Player Pick' };
    const classified = classifyPendingPlayerPicks([unexpected, matching], ['Summer Tournament Nations Player Pick']);
    expect(classified).toEqual({ matching, unexpected });
    expect(playerPickItemName(matching)).toBe('1 of 3 84+ Summer Tournament Nations Player Pick');
  });

  it('uses stable reward identity instead of a broad name when resource ids are configured', () => {
    const matching = { id: 5004333, definitionId: 5004333, _staticData: { name: 'Localized Pick Key' } };
    const wrong = { id: 5009999, definitionId: 5009999, name: '1 of 5 83+ Player Pick' };
    expect(classifyPendingPlayerPicks([wrong, matching], ['83+ Player Pick'], [5004333]))
      .toEqual({ matching, unexpected: wrong });
  });

  it('returns every matching pending reward for deferred Pick opening', () => {
    const matching = [
      { id: 1, definitionId: 5004333 },
      { id: 2, definitionId: 5004333 },
    ];
    const unexpected = { id: 3, definitionId: 5009999 };
    expect(partitionPendingPlayerPicks([...matching, unexpected], [], [5004333]))
      .toEqual({ matching, unexpected: [unexpected] });
    expect(playerPickMatchesReward(matching[0], [], [5004333])).toBe(true);
    expect(playerPickMatchesReward(unexpected, [], [5004333])).toBe(false);
  });

  it('orders by rating, special, non-duplicate, price, then original position', () => {
    const items = [
      { id: 1, definitionId: 1, rating: 90, special: false, duplicate: false },
      { id: 2, definitionId: 2, rating: 90, special: true, duplicate: true },
      { id: 3, definitionId: 3, rating: 90, special: true, duplicate: false },
      { id: 4, definitionId: 4, rating: 89, special: true, duplicate: false },
    ];
    const ranked = rankPlayerPickCandidates(items, new Map([[2, 100000], [3, 50000]]), {
      isSpecial: special,
      isDuplicate: duplicate,
    });
    expect(ranked.map((entry) => entry.item.id)).toEqual([3, 2, 1, 4]);
  });

  it('requires manual selection only when highest-rated special cards exceed the selection count', () => {
    const ranked = rankPlayerPickCandidates([
      { id: 1, rating: 91, special: true },
      { id: 2, rating: 91, special: true },
      { id: 3, rating: 90 },
    ], new Map(), { isSpecial: special, random: () => 0 });
    expect(getManualPlayerPickReason(ranked, 1)).toMatch(/2 non-duplicate special card/);
    expect(getManualPlayerPickReason(ranked, 2)).toBe('');
  });

  it('does not require manual selection when duplicate top specials leave one non-duplicate choice', () => {
    const ranked = rankPlayerPickCandidates([
      { id: 1, rating: 96, special: true, duplicate: true },
      { id: 2, rating: 96, special: true, duplicate: false },
      { id: 3, rating: 96, special: true, duplicate: true },
    ], new Map(), { isSpecial: special, isDuplicate: duplicate, random: () => 0 });

    expect(ranked[0].item.id).toBe(2);
    expect(getManualPlayerPickReason(ranked, 1)).toBe('');
  });

  it('does not require manual selection when every top special is a duplicate', () => {
    const ranked = rankPlayerPickCandidates([
      { id: 1, rating: 96, special: true, duplicate: true },
      { id: 2, rating: 96, special: true, duplicate: true },
      { id: 3, rating: 95, special: true, duplicate: false },
    ], new Map(), { isSpecial: special, isDuplicate: duplicate, random: () => 0 });

    expect(getManualPlayerPickReason(ranked, 1)).toBe('');
  });

  it('randomizes a price-missing non-special tie without requiring manual selection', () => {
    const random = vi.fn(() => 0);
    const ranked = rankPlayerPickCandidates([
      { id: 1, definitionId: 1, rating: 95, special: true },
      { id: 2, definitionId: 2, rating: 89 },
      { id: 3, definitionId: 3, rating: 89 },
    ], new Map([[1, 100000]]), { isSpecial: special, random });
    expect(ranked.map((entry) => entry.item.id)).toEqual([1, 3, 2]);
    expect(random).toHaveBeenCalledOnce();
    expect(getManualPlayerPickReason(ranked, 2)).toBe('');
  });

  it('captures the EA static rare flag for a selected recap card', () => {
    const item = { id: 1, rating: 88, special: true, duplicate: false, _staticData: { rareflag: 1 } };
    const ranked = rankPlayerPickCandidates([item], new Map([[0, 25000]]), {
      isSpecial: special,
      isDuplicate: duplicate,
      isRare: rare,
    });
    expect(capturePlayerPickSelections([item], ranked, {
      isSpecial: special,
      isDuplicate: duplicate,
      isRare: rare,
    })).toEqual([expect.objectContaining({ item, rating: 88, rare: true, special: true, duplicate: false })]);
  });
});
