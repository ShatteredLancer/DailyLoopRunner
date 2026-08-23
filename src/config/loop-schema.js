import { isPlainObject } from '../domain/objects.js';
import {
  GOLD_CONSUMPTION_MODES,
  goldConsumptionCompatible,
} from '../domain/gold-consumption.js';
import {
  getLoopStrategyCapabilities,
  INVENTORY_ONLY_CAPABILITIES,
  LOOP_STRATEGIES,
} from '../domain/strategies.js';
import { validateRewardFlow } from './reward-flow.js';
import {
  INVENTORY_MODES,
  RUNTIME_QUANTITY_MODES,
  RUNTIME_QUANTITY_TARGETS,
} from './runtime-options.js';
import {
  ROLLING_PROVISIONS_MAX_RATINGS,
} from './rolling-upgrade.js';
import {
  DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
  RECOVERY_RECIPES,
  UNASSIGNED_RECOVERY_POLICIES,
} from './recovery.js';
import { SBC_ACTIVITY_FAMILY_IDS } from './activity-discovery.js';
import {
  MATERIAL_SINK_BASELINES,
  MATERIAL_SINK_CLASSES,
  MATERIAL_SINK_MATERIALS,
  MATERIAL_SINK_PREFERENCES,
} from './material-sink.js';
import { SBC_FODDER_MODES } from './sbc-fodder-policy.js';

const INVENTORY_PILES = Object.freeze(['unassigned', 'storage', 'transfer', 'club']);
const SOURCE_PACK_REF_STRATEGIES = Object.freeze([
  'validationBronzeUpgrade',
  'supplyAndCraft',
  'inventoryMixedUpgrade',
  'commonGoldToRareUpgrade',
  'provisionPackCrafting',
  'provisionPackDualCrafting',
  'rarePackTo84Upgrade',
]);

function fail(message) {
  throw new Error(message);
}

function validateStringArray(value, path, errors, required = false) {
  if (value === undefined || value === null) {
    if (required) errors.push(`${path} is required`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  if (!value.length) {
    if (required) errors.push(`${path} must be a non-empty array`);
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      errors.push(`${path}[${index}] must be a non-empty string`);
    }
  });
}

function validateNumberArray(value, path, errors) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  value.forEach((entry, index) => {
    if (!Number.isFinite(Number(entry))) {
      errors.push(`${path}[${index}] must be a number`);
    }
  });
}

function validateSourcePackRef(value, path, errors) {
  if (value === undefined || value === null) return;
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const allowedFields = new Set(['rewardOfLoopId']);
  Object.keys(value).forEach((field) => {
    if (!allowedFields.has(field)) errors.push(`${path}.${field} is not supported`);
  });
  if (typeof value.rewardOfLoopId !== 'string' || !value.rewardOfLoopId.trim()) {
    errors.push(`${path}.rewardOfLoopId is required`);
  }
}

function hasSourcePackIdentity(value = {}) {
  return Boolean(value.sourcePackRef?.rewardOfLoopId || value.sourcePackIds?.length || value.sourcePackNames?.length);
}

function validateActivityBinding(value, path, errors) {
  if (value === undefined || value === null) return;
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const allowedFields = new Set(['family', 'category', 'required', 'classes', 'preference', 'selectionMaterial']);
  Object.keys(value).forEach((field) => {
    if (!allowedFields.has(field)) errors.push(`${path}.${field} is not supported`);
  });
  if (typeof value.family !== 'string' || !value.family.trim()) {
    errors.push(`${path}.family is required`);
  } else if (!SBC_ACTIVITY_FAMILY_IDS.includes(value.family)) {
    errors.push(`${path}.family must be one of: ${SBC_ACTIVITY_FAMILY_IDS.join(', ')}`);
  }
  if (value.category !== undefined && value.category !== 'Upgrades') {
    errors.push(`${path}.category must be Upgrades`);
  }
  if (value.required !== undefined && typeof value.required !== 'boolean') {
    errors.push(`${path}.required must be boolean`);
  }
  if (value.classes !== undefined) {
    if (!Array.isArray(value.classes) || !value.classes.length) {
      errors.push(`${path}.classes must be a non-empty array`);
    } else {
      value.classes.forEach((className, index) => {
        if (!MATERIAL_SINK_CLASSES.includes(className)) {
          errors.push(`${path}.classes[${index}] must be one of: ${MATERIAL_SINK_CLASSES.join(', ')}`);
        }
      });
    }
  }
  if (value.preference !== undefined && !MATERIAL_SINK_PREFERENCES.includes(value.preference)) {
    errors.push(`${path}.preference must be one of: ${MATERIAL_SINK_PREFERENCES.join(', ')}`);
  }
  if (value.selectionMaterial !== undefined && !MATERIAL_SINK_MATERIALS.includes(value.selectionMaterial)) {
    errors.push(`${path}.selectionMaterial must be one of: ${MATERIAL_SINK_MATERIALS.join(', ')}`);
  }
  if ((value.classes !== undefined || value.preference !== undefined || value.selectionMaterial !== undefined)
    && !MATERIAL_SINK_BASELINES[value.family]) {
    errors.push(`${path}.classes, preference, and selectionMaterial require a material sink family`);
  }
}

function validatePileList(value, path, errors, required = false) {
  if (value === undefined || value === null) {
    if (required) errors.push(`${path} is required`);
    return;
  }
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  value.forEach((pile, index) => {
    if (!INVENTORY_PILES.includes(pile)) {
      errors.push(`${path}[${index}] must be one of: ${INVENTORY_PILES.join(', ')}`);
    }
  });
}

