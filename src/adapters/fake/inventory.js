import { createInventorySnapshot, INVENTORY_PILES } from '../../domain/contracts.js';

export function createFakeInventoryAdapter(initial = {}) {
  const calls = [];
  const state = {
    piles: Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, [...(initial.piles?.[pile] || initial[pile] || [])]])),
    capacities: { ...(initial.capacities || {}) },
    capturedAt: initial.capturedAt,
  };

  function snapshot() {
    return createInventorySnapshot(state);
  }

  function readPile(pile) {
    return [...(state.piles[pile] || [])];
  }

  function pileValue(pile) {
    return String(pile || '').toLowerCase();
  }

  function preparePurchasedItem(item) {
    if (!item || typeof item !== 'object') return item;
    item.pile = 'purchased';
    item.injuryType = 0;
    return item;
  }

  function capacity(pile) {
    const configured = state.capacities[pile] || {};
    const used = Number.isFinite(Number(configured.used)) ? Number(configured.used) : readPile(pile).length;
    const max = Number.isFinite(Number(configured.max)) ? Number(configured.max) : null;
    return { used, max, free: max === null ? null : Math.max(0, max - used) };
  }

  function resolveItem(ref, preferredPiles = INVENTORY_PILES) {
    const id = Number(ref?.id || 0);
    const definitionId = Number(ref?.definitionId || 0);
    const piles = [...new Set([ref?.pile, ...(preferredPiles || [])].filter((pile) => INVENTORY_PILES.includes(pile)))];
    for (const pile of piles) {
      const item = state.piles[pile]?.find((candidate) =>
        (id && Number(candidate?.id || candidate?.ref?.id || 0) === id) ||
        (!id && definitionId && Number(candidate?.definitionId || candidate?.ref?.definitionId || 0) === definitionId)
      );
      if (item) return { item, pile };
    }
    return null;
  }

  function replace(next = {}) {
    for (const pile of INVENTORY_PILES) {
      if (next.piles?.[pile] || next[pile]) state.piles[pile] = [...(next.piles?.[pile] || next[pile])];
    }
    if (next.capacities) state.capacities = { ...next.capacities };
  }

  function requestUnassigned() {
    calls.push({ method: 'requestUnassigned' });
    return { success: true };
  }

  function refreshActions(pile) {
    return [{
      label: `fake refresh ${pile}`,
      methodName: 'fakeRefresh',
      invoke() {
        calls.push({ method: 'refreshPile', pile });
        return { success: true };
      },
    }];
  }

  function move(items, pile, allowStorage = true) {
    calls.push({ method: 'move', itemIds: (items || []).map((item) => Number(item?.id || 0)), pile, allowStorage });
    return { success: true };
  }

  return Object.freeze({
    calls,
    snapshot,
    resolveItem,
    readPile,
    pileValue,
    preparePurchasedItem,
    capacity,
    requestUnassigned,
    refreshActions,
    move,
    replace,
  });
}
