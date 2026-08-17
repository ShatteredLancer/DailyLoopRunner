function callBoolean(item, method) {
  try {
    const value = item?.[method]?.();
    return typeof value === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

const PLAYER_CARD_HOLDERS = ['_data', 'data', '_staticData', 'staticData'];

function cardHolders(item = {}) {
  return [item, ...PLAYER_CARD_HOLDERS.map((field) => item?.[field])]
    .filter((holder) => holder && typeof holder === 'object');
}

function meaningfulCardState(value, options = {}) {
  if (value === null || value === undefined || value === false) return false;
  if (Array.isArray(value)) return options.allowEmptyArray === true || value.length > 0;
  if (typeof value === 'object') return options.allowEmptyObject === true || Object.keys(value).length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== '' && !['0', '-1', 'false', 'none', 'null'].includes(normalized);
  }
  return value === true;
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

function playerDefinitionId(item = {}) {
  return Number(item.definitionId ?? item.ref?.definitionId ?? item._data?.definitionId ?? item._staticData?.definitionId ?? 0);
}

function playerRating(item = {}) {
  return Number(item.rating ?? item._rating ?? item._data?.rating ?? item._staticData?.rating ?? 0);
}

export function hasPlayerUpgrades(item = {}) {
  return cardHolders(item).some((holder) => meaningfulCardState(holder?.upgrades, {
    // EA/FSU use null for a base card; an allocated upgrades collection marks a modified card.
    allowEmptyArray: true,
    allowEmptyObject: true,
  }));
}

export function hasPlayerCosmetics(item = {}) {
  if (item.cosmetic === true) return true;
  return cardHolders(item).some((holder) => meaningfulCardState(holder?.cosmetics));
}

export function isPlayerEvolutionCard(item = {}) {
  if (item.evolution === true) return true;
  if (callBoolean(item, 'isEvolution') === true || callBoolean(item, 'isEvo') === true) return true;
  if (hasPlayerUpgrades(item)) return true;
  const evolutionFields = ['isEvolution', 'isEvo', 'evolutionId', 'evoId', 'evolutionLevel', 'evolutionStatus'];
  return cardHolders(item).some((holder) => evolutionFields.some((field) => (
    typeof holder?.[field] !== 'function' && meaningfulCardState(holder?.[field])
  )));
}

export function isSamePlayerCardVersion(item = {}, candidate = {}) {
  const definitionId = playerDefinitionId(item);
  if (!definitionId || definitionId !== playerDefinitionId(candidate)) return false;

  const rating = playerRating(item);
  const candidateRating = playerRating(candidate);
  if (rating > 0 && candidateRating > 0 && rating !== candidateRating) return false;

  if (isPlayerEvolutionCard(item) !== isPlayerEvolutionCard(candidate)) return false;
  if (hasPlayerCosmetics(item) !== hasPlayerCosmetics(candidate)) return false;

  return readPlayerRareFlag(item) === readPlayerRareFlag(candidate);
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
