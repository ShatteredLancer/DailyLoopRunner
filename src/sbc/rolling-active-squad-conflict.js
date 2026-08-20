function uniqueIds(items = []) {
  return [...new Set(items.map((item) => Number(item?.id || 0)).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

export function decideRollingActiveSquadConflict(items = []) {
  if (!Array.isArray(items) || !items.length || items.some((item) => !Number(item?.id || 0))) {
    return {
      action: 'error',
      reasonCode: 'ACTIVE_SQUAD_CONFLICT_IDENTITY_UNAVAILABLE',
      reason: 'Active Squad conflict could not be matched to the submitted players',
      replaceItemIds: [],
      reviewItemIds: [],
    };
  }

  // TOTS/FOF/FUTTIES are never eligible for the Active Squad confirmation
  // path. Required Special describes the SBC role, not squad membership; a
  // 409 for one of these cards is an identity/planning contradiction.
  const regressions = items.filter((item) => (
    item.eventSpecial === true
      || (item.clubOtherSpecial === true && item.strictClubSpecialProtection === true)
  ));
  if (regressions.length) {
    return {
      action: 'error',
      reasonCode: 'ACTIVE_SQUAD_PROTECTION_REGRESSION',
      reason: `Rolling selected ${regressions.length} card(s) that should have been protected`,
      regressionItemIds: uniqueIds(regressions),
      replaceItemIds: [],
      reviewItemIds: [],
    };
  }

  const ordinary = items.filter((item) => item.special !== true);
  const review = items.filter((item) => item.special === true && !regressions.includes(item));
  if (ordinary.length) {
    return {
      action: 'replace',
      reasonCode: 'ACTIVE_SQUAD_CONFLICT_REPLAN',
      reason: `Replacing ${ordinary.length} ordinary Active Squad card(s)`,
      replaceItemIds: uniqueIds(ordinary),
      reviewItemIds: uniqueIds(review),
    };
  }

  return {
    action: 'review',
    reasonCode: 'ACTIVE_SQUAD_SPECIAL_REVIEW_REQUIRED',
    reason: `Active Squad contains ${items.length} eligible special card(s)`,
    replaceItemIds: [],
    reviewItemIds: uniqueIds(review),
  };
}
