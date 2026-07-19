export async function scanPlayerPickSbcSnapshots(options = {}) {
  if (typeof options.refreshSets !== 'function') throw new TypeError('refreshSets is required');
  if (typeof options.listSets !== 'function') throw new TypeError('listSets is required');
  if (typeof options.snapshotSet !== 'function') throw new TypeError('snapshotSet is required');
  if (typeof options.loadChallenges !== 'function') throw new TypeError('loadChallenges is required');
  if (typeof options.parseSnapshot !== 'function') throw new TypeError('parseSnapshot is required');

  await options.refreshSets();
  const sets = options.listSets() || [];
  const results = [];
  for (const set of sets) {
    const initial = options.snapshotSet(set);
    const hasPlayerPickReward = (initial?.rewards || []).some((reward) => reward?.type === 'PLAYER_PICK');
    if (!hasPlayerPickReward) continue;

    let challenges = initial?.challenges || [];
    let loadError = null;
    if (initial?.complete !== true) {
      try {
        challenges = await options.loadChallenges(set, initial);
      } catch (error) {
        loadError = error;
      }
    }
    const snapshot = options.snapshotSet(set, challenges);
    const parsed = options.parseSnapshot(snapshot);
    const result = {
      set,
      snapshot,
      parsed: loadError && parsed.status === 'supported'
        ? { ...parsed, status: 'unsupported', loop: null, diagnostics: [`challenge metadata load failed: ${loadError?.message || loadError}`] }
        : parsed,
      loadError,
    };
    results.push(result);
    await options.onResult?.(result);
  }
  return { setsScanned: sets.length, pickSets: results.length, results };
}
