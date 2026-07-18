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
