export async function confirmUnassignedView(options = {}) {
  const reason = String(options.reason || 'final confirmation');
  const log = options.log || (() => {});
  if (typeof options.openUnassigned !== 'function') throw new TypeError('openUnassigned is required');
  if (typeof options.clickFallback !== 'function') throw new TypeError('clickFallback is required');
  if (typeof options.waitLoadingEnd !== 'function') throw new TypeError('waitLoadingEnd is required');
  if (typeof options.refreshUnassigned !== 'function') throw new TypeError('refreshUnassigned is required');
  if (typeof options.getItems !== 'function') throw new TypeError('getItems is required');

  log(`Opening unassigned items view for confirmation: ${reason}`);
  try {
    if (options.openUnassigned() !== true) options.clickFallback();
  } catch (error) {
    log(`Could not open unassigned view automatically: ${error?.message || error}`);
  }
  await options.waitLoadingEnd();
  await options.refreshUnassigned();

  const items = options.getItems() || [];
  if (!items.length) {
    log(`Unassigned confirmation (${reason}): empty`);
    return [];
  }
  log(`Unassigned confirmation (${reason}): ${items.length} item(s) still present`);
  return items;
}
