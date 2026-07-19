import { describe, expect, it } from 'vitest';
import {
  createPackHighlightModel,
  formatPackHighlightNotification,
  normalizeRewardAlertSettings,
} from '../../src/reward/pack-highlight.js';

describe('pack highlight model', () => {
  it('includes only special cards at or above the configured threshold', () => {
    const model = createPackHighlightModel({
      packRef: { id: 1, name: 'Reward Pack' },
      openedItems: [
        { id: 1, type: 'player', name: 'Special 94', rating: 94, special: true },
        { id: 2, type: 'player', name: 'Special 93', rating: 93, special: true },
        { id: 3, type: 'player', name: 'Normal 96', rating: 96, special: false },
      ],
    }, { minimumRating: 94 });

    expect(model.cards.map((card) => card.name)).toEqual(['Special 94']);
    expect(model.maxRating).toBe(94);
  });

  it('supports reward packs whose player items are known to be special from the pack context', () => {
    const model = createPackHighlightModel({
      packRef: { name: 'TOTW Pack' },
      openedItems: [{ id: 4, type: 'player', name: 'TOTW Player', rating: 95, special: false }],
      details: { assumeTotwReward: true },
    });
    expect(model.cards).toHaveLength(1);
    expect(model.cards[0].special).toBe(true);
  });

  it('normalizes settings and formats one batched notification per pack', () => {
    const settings = normalizeRewardAlertSettings({ minimumRating: 120, ntfyTopic: ' topic ' });
    expect(settings.minimumRating).toBe(99);
    expect(settings.ntfyTopic).toBe('topic');
    const message = formatPackHighlightNotification({
      pack: { name: 'Pack' },
      cards: [
        { name: 'A', rating: 97, duplicate: true, tradeable: false },
        { name: 'B', rating: 95, duplicate: false, tradeable: true },
      ],
    });
    expect(message.title).toContain('2 high-rated');
    expect(message.body).toContain('A - 97 (duplicate, untradeable)');
    expect(message.body).toContain('B - 95 (tradeable)');
  });
});
