import { cloneLoopDef } from '../domain/objects.js';

const ALL_INVENTORY_PILES = Object.freeze(['unassigned', 'storage', 'transfer', 'club']);
const FODDER_PILES = Object.freeze(['storage', 'club']);

function clone(value) {
  return value === undefined ? undefined : cloneLoopDef(value);
}

function mergePolicy(base, overrides = {}) {
  return {
    ...clone(base),
    ...clone(overrides),
    ...(base.ratingSbcFill || overrides.ratingSbcFill ? {
      ratingSbcFill: {
        ...(clone(base.ratingSbcFill) || {}),
        ...(clone(overrides.ratingSbcFill) || {}),
      },
    } : {}),
  };
}

export function createTotwUpgradePolicy(overrides = {}) {
  return mergePolicy({
    strategy: 'fillAndVerifySbc',
    maxSubmittedRating: 88,
    maxNormalGoldSubmittedRating: 99,
    ratingSbcFill: { priorityPiles: [...ALL_INVENTORY_PILES] },
    requiredSpecialCount: 0,
    allowedSpecialCount: 0,
    blockSpecial: true,
    blockTradeable: false,
    openRewardPacks: true,
    forceOpenRewardPacks: true,
    assumeTotwRewardPack: true,
  }, overrides);
}

export function createTwoBy84UpgradePolicy(overrides = {}) {
  return mergePolicy({
    strategy: 'fillAndVerifySbc',
    hidden: true,
    inventoryFillFirst: true,
    requirements: [{
      tier: 'gold',
      rarity: 'rare',
      count: 6,
      maxRating: 81,
      playerOnly: true,
      allowSpecial: false,
      protectHighGold: true,
      priorityPiles: [...FODDER_PILES],
    }],
    priorityPiles: [...FODDER_PILES],
    requiredSpecialCount: 0,
    allowedSpecialCount: 0,
    maxSubmittedRating: 81,
    maxNormalGoldSubmittedRating: 81,
    blockSpecial: true,
    blockTradeable: false,
    openRewardPacks: true,
  }, overrides);
}

export function createHighRatedUpgradePolicy(overrides = {}) {
  return mergePolicy({
    strategy: 'fillAndVerifySbc',
    maxSubmittedRating: 88,
    maxNormalGoldSubmittedRating: 99,
    ratingSbcFill: { priorityPiles: [...ALL_INVENTORY_PILES] },
    requiredSpecialCount: 0,
    allowedSpecialCount: 0,
    requiredSpecialKind: 'totw-tots-fof',
    requiredSpecialMinRating: 84,
    specialRequirementAdd: {
      patterns: ['Any TOTW/TOTS/FOF', 'TOTW/TOTS/FOF', 'TOTW', 'TOTS', 'FOF'],
      buttonTexts: ['Add', '\u6dfb\u52a0', '\u52a0\u5165', '\u65b0\u589e'],
    },
    autoTotwUpgrade: {
      name: 'Scanned TOTW Upgrade',
      activityBinding: { family: 'totw-upgrade', category: 'Upgrades', required: true },
      ...createTotwUpgradePolicy({ forceOpenRewardPacks: false }),
    },
    autoFodderUpgrade: {
      name: 'Scanned 2x84+ Upgrade',
      activityBinding: { family: '2x84-upgrade', category: 'Upgrades', required: false },
      maxAttemptsPerCompletion: 3,
      ...createTwoBy84UpgradePolicy({ hidden: false, forceOpenRewardPacks: true }),
    },
    blockSpecial: true,
    blockTradeable: false,
    openRewardPacks: false,
  }, overrides);
}

export function createDynamicUpgradePolicy(family = {}, overrides = {}) {
  if (family.id === 'totw-upgrade') return createTotwUpgradePolicy(overrides);
  if (family.id === '2x84-upgrade') return createTwoBy84UpgradePolicy(overrides);
  return createHighRatedUpgradePolicy(overrides);
}
