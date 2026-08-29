import { isPlainObject } from '../domain/objects.js';
import {
  getLoopStrategyCapabilities,
  INVENTORY_ONLY_CAPABILITIES,
} from '../domain/strategies.js';
import { applyRewardFlow, resolveRewardPackOpenEnabled } from './reward-flow.js';
import {
  applySbcFodderPolicy,
  normalizeSbcFodderPolicy,
  resolveSbcFodderPolicy,
} from './sbc-fodder-policy.js';
import {
  normalizeRollingProvisionsMaxRating,
  normalizeRollingShortageProvisionsPackLimit,
} from './rolling-upgrade.js';
import {
  normalizePlayerPickSelectionMode,
  PLAYER_PICK_SELECTION_MODES,
} from '../domain/player-pick.js';
import {
  DUPLICATE_SWAP_MODES,
  normalizeDuplicateSwapMode,
} from '../sbc/untradeable-duplicate-swap.js';

export const INVENTORY_MODES = Object.freeze(['inherit', 'inventory-only', 'normal']);
export const RUNTIME_QUANTITY_MODES = Object.freeze(['user', 'ea-remaining', 'exhaust', 'fixed']);
export const ROLLING_STORAGE_RECOVERY_PRIORITIES = Object.freeze([
  'storage-pressure-only',
  'provisions-only',
  'provisions-then-storage-pressure',
]);
export const DEFAULT_ROLLING_STORAGE_RECOVERY_PRIORITY = 'storage-pressure-only';

const LEGACY_ROLLING_STORAGE_RECOVERY_PRIORITY_MIGRATIONS = Object.freeze({
  'storage-pressure': 'storage-pressure-only',
  provisions: 'provisions-then-storage-pressure',
});
export const RUNTIME_QUANTITY_TARGETS = Object.freeze([
  'maxCompletions',
  'rounds',
  'maxPacks',
  'validationRounds',
]);
export { DUPLICATE_SWAP_MODES, PLAYER_PICK_SELECTION_MODES };
const PICK_OPTIONS_APPLIED = Symbol('pick-options-applied');

export function normalizeRollingStorageRecoveryPriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ROLLING_STORAGE_RECOVERY_PRIORITIES.includes(normalized)
    ? normalized
    : LEGACY_ROLLING_STORAGE_RECOVERY_PRIORITY_MIGRATIONS[normalized]
      || DEFAULT_ROLLING_STORAGE_RECOVERY_PRIORITY;
}

export function rollingStorageRecoveryModeLabel(value) {
  const labels = {
    'storage-pressure-only': 'Storage Pressure only',
    'provisions-only': 'Provisions only',
    'provisions-then-storage-pressure': 'Provisions once, then Storage Pressure',
  };
  return labels[normalizeRollingStorageRecoveryPriority(value)] || labels['storage-pressure-only'];
}

