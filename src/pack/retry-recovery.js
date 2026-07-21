function normalizedCode(value) {
  return String(value ?? '').trim();
}

export function shouldDiscardFailedPack(code) {
  return normalizedCode(code) === '471';
}

export async function recoverPackOpenRetry(options = {}) {
  const label = String(options.label || 'Pack open');
  const code = normalizedCode(options.code) || 'unknown';
  const pack = options.pack || null;
  const packId = Number(pack?.id ?? pack?.packId ?? pack?.packDefinitionId ?? pack?.packAssetId ?? 0) || null;
  const log = typeof options.log === 'function' ? options.log : () => {};

  log(`${label}: pack open returned ${code}; synchronizing navigation and pack cache before retry`);
  if (shouldDiscardFailedPack(code)) {
    options.markFailedPack?.(pack);
    log(`${label}: excluding failed pack instance${packId ? ` #${packId}` : ''} before retry`);
  }
  log(`${label}: retrying pack open after navigation and unassigned recovery`);

  await options.sleep?.(Math.max(0, Number(options.pauseMs || 0)));
  await options.unwind?.();
  await options.showUnassigned?.();
  await options.resolveUnassigned?.();

  let storeRefreshed = false;
  try {
    storeRefreshed = await options.openStorePacks?.() === true;
  } catch (error) {
    log(`${label}: pack-open Store recovery skipped: ${error?.message || error}`);
  }
  if (!storeRefreshed) {
    log(`${label}: Store Packs view refresh unavailable; continuing with repository refresh`);
  }

  await options.sleep?.(Math.max(0, Number(options.settleMs ?? 700)));
  await options.refreshInventory?.({ storeRefreshed });
  return { code, discarded: shouldDiscardFailedPack(code), storeRefreshed };
}