function validateCardSpec(spec, path, errors) {
  if (!isPlainObject(spec)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (spec.tier !== undefined && !['bronze', 'silver', 'gold'].includes(spec.tier)) {
    errors.push(`${path}.tier must be bronze, silver, or gold`);
  }
  if (spec.rarity !== undefined && !['common', 'rare'].includes(spec.rarity)) {
    errors.push(`${path}.rarity must be common or rare`);
  }
  if (spec.goldConsumption !== undefined && !GOLD_CONSUMPTION_MODES.includes(spec.goldConsumption)) {
    errors.push(`${path}.goldConsumption must be one of: ${GOLD_CONSUMPTION_MODES.join(', ')}`);
  }
  if (spec.goldConsumption !== undefined && spec.tier !== 'gold') {
    errors.push(`${path}.goldConsumption requires tier gold`);
  }
  if (spec.goldConsumption !== undefined && !goldConsumptionCompatible(
    spec,
    spec.goldConsumption,
    { requireFallback: true },
  )) {
    errors.push(`${path}.goldConsumption ${spec.goldConsumption} conflicts with SBC rarity eligibility ${spec.rarity || 'any'}`);
  }
  ['minRating', 'maxRating'].forEach((field) => {
    if (spec[field] === undefined) return;
    const rating = Number(spec[field]);
    if (!Number.isFinite(rating) || rating < 1 || rating > 99) {
      errors.push(`${path}.${field} must be a number between 1 and 99`);
    }
  });
  ['playerOnly', 'allowSpecial', 'special', 'protectHighGold', 'preferCommon'].forEach((field) => {
    if (spec[field] !== undefined && typeof spec[field] !== 'boolean') {
      errors.push(`${path}.${field} must be boolean`);
    }
  });
}

function validateRequirements(requirements, path, errors, required = false) {
  if (requirements === undefined || requirements === null) {
    if (required) errors.push(`${path} is required`);
    return;
  }
  if (!Array.isArray(requirements) || !requirements.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  requirements.forEach((requirement, index) => {
    const reqPath = `${path}[${index}]`;
    validateCardSpec(requirement, reqPath, errors);
    if (!Number.isFinite(Number(requirement?.count)) || Number(requirement.count) <= 0) {
      errors.push(`${reqPath}.count must be a positive number`);
    }
    validatePileList(requirement?.priorityPiles, `${reqPath}.priorityPiles`, errors);
  });
}

function validateUpgradeDef(upgradeDef, path, errors) {
  if (!isPlainObject(upgradeDef)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof upgradeDef.name !== 'string' || !upgradeDef.name.trim()) {
    errors.push(`${path}.name is required`);
  }
  validateStringArray(upgradeDef.sbcNames, `${path}.sbcNames`, errors, true);
  validateActivityBinding(upgradeDef.activityBinding, `${path}.activityBinding`, errors);
  validateSbcFodderPolicy(upgradeDef.sbcFodderPolicy, `${path}.sbcFodderPolicy`, errors);
  const hasChallengeRequirements = upgradeDef.challengeRequirements !== undefined;
  validateRequirements(upgradeDef.requirements, `${path}.requirements`, errors, !hasChallengeRequirements);
  if (hasChallengeRequirements) {
    if (!Array.isArray(upgradeDef.challengeRequirements) || !upgradeDef.challengeRequirements.length) {
      errors.push(`${path}.challengeRequirements must be a non-empty array`);
    } else {
      upgradeDef.challengeRequirements.forEach((requirements, index) => {
        validateRequirements(requirements, `${path}.challengeRequirements[${index}]`, errors, true);
      });
    }
  }
  validatePileList(upgradeDef.priorityPiles, `${path}.priorityPiles`, errors);
  ['openRewardPacks', 'forceOpenRewardPacks'].forEach((field) => {
    if (upgradeDef[field] !== undefined && typeof upgradeDef[field] !== 'boolean') {
      errors.push(`${path}.${field} must be boolean`);
    }
  });
}

function validateShortagePacks(shortagePacks, path, errors) {
  if (shortagePacks === undefined || shortagePacks === null) return;
  if (!Array.isArray(shortagePacks) || !shortagePacks.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  shortagePacks.forEach((source, index) => {
    const sourcePath = `${path}[${index}]`;
    if (!isPlainObject(source)) {
      errors.push(`${sourcePath} must be an object`);
      return;
    }
    validateCardSpec(source.requirement, `${sourcePath}.requirement`, errors);
    validateSourcePackRef(source.sourcePackRef, `${sourcePath}.sourcePackRef`, errors);
    validateNumberArray(source.packIds, `${sourcePath}.packIds`, errors);
    validateStringArray(source.packNames, `${sourcePath}.packNames`, errors);
    if (!source.sourcePackRef?.rewardOfLoopId && !source.packIds?.length && !source.packNames?.length) {
      errors.push(`${sourcePath}.sourcePackRef, ${sourcePath}.packIds, or ${sourcePath}.packNames is required`);
    }
    if (source.maxOpensPerAttempt !== undefined) {
      const maxOpens = Number(source.maxOpensPerAttempt);
      if (!Number.isFinite(maxOpens) || maxOpens <= 0) {
        errors.push(`${sourcePath}.maxOpensPerAttempt must be a positive number`);
      }
    }
  });
}

function normalizeRoutineStepId(step) {
  return typeof step === 'string' ? step : step?.loopId;
}

function validateRoutineSteps(steps, path, errors) {
  const allowedFields = new Set(['loopId', 'name', 'rewardFlow']);
  if (!Array.isArray(steps) || !steps.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  steps.forEach((step, index) => {
    const stepPath = `${path}[${index}]`;
    if (typeof step === 'string') {
      if (!step.trim()) errors.push(`${stepPath} must be a non-empty string`);
      return;
    }
    if (!isPlainObject(step)) {
      errors.push(`${stepPath} must be a loop id string or an object`);
      return;
    }
    if (typeof step.loopId !== 'string' || !step.loopId.trim()) {
      errors.push(`${stepPath}.loopId is required`);
    }
    if (step.name !== undefined && (typeof step.name !== 'string' || !step.name.trim())) {
      errors.push(`${stepPath}.name must be a non-empty string`);
    }
    Object.keys(step).forEach((field) => {
      if (!allowedFields.has(field)) errors.push(`${stepPath}.${field} belongs on the referenced child loop definition`);
    });
    validateRewardFlow(step.rewardFlow, `${stepPath}.rewardFlow`, errors);
  });
}

function validatePickOptions(value, path, errors) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const allowedFields = new Set([
    'protectHighGold',
    'highGoldThreshold',
    'autoSelect',
    'autoSelectBelow90',
    'pickSelectionMode',
    'autoPickThreshold',
    'protectionRating',
    'openAtEnd',
    'openPicksAtEnd',
    'preferScannedMetadata',
    'rollingStorageSinkEnabled',
    'rollingStorageSinkMode',
    'rollingStorageSinkSetId',
    'rollingStorageSinkSetName',
    'rollingSurplusCraftingEnabled',
    'rollingProvisionsShortageRecoveryEnabled',
    'rollingRequiredSpecialRecoveryEnabled',
    'rollingProtectAllClubNonTotwSpecials',
    'rollingDuplicateSwapEnabled',
    'rollingDuplicateSwapMode',
    'rollingProvisionsMaxRating',
    'rollingRecoveryStorageFirst',
    'rollingStorageRecoveryPriority',
    'rollingOpenDuplicateProvisionsRewards',
    'rollingShortageProvisionsPackLimit',
  ]);
  Object.keys(value).forEach((field) => {
    if (!allowedFields.has(field)) errors.push(`${path}.${field} is not supported`);
  });
  ['protectHighGold', 'autoSelect', 'autoSelectBelow90', 'openAtEnd', 'openPicksAtEnd', 'preferScannedMetadata', 'rollingStorageSinkEnabled', 'rollingSurplusCraftingEnabled', 'rollingProvisionsShortageRecoveryEnabled', 'rollingRequiredSpecialRecoveryEnabled', 'rollingProtectAllClubNonTotwSpecials', 'rollingDuplicateSwapEnabled', 'rollingRecoveryStorageFirst', 'rollingOpenDuplicateProvisionsRewards']
    .forEach((field) => {
      if (value[field] !== undefined && typeof value[field] !== 'boolean') {
        errors.push(`${path}.${field} must be boolean`);
      }
    });
  ['highGoldThreshold', 'autoPickThreshold', 'protectionRating'].forEach((field) => {
    if (value[field] === undefined) return;
    const number = Number(value[field]);
    if (!Number.isFinite(number) || number < 1 || number > 99) {
      errors.push(`${path}.${field} must be a number between 1 and 99`);
    }
  });
  if (value.pickSelectionMode !== undefined
    && !['rating-auto', 'rating-review', 'special-price', 'special-manual'].includes(value.pickSelectionMode)) {
    errors.push(`${path}.pickSelectionMode must be one of: rating-auto, rating-review, special-price, special-manual`);
  }
  if (value.rollingProvisionsMaxRating !== undefined
    && !ROLLING_PROVISIONS_MAX_RATINGS.includes(Number(value.rollingProvisionsMaxRating))) {
    errors.push(`${path}.rollingProvisionsMaxRating must be one of: ${ROLLING_PROVISIONS_MAX_RATINGS.join(', ')}`);
  }
  if (value.rollingShortageProvisionsPackLimit !== undefined) {
    const number = Number(value.rollingShortageProvisionsPackLimit);
    if (!Number.isInteger(number) || number < 1 || number > 30) {
      errors.push(`${path}.rollingShortageProvisionsPackLimit must be an integer between 1 and 30`);
    }
  }
  if (value.rollingStorageSinkMode !== undefined
    && !['off', 'automatic', 'selected'].includes(value.rollingStorageSinkMode)) {
    errors.push(`${path}.rollingStorageSinkMode must be off, automatic, or selected`);
  }
  if (value.rollingStorageRecoveryPriority !== undefined
    && !['storage-pressure', 'provisions'].includes(value.rollingStorageRecoveryPriority)) {
    errors.push(`${path}.rollingStorageRecoveryPriority must be storage-pressure or provisions`);
  }
  if (value.rollingDuplicateSwapMode !== undefined
    && !['off', 'special-only', 'safe-only', 'all-eligible'].includes(value.rollingDuplicateSwapMode)) {
    errors.push(`${path}.rollingDuplicateSwapMode must be off, special-only, safe-only, or all-eligible`);
  }
  if (value.rollingStorageSinkSetId !== undefined && value.rollingStorageSinkSetId !== null) {
    const number = Number(value.rollingStorageSinkSetId);
    if (!Number.isInteger(number) || number < 1) {
      errors.push(`${path}.rollingStorageSinkSetId must be a positive integer or null`);
    }
  }
  if (value.rollingStorageSinkSetName !== undefined
    && typeof value.rollingStorageSinkSetName !== 'string') {
    errors.push(`${path}.rollingStorageSinkSetName must be a string`);
  }
  if (value.rollingStorageSinkMode === 'selected'
    && (!Number.isInteger(Number(value.rollingStorageSinkSetId))
      || Number(value.rollingStorageSinkSetId) < 1)) {
    errors.push(`${path}.rollingStorageSinkSetId is required when mode is selected`);
  }
}

function validateEligibilityRequirementSnapshots(value, path, errors) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  value.forEach((requirement, index) => {
    const requirementPath = `${path}[${index}]`;
    if (!isPlainObject(requirement)) {
      errors.push(`${requirementPath} must be an object`);
      return;
    }
    if (typeof requirement.key !== 'string' || !requirement.key.trim()) {
      errors.push(`${requirementPath}.key must be a non-empty string`);
    }
    if (!Array.isArray(requirement.values) || !requirement.values.length) {
      errors.push(`${requirementPath}.values must be a non-empty array`);
    } else if (requirement.values.some((entry) => entry === undefined || entry === null || entry === '')) {
      errors.push(`${requirementPath}.values must not contain empty values`);
    }
    if (!Number.isInteger(Number(requirement.count)) || Number(requirement.count) < 1) {
      errors.push(`${requirementPath}.count must be a positive integer`);
    }
  });
}

function validateDynamicChallenges(value, path, errors) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  value.forEach((challenge, index) => {
    const challengePath = `${path}[${index}]`;
    if (!isPlainObject(challenge)) {
      errors.push(`${challengePath} must be an object`);
      return;
    }
    if (!Number.isInteger(Number(challenge.challengeId)) || Number(challenge.challengeId) < 1) {
      errors.push(`${challengePath}.challengeId must be a positive integer`);
    }
    validateEligibilityRequirementSnapshots(
      challenge.eligibilityRequirements,
      `${challengePath}.eligibilityRequirements`,
      errors,
    );
  });
}

function validateSbcFodderPolicy(value, path, errors) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const allowedFields = new Set(['mode', 'lowRatedGoldMaxRating', 'ratingSbcMaxCardRating']);
  Object.keys(value).forEach((field) => {
    if (!allowedFields.has(field)) errors.push(`${path}.${field} is not supported`);
  });
  if (value.mode !== undefined && !SBC_FODDER_MODES.includes(value.mode)) {
    errors.push(`${path}.mode must be one of: ${SBC_FODDER_MODES.join(', ')}`);
  }
  ['lowRatedGoldMaxRating', 'ratingSbcMaxCardRating'].forEach((field) => {
    if (value[field] === undefined) return;
    const rating = Number(value[field]);
    if (!Number.isFinite(rating) || rating < 1 || rating > 99) {
      errors.push(`${path}.${field} must be a number between 1 and 99`);
    }
  });
}

