function refMatches(ref, expectedRefs = []) {
  const id = Number(ref?.id || 0);
  const definitionId = Number(ref?.definitionId || 0);
  return expectedRefs.some((expected) => {
    const expectedId = Number(expected?.id || 0);
    if (expectedId) return expectedId === id;
    return Number(expected?.definitionId || 0) > 0 && Number(expected.definitionId) === definitionId;
  });
}

export function itemMatchesRecoverySpec(item, spec = {}) {
  if (spec.playerOnly && item?.type !== 'player') return false;
  if (spec.tier && item?.tier !== spec.tier) return false;
  if (spec.rarity === 'rare' && item?.rare !== true) return false;
  if (spec.rarity === 'common' && item?.rare === true) return false;
  if (spec.special === true && item?.special !== true) return false;
  if (spec.special === false && item?.special === true) return false;
  if (spec.special !== true && spec.allowSpecial !== true && item?.special === true) return false;
  if (spec.minRating !== undefined && Number(item?.rating || 0) < Number(spec.minRating)) return false;
  if (spec.maxRating !== undefined && Number(item?.rating || 0) > Number(spec.maxRating)) return false;
  return true;
}

export function matchingBlockedItemRefs(plan, snapshot, policy) {
  const blockedRefs = plan?.blocked?.itemRefs || [];
  const unassigned = snapshot?.piles?.unassigned || [];
  return unassigned
    .filter((item) => refMatches(item.ref, blockedRefs) && itemMatchesRecoverySpec(item, policy?.match || {}))
    .map((item) => item.ref);
}

export function selectionConsumesSignalRefs(selection, expectedRefs = []) {
  return (selection?.entries || []).some((entry) =>
    entry.pileName === 'unassigned' && entry.signal && refMatches(entry.signal.ref || entry.signal, expectedRefs)
  );
}

function specialMode(spec = {}) {
  if (spec.special === true) return 'special';
  if (spec.allowSpecial === true) return 'any';
  return 'normal';
}

function requirementAcceptsRecoveryMatch(requirement = {}, match = {}) {
  if (requirement.playerOnly && match.playerOnly !== true) return false;
  if (requirement.tier && requirement.tier !== match.tier) return false;
  if (requirement.rarity && requirement.rarity !== match.rarity) return false;

  const requirementSpecialMode = specialMode(requirement);
  const matchSpecialMode = specialMode(match);
  if (requirementSpecialMode !== 'any' && requirementSpecialMode !== matchSpecialMode) return false;

  if (requirement.minRating !== undefined) {
    if (match.minRating === undefined || Number(match.minRating) < Number(requirement.minRating)) return false;
  }
  if (requirement.maxRating !== undefined) {
    if (match.maxRating === undefined || Number(match.maxRating) > Number(requirement.maxRating)) return false;
  }
  return true;
}

export function recoveryTriggerCapacity(recipe = {}, policy = {}) {
  return (recipe.requirements || []).reduce((total, requirement) => {
    if (!requirementAcceptsRecoveryMatch(requirement, policy.match || {})) return total;
    return total + Math.max(0, Number(requirement.count || 0));
  }, 0);
}

export function selectedRecoveryTriggerCount(selection, expectedRefs = []) {
  const selectedKeys = new Set();
  for (const entry of selection?.entries || []) {
    if (entry.pileName !== 'unassigned' || !entry.signal) continue;
    const signalRef = entry.signal.ref || entry.signal;
    if (!refMatches(signalRef, expectedRefs)) continue;
    const id = Number(signalRef?.id || 0);
    const definitionId = Number(signalRef?.definitionId || 0);
    selectedKeys.add(id ? `id:${id}` : `definition:${definitionId}`);
  }
  return selectedKeys.size;
}

export function evaluateRecoveryTriggerSelection(recipe, policy, selection, expectedRefs = []) {
  const capacity = recoveryTriggerCapacity(recipe, policy);
  const expectedCount = Math.min(expectedRefs.length, capacity);
  const selectedCount = selectedRecoveryTriggerCount(selection, expectedRefs);
  return {
    capacity,
    expectedCount,
    selectedCount,
    sufficient: expectedRefs.length === 0 || (expectedCount > 0 && selectedCount >= expectedCount),
  };
}

function actionFor(recipe, status) {
  if (status === 'insufficient') return recipe.onInsufficient || 'continue';
  return recipe.onUnavailable || 'continue';
}

export function createRecoveryOverflowResolvers(options = {}) {
  const recipes = new Map((options.recipes || []).map((recipe) => [recipe.id, recipe]));
  const policies = new Map((options.policies || []).map((policy) => [policy.id, policy]));
  const policyIds = options.policyIds || [];
  const attemptRecipe = options.attemptRecipe;
  if (typeof attemptRecipe !== 'function') throw new Error('attemptRecipe is required');

  return policyIds.map((policyId) => {
    const policy = policies.get(policyId);
    if (!policy) throw new Error(`Unassigned recovery policy not found: ${policyId}`);
    return {
      id: `unassigned-recovery:${policy.id}`,
      async resolve(context) {
        const triggerRefs = matchingBlockedItemRefs(context.plan, context.snapshot, policy);
        if (!triggerRefs.length) return { status: 'unavailable', reason: 'blocked items do not match policy' };

        const attempts = [];
        for (const step of policy.steps || []) {
          const recipe = recipes.get(step.recipeId);
          if (!recipe) {
            return { status: 'blocked', terminal: true, reason: `Recovery recipe not found: ${step.recipeId}` };
          }
          const result = await attemptRecipe({
            context,
            policy,
            recipe,
            step,
            triggerRefs,
          }) || { status: 'unavailable' };
          attempts.push({ recipeId: recipe.id, ...result });
          if (result.status === 'progress') return { ...result, attempts };
          if (result.status === 'blocked') {
            return {
              status: 'blocked',
              terminal: true,
              reason: result.reason || `${recipe.name || recipe.id} recovery blocked`,
              attempts,
            };
          }
          if (actionFor({ ...recipe, ...step }, result.status) === 'stop') {
            return {
              status: 'blocked',
              terminal: true,
              reason: result.reason || `${recipe.name || recipe.id} recovery stopped`,
              attempts,
            };
          }
        }
        return {
          status: 'unavailable',
          reason: `No recovery recipe could consume ${triggerRefs.length} blocked item(s)`,
          attempts,
        };
      },
    };
  });
}
