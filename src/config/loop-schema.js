import { isPlainObject } from '../domain/objects.js';
import {
  DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
  RECOVERY_RECIPES,
  UNASSIGNED_RECOVERY_POLICIES,
} from './recovery.js';

const LOOP_STRATEGIES = Object.freeze([
  'validationBronzeUpgrade',
  'dailySingleCardRecycle',
  'supplyAndCraft',
  'inventoryMixedUpgrade',
  'commonGoldToRareUpgrade',
  'provisionPackCrafting',
  'provisionPackDualCrafting',
  'rarePackTo84Upgrade',
  'playerPickSbc',
  'dailyRoutine',
  'fillAndVerifySbc',
  'inventoryExhaustion',
]);

const INVENTORY_PILES = Object.freeze(['unassigned', 'storage', 'transfer', 'club']);

function fail(message) {
  throw new Error(message);
}

function validateStringArray(value, path, errors, required = false) {
  if (value === undefined || value === null) {
    if (required) errors.push(`${path} is required`);
    return;
  }
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${path} must be a non-empty array`);
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
    validateNumberArray(source.packIds, `${sourcePath}.packIds`, errors);
    validateStringArray(source.packNames, `${sourcePath}.packNames`, errors);
    if (!source.packIds?.length && !source.packNames?.length) {
      errors.push(`${sourcePath}.packIds or ${sourcePath}.packNames is required`);
    }
    if (source.maxOpensPerAttempt !== undefined) {
      const maxOpens = Number(source.maxOpensPerAttempt);
      if (!Number.isFinite(maxOpens) || maxOpens <= 0) {
        errors.push(`${sourcePath}.maxOpensPerAttempt must be a positive number`);
      }
    }
  });
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
  ['hidden', 'mvp', 'openRewardPacks', 'openRewardPacksAtEnd', 'blockSpecial', 'blockTradeable', 'inventoryFillFirst', 'consumeAllSourcePacks', 'exhaustSbcSet', 'discoveryReportedCompleted'].forEach((field) => {
    if (loopDef[field] !== undefined && typeof loopDef[field] !== 'boolean') {
      errors.push(`${field} must be boolean`);
    }
  });
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
      if (loopDef.ratingSbcFill.maxSearchNodes !== undefined) {
        const maxSearchNodes = Number(loopDef.ratingSbcFill.maxSearchNodes);
        if (!Number.isInteger(maxSearchNodes) || maxSearchNodes < 10000 || maxSearchNodes > 2000000) {
          errors.push('ratingSbcFill.maxSearchNodes must be an integer between 10000 and 2000000');
        }
      }
      if (loopDef.ratingSbcFill.maxSearchMs !== undefined) {
        const maxSearchMs = Number(loopDef.ratingSbcFill.maxSearchMs);
        if (!Number.isInteger(maxSearchMs) || maxSearchMs < 1000 || maxSearchMs > 60000) {
          errors.push('ratingSbcFill.maxSearchMs must be an integer between 1000 and 60000');
        }
      }
      if (loopDef.ratingSbcFill.yieldEveryNodes !== undefined) {
        const yieldEveryNodes = Number(loopDef.ratingSbcFill.yieldEveryNodes);
        if (!Number.isInteger(yieldEveryNodes) || yieldEveryNodes < 50 || yieldEveryNodes > 5000) {
          errors.push('ratingSbcFill.yieldEveryNodes must be an integer between 50 and 5000');
        }
      }
    }
  }

  validateNumberArray(loopDef.sourcePackIds, 'sourcePackIds', errors);
  validateNumberArray(loopDef.rewardPackIds, 'rewardPackIds', errors);
  validateNumberArray(loopDef.protectedItemIds, 'protectedItemIds', errors);
  validateNumberArray(loopDef.protectedDefinitionIds, 'protectedDefinitionIds', errors);
  validateStringArray(loopDef.sourcePackNames, 'sourcePackNames', errors);
  validateStringArray(loopDef.rewardPackNames, 'rewardPackNames', errors);
  validatePileList(loopDef.priorityPiles, 'priorityPiles', errors);
  validatePileList(loopDef.primaryPiles, 'primaryPiles', errors);
  validatePileList(loopDef.clubFallbackPiles, 'clubFallbackPiles', errors);
  validatePileList(loopDef.disabledPiles, 'disabledPiles', errors);

  if (loopDef.strategy === 'validationBronzeUpgrade') {
    validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
    validateCardSpec(loopDef.targetDuplicate, 'targetDuplicate', errors);
  }

  if (loopDef.strategy === 'dailySingleCardRecycle') {
    validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
    validateCardSpec(loopDef.targetDuplicate, 'targetDuplicate', errors);
  }

  if (loopDef.strategy === 'dailyRoutine') {
    validateStringArray(loopDef.steps, 'steps', errors, true);
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

  if (['supplyAndCraft', 'inventoryMixedUpgrade', 'commonGoldToRareUpgrade'].includes(loopDef.strategy)) {
    validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
    validateRequirements(loopDef.requirements, 'requirements', errors, true);
    if (loopDef.strategy === 'supplyAndCraft' || loopDef.strategy === 'inventoryMixedUpgrade') {
      validateShortagePacks(loopDef.shortagePacks, 'shortagePacks', errors);
    }
  }

  if (loopDef.strategy === 'provisionPackCrafting' || loopDef.strategy === 'provisionPackDualCrafting') {
    if (!loopDef.sourcePackIds?.length && !loopDef.sourcePackNames?.length) {
      errors.push('sourcePackIds or sourcePackNames is required');
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
    if (!loopDef.sourcePackIds?.length && !loopDef.sourcePackNames?.length) {
      errors.push('sourcePackIds or sourcePackNames is required');
    }
    validateUpgradeDef(loopDef.rareUpgrade, 'rareUpgrade', errors);
    if (loopDef.sourceExhaustedFallbackLoopId !== undefined && (typeof loopDef.sourceExhaustedFallbackLoopId !== 'string' || !loopDef.sourceExhaustedFallbackLoopId.trim())) {
      errors.push('sourceExhaustedFallbackLoopId must be a non-empty string');
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
  loopDefs.forEach((loopDef, index) => {
    if (!loopDef.preCraftPlayerPickLoopId) return;
    const target = loopDefs.find((candidate) => candidate.id === loopDef.preCraftPlayerPickLoopId);
    if (!target) fail(`${label}[${index}].preCraftPlayerPickLoopId not found: ${loopDef.preCraftPlayerPickLoopId}`);
    if (target.strategy !== 'playerPickSbc') {
      fail(`${label}[${index}].preCraftPlayerPickLoopId must reference a playerPickSbc loop`);
    }
  });
  loopDefs.forEach((loopDef, index) => {
    if (loopDef.strategy === 'dailyRoutine' && isPlainObject(loopDef.stepOverrides)) {
      const stepIds = new Set(loopDef.steps || []);
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
  return normalized;
}

export function parseLoopConfig(text) {
  return normalizeLoopConfig(JSON.parse(text));
}
