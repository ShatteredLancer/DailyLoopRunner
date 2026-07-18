import { describe, expect, it } from 'vitest';
import { loadFixture } from '../helpers/fixtures.js';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

describe('EA squad rating characterization', () => {
  it('calculates known rating vectors and rejects incomplete vectors', async () => {
    const { api } = await loadUserscript();
    expect(api.calculateEaSquadRating(Array(11).fill(84), 11)).toBe(84);
    expect(api.calculateEaSquadRating([85, 85, 84, 84, 84, 84, 84, 84, 83, 83, 83], 11)).toBe(84);
    expect(api.calculateEaSquadRating([84, 84], 11)).toBe(0);
  });

  it('validates player count, unique definitions, rating and special constraints', async () => {
    const fixture = await loadFixture('challenges/rating-84x10.json');
    const { api } = await loadUserscript();
    const players = fixture.players.map(makePlayer);
    const model = {
      requiredPlayerCount: fixture.model.requiredPlayerCount,
      targetRating: fixture.model.targetRating,
      maxSpecialCount: fixture.model.maxSpecialCount,
      constraints: [{
        label: 'TOTW/TOTS/FOF',
        count: fixture.model.requiredGroupCount,
        matches: (item) => item.groups?.includes(fixture.model.requiredGroupId),
      }],
    };

    const valid = api.validateRatingSbcModelAgainstItems(model, players);
    expect(valid.ok).toBe(true);
    expect(valid.rating).toBe(84);

    const duplicateDefinition = players.map((item) => ({ ...item }));
    duplicateDefinition[10].definitionId = duplicateDefinition[0].definitionId;
    const invalid = api.validateRatingSbcModelAgainstItems(model, duplicateDefinition);
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.some((error) => error.startsWith('unique-definitions'))).toBe(true);
  });
});
