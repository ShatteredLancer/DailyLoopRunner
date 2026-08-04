function callBoolean(item, method) {
  try {
    const value = item?.[method]?.();
    return typeof value === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

export function readPlayerRareFlag(item = {}) {
  const values = [
    item.rareflag,
    item.rareFlag,
    item._rareflag,
    item._data?.rareflag,
    item._data?.rareFlag,
    item._staticData?.rareflag,
    item._staticData?.rareFlag,
  ].map(Number).filter(Number.isFinite);
  if (item.special === true || callBoolean(item, 'isSpecial') === true) values.push(2);
  if (item.rare === true || callBoolean(item, 'isRare') === true) values.push(1);
  return values.length ? Math.max(0, ...values) : 0;
}

export function isRarePlayerCard(item = {}) {
  return readPlayerRareFlag(item) > 0;
}

export function isSpecialPlayerCard(item = {}) {
  return readPlayerRareFlag(item) > 1;
}

export function normalPlayerRarity(item = {}) {
  if (isSpecialPlayerCard(item)) return 'special';
  return isRarePlayerCard(item) ? 'rare' : 'common';
}
