import { loadPriceQuotes } from '../trade/price-quotes.js';

export async function loadPlayerPickPrices(options = {}) {
  const ids = [...new Set((options.items || []).map((item) => Number(item?.definitionId || 0)).filter(Boolean))];
  const loaded = await loadPriceQuotes({
    ...options,
    definitionIds: ids,
    provider: 'auto',
    fallbackOnPartial: false,
  });
  return {
    prices: new Map(loaded.quotes.map((entry) => [entry.definitionId, entry.price])),
    ids: loaded.ids,
    source: loaded.source,
    attempts: loaded.attempts,
  };
}
