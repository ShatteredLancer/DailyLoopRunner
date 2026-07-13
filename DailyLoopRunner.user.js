// ==UserScript==
// @name         FC26 Daily Loop Runner - Validation
// @namespace    local.fc26.validation
// @version      0.4.3
// @description  Configurable FC26 Web App loop runner for pack/SBC validation flows.
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.easports.com/*/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @connect      www.fut.gg
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const APP_KEY = '__FCLoopRunner';
  const LOOP_CONFIG_URL = 'http://127.0.0.1:8765/DailyLoopRunner.loops.json';
  try { W[APP_KEY]?.destroy?.(); } catch { }

  const CFG = {
    sourcePackIds: [105],
    sourcePackNames: [
      '高级青铜球员',
      '高級青銅球員',
      'Premium Bronze Players',
      'Bronze Players Premium',
      'BRONZE PLAYERS PREMIUM',
    ],
    bronzeUpgradeNames: [
      '青铜升级',
      '青銅升級',
      'Bronze Upgrade',
    ],
    silverRewardNames: [
      '2名白银球员',
      '2 名白银球员',
      '2名白銀球員',
      '2 Silver Players',
    ],
    maxRounds: 3,
    pauseMs: 1800,
    storageMax: 100,
  };

  const FSU_COMPAT_DEFAULTS = Object.freeze({
    ignorePlayerPosition: true,
    onlyUntradeable: false,
    excludeDesignatedLeagues: true,
    excludedLeagueIds: [],
    useRarityPlayer: false,
    excludeEvolution: true,
    playerPickStrictCommonRare: true,
    priorityRareWithinGoldRange: true,
    priorityNonSpecialPlayers: true,
    priorityStoragePlayers: true,
    silverBronzePrioritizeNormal: true,
    goldRange: [75, 83],
    lockedItemIds: [],
    lockedDefinitionIds: [],
    detected: false,
    source: 'compat-defaults',
  });

  const LOOP_DEFS = [
    {
      id: 'bronze-upgrade-validation',
      name: 'Bronze Upgrade Validation',
      strategy: 'validationBronzeUpgrade',
      sourcePackIds: [105],
      sourcePackNames: CFG.sourcePackNames,
      sbcNames: CFG.bronzeUpgradeNames,
      rewardPackNames: CFG.silverRewardNames,
      targetDuplicate: { tier: 'bronze', playerOnly: true, allowSpecial: false },
      maxRounds: 3,
    },
    {
      id: 'daily-bronze',
      name: 'Daily Bronze Loop',
      strategy: 'dailySingleCardRecycle',
      sbcNames: ['Daily Bronze Upgrade', '每日青铜升级', '每日青銅升級'],
      rewardPackIds: [105],
      rewardPackNames: ['Bronze Players Premium', 'Premium Bronze Players', 'BRONZE PLAYERS PREMIUM'],
      targetDuplicate: { tier: 'bronze', playerOnly: true, allowSpecial: false },
      maxCompletions: 7,
    },
    {
      id: 'daily-bronze-mvp',
      name: 'Daily Bronze MVP (1 run)',
      strategy: 'dailySingleCardRecycle',
      sbcNames: ['Daily Bronze Upgrade', '每日青铜升级', '每日青銅升級'],
      rewardPackIds: [105],
      rewardPackNames: ['Bronze Players Premium', 'Premium Bronze Players', 'BRONZE PLAYERS PREMIUM'],
      targetDuplicate: { tier: 'bronze', playerOnly: true, allowSpecial: false },
      maxCompletions: 1,
    },
    {
      id: 'daily-silver',
      name: 'Daily Silver Loop',
      strategy: 'dailySingleCardRecycle',
      sbcNames: ['Daily Silver Upgrade', '每日白银升级', '每日白銀升級'],
      rewardPackIds: [205],
      rewardPackNames: ['Silver Players Premium', 'SILVER PLAYERS PREMIUM'],
      targetDuplicate: { tier: 'silver', playerOnly: true, allowSpecial: false },
      maxCompletions: 7,
    },
    {
      id: 'daily-silver-mvp',
      name: 'Daily Silver MVP (1 run)',
      strategy: 'dailySingleCardRecycle',
      sbcNames: ['Daily Silver Upgrade', '每日白银升级', '每日白銀升級'],
      rewardPackIds: [205],
      rewardPackNames: ['Silver Players Premium', 'SILVER PLAYERS PREMIUM'],
      targetDuplicate: { tier: 'silver', playerOnly: true, allowSpecial: false },
      maxCompletions: 1,
    },
    {
      id: 'daily-common',
      name: 'Daily Common Loop',
      strategy: 'inventoryMixedUpgrade',
      sbcNames: ['Daily Common Gold Upgrade', '每日普通金牌升级', '每日普通金牌升級'],
      rewardPackIds: [304],
      rewardPackNames: ['Gold Players Pack'],
      requirements: [
        { tier: 'silver', count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ['storage', 'transfer', 'club'] },
        { tier: 'bronze', count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ['storage', 'transfer', 'club'] },
      ],
      priorityPiles: ['storage', 'transfer', 'club'],
      maxCompletions: 7,
    },
    {
      id: 'daily-common-mvp',
      name: 'Daily Common MVP (1 run)',
      strategy: 'inventoryMixedUpgrade',
      sbcNames: ['Daily Common Gold Upgrade', '每日普通金牌升级', '每日普通金牌升級'],
      rewardPackIds: [304],
      rewardPackNames: ['Gold Players Pack'],
      requirements: [
        { tier: 'silver', count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ['storage', 'transfer', 'club'] },
        { tier: 'bronze', count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ['storage', 'transfer', 'club'] },
      ],
      priorityPiles: ['storage', 'transfer', 'club'],
      maxCompletions: 1,
    },
    {
      id: 'daily-rare',
      name: 'Daily Rare Loop',
      strategy: 'commonGoldToRareUpgrade',
      sbcNames: ['Daily Rare Gold Upgrade', '每日稀有金牌升级', '每日稀有金牌升級'],
      sourcePackNames: ['11x Gold Players Pack', '11 x Gold Players Pack'],
      rewardPackNames: ['Max. 78 Rare Gold Players Pack', 'Max 78 Rare Gold Players Pack'],
      requirements: [
        { tier: 'gold', rarity: 'common', count: 5, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ['unassigned', 'storage', 'transfer'] },
      ],
      priorityPiles: ['unassigned', 'storage', 'transfer'],
      clubFallbackPiles: ['unassigned', 'storage', 'transfer', 'club'],
      maxCompletions: 7,
    },
    {
      id: 'daily-rare-mvp',
      name: 'Daily Rare MVP (1 run)',
      strategy: 'commonGoldToRareUpgrade',
      sbcNames: ['Daily Rare Gold Upgrade', '每日稀有金牌升级', '每日稀有金牌升級'],
      sourcePackNames: ['11x Gold Players Pack', '11 x Gold Players Pack'],
      rewardPackNames: ['Max. 78 Rare Gold Players Pack', 'Max 78 Rare Gold Players Pack'],
      requirements: [
        { tier: 'gold', rarity: 'common', count: 5, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ['unassigned', 'storage', 'transfer'] },
      ],
      priorityPiles: ['unassigned', 'storage', 'transfer'],
      clubFallbackPiles: ['unassigned', 'storage', 'transfer', 'club'],
      maxCompletions: 1,
    },
    {
      id: 'daily-rare-pack-84',
      name: 'Daily Rare Pack to 2x84+ Loop',
      strategy: 'rarePackTo84Upgrade',
      sourcePackNames: [
        '5x Max.78 Rare Gold Players Pack',
        '5x Max. 78 Rare Gold Players Pack',
        '5x Max 78 Rare Gold Players Pack',
        '5 x Max.78 Rare Gold Players Pack',
        '5 x Max. 78 Rare Gold Players Pack',
        '5 x Max 78 Rare Gold Players Pack',
        '5x 80+ Rare Gold Players Pack',
        '5 x 80+ Rare Gold Players Pack',
      ],
      rareUpgrade: {
        name: '2x 84+ Upgrade',
        sbcNames: ['2x 84+ Upgrade', '2 x 84+ Upgrade'],
        requirements: [
          { tier: 'gold', rarity: 'rare', count: 6, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
        ],
        priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      },
      maxPacks: 100,
    },
    {
      id: '83-plus-player-pick',
      name: '1 of 3 83+ Player Pick',
      strategy: 'playerPickSbc',
      sbcNames: ['1 of 3 83+ Player Pick', '1 of 3 83+ Player Picks'],
      pickItemNames: ['1 of 3 83+ Player Pick', '83+ Player Pick'],
      requirements: [
        { tier: 'gold', rarity: 'rare', count: 3, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
        { tier: 'gold', rarity: 'common', count: 1, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
      ],
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      challengesPerPick: 1,
      pickCount: 1,
      maxCompletions: 1,
      useRoundsAsCompletions: true,
      pricePlatform: 'pc',
    },
    {
      id: '82-plus-player-pick',
      name: '4 of 10 82+ Player Pick',
      strategy: 'playerPickSbc',
      sbcNames: ['4 of 10 82+ Player Pick', '4 of 10 82+ Player Picks'],
      pickItemNames: ['4 of 10 82+ Player Pick', '82+ Player Pick'],
      requirements: [
        { tier: 'gold', rarity: 'common', count: 9, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
      ],
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      challengesPerPick: 2,
      pickCount: 4,
      maxCompletions: 1,
      useRoundsAsCompletions: true,
      pricePlatform: 'pc',
    },
    {
      id: 'one-click-daily-mvp',
      name: 'One-click Daily MVP (1 each)',
      strategy: 'dailyRoutine',
      steps: ['daily-bronze-mvp', 'daily-silver-mvp', 'daily-common-mvp', 'daily-rare-mvp'],
      openRewardPacks: false,
    },
    {
      id: 'one-click-daily',
      name: 'One-click Daily Loop (max 7 each)',
      strategy: 'dailyRoutine',
      steps: ['daily-bronze', 'daily-silver', 'daily-common', 'daily-rare', 'daily-rare-pack-84'],
      openRewardPacks: false,
    },
    {
      id: 'auto-totw-upgrade',
      name: '84+ TOTW Upgrade Loop',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['84+ TOTW Upgrade', '84+ TOTW', 'TOTW Upgrade', '84+ TOTW 升级', '84+ TOTW 升級'],
      rewardPackIds: [20707, 20441],
      rewardPackNames: ['84+ TOTW 1-30 Player Pack', 'TOTW 1-30 Player Pack', '84+ TOTW 1-30', 'TOTW 1-30', '84+ TOTW Player Pack', 'TOTW Player Pack', '84+ TOTW Pack', 'TOTW Pack', 'TOTW Provision Refresh', 'TOTW Provision Refresh Pack'],
      maxCompletions: 1,
      useRoundsAsCompletions: true,
      allowMultipleCompletions: true,
      maxSubmittedRating: 88,
      maxNormalGoldSubmittedRating: 99,
      inventoryFillFirst: true,
      requirements: [
        { tier: 'gold', rarity: 'rare', count: 6, minRating: 84, maxRating: 99, playerOnly: true, allowSpecial: false, priorityPiles: ['storage', 'club'] },
        { tier: 'gold', rarity: 'rare', count: 5, minRating: 82, maxRating: 99, playerOnly: true, allowSpecial: false, priorityPiles: ['storage', 'club'] },
      ],
      priorityPiles: ['storage', 'club'],
      requiredSpecialCount: 0,
      allowedSpecialCount: 0,
      blockSpecial: true,
      blockTradeable: false,
      submitReadyRepairMaxAttempts: 8,
      openRewardPacks: true,
      forceOpenRewardPacks: true,
      assumeTotwRewardPack: true,
    },
    {
      id: '84x10-mvp',
      name: '84x10 MVP (1 run)',
      strategy: 'fillAndVerifySbc',
      sbcNames: [
        '84+ x10',
        '84+ x 10',
        '10x 84+ Upgrade',
        '10 x 84+ Upgrade',
        '10 名 84+ 升级',
        '10名84+升级',
      ],
      maxCompletions: 1,
      maxSubmittedRating: 88,
      maxNormalGoldSubmittedRating: 99,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      requiredSpecialKind: 'totw-tots-fof',
      requiredSpecialMinRating: 84,
      specialRequirementAdd: {
        patterns: ['Any TOTW/TOTS/FOF', 'TOTW/TOTS/FOF', 'TOTW', 'TOTS', 'FOF'],
        buttonTexts: ['Add', '添加', '加入', '新增'],
      },
      submitReadyRepairMaxAttempts: 8,
      autoTotwUpgrade: {
        name: '84+ TOTW Upgrade',
        sbcNames: ['84+ TOTW Upgrade', '84+ TOTW', 'TOTW Upgrade', '84+ TOTW 升级', '84+ TOTW 升級'],
        rewardPackIds: [20707, 20441],
        rewardPackNames: ['84+ TOTW 1-30 Player Pack', 'TOTW 1-30 Player Pack', '84+ TOTW 1-30', 'TOTW 1-30', '84+ TOTW Player Pack', 'TOTW Player Pack', '84+ TOTW Pack', 'TOTW Pack', 'TOTW Provision Refresh', 'TOTW Provision Refresh Pack'],
        maxSubmittedRating: 88,
        maxNormalGoldSubmittedRating: 99,
        blockSpecial: true,
        blockTradeable: false,
        openRewardPacks: true,
      },
      blockSpecial: true,
      blockTradeable: false,
      openRewardPacks: false,
    },
    {
      id: '84x10',
      name: '84x10 Loop (max 7)',
      strategy: 'fillAndVerifySbc',
      sbcNames: [
        '84+ x10',
        '84+ x 10',
        '10x 84+ Upgrade',
        '10 x 84+ Upgrade',
        '10 名 84+ 升级',
        '10名84+升级',
      ],
      maxCompletions: 7,
      allowMultipleCompletions: true,
      maxSubmittedRating: 88,
      maxNormalGoldSubmittedRating: 99,
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      requiredSpecialKind: 'totw-tots-fof',
      requiredSpecialMinRating: 84,
      specialRequirementAdd: {
        patterns: ['Any TOTW/TOTS/FOF', 'TOTW/TOTS/FOF', 'TOTW', 'TOTS', 'FOF'],
        buttonTexts: ['Add', '添加', '加入', '新增'],
      },
      submitReadyRepairMaxAttempts: 8,
      autoTotwUpgrade: {
        name: '84+ TOTW Upgrade',
        sbcNames: ['84+ TOTW Upgrade', '84+ TOTW', 'TOTW Upgrade', '84+ TOTW 升级', '84+ TOTW 升級'],
        rewardPackIds: [20707, 20441],
        rewardPackNames: ['84+ TOTW 1-30 Player Pack', 'TOTW 1-30 Player Pack', '84+ TOTW 1-30', 'TOTW 1-30', '84+ TOTW Player Pack', 'TOTW Player Pack', '84+ TOTW Pack', 'TOTW Pack', 'TOTW Provision Refresh', 'TOTW Provision Refresh Pack'],
        maxSubmittedRating: 88,
        maxNormalGoldSubmittedRating: 99,
        blockSpecial: true,
        blockTradeable: false,
        openRewardPacks: true,
      },
      blockSpecial: true,
      blockTradeable: false,
      openRewardPacks: false,
    },
    {
      id: 'provision-crafting',
      name: 'Provision Crafting Loop',
      strategy: 'provisionPackDualCrafting',
      sourcePackIds: [20643],
      sourcePackNames: ['Provision Pack', 'Provisions Pack'],
      rounds: 1,
      commonUpgrade: {
        name: 'FOF Glory Hunters Crafting Upgrade',
        sbcNames: ['FOF Glory Hunters Crafting Upgrade'],
        requirements: [
          { tier: 'gold', rarity: 'common', count: 9, playerOnly: true, allowSpecial: false, priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
        ],
        priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      },
      rareUpgrade: {
        name: '2x 84+ Upgrade',
        sbcNames: ['2x 84+ Upgrade', '2 x 84+ Upgrade'],
        requirements: [
          { tier: 'gold', rarity: 'rare', count: 6, playerOnly: true, allowSpecial: false, priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
        ],
        priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      },
    },
  ];

  const state = {
    running: false,
    stopping: false,
    refreshing: false,
    loadingLoops: false,
    loopDefs: null,
    loopConfigSource: 'built-in',
    pendingLiveConfirm: null,
    stalePackRefs: new WeakSet(),
    stalePackIds: new Set(),
    lastStorePacks: [],
    consumedItemIds: new Set(),
    assumedTotwItemIds: new Set(),
    recentRewardItems: [],
    logLines: [],
    bootTimer: null,
    fsuSettingsOverride: null,
    fsuSettingsCache: { at: 0, settings: null },
  };

  function destroyRunner() {
    state.stopping = true;
    if (state.bootTimer) clearInterval(state.bootTimer);
    document.querySelector('#bronze-loop-panel')?.remove();
    document.querySelector('#bronze-loop-style')?.remove();
  }

  W[APP_KEY] = {
    version: '0.4.3',
    destroy: destroyRunner,
    getFsuSettings: () => getFsuSettings({ force: true }),
    setFsuSettingsOverride,
    clearFsuSettingsOverride,
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const now = () => new Date().toLocaleTimeString();

  function log(msg) {
    const line = `[${now()}] ${msg}`;
    console.log('[BronzeLoop]', msg);
    state.logLines.push(line);
    state.logLines = state.logLines.slice(-80);
    renderLog();
  }

  function renderLog() {
    const latest = state.logLines[state.logLines.length - 1] || 'Ready.';
    const latestBox = document.querySelector('#bronze-loop-latest');
    const fullBox = document.querySelector('#bronze-loop-log');
    if (latestBox) latestBox.textContent = latest;
    if (fullBox) fullBox.textContent = state.logLines.join('\n');
  }

  function clearLog() {
    state.logLines = [];
    renderLog();
    console.clear();
    console.log('[BronzeLoop] Log cleared');
  }

  function cloneLoopDef(def) {
    return JSON.parse(JSON.stringify(def));
  }

  function getLoopDefs() {
    return state.loopDefs?.length ? state.loopDefs : LOOP_DEFS;
  }

  function findLoopDefById(id) {
    const loopDefs = getLoopDefs();
    return loopDefs.find((def) => def.id === id) || null;
  }

  function getLoopDefById(id) {
    return findLoopDefById(id) || getLoopDefs()[0] || LOOP_DEFS[0];
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function validateStringArray(value, path, errors, required = false) {
    if (value === undefined || value === null) {
      if (required) errors.push(`${path} is required`);
      return;
    }
    if (!Array.isArray(value) || !value.length) {
      errors.push(`${path} must be a non-empty array`);
      return;
    }
    value.forEach((entry, index) => {
      if (typeof entry !== 'string' || !entry.trim()) {
        errors.push(`${path}[${index}] must be a non-empty string`);
      }
    });
  }

  function validateNumberArray(value, path, errors) {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value) || !value.length) {
      errors.push(`${path} must be a non-empty array`);
      return;
    }
    value.forEach((entry, index) => {
      if (!Number.isFinite(Number(entry))) {
        errors.push(`${path}[${index}] must be a number`);
      }
    });
  }

  function validatePileList(value, path, errors, required = false) {
    const allowed = ['unassigned', 'storage', 'transfer', 'club'];
    if (value === undefined || value === null) {
      if (required) errors.push(`${path} is required`);
      return;
    }
    if (!Array.isArray(value) || !value.length) {
      errors.push(`${path} must be a non-empty array`);
      return;
    }
    value.forEach((pile, index) => {
      if (!allowed.includes(pile)) {
        errors.push(`${path}[${index}] must be one of: ${allowed.join(', ')}`);
      }
    });
  }

  function validateCardSpec(spec, path, errors) {
    if (!isPlainObject(spec)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (spec.tier !== undefined && !['bronze', 'silver', 'gold'].includes(spec.tier)) {
      errors.push(`${path}.tier must be bronze, silver, or gold`);
    }
    if (spec.rarity !== undefined && !['common', 'rare'].includes(spec.rarity)) {
      errors.push(`${path}.rarity must be common or rare`);
    }
    ['minRating', 'maxRating'].forEach((field) => {
      if (spec[field] === undefined) return;
      const rating = Number(spec[field]);
      if (!Number.isFinite(rating) || rating < 1 || rating > 99) {
        errors.push(`${path}.${field} must be a number between 1 and 99`);
      }
    });
    ['playerOnly', 'allowSpecial', 'special', 'protectHighGold'].forEach((field) => {
      if (spec[field] !== undefined && typeof spec[field] !== 'boolean') {
        errors.push(`${path}.${field} must be boolean`);
      }
    });
  }

  function validateRequirements(requirements, path, errors, required = false) {
    if (requirements === undefined || requirements === null) {
      if (required) errors.push(`${path} is required`);
      return;
    }
    if (!Array.isArray(requirements) || !requirements.length) {
      errors.push(`${path} must be a non-empty array`);
      return;
    }
    requirements.forEach((requirement, index) => {
      const reqPath = `${path}[${index}]`;
      validateCardSpec(requirement, reqPath, errors);
      if (!Number.isFinite(Number(requirement?.count)) || Number(requirement.count) <= 0) {
        errors.push(`${reqPath}.count must be a positive number`);
      }
      validatePileList(requirement?.priorityPiles, `${reqPath}.priorityPiles`, errors);
    });
  }

  function validateUpgradeDef(upgradeDef, path, errors) {
    if (!isPlainObject(upgradeDef)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (typeof upgradeDef.name !== 'string' || !upgradeDef.name.trim()) {
      errors.push(`${path}.name is required`);
    }
    validateStringArray(upgradeDef.sbcNames, `${path}.sbcNames`, errors, true);
    validateRequirements(upgradeDef.requirements, `${path}.requirements`, errors, true);
    validatePileList(upgradeDef.priorityPiles, `${path}.priorityPiles`, errors);
  }

  function validateLoopDef(loopDef, label = 'loop') {
    const errors = [];
    if (!isPlainObject(loopDef)) return [`${label} must be an object`];

    const strategies = [
      'validationBronzeUpgrade',
      'dailySingleCardRecycle',
      'inventoryMixedUpgrade',
      'commonGoldToRareUpgrade',
      'provisionPackDualCrafting',
      'rarePackTo84Upgrade',
      'playerPickSbc',
      'dailyRoutine',
      'fillAndVerifySbc',
    ];

    if (typeof loopDef.name !== 'string' || !loopDef.name.trim()) {
      errors.push('name is required');
    }
    if (typeof loopDef.strategy !== 'string' || !loopDef.strategy.trim()) {
      errors.push('strategy is required');
    } else if (!strategies.includes(loopDef.strategy)) {
      errors.push(`strategy must be one of: ${strategies.join(', ')}`);
    }
    if (loopDef.dryRun !== undefined && typeof loopDef.dryRun !== 'boolean') {
      errors.push('dryRun must be boolean');
    }
    ['openRewardPacks', 'blockSpecial', 'blockTradeable', 'inventoryFillFirst'].forEach((field) => {
      if (loopDef[field] !== undefined && typeof loopDef[field] !== 'boolean') {
        errors.push(`${field} must be boolean`);
      }
    });
    if (loopDef.maxSubmittedRating !== undefined) {
      const maxRating = Number(loopDef.maxSubmittedRating);
      if (!Number.isFinite(maxRating) || maxRating < 1 || maxRating > 99) {
        errors.push('maxSubmittedRating must be a number between 1 and 99');
      }
    }
    if (loopDef.maxNormalGoldSubmittedRating !== undefined) {
      const maxRating = Number(loopDef.maxNormalGoldSubmittedRating);
      if (!Number.isFinite(maxRating) || maxRating < 1 || maxRating > 99) {
        errors.push('maxNormalGoldSubmittedRating must be a number between 1 and 99');
      }
    }
    if (loopDef.requiredSpecialMinRating !== undefined) {
      const minRating = Number(loopDef.requiredSpecialMinRating);
      if (!Number.isFinite(minRating) || minRating < 1 || minRating > 99) {
        errors.push('requiredSpecialMinRating must be a number between 1 and 99');
      }
    }
    if (loopDef.requiredSpecialKind !== undefined && !['totw', 'totw-tots-fof'].includes(String(loopDef.requiredSpecialKind).toLowerCase())) {
      errors.push('requiredSpecialKind must be totw or totw-tots-fof when provided');
    }
    if (
      loopDef.autoTotwUpgrade !== undefined &&
      loopDef.autoTotwUpgrade !== false &&
      !isPlainObject(loopDef.autoTotwUpgrade)
    ) {
      errors.push('autoTotwUpgrade must be an object or false');
    }

    validateNumberArray(loopDef.sourcePackIds, 'sourcePackIds', errors);
    validateNumberArray(loopDef.rewardPackIds, 'rewardPackIds', errors);
    validateNumberArray(loopDef.protectedItemIds, 'protectedItemIds', errors);
    validateNumberArray(loopDef.protectedDefinitionIds, 'protectedDefinitionIds', errors);
    validateStringArray(loopDef.sourcePackNames, 'sourcePackNames', errors);
    validateStringArray(loopDef.rewardPackNames, 'rewardPackNames', errors);
    validatePileList(loopDef.priorityPiles, 'priorityPiles', errors);
    validatePileList(loopDef.clubFallbackPiles, 'clubFallbackPiles', errors);
    validatePileList(loopDef.disabledPiles, 'disabledPiles', errors);

    if (loopDef.strategy === 'validationBronzeUpgrade') {
      validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
      validateCardSpec(loopDef.targetDuplicate, 'targetDuplicate', errors);
    }

    if (loopDef.strategy === 'dailySingleCardRecycle') {
      validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
      validateCardSpec(loopDef.targetDuplicate, 'targetDuplicate', errors);
    }

    if (loopDef.strategy === 'dailyRoutine') {
      validateStringArray(loopDef.steps, 'steps', errors, true);
    }

    if (loopDef.strategy === 'fillAndVerifySbc') {
      validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
      if (loopDef.requirements !== undefined) validateRequirements(loopDef.requirements, 'requirements', errors, false);
    }

    if (loopDef.strategy === 'inventoryMixedUpgrade' || loopDef.strategy === 'commonGoldToRareUpgrade') {
      validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
      validateRequirements(loopDef.requirements, 'requirements', errors, true);
    }

    if (loopDef.strategy === 'provisionPackDualCrafting') {
      if (!loopDef.sourcePackIds?.length && !loopDef.sourcePackNames?.length) {
        errors.push('sourcePackIds or sourcePackNames is required');
      }
      validateUpgradeDef(loopDef.commonUpgrade, 'commonUpgrade', errors);
      validateUpgradeDef(loopDef.rareUpgrade, 'rareUpgrade', errors);
    }

    if (loopDef.strategy === 'rarePackTo84Upgrade') {
      if (!loopDef.sourcePackIds?.length && !loopDef.sourcePackNames?.length) {
        errors.push('sourcePackIds or sourcePackNames is required');
      }
      validateUpgradeDef(loopDef.rareUpgrade, 'rareUpgrade', errors);
      if (loopDef.maxPacks !== undefined) {
        const maxPacks = Number(loopDef.maxPacks);
        if (!Number.isFinite(maxPacks) || maxPacks <= 0) {
          errors.push('maxPacks must be a positive number');
        }
      }
    }

    if (loopDef.strategy === 'playerPickSbc') {
      validateStringArray(loopDef.sbcNames, 'sbcNames', errors, true);
      validateStringArray(loopDef.pickItemNames, 'pickItemNames', errors, true);
      validateRequirements(loopDef.requirements, 'requirements', errors, true);
      const challengesPerPick = Number(loopDef.challengesPerPick || 1);
      const pickCount = Number(loopDef.pickCount || 1);
      if (!Number.isInteger(challengesPerPick) || challengesPerPick < 1 || challengesPerPick > 10) {
        errors.push('challengesPerPick must be an integer between 1 and 10');
      }
      if (!Number.isInteger(pickCount) || pickCount < 1 || pickCount > 10) {
        errors.push('pickCount must be an integer between 1 and 10');
      }
      if (loopDef.pricePlatform !== undefined && !['pc', 'ps', 'xbox'].includes(String(loopDef.pricePlatform).toLowerCase())) {
        errors.push('pricePlatform must be pc, ps, or xbox when provided');
      }
    }

    return errors;
  }

  function assertValidLoopDef(loopDef, label = 'Loop JSON') {
    const errors = validateLoopDef(loopDef, label);
    if (errors.length) fail(`${label} validation failed:\n- ${errors.join('\n- ')}`);
  }

  function validateLoopDefList(loopDefs, label = 'Loop config') {
    if (!Array.isArray(loopDefs) || !loopDefs.length) {
      fail(`${label} must be a non-empty array or an object with a loops array`);
    }
    const seen = new Set();
    loopDefs.forEach((loopDef, index) => {
      assertValidLoopDef(loopDef, `${label}[${index}]`);
      if (typeof loopDef.id !== 'string' || !loopDef.id.trim()) {
        fail(`${label}[${index}].id is required`);
      }
      if (loopDef.id) {
        if (seen.has(loopDef.id)) fail(`${label} has duplicate id: ${loopDef.id}`);
        seen.add(loopDef.id);
      }
    });
  }

  function setLoopDefs(loopDefs, source = 'custom') {
    validateLoopDefList(loopDefs, source);
    state.loopDefs = cloneLoopDef(loopDefs);
    state.loopConfigSource = source;
    renderLoopSelect(state.loopDefs[0]?.id);
    log(`Loaded ${state.loopDefs.length} loop definition(s) from ${source}`);
  }

  function resetLoopDefs() {
    state.loopDefs = null;
    state.loopConfigSource = 'built-in';
    renderLoopSelect(LOOP_DEFS[0]?.id);
    log(`Using built-in loop definitions (${LOOP_DEFS.length})`);
  }

  function parseLoopConfig(text) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.loops)) return parsed.loops;
    fail('Loop config JSON must be an array or an object with a loops array');
  }

  function requestText(url) {
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          nocache: true,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response.responseText);
            } else {
              reject(new Error(`HTTP ${response.status}`));
            }
          },
          onerror: () => reject(new Error('request failed')),
          ontimeout: () => reject(new Error('request timed out')),
          timeout: 10000,
        });
      });
    }
    if (typeof W.__FCLoopRunnerRequestText === 'function') {
      return W.__FCLoopRunnerRequestText(url);
    }
    return fetch(url, { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
  }

  async function loadLoopConfig(url = LOOP_CONFIG_URL) {
    const text = await requestText(`${url}?t=${Date.now()}`);
    const loopDefs = parseLoopConfig(text);
    setLoopDefs(loopDefs, url);
  }

  function applyDisabledPilesToList(piles, disabledPiles, path) {
    if (!Array.isArray(piles) || !piles.length || !disabledPiles?.size) return piles;
    const filtered = piles.filter((pile) => !disabledPiles.has(pile));
    if (!filtered.length) fail(`${path} has no enabled piles after disabledPiles`);
    return filtered;
  }

  function applyDisabledPilesToRequirements(requirements, disabledPiles, path) {
    if (!Array.isArray(requirements)) return;
    requirements.forEach((requirement, index) => {
      requirement.priorityPiles = applyDisabledPilesToList(
        requirement.priorityPiles,
        disabledPiles,
        `${path}[${index}].priorityPiles`,
      );
    });
  }

  function applyDisabledPiles(loopDef) {
    const disabledPiles = new Set(loopDef.disabledPiles || []);
    if (!disabledPiles.size) return loopDef;

    loopDef.priorityPiles = applyDisabledPilesToList(loopDef.priorityPiles, disabledPiles, 'priorityPiles');
    loopDef.clubFallbackPiles = applyDisabledPilesToList(loopDef.clubFallbackPiles, disabledPiles, 'clubFallbackPiles');
    applyDisabledPilesToRequirements(loopDef.requirements, disabledPiles, 'requirements');

    for (const upgradeName of ['commonUpgrade', 'rareUpgrade']) {
      const upgradeDef = loopDef[upgradeName];
      if (!isPlainObject(upgradeDef)) continue;
      upgradeDef.priorityPiles = applyDisabledPilesToList(upgradeDef.priorityPiles, disabledPiles, `${upgradeName}.priorityPiles`);
      applyDisabledPilesToRequirements(upgradeDef.requirements, disabledPiles, `${upgradeName}.requirements`);
    }

    return loopDef;
  }

  function getSelectedLoopDef() {
    const select = document.querySelector('#bronze-loop-select');
    const selectedId = select?.value || getLoopDefs()[0]?.id || LOOP_DEFS[0].id;
    if (selectedId === 'custom') {
      const text = document.querySelector('#bronze-loop-json')?.value || '';
      try {
        const parsed = JSON.parse(text);
        assertValidLoopDef(parsed, 'Custom loop JSON');
        return applyDisabledPiles(parsed);
      } catch (e) {
        if (e instanceof SyntaxError) fail(`Invalid custom loop JSON: ${e.message || e}`);
        throw e;
      }
    }
    const loopDef = cloneLoopDef(getLoopDefById(selectedId));
    assertValidLoopDef(loopDef, loopDef.name || selectedId);
    return applyDisabledPiles(loopDef);
  }

  function setLoopJson(def) {
    const editor = document.querySelector('#bronze-loop-json');
    if (editor) editor.value = JSON.stringify(def, null, 2);
  }

  function renderLoopSelect(selectedId = null) {
    const select = document.querySelector('#bronze-loop-select');
    if (!select) return;
    const previous = selectedId || select.value;
    select.textContent = '';

    for (const def of getLoopDefs()) {
      const option = document.createElement('option');
      option.value = def.id;
      option.textContent = def.name;
      select.appendChild(option);
    }

    const custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = 'Custom JSON';
    select.appendChild(custom);

    const nextValue = Array.from(select.options).some((option) => option.value === previous)
      ? previous
      : getLoopDefs()[0]?.id;
    if (nextValue) select.value = nextValue;
    if (select.value !== 'custom') setLoopJson(getLoopDefById(select.value));
    updateLoopControls();
  }

  function getEditorLoopDef() {
    const selectedId = document.querySelector('#bronze-loop-select')?.value || getLoopDefs()[0]?.id || LOOP_DEFS[0].id;
    if (selectedId !== 'custom') return getLoopDefById(selectedId);
    try {
      return JSON.parse(document.querySelector('#bronze-loop-json')?.value || '{}');
    } catch {
      return {};
    }
  }

  function getEditorLoopStrategy() {
    return getEditorLoopDef()?.strategy || '';
  }

  function updateLoopControls() {
    const roundsRow = document.querySelector('#bronze-loop-rounds-row');
    const roundsLabel = document.querySelector('#bronze-loop-rounds-label');
    const roundsInput = document.querySelector('#bronze-loop-rounds');
    if (!roundsLabel || !roundsInput) return;
    const editorLoop = getEditorLoopDef();
    const showRounds = editorLoop.useRoundsAsCompletions === true ||
      ['validationBronzeUpgrade', 'provisionPackDualCrafting', 'playerPickSbc'].includes(editorLoop.strategy);
    if (roundsRow) roundsRow.style.display = showRounds ? '' : 'none';
    roundsLabel.style.display = showRounds ? '' : 'none';
    roundsInput.style.display = showRounds ? '' : 'none';
  }

  function fail(message) {
    throw new Error(message);
  }

  function stopPoint() {
    if (state.stopping) fail('Stopped by user');
  }

  function matchesAny(text, patterns) {
    const list = Array.isArray(patterns)
      ? patterns
      : (patterns === undefined || patterns === null ? [] : [patterns]);
    if (!list.length) return false;
    const safeText = String(text || '').toLowerCase();
    return list.some((p) => safeText.includes(String(p).toLowerCase()));
  }

  function errorStackLines(error, limit = 4) {
    const stack = String(error?.stack || '').split('\n').map((line) => line.trim()).filter(Boolean);
    return stack.slice(1, Math.max(1, limit + 1));
  }

  function localize(value) {
    try {
      if (W.services?.Localization && value) {
        return W.services.Localization.localize(value);
      }
    } catch { }
    return String(value || '');
  }

  function packName(pack) {
    return (
      localize(pack?.packName) ||
      localize(pack?.name) ||
      String(pack?.packName || pack?.name || pack?.id || '')
    );
  }

  function uniquePacks(packs) {
    const byId = new Map();
    for (const pack of packs || []) {
      const key = packIdKey(pack);
      if (!key) continue;
      const existing = byId.get(key);
      if (!existing || (typeof pack?.open === 'function' && typeof existing?.open !== 'function')) {
        byId.set(key, pack);
      }
    }
    return Array.from(byId.values());
  }

  function collectPackLikeObjects(value, out = [], depth = 0, seen = new WeakSet()) {
    if (!value || depth > 5) return out;
    if (typeof value !== 'object') return out;
    if (seen.has(value)) return out;
    seen.add(value);

    if (Array.isArray(value)) {
      value.slice(0, 200).forEach((entry) => collectPackLikeObjects(entry, out, depth + 1, seen));
      return out;
    }

    const id = packIdKey(value);
    const hasPackShape = id && (
      typeof value.open === 'function' ||
      value.packName !== undefined ||
      value.packId !== undefined ||
      value.packType !== undefined ||
      value.packDefinitionId !== undefined ||
      value.packAssetId !== undefined
    );
    if (hasPackShape) out.push(value);

    for (const child of Object.values(value).slice(0, 80)) {
      collectPackLikeObjects(child, out, depth + 1, seen);
    }
    return out;
  }

  function observeOnce(observable, controller, timeoutMs = 20000, label = 'observable') {
    return new Promise((resolve, reject) => {
      let done = false;
      const tid = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error(`${label} timed out`));
      }, timeoutMs);

      try {
        observable.observe(controller || ctrl(), (sender, result) => {
          if (done) return;
          done = true;
          clearTimeout(tid);
          try { sender?.unobserve?.(controller || ctrl()); } catch { }
          resolve(result);
        });
      } catch (e) {
        clearTimeout(tid);
        reject(e);
      }
    });
  }

  function ctrl() {
    try {
      return W.getAppMain()
        .getRootViewController()
        .getPresentedViewController()
        .getCurrentViewController()
        .getCurrentController();
    } catch {
      return null;
    }
  }

  async function waitFor(predicate, timeoutMs = 15000, label = 'condition') {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      stopPoint();
      try {
        const value = predicate();
        if (value) return value;
      } catch { }
      await sleep(250);
    }
    fail(`Timed out waiting for ${label}`);
  }

  async function waitAppReady() {
    await waitFor(
      () => isFutAppReady(),
      30000,
      'FUT main UI',
    );
  }

  async function waitLoadingEnd(stableMs = 700, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      stopPoint();
      const shield = W.gClickShield;
      if (!shield || !shield.isShowing || !shield.isShowing()) {
        await sleep(stableMs);
        if (!shield || !shield.isShowing || !shield.isShowing()) return true;
      }
      await sleep(250);
    }
    log('Loading shield wait timed out; continuing');
    return false;
  }

  function areFutServicesReady() {
    return !!(
      W.services?.Store &&
      W.services?.SBC &&
      W.services?.Item &&
      W.repositories?.Store &&
      W.repositories?.Item
    );
  }

  function hasFutMainDom() {
    return [
      '.ut-tab-bar-item.icon-home',
      '.ut-navigation-container-view--content',
      '.ut-navigation-container-view',
      '.ut-navigation-bar-view',
      '.ut-tab-bar',
      '.ut-home-hub-view',
      '.ut-store-hub-view',
      '.ut-sbc-hub-view',
      '.ut-sbc-set-view',
      '.ut-sbc-challenges-view',
      '.ut-squad-hub-view',
      '.ut-club-view',
      '.ut-transfer-list-view',
      '.ut-unassigned-items-view',
    ].some((selector) => document.querySelector(selector));
  }

  function currentControllerName() {
    const controller = ctrl();
    return String(controller?.className || controller?.constructor?.name || '');
  }

  function isMainFutControllerName(name) {
    return /^UT(Home|Store|SBC|Squad|Club|Transfer|Unassigned|Evolutions|Objectives|Market|Pack)/.test(name) &&
      !/Loading|Splash|Login|Preload|Startup/i.test(name);
  }

  function isFutAppReady() {
    return areFutServicesReady() && (hasFutMainDom() || isMainFutControllerName(currentControllerName()));
  }

  async function refreshStorePacks() {
    const controller = ctrl();
    const result = await observeOnce(
      W.services.Store.getPacks(W.PurchasePackType.ALL, true, true),
      controller,
      30000,
      'Store.getPacks',
    );
    if (!result?.success) fail(`Store pack refresh failed: ${result?.error?.code || result?.status || 'unknown'}`);
    state.lastStorePacks = uniquePacks([
      ...getRepositoryMyPacks(),
      ...collectPackLikeObjects(result),
      ...(state.lastStorePacks || []),
    ]).slice(0, 200);
    return result;
  }

  function mergeStorePacksFromController(controller = ctrl()) {
    const packs = uniquePacks([
      ...collectPackLikeObjects(controller),
      ...getRepositoryMyPacks(),
      ...(state.lastStorePacks || []),
    ]).slice(0, 300);
    if (packs.length) state.lastStorePacks = packs;
    return packs.length;
  }

  async function openStorePacksViewForRefresh(label = 'reward pack lookup') {
    const before = currentControllerName();
    if (before !== 'UTStorePackViewController') {
      const storeTab = document.querySelector('.ut-tab-bar-item.icon-store');
      if (!storeTab) return false;
      log(`${label}: opening Store to refresh visible packs`);
      simulateClick(storeTab);
      await waitLoadingEnd(700, 15000);
      await sleep(800);
    }

    if (currentControllerName() !== 'UTStorePackViewController') {
      const packTile = Array.from(document.querySelectorAll('.packs-tile, .ut-store-pack-tile-view, .tile.packs, .tile, .ut-store-tile-view, .store-tile, .tile-container'))
        .filter(isClickableElement)
        .find((el) => {
          const text = compactText(el);
          const classes = String(el.className || '');
          return /packs-tile|store-pack|tile\.packs/i.test(classes) ||
            matchesAny(text, ['Packs', 'My Packs', '包']);
        });
      if (packTile) {
        log(`${label}: opening Store Packs view`);
        simulateClick(packTile);
        await waitLoadingEnd(700, 15000);
        await sleep(900);
      }
    }

    const controller = ctrl();
    if (currentControllerName() === 'UTStorePackViewController') {
      try {
        const result = controller?.getStorePacks?.(true);
        await awaitMaybeObservable(result, 'UTStorePackViewController.getStorePacks', 15000).catch(() => null);
      } catch { }
      await refreshStorePacks().catch(() => null);
      const count = mergeStorePacksFromController(controller);
      log(`${label}: Store Packs view refreshed; visible pack cache ${count || getMyPacks().length}`);
      return true;
    }

    return false;
  }

  function serviceResultErrorText(result, fallback = 'unknown') {
    return result?.error?.code ||
      result?.error?.message ||
      result?.message ||
      result?.status ||
      fallback;
  }

  async function refreshUnassigned(options = {}) {
    const attempts = Math.max(1, Math.min(5, Number(options.attempts ?? 3) || 3));
    const allowCacheFallback = options.allowCacheFallback !== false;
    const quiet = options.quiet === true;
    let lastError = '';

    for (let attempt = 1; attempt <= attempts; attempt++) {
      stopPoint();
      await waitLoadingEnd(250, attempt === 1 ? 6000 : 12000).catch(() => null);
      const controller = ctrl();
      try {
        const result = await observeOnce(
          W.services.Item.requestUnassignedItems(),
          controller,
          20000,
          'requestUnassignedItems',
        );
        if (result?.success) return result;
        lastError = serviceResultErrorText(result);
      } catch (e) {
        lastError = e?.message || String(e || 'unknown');
      }

      if (attempt < attempts) {
        if (!quiet) log(`Unassigned refresh failed (${lastError || 'unknown'}); retrying ${attempt + 1}/${attempts}`);
        await sleep(700 * attempt);
      }
    }

    if (allowCacheFallback) {
      const cachedCount = getUnassignedItems().length;
      if (!quiet) log(`Unassigned refresh failed after ${attempts} attempt(s): ${lastError || 'unknown'}; using existing cache (${cachedCount} item(s))`);
      return { success: false, cachedFallback: true, cachedCount, error: { message: lastError || 'unknown' } };
    }

    fail(`Unassigned refresh failed: ${lastError || 'unknown'}`);
  }

  function cacheSummary() {
    return [
      `packs:${getMyPacks().length}`,
      `unassigned:${getUnassignedItems().length}`,
      `storage:${getStorageItems().length}`,
      `transfer:${getTransferItems().length}`,
      `club:${getClubItems().length}`,
    ].join(', ');
  }

  async function awaitMaybeObservable(value, label, timeoutMs = 20000) {
    if (!value) return { success: true, skipped: true };
    if (typeof value.observe === 'function') {
      return observeOnce(value, ctrl(), timeoutMs, label);
    }
    if (typeof value.then === 'function') {
      return value;
    }
    return value;
  }

  async function tryOptionalRefresh(label, action, options = {}) {
    const quiet = options.quiet === true;
    try {
      const result = await awaitMaybeObservable(action(), label, options.timeoutMs || 20000);
      if (result?.success === false) {
        const code = result?.error?.code || result?.status || 'unknown';
        if (!quiet) log(`${label} refresh failed: ${code}`);
        return false;
      }
      if (!quiet) log(`${label} refreshed`);
      return true;
    } catch (e) {
      if (!quiet) log(`${label} refresh skipped: ${e.message || e}`);
      return false;
    }
  }

  async function refreshPileCacheByCandidates(pileName, pile, specificNames, options = {}) {
    const itemService = W.services?.Item || {};
    for (const methodName of specificNames) {
      if (typeof itemService[methodName] !== 'function') continue;
      const ok = await tryOptionalRefresh(`Item.${methodName}`, () => itemService[methodName](), options);
      if (ok) return true;
    }

    const genericNames = [
      'requestItems',
      'requestPileItems',
      'requestItemsForPile',
      'requestItemsByPile',
    ];
    for (const methodName of genericNames) {
      if (typeof itemService[methodName] !== 'function') continue;
      const ok = await tryOptionalRefresh(`${pileName} via Item.${methodName}`, () => itemService[methodName](pile), options);
      if (ok) return true;
    }

    if (!options.quiet) log(`${pileName} cache refresh method not available; using existing cache`);
    return false;
  }

  async function refreshInventoryCaches(reason = 'manual refresh', options = {}) {
    await waitAppReady();
    const quiet = options.quiet === true;
    if (!quiet) log(`Refreshing caches: ${reason}`);

    if (options.includePacks !== false) {
      await refreshStorePacks().catch((e) => {
        if (!quiet) log(`Store pack refresh skipped: ${e.message || e}`);
      });
    }

    await refreshUnassigned({ quiet }).catch((e) => {
      if (!quiet) log(`Unassigned refresh skipped: ${e.message || e}`);
    });

    await refreshPileCacheByCandidates('club', W.ItemPile.CLUB, ['requestClubItems'], options);
    await refreshPileCacheByCandidates('storage', W.ItemPile.STORAGE, ['requestStorageItems', 'requestSBCStorageItems'], options);
    await refreshPileCacheByCandidates('transfer', W.ItemPile.TRANSFER, ['requestTransferItems'], options);

    if (!quiet) log(`Cache summary: ${cacheSummary()}`);
  }

  function getUnassignedItems() {
    try {
      return W.repositories.Item.getUnassignedItems() || [];
    } catch {
      return [];
    }
  }

  function getRepositoryMyPacks() {
    const repo = W.repositories?.Store?.myPacks || W.services?.Store?.storeDao?.storeRepo?.myPacks;
    if (!repo) return [];
    if (typeof repo.values === 'function') return Array.from(repo.values());
    if (Array.isArray(repo._collection)) return repo._collection;
    if (repo._collection && typeof repo._collection === 'object') return Object.values(repo._collection);
    return [];
  }

  function getMyPacks() {
    return uniquePacks([
      ...getRepositoryMyPacks(),
      ...(state.lastStorePacks || []),
    ]);
  }

  function packIdKey(packOrId) {
    const id = typeof packOrId === 'object'
      ? (packOrId?.id ?? packOrId?.packId ?? packOrId?.packDefinitionId ?? packOrId?.packAssetId)
      : packOrId;
    const numeric = Number(id);
    return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : '';
  }

  function isStalePack(pack) {
    try {
      const key = packIdKey(pack);
      return !!pack && (state.stalePackRefs.has(pack) || (key && state.stalePackIds.has(key)));
    } catch {
      return false;
    }
  }

  function markStalePack(pack) {
    try {
      if (pack && typeof pack === 'object') state.stalePackRefs.add(pack);
      const key = packIdKey(pack);
      if (key) state.stalePackIds.add(key);
    } catch { }
  }

  function clearStalePackId(packId) {
    const key = packIdKey(packId);
    if (key) state.stalePackIds.delete(key);
  }

  function getAvailableMyPacks() {
    return getMyPacks().filter((pack) => !isStalePack(pack));
  }

  function findPackByName(patterns) {
    const packs = getAvailableMyPacks();
    return packs.find((p) => matchesAny(packName(p), patterns));
  }

  function findPackById(packId) {
    if (!packId) return null;
    return getAvailableMyPacks().find((p) => packIdKey(p) === packIdKey(packId));
  }

  function isLikelyTotwRewardPack(pack) {
    const id = Number(packIdKey(pack) || 0);
    if ([20707, 20441].includes(id)) return true;
    const name = packName(pack);
    return /\bTOTW\b/i.test(name) &&
      /(84\+|1-30|player|pack|provision|refresh)/i.test(name);
  }

  function findPackByPredicate(predicate) {
    if (typeof predicate !== 'function') return null;
    return getAvailableMyPacks().find((pack) => {
      try { return !!predicate(pack); } catch { return false; }
    }) || null;
  }

  function summarizePacks(packs = getAvailableMyPacks()) {
    const counts = new Map();
    for (const pack of packs) {
      const key = `${packName(pack)} (#${packIdKey(pack) || pack.id || '?'})`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => `${name} x${count}`)
      .join(', ');
  }

  async function moveItems(items, pile, allowStorage = true) {
    if (!items?.length) return null;
    const result = await observeOnce(
      W.services.Item.move(items, pile, allowStorage),
      ctrl(),
      25000,
      `moveItems(${pile})`,
    );
    if (!result?.success) fail(`Move failed: ${result?.error?.code || result?.status || 'unknown'}`);
    await waitLoadingEnd();
    return result;
  }

  function isPlayer(item) {
    return item?.type === 'player' || item?.isPlayer?.();
  }

  function isBronze(item) {
    try { if (item?.isBronzeRating?.()) return true; } catch { }
    return Number(item?.rating || 0) > 0 && Number(item.rating) <= 64;
  }

  function isSilver(item) {
    try { if (item?.isSilverRating?.()) return true; } catch { }
    const rating = Number(item?.rating || 0);
    return rating >= 65 && rating <= 74;
  }

  function isGold(item) {
    try { if (item?.isGoldRating?.()) return true; } catch { }
    return Number(item?.rating || 0) >= 75;
  }

  function isProtectedHighGold(item) {
    return isGold(item) && Number(item?.rating || 0) >= 82;
  }

  function isRare(item) {
    try { return !!item?.isRare?.(); } catch { }
    return Number(item?.rareflag || item?.rareFlag || 0) > 0;
  }

  function isSpecial(item) {
    try { return !!item?.isSpecial?.(); } catch { }
    const rareflag = Number(item?.rareflag || item?.rareFlag || item?._rareflag || 0);
    return rareflag > 1;
  }

  function isNormalGoldFodder(item) {
    return isGold(item) && !isSbcSpecialItem(item);
  }

  function itemMatchesSpec(item, spec = {}, settings = getFsuSettings()) {
    if (spec.playerOnly && !isPlayer(item)) return false;
    const rating = Number(item?.rating || 0);
    if (spec.minRating !== undefined && rating < Number(spec.minRating)) return false;
    if (spec.maxRating !== undefined && rating > Number(spec.maxRating)) return false;
    if (spec.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) return false;
    if (spec.special === true && !isSpecial(item)) return false;
    if (spec.special === false && isSpecial(item)) return false;
    if (spec.special !== true && spec.allowSpecial !== true && isSpecial(item)) return false;
    if (settings.useRarityPlayer === false && spec.special !== true && spec.allowSpecial !== true && isSpecial(item)) return false;
    if (spec.tier === 'bronze' && !isBronze(item)) return false;
    if (spec.tier === 'silver' && !isSilver(item)) return false;
    if (spec.tier === 'gold' && !isGold(item)) return false;
    if (spec.rarity === 'rare' && !isRare(item)) return false;
    if (spec.rarity === 'common' && isRare(item)) return false;
    return true;
  }

  function isTargetDuplicate(item, loopDef) {
    const spec = loopDef?.targetDuplicate || {};
    return isDuplicate(item) && isSbcUsablePlayer(item, spec) && itemMatchesSpec(item, spec);
  }

  function isDuplicate(item) {
    try { return !!item?.isDuplicate?.(); } catch { return !!item?.duplicateId; }
  }

  function isTradeable(item) {
    try {
      if (typeof item?.isUntradeable === 'function') return !item.isUntradeable();
    } catch { }
    if (item?.untradeable === true) return false;
    if (item?.untradeable === false) return true;
    if (item?.untradeableCount !== undefined) return Number(item.untradeableCount || 0) === 0;
    return false;
  }

  function callItemBooleanMethod(item, methodNames = []) {
    for (const name of methodNames) {
      try {
        if (typeof item?.[name] === 'function' && item[name]()) return true;
      } catch { }
    }
    return false;
  }

  function itemFieldValues(item, keys = []) {
    const holders = [
      item,
      safeReadField(item, '_data'),
      safeReadField(item, '_staticData'),
      safeReadField(item, 'assetData'),
      safeReadField(item, '_assetData'),
    ];
    const values = [];
    for (const holder of holders) {
      if (!holder || typeof holder !== 'object') continue;
      for (const key of keys) values.push(safeReadField(holder, key));
    }
    return values;
  }

  function isLoanItem(item) {
    if (callItemBooleanMethod(item, ['isLoan', 'isLoanItem', 'isLoanPlayer'])) return true;
    const explicitLoanFlags = itemFieldValues(item, ['isLoan', 'isLoanItem', 'isLoanPlayer']);
    for (const value of explicitLoanFlags) {
      if (typeof value === 'function' || value === undefined || value === null || value === '') continue;
      const bool = boolFromAny(value);
      if (bool === true) return true;
    }
    for (const value of itemFieldValues(item, ['loans'])) {
      if (typeof value === 'function' || value === undefined || value === null || value === '') continue;
      const bool = boolFromAny(value);
      if (bool === true) return true;
      if (bool === false) continue;
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) return true;
    }
    return false;
  }

  function isLimitedUseItem(item) {
    if (isLoanItem(item)) return true;
    if (callItemBooleanMethod(item, ['isLimitedUse'])) return true;
    for (const value of itemFieldValues(item, ['limitedUse', 'isLimitedUse', 'limitedUses'])) {
      if (typeof value === 'function' || value === undefined || value === null || value === '') continue;
      const bool = boolFromAny(value);
      if (bool === true) return true;
      if (bool === false) continue;
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) return true;
    }
    return false;
  }

  function isConceptItem(item) {
    if (callItemBooleanMethod(item, ['isConcept', 'isConceptItem', 'isConceptPlayer'])) return true;
    for (const value of itemFieldValues(item, [
      'concept',
      'isConcept',
      'conceptItem',
      'conceptPlayer',
      'isConceptItem',
      'isConceptPlayer',
      'itemState',
      'state',
      'status',
      'cardType',
    ])) {
      if (typeof value === 'function' || value === undefined || value === null || value === '') continue;
      const bool = boolFromAny(value);
      if (bool === true) return true;
      if (bool === false) continue;
      if (typeof value === 'string' && /\bconcept\b/i.test(value)) return true;
    }
    return false;
  }

  function boolFromAny(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
    if (typeof value === 'string') {
      const text = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on', 'enabled', 'enable'].includes(text)) return true;
      if (['false', '0', 'no', 'off', 'disabled', 'disable'].includes(text)) return false;
    }
    return null;
  }

  const FSU_SETTING_ALIASES = {
    ignorePlayerPosition: [/ignore.*player.*position/i, /ignore.*position/i, /忽略.*位置/],
    onlyUntradeable: [/only.*untrad/i, /untrad.*only/i, /仅.*不可交易/, /只.*不可交易/],
    excludeDesignatedLeagues: [/exclude.*designated.*league/i, /exclude.*league/i, /排除.*联赛/, /排除.*聯賽/],
    useRarityPlayer: [/use.*rarity.*player/i, /rarity.*player/i, /使用.*稀有/, /使用.*特殊/],
    excludeEvolution: [/exclude.*evo/i, /exclude.*evolution/i, /排除.*进化/, /排除.*進化/],
    playerPickStrictCommonRare: [/player.*pick.*strict/i, /strictly.*common.*rare/i, /球员选择.*严格/, /球員選擇.*嚴格/],
    priorityRareWithinGoldRange: [/priority.*rare.*gold.*range/i, /rare.*within.*gold.*range/i, /golden.*player.*range/i, /稀有.*金/],
    priorityNonSpecialPlayers: [/priority.*non.*special/i, /non.*special.*player/i, /优先.*非.*特殊/, /優先.*非.*特殊/],
    priorityStoragePlayers: [/priority.*storage/i, /storage.*player/i, /优先.*仓库/, /優先.*倉庫/, /storage.*priority/i],
    silverBronzePrioritizeNormal: [/silver.*bronze.*normal/i, /quality.*prioritize.*normal/i, /银.*铜.*普通/, /銀.*銅.*普通/],
  };

  const ITEM_ID_FIELD_ALIASES = Object.freeze([
    'id',
    'itemId',
    'itemid',
    'itemID',
    'instanceId',
    'instanceid',
    'resourceId',
    'resourceid',
    'resourceID',
    'cardId',
    'cardid',
    'cardID',
    'playerId',
    'playerid',
    'playerID',
    'guidAssetId',
    'guidassetid',
    'guidAssetID',
  ]);

  const DEFINITION_ID_FIELD_ALIASES = Object.freeze([
    'definitionId',
    'definitionid',
    'definitionID',
    'defId',
    'defid',
    'defID',
    'assetId',
    'assetid',
    'assetID',
    '_assetId',
    '_assetid',
    '_assetID',
    'baseId',
    'baseid',
    'baseID',
    'baseResourceId',
    'baseResourceID',
    'resourceId',
    'resourceid',
    'resourceID',
    'guidAssetId',
    'guidassetid',
    'guidAssetID',
  ]);

  const ITEM_IDENTITY_FIELD_ALIASES = Object.freeze(
    [...new Set([...ITEM_ID_FIELD_ALIASES, ...DEFINITION_ID_FIELD_ALIASES])]
  );

  const ITEM_IDENTITY_HOLDER_FIELDS = Object.freeze([
    '_data',
    'data',
    '_staticData',
    'staticData',
    'assetData',
    '_assetData',
    '_item',
    'item',
    '_player',
    'player',
    'raw',
    'rawData',
    '_rawData',
  ]);

  function aliasMatches(path, aliases) {
    return aliases.some((pattern) => pattern.test(path));
  }

  function isInspectableObject(value) {
    if (!value || typeof value !== 'object') return false;
    if (value === W || value === document || value === document.body) return false;
    const tag = Object.prototype.toString.call(value);
    return tag === '[object Object]' || tag === '[object Array]';
  }

  function flattenConfigValues(value, path = '', rows = [], depth = 0, seen = new WeakSet()) {
    if (value === null || value === undefined || depth > 5) return rows;
    if (typeof value !== 'object') {
      rows.push({ path, value });
      return rows;
    }
    if (!isInspectableObject(value) || seen.has(value)) return rows;
    seen.add(value);

    const keys = Array.isArray(value) ? value.map((_, index) => String(index)) : Object.keys(value);
    for (const key of keys.slice(0, 250)) {
      let child;
      try { child = value[key]; } catch { continue; }
      const nextPath = path ? `${path}.${key}` : key;
      if (isInspectableObject(child)) {
        flattenConfigValues(child, nextPath, rows, depth + 1, seen);
      } else {
        rows.push({ path: nextPath, value: child });
      }
    }
    return rows;
  }

  function parseJsonMaybe(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text || !['{', '['].includes(text[0])) return null;
    try { return JSON.parse(text); } catch { return null; }
  }

  function numberListFromAny(value) {
    if (Array.isArray(value)) {
      return value
        .flatMap((entry) => numberListFromAny(entry))
        .filter((entry, index, arr) => Number.isFinite(entry) && arr.indexOf(entry) === index);
    }
    if (typeof value === 'number' && Number.isFinite(value)) return [Number(value)];
    if (typeof value === 'string') {
      return (value.match(/\d+/g) || []).map(Number).filter(Number.isFinite);
    }
    if (isInspectableObject(value)) {
      return flattenConfigValues(value)
        .flatMap((row) => numberListFromAny(row.value))
        .filter((entry, index, arr) => Number.isFinite(entry) && arr.indexOf(entry) === index);
    }
    return [];
  }

  function uniqueNumberList(values = []) {
    return values
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0)
      .filter((value, index, arr) => arr.indexOf(value) === index);
  }

  function isLikelyLockedPlayerPath(path = '') {
    const text = String(path || '');
    if (!text || /unlock/i.test(text)) return false;
    const compact = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/((lock|locked)players?|players?(lock|locked)|(lock|locked)cards?|cards?(lock|locked)|(lock|locked)items?|items?(lock|locked)|protectedplayers?|protectedcards?|protecteditems?)/i.test(compact)) {
      return true;
    }
    if (/(^|[._\-\s])(lock|locked|protect|protected)([._\-\s]|$)/i.test(text)) {
      return /player|card|item|resource|definition|asset|info[._\-\s]*lock|(^|[._\-\s])lock([._\-\s]|$)/i.test(text);
    }
    return false;
  }

  function isLikelyLockedIdValuePath(path = '', key = '') {
    const field = String(key || '').replace(/^_+/, '');
    if (/^\d+$/.test(field)) return true;
    if (/^(id|itemid|instanceid|resourceid|cardid|playerid|definitionid|defid|assetid|baseid|baseresourceid|guidassetid)$/i.test(field)) {
      return true;
    }
    return /(^|[._\-\s])(lock|locked|protect|protected)([._\-\s]|$)$/i.test(String(path || ''));
  }

  function addLockedPlayerValue(result, value, path = '', key = '') {
    const nums = numberListFromAny(value);
    if (!nums.length) return;
    const text = `${key || ''} ${path || ''}`;
    const definitionLike = /definition|defid|asset|base|resource|guid/i.test(text);
    const itemLike = !definitionLike || /(^|[^a-z])(id|item|instance|card|player)([^a-z]|$)/i.test(text);
    if (definitionLike) nums.forEach((num) => result.definitionIds.push(num));
    if (itemLike || /resource|guid/i.test(text)) nums.forEach((num) => result.itemIds.push(num));
  }

  function collectLockedPlayerIds(value, path = '', result = { itemIds: [], definitionIds: [], sources: [] }, depth = 0, seen = new WeakSet(), inLockContext = false) {
    if (value === null || value === undefined || depth > 6) return result;
    const lockContext = inLockContext || isLikelyLockedPlayerPath(path);
    if (!isInspectableObject(value)) {
      if (lockContext && isLikelyLockedIdValuePath(path)) {
        addLockedPlayerValue(result, value, path);
        if (!result.sources.includes(path)) result.sources.push(path);
      }
      return result;
    }
    if (seen.has(value)) return result;
    seen.add(value);

    const keys = Array.isArray(value) ? value.map((_, index) => String(index)) : Object.keys(value);
    for (const key of keys.slice(0, 250)) {
      let child;
      try { child = value[key]; } catch { continue; }
      const nextPath = path ? `${path}.${key}` : key;
      const childLockContext = lockContext || isLikelyLockedPlayerPath(nextPath);
      if (childLockContext && !isInspectableObject(child) && isLikelyLockedIdValuePath(nextPath, key)) {
        addLockedPlayerValue(result, child, nextPath, key);
        if (!result.sources.includes(nextPath)) result.sources.push(nextPath);
      } else if (childLockContext && isInspectableObject(child)) {
        ITEM_ID_FIELD_ALIASES.forEach((field) => {
          addLockedPlayerValue(result, safeReadField(child, field), nextPath, field);
        });
        DEFINITION_ID_FIELD_ALIASES.forEach((field) => {
          addLockedPlayerValue(result, safeReadField(child, field), nextPath, field);
        });
      }
      if (isInspectableObject(child)) {
        collectLockedPlayerIds(child, nextPath, result, depth + 1, seen, childLockContext);
      }
    }
    return result;
  }

  function normalizeLockedPlayerIds(raw, source = '') {
    const result = collectLockedPlayerIds(raw, source || 'lock');
    return {
      itemIds: uniqueNumberList(result.itemIds),
      definitionIds: uniqueNumberList(result.definitionIds),
      sources: [...new Set(result.sources || [])],
    };
  }

  function normalizeGoldRange(settings, rows) {
    const direct = numberListFromAny(settings.goldRange || settings.goldenRange || settings.goldRatingRange).slice(0, 2);
    if (direct.length === 2) return direct.sort((a, b) => a - b);
    if (direct.length === 1 && direct[0] >= 75 && direct[0] <= 99) return [75, direct[0]];

    let min = null;
    let max = null;
    for (const row of rows) {
      const path = row.path.toLowerCase();
      const value = Number(row.value);
      if (!Number.isFinite(value)) continue;
      if (/gold.*(min|from|start)|golden.*(min|from|start)/i.test(path)) min = value;
      if (/gold.*(max|to|end)|golden.*(max|to|end)/i.test(path)) max = value;
    }
    if (Number.isFinite(min) && Number.isFinite(max)) return [min, max].sort((a, b) => a - b);
    return FSU_COMPAT_DEFAULTS.goldRange;
  }

  function normalizeFsuSettings(raw = {}, source = 'manual') {
    const rows = flattenConfigValues(raw);
    const settings = { ...FSU_COMPAT_DEFAULTS, detected: true, source };
    let matched = false;

    for (const [field, aliases] of Object.entries(FSU_SETTING_ALIASES)) {
      const row = rows.find((entry) => aliasMatches(entry.path, aliases) && boolFromAny(entry.value) !== null);
      if (row) {
        settings[field] = boolFromAny(row.value);
        matched = true;
      }
    }

    const excludedLeagueRows = rows.filter((entry) =>
      /exclude|ignore|black|ban|designated|league|联赛|聯賽/i.test(entry.path) &&
      /league|联赛|聯賽/i.test(entry.path)
    );
    const excludedLeagueIds = excludedLeagueRows
      .flatMap((entry) => numberListFromAny(entry.value))
      .filter((entry, index, arr) => Number.isFinite(entry) && arr.indexOf(entry) === index);
    if (excludedLeagueIds.length) {
      settings.excludedLeagueIds = excludedLeagueIds;
      settings.excludeDesignatedLeagues = true;
      matched = true;
    }

    const lockedPlayers = normalizeLockedPlayerIds(raw, source);
    if (lockedPlayers.itemIds.length || lockedPlayers.definitionIds.length) {
      settings.lockedItemIds = lockedPlayers.itemIds;
      settings.lockedDefinitionIds = lockedPlayers.definitionIds;
      matched = true;
    }

    const explicitGoldRange = numberListFromAny(raw.goldRange || raw.goldenRange || raw.goldRatingRange);
    settings.goldRange = normalizeGoldRange(raw, rows);
    if (explicitGoldRange.length) matched = true;
    if (!matched) return null;
    return settings;
  }

  function likelyFsuStorageKey(key, value) {
    const text = String(key || '');
    return /fsu|enhancer|sbc.*(?:ignore|setting)|(?:ignore|rarity|untrad|league|evo|evolution|golden|player.*range).*settings?/i.test(text);
  }

  function mergeLockedPlayersIntoSettings(settings, locked, sourceLabel = '') {
    const base = settings || {
      ...FSU_COMPAT_DEFAULTS,
      excludedLeagueIds: [...FSU_COMPAT_DEFAULTS.excludedLeagueIds],
      goldRange: [...FSU_COMPAT_DEFAULTS.goldRange],
      lockedItemIds: [],
      lockedDefinitionIds: [],
    };
    if (!locked || (!locked.itemIds?.length && !locked.definitionIds?.length)) return base;
    base.lockedItemIds = uniqueNumberList([...(base.lockedItemIds || []), ...(locked.itemIds || [])]);
    base.lockedDefinitionIds = uniqueNumberList([...(base.lockedDefinitionIds || []), ...(locked.definitionIds || [])]);
    base.detected = true;
    if (sourceLabel) {
      base.source = base.source && base.source !== 'compat-defaults' ? `${base.source}+${sourceLabel}` : sourceLabel;
    }
    return base;
  }

  function readFsuSettingsFromStorage(storage, label) {
    if (!storage) return null;
    const exactKeys = [
      'sbcIgnorePlayerConfiguration',
      'sbcIgnorePlayerConfig',
      'sbc_ignore_player_configuration',
      'sbcIgnorePlayers',
      'sbcSettings',
      'fsuSbcSettings',
      'fsuSettings',
      'enhancerSettings',
      'fcEnhancerSettings',
    ];

    for (const key of exactKeys) {
      let value = null;
      try { value = storage.getItem(key); } catch { }
      if (value === null || value === undefined) continue;
      const parsed = parseJsonMaybe(value);
      const settings = normalizeFsuSettings(parsed || { [key]: value }, `${label}:${key}`);
      if (settings) return settings;
    }

    let length = 0;
    try { length = Number(storage.length || 0); } catch { }
    for (let index = 0; index < Math.min(length, 250); index++) {
      let key = '';
      let value = null;
      try {
        key = storage.key(index);
        value = storage.getItem(key);
      } catch { continue; }
      if (!key || !likelyFsuStorageKey(key, value)) continue;
      const parsed = parseJsonMaybe(value);
      const settings = normalizeFsuSettings(parsed || { [key]: value }, `${label}:${key}`);
      if (settings) return settings;
    }
    return null;
  }

  function fsuInfoBoolean(build, key, fallback) {
    const value = boolFromAny(safeReadField(build, key));
    return value === null ? fallback : value;
  }

  function readFsuSettingsFromInfo() {
    let info;
    try { info = W.info; } catch { info = null; }
    const build = info?.build;
    if (!isInspectableObject(build)) return null;

    const knownBuildKeys = [
      'ignorepos',
      'untradeable',
      'league',
      'flag',
      'academy',
      'strictlypcik',
      'comprange',
      'comprare',
      'firststorage',
      'sbfirstcommon',
    ];
    if (!knownBuildKeys.some((key) => safeReadField(build, key) !== undefined)) return null;

    const set = isInspectableObject(info?.set) ? info.set : {};
    const rawGoldenMax = Number(safeReadField(set, 'goldenrange'));
    const goldenMax = Number.isFinite(rawGoldenMax) && rawGoldenMax >= 75 && rawGoldenMax <= 99
      ? rawGoldenMax
      : FSU_COMPAT_DEFAULTS.goldRange[1];

    return {
      ...FSU_COMPAT_DEFAULTS,
      ignorePlayerPosition: fsuInfoBoolean(build, 'ignorepos', FSU_COMPAT_DEFAULTS.ignorePlayerPosition),
      onlyUntradeable: fsuInfoBoolean(build, 'untradeable', FSU_COMPAT_DEFAULTS.onlyUntradeable),
      excludeDesignatedLeagues: fsuInfoBoolean(build, 'league', FSU_COMPAT_DEFAULTS.excludeDesignatedLeagues),
      excludedLeagueIds: uniqueNumberList(numberListFromAny(safeReadField(set, 'shield_league'))),
      useRarityPlayer: fsuInfoBoolean(build, 'flag', FSU_COMPAT_DEFAULTS.useRarityPlayer),
      excludeEvolution: fsuInfoBoolean(build, 'academy', FSU_COMPAT_DEFAULTS.excludeEvolution),
      playerPickStrictCommonRare: fsuInfoBoolean(build, 'strictlypcik', FSU_COMPAT_DEFAULTS.playerPickStrictCommonRare),
      priorityRareWithinGoldRange: fsuInfoBoolean(build, 'comprange', FSU_COMPAT_DEFAULTS.priorityRareWithinGoldRange),
      priorityNonSpecialPlayers: fsuInfoBoolean(build, 'comprare', FSU_COMPAT_DEFAULTS.priorityNonSpecialPlayers),
      priorityStoragePlayers: fsuInfoBoolean(build, 'firststorage', FSU_COMPAT_DEFAULTS.priorityStoragePlayers),
      silverBronzePrioritizeNormal: fsuInfoBoolean(build, 'sbfirstcommon', FSU_COMPAT_DEFAULTS.silverBronzePrioritizeNormal),
      goldRange: [75, goldenMax],
      detected: true,
      source: 'window.info.build/set',
    };
  }

  function readFsuSettingsFromWindow() {
    const infoSettings = readFsuSettingsFromInfo();
    if (infoSettings) return infoSettings;

    const roots = [];
    const rootNames = [
      'FSU',
      'fsu',
      'FUTEnhancer',
      'FCEnhancer',
      'Enhancer',
      'enhancer',
      '__FSU',
      '__FUTEnhancer',
      '__FCEnhancer',
    ];
    for (const name of rootNames) {
      try {
        if (isInspectableObject(W[name])) roots.push([name, W[name]]);
      } catch { }
    }
    try {
      Object.keys(W)
        .filter((key) => /fsu|enhancer/i.test(key))
        .slice(0, 40)
        .forEach((key) => {
          try {
            if (isInspectableObject(W[key])) roots.push([key, W[key]]);
          } catch { }
        });
    } catch { }

    const seen = new WeakSet();
    for (const [name, root] of roots) {
      if (seen.has(root)) continue;
      seen.add(root);
      const settings = normalizeFsuSettings(root, `window.${name}`);
      if (settings) return settings;
    }
    return null;
  }

  function readFsuLockedPlayersFromWindow() {
    const known = [
      ['window.info.lock', () => W.info?.lock],
      ['window.info.lockedPlayers', () => W.info?.lockedPlayers],
      ['window.info.lockPlayers', () => W.info?.lockPlayers],
      ['window.info.playerLock', () => W.info?.playerLock],
      ['window.info.protectedPlayers', () => W.info?.protectedPlayers],
      ['window.state.page.info.lock', () => W.state?.page?.info?.lock],
    ];
    const combined = { itemIds: [], definitionIds: [], sources: [] };
    for (const [path, getter] of known) {
      let value;
      try { value = getter(); } catch { value = null; }
      const locked = normalizeLockedPlayerIds(value, path);
      combined.itemIds.push(...locked.itemIds);
      combined.definitionIds.push(...locked.definitionIds);
      combined.sources.push(...locked.sources);
    }

    const rootNames = ['FSU', 'fsu', 'FUTEnhancer', 'FCEnhancer', 'Enhancer', 'enhancer', '__FSU', '__FUTEnhancer', '__FCEnhancer'];
    for (const name of rootNames) {
      try {
        if (!isInspectableObject(W[name])) continue;
        const locked = normalizeLockedPlayerIds(W[name], `window.${name}`);
        combined.itemIds.push(...locked.itemIds);
        combined.definitionIds.push(...locked.definitionIds);
        combined.sources.push(...locked.sources);
      } catch { }
    }

    return {
      itemIds: uniqueNumberList(combined.itemIds),
      definitionIds: uniqueNumberList(combined.definitionIds),
      sources: [...new Set(combined.sources)].slice(0, 8),
    };
  }

  function readFsuLockedPlayersFromStorage(storage, label) {
    const combined = { itemIds: [], definitionIds: [], sources: [] };
    if (!storage) return combined;
    let length = 0;
    try { length = Number(storage.length || 0); } catch { }
    for (let index = 0; index < Math.min(length, 250); index++) {
      let key = '';
      let value = null;
      try {
        key = storage.key(index);
        value = storage.getItem(key);
      } catch { continue; }
      if (!key || !isLikelyLockedPlayerPath(key)) continue;
      const parsed = parseJsonMaybe(value);
      const locked = normalizeLockedPlayerIds(parsed || { [key]: value }, `${label}:${key}`);
      combined.itemIds.push(...locked.itemIds);
      combined.definitionIds.push(...locked.definitionIds);
      combined.sources.push(...locked.sources);
    }
    return {
      itemIds: uniqueNumberList(combined.itemIds),
      definitionIds: uniqueNumberList(combined.definitionIds),
      sources: [...new Set(combined.sources)].slice(0, 8),
    };
  }

  function readFsuLockedPlayers() {
    const windowLocked = readFsuLockedPlayersFromWindow();
    const localLocked = readFsuLockedPlayersFromStorage(window.localStorage, 'localStorage');
    const sessionLocked = readFsuLockedPlayersFromStorage(window.sessionStorage, 'sessionStorage');
    return {
      itemIds: uniqueNumberList([...(windowLocked.itemIds || []), ...(localLocked.itemIds || []), ...(sessionLocked.itemIds || [])]),
      definitionIds: uniqueNumberList([...(windowLocked.definitionIds || []), ...(localLocked.definitionIds || []), ...(sessionLocked.definitionIds || [])]),
      sources: [...new Set([...(windowLocked.sources || []), ...(localLocked.sources || []), ...(sessionLocked.sources || [])])].slice(0, 8),
    };
  }

  function detectFsuSettings() {
    const settings = state.fsuSettingsOverride ||
      readFsuSettingsFromWindow() ||
      readFsuSettingsFromStorage(window.localStorage, 'localStorage') ||
      readFsuSettingsFromStorage(window.sessionStorage, 'sessionStorage') ||
      { ...FSU_COMPAT_DEFAULTS, excludedLeagueIds: [...FSU_COMPAT_DEFAULTS.excludedLeagueIds], goldRange: [...FSU_COMPAT_DEFAULTS.goldRange] };
    const locked = readFsuLockedPlayers();
    return mergeLockedPlayersIntoSettings(settings, locked, locked.itemIds.length || locked.definitionIds.length ? 'locked-players' : '');
  }

  function getFsuSettings(options = {}) {
    const nowMs = Date.now();
    if (!options.force && state.fsuSettingsCache.settings && nowMs - state.fsuSettingsCache.at < 2000) {
      return state.fsuSettingsCache.settings;
    }
    const settings = detectFsuSettings();
    state.fsuSettingsCache = { at: nowMs, settings };
    return settings;
  }

  function setFsuSettingsOverride(settings) {
    state.fsuSettingsOverride = settings ? normalizeFsuSettings(settings, 'manual-override') : null;
    state.fsuSettingsCache = { at: 0, settings: null };
    return getFsuSettings({ force: true });
  }

  function clearFsuSettingsOverride() {
    state.fsuSettingsOverride = null;
    state.fsuSettingsCache = { at: 0, settings: null };
    return getFsuSettings({ force: true });
  }

  function onOff(value) {
    return value ? 'on' : 'off';
  }

  function formatFsuSettings(settings = getFsuSettings()) {
    const leagueText = settings.excludedLeagueIds?.length ? settings.excludedLeagueIds.join('/') : 'none';
    const range = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
    const lockedCount = uniqueNumberList([...(settings.lockedItemIds || []), ...(settings.lockedDefinitionIds || [])]).length;
    return [
      `source:${settings.source}${settings.detected ? '' : ' (compat defaults)'}`,
      `onlyUntradeable:${onOff(settings.onlyUntradeable)}`,
      `excludeLeagues:${onOff(settings.excludeDesignatedLeagues)} ids:${leagueText}`,
      `useRarity:${onOff(settings.useRarityPlayer)}`,
      `excludeEvo:${onOff(settings.excludeEvolution)}`,
      `rareGoldRange:${onOff(settings.priorityRareWithinGoldRange)} ${range[0]}-${range[1]}`,
      `nonSpecialFirst:${onOff(settings.priorityNonSpecialPlayers)}`,
      `storageFirst:${onOff(settings.priorityStoragePlayers)}`,
      `silverBronzeNormal:${onOff(settings.silverBronzePrioritizeNormal)}`,
      'normalGoldPolicy:follow-fsu',
      `locked:${lockedCount}`,
    ].join('; ');
  }

  function logFsuSettingsForRun() {
    log(`FSU settings sync: ${formatFsuSettings(getFsuSettings({ force: true }))}`);
  }

  function safeReadField(holder, key) {
    try {
      return holder?.[key];
    } catch {
      return undefined;
    }
  }

  function itemIdentityHolders(item) {
    const holders = [
      item,
      ...ITEM_IDENTITY_HOLDER_FIELDS.map((field) => safeReadField(item, field)),
    ];
    const seen = new Set();
    return holders.filter((holder) => {
      if (!holder || typeof holder !== 'object' || seen.has(holder)) return false;
      seen.add(holder);
      return true;
    });
  }

  function itemLeagueId(item) {
    const data = safeReadField(item, '_data');
    const staticData = safeReadField(item, '_staticData');
    const assetData = safeReadField(item, 'assetData');
    const values = [
      safeReadField(item, 'leagueId'),
      safeReadField(item, 'league'),
      safeReadField(item, '_leagueId'),
      safeReadField(data, 'leagueId'),
      safeReadField(staticData, 'leagueId'),
      safeReadField(assetData, 'leagueId'),
    ];
    for (const value of values) {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return 0;
  }

  function itemIdentifierNumbers(item, keys = []) {
    const fields = Array.isArray(keys) && keys.length ? keys : ITEM_IDENTITY_FIELD_ALIASES;
    return uniqueNumberList(itemIdentityHolders(item).flatMap((holder) =>
      fields.flatMap((field) => numberListFromAny(safeReadField(holder, field)))
    ));
  }

  function isFsuLockedItem(item, settings = getFsuSettings()) {
    const lockedItemIds = new Set((settings.lockedItemIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
    const lockedDefinitionIds = new Set((settings.lockedDefinitionIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
    if (!lockedItemIds.size && !lockedDefinitionIds.size) return false;

    const itemIds = itemIdentifierNumbers(item, ITEM_ID_FIELD_ALIASES);
    const definitionIds = itemIdentifierNumbers(item, DEFINITION_ID_FIELD_ALIASES);
    if (itemIds.some((id) => lockedItemIds.has(id))) return true;
    if (definitionIds.some((id) => lockedDefinitionIds.has(id))) return true;

    const allIds = uniqueNumberList([
      ...itemIds,
      ...definitionIds,
      ...itemIdentifierNumbers(item, ITEM_IDENTITY_FIELD_ALIASES),
    ]);
    return allIds.some((id) => lockedItemIds.has(id) || lockedDefinitionIds.has(id));
  }

  function isEvolutionItem(item) {
    try { if (item?.isEvolution?.()) return true; } catch { }
    try { if (item?.isEvo?.()) return true; } catch { }
    const values = [
      item?.isEvolution,
      item?.isEvo,
      item?.evolutionId,
      item?.evoId,
      item?.evolutionLevel,
      item?.evolutionStatus,
      item?._data?.evolutionId,
      item?._staticData?.evolutionId,
    ];
    return values.some((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return Number.isFinite(value) && value > 0;
      if (typeof value === 'string') return value.trim() && value !== '0' && value !== '-1' && value.toLowerCase() !== 'false';
      if (isInspectableObject(value)) return Object.keys(value).length > 0;
      return false;
    });
  }

  function getFsuRejectReasons(item, spec = {}, settings = getFsuSettings()) {
    const reasons = [];
    if (!isPlayer(item)) return reasons;
    if (isFsuLockedItem(item, settings)) reasons.push('fsu-locked-player');
    if (settings.onlyUntradeable && isTradeable(item)) reasons.push('fsu-only-untradeable');
    if (settings.excludeEvolution && isEvolutionItem(item)) reasons.push('fsu-exclude-evolution');
    const excludedLeagueIds = (settings.excludedLeagueIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0);
    if (settings.excludeDesignatedLeagues && excludedLeagueIds.length) {
      const leagueId = itemLeagueId(item);
      if (leagueId && excludedLeagueIds.includes(leagueId)) {
        reasons.push(`fsu-excluded-league-${leagueId}`);
      }
    }
    if (isNormalGoldFodder(item)) {
      const range = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
      const minRating = Number(range[0] || 75);
      const maxRating = Number(range[1] || 83);
      const rating = Number(item?.rating || 0);
      if (rating < minRating || rating > maxRating) {
        reasons.push(`fsu-gold-range-${minRating}-${maxRating}`);
      }
    }
    if (
      settings.useRarityPlayer === false &&
      spec.special !== true &&
      spec.allowSpecial !== true &&
      isSpecial(item)
    ) {
      reasons.push('fsu-rarity-player-off');
    }
    return reasons;
  }

  function applyFsuPilePriority(piles = [], settings = getFsuSettings()) {
    if (!settings.priorityStoragePlayers || !Array.isArray(piles) || !piles.includes('storage')) return piles;
    const pinned = piles[0] === 'unassigned' ? ['unassigned'] : [];
    const rest = piles.filter((pile) => !pinned.includes(pile) && pile !== 'storage');
    return [...pinned, 'storage', ...rest];
  }

  function isInGoldPriorityRange(item, settings = getFsuSettings()) {
    const range = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
    const rating = Number(item?.rating || 0);
    return isGold(item) && rating >= Number(range[0] || 75) && rating <= Number(range[1] || 83);
  }

  function collectionValues(collection) {
    if (!collection) return [];
    if (typeof collection.values === 'function') return Array.from(collection.values());
    if (Array.isArray(collection._collection)) return collection._collection;
    if (collection._collection && typeof collection._collection === 'object') return Object.values(collection._collection);
    if (typeof collection === 'object') return Object.values(collection);
    return [];
  }

  function getClubItems() {
    return collectionValues(W.repositories?.Item?.club?.items)
      .concat(collectionValues(W.services?.Item?.itemDao?.itemRepo?.club?.items));
  }

  function uniqueItems(items) {
    const seen = new Set();
    const result = [];
    for (const item of items || []) {
      const id = Number(item?.id || 0);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(item);
    }
    return result;
  }

  function getStorageItems() {
    try {
      if (typeof W.repositories?.Item?.getStorageItems === 'function') {
        return Array.from(W.repositories.Item.getStorageItems() || []);
      }
    } catch { }
    try {
      if (typeof W.repositories?.Item?.getStorage === 'function') {
        return collectionValues(W.repositories.Item.getStorage());
      }
    } catch { }
    return collectionValues(W.repositories?.Item?.storage);
  }

  function getTransferItems() {
    try {
      if (typeof W.repositories?.Item?.getTransferItems === 'function') {
        return Array.from(W.repositories.Item.getTransferItems() || []);
      }
    } catch { }
    return collectionValues(W.repositories?.Item?.transfer);
  }

  function getPileItemsByName(pileName) {
    if (pileName === 'unassigned') return uniqueItems(getUnassignedItems());
    if (pileName === 'storage') return uniqueItems(getStorageItems());
    if (pileName === 'transfer') return uniqueItems(getTransferItems());
    if (pileName === 'club') return uniqueItems(getClubItems());
    return [];
  }

  function findCachedItemById(itemId, pileNames = ['storage', 'club', 'unassigned', 'transfer']) {
    const targetId = Number(itemId || 0);
    if (!targetId) return null;
    for (const pileName of pileNames) {
      const item = getPileItemsByName(pileName).find((entry) => Number(entry?.id || 0) === targetId);
      if (item) return { item, pileName };
    }
    return null;
  }

  function resolveRecentRewardItems(label = 'recent reward item resolution') {
    if (!state.recentRewardItems?.length) return 0;

    let resolved = 0;
    const seen = new Set();
    state.recentRewardItems = state.recentRewardItems.map((item) => {
      const id = Number(item?.id || 0);
      if (!id) return item;
      const live = findCachedItemById(id);
      if (!live || live.item === item) return item;
      resolved++;
      if (!seen.has(id)) {
        log(`${label}: resolved recent reward item ${itemDisplayName(item)} rating:${Number(item?.rating || 0) || '?'} id:${id} to ${live.pileName}`);
        seen.add(id);
      }
      return live.item;
    });
    return resolved;
  }

  function makeLengthSafeMetadataValue(value) {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value) || typeof value === 'function') return value;
    if (typeof value === 'string') return value.trim() ? [value] : [];
    if (typeof value === 'number' || typeof value === 'boolean') return [value];
    if (typeof value === 'object' && value.length === undefined) return Object.keys(value).length ? [value] : [];
    return value;
  }

  function patchLengthSafeMetadataField(holder, key) {
    if (!holder || typeof holder !== 'object') return false;
    let current;
    try {
      current = holder[key];
    } catch {
      return false;
    }
    const next = makeLengthSafeMetadataValue(current);
    if (next === current) return false;
    try {
      holder[key] = next;
      return true;
    } catch {
      return false;
    }
  }

  function patchFsuLengthSafePlayerMetadata(reason = 'before FSU player scan') {
    const targetIds = new Set([
      ...Array.from(state.assumedTotwItemIds || []),
      ...(state.recentRewardItems || []).map((item) => Number(item?.id || 0)),
    ].filter((id) => id && !state.consumedItemIds.has(id)));
    if (!targetIds.size) return;

    const items = uniqueItems([
      ...(state.recentRewardItems || []),
      ...getPileItemsByName('unassigned'),
      ...getPileItemsByName('storage'),
      ...getPileItemsByName('transfer'),
      ...getPileItemsByName('club'),
    ]);
    const keys = ['league', 'leagues', 'leagueIds', 'club', 'clubs', 'clubIds', 'nation', 'nations', 'nationIds'];
    let patchedItems = 0;
    let patchedFields = 0;

    for (const item of items) {
      if (!isPlayer(item)) continue;
      if (!targetIds.has(Number(item?.id || 0))) continue;
      let itemPatched = false;
      const holders = [item, item?._data, item?._staticData, item?.assetData, item?._assetData];
      for (const holder of holders) {
        for (const key of keys) {
          if (patchLengthSafeMetadataField(holder, key)) {
            itemPatched = true;
            patchedFields++;
          }
        }
      }
      if (itemPatched) patchedItems++;
    }

    if (patchedItems) {
      log(`FSU metadata compatibility patch (${reason}): ${patchedItems} player item(s), ${patchedFields} field(s)`);
    }
  }

  function isInactiveTrade(item) {
    try {
      const auction = item?.getAuctionData?.() || item?._auction;
      if (!auction) return true;
      if (typeof auction.isActiveTrade === 'function' && auction.isActiveTrade()) return false;
      if (typeof auction.isClosedTrade === 'function' && auction.isClosedTrade()) return false;
      return true;
    } catch {
      return true;
    }
  }

  function isSbcUsablePlayer(item, options = {}) {
    if (!isPlayer(item)) return false;
    const id = Number(item?.id || 0);
    if (id && state.consumedItemIds.has(id)) return false;
    if (options.protectHighGold && isProtectedHighGold(item)) return false;
    if (isConceptItem(item)) return false;
    try { if (item?.isEnrolledInAcademy?.()) return false; } catch { }
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) return false;
    if (!isInactiveTrade(item)) return false;
    if (getFsuRejectReasons(item, options).length) return false;
    return true;
  }

  function findClubDuplicate(item) {
    const duplicateId = Number(item?.duplicateId || 0);
    const clubItems = getClubItems();
    if (duplicateId) {
      const byId = clubItems.find((clubItem) => Number(clubItem?.id) === duplicateId);
      if (byId) return byId;
    }
    return clubItems.find((clubItem) =>
      Number(clubItem?.definitionId || 0) === Number(item?.definitionId || -1) &&
      Number(clubItem?.id || 0) !== Number(item?.id || 0)
    );
  }

  function pileSpaceLeft(pile, fallbackMax = null) {
    try {
      const size = Number(W.repositories.Item.getPileSize(pile));
      const used = Number(W.repositories.Item.numItemsInCache(pile));
      if (Number.isFinite(size) && Number.isFinite(used)) return size - used;
    } catch { }
    if (fallbackMax !== null) {
      try {
        return fallbackMax - W.repositories.Item.numItemsInCache(pile);
      } catch { }
    }
    return null;
  }

  function storageSpaceLeft() {
    return pileSpaceLeft(W.ItemPile.STORAGE, CFG.storageMax);
  }

  function transferSpaceLeft() {
    return pileSpaceLeft(W.ItemPile.TRANSFER, null);
  }

  function assertPileSpace(pileName, available, needed) {
    if (available !== null && needed > available) {
      fail(`${pileName} has only ${available} slot(s), but ${needed} item(s) need moving`);
    }
  }

  async function clearUnassigned(reason = 'cleanup', options = {}) {
    await refreshUnassigned();

    for (let pass = 1; pass <= 6; pass++) {
      stopPoint();
      const allItems = getUnassignedItems();
      const reserved = options.reserveItem ? allItems.filter(options.reserveItem) : [];
      const items = options.reserveItem ? allItems.filter((item) => !options.reserveItem(item)) : allItems;
      if (!items.length) {
        if (pass > 1 || reserved.length) {
          log(`Unassigned cleanup complete: ${reason}${reserved.length ? `; reserved ${reserved.length} item(s)` : ''}`);
        }
        return;
      }

      if (pass === 1) {
        log(`Unassigned cleanup before ${reason}: ${items.length} item(s)${reserved.length ? `, reserved ${reserved.length}` : ''}`);
      }

      const nonDuplicates = items.filter((item) => !isDuplicate(item));
      if (nonDuplicates.length) {
        log(`Moving ${nonDuplicates.length} non-duplicate unassigned item(s) to club`);
        await moveItems(nonDuplicates, W.ItemPile.CLUB, true);
        await refreshUnassigned();
        continue;
      }

      const tradeableDuplicates = items.filter((item) => isDuplicate(item) && isTradeable(item));
      if (tradeableDuplicates.length) {
        const space = transferSpaceLeft();
        assertPileSpace('Transfer list', space, tradeableDuplicates.length);
        log(`Moving ${tradeableDuplicates.length} tradeable duplicate(s) to transfer list`);
        await moveItems(tradeableDuplicates, W.ItemPile.TRANSFER, false);
        await refreshUnassigned();
        continue;
      }

      const untradeableDuplicates = items.filter((item) => isDuplicate(item) && !isTradeable(item));
      const swappable = untradeableDuplicates.filter((item) => {
        const clubDuplicate = findClubDuplicate(item);
        return clubDuplicate && isTradeable(clubDuplicate);
      });

      if (swappable.length) {
        const space = transferSpaceLeft();
        assertPileSpace('Transfer list', space, swappable.length);
        log(`Swapping ${swappable.length} untradeable duplicate(s) with tradeable club version(s)`);
        await moveItems(swappable, W.ItemPile.CLUB, true);
        await refreshUnassigned();
        continue;
      }

      if (untradeableDuplicates.length) {
        const space = storageSpaceLeft();
        assertPileSpace('SBC storage', space, untradeableDuplicates.length);
        log(`Moving ${untradeableDuplicates.length} untradeable duplicate(s) to SBC storage`);
        await moveItems(untradeableDuplicates, W.ItemPile.STORAGE, true);
        await refreshUnassigned();
        continue;
      }

      fail(`Unassigned cleanup cannot classify ${items.length} item(s); stop for manual inspection`);
    }

    const remaining = getUnassignedItems().length;
    fail(`Unassigned cleanup did not converge; ${remaining} item(s) remain`);
  }

  async function tryMoveOpenedRewardItems(items, pile, allowStorage, label, description) {
    if (!items?.length) return 0;
    try {
      log(`${label}: moving ${items.length} ${description} opened reward item(s)`);
      await moveItems(items, pile, allowStorage);
      return items.length;
    } catch (e) {
      log(`${label}: direct ${description} reward move skipped: ${e.message || e}`);
      return 0;
    }
  }

  async function materializeOpenedPlayerRewards(items, label = 'opened reward pack') {
    const players = uniqueItems((items || []).filter((item) => isPlayer(item)));
    if (!players.length) return 0;

    let moved = 0;
    const movedIds = new Set();
    const markMoved = (list) => list.forEach((item) => movedIds.add(Number(item?.id || 0)));

    const nonDuplicates = players.filter((item) => !isDuplicate(item));
    const movedNonDuplicates = await tryMoveOpenedRewardItems(nonDuplicates, W.ItemPile.CLUB, true, label, 'non-duplicate');
    if (movedNonDuplicates) {
      moved += movedNonDuplicates;
      markMoved(nonDuplicates);
    }

    const remainingDuplicates = players.filter((item) => !movedIds.has(Number(item?.id || 0)) && isDuplicate(item));
    const tradeableDuplicates = remainingDuplicates.filter((item) => isTradeable(item));
    if (tradeableDuplicates.length) {
      try {
        assertPileSpace('Transfer list', transferSpaceLeft(), tradeableDuplicates.length);
        const count = await tryMoveOpenedRewardItems(tradeableDuplicates, W.ItemPile.TRANSFER, false, label, 'tradeable duplicate');
        if (count) {
          moved += count;
          markMoved(tradeableDuplicates);
        }
      } catch (e) {
        log(`${label}: direct tradeable duplicate reward move skipped: ${e.message || e}`);
      }
    }

    const untradeableDuplicates = players.filter((item) =>
      !movedIds.has(Number(item?.id || 0)) && isDuplicate(item) && !isTradeable(item)
    );
    const swappable = untradeableDuplicates.filter((item) => {
      const clubDuplicate = findClubDuplicate(item);
      return clubDuplicate && isTradeable(clubDuplicate);
    });
    const storageDuplicates = untradeableDuplicates.filter((item) => !swappable.includes(item));

    const swappedCount = await tryMoveOpenedRewardItems(swappable, W.ItemPile.CLUB, true, label, 'swappable duplicate');
    if (swappedCount) {
      moved += swappedCount;
      markMoved(swappable);
    }

    if (storageDuplicates.length) {
      try {
        assertPileSpace('SBC storage', storageSpaceLeft(), storageDuplicates.length);
        const count = await tryMoveOpenedRewardItems(storageDuplicates, W.ItemPile.STORAGE, true, label, 'untradeable duplicate');
        if (count) moved += count;
      } catch (e) {
        log(`${label}: direct untradeable duplicate reward move skipped: ${e.message || e}`);
      }
    }

    if (moved) {
      await refreshInventoryCaches(`${label} direct reward move`, { includePacks: false, quiet: true });
      resolveRecentRewardItems(`${label} direct reward move`);
    }
    return moved;
  }

  async function handleSilverRewardItems(items) {
    log(`Handling ${items?.length || 0} reward item(s) with unassigned cleanup strategy`);
    await clearUnassigned('reward item handling');
  }

  async function openPack(pack, purpose, options = {}) {
    if (!pack) fail(`Pack not found for ${purpose}`);
    await clearUnassigned(`opening ${purpose}`);
    const name = packName(pack);
    log(`Opening pack: ${name} (#${pack.id})`);
    const result = await observeOnce(pack.open(), ctrl(), 30000, `open ${name}`);
    if (!result?.success || !result?.response?.items) {
      const code = result?.error?.code || result?.status || 'unknown';
      if (options.allowGone && String(code) === '404') {
        markStalePack(pack);
        log(`Skipping stale pack for ${purpose}: ${name} (#${pack.id}) returned 404`);
        await waitLoadingEnd().catch(() => null);
        await refreshStorePacks().catch(() => null);
        return null;
      }
      fail(`Open pack failed: ${code}`);
    }
    await waitLoadingEnd();
    return result.response.items || [];
  }

  async function openSourceBronzePack() {
    await refreshStorePacks();
    const pack =
      CFG.sourcePackIds.map((id) => findPackById(id)).find(Boolean) ||
      findPackByName(CFG.sourcePackNames);
    if (!pack) {
      const names = summarizePacks();
      fail(`Source pack not found. Current my packs: ${names || 'none'}`);
    }

    const openedItems = await openPack(pack, 'source bronze pack');
    const bronzeDuplicates = openedItems.filter((p) => isPlayer(p) && isBronze(p) && isDuplicate(p));
    const directClub = openedItems.filter((p) => !bronzeDuplicates.includes(p) && (!isPlayer(p) || !isDuplicate(p)));

    if (directClub.length) {
      log(`Moving ${directClub.length} non-duplicate source item(s) to club`);
      await moveItems(directClub, W.ItemPile.CLUB, true);
    }

    if (bronzeDuplicates.length) {
      log(`${bronzeDuplicates.length} bronze duplicate(s) left for Bronze Upgrade`);
    } else {
      log('No bronze duplicate in this source pack; Bronze Upgrade may use club bronze players if FSU completion is enabled');
    }

    return { openedItems, bronzeDuplicates };
  }

  async function ensureSbcSetsLoaded() {
    const sets = W.services?.SBC?.repository?.sets?._collection || {};
    if (Object.keys(sets).length) return;
    const result = await observeOnce(W.services.SBC.requestSets(), ctrl(), 30000, 'SBC.requestSets');
    if (!result?.success) fail(`SBC set request failed: ${result?.error?.code || result?.status || 'unknown'}`);
  }

  function getSbcSets() {
    const coll = W.services?.SBC?.repository?.sets?._collection || {};
    return Array.isArray(coll) ? coll : Object.values(coll);
  }

  async function findSbcSet(names, label = 'SBC') {
    await ensureSbcSetsLoaded();
    const set = getSbcSets().find((s) => matchesAny(s?.name, names));
    if (!set) {
      const names = getSbcSets().map((s) => `${s?.name || '?'} (#${s?.id})`).slice(0, 80).join(', ');
      fail(`${label} SBC not found. First loaded SBCs: ${names}`);
    }
    return set;
  }

  async function findBronzeUpgradeSet() {
    return findSbcSet(CFG.bronzeUpgradeNames, 'Bronze Upgrade');
  }

  function navController() {
    const c = ctrl();
    return c?.getNavigationController?.() || c?.navigationController || null;
  }

  function isCompletedChallenge(challenge) {
    const status = String(challenge?.status || challenge?.state || '').toUpperCase();
    return status === 'COMPLETED' || status === 'COMPLETE' || challenge?.completed === true;
  }

  async function requestSbcChallenges(set, label = set?.name || 'SBC') {
    const controller = ctrl();
    const result = await observeOnce(
      W.services.SBC.requestChallengesForSet(set),
      controller,
      30000,
      `requestChallengesForSet ${label}`,
    );
    if (!result?.success || !result?.data?.challenges?.length) {
      fail(`No challenge loaded for ${label}`);
    }
    return result.data.challenges;
  }

  async function findAvailableSbcChallenge(set, label = set?.name || 'SBC') {
    const challenges = await requestSbcChallenges(set, label);
    return challenges.find((c) => !isCompletedChallenge(c)) || null;
  }

  async function openSbcSet(set, options = {}) {
    const challenge = await findAvailableSbcChallenge(set, set.name);
    if (!challenge) {
      if (options.returnNullIfComplete) return null;
      fail(`No available challenge for ${set.name}`);
    }

    const controller = ctrl();
    const load = await observeOnce(
      W.services.SBC.loadChallenge(challenge),
      controller,
      30000,
      `loadChallenge ${challenge.id}`,
    );
    if (!load?.success) fail(`Challenge load failed for ${set.name}`);

    try {
      const localChallenge = set.getChallenge?.(challenge.id);
      if (localChallenge && !localChallenge.squad) localChallenge.update?.(challenge);
    } catch { }

    const nav = navController();
    if (!nav) fail('Navigation controller not found');

    const vc = new W.UTSBCSquadSplitViewController();
    vc.initWithSBCSet?.(set, challenge.id);
    nav.pushViewController?.(vc, true);
    await waitLoadingEnd();
    const activeController = await waitFor(() => {
      const current = ctrl();
      if (!current || current?.constructor?.name !== 'UTSBCSquadSplitViewController') return null;
      return current === vc || current !== controller ? current : null;
    }, 15000, `${set.name} target SBC squad screen`);
    await waitFor(() => {
      const current = ctrl();
      if (current !== vc && current !== activeController) return null;
      return current?._squad || null;
    }, 15000, `${set.name} target SBC squad object`);
    return { set, challenge };
  }

  function simulateClick(el) {
    if (!el) return false;
    try { el.scrollIntoView?.({ block: 'center', inline: 'center' }); } catch { }
    try { el.focus?.(); } catch { }

    const fire = (Ctor, type, extra = {}) => {
      try {
        if (typeof Ctor === 'function') {
          el.dispatchEvent(new Ctor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            ...extra,
          }));
          return true;
        }
      } catch { }
      try {
        const event = document.createEvent('MouseEvents');
        event.initMouseEvent(type, true, true, W, 1, 0, 0, 1, 1, false, false, false, false, 0, null);
        el.dispatchEvent(event);
        return true;
      } catch { }
      return false;
    };

    fire(W.PointerEvent || window.PointerEvent, 'pointerdown', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
    fire(W.MouseEvent || window.MouseEvent, 'mousedown', { button: 0, buttons: 1 });
    fire(W.PointerEvent || window.PointerEvent, 'pointerup', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
    fire(W.MouseEvent || window.MouseEvent, 'mouseup', { button: 0, buttons: 0 });
    fire(W.MouseEvent || window.MouseEvent, 'click', { button: 0, buttons: 0 });
    try { el.click?.(); } catch { }
    return true;
  }

  function findButtonByText(patterns) {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find((b) =>
      matchesAny(b.textContent.trim(), patterns) &&
      !b.classList.contains('disabled') &&
      !b.disabled
    );
  }

  function clickButtonByText(patterns) {
    const btn = findButtonByText(patterns);
    if (!btn) return false;
    return simulateClick(btn);
  }

  function elementSearchText(el) {
    return [
      compactText(el),
      el?.getAttribute?.('aria-label'),
      el?.getAttribute?.('title'),
      el?.getAttribute?.('data-id'),
      el?.value,
    ].filter(Boolean).join(' ');
  }

  function findClickableByText(patterns, root = document) {
    const selectors = [
      'button',
      '[role="button"]',
      'a',
      'input[type="button"]',
      'input[type="submit"]',
      '.call-to-action',
      '[class*="call-to-action"]',
      '[class*="btn"]',
      '[class*="Button"]',
    ].join(',');
    return Array.from(root.querySelectorAll(selectors))
      .filter(isClickableElement)
      .sort((a, b) => elementSearchText(a).length - elementSearchText(b).length)
      .find((el) => matchesAny(elementSearchText(el), patterns)) || null;
  }

  function simulateKeyStroke(key = 'Alt', code = 'AltRight', options = {}) {
    const init = {
      key,
      code,
      bubbles: true,
      cancelable: true,
      composed: true,
      location: code === 'AltRight' ? 2 : 0,
      altKey: code === 'AltRight',
      ...options,
    };
    const targets = [
      document.activeElement,
      document.body,
      document,
      W,
    ].filter(Boolean);
    for (const target of targets) {
      try { target.dispatchEvent(new KeyboardEvent('keydown', init)); } catch { }
      try { target.dispatchEvent(new KeyboardEvent('keyup', init)); } catch { }
    }
  }

  function closeFsuStuckOverlay(label = 'FSU stuck overlay') {
    const patterns = [
      'If you encounter stuck',
      'click here to close',
      'encounter stuck',
    ];
    const candidates = Array.from(document.querySelectorAll('div, span, p, section'))
      .filter((el) => isClickableElement(el) && matchesAny(compactText(el), patterns))
      .sort((a, b) => compactText(a).length - compactText(b).length);
    const target = candidates[0];
    if (!target) return false;
    const clickTarget = target.closest?.('button,[role="button"],a') || target;
    log(`Closing ${label}`);
    simulateClick(clickTarget);
    return true;
  }

  function compactText(el) {
    return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isClickableElement(el) {
    if (!el) return false;
    if (el.disabled || el.classList?.contains('disabled')) return false;
    const rect = el.getBoundingClientRect?.();
    if (rect && (!rect.width || !rect.height)) return false;
    return true;
  }

  function findRequirementAddControl(requirementPatterns = [], buttonTexts = ['Add']) {
    const rows = Array.from(document.querySelectorAll('li, section, div'))
      .filter((el) => {
        const text = compactText(el);
        return text && text.length < 500 && matchesAny(text, requirementPatterns);
      })
      .sort((a, b) => compactText(a).length - compactText(b).length);

    for (const row of rows) {
      const controls = Array.from(row.querySelectorAll('button, [role="button"], a, span, div'))
        .filter(isClickableElement);
      const addControl = controls.find((el) => {
        const text = compactText(el);
        const label = String(el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '');
        const classes = String(el.className || '');
        return matchesAny(text, buttonTexts) ||
          matchesAny(label, buttonTexts) ||
          /\badd\b/i.test(classes);
      });
      if (addControl) {
        return addControl.closest?.('button,[role="button"],a') || addControl;
      }
    }

    return null;
  }

  async function clickRequirementAddControl(config = {}, label = 'SBC requirement') {
    const patterns = config.patterns || [];
    if (!patterns.length) return false;
    const btn = findRequirementAddControl(patterns, config.buttonTexts || ['Add']);
    if (!btn) return false;
    log(`Clicked requirement Add for ${label}`);
    simulateClick(btn);
    await waitLoadingEnd();
    await sleep(CFG.pauseMs);
    return true;
  }

  function findSubmitButton() {
    return (
      document.querySelector('button.ut-squad-tab-button-control.actionTab.right.call-to-action:not(.disabled)') ||
      findButtonByText([
        'Exchange Players',
        'Submit SBC',
        'Submit',
        '兑换球员',
        '交換球員',
        '提交',
      ])
    );
  }

  function getFilledSquadSlots(squad) {
    const players = squad?.getPlayers?.() || squad?._players || [];
    return players.filter((slot) => slot?._item?.definitionId || slot?.item?.definitionId).length;
  }

  function getRequiredPlayerCount(challenge) {
    try {
      const count = Number(challenge?.squad?.getNumOfRequiredPlayers?.());
      if (Number.isFinite(count) && count > 0) return count;
    } catch { }
    try {
      const formation = W.repositories?.Squad?.getFormation?.(challenge?.formation);
      const count = Number(formation?.generalPositions?.length);
      if (Number.isFinite(count) && count > 0) return count;
    } catch { }
    return 11;
  }

  function sumRequirementPlayerCount(loopDef = {}) {
    if (!Array.isArray(loopDef.requirements)) return 0;
    return loopDef.requirements.reduce((sum, requirement) => {
      const count = Number(requirement?.count || 0);
      return Number.isFinite(count) && count > 0 ? sum + count : sum;
    }, 0);
  }

  function expectedSbcPlayerCount(loopDef = {}, challenge = null) {
    const values = [];
    const explicit = Number(loopDef.expectedPlayerCount || 0);
    if (Number.isFinite(explicit) && explicit > 0) values.push(explicit);
    if (loopDef.inventoryFillFirst === true) {
      const requirementCount = sumRequirementPlayerCount(loopDef);
      if (requirementCount > 0) values.push(requirementCount);
    }
    if (challenge) {
      const required = getRequiredPlayerCount(challenge);
      if (Number.isFinite(required) && required > 0) values.push(required);
    }
    return values.length ? Math.max(...values) : 0;
  }

  function sortSbcFodder(items, spec = {}, settings = getFsuSettings()) {
    return [...items].sort((a, b) => {
      if (settings.priorityNonSpecialPlayers && isSpecial(a) !== isSpecial(b)) {
        return Number(isSpecial(a)) - Number(isSpecial(b));
      }

      const aGoldRange = isInGoldPriorityRange(a, settings);
      const bGoldRange = isInGoldPriorityRange(b, settings);
      if (settings.priorityRareWithinGoldRange && spec.rarity === undefined && aGoldRange && bGoldRange && isRare(a) !== isRare(b)) {
        return Number(isRare(b)) - Number(isRare(a));
      }

      const aSilverBronze = isBronze(a) || isSilver(a);
      const bSilverBronze = isBronze(b) || isSilver(b);
      if (settings.silverBronzePrioritizeNormal && aSilverBronze && bSilverBronze && isRare(a) !== isRare(b)) {
        return Number(isRare(a)) - Number(isRare(b));
      }

      return Number(a?.rating || 0) - Number(b?.rating || 0) ||
        Number(isRare(a)) - Number(isRare(b)) ||
        Number(a?.id || 0) - Number(b?.id || 0);
    });
  }

  function itemDisplayName(item) {
    const names = [
      [item?.firstName, item?.lastName].filter(Boolean).join(' '),
      item?.name,
      item?.commonName,
      item?.lastName,
      item?._staticData?.name,
      item?._staticData?.commonName,
      item?._staticData?.lastName,
      item?.definitionId,
      item?.id,
    ];
    return String(names.find((value) => value !== undefined && value !== null && String(value).trim()) || 'unknown');
  }

  function itemTierLabel(item) {
    if (isBronze(item)) return 'bronze';
    if (isSilver(item)) return 'silver';
    if (isGold(item)) return 'gold';
    return 'unknown';
  }

  function formatDryRunItem(entry, index) {
    const item = entry?.item || entry;
    const signal = entry?.signal || null;
    const parts = [
      `${index + 1}. ${itemDisplayName(item)}`,
      `rating:${Number(item?.rating || 0) || '?'}`,
      itemTierLabel(item),
      isRare(item) ? 'rare' : 'common',
      isTradeable(item) ? 'tradeable' : 'untradeable',
      `from:${entry?.pileName || 'unknown'}`,
      `id:${Number(item?.id || 0) || '?'}`,
      `def:${Number(item?.definitionId || 0) || '?'}`,
    ];
    if (signal && Number(signal?.id || 0) !== Number(item?.id || 0)) {
      parts.push(`signal:${Number(signal.id || 0) || '?'}`);
    }
    return parts.join(' | ');
  }

  function logDryRunSelection(label, selection, options = {}) {
    const maxItems = Number(options.maxItems || 30);
    log(`${label}: dry-run selected ${selection?.selected?.length || 0} item(s) (${formatSelectionStats(selection?.stats)})`);
    const entries = selection?.entries || (selection?.selected || []).map((item) => ({ item, pileName: 'unknown' }));
    entries.slice(0, maxItems).forEach((entry, index) => log(`dry-run pick ${formatDryRunItem(entry, index)}`));
    if (entries.length > maxItems) log(`dry-run pick list truncated: ${entries.length - maxItems} more item(s)`);
    if (!selection?.ok && selection?.missing) {
      const missing = selection.missing;
      log(`${label}: dry-run missing ${missing.count} ${missing.tier || 'any'} ${missing.rarity || ''} item(s)`);
      logSelectionDiagnostics(label, selection, options.priorityPiles);
    }
  }

  function addCount(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
  }

  function formatCounts(counts, limit = 5) {
    const entries = Object.entries(counts || {})
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit);
    return entries.map(([key, count]) => `${key}:${count}`).join(', ');
  }

  function describeRequirement(requirement = {}) {
    return [
      requirement.count ? `${requirement.count}x` : '',
      requirement.tier || 'any-tier',
      requirement.rarity || '',
      requirement.minRating ? `min${requirement.minRating}` : '',
      requirement.maxRating ? `max${requirement.maxRating}` : '',
      requirement.playerOnly ? 'player' : '',
      requirement.allowSpecial ? 'special-ok' : 'no-special',
    ].filter(Boolean).join(' ');
  }

  function getUsabilityRejectReasons(item, options = {}) {
    const reasons = [];
    const id = Number(item?.id || 0);
    if (!isPlayer(item)) reasons.push('not-player');
    if (id && state.consumedItemIds.has(id)) reasons.push('consumed-this-run');
    if (options.protectHighGold && isProtectedHighGold(item)) reasons.push('protected-82-plus');
    if (isConceptItem(item)) reasons.push('concept');
    try { if (item?.isEnrolledInAcademy?.()) reasons.push('academy'); } catch { }
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) reasons.push('active-trade');
    if (!isInactiveTrade(item)) reasons.push('active-trade');
    getFsuRejectReasons(item, options).forEach((reason) => reasons.push(reason));
    return reasons;
  }

  function getSpecRejectReasons(item, spec = {}) {
    const reasons = [];
    const rating = Number(item?.rating || 0);
    if (spec.playerOnly && !isPlayer(item)) reasons.push('not-player');
    if (spec.minRating !== undefined && rating < Number(spec.minRating)) reasons.push(`rating-under-${Number(spec.minRating)}`);
    if (spec.maxRating !== undefined && rating > Number(spec.maxRating)) reasons.push(`rating-over-${Number(spec.maxRating)}`);
    if (spec.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) reasons.push('tradeable-blocked');
    if (spec.special === true && !isSpecial(item)) reasons.push('not-special');
    if (spec.special === false && isSpecial(item)) reasons.push('special-blocked');
    if (spec.special !== true && spec.allowSpecial !== true && isSpecial(item)) reasons.push('special-blocked');
    if (spec.tier === 'bronze' && !isBronze(item)) reasons.push('tier-not-bronze');
    if (spec.tier === 'silver' && !isSilver(item)) reasons.push('tier-not-silver');
    if (spec.tier === 'gold' && !isGold(item)) reasons.push('tier-not-gold');
    if (spec.rarity === 'rare' && !isRare(item)) reasons.push('rarity-not-rare');
    if (spec.rarity === 'common' && isRare(item)) reasons.push('rarity-not-common');
    return reasons;
  }

  function diagnosePileForRequirement(pileName, requirement, settings = getFsuSettings()) {
    const items = getPileItemsByName(pileName);
    const result = {
      total: items.length,
      usable: 0,
      matching: 0,
      uniqueDefinitions: 0,
      duplicateSignals: 0,
      resolvedSignals: 0,
      reasons: {},
    };
    const matchingDefinitions = new Set();

    for (const item of items) {
      const usabilityRejects = getUsabilityRejectReasons(item, requirement);
      const specRejects = getSpecRejectReasons(item, requirement);
      const rejects = [...new Set(usabilityRejects.concat(specRejects))];
      if (rejects.length) {
        rejects.forEach((reason) => addCount(result.reasons, reason));
        continue;
      }

      result.usable++;
      result.matching++;
      matchingDefinitions.add(Number(item?.definitionId || 0));

      if (pileNeedsDuplicateSignalResolution(pileName)) {
        if (!isDuplicate(item)) {
          addCount(result.reasons, 'duplicate-signal-required');
          continue;
        }
        result.duplicateSignals++;
        const resolved = findSubmissionItemForDuplicateSignal(item, new Set(), requirement, settings);
        if (resolved) {
          result.resolvedSignals++;
        } else {
          addCount(result.reasons, 'duplicate-signal-unresolved');
        }
      }
    }

    result.uniqueDefinitions = Array.from(matchingDefinitions).filter(Boolean).length;
    return result;
  }

  function logRequirementDiagnostics(label, requirement, fallbackPriorityPiles) {
    const settings = getFsuSettings();
    const piles = applyFsuPilePriority(requirement?.priorityPiles || fallbackPriorityPiles || ['storage', 'transfer', 'club'], settings);
    const diagnostics = [];
    log(`${label}: diagnostics for ${describeRequirement(requirement)} across ${piles.join(' > ')}`);

    for (const pileName of piles) {
      const diag = diagnosePileForRequirement(pileName, requirement, settings);
      diagnostics.push({ pileName, ...diag });
      const signalText = pileNeedsDuplicateSignalResolution(pileName)
        ? `, duplicate signals:${diag.duplicateSignals}, resolved:${diag.resolvedSignals}`
        : '';
      log(`${label}: ${pileName} total:${diag.total}, matching:${diag.matching}, unique defs:${diag.uniqueDefinitions}${signalText}`);
      const rejectText = formatCounts(diag.reasons);
      if (rejectText) log(`${label}: ${pileName} rejects ${rejectText}`);
    }
    return diagnostics;
  }

  function logActiveFsuSelectionGuards(label, diagnostics = [], settings = getFsuSettings()) {
    const fsuRejects = {};
    diagnostics.forEach((diag) => {
      Object.entries(diag?.reasons || {}).forEach(([reason, count]) => {
        if (reason.startsWith('fsu-')) {
          fsuRejects[reason] = (fsuRejects[reason] || 0) + Number(count || 0);
        }
      });
    });
    if (!Object.keys(fsuRejects).length) return;

    const active = [];
    if (settings.onlyUntradeable) active.push('Only Untradeable');
    const excludedLeagueIds = uniqueNumberList(settings.excludedLeagueIds || []);
    if (settings.excludeDesignatedLeagues && excludedLeagueIds.length) {
      active.push(`Exclude designated league (${excludedLeagueIds.join('/')})`);
    }
    if (settings.excludeEvolution) active.push('Exclude Evolution');
    if (settings.useRarityPlayer === false) active.push('Use Rarity Player off');
    if (Object.keys(fsuRejects).some((reason) => reason.startsWith('fsu-gold-range-'))) {
      const range = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
      active.push(`Golden Player Range (${range[0]}-${range[1]})`);
    }
    const lockedCount = uniqueNumberList([
      ...(settings.lockedItemIds || []),
      ...(settings.lockedDefinitionIds || []),
    ]).length;
    if (lockedCount) active.push(`Lock player (${lockedCount})`);

    log(`${label}: active FSU filters affected this selection: ${formatCounts(fsuRejects, 20)}`);
    if (active.length) log(`${label}: FSU guards in force: ${active.join('; ')}`);
    log(`${label}: Runner will not bypass FSU filters; adjust FSU SBC ignore player configuration and retry if these cards should be usable`);
  }

  function logSelectionDiagnostics(label, selection, fallbackPriorityPiles) {
    if (!selection?.missing) return [];
    const diagnostics = logRequirementDiagnostics(label, selection.missing, fallbackPriorityPiles);
    logActiveFsuSelectionGuards(label, diagnostics);
    return diagnostics;
  }

  function getSubmissionCacheItems() {
    return uniqueItems(getStorageItems().concat(getClubItems()));
  }

  function isSameDefinition(a, b) {
    return Number(a?.definitionId || 0) === Number(b?.definitionId || -1);
  }

  function findSubmissionItemForDuplicateSignal(signal, usedIds, spec = {}, settings = getFsuSettings()) {
    const duplicateId = Number(signal?.duplicateId || 0);
    const cacheItems = getSubmissionCacheItems().filter((item) =>
      isSbcUsablePlayer(item, spec) &&
      itemMatchesSpec(item, spec, settings) &&
      !usedIds.has(Number(item?.id || 0))
    );

    if (duplicateId) {
      const direct = cacheItems.find((item) => Number(item?.id || 0) === duplicateId);
      if (direct) return direct;
    }

    return sortSbcFodder(cacheItems, spec, settings).find((item) => isSameDefinition(item, signal)) || null;
  }

  function pileNeedsDuplicateSignalResolution(pileName) {
    return pileName === 'transfer' || pileName === 'unassigned';
  }

  function selectInventoryPlayers(requirements, priorityPiles = ['storage', 'transfer', 'club']) {
    const settings = getFsuSettings();
    const selected = [];
    const selectedIds = new Set();
    const selectedDefinitionIds = new Set();
    const submissionIds = new Set();
    const stats = {};
    const resolvedSignals = {};
    const entries = [];

    for (const requirement of requirements || []) {
      let need = Number(requirement.count || 0);
      const piles = applyFsuPilePriority(requirement.priorityPiles || priorityPiles, settings);
      for (const pileName of piles) {
        if (need <= 0) break;
        const candidates = sortSbcFodder(getPileItemsByName(pileName), requirement, settings)
          .filter((item) =>
            !selectedIds.has(Number(item?.id || 0)) &&
            !selectedDefinitionIds.has(Number(item?.definitionId || 0)) &&
            isSbcUsablePlayer(item, requirement) &&
            itemMatchesSpec(item, requirement, settings)
          );
        let picked = [];

        if (pileNeedsDuplicateSignalResolution(pileName)) {
          for (const signal of candidates) {
            if (picked.length >= need) break;
            if (!isDuplicate(signal)) continue;
            const resolved = findSubmissionItemForDuplicateSignal(signal, submissionIds, requirement, settings);
            if (!resolved) continue;
            if (selectedDefinitionIds.has(Number(resolved?.definitionId || 0))) continue;
            picked.push({ signal, item: resolved });
            selectedIds.add(Number(signal.id));
            selectedIds.add(Number(resolved.id));
            selectedDefinitionIds.add(Number(resolved.definitionId || 0));
            submissionIds.add(Number(resolved.id));
          }
        } else {
          for (const item of candidates) {
            if (picked.length >= need) break;
            const id = Number(item?.id || 0);
            const definitionId = Number(item?.definitionId || 0);
            if (id && submissionIds.has(id)) continue;
            if (id && selectedIds.has(id)) continue;
            if (definitionId && selectedDefinitionIds.has(definitionId)) continue;
            picked.push({ signal: null, item });
            if (id) {
              selectedIds.add(id);
              submissionIds.add(id);
            }
            if (definitionId) selectedDefinitionIds.add(definitionId);
          }
        }

        for (const pickedItem of picked) {
          selected.push(pickedItem.item);
          entries.push({ ...pickedItem, pileName });
          if (pileNeedsDuplicateSignalResolution(pileName)) {
            resolvedSignals[pileName] = (resolvedSignals[pileName] || 0) + 1;
          }
          stats[pileName] = (stats[pileName] || 0) + 1;
        }
        need -= picked.length;
      }
      if (need > 0) {
        return {
          ok: false,
          selected,
          entries,
          stats,
          missing: { ...requirement, count: need },
          resolvedSignals,
        };
      }
    }

    return { ok: true, selected, entries, stats, missing: null, resolvedSignals };
  }

  function selectedItemsFromPile(selection, pileName) {
    const pileIds = new Set(getPileItemsByName(pileName).map((item) => Number(item?.id || 0)));
    return (selection?.selected || []).filter((item) => pileIds.has(Number(item?.id || 0)));
  }

  async function prepareInventorySelection(loopDef, selection) {
    const transferItems = selectedItemsFromPile(selection, 'transfer');
    if (!transferItems.length) {
      const resolvedSignals = selection?.resolvedSignals || {};
      for (const [pileName, count] of Object.entries(resolvedSignals)) {
        if (count) log(`${loopDef.name}: resolved ${count} ${pileName} duplicate signal(s) during inventory selection`);
      }
      return selection;
    }

    const transferIds = new Set(transferItems.map((item) => Number(item?.id || 0)));
    const usedIds = new Set(
      (selection.selected || [])
        .filter((item) => !transferIds.has(Number(item?.id || 0)))
        .map((item) => Number(item?.id || 0))
    );
    let resolvedCount = 0;

    const selected = (selection.selected || []).map((item) => {
      const itemId = Number(item?.id || 0);
      if (!transferIds.has(itemId)) return item;

      const resolved = findSubmissionItemForDuplicateSignal(item, usedIds);
      if (!resolved) {
        const name = item?.name || item?.lastName || item?.definitionId || itemId || 'unknown';
        fail(`${loopDef.name}: transfer item ${name} cannot be resolved to a club/storage duplicate for SBC submit`);
      }

      usedIds.add(Number(resolved.id));
      resolvedCount++;
      return resolved;
    });

    log(`${loopDef.name}: resolved ${resolvedCount} transfer item(s) through duplicateId to club/storage submit item(s)`);
    return { ...selection, selected, resolvedSignals: { ...(selection.resolvedSignals || {}), transfer: resolvedCount } };
  }

  function buildSquadPlayerList(challenge, players) {
    const substitute = [...players];
    let slotCount = getRequiredPlayerCount(challenge);
    try {
      const formation = W.repositories?.Squad?.getFormation?.(challenge?.formation);
      slotCount = Math.max(slotCount, (formation?.generalPositions || []).length + 12);
    } catch { }

    const result = [];
    for (let i = 0; i < slotCount; i++) {
      const slot = challenge?.squad?.getSlot?.(i);
      if (slot && typeof slot.isBrick === 'function' && slot.isBrick()) {
        result.push(null);
      } else {
        result.push(substitute.shift() || null);
      }
    }
    return result;
  }

  async function saveChallengeSquad(challenge, players, label = 'SBC') {
    const squad = challenge?.squad || ctrl()?._squad;
    if (!squad) fail(`${label}: squad object not found`);
    const playerList = buildSquadPlayerList(challenge, players);
    try { squad.removeAllItems?.(); } catch { }
    squad.setPlayers(playerList, true);

    const save = await observeOnce(
      W.services.SBC.saveChallenge(challenge),
      ctrl(),
      30000,
      `saveChallenge ${label}`,
    );
    if (!save?.success) {
      const code = save?.error?.code || save?.status || 'unknown';
      const msg = save?.error?.message || save?.message || '';
      const playerSummary = (players || []).slice(0, 11).map((item, index) =>
        `${index + 1}.${itemDisplayName(item)} r:${Number(item?.rating || 0) || '?'} id:${Number(item?.id || 0) || '?'} def:${Number(item?.definitionId || 0) || '?'}`
      ).join('; ');
      fail(`${label}: saveChallenge failed: ${code}${msg ? ` ${msg}` : ''}${playerSummary ? `; players ${playerSummary}` : ''}`);
    }

    if (typeof W.services.SBC.loadChallengeData === 'function') {
      try {
        const loaded = await observeOnce(
          W.services.SBC.loadChallengeData(challenge),
          ctrl(),
          30000,
          `loadChallengeData ${label}`,
        );
        const loadedSquad = loaded?.response?.squad;
        const loadedPlayers = loadedSquad?._players?.map((p) => p?._item).filter(Boolean);
        if (loadedPlayers?.length) challenge.squad?.setPlayers?.(loadedPlayers, true);
      } catch (e) {
        log(`${label}: loadChallengeData skipped: ${e.message || e}`);
      }
    }

    await waitLoadingEnd();
    await sleep(700);
  }

  async function showUnassignedIfAny(reason = 'final confirmation') {
    log(`Opening unassigned items view for confirmation: ${reason}`);
    try {
      const controller = ctrl();
      if (typeof controller?.gotoUnassigned === 'function') {
        controller.gotoUnassigned();
      } else if (typeof W.UTStoreViewController?.prototype?.gotoUnassigned === 'function') {
        W.UTStoreViewController.prototype.gotoUnassigned.call(controller);
      } else {
        clickButtonByText([
          'Unassigned Items',
          'Unassigned',
          'Assign Items',
          '未分配',
          '未分配物品',
          '分配物品',
        ]);
      }
    } catch (e) {
      log(`Could not open unassigned view automatically: ${e.message || e}`);
    }
    await waitLoadingEnd();

    await refreshUnassigned();
    const items = getUnassignedItems();
    if (!items.length) {
      log(`Unassigned confirmation (${reason}): empty`);
      return [];
    }

    log(`Unassigned confirmation (${reason}): ${items.length} item(s) still present`);
    return items;
  }

  async function waitAfterSbcFillAction(label, squad, timeoutMs = 10000) {
    const start = Date.now();
    const initialFilled = getFilledSquadSlots(squad);
    let closedStuckOverlay = false;
    while (Date.now() - start < timeoutMs) {
      stopPoint();
      const filled = getFilledSquadSlots(squad);
      if (findSubmitButton()) {
        await sleep(700);
        log(`${label}: submit button detected after fill action`);
        return true;
      }
      if (!closedStuckOverlay && closeFsuStuckOverlay(`${label} stuck overlay`)) {
        closedStuckOverlay = true;
        await sleep(1000);
        continue;
      }
      const shieldShowing = (() => {
        try { return !!W.gClickShield?.isShowing?.(); } catch { return false; }
      })();
      if (!shieldShowing && filled > initialFilled) {
        await sleep(700);
        log(`${label}: fill action settled; slots ${initialFilled} -> ${filled}`);
        return true;
      }
      await sleep(250);
    }
    log(`${label}: no fill progress after wait; slots ${initialFilled} -> ${getFilledSquadSlots(squad)}, submit ${findSubmitButton() ? 'ready' : 'not ready'}`);
    return false;
  }

  async function fillSbcSquad(label = 'SBC', options = {}) {
    const requireSubmitReady = options.requireSubmitReady !== false;
    const squad = await waitFor(() => ctrl()?._squad, 15000, 'SBC squad object');
    patchFsuLengthSafePlayerMetadata(`${label} before FSU fill`);
    try { squad.removeAllItems?.(); } catch { }
    await sleep(500);

    if (options.specialRequirementAdd) {
      const clicked = await clickRequirementAddControl(options.specialRequirementAdd, `${label} special requirement`);
      if (!clicked) log(`${label}: special requirement Add button not found; continuing with FSU fill`);
    }

    if (clickButtonByText(['重复球员填充阵容', '重複球員填充陣容', 'Repeat player fill squad'])) {
      log('Clicked duplicate fill');
      await waitLoadingEnd();
      await sleep(CFG.pauseMs);
    }

    if (clickButtonByText(['一键完成', '一鍵完成', '一键填充', '一鍵填充', 'One-click fill'])) {
      log('Clicked FSU one-click fill/complete');
      await waitAfterSbcFillAction(`${label} FSU one-click`, squad);
      await sleep(CFG.pauseMs);
    }

    if (!findSubmitButton() && clickButtonByText(['Completion', '完成', '補全', '补全'])) {
      log('Clicked FSU completion');
      await waitAfterSbcFillAction(`${label} FSU completion`, squad);
      await sleep(CFG.pauseMs);
    }

    if (clickButtonByText(['阵容补全', '陣容補全', 'Squad completion'])) {
      log('Clicked squad completion');
      await waitLoadingEnd();
      await sleep(CFG.pauseMs);
      clickButtonByText(['确定', '確定', 'Ok']);
      await waitLoadingEnd();
    }

    if (!findSubmitButton() && getFilledSquadSlots(squad) === 0 && clickButtonByText(['One-click fill'])) {
      log('Retrying FSU one-click fill after no progress');
      await waitAfterSbcFillAction(`${label} FSU one-click retry`, squad);
      await sleep(CFG.pauseMs);
    }

    const filled = getFilledSquadSlots(squad);
    const submitReady = !!findSubmitButton();
    log(`${label} squad filled slots detected: ${filled}; submit ${submitReady ? 'ready' : 'not ready'}`);
    if (!submitReady && requireSubmitReady) fail(`${label} squad is not complete`);
    return { squad, filled, submitReady };
  }

  function unwrapSquadSlot(slot) {
    return slot?._item || slot?.item || slot?.player || slot || null;
  }

  function getSquadItems(squad = ctrl()?._squad) {
    const slots = squad?.getPlayers?.() || squad?._players || [];
    return slots.map(unwrapSquadSlot).filter((item) =>
      item && (Number(item?.definitionId || 0) || Number(item?.rating || 0) || item?.id)
    );
  }

  function itemGroups(item) {
    if (Array.isArray(item?.groups)) return item.groups;
    if (Array.isArray(item?._data?.groups)) return item._data.groups;
    return [];
  }

  // FC25 scripts treated group 23 as TOTW, but FC26 logs show group 23 on non-TOTW specials.
  const TOTW_GROUP_IDS = [44];

  function itemGroupNumbers(item) {
    return itemGroups(item).map((group) => Number(group)).filter((group) => Number.isFinite(group));
  }

  function itemHasAnyGroup(item, groupIds = []) {
    const groups = itemGroupNumbers(item);
    return groupIds.some((groupId) => groups.includes(Number(groupId)));
  }

  function formatSquadItem(item, index) {
    const groups = itemGroups(item);
    const parts = [
      `${index + 1}. ${itemDisplayName(item)}`,
      `rating:${Number(item?.rating || 0) || '?'}`,
      isSbcSpecialItem(item) ? 'special' : (isRare(item) ? 'rare' : 'common'),
      isTradeable(item) ? 'tradeable' : 'untradeable',
      `id:${Number(item?.id || 0) || '?'}`,
      `def:${Number(item?.definitionId || 0) || '?'}`,
    ];
    if (isConceptItem(item)) parts.push('concept');
    if (groups.length) parts.push(`groups:${groups.join('/')}`);
    return parts.join(' | ');
  }

  function isSbcSpecialItem(item) {
    return isSpecial(item) || isTotwItem(item) || isTotsItem(item) || isFofItem(item);
  }

  function itemSearchText(item) {
    return [
      item?.name,
      item?.commonName,
      item?.lastName,
      item?._staticData?.name,
      item?._staticData?.commonName,
      item?.rareName,
      item?.rarityName,
      item?._staticData?.rareName,
      item?._staticData?.rarityName,
    ].filter(Boolean).join(' ');
  }

  function isTotwItem(item) {
    const id = Number(item?.id || 0);
    if (id && state.consumedItemIds.has(id)) return false;
    if (id && state.assumedTotwItemIds.has(id)) return true;
    try { if (item?.isTOTW?.() || item?.isTotw?.()) return true; } catch { }
    if (itemHasAnyGroup(item, TOTW_GROUP_IDS)) return true;
    const text = itemSearchText(item);
    return /\bTOTW\b|Team of the Week|本周最佳|週最佳/i.test(text);
  }

  function isTotsItem(item) {
    try { if (item?.isTOTS?.() || item?.isTots?.()) return true; } catch { }
    return /\bTOTS\b|Team of the Season|赛季最佳|賽季最佳/i.test(itemSearchText(item));
  }

  function isFofItem(item) {
    try { if (item?.isFOF?.() || item?.isFof?.()) return true; } catch { }
    return /\bFOF\b|Festival of Football|Glory Hunters|荣耀猎手|榮耀獵手/i.test(itemSearchText(item));
  }

  function requiredSpecialKind(loopDef = {}) {
    return String(loopDef.requiredSpecialKind || '').trim().toLowerCase();
  }

  function requiredSpecialLabel(loopDef = {}) {
    return requiredSpecialKind(loopDef) === 'totw-tots-fof' ? 'TOTW/TOTS/FOF' : 'TOTW';
  }

  function isRequiredSpecialItem(item, loopDef = {}) {
    const kind = requiredSpecialKind(loopDef);
    if (kind === 'totw-tots-fof') return isTotwItem(item) || isTotsItem(item) || isFofItem(item);
    return isTotwItem(item);
  }

  function needsAutoTotwPreflight(loopDef = {}) {
    return ['totw', 'totw-tots-fof'].includes(requiredSpecialKind(loopDef)) &&
      Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0) > 0 &&
      loopDef.autoTotwUpgrade !== false;
  }

  function isEligibleRequiredSpecialForLoop(item, loopDef = {}) {
    if (!isRequiredSpecialItem(item, loopDef)) return false;
    const minRating = Number(loopDef.requiredSpecialMinRating || 0);
    if (minRating && Number(item?.rating || 0) < minRating) return false;
    const reasons = getSbcProtectionReasons(item, loopDef, { specialIndex: 1 });
    return reasons.length === 0;
  }

  function isEligibleTotwForLoop(item, loopDef = {}) {
    if (!isTotwItem(item)) return false;
    return isEligibleRequiredSpecialForLoop(item, loopDef);
  }

  function getEligibleRequiredSpecialEntries(loopDef = {}, options = {}) {
    const entries = [];
    const seen = new Set();
    const piles = [
      { pileName: 'storage', items: getPileItemsByName('storage') },
      { pileName: 'club', items: getPileItemsByName('club') },
    ];
    if (options.includeRecent !== false) piles.push({ pileName: 'recent', items: state.recentRewardItems || [] });
    for (const { pileName, items } of piles) {
      for (const item of (items || [])) {
        const id = Number(item?.id || 0);
        if (!id || seen.has(id)) continue;
        if (state.consumedItemIds.has(id)) continue;
        seen.add(id);
        if (isEligibleRequiredSpecialForLoop(item, loopDef)) entries.push({ item, pileName });
      }
    }
    return entries;
  }

  function getSubmittableRequiredSpecialEntries(loopDef = {}) {
    return getEligibleRequiredSpecialEntries(loopDef, { includeRecent: false });
  }

  function getEligibleTotwEntries(loopDef = {}) {
    return getSubmittableRequiredSpecialEntries(loopDef).filter(({ item }) => isTotwItem(item));
  }

  function summarizeRequiredSpecialEntries(entries, limit = 3) {
    return entries.slice(0, limit).map(({ item, pileName }) =>
      `${itemDisplayName(item)} rating:${Number(item?.rating || 0) || '?'} ${requiredSpecialTypeLabel(item)} from:${pileName} id:${Number(item?.id || 0) || '?'}`
    ).join('; ');
  }

  function summarizeTotwEntries(entries, limit = 3) {
    return summarizeRequiredSpecialEntries(entries, limit);
  }

  async function waitForSubmittableRequiredSpecialEntries(loopDef = {}, required = 1, label = 'required special cache sync') {
    const attempts = 4;
    let entries = [];
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        await sleep(900 * attempt);
        await refreshInventoryCaches(`${loopDef.name} ${label} ${attempt}/${attempts}`, { includePacks: false, quiet: true });
      }
      resolveRecentRewardItems(`${loopDef.name} ${label} ${attempt}/${attempts}`);
      entries = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef));
      if (entries.length >= required) return entries;

      const recentEntries = sortRequiredSpecialEntriesForSubmit(
        getEligibleRequiredSpecialEntries(loopDef).filter(({ pileName }) => pileName === 'recent')
      );
      if (recentEntries.length && attempt < attempts) {
        log(`${loopDef.name}: waiting for opened ${requiredSpecialLabel(loopDef)} to enter submit cache (${attempt}/${attempts}); recent ${summarizeRequiredSpecialEntries(recentEntries)}`);
      }
    }
    return entries;
  }

  function sortRequiredSpecialEntriesForSubmit(entries) {
    const pileRank = { storage: 0, club: 1, recent: 2, unassigned: 3 };
    return [...(entries || [])].sort((a, b) =>
      Number(a?.item?.rating || 0) - Number(b?.item?.rating || 0) ||
      (pileRank[a?.pileName] ?? 9) - (pileRank[b?.pileName] ?? 9) ||
      Number(a?.item?.id || 0) - Number(b?.item?.id || 0)
    );
  }

  function requiredSpecialRejectReasons(item, loopDef = {}) {
    const reasons = [];
    const id = Number(item?.id || 0);
    if (!isPlayer(item)) reasons.push('not-player');
    if (id && state.consumedItemIds.has(id)) reasons.push('consumed-this-run');
    if (!isRequiredSpecialItem(item, loopDef)) reasons.push(`not-${requiredSpecialLabel(loopDef)}`);
    const minRating = Number(loopDef.requiredSpecialMinRating || 0);
    if (minRating && Number(item?.rating || 0) < minRating) reasons.push(`rating-under-${minRating}`);
    getSbcProtectionReasons(item, loopDef, { specialIndex: 1 }).forEach((reason) => {
      if (!reasons.includes(reason)) reasons.push(reason);
    });
    return reasons;
  }

  function logRequiredSpecialPreflightDiagnostics(loopDef = {}) {
    const piles = [
      { pileName: 'recent', items: state.recentRewardItems || [] },
      { pileName: 'unassigned', items: getPileItemsByName('unassigned') },
      { pileName: 'storage', items: getPileItemsByName('storage') },
      { pileName: 'club', items: getPileItemsByName('club') },
    ];
    const seen = new Set();
    const candidates = [];
    const reasonCounts = {};

    for (const { pileName, items } of piles) {
      for (const item of (items || [])) {
        const id = Number(item?.id || 0);
        if (!id || seen.has(id) || !isPlayer(item)) continue;
        seen.add(id);
        if (!isSbcSpecialItem(item) && !isSpecial(item)) continue;
        const reasons = requiredSpecialRejectReasons(item, loopDef);
        reasons.forEach((reason) => addCount(reasonCounts, reason));
        if (reasons.length) candidates.push({ item, pileName, reasons });
      }
    }

    if (!candidates.length) {
      log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} preflight diagnostics: no special candidates detected in recent/unassigned/storage/club caches`);
      return;
    }

    log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} preflight diagnostics: ${candidates.length} special candidate(s), rejects ${formatCounts(reasonCounts, 8) || 'none'}`);
    candidates.slice(0, 8).forEach(({ item, pileName, reasons }, index) => {
      log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} candidate ${index + 1}. ${rewardItemSummary(item)} from:${pileName} reject:${reasons.join(',') || 'none'}`);
    });
    if (candidates.length > 8) {
      log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} candidate diagnostics truncated: ${candidates.length - 8} more`);
    }
  }

  function sortTotwEntriesForSubmit(entries) {
    return sortRequiredSpecialEntriesForSubmit(entries);
  }

  function requiredSpecialTypeLabel(item) {
    const labels = [];
    if (isTotwItem(item)) labels.push('TOTW');
    if (isTotsItem(item)) labels.push('TOTS');
    if (isFofItem(item)) labels.push('FOF');
    return labels.length ? `[${labels.join('/')}]` : '[unknown-special]';
  }

  function rewardItemSummary(item) {
    const groups = itemGroups(item);
    const parts = [
      itemDisplayName(item),
      `rating:${Number(item?.rating || 0) || '?'}`,
      requiredSpecialTypeLabel(item),
      `id:${Number(item?.id || 0) || '?'}`,
      `def:${Number(item?.definitionId || 0) || '?'}`,
    ];
    if (groups.length) parts.push(`groups:${groups.join('/')}`);
    return parts.join(' ');
  }

  function markAssumedTotwRewardItems(items = [], label = 'TOTW reward pack') {
    const marked = [];
    for (const item of (items || [])) {
      if (!item || !isPlayer(item)) continue;
      const id = Number(item?.id || 0);
      if (id && state.consumedItemIds.has(id)) continue;
      if (id) state.assumedTotwItemIds.add(id);
      marked.push(item);
    }

    if (!marked.length) return;

    const seen = new Set((state.recentRewardItems || [])
      .map((item) => Number(item?.id || 0))
      .filter(Boolean));
    for (const item of marked) {
      const id = Number(item?.id || 0);
      if (!id || seen.has(id)) continue;
      state.recentRewardItems.unshift(item);
      seen.add(id);
    }
    state.recentRewardItems = state.recentRewardItems.slice(0, 20);
    marked.slice(0, 5).forEach((item) => {
      log(`${label}: marked assumed TOTW reward item: ${rewardItemSummary(item)}`);
    });
    if (marked.length > 5) log(`${label}: marked ${marked.length - 5} more assumed TOTW reward item(s)`);
  }

  function markSbcItemsConsumed(items = [], label = 'SBC submit') {
    const ids = [...new Set((items || [])
      .map((item) => Number(item?.id || 0))
      .filter(Boolean))];
    if (!ids.length) return;

    for (const id of ids) {
      state.consumedItemIds.add(id);
      state.assumedTotwItemIds.delete(id);
    }

    const beforeRecent = (state.recentRewardItems || []).length;
    state.recentRewardItems = (state.recentRewardItems || [])
      .filter((item) => !state.consumedItemIds.has(Number(item?.id || 0)));
    const removedRecent = beforeRecent - state.recentRewardItems.length;
    if (removedRecent) {
      log(`${label}: cleared ${removedRecent} consumed recent reward item reference(s)`);
    }
  }

  function needsRequiredTotwInjection(loopDef, inspection) {
    if (!needsAutoTotwPreflight(loopDef)) return false;
    return (inspection?.missingRequirements || []).some((message) => String(message).startsWith('special-count')) ||
      (inspection?.blocked || []).some(({ reasons }) => (reasons || []).some((reason) => String(reason).startsWith('required-totw')));
  }

  function chooseTotwReplacementEntry(loopDef, inspection, totwItem) {
    const entries = inspection?.entries || [];
    const protectedIds = new Set((loopDef.protectedItemIds || []).map(Number));
    const protectedDefinitionIds = new Set((loopDef.protectedDefinitionIds || []).map(Number));
    const totwId = Number(totwItem?.id || 0);

    const candidates = entries.filter(({ item }) =>
      item &&
      Number(item?.id || 0) !== totwId &&
      !(isRequiredSpecialItem(item, loopDef) && isEligibleRequiredSpecialForLoop(item, loopDef))
    );
    if (!candidates.length) return null;

    const score = ({ item, reasons }) => {
      const reasonList = reasons || [];
      let value = Number(item?.rating || 0) || 0;
      if (reasonList.includes('required-totw')) value -= 1000;
      if (reasonList.some((reason) => String(reason).startsWith('required-totw-min-'))) value -= 950;
      if (reasonList.includes('special-blocked')) value -= 800;
      if (reasonList.includes('tradeable-blocked')) value -= 700;
      if (reasonList.includes('fsu-locked-player')) value -= 680;
      if (reasonList.some((reason) => reason.startsWith('rating-over-'))) value -= 600;
      if (isSbcSpecialItem(item)) value -= 300;
      if (protectedIds.has(Number(item?.id || 0))) value -= 900;
      if (protectedDefinitionIds.has(Number(item?.definitionId || 0))) value -= 900;
      return value;
    };

    return [...candidates].sort((a, b) =>
      score(a) - score(b) ||
      Number(a?.item?.rating || 0) - Number(b?.item?.rating || 0) ||
      Number(a?.index || 0) - Number(b?.index || 0)
    )[0] || null;
  }

  function getSubmittedRatingLimit(item, loopDef = {}) {
    const normalGoldLimit = Number(loopDef.maxNormalGoldSubmittedRating || 0);
    if (isNormalGoldFodder(item)) {
      const fsuRange = getFsuSettings().goldRange || FSU_COMPAT_DEFAULTS.goldRange;
      const fsuGoldLimit = Number(fsuRange[1] || 0);
      const limits = [normalGoldLimit, fsuGoldLimit].filter((limit) => Number.isFinite(limit) && limit > 0);
      if (limits.length) return Math.min(...limits);
    }
    return Number(loopDef.maxSubmittedRating || 0);
  }

  function isEligibleNormalRepairFiller(item, loopDef = {}) {
    if (!isPlayer(item)) return false;
    const id = Number(item?.id || 0);
    if (id && state.consumedItemIds.has(id)) return false;
    if (isSbcSpecialItem(item)) return false;
    if (isConceptItem(item)) return false;
    try { if (item?.isEnrolledInAcademy?.()) return false; } catch { }
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) return false;
    if (!isInactiveTrade(item)) return false;
    if (loopDef.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) return false;
    const maxRating = getSubmittedRatingLimit(item, loopDef);
    if (maxRating && Number(item?.rating || 0) > maxRating) return false;
    const protectedIds = new Set((loopDef.protectedItemIds || []).map(Number));
    const protectedDefinitionIds = new Set((loopDef.protectedDefinitionIds || []).map(Number));
    if (protectedIds.has(Number(item?.id || 0))) return false;
    if (protectedDefinitionIds.has(Number(item?.definitionId || 0))) return false;
    if (getFsuRejectReasons(item, { playerOnly: true, allowSpecial: false }).length) return false;
    return true;
  }

  function getEligibleNormalRepairEntries(loopDef = {}, usedIds = new Set(), options = {}) {
    const entries = [];
    const seen = new Set();
    const usedDefinitionIds = options.usedDefinitionIds || new Set();
    const piles = Array.isArray(options.piles) && options.piles.length ? options.piles : ['storage', 'club'];
    for (const pileName of piles) {
      for (const item of getPileItemsByName(pileName)) {
        const id = Number(item?.id || 0);
        if (!id || seen.has(id) || usedIds.has(id)) continue;
        const definitionId = Number(item?.definitionId || 0);
        if (definitionId && usedDefinitionIds.has(definitionId)) continue;
        seen.add(id);
        if (isEligibleNormalRepairFiller(item, loopDef)) entries.push({ item, pileName });
      }
    }
    return entries;
  }

  function sortNormalRepairEntries(entries) {
    const pileRank = { storage: 0, club: 1, unassigned: 2 };
    return [...(entries || [])].sort((a, b) =>
      Number(b?.item?.rating || 0) - Number(a?.item?.rating || 0) ||
      (pileRank[a?.pileName] ?? 9) - (pileRank[b?.pileName] ?? 9) ||
      Number(isRare(a?.item)) - Number(isRare(b?.item)) ||
      Number(a?.item?.id || 0) - Number(b?.item?.id || 0)
    );
  }

  function sortCurrentTotwEntriesForKeep(entries) {
    return [...(entries || [])].sort((a, b) =>
      Number(a?.item?.rating || 0) - Number(b?.item?.rating || 0) ||
      Number(a?.index || 0) - Number(b?.index || 0)
    );
  }

  function isRequiredTotwRepairTarget(loopDef, entry, keepTotwId) {
    const item = entry?.item;
    if (!item) return false;
    const itemId = Number(item?.id || 0);
    if (itemId && itemId === keepTotwId) return false;
    const reasons = entry?.reasons || [];
    return isSbcSpecialItem(item) ||
      reasons.includes('required-totw') ||
      reasons.some((reason) => String(reason).startsWith('required-totw-min-')) ||
      reasons.includes('special-blocked') ||
      reasons.includes('tradeable-blocked') ||
      reasons.includes('fsu-locked-player') ||
      reasons.includes('protected-id') ||
      reasons.includes('protected-def') ||
      reasons.includes('concept') ||
      reasons.includes('academy') ||
      reasons.some((reason) => reason.startsWith('rating-over-')) ||
      getFsuRejectReasons(item, { playerOnly: true, allowSpecial: false }).length > 0;
  }

  function sortRepairTargets(entries) {
    const score = ({ item, reasons }) => {
      const reasonList = reasons || [];
      let value = 0;
      if (reasonList.includes('required-totw')) value -= 1000;
      if (reasonList.some((reason) => String(reason).startsWith('required-totw-min-'))) value -= 950;
      if (reasonList.includes('special-blocked')) value -= 900;
      if (reasonList.some((reason) => reason.startsWith('rating-over-'))) value -= 800;
      if (reasonList.includes('tradeable-blocked')) value -= 700;
      if (reasonList.includes('fsu-locked-player')) value -= 690;
      if (reasonList.includes('protected-id') || reasonList.includes('protected-def')) value -= 650;
      if (reasonList.includes('concept')) value -= 640;
      if (reasonList.includes('academy')) value -= 630;
      if (isSbcSpecialItem(item)) value -= 500;
      return value;
    };
    return [...(entries || [])].sort((a, b) =>
      score(a) - score(b) ||
      Number(b?.item?.rating || 0) - Number(a?.item?.rating || 0) ||
      Number(a?.index || 0) - Number(b?.index || 0)
    );
  }

  function buildRequiredTotwRepairPlan(loopDef, inspection) {
    if (!needsAutoTotwPreflight(loopDef)) return null;
    resolveRecentRewardItems(`${loopDef.name} required ${requiredSpecialLabel(loopDef)} repair`);
    const players = [...(inspection?.items || [])];
    if (!players.length) return null;

    const changes = [];
    const usedIds = new Set(players.map((item) => Number(item?.id || 0)).filter(Boolean));
    let keepTotwId = 0;
    let keepTotwMessage = '';

    const currentTotw = sortCurrentTotwEntriesForKeep(
      (inspection.entries || []).filter(({ item }) => isEligibleRequiredSpecialForLoop(item, loopDef))
    )[0] || null;

    if (currentTotw) {
      keepTotwId = Number(currentTotw.item?.id || 0);
      keepTotwMessage = `keep ${itemDisplayName(currentTotw.item)} rating:${Number(currentTotw.item?.rating || 0) || '?'} at slot ${currentTotw.index + 1}`;
    } else {
      const externalTotw = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef))
        .filter(({ item }) => !usedIds.has(Number(item?.id || 0)))[0] || null;
      if (!externalTotw) return null;

      const replacement = chooseTotwReplacementEntry(loopDef, inspection, externalTotw.item);
      if (!replacement) return null;

      players[replacement.index] = externalTotw.item;
      keepTotwId = Number(externalTotw.item?.id || 0);
      usedIds.add(keepTotwId);
      keepTotwMessage = `inject ${itemDisplayName(externalTotw.item)} rating:${Number(externalTotw.item?.rating || 0) || '?'} from:${externalTotw.pileName} into slot ${replacement.index + 1}`;
      changes.push({
        index: replacement.index,
        from: replacement.item,
        to: externalTotw.item,
        pileName: externalTotw.pileName,
        reason: `required ${requiredSpecialLabel(loopDef)}`,
      });
    }

    let plannedInspection = inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount });
    const targets = sortRepairTargets(
      plannedInspection.entries.filter((entry) => isRequiredTotwRepairTarget(loopDef, entry, keepTotwId))
    );

    const targetIndexes = new Set(targets.map(({ index }) => Number(index)));
    const usedDefinitionIds = new Set(players
      .filter((item, index) => !targetIndexes.has(index))
      .map((item) => Number(item?.definitionId || 0))
      .filter(Boolean));
    const fillers = sortNormalRepairEntries(getEligibleNormalRepairEntries(loopDef, usedIds, { usedDefinitionIds }));
    for (const target of targets) {
      const filler = fillers.shift();
      if (!filler) {
        return {
          ok: false,
          reason: `missing normal replacement for slot ${target.index + 1}`,
          players,
          changes,
          keepTotwMessage,
          inspection: plannedInspection,
        };
      }
      players[target.index] = filler.item;
      usedIds.add(Number(filler.item?.id || 0));
      const fillerDefinitionId = Number(filler.item?.definitionId || 0);
      if (fillerDefinitionId) usedDefinitionIds.add(fillerDefinitionId);
      changes.push({
        index: target.index,
        from: target.item,
        to: filler.item,
        pileName: filler.pileName,
        reason: 'replace invalid/extra special',
      });
    }

    plannedInspection = inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount });
    return {
      ok: !plannedInspection.blocked.length && !(plannedInspection.missingRequirements || []).length,
      players,
      changes,
      keepTotwMessage,
      inspection: plannedInspection,
      reason: plannedInspection.blocked.length || plannedInspection.missingRequirements?.length
        ? 'repair plan still has protected or missing requirements'
        : '',
    };
  }

  function formatRepairChange(change) {
    const fromLabel = change.from ? `${itemDisplayName(change.from)} rating:${Number(change.from?.rating || 0) || '?'}` : 'empty';
    const toLabel = change.to ? `${itemDisplayName(change.to)} rating:${Number(change.to?.rating || 0) || '?'}` : 'empty';
    return `slot ${change.index + 1}: ${fromLabel} -> ${toLabel} from:${change.pileName} (${change.reason})`;
  }

  function buildProtectedSquadRepairPlan(loopDef, inspection) {
    if (!inspection?.items?.length || !inspection.blocked?.length) return null;

    const players = [...inspection.items];
    const targets = sortRepairTargets((inspection.blocked || []).filter(({ item, reasons }) =>
      item && (reasons || []).length
    ));
    if (!targets.length) return null;

    const targetIndexes = new Set(targets.map(({ index }) => Number(index)));
    const usedIds = new Set(players.map((item) => Number(item?.id || 0)).filter(Boolean));
    const usedDefinitionIds = new Set(players
      .filter((item, index) => !targetIndexes.has(index))
      .map((item) => Number(item?.definitionId || 0))
      .filter(Boolean));
    const fillers = sortNormalRepairEntries(getEligibleNormalRepairEntries(loopDef, usedIds, { usedDefinitionIds }));
    const changes = [];

    for (const target of targets) {
      const fillerIndex = fillers.findIndex(({ item }) => {
        const definitionId = Number(item?.definitionId || 0);
        return !definitionId || !usedDefinitionIds.has(definitionId);
      });
      if (fillerIndex === -1) {
        return {
          ok: false,
          reason: `missing normal replacement for slot ${target.index + 1}`,
          players,
          changes,
          inspection: inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount }),
        };
      }

      const [filler] = fillers.splice(fillerIndex, 1);
      players[target.index] = filler.item;
      const fillerDefinitionId = Number(filler.item?.definitionId || 0);
      if (fillerDefinitionId) usedDefinitionIds.add(fillerDefinitionId);
      changes.push({
        index: target.index,
        from: target.item,
        to: filler.item,
        pileName: filler.pileName,
        reason: 'replace protected squad item',
      });
    }

    const plannedInspection = inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount });
    return {
      ok: !plannedInspection.blocked.length && !(plannedInspection.missingRequirements || []).length,
      players,
      changes,
      inspection: plannedInspection,
      reason: plannedInspection.blocked.length || plannedInspection.missingRequirements?.length
        ? 'repair plan still has protected or missing requirements'
        : '',
    };
  }

  async function repairProtectedSquadItemsIfNeeded(loopDef, opened, fillResult, inspection) {
    if (!inspection?.blocked?.length) {
      return { fillResult, inspection, planned: false, repaired: false };
    }

    const maxAttempts = Math.max(0, Math.min(3, Number(loopDef.protectedRepairMaxAttempts ?? 1) || 0));
    if (!maxAttempts) return { fillResult, inspection, planned: false, repaired: false };

    let nextFillResult = fillResult;
    let nextInspection = inspection;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const plan = buildProtectedSquadRepairPlan(loopDef, nextInspection);
      if (!plan) {
        log(`${loopDef.name}: protected squad repair found no eligible normal replacement`);
        return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: false };
      }

      (plan.changes || []).forEach((change) => {
        log(`${loopDef.name}: protected squad repair ${attempt}/${maxAttempts} - ${formatRepairChange(change)}`);
      });
      if (!plan.ok) {
        log(`${loopDef.name}: protected squad repair plan incomplete: ${plan.reason || 'unknown'}`);
        return { fillResult: nextFillResult, inspection: plan.inspection || nextInspection, planned: false, repaired: false };
      }

      if (loopDef.dryRun) {
        log(`${loopDef.name}: dry-run would save protected squad repair and re-check before submit`);
        return {
          fillResult: nextFillResult,
          inspection: plan.inspection,
          planned: true,
          repaired: false,
        };
      }

      log(`${loopDef.name}: saving protected squad repair plan`);
      await saveChallengeSquad(opened.challenge, plan.players, `${loopDef.name} protected squad repair`);
      await waitLoadingEnd();
      await sleep(900);

      const squad = ctrl()?._squad || opened.challenge?.squad || nextFillResult?.squad;
      nextFillResult = {
        ...nextFillResult,
        squad,
        filled: getFilledSquadSlots(squad),
        submitReady: !!findSubmitButton(),
      };
      nextInspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount: nextInspection.expectedPlayerCount });
      logSbcSquadInspection(loopDef, nextInspection);
      log(`${loopDef.name}: after protected squad repair submit ${nextFillResult.submitReady ? 'ready' : 'not ready'}`);
      if (!nextInspection.blocked.length) {
        return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: true };
      }
    }

    return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: true };
  }

  function parseMissingPlayerCount(inspection = {}) {
    const message = (inspection.missingRequirements || []).find((entry) => String(entry).startsWith('player-count '));
    if (!message) return null;
    const match = String(message).match(/player-count\s+(\d+)\/(\d+)/);
    if (!match) return null;
    const current = Number(match[1]);
    const expected = Number(match[2]);
    if (!Number.isFinite(current) || !Number.isFinite(expected) || expected <= current) return null;
    return { current, expected, missing: expected - current };
  }

  function buildMissingPlayerFillPlan(loopDef, inspection) {
    const missing = parseMissingPlayerCount(inspection);
    if (!missing) return null;
    const players = [...(inspection.items || [])];
    const usedIds = new Set(players.map((item) => Number(item?.id || 0)).filter(Boolean));
    const usedDefinitionIds = new Set(players.map((item) => Number(item?.definitionId || 0)).filter(Boolean));
    const fillers = sortNormalRepairEntries(getEligibleNormalRepairEntries(loopDef, usedIds, { usedDefinitionIds }));
    const changes = [];

    for (let offset = 0; offset < missing.missing; offset++) {
      const filler = fillers.find(({ item }) => {
        const definitionId = Number(item?.definitionId || 0);
        return !definitionId || !usedDefinitionIds.has(definitionId);
      });
      if (!filler) return null;
      const fillerIndex = fillers.indexOf(filler);
      if (fillerIndex >= 0) fillers.splice(fillerIndex, 1);
      players.push(filler.item);
      usedIds.add(Number(filler.item?.id || 0));
      const definitionId = Number(filler.item?.definitionId || 0);
      if (definitionId) usedDefinitionIds.add(definitionId);
      changes.push({
        index: missing.current + offset,
        from: null,
        to: filler.item,
        pileName: filler.pileName,
        reason: 'submit-ready missing player fill',
      });
    }

    const plannedInspection = inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount });
    return {
      players,
      changes,
      inspection: plannedInspection,
    };
  }

  function buildSubmitReadyNormalUpgradePlan(loopDef, inspection) {
    if (!inspection?.items?.length || inspection.blocked?.length) return null;
    const missingNonPlayerCount = (inspection.missingRequirements || []).filter((message) => !String(message).startsWith('player-count '));
    if (missingNonPlayerCount.length) return null;
    if (parseMissingPlayerCount(inspection)) {
      return buildMissingPlayerFillPlan(loopDef, inspection);
    }
    const usedIds = new Set((inspection.items || []).map((item) => Number(item?.id || 0)).filter(Boolean));
    const targets = [...(inspection.entries || [])]
      .filter(({ item, reasons }) => item && !isSbcSpecialItem(item) && !(reasons || []).length)
      .sort((a, b) =>
        Number(a?.item?.rating || 0) - Number(b?.item?.rating || 0) ||
        Number(b?.index || 0) - Number(a?.index || 0)
    );
    if (!targets.length) return null;

    for (const target of targets) {
      const targetRating = Number(target.item?.rating || 0) || 0;
      const usedDefinitionIds = new Set((inspection.items || [])
        .filter((item, index) => index !== target.index)
        .map((item) => Number(item?.definitionId || 0))
        .filter(Boolean));
      const fillers = sortNormalRepairEntries(getEligibleNormalRepairEntries(loopDef, usedIds, { usedDefinitionIds }));
      const filler = fillers.find(({ item }) => Number(item?.rating || 0) > targetRating);
      if (!filler) continue;
      const players = [...inspection.items];
      players[target.index] = filler.item;
      return {
        players,
        changes: [{
          index: target.index,
          from: target.item,
          to: filler.item,
          pileName: filler.pileName,
          reason: 'submit-ready rating repair',
        }],
      };
    }
    return null;
  }

  function summarizeSquadRatings(items = []) {
    const counts = new Map();
    for (const item of items || []) {
      const rating = Number(item?.rating || 0);
      if (!rating) continue;
      counts.set(rating, (counts.get(rating) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([rating, count]) => `${rating}x${count}`)
      .join(', ') || 'none';
  }

  async function repairSubmitReadinessIfNeeded(loopDef, opened, fillResult, inspection) {
    const missingRequirements = inspection.missingRequirements || [];
    const hasNonPlayerCountMissing = missingRequirements.some((message) => !String(message).startsWith('player-count '));
    if (fillResult.submitReady || inspection.blocked?.length || hasNonPlayerCountMissing) {
      return { fillResult, inspection, planned: false, repaired: false };
    }

    const maxAttempts = Math.max(0, Math.min(10, Number(loopDef.submitReadyRepairMaxAttempts ?? 2) || 0));
    if (!maxAttempts) return { fillResult, inspection, planned: false, repaired: false };

    let nextFillResult = fillResult;
    let nextInspection = inspection;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const plan = buildSubmitReadyNormalUpgradePlan(loopDef, nextInspection);
      if (!plan) {
        const missingPlayers = parseMissingPlayerCount(nextInspection);
        if (missingPlayers) {
          log(`${loopDef.name}: submit-ready repair found no eligible normal gold player to fill ${missingPlayers.current}/${missingPlayers.expected} squad slots`);
        } else {
          log(`${loopDef.name}: submit-ready repair found no eligible normal gold upgrade candidate`);
        }
        const maxRating = Number(loopDef.maxNormalGoldSubmittedRating || loopDef.maxSubmittedRating || 0);
        log(`${loopDef.name}: safe fodder exhausted at squad ratings ${summarizeSquadRatings(nextInspection.items)}; no unused eligible normal gold card can raise another slot${maxRating ? ` within rating <= ${maxRating}` : ''}; special, FSU-locked, and over-cap cards remain protected`);
        return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: false };
      }

      const changes = plan.changes || (plan.change ? [plan.change] : []);
      changes.forEach((change) => {
        log(`${loopDef.name}: submit-ready repair ${attempt}/${maxAttempts} - ${formatRepairChange(change)}`);
      });
      if (loopDef.dryRun) {
        log(`${loopDef.name}: dry-run would save submit-ready repair and re-check before submit`);
        return {
          fillResult: nextFillResult,
          inspection: inspectSbcItems(loopDef, plan.players, { expectedPlayerCount: nextInspection.expectedPlayerCount }),
          planned: true,
          repaired: false,
        };
      }

      await saveChallengeSquad(opened.challenge, plan.players, `${loopDef.name} submit-ready repair`);
      await waitLoadingEnd();
      await sleep(900);

      const squad = ctrl()?._squad || opened.challenge?.squad || nextFillResult?.squad;
      nextFillResult = {
        ...nextFillResult,
        squad,
        filled: getFilledSquadSlots(squad),
        submitReady: !!findSubmitButton(),
      };
      nextInspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount: nextInspection.expectedPlayerCount });
      logSbcSquadInspection(loopDef, nextInspection);
      log(`${loopDef.name}: after submit-ready repair submit ${nextFillResult.submitReady ? 'ready' : 'not ready'}`);
      if (nextFillResult.submitReady || nextInspection.blocked.length || nextInspection.missingRequirements?.length) {
        return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: true };
      }
    }

    return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: true };
  }

  function getDryRunInjectableIssues(loopDef, inspection) {
    if (!needsAutoTotwPreflight(loopDef)) return {
      blocked: inspection?.blocked || [],
      missingRequirements: inspection?.missingRequirements || [],
    };
    return {
      blocked: (inspection?.blocked || []).filter(({ reasons }) =>
        !(reasons || []).every((reason) => String(reason).startsWith('required-totw'))
      ),
      missingRequirements: (inspection?.missingRequirements || []).filter((message) =>
        !String(message).startsWith('special-count')
      ),
    };
  }

  async function injectRequiredTotwIfNeeded(loopDef, opened, fillResult, inspection) {
    if (!needsRequiredTotwInjection(loopDef, inspection)) {
      return { fillResult, inspection, planned: false, injected: false };
    }

    const plan = buildRequiredTotwRepairPlan(loopDef, inspection);
    if (!plan) {
      log(`${loopDef.name}: no complete required ${requiredSpecialLabel(loopDef)} repair plan could be built`);
      return { fillResult, inspection, planned: false, injected: false };
    }

    if (plan.keepTotwMessage) log(`${loopDef.name}: required ${requiredSpecialLabel(loopDef)} repair plan: ${plan.keepTotwMessage}`);
    (plan.changes || []).forEach((change) => {
      log(`${loopDef.name}: required ${requiredSpecialLabel(loopDef)} repair - ${formatRepairChange(change)}`);
    });
    if (!plan.ok) {
      log(`${loopDef.name}: required ${requiredSpecialLabel(loopDef)} repair plan incomplete: ${plan.reason || 'unknown'}`);
      return { fillResult, inspection: plan.inspection || inspection, planned: false, injected: false };
    }

    if (loopDef.dryRun) {
      log(`${loopDef.name}: dry-run would save required ${requiredSpecialLabel(loopDef)} repair plan and re-check before submit`);
      return { fillResult, inspection: plan.inspection, planned: true, injected: false };
    }

    log(`${loopDef.name}: saving required ${requiredSpecialLabel(loopDef)} repair plan`);
    await saveChallengeSquad(opened.challenge, plan.players, `${loopDef.name} required special repair`);
    await waitLoadingEnd();
    await sleep(900);

    const squad = ctrl()?._squad || opened.challenge?.squad || fillResult?.squad;
    const nextFillResult = {
      ...fillResult,
      squad,
      filled: getFilledSquadSlots(squad),
      submitReady: !!findSubmitButton(),
    };
    const nextInspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount: inspection.expectedPlayerCount });
    logSbcSquadInspection(loopDef, nextInspection);
    log(`${loopDef.name}: after required ${requiredSpecialLabel(loopDef)} repair submit ${nextFillResult.submitReady ? 'ready' : 'not ready'}`);
    return { fillResult: nextFillResult, inspection: nextInspection, planned: false, injected: true };
  }

  function getAutoTotwUpgradeDef(loopDef = {}) {
    const override = isPlainObject(loopDef.autoTotwUpgrade) ? loopDef.autoTotwUpgrade : {};
    return {
      id: `${loopDef.id || 'fill-and-verify'}-auto-totw-upgrade`,
      name: '84+ TOTW Upgrade',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['84+ TOTW Upgrade', '84+ TOTW', 'TOTW Upgrade', '84+ TOTW 升级', '84+ TOTW 升級'],
      rewardPackIds: [20707, 20441],
      rewardPackNames: ['84+ TOTW 1-30 Player Pack', 'TOTW 1-30 Player Pack', '84+ TOTW 1-30', 'TOTW 1-30', '84+ TOTW Player Pack', 'TOTW Player Pack', '84+ TOTW Pack', 'TOTW Pack', 'TOTW Provision Refresh', 'TOTW Provision Refresh Pack'],
      maxCompletions: 1,
      maxSubmittedRating: 88,
      maxNormalGoldSubmittedRating: 99,
      inventoryFillFirst: true,
      requirements: [
        { tier: 'gold', rarity: 'rare', count: 6, minRating: 84, maxRating: 99, playerOnly: true, allowSpecial: false, priorityPiles: ['storage', 'club'] },
        { tier: 'gold', rarity: 'rare', count: 5, minRating: 82, maxRating: 99, playerOnly: true, allowSpecial: false, priorityPiles: ['storage', 'club'] },
      ],
      priorityPiles: ['storage', 'club'],
      requiredSpecialCount: 0,
      allowedSpecialCount: 0,
      blockSpecial: true,
      blockTradeable: false,
      submitReadyRepairMaxAttempts: 8,
      openRewardPacks: true,
      ...override,
    };
  }

  async function openExistingAutoTotwPackIfAvailable(loopDef, upgradeDef) {
    const pack = await findRewardPack(upgradeDef, null, {
      attempts: 2,
      delayMs: 1000,
      fallbackPackMatcher: isLikelyTotwRewardPack,
    });
    if (!pack) return false;
    log(`${loopDef.name}: opening existing ${upgradeDef.name} reward pack before crafting another ${requiredSpecialLabel(loopDef)}: ${packName(pack)} (#${pack.id})`);
    const opened = await openRewardPackAndCleanup(upgradeDef, pack.id, 'existing auto TOTW reward pack', {
      assumeTotwReward: true,
      fallbackPackMatcher: isLikelyTotwRewardPack,
      openAttempts: 3,
    });
    if (opened) {
      await refreshInventoryCaches(`${loopDef.name} post-existing TOTW pack`, { includePacks: false, quiet: true });
      resolveRecentRewardItems(`${loopDef.name} post-existing TOTW pack`);
    }
    return opened;
  }

  async function craftAutoTotwUpgrade(loopDef) {
    const upgradeDef = getAutoTotwUpgradeDef(loopDef);
    log(`${loopDef.name}: no eligible ${requiredSpecialLabel(loopDef)} found; submitting ${upgradeDef.name} first`);

    const set = await findSbcSet(upgradeDef.sbcNames, upgradeDef.name);
    const opened = await openSbcSet(set, { returnNullIfComplete: true });
    if (!opened) {
      const reason = `no available ${upgradeDef.name} challenge remains; cannot auto-craft ${requiredSpecialLabel(loopDef)}`;
      log(`${loopDef.name}: ${reason}`);
      return { ok: false, reason };
    }

    let fillResult;
    let inspection;
    if (shouldUseInventoryFirstFill(upgradeDef)) {
      const inventoryFill = await fillSbcSquadInventoryFirst(upgradeDef, opened, { stopOnMissingSelection: true });
      if (!inventoryFill.ok) {
        const reason = `${upgradeDef.name} ${inventoryFill.reason || 'inventory-first fill is missing required items'}`;
        log(`${loopDef.name}: cannot auto-craft ${requiredSpecialLabel(loopDef)} because ${reason}`);
        return { ok: false, reason };
      }
      fillResult = inventoryFill.fillResult;
      inspection = inventoryFill.inspection;
    } else {
      fillResult = await fillSbcSquad(upgradeDef.name, {
        requireSubmitReady: false,
        specialRequirementAdd: upgradeDef.specialRequirementAdd,
      });
      const filledSquad = fillResult.squad || ctrl()?._squad || opened.challenge?.squad;
      inspection = inspectSbcSquad(upgradeDef, filledSquad);
      logSbcSquadInspection(upgradeDef, inspection);
    }
    let squad = fillResult.squad || ctrl()?._squad || opened.challenge?.squad;

    const protectedRepair = await repairProtectedSquadItemsIfNeeded(upgradeDef, opened, fillResult, inspection);
    fillResult = protectedRepair.fillResult;
    inspection = protectedRepair.inspection;
    squad = fillResult.squad || squad;

    const submitReadyRepair = await repairSubmitReadinessIfNeeded(upgradeDef, opened, fillResult, inspection);
    fillResult = submitReadyRepair.fillResult;
    inspection = submitReadyRepair.inspection;
    squad = fillResult.squad || squad;

    if (!fillResult.submitReady) {
      const normalGoldLimit = upgradeDef.maxNormalGoldSubmittedRating || upgradeDef.maxSubmittedRating || 'none';
      const reason = `safe normal-gold fodder exhausted before submit became ready (squad ratings ${summarizeSquadRatings(inspection.items)}; max allowed ${normalGoldLimit})`;
      log(`${loopDef.name}: cannot auto-craft ${requiredSpecialLabel(loopDef)} because ${upgradeDef.name} ${reason}`);
      return { ok: false, reason };
    }
    assertSbcSquadSafe(upgradeDef, inspection);

    const rewardPackId = await submitSbcAndGetAwardPackId(opened.set);
    markSbcItemsConsumed(inspection.items, upgradeDef.name);
    if (!rewardPackId) {
      log(`${loopDef.name}: ${upgradeDef.name} submitted but reward pack id was not detected`);
    }
    const openedReward = await openRewardPackAndCleanup(upgradeDef, rewardPackId, 'auto TOTW reward pack', {
      assumeTotwReward: true,
      fallbackPackMatcher: isLikelyTotwRewardPack,
      openAttempts: 3,
      findAttempts: 18,
      findDelayMs: 2500,
      logWait: true,
    });
    if (!openedReward) {
      log(`${loopDef.name}: ${upgradeDef.name} reward pack could not be auto-opened; checking inventory anyway`);
    }
    return { ok: true };
  }

  async function ensureTotwForFillAndVerify(loopDef) {
    if (!needsAutoTotwPreflight(loopDef)) return true;
    const required = Math.max(1, Number(loopDef.requiredSpecialCount || 1) || 1);
    await refreshInventoryCaches(`${loopDef.name} ${requiredSpecialLabel(loopDef)} preflight`, { includePacks: false, quiet: true });
    resolveRecentRewardItems(`${loopDef.name} ${requiredSpecialLabel(loopDef)} preflight`);

    let entries = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef));
    if (entries.length >= required) {
      log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} preflight found ${entries.length} eligible ${requiredSpecialLabel(loopDef)} card(s): ${summarizeRequiredSpecialEntries(entries)}`);
      return true;
    }
    logRequiredSpecialPreflightDiagnostics(loopDef);

    const upgradeDef = getAutoTotwUpgradeDef(loopDef);
    if (loopDef.dryRun) {
      await refreshStorePacks().catch(() => null);
      const existingPack = findRewardPackInCache(upgradeDef, null);
      if (existingPack) {
        log(`${loopDef.name}: dry-run found unopened ${upgradeDef.name} reward pack ${packName(existingPack)} (#${existingPack.id}); live run would open it before crafting another ${requiredSpecialLabel(loopDef)}`);
        return true;
      }
      const set = await findSbcSet(upgradeDef.sbcNames, upgradeDef.name);
      const challenge = await findAvailableSbcChallenge(set, upgradeDef.name);
      if (challenge) {
        log(`${loopDef.name}: dry-run found no eligible ${requiredSpecialLabel(loopDef)}; live run would submit ${upgradeDef.name} (#${set.id || '?'}) first`);
      } else {
        log(`${loopDef.name}: dry-run found no eligible ${requiredSpecialLabel(loopDef)} and no available ${upgradeDef.name} challenge remains`);
      }
      return true;
    }

    const openedExistingPack = await openExistingAutoTotwPackIfAvailable(loopDef, upgradeDef);
    if (openedExistingPack) {
      entries = await waitForSubmittableRequiredSpecialEntries(loopDef, required, 'post-existing TOTW pack');
      if (entries.length >= required) {
        log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} ready after opening existing pack: ${summarizeRequiredSpecialEntries(entries)}`);
        return true;
      }
      log(`${loopDef.name}: existing ${upgradeDef.name} reward pack opened but no eligible ${requiredSpecialLabel(loopDef)} was detected; trying ${upgradeDef.name} SBC if available`);
    }

    const crafted = await craftAutoTotwUpgrade(loopDef);
    if (!crafted?.ok) {
      log(`${loopDef.name}: stopping before SBC fill because required ${requiredSpecialLabel(loopDef)} is unavailable (${crafted?.reason || 'auto craft failed'})`);
      return false;
    }
    await refreshInventoryCaches(`${loopDef.name} post-TOTW craft`, { includePacks: false, quiet: true });
    resolveRecentRewardItems(`${loopDef.name} post-TOTW craft`);
    entries = await waitForSubmittableRequiredSpecialEntries(loopDef, required, 'post-TOTW craft');
    if (entries.length < required) {
      fail(`${loopDef.name}: ${upgradeDef.name} completed/opened but no eligible ${requiredSpecialLabel(loopDef)} card was detected for 84x10; check the reward item log and inventory state`);
    }
    log(`${loopDef.name}: auto ${requiredSpecialLabel(loopDef)} ready: ${summarizeRequiredSpecialEntries(entries)}`);
    return true;
  }

  function getSbcProtectionReasons(item, loopDef = {}, context = {}) {
    const reasons = [];
    const rating = Number(item?.rating || 0);
    const itemId = Number(item?.id || 0);
    const maxRating = getSubmittedRatingLimit(item, loopDef);
    const protectedIds = new Set((loopDef.protectedItemIds || []).map(Number));
    const protectedDefinitionIds = new Set((loopDef.protectedDefinitionIds || []).map(Number));
    const allowedSpecialCount = Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
    const requiredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
    const specialIndex = Number(context.specialIndex || 0) || 0;
    const fsuSpec = {
      playerOnly: true,
      allowSpecial: requiredSpecialCount > 0 && specialIndex <= requiredSpecialCount,
    };

    if (itemId && state.consumedItemIds.has(itemId)) reasons.push('consumed-this-run');
    if (isConceptItem(item)) reasons.push('concept');
    try { if (item?.isEnrolledInAcademy?.()) reasons.push('academy'); } catch { }
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) reasons.push('active-trade');
    if (!isInactiveTrade(item)) {
      if (!reasons.includes('active-trade')) reasons.push('active-trade');
    }
    if (protectedIds.has(itemId)) reasons.push('protected-id');
    if (protectedDefinitionIds.has(Number(item?.definitionId || 0))) reasons.push('protected-def');
    if (
      ['totw', 'totw-tots-fof'].includes(requiredSpecialKind(loopDef)) &&
      requiredSpecialCount > 0 &&
      isSbcSpecialItem(item) &&
      specialIndex <= requiredSpecialCount &&
      !isRequiredSpecialItem(item, loopDef)
    ) {
      reasons.push('required-totw');
    }
    if (
      ['totw', 'totw-tots-fof'].includes(requiredSpecialKind(loopDef)) &&
      requiredSpecialCount > 0 &&
      isRequiredSpecialItem(item, loopDef) &&
      specialIndex <= requiredSpecialCount &&
      Number(loopDef.requiredSpecialMinRating || 0) &&
      rating < Number(loopDef.requiredSpecialMinRating || 0)
    ) {
      reasons.push(`required-totw-min-${Number(loopDef.requiredSpecialMinRating || 0)}`);
    }
    if (loopDef.blockSpecial !== false && isSbcSpecialItem(item) && (!allowedSpecialCount || specialIndex > allowedSpecialCount)) {
      reasons.push('special-blocked');
    }
    if (loopDef.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) reasons.push('tradeable-blocked');
    if (maxRating && rating > maxRating) reasons.push(`rating-over-${maxRating}`);
    getFsuRejectReasons(item, fsuSpec).forEach((reason) => {
      if (!reasons.includes(reason)) reasons.push(reason);
    });

    return reasons;
  }

  function inspectSbcItems(loopDef, items = [], options = {}) {
    const blocked = [];
    const entries = [];
    let specialCount = 0;
    const requiredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
    const expectedPlayerCount = Math.max(
      0,
      Number(options.expectedPlayerCount || 0) ||
      Number(loopDef.expectedPlayerCount || 0) ||
      (loopDef.inventoryFillFirst === true ? sumRequirementPlayerCount(loopDef) : 0) ||
      0
    );

    items.forEach((item, index) => {
      if (isSbcSpecialItem(item)) specialCount++;
      const reasons = getSbcProtectionReasons(item, loopDef, { specialIndex: specialCount });
      entries.push({ item, index, reasons });
      if (reasons.length) blocked.push({ item, index, reasons });
    });

    const requiredSpecialMetCount = entries.filter(({ item, reasons }) =>
      isRequiredSpecialItem(item, loopDef) &&
      !(reasons || []).some((reason) =>
        String(reason).startsWith('required-totw') ||
        String(reason).startsWith('rating-over-') ||
        String(reason).startsWith('fsu-') ||
        ['special-blocked', 'tradeable-blocked', 'protected-id', 'protected-def', 'concept', 'academy', 'active-trade', 'consumed-this-run'].includes(String(reason))
      )
    ).length;
    const missingRequirements = [];
    if (expectedPlayerCount && items.length < expectedPlayerCount) {
      missingRequirements.push(`player-count ${items.length}/${expectedPlayerCount}`);
    }
    if (requiredSpecialCount && requiredSpecialMetCount < requiredSpecialCount) {
      missingRequirements.push(`special-count ${requiredSpecialMetCount}/${requiredSpecialCount}`);
    }

    return { items, entries, blocked, specialCount, requiredSpecialMetCount, expectedPlayerCount, missingRequirements };
  }

  function inspectSbcSquad(loopDef, squad = ctrl()?._squad, options = {}) {
    return inspectSbcItems(loopDef, getSquadItems(squad), options);
  }

  function logSbcSquadInspection(loopDef, inspection, options = {}) {
    const maxItems = Number(options.maxItems || 20);
    const requiredPart = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0)
      ? `, ${requiredSpecialLabel(loopDef)} ${inspection.requiredSpecialMetCount || 0}/${Number(loopDef.requiredSpecialCount || 0)}`
      : '';
    const playerCountPart = inspection.expectedPlayerCount
      ? `${inspection.items.length}/${inspection.expectedPlayerCount}`
      : String(inspection.items.length);
    log(`${loopDef.name}: squad inspection ${playerCountPart} item(s), special ${inspection.specialCount || 0}${requiredPart}, blocked ${inspection.blocked.length}`);
    (inspection.entries || []).slice(0, maxItems).forEach(({ item, index, reasons }) => {
      log(`${loopDef.name}: squad ${formatSquadItem(item, index)}${reasons.length ? ` | BLOCK ${reasons.join(',')}` : ''}`);
    });
    if (inspection.items.length > maxItems) {
      log(`${loopDef.name}: squad list truncated: ${inspection.items.length - maxItems} more item(s)`);
    }
    (inspection.missingRequirements || []).forEach((message) => {
      log(`${loopDef.name}: missing requirement ${message}`);
    });
  }

  function getManualSbcFixHints(loopDef, inspection) {
    const hints = [];
    const allowedSpecialCount = Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
    const requiredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);

    for (const { item, index, reasons } of inspection.blocked || []) {
      const name = itemDisplayName(item);
      const rating = Number(item?.rating || 0) || '?';
      const itemId = Number(item?.id || 0) || '?';
      const definitionId = Number(item?.definitionId || 0) || '?';
      const ratingLimit = getSubmittedRatingLimit(item, loopDef);
      const prefix = `slot ${index + 1} ${name} rating:${rating} id:${itemId} def:${definitionId}`;
      if (reasons.some((reason) => reason.startsWith('rating-over-'))) {
        const replacement = isNormalGoldFodder(item) ? 'normal gold card' : 'untradeable card';
        hints.push(`${prefix}: replace with rating <= ${ratingLimit || 'limit'} ${replacement}`);
      }
      if (reasons.includes('special-blocked')) {
        hints.push(`${prefix}: replace extra special card with a normal/rare gold card`);
      }
      if (reasons.includes('required-totw')) {
        hints.push(`${prefix}: replace this special card with a ${requiredSpecialLabel(loopDef)} card`);
      }
      const requiredTotwMinReason = reasons.find((reason) => String(reason).startsWith('required-totw-min-'));
      if (requiredTotwMinReason) {
        const minRating = requiredTotwMinReason.replace('required-totw-min-', '') || Number(loopDef.requiredSpecialMinRating || 0) || '?';
        hints.push(`${prefix}: replace with a ${requiredSpecialLabel(loopDef)} card rating >= ${minRating}`);
      }
      if (reasons.includes('tradeable-blocked')) {
        hints.push(`${prefix}: replace tradeable card with an untradeable card`);
      }
      if (reasons.includes('consumed-this-run')) {
        hints.push(`${prefix}: stale cache item was already submitted in this run; refresh/retry or replace it`);
      }
      if (reasons.includes('fsu-only-untradeable')) {
        hints.push(`${prefix}: FSU Only Untradeable is enabled; replace with an untradeable card`);
      }
      if (reasons.includes('fsu-exclude-evolution')) {
        hints.push(`${prefix}: FSU Exclude Evolution is enabled; replace this Evolution card`);
      }
      const leagueReason = reasons.find((reason) => reason.startsWith('fsu-excluded-league-'));
      if (leagueReason) {
        hints.push(`${prefix}: FSU excluded league ${leagueReason.replace('fsu-excluded-league-', '')}; replace with another league`);
      }
      const goldRangeReason = reasons.find((reason) => reason.startsWith('fsu-gold-range-'));
      if (goldRangeReason) {
        hints.push(`${prefix}: outside FSU Golden Player Range ${goldRangeReason.replace('fsu-gold-range-', '')}; replace it or change FSU settings`);
      }
      if (reasons.includes('fsu-rarity-player-off')) {
        hints.push(`${prefix}: FSU Use Rarity Player is off; replace this special/rarity card`);
      }
      if (reasons.includes('fsu-locked-player')) {
        hints.push(`${prefix}: locked in FSU Lock player; unlock it or replace this card`);
      }
      if (reasons.includes('concept')) {
        hints.push(`${prefix}: replace concept card`);
      }
      if (reasons.includes('academy')) {
        hints.push(`${prefix}: replace academy/evolution locked card`);
      }
      if (reasons.includes('active-trade')) {
        hints.push(`${prefix}: remove active transfer/listed card`);
      }
      if (reasons.includes('protected-id') || reasons.includes('protected-def')) {
        hints.push(`${prefix}: protected by custom config; replace it before live submit`);
      }
    }

    if (requiredSpecialCount && (inspection.requiredSpecialMetCount || 0) < requiredSpecialCount) {
      const requiredSpecialMaxRating = Number(loopDef.maxSubmittedRating || 0);
      hints.push(`add ${requiredSpecialCount - (inspection.requiredSpecialMetCount || 0)} untradeable ${requiredSpecialLabel(loopDef)} card(s) rating <= ${requiredSpecialMaxRating || 'limit'}`);
    }
    const missingPlayers = parseMissingPlayerCount(inspection);
    if (missingPlayers) {
      hints.push(`add ${missingPlayers.missing} eligible normal gold player(s) to fill ${missingPlayers.current}/${missingPlayers.expected} squad slots`);
    }
    if (allowedSpecialCount && (inspection.specialCount || 0) > allowedSpecialCount) {
      hints.push(`keep only ${allowedSpecialCount} special card(s); replace the remaining special card(s) with normal/rare gold`);
    }

    return [...new Set(hints)];
  }

  function logManualSbcFixHints(loopDef, inspection) {
    const hints = getManualSbcFixHints(loopDef, inspection);
    if (!hints.length) return;
    log(`${loopDef.name}: manual fix needed before live submit:`);
    hints.slice(0, 12).forEach((hint) => log(`${loopDef.name}: manual fix - ${hint}`));
    if (hints.length > 12) log(`${loopDef.name}: manual fix list truncated: ${hints.length - 12} more`);
  }

  function assertSbcSquadSafe(loopDef, inspection) {
    if (!inspection.items.length) fail(`${loopDef.name}: no squad items detected after fill`);
    if (inspection.missingRequirements?.length) {
      logManualSbcFixHints(loopDef, inspection);
      fail(`${loopDef.name}: missing squad requirement(s): ${inspection.missingRequirements.join(', ')}`);
    }
    if (!inspection.blocked.length) return;

    logManualSbcFixHints(loopDef, inspection);
    const summary = inspection.blocked
      .slice(0, 10)
      .map(({ item, index, reasons }) => `${index + 1}. ${itemDisplayName(item)} rating:${Number(item?.rating || 0) || '?'} (${reasons.join(',')})`)
      .join('; ');
    fail(`${loopDef.name}: protected squad item(s) detected; stop before submit: ${summary}`);
  }

  function compactModalText(text = '') {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  }

  function findSbcSubmitErrorModal() {
    const modals = Array.from(document.querySelectorAll([
      '.view-modal-container',
      '.ut-modal-view',
      '.ea-dialog',
      '.modal-content',
      '.ut-dialog',
    ].join(',')));
    for (const modal of modals) {
      const text = compactModalText(modal.textContent || '');
      if (!text) continue;
      if (
        /Ineligible Squad/i.test(text) ||
        /Concept or Loan Players/i.test(text) ||
        /cannot be submitted in Squad Building Challenges/i.test(text) ||
        /Squads containing .*Loan/i.test(text)
      ) {
        return { modal, text };
      }
    }
    return null;
  }

  function dismissSubmitErrorModal(error) {
    const modal = error?.modal;
    if (!modal) return false;
    const buttons = Array.from(modal.querySelectorAll('button'));
    const button = buttons.find((btn) => /^(ok|okay|确定|確定)$/i.test(String(btn.textContent || '').trim())) ||
      buttons.find((btn) => !btn.disabled);
    if (!button) return false;
    simulateClick(button);
    return true;
  }

  function failIfSbcSubmitError(label = 'SBC submit') {
    const error = findSbcSubmitErrorModal();
    if (!error) return false;
    dismissSubmitErrorModal(error);
    fail(`${label}: submit blocked by EA modal: ${error.text}`);
  }

  async function fillBronzeUpgradeSquad() {
    await fillSbcSquad('Bronze Upgrade');
  }

  function findClaimRewardsButton() {
    const patterns = [
      'Claim Rewards',
      'Claim Reward',
      'Collect Rewards',
      'Collect Reward',
      '领取奖励',
      '領取獎勵',
      '领取',
      '領取',
    ];
    return findButtonByText(patterns) || findClickableByText(patterns);
  }

  function findClaimRewardsContext() {
    const selectors = [
      '.view-modal-container',
      '.ut-modal',
      '.modal',
      '[class*="modal"]',
      '[class*="Modal"]',
    ].join(',');
    const contexts = Array.from(document.querySelectorAll(selectors))
      .filter(isClickableElement)
      .map((el) => ({ el, text: compactText(el) }))
      .filter(({ text }) => text && text.length < 2000);
    return contexts.find(({ text }) =>
      matchesAny(text, ['Claim Rewards', 'Claim Reward', 'Collect Rewards', 'Collect Reward', '领取奖励', '領取獎勵']) ||
      (matchesAny(text, ['Reward', 'Rewards', '奖励', '獎勵']) && matchesAny(text, ['Pack', 'Player', 'Claim', 'Collect', '包', '球员', '球員', '领取', '領取']))
    ) || null;
  }

  async function claimSbcRewardsIfPresent(label = 'SBC submit') {
    const start = Date.now();
    let lastHotkeyAt = 0;
    while (Date.now() - start < 25000) {
      stopPoint();
      failIfSbcSubmitError(label);
      const btn = findClaimRewardsButton();
      if (btn) {
        log(`${label}: claiming rewards`);
        simulateClick(btn);
        await waitLoadingEnd(900, 45000);
        await sleep(1200);
        return true;
      }

      const context = findClaimRewardsContext();
      const now = Date.now();
      if (context && now - lastHotkeyAt > 2500) {
        lastHotkeyAt = now;
        log(`${label}: Claim Rewards button not clickable; trying AltRight reward hotkey`);
        simulateKeyStroke('Alt', 'AltRight', { altKey: true, location: 2 });
        simulateKeyStroke('AltRight', 'AltRight', { altKey: true, location: 2 });
        await waitLoadingEnd(500, 12000);
        await sleep(1200);
        return true;
      }
      await sleep(500);
    }
    const context = findClaimRewardsContext();
    const contextText = context?.text ? `; modal text: ${context.text.slice(0, 180)}` : '';
    log(`${label}: Claim Rewards button not detected${contextText}; continuing`);
    return false;
  }

  async function submitSbcAndGetAwardPackId(set) {
    const beforePackIds = new Set(getMyPacks().map((p) => String(p.id)));
    const submitBtn = await waitFor(() => findSubmitButton(), 10000, 'submit button');

    log(`Submitting SBC: ${set.name}`);
    simulateClick(submitBtn);
    await sleep(900);
    failIfSbcSubmitError(set.name);

    const confirm =
      document.querySelector('.view-modal-container button.call-to-action:not(.disabled)') ||
      findButtonByText([
        'Exchange Players',
        'Submit SBC',
        'Submit',
        'Confirm',
        'OK',
        'Ok',
        'Yes',
        '兑换球员',
        '交換球員',
        '提交',
        '确认',
        '確定',
        '确定',
        '是',
      ]);
    if (confirm && confirm !== submitBtn) {
      log(`Confirming SBC submit: ${confirm.textContent.trim() || confirm.className}`);
      simulateClick(confirm);
      await sleep(900);
      failIfSbcSubmitError(set.name);
    }

    await claimSbcRewardsIfPresent(set.name);
    await waitLoadingEnd(900, 45000);
    await refreshStorePacks().catch(() => null);

    const awardId = Number(set?.awards?.[0]?.value) || null;
    if (awardId) {
      clearStalePackId(awardId);
      return awardId;
    }

    const newPack = getMyPacks().find((p) => !beforePackIds.has(String(p.id)) && matchesAny(packName(p), CFG.silverRewardNames));
    const newPackId = newPack?.id || null;
    if (newPackId) clearStalePackId(newPackId);
    return newPackId;
  }

  async function openRewardSilverPack(packId) {
    await refreshStorePacks();
    let pack = findPackById(packId);
    if (!pack) pack = findPackByName(CFG.silverRewardNames);
    if (!pack) {
      const names = getMyPacks().map((p) => `${packName(p)} (#${p.id})`).join(', ');
      fail(`Silver reward pack not found. Current my packs: ${names || 'none'}`);
    }

    const items = await openPack(pack, 'Bronze Upgrade reward');
    const silverCount = items.filter((p) => isPlayer(p) && isSilver(p)).length;
    log(`Reward opened; detected ${silverCount} silver player(s)`);
    await handleSilverRewardItems(items);
  }

  async function findLoopPack(loopDef, explicitPackId = null) {
    await refreshStorePacks();
    let pack = explicitPackId ? findPackById(explicitPackId) : null;
    if (!pack && loopDef.rewardPackIds?.length) {
      pack = loopDef.rewardPackIds.map((id) => findPackById(id)).find(Boolean);
    }
    if (!pack && loopDef.sourcePackIds?.length) {
      pack = loopDef.sourcePackIds.map((id) => findPackById(id)).find(Boolean);
    }
    if (!pack && loopDef.rewardPackNames?.length) pack = findPackByName(loopDef.rewardPackNames);
    if (!pack && loopDef.sourcePackNames?.length) pack = findPackByName(loopDef.sourcePackNames);
    return pack || null;
  }

  function findRewardPackInCache(loopDef, explicitPackId = null, options = {}) {
    let pack = explicitPackId ? findPackById(explicitPackId) : null;
    if (!pack && loopDef.rewardPackIds?.length) {
      pack = loopDef.rewardPackIds.map((id) => findPackById(id)).find(Boolean);
    }
    if (!pack && loopDef.rewardPackNames?.length) pack = findPackByName(loopDef.rewardPackNames);
    if (!pack && options.fallbackPackMatcher) pack = findPackByPredicate(options.fallbackPackMatcher);
    return pack || null;
  }

  async function findRewardPack(loopDef, explicitPackId = null, options = {}) {
    const attempts = Math.max(1, Number(options.attempts || 1) || 1);
    const delayMs = Math.max(0, Number(options.delayMs || 0) || 0);
    let storeFallbackTried = false;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await refreshStorePacks().catch((e) => {
        if (attempt === attempts) log(`Reward pack refresh failed: ${e.message || e}`);
      });
      const pack = findRewardPackInCache(loopDef, explicitPackId, options);
      if (pack) return pack;
      if (
        options.openStoreFallback !== false &&
        !storeFallbackTried &&
        (attempt === attempts || attempt >= Math.max(2, Math.ceil(attempts / 2)))
      ) {
        storeFallbackTried = true;
        const openedStore = await openStorePacksViewForRefresh(`${loopDef.name}: reward pack lookup`).catch((e) => {
          log(`${loopDef.name}: Store Packs fallback skipped: ${e.message || e}`);
          return false;
        });
        if (openedStore) {
          const visiblePack = findRewardPackInCache(loopDef, explicitPackId, options);
          if (visiblePack) return visiblePack;
        }
      }
      if (options.logWait && (attempt === 1 || attempt === attempts || attempt % 4 === 0)) {
        log(`${loopDef.name}: waiting for reward pack${explicitPackId ? ` #${explicitPackId}` : ''} (${attempt}/${attempts}); current packs: ${summarizePacks() || 'none'}`);
      }
      if (attempt < attempts && delayMs) await sleep(delayMs);
    }
    return null;
  }

  async function openRewardPackAndCleanup(loopDef, rewardPackId, reason = 'reward pack', options = {}) {
    const openAttempts = Math.max(1, Math.min(5, Number(options.openAttempts || 1) || 1));
    for (let openAttempt = 1; openAttempt <= openAttempts; openAttempt++) {
      const pack = await findRewardPack(loopDef, rewardPackId, {
        attempts: options.findAttempts || 6,
        delayMs: options.findDelayMs || 1800,
        logWait: options.logWait,
        fallbackPackMatcher: options.fallbackPackMatcher,
      });
      if (!pack) {
        const packs = summarizePacks();
        log(`${loopDef.name}: reward pack not found for auto-open${rewardPackId ? ` (#${rewardPackId})` : ''}; current packs: ${packs || 'none'}`);
        return false;
      }

      const items = await openPack(pack, `${loopDef.name} ${reason}`, { allowGone: true });
      if (!items) {
        if (openAttempt < openAttempts) {
          log(`${loopDef.name}: retrying reward pack lookup after stale pack (${openAttempt}/${openAttempts})`);
          await sleep(900);
          continue;
        }
        return false;
      }
      log(`${loopDef.name}: auto-opened reward pack ${packName(pack)} (#${pack.id}); ${items.length || 0} item(s)`);
      if (options.assumeTotwReward) {
        markAssumedTotwRewardItems(items, `${loopDef.name} ${reason}`);
        await materializeOpenedPlayerRewards(items, `${loopDef.name} ${reason}`);
      }
      await clearUnassigned(`${loopDef.name} ${reason} handling`);
      resolveRecentRewardItems(`${loopDef.name} ${reason}`);
      return true;
    }

    return false;
  }

  async function findSourcePack(loopDef) {
    await refreshStorePacks();
    let pack = null;
    if (loopDef.sourcePackIds?.length) {
      pack = loopDef.sourcePackIds.map((id) => findPackById(id)).find(Boolean);
    }
    if (!pack && loopDef.sourcePackNames?.length) pack = findPackByName(loopDef.sourcePackNames);
    return pack || null;
  }

  async function submitConfiguredSbc(loopDef, options = {}) {
    const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
    const opened = await openSbcSet(set, { returnNullIfComplete: options.returnNullIfComplete });
    if (!opened) {
      log(`${loopDef.name}: no available SBC challenge remains`);
      return null;
    }
    await fillSbcSquad(loopDef.name);
    const squad = ctrl()?._squad || opened.challenge?.squad;
    const inspection = inspectSbcSquad(loopDef, squad);
    logSbcSquadInspection(loopDef, inspection);
    assertSbcSquadSafe(loopDef, inspection);
    const rewardPackId = await submitSbcAndGetAwardPackId(set);
    log(`${loopDef.name} reward pack id: ${rewardPackId || 'unknown'}`);
    return { submitted: true, rewardPackId };
  }

  function getUnassignedTargetDuplicates(loopDef) {
    return getUnassignedItems().filter((item) => isTargetDuplicate(item, loopDef));
  }

  async function handleRecyclePackItems(items, loopDef) {
    const targetDuplicates = (items || []).filter((item) => isTargetDuplicate(item, loopDef));
    const targetIds = new Set(targetDuplicates.map((item) => Number(item.id)));
    const directClub = (items || []).filter((item) => !targetIds.has(Number(item.id)) && !isDuplicate(item));

    if (directClub.length) {
      log(`Moving ${directClub.length} non-duplicate item(s) to club`);
      await moveItems(directClub, W.ItemPile.CLUB, true);
    }

    await clearUnassigned(`${loopDef.name} pack handling`, {
      reserveItem: (item) => isTargetDuplicate(item, loopDef),
    });

    await refreshUnassigned();
    const reserved = getUnassignedTargetDuplicates(loopDef);
    if (reserved.length) log(`${reserved.length} target duplicate(s) reserved for ${loopDef.name}`);
    return reserved;
  }

  async function runDailySingleCardRecycle(loopDef) {
    await waitAppReady();
    let completions = 0;
    let lastRewardPackId = null;

    while (completions < Number(loopDef.maxCompletions || 7)) {
      stopPoint();
      await refreshUnassigned();
      const targetDuplicates = getUnassignedTargetDuplicates(loopDef);

      if (targetDuplicates.length) {
        log(`${loopDef.name}: consuming target duplicate ${completions + 1}/${loopDef.maxCompletions}`);
        const submitResult = await submitConfiguredSbc(loopDef, { returnNullIfComplete: true });
        if (!submitResult) break;
        lastRewardPackId = submitResult.rewardPackId;
        completions++;
        await sleep(CFG.pauseMs);
        continue;
      }

      const pack = await findLoopPack(loopDef, lastRewardPackId);
      if (pack) {
        const items = await openPack(pack, loopDef.name, { allowGone: true });
        if (!items) {
          lastRewardPackId = null;
          await sleep(CFG.pauseMs);
          continue;
        }
        await handleRecyclePackItems(items, loopDef);
        lastRewardPackId = null;
        await sleep(CFG.pauseMs);
        continue;
      }

      log(`${loopDef.name}: no target duplicate or reward pack; submitting seed SBC ${completions + 1}/${loopDef.maxCompletions}`);
      const submitResult = await submitConfiguredSbc(loopDef, { returnNullIfComplete: true });
      if (!submitResult) break;
      lastRewardPackId = submitResult.rewardPackId;
      completions++;
      await sleep(CFG.pauseMs);
    }

    if (lastRewardPackId && loopDef.openRewardPacks) {
      const opened = await openRewardPackAndCleanup(loopDef, lastRewardPackId, 'final reward pack');
      if (!opened) log(`${loopDef.name}: final reward pack #${lastRewardPackId} left unopened`);
    } else if (lastRewardPackId) {
      log(`${loopDef.name}: final reward pack #${lastRewardPackId} left unopened`);
    }

    await clearUnassigned(`${loopDef.name} final cleanup`);
    log(`${loopDef.name}: submitted ${completions} SBC(s) in this run`);
  }

  function formatSelectionStats(stats = {}) {
    return ['unassigned', 'storage', 'transfer', 'club']
      .map((pile) => `${pile}:${stats[pile] || 0}`)
      .join(', ');
  }

  function loopDefWithPriorityPiles(loopDef, priorityPiles) {
    return {
      ...loopDef,
      priorityPiles,
      requirements: (loopDef.requirements || []).map((requirement) => ({
        ...requirement,
        blockTradeable: requirement.blockTradeable !== undefined ? requirement.blockTradeable : loopDef.blockTradeable,
        priorityPiles,
      })),
    };
  }

  function selectLoopInventoryPlayers(loopDef, priorityPiles = loopDef.priorityPiles) {
    const scopedLoopDef = loopDefWithPriorityPiles(loopDef, priorityPiles);
    return selectInventoryPlayers(scopedLoopDef.requirements, scopedLoopDef.priorityPiles);
  }

  function isDryRunEnabled() {
    return document.querySelector('#bronze-loop-dry-run')?.checked === true;
  }

  function isOpenRewardPacksEnabled() {
    return document.querySelector('#bronze-loop-open-rewards')?.checked === true;
  }

  async function runValidationBronzeUpgradeDryRun(loopDef) {
    await waitAppReady();
    await refreshStorePacks();
    const pack =
      (loopDef.sourcePackIds || CFG.sourcePackIds).map((id) => findPackById(id)).find(Boolean) ||
      findPackByName(loopDef.sourcePackNames || CFG.sourcePackNames);
    const set = await findSbcSet(loopDef.sbcNames || CFG.bronzeUpgradeNames, loopDef.name);
    log(`${loopDef.name}: dry-run source pack ${pack ? `${packName(pack)} (#${pack.id})` : 'not found'}`);
    log(`${loopDef.name}: dry-run SBC found ${set.name} (#${set.id || '?'})`);
    log(`${loopDef.name}: dry run stops before opening packs, filling squads, or submitting SBCs`);
  }

  async function runDailySingleCardRecycleDryRun(loopDef) {
    await waitAppReady();
    await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
    const targetDuplicates = getUnassignedTargetDuplicates(loopDef);
    if (targetDuplicates.length) {
      log(`${loopDef.name}: dry-run would consume ${targetDuplicates.length} target duplicate(s) before opening another pack`);
      logDryRunSelection(`${loopDef.name} target duplicates`, {
        ok: true,
        selected: targetDuplicates,
        entries: targetDuplicates.map((item) => ({ item, pileName: 'unassigned' })),
        stats: { unassigned: targetDuplicates.length },
      });
      log(`${loopDef.name}: dry run stops before FSU fill or SBC submit`);
      return;
    }

    const pack = await findLoopPack(loopDef);
    if (pack) {
      log(`${loopDef.name}: dry-run would open reward pack ${packName(pack)} (#${pack.id})`);
    } else {
      const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
      const challenge = await findAvailableSbcChallenge(set, loopDef.name);
      if (challenge) {
        log(`${loopDef.name}: dry-run found no target duplicate or reward pack; seed SBC available ${set.name} (#${set.id || '?'}) challenge #${challenge.id || '?'}`);
        log(`${loopDef.name}: live run would try seed SBC via FSU fill`);
      } else {
        log(`${loopDef.name}: dry-run found no target duplicate or reward pack; no available seed SBC challenge remains`);
      }
    }
    log(`${loopDef.name}: dry run stops before opening packs, moving items, or submitting SBCs`);
  }

  async function runInventoryMixedUpgradeDryRun(loopDef) {
    await waitAppReady();
    await refreshInventoryCaches(`${loopDef.name} dry-run`, { includePacks: false, quiet: true });
    const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
    log(`${loopDef.name}: dry-run SBC found ${set.name} (#${set.id || '?'})`);

    const selection = selectInventoryPlayers(loopDef.requirements, loopDef.priorityPiles);
    logDryRunSelection(loopDef.name, selection);
    if (selection.ok) {
      log(`${loopDef.name}: dry-run would submit this inventory selection`);
    }
    log(`${loopDef.name}: dry run stops before cleanup, squad save, or SBC submit`);
  }

  async function runCommonGoldToRareUpgradeDryRun(loopDef) {
    await waitAppReady();
    await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
    const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
    log(`${loopDef.name}: dry-run SBC found ${set.name} (#${set.id || '?'})`);

    const primaryPiles = loopDef.priorityPiles || ['unassigned', 'storage', 'transfer'];
    const clubFallbackPiles = loopDef.clubFallbackPiles || [...primaryPiles, 'club'];
    let selection = selectLoopInventoryPlayers(loopDef, primaryPiles);
    logDryRunSelection(`${loopDef.name} primary`, selection);
    if (selection.ok) {
      log(`${loopDef.name}: dry-run would submit primary common gold selection`);
      log(`${loopDef.name}: dry run stops before squad save or SBC submit`);
      return;
    }

    const pack = await findSourcePack(loopDef);
    if (pack) {
      log(`${loopDef.name}: dry-run would open source pack before club fallback: ${packName(pack)} (#${pack.id})`);
      log(`${loopDef.name}: dry run stops before opening source pack or moving unassigned items`);
      return;
    }

    log(`${loopDef.name}: dry-run found no source pack; checking club fallback`);
    selection = selectLoopInventoryPlayers(loopDef, clubFallbackPiles);
    logDryRunSelection(`${loopDef.name} club fallback`, selection);
    if (selection.ok) {
      log(`${loopDef.name}: dry-run would submit club fallback common gold selection`);
    }
    log(`${loopDef.name}: dry run stops before cleanup, squad save, or SBC submit`);
  }

  async function runReservedDuplicateUpgradeDryRun(loopDef, upgradeDef, duplicatePredicate, label) {
    const set = await findSbcSet(upgradeDef.sbcNames, upgradeDef.name || label);
    const countNeeded = getUpgradeRequirementCount(upgradeDef);
    const duplicateCount = countUnassignedMatching(duplicatePredicate);
    log(`${loopDef.name}: dry-run ${label} SBC found ${set.name} (#${set.id || '?'})`);

    if (!duplicateCount) {
      log(`${loopDef.name}: dry-run ${label} has no reserved duplicate(s); live run would not submit this upgrade yet`);
      return;
    }

    const piles = duplicateCount >= countNeeded
      ? ['unassigned']
      : ['unassigned', 'storage', 'transfer', 'club'];
    const selection = selectLoopInventoryPlayers(upgradeDef, piles);
    log(`${loopDef.name}: dry-run ${label} reserved duplicates:${duplicateCount}, required:${countNeeded}`);
    logDryRunSelection(`${loopDef.name} ${label}`, selection);
    if (selection.ok) {
      log(`${loopDef.name}: dry-run would submit ${label} selection`);
    }
  }

  async function runProvisionPackDualCraftingDryRun(loopDef) {
    await waitAppReady();
    await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
    const rounds = Math.max(1, Math.min(50, Number(loopDef.rounds || loopDef.maxRounds || 1) || 1));
    const pack = await findSourcePack(loopDef);
    log(`${loopDef.name}: dry-run would open ${rounds} provision pack round(s); source pack ${pack ? `${packName(pack)} (#${pack.id})` : 'not found'}`);
    log(`${loopDef.name}: dry-run only inspects current reserved duplicates; it does not open Provision Packs`);

    await runReservedDuplicateUpgradeDryRun(loopDef, loopDef.commonUpgrade, isCommonGoldDuplicate, 'FOF common gold');
    await runReservedDuplicateUpgradeDryRun(loopDef, loopDef.rareUpgrade, isRareGoldDuplicate, '84+ rare gold');
    log(`${loopDef.name}: dry run stops before opening packs, moving items, or submitting SBCs`);
  }

  async function runRarePackTo84UpgradeDryRun(loopDef) {
    await waitAppReady();
    await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
    const pack = await findSourcePack(loopDef);
    log(`${loopDef.name}: dry-run source pack ${pack ? `${packName(pack)} (#${pack.id})` : 'not found'}`);
    log(`${loopDef.name}: dry-run would open matching rare gold pack(s) one by one`);
    await runReservedDuplicateUpgradeDryRun(
      loopDef,
      loopDef.rareUpgrade,
      (item) => isRareGoldDuplicate(item, { protectHighGold: true }),
      '2x84+ low rare gold',
    );
    log(`${loopDef.name}: dry run stops before opening packs, moving items, or submitting SBCs`);
  }

  async function runDryRunLoop(loopDef, roundNo = 1) {
    log(`Dry run active: no items will be moved, no packs opened, no squads saved, no SBCs submitted`);

    if (loopDef.strategy === 'dailyRoutine') {
      await runDailyRoutine(loopDef);
      return;
    }
    if (loopDef.strategy === 'validationBronzeUpgrade') {
      await runValidationBronzeUpgradeDryRun(loopDef, roundNo);
      return;
    }
    if (loopDef.strategy === 'dailySingleCardRecycle') {
      await runDailySingleCardRecycleDryRun(loopDef);
      return;
    }
    if (loopDef.strategy === 'inventoryMixedUpgrade') {
      await runInventoryMixedUpgradeDryRun(loopDef);
      return;
    }
    if (loopDef.strategy === 'commonGoldToRareUpgrade') {
      await runCommonGoldToRareUpgradeDryRun(loopDef);
      return;
    }
    if (loopDef.strategy === 'provisionPackDualCrafting') {
      await runProvisionPackDualCraftingDryRun(loopDef);
      return;
    }
    if (loopDef.strategy === 'rarePackTo84Upgrade') {
      await runRarePackTo84UpgradeDryRun(loopDef);
      return;
    }
    if (loopDef.strategy === 'playerPickSbc') {
      await runPlayerPickSbcDryRun(loopDef);
      return;
    }
    if (loopDef.strategy === 'fillAndVerifySbc') {
      await runFillAndVerifySbc(loopDef);
      return;
    }

    fail(`Unsupported loop strategy: ${loopDef.strategy}`);
  }

  function getRoutineStepLoopDefs(loopDef) {
    return (loopDef.steps || []).map((stepId, index) => {
      if (stepId === loopDef.id) fail(`${loopDef.name}: step ${index + 1} cannot reference itself`);
      const baseDef = findLoopDefById(stepId);
      if (!baseDef) fail(`${loopDef.name}: step ${index + 1} loop not found: ${stepId}`);

      const childDef = cloneLoopDef(baseDef);
      if (childDef.strategy === 'dailyRoutine') fail(`${loopDef.name}: nested dailyRoutine steps are not supported`);
      if (loopDef.disabledPiles?.length && !childDef.disabledPiles?.length) {
        childDef.disabledPiles = [...loopDef.disabledPiles];
      }
      if (loopDef.openRewardPacks !== undefined && childDef.openRewardPacks === undefined) {
        childDef.openRewardPacks = loopDef.openRewardPacks;
      }
      childDef.dryRun = loopDef.dryRun === true || childDef.dryRun === true;
      assertValidLoopDef(childDef, childDef.name || stepId);
      return applyDisabledPiles(childDef);
    });
  }

  function summarizeRoutineStepLimits(steps) {
    const limits = steps.map((step) => {
      const rawLimit = getLiveRunLimit(step, 1);
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.floor(rawLimit)) : 1;
      const unit = step.strategy === 'rarePackTo84Upgrade' ? 'pack(s)' : 'SBC(s)';
      return {
        name: step.name || step.id || step.strategy || 'step',
        limit,
        unit,
      };
    });
    return {
      limits,
      max: limits.reduce((maxLimit, step) => Math.max(maxLimit, step.limit), 1),
      total: limits.reduce((sum, step) => sum + step.limit, 0),
      text: limits.map((step) => `${step.name} max ${step.limit} ${step.unit}`).join('; '),
    };
  }

  async function runDailyRoutine(loopDef) {
    await waitAppReady();
    const steps = getRoutineStepLoopDefs(loopDef);
    const limitSummary = summarizeRoutineStepLimits(steps);
    log(`${loopDef.name}: running ${steps.length} step(s): ${steps.map((step) => step.name).join(' -> ')}`);
    log(`${loopDef.name}: step limits: ${limitSummary.text}`);

    for (let index = 0; index < steps.length; index++) {
      stopPoint();
      const step = steps[index];
      log(`${loopDef.name}: step ${index + 1}/${steps.length} ${step.name}`);
      await runConfiguredLoop(step, 1);
      await sleep(CFG.pauseMs);
    }
  }

  function shouldUseInventoryFirstFill(loopDef = {}) {
    return loopDef.inventoryFillFirst === true && Array.isArray(loopDef.requirements) && loopDef.requirements.length > 0;
  }

  function logInventorySelection(label, selection, options = {}) {
    const maxItems = Number(options.maxItems || 20);
    log(`${label}: inventory selected ${selection?.selected?.length || 0} item(s) (${formatSelectionStats(selection?.stats)})`);
    const entries = selection?.entries || (selection?.selected || []).map((item) => ({ item, pileName: 'unknown' }));
    entries.slice(0, maxItems).forEach((entry, index) => log(`inventory pick ${formatDryRunItem(entry, index)}`));
    if (entries.length > maxItems) log(`${label}: inventory pick list truncated: ${entries.length - maxItems} more item(s)`);
  }

  async function fillSbcSquadInventoryFirst(loopDef, opened, options = {}) {
    await refreshInventoryCaches(`${loopDef.name} inventory-first fill`, { includePacks: false, quiet: true });
    const expectedPlayerCount = expectedSbcPlayerCount(loopDef, opened.challenge);
    const selection = selectLoopInventoryPlayers(loopDef);
    if (options.dryRun) {
      logDryRunSelection(`${loopDef.name} inventory-first`, selection, { maxItems: 20, priorityPiles: loopDef.priorityPiles });
    } else {
      logInventorySelection(`${loopDef.name} inventory-first`, selection);
    }

    if (!selection.ok) {
      logSelectionDiagnostics(`${loopDef.name} inventory-first`, selection, loopDef.priorityPiles);
      const reason = `inventory-first fill missing ${selection.missing?.count || '?'} ${describeRequirement(selection.missing || {})}`;
      if (options.dryRun || options.stopOnMissingSelection) return { ok: false, selection, reason };
      fail(`${loopDef.name}: ${reason}`);
    }

    const prepared = await prepareInventorySelection(loopDef, selection);
    const plannedInspection = inspectSbcItems(loopDef, prepared.selected || [], { expectedPlayerCount });
    logSbcSquadInspection(loopDef, plannedInspection);

    if (options.dryRun) {
      if (plannedInspection.blocked.length || plannedInspection.missingRequirements?.length) {
        log(`${loopDef.name}: dry-run inventory-first selection has protected or missing squad requirement(s)`);
        logManualSbcFixHints(loopDef, plannedInspection);
      } else {
        log(`${loopDef.name}: dry-run inventory-first selection passed protection; live run would save this squad before submit`);
      }
      return { ok: true, selection: prepared, inspection: plannedInspection };
    }

    if (plannedInspection.blocked.length || plannedInspection.missingRequirements?.length) {
      assertSbcSquadSafe(loopDef, plannedInspection);
    }

    await saveChallengeSquad(opened.challenge, prepared.selected, `${loopDef.name} inventory-first fill`);
    await waitLoadingEnd();
    await sleep(900);

    const squad = ctrl()?._squad || opened.challenge?.squad;
    const fillResult = {
      squad,
      filled: getFilledSquadSlots(squad),
      submitReady: !!findSubmitButton(),
    };
    const inspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount });
    logSbcSquadInspection(loopDef, inspection);
    log(`${loopDef.name}: inventory-first fill submit ${fillResult.submitReady ? 'ready' : 'not ready'} (${inspection.items.length}/${expectedPlayerCount || '?'} players)`);
    return { ok: true, selection: prepared, fillResult, inspection };
  }

  async function runFillAndVerifySbc(loopDef) {
    await waitAppReady();
    const completionLimit = loopDef.allowMultipleCompletions === true ? 50 : 1;
    const maxCompletions = Math.max(1, Math.min(completionLimit, Number(loopDef.maxCompletions || 1) || 1));
    let completions = 0;

    while (completions < maxCompletions) {
      stopPoint();
      if (!loopDef.dryRun) {
        await clearUnassigned(`${loopDef.name} pre-submit cleanup`);
      } else {
        log(`${loopDef.name}: dry-run skips unassigned cleanup (no item moves)`);
      }
      const preflightReady = await ensureTotwForFillAndVerify(loopDef);
      if (preflightReady === false) break;
      patchFsuLengthSafePlayerMetadata(`${loopDef.name} before opening SBC`);

      const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
      const opened = await openSbcSet(set, { returnNullIfComplete: true });
      if (!opened) {
        log(`${loopDef.name}: no available SBC challenge remains`);
        break;
      }

      let fillResult;
      let inspection;
      const expectedPlayerCount = expectedSbcPlayerCount(loopDef, opened.challenge);
      if (shouldUseInventoryFirstFill(loopDef)) {
        const inventoryFill = await fillSbcSquadInventoryFirst(loopDef, opened, {
          dryRun: loopDef.dryRun,
          stopOnMissingSelection: true,
        });
        if (loopDef.dryRun) {
          log(`${loopDef.name}: dry run stops before squad save or SBC submit`);
          return;
        }
        if (!inventoryFill.ok) {
          log(`${loopDef.name}: stopping because ${inventoryFill.reason || 'inventory-first fill is missing required items'}`);
          break;
        }
        fillResult = inventoryFill.fillResult;
        inspection = inventoryFill.inspection;
      } else if (loopDef.dryRun) {
        const squad = ctrl()?._squad || opened.challenge?.squad;
        fillResult = {
          squad,
          filled: getFilledSquadSlots(squad),
          submitReady: !!findSubmitButton(),
        };
        inspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount });
        logSbcSquadInspection(loopDef, inspection);
        log(`${loopDef.name}: dry-run inspects current squad only; does not click FSU fill or save`);
      } else {
        fillResult = await fillSbcSquad(loopDef.name, {
          requireSubmitReady: false,
          specialRequirementAdd: loopDef.specialRequirementAdd,
        });
        const squad = fillResult.squad || ctrl()?._squad || opened.challenge?.squad;
        inspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount });
        logSbcSquadInspection(loopDef, inspection);
        if (!fillResult.submitReady) {
          log(`${loopDef.name}: submit not ready after FSU fill (${fillResult.filled}/${expectedPlayerCount || '?'} slots filled); likely SBC requirements are still unmet or FSU completion picked an invalid squad`);
        }
      }
      let squad = fillResult.squad || ctrl()?._squad || opened.challenge?.squad;

      const totwInjection = await injectRequiredTotwIfNeeded(loopDef, opened, fillResult, inspection);
      fillResult = totwInjection.fillResult;
      inspection = totwInjection.inspection;
      squad = fillResult.squad || squad;

      const protectedRepair = (!loopDef.dryRun || !totwInjection.planned)
        ? await repairProtectedSquadItemsIfNeeded(loopDef, opened, fillResult, inspection)
        : { fillResult, inspection, planned: false, repaired: false };
      fillResult = protectedRepair.fillResult;
      inspection = protectedRepair.inspection;
      squad = fillResult.squad || squad;

      const submitReadyRepair = (!loopDef.dryRun || (!totwInjection.planned && !protectedRepair.planned))
        ? await repairSubmitReadinessIfNeeded(loopDef, opened, fillResult, inspection)
        : { fillResult, inspection, planned: false, repaired: false };
      fillResult = submitReadyRepair.fillResult;
      inspection = submitReadyRepair.inspection;
      squad = fillResult.squad || squad;

      if (loopDef.dryRun) {
        const injectableIssues = getDryRunInjectableIssues(loopDef, inspection);
        if (totwInjection.planned && !injectableIssues.blocked.length && !injectableIssues.missingRequirements.length) {
          log(`${loopDef.name}: dry-run squad needs required ${requiredSpecialLabel(loopDef)} repair; live run would save the repair plan and re-check before submit`);
        } else if (protectedRepair.planned && !injectableIssues.blocked.length && !injectableIssues.missingRequirements.length) {
          log(`${loopDef.name}: dry-run squad needs protected item repair; live run would save the repair plan and re-check before submit`);
        } else if (submitReadyRepair.planned && !injectableIssues.blocked.length && !injectableIssues.missingRequirements.length) {
          log(`${loopDef.name}: dry-run squad may need submit-ready rating repair; live run would save the repair plan and re-check before submit`);
        } else if (inspection.blocked.length || inspection.missingRequirements?.length) {
          log(`${loopDef.name}: dry-run blocked by protected or missing squad requirement(s); live run would stop before submit`);
          logManualSbcFixHints(loopDef, inspection);
        } else if (!fillResult.submitReady) {
          log(`${loopDef.name}: dry-run squad passed protection, but submit is not ready; live run would stop before submit`);
        } else {
          log(`${loopDef.name}: dry-run squad passed protection; live run would submit once`);
        }
        log(`${loopDef.name}: dry run stops before SBC submit`);
        return;
      }

      if (!fillResult.submitReady) fail(`${loopDef.name}: submit is not ready after protection inspection`);
      assertSbcSquadSafe(loopDef, inspection);
      const rewardPackId = await submitSbcAndGetAwardPackId(opened.set);
      markSbcItemsConsumed(inspection.items, loopDef.name);
      if (rewardPackId && loopDef.openRewardPacks) {
        await openRewardPackAndCleanup(loopDef, rewardPackId, 'reward pack', {
          assumeTotwReward: loopDef.assumeTotwRewardPack === true,
          fallbackPackMatcher: loopDef.assumeTotwRewardPack === true ? isLikelyTotwRewardPack : null,
          openAttempts: loopDef.assumeTotwRewardPack === true ? 3 : 1,
        });
      } else if (rewardPackId) {
        log(`${loopDef.name}: reward pack #${rewardPackId} left unopened`);
      }
      completions++;
      await sleep(CFG.pauseMs);
    }

    log(`${loopDef.name}: submitted ${completions} SBC(s) in this run`);
  }

  async function runInventoryMixedUpgrade(loopDef) {
    await waitAppReady();
    let completions = 0;

    while (completions < Number(loopDef.maxCompletions || 7)) {
      stopPoint();
      await clearUnassigned(`${loopDef.name} pre-submit cleanup`);

      const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
      const opened = await openSbcSet(set, { returnNullIfComplete: true });
      if (!opened) {
        log(`${loopDef.name}: no available SBC challenge remains`);
        break;
      }

      await refreshInventoryCaches(`${loopDef.name} pre-selection`, { includePacks: false, quiet: true });
      let selection = selectInventoryPlayers(loopDef.requirements, loopDef.priorityPiles);
      log(`${loopDef.name}: selected ${selection.selected.length} player(s) (${formatSelectionStats(selection.stats)})`);

      if (!selection.ok) {
        const missing = selection.missing;
        log(`${loopDef.name}: missing ${missing.count} ${missing.tier || 'any'} ${missing.rarity || ''} player(s); stopping before submit`);
        logSelectionDiagnostics(loopDef.name, selection, loopDef.priorityPiles);
        break;
      }

      selection = await prepareInventorySelection(loopDef, selection);
      if (!selection.ok) {
        const missing = selection.missing;
        log(`${loopDef.name}: missing ${missing.count} ${missing.tier || 'any'} ${missing.rarity || ''} player(s) after inventory preparation; stopping before submit`);
        logSelectionDiagnostics(loopDef.name, selection, loopDef.priorityPiles);
        break;
      }

      await saveChallengeSquad(opened.challenge, selection.selected, loopDef.name);

      const submitReady = !!findSubmitButton();
      log(`${loopDef.name}: inventory squad saved; submit ${submitReady ? 'ready' : 'not ready'}`);
      if (!submitReady) fail(`${loopDef.name}: selected inventory players did not satisfy SBC requirements`);

      const rewardPackId = await submitSbcAndGetAwardPackId(opened.set);
      if (rewardPackId && loopDef.openRewardPacks) {
        await openRewardPackAndCleanup(loopDef, rewardPackId);
      } else if (rewardPackId) {
        log(`${loopDef.name}: reward pack #${rewardPackId} left unopened`);
      }
      completions++;
      await sleep(CFG.pauseMs);
    }

    await clearUnassigned(`${loopDef.name} final cleanup`);
    log(`${loopDef.name}: submitted ${completions} SBC(s) in this run`);
  }

  function isCommonGoldPlayer(item, options = {}) {
    const spec = { tier: 'gold', rarity: 'common', playerOnly: true, allowSpecial: false, protectHighGold: options.protectHighGold === true };
    return !(options.protectHighGold && isProtectedHighGold(item)) &&
      isSbcUsablePlayer(item, spec) &&
      itemMatchesSpec(item, spec);
  }

  function isCommonGoldDuplicate(item, options = {}) {
    return isDuplicate(item) && isCommonGoldPlayer(item, options);
  }

  function isRareGoldPlayer(item, options = {}) {
    const spec = { tier: 'gold', rarity: 'rare', playerOnly: true, allowSpecial: false, protectHighGold: options.protectHighGold === true };
    return !(options.protectHighGold && isProtectedHighGold(item)) &&
      isSbcUsablePlayer(item, spec) &&
      itemMatchesSpec(item, spec);
  }

  function isRareGoldDuplicate(item, options = {}) {
    return isDuplicate(item) && isRareGoldPlayer(item, options);
  }

  function isProvisionCraftingDuplicate(item) {
    return isCommonGoldDuplicate(item) || isRareGoldDuplicate(item);
  }

  function isLowRareGoldDuplicate(item) {
    return isRareGoldDuplicate(item, { protectHighGold: true });
  }

  async function handleRareSourcePackItems(items, loopDef) {
    const reserveCommonGold = (item) => isCommonGoldDuplicate(item, { protectHighGold: true });
    const reservedIds = new Set((items || []).filter(reserveCommonGold).map((item) => Number(item?.id || 0)));
    const directClub = (items || []).filter((item) =>
      !reservedIds.has(Number(item?.id || 0)) &&
      !isDuplicate(item)
    );

    if (directClub.length) {
      log(`${loopDef.name}: moving ${directClub.length} non-duplicate source item(s) to club`);
      await moveItems(directClub, W.ItemPile.CLUB, true);
    }

    await clearUnassigned(`${loopDef.name} source pack handling`, {
      reserveItem: reserveCommonGold,
    });

    await refreshUnassigned();
    const reserved = getUnassignedItems().filter(reserveCommonGold);
    log(`${loopDef.name}: reserved ${reserved.length} common gold duplicate(s) for SBC`);
    return reserved;
  }

  async function submitInventorySelection(loopDef, selection) {
    const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
    const opened = await openSbcSet(set, { returnNullIfComplete: true });
    if (!opened) {
      log(`${loopDef.name}: no available SBC challenge remains`);
      return null;
    }

    const prepared = await prepareInventorySelection(loopDef, selection);
    if (!prepared.ok) {
      const missing = prepared.missing;
      log(`${loopDef.name}: missing ${missing.count} ${missing.tier || 'any'} ${missing.rarity || ''} player(s) after inventory preparation; stopping before submit`);
      logSelectionDiagnostics(loopDef.name, prepared, loopDef.priorityPiles);
      return null;
    }

    await saveChallengeSquad(opened.challenge, prepared.selected, loopDef.name);

    const submitReady = !!findSubmitButton();
    log(`${loopDef.name}: inventory squad saved; submit ${submitReady ? 'ready' : 'not ready'}`);
    if (!submitReady) fail(`${loopDef.name}: selected inventory players did not satisfy SBC requirements`);

    const rewardPackId = await submitSbcAndGetAwardPackId(opened.set);
    if (rewardPackId && loopDef.openRewardPacks) {
      await openRewardPackAndCleanup(loopDef, rewardPackId);
    } else if (rewardPackId) {
      log(`${loopDef.name}: reward pack #${rewardPackId} left unopened`);
    }
    await refreshUnassigned().catch(() => null);
    return { submitted: true, rewardPackId };
  }

  async function runCommonGoldToRareUpgrade(loopDef) {
    await waitAppReady();
    let completions = 0;
    const primaryPiles = loopDef.priorityPiles || ['unassigned', 'storage', 'transfer'];
    const clubFallbackPiles = loopDef.clubFallbackPiles || [...primaryPiles, 'club'];

    const submitClubFallback = async (reason) => {
      log(`${loopDef.name}: ${reason}; using club as final fallback`);
      const fallbackSelection = selectLoopInventoryPlayers(loopDef, clubFallbackPiles);
      log(`${loopDef.name}: club fallback selected ${fallbackSelection.selected.length} common gold player(s) (${formatSelectionStats(fallbackSelection.stats)})`);
      if (!fallbackSelection.ok) {
        const fallbackMissing = fallbackSelection.missing;
        log(`${loopDef.name}: still missing ${fallbackMissing.count} common gold player(s) after club fallback; stopping`);
        logSelectionDiagnostics(`${loopDef.name} club fallback`, fallbackSelection, clubFallbackPiles);
        await clearUnassigned(`${loopDef.name} no source pack cleanup`);
        return false;
      }

      const result = await submitInventorySelection(loopDef, fallbackSelection);
      if (!result) return false;
      completions++;
      await sleep(CFG.pauseMs);
      return true;
    };

    while (completions < Number(loopDef.maxCompletions || 7)) {
      stopPoint();
      await refreshInventoryCaches(`${loopDef.name} pre-selection`, { includePacks: false, quiet: true });

      let selection = selectLoopInventoryPlayers(loopDef, primaryPiles);
      log(`${loopDef.name}: selected ${selection.selected.length} common gold player(s) (${formatSelectionStats(selection.stats)})`);

      if (selection.ok) {
        const result = await submitInventorySelection(loopDef, selection);
        if (!result) break;
        completions++;
        await sleep(CFG.pauseMs);
        continue;
      }

      const missing = selection.missing;
      log(`${loopDef.name}: missing ${missing.count} common gold player(s) from unassigned/storage/transfer; trying 11x Gold Players Pack before club`);
      logSelectionDiagnostics(`${loopDef.name} primary`, selection, primaryPiles);

      const pack = await findSourcePack(loopDef);
      if (!pack) {
        if (!(await submitClubFallback('no 11x Gold Players Pack available'))) break;
        continue;
      }

      log(`${loopDef.name}: opening source pack before using club: ${packName(pack)} (#${pack.id})`);
      if (getUnassignedItems().length) {
        await clearUnassigned(`${loopDef.name} before opening source pack`);
      }

      const items = await openPack(pack, loopDef.name, { allowGone: true });
      if (!items) {
        if (!(await submitClubFallback('source pack stale or unavailable after 404'))) break;
        continue;
      }
      await handleRareSourcePackItems(items, loopDef);

      selection = selectLoopInventoryPlayers(loopDef, primaryPiles);
      log(`${loopDef.name}: after source pack selected ${selection.selected.length} common gold player(s) (${formatSelectionStats(selection.stats)})`);

      if (!selection.ok) {
        const afterMissing = selection.missing;
        log(`${loopDef.name}: still missing ${afterMissing.count} common gold player(s); stashing unassigned and continuing`);
        logSelectionDiagnostics(`${loopDef.name} after source pack`, selection, primaryPiles);
        await clearUnassigned(`${loopDef.name} partial common gold stash`);
        await sleep(CFG.pauseMs);
        continue;
      }

      const result = await submitInventorySelection(loopDef, selection);
      if (!result) break;
      completions++;
      await sleep(CFG.pauseMs);
    }

    await clearUnassigned(`${loopDef.name} final cleanup`);
    log(`${loopDef.name}: submitted ${completions} SBC(s) in this run`);
  }

  function getUpgradeRequirementCount(upgradeDef) {
    return Number(upgradeDef?.requirements?.[0]?.count || 0);
  }

  function countUnassignedMatching(predicate) {
    return getUnassignedItems().filter(predicate).length;
  }

  async function handleProvisionPackItems(items, loopDef) {
    const reservedIds = new Set((items || [])
      .filter(isProvisionCraftingDuplicate)
      .map((item) => Number(item?.id || 0)));
    const directClub = (items || []).filter((item) =>
      !reservedIds.has(Number(item?.id || 0)) &&
      !isDuplicate(item)
    );

    if (directClub.length) {
      log(`${loopDef.name}: moving ${directClub.length} non-duplicate provision item(s) to club`);
      await moveItems(directClub, W.ItemPile.CLUB, true);
    }

    await clearUnassigned(`${loopDef.name} provision pack handling`, {
      reserveItem: isProvisionCraftingDuplicate,
    });

    await refreshUnassigned();
    const common = countUnassignedMatching(isCommonGoldDuplicate);
    const rare = countUnassignedMatching(isRareGoldDuplicate);
    log(`${loopDef.name}: reserved common duplicates:${common}, rare duplicates:${rare}`);
    return { common, rare };
  }

  async function handleRarePackTo84Items(items, loopDef) {
    const reservedIds = new Set((items || [])
      .filter(isLowRareGoldDuplicate)
      .map((item) => Number(item?.id || 0)));
    const directClub = (items || []).filter((item) =>
      !reservedIds.has(Number(item?.id || 0)) &&
      !isDuplicate(item)
    );

    if (directClub.length) {
      log(`${loopDef.name}: moving ${directClub.length} non-duplicate rare pack item(s) to club`);
      await moveItems(directClub, W.ItemPile.CLUB, true);
    }

    await clearUnassigned(`${loopDef.name} rare pack handling`, {
      reserveItem: isLowRareGoldDuplicate,
    });

    await refreshUnassigned();
    const lowRare = countUnassignedMatching(isLowRareGoldDuplicate);
    log(`${loopDef.name}: reserved low rare gold duplicate(s):${lowRare}`);
    return { lowRare };
  }

  async function submitReservedDuplicateUpgrade(loopDef, upgradeDef, duplicatePredicate, label) {
    let completions = 0;
    const countNeeded = getUpgradeRequirementCount(upgradeDef);

    while (countNeeded > 0) {
      stopPoint();
      await refreshInventoryCaches(`${loopDef.name} ${label} pre-selection`, { includePacks: false, quiet: true });
      const duplicateCount = countUnassignedMatching(duplicatePredicate);
      if (!duplicateCount) break;

      const fallbackPiles = upgradeDef.priorityPiles || ['unassigned', 'storage', 'transfer', 'club'];
      const piles = duplicateCount >= countNeeded && fallbackPiles.includes('unassigned')
        ? ['unassigned']
        : fallbackPiles;
      const selection = selectLoopInventoryPlayers(upgradeDef, piles);
      log(`${loopDef.name}: ${label} selected ${selection.selected.length}/${countNeeded} (${formatSelectionStats(selection.stats)})`);

      if (!selection.ok) {
        const missing = selection.missing;
        log(`${loopDef.name}: ${label} missing ${missing.count} player(s) after fallback; stopping ${label}`);
        logSelectionDiagnostics(`${loopDef.name} ${label}`, selection, piles);
        break;
      }

      const result = await submitInventorySelection(upgradeDef, selection);
      if (!result) break;
      completions++;
      await sleep(CFG.pauseMs);
    }

    log(`${loopDef.name}: ${label} submitted ${completions} SBC(s)`);
    return completions;
  }

  async function runProvisionPackDualCrafting(loopDef) {
    await waitAppReady();
    const rounds = Math.max(1, Math.min(50, Number(loopDef.rounds || loopDef.maxRounds || 1) || 1));
    let packsOpened = 0;
    let commonCompletions = 0;
    let rareCompletions = 0;

    for (let round = 1; round <= rounds; round++) {
      stopPoint();
      await clearUnassigned(`${loopDef.name} round ${round} pre-open cleanup`);

      const pack = await findSourcePack(loopDef);
      if (!pack) {
        log(`${loopDef.name}: Provision Pack not found; stopping at round ${round}/${rounds}`);
        break;
      }

      log(`${loopDef.name}: round ${round}/${rounds} opening ${packName(pack)} (#${pack.id})`);
      const items = await openPack(pack, `${loopDef.name} round ${round}`, { allowGone: true });
      if (!items) {
        await sleep(CFG.pauseMs);
        continue;
      }
      packsOpened++;
      await handleProvisionPackItems(items, loopDef);

      commonCompletions += await submitReservedDuplicateUpgrade(
        loopDef,
        loopDef.commonUpgrade,
        isCommonGoldDuplicate,
        'FOF common gold',
      );
      rareCompletions += await submitReservedDuplicateUpgrade(
        loopDef,
        loopDef.rareUpgrade,
        isRareGoldDuplicate,
        '84+ rare gold',
      );

      await clearUnassigned(`${loopDef.name} round ${round} cleanup`);
      await sleep(CFG.pauseMs);
    }

    await clearUnassigned(`${loopDef.name} final cleanup`);
    log(`${loopDef.name}: opened ${packsOpened} Provision Pack(s), submitted common:${commonCompletions}, rare:${rareCompletions}`);
  }

  async function runRarePackTo84Upgrade(loopDef) {
    await waitAppReady();
    const maxPacks = Math.max(1, Math.min(100, Number(loopDef.maxPacks || 100) || 100));
    let packsOpened = 0;
    let rareCompletions = 0;

    while (packsOpened < maxPacks) {
      stopPoint();
      await clearUnassigned(`${loopDef.name} pre-open cleanup`);

      const pack = await findSourcePack(loopDef);
      if (!pack) {
        log(`${loopDef.name}: no matching rare gold source pack remains`);
        break;
      }

      log(`${loopDef.name}: opening ${packName(pack)} (#${pack.id}) ${packsOpened + 1}/${maxPacks}`);
      const items = await openPack(pack, `${loopDef.name} source pack`, { allowGone: true });
      if (!items) {
        await sleep(CFG.pauseMs);
        continue;
      }

      packsOpened++;
      await handleRarePackTo84Items(items, loopDef);
      rareCompletions += await submitReservedDuplicateUpgrade(
        loopDef,
        loopDef.rareUpgrade,
        isLowRareGoldDuplicate,
        '2x84+ low rare gold',
      );
      await clearUnassigned(`${loopDef.name} post-pack cleanup`);
      await sleep(CFG.pauseMs);
    }

    await clearUnassigned(`${loopDef.name} final cleanup`);
    log(`${loopDef.name}: opened ${packsOpened} rare gold pack(s), submitted 2x84+:${rareCompletions}`);
  }

  function isPlayerPickItem(item) {
    try { if (item?.isPlayerPickItem?.()) return true; } catch { }
    return /player\s*pick/i.test(String(item?.name || item?.description || item?._staticData?.name || ''));
  }

  function pickItemName(item) {
    return String(item?._staticData?.name || item?.name || item?.description || `Player Pick #${item?.id || '?'}`);
  }

  function sameLimitedUseType(a, b) {
    const left = a?.limitedUseType ?? a?._limitedUseType ?? null;
    const right = b?.limitedUseType ?? b?._limitedUseType ?? null;
    return left === null || right === null || String(left) === String(right);
  }

  function playerPickMatchesLoop(item, loopDef) {
    return isPlayerPickItem(item) && matchesAny(pickItemName(item), loopDef.pickItemNames || []);
  }

  function getPlayerPickOwnedItems() {
    const seen = new Set();
    return [
      ...getUnassignedItems(),
      ...getStorageItems(),
      ...getTransferItems(),
      ...getClubItems(),
    ].filter((item) => {
      const id = Number(item?.id || 0);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function isPlayerPickDuplicate(item) {
    const itemId = Number(item?.id || 0);
    return getPlayerPickOwnedItems().some((ownedItem) =>
      Number(ownedItem?.id || 0) !== itemId &&
      Number(ownedItem?.definitionId || 0) === Number(item?.definitionId || -1) &&
      sameLimitedUseType(ownedItem, item)
    );
  }

  async function getPlayerPickPrices(items, loopDef) {
    const prices = new Map();
    const ids = [...new Set((items || []).map((item) => Number(item?.definitionId || 0)).filter(Boolean))];
    if (!ids.length) return prices;

    const platform = String(loopDef.pricePlatform || 'pc').toLowerCase();
    const url = `https://www.fut.gg/api/fut/player-prices/26/?ids=${encodeURIComponent(ids.join(','))}&platform=${encodeURIComponent(platform)}`;
    try {
      const response = JSON.parse(await requestText(url));
      for (const entry of response?.data || []) {
        const definitionId = Number(entry?.eaId || entry?.definitionId || 0);
        const price = Number(entry?.price);
        if (definitionId && Number.isFinite(price) && price > 0) prices.set(definitionId, price);
      }
    } catch (error) {
      log(`${loopDef.name}: FUT.GG price lookup unavailable (${error?.message || error}); price ties require manual selection`);
    }
    return prices;
  }

  function describePlayerPickCandidate(candidate) {
    const tags = [
      candidate.special ? 'special' : 'normal',
      candidate.duplicate ? 'duplicate' : 'new',
      candidate.price === null ? 'price:?' : `price:${candidate.price}`,
    ];
    return `${itemDisplayName(candidate.item)} rating:${candidate.rating} ${tags.join(',')}`;
  }

  function rankPlayerPickCandidates(items, prices) {
    return (items || []).map((item, index) => ({
      item,
      index,
      rating: Number(item?.rating || 0),
      special: isSpecial(item),
      duplicate: isPlayerPickDuplicate(item),
      price: prices.has(Number(item?.definitionId || 0)) ? prices.get(Number(item.definitionId)) : null,
    })).sort((a, b) =>
      b.rating - a.rating ||
      Number(b.special) - Number(a.special) ||
      Number(a.duplicate) - Number(b.duplicate) ||
      (b.price ?? -1) - (a.price ?? -1) ||
      a.index - b.index
    );
  }

  function getManualPickReason(ranked, pickCount) {
    const topRating = ranked[0]?.rating;
    const topSpecials = ranked.filter((candidate) => candidate.rating === topRating && candidate.special);
    if (topSpecials.length > 1) {
      return `${topSpecials.length} special card(s) share the highest rating ${topRating}`;
    }

    const groups = new Map();
    ranked.forEach((candidate, index) => {
      const key = `${candidate.rating}:${candidate.special ? 1 : 0}:${candidate.duplicate ? 1 : 0}`;
      const group = groups.get(key) || { candidates: [], firstIndex: index };
      group.candidates.push(candidate);
      groups.set(key, group);
    });
    for (const group of groups.values()) {
      if (group.firstIndex >= pickCount || group.candidates.length < 2) continue;
      if (group.candidates.some((candidate) => candidate.price === null)) {
        return 'price data is missing for a tie that affects the selected card(s)';
      }
    }
    return '';
  }

  function waitForManualPlayerPick(ranked, pickCount, reason) {
    return new Promise((resolve, reject) => {
      let stopTimer = null;
      const finish = (callback, value) => {
        if (stopTimer) clearInterval(stopTimer);
        overlay.remove();
        callback(value);
      };
      const overlay = document.createElement('div');
      overlay.id = 'bronze-loop-pick-modal';
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '100000', background: 'rgba(0, 0, 0, 0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
      });
      const dialog = document.createElement('div');
      Object.assign(dialog.style, {
        width: 'min(780px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#171b21', color: '#f3f5f7',
        border: '1px solid #65758a', padding: '16px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
      });
      const title = document.createElement('div');
      title.textContent = `Manual Player Pick: ${reason}`;
      Object.assign(title.style, { fontWeight: '700', marginBottom: '8px' });
      const hint = document.createElement('div');
      hint.textContent = `Select exactly ${pickCount} player(s), then confirm.`;
      Object.assign(hint.style, { color: '#b7c2d0', marginBottom: '12px' });
      const list = document.createElement('div');
      Object.assign(list.style, { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' });
      const selected = new Set();
      const cards = [];
      const confirm = document.createElement('button');
      confirm.textContent = 'Confirm selection';
      confirm.disabled = true;
      Object.assign(confirm.style, { marginTop: '14px', minHeight: '34px', padding: '0 14px' });
      const refresh = () => {
        cards.forEach(({ card, candidate }) => {
          card.style.borderColor = selected.has(candidate) ? '#64d77a' : '#536171';
          card.style.background = selected.has(candidate) ? '#243c2b' : '#202731';
        });
        confirm.disabled = selected.size !== pickCount;
      };
      ranked.forEach((candidate) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.textContent = describePlayerPickCandidate(candidate);
        Object.assign(card.style, {
          minHeight: '68px', textAlign: 'left', color: '#f3f5f7', background: '#202731', border: '1px solid #536171',
          padding: '9px', cursor: 'pointer', lineHeight: '1.35',
        });
        card.addEventListener('click', () => {
          if (selected.has(candidate)) selected.delete(candidate);
          else if (selected.size < pickCount) selected.add(candidate);
          refresh();
        });
        cards.push({ card, candidate });
        list.appendChild(card);
      });
      confirm.addEventListener('click', () => {
        if (selected.size !== pickCount) return;
        finish(resolve, [...selected].map((candidate) => candidate.item));
      });
      dialog.append(title, hint, list, confirm);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      refresh();
      stopTimer = setInterval(() => {
        if (!state.stopping) return;
        finish(reject, new Error('Stopped by user while a Player Pick selection was pending'));
      }, 250);
    });
  }

  async function redeemAndSelectPlayerPick(pickItem, loopDef) {
    log(`${loopDef.name}: redeeming ${pickItemName(pickItem)}`);
    const redeemed = await observeOnce(W.services.Item.redeem(pickItem), ctrl(), 30000, 'redeem Player Pick');
    if (!redeemed?.success) fail(`${loopDef.name}: Player Pick redeem failed: ${serviceResultErrorText(redeemed)}`);
    const data = redeemed.data || redeemed.response || {};
    const choices = (data.playerPicks || data.items || []).filter(isPlayer);
    const pickCount = Math.max(1, Number(data.availablePicks || loopDef.pickCount || 1) || 1);
    if (choices.length < pickCount) fail(`${loopDef.name}: Player Pick returned ${choices.length} candidate(s) for ${pickCount} selection(s)`);

    await refreshInventoryCaches(`${loopDef.name} Player Pick duplicate check`, { includePacks: false, quiet: true });
    const prices = await getPlayerPickPrices(choices, loopDef);
    const ranked = rankPlayerPickCandidates(choices, prices);
    ranked.forEach((candidate, index) => log(`${loopDef.name}: pick candidate ${index + 1}/${ranked.length} ${describePlayerPickCandidate(candidate)}`));

    const manualReason = getManualPickReason(ranked, pickCount);
    const selected = manualReason
      ? await waitForManualPlayerPick(ranked, pickCount, manualReason)
      : ranked.slice(0, pickCount).map((candidate) => candidate.item);
    if (manualReason) log(`${loopDef.name}: manual Player Pick confirmed`);
    else log(`${loopDef.name}: auto-selected ${selected.map((item) => itemDisplayName(item)).join(', ')}`);

    const confirmed = await observeOnce(
      W.services.Item.confirmPlayerPickItemSelection(selected),
      ctrl(),
      30000,
      'confirm Player Pick selection',
    );
    if (!confirmed?.success) fail(`${loopDef.name}: Player Pick confirmation failed: ${serviceResultErrorText(confirmed)}`);
    await sleep(CFG.pauseMs);
    await refreshUnassigned({ quiet: true });
    await clearUnassigned(`${loopDef.name} Player Pick result`);
    return selected.length;
  }

  async function findUnassignedPlayerPick(loopDef, attempts = 10, options = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await refreshUnassigned({ quiet: true, attempts: 1 });
      const picks = getUnassignedItems().filter(isPlayerPickItem);
      const unexpectedPick = picks.find((item) => !playerPickMatchesLoop(item, loopDef));
      if (unexpectedPick && options.failOnUnexpected) {
        fail(`${loopDef.name}: unrelated unassigned Player Pick detected (${pickItemName(unexpectedPick)}); stop without redeeming it`);
      }
      const pickItem = picks.find((item) => playerPickMatchesLoop(item, loopDef));
      if (pickItem) return pickItem;
      if (attempt < attempts) await sleep(900);
    }
    if (!options.quietMissing) log(`${loopDef.name}: Player Pick reward was not found in unassigned items`);
    return null;
  }

  function assertPlayerPickFodderProtection(loopDef, players) {
    const inspection = inspectSbcItems(loopDef, players, {
      expectedPlayerCount: sumRequirementPlayerCount(loopDef),
    });
    assertSbcSquadSafe(loopDef, inspection);
    const protectedPlayers = (players || []).filter((item) =>
      isGold(item) && !isSpecial(item) && Number(item?.rating || 0) >= 82
    );
    if (!protectedPlayers.length) return;
    const details = protectedPlayers
      .map((item) => `${itemDisplayName(item)} rating:${Number(item?.rating || 0)}`)
      .join(', ');
    fail(`${loopDef.name}: 82+ normal gold protection blocked SBC submission: ${details}`);
  }

  async function submitPlayerPickChallenge(loopDef, challengeNo, challengeTotal) {
    await refreshInventoryCaches(`${loopDef.name} challenge ${challengeNo}/${challengeTotal} pre-selection`, { includePacks: false, quiet: true });
    const selection = selectLoopInventoryPlayers(loopDef, loopDef.priorityPiles);
    log(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} selected ${selection.selected.length}/${sumRequirementPlayerCount(loopDef)} player(s) (${formatSelectionStats(selection.stats)})`);
    if (!selection.ok) {
      log(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} missing ${selection.missing.count} ${selection.missing.rarity || selection.missing.tier || 'player'}(s); stopping`);
      logSelectionDiagnostics(`${loopDef.name} challenge ${challengeNo}/${challengeTotal}`, selection, loopDef.priorityPiles);
      return false;
    }

    const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
    const opened = await openSbcSet(set, { returnNullIfComplete: true });
    if (!opened) {
      log(`${loopDef.name}: no available SBC challenge remains`);
      return false;
    }
    const prepared = await prepareInventorySelection(loopDef, selection);
    if (!prepared.ok) return false;
    assertPlayerPickFodderProtection(loopDef, prepared.selected);
    await saveChallengeSquad(opened.challenge, prepared.selected, `${loopDef.name} challenge ${challengeNo}/${challengeTotal}`);
    if (!findSubmitButton()) fail(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} squad is not submit ready`);
    await submitSbcAndGetAwardPackId(opened.set);
    markSbcItemsConsumed(prepared.selected, `${loopDef.name} challenge ${challengeNo}/${challengeTotal}`);
    return true;
  }

  async function runPlayerPickSbc(loopDef) {
    await waitAppReady();
    const maxPicks = Math.max(1, Math.min(50, Number(loopDef.maxCompletions || 1) || 1));
    const challengesPerPick = Math.max(1, Number(loopDef.challengesPerPick || 1) || 1);
    let picksCompleted = 0;

    // A stopped manual selection can leave an already-redeemed pick in Unassigned.
    while (true) {
      const pendingPick = await findUnassignedPlayerPick(loopDef, 1, { quietMissing: true, failOnUnexpected: true });
      if (!pendingPick) break;
      log(`${loopDef.name}: resuming pending ${pickItemName(pendingPick)}`);
      await redeemAndSelectPlayerPick(pendingPick, loopDef);
    }

    while (picksCompleted < maxPicks) {
      stopPoint();
      await clearUnassigned(`${loopDef.name} pick ${picksCompleted + 1} pre-submit cleanup`);
      let submittedAllChallenges = true;
      for (let challengeNo = 1; challengeNo <= challengesPerPick; challengeNo++) {
        if (!(await submitPlayerPickChallenge(loopDef, challengeNo, challengesPerPick))) {
          submittedAllChallenges = false;
          break;
        }
        await sleep(CFG.pauseMs);
      }
      if (!submittedAllChallenges) break;

      const pickItem = await findUnassignedPlayerPick(loopDef, 10, { failOnUnexpected: true });
      if (!pickItem) break;
      await redeemAndSelectPlayerPick(pickItem, loopDef);
      picksCompleted++;
      await sleep(CFG.pauseMs);
    }
    log(`${loopDef.name}: completed ${picksCompleted}/${maxPicks} Player Pick(s)`);
  }

  async function runPlayerPickSbcDryRun(loopDef) {
    await waitAppReady();
    await refreshInventoryCaches(`${loopDef.name} dry-run`, { includePacks: false, quiet: true });
    const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
    const selection = selectLoopInventoryPlayers(loopDef, loopDef.priorityPiles);
    log(`${loopDef.name}: dry-run SBC found ${set.name} (#${set.id || '?'})`);
    log(`${loopDef.name}: dry-run requires ${loopDef.challengesPerPick || 1} challenge(s) per Pick and selects ${loopDef.pickCount || 1} player(s) from each reward`);
    logDryRunSelection(`${loopDef.name} strict card ratio`, selection);
    const pendingPick = await findUnassignedPlayerPick(loopDef, 1, { quietMissing: true, failOnUnexpected: true });
    if (pendingPick) log(`${loopDef.name}: dry-run found pending ${pickItemName(pendingPick)}; live run would resolve it before submitting another SBC`);
    log(`${loopDef.name}: dry run stops before submitting SBCs, redeeming Picks, or moving items`);
  }

  async function runRound(roundNo) {
    log(`Round ${roundNo} start`);
    await waitAppReady();
    await openSourceBronzePack();

    const bronzeSet = await findBronzeUpgradeSet();
    await openSbcSet(bronzeSet);
    await fillBronzeUpgradeSquad();
    const rewardPackId = await submitSbcAndGetAwardPackId(bronzeSet);
    log(`Reward pack id: ${rewardPackId || 'unknown'}`);
    await openRewardSilverPack(rewardPackId);

    const remaining = await showUnassignedIfAny(`round ${roundNo} end`);
    if (remaining.length) fail(`Round ended with ${remaining.length} unassigned item(s); stop for manual inspection`);
    log(`Round ${roundNo} done`);
  }

  async function runConfiguredLoop(loopDef, roundNo = 1) {
    log(`Loop selected: ${loopDef.name} (${loopDef.strategy})`);
    if (loopDef.disabledPiles?.length) log(`Disabled piles: ${loopDef.disabledPiles.join(', ')}`);

    if (loopDef.dryRun) {
      await runDryRunLoop(loopDef, roundNo);
      return;
    }

    if (loopDef.strategy === 'dailyRoutine') {
      await runDailyRoutine(loopDef);
      await showUnassignedIfAny(`${loopDef.name} end`);
      return;
    }

    if (loopDef.strategy === 'validationBronzeUpgrade') {
      await runRound(roundNo);
      return;
    }

    if (loopDef.strategy === 'dailySingleCardRecycle') {
      await runDailySingleCardRecycle(loopDef);
      await showUnassignedIfAny(`${loopDef.name} end`);
      return;
    }

    if (loopDef.strategy === 'inventoryMixedUpgrade') {
      await runInventoryMixedUpgrade(loopDef);
      await showUnassignedIfAny(`${loopDef.name} end`);
      return;
    }

    if (loopDef.strategy === 'commonGoldToRareUpgrade') {
      await runCommonGoldToRareUpgrade(loopDef);
      await showUnassignedIfAny(`${loopDef.name} end`);
      return;
    }

    if (loopDef.strategy === 'provisionPackDualCrafting') {
      await runProvisionPackDualCrafting(loopDef);
      await showUnassignedIfAny(`${loopDef.name} end`);
      return;
    }

    if (loopDef.strategy === 'rarePackTo84Upgrade') {
      await runRarePackTo84Upgrade(loopDef);
      await showUnassignedIfAny(`${loopDef.name} end`);
      return;
    }

    if (loopDef.strategy === 'playerPickSbc') {
      await runPlayerPickSbc(loopDef);
      await showUnassignedIfAny(`${loopDef.name} end`);
      return;
    }

    if (loopDef.strategy === 'fillAndVerifySbc') {
      await runFillAndVerifySbc(loopDef);
      await showUnassignedIfAny(`${loopDef.name} end`);
      return;
    }

    fail(`Unsupported loop strategy: ${loopDef.strategy}`);
  }

  function getLiveRunLimit(loopDef, rounds) {
    if (loopDef.strategy === 'validationBronzeUpgrade') return Number(rounds || loopDef.maxRounds || 1);
    if (loopDef.strategy === 'fillAndVerifySbc') {
      const completions = Number(loopDef.maxCompletions || 1);
      return completions + (needsAutoTotwPreflight(loopDef) ? completions : 0);
    }
    if (loopDef.strategy === 'rarePackTo84Upgrade') return Number(loopDef.maxPacks || 100);
    if (loopDef.strategy === 'playerPickSbc') {
      return Number(loopDef.maxCompletions || 1) * Number(loopDef.challengesPerPick || 1);
    }
    if (loopDef.strategy === 'dailyRoutine') {
      return summarizeRoutineStepLimits(getRoutineStepLoopDefs(loopDef)).max;
    }
    return Number(loopDef.maxCompletions || loopDef.rounds || loopDef.maxRounds || 1);
  }

  function getLiveRunScopeMessage(loopDef, rounds, limit) {
    if (loopDef.strategy === 'dailyRoutine') {
      const summary = summarizeRoutineStepLimits(getRoutineStepLoopDefs(loopDef));
      return `may run ${summary.limits.length} step(s) (${summary.text})`;
    }
    if (loopDef.strategy === 'rarePackTo84Upgrade') {
      return `may open up to ${limit} pack(s) and submit matching 2x84+ SBC(s)`;
    }
    if (loopDef.strategy === 'playerPickSbc') {
      return `may submit up to ${limit} SBC challenge(s) and resolve up to ${Number(loopDef.maxCompletions || 1)} Player Pick(s)`;
    }
    if (loopDef.strategy === 'fillAndVerifySbc' && needsAutoTotwPreflight(loopDef)) {
      const completions = Number(loopDef.maxCompletions || 1);
      return `may submit up to ${limit} SBC(s) (${completions} target SBC(s) plus up to ${completions} auto ${getAutoTotwUpgradeDef(loopDef).name} if ${requiredSpecialLabel(loopDef)} is missing)`;
    }
    return `may submit up to ${limit} SBC(s)`;
  }

  function confirmLiveRunIfNeeded(loopDef, rounds) {
    if (loopDef.dryRun) {
      state.pendingLiveConfirm = null;
      return true;
    }

    const limit = getLiveRunLimit(loopDef, rounds);
    const requiresExplicitPickConfirmation = loopDef.strategy === 'playerPickSbc';
    if (!Number.isFinite(limit) || (limit <= 1 && !requiresExplicitPickConfirmation)) {
      state.pendingLiveConfirm = null;
      return true;
    }

    const scopeMessage = getLiveRunScopeMessage(loopDef, rounds, limit);
    const key = `${loopDef.id || loopDef.name}:${loopDef.strategy}:${scopeMessage}`;
    const nowMs = Date.now();
    if (state.pendingLiveConfirm?.key === key && state.pendingLiveConfirm.expiresAt > nowMs) {
      state.pendingLiveConfirm = null;
      log(`Live guard confirmed: ${loopDef.name} ${scopeMessage}`);
      return true;
    }

    state.pendingLiveConfirm = { key, expiresAt: nowMs + 15000 };
    log(`Live guard: ${loopDef.name} ${scopeMessage}. Click Start again within 15s to confirm, or choose an MVP (1 run) loop.`);
    return false;
  }

  function clearPendingLiveConfirm() {
    state.pendingLiveConfirm = null;
  }


  async function startLoop() {
    if (state.running) return;
    let loopDef = null;
    let rounds = CFG.maxRounds;

    try {
      loopDef = getSelectedLoopDef();
      const input = document.querySelector('#bronze-loop-rounds');
      rounds = Math.max(1, Math.min(50, Number(input?.value || CFG.maxRounds) || CFG.maxRounds));
      loopDef.dryRun = isDryRunEnabled() || loopDef.dryRun === true;
      loopDef.openRewardPacks = loopDef.forceOpenRewardPacks === true || isOpenRewardPacksEnabled();
      if (loopDef.strategy === 'provisionPackDualCrafting') loopDef.rounds = rounds;
      if (loopDef.useRoundsAsCompletions === true) loopDef.maxCompletions = rounds;
      logFsuSettingsForRun();
      if (!confirmLiveRunIfNeeded(loopDef, rounds)) return;
    } catch (e) {
      log(`Stopped: ${e.message || e}`);
      errorStackLines(e).forEach((line) => log(`Error stack: ${line}`));
      console.error('[BronzeLoop]', e);
      return;
    }

    state.running = true;
    state.stopping = false;
    setPanelState();
    try {
      if (loopDef.dryRun || loopDef.strategy !== 'validationBronzeUpgrade') {
        stopPoint();
        await runConfiguredLoop(loopDef, 1);
      } else {
        for (let i = 1; i <= rounds; i++) {
          stopPoint();
          await runConfiguredLoop(loopDef, i);
          await sleep(CFG.pauseMs);
      }
    }

      log('All requested rounds completed');
    } catch (e) {
      log(`Stopped: ${e.message || e}`);
      errorStackLines(e).forEach((line) => log(`Error stack: ${line}`));
      console.error('[BronzeLoop]', e);
    } finally {
      state.running = false;
      state.stopping = false;
      setPanelState();
    }
  }

  function setPanelState() {
    const start = document.querySelector('#bronze-loop-start');
    const stop = document.querySelector('#bronze-loop-stop');
    const select = document.querySelector('#bronze-loop-select');
    const edit = document.querySelector('#bronze-loop-edit');
    const refresh = document.querySelector('#bronze-loop-refresh');
    const loadJson = document.querySelector('#bronze-loop-load-json');
    const builtIn = document.querySelector('#bronze-loop-built-in');
    const dryRun = document.querySelector('#bronze-loop-dry-run');
    const openRewards = document.querySelector('#bronze-loop-open-rewards');
    const rounds = document.querySelector('#bronze-loop-rounds');
    const json = document.querySelector('#bronze-loop-json');
    if (start) start.disabled = state.running;
    if (stop) stop.disabled = !state.running;
    if (select) select.disabled = state.running;
    if (edit) edit.disabled = state.running;
    if (refresh) refresh.disabled = state.running || state.refreshing;
    if (loadJson) loadJson.disabled = state.running || state.loadingLoops;
    if (builtIn) builtIn.disabled = state.running || state.loadingLoops || state.loopConfigSource === 'built-in';
    if (dryRun) dryRun.disabled = state.running;
    if (openRewards) openRewards.disabled = state.running;
    if (rounds) rounds.disabled = state.running;
    if (json) json.disabled = state.running;
    updateLoopControls();
  }

  function getSavedPanelPos() {
    try {
      return JSON.parse(localStorage.getItem('fc-loop-panel-pos') || 'null');
    } catch {
      return null;
    }
  }

  function savePanelPos(panel) {
    try {
      const rect = panel.getBoundingClientRect();
      localStorage.setItem('fc-loop-panel-pos', JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }));
    } catch { }
  }

  function makePanelDraggable(panel) {
    const handle = panel.querySelector('#bronze-loop-drag');
    if (!handle) return;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let moved = false;

    handle.addEventListener('pointerdown', (event) => {
      if (!panel.classList.contains('icon-only') && event.target.closest('button,select,input,textarea')) return;
      dragging = true;
      moved = false;
      const rect = panel.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) moved = true;
      const nextLeft = Math.max(0, Math.min(window.innerWidth - 36, startLeft + deltaX));
      const nextTop = Math.max(0, Math.min(window.innerHeight - 36, startTop + deltaY));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      event.preventDefault();
    });

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (panel.classList.contains('icon-only') && !moved) {
        panel.dataset.dragJustEnded = '1';
        panel.classList.remove('icon-only');
        const optionsToggle = document.querySelector('#bronze-loop-options-toggle');
        if (optionsToggle) optionsToggle.textContent = 'Options';
        setTimeout(() => {
          delete panel.dataset.dragJustEnded;
        }, 150);
        savePanelPos(panel);
        return;
      }
      if (moved) {
        panel.dataset.dragJustEnded = '1';
        setTimeout(() => {
          delete panel.dataset.dragJustEnded;
        }, 150);
      }
      savePanelPos(panel);
    };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
  }

  function makePanelResizable(panel) {
    const MIN_W = 220;
    const MIN_H = 180;
    const EDGE_PAD = 20;
    const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    let resizing = null;

    const onMove = (event) => {
      if (!resizing) return;
      const dx = event.clientX - resizing.startX;
      const dy = event.clientY - resizing.startY;
      const dir = resizing.dir;
      let newLeft = resizing.startLeft;
      let newTop = resizing.startTop;
      let newWidth = resizing.startWidth;
      let newHeight = resizing.startHeight;
      if (dir.includes('e')) newWidth = Math.max(MIN_W, resizing.startWidth + dx);
      if (dir.includes('s')) newHeight = Math.max(MIN_H, resizing.startHeight + dy);
      if (dir.includes('w')) {
        newWidth = Math.max(MIN_W, resizing.startWidth - dx);
        if (newWidth > MIN_W) newLeft = resizing.startLeft + (resizing.startWidth - newWidth);
      }
      if (dir.includes('n')) {
        newHeight = Math.max(MIN_H, resizing.startHeight - dy);
        if (newHeight > MIN_H) newTop = resizing.startTop + (resizing.startHeight - newHeight);
      }
      const maxW = window.innerWidth - EDGE_PAD;
      const maxH = window.innerHeight - EDGE_PAD;
      if (newWidth > maxW) {
        const overflow = newWidth - maxW;
        newWidth = maxW;
        if (dir.includes('w')) newLeft += overflow;
      }
      if (newHeight > maxH) {
        const overflow = newHeight - maxH;
        newHeight = maxH;
        if (dir.includes('n')) newTop += overflow;
      }
      newLeft = Math.max(0, Math.min(window.innerWidth - newWidth, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - newHeight, newTop));
      panel.style.left = `${newLeft}px`;
      panel.style.top = `${newTop}px`;
      panel.style.width = `${newWidth}px`;
      panel.style.height = `${newHeight}px`;
      event.preventDefault();
    };

    const onUp = () => {
      if (!resizing) return;
      resizing = null;
      savePanelPos(panel);
    };

    DIRS.forEach((dir) => {
      const el = panel.querySelector(`#bronze-loop-resize-${dir}`);
      if (!el) return;
      el.addEventListener('pointerdown', (event) => {
        if (panel.classList.contains('icon-only')) return;
        const rect = panel.getBoundingClientRect();
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.width = `${rect.width}px`;
        panel.style.height = `${rect.height}px`;
        resizing = {
          dir,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: rect.left,
          startTop: rect.top,
          startWidth: rect.width,
          startHeight: rect.height,
        };
        el.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }

  function installPanel() {
    if (document.querySelector('#bronze-loop-panel')) return;
    document.querySelector('#bronze-loop-style')?.remove();
    const style = document.createElement('style');
    style.id = 'bronze-loop-style';
    style.textContent = `
      #bronze-loop-panel {
        position: fixed;
        right: 10px;
        bottom: 10px;
        z-index: 999999;
        width: 300px;
        min-width: 220px;
        min-height: 180px;
        display: flex;
        flex-direction: column;
        background: #15181d;
        border: 1px solid #5b6f8f;
        color: #f4f6f8;
        font: 12px Arial, sans-serif;
        padding: 8px;
        box-shadow: 0 8px 30px rgba(0,0,0,.35);
        box-sizing: border-box;
      }
      #bronze-loop-panel .panel-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
      .bronze-loop-resize {
        position: absolute;
        z-index: 2;
        touch-action: none;
      }
      #bronze-loop-resize-n { top: -3px; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
      #bronze-loop-resize-s { bottom: -3px; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
      #bronze-loop-resize-e { top: 12px; bottom: 12px; right: -3px; width: 6px; cursor: ew-resize; }
      #bronze-loop-resize-w { top: 12px; bottom: 12px; left: -3px; width: 6px; cursor: ew-resize; }
      #bronze-loop-resize-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
      #bronze-loop-resize-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
      #bronze-loop-resize-se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
      #bronze-loop-resize-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
      #bronze-loop-panel.icon-only .bronze-loop-resize { display: none; }
      #bronze-loop-panel.icon-only {
        width: 36px;
        height: 36px;
        min-width: 0;
        min-height: 0;
        padding: 0;
        background: rgba(12,15,19,.72);
        border: 1px solid #78a6ff;
        overflow: hidden;
        box-shadow: 0 4px 16px rgba(0,0,0,.28);
      }
      #bronze-loop-panel.icon-only .panel-body,
      #bronze-loop-panel.icon-only #bronze-loop-title,
      #bronze-loop-panel.icon-only #bronze-loop-options-toggle {
        display: none;
      }
      #bronze-loop-panel.icon-only #bronze-loop-drag {
        width: 34px;
        height: 34px;
        margin: 0;
        justify-content: center;
      }
      #bronze-loop-drag {
        cursor: move;
        user-select: none;
        justify-content: space-between;
      }
      #bronze-loop-title {
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #bronze-loop-panel .row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
      #bronze-loop-panel button { min-width: 62px; height: 26px; cursor: pointer; font-size: 11px; background: #222832; color: #fff; border: 1px solid #607089; }
      #bronze-loop-panel button:disabled { opacity: .45; cursor: default; }
      #bronze-loop-collapse { min-width: 28px !important; width: 28px; padding: 0; }
      #bronze-loop-panel.icon-only #bronze-loop-collapse {
        min-width: 34px !important;
        width: 34px;
        height: 34px;
        border: 0;
        background: transparent;
        color: #78a6ff;
        font-weight: 700;
      }
      #bronze-loop-options-toggle { min-width: 58px; }
      #bronze-loop-panel input { width: 54px; height: 24px; background: #222832; color: #fff; border: 1px solid #607089; box-sizing: border-box; }
      #bronze-loop-panel input[type="checkbox"] { width: 14px; height: 14px; accent-color: #78a6ff; }
      #bronze-loop-panel label { cursor: pointer; user-select: none; }
      #bronze-loop-panel select {
        flex: 1;
        min-width: 0;
        height: 28px;
        background: #222832;
        color: #fff;
        border: 1px solid #607089;
      }
      #bronze-loop-latest {
        min-height: 28px;
        max-height: 44px;
        overflow: hidden;
        background: #0c0f13;
        border: 1px solid #303946;
        padding: 6px;
        line-height: 16px;
        color: #d7e2f0;
        word-break: break-word;
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
      }
      #bronze-loop-options {
        display: none;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #303946;
      }
      #bronze-loop-panel.options-open #bronze-loop-options {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      }
      .bronze-loop-section {
        color: #9fb2c9;
        font-size: 11px;
        margin: 8px 0 6px;
      }
      #bronze-loop-json {
        display: none;
        width: 100%;
        height: 170px;
        min-height: 60px;
        flex-shrink: 1;
        box-sizing: border-box;
        margin-bottom: 8px;
        background: #0c0f13;
        color: #f4f6f8;
        border: 1px solid #303946;
        font: 11px Consolas, monospace;
        padding: 8px;
      }
      #bronze-loop-json.show { display: block; }
      #bronze-loop-log {
        flex: 1 1 0;
        min-height: 100px;
        overflow: auto;
        white-space: pre-wrap;
        background: #0c0f13;
        border: 1px solid #303946;
        padding: 8px;
        box-sizing: border-box;
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'bronze-loop-panel';
    panel.innerHTML = `
      <div class="row" id="bronze-loop-drag">
        <span id="bronze-loop-title">Loop Runner</span>
        <button id="bronze-loop-options-toggle" title="Options">Options</button>
        <button id="bronze-loop-collapse" title="Compact">L</button>
      </div>
      <div class="panel-body">
        <div class="row">
          <select id="bronze-loop-select"></select>
        </div>
        <div class="row">
          <button id="bronze-loop-start">Start</button>
          <button id="bronze-loop-stop" disabled>Stop</button>
        </div>
        <div id="bronze-loop-latest">Ready.</div>
        <div id="bronze-loop-options">
          <div class="bronze-loop-section">Run options</div>
          <div class="row">
            <label id="bronze-loop-dry-run-label" title="Log planned selections without moving items, opening packs, or submitting SBCs">
              <input id="bronze-loop-dry-run" type="checkbox"> Dry run
            </label>
            <label title="Open reward packs automatically when a loop supports it">
              <input id="bronze-loop-open-rewards" type="checkbox"> Open reward packs
            </label>
          </div>
          <div class="row" id="bronze-loop-rounds-row">
            <span id="bronze-loop-rounds-label">rounds</span>
            <input id="bronze-loop-rounds" type="number" min="1" max="50" value="${CFG.maxRounds}">
          </div>
          <div class="bronze-loop-section">Config</div>
          <div class="row">
            <button id="bronze-loop-refresh">Refresh caches</button>
            <button id="bronze-loop-load-json">Load loops JSON</button>
          </div>
          <div class="row">
            <button id="bronze-loop-built-in" disabled>Built-in loops</button>
            <button id="bronze-loop-edit">Edit JSON</button>
          </div>
          <textarea id="bronze-loop-json" spellcheck="false"></textarea>
          <div class="bronze-loop-section">Log</div>
          <div class="row">
            <button id="bronze-loop-copy">Copy log</button>
            <button id="bronze-loop-clear">Clear log</button>
            <button id="bronze-loop-download">Save log</button>
          </div>
          <div id="bronze-loop-log"></div>
        </div>
      </div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-n"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-s"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-e"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-w"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-ne"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-nw"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-se"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-sw"></div>
    `;
    document.body.appendChild(panel);
    const savedPos = getSavedPanelPos();
    if (savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
      panel.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, savedPos.left))}px`;
      panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, savedPos.top))}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    if (savedPos && Number.isFinite(savedPos.width) && savedPos.width >= 220) {
      panel.style.width = `${Math.min(window.innerWidth - 20, savedPos.width)}px`;
    }
    if (savedPos && Number.isFinite(savedPos.height) && savedPos.height >= 180) {
      panel.style.height = `${Math.min(window.innerHeight - 20, savedPos.height)}px`;
    }
    makePanelDraggable(panel);
    makePanelResizable(panel);
    renderLoopSelect();
    renderLog();
    document.querySelector('#bronze-loop-collapse').addEventListener('click', (event) => {
      if (panel.dataset.dragJustEnded === '1') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      panel.classList.toggle('icon-only');
      if (panel.classList.contains('icon-only')) {
        panel.classList.remove('options-open');
        document.querySelector('#bronze-loop-options-toggle').textContent = 'Options';
        panel.style.width = '';
        panel.style.height = '';
      } else {
        const saved = getSavedPanelPos();
        if (saved && Number.isFinite(saved.width) && saved.width >= 220) {
          panel.style.width = `${Math.min(window.innerWidth - 20, saved.width)}px`;
        }
        if (saved && Number.isFinite(saved.height) && saved.height >= 180) {
          panel.style.height = `${Math.min(window.innerHeight - 20, saved.height)}px`;
        }
      }
      document.querySelector('#bronze-loop-collapse').textContent = panel.classList.contains('icon-only') ? 'L' : 'L';
      savePanelPos(panel);
    });
    document.querySelector('#bronze-loop-options-toggle').addEventListener('click', () => {
      panel.classList.toggle('options-open');
      document.querySelector('#bronze-loop-options-toggle').textContent = panel.classList.contains('options-open') ? 'Close' : 'Options';
      savePanelPos(panel);
    });
    document.querySelector('#bronze-loop-select').addEventListener('change', (event) => {
      clearPendingLiveConfirm();
      const selectedId = event.target.value;
      if (selectedId !== 'custom') setLoopJson(getLoopDefById(selectedId));
      updateLoopControls();
    });
    document.querySelector('#bronze-loop-edit').addEventListener('click', () => {
      const editor = document.querySelector('#bronze-loop-json');
      editor.classList.toggle('show');
      if (editor.classList.contains('show')) {
        document.querySelector('#bronze-loop-select').value = 'custom';
      }
      updateLoopControls();
    });
    document.querySelector('#bronze-loop-json').addEventListener('input', () => {
      clearPendingLiveConfirm();
      updateLoopControls();
    });
    document.querySelector('#bronze-loop-dry-run').addEventListener('change', clearPendingLiveConfirm);
    document.querySelector('#bronze-loop-open-rewards').addEventListener('change', clearPendingLiveConfirm);
    document.querySelector('#bronze-loop-start').addEventListener('click', startLoop);
    document.querySelector('#bronze-loop-refresh').addEventListener('click', async () => {
      if (state.running || state.refreshing) return;
      state.refreshing = true;
      setPanelState();
      try {
        await refreshInventoryCaches('manual button');
      } catch (e) {
        log(`Cache refresh failed: ${e.message || e}`);
      } finally {
        state.refreshing = false;
        setPanelState();
      }
    });
    document.querySelector('#bronze-loop-load-json').addEventListener('click', async () => {
      if (state.running || state.loadingLoops) return;
      clearPendingLiveConfirm();
      state.loadingLoops = true;
      setPanelState();
      try {
        log(`Loading loop definitions from ${LOOP_CONFIG_URL}`);
        await loadLoopConfig(LOOP_CONFIG_URL);
      } catch (e) {
        log(`Loop JSON load failed: ${e.message || e}`);
      } finally {
        state.loadingLoops = false;
        setPanelState();
      }
    });
    document.querySelector('#bronze-loop-built-in').addEventListener('click', () => {
      if (state.running || state.loadingLoops) return;
      clearPendingLiveConfirm();
      resetLoopDefs();
      setPanelState();
    });
    document.querySelector('#bronze-loop-stop').addEventListener('click', () => {
      state.stopping = true;
      log('Stop requested; waiting for current safe point');
      setPanelState();
    });
    document.querySelector('#bronze-loop-copy').addEventListener('click', async () => {
      const text = state.logLines.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        log('Log copied to clipboard');
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        log('Log copied to clipboard');
      }
    });
    document.querySelector('#bronze-loop-clear').addEventListener('click', clearLog);
    document.querySelector('#bronze-loop-download').addEventListener('click', () => {
      const blob = new Blob([state.logLines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bronze-loop-${Date.now()}.log`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      log('Log download created');
    });
    log(`Ready v${W[APP_KEY]?.version || 'unknown'}. Keep FSU/Enhancer enabled before starting.`);
  }

  state.bootTimer = setInterval(() => {
    if (document.body && isFutAppReady()) {
      clearInterval(state.bootTimer);
      state.bootTimer = null;
      installPanel();
    }
  }, 500);
})();
