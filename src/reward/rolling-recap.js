import {
  createRecapModel,
  recapCardTypeLabel,
  resolveRecapCardTheme,
} from './recap.js';
import {
  isRarePlayerCard,
  isSpecialPlayerCard,
} from '../domain/player-rarity.js';

export const ROLLING_RECAP_LIMITS = Object.freeze({
  topCards: 50,
  alertCards: 100,
});

const RECOVERY_ACTIONS = Object.freeze(['totw', 'provisions', 'playerPick', 'goldSink', 'storageSink']);

function boundedInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function boundedRating(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(99, Math.floor(number))) : 0;
}

function displayName(item = {}) {
  return String(item.name || item.commonName || item.lastName || item.definitionId || item.id || 'Unknown player');
}

function tier(item, rating) {
  const explicit = String(item.tier || '').toLowerCase();
  if (['bronze', 'silver', 'gold'].includes(explicit)) return explicit;
  if (rating >= 75) return 'gold';
  if (rating >= 65) return 'silver';
  if (rating > 0) return 'bronze';
  return null;
}

function safeColor(value) {
  if (typeof value === 'string') return value.slice(0, 40);
  if (!value || typeof value !== 'object') return null;
  const channels = ['r', 'g', 'b'].map((key) => Number(value[key]));
  if (channels.some((channel) => !Number.isFinite(channel))) return null;
  return Object.fromEntries(channels.map((channel, index) => [['r', 'g', 'b'][index], Math.max(0, Math.min(255, Math.round(channel)))]));
}

