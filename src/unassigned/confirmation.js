import { navigateToUnassigned } from './navigation.js';

export async function confirmUnassignedView(options = {}) {
  const reason = String(options.reason || 'final confirmation');
  const log = options.log || (() => {});
  if (typeof options.openUnassigned !== 'function') throw new TypeError('openUnassigned is required');
  if (typeof options.clickFallback !== 'function') throw new TypeError('clickFallback is required');
  if (typeof options.waitLoadingEnd !== 'function') throw new TypeError('waitLoadingEnd is required');
  if (typeof options.refreshUnassigned !== 'function') throw new TypeError('refreshUnassigned is required');
  if (typeof options.getItems !== 'function') throw new TypeError('getItems is required');
  const stableEmptyReads = Math.max(1, Math.min(5, Number(options.stableEmptyReads || 1) || 1));
  const emptyReadDelayMs = Math.max(0, Number(options.emptyReadDelayMs || 0));
  const diagnostic = options.diagnostic === true;
  const requireNavigation = options.requireNavigation === true || options.verifyNavigation === true;
  const controllerName = () => {
    try { return String(options.getControllerName?.() || '?'); } catch { return '?'; }
  };

  log(`Opening unassigned items view for confirmation: ${reason}`);
  const navigation = await navigateToUnassigned({
    requireNavigation,
    getControllerName: options.getControllerName,
    requestController: options.openUnassigned,
    requestTextFallback: options.clickFallback,
    requestRecovery: options.recoverNavigation,
    waitLoadingEnd: options.waitLoadingEnd,
    sleep: options.sleep,
    retryAttempts: options.navigationRetryAttempts,
    retryDelayMs: options.navigationRetryDelayMs,
  });
  for (const attempt of navigation.attempts.filter((entry) => entry.error)) {
    const stage = attempt.id === 'controller' ? '' : ` (${attempt.id})`;
    log(`Could not open unassigned view automatically${stage}: ${attempt.error}`);
  }
  if (diagnostic) {
    log(`Unassigned navigation (${reason}): method:${navigation.method}; controller:${navigation.from}->${navigation.to}`);
    const attempts = navigation.attempts.map((attempt) => (
      `${attempt.id}:${attempt.requested ? 'requested' : 'unavailable'}:${attempt.before}->${attempt.after}:${attempt.confirmed ? 'confirmed' : 'not-confirmed'}`
    )).join('; ');
    if (attempts) log(`Unassigned navigation attempts (${reason}): ${attempts}`);
    const recoverySteps = navigation.attempts.flatMap((attempt) => attempt.steps || []).map((step) => (
      `${step.id}:${step.requested ? 'requested' : 'unavailable'}:${step.before}->${step.after}:${step.confirmed ? 'confirmed' : 'not-confirmed'}${step.error ? `:error:${step.error}` : ''}`
    )).join('; ');
    if (recoverySteps) log(`Unassigned recovery steps (${reason}): ${recoverySteps}`);
  }
  if (requireNavigation && navigation.status !== 'confirmed') {
    const error = new Error(`Unassigned navigation was not confirmed after ${navigation.method}; controller remained ${controllerName()}`);
    error.code = 'UNASSIGNED_NAVIGATION_NOT_CONFIRMED';
    error.navigation = navigation;
    throw error;
  }
  for (let read = 1; read <= stableEmptyReads; read++) {
    const refreshResult = await options.refreshUnassigned();
    const items = options.getItems() || [];
    if (diagnostic) {
      const refreshState = refreshResult?.success === true
        ? 'success'
        : refreshResult?.cachedFallback
          ? `cache-fallback:${refreshResult.cachedCount ?? '?'}`
          : String(refreshResult?.error?.message || refreshResult?.status || 'unknown');
      log(`Unassigned read (${reason}) ${read}/${stableEmptyReads}: items:${items.length}; refresh:${refreshState}; controller:${controllerName()}`);
    }
    if (items.length) {
      log(`Unassigned confirmation (${reason}): ${items.length} item(s) still present`);
      return items;
    }
    if (read < stableEmptyReads) {
      await options.sleep?.(emptyReadDelayMs);
    }
  }
  log(`Unassigned confirmation (${reason}): empty after ${stableEmptyReads} stable read(s)`);
  return [];
}
