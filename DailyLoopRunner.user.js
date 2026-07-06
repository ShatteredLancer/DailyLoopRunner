// ==UserScript==
// @name         FC26 Daily Loop Runner - Validation
// @namespace    local.fc26.validation
// @version      0.2.20
// @description  Configurable FC26 Web App loop runner for pack/SBC validation flows.
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.easports.com/*/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
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
        { tier: 'gold', rarity: 'common', count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ['unassigned', 'storage', 'transfer'] },
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
        { tier: 'gold', rarity: 'common', count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ['unassigned', 'storage', 'transfer'] },
      ],
      priorityPiles: ['unassigned', 'storage', 'transfer'],
      clubFallbackPiles: ['unassigned', 'storage', 'transfer', 'club'],
      maxCompletions: 1,
    },
    {
      id: 'one-click-daily-mvp',
      name: 'One-click Daily MVP (1 each)',
      strategy: 'dailyRoutine',
      steps: ['daily-bronze-mvp', 'daily-silver-mvp', 'daily-common-mvp', 'daily-rare-mvp'],
      openRewardPacks: true,
    },
    {
      id: 'one-click-daily',
      name: 'One-click Daily Loop (max 7 each)',
      strategy: 'dailyRoutine',
      steps: ['daily-bronze', 'daily-silver', 'daily-common', 'daily-rare'],
      openRewardPacks: true,
    },
    {
      id: '84x100-mvp',
      name: '84x100 MVP (1 run)',
      strategy: 'fillAndVerifySbc',
      sbcNames: [
        '84x100',
        '84 x100',
        '84 x 100',
        '84+ x100',
        '84+ x 100',
        '100x 84+',
        '100 x 84+',
        '84+ x10',
        '84+ x 10',
        '10 名 84+ 升级',
        '10名84+升级',
      ],
      maxCompletions: 1,
      maxSubmittedRating: 88,
      blockSpecial: true,
      blockTradeable: true,
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
    logLines: [],
    bootTimer: null,
  };

  function destroyRunner() {
    state.stopping = true;
    if (state.bootTimer) clearInterval(state.bootTimer);
    document.querySelector('#bronze-loop-panel')?.remove();
    document.querySelector('#bronze-loop-style')?.remove();
  }

  W[APP_KEY] = {
    version: '0.2.20',
    destroy: destroyRunner,
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
    const box = document.querySelector('#bronze-loop-log');
    if (box) box.textContent = state.logLines.join('\n');
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
    ['playerOnly', 'allowSpecial', 'special'].forEach((field) => {
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
    ['openRewardPacks', 'blockSpecial', 'blockTradeable'].forEach((field) => {
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

    validateNumberArray(loopDef.sourcePackIds, 'sourcePackIds', errors);
    validateNumberArray(loopDef.rewardPackIds, 'rewardPackIds', errors);
    validateNumberArray(loopDef.protectedItemIds, 'protectedItemIds', errors);
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

  function getEditorLoopStrategy() {
    const selectedId = document.querySelector('#bronze-loop-select')?.value || getLoopDefs()[0]?.id || LOOP_DEFS[0].id;
    if (selectedId !== 'custom') return getLoopDefById(selectedId).strategy;
    try {
      const parsed = JSON.parse(document.querySelector('#bronze-loop-json')?.value || '{}');
      return parsed.strategy || '';
    } catch {
      return '';
    }
  }

  function updateLoopControls() {
    const roundsLabel = document.querySelector('#bronze-loop-rounds-label');
    const roundsInput = document.querySelector('#bronze-loop-rounds');
    if (!roundsLabel || !roundsInput) return;
    const showRounds = ['validationBronzeUpgrade', 'provisionPackDualCrafting'].includes(getEditorLoopStrategy());
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
    const safeText = String(text || '').toLowerCase();
    return patterns.some((p) => safeText.includes(String(p).toLowerCase()));
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
      () => W.services?.Store && W.services?.SBC && W.services?.Item && W.repositories?.Store && W.repositories?.Item,
      30000,
      'FUT services',
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

  async function refreshStorePacks() {
    const controller = ctrl();
    const result = await observeOnce(
      W.services.Store.getPacks(W.PurchasePackType.ALL, true, true),
      controller,
      30000,
      'Store.getPacks',
    );
    if (!result?.success) fail(`Store pack refresh failed: ${result?.error?.code || result?.status || 'unknown'}`);
    return result;
  }

  async function refreshUnassigned() {
    const controller = ctrl();
    try { W.repositories.Item.unassigned.reset(); } catch { }
    const result = await observeOnce(
      W.services.Item.requestUnassignedItems(),
      controller,
      20000,
      'requestUnassignedItems',
    );
    if (!result?.success) fail(`Unassigned refresh failed: ${result?.error?.code || result?.status || 'unknown'}`);
    return result;
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

    await refreshUnassigned().catch((e) => {
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

  function getMyPacks() {
    const repo = W.repositories?.Store?.myPacks || W.services?.Store?.storeDao?.storeRepo?.myPacks;
    if (!repo) return [];
    if (typeof repo.values === 'function') return Array.from(repo.values());
    if (Array.isArray(repo._collection)) return repo._collection;
    if (repo._collection && typeof repo._collection === 'object') return Object.values(repo._collection);
    return [];
  }

  function findPackByName(patterns) {
    const packs = getMyPacks();
    return packs.find((p) => matchesAny(packName(p), patterns));
  }

  function findPackById(packId) {
    if (!packId) return null;
    return getMyPacks().find((p) => Number(p?.id) === Number(packId));
  }

  function summarizePacks(packs = getMyPacks()) {
    const counts = new Map();
    for (const pack of packs) {
      const key = `${packName(pack)} (#${pack.id})`;
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

  function itemMatchesSpec(item, spec = {}) {
    if (spec.playerOnly && !isPlayer(item)) return false;
    if (spec.special === true && !isSpecial(item)) return false;
    if (spec.special === false && isSpecial(item)) return false;
    if (spec.special !== true && spec.allowSpecial !== true && isSpecial(item)) return false;
    if (spec.tier === 'bronze' && !isBronze(item)) return false;
    if (spec.tier === 'silver' && !isSilver(item)) return false;
    if (spec.tier === 'gold' && !isGold(item)) return false;
    if (spec.rarity === 'rare' && !isRare(item)) return false;
    if (spec.rarity === 'common' && isRare(item)) return false;
    return true;
  }

  function isTargetDuplicate(item, loopDef) {
    return isDuplicate(item) && itemMatchesSpec(item, loopDef?.targetDuplicate || {});
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

  function isSbcUsablePlayer(item) {
    if (!isPlayer(item)) return false;
    if (isProtectedHighGold(item)) return false;
    if (Number(item?.loans) !== -1) return false;
    try { if (item?.isLimitedUse?.()) return false; } catch { }
    try { if (item?.isEnrolledInAcademy?.()) return false; } catch { }
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) return false;
    if (!isInactiveTrade(item)) return false;
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

  async function handleSilverRewardItems(items) {
    log(`Handling ${items?.length || 0} reward item(s) with unassigned cleanup strategy`);
    await clearUnassigned('reward item handling');
  }

  async function openPack(pack, purpose) {
    if (!pack) fail(`Pack not found for ${purpose}`);
    await clearUnassigned(`opening ${purpose}`);
    const name = packName(pack);
    log(`Opening pack: ${name} (#${pack.id})`);
    const result = await observeOnce(pack.open(), ctrl(), 30000, `open ${name}`);
    if (!result?.success || !result?.response?.items) {
      fail(`Open pack failed: ${result?.error?.code || result?.status || 'unknown'}`);
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
    await waitFor(() => ctrl()?.constructor?.name === 'UTSBCSquadSplitViewController', 15000, 'SBC squad screen');
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

  function sortSbcFodder(items) {
    return [...items].sort((a, b) =>
      Number(a?.rating || 0) - Number(b?.rating || 0) ||
      Number(isRare(a)) - Number(isRare(b)) ||
      Number(a?.id || 0) - Number(b?.id || 0)
    );
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
      requirement.playerOnly ? 'player' : '',
      requirement.allowSpecial ? 'special-ok' : 'no-special',
    ].filter(Boolean).join(' ');
  }

  function getUsabilityRejectReasons(item) {
    const reasons = [];
    if (!isPlayer(item)) reasons.push('not-player');
    if (isProtectedHighGold(item)) reasons.push('protected-82-plus');
    if (Number(item?.loans) !== -1) reasons.push('loan-or-limited');
    try { if (item?.isLimitedUse?.()) reasons.push('limited-use'); } catch { }
    try { if (item?.isEnrolledInAcademy?.()) reasons.push('academy'); } catch { }
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) reasons.push('active-trade');
    if (!isInactiveTrade(item)) reasons.push('active-trade');
    return reasons;
  }

  function getSpecRejectReasons(item, spec = {}) {
    const reasons = [];
    if (spec.playerOnly && !isPlayer(item)) reasons.push('not-player');
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

  function diagnosePileForRequirement(pileName, requirement) {
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
      const usabilityRejects = getUsabilityRejectReasons(item);
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
        const resolved = findSubmissionItemForDuplicateSignal(item, new Set(), requirement);
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
    const piles = requirement?.priorityPiles || fallbackPriorityPiles || ['storage', 'transfer', 'club'];
    log(`${label}: diagnostics for ${describeRequirement(requirement)} across ${piles.join(' > ')}`);

    for (const pileName of piles) {
      const diag = diagnosePileForRequirement(pileName, requirement);
      const signalText = pileNeedsDuplicateSignalResolution(pileName)
        ? `, duplicate signals:${diag.duplicateSignals}, resolved:${diag.resolvedSignals}`
        : '';
      log(`${label}: ${pileName} total:${diag.total}, matching:${diag.matching}, unique defs:${diag.uniqueDefinitions}${signalText}`);
      const rejectText = formatCounts(diag.reasons);
      if (rejectText) log(`${label}: ${pileName} rejects ${rejectText}`);
    }
  }

  function logSelectionDiagnostics(label, selection, fallbackPriorityPiles) {
    if (!selection?.missing) return;
    logRequirementDiagnostics(label, selection.missing, fallbackPriorityPiles);
  }

  function getSubmissionCacheItems() {
    return uniqueItems(getStorageItems().concat(getClubItems()));
  }

  function isSameDefinition(a, b) {
    return Number(a?.definitionId || 0) === Number(b?.definitionId || -1);
  }

  function findSubmissionItemForDuplicateSignal(signal, usedIds, spec = {}) {
    const duplicateId = Number(signal?.duplicateId || 0);
    const cacheItems = getSubmissionCacheItems().filter((item) =>
      isSbcUsablePlayer(item) &&
      itemMatchesSpec(item, spec) &&
      !usedIds.has(Number(item?.id || 0))
    );

    if (duplicateId) {
      const direct = cacheItems.find((item) => Number(item?.id || 0) === duplicateId);
      if (direct) return direct;
    }

    return sortSbcFodder(cacheItems).find((item) => isSameDefinition(item, signal)) || null;
  }

  function pileNeedsDuplicateSignalResolution(pileName) {
    return pileName === 'transfer' || pileName === 'unassigned';
  }

  function selectInventoryPlayers(requirements, priorityPiles = ['storage', 'transfer', 'club']) {
    const selected = [];
    const selectedIds = new Set();
    const selectedDefinitionIds = new Set();
    const submissionIds = new Set();
    const stats = {};
    const resolvedSignals = {};
    const entries = [];

    for (const requirement of requirements || []) {
      let need = Number(requirement.count || 0);
      const piles = requirement.priorityPiles || priorityPiles;
      for (const pileName of piles) {
        if (need <= 0) break;
        const candidates = sortSbcFodder(getPileItemsByName(pileName))
          .filter((item) =>
            !selectedIds.has(Number(item?.id || 0)) &&
            !selectedDefinitionIds.has(Number(item?.definitionId || 0)) &&
            isSbcUsablePlayer(item) &&
            itemMatchesSpec(item, requirement)
          );
        let picked = [];

        if (pileNeedsDuplicateSignalResolution(pileName)) {
          for (const signal of candidates) {
            if (picked.length >= need) break;
            if (!isDuplicate(signal)) continue;
            const resolved = findSubmissionItemForDuplicateSignal(signal, submissionIds, requirement);
            if (!resolved) continue;
            if (selectedDefinitionIds.has(Number(resolved?.definitionId || 0))) continue;
            picked.push({ signal, item: resolved });
            selectedIds.add(Number(signal.id));
            selectedIds.add(Number(resolved.id));
            selectedDefinitionIds.add(Number(resolved.definitionId || 0));
            submissionIds.add(Number(resolved.id));
          }
        } else {
          picked = candidates
            .filter((item) => !submissionIds.has(Number(item?.id || 0)))
            .slice(0, need)
            .map((item) => ({ signal: null, item }));
          for (const pickedItem of picked) {
            selectedIds.add(Number(pickedItem.item.id));
            selectedDefinitionIds.add(Number(pickedItem.item.definitionId || 0));
            submissionIds.add(Number(pickedItem.item.id));
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
      fail(`${label}: saveChallenge failed: ${code}${msg ? ` ${msg}` : ''}`);
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

  async function fillSbcSquad(label = 'SBC') {
    const squad = await waitFor(() => ctrl()?._squad, 15000, 'SBC squad object');
    try { squad.removeAllItems?.(); } catch { }
    await sleep(500);

    if (clickButtonByText(['重复球员填充阵容', '重複球員填充陣容', 'Repeat player fill squad'])) {
      log('Clicked duplicate fill');
      await waitLoadingEnd();
      await sleep(CFG.pauseMs);
    }

    if (clickButtonByText(['一键完成', '一鍵完成', '一键填充', '一鍵填充', 'One-click fill'])) {
      log('Clicked FSU one-click fill/complete');
      await waitLoadingEnd();
      await sleep(CFG.pauseMs);
    }

    if (!findSubmitButton() && clickButtonByText(['Completion', '完成', '補全', '补全'])) {
      log('Clicked FSU completion');
      await waitLoadingEnd();
      await sleep(CFG.pauseMs);
    }

    if (clickButtonByText(['阵容补全', '陣容補全', 'Squad completion'])) {
      log('Clicked squad completion');
      await waitLoadingEnd();
      await sleep(CFG.pauseMs);
      clickButtonByText(['确定', '確定', 'Ok']);
      await waitLoadingEnd();
    }

    const filled = getFilledSquadSlots(squad);
    const submitReady = !!findSubmitButton();
    log(`${label} squad filled slots detected: ${filled}; submit ${submitReady ? 'ready' : 'not ready'}`);
    if (!submitReady) fail(`${label} squad is not complete`);
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

  function formatSquadItem(item, index) {
    const groups = itemGroups(item);
    const parts = [
      `${index + 1}. ${itemDisplayName(item)}`,
      `rating:${Number(item?.rating || 0) || '?'}`,
      isSpecial(item) ? 'special' : (isRare(item) ? 'rare' : 'common'),
      isTradeable(item) ? 'tradeable' : 'untradeable',
      `id:${Number(item?.id || 0) || '?'}`,
      `def:${Number(item?.definitionId || 0) || '?'}`,
    ];
    if (groups.length) parts.push(`groups:${groups.join('/')}`);
    return parts.join(' | ');
  }

  function getSbcProtectionReasons(item, loopDef = {}) {
    const reasons = [];
    const rating = Number(item?.rating || 0);
    const maxRating = Number(loopDef.maxSubmittedRating || 0);
    const groups = itemGroups(item).map(Number);
    const protectedIds = new Set((loopDef.protectedItemIds || []).map(Number));

    if (Number(item?.loans ?? -1) !== -1) reasons.push('loan');
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) reasons.push('active-trade');
    if (protectedIds.has(Number(item?.id || 0))) reasons.push('protected-id');
    if (loopDef.blockSpecial !== false && (isSpecial(item) || groups.includes(23))) reasons.push('special-blocked');
    if (loopDef.blockTradeable !== false && isTradeable(item)) reasons.push('tradeable-blocked');
    if (maxRating && rating > maxRating) reasons.push(`rating-over-${maxRating}`);

    return reasons;
  }

  function inspectSbcSquad(loopDef, squad = ctrl()?._squad) {
    const items = getSquadItems(squad);
    const blocked = [];

    items.forEach((item, index) => {
      const reasons = getSbcProtectionReasons(item, loopDef);
      if (reasons.length) blocked.push({ item, index, reasons });
    });

    return { items, blocked };
  }

  function logSbcSquadInspection(loopDef, inspection, options = {}) {
    const maxItems = Number(options.maxItems || 20);
    log(`${loopDef.name}: squad inspection ${inspection.items.length} item(s), blocked ${inspection.blocked.length}`);
    inspection.items.slice(0, maxItems).forEach((item, index) => {
      const reasons = getSbcProtectionReasons(item, loopDef);
      log(`${loopDef.name}: squad ${formatSquadItem(item, index)}${reasons.length ? ` | BLOCK ${reasons.join(',')}` : ''}`);
    });
    if (inspection.items.length > maxItems) {
      log(`${loopDef.name}: squad list truncated: ${inspection.items.length - maxItems} more item(s)`);
    }
  }

  function assertSbcSquadSafe(loopDef, inspection) {
    if (!inspection.items.length) fail(`${loopDef.name}: no squad items detected after fill`);
    if (!inspection.blocked.length) return;

    const summary = inspection.blocked
      .slice(0, 10)
      .map(({ item, index, reasons }) => `${index + 1}. ${itemDisplayName(item)} rating:${Number(item?.rating || 0) || '?'} (${reasons.join(',')})`)
      .join('; ');
    fail(`${loopDef.name}: protected squad item(s) detected; stop before submit: ${summary}`);
  }

  async function fillBronzeUpgradeSquad() {
    await fillSbcSquad('Bronze Upgrade');
  }

  async function submitSbcAndGetAwardPackId(set) {
    const beforePackIds = new Set(getMyPacks().map((p) => String(p.id)));
    const submitBtn = await waitFor(() => findSubmitButton(), 10000, 'submit button');

    log(`Submitting SBC: ${set.name}`);
    simulateClick(submitBtn);
    await sleep(900);

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
    }

    await waitLoadingEnd(900, 45000);
    await refreshStorePacks().catch(() => null);

    const awardId = Number(set?.awards?.[0]?.value) || null;
    if (awardId) return awardId;

    const newPack = getMyPacks().find((p) => !beforePackIds.has(String(p.id)) && matchesAny(packName(p), CFG.silverRewardNames));
    return newPack?.id || null;
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

  function findRewardPackInCache(loopDef, explicitPackId = null) {
    let pack = explicitPackId ? findPackById(explicitPackId) : null;
    if (!pack && loopDef.rewardPackIds?.length) {
      pack = loopDef.rewardPackIds.map((id) => findPackById(id)).find(Boolean);
    }
    if (!pack && loopDef.rewardPackNames?.length) pack = findPackByName(loopDef.rewardPackNames);
    return pack || null;
  }

  async function findRewardPack(loopDef, explicitPackId = null, options = {}) {
    const attempts = Math.max(1, Number(options.attempts || 1) || 1);
    const delayMs = Math.max(0, Number(options.delayMs || 0) || 0);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await refreshStorePacks().catch((e) => {
        if (attempt === attempts) log(`Reward pack refresh failed: ${e.message || e}`);
      });
      const pack = findRewardPackInCache(loopDef, explicitPackId);
      if (pack) return pack;
      if (attempt < attempts && delayMs) await sleep(delayMs);
    }
    return null;
  }

  async function openRewardPackAndCleanup(loopDef, rewardPackId, reason = 'reward pack') {
    const pack = await findRewardPack(loopDef, rewardPackId, { attempts: 6, delayMs: 1800 });
    if (!pack) {
      const packs = summarizePacks();
      log(`${loopDef.name}: reward pack not found for auto-open${rewardPackId ? ` (#${rewardPackId})` : ''}; current packs: ${packs || 'none'}`);
      return false;
    }

    const items = await openPack(pack, `${loopDef.name} ${reason}`);
    log(`${loopDef.name}: auto-opened reward pack ${packName(pack)} (#${pack.id}); ${items.length || 0} item(s)`);
    await clearUnassigned(`${loopDef.name} ${reason} handling`);
    return true;
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
        const items = await openPack(pack, loopDef.name);
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
      return {
        name: step.name || step.id || step.strategy || 'step',
        limit,
      };
    });
    return {
      limits,
      max: limits.reduce((maxLimit, step) => Math.max(maxLimit, step.limit), 1),
      total: limits.reduce((sum, step) => sum + step.limit, 0),
      text: limits.map((step) => `${step.name} max ${step.limit}`).join('; '),
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

  async function runFillAndVerifySbc(loopDef) {
    await waitAppReady();
    const maxCompletions = Math.max(1, Math.min(1, Number(loopDef.maxCompletions || 1) || 1));
    let completions = 0;

    while (completions < maxCompletions) {
      stopPoint();
      const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
      const opened = await openSbcSet(set, { returnNullIfComplete: true });
      if (!opened) {
        log(`${loopDef.name}: no available SBC challenge remains`);
        break;
      }

      await fillSbcSquad(loopDef.name);
      const squad = ctrl()?._squad || opened.challenge?.squad;
      const inspection = inspectSbcSquad(loopDef, squad);
      logSbcSquadInspection(loopDef, inspection);

      if (loopDef.dryRun) {
        if (inspection.blocked.length) {
          log(`${loopDef.name}: dry-run blocked by protected squad item(s); live run would stop before submit`);
        } else {
          log(`${loopDef.name}: dry-run squad passed protection; live run would submit once`);
        }
        try { ctrl()?._squad?.removeAllItems?.(); } catch { }
        log(`${loopDef.name}: dry run stops before SBC submit`);
        return;
      }

      assertSbcSquadSafe(loopDef, inspection);
      const rewardPackId = await submitSbcAndGetAwardPackId(opened.set);
      if (rewardPackId && loopDef.openRewardPacks) {
        await openRewardPackAndCleanup(loopDef, rewardPackId);
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

  function isCommonGoldPlayer(item) {
    return !isProtectedHighGold(item) && itemMatchesSpec(item, { tier: 'gold', rarity: 'common', playerOnly: true, allowSpecial: false });
  }

  function isCommonGoldDuplicate(item) {
    return isDuplicate(item) && isCommonGoldPlayer(item);
  }

  function isRareGoldPlayer(item) {
    return !isProtectedHighGold(item) && itemMatchesSpec(item, { tier: 'gold', rarity: 'rare', playerOnly: true, allowSpecial: false });
  }

  function isRareGoldDuplicate(item) {
    return isDuplicate(item) && isRareGoldPlayer(item);
  }

  function isProvisionCraftingDuplicate(item) {
    return isCommonGoldDuplicate(item) || isRareGoldDuplicate(item);
  }

  async function handleRareSourcePackItems(items, loopDef) {
    const reservedIds = new Set((items || []).filter(isCommonGoldDuplicate).map((item) => Number(item?.id || 0)));
    const directClub = (items || []).filter((item) =>
      !reservedIds.has(Number(item?.id || 0)) &&
      !isDuplicate(item)
    );

    if (directClub.length) {
      log(`${loopDef.name}: moving ${directClub.length} non-duplicate source item(s) to club`);
      await moveItems(directClub, W.ItemPile.CLUB, true);
    }

    await clearUnassigned(`${loopDef.name} source pack handling`, {
      reserveItem: isCommonGoldDuplicate,
    });

    await refreshUnassigned();
    const reserved = getUnassignedItems().filter(isCommonGoldDuplicate);
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
        log(`${loopDef.name}: no 11x Gold Players Pack available; using club as final fallback`);
        selection = selectLoopInventoryPlayers(loopDef, clubFallbackPiles);
        log(`${loopDef.name}: club fallback selected ${selection.selected.length} common gold player(s) (${formatSelectionStats(selection.stats)})`);
        if (!selection.ok) {
          const fallbackMissing = selection.missing;
          log(`${loopDef.name}: still missing ${fallbackMissing.count} common gold player(s) after club fallback; stopping`);
          logSelectionDiagnostics(`${loopDef.name} club fallback`, selection, clubFallbackPiles);
          await clearUnassigned(`${loopDef.name} no source pack cleanup`);
          break;
        }

        const result = await submitInventorySelection(loopDef, selection);
        if (!result) break;
        completions++;
        await sleep(CFG.pauseMs);
        continue;
      }

      log(`${loopDef.name}: opening source pack before using club: ${packName(pack)} (#${pack.id})`);
      if (getUnassignedItems().length) {
        await clearUnassigned(`${loopDef.name} before opening source pack`);
      }

      const items = await openPack(pack, loopDef.name);
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
      const items = await openPack(pack, `${loopDef.name} round ${round}`);
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

    if (loopDef.strategy === 'fillAndVerifySbc') {
      await runFillAndVerifySbc(loopDef);
      await showUnassignedIfAny(`${loopDef.name} end`);
      return;
    }

    fail(`Unsupported loop strategy: ${loopDef.strategy}`);
  }

  function getLiveRunLimit(loopDef, rounds) {
    if (loopDef.strategy === 'validationBronzeUpgrade') return Number(rounds || loopDef.maxRounds || 1);
    if (loopDef.strategy === 'fillAndVerifySbc') return Number(loopDef.maxCompletions || 1);
    if (loopDef.strategy === 'dailyRoutine') {
      return summarizeRoutineStepLimits(getRoutineStepLoopDefs(loopDef)).max;
    }
    return Number(loopDef.maxCompletions || loopDef.rounds || loopDef.maxRounds || 1);
  }

  function getLiveRunScopeMessage(loopDef, rounds, limit) {
    if (loopDef.strategy === 'dailyRoutine') {
      const summary = summarizeRoutineStepLimits(getRoutineStepLoopDefs(loopDef));
      return `may submit up to ${summary.total} SBC(s) total (${summary.text})`;
    }
    return `may submit up to ${limit} SBC(s)`;
  }

  function confirmLiveRunIfNeeded(loopDef, rounds) {
    if (loopDef.dryRun) {
      state.pendingLiveConfirm = null;
      return true;
    }

    const limit = getLiveRunLimit(loopDef, rounds);
    if (!Number.isFinite(limit) || limit <= 1) {
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
      if (loopDef.strategy === 'provisionPackDualCrafting') loopDef.rounds = rounds;
      if (!confirmLiveRunIfNeeded(loopDef, rounds)) return;
    } catch (e) {
      log(`Stopped: ${e.message || e}`);
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
    if (start) start.disabled = state.running;
    if (stop) stop.disabled = !state.running;
    if (select) select.disabled = state.running;
    if (edit) edit.disabled = state.running;
    if (refresh) refresh.disabled = state.running || state.refreshing;
    if (loadJson) loadJson.disabled = state.running || state.loadingLoops;
    if (builtIn) builtIn.disabled = state.running || state.loadingLoops || state.loopConfigSource === 'built-in';
    if (dryRun) dryRun.disabled = state.running;
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

    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button,select,input,textarea')) return;
      dragging = true;
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
      const nextLeft = Math.max(0, Math.min(window.innerWidth - 80, startLeft + event.clientX - startX));
      const nextTop = Math.max(0, Math.min(window.innerHeight - 40, startTop + event.clientY - startY));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      event.preventDefault();
    });

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      savePanelPos(panel);
    };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
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
        width: 320px;
        background: #15181d;
        border: 1px solid #5b6f8f;
        color: #f4f6f8;
        font: 12px Arial, sans-serif;
        padding: 8px;
        box-shadow: 0 8px 30px rgba(0,0,0,.35);
      }
      #bronze-loop-panel.collapsed {
        width: 220px;
      }
      #bronze-loop-panel.collapsed .panel-body {
        display: none;
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
      #bronze-loop-panel button { min-width: 62px; height: 26px; cursor: pointer; font-size: 11px; }
      #bronze-loop-collapse { min-width: 28px !important; width: 28px; padding: 0; }
      #bronze-loop-panel input { width: 54px; height: 24px; background: #222832; color: #fff; border: 1px solid #607089; }
      #bronze-loop-panel input[type="checkbox"] { width: 14px; height: 14px; accent-color: #78a6ff; }
      #bronze-loop-dry-run-label { cursor: pointer; user-select: none; }
      #bronze-loop-panel select {
        flex: 1;
        min-width: 0;
        height: 28px;
        background: #222832;
        color: #fff;
        border: 1px solid #607089;
      }
      #bronze-loop-json {
        display: none;
        width: 100%;
        height: 170px;
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
        height: 120px;
        overflow: auto;
        white-space: pre-wrap;
        background: #0c0f13;
        border: 1px solid #303946;
        padding: 8px;
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'bronze-loop-panel';
    panel.innerHTML = `
      <div class="row" id="bronze-loop-drag">
        <span id="bronze-loop-title">Loop Runner</span>
        <button id="bronze-loop-collapse" title="Collapse">-</button>
      </div>
      <div class="panel-body">
        <div class="row">
          <select id="bronze-loop-select"></select>
        </div>
        <div class="row" id="bronze-loop-rounds-row">
          <span id="bronze-loop-rounds-label">rounds</span>
          <input id="bronze-loop-rounds" type="number" min="1" max="50" value="${CFG.maxRounds}">
        </div>
        <div class="row">
          <label id="bronze-loop-dry-run-label" title="Log planned selections without moving items, opening packs, or submitting SBCs">
            <input id="bronze-loop-dry-run" type="checkbox"> Dry run
          </label>
          <button id="bronze-loop-start">Start</button>
          <button id="bronze-loop-stop" disabled>Stop</button>
        </div>
        <div class="row">
          <button id="bronze-loop-edit">Edit JSON</button>
          <button id="bronze-loop-refresh">Refresh caches</button>
        </div>
        <div class="row">
          <button id="bronze-loop-load-json">Load loops JSON</button>
          <button id="bronze-loop-built-in" disabled>Built-in loops</button>
        </div>
        <div class="row">
          <button id="bronze-loop-copy">Copy log</button>
          <button id="bronze-loop-clear">Clear log</button>
          <button id="bronze-loop-download">Save log</button>
        </div>
        <textarea id="bronze-loop-json" spellcheck="false"></textarea>
        <div id="bronze-loop-log"></div>
      </div>
    `;
    document.body.appendChild(panel);
    const savedPos = getSavedPanelPos();
    if (savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
      panel.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, savedPos.left))}px`;
      panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, savedPos.top))}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    makePanelDraggable(panel);
    renderLoopSelect();
    document.querySelector('#bronze-loop-collapse').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      document.querySelector('#bronze-loop-collapse').textContent = panel.classList.contains('collapsed') ? '+' : '-';
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
    log('Ready. Keep FSU/Enhancer enabled before starting.');
  }

  state.bootTimer = setInterval(() => {
    if (document.body) {
      clearInterval(state.bootTimer);
      state.bootTimer = null;
      installPanel();
    }
  }, 500);
})();
