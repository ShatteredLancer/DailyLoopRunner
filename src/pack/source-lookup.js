export async function findPackWithRecovery(options = {}) {
  if (typeof options.findCached !== 'function') throw new TypeError('findCached is required');

  const label = String(options.label || 'Pack lookup');
  const attempts = Math.max(1, Math.min(10, Number(options.attempts || 3) || 3));
  const delayMs = Math.max(0, Number(options.delayMs || 0) || 0);
  const log = typeof options.log === 'function' ? options.log : () => {};
  let storeFallbackTried = false;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await options.refresh?.({ attempt, attempts });
    } catch (error) {
      if (attempt === attempts) log(`${label}: final repository refresh failed: ${error?.message || error}`);
    }

    let pack = options.findCached();
    if (pack) return pack;

    const shouldTryStore = options.openStoreFallback !== false
      && !storeFallbackTried
      && (attempt === attempts || attempt >= Math.max(2, Math.ceil(attempts / 2)));
    if (shouldTryStore) {
      storeFallbackTried = true;
      try {
        const openedStore = await options.openStorePacks?.({ attempt, attempts }) === true;
        if (openedStore) {
          pack = options.findCached();
          if (pack) return pack;
        }
      } catch (error) {
        log(`${label}: Store Packs fallback skipped: ${error?.message || error}`);
      }
    }

    await options.onWait?.({ attempt, attempts, storeFallbackTried });
    if (attempt < attempts && delayMs) await options.sleep?.(delayMs);
  }

  await options.onExhausted?.({ attempts, storeFallbackTried });
  return null;
}
