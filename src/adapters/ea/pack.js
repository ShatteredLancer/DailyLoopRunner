function collectionValues(collection) {
  if (!collection) return [];
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (Array.isArray(collection._collection)) return collection._collection;
  if (collection._collection && typeof collection._collection === 'object') return Object.values(collection._collection);
  if (Array.isArray(collection)) return collection;
  return [];
}

function packId(pack) {
  return Number(pack?.id ?? pack?.packId ?? pack?._id ?? 0);
}

export function createEaPackAdapter(runtime) {
  function list() {
    const repository = runtime?.repositories?.Store?.myPacks || runtime?.services?.Store?.storeDao?.storeRepo?.myPacks;
    return collectionValues(repository);
  }

  function resolve(ref = {}) {
    const id = Number(ref.id || 0);
    if (id) {
      const byId = list().find((pack) => packId(pack) === id);
      if (byId) return byId;
    }
    const name = String(ref.name || '').trim().toLowerCase();
    return name ? list().find((pack) => String(pack?.name || pack?._name || '').trim().toLowerCase() === name) || null : null;
  }

  function open(pack) {
    if (!pack || typeof pack.open !== 'function') throw new Error('Pack model cannot be opened');
    return pack.open();
  }

  function refreshAll() {
    const service = runtime?.services?.Store;
    if (typeof service?.getPacks !== 'function') throw new Error('EA Store pack refresh is unavailable');
    return service.getPacks(runtime?.PurchasePackType?.ALL, true, true);
  }

  return Object.freeze({ list, resolve, open, refreshAll });
}
