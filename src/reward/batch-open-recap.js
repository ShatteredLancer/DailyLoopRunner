import { createRecapModel, recapCardTypeLabel, resolveRecapCardTheme } from './recap.js';
import {
  isRecapPlayer,
  isRecapRareGoldOrAbove,
  isRecapSpecial,
  recapPlayerTier,
} from './loop-recap.js';

function itemName(item = {}) {
  return String(item.name || item.commonName || item.lastName || item.definitionId || item.id || 'Unknown player');
}

export function createBatchOpenRecapModel(input = {}) {
  const receipts = input.receipts || [];
  const items = input.openedItems || receipts.flatMap((receipt) => receipt?.openedItems || []);
  const prices = input.prices instanceof Map
    ? input.prices
    : new Map(Object.entries(input.prices || {}).map(([key, value]) => [Number(key), Number(value)]));
  let playerCount = 0;
  let specialCount = 0;
  let normalGoldCount = 0;
  let normalSilverCount = 0;
  let normalBronzeCount = 0;
  const rows = [];

  for (const item of items) {
    if (!isRecapPlayer(item)) continue;
    playerCount++;
    const rating = Number(item.rating || 0);
    const special = isRecapSpecial(item);
    const tier = recapPlayerTier(item);
    const rare = item.rare === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 0;
    if (special) specialCount++;
    else if (tier === 'gold') normalGoldCount++;
    else if (tier === 'silver') normalSilverCount++;
    else if (tier === 'bronze') normalBronzeCount++;
    const row = {
      name: itemName(item),
      rating,
      tier,
      rare,
      special,
      duplicate: item.duplicate === true || Number(item.duplicateId || 0) > 0,
      tradeable: item.tradeable === true,
      price: special ? prices.get(Number(item.definitionId || 0)) || null : null,
      showPrice: special,
      sourceLabel: item.packName || item.sourceLabel || null,
      item,
    };
    row.theme = resolveRecapCardTheme(row, input.resolveNativeTheme?.(item));
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
    qualifyingCount: items.filter(isRecapRareGoldOrAbove).length,
    hasQualifyingCards: items.some(isRecapRareGoldOrAbove),
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
