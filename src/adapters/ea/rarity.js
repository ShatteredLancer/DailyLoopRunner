function safeRead(holder, key) {
  try { return holder?.[key]; } catch { return undefined; }
}

function call(holder, method, ...args) {
  try { return typeof holder?.[method] === 'function' ? holder[method](...args) : null; } catch { return null; }
}

function colorValue(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const channels = [value.r, value.g, value.b].map(Number);
  if (channels.every(Number.isFinite)) return { r: channels[0], g: channels[1], b: channels[2] };
  return null;
}

function firstColorMap(collection, tier) {
  if (!collection) return null;
  const candidates = [tier, Number(tier), 0, '0'].filter((value, index, values) =>
    value !== undefined && value !== null && values.indexOf(value) === index
  );
  for (const key of candidates) {
    const value = call(collection, 'get', key);
    if (value) return value;
  }
  try {
    if (typeof collection.values === 'function') return Array.from(collection.values())[0] || null;
  } catch { }
  if (Array.isArray(collection)) return collection[0] || null;
  if (Array.isArray(collection._collection)) return collection._collection[0] || null;
  return null;
}

export function createEaRarityAdapter(runtime) {
  const repository = safeRead(safeRead(runtime, 'repositories'), 'Rarity');

  function playerTheme(item = {}) {
    const rareflag = Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? 0);
    if (!repository || rareflag <= 1) return null;
    const rarity = call(repository, 'get', rareflag);
    if (!rarity) return null;
    const tier = item?.tier ?? call(item, 'getTier') ?? 0;
    const map = call(rarity, 'getExpColorMap', tier)
      || firstColorMap(safeRead(rarity, 'largeColorMaps'), tier)
      || firstColorMap(safeRead(rarity, 'colorMaps'), tier);
    if (!map) return null;
    const background = colorValue(safeRead(map, 'background'));
    const foreground = colorValue(safeRead(map, 'name'));
    if (!background) return null;
    return Object.freeze({
      background,
      foreground,
      accent: foreground,
      rareflag,
      source: 'EA Rarity',
    });
  }

  return Object.freeze({ playerTheme });
}
