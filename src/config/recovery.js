const ALL_INVENTORY_PILES = Object.freeze(['unassigned', 'storage', 'transfer', 'club']);

function lowFodderRequirement(input) {
  return Object.freeze({
    playerOnly: true,
    allowSpecial: false,
    priorityPiles: ALL_INVENTORY_PILES,
    ...input,
  });
}

function recipe(input) {
  return Object.freeze({
    priorityPiles: ALL_INVENTORY_PILES,
    sbcFodderPolicy: Object.freeze({ mode: 'low-gold' }),
    maxSubmissions: 1,
    mustConsumeTrigger: true,
    onUnavailable: 'continue',
    onInsufficient: 'continue',
    onBlocked: 'stop',
    ...input,
  });
}

export const RECOVERY_RECIPES = Object.freeze([
  recipe({
    id: 'daily-bronze-upgrade',
    name: 'Daily Bronze Upgrade',
    activityBinding: { family: 'daily-bronze-upgrade', category: 'Upgrades', required: false },
    sbcNames: ['Daily Bronze Upgrade', '每日青铜升级', '每日青銅升級'],
    requirements: [lowFodderRequirement({ tier: 'bronze', count: 1 })],
  }),
  recipe({
    id: 'daily-silver-upgrade',
    name: 'Daily Silver Upgrade',
    activityBinding: { family: 'daily-silver-upgrade', category: 'Upgrades', required: false },
    sbcNames: ['Daily Silver Upgrade', '每日白银升级', '每日白銀升級'],
    requirements: [lowFodderRequirement({ tier: 'silver', count: 1 })],
  }),
  recipe({
    id: 'daily-common-gold-upgrade',
    name: 'Daily Common Gold Upgrade',
    activityBinding: { family: 'daily-common-gold-upgrade', category: 'Upgrades', required: false },
    sbcNames: ['Daily Common Gold Upgrade', '每日普通金牌升级', '每日普通金牌升級'],
    requirements: [
      lowFodderRequirement({ tier: 'silver', count: 5 }),
      lowFodderRequirement({ tier: 'bronze', count: 5 }),
    ],
  }),
  recipe({
    id: 'bronze-upgrade',
    name: 'Bronze Upgrade',
    activityBinding: { family: 'bronze-upgrade', category: 'Upgrades', required: false },
    sbcNames: ['Bronze Upgrade', '青铜升级', '青銅升級'],
    requirements: [lowFodderRequirement({ tier: 'bronze', count: 11 })],
  }),
  recipe({
    id: 'silver-upgrade',
    name: 'Silver Upgrade',
    activityBinding: { family: 'silver-upgrade', category: 'Upgrades', required: false },
    sbcNames: ['Silver Upgrade', '白银升级', '白銀升級'],
    requirements: [lowFodderRequirement({ tier: 'silver', count: 11 })],
  }),
  recipe({
    id: 'daily-rare-gold-upgrade',
    name: 'Daily Rare Gold Upgrade',
    activityBinding: { family: 'daily-rare-gold-upgrade', category: 'Upgrades', required: false },
    sbcNames: ['Daily Rare Gold Upgrade', '每日稀有金牌升级', '每日稀有金牌升級'],
    requirements: [lowFodderRequirement({ tier: 'gold', rarity: 'common', count: 5 })],
  }),
  recipe({
    id: 'fof-glory-hunters-crafting-upgrade',
    name: 'Common Gold Premium Upgrade',
    activityBinding: {
      family: 'common-gold-material-upgrade',
      classes: ['premium'],
      preference: 'reward-first',
      category: 'Upgrades',
      required: false,
    },
    sbcNames: ['5x 80+ Upgrade'],
    requirements: [lowFodderRequirement({ tier: 'gold', rarity: 'common', count: 9 })],
  }),
  recipe({
    id: 'gold-upgrade',
    name: 'Gold Upgrade',
    activityBinding: { family: 'gold-upgrade', category: 'Upgrades', required: false },
    sbcNames: ['Gold Upgrade', '黄金升级', '黃金升級'],
    requirements: [lowFodderRequirement({ tier: 'gold', rarity: 'common', count: 11 })],
  }),
  recipe({
    id: '2x84-upgrade',
    name: 'Rare Gold Recycling Upgrade',
    activityBinding: {
      family: 'rare-gold-material-upgrade',
      classes: ['premium', 'baseline'],
      preference: 'reward-first',
      category: 'Upgrades',
      required: false,
    },
    sbcNames: ['2x 84+ Upgrade', '2 x 84+ Upgrade'],
    requirements: [lowFodderRequirement({ tier: 'gold', rarity: 'rare', count: 6 })],
  }),
]);

export const UNASSIGNED_RECOVERY_POLICIES = Object.freeze([
  Object.freeze({
    id: 'bronze-duplicate-overflow',
    match: Object.freeze({ tier: 'bronze', playerOnly: true, allowSpecial: false }),
    steps: Object.freeze([
      Object.freeze({ recipeId: 'daily-bronze-upgrade' }),
      Object.freeze({ recipeId: 'daily-common-gold-upgrade' }),
      Object.freeze({ recipeId: 'bronze-upgrade' }),
    ]),
  }),
  Object.freeze({
    id: 'silver-duplicate-overflow',
    match: Object.freeze({ tier: 'silver', playerOnly: true, allowSpecial: false }),
    steps: Object.freeze([
      Object.freeze({ recipeId: 'daily-silver-upgrade' }),
      Object.freeze({ recipeId: 'daily-common-gold-upgrade' }),
      Object.freeze({ recipeId: 'silver-upgrade' }),
    ]),
  }),
  Object.freeze({
    id: 'common-gold-duplicate-overflow',
    match: Object.freeze({ tier: 'gold', rarity: 'common', playerOnly: true, allowSpecial: false, maxRating: 82 }),
    steps: Object.freeze([
      Object.freeze({ recipeId: 'daily-rare-gold-upgrade' }),
      Object.freeze({ recipeId: 'fof-glory-hunters-crafting-upgrade' }),
      Object.freeze({ recipeId: 'gold-upgrade' }),
    ]),
  }),
  Object.freeze({
    id: 'rare-gold-duplicate-overflow',
    match: Object.freeze({ tier: 'gold', rarity: 'rare', playerOnly: true, allowSpecial: false, maxRating: 82 }),
    steps: Object.freeze([
      Object.freeze({ recipeId: '2x84-upgrade' }),
    ]),
  }),
]);

export const DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS = Object.freeze([
  'bronze-duplicate-overflow',
  'silver-duplicate-overflow',
  'common-gold-duplicate-overflow',
  'rare-gold-duplicate-overflow',
]);
