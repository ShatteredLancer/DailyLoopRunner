export function selectionRequirements(loopDef = {}, priorityPiles = loopDef.priorityPiles) {
  return (loopDef.requirements || []).map((requirement) => {
    const protectHighGold = requirement.protectHighGold === true || loopDef.protectHighGold === true;
    const highGoldThreshold = Number(
      requirement.highGoldThreshold
      ?? requirement.protectHighGoldMinRating
      ?? loopDef.pickHighGoldThreshold
      ?? 82,
    );
    return {
      ...requirement,
      protectHighGold: requirement.protectHighGold !== undefined ? requirement.protectHighGold : loopDef.protectHighGold,
      highGoldThreshold: protectHighGold
        ? Math.max(2, Math.min(99, Number.isFinite(highGoldThreshold) && highGoldThreshold > 0 ? highGoldThreshold : 82))
        : requirement.highGoldThreshold,
      blockTradeable: requirement.blockTradeable !== undefined ? requirement.blockTradeable : loopDef.blockTradeable,
      protectedItemIds: [...new Set([
        ...(loopDef.protectedItemIds || []),
        ...(requirement.protectedItemIds || []),
      ].map(Number).filter(Boolean))],
      protectedDefinitionIds: [...new Set([
        ...(loopDef.protectedDefinitionIds || []),
        ...(requirement.protectedDefinitionIds || []),
      ].map(Number).filter(Boolean))],
      priorityPiles,
    };
  });
}

export function createSingleCardSelectionRequirement(
  loopDef = {},
  cardSpec = {},
  defaultPriorityPiles = ['storage', 'transfer', 'club'],
) {
  const configuredPiles = Array.isArray(loopDef.priorityPiles) && loopDef.priorityPiles.length
    ? loopDef.priorityPiles
    : defaultPriorityPiles;
  const disabledPiles = new Set(loopDef.disabledPiles || []);
  const priorityPiles = configuredPiles.filter((pile) => !disabledPiles.has(pile));
  if (!priorityPiles.length) throw new Error(`${loopDef.name || 'single-card selection'} has no enabled inventory pile`);

  const [requirement] = selectionRequirements({
    ...loopDef,
    requirements: [{ ...cardSpec, count: 1, priorityPiles }],
  }, priorityPiles);
  if (!requirement) throw new Error(`${loopDef.name || 'single-card selection'} has no card requirement`);
  return { requirement, priorityPiles };
}
