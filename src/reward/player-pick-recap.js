import { createRecapModel, recapCardTypeLabel, resolveRecapCardTheme } from './recap.js';

function itemName(item, displayName) {
  if (typeof displayName === 'function') return String(displayName(item));
  return String(item?.name || item?.commonName || item?.lastName || item?.definitionId || item?.id || 'Unknown player');
}

export function createPlayerPickRecapModel(pickResults = [], options = {}) {
  const entries = Array.isArray(pickResults) ? pickResults : [];
  const cards = entries.flatMap((entry) => entry?.pickedCards || []);
  const status = String(options.status || 'completed');
  if (!cards.length && status === 'completed' && !options.reason) return null;
  const ratings = cards.map((card) => Number(card.rating || card.item?.rating || 0));
  const destinations = {};
  const rows = entries.flatMap((entry, pickIndex) => (entry?.pickedCards || []).map((card) => {
    const item = card.item || {};
    const destination = card.destination || 'unknown';
    destinations[destination] = (destinations[destination] || 0) + 1;
    const row = {
      name: itemName(item, options.itemDisplayName),
      rating: Number(card.rating || item.rating || 0),
      tier: item.tier,
      rare: item.rare === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 0,
      special: card.special === true,
      duplicate: card.duplicate === true,
      tradeable: typeof card.tradeable === 'boolean' ? card.tradeable : item.tradeable,
      price: card.price ?? null,
      showPrice: true,
      destination,
      sourceLabel: `P${pickIndex + 1}${entry?.resumed === true ? 'r' : ''}`,
      card,
      pickIndex: pickIndex + 1,
      resumed: entry?.resumed === true,
      item,
    };
    row.theme = resolveRecapCardTheme(row, options.resolveNativeTheme?.(item));
    row.tierLabel = recapCardTypeLabel(row, row.theme);
    return row;
  }));
  const specialCount = rows.filter((row) => row.special).length;
  const duplicateCount = rows.filter((row) => row.duplicate).length;
  const highRatedCount = rows.filter((row) => row.rating >= 91).length;
  const resumedCount = entries.filter((entry) => entry?.resumed).length;
  const destinationSummary = Object.entries(destinations).map(([destination, count]) => `${count} ->${destination.toUpperCase()}`).join(', ');
  const model = createRecapModel({
    kind: 'pick',
    title: status === 'preview' ? 'Player Pick Recap Preview' : `Player Pick Recap: ${String(options.name || '')}`,
    modalId: 'bronze-loop-recap-modal',
    status,
    reason: options.reason,
    summary: `${entries.length} pick(s), ${cards.length} card(s)${ratings.length ? `, rating ${Math.min(...ratings)}-${Math.max(...ratings)}` : ''}, ${specialCount} special, ${duplicateCount} duplicate, ${highRatedCount} rated 91+${destinationSummary ? `, ${destinationSummary}` : ''}${resumedCount ? `, ${resumedCount} resumed` : ''}`,
    rows,
  });
  return Object.freeze({
    ...model,
    cards,
    entries,
    minRating: ratings.length ? Math.min(...ratings) : 0,
    maxRating: ratings.length ? Math.max(...ratings) : 0,
    duplicateCount,
    highRatedCount,
    resumedCount,
    destinations,
  });
}

export function createPlayerPickRecapPreviewModel(options = {}) {
  const tiers = [
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
  const pickResults = Array.from({ length: 23 }, (_, index) => {
    const sample = tiers[index % tiers.length];
    const item = {
      id: index + 1,
      definitionId: 1000 + index,
      type: 'player',
      name: `Preview Player ${String(index + 1).padStart(2, '0')}`,
      rating: sample.rating,
      rareflag: sample.rareflag,
      rare: sample.rareflag > 0,
      special: sample.special === true,
      tier: sample.rating >= 75 ? 'gold' : sample.rating >= 65 ? 'silver' : 'bronze',
      tradeable: index % 3 === 0,
    };
    return {
      resumed: index % 7 === 0,
      pickedCards: [{
        item,
        rating: item.rating,
        special: item.special,
        duplicate: index % 4 === 0,
        destination: ['club', 'storage', 'transfer'][index % 3],
        price: item.special ? 100000 + index * 25000 : 5000 + index * 1000,
      }],
    };
  });
  return createPlayerPickRecapModel(pickResults, {
    ...options,
    name: 'Preview',
    status: 'preview',
    reason: 'Preview data only; no Player Pick was redeemed',
  });
}