export function rollingStorageRecoveryUsesStoragePressure(value) {
  return normalizeRollingStorageRecoveryPriority(value) !== 'provisions-only';
}

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
  assign('autoSelectBelow90', nested.autoSelectBelow90, nested.autoSelect, input.autoSelectBelow90);
  const explicitPickSelectionMode = nested.pickSelectionMode ?? input.pickSelectionMode;
  if (explicitPickSelectionMode !== undefined) {
    result.pickSelectionMode = explicitPickSelectionMode;
  } else if (result.autoSelectBelow90 !== undefined) {
    result.pickSelectionMode = result.autoSelectBelow90 === false ? 'rating-review' : 'rating-auto';
  }
  assign('preferScannedMetadata', nested.preferScannedMetadata, input.preferScannedMetadata);
  assign('openPicksAtEnd', nested.openPicksAtEnd, nested.openAtEnd, input.openPicksAtEnd);
  assign(
    'rollingStorageSinkEnabled',
    nested.rollingStorageSinkEnabled,
    input.rollingStorageSinkEnabled,
  );
  assign(
    'rollingStorageSinkMode',
    nested.rollingStorageSinkMode,
    input.rollingStorageSinkMode,
  );
  assign(
    'rollingStorageSinkSetId',
    nested.rollingStorageSinkSetId,
    input.rollingStorageSinkSetId,
  );
  assign(
    'rollingStorageSinkSetName',
    nested.rollingStorageSinkSetName,
    input.rollingStorageSinkSetName,
  );
  if (result.rollingStorageSinkMode === undefined
    && result.rollingStorageSinkEnabled !== undefined) {
    result.rollingStorageSinkMode = result.rollingStorageSinkEnabled ? 'automatic' : 'off';
  }
  assign(
    'rollingSurplusCraftingEnabled',
    nested.rollingSurplusCraftingEnabled,
    input.rollingSurplusCraftingEnabled,
  );
  assign(
    'rollingProvisionsShortageRecoveryEnabled',
    nested.rollingProvisionsShortageRecoveryEnabled,
    input.rollingProvisionsShortageRecoveryEnabled,
  );
  assign(
    'rollingRequiredSpecialRecoveryEnabled',
    nested.rollingRequiredSpecialRecoveryEnabled,
    input.rollingRequiredSpecialRecoveryEnabled,
  );
  assign(
    'rollingProtectAllClubNonTotwSpecials',
    nested.rollingProtectAllClubNonTotwSpecials,
    input.rollingProtectAllClubNonTotwSpecials,
  );
  assign(
    'rollingAllowClubCurrentPoolSpecialsForProvisions',
    nested.rollingAllowClubCurrentPoolSpecialsForProvisions,
    input.rollingAllowClubCurrentPoolSpecialsForProvisions,
  );
  assign(
    'rollingStoragePressureClubBoostersEnabled',
    nested.rollingStoragePressureClubBoostersEnabled,
    input.rollingStoragePressureClubBoostersEnabled,
  );
  assign(
    'rollingDuplicateSwapEnabled',
    nested.rollingDuplicateSwapEnabled,
    input.rollingDuplicateSwapEnabled,
  );
  assign(
    'rollingDuplicateSwapMode',
    nested.rollingDuplicateSwapMode,
    input.rollingDuplicateSwapMode,
  );
  if (result.rollingDuplicateSwapMode === undefined
    && result.rollingDuplicateSwapEnabled !== undefined) {
    result.rollingDuplicateSwapMode = result.rollingDuplicateSwapEnabled
      ? 'special-only'
      : 'off';
  }
  assign(
    'rollingProvisionsMaxRating',
    nested.rollingProvisionsMaxRating,
    input.rollingProvisionsMaxRating,
  );
  assign(
    'rollingRecoveryStorageFirst',
    nested.rollingRecoveryStorageFirst,
    input.rollingRecoveryStorageFirst,
  );
  assign(
    'rollingStorageRecoveryPriority',
    nested.rollingStorageRecoveryPriority,
    input.rollingStorageRecoveryPriority,
  );
  assign(
    'rollingOpenDuplicateProvisionsRewards',
    nested.rollingOpenDuplicateProvisionsRewards,
    input.rollingOpenDuplicateProvisionsRewards,
  );
  assign(
    'rollingShortageProvisionsPackLimit',
    nested.rollingShortageProvisionsPackLimit,
    input.rollingShortageProvisionsPackLimit,
  );
  assign(
    'protectFsuLockedPlayers',
    nested.protectFsuLockedPlayers,
    input.protectFsuLockedPlayers,
  );
  assign(
    'protectActiveSquadPlayers',
    nested.protectActiveSquadPlayers,
    input.protectActiveSquadPlayers,
  );
  assign(
    'protectionRating',
    nested.protectionRating,
    nested.autoPickThreshold,
    input.protectionRating,
    input.autoPickRatingThreshold,
    input.autoPickThreshold,
  );
  return result;
}

