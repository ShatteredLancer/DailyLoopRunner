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
  const controllerName = () => {
    try { return String(options.getControllerName?.() || '?'); } catch { return '?'; }
  };

  log(`Opening unassigned items view for confirmation: ${reason}`);
  const controllerBefore = controllerName();
  let navigationMethod = 'none';
  try {
    if (options.openUnassigned() === true) {
      navigationMethod = 'controller';
    } else {
      const fallbackResult = options.clickFallback();
      navigationMethod = fallbackResult === false ? 'unavailable' : 'text-fallback';
    }
  } catch (error) {
    navigationMethod = 'error';
    log(`Could not open unassigned view automatically: ${error?.message || error}`);
  }
  await options.waitLoadingEnd();
  if (diagnostic) {
    log(`Unassigned navigation (${reason}): method:${navigationMethod}; controller:${controllerBefore}->${controllerName()}`);
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
