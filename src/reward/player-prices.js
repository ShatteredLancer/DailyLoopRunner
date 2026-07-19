function definitionIds(items) {
  return [...new Set((items || []).map((item) => Number(item?.definitionId || 0)).filter(Boolean))];
}

function parseJson(text, source) {
  try { return JSON.parse(text); } catch { throw new Error(`${source} returned invalid JSON`); }
}

function futGgPrices(text) {
  const prices = new Map();
  const response = parseJson(text, 'FUT.GG');
  for (const entry of response?.data || []) {
    const definitionId = Number(entry?.eaId || entry?.definitionId || 0);
    const price = Number(entry?.price);
    if (definitionId && Number.isFinite(price) && price > 0) prices.set(definitionId, price);
  }
  return prices;
}

function futNextPrices(text) {
  const prices = new Map();
  const response = parseJson(text, 'FUTNext');
  for (const entry of Array.isArray(response) ? response : []) {
    const definitionId = Number(entry?.definitionId || entry?.eaId || 0);
    const price = Number(entry?.prices?.[0]);
    if (definitionId && Number.isFinite(price) && price > 0) prices.set(definitionId, price);
  }
  return prices;
}

export async function loadPlayerPickPrices(options = {}) {
  if (typeof options.requestText !== 'function') throw new TypeError('requestText is required');
  const ids = definitionIds(options.items);
  const platform = String(options.platform || 'pc').toLowerCase();
  const result = {
    prices: new Map(),
    ids,
    source: null,
    attempts: [],
  };
  if (!ids.length) return result;

  const futGgUrl = `https://www.fut.gg/api/fut/player-prices/26/?ids=${encodeURIComponent(ids.join(','))}&platform=${encodeURIComponent(platform)}`;
  try {
    const text = await options.requestText(futGgUrl, {
      sendCookies: true,
      headers: {
        Accept: 'application/json, text/plain, */*',
        Referer: options.referer || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    result.prices = futGgPrices(text);
    result.attempts.push({ source: 'FUT.GG', status: result.prices.size ? 'loaded' : 'empty' });
    if (result.prices.size) {
      result.source = 'FUT.GG';
      return result;
    }
  } catch (error) {
    result.attempts.push({ source: 'FUT.GG', status: 'error', reason: error?.message || String(error) });
  }

  const futNextUrl = `https://enhancer-api.futnext.com/players/prices?ids=${encodeURIComponent(ids.join('_'))}&platform=${encodeURIComponent(platform)}`;
  try {
    const text = await options.requestText(futNextUrl, {
      sendCookies: false,
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    result.prices = futNextPrices(text);
    result.attempts.push({ source: 'FUTNext', status: result.prices.size ? 'loaded' : 'empty' });
    if (result.prices.size) result.source = 'FUTNext';
  } catch (error) {
    result.attempts.push({ source: 'FUTNext', status: 'error', reason: error?.message || String(error) });
  }
  return result;
}
