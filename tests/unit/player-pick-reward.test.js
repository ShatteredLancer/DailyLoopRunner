import { describe, expect, it } from 'vitest';
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

  it('requires manual selection for multiple highest-rated special cards', () => {
    const ranked = rankPlayerPickCandidates([
      { id: 1, rating: 91, special: true },
      { id: 2, rating: 91, special: true },
      { id: 3, rating: 90 },
    ], new Map(), { isSpecial: special });
    expect(getManualPlayerPickReason(ranked, 1)).toMatch(/2 special card/);
  });

  it('requires manual selection when missing price affects a selected tie', () => {
    const ranked = [
      { item: { id: 1 }, rating: 89, special: false, duplicate: false, price: null },
      { item: { id: 2 }, rating: 89, special: false, duplicate: false, price: 10000 },
    ];
    expect(getManualPlayerPickReason(ranked, 1)).toMatch(/price data is missing/);
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
