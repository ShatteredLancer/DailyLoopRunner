const CRITICAL_SNAPSHOT_FIELDS = Object.freeze([
  'id',
  'definitionId',
  'rating',
  'rareflag',
  'rare',
  'special',
  'tradeable',
  'leagueId',
  'evolution',
  'limitedUse',
  'concept',
  'academyEnrolled',
  'activeTrade',
  'endTime',
]);

function itemRefKey(ref = {}) {
  return `${Number(ref.id || 0)}:${Number(ref.definitionId || 0)}`;
}

function describeRef(ref = {}) {
  const id = Number(ref.id || 0) || '?';
  const definitionId = Number(ref.definitionId || 0) || '?';
  return `#${id}/def:${definitionId}`;
}

function criticalSnapshotSignature(snapshot = {}) {
  const critical = Object.fromEntries(
    CRITICAL_SNAPSHOT_FIELDS.map((field) => [field, snapshot[field]]),
  );
  critical.groups = [...(snapshot.groups || [])].map(Number).sort((a, b) => a - b);
  return JSON.stringify(critical);
}

export async function prepareFsuProvisionalClubAccess(options = {}) {
  const readiness = options.readiness || {};
  if (!readiness.detected || readiness.fullyValidated !== false) return { ok: true };

  const players = Array.isArray(options.players) ? options.players : [];
  const itemRefs = Array.isArray(options.itemRefs) ? options.itemRefs : [];
  const clubEntries = itemRefs
    .map((ref, index) => ({ ref, index, player: players[index] }))
    .filter((entry) => entry.ref?.pile === 'club');
  if (!clubEntries.length) return { ok: true };

  const label = options.label || 'SBC';
  const snapshotItem = options.snapshotItem;
  if (typeof snapshotItem !== 'function') throw new TypeError('snapshotItem is required');
  if (typeof options.validateClubPlayers !== 'function') throw new TypeError('validateClubPlayers is required');

  const clubRefs = clubEntries.map((entry) => entry.ref);
  options.log?.(`${label}: validating ${clubRefs.length} provisional Club player(s) against EA before save`);
  const validation = await options.validateClubPlayers(clubRefs, {
    label: `${label} targeted Club validation`,
  });
  if (!validation?.ok) {
    const missing = (validation?.missing || []).map(describeRef).join(', ');
    return {
      ok: false,
      reason: validation?.reason || `FSU provisional Club validation failed${missing ? ` for ${missing}` : ''}`,
    };
  }

  const validatedByRef = new Map(
    (validation.items || []).map((item) => [itemRefKey(item), item]),
  );
  const missing = clubEntries.filter((entry) => !validatedByRef.has(itemRefKey(entry.ref)));
  if (missing.length) {
    return {
      ok: false,
      reason: `FSU provisional Club validation did not return ${missing.map((entry) => describeRef(entry.ref)).join(', ')}`,
    };
  }

  const changed = clubEntries.filter((entry) => {
    if (!entry.player) return true;
    const refreshed = validatedByRef.get(itemRefKey(entry.ref));
    const before = snapshotItem(entry.player, 'club');
    const after = snapshotItem(refreshed, 'club');
    return criticalSnapshotSignature(before) !== criticalSnapshotSignature(after);
  });
  if (changed.length) {
    return {
      ok: false,
      reason: `FSU provisional Club data changed for ${changed.map((entry) => describeRef(entry.ref)).join(', ')}; restart the Loop so selection uses the refreshed items`,
    };
  }

  const refreshedPlayers = players.map((player, index) => {
    const ref = itemRefs[index];
    return ref?.pile === 'club' ? validatedByRef.get(itemRefKey(ref)) : player;
  });
  options.log?.(`${label}: provisional Club validation passed in ${Number(validation.elapsed || 0)}ms`);
  return {
    ok: true,
    players: refreshedPlayers,
    itemRefs,
    refreshedClubPlayers: true,
    validatedClubRefs: clubRefs,
  };
}
