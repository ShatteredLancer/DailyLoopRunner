export const BUY_DESTINATION_MODES = Object.freeze(['auto', 'club', 'transfer']);

export function normalizeExpectedBuyDestination(value = 'auto') {
  const destination = String(value || 'auto').toLowerCase();
  return BUY_DESTINATION_MODES.includes(destination) ? destination : null;
}

export function destinationForOwnership(ownership = {}) {
  return Number(ownership.club || 0) > 0 ? 'transfer' : 'club';
}

export function filterBuyCatalogForDestination(catalog = {}, adapter, expectedDestination = 'auto') {
  const expected = normalizeExpectedBuyDestination(expectedDestination);
  if (!expected) throw new Error('Buy validation destination must be auto, club, or transfer');
  const lanes = (catalog.lanes || []).map((lane) => ({
    ...lane,
    definitionIds: [...(lane.definitionIds || [])],
  }));
  const before = lanes.reduce((sum, lane) => sum + lane.definitionIds.length, 0);
  if (expected === 'auto') {
    return { catalog: { ...catalog, lanes }, expectedDestination: expected, before, matched: before };
  }
  if (typeof adapter?.inspectDefinitionOwnership !== 'function') {
    return { catalog: { ...catalog, lanes: [] }, expectedDestination: expected, before, matched: 0, reason: 'ownership-inspection-unavailable' };
  }
  const requestedDefinitionIds = [...new Set(lanes.flatMap((lane) => lane.definitionIds))];
  const ownerships = typeof adapter.inspectDefinitionOwnerships === 'function'
    ? adapter.inspectDefinitionOwnerships(requestedDefinitionIds)
    : null;
  const ownershipFor = (definitionId) => (
    ownerships?.[definitionId]
    || ownerships?.[String(definitionId)]
    || adapter.inspectDefinitionOwnership(definitionId)
  );
  const filtered = lanes.map((lane) => ({
    ...lane,
    definitionIds: lane.definitionIds.filter((definitionId) => (
      destinationForOwnership(ownershipFor(definitionId)) === expected
    )),
  }));
  const matched = filtered.reduce((sum, lane) => sum + lane.definitionIds.length, 0);
  return {
    catalog: { ...catalog, lanes: filtered },
    expectedDestination: expected,
    before,
    matched,
    reason: matched ? null : `buy-${expected}-definitions-unavailable`,
  };
}
