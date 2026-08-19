export const PLAYER_PICK_SELECTION_MODES = Object.freeze([
  'rating-auto',
  'rating-review',
  'special-price',
  'special-manual',
]);

export const PLAYER_PICK_SELECTION_MODE_LABELS = Object.freeze({
  'rating-auto': 'Rating first',
  'rating-review': 'Rating first, review protected ties',
  'special-price': 'Special price first',
  'special-manual': 'Always review specials',
});

export function normalizePlayerPickSelectionMode(value, fallback = 'rating-auto') {
  const requested = String(value || '').trim().toLowerCase();
  if (PLAYER_PICK_SELECTION_MODES.includes(requested)) return requested;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return PLAYER_PICK_SELECTION_MODES.includes(normalizedFallback)
    ? normalizedFallback
    : 'rating-auto';
}