function safeNativeTheme(theme) {
  if (!theme || typeof theme !== 'object') return null;
  const normalized = {
    background: safeColor(theme.background),
    foreground: safeColor(theme.foreground || theme.name),
    accent: safeColor(theme.accent || theme.name),
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function compareCards(left, right) {
  return Number(right.rating || 0) - Number(left.rating || 0)
    || Number(right.special === true) - Number(left.special === true)
    || Number(left.sequence || 0) - Number(right.sequence || 0);
}

function freezeObject(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach((entry) => {
    if (entry && typeof entry === 'object') freezeObject(entry);
  });
  return Object.freeze(value);
}

function normalizeAction(value) {
  const action = String(value || '');
  return RECOVERY_ACTIONS.includes(action) ? action : null;
}

function normalizePrices(value) {
  if (value instanceof Map) return value;
  return new Map(Object.entries(value || {}).map(([key, price]) => [Number(key), Number(price)]));
}

function buildCardSummary(item, sequence, context = {}) {
  const rating = boundedRating(item?.rating);
  const special = context.assumeSpecialPlayers === true || isSpecialPlayerCard(item);
  const rare = special || isRarePlayerCard(item);
  return {
    id: boundedInteger(item?.id),
    definitionId: boundedInteger(item?.definitionId),
    name: displayName(item),
    rating,
    tier: tier(item, rating),
    rare,
    special,
    duplicate: item?.duplicate === true || boundedInteger(item?.duplicateId) > 0,
    tradeable: item?.tradeable === true,
    sourceLabel: String(context.sourceLabel || '').trim() || null,
    nativeTheme: safeNativeTheme(context.resolveNativeTheme?.(item)),
    sequence,
  };
}

function isPlayer(item = {}) {
  return String(item?.type || '').toLowerCase() === 'player';
}

function emptyStats() {
  return {
    itemCount: 0,
    playerCount: 0,
    duplicateCount: 0,
    qualifyingCount: 0,
    types: { common: 0, rare: 0, special: 0 },
    ratings: {},
    packsOpened: 0,
    recoveries: Object.fromEntries(RECOVERY_ACTIONS.map((action) => [action, 0])),
    duplicateRoutes: { primary: 0, storage: 0, recovery: 0 },
  };
}

function createRetainedList(limit) {
  return {
    limit,
    items: [],
  };
}

function retain(list, card) {
  list.items.push(card);
  list.items.sort(compareCards);
  if (list.items.length > list.limit) list.items.pop();
}

export function createRollingRecapAggregator(options = {}) {
  const limits = {
    topCards: Math.max(1, Math.min(ROLLING_RECAP_LIMITS.topCards, boundedInteger(options.topCardLimit, ROLLING_RECAP_LIMITS.topCards))),
    alertCards: Math.max(1, Math.min(ROLLING_RECAP_LIMITS.alertCards, boundedInteger(options.alertCardLimit, ROLLING_RECAP_LIMITS.alertCards))),
  };
  const alertMinimumRating = Math.max(1, Math.min(99, boundedInteger(options.alertMinimumRating, 94)));
  const stats = emptyStats();
  const topCards = createRetainedList(limits.topCards);
  const alertCards = createRetainedList(limits.alertCards);
  let sequence = 0;

  function recordItems(items = [], context = {}) {
    for (const item of items || []) {
      stats.itemCount++;
      if (!isPlayer(item)) continue;
      stats.playerCount++;
      const card = buildCardSummary(item, ++sequence, {
        ...context,
        resolveNativeTheme: options.resolveNativeTheme,
      });
      if (card.special) stats.types.special++;
      else if (card.rare) stats.types.rare++;
      else stats.types.common++;
      if (card.duplicate) stats.duplicateCount++;
      const ratingKey = card.rating > 0 ? String(card.rating) : 'unknown';
      stats.ratings[ratingKey] = (stats.ratings[ratingKey] || 0) + 1;
      retain(topCards, card);
      if (card.special && card.rating >= alertMinimumRating) {
        stats.qualifyingCount++;
        retain(alertCards, card);
      }
    }
  }

  function recordPackReceipt(receipt, context = {}) {
    if (!receipt || receipt.status !== 'opened') return;
    stats.packsOpened++;
    stats.duplicateRoutes.storage += (receipt.routedItemRefs || [])
      .filter((ref) => String(ref?.pile || '').toLowerCase() === 'storage').length;
    return recordItems(receipt.openedItems || [], {
      sourceLabel: receipt.packRef?.name || context.sourceLabel,
      assumeSpecialPlayers: receipt.details?.assumeTotwReward === true || context.assumeSpecialPlayers === true,
    });
  }

  function recordRecovery(action, input = {}) {
    const normalized = normalizeAction(action);
    if (normalized) stats.recoveries[normalized]++;
    recordDuplicateRoute('recovery', input.duplicatesConsumed);
  }

  function recordDuplicateRoute(route, count = 0) {
    if (!Object.hasOwn(stats.duplicateRoutes, route)) return;
    stats.duplicateRoutes[route] += boundedInteger(count);
  }

  function getSnapshot(input = {}) {
    const workflow = input.workflow || {};
    const retainedTop = [...topCards.items].sort(compareCards);
    const retainedAlerts = [...alertCards.items].sort(compareCards);
    const retained = [...new Map(
      [...retainedTop, ...retainedAlerts].map((card) => [card.sequence, card]),
    ).values()].sort(compareCards);
    const snapshot = {
      version: 1,
      limits: { ...limits },
      alertMinimumRating,
      status: String(input.status || 'completed'),
      reason: input.reason ? String(input.reason) : null,
      reasonCode: (input.reasonCode || workflow.reasonCode)
        ? String(input.reasonCode || workflow.reasonCode)
        : null,
      phase: workflow.phase ? String(workflow.phase) : null,
      counters: {
        ...stats,
        types: { ...stats.types },
        ratings: { ...stats.ratings },
        recoveries: { ...stats.recoveries },
        duplicateRoutes: { ...stats.duplicateRoutes },
        primaryCompletions: boundedInteger(workflow.completions),
        iterations: boundedInteger(workflow.iterations),
        primaryPacksOpened: boundedInteger(workflow.packsOpened),
        bootstrapSubmissions: boundedInteger(workflow.bootstrapSubmissions),
        recoveryAttempts: boundedInteger(workflow.recoveries?.total),
      },
      omitted: {
        topCards: Math.max(0, stats.playerCount - retainedTop.length),
        alertCards: Math.max(0, stats.qualifyingCount - retainedAlerts.length),
      },
      topCards: retainedTop,
      alertCards: retainedAlerts,
      retainedCards: retained,
      finalResources: input.finalResources ? { ...input.finalResources } : null,
    };
    return freezeObject(snapshot);
  }

  return Object.freeze({
    getSnapshot,
    recordDuplicateRoute,
    recordItems,
    recordPackReceipt,
    recordRecovery,
  });
}

function formatCount(value, label) {
  return `${label} ${boundedInteger(value)}`;
}

function formatRatings(ratings = {}) {
  return Object.entries(ratings)
    .sort(([left], [right]) => (left === 'unknown' ? 1 : right === 'unknown' ? -1 : Number(left) - Number(right)))
    .map(([rating, count]) => `${rating}:${count}`)
    .join(' | ') || '-';
}

function buildRows(snapshot, input = {}) {
  const prices = normalizePrices(input.prices);
  return snapshot.retainedCards.map((card, index) => {
    const row = {
      name: card.name,
      rating: card.rating,
      tier: card.tier,
      rare: card.rare,
      special: card.special,
      duplicate: card.duplicate,
      tradeable: card.tradeable,
      sourceLabel: card.sourceLabel,
      price: card.special ? prices.get(card.definitionId) || null : null,
      showPrice: card.special,
      futbinPlayerId: input.resolveFutbinPlayerId?.(card) ?? null,
      order: index,
    };
    row.theme = resolveRecapCardTheme(row, input.resolveNativeTheme?.(card) || card.nativeTheme);
    row.tierLabel = recapCardTypeLabel(row, row.theme);
    return row;
  });
}

export function createRollingRecapModel(input = {}) {
  const snapshot = input.snapshot || input;
  const counters = snapshot.counters || {};
  const types = counters.types || {};
  const recoveries = counters.recoveries || {};
  const routes = counters.duplicateRoutes || {};
  const omitted = snapshot.omitted || {};
  const rows = buildRows(snapshot, input);
  const totalPacks = boundedInteger(counters.packsOpened);
  const primaryPacks = boundedInteger(counters.primaryPacksOpened);
  const details = [
    {
      label: 'Cycles',
      value: `${boundedInteger(counters.primaryCompletions)} completed, ${boundedInteger(counters.iterations)} iteration(s), ${boundedInteger(counters.bootstrapSubmissions)} bootstrap`,
    },
    {
      label: 'Packs',
      value: `${primaryPacks} primary, ${totalPacks} total opened`,
    },
    {
      label: 'Recoveries',
      value: [
        formatCount(recoveries.totw, 'TOTW'),
        formatCount(recoveries.provisions, 'Provisions'),
        formatCount(recoveries.playerPick, '85+ Pick'),
        formatCount(recoveries.storageSink, '95+ Storage Pick'),
        formatCount(recoveries.goldSink, '5x80'),
      ].join(' | '),
    },
    {
      label: 'Players',
      value: `${formatCount(types.common, 'Common')} | ${formatCount(types.rare, 'Rare')} | ${formatCount(types.special, 'Special')} | ${formatCount(counters.duplicateCount, 'Duplicates')}`,
    },
    {
      label: 'Duplicate routes',
      value: `${formatCount(routes.primary, 'Primary')} | ${formatCount(routes.storage, 'Storage')} | ${formatCount(routes.recovery, 'Recovery')}`,
    },
    {
      label: 'Ratings',
      value: formatRatings(counters.ratings),
    },
    {
      label: 'Retention',
      value: `${rows.length} retained row(s); omitted top:${boundedInteger(omitted.topCards)}, alert:${boundedInteger(omitted.alertCards)}`,
    },
  ];
  if (snapshot.phase || snapshot.reasonCode) {
    details.push({
      label: 'Stop point',
      value: `${snapshot.phase || '-'}${snapshot.reasonCode ? ` | ${snapshot.reasonCode}` : ''}`,
    });
  }
  if (snapshot.finalResources) {
    const labels = {
      specialSlots: 'Special slots',
      directCycles: 'Direct cycles',
      provisionsBatches: 'Provisions batches',
      totwRecoveries: 'TOTW recoveries',
      storage: 'Storage',
      inventoryVersion: 'Inventory version',
    };
    details.push({
      label: 'Final inventory',
      value: Object.entries(snapshot.finalResources)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => `${labels[key] || key}:${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join(' | ') || '-',
    });
  }
  const model = createRecapModel({
    kind: 'rolling',
    title: `${String(input.name || 'Rolling Loop')} Recap`,
    modalId: 'bronze-loop-loop-recap-modal',
    status: snapshot.status,
    reason: snapshot.reason,
    summary: `${boundedInteger(counters.primaryCompletions)} cycle(s), ${totalPacks} pack(s), ${boundedInteger(counters.itemCount)} item(s), ${boundedInteger(counters.qualifyingCount)} alert-qualifying special card(s)`,
    rows,
  });
  return Object.freeze({
    ...model,
    name: String(input.name || 'Rolling Loop'),
    receipts: Object.freeze([]),
    details: Object.freeze(details.map((detail) => Object.freeze({ ...detail }))),
    requestedPacks: primaryPacks,
    packsOpened: primaryPacks,
    totalPacksOpened: totalPacks,
    itemCount: boundedInteger(counters.itemCount),
    playerCount: boundedInteger(counters.playerCount),
    qualifyingCount: boundedInteger(counters.qualifyingCount),
    hasQualifyingCards: boundedInteger(counters.qualifyingCount) > 0,
    omittedCount: boundedInteger(omitted.topCards) + boundedInteger(omitted.alertCards),
    specialCount: rows.filter((row) => row.special === true).length,
    rolling: true,
  });
}
