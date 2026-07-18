import { selectInventoryPlayers as selectRequirementPlayers } from './inventory.js';
import { selectRatingPlayers } from './rating.js';

export function selectInventoryPlayers(input = {}) {
  if (input.mode === 'rating') return selectRatingPlayers(input);
  return selectRequirementPlayers({ ...input, mode: input.mode || 'requirements' });
}