export function normalizePickRuntimeOptions(input = {}) {
  const protectionRating = Number(
    input.protectionRating ?? input.autoPickThreshold ?? input.autoPickRatingThreshold,
  );
  const requestedStorageSinkMode = String(input.rollingStorageSinkMode || '').trim().toLowerCase();
  const selectedStorageSinkSetId = Number(input.rollingStorageSinkSetId);
  const hasSelectedStorageSink = Number.isInteger(selectedStorageSinkSetId)
    && selectedStorageSinkSetId > 0;
  const rollingStorageSinkMode = requestedStorageSinkMode === 'selected'
    ? hasSelectedStorageSink ? 'selected' : 'off'
    : requestedStorageSinkMode === 'automatic'
      ? 'automatic'
      : requestedStorageSinkMode === 'off'
        ? 'off'
        : input.rollingStorageSinkEnabled === true ? 'automatic' : 'off';
  const pickSelectionMode = normalizePlayerPickSelectionMode(
    input.pickSelectionMode,
    input.autoSelectBelow90 === false ? 'rating-review' : 'rating-auto',
  );
  const rollingDuplicateSwapMode = normalizeDuplicateSwapMode(
    input.rollingDuplicateSwapMode,
    input.rollingDuplicateSwapEnabled === true,
  );
  return {
    autoSelectBelow90: pickSelectionMode !== 'rating-review',
    pickSelectionMode,
    preferScannedMetadata: input.preferScannedMetadata === true,
    openPicksAtEnd: input.openPicksAtEnd === true,
    rollingStorageSinkEnabled: rollingStorageSinkMode !== 'off',
    rollingStorageSinkMode,
    rollingStorageSinkSetId: rollingStorageSinkMode === 'selected' ? selectedStorageSinkSetId : null,
    rollingStorageSinkSetName: rollingStorageSinkMode === 'selected'
      ? String(input.rollingStorageSinkSetName || '').trim()
      : '',
    rollingSurplusCraftingEnabled: input.rollingSurplusCraftingEnabled === true,
    rollingProvisionsShortageRecoveryEnabled:
      input.rollingProvisionsShortageRecoveryEnabled === true,
    rollingRequiredSpecialRecoveryEnabled:
      input.rollingRequiredSpecialRecoveryEnabled === true,
    rollingProtectAllClubNonTotwSpecials:
      input.rollingProtectAllClubNonTotwSpecials === true,
    rollingAllowClubCurrentPoolSpecialsForProvisions:
      input.rollingAllowClubCurrentPoolSpecialsForProvisions === true,
    rollingStoragePressureClubBoostersEnabled:
      input.rollingStoragePressureClubBoostersEnabled === true,
    rollingDuplicateSwapEnabled: rollingDuplicateSwapMode !== 'off',
    rollingDuplicateSwapMode,
    rollingProvisionsMaxRating: normalizeRollingProvisionsMaxRating(
      input.rollingProvisionsMaxRating,
    ),
    rollingRecoveryStorageFirst: input.rollingRecoveryStorageFirst === true,
    rollingStorageRecoveryPriority: normalizeRollingStorageRecoveryPriority(
      input.rollingStorageRecoveryPriority,
    ),
    rollingOpenDuplicateProvisionsRewards:
      input.rollingOpenDuplicateProvisionsRewards === true,
    rollingShortageProvisionsPackLimit: normalizeRollingShortageProvisionsPackLimit(
      input.rollingShortageProvisionsPackLimit,
    ),
    protectFsuLockedPlayers: input.protectFsuLockedPlayers === true,
    protectActiveSquadPlayers: input.protectActiveSquadPlayers === true,
    protectionRating: boundedNumber(protectionRating > 0 ? protectionRating : 90, 90, 1, 99),
  };
}

export function shouldAutoSelectPlayerPick(maxRating, input = {}) {
  const options = normalizePickRuntimeOptions(input);
  const rating = Number(maxRating);
  return options.autoSelectBelow90 === true
    && Number.isFinite(rating)
    && rating > 0
    && rating <= options.protectionRating;
}

