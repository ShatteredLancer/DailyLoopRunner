import { describe, expect, it } from 'vitest';
import { createStorageAdapter } from '../../src/adapters/browser/storage.js';
import { createFsuAdapter } from '../../src/adapters/ea/fsu.js';
import { createEaPackAdapter } from '../../src/adapters/ea/pack.js';
import { createEaLocalizationAdapter } from '../../src/adapters/ea/localization.js';
import { createEaPlayerPickAdapter } from '../../src/adapters/ea/player-pick.js';
import { createEaSbcAdapter } from '../../src/adapters/ea/sbc.js';
import { createRuntimeAdapters } from '../../src/adapters/index.js';
import { createFakePackAdapter, createFakePlayerPickAdapter, createFakeSbcAdapter } from '../../src/adapters/fake/effects.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('effect adapter contracts', () => {
  it('EA and Fake Pack adapters expose list, resolve and open', async () => {
    const calls = [];
    const model = { id: 105, name: 'Bronze', open: () => ({ success: true, response: { items: [{ id: 1 }] } }) };
    const ea = createEaPackAdapter({
      repositories: { Store: { myPacks: { _collection: [model] } } },
      services: { Store: { getPacks: (...args) => { calls.push(args); return { success: true }; } } },
      PurchasePackType: { ALL: 7 },
    });
    const fake = createFakePackAdapter([{ id: 105, name: 'Bronze' }], { 105: { success: true, response: { items: [{ id: 1 }] } } });
    expect(ea.resolve({ id: 105 })).toBe(model);
    expect(fake.resolve({ id: 105 })).toMatchObject({ id: 105 });
    expect(await ea.open(model)).toMatchObject({ success: true });
    expect(await fake.open(fake.resolve({ id: 105 }))).toMatchObject({ success: true });
    expect(await ea.refreshAll()).toMatchObject({ success: true });
    expect(await fake.refreshAll()).toMatchObject({ success: true });
    expect(calls).toEqual([[7, true, true]]);
  });

  it('EA and Fake SBC adapters expose save, load and submit', async () => {
    const calls = [];
    const set = { id: 20 };
    const formation = { generalPositions: [1, 2] };
    class SquadController {}
    const ea = createEaSbcAdapter({
      services: {
        SBC: {
          repository: { sets: { _collection: { 20: set } } },
          sbcDAO: {
            getChallengesForSet: (setId) => { calls.push(['dao-challenges', setId]); return { success: true }; },
            loadChallenge: (challengeId, inProgress) => { calls.push(['dao-load', challengeId, inProgress]); return { success: true }; },
          },
          requestSets: () => { calls.push(['sets']); return { success: true }; },
          requestChallengesForSet: (targetSet) => { calls.push(['challenges', targetSet.id]); return { success: true }; },
          loadChallenge: (challenge) => { calls.push(['load-page', challenge.id]); return { success: true }; },
          saveChallenge: (challenge) => { calls.push(['save', challenge.id]); return { success: true }; },
          loadChallengeData: (challenge) => { calls.push(['load', challenge.id]); return { success: true }; },
          submitChallenge: (challenge, targetSet, skipValidation, chemistryEnabled) => {
            calls.push(['submit', challenge.id, targetSet.id, skipValidation, chemistryEnabled]);
            return { success: true };
          },
        },
        UserSettings: { getSBCValidationSkip: () => true },
        Chemistry: { isFeatureEnabled: () => true },
      },
      repositories: { Squad: { getFormation: (id) => id === 4 ? formation : null } },
      UTSBCSquadSplitViewController: SquadController,
      SBCEligibilityKey: { TEAM_RATING: 8 },
    });
    const fake = createFakeSbcAdapter();
    expect(ea.listSets()).toEqual([set]);
    await ea.requestSets();
    await ea.requestChallengesForSet(set);
    await ea.loadChallenge({ id: 3 });
    await ea.getChallengesForSet(20);
    await ea.loadDaoChallenge(3, true);
    expect(ea.formation(4)).toBe(formation);
    expect(ea.createSquadController()).toBeInstanceOf(SquadController);
    expect(ea.eligibilityKeyName(8)).toBe('TEAM_RATING');
    expect(ea.eligibilityKeyName('UNKNOWN_KEY')).toBe('UNKNOWN_KEY');
    expect(ea.submissionOptions()).toEqual({ skipValidation: true, chemistryEnabled: true });
    await ea.saveChallenge({ id: 1 });
    await ea.loadChallengeData({ id: 1 });
    await ea.submitChallenge({ id: 1 }, { id: 2 }, { skipValidation: true, chemistryEnabled: true });
    await fake.saveChallenge({ id: 1 });
    await fake.loadChallengeData({ id: 1 });
    await fake.submitChallenge({ id: 1 }, { id: 2 });
    expect(calls).toEqual([
      ['sets'],
      ['challenges', 20],
      ['load-page', 3],
      ['dao-challenges', 20],
      ['dao-load', 3, true],
      ['save', 1],
      ['load', 1],
      ['submit', 1, 2, true, true],
    ]);
    expect(fake.calls.map((call) => call.method)).toEqual(['saveChallenge', 'loadChallengeData', 'submitChallenge']);
  });

  it('normalizes conservative Player Pick discovery snapshots without parsing names', () => {
    const requirement = (key, values, count) => ({
      count,
      getFirstKey: () => key,
      getValue: () => values,
    });
    const pickItem = {
      id: 91001,
      definitionId: 91001,
      isPlayerPickItem: () => true,
      getStaticData: () => ({
        name: 'Tournament Player Pick',
        description: '1 of 3 84+ Tournament Players',
        candidateCount: 3,
        availablePicks: 1,
      }),
    };
    const challenge = {
      id: 5101,
      formation: 4,
      squad: { getNumOfRequiredPlayers: () => 4 },
      eligibilityRequirements: [
        requirement(1, [3], -1),
        requirement(2, [1], 4),
      ],
    };
    const set = {
      id: 4101,
      name: '1 of 3 84+ Tournament Player Pick',
      timesCompleted: 0,
      repeats: 1,
      awards: [{ isItem: true, item: pickItem }],
      challenges: { _collection: { 5101: challenge } },
    };
    const ea = createEaSbcAdapter({
      services: { SBC: {
        repository: { sets: { _collection: { 4101: set } } },
        requestSets() {}, requestChallengesForSet() {}, loadChallenge() {}, saveChallenge() {}, submitChallenge() {},
      } },
      repositories: { Squad: { getFormation: () => ({ generalPositions: [1, 2, 3, 4] }) } },
      UTSBCSquadSplitViewController: class {},
      SBCEligibilityKey: { PLAYER_QUALITY: 1, PLAYER_RARITY: 2 },
    });

    expect(ea.snapshotDiscoverySet(set)).toEqual({
      id: 4101,
      name: '1 of 3 84+ Tournament Player Pick',
      status: '',
      complete: false,
      timesCompleted: 0,
      repeats: 1,
      rewards: [{
        type: 'PLAYER_PICK',
        name: 'Tournament Player Pick',
        description: '1 of 3 84+ Tournament Players',
        resourceId: 91001,
        definitionId: 91001,
        candidateCount: 3,
        selectionCount: 1,
        metadataHints: expect.objectContaining({
          award: expect.objectContaining({ keys: expect.any(Array) }),
          item: expect.objectContaining({ keys: expect.any(Array) }),
          data: expect.objectContaining({ keys: expect.any(Array) }),
          staticData: expect.objectContaining({
            keys: expect.arrayContaining(['availablePicks', 'candidateCount', 'description', 'name']),
            values: expect.objectContaining({ availablePicks: 1, candidateCount: 3 }),
          }),
        }),
      }],
      challenges: [{
        id: 5101,
        status: '',
        completed: false,
        requiredPlayerCount: 4,
        eligibilityRequirements: [
          { key: 'PLAYER_QUALITY', values: [3], count: -1 },
          { key: 'PLAYER_RARITY', values: [1], count: 4 },
        ],
      }],
    });
  });

  it('does not treat a transient Player Pick item id as a stable reward identity', () => {
    const pickItem = {
      id: 777,
      definitionId: 91001,
      isPlayerPickItem: () => true,
      getStaticData: () => ({ name: 'Transient Pick', candidateCount: 3, availablePicks: 1 }),
    };
    const set = { id: 4101, name: 'Transient Pick SBC', awards: [{ isItem: true, item: pickItem }] };
    const ea = createEaSbcAdapter({
      services: { SBC: {
        repository: { sets: { _collection: { 4101: set } } },
        requestSets() {}, requestChallengesForSet() {}, loadChallenge() {}, saveChallenge() {}, submitChallenge() {},
      } },
      repositories: { Squad: { getFormation: () => null } },
      UTSBCSquadSplitViewController: class {},
    });
    expect(ea.snapshotDiscoverySet(set).rewards[0]).toMatchObject({
      resourceId: null,
      definitionId: 91001,
      description: '',
    });
  });

  it('does not infer Pick player count from an unloaded 11-slot formation', () => {
    const challenge = { id: 5101, formation: 4, eligibilityRequirements: [] };
    const set = { id: 4101, name: 'Four-player Pick', challenges: [challenge] };
    const ea = createEaSbcAdapter({
      services: { SBC: {
        repository: { sets: { _collection: { 4101: set } } },
        requestSets() {}, requestChallengesForSet() {}, loadChallenge() {}, saveChallenge() {}, submitChallenge() {},
      } },
      repositories: { Squad: { getFormation: () => ({ generalPositions: Array(11).fill(0) }) } },
      UTSBCSquadSplitViewController: class {},
    });
    expect(ea.snapshotDiscoverySet(set).challenges[0].requiredPlayerCount).toBeNull();

    challenge.squad = { getAllBrickIndices: () => Array(7).fill(0) };
    expect(ea.snapshotDiscoverySet(set).challenges[0].requiredPlayerCount).toBe(4);
  });

  it('EA and Fake Player Pick adapters expose redeem and confirm', async () => {
    const calls = [];
    const ea = createEaPlayerPickAdapter({ services: { Item: {
      redeem: (item) => { calls.push(['redeem', item.id]); return { success: true, data: { items: [] } }; },
      confirmPlayerPickItemSelection: (items) => { calls.push(['confirm', items.map((item) => item.id)]); return { success: true }; },
    } } });
    const fake = createFakePlayerPickAdapter();
    await ea.redeem({ id: 10 });
    await ea.confirmSelection([{ id: 20 }]);
    await fake.redeem({ id: 10 });
    await fake.confirmSelection([{ id: 20 }]);
    expect(calls).toEqual([['redeem', 10], ['confirm', [20]]]);
    expect(fake.calls).toEqual([
      { method: 'redeem', itemId: 10 },
      { method: 'confirmSelection', itemIds: [20] },
    ]);
  });

  it('Player Pick adapters expose pending rewards and owned duplicate checks', () => {
    const pending = { id: 10, definitionId: 100, name: '1 of 3 84+ Player Pick', isPlayerPickItem: () => true };
    const choice = { id: 20, definitionId: 200, limitedUseType: 'normal' };
    const duplicate = { id: 21, definitionId: 200, limitedUseType: 'normal' };
    const otherType = { id: 22, definitionId: 300, limitedUseType: 'loan' };
    const ea = createEaPlayerPickAdapter({
      repositories: { Item: {
        getUnassignedItems: () => [pending],
        getStorageItems: () => [duplicate, otherType],
        getTransferItems: () => [],
        club: { items: { _collection: [] } },
      } },
      services: { Item: {
        redeem: () => ({ success: true }),
        confirmPlayerPickItemSelection: () => ({ success: true }),
      } },
    });
    expect(ea.listUnassignedPlayerPicks()).toEqual([pending]);
    expect(ea.isOwnedDuplicate(choice)).toBe(true);
    expect(ea.isOwnedDuplicate({ id: 30, definitionId: 300, limitedUseType: 'normal' })).toBe(false);

    const fake = createFakePlayerPickAdapter({ pendingPicks: [pending], duplicateDefinitionIds: [200] });
    expect(fake.listUnassignedPlayerPicks()).toEqual([pending]);
    expect(fake.isOwnedDuplicate(choice)).toBe(true);
  });

  it('normalizes FSU settings and browser storage', () => {
    const fsu = createFsuAdapter({ info: {
      build: { untradeable: 1, academy: 1, firststorage: 1 },
      set: { goldenrange: 81, shield_league: '31,16' },
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
    expect(adapter.entries()).toEqual([['options', '{"enabled":true}']]);
    adapter.remove('options');
    expect(adapter.get('options', 'missing')).toBe('missing');
  });

  it('localizes through EA when available and preserves fallback text', () => {
    const adapter = createEaLocalizationAdapter({
      services: { Localization: { localize: (value) => `localized:${value}` } },
    });
    expect(adapter.localize('PackName')).toBe('localized:PackName');
    expect(createEaLocalizationAdapter({}).localize('PackName')).toBe('PackName');
    expect(adapter.localize('')).toBe('');
  });

  it('creates runtime adapters lazily before EA repositories are ready', () => {
    const localStorage = storage();
    const sessionStorage = storage();
    const runtime = { localStorage, sessionStorage, document: {} };
    const adapters = createRuntimeAdapters(runtime);
    adapters.localStorage.setJson('ready', { value: true });
    expect(adapters.localStorage.getJson('ready')).toEqual({ value: true });
    expect(() => adapters.inventory()).toThrow(/Item repository/);
    expect(() => adapters.sbc()).toThrow(/SBC service/);
  });

  it('DOM adapter exposes event constructors, text search, visibility filtering, and the legacy click sequence', () => {
    class PointerEvent { constructor(type) { this.type = type; } }
    class MouseEvent { constructor(type) { this.type = type; } }
    class KeyboardEvent { constructor(type) { this.type = type; } }
    const legacy = { initMouseEvent: (...args) => { legacy.args = args; } };
    const events = [];
    const button = {
      textContent: ' Submit SBC ',
      classList: { contains: () => false },
      getBoundingClientRect: () => ({ width: 20, height: 10 }),
      dispatchEvent: (event) => events.push(event.type),
      scrollIntoView() {},
      focus() {},
      click: () => events.push('native-click'),
      getAttribute: () => '',
    };
    const hidden = {
      textContent: 'Submit SBC',
      classList: { contains: () => false },
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
    };
    const runtimeEvents = [];
    const runtime = { PointerEvent, MouseEvent, KeyboardEvent, dispatchEvent: (event) => runtimeEvents.push(event.type) };
    const documentObject = {
      querySelector: () => null,
      querySelectorAll: (selector) => selector === 'button' ? [hidden, button] : [button],
      createElement: () => ({}),
      createEvent: () => legacy,
      dispatchEvent: (event) => runtimeEvents.push(event.type),
      activeElement: { dispatchEvent: (event) => runtimeEvents.push(event.type) },
      body: { appendChild() {} },
      head: { appendChild() {} },
    };
    const adapters = createRuntimeAdapters({ ...runtime, localStorage: storage(), sessionStorage: storage() }, documentObject);
    expect(adapters.dom.eventConstructor('pointer')).toBe(PointerEvent);
    expect(adapters.dom.eventConstructor('mouse')).toBe(MouseEvent);
    expect(adapters.dom.createLegacyMouseEvent('click')).toBe(legacy);
    expect(legacy.args[0]).toBe('click');
    expect(adapters.dom.compactText(button)).toBe('Submit SBC');
    expect(adapters.dom.findButtonByText(['Submit SBC'], (text, patterns) => patterns.includes(text))).toBe(button);
    expect(adapters.dom.findClickableByText(['Submit'], (text) => text.includes('Submit'))).toBe(button);
    expect(adapters.dom.click(button)).toBe(true);
    expect(events).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'native-click']);
    adapters.dom.keyStroke('Alt', 'AltRight');
    expect(runtimeEvents).toEqual(['keydown', 'keyup', 'keydown', 'keyup', 'keydown', 'keyup']);
  });
});
