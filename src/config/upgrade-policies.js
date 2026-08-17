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
    ...(base.sbcFodderPolicy || overrides.sbcFodderPolicy ? {
      sbcFodderPolicy: {
        ...(clone(base.sbcFodderPolicy) || {}),
        ...(clone(overrides.sbcFodderPolicy) || {}),
      },
    } : {}),
  };
}

export function createTotwUpgradePolicy(overrides = {}) {
  return mergePolicy({
    strategy: 'fillAndVerifySbc',
    sbcFodderPolicy: { mode: 'rating-constrained' },
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
      playerOnly: true,
      allowSpecial: false,
      priorityPiles: [...FODDER_PILES],
    }],
    priorityPiles: [...FODDER_PILES],
    requiredSpecialCount: 0,
    allowedSpecialCount: 0,
    sbcFodderPolicy: { mode: 'low-gold' },
    blockSpecial: true,
    blockTradeable: false,
    openRewardPacks: true,
  }, overrides);
}

export function createHighRatedUpgradePolicy(overrides = {}) {
  return mergePolicy({
    strategy: 'fillAndVerifySbc',
    sbcFodderPolicy: { mode: 'rating-constrained' },
    ratingSbcFill: { priorityPiles: [...ALL_INVENTORY_PILES] },
    requiredSpecialCount: 0,
    allowedSpecialCount: 0,
    autoTotwUpgrade: {
      name: 'Scanned TOTW Upgrade',
      activityBinding: { family: 'totw-upgrade', category: 'Upgrades', required: true },
      ...createTotwUpgradePolicy({ forceOpenRewardPacks: false }),
    },
    autoFodderUpgrade: {
      name: 'Scanned Rare Gold Recycling Upgrade',
      activityBinding: {
        family: 'rare-gold-material-upgrade',
        classes: ['premium', 'baseline'],
        preference: 'reward-first',
        category: 'Upgrades',
        required: false,
      },
      maxAttemptsPerCompletion: 3,
      ...createTwoBy84UpgradePolicy({ hidden: false, forceOpenRewardPacks: true }),
    },
    blockSpecial: true,
    blockTradeable: false,
    openRewardPacks: false,
  }, overrides);
}

export function createProvisionsUpgradePolicy(overrides = {}) {
  return mergePolicy({
    strategy: 'fillAndVerifySbc',
    hidden: true,
    requirements: [{
      tier: 'gold',
      count: 1,
      playerOnly: true,
      allowSpecial: true,
      priorityPiles: [...ALL_INVENTORY_PILES],
    }],
    ratingSbcFill: { priorityPiles: [...ALL_INVENTORY_PILES] },
    requiredSpecialCount: 0,
    allowedSpecialCount: 0,
    blockSpecial: false,
    blockTradeable: false,
    openRewardPacks: false,
  }, overrides);
}

export function createDynamicUpgradePolicy(family = {}, overrides = {}) {
  if (family.id === 'totw-upgrade') return createTotwUpgradePolicy(overrides);
  if (family.id === '2x84-upgrade') return createTwoBy84UpgradePolicy(overrides);
  if (family.id === 'provisions-upgrade') return createProvisionsUpgradePolicy(overrides);
  return createHighRatedUpgradePolicy(overrides);
}