function validateRuntimeQuantity(value, path, errors, strategy) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (value.mode !== undefined && !RUNTIME_QUANTITY_MODES.includes(value.mode)) {
    errors.push(`${path}.mode must be one of: ${RUNTIME_QUANTITY_MODES.join(', ')}`);
  }
  if (value.target !== undefined && !RUNTIME_QUANTITY_TARGETS.includes(value.target)) {
    errors.push(`${path}.target must be one of: ${RUNTIME_QUANTITY_TARGETS.join(', ')}`);
  }
  if (value.allowZero !== undefined && typeof value.allowZero !== 'boolean') {
    errors.push(`${path}.allowZero must be boolean`);
  }
  const allowZero = strategy === 'rollingUpgrade' && value.allowZero === true;
  if (value.allowZero === true && strategy !== 'rollingUpgrade') {
    errors.push(`${path}.allowZero is only supported by strategy rollingUpgrade`);
  }
  ['default', 'min', 'max'].forEach((field) => {
    if (value[field] === undefined) return;
    const number = Number(value[field]);
    const minimum = allowZero ? 0 : 1;
    if (!Number.isInteger(number) || number < minimum || number > 1000) {
      errors.push(`${path}.${field} must be an integer between ${minimum} and 1000`);
    }
  });
  if (Number.isFinite(Number(value.min)) && Number.isFinite(Number(value.max))
    && Number(value.min) > Number(value.max)) {
    errors.push(`${path}.min must not exceed ${path}.max`);
  }
  if (value.label !== undefined && (typeof value.label !== 'string' || !value.label.trim())) {
    errors.push(`${path}.label must be a non-empty string`);
  }
}

function validateRollingPlayerPick(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!['resolved', 'unavailable', 'ambiguous'].includes(value.status)) {
    errors.push(`${path}.status must be resolved, unavailable, or ambiguous`);
  }
  if (value.required !== true) errors.push(`${path}.required must be true`);
  if (!isPlainObject(value.selector)) {
    errors.push(`${path}.selector must be an object`);
  } else {
    const allowedFields = new Set(['material', 'selectionCount', 'maxChallenges', 'repeatability', 'preference']);
    Object.keys(value.selector).forEach((field) => {
      if (!allowedFields.has(field)) errors.push(`${path}.selector.${field} is not supported`);
    });
    for (const field of ['selectionCount', 'maxChallenges']) {
      const number = Number(value.selector[field]);
      if (!Number.isInteger(number) || number < 1 || number > 99) {
        errors.push(`${path}.selector.${field} must be an integer between 1 and 99`);
      }
    }
    if (value.selector.material !== 'gold-with-required-rare') {
      errors.push(`${path}.selector.material must be gold-with-required-rare`);
    }
    if (value.selector.repeatability !== 'unlimited') {
      errors.push(`${path}.selector.repeatability must be unlimited`);
    }
    if (value.selector.preference !== 'rare-cost-first') {
      errors.push(`${path}.selector.preference must be rare-cost-first`);
    }
  }
  if (value.status === 'resolved' && value.loop?.strategy !== 'playerPickSbc') {
    errors.push(`${path}.loop must be a playerPickSbc loop when resolved`);
  }
  if (value.alternatives !== undefined && (!Array.isArray(value.alternatives)
    || value.alternatives.some((loop) => loop?.strategy !== 'playerPickSbc'))) {
    errors.push(`${path}.alternatives must contain only playerPickSbc loops`);
  }
}

