import { isPlainObject } from '../domain/objects.js';
import {
  getLoopStrategyCapabilities,
  INVENTORY_ONLY_CAPABILITIES,
} from '../domain/strategies.js';
import { applyRewardFlow, resolveRewardPackOpenEnabled } from './reward-flow.js';

export const INVENTORY_MODES = Object.freeze(['inherit', 'inventory-only', 'normal']);
export const RUNTIME_QUANTITY_MODES = Object.freeze(['user', 'ea-remaining', 'exhaust', 'fixed']);
export const RUNTIME_QUANTITY_TARGETS = Object.freeze([
  'maxCompletions',
  'rounds',
  'maxPacks',
  'validationRounds',
]);
const PICK_OPTIONS_APPLIED = Symbol('pick-options-applied');

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

function pickOptionOverrides(input = {}) {
  if (!isPlainObject(input)) return {};
  const nested = isPlainObject(input.pickOptions) ? input.pickOptions : {};
  const result = {};
  const assign = (target, ...sources) => {
    const value = sources.find((entry) => entry !== undefined);
    if (value !== undefined) result[target] = value;
  };
  assign('protectHighGold', nested.protectHighGold, input.protectHighGold);
  assign('autoSelectBelow90', nested.autoSelectBelow90, nested.autoSelect, input.autoSelectBelow90);
  assign('preferScannedMetadata', nested.preferScannedMetadata, input.preferScannedMetadata);
  assign('openPicksAtEnd', nested.openPicksAtEnd, nested.openAtEnd, input.openPicksAtEnd);
  assign('highGoldThreshold', nested.highGoldThreshold, input.pickHighGoldThreshold, input.highGoldThreshold);
  assign('autoPickThreshold', nested.autoPickThreshold, input.autoPickRatingThreshold, input.autoPickThreshold);
  return result;
}

export function normalizePickRuntimeOptions(input = {}) {
  const highGoldThreshold = Number(input.highGoldThreshold);
  const autoPickThreshold = Number(input.autoPickThreshold);
  return {
    protectHighGold: input.protectHighGold !== false,
    autoSelectBelow90: input.autoSelectBelow90 !== false,
    preferScannedMetadata: input.preferScannedMetadata === true,
    openPicksAtEnd: input.openPicksAtEnd === true,
    highGoldThreshold: boundedNumber(highGoldThreshold > 0 ? highGoldThreshold : 82, 82, 2, 99),
    autoPickThreshold: boundedNumber(autoPickThreshold > 0 ? autoPickThreshold : 90, 90, 1, 99),
  };
}

export function resolvePickRuntimeOptions(globalOptions = {}, ...overrides) {
  const merged = { ...normalizePickRuntimeOptions(globalOptions) };
  for (const override of overrides) Object.assign(merged, pickOptionOverrides(override));
  return normalizePickRuntimeOptions(merged);
}

function requirementBusinessMaxRating(requirement = {}) {
  const saved = Number(requirement.maxRatingBeforeHighGoldProtection);
  if (Number.isFinite(saved)) return saved;
  const current = Number(requirement.maxRating);
  return requirement.highGoldProtectionMaxRating === true || !Number.isFinite(current) ? null : current;
}

function applyPickProtectionToRequirement(requirement, options) {
  const businessMaxRating = requirementBusinessMaxRating(requirement);
  requirement.protectHighGold = options.protectHighGold;
  if (!options.protectHighGold) {
    delete requirement.highGoldThreshold;
    if (businessMaxRating === null) delete requirement.maxRating;
    else requirement.maxRating = businessMaxRating;
    delete requirement.highGoldProtectionMaxRating;
    delete requirement.maxRatingBeforeHighGoldProtection;
    return;
  }

  const protectionMaxRating = options.highGoldThreshold - 1;
  requirement.highGoldThreshold = options.highGoldThreshold;
  requirement.highGoldProtectionMaxRating = true;
  if (businessMaxRating !== null) {
    requirement.maxRatingBeforeHighGoldProtection = businessMaxRating;
    requirement.maxRating = Math.min(businessMaxRating, protectionMaxRating);
  } else {
    delete requirement.maxRatingBeforeHighGoldProtection;
    requirement.maxRating = protectionMaxRating;
  }
}

export function applyPickRuntimeOptions(loopDef, inheritedOptions = {}) {
  if (loopDef.strategy !== 'playerPickSbc') return loopDef;
  const options = loopDef[PICK_OPTIONS_APPLIED] === true
    ? resolvePickRuntimeOptions(inheritedOptions, { pickOptions: loopDef.pickOptions })
    : resolvePickRuntimeOptions(inheritedOptions, loopDef);
  Object.defineProperty(loopDef, PICK_OPTIONS_APPLIED, {
    configurable: true,
    enumerable: false,
    value: true,
  });
  loopDef.protectHighGold = options.protectHighGold;
  loopDef.autoSelectBelow90 = options.autoSelectBelow90;
  loopDef.openPicksAtEnd = options.openPicksAtEnd;
  loopDef.pickHighGoldThreshold = options.highGoldThreshold;
  loopDef.autoPickRatingThreshold = options.autoPickThreshold;
  const requirementGroups = [loopDef.requirements, ...(loopDef.challengeRequirements || [])];
  requirementGroups.forEach((requirements) => (requirements || []).forEach((requirement) => {
    applyPickProtectionToRequirement(requirement, options);
  }));
  return loopDef;
}

export function normalizeInventoryMode(value, fallback = 'inherit') {
  if (value === true) return 'inventory-only';
  if (value === false) return 'normal';
  return INVENTORY_MODES.includes(value) ? value : fallback;
}

