import {
  createReceiptDestinationResolver,
  createRecapModel,
  hydrateRecapItem,
  recapCardTypeLabel,
  recapItemDisplayName,
  resolveRecapCardTheme,
} from './recap.js';
import {
  isRecapPlayer,
  isRecapRareGoldOrAbove,
  isRecapSpecial,
  recapPlayerTier,
} from './loop-recap.js';
import { isRarePlayerCard } from '../domain/player-rarity.js';

export function createBatchOpenRecapModel(input = {}) {
  const receipts = input.receipts || [];
  const entries = receipts.length
    ? receipts.flatMap((receipt) => {
        const resolveDestination = createReceiptDestinationResolver(receipt);
        return (receipt?.openedItems || []).map((item) => ({
          item,
          sourceLabel: receipt?.packRef?.name || null,
          destination: resolveDestination(item),
        }));
      })
    : (input.openedItems || []).map((item) => ({
        item,
        sourceLabel: item?.packName || item?.sourceLabel || null,
        destination: item?.destination || item?.pile || null,
      }));
  const items = entries.map(({ item }) => item);
  const prices = input.prices instanceof Map
    ? input.prices
    : new Map(Object.entries(input.prices || {}).map(([key, value]) => [Number(key), Number(value)]));
  let playerCount = 0;
  let specialCount = 0;
  let normalGoldCount = 0;
  let normalSilverCount = 0;
  let normalBronzeCount = 0;
  let qualifyingCount = 0;
  const rows = [];

  for (const { item, sourceLabel, destination } of entries) {
    const recapItem = hydrateRecapItem(item, input.hydrateItem);
    if (!isRecapPlayer(recapItem)) continue;
    playerCount++;
    const rating = Number(recapItem.rating || 0);
    const special = isRecapSpecial(recapItem);
    const tier = recapPlayerTier(recapItem);
    const rare = isRarePlayerCard(recapItem);
    if (isRecapRareGoldOrAbove(recapItem)) qualifyingCount++;
    if (special) specialCount++;
    else if (tier === 'gold') normalGoldCount++;
    else if (tier === 'silver') normalSilverCount++;
    else if (tier === 'bronze') normalBronzeCount++;
    const row = {
      name: recapItemDisplayName(recapItem),
      rating,
      tier,
      rare,
      special,
      duplicate: recapItem.duplicate === true || Number(recapItem.duplicateId || 0) > 0,
      tradeable: recapItem.tradeable === true,
      destination: input.resolveDestination?.(item) || destination,
      price: special ? prices.get(Number(item.definitionId || recapItem.definitionId || 0)) || null : null,
      showPrice: special,
      sourceLabel,
      futbinPlayerId: input.resolveFutbinPlayerId?.(recapItem) ?? null,
      item,
    };
    row.theme = resolveRecapCardTheme(row, input.resolveNativeTheme?.(recapItem));
    row.tierLabel = recapCardTypeLabel(row, row.theme);
    rows.push(row);
  }

  const status = String(input.status || 'completed');
  const requestedPacks = Number(input.requestedPacks || receipts.length);
  const packsOpened = Number(input.packsOpened ?? receipts.length);
  const skippedPacks = Number(input.skippedPacks || 0);
  const omittedCount = Math.max(0, items.length - playerCount);
  const model = createRecapModel({
    kind: 'batch',
    title: status === 'preview' ? 'Batch Open Recap Preview' : 'Batch Open Recap',
    modalId: 'bronze-loop-batch-recap-modal',
    status,
    reason: input.reason,
    summary: `${packsOpened}/${requestedPacks} pack(s) opened, ${items.length} item(s), ${specialCount} special, ${normalGoldCount} gold, ${normalSilverCount} silver, ${normalBronzeCount} bronze${skippedPacks ? `, ${skippedPacks} skipped` : ''}${omittedCount ? `, ${omittedCount} other item(s)` : ''}`,
    rows,
  });
  return Object.freeze({
    ...model,
    requestedPacks,
    packsOpened,
    skippedPacks,
    itemCount: items.length,
    playerCount,
    normalGoldCount,
    normalSilverCount,
    normalBronzeCount,
    groupedPlayerCount: playerCount - specialCount,
    omittedCount,
    qualifyingCount,
    hasQualifyingCards: qualifyingCount > 0,
  });
}

export function createBatchOpenRecapPreviewModel(options = {}) {
  const samples = [
    { rating: 99, rareflag: 9, special: true },
    { rating: 97, rareflag: 8, special: true },
    { rating: 94, rareflag: 7, special: true },
    { rating: 91, rareflag: 1 },
    { rating: 88, rareflag: 1 },
    { rating: 85, rareflag: 1 },
    { rating: 84, rareflag: 0 },
    { rating: 74, rareflag: 1 },
    { rating: 63, rareflag: 0 },
  ];
  const openedItems = Array.from({ length: 23 }, (_, index) => {
    const sample = samples[index % samples.length];
    return {
      id: index + 1,
      definitionId: 101 + index,
      type: 'player',
      name: `Preview Player ${String(index + 1).padStart(2, '0')}`,
      rating: sample.rating,
      rareflag: sample.rareflag,
      rare: sample.rareflag > 0,
      special: sample.special === true,
      tier: sample.rating >= 75 ? 'gold' : sample.rating >= 65 ? 'silver' : 'bronze',
      duplicate: index % 5 === 0,
      tradeable: index % 3 === 0,
      destination: ['club', 'storage', 'transfer', 'unassigned'][index % 4],
    };
  });
  return createBatchOpenRecapModel({
    status: 'preview',
    reason: 'Preview data only; no pack was opened',
    requestedPacks: 12,
    packsOpened: 12,
    openedItems,
    prices: new Map(openedItems.filter((item) => item.special).map((item, index) => [item.definitionId, 1250000 - index * 35000])),
    resolveNativeTheme: options.resolveNativeTheme,
  });
}
