// ==UserScript==
// @name         FC26 Daily Loop Runner - Validation
// @namespace    local.fc26.validation
// @version      0.5.20
// @description  Configurable FC26 Web App loop runner for pack/SBC validation flows.
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.easports.com/*/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      127.0.0.1
// @connect      localhost
// @connect      www.fut.gg
// @connect      enhancer-api.futnext.com
// @connect      ntfy.sh
// @run-at       document-end
// ==/UserScript==

import {
  APP_KEY,
  BATCH_OPEN_PLAN_KEY,
  CFG,
  FSU_COMPAT_DEFAULTS,
  LOOP_CONFIG_URL,
  LOOP_UI_OPTIONS_KEY,
  PICK_OPTIONS_KEY,
  REWARD_ALERT_SETTINGS_KEY,
} from './config/runtime.js';
import { LOOP_DEFS } from './config/loops.js';
import { selectionRequirements } from './config/selection.js';
import { applyDisabledPiles, visibleLoopDefs } from './config/loop-presentation.js';
import {
  getLiveRunLimit as getLiveRunLimitPure,
  getPlayerPickChallengeCount,
  resolvePlayerPickRunTarget,
  summarizeRoutineStepLimits as summarizeRoutineStepLimitsPure,
} from './config/run-limits.js';
import {
  configureRoutineStepForAvailability,
  resolveRoutineStepLoopDefs,
} from './config/routine-steps.js';
import {
  applyLoopRuntimeOptions,
  loopUsesRounds,
  normalizePickRuntimeOptions,
} from './config/runtime-options.js';
import {
  assertValidLoopDef as assertValidLoopDefPure,
  normalizeLoopConfig as normalizeLoopConfigPure,
  parseLoopConfig as parseLoopConfigPure,
  validateLoopConfig as validateLoopConfigPure,
  validateLoopDef as validateLoopDefPure,
  validateLoopDefList as validateLoopDefListPure,
} from './config/loop-schema.js';
import { normalizeFsuSettings } from './config/fsu-compat.js';
import { normalizeBatchOpenPlan } from './config/batch-open.js';
import {
  buildPlayerPickDiscoverySession,
  parsePlayerPickSbcSnapshot,
} from './config/player-pick-discovery.js';
import {
  DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
  RECOVERY_RECIPES,
  UNASSIGNED_RECOVERY_POLICIES,
} from './config/recovery.js';
import { cloneLoopDef, isPlainObject } from './domain/objects.js';
import { calculateEaSquadRating } from './domain/rating.js';
import { createRuntimeAdapters } from './adapters/index.js';
import { createItemSnapshot } from './domain/contracts.js';
import { selectInventoryPlayers as selectInventoryPlayersPure } from './selection/index.js';
import {
  buildRatingCandidateEntries,
  selectRatingCandidateEntries,
} from './selection/rating-candidates.js';
import {
  parseRatingSbcChallenge as parseRatingSbcChallengePure,
  validateRatingSbcModelAgainstItems as validateRatingSbcModelAgainstItemsPure,
} from './selection/rating-model.js';
import {
  mergeTransientUnassignedSignals,
  selectionConsumesAllSignalRefs,
} from './selection/transient-signals.js';
import {
  createExistingSquadProvider,
  createFsuFillProvider,
  createInventorySquadProvider,
  submitSbcAttempt,
} from './sbc/submit-attempt.js';
import {
  isSbcControllerName,
  synchronizeAfterSbcSubmit,
  unwindSbcSquadControllers as unwindSbcSquadControllersShared,
} from './sbc/navigation-sync.js';
import { scanPlayerPickSbcSnapshots } from './sbc/player-pick-discovery-scan.js';
import { claimSbcRewards } from './reward/sbc-claim.js';
import {
  capturePlayerPickSelections,
  classifyPendingPlayerPicks,
  getManualPlayerPickReason,
  partitionPendingPlayerPicks,
  playerPickMatchesReward,
  playerPickItemName,
  rankPlayerPickCandidates,
} from './reward/player-pick.js';
import { loadPlayerPickPrices } from './reward/player-prices.js';
import {
  createPackHighlightModel,
  formatPackHighlightNotification,
  normalizeRewardAlertSettings,
} from './reward/pack-highlight.js';
import {
  createBatchOpenRecapModel,
  createBatchOpenRecapPreviewModel,
} from './reward/batch-open-recap.js';
import { resolveUnassigned } from './unassigned/resolve.js';
import { confirmUnassignedView } from './unassigned/confirmation.js';
import { createRecoveryOverflowResolvers, selectionConsumesSignalRefs } from './unassigned/recovery.js';
import { openPackTransaction } from './pack/open-transaction.js';
import { createOpenedItemPolicy } from './pack/opened-item-policy.js';
import { classifyOpenedUpgradeDuplicates } from './pack/upgrade-duplicate-routing.js';
import { runSupplyAndCraftWorkflow } from './workflows/supply-and-craft.js';
import { runRecycleWorkflow } from './workflows/recycle.js';
import { runPackAndCraftWorkflow } from './workflows/pack-and-craft.js';
import { runPlayerPickWorkflow } from './workflows/player-pick.js';
import { runRepeatedSubmissionWorkflow } from './workflows/repeated-submission.js';
import { runReservedDuplicateCraftingWorkflow } from './workflows/reserved-duplicate-crafting.js';
import { runSequenceWorkflow } from './workflows/sequence.js';
import { runValidationRoundWorkflow } from './workflows/validation-round.js';
import { runBatchOpenWorkflow } from './workflows/batch-open.js';
import { dispatchConfiguredWorkflow } from './workflows/dispatch.js';
import { createLogRenderer, formatLogHtml } from './ui/log-renderer.js';
import { bindMainPanelCommands, hydrateMainPanelOptions } from './ui/main-panel-bindings.js';
import { createMainPanelCommands } from './ui/main-panel-commands.js';
import { createMainPanelGeometry } from './ui/main-panel-geometry.js';
import {
  renderMainPanelLoopOptions,
  renderMainPanelRecap,
  renderMainPanelRounds,
  renderMainPanelRuntimeState,
  renderRewardAlertSummary,
} from './ui/main-panel-state.js';
import { mountMainPanel, setMainPanelStartupHidden } from './ui/main-panel-view.js';
import { waitForManualPlayerPickSelection } from './ui/player-pick-modal.js';
import { showPlayerPickRecap } from './ui/player-pick-recap.js';
import { triggerRewardFireworks } from './ui/reward-celebration.js';
import { createSbcRewardOverlay } from './ui/sbc-reward-overlay.js';
import { showPackHighlightToast } from './ui/reward-highlight.js';
import { showRewardAlertSettings } from './ui/reward-alert-settings.js';
import { showBatchOpenDialog } from './ui/batch-open-dialog.js';
import { showBatchOpenRecap } from './ui/batch-open-recap.js';

(function () {
  'use strict';

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  try { W[APP_KEY]?.destroy?.(); } catch { }

  const adapters = createRuntimeAdapters(W, document, {
    gmRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null,
    gmNotification: typeof GM_notification === 'function' ? GM_notification : null,
    gmGetValue: typeof GM_getValue === 'function' ? GM_getValue : null,
    gmSetValue: typeof GM_setValue === 'function' ? GM_setValue : null,
    gmDeleteValue: typeof GM_deleteValue === 'function' ? GM_deleteValue : null,
    fetchImpl: typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  });
  const eaPackAdapter = () => adapters.pack();
  const eaInventoryAdapter = () => adapters.inventory({ capacityFallbacks: { storage: CFG.storageMax } });
  const inventoryPile = (pileName) => eaInventoryAdapter().pileValue(pileName);
  const eaPlayerPickAdapter = () => adapters.playerPick();
  const eaSbcAdapter = () => adapters.sbc();
  const fsuAdapter = () => adapters.fsu();
  const localizationAdapter = adapters.localization;
  const pageRuntime = adapters.page;


const state = {
    running: false,
    stopping: false,
    refreshing: false,
    scanningPicks: false,
    loadingLoops: false,
    loopDefs: null,
    discoveredLoopDefs: [],
    discoveredLoopOverrides: {},
    recoveryRecipes: null,
    unassignedRecoveryPolicies: null,
    defaultUnassignedRecoveryPolicyIds: null,
    loopConfigSource: 'built-in',
    stalePackRefs: new WeakSet(),
    lastStorePacks: [],
    consumedItemIds: new Set(),
    pendingConsumedDuplicateSignals: new Map(),
    assumedTotwItemIds: new Set(),
    recentRewardItems: [],
    logLines: [],
    bootTimer: null,
    fsuSettingsOverride: null,
    fsuSettingsCache: { at: 0, settings: null },
    lastOpenPackReceipt: null,
    lastPickRecap: null,
    lastBatchRecap: null,
    lastRecapType: null,
    showMvpLoops: false,
    loopStack: [],
    logRenderer: null,
    rewardAlertSettings: normalizeRewardAlertSettings(),
  };

  function destroyRunner() {
    state.stopping = true;
    if (state.bootTimer) clearInterval(state.bootTimer);
    state.logRenderer?.destroy?.();
    document.querySelector('#bronze-loop-panel')?.remove();
    document.querySelector('#bronze-loop-pick-modal')?.remove();
    document.querySelector('#bronze-loop-recap-modal')?.remove();
    document.querySelector('#bronze-loop-reward-alert-modal')?.remove();
    document.querySelector('#bronze-loop-batch-open-modal')?.remove();
    document.querySelector('#bronze-loop-batch-recap-modal')?.remove();
    document.querySelector('#bronze-loop-reward-highlight-stack')?.remove();
    document.querySelector('#bronze-loop-style')?.remove();
  }

  W[APP_KEY] = {
    version: '0.5.20',
    destroy: destroyRunner,
    getFsuSettings: () => getFsuSettings({ force: true }),
    getPackInventory: () => getPackInventorySnapshot(),
    setFsuSettingsOverride,
    clearFsuSettingsOverride,
    calculateSquadRating: calculateEaSquadRating,
    solveRatingSbcCandidates: findOptimalRatingSbcSelection,
    scanPlayerPicks: () => scanAvailablePlayerPickSbcs(),
    previewPackHighlight: (input = {}) => previewPackHighlight(input),
    previewBatchOpenRecap: () => previewBatchOpenRecap(),
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const now = () => new Date().toLocaleTimeString();

  function log(msg) {
    const line = `[${now()}] ${msg}`;
    console.log('[BronzeLoop]', msg);
    state.logLines.push(line);
    state.logLines = state.logLines.slice(-1000);
    state.logRenderer?.request?.();
  }

  const waitAdapter = adapters.wait({ sleep, stopPoint, log });
  const sbcRewardOverlay = createSbcRewardOverlay({
    dom: adapters.dom,
    pageRuntime,
    findButtonByText,
    findClickableByText,
    isClickableElement,
    compactText,
    matchesAny,
    click: simulateClick,
    sleep,
    log,
  });

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function renderLog() {
    state.logRenderer?.flushNow?.();
  }

  function clearLog() {
    state.logLines = [];
    renderLog();
    console.clear();
    console.log('[BronzeLoop] Log cleared');
  }

  function getLoopDefs() {
    const configured = state.loopDefs?.length ? state.loopDefs : LOOP_DEFS;
    const effectiveConfigured = configured.map((loopDef) => state.discoveredLoopOverrides?.[loopDef.id] || loopDef);
    return [...effectiveConfigured, ...(state.discoveredLoopDefs || [])];
  }

  function getConfiguredLoopDefs() {
    return state.loopDefs?.length ? state.loopDefs : LOOP_DEFS;
  }

  function getRecoveryRecipes() {
    return state.recoveryRecipes || RECOVERY_RECIPES;
  }

  function getUnassignedRecoveryPolicies() {
    return state.unassignedRecoveryPolicies || UNASSIGNED_RECOVERY_POLICIES;
  }

  function getDefaultUnassignedRecoveryPolicyIds() {
    return state.defaultUnassignedRecoveryPolicyIds || DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS;
  }

  function getVisibleLoopDefs() {
    return visibleLoopDefs(getLoopDefs(), state.showMvpLoops);
  }

  function findLoopDefById(id) {
    const loopDefs = getLoopDefs();
    return loopDefs.find((def) => def.id === id) || null;
  }

  function getLoopDefById(id) {
    return findLoopDefById(id) || getLoopDefs()[0] || LOOP_DEFS[0];
  }

  function validateLoopDef(loopDef, label = 'loop') {
    return validateLoopDefPure(loopDef, label);
  }

  function assertValidLoopDef(loopDef, label = 'Loop JSON') {
    return assertValidLoopDefPure(loopDef, label);
  }

  function validateLoopDefList(loopDefs, label = 'Loop config') {
    return validateLoopDefListPure(loopDefs, label);
  }

  function normalizeLoopConfig(config) {
    return normalizeLoopConfigPure(config);
  }

  function validateLoopConfig(config, label = 'Loop config') {
    return validateLoopConfigPure(config, label);
  }

  function setLoopConfig(config, source = 'custom') {
    const normalized = validateLoopConfig(config, source);
    state.loopDefs = cloneLoopDef(normalized.loops);
    state.recoveryRecipes = cloneLoopDef(normalized.recoveryRecipes);
    state.unassignedRecoveryPolicies = cloneLoopDef(normalized.unassignedRecoveryPolicies);
    state.defaultUnassignedRecoveryPolicyIds = [...normalized.defaultUnassignedRecoveryPolicyIds];
    state.loopConfigSource = source;
    state.discoveredLoopDefs = [];
    state.discoveredLoopOverrides = {};
    renderLoopSelect(state.loopDefs[0]?.id);
    log(`Loaded ${state.loopDefs.length} loop definition(s), ${state.recoveryRecipes.length} recovery recipe(s), and ${state.unassignedRecoveryPolicies.length} recovery policy(s) from ${source}`);
  }

  function resetLoopDefs() {
    state.loopDefs = null;
    state.recoveryRecipes = null;
    state.unassignedRecoveryPolicies = null;
    state.defaultUnassignedRecoveryPolicyIds = null;
    state.loopConfigSource = 'built-in';
    state.discoveredLoopDefs = [];
    state.discoveredLoopOverrides = {};
    renderLoopSelect(LOOP_DEFS[0]?.id);
    log(`Using built-in loop definitions (${LOOP_DEFS.length})`);
  }

  function parseLoopConfig(text) {
    return parseLoopConfigPure(text);
  }

  async function loadLoopConfig(url = LOOP_CONFIG_URL) {
    const text = await adapters.http.getText(`${url}?t=${Date.now()}`, { useRuntimeFallback: true });
    const config = parseLoopConfig(text);
    setLoopConfig(config, url);
  }

  function getSelectedLoopDef() {
    const select = document.querySelector('#bronze-loop-select');
    const selectedId = select?.value || getVisibleLoopDefs()[0]?.id || LOOP_DEFS[0].id;
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
    const panel = document.querySelector('#bronze-loop-panel');
    const nextValue = renderMainPanelLoopOptions({
      panel,
      loops: getVisibleLoopDefs().map((def) => ({ id: def.id, name: def.name })),
      selectedId,
      createOption: () => document.createElement('option'),
    });
    if (nextValue && nextValue !== 'custom') setLoopJson(getLoopDefById(nextValue));
    updateLoopControls();
  }

  function getEditorLoopDef() {
    const selectedId = document.querySelector('#bronze-loop-select')?.value || getVisibleLoopDefs()[0]?.id || LOOP_DEFS[0].id;
    if (selectedId !== 'custom') return getLoopDefById(selectedId);
    try {
      return JSON.parse(document.querySelector('#bronze-loop-json')?.value || '{}');
    } catch {
      return {};
    }
  }

function updateLoopControls() {
    const editorLoop = getEditorLoopDef();
    renderMainPanelRounds({
      panel: document.querySelector('#bronze-loop-panel'),
      show: loopUsesRounds(editorLoop),
    });
  }

  function updateRecapButton() {
    const batch = state.lastRecapType === 'batch' ? state.lastBatchRecap : null;
    const pick = state.lastRecapType === 'pick' ? state.lastPickRecap : null;
    const totalCards = batch?.model?.itemCount || (pick ? (pick.pickResults || []).reduce(
      (sum, entry) => sum + ((entry?.pickedCards || entry?.pickedItems || []).length), 0
    ) : 0);
    renderMainPanelRecap({
      panel: document.querySelector('#bronze-loop-panel'),
      recap: batch
        ? { type: 'batch', name: 'Batch Open', totalCards }
        : pick ? { type: 'pick', name: pick.name, totalCards } : null,
    });
  }

  async function reopenLastRecap() {
    const btn = document.querySelector('#bronze-loop-recap-reopen');
    const existing = document.querySelector('#bronze-loop-recap-modal') || document.querySelector('#bronze-loop-batch-recap-modal');
    if (existing) {
      existing.remove();
      if (btn) { btn.textContent = 'View recap'; btn.style.background = ''; }
      return;
    }
    if (state.lastRecapType === 'batch' && state.lastBatchRecap?.model) {
      await showBatchRecapModal(state.lastBatchRecap.model);
      return;
    }
    const recap = state.lastRecapType === 'pick' ? state.lastPickRecap : null;
    if (!recap) {
      log('No previous recap available');
      return;
    }
    await showPickRecapModal({ name: recap.name }, recap.pickResults);
    if (btn && document.querySelector('#bronze-loop-recap-modal')) {
      btn.textContent = 'Hide recap';
      btn.style.background = '#b13b3b';
    }
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
    return localizationAdapter.localize(value);
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
    return waitAdapter.observableOnce(observable, controller, timeoutMs, label);
  }

  function ctrl() {
    return pageRuntime.currentController();
  }

  async function waitFor(predicate, timeoutMs = 15000, label = 'condition') {
    return waitAdapter.until(predicate, timeoutMs, label);
  }

  async function waitAppReady() {
    return waitAdapter.appReady();
  }

  async function waitLoadingEnd(stableMs = 700, timeoutMs = 30000) {
    return waitAdapter.loadingEnd(stableMs, timeoutMs);
  }

  function currentControllerName() {
    return pageRuntime.currentControllerName();
  }

  function isFutAppReady() {
    return pageRuntime.isReady();
  }

  async function refreshStorePacks() {
    const controller = ctrl();
    const result = await observeOnce(
      eaPackAdapter().refreshAll(),
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
          eaInventoryAdapter().requestUnassigned(),
          controller,
          20000,
          'requestUnassignedItems',
        );
        if (result?.success) {
          clearConsumedDuplicateSignals(
            [...state.pendingConsumedDuplicateSignals.values()],
            'Unassigned refresh',
            { quiet },
          );
          return result;
        }
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
      clearConsumedDuplicateSignals(
        [...state.pendingConsumedDuplicateSignals.values()],
        'Unassigned cache fallback',
        { quiet },
      );
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

  async function refreshPileCacheByCandidates(pileName, options = {}) {
    const actions = eaInventoryAdapter().refreshActions(pileName);
    for (const action of actions) {
      const ok = await tryOptionalRefresh(action.label, action.invoke, options);
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

    await refreshPileCacheByCandidates('club', options);
    await refreshPileCacheByCandidates('storage', options);
    await refreshPileCacheByCandidates('transfer', options);

    if (!quiet) {
      log(`Cache summary: ${cacheSummary()}`);
      log(`My Packs inventory: ${formatPackInventorySnapshot(getPackInventorySnapshot()) || 'none'}`);
    }
  }

  function getUnassignedItems() {
    return readInventoryPile('unassigned');
  }

  function getRepositoryMyPacks() {
    return eaPackAdapter().list();
  }

  function getAvailableRepositoryMyPacks() {
    return getRepositoryMyPacks().filter((pack) => !isStalePack(pack));
  }

  function getMyPacks() {
    const instances = getAvailableRepositoryMyPacks();
    const repositoryTypeIds = new Set(instances.map(packIdKey).filter(Boolean));
    const fallbackTypes = uniquePacks(state.lastStorePacks || [])
      .filter((pack) => !repositoryTypeIds.has(packIdKey(pack)) && !isStalePack(pack));
    return [...instances, ...fallbackTypes];
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
      return !!pack && state.stalePackRefs.has(pack);
    } catch {
      return false;
    }
  }

  function markStalePack(pack) {
    try {
      if (pack && typeof pack === 'object') state.stalePackRefs.add(pack);
    } catch { }
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

  function getPackInventorySnapshot() {
    const instances = getAvailableRepositoryMyPacks();
    const groups = new Map();
    for (const pack of instances) {
      const id = packIdKey(pack) || '?';
      const name = packName(pack) || String(id);
      const key = id === '?' ? `name:${name}` : `id:${id}`;
      const group = groups.get(key) || { id: id === '?' ? null : Number(id), name, count: 0 };
      group.count++;
      groups.set(key, group);
    }
    return {
      total: instances.length,
      groups: Array.from(groups.values())
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  }

  function formatPackInventorySnapshot(snapshot = getPackInventorySnapshot()) {
    return (snapshot?.groups || [])
      .map((group) => `${group.name} (#${group.id || '?'}) x${group.count}`)
      .join(', ');
  }

  function getPackCountsById(packs = getAvailableRepositoryMyPacks()) {
    const counts = new Map();
    for (const pack of packs) {
      const id = packIdKey(pack);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }

  async function moveItems(items, pile, allowStorage = true) {
    if (!items?.length) return null;
    const result = await observeOnce(
      eaInventoryAdapter().move(items, pile, allowStorage),
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

  function itemRareFlag(item) {
    return Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? item?._staticData?.rareflag ?? 0);
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
        if (typeof item?.[name] === 'function' && isExplicitTrue(item[name]())) return true;
      } catch { }
    }
    return false;
  }

  function isExplicitTrue(value) {
    if (value === true || value === 1) return true;
    if (typeof value !== 'string') return false;
    return ['true', '1', 'yes', 'on', 'enabled', 'enable'].includes(value.trim().toLowerCase());
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
      if (isExplicitTrue(value)) return true;
    }
    for (const value of itemFieldValues(item, ['loans'])) {
      if (typeof value === 'function' || value === undefined || value === null || value === '') continue;
      if (typeof value === 'boolean') {
        if (value) return true;
        continue;
      }
      const num = Number(value);
      // EA/FSU uses -1 for unlimited normal cards; 0+ means limited-use/loan.
      if (Number.isFinite(num) && num >= 0) return true;
    }
    return false;
  }

  function isLimitedUseItem(item) {
    if (isLoanItem(item)) return true;
    if (callItemBooleanMethod(item, ['isLimitedUse'])) return true;
    for (const value of itemFieldValues(item, ['limitedUse', 'isLimitedUse', 'limitedUses'])) {
      if (typeof value === 'function' || value === undefined || value === null || value === '') continue;
      if (isExplicitTrue(value)) return true;
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

  function detectFsuSettings() {
    return fsuAdapter().snapshot(state.fsuSettingsOverride);
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

  function isFsuLockedItem(item, settings = getFsuSettings(), lockContext = null) {
    const lockedItemIds = lockContext?.lockedItemIds || new Set((settings.lockedItemIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
    const lockedDefinitionIds = lockContext?.lockedDefinitionIds || new Set((settings.lockedDefinitionIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
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

  function getFsuRejectReasons(item, spec = {}, settings = getFsuSettings(), context = null) {
    const reasons = [];
    if (!isPlayer(item)) return reasons;
    if (isFsuLockedItem(item, settings, context)) reasons.push('fsu-locked-player');
    if (settings.onlyUntradeable && isTradeable(item)) reasons.push('fsu-only-untradeable');
    if (settings.excludeEvolution && isEvolutionItem(item)) reasons.push('fsu-exclude-evolution');
    const excludedLeagueIds = context?.excludedLeagueIds || (settings.excludedLeagueIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0);
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
    return readInventoryPile('club');
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
    return readInventoryPile('storage');
  }

  function getTransferItems() {
    return readInventoryPile('transfer');
  }

  function readInventoryPile(pileName) {
    try { return eaInventoryAdapter().readPile(pileName); } catch { return []; }
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

  function isSbcUsablePlayer(item, options = {}, context = null) {
    if (!isPlayer(item)) return false;
    const id = Number(item?.id || 0);
    const definitionId = Number(item?.definitionId || 0);
    if (id && state.consumedItemIds.has(id)) return false;
    if (id && (context?.protectedItemIds?.has(id) || options.protectedItemIds?.some((value) => Number(value) === id))) return false;
    if (definitionId && (context?.protectedDefinitionIds?.has(definitionId) || options.protectedDefinitionIds?.some((value) => Number(value) === definitionId))) return false;
    if (options.protectHighGold && isProtectedHighGold(item)) return false;
    if (isLimitedUseItem(item)) return false;
    if (isConceptItem(item)) return false;
    try { if (item?.isEnrolledInAcademy?.()) return false; } catch { }
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) return false;
    if (!isInactiveTrade(item)) return false;
    if (getFsuRejectReasons(item, options, context?.settings, context).length) return false;
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

  function predictUnassignedDestination(item) {
    if (!item) return 'unknown';
    try {
      if (!isDuplicate(item)) return 'club';
      if (isTradeable(item)) return 'transfer';
      const swapTarget = findClubDuplicate(item);
      if (swapTarget && isTradeable(swapTarget)) return 'club';
      return 'storage';
    } catch {
      return 'unknown';
    }
  }

  function pileSpaceLeft(pileName) {
    try { return eaInventoryAdapter().capacity(pileName).free; } catch { return null; }
  }

  function storageSpaceLeft() {
    return pileSpaceLeft('storage');
  }

  function transferSpaceLeft() {
    return pileSpaceLeft('transfer');
  }

  function assertPileSpace(pileName, available, needed) {
    if (available !== null && needed > available) {
      fail(`${pileName} has only ${available} slot(s), but ${needed} item(s) need moving`);
    }
  }

  async function resolveRuntimeUnassigned(reason = 'cleanup', options = {}) {
    await refreshUnassigned();
    let reservedIds = new Set();
    let initialLogged = false;
    const adapter = adapters.inventory({ capacityFallbacks: { storage: CFG.storageMax } });
    const getSnapshot = async () => {
      const liveItems = getUnassignedItems();
      reservedIds = new Set(
        options.reserveItem
          ? liveItems.filter(options.reserveItem).map((item) => Number(item?.id || 0)).filter(Boolean)
          : []
      );
      if (!initialLogged) {
        const actionableCount = liveItems.length - reservedIds.size;
        if (actionableCount || reservedIds.size) {
          log(`Unassigned cleanup before ${reason}: ${actionableCount} item(s)${reservedIds.size ? `, reserved ${reservedIds.size}` : ''}`);
        }
        initialLogged = true;
      }
      return adapter.snapshot();
    };

    const activeLoopDef = options.loopDef || state.loopStack[state.loopStack.length - 1] || null;
    const recoveryPolicyIds = options.recoveryPolicyIds !== undefined
      ? options.recoveryPolicyIds
      : activeLoopDef && Object.prototype.hasOwnProperty.call(activeLoopDef, 'unassignedRecoveryPolicyIds')
        ? activeLoopDef.unassignedRecoveryPolicyIds
        : getDefaultUnassignedRecoveryPolicyIds();
    const configuredResolvers = (options.blockedPolicy === 'preserve' && options.enableRecovery !== true) || options.enableRecovery === false
      ? []
      : buildUnassignedRecoveryResolvers({
          loopDef: activeLoopDef,
          policyIds: recoveryPolicyIds,
        });
    const result = await resolveUnassigned({
      getSnapshot,
      reserveItem: (item) => reservedIds.has(Number(item?.id || 0)),
      overflowResolvers: [...(options.overflowResolvers || []), ...configuredResolvers],
      blockedPolicy: options.blockedPolicy || 'fail',
      activeResolvers: options.activeResolvers,
      maxIterations: options.maxIterations || 20,
      executeAction: async (action) => {
        stopPoint();
        const items = action.itemRefs.map((ref) => adapter.resolveItem(ref, ['unassigned'])?.item).filter(Boolean);
        if (items.length !== action.itemRefs.length) {
          fail(`Unassigned ${action.description} action could resolve only ${items.length}/${action.itemRefs.length} item(s)`);
        }
        if (action.type === 'swap') {
          log(`Swapping ${items.length} untradeable duplicate(s) with tradeable club version(s)`);
          await moveItems(items, inventoryPile('club'), true);
        } else if (action.destination === 'club') {
          log(`Moving ${items.length} non-duplicate unassigned item(s) to club`);
          await moveItems(items, inventoryPile('club'), true);
        } else if (action.destination === 'transfer') {
          log(`Moving ${items.length} tradeable duplicate(s) to transfer list`);
          await moveItems(items, inventoryPile('transfer'), false);
        } else if (action.destination === 'storage') {
          log(`Moving ${items.length} untradeable duplicate(s) to SBC storage`);
          await moveItems(items, inventoryPile('storage'), true);
        } else {
          fail(`Unsupported Unassigned action destination: ${action.destination}`);
        }
        await refreshUnassigned();
      },
    });

    if (result.status === 'blocked') {
      const blocked = result.plan?.blocked;
      if (blocked?.destination === 'storage') {
        fail(`SBC storage has only ${blocked.free} slot(s), but ${blocked.required} item(s) need moving`);
      }
      if (blocked?.destination === 'transfer') {
        fail(`Transfer list has only ${blocked.free} slot(s), but ${blocked.required} item(s) need moving`);
      }
      fail(result.reason || 'Unassigned cleanup blocked');
    }

    const reservedCount = result.plan?.reservedItemRefs?.length || reservedIds.size;
    if (initialLogged && (result.iterations > 1 || reservedCount || result.status === 'preserved')) {
      log(`Unassigned cleanup complete: ${reason}${reservedCount ? `; reserved ${reservedCount} item(s)` : ''}`);
    }
    return result;
  }

  function getUnassignedStorageOverflow() {
    const storageCandidates = getUnassignedItems().filter((item) => {
      if (!isDuplicate(item) || isTradeable(item)) return false;
      const clubDuplicate = findClubDuplicate(item);
      return !(clubDuplicate && isTradeable(clubDuplicate));
    });
    const space = storageSpaceLeft();
    return {
      count: storageCandidates.length,
      space,
      blocked: space !== null && storageCandidates.length > space,
    };
  }

  function getUnassignedCapacityOverflow() {
    const items = getUnassignedItems();
    const transferCandidates = items.filter((item) => {
      if (!isDuplicate(item)) return false;
      if (isTradeable(item)) return true;
      const clubDuplicate = findClubDuplicate(item);
      return clubDuplicate && isTradeable(clubDuplicate);
    });
    const transferSpace = transferSpaceLeft();
    if (transferSpace !== null && transferCandidates.length > transferSpace) {
      return {
        destination: 'transfer',
        count: transferCandidates.length,
        space: transferSpace,
        blocked: true,
      };
    }
    const storage = getUnassignedStorageOverflow();
    return {
      destination: 'storage',
      count: storage.count,
      space: storage.space,
      blocked: storage.blocked,
    };
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
    const movedNonDuplicates = await tryMoveOpenedRewardItems(nonDuplicates, inventoryPile('club'), true, label, 'non-duplicate');
    if (movedNonDuplicates) {
      moved += movedNonDuplicates;
      markMoved(nonDuplicates);
    }

    const remainingDuplicates = players.filter((item) => !movedIds.has(Number(item?.id || 0)) && isDuplicate(item));
    const tradeableDuplicates = remainingDuplicates.filter((item) => isTradeable(item));
    if (tradeableDuplicates.length) {
      try {
        assertPileSpace('Transfer list', transferSpaceLeft(), tradeableDuplicates.length);
        const count = await tryMoveOpenedRewardItems(tradeableDuplicates, inventoryPile('transfer'), false, label, 'tradeable duplicate');
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

    const swappedCount = await tryMoveOpenedRewardItems(swappable, inventoryPile('club'), true, label, 'swappable duplicate');
    if (swappedCount) {
      moved += swappedCount;
      markMoved(swappable);
    }

    if (storageDuplicates.length) {
      try {
        assertPileSpace('SBC storage', storageSpaceLeft(), storageDuplicates.length);
        const count = await tryMoveOpenedRewardItems(storageDuplicates, inventoryPile('storage'), true, label, 'untradeable duplicate');
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

  function openedItemRoutingResult(items, reserveItem = null, details = {}) {
    const unassignedIds = new Set(getUnassignedItems().map((item) => Number(item?.id || 0)).filter(Boolean));
    const reservedItems = [];
    const routedItems = [];
    const pendingItems = [];
    for (const item of items || []) {
      const remainsUnassigned = unassignedIds.has(Number(item?.id || 0));
      if (!remainsUnassigned) routedItems.push(item);
      else if (reserveItem?.(item)) reservedItems.push(item);
      else pendingItems.push(item);
    }
    return { reservedItems, routedItems, pendingItems, details };
  }

  async function openPack(pack, purpose, options = {}) {
    if (!pack) fail(`Pack not found for ${purpose}`);
    if (typeof options.openedItemPolicy !== 'function') {
      fail(`Opened item policy is required for ${purpose}`);
    }
    const packAdapter = adapters.pack();
    const inventoryAdapter = adapters.inventory({ capacityFallbacks: { storage: CFG.storageMax } });
    let currentPack = pack;
    const retryCodes = options.retryCodes || (options.retryOn471 === true ? ['471'] : []);
    const receipt = await openPackTransaction({
      preOpenResolver: () => resolveRuntimeUnassigned(`opening ${purpose}`),
      packSelector: async ({ attempt }) => {
        if (attempt === 1) return currentPack;
        if (typeof options.resolveRetryPack === 'function') {
          currentPack = await options.resolveRetryPack();
        }
        return currentPack;
      },
      packRef: (selectedPack) => ({ id: Number(selectedPack?.id || 0), name: packName(selectedPack) }),
      openTransport: async (selectedPack, { attempt }) => {
        const name = packName(selectedPack);
        const attempts = retryCodes.length ? 2 : 1;
        log(`Opening pack: ${name} (#${selectedPack.id})${attempt > 1 ? ` retry ${attempt}/${attempts}` : ''}`);
        return observeOnce(packAdapter.open(selectedPack), ctrl(), 30000, `open ${name}`);
      },
      normalizeItems: async (items, { pack: selectedPack }) => {
        markStalePack(selectedPack);
        await waitLoadingEnd();
        return {
          items,
          receiptItems: items.map((item) => inventoryAdapter.snapshotItem(item, 'unassigned')),
        };
      },
      onItemsOpened: ({ packRef, openedItems }) => publishPackHighlight(openedItems, {
        packRef,
        purpose,
        assumeSpecialPlayers: options.assumeSpecialPlayers === true,
      }),
      onItemsOpenedError: (error) => log(`${purpose}: reward highlight failed: ${error?.message || error}`),
      openedItemPolicy: options.openedItemPolicy,
      retryPolicy: { attempts: retryCodes.length ? 2 : 1, retryCodes },
      beforeRetry: async ({ code }) => {
        log(`${purpose}: pack open returned ${code}; synchronizing navigation and pack cache before retry`);
        log(`${purpose}: retrying pack open after navigation and unassigned recovery`);
        await sleep(CFG.pauseMs);
        await unwindSbcSquadControllers(`${purpose} pack-open recovery`);
        await showUnassignedIfAny(`${purpose} pack-open recovery sync`);
        if (isSbcControllerActive()) {
          await openStorePacksViewForRefresh(`${purpose} pack-open Store recovery`).catch((error) => {
            log(`${purpose}: pack-open Store recovery skipped: ${error?.message || error}`);
            return false;
          });
        }
        await sleep(700);
        await resolveRuntimeUnassigned(`${purpose} pack-open recovery cleanup`);
        await refreshInventoryCaches(`${purpose} pack-open recovery`, { quiet: true });
      },
      allowGone: options.allowGone === true,
      onGone: async (selectedPack) => {
        markStalePack(selectedPack);
        log(`Skipping stale pack for ${purpose}: ${packName(selectedPack)} (#${selectedPack.id}) returned 404`);
        await waitLoadingEnd().catch(() => null);
        await refreshStorePacks().catch(() => null);
      },
    });
    state.lastOpenPackReceipt = receipt;
    if (receipt.status === 'opened') return receipt;
    if (receipt.status === 'stale' || receipt.status === 'unavailable') {
      if (receipt.status === 'unavailable') log(`${purpose}: no matching pack remains after recovery`);
      return null;
    }
    fail(`Open pack failed: ${receipt.reason || 'unknown'}`);
  }

  async function findValidationSourcePack(loopDef) {
    await refreshStorePacks();
    return (loopDef.sourcePackIds || CFG.sourcePackIds).map((id) => findPackById(id)).find(Boolean) ||
      findPackByName(loopDef.sourcePackNames || CFG.sourcePackNames) || null;
  }

  async function openSourceBronzePack(loopDef, selectedPack = null) {
    const pack = selectedPack || await findValidationSourcePack(loopDef);
    if (!pack) {
      const names = summarizePacks();
      fail(`Source pack not found. Current my packs: ${names || 'none'}`);
    }

    const receipt = await openPack(pack, 'source bronze pack', {
      openedItemPolicy: createOpenedItemPolicy(async (openedItems) => {
        const bronzeDuplicates = openedItems.filter((item) => isPlayer(item) && isBronze(item) && isDuplicate(item));
        const duplicateIds = new Set(bronzeDuplicates.map((item) => Number(item?.id || 0)));
        const directClub = openedItems.filter((item) =>
          !duplicateIds.has(Number(item?.id || 0)) && (!isPlayer(item) || !isDuplicate(item))
        );
        if (directClub.length) {
          log(`Moving ${directClub.length} non-duplicate source item(s) to club`);
          await moveItems(directClub, inventoryPile('club'), true);
        }
        if (bronzeDuplicates.length) {
          log(`${bronzeDuplicates.length} bronze duplicate(s) left for Bronze Upgrade`);
        } else {
          log('No bronze duplicate in this source pack; Bronze Upgrade may use club bronze players if FSU completion is enabled');
        }
        await refreshUnassigned();
        return openedItemRoutingResult(openedItems, (item) => duplicateIds.has(Number(item?.id || 0)), {
          bronzeDuplicateCount: bronzeDuplicates.length,
        });
      }),
    });
    return receipt;
  }

  async function ensureSbcSetsLoaded() {
    if (eaSbcAdapter().listSets().length) return;
    const result = await observeOnce(eaSbcAdapter().requestSets(), ctrl(), 30000, 'SBC.requestSets');
    if (!result?.success) fail(`SBC set request failed: ${result?.error?.code || result?.status || 'unknown'}`);
  }

  function getSbcSets() {
    return eaSbcAdapter().listSets();
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

  async function findSbcSetIfPresent(names) {
    await ensureSbcSetsLoaded();
    return getSbcSets().find((set) => matchesAny(set?.name, names)) || null;
  }

  async function findSbcSetForLoopDef(loopDef, label = loopDef?.name || 'SBC') {
    await ensureSbcSetsLoaded();
    const setIds = new Set((loopDef?.sbcSetIds || []).map(Number).filter(Boolean));
    if (setIds.size) {
      const byId = getSbcSets().find((set) => setIds.has(Number(set?.id || 0)));
      if (byId) return byId;
      fail(`${label} SBC not found by configured Set id(s): ${[...setIds].join(', ')}`);
    }
    return findSbcSet(loopDef?.sbcNames, label);
  }

  function navController() {
    return pageRuntime.navigationController();
  }

  function isCompletedChallenge(challenge) {
    const status = String(challenge?.status || challenge?.state || '').toUpperCase();
    return status === 'COMPLETED' || status === 'COMPLETE' || challenge?.completed === true;
  }

  function getCachedSbcChallenges(set) {
    const sources = [];
    sources.push(...collectionValues(set?.challenges));
    sources.push(...collectionValues(set?._challenges));

    const byId = new Map();
    for (const challenge of sources) {
      const id = Number(challenge?.id || 0);
      if (!id || byId.has(id)) continue;
      byId.set(id, challenge);
    }
    return [...byId.values()];
  }

  function hasRatingSbcChallengeRequirements(challenge) {
    return Array.isArray(challenge?.eligibilityRequirements) && challenge.eligibilityRequirements.length > 0;
  }

  async function requestRatingSbcChallenges(set, label = set?.name || 'rating SBC') {
    const cached = getCachedSbcChallenges(set);
    const cachedAvailable = cached.find((challenge) =>
      !isCompletedChallenge(challenge) && hasRatingSbcChallengeRequirements(challenge)
    );
    if (cachedAvailable || (cached.length && isSbcSetComplete(set))) {
      log(`${label}: using ${cached.length} cached challenge(s); bypassed requestChallengesForSet`);
      return cached;
    }

    if (!eaSbcAdapter().hasDaoGetChallengesForSet()) {
      fail(`${label}: direct SBC challenge DAO is unavailable`);
    }

    log(`${label}: loading challenges directly through sbcDAO; bypassing requestChallengesForSet`);
    const result = await observeOnce(
      eaSbcAdapter().getChallengesForSet(set?.id),
      ctrl(),
      20000,
      `sbcDAO.getChallengesForSet ${label}`,
    );
    if (!result?.success || !Array.isArray(result?.response?.challenges)) {
      const detail = serviceResultErrorText(result) || 'no challenge data returned';
      fail(`${label}: direct SBC challenge load failed: ${detail}`);
    }

    const received = result.response.challenges;
    log(`${label}: direct SBC challenge load returned ${received.length} challenge(s)`);
    return received;
  }

  async function findAvailableRatingSbcChallenge(set, label = set?.name || 'rating SBC') {
    const challenges = await requestRatingSbcChallenges(set, label);
    return challenges.find((challenge) => !isCompletedChallenge(challenge)) || null;
  }

  async function loadRatingSbcChallenge(challenge, label = 'rating SBC') {
    if (!challenge) return null;
    if (challenge.squad) return challenge;

    if (!eaSbcAdapter().hasDaoLoadChallenge()) {
      fail(`${label}: direct SBC challenge loader is unavailable`);
    }
    let inProgress = false;
    try { inProgress = challenge.isInProgress?.() === true; } catch { }
    log(`${label}: loading challenge squad directly through sbcDAO`);
    const result = await observeOnce(
      eaSbcAdapter().loadDaoChallenge(challenge.id, inProgress),
      ctrl(),
      20000,
      `sbcDAO.loadChallenge ${label}`,
    );
    const squad = result?.response?.squad;
    if (!result?.success || !squad) {
      const detail = serviceResultErrorText(result) || 'no squad data returned';
      fail(`${label}: direct challenge squad load failed: ${detail}`);
    }
    challenge.squad = squad;
    log(`${label}: direct challenge squad loaded`);
    return challenge;
  }

  async function requestSbcChallenges(set, label = set?.name || 'SBC', options = {}) {
    const attempts = Math.max(1, Math.min(3, Number(options.attempts || 3)));
    let lastResult = null;
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      stopPoint();
      await waitLoadingEnd(350, attempt === 1 ? 6000 : 12000).catch(() => null);
      try {
        const result = await observeOnce(
          eaSbcAdapter().requestChallengesForSet(set),
          ctrl(),
          30000,
          `requestChallengesForSet ${label}`,
        );
        lastResult = result;
        if (result?.success && result?.data?.challenges?.length) return result.data.challenges;
        lastError = new Error(serviceResultErrorText(result) || 'no challenge data returned');
      } catch (error) {
        lastError = error;
      }
      if (attempt < attempts) {
        log(`${label}: challenge request failed (${lastError?.message || lastError}); retrying ${attempt + 1}/${attempts}`);
        await sleep(1500 * attempt);
      }
    }
    if (options.allowEmpty) return [];
    const detail = lastError?.message || lastResult?.error?.code || lastResult?.status || 'unknown';
    fail(`No challenge loaded for ${label} after ${attempts} attempt(s): ${detail}`);
  }

  async function loadPlayerPickDiscoveryChallenges(set) {
    const label = `Player Pick scan ${set?.name || `#${set?.id || '?'}`}`;
    let challenges = null;
    if (eaSbcAdapter().hasDaoGetChallengesForSet()) {
      const result = await observeOnce(
        eaSbcAdapter().getChallengesForSet(set?.id),
        ctrl(),
        20000,
        `sbcDAO.getChallengesForSet ${label}`,
      );
      if (result?.success && Array.isArray(result?.response?.challenges)) {
        challenges = result.response.challenges;
      } else {
        log(`${label}: direct Challenge metadata unavailable (${serviceResultErrorText(result) || 'unknown'}); trying standard request`);
      }
    }
    if (!challenges) challenges = await requestSbcChallenges(set, label, { attempts: 1 });

    const loaded = [];
    for (const challenge of challenges) {
      if (challenge?.squad || !eaSbcAdapter().hasDaoLoadChallenge()) {
        loaded.push(challenge);
        continue;
      }
      let inProgress = false;
      try { inProgress = challenge.isInProgress?.() === true; } catch { }
      try {
        const result = await observeOnce(
          eaSbcAdapter().loadDaoChallenge(challenge.id, inProgress),
          ctrl(),
          20000,
          `sbcDAO.loadChallenge ${label} #${challenge.id || '?'}`,
        );
        const squad = result?.response?.squad;
        if (!result?.success || !squad) throw new Error(serviceResultErrorText(result) || 'squad unavailable');
        challenge.squad = squad;
      } catch (error) {
        log(`${label}: Challenge #${challenge?.id || '?'} squad metadata unavailable (${error?.message || error}); player count will remain unsupported`);
      }
      loaded.push(challenge);
    }
    return loaded;
  }

  function describePlayerPickDiscoveryReward(reward = {}, parsed = {}) {
    return [
      reward.name || '?',
      `resource:${reward.resourceId || '?'}`,
      `definition:${reward.definitionId || '?'}`,
      `candidates:${parsed.pickCandidateCount || reward.candidateCount || '?'}`,
      `select:${parsed.pickCount || reward.selectionCount || '?'}`,
    ].join(', ');
  }

  function describePlayerPickDiscoveryRequirement(requirement = {}) {
    return `${requirement.key || '?'}=${(requirement.values || []).join('/') || '?'} x${requirement.count ?? '?'}`;
  }

  function logPlayerPickDiscoveryMetadataHints(reward = {}) {
    for (const [source, hint] of Object.entries(reward.metadataHints || {})) {
      const keys = (hint?.keys || []).join(',') || 'none';
      const prototypeKeys = (hint?.prototypeKeys || []).join(',') || 'none';
      const values = Object.keys(hint?.values || {}).length ? JSON.stringify(hint.values) : '{}';
      log(`Player Pick scan: reward ${source} keys: ${keys}; related prototype keys: ${prototypeKeys}; related scalar values: ${values}`);
    }
  }

  async function scanAvailablePlayerPickSbcs() {
    log('Player Pick scan: refreshing SBC Sets and reading metadata; only fully supported non-duplicate Picks will be added as session Loops, nothing will be executed');
    const pickOptions = getPickRuntimeOptions();
    const summary = await scanPlayerPickSbcSnapshots({
      refreshSets: async () => {
        const result = await observeOnce(eaSbcAdapter().requestSets(), ctrl(), 30000, 'Player Pick scan SBC.requestSets');
        if (!result?.success) throw new Error(serviceResultErrorText(result) || 'SBC Set request failed');
      },
      listSets: getSbcSets,
      snapshotSet: (set, challenges) => eaSbcAdapter().snapshotDiscoverySet(set, challenges),
      loadChallenges: loadPlayerPickDiscoveryChallenges,
      parseSnapshot: (snapshot) => parsePlayerPickSbcSnapshot({
        set: snapshot,
        highGoldThreshold: pickOptions.highGoldThreshold,
        pricePlatform: 'pc',
      }),
      onResult: async ({ snapshot, parsed, loadError }) => {
        const reward = snapshot.rewards?.[0] || {};
        log(`Player Pick scan: set #${snapshot.id || '?'} ${snapshot.name || '?'}; reward ${describePlayerPickDiscoveryReward(reward, parsed)}; challenges:${snapshot.challenges?.length || 0}; status:${parsed.status}`);
        if (!parsed.pickCandidateCount || !parsed.pickCount) logPlayerPickDiscoveryMetadataHints(reward);
        for (const [index, challenge] of (snapshot.challenges || []).entries()) {
          const requirements = (challenge.eligibilityRequirements || [])
            .map(describePlayerPickDiscoveryRequirement)
            .join(', ');
          log(`Player Pick scan: challenge ${index + 1} #${challenge.id || '?'} players:${challenge.requiredPlayerCount || '?'} completed:${challenge.completed ? 'yes' : 'no'}; ${requirements || 'requirements unavailable'}`);
        }
        if (loadError) log(`Player Pick scan: challenge load warning: ${loadError?.message || loadError}`);
        for (const diagnostic of parsed.diagnostics || []) log(`Player Pick scan: diagnostic: ${diagnostic}`);
      },
    });
    const session = buildPlayerPickDiscoverySession({
      sets: summary.results.map((result) => result.snapshot),
      configuredLoops: getConfiguredLoopDefs(),
      selectedId: document.querySelector('#bronze-loop-select')?.value || null,
      preferScannedMetadata: pickOptions.preferScannedMetadata,
      highGoldThreshold: pickOptions.highGoldThreshold,
      pricePlatform: 'pc',
    });
    state.discoveredLoopDefs = cloneLoopDef(session.discoveredLoops);
    state.discoveredLoopOverrides = cloneLoopDef(session.loopOverrides);
    renderLoopSelect(session.selectedId);
    const duplicateCount = session.results.filter((result) => result.status === 'duplicate').length;
    for (const [loopId, loopDef] of Object.entries(state.discoveredLoopOverrides)) {
      const ratios = (loopDef.challengeRequirements || [loopDef.requirements || []])
        .map((requirements, index) => `challenge ${index + 1}: ${(requirements || []).map((requirement) => `${requirement.count} ${requirement.rarity || requirement.tier}`).join(' + ')}`)
        .join('; ');
      log(`Player Pick scan: using scanned metadata for configured Loop ${loopId} (Set #${loopDef.sbcSetIds?.[0] || '?'}, reward #${loopDef.pickItemResourceIds?.[0] || '?'}, select ${loopDef.pickCount}/${loopDef.pickCandidateCount}; ${ratios})`);
    }
    for (const diagnostic of session.overrideDiagnostics) log(`Player Pick scan: override skipped: ${diagnostic}`);
    for (const loopDef of state.discoveredLoopDefs) {
      const ratios = (loopDef.challengeRequirements || [loopDef.requirements || []])
        .map((requirements, index) => `challenge ${index + 1}: ${(requirements || []).map((requirement) => `${requirement.count} ${requirement.rarity || requirement.tier}`).join(' + ')}`)
        .join('; ');
      log(`Player Pick scan: added session Loop ${loopDef.name} (Set #${loopDef.sbcSetIds?.[0] || '?'}, reward #${loopDef.pickItemResourceIds?.[0] || '?'}, select ${loopDef.pickCount}/${loopDef.pickCandidateCount}; ${ratios})`);
    }
    log(`Player Pick scan complete: ${summary.pickSets} Pick Set(s) found among ${summary.setsScanned} SBC Set(s); ${state.discoveredLoopDefs.length} supported session Loop(s) added, ${Object.keys(state.discoveredLoopOverrides).length} configured Loop(s) using scanned metadata, ${duplicateCount} static/discovered duplicate(s) skipped`);
    return summary;
  }

  async function findAvailableSbcChallenge(set, label = set?.name || 'SBC') {
    const challenges = await requestSbcChallenges(set, label);
    return challenges.find((c) => !isCompletedChallenge(c)) || null;
  }

  async function openSbcSet(set, options = {}) {
    const challenge = options.challenge || await findAvailableSbcChallenge(set, set.name);
    if (!challenge) {
      if (options.returnNullIfComplete) return null;
      fail(`No available challenge for ${set.name}`);
    }

    const controller = ctrl();
    const load = await observeOnce(
      eaSbcAdapter().loadChallenge(challenge),
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

    const vc = eaSbcAdapter().createSquadController();
    vc.initWithSBCSet?.(set, challenge.id);
    nav.pushViewController?.(vc, true);
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
    // FSU can leave its global loading shield active after the target squad is
    // already usable. Do not block the loop for the full generic 30s timeout.
    await waitLoadingEnd(250, 2500);
    return { set, challenge };
  }

  function simulateClick(el) {
    return adapters.dom.click(el);
  }

  function findButtonByText(patterns) {
    return adapters.dom.findButtonByText(patterns, matchesAny);
  }

  function clickButtonByText(patterns) {
    const btn = findButtonByText(patterns);
    if (!btn) return false;
    return simulateClick(btn);
  }

  function findClickableByText(patterns, root = document) {
    return adapters.dom.findClickableByText(patterns, matchesAny, root);
  }

  function simulateKeyStroke(key = 'Alt', code = 'AltRight', options = {}) {
    adapters.dom.keyStroke(key, code, options);
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
    return adapters.dom.compactText(el);
  }

  function isClickableElement(el) {
    return adapters.dom.isClickable(el);
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
      const formation = eaSbcAdapter().formation(challenge?.formation);
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
    const definitionId = Number(item?.definitionId || 0);
    if (!isPlayer(item)) reasons.push('not-player');
    if (id && state.consumedItemIds.has(id)) reasons.push('consumed-this-run');
    if (id && options.protectedItemIds?.some((value) => Number(value) === id)) reasons.push('protected-id');
    if (definitionId && options.protectedDefinitionIds?.some((value) => Number(value) === definitionId)) reasons.push('protected-def');
    if (options.protectHighGold && isProtectedHighGold(item)) reasons.push('protected-82-plus');
    if (isLoanItem(item)) reasons.push('loan');
    else if (isLimitedUseItem(item)) reasons.push('limited-use');
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

  function duplicateSignalDiagnostic(signal, requirement = {}, settings = getFsuSettings()) {
    const signalId = Number(signal?.id || signal?.ref?.id || 0);
    const definitionId = Number(signal?.definitionId || signal?.ref?.definitionId || 0);
    const duplicateId = Number(signal?.duplicateId || 0);
    const candidates = getSubmissionCacheItems()
      .filter((item) => Number(item?.id || 0) === duplicateId || Number(item?.definitionId || 0) === definitionId)
      .map((item) => {
        const reasons = [...new Set([
          ...getUsabilityRejectReasons(item, requirement),
          ...getSpecRejectReasons(item, requirement),
        ])];
        return {
          id: Number(item?.id || 0),
          definitionId: Number(item?.definitionId || 0),
          pile: liveItemRef(item).pile,
          rating: Number(item?.rating || 0),
          tradeable: isTradeable(item),
          consumed: state.consumedItemIds.has(Number(item?.id || 0)),
          reasons,
        };
      });
    const resolved = findSubmissionItemForDuplicateSignal(signal, new Set(), requirement, settings);
    const signalReasons = [...new Set([
      ...getUsabilityRejectReasons(signal, requirement),
      ...getSpecRejectReasons(signal, requirement),
    ])];
    return {
      signalId,
      definitionId,
      duplicateId,
      name: itemDisplayName(signal),
      rating: Number(signal?.rating || 0),
      rareflag: itemRareFlag(signal),
      tradeable: isTradeable(signal),
      leagueId: itemLeagueId(signal),
      evolution: isEvolutionItem(signal),
      resolvedId: Number(resolved?.id || 0),
      signalReasons,
      candidates,
    };
  }

  function logDuplicateSignalDiagnostics(label, signals = [], requirement = {}, selection = null) {
    if (!signals.length) return [];
    const selectedSignalIds = new Set((selection?.entries || [])
      .filter((entry) => entry.pileName === 'unassigned' && entry.signal)
      .map((entry) => Number(entry.signal?.id || 0))
      .filter(Boolean));
    const settings = getFsuSettings();
    const diagnostics = signals.map((signal) => duplicateSignalDiagnostic(signal, requirement, settings));
    log(`${label}: duplicate resolution diagnostics ${selectedSignalIds.size}/${diagnostics.length} signal(s) selected; ${formatFsuSettings(settings)}; consumed cache:${state.consumedItemIds.size}`);
    diagnostics.forEach((diag, index) => {
      log(`${label}: signal ${index + 1}/${diagnostics.length} selected:${selectedSignalIds.has(diag.signalId) ? 'yes' : 'no'} name:${diag.name} id:${diag.signalId || '?'} def:${diag.definitionId || '?'} duplicateId:${diag.duplicateId || '?'} rating:${diag.rating || '?'} rareflag:${diag.rareflag} tradeable:${diag.tradeable ? 'yes' : 'no'} league:${diag.leagueId || '?'} evo:${diag.evolution ? 'yes' : 'no'} signal rejects:${diag.signalReasons.join('/') || 'none'} resolved:${diag.resolvedId || 'none'}`);
      if (!diag.candidates.length) {
        log(`${label}: signal ${index + 1} candidate cache: none in Club/Storage`);
        return;
      }
      diag.candidates.forEach((candidate) => {
        log(`${label}: signal ${index + 1} candidate id:${candidate.id || '?'} def:${candidate.definitionId || '?'} pile:${candidate.pile} rating:${candidate.rating || '?'} tradeable:${candidate.tradeable ? 'yes' : 'no'} consumed:${candidate.consumed ? 'yes' : 'no'} rejects:${candidate.reasons.join('/') || 'none'}`);
      });
    });
    return diagnostics;
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

  function resolveSelectionPlanToRuntime(plan, inventoryAdapter, transientUnassignedSignals = []) {
    const resolvedByRef = (ref) => ref ? inventoryAdapter.resolveItem(ref)?.item || null : null;
    const transientById = new Map((transientUnassignedSignals || [])
      .map((signal) => [Number(signal?.id || signal?.ref?.id || 0), signal])
      .filter(([id]) => id));
    const resolvedSignalByRef = (ref) => {
      const live = resolvedByRef(ref);
      if (live) return live;
      return transientById.get(Number(ref?.id || 0)) || null;
    };
    const selected = plan.selected.map((item) => resolvedByRef(item.ref));
    if (selected.some((item) => !item)) {
      return {
        ok: false,
        selected: selected.filter(Boolean),
        entries: [],
        stats: { ...plan.pileCounts },
        missing: plan.missing || { count: 1, reason: 'selection-item-stale' },
        resolvedSignals: {},
      };
    }

    const entries = plan.entries.map((entry) => ({
      pileName: entry.pileName,
      signal: entry.signalRef ? resolvedSignalByRef(entry.signalRef) : null,
      item: resolvedByRef(entry.itemRef),
    }));
    if (entries.some((entry, index) => !entry.item || (plan.entries[index]?.signalRef && !entry.signal))) {
      return {
        ok: false,
        selected,
        entries: entries.filter((entry) => entry.item),
        stats: { ...plan.pileCounts },
        missing: plan.missing || { count: 1, reason: 'selection-signal-stale' },
        resolvedSignals: {},
      };
    }

    const resolvedSignals = plan.duplicateSignals.reduce((counts, signal) => {
      counts[signal.pileName] = (counts[signal.pileName] || 0) + 1;
      return counts;
    }, {});
    return {
      ok: plan.ok,
      selected,
      entries,
      stats: { ...plan.pileCounts },
      missing: plan.missing,
      resolvedSignals,
      diagnostics: plan.diagnostics,
      plan,
    };
  }

  function selectInventoryPlayers(requirementsOrLoopDef, priorityPiles = null, options = {}) {
    const effectivePriorityPiles = priorityPiles || (
      Array.isArray(requirementsOrLoopDef)
        ? ['storage', 'transfer', 'club']
        : requirementsOrLoopDef?.priorityPiles || ['storage', 'transfer', 'club']
    );
    const requirements = Array.isArray(requirementsOrLoopDef)
      ? requirementsOrLoopDef
      : selectionRequirements(requirementsOrLoopDef || {}, effectivePriorityPiles);
    const inventoryAdapter = adapters.inventory();
    const transientUnassignedSignals = options.transientUnassignedSignals || [];
    const inventorySnapshot = mergeTransientUnassignedSignals(
      inventoryAdapter.snapshot(),
      transientUnassignedSignals,
    );
    const plan = selectInventoryPlayersPure({
      inventorySnapshot,
      requirements,
      priorityPiles: effectivePriorityPiles,
      fsuPolicy: getFsuSettings(),
      consumedItemIds: [...state.consumedItemIds],
      preferredSignalRefs: options.preferredSignalRefs || [],
    });
    return resolveSelectionPlanToRuntime(plan, inventoryAdapter, transientUnassignedSignals);
  }

  function parseRatingSbcChallenge(loopDef, challenge) {
    return parseRatingSbcChallengePure({
      loopDef,
      challenge,
      requiredPlayerCount: expectedSbcPlayerCount(loopDef, challenge) || getRequiredPlayerCount(challenge),
      eligibilityKeyName: (key) => eaSbcAdapter().eligibilityKeyName(key),
      isBronze,
      isSilver,
      isGold,
      isSpecialItem: isSbcSpecialItem,
      itemGroupNumbers,
      itemLeagueId,
      requiredSpecialLabel,
      isRequiredSpecialItem,
    });
  }

  function validateRatingSbcModelAgainstItems(model, items = [], challenge = null) {
    return validateRatingSbcModelAgainstItemsPure(model, items, challenge, {
      calculateSquadRating: calculateEaSquadRating,
      isSpecialItem: isSbcSpecialItem,
    });
  }

  function logRatingSbcValidation(loopDef, label, validation, model) {
    log(`${loopDef.name}: ${label} rating ${validation.rating}/${model.targetRating}, players ${validation.players.length}/${model.requiredPlayerCount}, special ${validation.specialCount}/${model.maxSpecialCount}, unique definitions ${validation.uniqueDefinitionCount}/${validation.players.length}`);
    validation.constraintResults.forEach(({ constraint, matched, required }) => {
      log(`${loopDef.name}: ${label} constraint ${constraint.label}: ${matched}/${required}`);
    });
    if (validation.challengeReady !== null) {
      log(`${loopDef.name}: ${label} local challenge.meetsRequirements(): ${validation.challengeReady ? 'true' : 'false'}`);
    }
    validation.errors.forEach((error) => log(`${loopDef.name}: ${label} validation failed: ${error}`));
  }

  function isRatingSbcCandidateSafe(item, loopDef, model = null, context = null) {
    const allowedSpecialCount = model
      ? model.maxSpecialCount
      : Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
    if (!isPlayer(item)) return false;
    if (isSbcSpecialItem(item)) {
      if (!allowedSpecialCount) return false;
      if (requiredSpecialKind(loopDef) && !isRequiredSpecialItem(item, loopDef)) return false;
    }
    return getSbcProtectionReasons(item, loopDef, {
      ...(context || {}),
      allowedSpecialCount,
      specialIndex: isSbcSpecialItem(item) ? 1 : 0,
    }).length === 0;
  }

  function isResolvableRatingSbcUnassignedDuplicate(item, loopDef) {
    if (!isDuplicate(item) || !isPlayer(item)) return false;
    const resolved = findSubmissionItemForDuplicateSignal(item, new Set(), {
      playerOnly: true,
      allowSpecial: true,
      protectedItemIds: loopDef.protectedItemIds,
      protectedDefinitionIds: loopDef.protectedDefinitionIds,
    });
    if (!resolved) return false;
    return isRatingSbcCandidateSafe(resolved, loopDef);
  }

  function buildRatingSbcCandidateEntries(loopDef, model) {
    const settings = getFsuSettings();
    const piles = applyFsuPilePriority(
      loopDef.ratingSbcFill?.priorityPiles || loopDef.priorityPiles || ['unassigned', 'storage', 'transfer', 'club'],
      settings,
    );
    const protectedItemIds = new Set((loopDef.protectedItemIds || []).map(Number).filter(Boolean));
    const protectedDefinitionIds = new Set((loopDef.protectedDefinitionIds || []).map(Number).filter(Boolean));
    const context = {
      settings,
      protectedItemIds,
      protectedDefinitionIds,
      lockedItemIds: new Set((settings.lockedItemIds || []).map(Number).filter(Boolean)),
      lockedDefinitionIds: new Set((settings.lockedDefinitionIds || []).map(Number).filter(Boolean)),
      excludedLeagueIds: (settings.excludedLeagueIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0),
    };
    const broadSpec = {
      playerOnly: true,
      allowSpecial: true,
      protectedItemIds: loopDef.protectedItemIds,
      protectedDefinitionIds: loopDef.protectedDefinitionIds,
    };
    return buildRatingCandidateEntries({
      model,
      settings,
      piles,
      getPileItems: getPileItemsByName,
      submissionItems: getSubmissionCacheItems(),
      isSafe: (item) => isRatingSbcCandidateSafe(item, loopDef, model, context),
      isDuplicate,
      pileNeedsDuplicateSignalResolution,
      sortFodder: sortSbcFodder,
      isSpecialItem: isSbcSpecialItem,
      broadSpec,
    });
  }

  function ratingSelectionItemSnapshot(item, pileName) {
    return createItemSnapshot({
      id: item?.id,
      definitionId: item?.definitionId,
      type: isPlayer(item) ? 'player' : item?.type,
      name: itemDisplayName(item),
      rating: item?.rating,
      rareflag: itemRareFlag(item),
      rare: isRare(item),
      special: isSbcSpecialItem(item),
      duplicate: isDuplicate(item),
      duplicateId: item?.duplicateId,
      tradeable: isTradeable(item),
      leagueId: itemLeagueId(item),
      identityIds: itemIdentifierNumbers(item),
      evolution: isEvolutionItem(item),
      limitedUse: isLimitedUseItem(item),
      concept: isConceptItem(item),
      academyEnrolled: (() => { try { return item?.isEnrolledInAcademy?.() === true; } catch { return false; } })(),
      activeTrade: !isInactiveTrade(item),
      endTime: item?.endTime,
      groups: itemGroupNumbers(item),
    }, pileName);
  }

  async function findOptimalRatingSbcSelection(candidateEntries, model, piles, options = {}) {
    return selectRatingCandidateEntries({
      candidateEntries,
      model,
      piles,
      searchOptions: options,
      createSnapshot: ratingSelectionItemSnapshot,
      selectPlayers: selectInventoryPlayersPure,
      control: {
        shouldStop: () => state.stopping,
        yieldControl: () => sleep(0),
      },
    });
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
      const formation = eaSbcAdapter().formation(challenge?.formation);
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

  async function saveChallengeSquad(challenge, players, label = 'SBC', options = {}) {
    const squad = challenge?.squad || ctrl()?._squad;
    if (!squad) fail(`${label}: squad object not found`);
    const playerList = buildSquadPlayerList(challenge, players);
    try { squad.removeAllItems?.(); } catch { }
    squad.setPlayers(playerList, true);

    const save = await observeOnce(
      eaSbcAdapter().saveChallenge(challenge),
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

    if (eaSbcAdapter().canLoadChallengeData()) {
      try {
        const loaded = await observeOnce(
          eaSbcAdapter().loadChallengeData(challenge),
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

    await waitLoadingEnd(250, Math.max(1000, Number(options.loadingTimeoutMs || 30000) || 30000));
    await sleep(700);
  }

  async function prepareSbcSquad(challenge, players, label = 'SBC', options = {}) {
    const result = await submitSbcAttempt({
      label,
      prepareOnly: true,
      challengeProvider: async () => ({
        set: options.set || { id: null, name: label },
        challenge,
      }),
      squadProvider: createExistingSquadProvider({
        getPlayers: async () => players,
        itemRef: liveItemRef,
        source: options.source || 'prepared-squad',
      }),
      preSaveValidators: options.preSaveValidators || [],
      saveSquad: async ({ challenge: targetChallenge, players: targetPlayers }) => {
        await saveChallengeSquad(targetChallenge, targetPlayers, label, options);
      },
      readSavedPlayers: async ({ challenge: targetChallenge }) => getSquadItems(targetChallenge?.squad || ctrl()?._squad),
      postSaveValidators: options.postSaveValidators || [],
    });
    if (result.status !== 'prepared') fail(`${label}: squad preparation failed: ${result.reason || result.status}`);
    return result;
  }

  async function showUnassignedIfAny(reason = 'final confirmation') {
    return confirmUnassignedView({
      reason,
      openUnassigned: () => pageRuntime.gotoUnassigned(ctrl()),
      clickFallback: () => clickButtonByText([
          'Unassigned Items',
          'Unassigned',
          'Assign Items',
          '未分配',
          '未分配物品',
          '分配物品',
      ]),
      waitLoadingEnd,
      refreshUnassigned,
      getItems: getUnassignedItems,
      log,
    });
  }

  function isSbcControllerActive() {
    return isSbcControllerName(currentControllerName());
  }

  async function unwindSbcSquadControllers(label, maxPops = 20) {
    return unwindSbcSquadControllersShared({
      label,
      maxPops,
      currentController: ctrl,
      currentControllerName,
      popController: (animated) => pageRuntime.popViewController(animated),
      waitLoadingEnd,
      sleep,
      log,
    });
  }

  async function syncAfterSbcSubmit(label) {
    return synchronizeAfterSbcSubmit({
      label,
      currentControllerName,
      unwind: unwindSbcSquadControllers,
      showUnassigned: showUnassignedIfAny,
      openStorePacks: openStorePacksViewForRefresh,
      log,
    });
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
      const shieldShowing = pageRuntime.loadingShieldShowing();
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
    // FSU can occasionally fail to fill after we clear the squad. Keep a local
    // snapshot so the existing safe-repair flow still has a squad to work with.
    const existingItems = getSquadItems(squad);
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

    if (!findSubmitButton() && getFilledSquadSlots(squad) === 0 && existingItems.length) {
      try {
        squad.setPlayers?.(existingItems, true);
        await sleep(350);
        const restored = getFilledSquadSlots(squad);
        if (restored) {
          log(`${label}: FSU made no fill progress; restored ${restored} existing squad item(s) for safe repair`);
        }
      } catch (error) {
        log(`${label}: could not restore existing squad after FSU made no fill progress: ${error?.message || error}`);
      }
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

  function summarizeRequiredSpecialEntries(entries, limit = 3) {
    return entries.slice(0, limit).map(({ item, pileName }) =>
      `${itemDisplayName(item)} rating:${Number(item?.rating || 0) || '?'} ${requiredSpecialTypeLabel(item)} from:${pileName} id:${Number(item?.id || 0) || '?'}`
    ).join('; ');
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

  function getSubmittedRatingLimit(item, loopDef = {}, settings = getFsuSettings()) {
    const normalGoldLimit = Number(loopDef.maxNormalGoldSubmittedRating || 0);
    if (isNormalGoldFodder(item)) {
      const fsuRange = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
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
    if (isLimitedUseItem(item)) return false;
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
      reasons.includes('loan') ||
      reasons.includes('limited-use') ||
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
      await prepareSbcSquad(opened.challenge, plan.players, `${loopDef.name} protected squad repair`);
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

      await prepareSbcSquad(opened.challenge, plan.players, `${loopDef.name} submit-ready repair`);
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
    await prepareSbcSquad(opened.challenge, plan.players, `${loopDef.name} required special repair`);
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
      ratingSbcFill: {
        priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      },
      requiredSpecialCount: 0,
      allowedSpecialCount: 0,
      blockSpecial: true,
      blockTradeable: false,
      openRewardPacks: true,
      ...override,
    };
  }

  function getAutoFodderUpgradeDef(loopDef = {}) {
    const override = isPlainObject(loopDef.autoFodderUpgrade) ? loopDef.autoFodderUpgrade : {};
    return {
      id: `${loopDef.id || 'fill-and-verify'}-auto-2x84-fodder`,
      name: '2x84+ Fodder Recovery',
      strategy: 'fillAndVerifySbc',
      sbcNames: ['2x 84+ Upgrade', '2 x 84+ Upgrade'],
      rewardPackNames: ['2x 84+ Rare Gold Players Pack', '2 x 84+ Rare Gold Players Pack'],
      maxCompletions: 1,
      inventoryFillFirst: true,
      requirements: [
        { tier: 'gold', rarity: 'rare', count: 6, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ['storage', 'club'] },
      ],
      priorityPiles: ['storage', 'club'],
      requiredSpecialCount: 0,
      allowedSpecialCount: 0,
      maxSubmittedRating: 81,
      maxNormalGoldSubmittedRating: 81,
      blockSpecial: true,
      blockTradeable: false,
      openRewardPacks: true,
      forceOpenRewardPacks: true,
      ...override,
    };
  }

  function getAutoFodderUpgradeAttemptLimit(loopDef = {}) {
    if (loopDef.autoFodderUpgrade === undefined || loopDef.autoFodderUpgrade === false) return 0;
    const override = isPlainObject(loopDef.autoFodderUpgrade) ? loopDef.autoFodderUpgrade : {};
    return Math.max(1, Math.min(10, Number(override.maxAttemptsPerCompletion || 3) || 3));
  }

  async function craftAutoFodderUpgrade(loopDef, attempt, maxAttempts) {
    const upgradeDef = getAutoFodderUpgradeDef(loopDef);
    await refreshInventoryCaches(`${loopDef.name} ${upgradeDef.name} preflight`, { includePacks: false, quiet: true });
    const selection = selectInventoryPlayers(upgradeDef);
    log(`${loopDef.name}: ${upgradeDef.name} attempt ${attempt}/${maxAttempts} selected ${selection.selected.length}/6 low rare gold player(s) (${formatSelectionStats(selection.stats)})`);
    if (!selection.ok) {
      logSelectionDiagnostics(`${loopDef.name} ${upgradeDef.name}`, selection, upgradeDef.priorityPiles);
      log(`${loopDef.name}: ${upgradeDef.name} recovery is unavailable; keeping the current 84x10 unsubmitted`);
      return { ok: false, reason: 'not enough eligible low rare gold fodder' };
    }

    await unwindSbcSquadControllers(`${loopDef.name} before ${upgradeDef.name}`);
    log(`${loopDef.name}: safe rating fodder exhausted; submitting ${upgradeDef.name} ${attempt}/${maxAttempts} before retrying 84x10`);
    const result = await runFillAndVerifyLoop(upgradeDef);
    await unwindSbcSquadControllers(`${loopDef.name} after ${upgradeDef.name}`);
    await refreshInventoryCaches(`${loopDef.name} after ${upgradeDef.name}`, { includePacks: false, quiet: true });

    if (Number(result?.completions || 0) < 1) {
      return { ok: false, reason: `${upgradeDef.name} was not submitted` };
    }
    if (Number(result?.rewardPacksOpened || 0) < 1) {
      log(`${loopDef.name}: ${upgradeDef.name} was submitted but its reward pack was not opened; stop before consuming another six cards`);
      return { ok: false, reason: `${upgradeDef.name} reward pack was not opened` };
    }
    return { ok: true };
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
    const result = await runFillAndVerifyLoop(upgradeDef);
    if (Number(result?.completions || 0) < 1) {
      const reason = `${upgradeDef.name} was not submitted`;
      log(`${loopDef.name}: cannot auto-craft ${requiredSpecialLabel(loopDef)} because ${reason}`);
      return { ok: false, reason };
    }
    if (Number(result?.rewardPacksOpened || 0) < 1) {
      const reason = `${upgradeDef.name} reward pack was not opened`;
      log(`${loopDef.name}: cannot auto-craft ${requiredSpecialLabel(loopDef)} because ${reason}`);
      return { ok: false, reason };
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
      const challenge = shouldUseRatingSbcFill(upgradeDef)
        ? await findAvailableRatingSbcChallenge(set, upgradeDef.name)
        : await findAvailableSbcChallenge(set, upgradeDef.name);
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
    const settings = context.settings || getFsuSettings();
    const maxRating = getSubmittedRatingLimit(item, loopDef, settings);
    const protectedIds = context.protectedItemIds || new Set((loopDef.protectedItemIds || []).map(Number));
    const protectedDefinitionIds = context.protectedDefinitionIds || new Set((loopDef.protectedDefinitionIds || []).map(Number));
    const allowedSpecialCount = context.allowedSpecialCount !== undefined
      ? Math.max(0, Number(context.allowedSpecialCount || 0) || 0)
      : Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
    const requiredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
    const specialIndex = Number(context.specialIndex || 0) || 0;
    const fsuSpec = {
      playerOnly: true,
      allowSpecial: requiredSpecialCount > 0 && specialIndex <= requiredSpecialCount,
    };

    if (itemId && state.consumedItemIds.has(itemId)) reasons.push('consumed-this-run');
    if (isLoanItem(item)) reasons.push('loan');
    else if (isLimitedUseItem(item)) reasons.push('limited-use');
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
    getFsuRejectReasons(item, fsuSpec, settings, context).forEach((reason) => {
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
        ['special-blocked', 'tradeable-blocked', 'protected-id', 'protected-def', 'loan', 'limited-use', 'concept', 'academy', 'active-trade', 'consumed-this-run'].includes(String(reason))
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
      if (reasons.includes('loan') || reasons.includes('limited-use')) {
        hints.push(`${prefix}: replace loan/limited-use card with an owned card`);
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

  function failIfSbcSubmitError(label = 'SBC submit') {
    const error = sbcRewardOverlay.findSubmitError();
    if (!error) return false;
    sbcRewardOverlay.dismissSubmitError(error);
    fail(`${label}: submit blocked by EA modal: ${error.text}`);
  }

  async function fillBronzeUpgradeSquad() {
    await fillSbcSquad('Bronze Upgrade');
  }

  function getSbcProgressSnapshot(set) {
    return {
      setComplete: isSbcSetComplete(set),
      setTimesCompleted: Number.isFinite(Number(set?.timesCompleted)) ? Number(set.timesCompleted) : null,
      challenges: getCachedSbcChallenges(set).map((challenge) => ({
        id: Number(challenge?.id || 0),
        completed: isCompletedChallenge(challenge),
        timesCompleted: Number.isFinite(Number(challenge?.timesCompleted)) ? Number(challenge.timesCompleted) : null,
      })),
    };
  }

  async function claimSbcRewardsIfPresent(label = 'SBC submit', options = {}) {
    return claimSbcRewards({
      label,
      beforePackCounts: options.beforePackCounts,
      beforeProgress: options.beforeProgress,
      overlay: sbcRewardOverlay,
      getPackCounts: getPackCountsById,
      getProgress: () => getSbcProgressSnapshot(options.set),
      refreshPacks: refreshStorePacks,
      popupShieldShowing: () => pageRuntime.popupShieldShowing(),
      click: simulateClick,
      keyStroke: simulateKeyStroke,
      waitLoadingEnd,
      sleep,
      stopPoint,
      failIfSubmitError: failIfSbcSubmitError,
      log,
    });
  }

  async function submitSbcAndGetAwardPackId(set) {
    const beforePackCounts = getPackCountsById();
    const beforeProgress = getSbcProgressSnapshot(set);
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

    await claimSbcRewardsIfPresent(set.name, { set, beforePackCounts, beforeProgress });
    await waitLoadingEnd(900, 45000);
    await refreshStorePacks().catch(() => null);

    const awardId = Number(set?.awards?.[0]?.value) || null;
    let rewardPackId = awardId;
    if (!rewardPackId) {
      const afterPacks = getAvailableRepositoryMyPacks();
      const afterPackCounts = getPackCountsById(afterPacks);
      const newPack = afterPacks.find((pack) => {
        const id = packIdKey(pack);
        return id && Number(afterPackCounts.get(id) || 0) > Number(beforePackCounts.get(id) || 0);
      });
      rewardPackId = Number(packIdKey(newPack)) || null;
    }

    // Capture the reward before leaving the submitted squad, then unwind every SBC
    // submission path before a reward pack is opened or another challenge is loaded.
    await syncAfterSbcSubmit(set?.name || 'SBC submit');
    return rewardPackId;
  }

  function rewardPackIdFromSubmitResult(result, set) {
    const awards = result?.data?.grantedChallengeAwards || result?.response?.grantedChallengeAwards || [];
    for (const award of awards) {
      const values = [
        award?.value,
        award?.id,
        award?.packId,
        award?.packDefinitionId,
        award?.item?.id,
        award?.item?.resourceId,
      ];
      const id = values.map(Number).find((value) => Number.isFinite(value) && value > 0);
      if (id) return id;
    }
    return Number(set?.awards?.[0]?.value) || null;
  }

  async function submitRatingSbcInBackground(set, challenge, label = set?.name || 'rating SBC') {
    const beforePackCounts = getPackCountsById();
    let canSubmit = true;
    try { canSubmit = challenge?.canSubmit?.() !== false; } catch { }
    if (!canSubmit) fail(`${label}: challenge model rejected the background squad before submit`);

    const { skipValidation, chemistryEnabled } = eaSbcAdapter().submissionOptions();
    log(`Submitting SBC in background: ${set.name}`);
    const result = await observeOnce(
      eaSbcAdapter().submitChallenge(challenge, set, { skipValidation, chemistryEnabled }),
      ctrl(),
      45000,
      `submitChallenge ${label}`,
    );
    if (!result?.success) {
      const detail = serviceResultErrorText(result) || result?.status || 'unknown';
      fail(`${label}: background submit failed: ${detail}`);
    }

    await refreshStorePacks().catch(() => null);
    let rewardPackId = rewardPackIdFromSubmitResult(result, set);
    if (!rewardPackId) {
      const afterPacks = getAvailableRepositoryMyPacks();
      const afterPackCounts = getPackCountsById(afterPacks);
      const newPack = afterPacks.find((pack) => {
        const id = packIdKey(pack);
        return id && Number(afterPackCounts.get(id) || 0) > Number(beforePackCounts.get(id) || 0);
      });
      rewardPackId = Number(packIdKey(newPack)) || null;
    }
    log(`${label}: background submit complete; reward pack ${rewardPackId || 'unknown'}`);
    return rewardPackId;
  }

  async function openRewardSilverPack(packId) {
    await refreshStorePacks();
    let pack = findPackById(packId);
    if (!pack) pack = findPackByName(CFG.silverRewardNames);
    if (!pack) {
      const names = getMyPacks().map((p) => `${packName(p)} (#${p.id})`).join(', ');
      fail(`Silver reward pack not found. Current my packs: ${names || 'none'}`);
    }

    await openPack(pack, 'Bronze Upgrade reward', {
      openedItemPolicy: createOpenedItemPolicy(async (openedItems) => {
        const silverCount = openedItems.filter((item) => isPlayer(item) && isSilver(item)).length;
        log(`Reward opened; detected ${silverCount} silver player(s)`);
        log(`Handling ${openedItems.length} reward item(s) with unassigned cleanup strategy`);
        await resolveRuntimeUnassigned('reward item handling');
        await refreshUnassigned();
        return openedItemRoutingResult(openedItems, null, { silverCount });
      }),
    });
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

      const receipt = await openPack(pack, `${loopDef.name} ${reason}`, {
        allowGone: true,
        assumeSpecialPlayers: options.assumeTotwReward === true,
        retryCodes: ['471', '500'],
        resolveRetryPack: () => findRewardPack(loopDef, rewardPackId, {
          attempts: 2,
          delayMs: options.findDelayMs || 1800,
          fallbackPackMatcher: options.fallbackPackMatcher,
        }),
        openedItemPolicy: createOpenedItemPolicy(async (openedItems) => {
          if (options.assumeTotwReward) {
            markAssumedTotwRewardItems(openedItems, `${loopDef.name} ${reason}`);
          }
          // EA can expose the pack response before Purchased/Unassigned caches settle.
          await materializeOpenedPlayerRewards(openedItems, `${loopDef.name} ${reason}`);
          await resolveRuntimeUnassigned(`${loopDef.name} ${reason} handling`);
          resolveRecentRewardItems(`${loopDef.name} ${reason}`);
          await refreshUnassigned();
          return openedItemRoutingResult(openedItems, null, { assumeTotwReward: options.assumeTotwReward === true });
        }),
      });
      if (!receipt) {
        if (openAttempt < openAttempts) {
          log(`${loopDef.name}: retrying reward pack lookup after stale pack (${openAttempt}/${openAttempts})`);
          await sleep(900);
          continue;
        }
        return false;
      }
      log(`${loopDef.name}: auto-opened reward pack ${packName(pack)} (#${pack.id}); ${receipt.openedItems.length} item(s)`);
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
    const attempt = await submitSbcAttempt({
      label: loopDef.name,
      challengeProvider: async () => {
        const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
        return openSbcSet(set, { returnNullIfComplete: options.returnNullIfComplete });
      },
      squadProvider: createFsuFillProvider({
        fill: async () => fillSbcSquad(loopDef.name),
        getPlayers: async ({ challenge }) => getSquadItems(ctrl()?._squad || challenge?.squad),
        itemRef: liveItemRef,
      }),
      preSaveValidators: [({ challenge }) => {
        const inspection = inspectSbcSquad(loopDef, ctrl()?._squad || challenge?.squad);
        logSbcSquadInspection(loopDef, inspection);
        assertSbcSquadSafe(loopDef, inspection);
        return true;
      }],
      isSubmitReady: async () => !!findSubmitButton(),
      submitTransport: async ({ set }) => ({
        submitted: true,
        rewardPackId: await submitSbcAndGetAwardPackId(set),
      }),
    });
    if (attempt.status === 'unavailable') {
      log(`${loopDef.name}: no available SBC challenge remains`);
      return null;
    }
    if (!attempt.submitted) {
      log(`${loopDef.name}: configured SBC submit blocked: ${attempt.reason || attempt.status}`);
      return null;
    }
    log(`${loopDef.name} reward pack id: ${attempt.rewardPackId || 'unknown'}`);
    return { submitted: true, rewardPackId: attempt.rewardPackId };
  }

  function getUnassignedTargetDuplicates(loopDef) {
    return getUnassignedItems().filter((item) => isTargetDuplicate(item, loopDef));
  }

  function itemRefMatchesAny(item, refs = []) {
    const id = Number(item?.id || item?.ref?.id || 0);
    if (id) return refs.some((ref) => Number(ref?.id || 0) === id);
    const definitionId = Number(item?.definitionId || item?.ref?.definitionId || 0);
    return definitionId > 0 && refs.some((ref) => !Number(ref?.id || 0) && Number(ref?.definitionId || 0) === definitionId);
  }

  function duplicateSignalRefKey(ref = {}) {
    const id = Number(ref?.id || ref?.ref?.id || 0);
    if (id) return `id:${id}`;
    return `definition:${Number(ref?.definitionId || ref?.ref?.definitionId || 0)}`;
  }

  function rememberConsumedDuplicateSignals(refs = []) {
    for (const ref of refs) {
      const key = duplicateSignalRefKey(ref);
      if (key === 'definition:0') continue;
      state.pendingConsumedDuplicateSignals.set(key, {
        id: Number(ref?.id || ref?.ref?.id || 0),
        definitionId: Number(ref?.definitionId || ref?.ref?.definitionId || 0),
        duplicateId: Number(ref?.duplicateId || 0),
        pile: 'unassigned',
      });
    }
  }

  function clearConsumedDuplicateSignals(triggerRefs, label, options = {}) {
    let cleared = 0;
    let resolved = 0;
    for (const item of getUnassignedItems()) {
      const triggerRef = triggerRefs.find((ref) => itemRefMatchesAny(item, [ref]));
      if (!triggerRef) continue;
      const key = duplicateSignalRefKey(triggerRef);
      if (!isDuplicate(item)) {
        state.pendingConsumedDuplicateSignals.delete(key);
        resolved++;
        continue;
      }
      const duplicateId = Number(item?.duplicateId || triggerRef?.duplicateId || 0);
      const clubDuplicate = findClubDuplicate(item);
      const duplicateConsumed = duplicateId && state.consumedItemIds.has(duplicateId);
      const clubDuplicateConsumed = clubDuplicate && state.consumedItemIds.has(Number(clubDuplicate?.id || 0));
      if (!duplicateConsumed && !clubDuplicateConsumed) continue;
      item.duplicateId = 0;
      if (item._duplicateId !== undefined) item._duplicateId = 0;
      state.pendingConsumedDuplicateSignals.delete(key);
      cleared++;
    }
    if (cleared && options.quiet !== true) log(`${label}: cleared ${cleared} consumed duplicate signal(s) after recovery`);
    if (resolved && options.quiet !== true) log(`${label}: confirmed ${resolved} duplicate signal(s) already resolved`);
    return cleared;
  }

  async function trySubmitUnassignedRecoveryRecipe({ policy, recipe, triggerRefs }) {
    const label = `Unassigned ${policy.id} -> ${recipe.name}`;
    let set;
    try {
      set = await findSbcSetIfPresent(recipe.sbcNames);
    } catch (error) {
      log(`${label}: SBC lookup failed: ${error?.message || error}`);
      return { status: 'blocked', reason: error?.message || String(error) };
    }
    if (!set) {
      log(`${label}: SBC is not currently available; trying the next configured recipe`);
      return { status: 'unavailable', reason: 'SBC is not currently available' };
    }
    if (isSbcSetComplete(set)) {
      log(`${label}: SBC set is complete; trying the next configured recipe`);
      return { status: 'unavailable', reason: 'SBC set is complete' };
    }
    let challenge;
    try {
      const challenges = await requestSbcChallenges(set, label, { allowEmpty: true, attempts: 2 });
      challenge = challenges.find((candidate) => !isCompletedChallenge(candidate)) || null;
    } catch (error) {
      log(`${label}: Challenge availability check failed: ${error?.message || error}`);
      return { status: 'blocked', reason: error?.message || String(error) };
    }
    if (!challenge) {
      log(`${label}: no available Challenge remains; trying the next configured recipe`);
      return { status: 'unavailable', reason: 'no available Challenge remains' };
    }
    await refreshInventoryCaches(`${label} pre-selection`, { includePacks: false, quiet: true });
    const piles = recipe.priorityPiles || ['unassigned', 'storage', 'transfer', 'club'];
    const selection = selectInventoryPlayers(recipe, piles, { preferredSignalRefs: triggerRefs });
    if (!selection.ok) {
      log(`${label}: inventory cannot satisfy the configured recipe (${selection.missing?.count || '?'} missing)`);
      return { status: 'insufficient', reason: 'inventory cannot satisfy recipe' };
    }
    if (!selectionConsumesSignalRefs(selection, triggerRefs)) {
      log(`${label}: selected squad does not consume a blocked Unassigned duplicate; trying the next configured recipe`);
      return { status: 'insufficient', reason: 'selection does not consume trigger' };
    }
    const countNeeded = sumRequirementPlayerCount(recipe);
    if (triggerRefs.length <= countNeeded && !selectionConsumesAllSignalRefs(selection, triggerRefs)) {
      const triggerItems = triggerRefs
        .map((ref) => getUnassignedItems().find((item) => itemRefMatchesAny(item, [ref])))
        .filter(Boolean);
      logDuplicateSignalDiagnostics(
        label,
        triggerItems,
        selectionRequirements(recipe, piles)[0] || {},
        selection,
      );
      return {
        status: 'blocked',
        reason: `selection resolved only part of ${triggerRefs.length} blocked duplicate signal(s); diagnostic logged before submit`,
      };
    }
    let opened;
    try {
      opened = await openSbcSet(set, { challenge, returnNullIfComplete: true });
    } catch (error) {
      log(`${label}: Challenge load failed: ${error?.message || error}`);
      return { status: 'blocked', reason: error?.message || String(error) };
    }
    if (!opened) {
      log(`${label}: SBC has no available challenge; trying the next configured recipe`);
      return { status: 'unavailable', reason: 'SBC has no available challenge' };
    }
    log(`${label}: submitting one recovery squad; selected ${selection.selected.length} player(s) (${formatSelectionStats(selection.stats)})`);
    let attempt;
    try {
      attempt = await submitInventorySbcAttempt(recipe, selection, {
        label,
        markConsumed: true,
        handleReward: false,
        opened,
      });
    } catch (error) {
      log(`${label}: recovery save/submit failed: ${error?.message || error}`);
      return { status: 'blocked', reason: error?.message || String(error) };
    }
    if (!attempt.result.submitted) {
      const status = attempt.result.status === 'unavailable' ? 'unavailable' : 'blocked';
      log(`${label}: recovery submit ${status}: ${attempt.result.reason || attempt.result.status}`);
      return { status, reason: attempt.result.reason || attempt.result.status };
    }
    await refreshInventoryCaches(`${label} post-submit`, { includePacks: false, quiet: true });
    clearConsumedDuplicateSignals(triggerRefs, label);
    return { status: 'progress', consumedItemIds: attempt.result.consumedItemRefs.map((ref) => ref.id) };
  }

  function buildUnassignedRecoveryResolvers(options = {}) {
    const policyIds = options.policyIds || [];
    if (!policyIds.length) return [];
    return createRecoveryOverflowResolvers({
      recipes: getRecoveryRecipes(),
      policies: getUnassignedRecoveryPolicies(),
      policyIds,
      attemptRecipe: trySubmitUnassignedRecoveryRecipe,
    });
  }

  async function recoverUnassignedOverflow(loopDef, reason) {
    await refreshUnassigned();
    const overflow = getUnassignedCapacityOverflow();
    if (!overflow.blocked) return { status: 'not-blocked' };
    log(`${loopDef.name}: Unassigned overflow recovery before ${reason}; blocked duplicates:${overflow.count}, ${overflow.destination} slots:${overflow.space}`);
    return resolveRuntimeUnassigned(`${loopDef.name} overflow recovery`, {
      loopDef,
    });
  }

  function createRecyclePackPolicy(loopDef) {
    return createOpenedItemPolicy(async (openedItems) => {
      const targetDuplicates = openedItems.filter((item) => isTargetDuplicate(item, loopDef));
      const targetIds = new Set(targetDuplicates.map((item) => Number(item?.id || 0)));
      const directClub = openedItems.filter((item) =>
        !targetIds.has(Number(item?.id || 0)) && !isDuplicate(item)
      );
      if (directClub.length) {
        log(`Moving ${directClub.length} non-duplicate item(s) to club`);
        await moveItems(directClub, inventoryPile('club'), true);
      }
      await resolveRuntimeUnassigned(`${loopDef.name} pack handling`, {
        reserveItem: (item) => isTargetDuplicate(item, loopDef),
      });
      await refreshUnassigned();
      const reserved = getUnassignedTargetDuplicates(loopDef);
      if (reserved.length) log(`${reserved.length} target duplicate(s) reserved for ${loopDef.name}`);
      const reservedIds = new Set(reserved.map((item) => Number(item?.id || 0)));
      return openedItemRoutingResult(openedItems, (item) => reservedIds.has(Number(item?.id || 0)), {
        targetDuplicateCount: reserved.length,
      });
    });
  }

  async function runRecycleLoop(loopDef) {
    await waitAppReady();
    const dryRun = loopDef.dryRun === true;
    const result = await runRecycleWorkflow({
      maxCompletions: Number(loopDef.maxCompletions || 7),
      stopPoint: () => stopPoint(),
      inspectTargets: async () => {
        if (dryRun) await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
        else await refreshUnassigned();
        return getUnassignedTargetDuplicates(loopDef);
      },
      findPack: async ({ rewardPackId }) => findLoopPack(loopDef, rewardPackId),
      consumeTarget: async ({ result: current, targets }) => {
        log(`${loopDef.name}: ${dryRun ? 'dry-run would consume' : 'consuming'} target duplicate ${current.completions + 1}/${loopDef.maxCompletions}; available:${targets.length}`);
        if (dryRun) {
          logDryRunSelection(`${loopDef.name} target duplicates`, {
            ok: true,
            selected: targets,
            entries: targets.map((item) => ({ item, pileName: 'unassigned' })),
            stats: { unassigned: targets.length },
          });
          return { status: 'planned', reason: 'would submit target duplicate' };
        }
        return await submitConfiguredSbc(loopDef, { returnNullIfComplete: true }) || {
          status: 'unavailable',
          reason: 'no available SBC challenge remains',
        };
      },
      openPack: async ({ pack }) => {
        if (dryRun) {
          log(`${loopDef.name}: dry-run would open reward pack ${packName(pack)} (#${pack.id})`);
          return { status: 'planned', reason: `would open ${packName(pack)}` };
        }
        const receipt = await openPack(pack, loopDef.name, {
          allowGone: true,
          openedItemPolicy: createRecyclePackPolicy(loopDef),
        });
        return receipt || { status: 'stale', reason: 'pack unavailable after refresh' };
      },
      submitSeed: async ({ result: current }) => {
        if (dryRun) {
          const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
          const challenge = await findAvailableSbcChallenge(set, loopDef.name);
          if (!challenge) return { status: 'unavailable', reason: 'no available seed SBC challenge remains' };
          log(`${loopDef.name}: dry-run found no target duplicate or reward pack; seed SBC available ${set.name} (#${set.id || '?'}) challenge #${challenge.id || '?'}`);
          return { status: 'planned', reason: 'would submit seed SBC' };
        }
        log(`${loopDef.name}: no target duplicate or reward pack; submitting seed SBC ${current.completions + 1}/${loopDef.maxCompletions}`);
        return await submitConfiguredSbc(loopDef, { returnNullIfComplete: true }) || {
          status: 'unavailable',
          reason: 'no available seed SBC challenge remains',
        };
      },
      afterSubmission: async () => {
        if (!dryRun) await sleep(CFG.pauseMs);
      },
      afterPack: async () => {
        if (!dryRun) await sleep(CFG.pauseMs);
      },
      afterStalePack: async () => {
        if (!dryRun) await sleep(CFG.pauseMs);
      },
      openFinalReward: loopDef.openRewardPacks === true
        ? async ({ rewardPackId }) => {
            if (dryRun) return { status: 'planned', reason: `would open final reward #${rewardPackId}` };
            const opened = await openRewardPackAndCleanup(loopDef, rewardPackId, 'final reward pack');
            return opened ? { status: 'opened' } : { status: 'unavailable', reason: 'final reward unavailable' };
          }
        : null,
      finalize: async (workflowResult) => {
        if (workflowResult.lastRewardPackId) {
          log(`${loopDef.name}: final reward pack #${workflowResult.lastRewardPackId} left unopened`);
        }
        if (dryRun) return;
        await resolveRuntimeUnassigned(`${loopDef.name} final cleanup`, {
          loopDef,
        });
      },
    });
    if (dryRun) {
      log(`${loopDef.name}: dry-run result ${result.status}`);
      log(`${loopDef.name}: dry run stops before opening packs, moving items, or submitting SBCs`);
    } else {
      log(`${loopDef.name}: submitted ${result.completions} SBC(s) in this run`);
    }
    return result;
  }

  function formatSelectionStats(stats = {}) {
    return ['unassigned', 'storage', 'transfer', 'club']
      .map((pile) => `${pile}:${stats[pile] || 0}`)
      .join(', ');
  }

  function isDryRunEnabled() {
    return document.querySelector('#bronze-loop-dry-run')?.checked === true;
  }

  function isOpenRewardPacksEnabled() {
    return document.querySelector('#bronze-loop-open-rewards')?.checked === true;
  }

  function loadLoopUiOptions() {
    try {
      const saved = adapters.localStorage.getJson(LOOP_UI_OPTIONS_KEY, {});
      return { showMvpLoops: saved.showMvpLoops === true };
    } catch {
      return { showMvpLoops: false };
    }
  }

  function saveLoopUiOptions() {
    state.showMvpLoops = document.querySelector('#bronze-loop-show-mvp')?.checked === true;
    try {
      adapters.localStorage.setJson(LOOP_UI_OPTIONS_KEY, { showMvpLoops: state.showMvpLoops });
    } catch { }
    renderLoopSelect();
  }

  function getPickRuntimeOptions() {
    return normalizePickRuntimeOptions({
      protectHighGold: document.querySelector('#bronze-loop-pick-protect-high-gold')?.checked !== false,
      autoSelectBelow90: document.querySelector('#bronze-loop-pick-auto-below-90')?.checked !== false,
      preferScannedMetadata: document.querySelector('#bronze-loop-pick-prefer-scanned')?.checked === true,
      openPicksAtEnd: document.querySelector('#bronze-loop-pick-open-at-end')?.checked === true,
      highGoldThreshold: document.querySelector('#bronze-loop-pick-high-gold-threshold')?.value,
      autoPickThreshold: document.querySelector('#bronze-loop-pick-auto-threshold')?.value,
    });
  }

  function loadPickRuntimeOptions() {
    try {
      return normalizePickRuntimeOptions(adapters.localStorage.getJson(PICK_OPTIONS_KEY, {}));
    } catch {
      return normalizePickRuntimeOptions();
    }
  }

  function savePickRuntimeOptions() {
    const options = getPickRuntimeOptions();
    try {
      adapters.localStorage.setJson(PICK_OPTIONS_KEY, options);
    } catch { }
    if (!options.preferScannedMetadata && Object.keys(state.discoveredLoopOverrides).length) {
      state.discoveredLoopOverrides = {};
      renderLoopSelect(document.querySelector('#bronze-loop-select')?.value || null);
      log('Player Pick scan: scanned metadata preference disabled; configured Pick Loops reverted to static fallback');
    }
  }

  function getRoutineStepLoopDefs(loopDef) {
    return resolveRoutineStepLoopDefs(loopDef, getLoopDefs());
  }

  function summarizeRoutineStepLimits(steps) {
    return summarizeRoutineStepLimitsPure(steps, {
      needsAutoTotwPreflight,
      getRoutineSteps: getRoutineStepLoopDefs,
    });
  }

  function readDailyChallengeTimesCompleted(challenge) {
    const count = Number(challenge?.timesCompleted);
    return Number.isFinite(count) && count >= 0 ? count : null;
  }

  function getDailyChallengeRemaining(challenge) {
    const completed = readDailyChallengeTimesCompleted(challenge);
    const repeats = Number(challenge?.repeats);
    if (completed === null || !Number.isFinite(repeats) || repeats < completed) return null;
    return Math.max(0, Math.floor(repeats - completed));
  }

  function getDailySetRemaining(set) {
    const completed = Number(set?.timesCompleted);
    const repeats = Number(set?.repeats);
    if (!Number.isFinite(completed) || !Number.isFinite(repeats) || repeats < completed) return null;
    return Math.max(0, Math.floor(repeats - completed));
  }

  function isSbcSetComplete(set) {
    try {
      return set?.isComplete?.() === true;
    } catch {
      return false;
    }
  }

  function describeDailyChallengeCounts(challenges) {
    return challenges.map((challenge) => {
      const completed = readDailyChallengeTimesCompleted(challenge);
      const repeats = Number(challenge?.repeats);
      const remaining = getDailyChallengeRemaining(challenge);
      return `#${challenge?.id ?? '?'}: completed=${completed === null ? '?' : completed}, repeats=${Number.isFinite(repeats) ? repeats : '?'}, remaining=${remaining === null ? '?' : remaining}`;
    }).join(', ');
  }

  async function getDailyRoutineStepAvailability(step) {
    const configuredDailyLimit = Number(step?.dailyCompletionLimit || 0);
    if (!Number.isFinite(configuredDailyLimit) || configuredDailyLimit <= 0 || !step?.sbcNames?.length) return null;

    const set = await findSbcSet(step.sbcNames, step.name);
    const challenges = await requestSbcChallenges(set, step.name, { allowEmpty: true, attempts: 3 });
    const setComplete = isSbcSetComplete(set);
    const setRemaining = getDailySetRemaining(set);
    const setRepeats = Number(set?.repeats);
    const dailyLimit = Number.isFinite(setRepeats) && setRepeats > 0
      ? Math.floor(setRepeats)
      : Math.floor(configuredDailyLimit);
    log(`${step.name}: daily preflight set #${set?.id ?? '?'} (${set?.name || '?'}) complete=${setComplete}, completed=${Number.isFinite(Number(set?.timesCompleted)) ? set.timesCompleted : '?'}, repeats=${Number.isFinite(Number(set?.repeats)) ? set.repeats : '?'}, remaining=${setRemaining === null ? '?' : setRemaining}${challenges.length ? `; challenges: ${describeDailyChallengeCounts(challenges)}` : ''}`);
    if (setComplete) {
      return { available: false, remaining: 0, completed: dailyLimit, dailyLimit, reason: 'complete' };
    }
    if (!challenges.length) {
      return { available: false, remaining: null, completed: null, dailyLimit, reason: 'unavailable' };
    }

    // The challenge count is a lifetime total; repeatability is exposed on the set.
    if (setRemaining === null) {
      return {
        available: true,
        remaining: null,
        completed: null,
        dailyLimit,
        safetyLimit: 100,
        reason: 'unknown-count',
      };
    }

    const remaining = Math.min(dailyLimit, setRemaining);
    return {
      available: remaining > 0,
      remaining,
      completed: dailyLimit - remaining,
      dailyLimit,
      reason: remaining > 0 ? 'remaining' : 'complete',
    };
  }

  async function runDailySequence(loopDef) {
    await waitAppReady();
    const steps = getRoutineStepLoopDefs(loopDef);
    const limitSummary = summarizeRoutineStepLimits(steps);
    log(`${loopDef.name}: running ${steps.length} step(s): ${steps.map((step) => step.name).join(' -> ')}`);
    log(`${loopDef.name}: step policy: ${limitSummary.text}`);

    return runSequenceWorkflow({
      steps,
      stopPoint: () => stopPoint(),
      beforeStep: async ({ step }) => {
        if (!step.dryRun) {
          const recovery = await recoverUnassignedOverflow(step, `${loopDef.name} step preflight`);
          if (recovery.status === 'resolved') {
            log(`${loopDef.name}: ${step.name} overflow recovery completed before daily availability check`);
          }
          if (recovery.status === 'blocked') return { status: 'blocked', reason: recovery.reason };
        }
        return { status: 'ready' };
      },
      getAvailability: async ({ step }) => getDailyRoutineStepAvailability(step),
      configureStep: async ({ step, availability }) => {
        const configured = configureRoutineStepForAvailability(step, availability);
        if (availability && availability.remaining !== null) {
          log(`${loopDef.name}: ${configured.name} daily progress ${availability.completed}/${availability.dailyLimit}; running up to ${configured.maxCompletions}`);
        } else if (availability) {
          log(`${loopDef.name}: ${configured.name} is available; completion count unavailable, running until the challenge is unavailable (safety cap ${configured.maxCompletions || 100})`);
        }
        return configured;
      },
      runStep: async ({ step }) => runConfiguredLoop(step, 1),
      afterStep: async () => sleep(CFG.pauseMs),
      onEvent: async (event, payload) => {
        if (event === 'step-start') {
          log(`${loopDef.name}: step ${payload.index + 1}/${payload.total} ${payload.step.name}`);
        } else if (event === 'step-skipped') {
          const reason = payload.availability.reason === 'unavailable'
            ? 'challenge list unavailable after retry'
            : 'daily SBC is complete';
          log(`${loopDef.name}: skipping ${payload.step.name}; ${reason}`);
        }
      },
    });
  }

  function shouldUseInventoryFirstFill(loopDef = {}) {
    return loopDef.inventoryFillFirst === true && Array.isArray(loopDef.requirements) && loopDef.requirements.length > 0;
  }

  function shouldUseRatingSbcFill(loopDef = {}) {
    return isPlainObject(loopDef.ratingSbcFill);
  }

  function logInventorySelection(label, selection, options = {}) {
    const maxItems = Number(options.maxItems || 20);
    log(`${label}: inventory selected ${selection?.selected?.length || 0} item(s) (${formatSelectionStats(selection?.stats)})`);
    const entries = selection?.entries || (selection?.selected || []).map((item) => ({ item, pileName: 'unknown' }));
    entries.slice(0, maxItems).forEach((entry, index) => log(`inventory pick ${formatDryRunItem(entry, index)}`));
    if (entries.length > maxItems) log(`${label}: inventory pick list truncated: ${entries.length - maxItems} more item(s)`);
  }

  function logRatingSbcModel(loopDef, model) {
    log(`${loopDef.name}: rating SBC model players:${model.requiredPlayerCount}, target:${model.targetRating}, max special:${model.maxSpecialCount}`);
    model.constraints.forEach((constraint) => {
      log(`${loopDef.name}: rating SBC constraint ${constraint.label}`);
    });
  }

  async function fillSbcSquadRatingOptimized(loopDef, opened, options = {}) {
    const startedAt = Date.now();
    if (options.skipInventoryRefresh) {
      log(`${loopDef.name}: reusing inventory cache refreshed by the preceding special-card preflight`);
    } else {
      log(`${loopDef.name}: refreshing inventory before rating candidate construction`);
      await refreshInventoryCaches(`${loopDef.name} rating SBC fill`, { includePacks: false, quiet: true });
      log(`${loopDef.name}: rating inventory refresh complete in ${Date.now() - startedAt}ms`);
    }
    const model = parseRatingSbcChallenge(loopDef, opened.challenge);
    logRatingSbcModel(loopDef, model);
    if (model.unsupported.length) {
      return {
        ok: false,
        reason: `unsupported dynamic SBC requirement(s): ${model.unsupported.join(', ')}`,
        unsupportedRequirements: model.unsupported,
      };
    }
    if (!model.targetRating) {
      return { ok: false, reason: 'dynamic SBC challenge has no TEAM_RATING requirement and no ratingSbcFill.targetRating fallback' };
    }
    if (!model.requiredPlayerCount) {
      return { ok: false, reason: 'dynamic SBC challenge player count is unavailable' };
    }

    const candidates = buildRatingSbcCandidateEntries(loopDef, model);
    log(`${loopDef.name}: rating SBC candidates ${candidates.entries.length} unique definition(s) across ${candidates.piles.join(' > ')}; scanned ${candidates.scannedItems} item(s), built in ${candidates.buildMs}ms`);
    const searchStartedAt = Date.now();
    const searchMaxNodes = Math.max(10000, Math.min(2000000, Number(loopDef.ratingSbcFill?.maxSearchNodes || 500000) || 500000));
    const searchMaxMs = Math.max(1000, Math.min(60000, Number(loopDef.ratingSbcFill?.maxSearchMs || 15000) || 15000));
    const searchYieldNodes = Math.max(50, Math.min(5000, Number(loopDef.ratingSbcFill?.yieldEveryNodes || 500) || 500));
    log(`${loopDef.name}: rating search started; max states:${searchMaxNodes}, max time:${searchMaxMs}ms, UI yield every:${searchYieldNodes} states`);
    const selection = await findOptimalRatingSbcSelection(candidates.entries, model, candidates.piles, loopDef.ratingSbcFill);
    const searchMs = Date.now() - searchStartedAt;
    if (!selection.ok) {
      return {
        ok: false,
        reason: `${selection.reason} (searched ${selection.nodes || 0} states in ${searchMs}ms)`,
        ratingShortage: true,
        model,
        candidates,
      };
    }

    selection.stats = selection.pileCounts;
    selection.resolvedSignals = candidates.resolvedSignals;
    log(`${loopDef.name}: optimal rating squad ${selection.rating}/${model.targetRating}; ratings ${selection.ratings.join(', ')}; search states:${selection.nodes}, search:${searchMs}ms, total:${Date.now() - startedAt}ms`);
    if (options.dryRun) {
      logDryRunSelection(`${loopDef.name} rating SBC`, selection, {
        maxItems: 30,
        priorityPiles: candidates.piles,
      });
    } else {
      logInventorySelection(`${loopDef.name} rating SBC`, selection, { maxItems: 30 });
    }

    const prepared = await prepareInventorySelection(loopDef, selection);
    const plannedModelValidation = validateRatingSbcModelAgainstItems(model, prepared.selected || []);
    logRatingSbcValidation(loopDef, 'planned rating squad', plannedModelValidation, model);
    if (!plannedModelValidation.ok) {
      return {
        ok: false,
        reason: `optimized rating selection failed dynamic requirement validation: ${plannedModelValidation.errors.join(', ')}`,
        selection: prepared,
        model,
        modelValidation: plannedModelValidation,
      };
    }
    const plannedInspection = inspectSbcItems(loopDef, prepared.selected || [], {
      expectedPlayerCount: model.requiredPlayerCount,
    });
    logSbcSquadInspection(loopDef, plannedInspection);
    if (plannedInspection.blocked.length || plannedInspection.missingRequirements?.length) {
      if (options.dryRun) {
        return { ok: false, reason: 'rating SBC optimized selection failed Runner protection inspection', selection: prepared, inspection: plannedInspection };
      }
      assertSbcSquadSafe(loopDef, plannedInspection);
    }

    if (options.dryRun) {
      return { ok: true, selection: prepared, inspection: plannedInspection, model, optimizedRating: selection.rating };
    }

    const playerList = buildSquadPlayerList(opened.challenge, prepared.selected);
    const squad = opened.challenge?.squad;
    if (!squad) {
      return { ok: false, reason: 'direct rating SBC challenge has no squad model', selection: prepared, inspection: plannedInspection, model };
    }
    try { squad.removeAllItems?.(); } catch { }
    squad.setPlayers(playerList, true);
    const fillResult = {
      squad,
      filled: getFilledSquadSlots(squad),
      submitReady: false,
      background: true,
    };
    const inspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount: model.requiredPlayerCount });
    logSbcSquadInspection(loopDef, inspection);
    const savedModelValidation = validateRatingSbcModelAgainstItems(model, inspection.items, opened.challenge);
    logRatingSbcValidation(loopDef, 'saved rating squad', savedModelValidation, model);
    if (!savedModelValidation.ok) {
      return {
        ok: false,
        reason: `saved rating squad failed dynamic requirement validation: ${savedModelValidation.errors.join(', ')}`,
        selection: prepared,
        fillResult,
        inspection,
        model,
        modelValidation: savedModelValidation,
      };
    }
    let challengeCanSubmit = true;
    try { challengeCanSubmit = opened.challenge?.canSubmit?.() !== false; } catch { }
    fillResult.submitReady = challengeCanSubmit;
    log(`${loopDef.name}: optimized background rating fill submit ${fillResult.submitReady ? 'ready' : 'not ready'} (${inspection.items.length}/${model.requiredPlayerCount} players)`);
    return {
      ok: true,
      selection: prepared,
      fillResult,
      inspection,
      model,
      modelValidation: savedModelValidation,
      optimizedRating: selection.rating,
    };
  }

  async function fillConfiguredSbcSquad(loopDef, opened, options = {}) {
    if (shouldUseRatingSbcFill(loopDef)) {
      return fillSbcSquadRatingOptimized(loopDef, opened, options);
    }
    if (shouldUseInventoryFirstFill(loopDef)) {
      return fillSbcSquadInventoryFirst(loopDef, opened, options);
    }
    if (options.dryRun) {
      const expectedPlayerCount = expectedSbcPlayerCount(loopDef, opened.challenge);
      const squad = ctrl()?._squad || opened.challenge?.squad;
      const fillResult = {
        squad,
        filled: getFilledSquadSlots(squad),
        submitReady: !!findSubmitButton(),
      };
      const inspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount });
      logSbcSquadInspection(loopDef, inspection);
      log(`${loopDef.name}: dry-run inspects current squad only; does not click FSU fill or save`);
      return { ok: true, fillResult, inspection };
    }

    const fillResult = await fillSbcSquad(loopDef.name, {
      requireSubmitReady: false,
      specialRequirementAdd: loopDef.specialRequirementAdd,
    });
    const expectedPlayerCount = expectedSbcPlayerCount(loopDef, opened.challenge);
    const squad = fillResult.squad || ctrl()?._squad || opened.challenge?.squad;
    const inspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount });
    logSbcSquadInspection(loopDef, inspection);
    if (!fillResult.submitReady) {
      log(`${loopDef.name}: submit not ready after FSU fill (${fillResult.filled}/${expectedPlayerCount || '?'} slots filled); likely SBC requirements are still unmet or FSU completion picked an invalid squad`);
    }
    return { ok: true, fillResult, inspection };
  }

  async function fillSbcSquadInventoryFirst(loopDef, opened, options = {}) {
    await refreshInventoryCaches(`${loopDef.name} inventory-first fill`, { includePacks: false, quiet: true });
    const expectedPlayerCount = expectedSbcPlayerCount(loopDef, opened.challenge);
    const selection = selectInventoryPlayers(loopDef);
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

    await prepareSbcSquad(opened.challenge, prepared.selected, `${loopDef.name} inventory-first fill`);
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

  async function runFillAndVerifyLoop(loopDef) {
    await waitAppReady();
    const completionLimit = loopDef.allowMultipleCompletions === true ? 50 : 1;
    const maxCompletions = Math.max(1, Math.min(completionLimit, Number(loopDef.maxCompletions || 1) || 1));
    let autoFodderAttempts = 0;

    const result = await runRepeatedSubmissionWorkflow({
      maxCompletions,
      stopPoint: () => stopPoint(),
      executeAttempt: async ({ result: workflowResult }) => {
      if (!loopDef.dryRun) {
        await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`, shouldUseRatingSbcFill(loopDef) ? {
          reserveItem: (item) => isResolvableRatingSbcUnassignedDuplicate(item, loopDef),
        } : {});
      } else {
        log(`${loopDef.name}: dry-run skips unassigned cleanup (no item moves)`);
      }
      const preflightReady = await ensureTotwForFillAndVerify(loopDef);
      if (preflightReady === false) return { status: 'unavailable', reason: 'required TOTW preflight is unavailable' };
      patchFsuLengthSafePlayerMetadata(`${loopDef.name} before opening SBC`);

      const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
      let opened;
      if (shouldUseRatingSbcFill(loopDef)) {
        log(`${loopDef.name}: reading dynamic challenge requirements through the direct rating SBC path`);
        const challenge = await findAvailableRatingSbcChallenge(set, loopDef.name);
        const loadedChallenge = challenge && !loopDef.dryRun
          ? await loadRatingSbcChallenge(challenge, loopDef.name)
          : challenge;
        opened = loadedChallenge ? { set, challenge: loadedChallenge, background: true } : null;
      } else {
        const openStartedAt = Date.now();
        log(`${loopDef.name}: opening SBC challenge screen`);
        opened = await openSbcSet(set, { returnNullIfComplete: true });
        log(`${loopDef.name}: SBC challenge screen ready in ${Date.now() - openStartedAt}ms`);
      }
      if (!opened) {
        log(`${loopDef.name}: no available SBC challenge remains`);
        return { status: 'unavailable', reason: 'no available SBC challenge remains' };
      }

      const expectedPlayerCount = expectedSbcPlayerCount(loopDef, opened.challenge);
      const configuredFill = await fillConfiguredSbcSquad(loopDef, opened, {
        dryRun: loopDef.dryRun,
        stopOnMissingSelection: true,
        skipInventoryRefresh: needsAutoTotwPreflight(loopDef),
      });
      if (loopDef.dryRun) {
        if (!configuredFill.ok) {
          log(`${loopDef.name}: dry-run rating/inventory fill failed: ${configuredFill.reason || 'configured SBC fill failed'}`);
        }
        log(`${loopDef.name}: dry run stops before squad save or SBC submit`);
        return {
          status: 'planned',
          reason: configuredFill.reason || 'dry-run squad plan complete',
          details: { dryRun: true, ok: configuredFill.ok },
        };
      }
      if (!configuredFill.ok) {
        const autoFodderLimit = getAutoFodderUpgradeAttemptLimit(loopDef);
        if (configuredFill.ratingShortage && autoFodderAttempts < autoFodderLimit) {
          log(`${loopDef.name}: rating shortage before automatic 2x84+ recovery: ${configuredFill.reason || 'unknown reason'}`);
          const nextAttempt = autoFodderAttempts + 1;
          const recovery = await craftAutoFodderUpgrade(loopDef, nextAttempt, autoFodderLimit);
          if (recovery.ok) {
            autoFodderAttempts = nextAttempt;
            log(`${loopDef.name}: ${getAutoFodderUpgradeDef(loopDef).name} opened successfully; retrying optimized rating fill`);
            return { status: 'retry', reason: 'automatic fodder recovery succeeded' };
          }
          log(`${loopDef.name}: automatic 2x84+ recovery stopped: ${recovery.reason || 'unknown reason'}`);
        } else {
          log(`${loopDef.name}: stopping because ${configuredFill.reason || 'configured SBC fill failed'}`);
        }
        return { status: 'blocked', reason: configuredFill.reason || 'configured SBC fill failed' };
      }
      let fillResult = configuredFill.fillResult;
      let inspection = configuredFill.inspection;
      let squad = fillResult.squad || ctrl()?._squad || opened.challenge?.squad;

      const ratingSbcFill = shouldUseRatingSbcFill(loopDef);
      const totwInjection = ratingSbcFill
        ? { fillResult, inspection, planned: false, injected: false }
        : await injectRequiredTotwIfNeeded(loopDef, opened, fillResult, inspection);
      fillResult = totwInjection.fillResult;
      inspection = totwInjection.inspection;
      squad = fillResult.squad || squad;

      const protectedRepair = !ratingSbcFill && (!loopDef.dryRun || !totwInjection.planned)
        ? await repairProtectedSquadItemsIfNeeded(loopDef, opened, fillResult, inspection)
        : { fillResult, inspection, planned: false, repaired: false };
      fillResult = protectedRepair.fillResult;
      inspection = protectedRepair.inspection;
      squad = fillResult.squad || squad;

      const submitReadyRepair = !ratingSbcFill && (!loopDef.dryRun || (!totwInjection.planned && !protectedRepair.planned))
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
        return { status: 'planned', reason: 'dry-run protection inspection complete', details: { dryRun: true } };
      }

      const autoFodderLimit = getAutoFodderUpgradeAttemptLimit(loopDef);
      if (
        !fillResult.submitReady &&
        !inspection.blocked.length &&
        !inspection.missingRequirements?.length &&
        autoFodderAttempts < autoFodderLimit
      ) {
        log(`${loopDef.name}: submit not ready before automatic 2x84+ recovery (${inspection.items?.length || fillResult.filled || 0} filled)`);
        const nextAttempt = autoFodderAttempts + 1;
        const recovery = await craftAutoFodderUpgrade(loopDef, nextAttempt, autoFodderLimit);
        if (recovery.ok) {
          autoFodderAttempts = nextAttempt;
          log(`${loopDef.name}: ${getAutoFodderUpgradeDef(loopDef).name} opened successfully; retrying the same 84x10 completion with refreshed inventory`);
          return { status: 'retry', reason: 'automatic submit-ready recovery succeeded' };
        }
        log(`${loopDef.name}: automatic 2x84+ recovery stopped: ${recovery.reason || 'unknown reason'}`);
        return { status: 'blocked', reason: recovery.reason || 'automatic 2x84+ recovery stopped' };
      } else if (
        !fillResult.submitReady &&
        !inspection.blocked.length &&
        !inspection.missingRequirements?.length &&
        autoFodderLimit > 0 &&
        autoFodderAttempts >= autoFodderLimit
      ) {
        log(`${loopDef.name}: automatic 2x84+ recovery reached its ${autoFodderLimit} attempt limit for this completion`);
        return { status: 'blocked', reason: 'automatic 2x84+ recovery attempt limit reached' };
      }

      if (!fillResult.submitReady) fail(`${loopDef.name}: submit is not ready after protection inspection`);
      const submitAttempt = await submitSbcAttempt({
        label: loopDef.name,
        challengeProvider: async () => opened,
        squadProvider: createExistingSquadProvider({
          getPlayers: async () => inspection.items,
          itemRef: liveItemRef,
          source: ratingSbcFill ? 'rating-squad' : 'filled-squad',
        }),
        preSaveValidators: [() => {
          assertSbcSquadSafe(loopDef, inspection);
          if (shouldUseRatingSbcFill(loopDef)) {
            const finalModelValidation = validateRatingSbcModelAgainstItems(configuredFill.model, inspection.items, opened.challenge);
            logRatingSbcValidation(loopDef, 'final rating squad', finalModelValidation, configuredFill.model);
            if (!finalModelValidation.ok) {
              fail(`${loopDef.name}: final rating squad failed dynamic requirement validation: ${finalModelValidation.errors.join(', ')}`);
            }
          }
          return true;
        }],
        isSubmitReady: async () => fillResult.submitReady === true,
        submitTransport: async ({ set, challenge }) => ({
          submitted: true,
          rewardPackId: ratingSbcFill
            ? await submitRatingSbcInBackground(set, challenge, loopDef.name)
            : await submitSbcAndGetAwardPackId(set),
        }),
        afterSubmit: async ({ players }) => markSbcItemsConsumed(players, loopDef.name),
      });
      if (!submitAttempt.submitted) {
        fail(`${loopDef.name}: submit transaction blocked: ${submitAttempt.reason || submitAttempt.status}`);
      }
      const rewardPackId = submitAttempt.rewardPackId;
      let stopAfterRewardFailure = false;
      let rewardPacksOpened = 0;
      let rewardPacksPending = 0;
      if (loopDef.openRewardPacks) {
        const openedReward = await openRewardPackAndCleanup(loopDef, rewardPackId, 'reward pack', {
          assumeTotwReward: loopDef.assumeTotwRewardPack === true,
          fallbackPackMatcher: loopDef.assumeTotwRewardPack === true ? isLikelyTotwRewardPack : null,
          openAttempts: loopDef.assumeTotwRewardPack === true ? 3 : 1,
        });
        if (openedReward) rewardPacksOpened++;
        else {
          rewardPacksPending++;
          if (loopDef.forceOpenRewardPacks === true) {
            stopAfterRewardFailure = true;
            log(`${loopDef.name}: required reward pack could not be opened; stopping before another SBC submission`);
          }
        }
      } else if (rewardPackId) {
        log(`${loopDef.name}: reward pack #${rewardPackId} left unopened`);
      }
      autoFodderAttempts = 0;
      if (!stopAfterRewardFailure) await sleep(CFG.pauseMs);
      return {
        status: 'submitted',
        submitted: true,
        rewardPacksOpened,
        rewardPacksPending,
        stopAfterCompletion: stopAfterRewardFailure,
        reason: stopAfterRewardFailure ? 'required reward pack could not be opened' : null,
        details: { lastRewardPackId: rewardPackId || null, completedBefore: workflowResult.completions },
      };
      },
    });

    log(`${loopDef.name}: submitted ${result.completions} SBC(s) in this run`);
    return result;
  }

  function shortageSourceMatchesRequirement(source, requirement) {
    const target = source?.requirement || {};
    return ['tier', 'rarity', 'special', 'playerOnly', 'allowSpecial'].every((field) =>
      target[field] === undefined || target[field] === requirement?.[field]
    );
  }

  function getShortageForSource(loopDef, source, piles) {
    const requirements = (loopDef.requirements || []).filter((requirement) =>
      shortageSourceMatchesRequirement(source, requirement)
    );
    if (!requirements.length) return 0;
    return requirements.reduce((total, requirement) => {
      const scoped = { ...requirement, priorityPiles: piles };
      const selection = selectInventoryPlayers([scoped], piles);
      return total + (selection.ok ? 0 : Number(selection.missing?.count || 0));
    }, 0);
  }

  function findShortageSourcePack(source) {
    let pack = null;
    if (source?.packIds?.length) pack = source.packIds.map((id) => findPackById(id)).find(Boolean);
    if (!pack && source?.packNames?.length) pack = findPackByName(source.packNames);
    return pack || null;
  }

  function shortageSourceLabel(source) {
    return source?.requirement?.tier || source?.requirement?.rarity || 'material';
  }

  function countShortageSourcePacks(source) {
    const ids = new Set((source?.packIds || []).map(packIdKey).filter(Boolean));
    return getAvailableRepositoryMyPacks().filter((pack) =>
      (ids.size && ids.has(packIdKey(pack))) ||
      (source?.packNames?.length && matchesAny(packName(pack), source.packNames))
    ).length;
  }

  function createMaterializeAndResolvePolicy(label, cleanupReason, cleanupOptions = {}) {
    return createOpenedItemPolicy(async (openedItems) => {
      await materializeOpenedPlayerRewards(openedItems, label);
      await sleep(CFG.pauseMs);
      const cleanup = await resolveRuntimeUnassigned(cleanupReason, cleanupOptions);
      await refreshInventoryCaches(`${label} resolved`, { quiet: true });
      await refreshUnassigned();
      return openedItemRoutingResult(openedItems, null, {
        cleanupStatus: cleanup.status,
        cleanupReason: cleanup.reason || null,
        blockedDestination: cleanup.plan?.blocked?.destination || null,
        blockedFree: cleanup.plan?.blocked?.free ?? null,
        blockedRequired: cleanup.plan?.blocked?.required ?? null,
      });
    });
  }

  function createReserveMatchingDuplicatePackPolicy(loopDef, source) {
    return createOpenedItemPolicy(async (openedItems) => {
      const requirement = { ...(source?.requirement || {}) };
      delete requirement.count;
      const reserveDuplicate = (item) =>
        isDuplicate(item) &&
        isSbcUsablePlayer(item, requirement) &&
        itemMatchesSpec(item, requirement);
      const reservedIds = new Set(openedItems.filter(reserveDuplicate).map((item) => Number(item?.id || 0)));
      const directClub = openedItems.filter((item) =>
        !reservedIds.has(Number(item?.id || 0)) && !isDuplicate(item)
      );
      if (directClub.length) {
        log(`${loopDef.name}: moving ${directClub.length} non-duplicate source item(s) to club`);
        await moveItems(directClub, inventoryPile('club'), true);
      }
      await resolveRuntimeUnassigned(`${loopDef.name} source pack handling`, { reserveItem: reserveDuplicate });
      await refreshUnassigned();
      const reserved = getUnassignedItems().filter(reserveDuplicate);
      log(`${loopDef.name}: reserved ${reserved.length} matching duplicate(s) for SBC`);
      const liveReservedIds = new Set(reserved.map((item) => Number(item?.id || 0)));
      return openedItemRoutingResult(openedItems, (item) => liveReservedIds.has(Number(item?.id || 0)), {
        reservedMatchingDuplicateCount: reserved.length,
      });
    });
  }

  async function tryOpenMixedUpgradeShortagePacks(loopDef, source, primaryPiles) {
    const label = shortageSourceLabel(source);
    const maxOpens = Math.max(1, Math.min(10, Number(source?.maxOpensPerAttempt || 1) || 1));
    let openedCount = 0;
    let lookupAttempts = 0;
    let preserveUnassigned = false;

    while (openedCount < maxOpens && getShortageForSource(loopDef, source, primaryPiles) > 0) {
      stopPoint();
      await refreshStorePacks().catch((e) => log(`${loopDef.name}: ${label} source pack refresh skipped: ${e.message || e}`));
      const shortage = getShortageForSource(loopDef, source, primaryPiles);
      const availableCount = countShortageSourcePacks(source);
      const pack = findShortageSourcePack(source);
      if (!pack) {
        log(`${loopDef.name}: missing ${shortage} ${label} player(s); no matching source pack available, skipping`);
        break;
      }

      log(`${loopDef.name}: missing ${shortage} ${label} player(s); opening ${packName(pack)} (#${packIdKey(pack) || '?'}, available:${availableCount || '?'})`);
      const receipt = await openPack(pack, `${loopDef.name} ${label} shortage`, {
        allowGone: true,
        openedItemPolicy: source.routingPolicy === 'reserveMatchingDuplicates'
          ? createReserveMatchingDuplicatePackPolicy(loopDef, source)
          : createMaterializeAndResolvePolicy(
              `${loopDef.name} ${label} shortage pack`,
              `${loopDef.name} ${label} shortage pack handling`,
              { blockedPolicy: 'preserve' },
            ),
      });
      lookupAttempts++;
      if (!receipt) {
        if (lookupAttempts >= maxOpens + 2) break;
        continue;
      }

      openedCount++;
      if (receipt.details.cleanupStatus === 'preserved') {
        const overflow = getUnassignedStorageOverflow();
        log(`${loopDef.name}: keeping ${overflow.count} unassigned duplicate(s) for the current SBC; SBC storage has ${overflow.space} slot(s), so no further shortage pack will be opened`);
        preserveUnassigned = true;
        break;
      }
    }

    return { openedCount, preserveUnassigned };
  }

  async function runSupplyAndCraftLoop(loopDef) {
    await waitAppReady();
    const dryRun = loopDef.dryRun === true;
    const shortagePacks = loopDef.shortagePacks?.length
      ? loopDef.shortagePacks
      : loopDef.strategy === 'commonGoldToRareUpgrade'
        ? [{
            requirement: { ...(loopDef.requirements?.[0] || {}) },
            packIds: loopDef.sourcePackIds || [],
            packNames: loopDef.sourcePackNames || [],
            maxOpensPerAttempt: 1,
            repeatUntilSatisfied: true,
            maxRuns: 100,
            routingPolicy: 'reserveMatchingDuplicates',
          }]
        : [];
    const primaryPiles = shortagePacks.length
      ? (loopDef.primaryPiles || ['unassigned', 'storage', 'transfer'])
      : (loopDef.priorityPiles || ['storage', 'transfer', 'club']);
    const fallbackPiles = loopDef.clubFallbackPiles || loopDef.priorityPiles || primaryPiles;

    const result = await runSupplyAndCraftWorkflow({
      maxCompletions: Number(loopDef.maxCompletions || 7),
      stopPoint: () => stopPoint(),
      beforeIteration: async () => {
        if (dryRun) return { preserveSupply: false };
        if (loopDef.preSelectionCleanup === false) return { preserveSupply: false };
        if (!shortagePacks.length) {
          await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`);
          return { preserveSupply: false };
        }
        const cleanup = await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`, { blockedPolicy: 'preserve' });
        const preserveSupply = cleanup.status === 'preserved';
        if (preserveSupply) {
          const overflow = getUnassignedStorageOverflow();
          log(`${loopDef.name}: keeping ${overflow.count} unassigned duplicate(s) for the current SBC; SBC storage has ${overflow.space} slot(s), so no further shortage pack will be opened`);
        }
        return { preserveSupply };
      },
      challengeProvider: async ({ refresh }) => {
        const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
        if (dryRun || loopDef.deferChallengeLoad === true) {
          const challenge = await findAvailableSbcChallenge(set, loopDef.name);
          if (!challenge) return null;
          if (!refresh) {
            log(`${loopDef.name}: ${dryRun ? 'dry-run' : 'preflight'} SBC found ${set.name} (#${set.id || '?'}) challenge #${challenge.id || '?'}`);
          }
          return { set, challenge };
        }
        return openSbcSet(set, { returnNullIfComplete: true });
      },
      refreshInventory: async () => {
        await refreshInventoryCaches(`${loopDef.name} pre-selection`, { includePacks: false, quiet: true });
      },
      selectPrimary: async () => selectInventoryPlayers(loopDef, primaryPiles),
      supplies: shortagePacks.map((source, index) => ({
        id: `${shortageSourceLabel(source)}-${index}`,
        source,
        repeatUntilSatisfied: source.repeatUntilSatisfied === true,
        maxRuns: Number(source.maxRuns || 100),
        provide: async () => {
          const shortage = getShortageForSource(loopDef, source, primaryPiles);
          if (shortage <= 0) return { status: 'unavailable', reason: 'requirement already satisfied' };
          if (dryRun) {
            await refreshStorePacks().catch(() => null);
            const pack = findShortageSourcePack(source);
            if (!pack) {
              log(`${loopDef.name}: dry-run missing ${shortage} ${shortageSourceLabel(source)} player(s); no matching source pack available`);
              return { status: 'unavailable', reason: 'matching source pack unavailable' };
            }
            log(`${loopDef.name}: dry-run would open ${packName(pack)} (#${pack.id}) for ${shortageSourceLabel(source)} shortage ${shortage}`);
            return { status: 'planned', reason: `would open ${packName(pack)}` };
          }
          const supplied = await tryOpenMixedUpgradeShortagePacks(loopDef, source, primaryPiles);
          if (!supplied.openedCount) return { status: 'unavailable', reason: 'matching source pack unavailable' };
          return {
            status: 'provided',
            openedCount: supplied.openedCount,
            preserveSupply: supplied.preserveUnassigned,
          };
        },
      })),
      selectFallback: async () => selectInventoryPlayers(loopDef, fallbackPiles),
      submit: async ({ challengeContext, selection }) => {
        const opened = !dryRun && loopDef.deferChallengeLoad === true
          ? await openSbcSet(challengeContext.set, { challenge: challengeContext.challenge, returnNullIfComplete: true })
          : challengeContext;
        if (!opened) return { status: 'unavailable', submitted: false, reason: 'no available SBC challenge remains' };
        const attempt = await submitInventorySbcAttempt(loopDef, selection, {
          opened,
          dryRun,
          handleReward: !dryRun,
        });
        return attempt.result;
      },
      afterSubmission: async () => {
        if (!dryRun) await sleep(CFG.pauseMs);
      },
      finalize: async () => {
        if (dryRun) return;
        await resolveRuntimeUnassigned(`${loopDef.name} final cleanup`, {
          loopDef,
        });
      },
      onEvent: async (event, payload) => {
        if (event === 'selection') {
          const phase = payload.phase;
          const selection = payload.selection;
          const label = phase === 'primary'
            ? 'primary'
            : phase === 'fallback'
              ? 'fallback'
              : `after ${shortageSourceLabel(payload.supply?.source) || 'source'} source check`;
          if (dryRun) logDryRunSelection(`${loopDef.name} ${label}`, selection, { priorityPiles: phase === 'fallback' ? fallbackPiles : primaryPiles });
          else log(`${loopDef.name}: ${label} selected ${selection.selected.length} player(s) (${formatSelectionStats(selection.stats)})`);
        } else if (event === 'supply-skipped') {
          log(`${loopDef.name}: unassigned duplicates are reserved for this SBC; skipping additional shortage packs`);
        } else if (event === 'selection-insufficient') {
          const missing = payload.selection?.missing || {};
          log(`${loopDef.name}: missing ${missing.count || '?'} ${missing.tier || 'any'} ${missing.rarity || ''} player(s); stopping before submit`);
          logSelectionDiagnostics(loopDef.name, payload.selection, fallbackPiles);
        } else if (event === 'challenge-unavailable') {
          log(`${loopDef.name}: no available SBC challenge remains${payload.afterSupply ? ' after source pack handling' : ''}`);
        }
      },
    });

    if (dryRun) {
      log(`${loopDef.name}: dry-run result ${result.status}; planned completions:${result.completions}`);
      log(`${loopDef.name}: dry run stops before cleanup, opening packs, squad save, or SBC submit`);
    } else {
      log(`${loopDef.name}: submitted ${result.completions} SBC(s) in this run`);
    }
    return result;
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

  function isLowRareGoldDuplicate(item) {
    return isRareGoldDuplicate(item, { protectHighGold: true });
  }

  function liveItemRef(item, pile = null) {
    const detectedPile = pile || ['unassigned', 'storage', 'transfer', 'club'].find((pileName) =>
      getPileItemsByName(pileName).some((candidate) => Number(candidate?.id || 0) === Number(item?.id || 0))
    ) || 'unknown';
    return {
      id: Number(item?.id || 0),
      definitionId: Number(item?.definitionId || 0),
      pile: detectedPile,
    };
  }

  async function submitInventorySbcAttempt(loopDef, selection, options = {}) {
    let openedContext = null;
    const label = options.label || loopDef.name;
    const result = await submitSbcAttempt({
      label,
      dryRun: options.dryRun === true,
      challengeProvider: async () => {
        if (options.opened) {
          openedContext = options.opened;
          return options.opened;
        }
        const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
        const opened = await openSbcSet(set, { returnNullIfComplete: true });
        if (!opened) return null;
        openedContext = opened;
        return opened;
      },
      squadProvider: createInventorySquadProvider({
        selection,
        prepareSelection: async (_context, inputSelection) => prepareInventorySelection(loopDef, inputSelection),
        itemRef: liveItemRef,
      }),
      preSaveValidators: options.preSaveValidators || [],
      saveSquad: async ({ challenge, players }) => {
        await saveChallengeSquad(challenge, players, label);
      },
      readSavedPlayers: async ({ challenge }) => getSquadItems(challenge?.squad || ctrl()?._squad),
      postSaveValidators: options.postSaveValidators || [],
      isSubmitReady: async () => {
        const ready = !!findSubmitButton();
        log(`${label}: inventory squad saved; submit ${ready ? 'ready' : 'not ready'}`);
        return ready;
      },
      submitTransport: async ({ set }) => ({
        submitted: true,
        rewardPackId: await submitSbcAndGetAwardPackId(set),
      }),
      afterSubmit: async ({ result: submissionResult, players }) => {
        if (options.markConsumed === true) markSbcItemsConsumed(players, label);
        if (options.handleReward === false) return;
        if (submissionResult.rewardPackId && loopDef.openRewardPacks) {
          await openRewardPackAndCleanup(loopDef, submissionResult.rewardPackId);
        } else if (submissionResult.rewardPackId) {
          log(`${loopDef.name}: reward pack #${submissionResult.rewardPackId} left unopened`);
        }
      },
    });
    return { result, opened: openedContext };
  }

  async function submitInventorySelection(loopDef, selection, options = {}) {
    const attempt = await submitInventorySbcAttempt(loopDef, selection, options);
    if (attempt.result.status === 'unavailable') {
      log(`${loopDef.name}: no available SBC challenge remains`);
      return null;
    }
    if (!attempt.result.submitted) {
      log(`${loopDef.name}: inventory submit blocked: ${attempt.result.reason || attempt.result.status}`);
      return null;
    }
    return { submitted: true, rewardPackId: attempt.result.rewardPackId };
  }

  function countUnassignedMatching(predicate) {
    return getUnassignedItems().filter(predicate).length;
  }

  function getProvisionPreCraftPickDef(loopDef) {
    const pickLoopId = String(loopDef.preCraftPlayerPickLoopId || '').trim();
    if (!pickLoopId) return null;
    const basePickDef = findLoopDefById(pickLoopId);
    if (!basePickDef || basePickDef.strategy !== 'playerPickSbc') {
      fail(`${loopDef.name}: pre-craft Player Pick loop not found or invalid: ${pickLoopId}`);
    }
    const pickDef = cloneLoopDef(basePickDef);
    if (loopDef.disabledPiles?.length && !pickDef.disabledPiles?.length) {
      pickDef.disabledPiles = [...loopDef.disabledPiles];
    }
    applyDisabledPiles(pickDef);
    applyPickRuntimeOptions(pickDef);
    pickDef.maxCompletions = 1;
    return pickDef;
  }

  function getProvisionCraftingUpgrades(loopDef) {
    const configured = Array.isArray(loopDef.craftingUpgrades) && loopDef.craftingUpgrades.length
      ? loopDef.craftingUpgrades
      : [loopDef.commonUpgrade, loopDef.rareUpgrade].filter(isPlainObject);
    return configured.map((upgradeDef) => ({
      ...upgradeDef,
      openRewardPacks: loopDef.openRewardPacks === true || upgradeDef.openRewardPacks === true,
    }));
  }

  function getChallengeMaterialDefs(loopDef) {
    if (!loopDef) return [];
    if (!Array.isArray(loopDef.challengeRequirements) || !loopDef.challengeRequirements.length) return [loopDef];
    return loopDef.challengeRequirements.map((requirements, index) => ({
      ...loopDef,
      name: `${loopDef.name} challenge ${index + 1}`,
      requirements,
    }));
  }

  function itemMatchesLoopRequirements(item, loopDef) {
    const requirements = selectionRequirements(
      loopDef,
      loopDef.priorityPiles || ['unassigned', 'storage', 'transfer', 'club'],
    );
    return requirements.some((requirement) =>
      isSbcUsablePlayer(item, requirement) && itemMatchesSpec(item, requirement)
    );
  }

  function isDuplicateForLoopRequirements(item, loopDef) {
    return isDuplicate(item) && itemMatchesLoopRequirements(item, loopDef);
  }

  function getProvisionMaterialDefs(loopDef) {
    return [
      ...getChallengeMaterialDefs(getProvisionPreCraftPickDef(loopDef)),
      ...getProvisionCraftingUpgrades(loopDef).flatMap(getChallengeMaterialDefs),
    ];
  }

  function provisionMaterialLabel(loopDef) {
    return getProvisionMaterialDefs(loopDef).map((def) => def.name).join(' -> ') || 'none';
  }

  function createProvisionPackPolicy(loopDef) {
    return createOpenedItemPolicy(async (openedItems) => {
      const materialDefs = getProvisionMaterialDefs(loopDef);
      const isReservedDuplicate = (item) => materialDefs.some((def) => isDuplicateForLoopRequirements(item, def));
      await refreshInventoryCaches(`${loopDef.name} provision response classification`, { includePacks: false, quiet: true });
      const responseDuplicates = [];
      for (const item of openedItems) {
        const clubDuplicate = findClubDuplicate(item);
        if (!isDuplicate(item) && !clubDuplicate) continue;

        // EA can return the item before Purchased sets duplicateId. Preserve the response identity.
        if (clubDuplicate && !Number(item?.duplicateId || 0)) item.duplicateId = clubDuplicate.id;
        eaInventoryAdapter().preparePurchasedItem(item);
        responseDuplicates.push(item);
      }
      const responseDuplicateIds = new Set(responseDuplicates.map((item) => Number(item?.id || 0)).filter(Boolean));
      const responseReservedIds = new Set(responseDuplicates
        .filter(isReservedDuplicate)
        .map((item) => Number(item?.id || 0))
        .filter(Boolean));
      const directClub = openedItems.filter((item) => !responseDuplicateIds.has(Number(item?.id || 0)));
      const responseDuplicateById = new Map(responseDuplicates
        .map((item) => [Number(item?.id || 0), item])
        .filter(([id]) => id));

      const restoreResponseDuplicateMetadata = () => {
        for (const item of getUnassignedItems()) {
          const responseItem = responseDuplicateById.get(Number(item?.id || 0));
          if (!responseItem) continue;
          const clubDuplicate = findClubDuplicate(item) || findClubDuplicate(responseItem);
          const duplicateId = Number(item?.duplicateId || responseItem?.duplicateId || clubDuplicate?.id || 0);
          if (duplicateId && !Number(item?.duplicateId || 0)) item.duplicateId = duplicateId;
          eaInventoryAdapter().preparePurchasedItem(item);
        }
      };
      restoreResponseDuplicateMetadata();

      if (directClub.length) {
        log(`${loopDef.name}: moving ${directClub.length} non-duplicate provision item(s) to club`);
        await moveItems(directClub, inventoryPile('club'), true);
      }
      await resolveRuntimeUnassigned(`${loopDef.name} provision pack handling`, {
        reserveItem: (item) => responseReservedIds.has(Number(item?.id || 0)) || isReservedDuplicate(item),
      });
      await refreshUnassigned();
      restoreResponseDuplicateMetadata();

      const reservedItems = getUnassignedItems().filter((item) =>
        responseReservedIds.has(Number(item?.id || 0)) || isReservedDuplicate(item)
      );
      const stageCounts = materialDefs.map((def) =>
        `${def.name}:${reservedItems.filter((item) => isDuplicateForLoopRequirements(item, def)).length}`
      ).join(', ');
      log(`${loopDef.name}: classified ${responseDuplicates.length} provision duplicate(s); reserved by configured stage: ${stageCounts || 'none'}`);
      const reservedIds = new Set(reservedItems.map((item) => Number(item?.id || 0)));
      return openedItemRoutingResult(openedItems, (item) => reservedIds.has(Number(item?.id || 0)), {
        reservedCount: reservedItems.length,
        reservedItemIds: reservedItems.map((item) => Number(item?.id || 0)).filter(Boolean),
        reservedDefinitionIds: reservedItems.map((item) => Number(item?.definitionId || 0)).filter(Boolean),
      });
    });
  }

  function createRarePackTo84Policy(loopDef) {
    return createOpenedItemPolicy(async (openedItems) => {
      const responseCount = openedItems.length;
      await refreshInventoryCaches(`${loopDef.name} rare pack response classification`, { includePacks: false, quiet: true });
      const responseDuplicates = [];
      for (const item of openedItems) {
        const clubDuplicate = findClubDuplicate(item);
        if (!isDuplicate(item) && !clubDuplicate) continue;

        // Pack response items can arrive before Purchased cache materialization.
        if (clubDuplicate && !Number(item?.duplicateId || 0)) item.duplicateId = clubDuplicate.id;
        eaInventoryAdapter().preparePurchasedItem(item);
        responseDuplicates.push(item);
      }
      const duplicateIds = new Set(responseDuplicates.map((item) => Number(item?.id || 0)).filter(Boolean));
      const classified = classifyOpenedUpgradeDuplicates(openedItems, {
        isDuplicate: (item) => duplicateIds.has(Number(item?.id || 0)),
        isEligibleDuplicate: (item) => isRareGoldPlayer(item, { protectHighGold: true }),
        isTradeable,
      });

      if (classified.directClub.length) {
        log(`${loopDef.name}: moving ${classified.directClub.length} response-classified non-duplicate item(s) to club`);
        await moveItems(classified.directClub, inventoryPile('club'), true);
      }
      if (classified.tradeableDuplicates.length) {
        assertPileSpace('Transfer list', transferSpaceLeft(), classified.tradeableDuplicates.length);
        log(`${loopDef.name}: moving ${classified.tradeableDuplicates.length} non-crafting tradeable duplicate(s) to transfer list`);
        await moveItems(classified.tradeableDuplicates, inventoryPile('transfer'), false);
      }
      if (classified.untradeableDuplicates.length) {
        assertPileSpace('SBC storage', storageSpaceLeft(), classified.untradeableDuplicates.length);
        log(`${loopDef.name}: moving ${classified.untradeableDuplicates.length} non-crafting untradeable duplicate(s) to SBC storage`);
        await moveItems(classified.untradeableDuplicates, inventoryPile('storage'), true);
      }

      await sleep(CFG.pauseMs);
      await refreshInventoryCaches(`${loopDef.name} rare pack response routing`, { includePacks: false, quiet: true });
      const routedItems = [
        ...classified.directClub,
        ...classified.tradeableDuplicates,
        ...classified.untradeableDuplicates,
      ];
      const lowRare = classified.reservedDuplicates.length;
      const inventoryAdapter = adapters.inventory();
      const transientUnassignedSignals = classified.reservedDuplicates.map((item) =>
        inventoryAdapter.snapshotItem(item, 'unassigned')
      );
      log(`${loopDef.name}: routed rare pack response ${responseCount} item(s) (club:${classified.directClub.length}, transfer:${classified.tradeableDuplicates.length}, storage:${classified.untradeableDuplicates.length}); reserved low rare duplicates:${lowRare}`);
      return {
        reservedItems: classified.reservedDuplicates,
        routedItems,
        details: { lowRare, transientUnassignedSignals },
      };
    });
  }

  async function runReservedDuplicateCraftingStage(loopDef, upgradeDef, duplicatePredicate, label, options = {}) {
    const dryRun = loopDef.dryRun === true;
    const broadDuplicatePredicate = options.dynamicPredicate === false
      ? duplicatePredicate
      : (item) => getChallengeMaterialDefs(upgradeDef)
        .some((challengeDef) => isDuplicateForLoopRequirements(item, challengeDef));
    const workflowResult = await runReservedDuplicateCraftingWorkflow({
      maxCompletions: Number(options.maxCompletions || 100),
      forceAttempts: options.forceAttempts,
      transientSignals: options.transientUnassignedSignals,
      stopPoint: () => stopPoint(),
      planAttempt: async ({ forceAttempt, transientSignals }) => {
        await refreshInventoryCaches(`${loopDef.name} ${label} pre-selection`, { includePacks: false, quiet: true });
        const broadDuplicateCount = countUnassignedMatching(broadDuplicatePredicate) + transientSignals.length;
        if (!broadDuplicateCount && !forceAttempt) return { status: 'done', reason: 'no reserved duplicate remains' };

        const set = await findSbcSet(upgradeDef.sbcNames, upgradeDef.name || label);
        const challenges = await requestSbcChallenges(set, upgradeDef.name || label, { attempts: 3, allowEmpty: true });
        const challengeIndex = challenges.findIndex((challenge) => !isCompletedChallenge(challenge));
        if (challengeIndex < 0) {
          if (transientSignals.length) {
            fail(`${loopDef.name}: ${label} has no available challenge for ${transientSignals.length} just-opened duplicate(s)`);
          }
          return { status: 'done', reason: 'no available challenge remains' };
        }

        const challengeDef = loopChallengeDef(upgradeDef, challengeIndex + 1);
        const countNeeded = sumRequirementPlayerCount(challengeDef);
        if (countNeeded <= 0) {
          if (transientSignals.length) {
            fail(`${loopDef.name}: ${label} has no usable player requirement for ${transientSignals.length} just-opened duplicate(s)`);
          }
          return { status: 'done', reason: 'challenge has no usable player requirement' };
        }

        const activeDuplicatePredicate = options.dynamicPredicate === false
          ? duplicatePredicate
          : (item) => isDuplicateForLoopRequirements(item, challengeDef);
        const duplicateCount = countUnassignedMatching(activeDuplicatePredicate) + transientSignals.length;
        if (!duplicateCount && !forceAttempt) return { status: 'done', reason: 'no challenge-matching duplicate remains' };

        const fallbackPiles = challengeDef.priorityPiles || ['unassigned', 'storage', 'transfer', 'club'];
        const transientSignalRefs = transientSignals.map((signal) => signal.ref || signal);
        const selectionOptions = {
          transientUnassignedSignals: transientSignals,
          preferredSignalRefs: transientSignalRefs,
        };
        const duplicateOnlySelection = fallbackPiles.includes('unassigned')
          ? selectInventoryPlayers(challengeDef, ['unassigned'], selectionOptions)
          : { ok: false };
        const piles = duplicateOnlySelection.ok ? ['unassigned'] : fallbackPiles;
        const selection = selectInventoryPlayers(challengeDef, piles, selectionOptions);
        log(`${loopDef.name}: ${label} selected ${selection.selected.length}/${countNeeded} (${formatSelectionStats(selection.stats)})`);

        const repositorySignals = getUnassignedItems().filter(activeDuplicatePredicate);
        const signalById = new Map([...repositorySignals, ...transientSignals]
          .map((signal) => [Number(signal?.id || signal?.ref?.id || 0), signal])
          .filter(([id]) => id));
        const selectedSignalCount = (selection.entries || [])
          .filter((entry) => entry.pileName === 'unassigned' && entry.signal).length;
        if (transientSignals.length) {
          log(`${loopDef.name}: ${label} duplicate signal sources response:${transientSignals.length}, repository:${repositorySignals.length}, unique:${signalById.size}, selected:${selectedSignalCount}`);
        }
        const expectedSelectedSignalCount = Math.min(signalById.size, countNeeded);
        const missedTransientSignal = !selectionConsumesAllSignalRefs(selection, transientSignalRefs);
        if (selectedSignalCount < expectedSelectedSignalCount || missedTransientSignal) {
          logDuplicateSignalDiagnostics(
            `${loopDef.name} ${label}`,
            [...signalById.values()],
            selectionRequirements(challengeDef, piles)[0] || {},
            selection,
          );
        }

        if (!selection.ok) {
          const missing = selection.missing;
          log(`${loopDef.name}: ${label} missing ${missing.count} player(s) after fallback; stopping ${label}`);
          logSelectionDiagnostics(`${loopDef.name} ${label}`, selection, piles);
          if (transientSignalRefs.length) {
            fail(`${loopDef.name}: ${label} cannot consume ${transientSignalRefs.length} just-opened duplicate(s); stopping before Unassigned cleanup or another pack open`);
          }
          return { status: 'done', reason: 'inventory selection is insufficient' };
        }
        if (!selectionConsumesAllSignalRefs(selection, transientSignalRefs)) {
          fail(`${loopDef.name}: ${label} cannot resolve every just-opened duplicate to a Club/Storage submit item; stopping before another pack is opened`);
        }

        const consumedSignalRefs = (selection.entries || [])
          .filter((entry) => entry.pileName === 'unassigned' && entry.signal)
          .map((entry) => ({
            ...liveItemRef(entry.signal, 'unassigned'),
            duplicateId: Number(entry.signal?.duplicateId || entry.item?.id || 0),
          }));
        return {
          status: 'ready',
          challengeDef,
          selection,
          consumedSignalRefs,
          transientSignalRefs,
          transientSignalCount: transientSignals.length,
        };
      },
      executeAttempt: async ({ plan }) => {
        if (dryRun) {
          logDryRunSelection(`${loopDef.name} ${label}`, plan.selection);
          log(`${loopDef.name}: dry-run would submit ${label} selection`);
          return { status: 'planned', reason: `would submit ${label}` };
        }

        const submitted = await submitInventorySelection(plan.challengeDef, plan.selection, { markConsumed: true });
        if (!submitted) {
          if (plan.transientSignalCount) {
            fail(`${loopDef.name}: ${label} did not submit; preserving ${plan.transientSignalCount} just-opened duplicate(s) and stopping`);
          }
          return { status: 'done', reason: 'SBC was not submitted' };
        }
        rememberConsumedDuplicateSignals(plan.consumedSignalRefs);
        await refreshInventoryCaches(`${loopDef.name} ${label} post-submit duplicate sync`, { includePacks: false, quiet: true });
        clearConsumedDuplicateSignals(plan.consumedSignalRefs, `${loopDef.name} ${label}`);
        await sleep(CFG.pauseMs);
        return { status: 'submitted', submitted: true, transientSignals: [] };
      },
    });

    log(`${loopDef.name}: ${dryRun ? 'dry-run planned' : 'submitted'} ${workflowResult.completions} ${label} SBC(s)`);
    return workflowResult;
  }

  async function runProvisionCraftLoop(loopDef) {
    await waitAppReady();
    const dryRun = loopDef.dryRun === true;
    const rounds = Math.max(1, Math.min(50, Number(loopDef.rounds || loopDef.maxRounds || 1) || 1));
    const craftingUpgrades = getProvisionCraftingUpgrades(loopDef);
    const materialDefs = getProvisionMaterialDefs(loopDef);
    const isReservedDuplicate = (item) => materialDefs.some((def) => isDuplicateForLoopRequirements(item, def));
    const preCraftPickResults = [];
    const result = await runPackAndCraftWorkflow({
      maxPacks: rounds,
      stopPoint: () => stopPoint(),
      resume: async () => {
        if (dryRun) {
          await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
          const items = getUnassignedItems();
          log(`${loopDef.name}: dry-run only inspects current reserved duplicates; it does not open Provision Packs`);
          return { hasItems: true, itemCount: items.length, provisionHandling: {} };
        }
        await unwindSbcSquadControllers(`${loopDef.name} resume`);
        const items = await showUnassignedIfAny(`${loopDef.name} resume sync`);
        if (!items.length) return { hasItems: false };
        await refreshInventoryCaches(`${loopDef.name} resume duplicate validation`, { includePacks: false, quiet: true });
        for (const item of items) {
          if (!isReservedDuplicate(item) || findClubDuplicate(item)) continue;
          item.duplicateId = 0;
          if (item._duplicateId !== undefined) item._duplicateId = 0;
        }
        const reserved = items.filter((item) => findClubDuplicate(item) && isReservedDuplicate(item));
        const provisionHandling = {
          reservedCount: reserved.length,
          reservedItemIds: reserved.map((item) => Number(item?.id || 0)).filter(Boolean),
          reservedDefinitionIds: reserved.map((item) => Number(item?.definitionId || 0)).filter(Boolean),
        };
        log(`${loopDef.name}: resume found ${items.length} unassigned item(s), ${reserved.length} duplicate(s) matching configured stages (${provisionMaterialLabel(loopDef)})`);
        return { hasItems: true, itemCount: items.length, provisionHandling };
      },
      beforePack: async ({ result: current }) => {
        if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} round ${current.packsOpened + 1} pre-open cleanup`);
        return { status: 'ready' };
      },
      findPack: async () => findSourcePack(loopDef),
      openPack: async ({ result: current, pack }) => {
        log(`${loopDef.name}: ${dryRun ? 'dry-run would open' : `round ${current.packsOpened + 1}/${rounds} opening`} ${packName(pack)} (#${pack.id})`);
        if (dryRun) return { status: 'planned', reason: `would open ${packName(pack)}` };
        const receipt = await openPack(pack, `${loopDef.name} round ${current.packsOpened + 1}`, {
          allowGone: true,
          retryCodes: ['471', '500'],
          resolveRetryPack: () => findSourcePack(loopDef),
          openedItemPolicy: createProvisionPackPolicy(loopDef),
        });
        return receipt || { status: 'stale', reason: 'source pack stale or unavailable' };
      },
      runStages: async ({ phase, context }) => {
        const handling = phase === 'resume' ? context.provisionHandling || {} : context;
        if (dryRun) {
          if (loopDef.preCraftPlayerPickLoopId) {
            const pickDef = findLoopDefById(loopDef.preCraftPlayerPickLoopId);
            log(`${loopDef.name}: after each opened Provision Pack, live run checks ${pickDef?.name || loopDef.preCraftPlayerPickLoopId} only when an unassigned duplicate matches that Pick's configured requirements`);
          }
        } else {
          const pickResults = await runProvisionPreCraftPlayerPick(loopDef, handling);
          preCraftPickResults.push(...pickResults);
        }

        const completions = {};
        for (let index = 0; index < craftingUpgrades.length; index++) {
          const upgradeDef = craftingUpgrades[index];
          const label = `${phase === 'resume' ? 'resumed ' : ''}${upgradeDef.name}`;
          if (dryRun) {
            await runReservedDuplicateCraftingStage(
              loopDef,
              upgradeDef,
              (item) => isDuplicateForLoopRequirements(item, upgradeDef),
              label,
              { maxCompletions: 1 },
            );
            completions[`stage-${index}`] = 0;
          } else {
            const stageResult = await runReservedDuplicateCraftingStage(
              loopDef,
              upgradeDef,
              (item) => isDuplicateForLoopRequirements(item, upgradeDef),
              label,
            );
            completions[`stage-${index}`] = stageResult.completions;
          }
        }
        return { status: 'completed', completions };
      },
      afterStages: async ({ phase, result: current }) => {
        if (dryRun) return;
        await resolveRuntimeUnassigned(`${loopDef.name} ${phase === 'resume' ? 'resume' : `round ${current.packsOpened}`} cleanup`);
        if (phase === 'pack') await sleep(CFG.pauseMs);
      },
      afterStalePack: async () => {
        if (!dryRun) await sleep(CFG.pauseMs);
      },
      finalize: async () => {
        if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} final cleanup`);
      },
      onEvent: async (event, payload) => {
        if (event === 'pack-unavailable') {
          log(`${loopDef.name}: configured source pack not found; stopping at round ${payload.result.packsOpened + 1}/${rounds}`);
        }
      },
    });

    if (preCraftPickResults.length) {
      const pickDef = getLoopDefById(loopDef.preCraftPlayerPickLoopId);
      state.lastPickRecap = {
        name: pickDef.name,
        pickResults: preCraftPickResults,
        completedAt: Date.now(),
      };
      state.lastRecapType = 'pick';
      updateRecapButton();
      await showPickRecapModal(pickDef, preCraftPickResults);
    }
    const completionSummary = craftingUpgrades
      .map((upgradeDef, index) => `${upgradeDef.name}:${result.stageCompletions[`stage-${index}`] || 0}`)
      .join(', ');
    if (dryRun) {
      log(`${loopDef.name}: dry-run result ${result.status}; configured rounds:${rounds}`);
      log(`${loopDef.name}: dry run stops before opening packs, moving items, or submitting SBCs`);
    } else {
      log(`${loopDef.name}: opened ${result.packsOpened} source pack(s), submitted ${completionSummary || 'no crafting stages'}`);
    }
    return result;
  }

  async function runRarePackCraftLoop(loopDef) {
    await waitAppReady();
    const dryRun = loopDef.dryRun === true;
    const consumeAllSourcePacks = loopDef.consumeAllSourcePacks === true;
    const fillRemainingRoundsFromInventory = consumeAllSourcePacks && loopDef.useRoundsAsCompletions === true;
    const maxPacks = Math.max(1, Math.min(100, Number(loopDef.maxPacks || 100) || 100));
    const maxCompletions = Math.max(1, Math.min(100, Number(loopDef.maxCompletions || 1) || 1));
    const rareUpgradeDef = {
      ...loopDef.rareUpgrade,
      openRewardPacks: loopDef.openRewardPacks === true,
    };
    const result = await runPackAndCraftWorkflow({
      maxPacks,
      completionTarget: fillRemainingRoundsFromInventory || !consumeAllSourcePacks
        ? { id: 'rare', max: maxCompletions }
        : null,
      requireSourceExhaustion: consumeAllSourcePacks,
      stopPoint: () => stopPoint(),
      resume: async () => {
        if (dryRun) {
          await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
          const items = getUnassignedItems();
          const usable = items.filter(isLowRareGoldDuplicate);
          log(`${loopDef.name}: dry-run resume found ${items.length} unassigned item(s), ${usable.length} usable low rare duplicate(s)`);
          return { hasItems: usable.length > 0, usableCount: usable.length };
        }
        await unwindSbcSquadControllers(`${loopDef.name} resume`);
        const items = await showUnassignedIfAny(`${loopDef.name} resume sync`);
        const usable = items.filter(isLowRareGoldDuplicate);
        if (items.length) log(`${loopDef.name}: resume found ${items.length} unassigned item(s), ${usable.length} usable low rare duplicate(s)`);
        return { hasItems: usable.length > 0, usableCount: usable.length };
      },
      beforePack: async () => {
        if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} pre-open cleanup`);
        return { status: 'ready' };
      },
      findPack: async () => findSourcePack(loopDef),
      openPack: async ({ result: current, pack }) => {
        const packProgress = consumeAllSourcePacks
          ? `source pack ${current.packsOpened + 1}`
          : `${current.packsOpened + 1}/${maxPacks}`;
        log(`${loopDef.name}: ${dryRun ? 'dry-run would open' : 'opening'} ${packName(pack)} (#${pack.id}) ${packProgress}`);
        if (dryRun) return { status: 'planned', reason: `would open ${packName(pack)}` };
        const receipt = await openPack(pack, `${loopDef.name} source pack`, {
          allowGone: true,
          retryCodes: ['471', '500'],
          resolveRetryPack: () => findSourcePack(loopDef),
          openedItemPolicy: createRarePackTo84Policy(loopDef),
        });
        return receipt || { status: 'stale', reason: 'source pack stale or unavailable' };
      },
      runStages: async ({ result: current, phase, context }) => {
        const remainingCompletions = consumeAllSourcePacks
          ? null
          : Math.max(0, maxCompletions - Number(current.stageCompletions.rare || 0));
        if (remainingCompletions === 0) {
          return { status: 'completed', completions: { rare: 0 }, reason: 'completion target reached' };
        }
        if (dryRun) {
          await runReservedDuplicateCraftingStage(
            loopDef,
            rareUpgradeDef,
            isLowRareGoldDuplicate,
            `2x84+ ${phase === 'resume' ? 'resumed ' : ''}low rare gold`,
            { maxCompletions: 1 },
          );
          return { status: 'planned', completions: { rare: 0 }, reason: 'would submit 2x84+ stage' };
        }
        const stageResult = await runReservedDuplicateCraftingStage(
          loopDef,
          rareUpgradeDef,
          isLowRareGoldDuplicate,
          `2x84+ ${phase === 'resume' ? 'resumed ' : ''}low rare gold`,
          {
            maxCompletions: remainingCompletions ?? 100,
            forceAttempts: phase === 'pack' && Number(context?.lowRare || 0) > 0 ? 1 : 0,
            transientUnassignedSignals: phase === 'pack' ? context?.transientUnassignedSignals || [] : [],
          },
        );
        return { status: 'completed', completions: { rare: stageResult.completions } };
      },
      afterStages: async ({ phase }) => {
        if (dryRun) return;
        await resolveRuntimeUnassigned(`${loopDef.name} ${phase === 'resume' ? 'resume' : 'post-pack'} cleanup`);
        await sleep(CFG.pauseMs);
      },
      afterStalePack: async () => {
        if (!dryRun) await sleep(CFG.pauseMs);
      },
      onSourceExhausted: async ({ remainingCompletions }) => {
        const fallbackLoopId = String(loopDef.sourceExhaustedFallbackLoopId || '').trim();
        const requestedFallbackCompletions = fillRemainingRoundsFromInventory
          ? Number(remainingCompletions || 0)
          : (consumeAllSourcePacks
            ? Number(loopDef.sourceExhaustedFallbackMaxCompletions || 1)
            : Number(remainingCompletions || 0));
        if (fillRemainingRoundsFromInventory && requestedFallbackCompletions === 0) {
          log(`${loopDef.name}: source packs completed the requested ${maxCompletions} round(s); no inventory fallback needed`);
          return { status: 'completed', completions: { rare: 0 }, reason: null };
        }
        if (!fallbackLoopId || requestedFallbackCompletions <= 0) {
          return { status: 'unavailable', completions: { rare: 0 }, reason: 'no source-exhausted fallback configured' };
        }
        const baseFallbackDef = findLoopDefById(fallbackLoopId);
        if (!baseFallbackDef || baseFallbackDef.strategy !== 'fillAndVerifySbc') {
          fail(`${loopDef.name}: source-exhausted fallback loop not found or invalid: ${fallbackLoopId}`);
        }
        const configuredFallbackLimit = Number(loopDef.sourceExhaustedFallbackMaxCompletions || requestedFallbackCompletions);
        const fallbackCompletions = Math.max(1, Math.min(requestedFallbackCompletions, configuredFallbackLimit));
        const fallbackDef = cloneLoopDef(baseFallbackDef);
        if (loopDef.disabledPiles?.length && !fallbackDef.disabledPiles?.length) {
          fallbackDef.disabledPiles = [...loopDef.disabledPiles];
        }
        fallbackDef.dryRun = dryRun;
        fallbackDef.maxCompletions = fallbackCompletions;
        fallbackDef.allowMultipleCompletions = fallbackCompletions > 1 || fallbackDef.allowMultipleCompletions === true;
        fallbackDef.openRewardPacks = loopDef.openRewardPacks === true;
        fallbackDef.forceOpenRewardPacks = false;
        applyDisabledPiles(fallbackDef);
        log(`${loopDef.name}: no matching source pack remains; running ${fallbackDef.name} for up to ${fallbackCompletions} remaining 2x84+ completion(s)`);
        const fallbackResult = await runFillAndVerifyLoop(fallbackDef);
        const fallbackUnavailableIsExhausted = consumeAllSourcePacks
          && !fillRemainingRoundsFromInventory
          && fallbackResult.status === 'unavailable';
        return {
          status: fallbackUnavailableIsExhausted
            ? 'completed'
            : fallbackResult.status,
          completions: { rare: Number(fallbackResult.completions || 0) },
          reason: fallbackUnavailableIsExhausted ? null : (fallbackResult.reason || null),
        };
      },
      finalize: async () => {
        if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} final cleanup`);
      },
      onEvent: async (event) => {
        if (event === 'pack-unavailable') log(`${loopDef.name}: no matching rare gold source pack remains`);
      },
    });
    const rareCompletions = Number(result.stageCompletions.rare || 0);
    if (dryRun) {
      log(`${loopDef.name}: dry-run result ${result.status}`);
      log(`${loopDef.name}: dry run stops before opening packs, moving items, or submitting SBCs`);
    } else {
      const completionSummary = fillRemainingRoundsFromInventory || !consumeAllSourcePacks
        ? `${rareCompletions}/${maxCompletions}`
        : `${rareCompletions}`;
      log(`${loopDef.name}: opened ${result.packsOpened} rare gold pack(s), submitted 2x84+:${completionSummary}`);
    }
    return result;
  }

  function isPlayerPickDuplicate(item) {
    return eaPlayerPickAdapter().isOwnedDuplicate(item);
  }

  async function getPlayerPickPrices(items, loopDef) {
    const result = await loadPlayerPickPrices({
      items,
      platform: loopDef.pricePlatform,
      referer: pageRuntime.origin(),
      requestText: adapters.http.getText,
    });
    for (const attempt of result.attempts) {
      if (attempt.source === 'FUT.GG' && attempt.status === 'loaded') {
        log(`${loopDef.name}: FUT.GG prices loaded for ${result.prices.size}/${result.ids.length} Pick candidate(s)`);
      } else if (attempt.source === 'FUT.GG' && attempt.status === 'empty') {
        log(`${loopDef.name}: FUT.GG returned no usable Pick prices; trying FUTNext`);
      } else if (attempt.source === 'FUT.GG') {
        log(`${loopDef.name}: FUT.GG price lookup unavailable (${attempt.reason}); trying FUTNext`);
      } else if (attempt.source === 'FUTNext' && attempt.status === 'loaded') {
        log(`${loopDef.name}: FUTNext prices loaded for ${result.prices.size}/${result.ids.length} Pick candidate(s)`);
      } else if (attempt.source === 'FUTNext' && attempt.status === 'empty') {
        log(`${loopDef.name}: FUTNext returned no usable Pick prices; price ties require manual selection`);
      } else {
        log(`${loopDef.name}: FUTNext price lookup unavailable (${attempt.reason}); price ties require manual selection`);
      }
    }
    return result.prices;
  }

  function describePlayerPickCandidate(candidate) {
    const tags = [
      candidate.special ? 'special' : 'normal',
      candidate.duplicate ? 'duplicate' : 'new',
      candidate.price === null ? 'price:?' : `price:${candidate.price}`,
    ];
    return `${itemDisplayName(candidate.item)} rating:${candidate.rating} ${tags.join(',')}`;
  }

  function formatCompactPrice(price) {
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}m`;
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k`;
    return String(Math.round(value));
  }

  async function redeemAndSelectPlayerPick(pickItem, loopDef, options = {}) {
    log(`${loopDef.name}: redeeming ${playerPickItemName(pickItem)}`);
    const redeemed = await observeOnce(eaPlayerPickAdapter().redeem(pickItem), ctrl(), 30000, 'redeem Player Pick');
    if (!redeemed?.success) fail(`${loopDef.name}: Player Pick redeem failed: ${serviceResultErrorText(redeemed)}`);
    const data = redeemed.data || redeemed.response || {};
    const choices = (data.playerPicks || data.items || []).filter(isPlayer);
    const pickCount = Math.max(1, Number(data.availablePicks || loopDef.pickCount || 1) || 1);
    if (choices.length < pickCount) fail(`${loopDef.name}: Player Pick returned ${choices.length} candidate(s) for ${pickCount} selection(s)`);

    const maxRating = Math.max(0, ...choices.map((item) => Number(item?.rating || 0)));
    const autoPickThreshold = Math.max(1, Math.min(99, Number(loopDef.autoPickRatingThreshold || 90) || 90));
    const autoSelectBelow90 = loopDef.autoSelectBelow90 !== false && maxRating < autoPickThreshold;
    if (autoSelectBelow90) {
      log(`${loopDef.name}: all candidates rated below ${autoPickThreshold} (max ${maxRating}); keeping automatic selection while loading prices for the recap`);
    }

    await refreshInventoryCaches(`${loopDef.name} Player Pick duplicate check`, { includePacks: false, quiet: true });
    const prices = await getPlayerPickPrices(choices, loopDef);
    const pickRewardOptions = {
      isSpecial,
      isDuplicate: isPlayerPickDuplicate,
    };
    const ranked = rankPlayerPickCandidates(choices, prices, pickRewardOptions);
    ranked.forEach((candidate, index) => log(`${loopDef.name}: pick candidate ${index + 1}/${ranked.length} ${describePlayerPickCandidate(candidate)}`));

    const manualReason = autoSelectBelow90 ? '' : getManualPlayerPickReason(ranked, pickCount);
    const selected = manualReason
      ? await waitForManualPlayerPickSelection({
          dom: adapters.dom,
          ranked,
          pickCount,
          reason: manualReason,
          describeCandidate: describePlayerPickCandidate,
          scheduleStopCheck: setInterval,
          cancelStopCheck: clearInterval,
          isStopping: () => state.stopping,
        })
      : ranked.slice(0, pickCount).map((candidate) => candidate.item);
    const selectedCards = capturePlayerPickSelections(selected, ranked, pickRewardOptions);
    if (manualReason) log(`${loopDef.name}: manual Player Pick confirmed`);
    else log(`${loopDef.name}: auto-selected ${selected.map((item) => itemDisplayName(item)).join(', ')}`);

    const confirmed = await observeOnce(
      eaPlayerPickAdapter().confirmSelection(selected),
      ctrl(),
      30000,
      'confirm Player Pick selection',
    );
    if (!confirmed?.success) fail(`${loopDef.name}: Player Pick confirmation failed: ${serviceResultErrorText(confirmed)}`);
    await sleep(CFG.pauseMs);
    await refreshUnassigned({ quiet: true });
    selectedCards.forEach((card) => { card.destination = predictUnassignedDestination(card.item); });
    await resolveRuntimeUnassigned(`${loopDef.name} Player Pick result`, options.cleanupOptions || {});
    return selectedCards;
  }

  async function findUnassignedPlayerPick(loopDef, attempts = 10, options = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await refreshUnassigned({ quiet: true, attempts: 1 });
      const picks = eaPlayerPickAdapter().listUnassignedPlayerPicks();
      const pending = classifyPendingPlayerPicks(
        picks,
        loopDef.pickItemNames || [],
        loopDef.pickItemResourceIds || [],
      );
      if (pending.unexpected && options.failOnUnexpected) {
        fail(`${loopDef.name}: unrelated unassigned Player Pick detected (${playerPickItemName(pending.unexpected)}); stop without redeeming it`);
      }
      if (pending.matching) return pending.matching;
      if (attempt < attempts) await sleep(900);
    }
    if (!options.quietMissing) log(`${loopDef.name}: Player Pick reward was not found in unassigned items`);
    return null;
  }

  function saveRewardAlertEnabled(event) {
    const enabled = event?.target?.checked === true;
    try {
      persistRewardAlertSettings({ ...state.rewardAlertSettings, enabled });
      log(`Reward alerts ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      log(`Reward alert setting failed: ${error?.message || error}`);
      renderRewardAlertSummary({
        panel: document.querySelector('#bronze-loop-panel'),
        settings: state.rewardAlertSettings,
      });
    }
  }

  function loadRewardAlertSettings() {
    return normalizeRewardAlertSettings(adapters.userscriptStorage.get(REWARD_ALERT_SETTINGS_KEY, {}));
  }

  function persistRewardAlertSettings(settings) {
    state.rewardAlertSettings = normalizeRewardAlertSettings(settings);
    adapters.userscriptStorage.set(REWARD_ALERT_SETTINGS_KEY, state.rewardAlertSettings);
    renderRewardAlertSummary({
      panel: document.querySelector('#bronze-loop-panel'),
      settings: state.rewardAlertSettings,
    });
    return state.rewardAlertSettings;
  }

  function previewPackHighlight(input = {}) {
    const rating = Math.max(1, Math.min(99, Number(input.rating || input.cards?.[0]?.rating || 96) || 96));
    const cards = input.cards || [{
      id: 1,
      definitionId: 1,
      type: 'player',
      name: 'Reward Alert Preview',
      rating,
      special: true,
      duplicate: false,
      tradeable: false,
    }];
    const model = createPackHighlightModel({
      packRef: { id: 0, name: input.packName || 'Preview Pack' },
      openedItems: cards,
    }, { ...state.rewardAlertSettings, ...input.settings, enabled: true, highlightEnabled: true });
    if (!model) return false;
    return showPackHighlightToast({
      dom: adapters.dom,
      panel: document.querySelector('#bronze-loop-panel'),
      viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
      model,
      durationMs: 7000,
      schedule: setTimeout,
      cancel: clearTimeout,
      celebrate: (container, count) => triggerRewardFireworks(container, count, {
        dom: adapters.dom,
        getComputedStyle: (element) => getComputedStyle(element),
        devicePixelRatio: () => window.devicePixelRatio || 1,
        now: () => performance.now(),
        requestFrame: (callback) => requestAnimationFrame(callback),
      }),
    });
  }

  function publishPackHighlight(openedItems, context = {}) {
    const settings = state.rewardAlertSettings;
    const model = createPackHighlightModel({
      packRef: context.packRef,
      openedItems,
      details: { assumeTotwReward: context.assumeSpecialPlayers === true },
    }, settings, {
      purpose: context.purpose,
      assumeSpecialPlayers: context.assumeSpecialPlayers,
    });
    if (!model) return;
    log(`Reward highlight: ${model.cards.map((card) => `${card.name} rating:${card.rating}${card.duplicate ? ' duplicate' : ''}`).join('; ')}`);
    if (settings.highlightEnabled) previewPackHighlight({
      packName: model.pack.name,
      cards: model.cards.map((card) => ({ ...card, type: 'player' })),
      settings,
    });
    const message = formatPackHighlightNotification(model);
    if (settings.desktopEnabled) {
      void adapters.notification.desktop(message).catch((error) => {
        log(`Reward desktop notification failed: ${error?.message || error}`);
      });
    }
    if (settings.ntfyEnabled) {
      void adapters.notification.ntfy(message, {
        server: settings.ntfyServer,
        topic: settings.ntfyTopic,
        token: settings.ntfyToken,
      }).catch((error) => {
        log(`Reward ntfy notification failed: ${error?.message || error}`);
      });
    }
  }

  function openRewardAlertSettingsModal() {
    return showRewardAlertSettings({
      dom: adapters.dom,
      settings: state.rewardAlertSettings,
      onPreview: async (settings) => {
        previewPackHighlight({ rating: Math.max(96, settings.minimumRating), settings });
      },
      onTestDesktop: async (settings) => adapters.notification.desktop({
        title: 'Daily Loop Runner test',
        body: `${Math.max(96, settings.minimumRating)} special card desktop notification test`,
      }),
      onTestNtfy: async (settings) => adapters.notification.ntfy({
        title: 'Daily Loop Runner test',
        body: `${Math.max(96, settings.minimumRating)} special card ntfy notification test`,
      }, {
        server: settings.ntfyServer,
        topic: settings.ntfyTopic,
        token: settings.ntfyToken,
      }),
      onSave: async (settings) => {
        persistRewardAlertSettings(settings);
        log(`Reward alerts updated: ${settings.enabled ? `${settings.minimumRating}+ special` : 'off'}`);
      },
    });
  }

  function pendingPlayerPickQuantity(item) {
    return Math.max(
      1,
      Number(item?.stackCount || 0) || 0,
      Number(item?.untradeableCount || 0) || 0,
    );
  }

  async function listUnassignedPlayerPicksForLoop(loopDef, attempts = 1, options = {}) {
    const minimumCount = Math.max(0, Number(options.minimumCount || 0) || 0);
    let matching = [];
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await refreshUnassigned({ quiet: true, attempts: 1 });
      const partitioned = partitionPendingPlayerPicks(
        eaPlayerPickAdapter().listUnassignedPlayerPicks(),
        loopDef.pickItemNames || [],
        loopDef.pickItemResourceIds || [],
      );
      if (partitioned.unexpected.length && options.failOnUnexpected) {
        fail(`${loopDef.name}: unrelated unassigned Player Pick detected (${playerPickItemName(partitioned.unexpected[0])}); stop without redeeming it`);
      }
      matching = partitioned.matching.flatMap((item) =>
        Array.from({ length: pendingPlayerPickQuantity(item) }, () => item)
      );
      if (matching.length >= minimumCount) return matching;
      if (attempt < attempts) await sleep(900);
    }
    if (!options.quietMissing && matching.length < minimumCount) {
      log(`${loopDef.name}: found ${matching.length}/${minimumCount} expected pending Player Pick reward(s)`);
    }
    return matching;
  }

  async function reservePendingPlayerPicksDuringCleanup(loopDef, reason) {
    const matching = await listUnassignedPlayerPicksForLoop(loopDef, 1, {
      minimumCount: 0,
      quietMissing: true,
      failOnUnexpected: true,
    });
    const reservedIds = new Set(matching.map((item) => Number(item?.id || 0)).filter(Boolean));
    await resolveRuntimeUnassigned(reason, {
      reserveItem: (item) => reservedIds.has(Number(item?.id || 0)),
    });
  }

  function assertPlayerPickFodderProtection(loopDef, players) {
    const inspection = inspectSbcItems(loopDef, players, {
      expectedPlayerCount: sumRequirementPlayerCount(loopDef),
    });
    assertSbcSquadSafe(loopDef, inspection);
    if (loopDef.protectHighGold === false) return;
    const highGoldThreshold = Math.max(2, Math.min(99, Number(loopDef.pickHighGoldThreshold || 82) || 82));
    const protectedPlayers = (players || []).filter((item) =>
      isGold(item) && !isSpecial(item) && Number(item?.rating || 0) >= highGoldThreshold
    );
    if (!protectedPlayers.length) return;
    const details = protectedPlayers
      .map((item) => `${itemDisplayName(item)} rating:${Number(item?.rating || 0)}`)
      .join(', ');
    fail(`${loopDef.name}: ${highGoldThreshold}+ normal gold protection blocked SBC submission: ${details}`);
  }

  function assertSavedPlayerPickFodderProtection(loopDef, squad) {
    const savedPlayers = getSquadItems(squad);
    if (!savedPlayers.length) {
      fail(`${loopDef.name}: cannot inspect the saved squad; stop before Player Pick submission`);
    }
    assertPlayerPickFodderProtection(loopDef, savedPlayers);
  }

  function loopChallengeDef(loopDef, challengeNo) {
    const challengeRequirements = loopDef.challengeRequirements?.[Math.max(0, Number(challengeNo || 1) - 1)];
    if (!Array.isArray(challengeRequirements) || !challengeRequirements.length) return loopDef;
    return { ...loopDef, requirements: challengeRequirements };
  }

  function playerPickChallengeDef(loopDef, challengeNo) {
    return loopChallengeDef(loopDef, challengeNo);
  }

  async function submitPlayerPickChallenge(loopDef, challengeNo, challengeTotal, options = {}) {
    const challengeDef = playerPickChallengeDef(loopDef, challengeNo);
    await refreshInventoryCaches(`${loopDef.name} challenge ${challengeNo}/${challengeTotal} pre-selection`, { includePacks: false, quiet: true });
    const selection = selectInventoryPlayers(challengeDef, challengeDef.priorityPiles);
    log(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} selected ${selection.selected.length}/${sumRequirementPlayerCount(challengeDef)} player(s) (${formatSelectionStats(selection.stats)})`);
    if (!selection.ok) {
      log(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} missing ${selection.missing.count} ${selection.missing.rarity || selection.missing.tier || 'player'}(s); stopping`);
      logSelectionDiagnostics(`${loopDef.name} challenge ${challengeNo}/${challengeTotal}`, selection, challengeDef.priorityPiles);
      return { status: 'blocked', submitted: false, reason: `missing ${selection.missing.count} player(s)` };
    }
    if (options.dryRun === true) {
      logDryRunSelection(`${loopDef.name} challenge ${challengeNo} strict card ratio`, selection, {
        priorityPiles: challengeDef.priorityPiles,
      });
      return { status: 'planned', submitted: false, selection };
    }
    const label = `${loopDef.name} challenge ${challengeNo}/${challengeTotal}`;
    const attempt = await submitInventorySbcAttempt(challengeDef, selection, {
      label,
      handleReward: false,
      markConsumed: true,
      preSaveValidators: [({ players }) => {
        assertPlayerPickFodderProtection(challengeDef, players);
        return true;
      }],
      postSaveValidators: [({ challenge }) => {
        // EA may resolve duplicate signals to a different live item during save/reload.
        assertSavedPlayerPickFodderProtection(challengeDef, challenge?.squad || ctrl()?._squad);
        return true;
      }],
    });
    if (attempt.result.status === 'unavailable') {
      log(`${loopDef.name}: no available SBC challenge remains`);
      return { status: 'unavailable', submitted: false, reason: 'no available SBC challenge remains' };
    }
    if (!attempt.result.submitted) {
      log(`${label}: submit blocked: ${attempt.result.reason || attempt.result.status}`);
      return { status: 'blocked', submitted: false, reason: attempt.result.reason || attempt.result.status };
    }
    return { status: 'submitted', submitted: true, rewardPackId: attempt.result.rewardPackId };
  }

  async function runProvisionPreCraftPlayerPick(loopDef, provisionHandling = {}) {
    const pickDef = getProvisionPreCraftPickDef(loopDef);
    if (!pickDef) return [];
    const materialDefs = [
      ...getChallengeMaterialDefs(pickDef),
      ...getProvisionCraftingUpgrades(loopDef).flatMap(getChallengeMaterialDefs),
    ];
    const isReservedDuplicate = (item) => materialDefs.some((def) => isDuplicateForLoopRequirements(item, def));
    const cleanupOptions = {
      reserveItem: (item) => {
        if (!isReservedDuplicate(item)) return false;
        const clubDuplicate = findClubDuplicate(item);
        if (!clubDuplicate || state.consumedItemIds.has(Number(clubDuplicate?.id || 0))) {
          item.duplicateId = 0;
          if (item._duplicateId !== undefined) item._duplicateId = 0;
          return false;
        }
        return true;
      },
    };

    const pendingPick = await findUnassignedPlayerPick(pickDef, 1, { quietMissing: true, failOnUnexpected: true });
    if (pendingPick) {
      log(`${loopDef.name}: resolving pending ${playerPickItemName(pendingPick)} before crafting upgrades`);
      const pickedCards = await redeemAndSelectPlayerPick(pendingPick, pickDef, {
        cleanupOptions,
      });
      log(`${loopDef.name}: pending ${pickDef.name} selected; continuing original crafting flow`);
      return [{ resumed: true, pickedCards: pickedCards || [] }];
    }

    const set = await findSbcSetForLoopDef(pickDef, pickDef.name);
    if (isSbcSetComplete(set)) {
      log(`${loopDef.name}: ${pickDef.name} is already complete; continuing original crafting flow`);
      return [];
    }
    const challenges = await requestSbcChallenges(set, pickDef.name, { attempts: 3 });
    const incompleteChallenges = challenges.filter((challenge) => !isCompletedChallenge(challenge));
    if (!incompleteChallenges.length) {
      log(`${loopDef.name}: ${pickDef.name} is already complete; continuing original crafting flow`);
      return [];
    }

    const challengeTotal = challenges.length || pickDef.challengesPerPick || incompleteChallenges.length;
    const incompleteChallengeEntries = incompleteChallenges.map((challenge) => {
      const index = challenges.findIndex((candidate) => Number(candidate?.id || 0) === Number(challenge?.id || 0));
      return { challenge, challengeNo: index >= 0 ? index + 1 : null };
    });
    const firstEntry = incompleteChallengeEntries[0];
    const firstChallengeNo = firstEntry.challengeNo || 1;
    const firstChallengeDef = playerPickChallengeDef(pickDef, firstChallengeNo);
    const reservedIds = new Set((provisionHandling.reservedItemIds || []).map(Number).filter(Boolean));
    const matchingDuplicates = getUnassignedItems().filter((item) =>
      (!reservedIds.size || reservedIds.has(Number(item?.id || 0))) &&
      isDuplicateForLoopRequirements(item, firstChallengeDef)
    );
    if (!matchingDuplicates.length) {
      log(`${loopDef.name}: no unassigned duplicate matches ${pickDef.name} challenge ${firstChallengeNo} requirements; skipping the pre-craft Pick and continuing configured crafting stages`);
      return [];
    }

    const duplicateOnlySelection = selectInventoryPlayers(firstChallengeDef, ['unassigned']);
    const challengesToSubmit = incompleteChallengeEntries.length > 1 && !duplicateOnlySelection.ok
      ? incompleteChallengeEntries.slice(0, 1)
      : incompleteChallengeEntries;
    const requirementCount = sumRequirementPlayerCount(firstChallengeDef);
    log(`${loopDef.name}: ${matchingDuplicates.length} matching unassigned duplicate(s) triggered ${pickDef.name}; challenge ${firstChallengeNo} requires ${requirementCount} configured player(s), duplicate-only complete:${duplicateOnlySelection.ok ? 'yes' : 'no'}, incomplete challenges:${incompleteChallengeEntries.length}/${challengeTotal}`);
    if (challengesToSubmit.length < incompleteChallengeEntries.length) {
      log(`${loopDef.name}: current duplicates do not independently satisfy challenge ${firstChallengeNo}; completing only this challenge with duplicate -> storage -> transfer -> club and leaving later challenge(s) for another source pack`);
    } else if (incompleteChallengeEntries.length > 1) {
      log(`${loopDef.name}: current duplicates independently satisfy challenge ${firstChallengeNo}; completing all remaining challenges in order, with shortages filled by storage -> transfer -> club`);
    }

    let submittedChallenges = 0;
    for (let index = 0; index < challengesToSubmit.length; index++) {
      const challengeNo = challengesToSubmit[index].challengeNo || index + 1;
      const submission = await submitPlayerPickChallenge(
        pickDef,
        challengeNo,
        challenges.length || pickDef.challengesPerPick || incompleteChallenges.length,
      );
      if (!submission.submitted) {
        log(`${loopDef.name}: could not complete ${pickDef.name} challenge ${challengeNo}; leaving it pending and continuing original crafting flow`);
        break;
      }
      submittedChallenges++;
      await sleep(CFG.pauseMs);
    }

    if (submittedChallenges < incompleteChallenges.length) {
      const remainingChallenges = incompleteChallenges.length - submittedChallenges;
      await refreshInventoryCaches(`${loopDef.name} partial ${pickDef.name} duplicate sync`, { includePacks: false, quiet: true });
      for (const item of getUnassignedItems()) {
        const matchesPickRequirement = [pickDef.requirements, ...(pickDef.challengeRequirements || [])]
          .some((requirements) => itemMatchesLoopRequirements(item, { ...pickDef, requirements }));
        if (!matchesPickRequirement) continue;
        const clubDuplicate = findClubDuplicate(item);
        if (clubDuplicate && !state.consumedItemIds.has(Number(clubDuplicate?.id || 0))) continue;
        item.duplicateId = 0;
        if (item._duplicateId !== undefined) item._duplicateId = 0;
      }
      log(`${loopDef.name}: ${pickDef.name} remains partial with ${remainingChallenges} challenge(s) pending; a later source pack with a matching duplicate can resume it`);
      return [];
    }

    const pickItem = await findUnassignedPlayerPick(pickDef, 10, { failOnUnexpected: true });
    if (!pickItem) fail(`${loopDef.name}: ${pickDef.name} completed but its Player Pick reward was not found`);
    const pickedCards = await redeemAndSelectPlayerPick(pickItem, pickDef, {
      cleanupOptions,
    });
    log(`${loopDef.name}: ${pickDef.name} completed and selected; continuing original crafting flow`);
    return [{ resumed: false, pickedCards: pickedCards || [] }];
  }

  async function runPlayerPickLoop(loopDef) {
    await waitAppReady();
    const dryRun = loopDef.dryRun === true;
    let pickTarget = resolvePlayerPickRunTarget(loopDef);
    if (loopDef.exhaustSbcSet === true) {
      const pending = await listUnassignedPlayerPicksForLoop(loopDef, 1, {
        minimumCount: 0,
        quietMissing: true,
        failOnUnexpected: true,
      });
      const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
      const remainingCompletions = getDailySetRemaining(set);
      pickTarget = resolvePlayerPickRunTarget(loopDef, {
        pendingCount: pending.length,
        remainingCompletions,
      });
      const remainingLabel = pickTarget.usedSafetyLimit
        ? `unknown; running until unavailable (safety cap ${pickTarget.remainingCompletions})`
        : `${pickTarget.remainingCompletions}`;
      log(`${loopDef.name}: limited Set progress completed:${Number.isFinite(Number(set?.timesCompleted)) ? set.timesCompleted : '?'}, repeats:${Number.isFinite(Number(set?.repeats)) ? set.repeats : '?'}, remaining:${remainingLabel}; pending Pick(s):${pickTarget.pendingCount}`);
    }
    const maxPicks = dryRun && loopDef.exhaustSbcSet === true
      ? pickTarget.remainingCompletions
      : pickTarget.maxPicks;
    const challengesPerPick = getPlayerPickChallengeCount(loopDef);
    const openPicksAtEnd = !dryRun && loopDef.openPicksAtEnd === true;
    if (!maxPicks) {
      if (dryRun && pickTarget.pendingCount) {
        log(`${loopDef.name}: dry-run found ${pickTarget.pendingCount} pending Pick(s), but the SBC Set has no remaining completion`);
      } else {
        log(`${loopDef.name}: no pending Pick and the SBC Set is complete`);
      }
      return {
        status: 'completed',
        picksCompleted: 0,
        challengesSubmitted: 0,
        challengesPlanned: 0,
        picksQueued: 0,
        pickResults: [],
        reason: null,
      };
    }
    if (openPicksAtEnd) {
      const targetLabel = loopDef.exhaustSbcSet === true ? 'all available' : `up to ${maxPicks}`;
      log(`${loopDef.name}: batch Pick mode enabled; complete ${targetLabel} Pick(s), then open matching rewards together`);
    }
    const result = await runPlayerPickWorkflow({
      maxPicks,
      openPicksAtEnd,
      completeWhenNoChallengeRemains: loopDef.exhaustSbcSet === true,
      stopPoint: () => stopPoint(),
      findPendingPick: async () => {
        const pending = await findUnassignedPlayerPick(loopDef, 1, { quietMissing: true, failOnUnexpected: true });
        if (pending && !dryRun) log(`${loopDef.name}: resuming pending ${playerPickItemName(pending)}`);
        if (pending && dryRun) log(`${loopDef.name}: dry-run found pending ${playerPickItemName(pending)}; live run would resolve it before submitting another SBC`);
        return dryRun ? null : pending;
      },
      redeemPick: async ({ pickItem, resumed }) => {
        if (dryRun) return { status: 'planned', reason: 'would redeem Player Pick' };
        const pickedCards = await redeemAndSelectPlayerPick(pickItem, loopDef, openPicksAtEnd ? {
          cleanupOptions: {
            reserveItem: (item) => playerPickMatchesReward(
              item,
              loopDef.pickItemNames || [],
              loopDef.pickItemResourceIds || [],
            ),
          },
        } : {});
        if (resumed) log(`${loopDef.name}: resumed Player Pick selected`);
        return { status: 'selected', pickedCards: pickedCards || [] };
      },
      beforePick: async ({ result: current }) => {
        if (!dryRun && openPicksAtEnd) {
          await reservePendingPlayerPicksDuringCleanup(
            loopDef,
            `${loopDef.name} queued pick ${current.picksQueued + 1} pre-submit cleanup`,
          );
        } else if (!dryRun) {
          await resolveRuntimeUnassigned(`${loopDef.name} pick ${current.picksCompleted + 1} pre-submit cleanup`);
        }
        return { status: 'ready' };
      },
      loadChallenges: async () => {
        if (dryRun) await refreshInventoryCaches(`${loopDef.name} dry-run`, { includePacks: false, quiet: true });
        const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
        const challenges = await requestSbcChallenges(set, loopDef.name, { attempts: 3 });
        if (dryRun) {
          log(`${loopDef.name}: dry-run SBC found ${set.name} (#${set.id || '?'})`);
          log(`${loopDef.name}: dry-run requires ${challengesPerPick} challenge(s) per Pick and selects ${loopDef.pickCount || 1} player(s) from each reward`);
        }
        return {
          set,
          challenges,
          incomplete: challenges
            .map((challenge, index) => ({ challenge, challengeNo: index + 1 }))
            .filter(({ challenge }) => !isCompletedChallenge(challenge)),
        };
      },
      submitChallenge: async ({ challengeContext, entry }) => submitPlayerPickChallenge(
        loopDef,
        entry.challengeNo,
        challengeContext.challenges.length || challengesPerPick,
        { dryRun },
      ),
      afterChallenge: async () => {
        if (!dryRun) await sleep(CFG.pauseMs);
      },
      findRewardPick: async () => dryRun
        ? null
        : findUnassignedPlayerPick(loopDef, 10, { failOnUnexpected: true }),
      listPendingPicks: async ({ minimumCount, phase }) => listUnassignedPlayerPicksForLoop(
        loopDef,
        phase === 'initial' ? 1 : 10,
        {
          minimumCount,
          quietMissing: phase === 'initial',
          failOnUnexpected: true,
        },
      ),
      onEvent: async (event, payload) => {
        if (event === 'queue') {
          log(`${loopDef.name}: queued ${payload.queuedCount}/${maxPicks} matching Player Pick reward(s)`);
        } else if (event === 'batch-open') {
          log(`${loopDef.name}: submission phase ended; opening ${payload.queuedCount} queued Player Pick reward(s)`);
        }
      },
      afterPick: async ({ result: current, resumed }) => {
        if (resumed) {
          const targetLabel = loopDef.exhaustSbcSet === true ? 'available Pick(s)' : `${maxPicks} requested completion(s)`;
          log(`${loopDef.name}: resumed Player Pick ${current.picksCompleted}/${maxPicks} ${targetLabel}`);
        }
        if (!dryRun) await sleep(CFG.pauseMs);
      },
    });
    if (dryRun) {
      log(`${loopDef.name}: dry-run planned ${result.challengesPlanned} challenge(s)`);
      log(`${loopDef.name}: dry run stops before submitting SBCs, redeeming Picks, or moving items`);
    } else {
      const targetLabel = loopDef.exhaustSbcSet === true ? 'available' : 'requested';
      log(`${loopDef.name}: completed ${result.picksCompleted}/${maxPicks} ${targetLabel} Player Pick(s)${openPicksAtEnd ? `; queued ${result.picksQueued}` : ''}`);
    }
    return result;
  }

  function showPickRecapModal(loopDef, pickResults) {
    return showPlayerPickRecap({
      dom: adapters.dom,
      name: loopDef?.name,
      pickResults,
      itemDisplayName,
      formatPrice: formatCompactPrice,
      scheduleStopCheck: setInterval,
      cancelStopCheck: clearInterval,
      isStopping: () => state.stopping,
      onClose: () => {
        const recapButton = document.querySelector('#bronze-loop-recap-reopen');
        if (recapButton) {
          recapButton.textContent = 'View recap';
          recapButton.style.background = '';
        }
      },
      celebrate: (dialog, specialCount) => triggerRewardFireworks(dialog, specialCount, {
        dom: adapters.dom,
        getComputedStyle: (element) => getComputedStyle(element),
        devicePixelRatio: () => window.devicePixelRatio || 1,
        now: () => performance.now(),
        requestFrame: (callback) => requestAnimationFrame(callback),
      }),
    });
  }

  function showBatchRecapModal(model) {
    return showBatchOpenRecap({
      dom: adapters.dom,
      model,
      formatPrice: formatCompactPrice,
      onClose: () => {
        const recapButton = document.querySelector('#bronze-loop-recap-reopen');
        if (recapButton) {
          recapButton.textContent = 'View recap';
          recapButton.style.background = '';
        }
      },
      celebrate: (dialog, specialCount) => triggerRewardFireworks(dialog, specialCount, {
        dom: adapters.dom,
        getComputedStyle: (element) => getComputedStyle(element),
        devicePixelRatio: () => window.devicePixelRatio || 1,
        now: () => performance.now(),
        requestFrame: (callback) => requestAnimationFrame(callback),
      }),
    });
  }

  function previewBatchOpenRecap() {
    return showBatchRecapModal(createBatchOpenRecapPreviewModel());
  }

  async function getBatchOpenSpecialPrices(items) {
    const specialItems = (items || []).filter((item) => item?.special === true || Number(item?.rareflag ?? item?.rareFlag ?? 0) > 1);
    if (!specialItems.length) return new Map();
    let result;
    try {
      result = await loadPlayerPickPrices({
        items: specialItems,
        platform: 'pc',
        referer: pageRuntime.origin(),
        requestText: adapters.http.getText,
      });
    } catch (error) {
      log(`Batch Open: special card price lookup failed (${error?.message || error}); recap will show price:?`);
      return new Map();
    }
    for (const attempt of result.attempts) {
      if (attempt.status === 'loaded') {
        log(`Batch Open: ${attempt.source} prices loaded for ${result.prices.size}/${result.ids.length} special card(s)`);
      } else if (attempt.source === 'FUT.GG') {
        log(`Batch Open: FUT.GG price lookup ${attempt.status}${attempt.reason ? ` (${attempt.reason})` : ''}; trying FUTNext`);
      } else {
        log(`Batch Open: FUTNext price lookup ${attempt.status}${attempt.reason ? ` (${attempt.reason})` : ''}; unavailable prices will show as ?`);
      }
    }
    return result.prices;
  }

  function loadBatchOpenPlan() {
    try {
      return normalizeBatchOpenPlan(adapters.localStorage.getJson(BATCH_OPEN_PLAN_KEY, {}));
    } catch {
      return normalizeBatchOpenPlan();
    }
  }

  function persistBatchOpenPlan(plan) {
    const normalized = normalizeBatchOpenPlan(plan);
    adapters.localStorage.setJson(BATCH_OPEN_PLAN_KEY, normalized);
    return normalized;
  }

  async function executeBatchOpen(planInput) {
    if (state.running) return null;
    const plan = persistBatchOpenPlan(planInput);
    state.running = true;
    state.stopping = false;
    setPanelState();
    let result = null;
    let recapModel = null;
    try {
      const requested = plan.entries.reduce((sum, entry) => sum + entry.quantity, 0);
      log(`Batch Open: starting ${requested} requested pack(s) across ${plan.entries.length} pack type(s)`);
      result = await runBatchOpenWorkflow({
        plan,
        shouldStop: () => state.stopping,
        beforeStart: async () => resolveRuntimeUnassigned('Batch Open preflight', {
          blockedPolicy: 'preserve',
          enableRecovery: true,
        }),
        resolvePack: async (entry) => {
          const pack = entry.packId ? findPackById(entry.packId) : findPackByName([entry.packName]);
          if (pack) return pack;
          await refreshStorePacks().catch(() => null);
          return entry.packId ? findPackById(entry.packId) : findPackByName([entry.packName]);
        },
        openPack: async ({ entry, pack, openIndex }) => await openPack(
          pack,
          `Batch Open ${entry.packName || `#${entry.packId}`} ${openIndex + 1}/${entry.quantity}`,
          {
            allowGone: true,
            retryCodes: ['471', '500'],
            resolveRetryPack: async () => {
              await refreshStorePacks().catch(() => null);
              return entry.packId ? findPackById(entry.packId) : findPackByName([entry.packName]);
            },
            openedItemPolicy: createMaterializeAndResolvePolicy(
              `Batch Open ${entry.packName || `#${entry.packId}`}`,
              `Batch Open ${entry.packName || `#${entry.packId}`} cleanup`,
              { blockedPolicy: 'preserve', enableRecovery: true },
            ),
          },
        ),
        onEvent: async (event, payload) => {
          if (event === 'opened') {
            log(`Batch Open: ${payload.packsOpened}/${payload.requestedPacks} pack(s) opened`);
          } else if (event === 'unavailable') {
            log(`Batch Open: ${payload.entry.packName || `#${payload.entry.packId}`} unavailable; skipped ${payload.remaining} requested pack(s)`);
          } else if (event === 'preserved') {
            log(`Batch Open: Unassigned items were preserved after ${payload.entry.packName || `#${payload.entry.packId}`}; stopping before ${payload.remaining} remaining pack(s) in this type`);
          } else if (event === 'preflight-preserved') {
            log(`Batch Open: existing Unassigned items cannot be safely resolved (${payload.preflight.reason || 'capacity blocked'}); no pack will be opened`);
          }
        },
      });
      const prices = await getBatchOpenSpecialPrices(result.openedItems);
      recapModel = createBatchOpenRecapModel({ ...result, prices });
      state.lastBatchRecap = { model: recapModel, completedAt: Date.now() };
      state.lastRecapType = 'batch';
      log(`Batch Open: ${result.status}; opened ${result.packsOpened}/${result.requestedPacks}, skipped ${result.skippedPacks}`);
      updateRecapButton();
      return recapModel;
    } catch (error) {
      log(`Batch Open stopped: ${error?.message || error}`);
      errorStackLines(error).forEach((line) => log(`Error stack: ${line}`));
      console.error('[BronzeLoop]', error);
      if (result) {
        recapModel = createBatchOpenRecapModel({ ...result, status: 'blocked', reason: error?.message || error });
        state.lastBatchRecap = { model: recapModel, completedAt: Date.now() };
        state.lastRecapType = 'batch';
        updateRecapButton();
      }
      return null;
    } finally {
      state.running = false;
      state.stopping = false;
      setPanelState();
      if (recapModel) void showBatchRecapModal(recapModel);
    }
  }

  async function openBatchOpenDialogModal() {
    if (state.running || state.refreshing) return false;
    state.refreshing = true;
    setPanelState();
    log('Batch Open: scanning My Packs');
    try {
      await refreshStorePacks();
    } catch (error) {
      log(`Batch Open: pack scan refresh failed; using current cache (${error?.message || error})`);
    } finally {
      state.refreshing = false;
      setPanelState();
    }
    showBatchOpenDialog({
      dom: adapters.dom,
      plan: loadBatchOpenPlan(),
      snapshot: getPackInventorySnapshot(),
      onScan: async () => {
        await refreshStorePacks();
        return getPackInventorySnapshot();
      },
      onPreview: () => previewBatchOpenRecap(),
      onPlanChange: (plan) => persistBatchOpenPlan(plan),
      onStart: (plan) => {
        persistBatchOpenPlan(plan);
        void executeBatchOpen(plan);
      },
    });
    return true;
  }

  async function runValidationBronzeUpgrade(loopDef, roundNo) {
    const dryRun = loopDef.dryRun === true;
    log(`Round ${roundNo} ${dryRun ? 'dry-run ' : ''}start`);
    await waitAppReady();
    const result = await runValidationRoundWorkflow({
      dryRun,
      inspectSourcePack: async () => {
        const pack = await findValidationSourcePack(loopDef);
        if (dryRun) log(`${loopDef.name}: dry-run source pack ${pack ? `${packName(pack)} (#${pack.id})` : 'not found'}`);
        return pack;
      },
      inspectSbc: async () => {
        const set = await findSbcSet(loopDef.sbcNames || CFG.bronzeUpgradeNames, loopDef.name);
        const challenge = await findAvailableSbcChallenge(set, loopDef.name);
        if (!challenge) return null;
        if (dryRun) log(`${loopDef.name}: dry-run SBC found ${set.name} (#${set.id || '?'}) challenge #${challenge.id || '?'}`);
        return { set, challenge };
      },
      openSourcePack: async ({ sourcePack }) => {
        const receipt = await openSourceBronzePack(loopDef, sourcePack);
        return receipt || { status: 'unavailable', reason: 'source pack unavailable after refresh' };
      },
      submitSbc: async ({ sbc }) => {
        await openSbcSet(sbc.set, { challenge: sbc.challenge });
        await fillBronzeUpgradeSquad();
        const rewardPackId = await submitSbcAndGetAwardPackId(sbc.set);
        log(`Reward pack id: ${rewardPackId || 'unknown'}`);
        return { status: 'submitted', submitted: true, rewardPackId };
      },
      openReward: async ({ rewardPackId }) => {
        await openRewardSilverPack(rewardPackId);
        return { status: 'opened' };
      },
      finalize: async (workflowResult) => {
        if (dryRun) {
          log(`${loopDef.name}: dry run stops before opening packs, filling squads, or submitting SBCs`);
          return;
        }
        if (workflowResult.status !== 'completed') return;
        const remaining = await showUnassignedIfAny(`round ${roundNo} end`);
        if (remaining.length) fail(`Round ended with ${remaining.length} unassigned item(s); stop for manual inspection`);
        log(`Round ${roundNo} done`);
      },
    });
    if (!dryRun && result.status !== 'completed') {
      fail(`${loopDef.name}: validation round ${result.status}: ${result.reason || 'unknown'}`);
    }
    return result;
  }

  async function runConfiguredLoop(loopDef, roundNo = 1) {
    state.loopStack.push(loopDef);
    try {
      return await dispatchConfiguredWorkflow({
        loopDef,
        roundNo,
        log,
        runners: {
          validationBronzeUpgrade: runValidationBronzeUpgrade,
          dailyRoutine: runDailySequence,
          dailySingleCardRecycle: runRecycleLoop,
          supplyAndCraft: runSupplyAndCraftLoop,
          provisionPackCrafting: runProvisionCraftLoop,
          rarePackTo84Upgrade: runRarePackCraftLoop,
          playerPickSbc: runPlayerPickLoop,
          fillAndVerifySbc: runFillAndVerifyLoop,
        },
        afterStandardRun: async (definition) => {
          await showUnassignedIfAny(`${definition.name} end`);
        },
        afterPlayerPickRun: async (definition, result) => {
          const pickResults = result.pickResults || [];
          state.lastPickRecap = {
            name: definition.name,
            pickResults,
            completedAt: Date.now(),
          };
          state.lastRecapType = 'pick';
          updateRecapButton();
          await showPickRecapModal(definition, pickResults);
          await showUnassignedIfAny(`${definition.name} end`);
        },
      });
    } finally {
      state.loopStack.pop();
    }
  }

  function getLiveRunLimit(loopDef, rounds) {
    return getLiveRunLimitPure(loopDef, rounds, {
      needsAutoTotwPreflight,
      getRoutineSteps: getRoutineStepLoopDefs,
    });
  }

  async function startLoop() {
    if (state.running) return;
    let loopDef = null;
    let rounds = CFG.maxRounds;

    try {
      loopDef = getSelectedLoopDef();
      const input = document.querySelector('#bronze-loop-rounds');
      rounds = Math.max(1, Math.min(50, Number(input?.value || CFG.maxRounds) || CFG.maxRounds));
      applyLoopRuntimeOptions(loopDef, {
        rounds,
        dryRun: isDryRunEnabled(),
        openRewardPacks: isOpenRewardPacksEnabled(),
        pickOptions: getPickRuntimeOptions(),
      });
      logFsuSettingsForRun();
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
    renderMainPanelRuntimeState({
      panel: document.querySelector('#bronze-loop-panel'),
        state: {
          running: state.running,
          refreshing: state.refreshing,
          scanningPicks: state.scanningPicks,
          loadingLoops: state.loadingLoops,
        usingBuiltIn: state.loopConfigSource === 'built-in',
      },
    });
    updateLoopControls();
  }

  function installPanel() {
    const mounted = mountMainPanel({
      dom: adapters.dom,
      maxRounds: CFG.maxRounds,
      startupHidden: true,
    });
    if (!mounted.created) return;
    const { panel } = mounted;
    state.logRenderer = createLogRenderer({
      getLines: () => state.logLines,
      getPanel: () => document.querySelector('#bronze-loop-panel'),
      getLatestBox: () => document.querySelector('#bronze-loop-latest'),
      getFullBox: () => document.querySelector('#bronze-loop-log'),
      formatFullLog: (lines) => formatLogHtml(lines, escapeHtml),
    });
    const savedLoopUiOptions = loadLoopUiOptions();
    state.showMvpLoops = savedLoopUiOptions.showMvpLoops;
    const savedPickOptions = loadPickRuntimeOptions();
    state.rewardAlertSettings = loadRewardAlertSettings();
    hydrateMainPanelOptions({
      panel,
      loopOptions: savedLoopUiOptions,
      pickOptions: savedPickOptions,
      rewardAlertSettings: state.rewardAlertSettings,
    });
    renderRewardAlertSummary({ panel, settings: state.rewardAlertSettings });
    createMainPanelGeometry({
      panel,
      getViewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
      loadPosition: () => {
        try { return adapters.localStorage.getJson('fc-loop-panel-pos', null); } catch { return null; }
      },
      savePosition: (position) => {
        try { adapters.localStorage.setJson('fc-loop-panel-pos', position); } catch { }
      },
      onModeChange: renderLog,
    });
    renderLoopSelect();
    renderLog();
    const panelCommands = createMainPanelCommands({
      state,
      log,
      setPanelState,
      getLoopDefById,
      setLoopJson,
      updateLoopControls,
      savePickOptions: savePickRuntimeOptions,
      saveLoopOptions: saveLoopUiOptions,
      saveRewardAlertEnabled,
      openRewardAlertSettings: openRewardAlertSettingsModal,
      start: startLoop,
      openBatch: openBatchOpenDialogModal,
      reopenRecap: reopenLastRecap,
      refreshInventoryCaches,
      scanPlayerPicks: scanAvailablePlayerPickSbcs,
      loopConfigUrl: LOOP_CONFIG_URL,
      loadLoopConfig,
      resetLoopDefs,
      userEffects: adapters.userEffects,
      getLogText: () => state.logLines.join('\n'),
      clearLog,
      now: Date.now,
    });
    bindMainPanelCommands({
      panel,
      commands: panelCommands,
    });
    updateRecapButton();
    log(`Ready v${W[APP_KEY]?.version || 'unknown'}. Keep FSU/Enhancer enabled before starting.`);
    setTimeout(async () => {
      try {
        await panelCommands.scanPicks();
      } finally {
        setMainPanelStartupHidden(panel, false);
      }
    }, 900);
  }

  state.bootTimer = setInterval(() => {
    if (document.body && isFutAppReady()) {
      clearInterval(state.bootTimer);
      state.bootTimer = null;
      installPanel();
    }
  }, 500);
})();
