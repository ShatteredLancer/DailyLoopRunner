import {
  createPlayerPickRecapModel,
  createPlayerPickRecapPreviewModel,
} from '../reward/player-pick-recap.js';
import { showCardRecap } from './card-recap.js';

export { createPlayerPickRecapModel, createPlayerPickRecapPreviewModel };

export function showPlayerPickRecap(options = {}) {
  const model = options.model || createPlayerPickRecapModel(options.pickResults, {
    name: options.name,
    status: options.status,
    reason: options.reason,
    itemDisplayName: options.itemDisplayName,
    resolveNativeTheme: options.resolveNativeTheme,
  });
  return showCardRecap({ ...options, model });
}