function validateRollingStorageSinkPick(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!['resolved', 'unavailable', 'ambiguous'].includes(value.status)) {
    errors.push(`${path}.status must be resolved, unavailable, or ambiguous`);
  }
  if (value.required !== false) errors.push(`${path}.required must be false`);
  if (!isPlainObject(value.selector)) {
    errors.push(`${path}.selector must be an object`);
  } else {
    const allowedFields = new Set(['rewardMinRating', 'candidateCount', 'selectionCount', 'challengeRatings']);
    Object.keys(value.selector).forEach((field) => {
      if (!allowedFields.has(field)) errors.push(`${path}.selector.${field} is not supported`);
    });
    for (const field of ['rewardMinRating', 'candidateCount', 'selectionCount']) {
      const number = Number(value.selector[field]);
      if (!Number.isInteger(number) || number < 1 || number > 99) {
        errors.push(`${path}.selector.${field} must be an integer between 1 and 99`);
      }
    }
    const ratings = Array.isArray(value.selector.challengeRatings)
      ? value.selector.challengeRatings.map(Number).sort((left, right) => left - right)
      : [];
    if (ratings.length !== 2
      || ratings.some((rating) => !Number.isInteger(rating) || rating < 1 || rating > 99)
      || ratings.join(',') !== '88,89') {
      errors.push(`${path}.selector.challengeRatings must contain the 88 and 89 squad ratings`);
    }
  }
  if (value.status === 'resolved' && value.loop?.strategy !== 'playerPickSbc') {
    errors.push(`${path}.loop must be a playerPickSbc loop when resolved`);
  }
}

function validateRollingStorageSink(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!['resolved', 'unavailable', 'disabled'].includes(value.status)) {
    errors.push(`${path}.status must be resolved, unavailable, or disabled`);
  }
  if (value.required !== false) errors.push(`${path}.required must be false`);
  if (!['off', 'automatic', 'selected'].includes(value.mode)) {
    errors.push(`${path}.mode must be off, automatic, or selected`);
  }
  if (value.status === 'resolved') {
    const capability = value.capability;
    if (!isPlainObject(capability)) {
      errors.push(`${path}.capability must be an object when resolved`);
    } else {
      if (!Number.isInteger(Number(capability.setId)) || Number(capability.setId) < 1) {
        errors.push(`${path}.capability.setId must be a positive integer`);
      }
      if (!['player-pick', 'player'].includes(capability.rewardKind)) {
        errors.push(`${path}.capability.rewardKind must be player-pick or player`);
      }
      if (!Array.isArray(capability.challengeRatings)
        || !capability.challengeRatings.length
        || capability.challengeRatings.some((rating) => Number(rating) < 87)) {
        errors.push(`${path}.capability.challengeRatings must contain one or more ratings of 87+`);
      }
    }
  }
}

function validateRollingUpgrade(loopDef, errors) {
  if (loopDef.dynamicSbcFamily !== 'high-rated-x10' || Number(loopDef.dynamicRewardCount) !== 10) {
    errors.push('rollingUpgrade requires a scanned high-rated-x10 primary with 10 rewards');
  }
  validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
  validateNumberArray(loopDef.sbcSetIds, 'sbcSetIds', errors);
  validateNumberArray(loopDef.rewardPackIds, 'rewardPackIds', errors);
  if (Number(loopDef.requiredSpecialCount) !== 1 || Number(loopDef.allowedSpecialCount) !== 1) {
    errors.push('rollingUpgrade requires exactly one scanned Required Special slot');
  }
  const capabilities = [
    ['rollingTotwUpgrade', 'totw-upgrade'],
    ['rollingProvisionsUpgrade', 'provisions-upgrade'],
    ['rollingGoldSinkUpgrade', '5x80-upgrade'],
  ];
  for (const [field, family] of capabilities) {
    const capability = loopDef[field];
    if (!isPlainObject(capability)) {
      errors.push(`${field} must be an object`);
      continue;
    }
    validateActivityBinding(capability.activityBinding, `${field}.activityBinding`, errors);
    if (capability.activityBinding?.family !== family) {
      errors.push(`${field}.activityBinding.family must be ${family}`);
    }
  }
  validateRollingPlayerPick(loopDef.rollingPlayerPick, 'rollingPlayerPick', errors);
  validateRollingStorageSinkPick(loopDef.rollingStorageSinkPick, 'rollingStorageSinkPick', errors);
  validateRollingStorageSink(loopDef.rollingStorageSink, 'rollingStorageSink', errors);
  if (loopDef.runtimeQuantity?.allowZero !== true) {
    errors.push('rollingUpgrade runtimeQuantity.allowZero must be true');
  }
}

