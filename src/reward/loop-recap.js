import {
  createRecapModel,
  recapCardTypeLabel,
  resolveRecapCardTheme,
} from './recap.js';

function itemName(item = {}) {
  return String(item.name || item.commonName || item.lastName || item.definitionId || item.id || 'Unknown player');
}

export function isRecapPlayer(item = {}) {
  return String(item.type || '').toLowerCase() === 'player';
}

export function isRecapSpecial(item = {}) {
  return item.special === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 1;
}

export function recapPlayerTier(item = {}) {
  const explicit = String(item.tier || '').toLowerCase();
  if (['gold', 'silver', 'bronze'].includes(explicit)) return explicit;
  const rating = Number(item.rating || 0);
  if (rating >= 75) return 'gold';
  if (rating >= 65) return 'silver';
  if (rating > 0) return 'bronze';
  return null;
}

export function isRecapRareGoldOrAbove(item = {}) {
  if (!isRecapPlayer(item)) return false;
  if (isRecapSpecial(item)) return true;
  return recapPlayerTier(item) === 'gold'
    && (item.rare === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 0);
}

export function hasRecapRareGoldOrAbove(items = []) {
  return (items || []).some(isRecapRareGoldOrAbove);
}

function flattenReceiptItems(receipts = [], inputItems = null) {
  if (Array.isArray(inputItems)) return inputItems.map((item) => ({ item, packName: item?.packName || null }));
  return (receipts || []).flatMap((receipt) => (receipt?.openedItems || []).map((item) => ({
    item,
    packName: receipt?.packRef?.name || null,
  })));
}

export function createLoopRecapModel(input = {}) {
  const receipts = input.receipts || [];
  const entries = flattenReceiptItems(receipts, input.openedItems);
  const items = entries.map(({ item }) => item);
  const players = entries.filter(({ item }) => isRecapPlayer(item));
  const qualifyingCount = players.filter(({ item }) => isRecapRareGoldOrAbove(item)).length;
  if (input.requireQualifying !== false && qualifyingCount === 0) return null;

  const prices = input.prices instanceof Map
    ? input.prices
    : new Map(Object.entries(input.prices || {}).map(([key, value]) => [Number(key), Number(value)]));
  let specialCount = 0;
  let rareGoldCount = 0;
  let normalGoldCount = 0;
  let normalSilverCount = 0;
  let normalBronzeCount = 0;
  const rows = players.map(({ item, packName }, index) => {
    const rating = Number(item.rating || 0);
    const special = isRecapSpecial(item);
    const tier = recapPlayerTier(item);
    const rare = item.rare === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 0;
    if (special) specialCount++;
    else if (tier === 'gold' && rare) rareGoldCount++;
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
      sourceLabel: item.packName || packName || null,
      item,
      order: index,
    };
    row.theme = resolveRecapCardTheme(row, input.resolveNativeTheme?.(item));
    row.tierLabel = recapCardTypeLabel(row, row.theme);
    return row;
  });
  const status = String(input.status || 'completed');
  const name = String(input.name || 'Loop');
  const requestedPacks = Number(input.requestedPacks || receipts.length);
  const packsOpened = Number(input.packsOpened ?? receipts.filter((receipt) => receipt?.status === 'opened').length);
  const model = createRecapModel({
    kind: 'loop',
    title: `${name} Recap`,
    modalId: 'bronze-loop-loop-recap-modal',
    status,
    reason: input.reason,
    summary: `${packsOpened}/${requestedPacks} pack(s) opened, ${items.length} item(s), ${qualifyingCount} rare gold+ card(s), ${specialCount} special, ${rareGoldCount} rare gold${normalGoldCount || normalSilverCount || normalBronzeCount ? `, ${normalGoldCount} common gold, ${normalSilverCount} silver, ${normalBronzeCount} bronze` : ''}`,
    rows,
  });
  return Object.freeze({
    ...model,
    name,
    receipts,
    requestedPacks,
    packsOpened,
    itemCount: items.length,
    playerCount: players.length,
    qualifyingCount,
    hasQualifyingCards: qualifyingCount > 0,
    specialCount,
    rareGoldCount,
    normalGoldCount,
    normalSilverCount,
    normalBronzeCount,
  });
}