export function resolvePickRuntimeOptions(globalOptions = {}, ...overrides) {
  const merged = { ...normalizePickRuntimeOptions(globalOptions) };
  for (const override of overrides) Object.assign(merged, pickOptionOverrides(override));
  return normalizePickRuntimeOptions(merged);
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
  loopDef.autoSelectBelow90 = options.autoSelectBelow90;
  loopDef.pickSelectionMode = options.pickSelectionMode;
  loopDef.openPicksAtEnd = options.openPicksAtEnd;
  loopDef.autoPickRatingThreshold = options.protectionRating;
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
  const allowZero = loopDef.strategy === 'rollingUpgrade' && configured.allowZero === true;
  const minimum = allowZero ? 0 : 1;
  const configuredMin = Number(configured.min);
  const configuredMax = Number(configured.max);
  const min = Math.max(minimum, Math.floor(Number.isFinite(configuredMin) ? configuredMin : minimum));
  const max = Math.max(min, Math.min(1000, Math.floor(Number.isFinite(configuredMax) ? configuredMax : 50)));
  const fallback = target === 'rounds'
    ? loopDef.rounds
    : target === 'maxPacks'
      ? loopDef.maxPacks
      : target === 'validationRounds'
        ? loopDef.maxRounds
        : loopDef.maxCompletions;
  const fallbackValue = Number(fallback);
  const defaultValue = Math.floor(boundedNumber(
    configured.default,
    Number.isFinite(fallbackValue) ? fallbackValue : min,
    min,
    max,
  ));
  return {
    mode,
    target,
    default: defaultValue,
    min,
    max,
    ...(allowZero ? { allowZero: true } : {}),
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
  const globalSbcFodderPolicy = normalizeSbcFodderPolicy(options.sbcFodderPolicy);
  const resolvedSbcFodderPolicy = resolveSbcFodderPolicy(globalSbcFodderPolicy, loopDef);

  loopDef.dryRun = options.dryRun === true || loopDef.dryRun === true;
  applyRewardFlow(loopDef);
  loopDef.openRewardPacks = resolveRewardPackOpenEnabled(loopDef, options.openRewardPacks === true);
  loopDef.runtimePickOptions = resolvedPickOptions;
  loopDef.runtimeInventoryMode = resolvedInventoryMode;
  loopDef.runtimeSbcFodderPolicy = resolvedSbcFodderPolicy;
  applyPickRuntimeOptions(loopDef, globalPickOptions);
  if (loopDef.strategy === 'rollingUpgrade') {
    loopDef.runtimeProtectionRating = resolvedPickOptions.protectionRating;
    loopDef.rollingStorageSinkEnabled = resolvedPickOptions.rollingStorageSinkEnabled;
    loopDef.rollingStorageSinkMode = resolvedPickOptions.rollingStorageSinkMode;
    loopDef.rollingStorageSinkSetId = resolvedPickOptions.rollingStorageSinkSetId;
    loopDef.rollingStorageSinkSetName = resolvedPickOptions.rollingStorageSinkSetName;
    loopDef.rollingSurplusCraftingEnabled = resolvedPickOptions.rollingSurplusCraftingEnabled;
    loopDef.rollingProvisionsShortageRecoveryEnabled =
      resolvedPickOptions.rollingProvisionsShortageRecoveryEnabled;
    loopDef.rollingRequiredSpecialRecoveryEnabled =
      resolvedPickOptions.rollingRequiredSpecialRecoveryEnabled;
    loopDef.rollingProtectAllClubNonTotwSpecials =
      resolvedPickOptions.rollingProtectAllClubNonTotwSpecials;
    loopDef.rollingAllowClubCurrentPoolSpecialsForProvisions =
      resolvedPickOptions.rollingAllowClubCurrentPoolSpecialsForProvisions;
    loopDef.rollingStoragePressureClubBoostersEnabled =
      resolvedPickOptions.rollingStoragePressureClubBoostersEnabled;
    loopDef.rollingDuplicateSwapEnabled = resolvedPickOptions.rollingDuplicateSwapEnabled;
    loopDef.rollingDuplicateSwapMode = resolvedPickOptions.rollingDuplicateSwapMode;
    loopDef.runtimeProvisionsMaxRating = resolvedPickOptions.rollingProvisionsMaxRating;
    loopDef.runtimeRecoveryStorageFirst = resolvedPickOptions.rollingRecoveryStorageFirst;
    loopDef.rollingStorageRecoveryPriority = resolvedPickOptions.rollingStorageRecoveryPriority;
    loopDef.rollingOpenDuplicateProvisionsRewards =
      resolvedPickOptions.rollingOpenDuplicateProvisionsRewards;
    loopDef.rollingShortageProvisionsPackLimit =
      resolvedPickOptions.rollingShortageProvisionsPackLimit;
    if (Array.isArray(loopDef.rollingProvisionsUpgrade?.requirements)) {
      loopDef.rollingProvisionsUpgrade.requirements = loopDef.rollingProvisionsUpgrade.requirements
        .map((requirement) => ({
          ...requirement,
          maxRating: resolvedPickOptions.rollingProvisionsMaxRating,
        }));
    }
  }
  applyInventoryMode(loopDef, resolvedInventoryMode);
  applySbcFodderPolicy(loopDef, resolvedSbcFodderPolicy);
  applyRuntimeQuantity(loopDef, options.rounds);
  return loopDef;
}

export function assertRollingRuntimePreflight(loopDef = {}) {
  if (loopDef.strategy !== 'rollingUpgrade') return loopDef;
  if (loopDef.openRewardPacks !== true) {
    throw new Error('Rolling Upgrade requires Open reward packs');
  }
  if (loopDef.rollingWorkflowEnabled !== true) {
    throw new Error('Rolling Upgrade workflow is staged but not enabled in this build');
  }
  if (rollingStorageRecoveryUsesStoragePressure(loopDef.rollingStorageRecoveryPriority)
    && loopDef.rollingStorageSinkEnabled === true
    && loopDef.rollingStorageSinkMode === 'selected') {
    const selectedSetId = Number(loopDef.rollingStorageSinkSetId || 0);
    const selectedSetName = String(loopDef.rollingStorageSinkSetName || '').trim();
    const capability = loopDef.rollingStorageSink?.capability || {};
    const boundSetId = Number(capability.setId || capability.loop?.sbcSetIds?.[0] || 0);
    const boundSetName = String(capability.setName || '').trim();
    if (!selectedSetId || boundSetId !== selectedSetId) {
      throw new Error(
        `Selected Storage pressure SBC ${selectedSetName || `Set #${selectedSetId || '?'}`} `
        + `(Set #${selectedSetId || '?'}) is not bound; current binding is `
        + `${boundSetName || 'none'} (Set #${boundSetId || '?'})`,
      );
    }
  }
  return loopDef;
}
