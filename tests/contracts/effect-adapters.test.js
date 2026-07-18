import { describe, expect, it } from 'vitest';
import { createStorageAdapter } from '../../src/adapters/browser/storage.js';
import { createFsuAdapter } from '../../src/adapters/ea/fsu.js';
import { createEaPackAdapter } from '../../src/adapters/ea/pack.js';
import { createEaSbcAdapter } from '../../src/adapters/ea/sbc.js';
import { createFakePackAdapter, createFakeSbcAdapter } from '../../src/adapters/fake/effects.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('effect adapter contracts', () => {
  it('EA and Fake Pack adapters expose list, resolve and open', async () => {
    const model = { id: 105, name: 'Bronze', open: () => ({ success: true, response: { items: [{ id: 1 }] } }) };
    const ea = createEaPackAdapter({ repositories: { Store: { myPacks: { _collection: [model] } } } });
    const fake = createFakePackAdapter([{ id: 105, name: 'Bronze' }], { 105: { success: true, response: { items: [{ id: 1 }] } } });
    expect(ea.resolve({ id: 105 })).toBe(model);
    expect(fake.resolve({ id: 105 })).toMatchObject({ id: 105 });
    expect(await ea.open(model)).toMatchObject({ success: true });
    expect(await fake.open(fake.resolve({ id: 105 }))).toMatchObject({ success: true });
  });

  it('EA and Fake SBC adapters expose save, load and submit', async () => {
    const calls = [];
    const ea = createEaSbcAdapter({ services: { SBC: {
      saveChallenge: (challenge) => { calls.push(['save', challenge.id]); return { success: true }; },
      loadChallengeData: (challenge) => { calls.push(['load', challenge.id]); return { success: true }; },
      submitChallenge: (challenge, set) => { calls.push(['submit', challenge.id, set.id]); return { success: true }; },
    } } });
    const fake = createFakeSbcAdapter();
    await ea.saveChallenge({ id: 1 });
    await ea.loadChallengeData({ id: 1 });
    await ea.submitChallenge({ id: 1 }, { id: 2 });
    await fake.saveChallenge({ id: 1 });
    await fake.loadChallengeData({ id: 1 });
    await fake.submitChallenge({ id: 1 }, { id: 2 });
    expect(calls).toEqual([['save', 1], ['load', 1], ['submit', 1, 2]]);
    expect(fake.calls.map((call) => call.method)).toEqual(['saveChallenge', 'loadChallengeData', 'submitChallenge']);
  });

  it('normalizes FSU settings and browser storage', () => {
    const fsu = createFsuAdapter({ info: {
      build: { untradeable: 1, academy: 1, firststorage: 1 },
      set: { goldenmin: 75, goldenmax: 81, leagueids: '31,16' },
      lock: { itemIds: [10], definitionIds: [20] },
    } }).snapshot();
    expect(fsu).toMatchObject({
      onlyUntradeable: true,
      excludeEvolution: true,
      priorityStoragePlayers: true,
      excludedLeagueIds: [31, 16],
      goldRange: [75, 81],
      lockedItemIds: [10],
      lockedDefinitionIds: [20],
    });

    const adapter = createStorageAdapter(storage());
    adapter.setJson('options', { enabled: true });
    expect(adapter.getJson('options')).toEqual({ enabled: true });
    adapter.remove('options');
    expect(adapter.get('options', 'missing')).toBe('missing');
  });
});
