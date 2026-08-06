function packIdKey(packOrId) {
  const id = typeof packOrId === 'object'
    ? (packOrId?.id ?? packOrId?.packId ?? packOrId?.packDefinitionId ?? packOrId?.packAssetId)
    : packOrId;
  const numeric = Number(id);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : '';
}

export function findFreshPackInstance(failedPack, candidates = []) {
  const id = packIdKey(failedPack);
  if (!id) return null;
  return candidates.find((candidate) => candidate !== failedPack && packIdKey(candidate) === id) || null;
}

/**
 * Tracks consumed pack object refs and pack IDs that returned 404 (gone).
 * Object refs alone are not enough: EA refresh often yields new objects with the same id.
 */

export function createStalePackTracker() {
  const objectRefs = new WeakSet();
  const goneIds = new Set();

  return {
    markObject(pack) {
      try {
        if (pack && typeof pack === 'object') objectRefs.add(pack);
      } catch { /* ignore non-extensible hosts */ }
    },

    markGone(packOrId) {
      this.markObject(typeof packOrId === 'object' ? packOrId : null);
      const id = packIdKey(packOrId);
      if (!id) return { id: '', added: false };
      const added = !goneIds.has(id);
      goneIds.add(id);
      return { id, added };
    },

    isStale(pack) {
      try {
        if (pack && objectRefs.has(pack)) return true;
      } catch { /* ignore */ }
      const id = packIdKey(pack);
      return !!(id && goneIds.has(id));
    },

    hasGoneId(packOrId) {
      const id = packIdKey(packOrId);
      return !!(id && goneIds.has(id));
    },

    goneIds() {
      return [...goneIds];
    },

    clearGoneIds() {
      goneIds.clear();
    },
  };
}
