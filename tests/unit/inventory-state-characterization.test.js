import { describe, expect, it } from 'vitest';
import { loadFixture } from '../helpers/fixtures.js';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

describe('inventory and Unassigned characterization', () => {
  it('counts every My Packs instance by pack id', async () => {
    const fixture = await loadFixture('packs/my-packs.json');
    const { api } = await loadUserscript({ packs: fixture.packs });
    const snapshot = api.getPackInventorySnapshot();
    expect(snapshot.total).toBe(fixture.expected.total);
    for (const [id, count] of Object.entries(fixture.expected.countsById)) {
      expect(snapshot.groups).toContainEqual(expect.objectContaining({ id: Number(id), count }));
    }
  });

  it('reports Storage overflow for untradeable duplicates that cannot be swapped', async () => {
    const fixture = await loadFixture('inventory/storage-overflow.json');
    const unassigned = fixture.unassigned.map(makePlayer);
    const club = fixture.club.map(makePlayer);
    const { api } = await loadUserscript({
      unassigned,
      club,
      pileSizes: fixture.pileSizes,
      pileCounts: fixture.pileCounts,
    });
    const overflow = api.getUnassignedStorageOverflow();
    expect(overflow).toEqual(fixture.expected);
  });

  it('reports Transfer overflow for tradeable duplicates before Storage overflow', async () => {
    const { api } = await loadUserscript({
      unassigned: [
        makePlayer({ id: 1, definitionId: 101, rating: 64, duplicate: true, duplicateId: 11, untradeable: false }),
        makePlayer({ id: 2, definitionId: 102, rating: 64, duplicate: true, duplicateId: 12, untradeable: false }),
      ],
      pileSizes: { transfer: 100, storage: 100 },
      pileCounts: { transfer: 99, storage: 100 },
    });
    expect(api.getUnassignedCapacityOverflow()).toEqual({
      destination: 'transfer',
      count: 2,
      space: 1,
      blocked: true,
    });
  });

  it('uses the set repeat counters instead of lifetime challenge completion totals', async () => {
    const fixture = await loadFixture('challenges/daily-progress.json');
    const { api } = await loadUserscript();
    expect(api.getDailySetRemaining(fixture.set)).toBe(fixture.expected.setRemaining);
    expect(api.getDailyChallengeRemaining(fixture.challenge)).toBe(fixture.expected.challengeRemaining);
    expect(api.getDailySetRemaining({ timesCompleted: 7, repeats: 7 })).toBe(0);
  });

  it('clears only an Unassigned signal whose submitted duplicate entity was consumed', async () => {
    const consumedSignal = makePlayer({
      id: 20,
      definitionId: 120,
      rating: 78,
      rareflag: 1,
      duplicate: true,
      duplicateId: 220,
    });
    const untouchedSignal = makePlayer({
      id: 21,
      definitionId: 121,
      rating: 79,
      rareflag: 1,
      duplicate: true,
      duplicateId: 221,
    });
    const { api } = await loadUserscript({ unassigned: [consumedSignal, untouchedSignal] });
    api.state.consumedItemIds.add(220);
    api.rememberConsumedDuplicateSignals([{
      id: 20,
      definitionId: 120,
      duplicateId: 220,
      pile: 'unassigned',
    }]);

    expect(api.clearConsumedDuplicateSignals([
      { id: 20, definitionId: 120, duplicateId: 220, pile: 'unassigned' },
    ], 'test', { quiet: true })).toBe(1);
    expect(consumedSignal.duplicateId).toBe(0);
    expect(untouchedSignal.duplicateId).toBe(221);
    expect(api.state.pendingConsumedDuplicateSignals.size).toBe(0);
  });

  it('reports why a duplicate signal candidate cannot be used without mutating it', async () => {
    const clubItem = makePlayer({ id: 230, definitionId: 130, rating: 78, rareflag: 1 });
    const signal = makePlayer({
      id: 30,
      definitionId: 130,
      rating: 78,
      rareflag: 1,
      duplicate: true,
      duplicateId: 230,
    });
    const { api } = await loadUserscript({ club: [clubItem] });
    api.state.consumedItemIds.add(230);
    const result = api.duplicateSignalDiagnostic(signal, {
      tier: 'gold',
      rarity: 'rare',
      playerOnly: true,
      allowSpecial: false,
      protectHighGold: true,
    });

    expect(result).toMatchObject({
      signalId: 30,
      definitionId: 130,
      duplicateId: 230,
      resolvedId: 0,
      signalReasons: [],
    });
    expect(result.candidates).toEqual([
      expect.objectContaining({ id: 230, pile: 'club', consumed: true, reasons: expect.arrayContaining(['consumed-this-run']) }),
    ]);
    expect(signal.duplicateId).toBe(230);
  });
});
