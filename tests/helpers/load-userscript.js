import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    clear() { data.clear(); },
  };
}

function collection(items = []) {
  return { _collection: [...items] };
}

function createDocument() {
  return {
    body: null,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() {
      return {
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        append() {},
        appendChild() {},
        remove() {},
        addEventListener() {},
        setAttribute() {},
      };
    },
  };
}

export function makePlayer(options = {}) {
  const rating = Number(options.rating ?? 75);
  const rareflag = Number(options.rareflag ?? 0);
  return {
    type: 'player',
    id: Number(options.id),
    definitionId: Number(options.definitionId ?? options.id),
    rating,
    rareflag,
    duplicateId: Number(options.duplicateId || 0),
    untradeable: options.untradeable !== false,
    tradeable: options.untradeable === false,
    name: options.name || `Player ${options.id}`,
    leagueId: Number(options.leagueId || 0),
    evolutionId: options.evolutionId,
    loans: options.loans ?? -1,
    groups: options.groups || [],
    isDuplicate() { return options.duplicate === true || Number(this.duplicateId || 0) > 0; },
    isPlayer() { return true; },
    isRare() { return rareflag > 0; },
    isSpecial() { return rareflag > 1; },
    isUntradeable() { return options.untradeable !== false; },
    isBronzeRating() { return rating > 0 && rating <= 64; },
    isSilverRating() { return rating >= 65 && rating <= 74; },
    isGoldRating() { return rating >= 75; },
  };
}

export async function loadUserscript(options = {}) {
  const sourcePath = path.join(root, 'src', 'userscript-entry.js');
  const original = await readFile(sourcePath, 'utf8');
  const exportBlock = `
    W.__FCLoopRunnerTest = {
      LOOP_DEFS,
      RECOVERY_RECIPES,
      UNASSIGNED_RECOVERY_POLICIES,
      DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
      state,
      cloneLoopDef,
      validateLoopDef,
      validateLoopDefList,
      validateLoopConfig,
      normalizeLoopConfig,
      parseLoopConfig,
      getVisibleLoopDefs,
      setFsuSettingsOverride,
      clearFsuSettingsOverride,
      itemMatchesSpec,
      isSbcUsablePlayer,
      selectInventoryPlayers,
      calculateEaSquadRating,
      findOptimalRatingSbcSelection,
      validateRatingSbcModelAgainstItems,
      getDailyChallengeRemaining,
      getDailySetRemaining,
      getPackInventorySnapshot,
      predictUnassignedDestination,
      getUnassignedStorageOverflow,
      getUnassignedCapacityOverflow,
      rememberConsumedDuplicateSignals,
      clearConsumedDuplicateSignals,
      duplicateSignalDiagnostic,
    };
  `;
  const instrumentedSource = original.replace(/\}\)\(\);\s*$/, `${exportBlock}\n})();`);
  if (instrumentedSource === original) throw new Error('Could not inject userscript test exports');
  const bundled = await build({
    stdin: {
      contents: instrumentedSource,
      resolveDir: path.dirname(sourcePath),
      sourcefile: 'userscript-entry.js',
      loader: 'js',
    },
    bundle: true,
    target: 'node20',
    format: 'iife',
    write: false,
  });
  const source = bundled.outputFiles[0].text;

  const document = createDocument();
  const itemRepository = {
    club: { items: collection(options.club) },
    storage: collection(options.storage),
    transfer: collection(options.transfer),
    getUnassignedItems: () => [...(options.unassigned || [])],
    getStorageItems: () => [...(options.storage || [])],
    getTransferItems: () => [...(options.transfer || [])],
    getPileSize: (pile) => Number(options.pileSizes?.[pile] ?? 100),
    numItemsInCache: (pile) => Number(options.pileCounts?.[pile] ?? 0),
  };
  const window = {
    document,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    innerWidth: 1920,
    innerHeight: 1080,
    repositories: {
      Item: itemRepository,
      Store: { myPacks: collection(options.packs) },
    },
    services: {
      Item: { itemDao: { itemRepo: { club: { items: collection() } } } },
      Store: {},
      SBC: {},
    },
    ItemPile: {
      CLUB: 'club',
      STORAGE: 'storage',
      TRANSFER: 'transfer',
      PURCHASED: 'unassigned',
    },
    console,
  };
  const sandbox = {
    window,
    unsafeWindow: window,
    document,
    console,
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout,
    clearTimeout,
    URL,
    Blob,
    Map,
    Set,
    WeakSet,
    WeakMap,
    Date,
    Math,
    JSON,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
  };
  window.window = window;
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  window.setInterval = sandbox.setInterval;
  window.clearInterval = sandbox.clearInterval;

  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  const api = window.__FCLoopRunnerTest;
  if (!api) throw new Error('Userscript test API was not installed');

  api.setFsuSettingsOverride({
    ignorePlayerPosition: true,
    onlyUntradeable: false,
    excludeDesignatedLeagues: false,
    excludedLeagueIds: [],
    useRarityPlayer: true,
    excludeEvolution: false,
    playerPickStrictCommonRare: true,
    priorityRareWithinGoldRange: false,
    priorityNonSpecialPlayers: true,
    priorityStoragePlayers: false,
    silverBronzePrioritizeNormal: true,
    goldRange: [75, 99],
    lockedItemIds: [],
    lockedDefinitionIds: [],
  });

  return { api, window, sandbox };
}