function configuredInventoryMode(config = {}) {
  if (!isPlainObject(config)) return 'inherit';
  if (config.inventoryMode !== undefined) return normalizeInventoryMode(config.inventoryMode);
  if (config.inventoryOnly !== undefined) return normalizeInventoryMode(config.inventoryOnly);
  if (config.dailyRecycleInventoryOnly !== undefined) {
    return normalizeInventoryMode(config.dailyRecycleInventoryOnly);
  }
  return 'inherit';
}

export function resolveInventoryMode(globalMode = 'normal', ...configs) {
  let resolved = normalizeInventoryMode(globalMode, 'normal');
  if (resolved === 'inherit') resolved = 'normal';
  for (const config of configs) {
    const mode = configuredInventoryMode(config);
    if (mode !== 'inherit') resolved = mode;
  }
  return resolved;
}

export function applyInventoryMode(loopDef, inheritedMode = 'normal') {
  const capability = getLoopStrategyCapabilities(loopDef.strategy).inventoryOnly;
  const resolvedMode = resolveInventoryMode(inheritedMode, loopDef);
  loopDef.runtimeInventoryMode = resolvedMode;
  if (capability === INVENTORY_ONLY_CAPABILITIES.container) return loopDef;
  if (capability === INVENTORY_ONLY_CAPABILITIES.unsupported) {
    loopDef.inventoryOnlyIgnored = resolvedMode === 'inventory-only';
    return loopDef;
  }
  if (capability === INVENTORY_ONLY_CAPABILITIES.supported) {
    loopDef.inventoryOnly = resolvedMode === 'inventory-only';
    if (loopDef.inventoryOnly) loopDef.openRewardPacks = false;
  }
  return loopDef;
}

function legacyRuntimeQuantity(loopDef = {}) {
  if (loopDef.useRoundsAsCompletions === true) {
    return {
      mode: 'user',
      target: 'maxCompletions',
      default: Number(loopDef.maxCompletions || 3),
      min: 1,
      max: 50,
      label: 'Rounds',
    };
  }
  if (loopDef.strategy === 'provisionPackCrafting' || loopDef.strategy === 'provisionPackDualCrafting') {
    return {
      mode: 'user',
      target: 'rounds',
      default: Number(loopDef.rounds || 3),
      min: 1,
      max: 50,
      label: 'Provision packs',
    };
  }
  if (loopDef.strategy === 'validationBronzeUpgrade') {
    return {
      mode: 'user',
      target: 'validationRounds',
      default: Number(loopDef.maxRounds || 3),
      min: 1,
      max: 50,
      label: 'Validation runs',
    };
  }
  return null;
}

export function resolveRuntimeQuantity(loopDef = {}) {
  const configured = isPlainObject(loopDef.runtimeQuantity)
    ? loopDef.runtimeQuantity
    : legacyRuntimeQuantity(loopDef);
  if (!configured) return null;
  const mode = RUNTIME_QUANTITY_MODES.includes(configured.mode) ? configured.mode : 'user';
  const target = RUNTIME_QUANTITY_TARGETS.includes(configured.target)
    ? configured.target
    : 'maxCompletions';
  const min = Math.max(1, Math.floor(Number(configured.min) || 1));
  const max = Math.max(min, Math.min(1000, Math.floor(Number(configured.max) || 50)));
  const fallback = target === 'rounds'
    ? loopDef.rounds
    : target === 'maxPacks'
      ? loopDef.maxPacks
      : target === 'validationRounds'
        ? loopDef.maxRounds
        : loopDef.maxCompletions;
  const defaultValue = Math.floor(boundedNumber(configured.default, Number(fallback || min), min, max));
  return {
    mode,
    target,
    default: defaultValue,
    min,
    max,
    label: String(configured.label || 'Rounds'),
  };
}

export function loopUsesRounds(loopDef = {}) {
  return resolveRuntimeQuantity(loopDef)?.mode === 'user';
}

function applyRuntimeQuantity(loopDef, rawValue) {
  const quantity = resolveRuntimeQuantity(loopDef);
  if (!quantity || quantity.mode !== 'user') return 1;
  const value = Math.floor(boundedNumber(rawValue, quantity.default, quantity.min, quantity.max));
  if (quantity.target === 'validationRounds') loopDef.runtimeRounds = value;
  else loopDef[quantity.target] = value;
  return value;
}

export function applyLoopRuntimeOptions(loopDef, options = {}) {
  const globalPickOptions = normalizePickRuntimeOptions(options.pickOptions);
  const resolvedPickOptions = resolvePickRuntimeOptions(globalPickOptions, loopDef);
  const globalInventoryMode = options.inventoryMode !== undefined
    ? options.inventoryMode
    : options.inventoryOnly !== undefined
      ? options.inventoryOnly
      : options.dailyRecycleInventoryOnly;
  const resolvedInventoryMode = resolveInventoryMode(globalInventoryMode === true ? 'inventory-only' : globalInventoryMode === false || globalInventoryMode === undefined ? 'normal' : globalInventoryMode, loopDef);

  loopDef.dryRun = options.dryRun === true || loopDef.dryRun === true;
  applyRewardFlow(loopDef);
  loopDef.openRewardPacks = resolveRewardPackOpenEnabled(loopDef, options.openRewardPacks === true);
  loopDef.runtimePickOptions = resolvedPickOptions;
  loopDef.runtimeInventoryMode = resolvedInventoryMode;
  applyPickRuntimeOptions(loopDef, globalPickOptions);
  applyInventoryMode(loopDef, resolvedInventoryMode);
  applyRuntimeQuantity(loopDef, options.rounds);
  return loopDef;
}
