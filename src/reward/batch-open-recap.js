function itemName(item = {}) {
  return String(item.name || item.commonName || item.lastName || item.definitionId || item.id || 'Unknown player');
}

function isPlayer(item = {}) {
  return String(item.type || '').toLowerCase() === 'player';
}

function isSpecial(item = {}) {
  return item.special === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 1;
}

function playerTier(item = {}) {
  const explicit = String(item.tier || '').toLowerCase();
  if (['gold', 'silver', 'bronze'].includes(explicit)) return explicit;
  const rating = Number(item.rating || 0);
  if (rating >= 75) return 'gold';
  if (rating >= 65) return 'silver';
  if (rating > 0) return 'bronze';
  return null;
}

function playerRarity(item = {}) {
  return item.rare === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 0 ? 'rare' : 'common';
}

function titleCase(value) {
  const text = String(value || '');
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : '';
}

export function createBatchOpenRecapModel(input = {}) {
  const receipts = input.receipts || [];
  const items = input.openedItems || receipts.flatMap((receipt) => receipt?.openedItems || []);
  const rows = [];
  const groupedPlayers = new Map();
  const prices = input.prices instanceof Map ? input.prices : new Map(Object.entries(input.prices || {}).map(([key, value]) => [Number(key), Number(value)]));
  let playerCount = 0;
  let specialCount = 0;
  let normalGoldCount = 0;
  let normalSilverCount = 0;
  let normalBronzeCount = 0;
  let groupedPlayerCount = 0;

  for (const item of items) {
    if (!isPlayer(item)) continue;
    playerCount++;
    const rating = Number(item.rating || 0);
    if (isSpecial(item)) {
      specialCount++;
      rows.push(Object.freeze({
        kind: 'special',
        rating,
        name: itemName(item),
        duplicate: item.duplicate === true || Number(item.duplicateId || 0) > 0,
        tradeable: item.tradeable === true,
        price: prices.get(Number(item.definitionId || 0)) || null,
        item,
      }));
    } else {
      const tier = playerTier(item);
      if (!tier) continue;
      const rarity = playerRarity(item);
      groupedPlayerCount++;
      if (tier === 'gold') normalGoldCount++;
      else if (tier === 'silver') normalSilverCount++;
      else normalBronzeCount++;
      const key = `${rating}:${rarity}:${tier}`;
      const group = groupedPlayers.get(key) || { rating, rarity, tier, count: 0 };
      group.count++;
      groupedPlayers.set(key, group);
    }
  }

  for (const group of groupedPlayers.values()) {
    rows.push(Object.freeze({
      kind: 'group',
      rating: group.rating,
      rarity: group.rarity,
      tier: group.tier,
      label: `${titleCase(group.rarity)} ${titleCase(group.tier)}`,
      count: group.count,
    }));
  }
  rows.sort((a, b) => {
    const ratingOrder = b.rating - a.rating;
    if (ratingOrder) return ratingOrder;
    if (a.kind !== b.kind) return a.kind === 'special' ? -1 : 1;
    if (a.kind === 'group' && a.rarity !== b.rarity) return a.rarity === 'rare' ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return Object.freeze({
    status: String(input.status || 'completed'),
    reason: input.reason ? String(input.reason) : null,
    requestedPacks: Number(input.requestedPacks || receipts.length),
    packsOpened: Number(input.packsOpened ?? receipts.length),
    skippedPacks: Number(input.skippedPacks || 0),
    itemCount: items.length,
    playerCount,
    specialCount,
    normalGoldCount,
    normalSilverCount,
    normalBronzeCount,
    groupedPlayerCount,
    omittedCount: Math.max(0, items.length - specialCount - groupedPlayerCount),
    rows: Object.freeze(rows),
  });
}

export function createBatchOpenRecapPreviewModel() {
  return createBatchOpenRecapModel({
    status: 'preview',
    requestedPacks: 3,
    packsOpened: 3,
    openedItems: [
      { id: 1, definitionId: 101, type: 'player', name: 'Preview Special A', rating: 97, special: true, duplicate: false },
      { id: 2, definitionId: 102, type: 'player', name: 'Preview Special B', rating: 95, special: true, duplicate: true },
      { id: 3, type: 'player', name: 'Preview Gold', rating: 89, tier: 'gold', rare: true },
      { id: 4, type: 'player', name: 'Preview Gold', rating: 89, tier: 'gold', rare: true },
      { id: 5, type: 'player', name: 'Preview Gold', rating: 84, tier: 'gold', rare: false },
      { id: 6, type: 'player', name: 'Preview Silver', rating: 74, tier: 'silver', rare: true },
      { id: 7, type: 'player', name: 'Preview Bronze', rating: 63, tier: 'bronze', rare: false },
    ],
    prices: new Map([[101, 1250000], [102, 480000]]),
  });
}
