import { describe, expect, it } from 'vitest';
import {
  RECAP_TIER_COLORS,
  createRecapModel,
  getRecapPage,
  normalizeRecapColor,
  recapContrastRatio,
  recapCardTypeLabel,
  resolveRecapCardTheme,
} from '../../src/reward/recap.js';

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({ name: `P${index}`, rating: count - index }));
}

describe('shared recap model and tier themes', () => {
  it.each([
    [0, 1, 0], [1, 1, 1], [19, 1, 19], [20, 1, 20], [21, 2, 20], [40, 2, 20],
  ])('paginates %i rows into %i page(s)', (count, pages, firstPageRows) => {
    const model = createRecapModel({ rows: rows(count) });
    expect(model.pageCount).toBe(pages);
    expect(getRecapPage(model, 1).rows).toHaveLength(firstPageRows);
    if (pages > 1) expect(getRecapPage(model, pages).end).toBe(count);
  });

  it('uses the fixed product tier colors without overlapping high rare gold and top special', () => {
    const samples = [
      [{ rating: 63, tier: 'bronze' }, 'bronze'],
      [{ rating: 74, tier: 'silver' }, 'silver'],
      [{ rating: 84, tier: 'gold', rare: false }, 'commonGold'],
      [{ rating: 85, tier: 'gold', rare: true }, 'rareGoldLow'],
      [{ rating: 86, tier: 'gold', rare: true }, 'rareGoldMid'],
      [{ rating: 89, tier: 'gold', rare: true }, 'rareGoldHigh'],
      [{ rating: 94, special: true }, 'specialLow'],
      [{ rating: 95, special: true }, 'specialMid'],
      [{ rating: 98, special: true }, 'specialHigh'],
    ];
    for (const [card, key] of samples) {
      const theme = resolveRecapCardTheme(card);
      expect(theme).toMatchObject({ key, accent: RECAP_TIER_COLORS[key].accent });
      expect(recapContrastRatio(theme.background, theme.rating)).toBeGreaterThanOrEqual(4.5);
    }
    expect(RECAP_TIER_COLORS.rareGoldHigh.accent).not.toBe(RECAP_TIER_COLORS.specialHigh.accent);
    expect(recapCardTypeLabel({ rating: 74, tier: 'silver', rare: true })).toBe('Rare Silver');
    expect(recapCardTypeLabel({ rating: 63, tier: 'bronze', rare: false })).toBe('Common Bronze');
  });

  it('accepts a valid EA special-card background and falls back when it is invalid', () => {
    const native = resolveRecapCardTheme({ rating: 96, special: true }, {
      background: { r: 10, g: 80, b: 120 }, name: { r: 255, g: 255, b: 255 },
    });
    expect(native).toMatchObject({ source: 'ea', background: '#0A5078', foreground: '#FFFFFF' });
    expect(recapContrastRatio(native.background, native.foreground)).toBeGreaterThanOrEqual(4.5);
    expect(recapContrastRatio(native.background, native.muted)).toBeGreaterThanOrEqual(4.5);
    expect(resolveRecapCardTheme({ rating: 96, special: true }, { background: 'not-a-color' }))
      .toMatchObject({ source: 'local', key: 'specialMid' });
    expect(normalizeRecapColor('rgb(142, 124, 255)')).toBe('#8E7CFF');
  });

  it('keeps Preview theme resolution local when no native resolver is supplied', () => {
    expect(resolveRecapCardTheme({ rating: 99, special: true })).toMatchObject({
      source: 'local', key: 'specialHigh', accent: '#8E7CFF',
    });
  });
});
