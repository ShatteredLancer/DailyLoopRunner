import { createInventorySnapshot, INVENTORY_PILES } from '../../domain/contracts.js';

export function createFakeInventoryAdapter(initial = {}) {
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

  return Object.freeze({ snapshot, resolveItem, readPile, replace });
}
