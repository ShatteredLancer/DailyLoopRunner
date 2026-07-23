import { describe, expect, it } from 'vitest';
import { createEaRarityAdapter } from '../../src/adapters/ea/rarity.js';

describe('EA Rarity Adapter', () => {
  it('reads a special-card color map without exposing the repository to recap models', () => {
    const colorMap = { background: { r: 12, g: 34, b: 56 }, name: { r: 240, g: 245, b: 250 } };
    const rarity = { largeColorMaps: new Map([[0, colorMap]]) };
    const adapter = createEaRarityAdapter({ repositories: { Rarity: { get: (id) => id === 7 ? rarity : null } } });
    expect(adapter.playerTheme({ rareflag: 7, tier: 'gold' })).toEqual({
      background: colorMap.background,
      foreground: colorMap.name,
      accent: colorMap.name,
      rareflag: 7,
      source: 'EA Rarity',
    });
  });

  it('returns null for normal cards, missing repositories, and incomplete maps', () => {
    expect(createEaRarityAdapter({}).playerTheme({ rareflag: 7 })).toBeNull();
    const adapter = createEaRarityAdapter({ repositories: { Rarity: { get: () => ({ largeColorMaps: new Map([[0, { name: { r: 1, g: 2, b: 3 } }]]) }) } } });
    expect(adapter.playerTheme({ rareflag: 1 })).toBeNull();
    expect(adapter.playerTheme({ rareflag: 7 })).toBeNull();
  });
});
