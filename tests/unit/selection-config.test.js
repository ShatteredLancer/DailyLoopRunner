import { describe, expect, it } from 'vitest';
import { createSingleCardSelectionRequirement } from '../../src/config/selection.js';

describe('single-card selection config projection', () => {
  it('inherits loop protections and removes disabled piles', () => {
    const result = createSingleCardSelectionRequirement({
      name: 'Daily Bronze custom',
      priorityPiles: ['club', 'storage', 'transfer'],
      disabledPiles: ['club'],
      protectedItemIds: [11],
      protectedDefinitionIds: [22],
      blockTradeable: true,
      protectHighGold: true,
      pickHighGoldThreshold: 91,
    }, {
      tier: 'bronze',
      playerOnly: true,
      allowSpecial: false,
    });

    expect(result.priorityPiles).toEqual(['storage', 'transfer']);
    expect(result.requirement).toMatchObject({
      tier: 'bronze',
      count: 1,
      blockTradeable: true,
      protectHighGold: true,
      highGoldThreshold: 91,
      protectedItemIds: [11],
      protectedDefinitionIds: [22],
      priorityPiles: ['storage', 'transfer'],
    });
  });

  it('uses the safe default piles when a loop does not configure priority', () => {
    const result = createSingleCardSelectionRequirement({ disabledPiles: ['club'] }, { tier: 'silver' });

    expect(result.priorityPiles).toEqual(['storage', 'transfer']);
    expect(result.requirement.count).toBe(1);
  });
});
