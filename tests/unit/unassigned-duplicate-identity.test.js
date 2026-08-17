import { describe, expect, it } from 'vitest';
import { classifyUnassignedDuplicateIdentity } from '../../src/inventory/unassigned-duplicate-identity.js';

function card(overrides = {}) {
  return {
    id: 100,
    definitionId: 200389,
    rating: 88,
    rareflag: 1,
    duplicate: true,
    duplicateId: 200,
    ...overrides,
  };
}

describe('Unassigned duplicate cleanup identity', () => {
  it.each([
    {
      name: 'accepts the exact same-version Club entity',
      item: card(),
      club: [card({ id: 200, duplicate: false, duplicateId: 0 })],
      expected: { duplicate: true, duplicateId: 200, evidence: 'exact-club-id' },
    },
    {
      name: 'replaces a stale direct ID with the actual same-version Club ID',
      item: card({ duplicateId: 999 }),
      club: [card({ id: 201, duplicate: false, duplicateId: 0 })],
      expected: { duplicate: true, duplicateId: 201, evidence: 'same-version-club' },
    },
    {
      name: 'restores a latent duplicate from a real same-version Club entity',
      item: card({ duplicate: false, duplicateId: 0 }),
      club: [card({ id: 201, duplicate: false, duplicateId: 0 })],
      expected: { duplicate: true, duplicateId: 201, evidence: 'same-version-club' },
    },
    {
      name: 'ignores a stale direct ID on a different version and records the actual matching Club ID',
      item: card({ duplicateId: 200 }),
      club: [
        card({ id: 200, rating: 89, duplicate: false, duplicateId: 0 }),
        card({ id: 201, duplicate: false, duplicateId: 0 }),
      ],
      expected: { duplicate: true, duplicateId: 201, evidence: 'same-version-club' },
    },
    {
      name: 'rejects a stale signal when Club has no counterpart',
      item: card(),
      club: [],
      expected: { duplicate: false, duplicateId: 0, evidence: 'no-club-counterpart' },
    },
    {
      name: 'rejects the same definition with a different rating',
      item: card(),
      club: [card({ id: 200, rating: 89, duplicate: false, duplicateId: 0 })],
      expected: { duplicate: false, duplicateId: 0, evidence: 'no-club-counterpart' },
    },
    {
      name: 'rejects the same definition and rating with a different rare flag',
      item: card(),
      club: [card({ id: 200, rareflag: 2, duplicate: false, duplicateId: 0 })],
      expected: { duplicate: false, duplicateId: 0, evidence: 'no-club-counterpart' },
    },
    {
      name: 'rejects an evolved Club version',
      item: card(),
      club: [card({ id: 200, evolution: true, duplicate: false, duplicateId: 0 })],
      expected: { duplicate: false, duplicateId: 0, evidence: 'no-club-counterpart' },
    },
    {
      name: 'rejects a cosmetic Club version',
      item: card(),
      club: [card({ id: 200, cosmetic: true, duplicate: false, duplicateId: 0 })],
      expected: { duplicate: false, duplicateId: 0, evidence: 'no-club-counterpart' },
    },
    {
      name: 'ignores a Club entity without a stable item ID',
      item: card({ duplicateId: 0 }),
      club: [card({ id: 0, duplicate: false, duplicateId: 0 })],
      expected: { duplicate: false, duplicateId: 0, evidence: 'no-club-counterpart' },
    },
  ])('$name', ({ item, club, expected }) => {
    expect(classifyUnassignedDuplicateIdentity(item, club)).toEqual(expected);
  });

  it('changes from duplicate to non-duplicate when the Club counterpart disappears', () => {
    const item = card();
    const club = [card({ id: 200, duplicate: false, duplicateId: 0 })];

    expect(classifyUnassignedDuplicateIdentity(item, club)).toMatchObject({
      duplicate: true,
      duplicateId: 200,
    });

    club.splice(0);

    expect(classifyUnassignedDuplicateIdentity(item, club)).toEqual({
      duplicate: false,
      duplicateId: 0,
      evidence: 'no-club-counterpart',
    });
  });
});
