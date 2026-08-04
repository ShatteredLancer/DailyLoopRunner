import { describe, expect, it } from 'vitest';
import {
  configuredGoldConsumptionMode,
  goldConsumptionCompatible,
  goldConsumptionOrder,
  runtimeGoldConsumptionMode,
} from '../../src/domain/gold-consumption.js';

describe('Gold consumption policy', () => {
  it('keeps EA eligibility separate from configured consumption intent', () => {
    expect(configuredGoldConsumptionMode({ tier: 'gold', rarity: 'common' })).toBe('common-only');
    expect(configuredGoldConsumptionMode({ tier: 'gold', rarity: 'rare' })).toBe('rare-only');
    expect(configuredGoldConsumptionMode({
      tier: 'gold',
      goldConsumption: 'common-first',
    })).toBe('common-first');
    expect(runtimeGoldConsumptionMode({ tier: 'gold', rarity: 'rare' })).toBe('eligibility');
  });

  it('maps legacy material selectors without changing the SBC requirement', () => {
    const unrestricted = { tier: 'gold', count: 9 };
    expect(configuredGoldConsumptionMode(unrestricted, 'common-gold')).toBe('common-only');
    expect(configuredGoldConsumptionMode(unrestricted, 'rare-gold')).toBe('rare-only');
    expect(configuredGoldConsumptionMode(unrestricted, 'low-rated-gold')).toBe('common-first');
    expect(unrestricted).toEqual({ tier: 'gold', count: 9 });
  });

  it('rejects fallback policies when EA accepts only one rarity', () => {
    const unrestricted = { tier: 'gold' };
    const commonOnly = { tier: 'gold', rarity: 'common' };
    const rareOnly = { tier: 'gold', rarity: 'rare' };

    expect(goldConsumptionCompatible(unrestricted, 'common-first', { requireFallback: true })).toBe(true);
    expect(goldConsumptionCompatible(commonOnly, 'common-first', { requireFallback: true })).toBe(false);
    expect(goldConsumptionCompatible(rareOnly, 'common-only')).toBe(false);
    expect(goldConsumptionCompatible(unrestricted, 'rare-only')).toBe(true);
    expect(goldConsumptionOrder('common-first')).toEqual(['common', 'rare']);
  });
});
