export const DEFAULT_REWARD_ALERT_SETTINGS = Object.freeze({
  enabled: true,
  minimumRating: 94,
  highlightEnabled: true,
  desktopEnabled: false,
  ntfyEnabled: false,
  ntfyServer: 'https://ntfy.sh',
  ntfyTopic: '',
  ntfyToken: '',
});

function boundedRating(value, fallback = 94) {
  const rating = Number(value);
  return Number.isFinite(rating) ? Math.max(1, Math.min(99, Math.floor(rating))) : fallback;
}

function normalizedText(value) {
  return String(value || '').trim();
}

export function normalizeRewardAlertSettings(input = {}) {
  return Object.freeze({
    enabled: input.enabled !== false,
    minimumRating: boundedRating(input.minimumRating, DEFAULT_REWARD_ALERT_SETTINGS.minimumRating),
    highlightEnabled: input.highlightEnabled !== false,
    desktopEnabled: input.desktopEnabled === true,
    ntfyEnabled: input.ntfyEnabled === true,
    ntfyServer: normalizedText(input.ntfyServer) || DEFAULT_REWARD_ALERT_SETTINGS.ntfyServer,
    ntfyTopic: normalizedText(input.ntfyTopic),
    ntfyToken: normalizedText(input.ntfyToken),
  });
}

function displayName(item = {}) {
  return normalizedText(item.name || item.commonName || item.lastName || item.definitionId || item.id) || 'Unknown player';
}

export function createPackHighlightModel(receipt = {}, settingsInput = {}, context = {}) {
  const settings = normalizeRewardAlertSettings(settingsInput);
  if (!settings.enabled) return null;
  const assumedSpecial = context.assumeSpecialPlayers === true || receipt.details?.assumeTotwReward === true;
  const cards = (receipt.openedItems || [])
    .filter((item) => String(item?.type || '').toLowerCase() === 'player')
    .map((item) => ({
      id: Number(item.id || 0),
      definitionId: Number(item.definitionId || 0),
      name: displayName(item),
      rating: Number(item.rating || 0),
      special: item.special === true || assumedSpecial,
      duplicate: item.duplicate === true,
      tradeable: item.tradeable === true,
    }))
    .filter((card) => card.special && card.rating >= settings.minimumRating)
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  if (!cards.length) return null;
  return Object.freeze({
    pack: Object.freeze({
      id: Number(receipt.packRef?.id || 0),
      name: normalizedText(receipt.packRef?.name) || normalizedText(context.purpose) || 'Opened pack',
    }),
    purpose: normalizedText(context.purpose),
    threshold: settings.minimumRating,
    cards: Object.freeze(cards.map((card) => Object.freeze(card))),
    maxRating: Math.max(...cards.map((card) => card.rating)),
  });
}

export function formatPackHighlightNotification(model = {}) {
  const cards = model.cards || [];
  const title = cards.length === 1
    ? `${cards[0].rating} special card opened`
    : `${cards.length} high-rated special cards opened`;
  const lines = [model.pack?.name || model.purpose || 'Opened pack'];
  for (const card of cards.slice(0, 8)) {
    const tags = [card.duplicate ? 'duplicate' : null, card.tradeable ? 'tradeable' : 'untradeable']
      .filter(Boolean)
      .join(', ');
    lines.push(`${card.name} - ${card.rating}${tags ? ` (${tags})` : ''}`);
  }
  if (cards.length > 8) lines.push(`+${cards.length - 8} more`);
  return Object.freeze({ title, body: lines.join('\n') });
}
