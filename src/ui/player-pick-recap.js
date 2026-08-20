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
    hydrateItem: options.hydrateItem,
    resolveDestination: options.resolveDestination,
    itemDisplayName: options.itemDisplayName,
    resolveNativeTheme: options.resolveNativeTheme,
    resolveFutbinPlayerId: options.resolveFutbinPlayerId,
  });
  return showCardRecap({ ...options, model });
}
