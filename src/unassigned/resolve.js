import { planUnassignedActions, unassignedFingerprint } from './plan.js';

export async function resolveUnassigned(options = {}) {
  if (typeof options.getSnapshot !== 'function') throw new Error('getSnapshot is required');
  if (typeof options.executeAction !== 'function') throw new Error('executeAction is required');
  const maxIterations = Math.max(1, Math.min(100, Number(options.maxIterations || 20) || 20));
  const overflowResolvers = options.overflowResolvers || [];
  const activeResolvers = options.activeResolvers || new Set();
  let previousFingerprint = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const snapshot = await options.getSnapshot();
    const fingerprint = unassignedFingerprint(snapshot);
    const plan = planUnassignedActions(snapshot, { reserveItem: options.reserveItem });

    if (plan.status === 'empty' || plan.status === 'preserved') {
      return {
        status: plan.status === 'empty' ? 'resolved' : 'preserved',
        iterations: iteration,
        plan,
        snapshot,
      };
    }

    if (plan.status === 'action') {
      await options.executeAction(plan.action, { plan, snapshot, iteration });
      const after = await options.getSnapshot();
      const afterFingerprint = unassignedFingerprint(after);
      if (afterFingerprint === fingerprint) {
        return { status: 'blocked', reason: `Unassigned action made no progress: ${plan.action.description}`, iterations: iteration, plan, snapshot: after };
      }
      previousFingerprint = afterFingerprint;
      continue;
    }

    if (plan.status === 'blocked') {
      let progressed = false;
      const resolverResults = [];
      for (let index = 0; index < overflowResolvers.length; index++) {
        const resolver = overflowResolvers[index];
        const resolverId = String(resolver.id || `resolver-${index}`);
        if (activeResolvers.has(resolverId)) {
          resolverResults.push({ id: resolverId, status: 'blocked', reason: 'recursive resolver invocation' });
          continue;
        }
        activeResolvers.add(resolverId);
        let result;
        try {
          result = await resolver.resolve({ plan, snapshot, iteration, resolverId });
        } finally {
          activeResolvers.delete(resolverId);
        }
        result = result || { status: 'unavailable' };
        resolverResults.push({ id: resolverId, ...result });
        if (result.status === 'blocked' && result.terminal === true) {
          return {
            status: 'blocked',
            reason: result.reason || `${resolverId} blocked Unassigned recovery`,
            iterations: iteration,
            plan,
            snapshot,
            resolverResults,
          };
        }
        if (result.status !== 'progress') continue;
        const after = await options.getSnapshot();
        const afterFingerprint = unassignedFingerprint(after);
        if (afterFingerprint === fingerprint) {
          resolverResults.push({ id: resolverId, status: 'blocked', reason: 'resolver reported progress without changing Unassigned' });
          continue;
        }
        progressed = true;
        previousFingerprint = afterFingerprint;
        break;
      }
      if (progressed) continue;
      return {
        status: options.blockedPolicy === 'preserve' ? 'preserved' : 'blocked',
        reason: `${plan.blocked.destination} capacity ${plan.blocked.free}/${plan.blocked.required}`,
        iterations: iteration,
        plan,
        snapshot,
        resolverResults,
      };
    }

    return {
      status: 'blocked',
      reason: `Unassigned planner returned ${plan.status}`,
      iterations: iteration,
      plan,
      snapshot,
    };
  }

  return {
    status: 'blocked',
    reason: `Unassigned resolver exceeded ${maxIterations} iterations`,
    fingerprint: previousFingerprint,
  };
}
