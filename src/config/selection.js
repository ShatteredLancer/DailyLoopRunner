export function selectionRequirements(loopDef = {}, priorityPiles = loopDef.priorityPiles) {
  return (loopDef.requirements || []).map((requirement) => ({
    ...requirement,
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
  }));
}
