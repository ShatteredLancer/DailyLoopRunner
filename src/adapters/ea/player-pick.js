export function createEaPlayerPickAdapter(runtime) {
  const service = runtime?.services?.Item;
  if (!service) throw new Error('EA Item service is unavailable');

  function collectionValues(collection) {
    if (!collection) return [];
    if (typeof collection.values === 'function') return Array.from(collection.values());
    if (Array.isArray(collection._collection)) return collection._collection;
    if (collection._collection && typeof collection._collection === 'object') return Object.values(collection._collection);
    if (typeof collection === 'object') return Object.values(collection);
    return [];
  }

  function unassignedItems() {
    try { return Array.from(runtime?.repositories?.Item?.getUnassignedItems?.() || []); } catch { return []; }
  }

  function storageItems() {
    try {
      if (typeof runtime?.repositories?.Item?.getStorageItems === 'function') {
        return Array.from(runtime.repositories.Item.getStorageItems() || []);
      }
    } catch { }
    try {
      if (typeof runtime?.repositories?.Item?.getStorage === 'function') {
        return collectionValues(runtime.repositories.Item.getStorage());
      }
    } catch { }
    return collectionValues(runtime?.repositories?.Item?.storage);
  }

  function transferItems() {
    try {
      if (typeof runtime?.repositories?.Item?.getTransferItems === 'function') {
        return Array.from(runtime.repositories.Item.getTransferItems() || []);
      }
    } catch { }
    return collectionValues(runtime?.repositories?.Item?.transfer);
  }

  function clubItems() {
    return collectionValues(runtime?.repositories?.Item?.club?.items)
      .concat(collectionValues(service?.itemDao?.itemRepo?.club?.items));
  }

  function uniqueOwnedItems() {
    const seen = new Set();
    return [
      ...unassignedItems(),
      ...storageItems(),
      ...transferItems(),
      ...clubItems(),
    ].filter((item) => {
      const id = Number(item?.id || 0);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function isPlayerPickItem(item) {
    try { if (item?.isPlayerPickItem?.()) return true; } catch { }
    return /player\s*pick/i.test(String(item?.name || item?.description || item?._staticData?.name || ''));
  }

  function sameLimitedUseType(left, right) {
    const leftType = left?.limitedUseType ?? left?._limitedUseType ?? null;
    const rightType = right?.limitedUseType ?? right?._limitedUseType ?? null;
    return leftType === null || rightType === null || String(leftType) === String(rightType);
  }

  function listUnassignedPlayerPicks() {
    return unassignedItems().filter(isPlayerPickItem);
  }

  function isOwnedDuplicate(item) {
    const itemId = Number(item?.id || 0);
    return uniqueOwnedItems().some((ownedItem) =>
      Number(ownedItem?.id || 0) !== itemId &&
      Number(ownedItem?.definitionId || 0) === Number(item?.definitionId || -1) &&
      sameLimitedUseType(ownedItem, item)
    );
  }

  function redeem(pickItem) {
    if (typeof service.redeem !== 'function') throw new Error('EA Player Pick redeem is unavailable');
    return service.redeem(pickItem);
  }

  function confirmSelection(items) {
    if (typeof service.confirmPlayerPickItemSelection !== 'function') {
      throw new Error('EA Player Pick confirmation is unavailable');
    }
    return service.confirmPlayerPickItemSelection(items);
  }

  return Object.freeze({ redeem, confirmSelection, listUnassignedPlayerPicks, isOwnedDuplicate });
}
