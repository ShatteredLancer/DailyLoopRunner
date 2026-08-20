export const RECAP_PAGE_SIZE = 15;

const RECAP_DESTINATIONS = new Set(['club', 'storage', 'transfer', 'unassigned', 'blocked', 'unknown']);

const BASE_BACKGROUND = '#171B21';
const DEFAULT_FOREGROUND = '#F4F6F8';
const DEFAULT_MUTED = '#AAB4C2';

export function createFutbinPlayerUrl(futbinPlayerId, season = 26) {
  const id = Number(futbinPlayerId);
  const year = Number(season);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(year) || year < 20 || year > 99) return null;
  return `https://www.futbin.com/${year}/player/${id}/1`;
}

function nonEmptyText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function playerNameText(value) {
  const text = nonEmptyText(value);
  return text && !/^\d+$/.test(text) ? text : null;
}

export function recapItemDisplayName(item = {}) {
  const staticData = item?._staticData || {};
  const names = [
    [item?.firstName, item?.lastName].map(playerNameText).filter(Boolean).join(' '),
    item?.name,
    item?.commonName,
    item?.lastName,
    [staticData.firstName, staticData.lastName].map(playerNameText).filter(Boolean).join(' '),
    staticData.name,
    staticData.commonName,
    staticData.lastName,
  ];
  return playerNameText(names.find((value) => playerNameText(value)))
    || nonEmptyText(item?.definitionId)
    || nonEmptyText(item?.id)
    || 'Unknown player';
}

export function hydrateRecapItem(item = {}, hydrateItem = null) {
  if (typeof hydrateItem !== 'function') return item;
  const hydrated = hydrateItem(item);
  if (!hydrated || typeof hydrated !== 'object' || hydrated === item) return item;
  return hydrated;
}

export function compactRecapSourceLabel(value, maxLength = 24) {
  const source = nonEmptyText(value)?.replace(/\s+/g, ' ');
  if (!source) return null;
  if (/provisions/i.test(source) && /pack/i.test(source)) return 'Provisions';

  const pick = source.match(/(?:(\d+)\s+of\s+(\d+)\s+)?(\d{2})\+.*(?:player\s+)?pick/i);
  if (pick) return `${pick[1] && pick[2] ? `${pick[1]}/${pick[2]} ` : ''}${pick[3]}+ Pick`;

  const countRating = source.match(/(\d+)\s*x\s*(\d{2})\+/i);
  if (countRating) return `${countRating[1]}x${countRating[2]}+`;

  const compact = source
    .replace(/\s+Players?\s+Pack$/i, '')
    .replace(/\s+Pack$/i, '')
    .replace(/^Repeatable\s+/i, '')
    .trim();
  const limit = Math.max(8, Number(maxLength) || 24);
  return compact.length > limit ? `${compact.slice(0, limit - 3).trimEnd()}...` : compact;
}

