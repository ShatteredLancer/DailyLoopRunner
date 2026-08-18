import { describe, expect, it } from 'vitest';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

function entry(id, rating, options = {}) {
  const definitionId = options.definitionId ?? 10000 + id;
  return {
    item: makePlayer({
      id,
      definitionId,
      databaseId: options.databaseId ?? (definitionId % 0x01000000),
      rating,
      rareflag: options.special ? 2 : 0,
      groups: options.special ? [44] : [],
    }),
    signal: null,
    pileName: options.pileName || 'storage',
    pileRank: options.pileRank ?? 0,
    requirementMatches: options.requirementMatches || [],
    special: options.special === true,
  };
}

async function expectSelection(entries, model, expected, piles = ['storage', 'club']) {
  const { api } = await loadUserscript();
  const current = await api.findOptimalRatingSbcSelection(entries, model, piles);
  expect(current.ok).toBe(expected.ok);
  expect(current.reason || null).toBe(expected.reason || null);
  if (!expected.ok) return;
  expect(current.rating).toBe(expected.rating);
  expect(current.ratings).toEqual(expected.ratings);
  expect(current.selected.map((item) => item.id)).toEqual(expected.ids);
  expect(current.pileCounts).toEqual(expected.pileCounts);
}

describe('rating selector regression fixtures', () => {
  it('preserves the lowest valid rating vector', async () => {
    const entries = [];
    let id = 1;
    for (const rating of [82, 83, 84, 85, 86]) {
      for (let count = 0; count < 5; count++) entries.push(entry(id++, rating));
    }
    await expectSelection(entries, {
      requiredPlayerCount: 11,
      targetRating: 84,
      maxSpecialCount: 0,
      constraints: [],
    }, {
      ok: true,
      rating: 84,
      ratings: [85, 85, 84, 84, 84, 84, 83, 83, 83, 82, 82],
      ids: [16, 17, 11, 12, 13, 14, 6, 7, 8, 1, 2],
      pileCounts: { storage: 11 },
    });
  });

  it('preserves special-card constraints', async () => {
    const entries = [entry(100, 84, { special: true, requirementMatches: [true] })];
    let id = 101;
    for (const rating of [82, 83, 84, 85]) {
      for (let count = 0; count < 5; count++) entries.push(entry(id++, rating, { requirementMatches: [false] }));
    }
    await expectSelection(entries, {
      requiredPlayerCount: 11,
      targetRating: 84,
      maxSpecialCount: 1,
      constraints: [{ label: 'TOTW x1', count: 1 }],
    }, {
      ok: true,
      rating: 84,
      ratings: [85, 84, 84, 84, 84, 84, 84, 83, 83, 83, 82],
      ids: [116, 100, 111, 112, 113, 114, 115, 106, 107, 108, 101],
      pileCounts: { storage: 11 },
    });
  });

  it('preserves pile preference after the rating vector is fixed', async () => {
    const entries = [];
    for (let index = 0; index < 11; index++) {
      entries.push(entry(200 + index, 84, { pileName: 'storage', pileRank: 0 }));
      entries.push(entry(300 + index, 84, { pileName: 'club', pileRank: 1 }));
    }
    await expectSelection(entries, {
      requiredPlayerCount: 11,
      targetRating: 84,
      maxSpecialCount: 0,
      constraints: [],
    }, {
      ok: true,
      rating: 84,
      ratings: Array(11).fill(84),
      ids: Array.from({ length: 11 }, (_, index) => 200 + index),
      pileCounts: { storage: 11 },
    });
  });

  it('preserves safe failure when unique candidates are insufficient', async () => {
    await expectSelection([entry(1, 84), entry(2, 84)], {
      requiredPlayerCount: 11,
      targetRating: 84,
      maxSpecialCount: 0,
      constraints: [],
    }, {
      ok: false,
      reason: 'only 2/11 safe unique player definitions are available',
    });
  });

  it('never selects two card versions of the same base player', async () => {
    const dembeleDatabaseId = 231443;
    const entries = [
      entry(1, 95, {
        definitionId: 134449171,
        databaseId: dembeleDatabaseId,
        special: true,
        requirementMatches: [true],
      }),
      entry(2, 91, {
        definitionId: 67340307,
        databaseId: dembeleDatabaseId,
        requirementMatches: [false],
      }),
      entry(3, 91, {
        definitionId: 67340308,
        databaseId: 231444,
        requirementMatches: [false],
      }),
      ...Array.from({ length: 9 }, (_, index) => entry(10 + index, 80, {
        requirementMatches: [false],
      })),
    ];

    const { api } = await loadUserscript();
    const plan = await api.findOptimalRatingSbcSelection(entries, {
      requiredPlayerCount: 11,
      targetRating: 84,
      maxSpecialCount: 1,
      constraints: [{ label: 'Required Special x1', count: 1 }],
    }, ['storage', 'club']);

    expect(plan.ok).toBe(true);
    expect(plan.rating).toBe(84);
    expect(plan.selected.map((item) => item.id)).toContain(1);
    expect(plan.selected.map((item) => item.id)).toContain(3);
    expect(plan.selected.map((item) => item.id)).not.toContain(2);
    expect(new Set(plan.selected.map((item) => item.databaseId)).size).toBe(11);
  });
});
