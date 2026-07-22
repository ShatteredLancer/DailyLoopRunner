function normalizedId(value) {
  const id = typeof value === 'object'
    ? (value?.id ?? value?.packId ?? value?.packDefinitionId ?? value?.packAssetId)
    : value;
  const number = Number(id);
  return Number.isFinite(number) && number > 0 ? String(number) : '';
}

export function createPackInstanceQueue(packs = [], options = {}) {
  const queue = [...(packs || [])];
  const getName = options.getName || ((pack) => String(pack?.name || pack?.packName || ''));

  return {
    take(entry = {}) {
      const entryId = normalizedId(entry.packId);
      const entryName = String(entry.packName || '').trim().toLowerCase();
      const index = queue.findIndex((pack) => entryId
        ? normalizedId(pack) === entryId
        : entryName && getName(pack).trim().toLowerCase() === entryName);
      if (index < 0) return null;
      return queue.splice(index, 1)[0] || null;
    },

    remaining(entry = {}) {
      const entryId = normalizedId(entry.packId);
      const entryName = String(entry.packName || '').trim().toLowerCase();
      return queue.filter((pack) => entryId
        ? normalizedId(pack) === entryId
        : entryName && getName(pack).trim().toLowerCase() === entryName).length;
    },
  };
}