export function validateLoopDef(loopDef, label = 'loop') {
  const errors = [];
  if (!isPlainObject(loopDef)) return [`${label} must be an object`];

  if (typeof loopDef.name !== 'string' || !loopDef.name.trim()) {
    errors.push('name is required');
  }
  if (typeof loopDef.strategy !== 'string' || !loopDef.strategy.trim()) {
    errors.push('strategy is required');
  } else if (!LOOP_STRATEGIES.includes(loopDef.strategy)) {
    errors.push(`strategy must be one of: ${LOOP_STRATEGIES.join(', ')}`);
  }
  if (loopDef.dryRun !== undefined && typeof loopDef.dryRun !== 'boolean') {
    errors.push('dryRun must be boolean');
  }
  ['hidden', 'mvp', 'openRewardPacks', 'openRewardPacksAtEnd', 'blockSpecial', 'blockTradeable', 'inventoryFillFirst', 'consumeAllSourcePacks', 'exhaustSbcSet', 'discoveryReportedCompleted', 'respectFsuGoldRange', 'rollingWorkflowEnabled', 'defaultOpenRewardPacksOnSelect'].forEach((field) => {
    if (loopDef[field] !== undefined && typeof loopDef[field] !== 'boolean') {
      errors.push(`${field} must be boolean`);
    }
  });
  validatePickOptions(loopDef.pickOptions, 'pickOptions', errors);
  validateSbcFodderPolicy(loopDef.sbcFodderPolicy, 'sbcFodderPolicy', errors);
  validateRuntimeQuantity(loopDef.runtimeQuantity, 'runtimeQuantity', errors, loopDef.strategy);
  validateDynamicChallenges(loopDef.dynamicChallenges, 'dynamicChallenges', errors);
  validateEligibilityRequirementSnapshots(
    loopDef.dynamicActiveEligibilityRequirements,
    'dynamicActiveEligibilityRequirements',
    errors,
  );
  if (loopDef.inventoryMode !== undefined && !INVENTORY_MODES.includes(loopDef.inventoryMode)) {
    errors.push(`inventoryMode must be one of: ${INVENTORY_MODES.join(', ')}`);
  }
  if (loopDef.inventoryOnly !== undefined && typeof loopDef.inventoryOnly !== 'boolean') {
    errors.push('inventoryOnly must be boolean');
  }
  if (loopDef.dailyRecycleInventoryOnly !== undefined && typeof loopDef.dailyRecycleInventoryOnly !== 'boolean') {
    errors.push('dailyRecycleInventoryOnly must be boolean');
  }
  const hasInventoryMode = loopDef.inventoryMode !== undefined
    || loopDef.inventoryOnly !== undefined
    || loopDef.dailyRecycleInventoryOnly !== undefined;
  if (hasInventoryMode && LOOP_STRATEGIES.includes(loopDef.strategy)) {
    const capability = getLoopStrategyCapabilities(loopDef.strategy).inventoryOnly;
    if (![INVENTORY_ONLY_CAPABILITIES.supported, INVENTORY_ONLY_CAPABILITIES.container].includes(capability)) {
      errors.push(`inventoryMode is not configurable for strategy ${loopDef.strategy}`);
    }
  }
  if (loopDef.maxSubmittedRating !== undefined) {
    const maxRating = Number(loopDef.maxSubmittedRating);
    if (!Number.isFinite(maxRating) || maxRating < 1 || maxRating > 99) {
      errors.push('maxSubmittedRating must be a number between 1 and 99');
    }
  }
  if (loopDef.maxNormalGoldSubmittedRating !== undefined) {
    const maxRating = Number(loopDef.maxNormalGoldSubmittedRating);
    if (!Number.isFinite(maxRating) || maxRating < 1 || maxRating > 99) {
      errors.push('maxNormalGoldSubmittedRating must be a number between 1 and 99');
    }
  }
  if (loopDef.dailyCompletionLimit !== undefined) {
    const dailyLimit = Number(loopDef.dailyCompletionLimit);
    if (!Number.isFinite(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) {
      errors.push('dailyCompletionLimit must be a number between 1 and 100');
    }
  }
  if (loopDef.setCompletionSafetyLimit !== undefined) {
    const safetyLimit = Number(loopDef.setCompletionSafetyLimit);
    if (!Number.isInteger(safetyLimit) || safetyLimit < 1 || safetyLimit > 100) {
      errors.push('setCompletionSafetyLimit must be an integer between 1 and 100');
    }
  }
  if (loopDef.requiredSpecialMinRating !== undefined) {
    const minRating = Number(loopDef.requiredSpecialMinRating);
    if (!Number.isFinite(minRating) || minRating < 1 || minRating > 99) {
      errors.push('requiredSpecialMinRating must be a number between 1 and 99');
    }
  }
  if (loopDef.requiredSpecialKind !== undefined && !['totw', 'totw-tots-fof'].includes(String(loopDef.requiredSpecialKind).toLowerCase())) {
    errors.push('requiredSpecialKind must be totw or totw-tots-fof when provided');
  }
  if (loopDef.preCraftPlayerPickLoopId !== undefined && (typeof loopDef.preCraftPlayerPickLoopId !== 'string' || !loopDef.preCraftPlayerPickLoopId.trim())) {
    errors.push('preCraftPlayerPickLoopId must be a non-empty string');
  }
  if (loopDef.preCraftPlayerPick !== undefined) {
    if (!isPlainObject(loopDef.preCraftPlayerPick)) {
      errors.push('preCraftPlayerPick must be an object');
    } else {
      validateNumberArray(loopDef.preCraftPlayerPick.sbcSetIds, 'preCraftPlayerPick.sbcSetIds', errors);
      validateNumberArray(loopDef.preCraftPlayerPick.pickItemResourceIds, 'preCraftPlayerPick.pickItemResourceIds', errors);
      if (!loopDef.preCraftPlayerPick.sbcSetIds?.length && !loopDef.preCraftPlayerPick.pickItemResourceIds?.length) {
        errors.push('preCraftPlayerPick.sbcSetIds or preCraftPlayerPick.pickItemResourceIds is required');
      }
    }
  }
  if (loopDef.unassignedRecoveryPolicyIds !== undefined) {
    if (!Array.isArray(loopDef.unassignedRecoveryPolicyIds)) {
      errors.push('unassignedRecoveryPolicyIds must be an array');
    } else {
      loopDef.unassignedRecoveryPolicyIds.forEach((id, index) => {
        if (typeof id !== 'string' || !id.trim()) errors.push(`unassignedRecoveryPolicyIds[${index}] must be a non-empty string`);
      });
    }
  }
  if (loopDef.overflowRecovery !== undefined) {
    errors.push('overflowRecovery is obsolete; use top-level recoveryRecipes and unassignedRecoveryPolicies');
  }
  if (
    loopDef.autoTotwUpgrade !== undefined
    && loopDef.autoTotwUpgrade !== false
    && !isPlainObject(loopDef.autoTotwUpgrade)
  ) {
    errors.push('autoTotwUpgrade must be an object or false');
  }
  if (
    loopDef.autoFodderUpgrade !== undefined
    && loopDef.autoFodderUpgrade !== false
    && !isPlainObject(loopDef.autoFodderUpgrade)
  ) {
    errors.push('autoFodderUpgrade must be an object or false');
  }
  if (isPlainObject(loopDef.autoFodderUpgrade) && loopDef.autoFodderUpgrade.maxAttemptsPerCompletion !== undefined) {
    const attempts = Number(loopDef.autoFodderUpgrade.maxAttemptsPerCompletion);
    if (!Number.isFinite(attempts) || attempts < 1 || attempts > 10) {
      errors.push('autoFodderUpgrade.maxAttemptsPerCompletion must be a number between 1 and 10');
    }
  }
  if (loopDef.dynamicRewardMinRating !== undefined && loopDef.dynamicRewardMinRating !== null) {
    const minRating = Number(loopDef.dynamicRewardMinRating);
    if (!Number.isInteger(minRating) || minRating < 1 || minRating > 99) {
      errors.push('dynamicRewardMinRating must be an integer between 1 and 99');
    }
  }
  if (loopDef.repeatability !== undefined
    && !['unlimited', 'bounded', 'unknown'].includes(loopDef.repeatability)) {
    errors.push('repeatability must be unlimited, bounded, or unknown');
  }
  if (loopDef.completionLimit !== undefined && loopDef.completionLimit !== null) {
    const completionLimit = Number(loopDef.completionLimit);
    if (!Number.isInteger(completionLimit) || completionLimit < 1) {
      errors.push('completionLimit must be null or a positive integer');
    }
  }
  if (loopDef.preCraftPlayerPickSelector !== undefined) {
    if (!isPlainObject(loopDef.preCraftPlayerPickSelector)) {
      errors.push('preCraftPlayerPickSelector must be an object');
    } else {
      const allowedFields = new Set(['material']);
      Object.keys(loopDef.preCraftPlayerPickSelector).forEach((field) => {
        if (!allowedFields.has(field)) errors.push(`preCraftPlayerPickSelector.${field} is not supported`);
      });
      if (loopDef.preCraftPlayerPickSelector.material !== 'common-gold') {
        errors.push('preCraftPlayerPickSelector.material must be common-gold');
      }
    }
  }
  if (isPlainObject(loopDef.autoTotwUpgrade)) {
    validateActivityBinding(loopDef.autoTotwUpgrade.activityBinding, 'autoTotwUpgrade.activityBinding', errors);
  }
  if (isPlainObject(loopDef.autoFodderUpgrade)) {
    validateActivityBinding(loopDef.autoFodderUpgrade.activityBinding, 'autoFodderUpgrade.activityBinding', errors);
  }
  if (loopDef.ratingSbcFill !== undefined) {
    if (!isPlainObject(loopDef.ratingSbcFill)) {
      errors.push('ratingSbcFill must be an object');
    } else {
      validatePileList(loopDef.ratingSbcFill.priorityPiles, 'ratingSbcFill.priorityPiles', errors, true);
      if (loopDef.ratingSbcFill.targetRating !== undefined) {
        const targetRating = Number(loopDef.ratingSbcFill.targetRating);
        if (!Number.isFinite(targetRating) || targetRating < 1 || targetRating > 99) {
          errors.push('ratingSbcFill.targetRating must be a number between 1 and 99');
        }
      }
    }
  }

  validateNumberArray(loopDef.sourcePackIds, 'sourcePackIds', errors);
  validateNumberArray(loopDef.rewardPackIds, 'rewardPackIds', errors);
  validateNumberArray(loopDef.protectedItemIds, 'protectedItemIds', errors);
  validateNumberArray(loopDef.protectedDefinitionIds, 'protectedDefinitionIds', errors);
  validateStringArray(loopDef.sourcePackNames, 'sourcePackNames', errors);
  validateSourcePackRef(loopDef.sourcePackRef, 'sourcePackRef', errors);
  if (loopDef.sourcePackRef !== undefined && !SOURCE_PACK_REF_STRATEGIES.includes(loopDef.strategy)) {
    errors.push(`sourcePackRef is not supported by strategy ${loopDef.strategy}`);
  }
  validateStringArray(loopDef.rewardPackNames, 'rewardPackNames', errors);
  validatePileList(loopDef.priorityPiles, 'priorityPiles', errors);
  validatePileList(loopDef.primaryPiles, 'primaryPiles', errors);
  validatePileList(loopDef.clubFallbackPiles, 'clubFallbackPiles', errors);
  validatePileList(loopDef.disabledPiles, 'disabledPiles', errors);
  validateRewardFlow(loopDef.rewardFlow, 'rewardFlow', errors);
  validateActivityBinding(loopDef.activityBinding, 'activityBinding', errors);

  if (loopDef.strategy === 'validationBronzeUpgrade') {
    validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
    validateCardSpec(loopDef.targetDuplicate, 'targetDuplicate', errors);
  }

  if (loopDef.strategy === 'dailySingleCardRecycle') {
    validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
    validateCardSpec(loopDef.targetDuplicate, 'targetDuplicate', errors);
  }

  if (['dailyRoutine', 'workflowRoutine'].includes(loopDef.strategy)) {
    validateRoutineSteps(loopDef.steps, 'steps', errors);
    if (loopDef.strategy === 'workflowRoutine' && loopDef.stepOverrides !== undefined) {
      errors.push('stepOverrides is only supported by dailyRoutine compatibility flows; configure a dedicated child loop instead');
    }
    if (loopDef.stepOverrides !== undefined) {
      if (!isPlainObject(loopDef.stepOverrides)) {
        errors.push('stepOverrides must be an object');
      } else {
        Object.entries(loopDef.stepOverrides).forEach(([stepId, override]) => {
          if (!isPlainObject(override)) errors.push(`stepOverrides.${stepId} must be an object`);
        });
      }
    }
  }

  if (loopDef.strategy === 'fillAndVerifySbc') {
    validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
    if (loopDef.requirements !== undefined) validateRequirements(loopDef.requirements, 'requirements', errors, false);
  }

  if (loopDef.strategy === 'inventoryExhaustion') {
    if (!Array.isArray(loopDef.stages) || !loopDef.stages.length) {
      errors.push('stages must be a non-empty array');
    } else {
      loopDef.stages.forEach((stage, index) => {
        validateUpgradeDef(stage, `stages[${index}]`, errors);
        if (stage.maxCompletions !== undefined) {
          const maxCompletions = Number(stage.maxCompletions);
          if (!Number.isInteger(maxCompletions) || maxCompletions < 1 || maxCompletions > 1000) {
            errors.push(`stages[${index}].maxCompletions must be an integer between 1 and 1000`);
          }
        }
      });
    }
  }

  if (loopDef.strategy === 'rollingUpgrade') {
    validateRollingUpgrade(loopDef, errors);
  }

  if (['supplyAndCraft', 'inventoryMixedUpgrade', 'commonGoldToRareUpgrade'].includes(loopDef.strategy)) {
    validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
    validateRequirements(loopDef.requirements, 'requirements', errors, true);
    if (loopDef.strategy === 'supplyAndCraft' || loopDef.strategy === 'inventoryMixedUpgrade') {
      validateShortagePacks(loopDef.shortagePacks, 'shortagePacks', errors);
    }
  }

  if (loopDef.strategy === 'provisionPackCrafting' || loopDef.strategy === 'provisionPackDualCrafting') {
    if (!hasSourcePackIdentity(loopDef)) {
      errors.push('sourcePackRef, sourcePackIds, or sourcePackNames is required');
    }
    if (loopDef.craftingUpgrades !== undefined) {
      if (!Array.isArray(loopDef.craftingUpgrades) || !loopDef.craftingUpgrades.length) {
        errors.push('craftingUpgrades must be a non-empty array');
      } else {
        loopDef.craftingUpgrades.forEach((upgradeDef, index) => {
          validateUpgradeDef(upgradeDef, `craftingUpgrades[${index}]`, errors);
        });
      }
    } else {
      const legacyUpgrades = [loopDef.commonUpgrade, loopDef.rareUpgrade].filter((upgradeDef) => upgradeDef !== undefined);
      if (!legacyUpgrades.length) errors.push('craftingUpgrades or a legacy commonUpgrade/rareUpgrade is required');
      if (loopDef.commonUpgrade !== undefined) validateUpgradeDef(loopDef.commonUpgrade, 'commonUpgrade', errors);
      if (loopDef.rareUpgrade !== undefined) validateUpgradeDef(loopDef.rareUpgrade, 'rareUpgrade', errors);
    }
  }

  if (loopDef.strategy === 'rarePackTo84Upgrade') {
    if (!hasSourcePackIdentity(loopDef)) {
      errors.push('sourcePackRef, sourcePackIds, or sourcePackNames is required');
    }
    validateUpgradeDef(loopDef.rareUpgrade, 'rareUpgrade', errors);
    if (loopDef.sourceExhaustedFallbackLoopId !== undefined && (typeof loopDef.sourceExhaustedFallbackLoopId !== 'string' || !loopDef.sourceExhaustedFallbackLoopId.trim())) {
      errors.push('sourceExhaustedFallbackLoopId must be a non-empty string');
    }
    if (loopDef.sourceExhaustedFallbackActivityFamily !== undefined) {
      if (typeof loopDef.sourceExhaustedFallbackActivityFamily !== 'string' || !loopDef.sourceExhaustedFallbackActivityFamily.trim()) {
        errors.push('sourceExhaustedFallbackActivityFamily must be a non-empty string');
      } else if (!SBC_ACTIVITY_FAMILY_IDS.includes(loopDef.sourceExhaustedFallbackActivityFamily)) {
        errors.push(`sourceExhaustedFallbackActivityFamily is not supported: ${loopDef.sourceExhaustedFallbackActivityFamily}`);
      }
    }
    if (loopDef.sourceExhaustedFallbackLoopId && loopDef.sourceExhaustedFallbackActivityFamily) {
      errors.push('sourceExhaustedFallbackLoopId and sourceExhaustedFallbackActivityFamily cannot both be configured');
    }
    if (loopDef.sourceExhaustedFallbackMaxCompletions !== undefined) {
      const fallbackLimit = Number(loopDef.sourceExhaustedFallbackMaxCompletions);
      if (!Number.isFinite(fallbackLimit) || fallbackLimit <= 0) {
        errors.push('sourceExhaustedFallbackMaxCompletions must be a positive number');
      }
    }
    if (loopDef.maxPacks !== undefined) {
      const maxPacks = Number(loopDef.maxPacks);
      if (!Number.isFinite(maxPacks) || maxPacks <= 0) {
        errors.push('maxPacks must be a positive number');
      }
    }
  }

  if (loopDef.strategy === 'playerPickSbc') {
    validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
    validateStringArray(loopDef.pickItemNames, 'pickItemNames', errors, true);
    validateNumberArray(loopDef.sbcSetIds, 'sbcSetIds', errors);
    validateNumberArray(loopDef.pickItemResourceIds, 'pickItemResourceIds', errors);
    const hasChallengeRequirements = loopDef.challengeRequirements !== undefined;
    validateRequirements(loopDef.requirements, 'requirements', errors, !hasChallengeRequirements);
    if (hasChallengeRequirements) {
      if (!Array.isArray(loopDef.challengeRequirements) || !loopDef.challengeRequirements.length) {
        errors.push('challengeRequirements must be a non-empty array');
      } else {
        loopDef.challengeRequirements.forEach((requirements, index) => {
          validateRequirements(requirements, `challengeRequirements[${index}]`, errors, true);
        });
      }
    }
    const challengesPerPick = Number(loopDef.challengesPerPick || loopDef.challengeRequirements?.length || 1);
    const pickCount = Number(loopDef.pickCount || 1);
    const pickCandidateCount = loopDef.pickCandidateCount === undefined
      ? null
      : Number(loopDef.pickCandidateCount);
    if (!Number.isInteger(challengesPerPick) || challengesPerPick < 1 || challengesPerPick > 10) {
      errors.push('challengesPerPick must be an integer between 1 and 10');
    }
    if (
      loopDef.challengesPerPick !== undefined
      && Array.isArray(loopDef.challengeRequirements)
      && loopDef.challengeRequirements.length !== challengesPerPick
    ) {
      errors.push('challengesPerPick must match challengeRequirements.length when both are provided');
    }
    if (!Number.isInteger(pickCount) || pickCount < 1 || pickCount > 10) {
      errors.push('pickCount must be an integer between 1 and 10');
    }
    if (pickCandidateCount !== null && (!Number.isInteger(pickCandidateCount) || pickCandidateCount < 1 || pickCandidateCount > 20)) {
      errors.push('pickCandidateCount must be an integer between 1 and 20');
    } else if (pickCandidateCount !== null && pickCandidateCount < pickCount) {
      errors.push('pickCandidateCount must be greater than or equal to pickCount');
    }
    if (loopDef.pricePlatform !== undefined && !['pc', 'ps', 'xbox'].includes(String(loopDef.pricePlatform).toLowerCase())) {
      errors.push('pricePlatform must be pc, ps, or xbox when provided');
    }
    if (loopDef.exhaustSbcSet === true && loopDef.useRoundsAsCompletions === true) {
      errors.push('exhaustSbcSet cannot be combined with useRoundsAsCompletions');
    }
  }

  return errors;
}

export function assertValidLoopDef(loopDef, label = 'Loop JSON') {
  const errors = validateLoopDef(loopDef, label);
  if (errors.length) fail(`${label} validation failed:\n- ${errors.join('\n- ')}`);
}

export function validateLoopDefList(loopDefs, label = 'Loop config') {
  if (!Array.isArray(loopDefs) || !loopDefs.length) {
    fail(`${label} must be a non-empty array or an object with a loops array`);
  }
  const seen = new Set();
  loopDefs.forEach((loopDef, index) => {
    assertValidLoopDef(loopDef, `${label}[${index}]`);
    if (typeof loopDef.id !== 'string' || !loopDef.id.trim()) {
      fail(`${label}[${index}].id is required`);
    }
    if (loopDef.id) {
      if (seen.has(loopDef.id)) fail(`${label} has duplicate id: ${loopDef.id}`);
      seen.add(loopDef.id);
    }
  });
  const byId = new Map(loopDefs.map((loopDef) => [loopDef.id, loopDef]));
  loopDefs.forEach((loopDef, index) => {
    const references = [
      { path: `${label}[${index}].sourcePackRef`, value: loopDef.sourcePackRef },
      ...(loopDef.shortagePacks || []).map((source, sourceIndex) => ({
        path: `${label}[${index}].shortagePacks[${sourceIndex}].sourcePackRef`,
        value: source?.sourcePackRef,
      })),
    ];
    for (const reference of references) {
      const targetId = reference.value?.rewardOfLoopId;
      if (!targetId) continue;
      if (targetId === loopDef.id) fail(`${reference.path}.rewardOfLoopId cannot reference its own Loop`);
      const target = byId.get(targetId);
      if (!target) fail(`${reference.path}.rewardOfLoopId not found: ${targetId}`);
      if (!target.sbcSetIds?.length && !target.sbcNames?.length) {
        fail(`${reference.path}.rewardOfLoopId must reference a Loop with sbcSetIds or sbcNames: ${targetId}`);
      }
    }
  });
  loopDefs.forEach((loopDef, index) => {
    if (!loopDef.preCraftPlayerPickLoopId) return;
    const target = loopDefs.find((candidate) => candidate.id === loopDef.preCraftPlayerPickLoopId);
    if (!target) fail(`${label}[${index}].preCraftPlayerPickLoopId not found: ${loopDef.preCraftPlayerPickLoopId}`);
    if (target.strategy !== 'playerPickSbc') {
      fail(`${label}[${index}].preCraftPlayerPickLoopId must reference a playerPickSbc loop`);
    }
  });
  loopDefs.forEach((loopDef, index) => {
    if (['dailyRoutine', 'workflowRoutine'].includes(loopDef.strategy) && isPlainObject(loopDef.stepOverrides)) {
      const stepIds = new Set((loopDef.steps || []).map(normalizeRoutineStepId).filter(Boolean));
      Object.keys(loopDef.stepOverrides).forEach((stepId) => {
        if (!stepIds.has(stepId)) fail(`${label}[${index}].stepOverrides references a non-step loop: ${stepId}`);
      });
    }
    if (!loopDef.sourceExhaustedFallbackLoopId) return;
    const target = loopDefs.find((candidate) => candidate.id === loopDef.sourceExhaustedFallbackLoopId);
    if (!target) fail(`${label}[${index}].sourceExhaustedFallbackLoopId not found: ${loopDef.sourceExhaustedFallbackLoopId}`);
    if (target.strategy !== 'fillAndVerifySbc') {
      fail(`${label}[${index}].sourceExhaustedFallbackLoopId must reference a fillAndVerifySbc loop`);
    }
  });
}

function validateRoutineReferences(loopDefs, label) {
  const byId = new Map(loopDefs.map((loopDef) => [loopDef.id, loopDef]));
  loopDefs.forEach((loopDef, loopIndex) => {
    if (!['dailyRoutine', 'workflowRoutine'].includes(loopDef.strategy)) return;
    (loopDef.steps || []).forEach((step, stepIndex) => {
      const stepId = normalizeRoutineStepId(step);
      const path = `${label}.loops[${loopIndex}].steps[${stepIndex}]`;
      if (!stepId || !byId.has(stepId)) fail(`${path} loop not found: ${stepId || '?'}`);
      if (stepId === loopDef.id) fail(`${path} cannot reference itself`);
      const target = byId.get(stepId);
      if (target?.strategy === 'dailyRoutine' || target?.strategy === 'workflowRoutine') {
        fail(`${path} cannot reference another routine; flatten its child steps instead`);
      }
    });
  });
}

function validateRecoveryAction(value, path, errors) {
  if (value !== undefined && !['continue', 'stop'].includes(value)) {
    errors.push(`${path} must be continue or stop`);
  }
}

function validateRecoveryRecipeList(recipes, label = 'recoveryRecipes') {
  if (!Array.isArray(recipes)) fail(`${label} must be an array`);
  const seen = new Set();
  recipes.forEach((recipe, index) => {
    const path = `${label}[${index}]`;
    const errors = [];
    if (!isPlainObject(recipe)) fail(`${path} must be an object`);
    if (typeof recipe.id !== 'string' || !recipe.id.trim()) errors.push(`${path}.id is required`);
    if (seen.has(recipe.id)) errors.push(`${label} has duplicate id: ${recipe.id}`);
    seen.add(recipe.id);
    validateUpgradeDef(recipe, path, errors);
    if (recipe.maxSubmissions !== undefined && Number(recipe.maxSubmissions) !== 1) {
      errors.push(`${path}.maxSubmissions must be 1`);
    }
    if (recipe.mustConsumeTrigger !== true) {
      errors.push(`${path}.mustConsumeTrigger must be true`);
    }
    validateRecoveryAction(recipe.onUnavailable, `${path}.onUnavailable`, errors);
    validateRecoveryAction(recipe.onInsufficient, `${path}.onInsufficient`, errors);
    if (recipe.onBlocked !== undefined && recipe.onBlocked !== 'stop') {
      errors.push(`${path}.onBlocked must be stop`);
    }
    if (errors.length) fail(`${path} validation failed:\n- ${errors.join('\n- ')}`);
  });
}

function validateRecoveryPolicyList(policies, recipes, label = 'unassignedRecoveryPolicies') {
  if (!Array.isArray(policies)) fail(`${label} must be an array`);
  const recipeIds = new Set(recipes.map((recipe) => recipe.id));
  const seen = new Set();
  policies.forEach((policy, index) => {
    const path = `${label}[${index}]`;
    const errors = [];
    if (!isPlainObject(policy)) fail(`${path} must be an object`);
    if (typeof policy.id !== 'string' || !policy.id.trim()) errors.push(`${path}.id is required`);
    if (seen.has(policy.id)) errors.push(`${label} has duplicate id: ${policy.id}`);
    seen.add(policy.id);
    validateCardSpec(policy.match, `${path}.match`, errors);
    if (!Array.isArray(policy.steps) || !policy.steps.length) {
      errors.push(`${path}.steps must be a non-empty array`);
    } else {
      policy.steps.forEach((step, stepIndex) => {
        const stepPath = `${path}.steps[${stepIndex}]`;
        if (!isPlainObject(step) || typeof step.recipeId !== 'string' || !step.recipeId.trim()) {
          errors.push(`${stepPath}.recipeId is required`);
          return;
        }
        if (!recipeIds.has(step.recipeId)) errors.push(`${stepPath}.recipeId not found: ${step.recipeId}`);
        validateRecoveryAction(step.onUnavailable, `${stepPath}.onUnavailable`, errors);
        validateRecoveryAction(step.onInsufficient, `${stepPath}.onInsufficient`, errors);
        if (step.onBlocked !== undefined && step.onBlocked !== 'stop') {
          errors.push(`${stepPath}.onBlocked must be stop`);
        }
      });
    }
    if (errors.length) fail(`${path} validation failed:\n- ${errors.join('\n- ')}`);
  });
}

function validateRecoveryPolicyIds(ids, policies, path, allowEmpty = true) {
  if (!Array.isArray(ids) || (!allowEmpty && !ids.length)) {
    fail(`${path} must be an array${allowEmpty ? '' : ' with at least one entry'}`);
  }
  const policyIds = new Set(policies.map((policy) => policy.id));
  ids.forEach((id, index) => {
    if (typeof id !== 'string' || !id.trim()) fail(`${path}[${index}] must be a non-empty string`);
    if (!policyIds.has(id)) fail(`${path}[${index}] not found: ${id}`);
  });
}

export function normalizeLoopConfig(config) {
  const input = Array.isArray(config) ? { loops: config } : config;
  if (!isPlainObject(input) || !Array.isArray(input.loops)) {
    fail('Loop config JSON must be an array or an object with a loops array');
  }
  return {
    loops: input.loops,
    recoveryRecipes: input.recoveryRecipes === undefined ? RECOVERY_RECIPES : input.recoveryRecipes,
    unassignedRecoveryPolicies: input.unassignedRecoveryPolicies === undefined
      ? UNASSIGNED_RECOVERY_POLICIES
      : input.unassignedRecoveryPolicies,
    defaultUnassignedRecoveryPolicyIds: input.defaultUnassignedRecoveryPolicyIds === undefined
      ? DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS
      : input.defaultUnassignedRecoveryPolicyIds,
  };
}

export function validateLoopConfig(config, label = 'Loop config') {
  const normalized = normalizeLoopConfig(config);
  validateLoopDefList(normalized.loops, `${label}.loops`);
  validateRecoveryRecipeList(normalized.recoveryRecipes, `${label}.recoveryRecipes`);
  validateRecoveryPolicyList(
    normalized.unassignedRecoveryPolicies,
    normalized.recoveryRecipes,
    `${label}.unassignedRecoveryPolicies`,
  );
  validateRecoveryPolicyIds(
    normalized.defaultUnassignedRecoveryPolicyIds,
    normalized.unassignedRecoveryPolicies,
    `${label}.defaultUnassignedRecoveryPolicyIds`,
  );
  normalized.loops.forEach((loopDef, index) => {
    if (loopDef.unassignedRecoveryPolicyIds === undefined) return;
    validateRecoveryPolicyIds(
      loopDef.unassignedRecoveryPolicyIds,
      normalized.unassignedRecoveryPolicies,
      `${label}.loops[${index}].unassignedRecoveryPolicyIds`,
    );
  });
  normalized.loops.forEach((loopDef, index) => {
    const flowPolicies = loopDef.rewardFlow?.unassignedRecoveryPolicyIds;
    if (flowPolicies === undefined) return;
    validateRecoveryPolicyIds(
      flowPolicies,
      normalized.unassignedRecoveryPolicies,
      `${label}.loops[${index}].rewardFlow.unassignedRecoveryPolicyIds`,
    );
  });
  normalized.loops.forEach((loopDef, loopIndex) => {
    if (!['dailyRoutine', 'workflowRoutine'].includes(loopDef.strategy)) return;
    (loopDef.steps || []).forEach((step, stepIndex) => {
      const flowPolicies = typeof step === 'object' ? step.rewardFlow?.unassignedRecoveryPolicyIds : undefined;
      if (flowPolicies === undefined) return;
      validateRecoveryPolicyIds(
        flowPolicies,
        normalized.unassignedRecoveryPolicies,
        `${label}.loops[${loopIndex}].steps[${stepIndex}].rewardFlow.unassignedRecoveryPolicyIds`,
      );
    });
  });
  validateRoutineReferences(normalized.loops, label);
  return normalized;
}

export function parseLoopConfig(text) {
  return normalizeLoopConfig(JSON.parse(text));
}