function recapItemId(value = {}) {
  const id = Number(value?.id || value?.ref?.id || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function recapDefinitionId(value = {}) {
  const definitionId = Number(value?.definitionId || value?.ref?.definitionId || 0);
  return Number.isInteger(definitionId) && definitionId > 0 ? definitionId : null;
}

function recapDestination(value, fallback = 'unknown') {
  const destination = String(value || '').toLowerCase();
  return RECAP_DESTINATIONS.has(destination) ? destination : fallback;
}

export function createReceiptDestinationResolver(receipt = {}) {
  const byItemId = new Map();
  const byDefinitionId = new Map();
  const refs = [
    ...(receipt.routedItemRefs || []).map((ref) => ({ ref, destination: recapDestination(ref?.pile) })),
    ...(receipt.reservedItemRefs || []).map((ref) => ({ ref, destination: 'unassigned' })),
    ...(receipt.pendingItemRefs || []).map((ref) => ({ ref, destination: 'unassigned' })),
  ];
  for (const entry of refs) {
    const id = recapItemId(entry.ref);
    const definitionId = recapDefinitionId(entry.ref);
    if (id && !byItemId.has(id)) byItemId.set(id, entry.destination);
    if (definitionId) {
      const destinations = byDefinitionId.get(definitionId) || [];
      destinations.push(entry.destination);
      byDefinitionId.set(definitionId, destinations);
    }
  }
  return (item = {}) => {
    const id = recapItemId(item);
    if (id && byItemId.has(id)) return byItemId.get(id);
    const definitionDestinations = byDefinitionId.get(recapDefinitionId(item)) || [];
    if (definitionDestinations.length === 1) return definitionDestinations[0];
    return recapDestination(item?.pile || item?.ref?.pile, 'unassigned');
  };
}

export const RECAP_TIER_COLORS = Object.freeze({
  bronze: Object.freeze({ label: 'Bronze', accent: '#B7793E', background: '#45281C' }),
  silver: Object.freeze({ label: 'Silver', accent: '#AEB7C2', background: '#46515F' }),
  commonGold: Object.freeze({ label: 'Common Gold', accent: '#A88638', background: '#302B22' }),
  rareGoldLow: Object.freeze({ label: 'Rare Gold 85-', accent: '#D6AA35', background: '#493B15' }),
  rareGoldMid: Object.freeze({ label: 'Rare Gold 86-88', accent: '#F0C34E', background: '#604A12' }),
  rareGoldHigh: Object.freeze({ label: 'Rare Gold 89+', accent: '#F3D98B', background: '#5F563A' }),
  specialLow: Object.freeze({ label: 'Special 94-', accent: '#8E7CFF', background: '#324A7A' }),
  specialMid: Object.freeze({ label: 'Special 95-97', accent: '#2FC6C4', background: '#153F42' }),
  specialHigh: Object.freeze({ label: 'Special 98-99', accent: '#B45BD2', background: '#421F39' }),
  unknown: Object.freeze({ label: 'Player', accent: '#64748B' }),
});

function clampByte(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(255, Math.round(number)));
}

function rgbToHex(red, green, blue) {
  const values = [red, green, blue].map(clampByte);
  if (values.some((value) => value === null)) return null;
  return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function normalizeRecapColor(value) {
  if (value && typeof value === 'object') return rgbToHex(value.r, value.g, value.b);
  const text = String(value || '').trim();
  const shortHex = text.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) return `#${shortHex[1].split('').map((part) => `${part}${part}`).join('')}`.toUpperCase();
  const hex = text.match(/^#([0-9a-f]{6})$/i);
  if (hex) return `#${hex[1].toUpperCase()}`;
  const rgb = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,[^)]*)?\)$/i);
  return rgb ? rgbToHex(rgb[1], rgb[2], rgb[3]) : null;
}

function hexChannels(color) {
  const normalized = normalizeRecapColor(color);
  if (!normalized) return null;
  return [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
}

function luminance(color) {
  const channels = hexChannels(color);
  if (!channels) return null;
  const linear = channels.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function recapContrastRatio(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  if (a === null || b === null) return 0;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mixColors(foreground, background = BASE_BACKGROUND, weight = 0.18) {
  const front = hexChannels(foreground);
  const back = hexChannels(background);
  if (!front || !back) return BASE_BACKGROUND;
  return rgbToHex(...front.map((value, index) => value * weight + back[index] * (1 - weight)));
}

function contrastForeground(background) {
  return recapContrastRatio(background, '#FFFFFF') >= recapContrastRatio(background, '#111318')
    ? '#FFFFFF'
    : '#111318';
}

function localTierKey(card = {}) {
  const rating = Number(card.rating || 0);
  if (card.special === true) {
    if (rating >= 98) return 'specialHigh';
    if (rating >= 95) return 'specialMid';
    return 'specialLow';
  }
  const tier = String(card.tier || '').toLowerCase();
  if (tier === 'bronze' || (rating > 0 && rating <= 64)) return 'bronze';
  if (tier === 'silver' || (rating >= 65 && rating <= 74)) return 'silver';
  if (tier === 'gold' || rating >= 75) {
    if (card.rare !== true) return 'commonGold';
    if (rating >= 89) return 'rareGoldHigh';
    if (rating >= 86) return 'rareGoldMid';
    return 'rareGoldLow';
  }
  return 'unknown';
}

function localTheme(card) {
  const key = localTierKey(card);
  const tier = RECAP_TIER_COLORS[key];
  const background = tier.background || mixColors(tier.accent);
  return Object.freeze({
    key,
    label: tier.label,
    source: 'local',
    accent: tier.accent,
    background,
    foreground: DEFAULT_FOREGROUND,
    muted: DEFAULT_MUTED,
    ratingBackground: tier.accent,
    rating: contrastForeground(tier.accent),
  });
}

export function recapCardTypeLabel(card = {}, theme = null) {
  if (card.special === true) return theme?.label || localTheme(card).label;
  const rating = Number(card.rating || 0);
  const tier = String(card.tier || (rating >= 75 ? 'gold' : rating >= 65 ? 'silver' : rating > 0 ? 'bronze' : 'player'));
  const normalizedTier = `${tier.slice(0, 1).toUpperCase()}${tier.slice(1).toLowerCase()}`;
  if (!['Gold', 'Silver', 'Bronze'].includes(normalizedTier)) return theme?.label || 'Player';
  return `${card.rare === true ? 'Rare' : 'Common'} ${normalizedTier}`;
}

export function resolveRecapCardTheme(card = {}, nativeTheme = null) {
  const fallback = localTheme(card);
  if (card.special !== true || !nativeTheme) return fallback;
  const background = normalizeRecapColor(nativeTheme.background);
  const requestedForeground = normalizeRecapColor(nativeTheme.foreground || nativeTheme.name);
  if (!background) return fallback;
  const automaticForeground = recapContrastRatio(background, '#FFFFFF') >= recapContrastRatio(background, '#111318')
    ? '#FFFFFF'
    : '#111318';
  const foreground = requestedForeground && recapContrastRatio(background, requestedForeground) >= 4.5
    ? requestedForeground
    : automaticForeground;
  if (recapContrastRatio(background, foreground) < 4.5) return fallback;
  const accent = normalizeRecapColor(nativeTheme.accent || nativeTheme.name) || fallback.accent;
  return Object.freeze({
    ...fallback,
    source: 'ea',
    accent,
    background,
    foreground,
    muted: foreground,
    ratingBackground: accent,
    rating: contrastForeground(accent),
  });
}

export function createRecapModel(input = {}) {
  const rows = (input.rows || []).map((row, index) => Object.freeze({
    ...row,
    sourceTitle: row.sourceTitle || row.sourceLabel || null,
    sourceLabel: compactRecapSourceLabel(row.sourceLabel),
    futbinUrl: row.futbinUrl || createFutbinPlayerUrl(row.futbinPlayerId, input.futbinSeason),
    order: Number(row.order ?? index),
  }));
  rows.sort((a, b) =>
    Number(b.rating || 0) - Number(a.rating || 0)
    || Number(b.special === true) - Number(a.special === true)
    || a.order - b.order
  );
  const status = String(input.status || 'completed');
  return Object.freeze({
    kind: String(input.kind || 'recap'),
    title: String(input.title || 'Recap'),
    modalId: String(input.modalId || 'bronze-loop-recap-modal'),
    status,
    reason: input.reason ? String(input.reason) : null,
    summary: String(input.summary || ''),
    rows: Object.freeze(rows),
    totalRows: rows.length,
    pageSize: RECAP_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(rows.length / RECAP_PAGE_SIZE)),
    specialCount: rows.filter((row) => row.special === true).length,
    meta: Object.freeze({ ...(input.meta || {}) }),
  });
}

export function getRecapPage(model, requestedPage = 1) {
  const pageCount = Math.max(1, Number(model?.pageCount || 1));
  const page = Math.max(1, Math.min(pageCount, Math.floor(Number(requestedPage || 1))));
  const pageSize = Math.max(1, Number(model?.pageSize || RECAP_PAGE_SIZE));
  const start = (page - 1) * pageSize;
  const rows = (model?.rows || []).slice(start, start + pageSize);
  return Object.freeze({
    page,
    pageCount,
    pageSize,
    totalRows: Number(model?.totalRows || 0),
    start: rows.length ? start + 1 : 0,
    end: start + rows.length,
    rows,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  });
}
