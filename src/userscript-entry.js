// ==UserScript==
// @name         FC26 Daily Loop Runner
// @namespace    https://github.com/ShatteredLancer/DailyLoopRunner
// @version      __DLR_VERSION__
// @description  Automates configurable SBC, pack, Unassigned and Player Pick workflows in the EA FC Web App.
// @homepageURL  https://github.com/ShatteredLancer/DailyLoopRunner
// @supportURL   https://github.com/ShatteredLancer/DailyLoopRunner/issues
// @updateURL    https://github.com/ShatteredLancer/DailyLoopRunner/releases/latest/download/DailyLoopRunner.meta.js
// @downloadURL  https://github.com/ShatteredLancer/DailyLoopRunner/releases/latest/download/DailyLoopRunner.user.js
// @license      MIT
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.easports.com/*/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      www.fut.gg
// @connect      www.futbin.org
// @connect      enhancer-api.futnext.com
// @connect      rest.futnext.com
// @connect      ntfy.sh
// @run-at       document-end
// ==/UserScript==

import packageInfo from '../package.json' with { type: 'json' };
import {
  APP_KEY,
  BATCH_OPEN_PLAN_KEY,
  BUILDER_PROFILE_KEY,
  CFG,
  DYNAMIC_SBC_CACHE_KEY,
  FUTBIN_CARD_ID_CACHE_KEY,
  FSU_COMPAT_DEFAULTS,
  LOOP_UI_OPTIONS_KEY,
  PICK_OPTIONS_KEY,
  REWARD_ALERT_SETTINGS_KEY,
  SBC_FODDER_OPTIONS_KEY,
  TRADE_CIRCUIT_KEY,
  TRADE_BUY_JOURNAL_KEY,
  TRADE_LISTING_JOURNAL_KEY,
  TRADE_BULK_RELIST_JOURNAL_KEY,
  TRADE_JOB_STORE_KEY,
  TRADE_PLAYER_CATALOG_CACHE_KEY,
  TRADE_REQUEST_PACING_KEY,
  TRADE_RECOVERY_AUDIT_KEY,
  TRADE_RUN_LEASE_KEY,
} from './config/runtime.js';
import { LOOP_DEFS } from './config/loops.js';
import {
  createSingleCardSelectionRequirement,
  selectionRequirements,
} from './config/selection.js';
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
import { resolveSessionLoopByActivityFamily } from './config/session-loops.js';
import {
  applyLoopRuntimeOptions,
  applyPickRuntimeOptions,
  assertRollingRuntimePreflight,
  loopUsesRounds,
  normalizePickRuntimeOptions,
  resolveRuntimeQuantity,
  shouldAutoSelectPlayerPick,
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
import {
  DEFAULT_SBC_FODDER_POLICY,
  effectiveNormalGoldMaxRating,
  effectiveSbcFodderPolicy,
  normalizeSbcFodderPolicy,
} from './config/sbc-fodder-policy.js';
import { materializeBatchOpenPlan, normalizeBatchOpenPlan } from './config/batch-open.js';
import {
  buildPlayerPickDiscoverySession,
  classifyPlayerPickRepeatability,
  collectScannedPlayerPickLoopDefs,
  parsePlayerPickSbcSnapshot,
  resolvePlayerPickLoopReference,
  resolvePlayerPickLoopSelector,
} from './config/player-pick-discovery.js';
import {
  buildUpgradeDiscoverySession,
  collectScannedUpgradeActivities,
  detectDynamicUpgradeFamily,
  materializeDynamicUpgradeChallengeLoopDef,
  parseDynamicUpgradeSbcSnapshot,
} from './config/upgrade-discovery.js';
import {
  applyRollingAutomaticUseFodderPolicy,
  bindRollingPlayerPickCapabilities,
  buildRollingStorageSinkCatalog,
  ROLLING_PROVISIONS_RATING_RANGE,
  ROLLING_STORAGE_SINK_MIN_CHALLENGE_RATING,
  resolveRollingAutomaticUseMaxRating,
  resolveRollingProvisionsReserveRatings,
  shouldQueueRollingProvisionsReward,
} from './config/rolling-upgrade.js';
import {
  buildActivityBindingSession,
  collectActivityBindingSbcNames,
  parseBasicUpgradeActivitySnapshot,
} from './config/activity-discovery.js';
import {
  createTotwUpgradePolicy,
  createTwoBy84UpgradePolicy,
} from './config/upgrade-policies.js';
import { MATERIAL_SINK_BASELINES } from './config/material-sink.js';
import { findSbcSetByPreferredId } from './sbc/set-identity.js';
import {
  DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
  RECOVERY_RECIPES,
  UNASSIGNED_RECOVERY_POLICIES,
} from './config/recovery.js';
import { cloneLoopDef, isPlainObject } from './domain/objects.js';
import { calculateEaSquadRating } from './domain/rating.js';
import { createRuntimeAdapters } from './adapters/index.js';
import { emitDiagnostic } from './diagnostics/safe-log.js';
import { createItemSnapshot } from './domain/contracts.js';
import { createInventoryLedgerCoordinator } from './inventory/ledger-coordinator.js';
import { createInventoryCapabilityCalculator } from './inventory/capabilities.js';
import {
  classifyRollingInventoryItem,
  createRollingPrimarySelectionPolicy,
  createRollingRatingRecoverySelectionPolicy,
  createRollingRecoveryProtection,
  createRollingRequiredSpecialSourceFilter,
  diagnoseRollingInventoryRefs,
  planRollingStorageMaintenance,
  planRollingOpenedItemRouting,
  releaseRollingPrimaryDuplicateRefs,
  releaseRollingRoutingItemsAfterConsumption,
  rollingDuplicateTargetProtectionReasons,
  rollingPrimaryDuplicateProtectionConflicts,
  rollingPrimaryDuplicateRelaxationOrder,
  validateRollingPrimaryDuplicateIdentity,
} from './inventory/rolling-policy.js';
import { runtimeGoldConsumptionMode } from './domain/gold-consumption.js';
import {
  isPlayerEvolutionCard,
  isSamePlayerCardVersion,
  isRarePlayerCard,
  isSpecialPlayerCard,
  readPlayerDatabaseId,
  readPlayerRareFlag,
} from './domain/player-rarity.js';
import { selectInventoryPlayers as selectInventoryPlayersPure } from './selection/index.js';
import {
  buildRatingCandidateEntries,
  finalizeRequiredCandidateDiagnostics,
  selectRatingCandidateEntries,
} from './selection/rating-candidates.js';
import {
  genericStorageSinkSquadSourceStrategy,
  nextGenericStorageSinkContext,
  nextStorageSinkContext,
  planMultiSquadRatingSelections,
  prepareStorageSink89Candidates,
  prepareGenericStorageSinkCandidates,
  selectStorageSinkClubFallbackEntries,
  storageSinkRequiredSpecialRoles,
  STORAGE_SINK_MAX_CLUB_FILL_PER_SQUAD,
  storageSinkSquadSourceStrategy,
  validateStorageRecoveryHeadroom,
  validateStorageSinkHeadroom,
} from './selection/multi-squad-rating.js';
import {
  parseRatingSbcChallenge as parseRatingSbcChallengePure,
  validateRatingSbcModelAgainstItems as validateRatingSbcModelAgainstItemsPure,
} from './selection/rating-model.js';
import {
  evaluateUnassignedSignalCoverage,
  mergeTransientUnassignedSignals,
  selectedUnassignedSignalRefs,
  selectionConsumesAllSignalRefs,
  submittedUnassignedSignalRefs,
} from './selection/transient-signals.js';
import {
  createExistingSquadProvider,
  createFsuFillProvider,
  createInventorySquadProvider,
  submitSbcAttempt,
} from './sbc/submit-attempt.js';
import { prepareFsuProvisionalClubAccess } from './sbc/fsu-runtime-access.js';
import {
  isSbcControllerName,
  synchronizeAfterSbcSubmit,
  unwindSbcSquadControllers as unwindSbcSquadControllersShared,
} from './sbc/navigation-sync.js';
import {
  dynamicSbcLoadErrorCode,
  normalizeDynamicSbcCache,
  normalizeDynamicSbcScanHealth,
  scanDynamicSbcSnapshots,
  updateDynamicSbcScanHealth,
} from './sbc/dynamic-sbc-cache.js';
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
import { createPlayerCatalogProvider } from './trade/player-catalog.js';
import { createPriceQuoteProvider } from './trade/price-quotes.js';
import { createListingPreparation } from './trade/listing-preparation.js';
import { createListingPreview } from './trade/listing-preview.js';
import { createListingTransaction } from './trade/listing-transaction.js';
import { createTradeListingDiagnostics } from './trade/listing-diagnostics.js';
import { createBulkRelistPreview } from './trade/bulk-relist-preview.js';
import { createTradeBulkRelistJournal } from './trade/bulk-relist-journal.js';
import { createGuardedManualBulkRelistExecutor } from './trade/guarded-manual-bulk-relist.js';
import { createGuardedScheduledBulkRelistExecutor } from './trade/guarded-scheduled-bulk-relist.js';
import { createBulkRelistDiagnostics } from './trade/bulk-relist-diagnostics.js';
import { createBuyPreview } from './trade/buy-preview.js';
import { createTradeBuyDiagnostics, sanitizeTradeBuyReceipt } from './trade/buy-diagnostics.js';
import { exportTradeJobConfigJson, parseTradeJobConfig } from './trade/job-config.js';
import { createGuardedManualBuyExecutor } from './trade/guarded-manual-buy.js';
import { createGuardedScheduledBuyExecutor } from './trade/guarded-scheduled-buy.js';
import {
  selectGuardedScheduledTradeJob,
  summarizeGuardedScheduledTradeSelection,
} from './trade/guarded-scheduled-job.js';
import { createTradeCircuitBreaker } from './trade/circuit-breaker.js';
import { createTradeJobStore } from './trade/job-store.js';
import { createTradeRunLease } from './trade/run-lease.js';
import { createTradeRequestPacer } from './trade/request-pacing.js';
import { stageExpiredTradeLeaseValidation } from './trade/expired-lease-validation.js';
import { requireExpiredLeaseValidationJob } from './trade/expired-lease-validation-policy.js';
import { createOperationCoordinator } from './trade/operation-coordinator.js';
import { createTradeScheduler } from './trade/scheduler.js';
import {
  createTradeSchedulerEventLog,
  summarizeTradeSchedulerRuntime,
} from './trade/scheduler-events.js';
import { createTradeSchedulerWakeups } from './trade/scheduler-wakeups.js';
import { createTradeSchedulerTickLock } from './trade/scheduler-tick-lock.js';
import { createTradeChunkCoordinator } from './trade/chunk-coordinator.js';
import { inspectTradeScheduleAuthorization } from './trade/schedule-authorization.js';
import {
  createGuardedScheduledListingExecutor,
  guardedTradeSessionReadiness,
} from './trade/guarded-scheduled-listing.js';
import {
  createPackHighlightModel,
  formatPackHighlightNotification,
  normalizeRewardAlertSettings,
} from './reward/pack-highlight.js';
import {
  createBatchOpenRecapModel,
  createBatchOpenRecapPreviewModel,
} from './reward/batch-open-recap.js';
import {
  createLoopRecapModel,
  hasRecapRareGoldOrAbove,
} from './reward/loop-recap.js';
import {
  createRollingRecapAggregator,
  createRollingRecapModel,
} from './reward/rolling-recap.js';
import { resolveFutbinCardIds } from './reward/futbin-card-id.js';
import { hasPlayerPickRecapCards } from './reward/player-pick-recap.js';
import { resolveUnassigned } from './unassigned/resolve.js';
import { materializeFreshUnassigned } from './unassigned/fresh-materialization.js';
import { recoverRuntimeUnassignedNavigation } from './unassigned/runtime-navigation.js';
import { confirmUnassignedView } from './unassigned/confirmation.js';
import {
  captureDefinitionPileState,
  captureMoveResult,
  captureRuntimeInventoryItem,
  captureRuntimePack,
  createRuntimeObjectIdentityTracker,
  diagnosticJson,
} from './unassigned/diagnostics.js';
import {
  createRecoveryOverflowResolvers,
  evaluateRecoveryTriggerSelection,
  selectionConsumesSignalRefs,
} from './unassigned/recovery.js';
import {
  DEFAULT_PACK_OPEN_RETRY_CODES,
  capturePackOpenResultEvidence,
  isAmbiguousPackOpenFailure,
  openPackTransaction,
} from './pack/open-transaction.js';
import {
  classifyOpenedItemRouting,
  createOpenedItemRoutingBaseline,
  matchOpenedItemsToNewPileAliases,
  materializeOpenedPlayerDuplicates,
  partitionOpenedItemsByLiveUnassigned,
  planUnmaterializedDuplicateFallback,
} from './pack/opened-item-materialization.js';
import { createPackInstanceQueue } from './pack/instance-queue.js';
import { settleOpenedItems } from './pack/opened-item-settlement.js';
import { recoverPackOpenRetry } from './pack/retry-recovery.js';
import {
  PACK_OPEN_RESPONSE_LOST,
  PACK_OPEN_RESULT_AMBIGUOUS,
  capturePackOpenRetrySnapshot,
  decidePackOpenRetry,
  samePackOpenRetrySnapshot,
} from './pack/retry-reconciliation.js';
import { findPackWithRecovery } from './pack/source-lookup.js';
import {
  bindPackCatalogLoops,
  createPackCatalog,
  recordObservedSbcReward,
  resolveSourcePackIdentity,
  updatePackCatalogInventory,
} from './pack/catalog.js';
import { createStalePackTracker } from './pack/stale-pack-tracker.js';
import { createOpenedItemPolicy } from './pack/opened-item-policy.js';
import {
  planBackgroundSubmitRetry,
  planItemViolationOverride,
} from './sbc/background-submit-retry.js';
import {
  planUntradeableDuplicateSwaps,
  resolveUntradeableDuplicateSwapIds,
  validateUntradeableDuplicateSwapMaterialization,
} from './sbc/untradeable-duplicate-swap.js';
import {
  createBackgroundSubmitTelemetry,
  sanitizeBackgroundSubmitResult,
  summarizeBackgroundSubmitPackCounts,
  summarizeBackgroundSubmitState,
  summarizeBackgroundSubmitItems,
} from './sbc/background-submit-diagnostics.js';
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
import { runInventoryExhaustionWorkflow } from './workflows/inventory-exhaustion.js';
import {
  chooseRollingRequiredSpecialRecoveryAction,
  ROLLING_UPGRADE_PHASES,
  runRollingUpgradeWorkflow,
} from './workflows/rolling-upgrade.js';
import { dispatchConfiguredWorkflow } from './workflows/dispatch.js';
import { createLogRenderer, formatLogHtml } from './ui/log-renderer.js';
import {
  createRuntimeTelemetryController,
  createRuntimeTelemetrySnapshot,
} from './runtime/telemetry.js';
import { bindMainPanelCommands, hydrateMainPanelOptions } from './ui/main-panel-bindings.js';
import { createMainPanelCommands } from './ui/main-panel-commands.js';
import { createMainPanelGeometry } from './ui/main-panel-geometry.js';
import { createResponsiveLayoutController, normalizeLayoutOverride } from './ui/responsive-layout.js';
import { showMainPanelHelp } from './ui/main-panel-help.js';
import {
  renderMainPanelLoopOptions,
  renderMainPanelProfileOptions,
  renderMainPanelRecap,
  renderMainPanelRounds,
  renderMainPanelRuntimeState,
  renderRewardAlertSummary,
  renderSelectionPolicySummary,
} from './ui/main-panel-state.js';
import { mountMainPanel, setMainPanelStartupHidden } from './ui/main-panel-view.js';
import { createWorkflowLoopBuilder } from './ui/workflow-loop-builder.js';
import { waitForManualPlayerPickSelection } from './ui/player-pick-modal.js';
import { showPlayerPickRecap } from './ui/player-pick-recap.js';
import { triggerRewardFireworks } from './ui/reward-celebration.js';
import { createSbcRewardOverlay } from './ui/sbc-reward-overlay.js';
import { showPackHighlightToast } from './ui/reward-highlight.js';
import { showRewardAlertSettings } from './ui/reward-alert-settings.js';
import { showSelectionPolicySettings } from './ui/selection-policy-settings.js';
import { showBatchOpenDialog } from './ui/batch-open-dialog.js';
import { showBatchOpenRecap } from './ui/batch-open-recap.js';
import { showLoopRecap } from './ui/loop-recap.js';
import { showTradeListingDialog } from './ui/trade-listing-dialog.js';
import { showTradeBuyDialog } from './ui/trade-buy-dialog.js';
import { showTradeSchedulerDialog } from './ui/trade-scheduler-dialog.js';
import { showTradeBulkRelistDialog } from './ui/trade-bulk-relist-dialog.js';
import { createTradeBuyJournal } from './trade/buy-journal.js';
import { createTradeListingJournal } from './trade/listing-journal.js';
import {
  acknowledgeTradeExpiredLeaseRecovery,
  acknowledgeTradeRecovery,
  createTradeRecoveryHistoryReceipt,
  createTradeRecoveryAudit,
  inspectTradeExpiredLeaseReview,
  inspectTradeRecoveryJournal,
  partitionTradeRecoveryReviews,
} from './trade/recovery-audit.js';
import { inspectExpiredTradeLeaseRecovery, summarizeTradeRunCorrelations } from './trade/scheduler-correlation.js';

const RUNNER_VERSION = packageInfo.version;
const CONSOLE_PREFIX = '[DailyLoopRunner]';
const SCHEDULED_BUY_LIVE_GATE_ENABLED = true;
const SCHEDULED_TRANSFER_REPRICE_LIVE_GATE_ENABLED = true;
const SCHEDULED_BULK_RELIST_LIVE_GATE_ENABLED = true;

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
  const INVENTORY_PILE_NAMES = Object.freeze(['unassigned', 'storage', 'transfer', 'club']);
  function normalizedRuntimePileName(value) {
    const raw = String(value ?? '');
    if (INVENTORY_PILE_NAMES.includes(raw)) return raw;
    for (const pileName of INVENTORY_PILE_NAMES) {
      try {
        if (raw && raw === String(inventoryPile(pileName))) return pileName;
      } catch { }
    }
    return '';
  }
  function rollingSelectionSubmissionPile(entry = {}) {
    for (const value of [
      entry.submissionPileName,
      entry.item?.ref?.pile,
      entry.item?.pile,
      entry.itemRef?.pile,
      entry.pileName,
    ]) {
      const pileName = normalizedRuntimePileName(value);
      if (pileName) return pileName;
    }
    return 'unknown';
  }
  const eaPlayerPickAdapter = () => adapters.playerPick();
  const eaRarityAdapter = adapters.rarity;
  const eaSbcAdapter = () => adapters.sbc();
  const tradeRequestPacer = createTradeRequestPacer({
    storage: adapters.userscriptStorage,
    key: TRADE_REQUEST_PACING_KEY,
    lockManager: navigator?.locks,
  });
  const eaTradeAdapter = (tradeOptions = {}) => adapters.trade({
    requestPacer: tradeRequestPacer,
    pacingContext: tradeOptions.pacingContext,
  });
  const fsuAdapter = () => adapters.fsu();
  const localizationAdapter = adapters.localization;
  const pageRuntime = adapters.page;
  const identifyRuntimeInventoryItem = createRuntimeObjectIdentityTracker();
  const identifyRuntimePack = createRuntimeObjectIdentityTracker('ea-pack');
  const tradePlayerCatalogProvider = createPlayerCatalogProvider({
    requestText: adapters.http.getText,
    storage: adapters.userscriptStorage,
    cacheKey: TRADE_PLAYER_CATALOG_CACHE_KEY,
    season: '26',
  });
  const tradePriceQuoteProvider = createPriceQuoteProvider({
    requestText: adapters.http.getText,
    provider: 'auto',
  });
  const inspectTradeProviders = () => ({
    schemaVersion: 1,
    capturedAt: Date.now(),
    playerCatalog: tradePlayerCatalogProvider.inspect({ platform: 'pc', season: '26' }),
    priceQuotes: tradePriceQuoteProvider.inspect(),
  });
  const tradeCircuitBreaker = createTradeCircuitBreaker({
    storage: adapters.userscriptStorage,
    key: TRADE_CIRCUIT_KEY,
  });
  const tradeJobStore = createTradeJobStore({
    storage: adapters.userscriptStorage,
    key: TRADE_JOB_STORE_KEY,
  });
  const tradeBuyJournal = createTradeBuyJournal({
    storage: adapters.userscriptStorage,
    key: TRADE_BUY_JOURNAL_KEY,
    isContinuationActive: (runId, jobId) => (
      tradeJobStore.read().runtimes?.[jobId]?.continuation?.runId === runId
    ),
  });
  const tradeListingJournal = createTradeListingJournal({
    storage: adapters.userscriptStorage,
    key: TRADE_LISTING_JOURNAL_KEY,
    isContinuationActive: (runId, jobId) => (
      tradeJobStore.read().runtimes?.[jobId]?.continuation?.runId === runId
    ),
  });
  const tradeBulkRelistJournal = createTradeBulkRelistJournal({
    storage: adapters.userscriptStorage,
    key: TRADE_BULK_RELIST_JOURNAL_KEY,
  });
  const tradeRecoveryAudit = createTradeRecoveryAudit({
    storage: adapters.userscriptStorage,
    key: TRADE_RECOVERY_AUDIT_KEY,
  });
  const tradeTabOwnerId = `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tradeRunLease = createTradeRunLease({
    storage: adapters.userscriptStorage,
    key: TRADE_RUN_LEASE_KEY,
    ownerId: tradeTabOwnerId,
  });
  const tradeListingPreview = createListingPreview({
    getTradeAdapter: eaTradeAdapter,
    priceQuoteProvider: tradePriceQuoteProvider,
  });
  const tradeListingPreparation = createListingPreparation({
    getTradeAdapter: eaTradeAdapter,
    listingPreview: tradeListingPreview,
    circuitBreaker: tradeCircuitBreaker,
  });
  const tradeBuyPreview = createBuyPreview({
    getTradeAdapter: eaTradeAdapter,
    playerCatalogProvider: tradePlayerCatalogProvider,
  });
  const tradeBulkRelistPreview = createBulkRelistPreview({
    getTradeAdapter: eaTradeAdapter,
  });
  let tradeScheduler = null;
  const tradeSchedulerTickLock = createTradeSchedulerTickLock({ lockManager: navigator?.locks });
  const tradeSchedulerEvents = createTradeSchedulerEventLog();

  function inspectPersistedTradeJournal(journalType, journal, schedulerSnapshot = tradeJobStore.read()) {
    const continuation = journal?.jobId ? schedulerSnapshot.runtimes?.[journal.jobId]?.continuation : null;
    return inspectTradeRecoveryJournal(journalType, journal, {
      continuationActive: Boolean(continuation?.runId && continuation.runId === journal?.runId),
    });
  }

  function inspectTradeRecoveryState() {
    const schedulerSnapshot = tradeJobStore.read();
    const buyJournal = tradeBuyJournal.snapshot();
    const listingJournal = tradeListingJournal.snapshot();
    const bulkRelistJournal = tradeBulkRelistJournal.snapshot();
    const journalReviews = [
      inspectPersistedTradeJournal('buy', buyJournal, schedulerSnapshot),
      inspectPersistedTradeJournal('listing', listingJournal, schedulerSnapshot),
      inspectPersistedTradeJournal('bulk-relist', bulkRelistJournal, schedulerSnapshot),
    ];
    const leaseState = tradeRunLease.inspect();
    const partitioned = partitionTradeRecoveryReviews(journalReviews, leaseState);
    const leaseReview = inspectTradeExpiredLeaseReview({
      leaseState,
      history: schedulerSnapshot.history,
      journalReviews: partitioned.reviews,
      continuation: leaseState.lease?.jobId && schedulerSnapshot.runtimes?.[leaseState.lease.jobId]?.continuation
        ? { ...schedulerSnapshot.runtimes[leaseState.lease.jobId].continuation, jobId: leaseState.lease.jobId }
        : null,
    });
    const reviews = [...partitioned.reviews, leaseReview].filter((review) => review.reviewRequired === true);
    return {
      reviewRequired: reviews.length > 0,
      reason: reviews[0]?.reason || null,
      reviews,
      inFlightReviews: partitioned.inFlightReviews,
      journals: { buy: buyJournal, listing: listingJournal, bulkRelist: bulkRelistJournal },
      audit: tradeRecoveryAudit.snapshot(),
      scheduler: {
        paused: schedulerSnapshot.paused === true,
        liveExecutionEnabled: schedulerSnapshot.liveExecutionEnabled === true,
      },
      operation: tradeOperationCoordinator.inspect(),
      lease: leaseState,
    };
  }

  function acknowledgeTradeRecoveryFromUi(input = {}) {
    const journalType = String(input.journalType || '');
    if (journalType === 'lease') {
      const schedulerSnapshot = tradeJobStore.read();
      const leaseState = tradeRunLease.inspect();
      const journalReviews = [
        inspectPersistedTradeJournal('buy', tradeBuyJournal.snapshot(), schedulerSnapshot),
        inspectPersistedTradeJournal('listing', tradeListingJournal.snapshot(), schedulerSnapshot),
        inspectPersistedTradeJournal('bulk-relist', tradeBulkRelistJournal.snapshot(), schedulerSnapshot),
      ];
      const job = schedulerSnapshot.jobs.find((entry) => entry.id === leaseState.lease?.jobId);
      const result = acknowledgeTradeExpiredLeaseRecovery({
        schedulerSnapshot,
        operation: tradeOperationCoordinator.inspect(),
        leaseState,
        history: schedulerSnapshot.history,
        journalReviews,
        jobType: job?.type,
        audit: tradeRecoveryAudit,
        evidenceHash: input.evidenceHash,
        resolution: input.resolution,
        riskAccepted: input.riskAccepted,
      });
      if (!(schedulerSnapshot.history || []).some((entry) => entry.runId === result.review.runId)) {
        tradeJobStore.addHistory(result.receipt);
      }
      log(`Trade Scheduler: expired Lease recovery acknowledged for ${result.review.runId}`);
      setPanelState();
      return inspectTradeRecoveryState();
    }
    const journal = journalType === 'buy'
      ? tradeBuyJournal
      : journalType === 'listing' ? tradeListingJournal : journalType === 'bulk-relist' ? tradeBulkRelistJournal : null;
    if (!journal) throw new Error('recovery-acknowledgement-journal-type-invalid');
    const result = acknowledgeTradeRecovery({
      schedulerSnapshot: tradeJobStore.read(),
      operation: tradeOperationCoordinator.inspect(),
      lease: tradeRunLease.inspect(),
      journalType,
      journal,
      audit: tradeRecoveryAudit,
      evidenceHash: input.evidenceHash,
      resolution: input.resolution,
      riskAccepted: input.riskAccepted,
    });
    const schedulerSnapshot = tradeJobStore.read();
    if (!(schedulerSnapshot.history || []).some((entry) => entry.runId === result.review.runId)) {
      tradeJobStore.addHistory(createTradeRecoveryHistoryReceipt(result.review, result.journal));
    }
    log(`Trade Scheduler: ${journalType} recovery acknowledged for ${result.review.runId}`);
    setPanelState();
    return inspectTradeRecoveryState();
  }

  function inspectGuardedTradeSession() {
    let pageReady = false;
    try { pageReady = pageRuntime.isReady(); } catch { }
    let fsuReadiness = { detected: false, ready: true, state: 'not-detected' };
    try { fsuReadiness = fsuAdapter().readiness(); } catch { }
    const session = guardedTradeSessionReadiness({ pageReady, fsuReadiness });
    return { pageReady, fsuReadiness, ready: session.ready, reason: session.reason };
  }


const state = {
    running: false,
    stopping: false,
    committedSbcSubmitDepth: 0,
    committedPackOpenDepth: 0,
    refreshing: false,
    scanningPicks: false,
    dynamicSbcScanProgress: null,
    loadingLoops: false,
    loopDefs: null,
    discoveredLoopDefs: [],
    discoveredLoopOverrides: {},
    discoveredRecoveryRecipeOverrides: {},
    scannedDynamicSbcDefs: [],
    storageSinkCandidates: [],
    recoveryRecipes: null,
    unassignedRecoveryPolicies: null,
    defaultUnassignedRecoveryPolicyIds: null,
    loopConfigSource: 'built-in',
    stalePackTracker: createStalePackTracker(),
    lastStorePacks: [],
    packCatalog: createPackCatalog(),
    consumedItemIds: new Set(),
    pendingConsumedDuplicateSignals: new Map(),
    assumedTotwItemIds: new Set(),
    recentRewardItems: [],
    logLines: [],
    bootTimer: null,
    tradeSchedulerTimer: null,
    tradeSchedulerWakeups: null,
    lastTradeSchedulerTick: null,
    fsuSettingsOverride: null,
    fsuSettingsCache: { at: 0, settings: null },
    lastOpenPackReceipt: null,
    lastPickRecap: null,
    lastBatchRecap: null,
    lastLoopRecap: null,
    preparedTradeListing: null,
    preparedTradeListingRunId: null,
    lastTradeListingReceipt: null,
    lastScheduledTradeListing: null,
    lastTradeBuyPreview: null,
    lastTradeBuyJob: null,
    lastTradeBuyReceipt: null,
    lastTradeBuyError: null,
    tradeListingRunning: false,
    tradeBuyRunning: false,
    tradeBulkRelistRunning: false,
    lastTradeBulkRelistPreview: null,
    lastTradeBulkRelistReceipt: null,
    lastTradeBulkRelistError: null,
    lastRecapType: null,
    loopRecapSession: null,
    loopStack: [],
    logRenderer: null,
    workflowBuilder: null,
    panelGeometry: null,
    layoutController: null,
    sbcLoadLogKeys: new Set(),
    pickOptions: normalizePickRuntimeOptions(),
    sbcFodderOptions: normalizeSbcFodderPolicy(),
    rewardAlertSettings: normalizeRewardAlertSettings(),
    runtimeTelemetry: createRuntimeTelemetrySnapshot(),
    runtimeTelemetryController: null,
  };
  state.runtimeTelemetryController = createRuntimeTelemetryController({
    initialSnapshot: state.runtimeTelemetry,
    onSnapshot: (snapshot) => {
      state.runtimeTelemetry = snapshot;
      setPanelState();
    },
  });
  const tradeOperationCoordinator = createOperationCoordinator({
    externalBusy: () => ({
      busy: state.running || state.refreshing || state.scanningPicks || state.loadingLoops,
      type: state.tradeBuyRunning
        ? 'trade-buy'
        : state.tradeListingRunning
          ? 'trade-listing'
          : state.running
            ? 'loop-or-batch'
            : null,
      reason: 'runner-operation-active',
    }),
  });

  function destroyRunner() {
    state.stopping = true;
    if (state.bootTimer) clearInterval(state.bootTimer);
    if (state.tradeSchedulerTimer) clearInterval(state.tradeSchedulerTimer);
    state.tradeSchedulerWakeups?.stop?.();
    state.logRenderer?.destroy?.();
    state.runtimeTelemetryController?.destroy?.();
    state.layoutController?.destroy?.();
    state.workflowBuilder?.destroy?.();
    document.querySelector('#bronze-loop-panel')?.remove();
    document.querySelector('#bronze-loop-pick-modal')?.remove();
    document.querySelector('#bronze-loop-recap-modal')?.remove();
    document.querySelector('#bronze-loop-reward-alert-modal')?.remove();
    document.querySelector('#bronze-loop-selection-policy-modal')?.remove();
    document.querySelector('#bronze-loop-batch-open-modal')?.remove();
    document.querySelector('#bronze-loop-batch-recap-modal')?.remove();
    document.querySelector('#bronze-loop-loop-recap-modal')?.remove();
    document.querySelector('#bronze-loop-trade-listing-modal')?.remove();
    document.querySelector('#bronze-loop-trade-buy-modal')?.remove();
    document.querySelector('#bronze-loop-trade-scheduler-modal')?.remove();
    document.querySelector('#bronze-loop-trade-bulk-relist-modal')?.remove();
    document.querySelector('#bronze-loop-reward-highlight-stack')?.remove();
    document.querySelector('#bronze-loop-style')?.remove();
  }

  W[APP_KEY] = {
    version: RUNNER_VERSION,
    destroy: destroyRunner,
    getFsuSettings: () => getFsuSettings({ force: true }),
    getPackInventory: () => getPackInventorySnapshot(),
    getPackCatalog: () => cloneLoopDef(state.packCatalog),
    setFsuSettingsOverride,
    clearFsuSettingsOverride,
    calculateSquadRating: calculateEaSquadRating,
    solveRatingSbcCandidates: findOptimalRatingSbcSelection,
    scanPlayerPicks: () => scanAvailableDynamicSbcs(),
    scanDynamicSbcs: (options = {}) => scanAvailableDynamicSbcs(options),
    previewPackHighlight: (input = {}) => previewPackHighlight(input),
    previewBatchOpenRecap: () => previewBatchOpenRecap(),
    inspectTradeCapabilities: () => eaTradeAdapter().inspectCapabilities(),
    inspectTradeRecovery: inspectTradeRecoveryState,
    acknowledgeTradeRecovery: acknowledgeTradeRecoveryFromUi,
    inspectTradeListingCandidates: (options = {}) => eaTradeAdapter().inspectListingCandidates(options),
    inspectTradeBulkRelist: (options = {}) => eaTradeAdapter().inspectBulkRelistSnapshot(options),
    inspectTradePriceLimits: (ref = {}, options = {}) => eaTradeAdapter().inspectPriceLimits(ref, {
      refresh: options.refresh === true,
    }),
    inspectTradeCircuit: () => tradeCircuitBreaker.snapshot(),
    inspectTradeRequestPacing: (context = {}) => tradeRequestPacer.inspect(context),
    resetTradeCircuit: (reason = 'manual-console-reset') => tradeCircuitBreaker.reset(reason),
    getTradeSchedulerState: () => tradeJobStore.read(),
    saveTradeJob: (job, options = {}) => tradeJobStore.upsert(job, options),
    deleteTradeJob: (jobId) => tradeJobStore.remove(jobId),
    pauseTradeScheduler: () => disableGuardedTradeScheduling('manual-console-pause'),
    enableGuardedTradeScheduling,
    disableGuardedTradeScheduling,
    setTradeMinimumRetainedCoins: (value) => tradeJobStore.setMinimumRetainedCoins(value),
    stageExpiredTradeLeaseValidation: stageExpiredTradeLeaseValidationFromConsole,
    tickTradeScheduler,
    inspectOperationCoordinator: () => tradeOperationCoordinator.inspect(),
    previewTradeListings: (input = {}, options = {}) => tradeListingPreview.preview(input, options),
    previewTradeBulkRelist: () => previewManualTradeBulkRelist(),
    executeManualTradeBulkRelist,
    previewTradeBuys: previewTradeBuyJob,
    executeManualTradeBuy,
    prepareTradeListing,
    executePreparedTradeListing,
    cancelPreparedTradeListing,
    stopTradeListing,
    stopTradeBuy,
    loadTradePlayerCatalog: (options = {}) => tradePlayerCatalogProvider.load(options),
    clearTradePlayerCatalogCache: () => tradePlayerCatalogProvider.clear(),
    loadTradePriceQuotes: (options = {}) => tradePriceQuoteProvider.load(options),
    clearTradePriceQuoteCache: () => tradePriceQuoteProvider.clear(),
    inspectTradeProviders,
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const now = () => new Date().toLocaleTimeString();
  const guardedScheduledListingExecutor = createGuardedScheduledListingExecutor({
    store: tradeJobStore,
    listingPreparation: tradeListingPreparation,
    operationCoordinator: tradeOperationCoordinator,
    getTradeAdapter: eaTradeAdapter,
    validateClubPlayers: (refs, options) => fsuAdapter().validateClubPlayers(refs, options),
    circuitBreaker: tradeCircuitBreaker,
    journal: tradeListingJournal,
    inspectRecovery: inspectTradeRecoveryState,
    ownerId: tradeTabOwnerId,
    validationGateEnabled: true,
    scheduledTransferRepriceEnabled: SCHEDULED_TRANSFER_REPRICE_LIVE_GATE_ENABLED,
    sleep,
    shouldStop: () => state.stopping,
    onRunningChange: (running, input) => {
      state.tradeListingRunning = running;
      state.running = running;
      if (!running) state.stopping = false;
      log(running
        ? `Trade Scheduler: guarded Listing Job ${input.job?.name || input.job?.id} started; one authorization consumed`
        : `Trade Scheduler: guarded Job ${input.job?.name || input.job?.id} left the execution state`);
      setPanelState();
    },
    onReceipt: (receipt, context) => {
      state.lastTradeListingReceipt = receipt;
      state.lastScheduledTradeListing = {
        job: context.job,
        prepared: context.prepared,
        clubValidation: context.clubValidation,
        receipt,
      };
    },
  });
  const guardedManualBuyExecutor = createGuardedManualBuyExecutor({
    operationCoordinator: tradeOperationCoordinator,
    lease: tradeRunLease,
    buyPreview: tradeBuyPreview,
    journal: tradeBuyJournal,
    getTradeAdapter: eaTradeAdapter,
    playerCatalogProvider: tradePlayerCatalogProvider,
    circuitBreaker: tradeCircuitBreaker,
    getSchedulerState: () => tradeJobStore.read(),
    inspectRecovery: inspectTradeRecoveryState,
    ownerId: tradeTabOwnerId,
    sleep,
    shouldStop: () => state.stopping,
    onRunningChange: (running, input) => {
      state.tradeBuyRunning = running;
      state.running = running;
      if (!running) state.stopping = false;
      log(running
        ? `Trade Buy: guarded validation started for ${input.job?.name || input.job?.id}`
        : `Trade Buy: guarded validation ${input.job?.name || input.job?.id} left the execution state`);
      setPanelState();
    },
    onReceipt: (receipt, context) => {
      state.lastTradeBuyJob = context.job;
      state.lastTradeBuyPreview = context.preview || state.lastTradeBuyPreview;
      state.lastTradeBuyReceipt = receipt;
      state.lastTradeBuyError = context.error || null;
    },
  });
  const guardedManualBulkRelistExecutor = createGuardedManualBulkRelistExecutor({
    operationCoordinator: tradeOperationCoordinator,
    lease: tradeRunLease,
    journal: tradeBulkRelistJournal,
    getTradeAdapter: eaTradeAdapter,
    circuitBreaker: tradeCircuitBreaker,
    getSchedulerState: () => tradeJobStore.read(),
    inspectRecovery: inspectTradeRecoveryState,
    ownerId: tradeTabOwnerId,
    onRunningChange: (running) => {
      state.tradeBulkRelistRunning = running;
      state.tradeListingRunning = running;
      state.running = running;
      log(running
        ? 'Trade Re-list All: guarded manual transaction started'
        : 'Trade Re-list All: guarded manual transaction left the execution state');
      setPanelState();
    },
    onReceipt: (receipt, context) => {
      state.lastTradeBulkRelistPreview = context.preview;
      state.lastTradeBulkRelistReceipt = receipt;
    },
  });
  const guardedScheduledBuyExecutor = createGuardedScheduledBuyExecutor({
    store: tradeJobStore,
    operationCoordinator: tradeOperationCoordinator,
    buyPreview: tradeBuyPreview,
    journal: tradeBuyJournal,
    getTradeAdapter: eaTradeAdapter,
    playerCatalogProvider: tradePlayerCatalogProvider,
    circuitBreaker: tradeCircuitBreaker,
    inspectRecovery: inspectTradeRecoveryState,
    ownerId: tradeTabOwnerId,
    validationGateEnabled: SCHEDULED_BUY_LIVE_GATE_ENABLED,
    sleep,
    shouldStop: () => state.stopping,
    onRunningChange: (running, input) => {
      state.tradeBuyRunning = running;
      state.running = running;
      if (!running) state.stopping = false;
      log(running
        ? `Trade Scheduler: guarded Buy Job ${input.job?.name || input.job?.id} started; one authorization consumed`
        : `Trade Scheduler: guarded Buy Job ${input.job?.name || input.job?.id} left the execution state`);
      setPanelState();
    },
    onReceipt: (receipt, context) => {
      state.lastTradeBuyJob = context.job;
      state.lastTradeBuyPreview = context.preview || state.lastTradeBuyPreview;
      state.lastTradeBuyReceipt = receipt;
      state.lastTradeBuyError = context.error || null;
    },
  });
  const guardedScheduledBulkRelistExecutor = createGuardedScheduledBulkRelistExecutor({
    store: tradeJobStore,
    bulkRelistPreview: tradeBulkRelistPreview,
    operationCoordinator: tradeOperationCoordinator,
    journal: tradeBulkRelistJournal,
    getTradeAdapter: eaTradeAdapter,
    circuitBreaker: tradeCircuitBreaker,
    inspectRecovery: inspectTradeRecoveryState,
    ownerId: tradeTabOwnerId,
    validationGateEnabled: SCHEDULED_BULK_RELIST_LIVE_GATE_ENABLED,
    shouldStop: () => state.stopping,
    onRunningChange: (running, input) => {
      state.tradeBulkRelistRunning = running;
      state.tradeListingRunning = running;
      state.running = running;
      if (!running) state.stopping = false;
      log(running
        ? `Trade Scheduler: guarded Re-list All Job ${input.job?.name || input.job?.id} started`
        : `Trade Scheduler: guarded Re-list All Job ${input.job?.name || input.job?.id} left the execution state`);
      setPanelState();
    },
    onReceipt: (receipt, context) => {
      state.lastTradeBulkRelistPreview = context.preview;
      state.lastTradeBulkRelistReceipt = receipt;
      state.lastTradeBulkRelistError = null;
    },
  });
  tradeScheduler = createTradeScheduler({
    store: tradeJobStore,
    lease: tradeRunLease,
    circuitBreaker: tradeCircuitBreaker,
    executeJob: (input) => {
      if (input.job?.type === 'listing') return guardedScheduledListingExecutor.execute(input);
      if (input.job?.type === 'buy') return guardedScheduledBuyExecutor.execute(input);
      if (input.job?.type === 'bulk-relist') return guardedScheduledBulkRelistExecutor.execute(input);
      throw new Error(`Unsupported scheduled Trade Job type ${input.job?.type || 'unknown'}`);
    },
    getContext: () => {
      const operation = tradeOperationCoordinator.inspect();
      const session = inspectGuardedTradeSession();
      const requestPacing = tradeRequestPacer.inspect();
      return {
        sessionReady: session.ready,
        sessionReason: session.reason,
        fsuReadiness: session.fsuReadiness,
        operationBusy: Boolean(operation.active || operation.external?.busy),
        operationReason: operation.active ? 'operation-active' : operation.external?.reason,
        requestPacingReady: requestPacing.status !== 'cooldown',
        requestPacingRetryAt: requestPacing.nextAllowedAt,
        tradeRecoveryReviewRequired: inspectTradeRecoveryState().reviewRequired,
        tradeRecoveryReason: inspectTradeRecoveryState().reason,
        tickToleranceMs: 15_000,
      };
    },
    reconcileExpiredLease: async (previousLease) => {
      const snapshot = tradeJobStore.read();
      const recovery = inspectExpiredTradeLeaseRecovery({
        previousLease,
        history: snapshot.history,
        buyJournal: tradeBuyJournal.snapshot(),
        listingJournal: tradeListingJournal.snapshot(),
        bulkRelistJournal: tradeBulkRelistJournal.snapshot(),
        inspectJournal: (journal, journalType) => inspectPersistedTradeJournal(journalType, journal, snapshot).reviewRequired,
        continuation: snapshot.runtimes?.[previousLease?.jobId]?.continuation
          ? { ...snapshot.runtimes[previousLease.jobId].continuation, jobId: previousLease.jobId }
          : null,
      });
      log(`Trade Scheduler: expired lease ${previousLease?.runId || 'unknown'} reconciliation ${recovery.status} (${recovery.reason})`);
      return recovery;
    },
  });

  async function prepareTradeListing(input = {}, options = {}) {
    if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops || state.tradeListingRunning) {
      throw new Error('Another Runner operation is active; listing preparation is unavailable');
    }
    const recovery = inspectTradeRecoveryState();
    if (recovery.reviewRequired) throw new Error(recovery.reason || 'trade-recovery-review-required');
    const requestedSources = input.policy?.sources || ['club'];
    const source = requestedSources.length === 1 ? requestedSources[0] : null;
    const clubListing = source === 'club';
    const transferReprice = source === 'transfer' && input.policy?.expiredPolicy === 'reprice';
    if (!clubListing && !transferReprice) throw new Error('Live preparation allows Club listing or expired Transfer reprice only');
    const journalRecovery = tradeListingJournal.inspectRecovery();
    if (!journalRecovery.canSupersede) throw new Error(journalRecovery.reason);
    state.preparedTradeListing = null;
    state.preparedTradeListingRunId = null;
    const maxListings = Math.min(4, Math.max(1, Math.floor(Number(input.policy?.maxListings || 4))));
    const runId = `manual-listing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const job = {
      ...input,
      policy: {
        ...(input.policy || {}),
        sources: [source],
        maxListings,
        expiredPolicy: transferReprice ? 'reprice' : 'skip',
      },
    };
    try {
      tradeListingJournal.begin({ runId, jobId: job.id, source, requested: maxListings });
      const pacingContext = {
        policy: job.policy,
        jobId: job.id,
        runId,
        ownerId: tradeTabOwnerId,
        shouldStop: () => state.stopping,
      };
      const adapter = eaTradeAdapter({ pacingContext });
      const prepared = await tradeListingPreparation.prepare(job, {
        ...options,
        maxListings,
        tradeAdapter: adapter,
        pacingContext,
      });
      tradeListingJournal.checkpoint(runId, {
        phase: 'prepare-finished',
        status: prepared.ready ? 'completed' : 'blocked',
        reason: prepared.blockers?.[0]?.reason,
        items: prepared.plan?.entries || [],
      });
      if (prepared.ready) {
        state.preparedTradeListing = prepared;
        state.preparedTradeListingRunId = runId;
      } else {
        tradeListingJournal.finish(runId, {
          phase: 'prepare-blocked', status: 'blocked', reason: prepared.blockers?.[0]?.reason,
        });
      }
      return prepared;
    } catch (error) {
      tradeListingJournal.finish(runId, { phase: 'prepare-error', status: 'error', reason: error?.message || String(error) });
      throw error;
    }
  }

  async function previewManualTradeBulkRelist() {
    if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops || state.tradeListingRunning || state.tradeBuyRunning) {
      throw new Error('Another Runner operation is active; Re-list All preview is unavailable');
    }
    const recovery = inspectTradeRecoveryState();
    if (recovery.reviewRequired) throw new Error(recovery.reason || 'trade-recovery-review-required');
    const preview = await tradeBulkRelistPreview.preview({ wait: true });
    state.lastTradeBulkRelistPreview = preview;
    state.lastTradeBulkRelistReceipt = null;
    state.lastTradeBulkRelistError = null;
    log(preview.ready
      ? `Trade Re-list All: preview found ${Number(preview.snapshot?.unsoldCount || 0)} Unsold item(s)`
      : `Trade Re-list All: preview blocked (${preview.blockers?.map((entry) => entry.reason).join(', ') || 'unknown'})`);
    return preview;
  }

  async function executeManualTradeBulkRelist(input = {}) {
    if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops || state.tradeListingRunning || state.tradeBuyRunning) {
      throw new Error('Another Runner operation is active; Re-list All execution is unavailable');
    }
    state.lastTradeBulkRelistError = null;
    state.stopping = false;
    try {
      const receipt = await guardedManualBulkRelistExecutor.execute(input);
      state.lastTradeBulkRelistReceipt = receipt;
      tradeJobStore.addHistory(receipt);
      return receipt;
    } catch (error) {
      state.lastTradeBulkRelistError = error;
      throw error;
    } finally {
      state.stopping = false;
      setPanelState();
    }
  }

  async function executePreparedTradeListing(input = {}) {
    if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops || state.tradeListingRunning) {
      throw new Error('Another Runner operation is active; listing execution is unavailable');
    }
    const recovery = inspectTradeRecoveryState();
    if (recovery.reviewRequired) throw new Error(recovery.reason || 'trade-recovery-review-required');
    const prepared = state.preparedTradeListing;
    if (!prepared) throw new Error('No prepared Trade listing is available');
    const runId = state.preparedTradeListingRunId;
    if (!runId) throw new Error('Prepared Trade Run is unavailable');
    const operationId = `trade-listing-${Date.now()}`;
    const operation = tradeOperationCoordinator.acquire({ id: operationId, type: 'trade-listing', ownerId: tradeTabOwnerId });
    if (!operation.acquired) {
      throw new Error(`Trade listing is blocked by ${operation.reason}`);
    }
    const leaseState = tradeRunLease.inspect();
    if (leaseState.expired) {
      tradeOperationCoordinator.release(operationId);
      throw new Error('expired-lease-reconciliation-required; open Trade Scheduler Recovery and acknowledge the previous Run after checking EA state');
    }
    const acquired = tradeRunLease.acquire({ runId, jobId: prepared.job.id });
    if (!acquired.acquired || acquired.recoveryRequired) {
      if (acquired.acquired) tradeRunLease.release(runId);
      tradeOperationCoordinator.release(operationId);
      throw new Error(acquired.recoveryRequired ? 'expired-lease-reconciliation-required' : acquired.reason || 'lease-unavailable');
    }
    const recoveryAfterLease = inspectTradeRecoveryState();
    if (recoveryAfterLease.reviewRequired) {
      tradeRunLease.release(runId);
      tradeOperationCoordinator.release(operationId);
      throw new Error(recoveryAfterLease.reason || 'trade-recovery-review-required');
    }
    state.preparedTradeListing = null;
    state.preparedTradeListingRunId = null;
    state.tradeListingRunning = true;
    state.running = true;
    state.stopping = false;
    try {
      const coordinator = createTradeChunkCoordinator({
        onCheckpoint: (checkpoint) => tradeListingJournal.checkpoint(runId, checkpoint),
      });
      const receipt = await coordinator.run({
        runId,
        jobId: prepared.job.id,
        jobType: prepared.job.type,
        requested: prepared.plan.entries.length,
        heartbeat: () => tradeRunLease.heartbeat(runId) === true,
        shouldStop: () => state.stopping,
        executeChunk: async ({ offset, quantity }) => {
          const chunkPrepared = {
            ...prepared,
            plan: { ...prepared.plan, entries: prepared.plan.entries.slice(offset, offset + quantity) },
          };
          const transaction = createListingTransaction({
            tradeAdapter: eaTradeAdapter({
              pacingContext: {
                policy: prepared.job.policy,
                jobId: prepared.job.id,
                runId,
                ownerId: tradeTabOwnerId,
                shouldStop: () => state.stopping,
              },
            }),
            circuitBreaker: tradeCircuitBreaker,
            sleep,
            onCheckpoint: (checkpoint) => tradeListingJournal.checkpoint(runId, checkpoint),
          });
          return transaction.run({
            job: prepared.job,
            prepared: chunkPrepared,
            confirmationToken: input.confirmationToken,
            approved: input.approved,
            runId,
            itemIndexOffset: offset,
            beforeMutation: () => tradeRunLease.heartbeat(runId) === true,
            shouldStop: () => state.stopping,
          });
        },
      });
      tradeListingJournal.finish(runId, {
        phase: 'receipt-recorded', status: receipt.status, reason: receipt.reason,
      });
      state.lastTradeListingReceipt = receipt;
      tradeJobStore.addHistory(receipt);
      return receipt;
    } finally {
      state.tradeListingRunning = false;
      state.running = false;
      state.stopping = false;
      tradeRunLease.release(runId);
      tradeOperationCoordinator.release(operationId);
    }
  }

  function cancelPreparedTradeListing() {
    const cancelled = state.preparedTradeListing !== null;
    const runId = state.preparedTradeListingRunId;
    state.preparedTradeListing = null;
    state.preparedTradeListingRunId = null;
    if (runId) tradeListingJournal.finish(runId, { phase: 'cancelled', status: 'cancelled', reason: 'cancelled-by-user' });
    return cancelled;
  }

  function stopTradeListing() {
    if (!state.tradeListingRunning) return false;
    state.stopping = true;
    return true;
  }

  async function executeManualTradeBuy(job, input = {}) {
    if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops || state.tradeListingRunning || state.tradeBuyRunning) {
      throw new Error('Another Runner operation is active; Buy execution is unavailable');
    }
    const listingRecovery = inspectPersistedTradeJournal('listing', tradeListingJournal.snapshot());
    if (listingRecovery.reviewRequired) throw new Error(listingRecovery.reason || 'trade-recovery-review-required');
    state.lastTradeBuyJob = job;
    state.lastTradeBuyReceipt = null;
    state.lastTradeBuyError = null;
    state.stopping = false;
    try {
      const receipt = await guardedManualBuyExecutor.execute({ ...input, job });
      state.lastTradeBuyReceipt = receipt;
      tradeJobStore.addHistory(sanitizeTradeBuyReceipt(receipt));
      return receipt;
    } catch (error) {
      state.lastTradeBuyError = error;
      throw error;
    } finally {
      setPanelState();
    }
  }

  function stopTradeBuy() {
    if (!state.tradeBuyRunning) return false;
    state.stopping = true;
    return true;
  }

  function enableGuardedTradeScheduling(input = {}) {
    const snapshot = tradeJobStore.read();
    if (snapshot.liveExecutionEnabled) throw new Error('Guarded scheduling is already enabled');
    const recovery = inspectTradeRecoveryState();
    if (recovery.reviewRequired) throw new Error(recovery.reason || 'trade-recovery-review-required');
    const selected = selectGuardedScheduledTradeJob(snapshot, {
      scheduledBuyEnabled: SCHEDULED_BUY_LIVE_GATE_ENABLED,
      scheduledTransferRepriceEnabled: SCHEDULED_TRANSFER_REPRICE_LIVE_GATE_ENABLED,
      scheduledBulkRelistEnabled: SCHEDULED_BULK_RELIST_LIVE_GATE_ENABLED,
    });
    if (!selected.ready) throw new Error(selected.reason || 'One to three eligible armed Jobs are required');
    if (input.approved !== true) throw new Error('Guarded scheduling requires explicit approval');
    const selectedJobs = selected.jobs || (selected.job ? [selected.job] : []);
    const selectedIds = selectedJobs.map((job) => job.id).sort();
    const confirmedIds = (Array.isArray(input.jobIds) ? input.jobIds : input.jobId ? [input.jobId] : []).map(String).sort();
    if (confirmedIds.length !== selectedIds.length
      || confirmedIds.some((id, index) => id !== selectedIds[index])) {
      throw new Error('The armed Jobs changed before approval');
    }
    const currentTime = Date.now();
    for (const job of selectedJobs) {
      const scheduleType = job.schedule.type;
      if (scheduleType === 'once') {
        const runAt = Number(job.schedule.runAt);
        if (runAt < currentTime + 15_000) throw new Error(`${job.name}: once schedule must be at least 15 seconds in the future`);
        if (runAt > currentTime + 15 * 60_000) throw new Error(`${job.name}: once schedule must run within 15 minutes`);
      }
      if (scheduleType === 'window' && Number(job.schedule.endAt) <= currentTime) {
        throw new Error(`${job.name}: schedule window has already ended`);
      }
    }
    const circuit = tradeCircuitBreaker.availability();
    if (circuit.allowed !== true) throw new Error(`Trade circuit is open (${circuit.state?.reason || 'unknown'})`);
    const operation = tradeOperationCoordinator.availability('trade-scheduler');
    if (!operation.allowed) throw new Error(`Another Runner operation is active (${operation.reason})`);
    const enabled = tradeJobStore.authorize(selectedIds);
    const authorizationEntries = Object.values(enabled.authorizations?.jobs || {});
    const totalRuns = authorizationEntries.reduce((total, entry) => total + Number(entry.remainingRuns || 0), 0);
    const expiresAt = Math.max(...authorizationEntries.map((entry) => Number(entry.expiresAt || 0)));
    log(`Trade Scheduler: guarded schedule enabled for ${selectedJobs.length} Job(s); ${totalRuns} authorized Run(s), latest expiry ${new Date(expiresAt).toLocaleString()}`);
    void tickTradeScheduler({ trigger: 'enable' });
    return enabled;
  }

  function disableGuardedTradeScheduling(reason = 'manual-ui-disable') {
    const disabled = tradeJobStore.relock();
    log(`Trade Scheduler: guarded scheduling disabled (${reason})`);
    return disabled;
  }

  function stageExpiredTradeLeaseValidationFromConsole(input = {}) {
    const operation = tradeOperationCoordinator.availability('trade-listing');
    if (!operation.allowed) throw new Error(`Another Runner operation is active (${operation.reason})`);
    const snapshot = tradeJobStore.read();
    requireExpiredLeaseValidationJob(snapshot);
    const staged = stageExpiredTradeLeaseValidation({
      approved: input.approved,
      riskAccepted: input.riskAccepted,
      snapshot,
      inspectLease: () => tradeRunLease.inspect(),
      writeLease: (value) => adapters.userscriptStorage.set(TRADE_RUN_LEASE_KEY, value),
    });
    log(`Trade Scheduler: expired lease validation staged for ${staged.jobId}; enable the guarded schedule gate to verify fail-closed recovery`);
    return staged;
  }

  async function tickTradeScheduler(input = {}) {
    if (!tradeScheduler) return { status: 'unavailable' };
    const trigger = typeof input === 'string' ? input : String(input?.trigger || 'manual');
    const recordTick = (result) => {
      const runtime = summarizeTradeSchedulerRuntime(tradeJobStore.read(), result?.jobId);
      state.lastTradeSchedulerTick = tradeSchedulerEvents.record({
        trigger,
        status: result?.status,
        reason: result?.reason,
        jobId: result?.jobId || runtime.jobId,
        runId: result?.receipt?.runId,
        runtimeStatus: runtime.runtimeStatus,
        runtimeReason: runtime.runtimeReason,
        runtimeNextRunAt: runtime.runtimeNextRunAt,
      });
      return result;
    };
    try {
      const result = await tradeSchedulerTickLock.run(async () => {
        try {
          const snapshot = tradeJobStore.read();
          if (snapshot.liveExecutionEnabled) {
            const recovery = inspectTradeRecoveryState();
            if (recovery.reviewRequired) {
              disableGuardedTradeScheduling(recovery.reason || 'trade-recovery-review-required');
              log(`Trade Scheduler: blocked by unresolved ${recovery.reviews.map((review) => `${review.journalType}:${review.runId}`).join(', ')}`);
              return {
                status: 'blocked',
                reason: recovery.reason || 'trade-recovery-review-required',
                failClosedHandled: true,
              };
            }
            const selected = selectGuardedScheduledTradeJob(snapshot, {
              scheduledBuyEnabled: SCHEDULED_BUY_LIVE_GATE_ENABLED,
              scheduledTransferRepriceEnabled: SCHEDULED_TRANSFER_REPRICE_LIVE_GATE_ENABLED,
              scheduledBulkRelistEnabled: SCHEDULED_BULK_RELIST_LIVE_GATE_ENABLED,
            });
            const circuit = tradeCircuitBreaker.availability();
            const selectedJobs = selected.jobs || (selected.job ? [selected.job] : []);
            const invalidAuthorization = selected.ready
              ? selectedJobs.find((job) => !inspectTradeScheduleAuthorization(snapshot, job, { now: Date.now() }).ready)
              : null;
            if (!selected.ready || invalidAuthorization || circuit.allowed !== true) {
              const reason = !selected.ready
                ? selected.reason
                : invalidAuthorization
                  ? 'schedule-authorization-missing-or-expired'
                  : `circuit-${circuit.state?.reason || 'open'}`;
              if (invalidAuthorization && Object.keys(snapshot.authorizations?.jobs || {}).length > 0) {
                tradeJobStore.revokeAuthorization(invalidAuthorization.id, reason);
                log(`Trade Scheduler: ${invalidAuthorization.name} disabled (${reason}); other authorized Jobs remain active`);
                return { status: 'authorization-revoked', reason, jobId: invalidAuthorization.id };
              }
              disableGuardedTradeScheduling(reason);
              return { status: 'blocked', reason, jobId: invalidAuthorization?.id, failClosedHandled: true };
            }
          }
          const tickResult = await tradeScheduler.tick();
          if (['blocked', 'failed', 'ambiguous', 'stopped'].includes(tickResult.status)) {
            disableGuardedTradeScheduling(`scheduled-run-${tickResult.status}`);
            return { ...tickResult, failClosedHandled: true };
          }
          return tickResult;
        } catch (error) {
          disableGuardedTradeScheduling('unexpected-tick-error');
          log(`Trade Scheduler failed closed: ${error?.message || error}`);
          return {
            status: 'blocked',
            reason: error?.message || String(error),
            failClosedHandled: true,
          };
        }
      });
      if (result.receipt && state.lastScheduledTradeListing?.job?.id === result.jobId) {
        state.lastTradeListingReceipt = result.receipt;
        state.lastScheduledTradeListing.receipt = result.receipt;
      }
      if (['completed', 'blocked', 'failed', 'ambiguous', 'stopped', 'missed'].includes(result.status)) {
        const receipt = result.receipt;
        log(`Trade Scheduler: ${result.status}${receipt?.reason ? ` (${receipt.reason})` : ''}${receipt ? `; processed ${receipt.succeeded}/${receipt.requested}` : ''}`);
        setPanelState();
      }
      return recordTick(result);
    } catch (error) {
      log(`Trade Scheduler tick lock failed closed without changing schedule state: ${error?.message || error}`);
      return recordTick({ status: 'blocked', reason: error?.message || String(error) });
    }
  }

  function tradeDiagnosticsFilename(timestamp = Date.now()) {
    const value = new Date(Number(timestamp) || Date.now()).toISOString().replace(/[:.]/g, '-');
    return `trade-listing-diagnostics-${value}.json`;
  }

  function listingDialogDraft(job = null) {
    const policy = job?.policy || job || {};
    return {
      id: job?.id,
      name: job?.name,
      sources: policy.sources,
      cardClass: policy.cardClass,
      ratingRules: policy.ratingRules,
      marketOverride: policy.marketOverride,
      startPricePolicy: policy.startPricePolicy,
      durationSeconds: policy.durationSeconds,
      expiredPolicy: policy.expiredPolicy,
      provider: 'auto',
      platform: 'pc',
    };
  }

  function openTradeListingDialogModal(job = null) {
    cancelPreparedTradeListing();
    return showTradeListingDialog({
      dom: adapters.dom,
      now: Date.now,
      draft: listingDialogDraft(job),
      onPreview: async (job, request) => {
        log(`Trade Listings: building read-only ${job.policy.sources.join('/')} preview`);
        const preview = await tradeListingPreview.preview(job, request);
        log(`Trade Listings: preview selected ${Number(preview?.plan?.counts?.selected || 0)} of ${Number(preview?.plan?.counts?.eligible || 0)} eligible item(s)`);
        return preview;
      },
      onPrepare: async (job, request) => {
        const reprice = job.policy.sources[0] === 'transfer';
        log(`Trade Listings: refreshing Transfer and EA price limits; preparing up to two ${reprice ? 'expired Transfer reprices' : 'Club listings'}`);
        const prepared = await prepareTradeListing(job, request);
        log(prepared.ready
          ? `Trade Listings: ${prepared.plan.entries.length} item(s) prepared and ready for explicit approval`
          : `Trade Listings: preparation blocked (${prepared.blockers?.map((entry) => entry.reason).join(', ') || 'unknown'})`);
        return prepared;
      },
      onCancelPrepared: cancelPreparedTradeListing,
      onExecute: async (confirmation) => {
        log('Trade Listings: confirmed guarded listing started');
        const execution = executePreparedTradeListing(confirmation);
        setPanelState();
        try {
          const receipt = await execution;
          log(`Trade Listings: ${receipt.status}${receipt.reason ? ` (${receipt.reason})` : ''}; listed ${receipt.succeeded}/${receipt.requested}`);
          return receipt;
        } catch (error) {
          log(`Trade Listings failed: ${error?.message || error}`);
          throw error;
        } finally {
          setPanelState();
        }
      },
      onStop: () => {
        const accepted = stopTradeListing();
        if (accepted) {
          log('Trade Listings: Stop requested; waiting for the current transaction safe point');
          setPanelState();
        }
        return accepted;
      },
      onDownloadDiagnostics: (snapshot = {}) => {
        const capturedAt = Date.now();
        const diagnostics = createTradeListingDiagnostics({
          ...snapshot,
          capturedAt,
          runnerVersion: RUNNER_VERSION,
          userAgent: navigator?.userAgent || '',
          operation: {
            running: state.running,
            stopping: state.stopping,
            tradeListingRunning: state.tradeListingRunning,
          },
          circuit: tradeCircuitBreaker.snapshot(),
          journal: tradeListingJournal.snapshot(),
        });
        adapters.userEffects.downloadText(
          JSON.stringify(diagnostics, null, 2),
          tradeDiagnosticsFilename(capturedAt),
        );
        log('Trade Listings: diagnostics saved');
      },
    });
  }

  function tradeSchedulerDiagnostics() {
    const scheduler = tradeJobStore.read();
    const operation = {
      running: state.running,
      stopping: state.stopping,
      refreshing: state.refreshing,
      scanningDynamicSbcs: state.scanningPicks,
      loadingLoops: state.loadingLoops,
      tradeListingRunning: state.tradeListingRunning,
      tradeBuyRunning: state.tradeBuyRunning,
    };
    return {
      schemaVersion: 1,
      capturedAt: Date.now(),
      runner: { version: RUNNER_VERSION, userAgent: navigator?.userAgent || '' },
      scheduler,
      schedulerRuntime: {
        ownerId: tradeTabOwnerId,
        webLock: tradeSchedulerTickLock.inspect(),
        lastTick: state.lastTradeSchedulerTick,
        events: tradeSchedulerEvents.snapshot(),
        session: inspectGuardedTradeSession(),
        validationGates: {
          scheduledListing: true,
          scheduledTransferReprice: SCHEDULED_TRANSFER_REPRICE_LIVE_GATE_ENABLED,
          scheduledBuy: SCHEDULED_BUY_LIVE_GATE_ENABLED,
          scheduledBulkRelist: SCHEDULED_BULK_RELIST_LIVE_GATE_ENABLED,
        },
        selection: summarizeGuardedScheduledTradeSelection(scheduler, {
          scheduledBuyEnabled: SCHEDULED_BUY_LIVE_GATE_ENABLED,
          scheduledTransferRepriceEnabled: SCHEDULED_TRANSFER_REPRICE_LIVE_GATE_ENABLED,
          scheduledBulkRelistEnabled: SCHEDULED_BULK_RELIST_LIVE_GATE_ENABLED,
        }),
      },
      circuit: tradeCircuitBreaker.snapshot(),
      lease: tradeRunLease.inspect(),
      coordinator: tradeOperationCoordinator.inspect(),
      providers: inspectTradeProviders(),
      requestPacing: tradeRequestPacer.inspect(),
      capabilities: eaTradeAdapter().inspectCapabilities(),
      operation,
      recovery: inspectTradeRecoveryState(),
      correlations: summarizeTradeRunCorrelations({
        scheduler,
        buyJournal: tradeBuyJournal.snapshot(),
        listingJournal: tradeListingJournal.snapshot(),
        bulkRelistJournal: tradeBulkRelistJournal.snapshot(),
        lease: tradeRunLease.inspect(),
        events: tradeSchedulerEvents.snapshot(),
      }),
      buy: createTradeBuyDiagnostics({
        capturedAt: Date.now(),
        runnerVersion: RUNNER_VERSION,
        userAgent: navigator?.userAgent || '',
        operation,
        circuit: tradeCircuitBreaker.snapshot(),
        journal: tradeBuyJournal.snapshot(),
        job: state.lastTradeBuyJob || state.lastTradeBuyPreview?.job || null,
        preview: state.lastTradeBuyPreview,
        receipt: state.lastTradeBuyReceipt,
        error: state.lastTradeBuyError,
      }),
      guardedValidation: createTradeListingDiagnostics({
        capturedAt: Date.now(),
        runnerVersion: RUNNER_VERSION,
        userAgent: navigator?.userAgent || '',
        operation,
        circuit: tradeCircuitBreaker.snapshot(),
        journal: tradeListingJournal.snapshot(),
        job: state.lastScheduledTradeListing?.job || null,
        prepared: state.lastScheduledTradeListing?.prepared || null,
        clubValidation: state.lastScheduledTradeListing?.clubValidation || null,
        receipt: state.lastScheduledTradeListing?.receipt || null,
      }),
      bulkRelist: createBulkRelistDiagnostics({
        capturedAt: Date.now(),
        runnerVersion: RUNNER_VERSION,
        userAgent: navigator?.userAgent || '',
        operation,
        circuit: tradeCircuitBreaker.snapshot(),
        capabilities: eaTradeAdapter().inspectCapabilities(),
        journal: tradeBulkRelistJournal.snapshot(),
        preview: state.lastTradeBulkRelistPreview,
        receipt: state.lastTradeBulkRelistReceipt,
        error: state.lastTradeBulkRelistError,
      }),
    };
  }

  async function previewTradeBuyJob(job = {}, request = {}) {
    log(`Trade Buy: building preview-only search lanes for ${job.name || job.id || 'Buy Job'}`);
    const preview = await tradeBuyPreview.preview(job, request);
    state.lastTradeBuyJob = job;
    state.lastTradeBuyPreview = preview;
    state.lastTradeBuyReceipt = null;
    state.lastTradeBuyError = null;
    log(preview.plan?.ready
      ? `Trade Buy: preview ready with ${preview.summary.ratings} rating lane(s) and ${preview.summary.definitions} player definition(s); live execution remains locked`
      : `Trade Buy: preview blocked; missing rating lane(s) ${preview.plan?.missingRatings?.join(', ') || 'unknown'}`);
    return preview;
  }

  function openTradeBuyDialogModal(job, preview) {
    return showTradeBuyDialog({
      dom: adapters.dom,
      job,
      preview,
      onExecute: async (input, onProgress) => {
        log(`Trade Buy: manual confirmation accepted for up to ${job.policy?.quantity || 1} item(s), ratings ${job.policy?.ratingMin || '?'}-${job.policy?.ratingMax || '?'}, max ${job.policy?.maxBuyNow || '?'} coins each`);
        try {
          const receipt = await executeManualTradeBuy(job, { ...input, onProgress });
          log(`Trade Buy: ${receipt.status}${receipt.reason ? ` (${receipt.reason})` : ''}; purchased ${receipt.succeeded}/${receipt.requested}`);
          return receipt;
        } catch (error) {
          log(`Trade Buy failed: ${error?.message || error}`);
          throw error;
        }
      },
      onStop: () => {
        const accepted = stopTradeBuy();
        if (accepted) log('Trade Buy: Stop requested; waiting for the current transaction safe point');
        return accepted;
      },
      onDownloadDiagnostics: (snapshot = {}) => {
        const capturedAt = Date.now();
        const diagnostics = createTradeBuyDiagnostics({
          ...snapshot,
          job: state.lastTradeBuyJob || snapshot.job,
          preview: state.lastTradeBuyPreview || snapshot.preview,
          receipt: state.lastTradeBuyReceipt || snapshot.receipt,
          error: state.lastTradeBuyError || snapshot.error,
          capturedAt,
          runnerVersion: RUNNER_VERSION,
          userAgent: navigator?.userAgent || '',
          operation: {
            running: state.running,
            stopping: state.stopping,
            tradeBuyRunning: state.tradeBuyRunning,
          },
          circuit: tradeCircuitBreaker.snapshot(),
          journal: tradeBuyJournal.snapshot(),
        });
        adapters.userEffects.downloadText(
          JSON.stringify(diagnostics, null, 2),
          `trade-buy-diagnostics-${new Date(capturedAt).toISOString().replace(/[:.]/g, '-')}.json`,
        );
        log('Trade Buy: diagnostics saved');
      },
    });
  }

  function openTradeBulkRelistDialogModal() {
    state.lastTradeBulkRelistPreview = null;
    state.lastTradeBulkRelistReceipt = null;
    state.lastTradeBulkRelistError = null;
    return showTradeBulkRelistDialog({
      dom: adapters.dom,
      onPreview: () => previewManualTradeBulkRelist(),
      onExecute: async (input) => {
        log('Trade Re-list All: manual approval accepted; starting one aggregate EA mutation');
        try {
          const receipt = await executeManualTradeBulkRelist(input);
          log(`Trade Re-list All: ${receipt.status}${receipt.reason ? ` (${receipt.reason})` : ''}; relisted ${receipt.succeeded}/${receipt.requested}`);
          return receipt;
        } catch (error) {
          log(`Trade Re-list All failed: ${error?.message || error}`);
          throw error;
        }
      },
      onDownloadDiagnostics: (snapshot = {}) => {
        const capturedAt = Date.now();
        const diagnostics = createBulkRelistDiagnostics({
          ...snapshot,
          capturedAt,
          runnerVersion: RUNNER_VERSION,
          userAgent: navigator?.userAgent || '',
          operation: {
            running: state.running,
            stopping: state.stopping,
            tradeBulkRelistRunning: state.tradeBulkRelistRunning,
          },
          circuit: tradeCircuitBreaker.snapshot(),
          capabilities: eaTradeAdapter().inspectCapabilities(),
          journal: tradeBulkRelistJournal.snapshot(),
          preview: state.lastTradeBulkRelistPreview || snapshot.preview,
          receipt: state.lastTradeBulkRelistReceipt || snapshot.receipt,
          error: state.lastTradeBulkRelistError || snapshot.error,
        });
        adapters.userEffects.downloadText(
          JSON.stringify(diagnostics, null, 2),
          `trade-bulk-relist-diagnostics-${new Date(capturedAt).toISOString().replace(/[:.]/g, '-')}.json`,
        );
        log('Trade Re-list All: diagnostics saved');
      },
    });
  }

  function openTradeSchedulerDialogModal() {
    return showTradeSchedulerDialog({
      dom: adapters.dom,
      now: Date.now,
      scheduleRefresh: (callback, intervalMs) => setInterval(callback, intervalMs),
      cancelRefresh: (handle) => clearInterval(handle),
      getSnapshot: () => tradeJobStore.read(),
      getRecovery: inspectTradeRecoveryState,
      onAcknowledgeRecovery: acknowledgeTradeRecoveryFromUi,
      getCircuit: () => tradeCircuitBreaker.snapshot(),
      onSaveJob: (job) => {
        tradeJobStore.upsert(job);
        log(`Trade Scheduler: saved ${job.type} Job ${job.name}${job.armed ? ' (armed)' : ''}`);
      },
      onDeleteJob: (jobId) => {
        tradeJobStore.remove(jobId);
        log(`Trade Scheduler: deleted Job ${jobId}`);
      },
      onExportJobConfig: () => {
        const exportedAt = Date.now();
        const snapshot = tradeJobStore.read();
        adapters.userEffects.downloadText(
          exportTradeJobConfigJson(snapshot, { exportedAt, runnerVersion: RUNNER_VERSION }),
          `trade-jobs-${new Date(exportedAt).toISOString().replace(/[:.]/g, '-')}.json`,
        );
        log(`Trade Scheduler: exported ${snapshot.jobs.length} Job configuration(s)`);
      },
      onValidateJobConfig: (text) => parseTradeJobConfig(text, { now: Date.now() }),
      onImportJobConfig: (text) => {
        const imported = parseTradeJobConfig(text, { now: Date.now() });
        const snapshot = tradeJobStore.replaceJobs(imported.jobs);
        log(`Trade Scheduler: imported ${snapshot.jobs.length} Job configuration(s); scheduler relocked and all Jobs disarmed`);
        return { ...imported, jobs: snapshot.jobs };
      },
      onEnableGuardedScheduling: (input) => enableGuardedTradeScheduling(input),
      onDisableGuardedScheduling: () => disableGuardedTradeScheduling('manual-ui-disable'),
      scheduledBuyEnabled: SCHEDULED_BUY_LIVE_GATE_ENABLED,
      scheduledTransferRepriceEnabled: SCHEDULED_TRANSFER_REPRICE_LIVE_GATE_ENABLED,
      scheduledBulkRelistEnabled: SCHEDULED_BULK_RELIST_LIVE_GATE_ENABLED,
      getRequestPacing: (context = {}) => tradeRequestPacer.inspect(context),
      onSetMinimumRetainedCoins: (value) => {
        tradeJobStore.setMinimumRetainedCoins(value);
        log(value === null
          ? 'Trade Scheduler: scheduled Buy global reserve cleared'
          : `Trade Scheduler: scheduled Buy global reserve set to ${Number(value).toLocaleString()} coins`);
      },
      getProviderHealth: inspectTradeProviders,
      onClearPlayerCatalogCache: () => {
        tradeJobStore.relock();
        tradePlayerCatalogProvider.clear();
        log('Trade Scheduler: player catalog cache cleared; scheduler relocked and all Jobs disarmed');
        return inspectTradeProviders();
      },
      onClearPriceQuoteCache: () => {
        tradeJobStore.relock();
        tradePriceQuoteProvider.clear();
        log('Trade Scheduler: price quote cache cleared; scheduler relocked and all Jobs disarmed');
        return inspectTradeProviders();
      },
      onOpenManualListing: (job = null) => openTradeListingDialogModal(job),
      onOpenBulkRelist: () => openTradeBulkRelistDialogModal(),
      onPreviewBuyJob: (job) => previewTradeBuyJob(job),
      onOpenManualBuy: (job, preview) => openTradeBuyDialogModal(job, preview),
      onResetCircuit: () => {
        tradeCircuitBreaker.reset('manual-ui-reset');
        log('Trade Scheduler: persistent trade block reset manually');
      },
      onDownloadDiagnostics: () => {
        const capturedAt = Date.now();
        adapters.userEffects.downloadText(
          JSON.stringify(tradeSchedulerDiagnostics(), null, 2),
          `trade-scheduler-diagnostics-${new Date(capturedAt).toISOString().replace(/[:.]/g, '-')}.json`,
        );
        log('Trade Scheduler: diagnostics saved');
      },
    });
  }

  function log(msg) {
    const line = `[${now()}] ${msg}`;
    console.log(CONSOLE_PREFIX, msg);
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
    console.log(`${CONSOLE_PREFIX} Log cleared`);
  }

  function getLoopDefs() {
    const configured = state.loopDefs?.length ? state.loopDefs : LOOP_DEFS;
    const effectiveConfigured = configured.map((loopDef) => state.discoveredLoopOverrides?.[loopDef.id] || loopDef);
    const configuredIds = new Set(effectiveConfigured.map((loopDef) => String(loopDef?.id || '')).filter(Boolean));
    const discovered = (state.discoveredLoopDefs || []).filter((loopDef) => {
      const id = String(loopDef?.id || '');
      return !id || !configuredIds.has(id);
    });
    return [...effectiveConfigured, ...discovered];
  }

  function getConfiguredLoopDefs() {
    return state.loopDefs?.length ? state.loopDefs : LOOP_DEFS;
  }

  function getRecoveryRecipes() {
    const configured = state.recoveryRecipes || RECOVERY_RECIPES;
    return configured.map((recipe) => state.discoveredRecoveryRecipeOverrides?.[recipe.id] || recipe);
  }

  function getConfiguredRecoveryRecipes() {
    return state.recoveryRecipes || RECOVERY_RECIPES;
  }

  function getUnassignedRecoveryPolicies() {
    return state.unassignedRecoveryPolicies || UNASSIGNED_RECOVERY_POLICIES;
  }

  function getDefaultUnassignedRecoveryPolicyIds() {
    return state.defaultUnassignedRecoveryPolicyIds || DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS;
  }

  function getBuiltInLoopConfig() {
    return {
      loops: LOOP_DEFS,
      recoveryRecipes: RECOVERY_RECIPES,
      unassignedRecoveryPolicies: UNASSIGNED_RECOVERY_POLICIES,
      defaultUnassignedRecoveryPolicyIds: DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
    };
  }

  function getScannedDynamicSbcLoopDefs() {
    const loops = state.scannedDynamicSbcDefs || [];
    const seen = new Set();
    return loops.filter((loopDef) => {
      const id = String(loopDef?.id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function getVisibleLoopDefs() {
    return visibleLoopDefs(getLoopDefs());
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

  function setLoopConfig(config, source = 'custom', options = {}) {
    const normalized = validateLoopConfig(config, source);
    state.loopDefs = cloneLoopDef(normalized.loops);
    state.recoveryRecipes = cloneLoopDef(normalized.recoveryRecipes);
    state.unassignedRecoveryPolicies = cloneLoopDef(normalized.unassignedRecoveryPolicies);
    state.defaultUnassignedRecoveryPolicyIds = [...normalized.defaultUnassignedRecoveryPolicyIds];
    state.loopConfigSource = source;
    if (options.preserveDiscovery !== true) {
      state.discoveredLoopDefs = [];
      state.discoveredLoopOverrides = {};
      state.discoveredRecoveryRecipeOverrides = {};
      state.scannedDynamicSbcDefs = [];
    }
    state.packCatalog = bindPackCatalogLoops(state.packCatalog, getLoopDefs());
    renderLoopSelect(state.loopDefs[0]?.id);
    log(`Loaded ${state.loopDefs.length} loop definition(s), ${state.recoveryRecipes.length} recovery recipe(s), and ${state.unassignedRecoveryPolicies.length} recovery policy(s) from ${source}`);
  }

  function resetLoopDefs(options = {}) {
    state.loopDefs = null;
    state.recoveryRecipes = null;
    state.unassignedRecoveryPolicies = null;
    state.defaultUnassignedRecoveryPolicyIds = null;
    state.loopConfigSource = 'built-in';
    if (options.preserveDiscovery !== true) {
      state.discoveredLoopDefs = [];
      state.discoveredLoopOverrides = {};
      state.discoveredRecoveryRecipeOverrides = {};
      state.scannedDynamicSbcDefs = [];
    }
    state.packCatalog = bindPackCatalogLoops(state.packCatalog, getLoopDefs());
    renderLoopSelect(LOOP_DEFS[0]?.id);
    log(`Using built-in loop definitions (${LOOP_DEFS.length})`);
  }

  function parseLoopConfig(text) {
    return parseLoopConfigPure(text);
  }

  function getSelectedLoopDef() {
    const select = document.querySelector('#bronze-loop-select');
    const selectedId = select?.value || getVisibleLoopDefs()[0]?.id || LOOP_DEFS[0].id;
    const loopDef = cloneLoopDef(getLoopDefById(selectedId));
    assertValidLoopDef(loopDef, loopDef.name || selectedId);
    return applyDisabledPiles(loopDef);
  }

  function renderLoopSelect(selectedId = null) {
    const panel = document.querySelector('#bronze-loop-panel');
    const nextValue = renderMainPanelLoopOptions({
      panel,
      loops: getVisibleLoopDefs().map((def) => ({ id: def.id, name: def.name })),
      selectedId,
      createOption: () => document.createElement('option'),
    });
    updateLoopControls();
  }

  function getEditorLoopDef() {
    const selectedId = document.querySelector('#bronze-loop-select')?.value || getVisibleLoopDefs()[0]?.id || LOOP_DEFS[0].id;
    return getLoopDefById(selectedId);
  }

function updateLoopControls() {
    const editorLoop = getEditorLoopDef();
    const quantity = resolveRuntimeQuantity(editorLoop);
    renderMainPanelRounds({
      panel: document.querySelector('#bronze-loop-panel'),
      show: loopUsesRounds(editorLoop),
      quantity,
      quantityKey: [
        editorLoop.id || editorLoop.name || editorLoop.strategy || 'custom',
        quantity?.mode || 'none',
        quantity?.target || 'none',
        quantity?.default || 0,
        quantity?.min || 0,
        quantity?.max || 0,
      ].join(':'),
    });
  }

  function updateRecapButton() {
    const batch = state.lastRecapType === 'batch' ? state.lastBatchRecap : null;
    const pick = state.lastRecapType === 'pick' ? state.lastPickRecap : null;
    const loop = state.lastRecapType === 'loop' ? state.lastLoopRecap : null;
    const totalCards = batch?.model?.itemCount || (pick ? (pick.pickResults || []).reduce(
      (sum, entry) => sum + ((entry?.pickedCards || entry?.pickedItems || []).length), 0
    ) : loop?.model?.itemCount || 0);
    renderMainPanelRecap({
      panel: document.querySelector('#bronze-loop-panel'),
      recap: batch
        ? { type: 'batch', name: 'Batch Open', totalCards }
        : pick ? { type: 'pick', name: pick.name, totalCards }
          : loop ? { type: 'loop', name: loop.name, totalCards } : null,
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
    if (state.lastRecapType === 'loop' && state.lastLoopRecap?.model) {
      await showLoopRecapModal(state.lastLoopRecap.model);
      return;
    }
    const recap = state.lastRecapType === 'pick' ? state.lastPickRecap : null;
    if (!recap) {
      log('No previous recap available');
      return;
    }
    await showPickRecapModal({ name: recap.name }, recap.pickResults, recap);
    if (btn && document.querySelector('#bronze-loop-recap-modal')) {
      btn.textContent = 'Hide recap';
      btn.style.background = '#b13b3b';
    }
  }

  function fail(message) {
    throw new Error(message);
  }

  function stopPoint() {
    if (state.committedSbcSubmitDepth > 0 || state.committedPackOpenDepth > 0) return;
    if (state.stopping) fail('Stopped by user');
  }

  async function runCommittedSbcSubmit(operation) {
    if (state.committedSbcSubmitDepth === 0) stopPoint();
    const stoppingBeforeCommit = state.stopping;
    state.committedSbcSubmitDepth++;
    try {
      return await operation();
    } finally {
      state.committedSbcSubmitDepth = Math.max(0, state.committedSbcSubmitDepth - 1);
      if (!stoppingBeforeCommit && state.stopping && state.committedSbcSubmitDepth === 0) {
        log('Stop requested during SBC submission; inventory synchronization completed before stopping');
      }
    }
  }

  async function runCommittedPackOpen(operation, context = {}) {
    state.committedPackOpenDepth++;
    try {
      return await operation();
    } finally {
      state.committedPackOpenDepth = Math.max(0, state.committedPackOpenDepth - 1);
      if (state.stopping && state.committedPackOpenDepth === 0) {
        const packId = Number(context.packRef?.id || 0) || null;
        log(`Stop requested during pack open${packId ? ` #${packId}` : ''}; reward settlement and inventory synchronization completed before stopping`);
      }
    }
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
    syncPackCatalogInventory();
    return result;
  }

  function mergeStorePacksFromController(controller = ctrl()) {
    const packs = uniquePacks([
      ...collectPackLikeObjects(controller),
      ...getRepositoryMyPacks(),
      ...(state.lastStorePacks || []),
    ]).slice(0, 300);
    if (packs.length) state.lastStorePacks = packs;
    syncPackCatalogInventory();
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
    const notifyStage = async (stage) => {
      if (typeof options.onStage !== 'function') return;
      try {
        await options.onStage(stage);
      } catch (error) {
        log(`Inventory refresh diagnostic failed after ${stage}: ${error?.message || error}`);
      }
    };
    if (!quiet) log(`Refreshing caches: ${reason}`);

    if (options.includePacks !== false) {
      await refreshStorePacks().catch((e) => {
        if (!quiet) log(`Store pack refresh skipped: ${e.message || e}`);
      });
      await notifyStage('packs');
    }

    await refreshUnassigned({ quiet }).catch((e) => {
      if (!quiet) log(`Unassigned refresh skipped: ${e.message || e}`);
    });
    await notifyStage('unassigned');

    await refreshPileCacheByCandidates('club', options);
    await notifyStage('club');
    await refreshPileCacheByCandidates('storage', options);
    await notifyStage('storage');
    await refreshPileCacheByCandidates('transfer', options);
    await notifyStage('transfer');

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
    return state.stalePackTracker.isStale(pack);
  }

  function markStalePack(pack, options = {}) {
    if (options.gone === true) {
      const marked = state.stalePackTracker.markGone(pack);
      if (marked.added && marked.id) {
        log(`Pack #${marked.id} marked gone for this session after 404; further lookups will skip it`);
      }
      return;
    }
    state.stalePackTracker.markObject(pack);
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

  function syncPackCatalogInventory() {
    state.packCatalog = updatePackCatalogInventory(
      state.packCatalog,
      getPackInventorySnapshot().groups,
    );
    return state.packCatalog.inventory;
  }

  function sourceRewardLoopIds(loopDefs = getConfiguredLoopDefs()) {
    const ids = new Set();
    for (const loopDef of loopDefs || []) {
      const direct = String(loopDef?.sourcePackRef?.rewardOfLoopId || '').trim();
      if (direct) ids.add(direct);
      for (const source of loopDef?.shortagePacks || []) {
        const nested = String(source?.sourcePackRef?.rewardOfLoopId || '').trim();
        if (nested) ids.add(nested);
      }
    }
    return ids;
  }

  async function refreshPackCatalogFromSbcIndex(refreshResult) {
    await refreshStorePacks().catch((error) => {
      log(`Pack Catalog: My Packs refresh failed; keeping current inventory snapshot (${error?.message || error})`);
    });
    const indexes = getSbcSets().map((set) => eaSbcAdapter().snapshotDiscoveryIndex(set, refreshResult));
    const loopDefs = getLoopDefs();
    state.packCatalog = createPackCatalog({
      packs: getPackInventorySnapshot().groups,
      sbcIndexes: indexes,
      loopDefs,
      previousCatalog: state.packCatalog,
    });
    const rewardSets = state.packCatalog.sbcRewards.filter((entry) => entry.packIds.length || entry.packNames.length);
    const referencedIds = sourceRewardLoopIds(loopDefs);
    const resolvedReferences = [...referencedIds].filter((loopId) => {
      const reward = state.packCatalog.loopRewards?.[loopId];
      return reward?.packIds?.length || reward?.packNames?.length;
    });
    log(`Pack Catalog: ${state.packCatalog.inventory.reduce((total, group) => total + group.count, 0)} current My Packs across ${state.packCatalog.inventory.length} type(s); ${rewardSets.length} SBC Set reward binding(s); ${resolvedReferences.length}/${referencedIds.size} referenced source Loop(s) resolved`);
    for (const loopId of referencedIds) {
      const reward = state.packCatalog.loopRewards?.[loopId];
      if (reward?.packIds?.length || reward?.packNames?.length) continue;
      log(`Pack Catalog: reward source Loop ${loopId} is not dynamically resolved; configured pack ID/name fallback remains active`);
    }
    return state.packCatalog;
  }

  function recordObservedPackCatalogReward(set, packId) {
    const id = Number(packId || 0);
    if (!id) return;
    const pack = findPackById(id);
    state.packCatalog = recordObservedSbcReward(state.packCatalog, {
      setId: Number(set?.id || 0) || null,
      setName: String(set?.name || ''),
      packId: id,
      packName: packName(pack),
    });
    state.packCatalog = bindPackCatalogLoops(state.packCatalog, getLoopDefs());
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
    let result;
    try {
      result = await observeOnce(
        eaInventoryAdapter().move(items, pile, allowStorage),
        ctrl(),
        25000,
        `moveItems(${pile})`,
      );
    } catch (error) {
      log(`Item move diagnostic exception: ${diagnosticJson({
        pile,
        allowStorage,
        items: items.map((item) => captureRuntimeInventoryItem(item, { identify: identifyRuntimeInventoryItem })),
        error: captureMoveResult(error),
      })}`);
      throw error;
    }
    if (!result?.success) {
      log(`Item move diagnostic failure: ${diagnosticJson({
        pile,
        allowStorage,
        items: items.map((item) => captureRuntimeInventoryItem(item, { identify: identifyRuntimeInventoryItem })),
        result: captureMoveResult(result),
      })}`);
      fail(`Move failed: ${result?.error?.code || result?.status || 'unknown'}`);
    }
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

  function isProtectedHighGold(item, threshold = 82) {
    const minRating = Math.max(2, Math.min(99, Number(threshold) || 82));
    return isGold(item) && Number(item?.rating || 0) >= minRating;
  }

  function resolveProtectHighGoldThreshold(options = {}) {
    const raw = options.highGoldThreshold ?? options.pickHighGoldThreshold ?? options.protectHighGoldMinRating ?? 82;
    const value = Number(raw);
    return Math.max(2, Math.min(99, Number.isFinite(value) && value > 0 ? value : 82));
  }

  function isRare(item) {
    return isRarePlayerCard(item);
  }

  function itemRareFlag(item) {
    return readPlayerRareFlag(item);
  }

  function isSpecial(item) {
    return isSpecialPlayerCard(item);
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
    const goldConsumption = runtimeGoldConsumptionMode(spec);
    if (goldConsumption === 'rare-only' && !isRare(item)) return false;
    if (goldConsumption === 'common-only' && isRare(item)) return false;
    return true;
  }

  function isTargetDuplicate(item, loopDef) {
    const spec = loopDef?.targetDuplicate || {};
    return isDuplicate(item) && isSbcUsablePlayer(item, spec) && itemMatchesSpec(item, spec);
  }

  function isDuplicate(item) {
    try {
      if (typeof item?.isDuplicate === 'function') return item.isDuplicate() === true;
    } catch { }
    return item?.duplicate === true || Number(item?.duplicateId || 0) > 0;
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
    return isPlayerEvolutionCard(item);
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
    const respectFsuGoldRange = context?.respectFsuGoldRange !== undefined
      ? context.respectFsuGoldRange !== false
      : context?.sbcFodderPolicy?.mode !== 'rating-constrained';
    if (isNormalGoldFodder(item) && respectFsuGoldRange) {
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

  function getRatingSbcPriorityPiles(loopDef = {}, settings = getFsuSettings()) {
    const configured = loopDef.ratingSbcFill?.priorityPiles || loopDef.priorityPiles || ['unassigned', 'storage', 'transfer', 'club'];
    return applyFsuPilePriority([...configured], settings);
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
    if (options.protectHighGold && isProtectedHighGold(item, resolveProtectHighGoldThreshold(options))) return false;
    const policy = options.sbcFodderPolicy;
    const lowRatedGoldMaxRating = Number(options.lowRatedGoldMaxRating || getSbcFodderRuntimeOptions().lowRatedGoldMaxRating || 0);
    if (policy?.mode !== 'rating-constrained' && isNormalGoldFodder(item) && lowRatedGoldMaxRating > 0 && Number(item?.rating || 0) > lowRatedGoldMaxRating) return false;
    if (policy?.mode === 'rating-constrained'
      && Number(policy.ratingSbcMaxCardRating || 0) > 0
      && Number(item?.rating || 0) > Number(policy.ratingSbcMaxCardRating)) return false;
    if (isLimitedUseItem(item)) return false;
    if (isConceptItem(item)) return false;
    try { if (item?.isEnrolledInAcademy?.()) return false; } catch { }
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) return false;
    if (!isInactiveTrade(item)) return false;
    const fsuContext = {
      ...(context || {}),
      sbcFodderPolicy: context?.sbcFodderPolicy || options.sbcFodderPolicy,
      respectFsuGoldRange: context?.respectFsuGoldRange !== undefined
        ? context.respectFsuGoldRange
        : options.respectFsuGoldRange !== undefined
          ? options.respectFsuGoldRange
          : options.sbcFodderPolicy?.mode !== 'rating-constrained',
    };
    if (getFsuRejectReasons(item, options, context?.settings, fsuContext).length) return false;
    return true;
  }

  function findClubDuplicate(item) {
    const duplicateId = Number(item?.duplicateId || 0);
    const clubItems = getClubItems();
    if (duplicateId) {
      const byId = clubItems.find((clubItem) => Number(clubItem?.id) === duplicateId);
      if (byId && isSamePlayerCardVersion(item, byId)) return byId;
    }
    return clubItems.find((clubItem) => (
      Number(clubItem?.id || 0) !== Number(item?.id || 0)
        && isSamePlayerCardVersion(item, clubItem)
    ));
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
    let activeActionItems = [];
    const adapter = adapters.inventory({ capacityFallbacks: { storage: CFG.storageMax } });
    const diagnosticPiles = () => ({
      unassigned: getUnassignedItems(),
      storage: getStorageItems(),
      transfer: getTransferItems(),
      club: getClubItems(),
    });
    const captureActionState = (action, attemptedItems = activeActionItems) => {
      try {
        const piles = diagnosticPiles();
        const refs = action?.itemRefs || [];
        const definitions = [...new Set(refs.map((ref) => Number(ref?.definitionId || 0)).filter(Boolean))];
        return {
          action: {
            type: action?.type || null,
            destination: action?.destination || null,
            description: action?.description || null,
            itemRefs: refs,
          },
          attemptedItems: attemptedItems.map((item) => captureRuntimeInventoryItem(item, {
            identify: identifyRuntimeInventoryItem,
          })),
          exactLocations: refs.map((ref) => ({
            ref,
            piles: Object.fromEntries(Object.entries(piles).map(([pileName, items]) => [
              pileName,
              items
                .filter((item) => Number(item?.id || 0) === Number(ref?.id || 0))
                .map((item) => captureRuntimeInventoryItem(item, { identify: identifyRuntimeInventoryItem })),
            ])),
          })),
          definitions: Object.fromEntries(definitions.map((definitionId) => [
            String(definitionId),
            captureDefinitionPileState(piles, definitionId, { identify: identifyRuntimeInventoryItem }),
          ])),
          capacity: {
            storageFree: storageSpaceLeft(),
            transferFree: transferSpaceLeft(),
          },
        };
      } catch (error) {
        return { diagnosticError: error?.message || String(error) };
      }
    };
    const getSnapshot = async () => {
      await options.beforeSnapshot?.();
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
    let latestSnapshot = null;
    const result = await resolveUnassigned({
      getSnapshot: async () => {
        latestSnapshot = await getSnapshot();
        return latestSnapshot;
      },
      dryRun: options.dryRun === true || state.loopStack.some((loopDef) => loopDef?.dryRun === true),
      reserveItem: (item) => reservedIds.has(Number(item?.id || 0)),
      overflowResolvers: [...(options.overflowResolvers || []), ...configuredResolvers],
      blockedPolicy: options.blockedPolicy || 'fail',
      activeResolvers: options.activeResolvers,
      maxIterations: options.maxIterations || 20,
      actionProgressAttempts: options.actionProgressAttempts || 6,
      onActionProgressRetry: async ({ action, attempt, maxAttempts }) => {
        if (attempt === 1) {
          log(`Unassigned ${action.description} move is waiting for EA repository settlement (${attempt + 1}/${maxAttempts})`);
        }
        log(`Unassigned move diagnostic settlement ${attempt + 1}/${maxAttempts}: ${diagnosticJson(captureActionState(action))}`);
        await sleep(Math.min(1800, 500 + attempt * 250));
      },
      onActionNoProgress: async ({ action, attempts }) => {
        log(`Unassigned move diagnostic no progress after ${attempts} check(s): ${diagnosticJson(captureActionState(action))}`);
      },
      onActionReplan: async ({ action, reason: replanReason, replan, maxReplans }) => {
        log(`Unassigned ${action.description} action will be replanned (${replan}/${maxReplans}): ${replanReason}`);
      },
      executeAction: async (action) => {
        stopPoint();
        const items = action.itemRefs.map((ref) => adapter.resolveItem(ref, ['unassigned'])?.item).filter(Boolean);
        if (items.length !== action.itemRefs.length) {
          fail(`Unassigned ${action.description} action could resolve only ${items.length}/${action.itemRefs.length} item(s)`);
        }
        if (action.requiresExactClubDuplicate === true) {
          const staleItems = [];
          for (const item of items) {
            const snapshotItem = latestSnapshot?.piles?.unassigned?.find((candidate) => (
              Number(candidate?.id || 0) === Number(item?.id || 0)
            ));
            const clubDuplicate = findClubDuplicate(snapshotItem || item);
            if (!clubDuplicate) {
              staleItems.push(item);
              continue;
            }
            const duplicateId = Number(clubDuplicate.id || 0);
            item.duplicateId = duplicateId;
            if (item._duplicateId !== undefined) item._duplicateId = duplicateId;
            adapter.preparePurchasedItem(item);
          }
          if (staleItems.length) {
            for (const item of staleItems) {
              try { item.duplicateId = 0; } catch { }
              try { if (item._duplicateId !== undefined) item._duplicateId = 0; } catch { }
              try { if (item._data && item._data.duplicateId !== undefined) item._data.duplicateId = 0; } catch { }
            }
            const names = staleItems.map((item) => itemDisplayName(item)).join(', ');
            await refreshUnassigned();
            for (const ref of action.itemRefs) {
              const live = adapter.resolveItem(ref, ['unassigned'])?.item;
              if (!live || findClubDuplicate(live)) continue;
              try { live.duplicateId = 0; } catch { }
              try { if (live._duplicateId !== undefined) live._duplicateId = 0; } catch { }
              try { if (live._data && live._data.duplicateId !== undefined) live._data.duplicateId = 0; } catch { }
            }
            return {
              status: 'replan',
              reason: `${staleItems.length} item(s) no longer have an exact same-version Club counterpart (${names})`,
            };
          }
        }
        activeActionItems = items;
        log(`Unassigned move diagnostic before: ${diagnosticJson(captureActionState(action, items))}`);
        let moveResult;
        if (action.type === 'swap') {
          log(`Swapping ${items.length} untradeable duplicate(s) with tradeable club version(s)`);
          moveResult = await moveItems(items, inventoryPile('club'), true);
        } else if (action.destination === 'club') {
          log(`Moving ${items.length} non-duplicate unassigned item(s) to club`);
          moveResult = await moveItems(items, inventoryPile('club'), true);
        } else if (action.destination === 'transfer') {
          log(`Moving ${items.length} tradeable duplicate(s) to transfer list`);
          moveResult = await moveItems(items, inventoryPile('transfer'), false);
        } else if (action.destination === 'storage') {
          log(`Moving ${items.length} untradeable duplicate(s) to SBC storage`);
          moveResult = await moveItems(items, inventoryPile('storage'), true);
        } else {
          fail(`Unsupported Unassigned action destination: ${action.destination}`);
        }
        log(`Unassigned move diagnostic result: ${diagnosticJson(captureMoveResult(moveResult))}`);
        const refreshResult = await refreshUnassigned();
        log(`Unassigned move diagnostic after refresh: ${diagnosticJson({
          refresh: captureMoveResult(refreshResult),
          state: captureActionState(action, items),
        })}`);
      },
    });

    if (result.status === 'blocked') {
      const blocked = result.plan?.blocked;
      const reasonCode = blocked?.destination === 'storage'
        ? 'PROTECTED_STORAGE_BLOCKED'
        : blocked?.destination === 'transfer'
          ? 'UNASSIGNED_TRANSFER_BLOCKED'
          : 'UNASSIGNED_CLEANUP_BLOCKED';
      const blockedReason = blocked?.destination === 'storage'
        ? `SBC storage has only ${blocked.free} slot(s), but ${blocked.required} item(s) need moving`
        : blocked?.destination === 'transfer'
          ? `Transfer list has only ${blocked.free} slot(s), but ${blocked.required} item(s) need moving`
          : result.reason || 'Unassigned cleanup blocked';
      if (options.returnBlockedResult === true) {
        return {
          ...result,
          reason: blockedReason,
          reasonCode,
          details: {
            destination: blocked?.destination || null,
            free: blocked?.free ?? null,
            required: blocked?.required ?? null,
            itemRefs: blocked?.itemRefs || [],
          },
        };
      }
      fail(blockedReason);
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

  function materializeOpenedResponsePlayerDuplicates(items, label = 'opened reward pack') {
    const result = materializeOpenedPlayerDuplicates({
      items,
      clubItems: getClubItems(),
      isPlayer,
      isDuplicate,
      preparePurchasedItem: (item) => eaInventoryAdapter().preparePurchasedItem(item),
    });
    if (result.inferredDuplicates.length) {
      log(`${label}: restored delayed duplicate metadata for ${result.inferredDuplicates.length} opened player(s) from matching Club entities`);
    }
    return result;
  }

  function restoreOpenedUnassignedDuplicateMetadata(items, label = 'opened reward pack', options = {}) {
    const unassignedItems = getUnassignedItems();
    const responseDuplicates = (items || []).filter((item) => isDuplicate(item));
    const responseById = new Map((items || [])
      .map((item) => [Number(item?.id || 0), item])
      .filter(([id]) => id));
    let restored = 0;
    let remapped = 0;
    const restore = (item, responseItem) => {
      if (!responseItem) return;
      const clubDuplicate = findClubDuplicate(item) || findClubDuplicate(responseItem);
      const before = captureRuntimeInventoryItem(item, { identify: identifyRuntimeInventoryItem });
      const duplicateId = Number(item?.duplicateId || clubDuplicate?.id || 0);
      const duplicateIdSource = Number(item?.duplicateId || 0)
        ? 'live'
        : Number(clubDuplicate?.id || 0)
          ? Number(responseItem?.duplicateId || 0) === Number(clubDuplicate.id || 0)
            ? 'pack-response-verified'
            : 'club-match'
          : 'none';
      if (duplicateId && !Number(item?.duplicateId || 0)) {
        item.duplicateId = duplicateId;
        if (item._duplicateId !== undefined) item._duplicateId = duplicateId;
        restored++;
      }
      eaInventoryAdapter().preparePurchasedItem(item);
      const after = captureRuntimeInventoryItem(item, { identify: identifyRuntimeInventoryItem });
      if (diagnosticJson(before) !== diagnosticJson(after)) {
        log(`${label}: live Unassigned metadata mutation: ${diagnosticJson({
          duplicateIdSource,
          sameAsPackResponse: item === responseItem,
          sameAsClubDuplicate: item === clubDuplicate,
          before,
          packResponse: captureRuntimeInventoryItem(responseItem, { identify: identifyRuntimeInventoryItem }),
          clubDuplicate: captureRuntimeInventoryItem(clubDuplicate, { identify: identifyRuntimeInventoryItem }),
          after,
        })}`);
      }
    };
    for (const item of unassignedItems) {
      const responseItem = responseById.get(Number(item?.id || 0));
      restore(item, responseItem);
    }
    const baselineUnassignedIds = options.routingBaseline?.unassignedIds;
    const aliases = Array.isArray(baselineUnassignedIds)
      ? matchOpenedItemsToNewPileAliases({
          items: (items || []).filter((item) => isDuplicate(item)),
          pileItems: unassignedItems,
          baselineIds: baselineUnassignedIds,
        })
      : [];
    for (const { item: responseItem, alias } of aliases) {
      if (Number(alias?.id || 0) === Number(responseItem?.id || 0)) continue;
      const before = restored;
      restore(alias, responseItem);
      if (restored > before) remapped++;
    }
    if (restored) {
      log(`${label}: restored delayed duplicate metadata on ${restored} live Unassigned item(s)${remapped ? ` (${remapped} remapped response id(s))` : ''}`);
    } else if (responseDuplicates.length) {
      const describe = (item) => `id:${Number(item?.id || 0) || '?'} def:${Number(item?.definitionId || 0) || '?'} rating:${Number(item?.rating || 0) || '?'} dup:${Number(item?.duplicateId || 0) || '?'}`;
      log(`${label}: duplicate metadata restore snapshot response:${responseDuplicates.length} [${responseDuplicates.map(describe).join('; ')}] liveUnassigned:${unassignedItems.length} [${unassignedItems.map(describe).join('; ')}] baselineUnassigned:${Array.isArray(baselineUnassignedIds) ? baselineUnassignedIds.length : '?'}`);
    }
    return restored;
  }

  async function materializeOpenedDuplicatesFresh(items, label, options = {}) {
    const openedItems = uniqueItems((items || []).filter((item) => isPlayer(item)));
    if (!openedItems.length) {
      return {
        status: 'confirmed',
        attempts: 0,
        matchedCount: 0,
        unresolvedCount: 0,
        matches: [],
        unresolvedItems: [],
        records: [],
      };
    }
    const inventoryAdapter = eaInventoryAdapter();
    const result = await materializeFreshUnassigned({
      openedItems,
      baselineIds: options.routingBaseline?.unassignedIds || [],
      attempts: 2,
      invalidate: () => inventoryAdapter.invalidateUnassigned(),
      requestFresh: () => refreshUnassigned({
        attempts: 1,
        allowCacheFallback: false,
        quiet: true,
      }),
      readRepositoryItems: () => inventoryAdapter.readPile('unassigned'),
      readRepositoryState: () => inventoryAdapter.unassignedState(),
      triggerNavigation: async () => {
        const from = currentControllerName();
        const requested = pageRuntime.gotoUnassigned(ctrl());
        if (requested?.requested) {
          await waitLoadingEnd(250, 8000).catch(() => null);
          await sleep(250);
        }
        const to = currentControllerName();
        return {
          ...requested,
          from,
          to,
          confirmed: /Unassigned/i.test(to),
        };
      },
    });
    for (const record of result.records) {
      log(`${label}: forced Unassigned materialization attempt ${record.attempt}/${result.attempts}: ${diagnosticJson(record)}`);
    }
    const evidence = {
      status: result.status,
      matched: result.matches.map(({ opened, live, via }) => ({
        via,
        opened: captureRuntimeInventoryItem(opened, { identify: identifyRuntimeInventoryItem }),
        live: captureRuntimeInventoryItem(live, { identify: identifyRuntimeInventoryItem }),
      })),
      unresolved: result.unresolvedItems.map((item) => (
        captureRuntimeInventoryItem(item, { identify: identifyRuntimeInventoryItem })
      )),
    };
    log(`${label}: forced Unassigned materialization ${result.status} (${result.matchedCount}/${openedItems.length} complete): ${diagnosticJson(evidence)}`);
    return result;
  }

  async function materializeOpenedPlayerRewards(items, label = 'opened reward pack', options = {}) {
    const players = uniqueItems((items || []).filter((item) => isPlayer(item)));
    if (!players.length) return { moved: 0, deferredDuplicates: [], freshMaterialization: null };
    const materialized = materializeOpenedResponsePlayerDuplicates(players, label);

    const moved = await tryMoveOpenedRewardItems(
      materialized.directItems,
      inventoryPile('club'),
      true,
      label,
      'non-duplicate',
    );

    // Pack-response duplicate entities can precede EA's live Unassigned entities. Moving
    // them directly can leave a stale Unassigned mirror that the resolver moves a second
    // time. Let the shared Unassigned resolver route duplicates only after materialization.
    if (materialized.deferredDuplicates.length) {
      log(`${label}: waiting for ${materialized.deferredDuplicates.length} duplicate opened reward item(s) to materialize in Unassigned`);
    }
    const freshMaterialization = materialized.deferredDuplicates.length
      ? await materializeOpenedDuplicatesFresh(materialized.deferredDuplicates, label, options)
      : null;

    if (moved) {
      await refreshInventoryCaches(`${label} direct reward move`, { includePacks: false, quiet: true });
      resolveRecentRewardItems(`${label} direct reward move`);
    }
    return { ...materialized, moved, freshMaterialization };
  }

  async function tryDirectlySettleUnmaterializedOpenedDuplicates({
    openedItems,
    materialized,
    routing,
    label,
    routingBaseline,
  }) {
    const pendingIds = new Set((routing?.pendingItems || []).map((item) => Number(item?.id || 0)).filter(Boolean));
    const duplicates = uniqueItems((materialized?.deferredDuplicates || [])
      .filter((item) => pendingIds.has(Number(item?.id || 0))));
    if (!duplicates.length) return null;

    await refreshInventoryCaches(`${label} direct duplicate fallback preflight`, { includePacks: false, quiet: true });
    const materialization = partitionOpenedItemsByLiveUnassigned({
      items: duplicates,
      pileItems: getUnassignedItems(),
      baselineIds: routingBaseline?.unassignedIds || [],
    });
    const unresolvedDuplicates = materialization.unresolvedItems;
    if (!unresolvedDuplicates.length) {
      log(`${label}: direct duplicate fallback skipped because every pending duplicate has a live Unassigned entity`);
      return null;
    }
    if (materialization.materializedItems.length) {
      log(`${label}: direct duplicate fallback preserving ${materialization.materializedItems.length} live Unassigned duplicate response item(s); routing ${unresolvedDuplicates.length} unmaterialized duplicate response item(s)`);
    }

    const fallbackPlan = planUnmaterializedDuplicateFallback({
      items: unresolvedDuplicates,
      isTradeable,
      findClubDuplicate,
      capacities: {
        storage: storageSpaceLeft(),
        transfer: transferSpaceLeft(),
      },
    });
    if (fallbackPlan.status === 'blocked') {
      const blocked = fallbackPlan.blocked;
      const reason = `direct duplicate fallback blocked: ${blocked.destination} has only ${blocked.free} slot(s) for ${blocked.required} item(s)`;
      log(`${label}: ${reason}`);
      return {
        status: 'preserved',
        reason,
        cleanup: { status: 'preserved', reason, plan: { blocked } },
        routing,
        moved: 0,
      };
    }

    log(`${label}: no matching live Unassigned entity for ${unresolvedDuplicates.length} unmaterialized duplicate response item(s) after bounded settlement; attempting direct routing`);
    let moved = 0;
    for (const group of fallbackPlan.groups) {
      moved += await tryMoveOpenedRewardItems(
        group.items,
        inventoryPile(group.key),
        group.allowStorage,
        label,
        group.description,
      );
    }
    if (moved !== unresolvedDuplicates.length) {
      log(`${label}: direct duplicate fallback moved ${moved}/${unresolvedDuplicates.length}; preserving unresolved response item(s)`);
      return null;
    }

    await sleep(CFG.pauseMs);
    await refreshInventoryCaches(`${label} direct duplicate fallback`, { includePacks: false, quiet: true });
    const postMoveMaterialization = partitionOpenedItemsByLiveUnassigned({
      items: unresolvedDuplicates,
      responseItems: duplicates,
      pileItems: getUnassignedItems(),
      baselineIds: routingBaseline?.unassignedIds || [],
    });
    if (postMoveMaterialization.materializedItems.length) {
      const pending = openedItemRoutingResult(openedItems, null, {}, routingBaseline);
      log(`${label}: direct duplicate fallback detected a new live Unassigned entity after move; preserving it to avoid a second route`);
      return {
        status: 'preserved',
        reason: 'direct duplicate fallback left a live Unassigned entity for manual resolution',
        cleanup: { status: 'preserved', reason: 'direct duplicate fallback left a live Unassigned entity for manual resolution' },
        routing: pending,
        moved,
      };
    }

    const confirmed = await confirmOpenedItemRouting(openedItems, label, { routingBaseline });
    if (confirmed.pendingItems.length) {
      log(`${label}: direct duplicate fallback moved ${moved} item(s), but EA did not confirm every destination; preserving`);
      return { status: 'pending', cleanup: null, routing: confirmed, moved };
    }
    log(`${label}: direct duplicate fallback confirmed ${moved} routed response item(s)`);
    return { status: 'resolved', cleanup: { status: 'resolved' }, routing: confirmed, moved };
  }

  function openedItemRoutingResult(items, reserveItem = null, details = {}, routingBaseline = null) {
    return {
      ...classifyOpenedItemRouting({
        items,
        reserveItem,
        routingBaseline,
        piles: {
          unassigned: getUnassignedItems(),
          club: getClubItems(),
          storage: getStorageItems(),
          transfer: getTransferItems(),
        },
      }),
      details,
    };
  }

  async function confirmOpenedItemRouting(items, label, options = {}) {
    const attempts = Math.max(1, Math.min(8, Number(options.attempts || 4) || 4));
    const delayMs = Math.max(0, Number(options.delayMs ?? 500));
    let routing = openedItemRoutingResult(items, options.reserveItem || null, {}, options.routingBaseline || null);
    for (let attempt = 1; attempt <= attempts && routing.pendingItems.length; attempt++) {
      await refreshUnassigned({ quiet: true });
      await refreshPileCacheByCandidates('storage', { quiet: true });
      await refreshPileCacheByCandidates('transfer', { quiet: true });
      routing = openedItemRoutingResult(items, options.reserveItem || null, {}, options.routingBaseline || null);
      if (!routing.pendingItems.length || attempt >= attempts) break;
      await sleep(delayMs);
    }
    for (const route of routing.aliasRoutes || []) {
      log(`${label}: confirmed opened item via new ${route.destination.pile} entity ${Number(route.destination.item?.id || 0) || '?'} for response id:${Number(route.item?.id || 0) || '?'} def:${Number(route.item?.definitionId || 0) || '?'}`);
    }
    if (routing.pendingItems.length) {
      const ids = routing.pendingItems.map((item) => Number(item?.id || 0) || '?').join(', ');
      log(`${label}: ${routing.pendingItems.length} opened item(s) still have no confirmed destination after ${attempts} check(s); ids:${ids}`);
      const describe = (item) => `id:${Number(item?.id || 0) || '?'} def:${Number(item?.definitionId || 0) || '?'} rating:${Number(item?.rating || 0) || '?'} dup:${Number(item?.duplicateId || 0) || '?'}`;
      const baseline = options.routingBaseline || {};
      log(`${label}: routing snapshot pending:[${routing.pendingItems.map(describe).join('; ')}]; piles unassigned:${getUnassignedItems().length} storage:${getStorageItems().length} transfer:${getTransferItems().length} club:${getClubItems().length}; baseline destinations:${Array.isArray(baseline.destinationIds) ? baseline.destinationIds.length : '?'} unassigned:${Array.isArray(baseline.unassignedIds) ? baseline.unassignedIds.length : '?'}`);
    }
    return routing;
  }

  function recordLoopPackReceipt(receipt, sourceLabel = null) {
    if (!state.loopRecapSession || receipt?.status !== 'opened') return;
    if (state.loopRecapSession.rollingAggregator) {
      state.loopRecapSession.rollingAggregator.recordPackReceipt(receipt, { sourceLabel });
      return;
    }
    state.loopRecapSession.receipts.push(receipt);
  }

  function rollingRecapAggregator() {
    return state.loopRecapSession?.rollingAggregator || null;
  }

  function recordRollingRecapItems(items, context = {}) {
    rollingRecapAggregator()?.recordItems(items, context);
  }

  function recordRollingRecapRecovery(action, options = {}) {
    rollingRecapAggregator()?.recordRecovery(action, options);
  }

  function recordRollingRecapDuplicateRoute(route, count) {
    rollingRecapAggregator()?.recordDuplicateRoute(route, count);
  }

  function rollingDuplicatePlayerCount(input = []) {
    if (Array.isArray(input?.entries)) {
      const signalCount = input.entries.filter((entry) => entry?.signal).length;
      if (signalCount > 0) return signalCount;
    }
    if (Array.isArray(input?.duplicateSignals)) return input.duplicateSignals.length;
    const items = Array.isArray(input)
      ? input
      : Array.isArray(input?.selected)
        ? input.selected
        : [];
    return items.filter((entry) => {
      const item = entry?.item || entry;
      return isPlayer(item) && isDuplicate(item);
    }).length;
  }

  function isDryRunEffectGuarded(options = {}) {
    return options.dryRun === true || state.loopStack.some((loopDef) => loopDef?.dryRun === true);
  }

  function captureRuntimePackOpenRetrySnapshot(pack, options = {}) {
    return capturePackOpenRetrySnapshot({
      pack,
      packs: getRepositoryMyPacks(),
      piles: {
        unassigned: getUnassignedItems(),
        storage: getStorageItems(),
        transfer: getTransferItems(),
        club: getClubItems(),
      },
      stable: options.stable,
      stableReadCount: options.stableReadCount,
    });
  }

  async function captureStableRuntimePackOpenRetrySnapshot(pack) {
    let previous = captureRuntimePackOpenRetrySnapshot(pack);
    let stableReadCount = 1;
    for (let read = 2; read <= 3; read++) {
      await sleep(450);
      const current = captureRuntimePackOpenRetrySnapshot(pack);
      stableReadCount = samePackOpenRetrySnapshot(previous, current) ? stableReadCount + 1 : 1;
      previous = current;
      if (stableReadCount >= 2) {
        return { ...current, stable: true, stableReadCount };
      }
    }
    return { ...previous, stable: false, stableReadCount };
  }

  async function inspectFreshRuntimeUnassigned() {
    const inventoryAdapter = eaInventoryAdapter();
    const invalidation = await inventoryAdapter.invalidateUnassigned();
    const result = await refreshUnassigned({
      attempts: 2,
      allowCacheFallback: false,
      quiet: true,
    });
    const items = inventoryAdapter.readPile('unassigned');
    return {
      verified: items.length > 0 || (result?.success === true && invalidation?.invalidated === true),
      source: 'fresh-purchased-api',
      items,
      details: {
        invalidation,
        status: result?.status ?? null,
        repository: inventoryAdapter.unassignedState(),
      },
    };
  }

  async function openPack(pack, purpose, options = {}) {
    if (!pack) fail(`Pack not found for ${purpose}`);
    if (typeof options.openedItemPolicy !== 'function') {
      fail(`Opened item policy is required for ${purpose}`);
    }
    const packAdapter = adapters.pack();
    const inventoryAdapter = adapters.inventory({ capacityFallbacks: { storage: CFG.storageMax } });
    let currentPack = pack;
    let routingBaseline = null;
    let retryBaseline = null;
    let retryFailedPack = null;
    let retryDecision = null;
    let committedReceiptSettled = false;
    const retryCodes = [...new Set([
      ...(options.retryCodes || (options.retryOn471 === true ? ['471'] : [])).map(String),
      ...DEFAULT_PACK_OPEN_RETRY_CODES,
    ])];
    const preOpenUnassignedOptions = options.preOpenUnassignedOptions || {};
    const dryRun = isDryRunEffectGuarded(options);
    const receipt = await openPackTransaction({
      dryRun,
      runCommitted: runCommittedPackOpen,
      preOpenResolver: () => resolveRuntimeUnassigned(
        `opening ${purpose}`,
        preOpenUnassignedOptions,
      ),
      packSelector: async ({ attempt, lastReason }) => {
        if (attempt === 1) return currentPack;
        const failedPack = retryFailedPack || currentPack;
        const resolvedPack = typeof options.resolveRetryPack === 'function'
          ? await options.resolveRetryPack()
          : null;
        const current = await captureStableRuntimePackOpenRetrySnapshot(failedPack);
        retryDecision = decidePackOpenRetry({
          code: lastReason,
          failedPack,
          resolvedPack,
          baseline: retryBaseline,
          current,
        });
        const evidence = retryDecision.evidence || {};
        const summary = `packs:${evidence.packCountBefore ?? '?'}->${evidence.packCountAfter ?? '?'}; added items:${evidence.addedItemIds?.length || 0}; stable reads:${evidence.stableReadCount || 0}`;
        if (retryDecision.action === 'retry') {
          currentPack = retryDecision.pack;
          log(`${purpose}: pack-open retry reconciled (${retryDecision.source}; ${summary})`);
        } else {
          currentPack = null;
          log(`${purpose}: pack-open retry blocked; ${retryDecision.reason} (${summary})`);
        }
        return currentPack;
      },
      packUnavailableResult: ({ attempt }) => {
        if (attempt <= 1 || retryDecision?.action !== 'blocked') return null;
        return {
          status: 'blocked',
          packRef: {
            id: Number(retryFailedPack?.id || 0),
            name: packName(retryFailedPack),
          },
          reason: retryDecision.reason,
          details: {
            reasonCode: retryDecision.reason,
            retryEvidence: retryDecision.evidence,
          },
        };
      },
      packRef: (selectedPack) => ({ id: Number(selectedPack?.id || 0), name: packName(selectedPack) }),
      openTransport: async (selectedPack, { attempt }) => {
        if (attempt === 1) retryBaseline = captureRuntimePackOpenRetrySnapshot(selectedPack);
        routingBaseline = createOpenedItemRoutingBaseline({
          unassigned: getUnassignedItems(),
          club: getClubItems(),
          storage: getStorageItems(),
          transfer: getTransferItems(),
        });
        const name = packName(selectedPack);
        const attempts = retryCodes.length ? 2 : 1;
        log(`Opening pack: ${name} (#${selectedPack.id})${attempt > 1 ? ` retry ${attempt}/${attempts}` : ''}`);
        return await observeOnce(packAdapter.open(selectedPack), ctrl(), 30000, `open ${name}`);
      },
      normalizeItems: async (items, { pack: selectedPack }) => {
        markStalePack(selectedPack);
        await waitLoadingEnd();
        materializeOpenedResponsePlayerDuplicates(items, purpose);
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
      onCommittedTransportFailure: ({ code, packRef, itemCount, itemSource, evidence }) => {
        log(`${purpose}: EA returned ${code}, but ${itemCount} reward item(s) were present at ${itemSource}; treating the pack as committed and preserving the transport warning`);
        emitDiagnostic(log, () => `${purpose}: committed pack-open evidence: ${diagnosticJson(evidence)}`);
      },
      onTransportFailure: ({ attempt, code, pack, packRef, result }) => {
        emitDiagnostic(log, () => {
          const matchingPacks = getAvailableRepositoryMyPacks()
            .filter((candidate) => packIdKey(candidate) === packIdKey(packRef?.id));
          let pendingPlayerPicks = [];
          try { pendingPlayerPicks = eaPlayerPickAdapter().listUnassignedPlayerPicks(); } catch { }
          const packDiagnostics = {
            selectedIndex: matchingPacks.indexOf(pack),
            selected: captureRuntimePack(pack, { identify: identifyRuntimePack }),
            matchingSample: matchingPacks.slice(0, 5).map((candidate) => (
              captureRuntimePack(candidate, { identify: identifyRuntimePack })
            )),
            matchingTruncated: matchingPacks.length > 5,
          };
          const inventoryDiagnostics = {
            unassigned: eaInventoryAdapter().unassignedState(),
            pendingPlayerPicks: pendingPlayerPicks.map((item) => (
              captureRuntimeInventoryItem(item, { identify: identifyRuntimeInventoryItem })
            )),
            storage: eaInventoryAdapter().capacity('storage'),
          };
          return `${purpose}: pack open transport attempt ${attempt} failed; pack:${packRef?.name || '?'} (#${packRef?.id || '?'}); reason:${code}; matching packs:${matchingPacks.length}; unassigned:${getUnassignedItems().length}; controller:${currentControllerName() || '?'}; pack evidence:${diagnosticJson(packDiagnostics)}; inventory evidence:${diagnosticJson(inventoryDiagnostics)}; item evidence:${diagnosticJson(capturePackOpenResultEvidence(result))}; result:${diagnosticJson(captureMoveResult(result))}`;
        });
      },
      openedItemPolicy: (openedItems, context) => options.openedItemPolicy(openedItems, {
        ...context,
        routingBaseline,
      }),
      settleReceipt: async (openedReceipt, context) => {
        state.lastOpenPackReceipt = openedReceipt;
        recordLoopPackReceipt(openedReceipt, purpose);
        await options.settleReceipt?.(openedReceipt, context);
        committedReceiptSettled = true;
      },
      retryPolicy: { attempts: retryCodes.length ? 2 : 1, retryCodes },
      beforeRetry: async ({ code, pack: failedPack }) => {
        retryFailedPack = failedPack;
        retryDecision = null;
        if (isAmbiguousPackOpenFailure(code)) {
          markStalePack(failedPack);
          log(`${purpose}: excluding ambiguous pack instance #${Number(failedPack?.id || 0) || '?'} before retry`);
        }
        return recoverPackOpenRetry({
          label: purpose,
          code,
          pack: failedPack,
          log,
          markFailedPack: (item) => markStalePack(item),
          sleep,
          pauseMs: CFG.pauseMs,
          settleMs: 700,
          inspectFreshUnassigned: inspectFreshRuntimeUnassigned,
          unwind: () => unwindSbcSquadControllers(`${purpose} pack-open recovery`),
          showUnassigned: () => showUnassignedIfAny(`${purpose} pack-open recovery sync`, {
            stableEmptyReads: 3,
            emptyReadDelayMs: 450,
            requireNavigation: true,
            diagnostic: true,
          }),
          openStorePacks: () => openStorePacksViewForRefresh(`${purpose} pack-open Store recovery`),
          resolveUnassigned: () => resolveRuntimeUnassigned(`${purpose} pack-open recovery cleanup`, preOpenUnassignedOptions),
          refreshInventory: ({ storeRefreshed }) => refreshInventoryCaches(`${purpose} pack-open recovery`, {
            quiet: true,
            includePacks: !storeRefreshed,
          }),
        });
      },
      allowGone: options.allowGone === true,
      onGone: async (selectedPack) => {
        markStalePack(selectedPack, { gone: true });
        log(`Skipping stale pack for ${purpose}: ${packName(selectedPack)} (#${selectedPack.id}) returned 404`);
        await waitLoadingEnd().catch(() => null);
        await refreshStorePacks().catch(() => null);
      },
    });
    if (!committedReceiptSettled) {
      state.lastOpenPackReceipt = receipt;
      recordLoopPackReceipt(receipt, purpose);
    }
    stopPoint();
    if (receipt.status === 'planned') {
      log(`${purpose}: dry-run would open ${receipt.packRef?.name || packName(pack)} (#${receipt.packRef?.id || pack.id || '?'})`);
      return receipt;
    }
    if (receipt.status === 'opened') {
      if (receipt.pendingItemRefs.length && options.allowPendingItems !== true) {
        fail(`${purpose}: ${receipt.pendingItemRefs.length} opened item(s) remain unresolved; stopping before another pack or SBC action`);
      }
      return receipt;
    }
    if (receipt.status === 'stale' || receipt.status === 'unavailable') {
      if (receipt.status === 'unavailable') log(`${purpose}: no matching pack remains after recovery`);
      return null;
    }
    log(`${purpose}: pack open blocked after ${receipt.attempts} attempt(s); reason:${receipt.reason || 'unknown'}`);
    if (options.returnBlockedReceipt === true && (
      receipt.details?.phase === 'pre-open'
      || [PACK_OPEN_RESPONSE_LOST, PACK_OPEN_RESULT_AMBIGUOUS].includes(receipt.reason)
    )) {
      return receipt;
    }
    fail(`Open pack failed: ${receipt.reason || 'unknown'}`);
  }

  async function findValidationSourcePack(loopDef) {
    await refreshStorePacks();
    return findSourcePackInCache({
      ...loopDef,
      sourcePackIds: loopDef.sourcePackIds || CFG.sourcePackIds,
      sourcePackNames: loopDef.sourcePackNames || CFG.sourcePackNames,
    });
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

  async function findSbcSetForDefIfPresent(definition = {}) {
    await ensureSbcSetsLoaded();
    const byId = findSbcSetByPreferredId(getSbcSets(), definition.sbcSetIds);
    if (byId) return byId;
    return getSbcSets().find((set) => matchesAny(set?.name, definition.sbcNames)) || null;
  }

  async function findSbcSetForLoopDef(loopDef, label = loopDef?.name || 'SBC') {
    await ensureSbcSetsLoaded();
    const setIds = [...new Set((loopDef?.sbcSetIds || []).map(Number).filter(Boolean))];
    if (setIds.length) {
      const byId = findSbcSetByPreferredId(getSbcSets(), setIds);
      if (byId) return byId;
      fail(`${label} SBC not found by configured Set id(s): ${setIds.join(', ')}`);
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

  function synchronizeCachedSbcChallengeSquad(set, challenge) {
    const challengeId = Number(challenge?.id || 0);
    if (!challengeId) return challenge;
    let cached = getCachedSbcChallenges(set).find((entry) => (
      Number(entry?.id || 0) === challengeId
    ));
    if (!cached) {
      try { cached = set?.getChallenge?.(challengeId) || null; } catch { cached = null; }
    }
    if (!cached || cached === challenge) return challenge;
    if (!challenge.squad && cached.squad) challenge.squad = cached.squad;
    if (challenge.squad && !cached.squad) cached.squad = challenge.squad;
    return challenge;
  }

  async function loadRatingSbcChallengeForSet(set, challenge, label, options = {}) {
    const hadSquad = Boolean(challenge?.squad);
    synchronizeCachedSbcChallengeSquad(set, challenge);
    if (!hadSquad && challenge?.squad) {
      log(`${label}: reusing cached challenge squad #${challenge?.id || '?'}`);
    }
    const loaded = await loadRatingSbcChallenge(challenge, label, options);
    synchronizeCachedSbcChallengeSquad(set, loaded);
    return loaded;
  }

  function hasRatingSbcChallengeRequirements(challenge) {
    return Array.isArray(challenge?.eligibilityRequirements) && challenge.eligibilityRequirements.length > 0;
  }

  async function requestRatingSbcChallenges(set, label = set?.name || 'rating SBC', options = {}) {
    const cached = getCachedSbcChallenges(set);
    const cachedAvailable = cached.find((challenge) =>
      !isCompletedChallenge(challenge) && hasRatingSbcChallengeRequirements(challenge)
    );
    if (options.force !== true && (cachedAvailable || (cached.length && isSbcSetComplete(set)))) {
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

  async function findAvailableRatingSbcChallengeContext(set, label = set?.name || 'rating SBC', options = {}) {
    const challenges = await requestRatingSbcChallenges(set, label, options);
    const available = challenges.filter((challenge) => !isCompletedChallenge(challenge));
    return {
      challenge: available[0] || null,
      challenges,
      incompleteCount: available.length,
    };
  }

  async function findAvailableRatingSbcChallenge(set, label = set?.name || 'rating SBC') {
    const context = await findAvailableRatingSbcChallengeContext(set, label);
    const { challenges } = context;
    const available = context.challenge;
    if (!available && challenges.length) {
      const states = challenges.map((challenge, index) => {
        const status = String(challenge?.status || challenge?.state || 'unknown').toUpperCase();
        return `#${challenge?.id || '?'} (${index + 1}/${challenges.length}) status:${status} completed:${isCompletedChallenge(challenge) ? 'yes' : 'no'}`;
      });
      log(`${label}: no incomplete direct rating challenge; ${states.join('; ')}`);
    }
    return available;
  }

  async function loadRatingSbcChallenge(challenge, label = 'rating SBC', options = {}) {
    if (!challenge) return null;
    if (challenge.squad && options.force !== true) return challenge;

    if (!eaSbcAdapter().hasDaoLoadChallenge()) {
      fail(`${label}: direct SBC challenge loader is unavailable`);
    }
    let inProgress = false;
    try { inProgress = challenge.isInProgress?.() === true; } catch { }
    log(`${label}: loading challenge squad directly through sbcDAO`);
    const startedAt = Date.now();
    let result;
    try {
      result = await observeOnce(
        eaSbcAdapter().loadDaoChallenge(challenge.id, inProgress),
        ctrl(),
        20000,
        `sbcDAO.loadChallenge ${label}`,
      );
    } catch (error) {
      try {
        options.onDiagnostic?.({
          request: { challengeId: Number(challenge?.id || 0) || null, inProgress },
          timing: { durationMs: Math.max(0, Date.now() - startedAt) },
          result: sanitizeBackgroundSubmitResult({ success: false, error }),
          response: { squadPresent: false, squadPlayerCount: 0 },
        });
      } catch { }
      throw error;
    }
    const squad = result?.response?.squad;
    try {
      options.onDiagnostic?.({
        request: { challengeId: Number(challenge?.id || 0) || null, inProgress },
        timing: { durationMs: Math.max(0, Date.now() - startedAt) },
        result: sanitizeBackgroundSubmitResult(result),
        response: {
          squadPresent: Boolean(squad),
          squadPlayerCount: squad ? getSquadItems(squad).length : 0,
        },
      });
    } catch { }
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
        const request = () => observeOnce(
          eaSbcAdapter().requestChallengesForSet(set),
          ctrl(),
          30000,
          `requestChallengesForSet ${label}`,
        );
        const result = options.runRequest
          ? await options.runRequest(`standard Challenges ${label}`, request)
          : await request();
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

  async function loadDynamicSbcDiscoveryChallenges(set, index = {}, context = {}) {
    const label = `Dynamic SBC scan ${set?.name || `#${set?.id || '?'}`}`;
    const repositoryChallenges = getCachedSbcChallenges(set);
    const repositorySnapshot = eaSbcAdapter().snapshotDiscoverySet(set, repositoryChallenges);
    const repositoryMetadataComplete = repositoryChallenges.length > 0
      && repositoryChallenges.length === (index.challengeIds?.length || repositoryChallenges.length)
      && repositorySnapshot.challenges.every((challenge) => (
        Number(challenge?.requiredPlayerCount || 0) > 0
          && Array.isArray(challenge?.eligibilityRequirements)
          && challenge.eligibilityRequirements.length > 0
      ));
    if (!context.cachedSnapshot && repositoryMetadataComplete) {
      log(`${label}: using ${repositoryChallenges.length} complete repository Challenge metadata snapshot(s)`);
      return repositoryChallenges;
    }

    let challenges = null;
    if (eaSbcAdapter().hasDaoGetChallengesForSet()) {
      const request = () => observeOnce(
        eaSbcAdapter().getChallengesForSet(set?.id),
        ctrl(),
        20000,
        `sbcDAO.getChallengesForSet ${label}`,
      );
      const result = context.runRequest
        ? await context.runRequest(`DAO Challenges ${label}`, request)
        : await request();
      if (result?.success && Array.isArray(result?.response?.challenges)) {
        challenges = result.response.challenges;
      } else {
        const detail = serviceResultErrorText(result) || 'unknown';
        throw new Error(`direct Challenge metadata unavailable: ${detail}`);
      }
    }
    if (!challenges) challenges = await requestSbcChallenges(set, label, {
      attempts: 1,
      runRequest: context.runRequest,
    });

    const loaded = [];
    for (const challenge of challenges) {
      const metadata = eaSbcAdapter().snapshotDiscoverySet(set, [challenge])?.challenges?.[0] || null;
      const metadataComplete = Number(metadata?.requiredPlayerCount || 0) > 0
        && Array.isArray(metadata?.eligibilityRequirements)
        && metadata.eligibilityRequirements.length > 0;
      if (metadataComplete || challenge?.squad || !eaSbcAdapter().hasDaoLoadChallenge()) {
        loaded.push(challenge);
        continue;
      }
      let inProgress = false;
      try { inProgress = challenge.isInProgress?.() === true; } catch { }
      try {
        const request = () => observeOnce(
          eaSbcAdapter().loadDaoChallenge(challenge.id, inProgress),
          ctrl(),
          20000,
          `sbcDAO.loadChallenge ${label} #${challenge.id || '?'}`,
        );
        const result = context.runRequest
          ? await context.runRequest(`DAO Challenge squad ${label} #${challenge.id || '?'}`, request)
          : await request();
        const squad = result?.response?.squad;
        if (!result?.success || !squad) throw new Error(serviceResultErrorText(result) || 'squad unavailable');
        challenge.squad = squad;
      } catch (error) {
        if (dynamicSbcLoadErrorCode(error) === 429) throw error;
        const completed = isCompletedChallenge(challenge);
        log(`${label}: Challenge #${challenge?.id || '?'} squad metadata unavailable (${error?.message || error}); player count ${completed ? 'may be inferred only from consistent sibling Challenge metadata' : 'will remain unsupported'}`);
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

  function dynamicSbcCacheStorageKey() {
    return `${DYNAMIC_SBC_CACHE_KEY}:${eaSbcAdapter().cacheScope()}`;
  }

  function dynamicSbcScanHealthStorageKey() {
    return `${dynamicSbcCacheStorageKey()}:scan-health`;
  }

  function dynamicSbcStorageSinkCatalogKey() {
    return `${dynamicSbcCacheStorageKey()}:storage-sink-index`;
  }

  function createDynamicSbcRequestPacer() {
    const healthKey = dynamicSbcScanHealthStorageKey();
    const previous = normalizeDynamicSbcScanHealth(adapters.userscriptStorage.get(healthKey, null), Date.now());
    const metrics = {
      requestCount: 0,
      failureCount: 0,
      rateLimitCount: 0,
      codes: {},
    };
    let gapMs = previous.recommendedGapMs;
    let lastStartedAt = 0;
    const recordFailure = (error) => {
      metrics.failureCount++;
      const code = dynamicSbcLoadErrorCode(error);
      if (code) metrics.codes[code] = (metrics.codes[code] || 0) + 1;
      if (code === 429) {
        metrics.rateLimitCount++;
        gapMs = 3000;
      } else if ([426, 512, 521].includes(code)) {
        gapMs = Math.max(gapMs, 2500);
      }
    };
    return {
      initialGapMs: gapMs,
      previous,
      metrics,
      async run(label, request) {
        const waitMs = Math.max(0, gapMs - (Date.now() - lastStartedAt));
        if (waitMs) await sleep(waitMs);
        lastStartedAt = Date.now();
        metrics.requestCount++;
        try {
          const result = await request();
          if (!result?.success) recordFailure(new Error(serviceResultErrorText(result) || `${label} failed`));
          return result;
        } catch (error) {
          recordFailure(error);
          throw error;
        }
      },
      save() {
        const health = updateDynamicSbcScanHealth(previous, metrics, Date.now());
        adapters.userscriptStorage.set(healthKey, health);
        return health;
      },
    };
  }

  function dynamicSbcCandidate(index = {}, activitySbcNames = [], pickOptions = {}) {
    const hasPlayerPickReward = (index.rewards || []).some((reward) => reward?.type === 'PLAYER_PICK');
    if (hasPlayerPickReward) return true;
    if (pickOptions.rollingStorageSinkMode === 'selected'
      && Number(index.id || 0) === Number(pickOptions.rollingStorageSinkSetId || 0)) return true;
    if (index.inUpgradesCategory !== true) return false;
    if (detectDynamicUpgradeFamily(index)) return true;
    const setName = String(index.name || '').trim().toLowerCase();
    if (setName && activitySbcNames.includes(setName)) return true;
    const challengeCount = (index.challengeIds || []).length;
    const packRewardCount = (index.rewards || []).filter((reward) => reward?.type === 'PACK').length;
    return challengeCount === 1 && packRewardCount === 1;
  }

  function unavailableDynamicSbcParse(parsed, loadError, cacheStatus) {
    if (!loadError || cacheStatus === 'load-failed-compatible-cache') return parsed;
    return {
      ...parsed,
      status: 'unavailable',
      loop: null,
      diagnostics: [
        `Challenge metadata refresh failed: ${loadError?.message || loadError}`,
        ...(parsed?.diagnostics || []),
      ],
    };
  }

  function logDynamicUpgradeDiscovery(snapshot, parsed, loadError) {
    const reward = (snapshot.rewards || []).find((entry) => entry?.type === 'PACK') || {};
    log(`Dynamic SBC scan: Upgrade set #${snapshot.id || '?'} ${snapshot.name || '?'}; category:${snapshot.categoryNames?.join('/') || '?'}; reward ${reward.name || '?'} (#${reward.packId || reward.resourceId || '?'}); challenges:${snapshot.challenges?.length || 0}; completed:${snapshot.timesCompleted ?? '?'}, repeats:${snapshot.repeats ?? '?'}, remaining:${parsed.remainingCompletions ?? '?'}; status:${parsed.status}`);
    for (const [index, challenge] of (snapshot.challenges || []).entries()) {
      const requirements = (challenge.eligibilityRequirements || [])
        .map(describePlayerPickDiscoveryRequirement)
        .join(', ');
      log(`Dynamic SBC scan: Upgrade challenge ${index + 1} #${challenge.id || '?'} players:${challenge.requiredPlayerCount || '?'} completed:${challenge.completed ? 'yes' : 'no'}; ${requirements || 'requirements unavailable'}`);
    }
    if (loadError) log(`Dynamic SBC scan: Upgrade challenge load warning: ${loadError?.message || loadError}`);
    for (const diagnostic of parsed.diagnostics || []) log(`Dynamic SBC scan: Upgrade diagnostic: ${diagnostic}`);
  }

  function logBasicActivityDiscovery(snapshot, parsed, loadError) {
    const reward = (snapshot.rewards || []).find((entry) => entry?.type === 'PACK') || {};
    const families = (parsed.activities || (parsed.activity ? [parsed.activity] : []))
      .map((activity) => `${activity.familyId}${activity.materialSink ? `:${activity.materialSink.className}` : ''}`)
      .join(',') || parsed.familyId || '?';
    log(`Dynamic SBC scan: Activity set #${snapshot.id || '?'} ${snapshot.name || '?'}; family:${families}; reward ${reward.name || '?'} (#${reward.packId || reward.resourceId || '?'}); challenges:${snapshot.challenges?.length || 0}; remaining:${parsed.remainingCompletions ?? parsed.activity?.remainingCompletions ?? '?'}; status:${parsed.status}`);
    if (loadError) log(`Dynamic SBC scan: Activity challenge load warning: ${loadError?.message || loadError}`);
    for (const diagnostic of parsed.diagnostics || []) log(`Dynamic SBC scan: Activity diagnostic: ${diagnostic}`);
  }

  async function scanAvailableDynamicSbcs(options = {}) {
    const forceFull = options.forceFull === true;
    const clearCache = options.clearCache === true;
    const cacheOnly = options.cacheOnly === true;
    const reportProgress = async (progress) => {
      if (typeof options.onProgress === 'function') await options.onProgress(progress);
    };
    await reportProgress({
      phase: cacheOnly ? 'restoring' : 'refreshing',
      completed: 0,
      total: 0,
      label: cacheOnly ? 'Restoring cached SBC metadata' : 'Refreshing SBC index',
    });
    log(cacheOnly
      ? 'Dynamic SBC cache: restoring previously validated session Loops before background refresh'
      : `Dynamic SBC scan: refreshing the current Set/Category index and validating per-SBC cache${forceFull ? '; forcing full Challenge refresh' : ''}; nothing will be executed`);
    const pickOptions = getPickRuntimeOptions();
    const activitySbcNames = collectActivityBindingSbcNames([
      getConfiguredLoopDefs(),
      getConfiguredRecoveryRecipes(),
    ]);
    const cacheKey = dynamicSbcCacheStorageKey();
    const storageSinkCatalogKey = dynamicSbcStorageSinkCatalogKey();
    if (clearCache) {
      adapters.userscriptStorage.remove(cacheKey);
      adapters.userscriptStorage.remove(storageSinkCatalogKey);
    }
    const cached = clearCache ? null : adapters.userscriptStorage.get(cacheKey, null);
    let storageSinkIndexes = clearCache
      ? []
      : adapters.userscriptStorage.get(storageSinkCatalogKey, []);
    if (!Array.isArray(storageSinkIndexes)) storageSinkIndexes = [];
    const requestPacer = cacheOnly ? null : createDynamicSbcRequestPacer();
    if (requestPacer) {
      log(`Dynamic SBC scan pacing: minimum ${requestPacer.initialGapMs}ms between EA Challenge requests; recent failure rate ${(requestPacer.previous.failureRate * 100).toFixed(1)}%, recent 429 count ${requestPacer.previous.rateLimitCount}`);
    }
    const summary = cacheOnly ? (() => {
      const normalized = normalizeDynamicSbcCache(cached, Date.now());
      const results = Object.values(normalized.sets).map((entry) => ({
        set: null,
        index: null,
        snapshot: cloneLoopDef(entry.snapshot),
        loadError: null,
        cacheStatus: 'restored',
        fingerprint: entry.fingerprint,
      }));
      return {
        refreshResult: null,
        results,
        cache: normalized,
        stats: {
          setsScanned: results.length,
          candidates: results.length,
          cacheHits: results.length,
          rescanned: 0,
          newSets: 0,
          changedSets: 0,
          expiredEntries: 0,
          invalidEntries: 0,
          loadFailures: 0,
          loadRetries: 0,
          cacheFallbacks: 0,
          circuitBreakers: 0,
          circuitSkipped: 0,
          removedEntries: 0,
        },
      };
    })() : await scanDynamicSbcSnapshots({
      cache: cached,
      forceFull,
      refreshSets: async () => {
        const result = await observeOnce(eaSbcAdapter().requestSets(), ctrl(), 30000, 'Dynamic SBC scan SBC.requestSets');
        if (!result?.success) throw new Error(serviceResultErrorText(result) || 'SBC Set request failed');
        storageSinkIndexes = getSbcSets().map((set) => eaSbcAdapter().snapshotDiscoveryIndex(set, result));
        adapters.userscriptStorage.set(storageSinkCatalogKey, storageSinkIndexes);
        return result;
      },
      listSets: getSbcSets,
      snapshotIndex: (set, refreshResult) => eaSbcAdapter().snapshotDiscoveryIndex(set, refreshResult),
      snapshotSet: (set, challenges, refreshResult) => eaSbcAdapter().snapshotDiscoverySet(set, challenges, refreshResult),
      loadChallenges: (set, index, context) => loadDynamicSbcDiscoveryChallenges(set, index, {
        ...context,
        runRequest: (label, request) => requestPacer.run(label, request),
      }),
      loadAttempts: 3,
      loadRetryDelayMs: 1500,
      sleep,
      onLoadRetry: ({ index, attempt, attempts, delayMs, error }) => {
        log(`Dynamic SBC scan ${index?.name || `#${index?.id || '?'}`}: Challenge metadata attempt ${attempt}/${attempts} failed (${error?.message || error}); retrying in ${delayMs}ms`);
      },
      onCircuitOpen: ({ index, circuit }) => {
        log(`Dynamic SBC scan ${index?.name || `#${index?.id || '?'}`}: EA ${circuit?.code || 429} opened the Challenge request circuit; remaining candidates will use compatible cache or remain unavailable`);
      },
      onLoadSkipped: ({ index, circuit }) => {
        log(`Dynamic SBC scan ${index?.name || `#${index?.id || '?'}`}: Challenge request skipped because the EA ${circuit?.code || 429} circuit is open`);
      },
      isCandidate: (index) => dynamicSbcCandidate(index, activitySbcNames, pickOptions),
      onProgress: (progress) => {
        const completed = Math.max(0, Number(progress.completed || 0) || 0);
        const total = Math.max(0, Number(progress.total || 0) || 0);
        const currentName = String(progress.index?.name || '').trim();
        const label = total > 0 && completed >= total
          ? 'Dynamic SBC metadata validated'
          : currentName
            ? `Checking ${currentName}`
            : total === 0
              ? 'No matching dynamic SBCs found'
              : 'Validating dynamic SBC metadata';
        return reportProgress({ ...progress, label });
      },
      onResult: async ({ snapshot, loadError, cacheStatus }) => {
        if (cacheStatus === 'load-failed-compatible-cache') {
          log(`Dynamic SBC scan: set #${snapshot.id || '?'} retained from compatible validated cache after live Challenge refresh failed`);
        }
        const isPick = (snapshot.rewards || []).some((reward) => reward?.type === 'PLAYER_PICK');
        if (!isPick) {
          if (detectDynamicUpgradeFamily(snapshot)) {
            const parsed = unavailableDynamicSbcParse(parseDynamicUpgradeSbcSnapshot({
              set: snapshot,
            }), loadError, cacheStatus);
            logDynamicUpgradeDiscovery(snapshot, parsed, loadError);
            const activityParsed = loadError && cacheStatus !== 'load-failed-compatible-cache'
              ? { status: 'unavailable', diagnostics: [`Challenge metadata refresh failed: ${loadError?.message || loadError}`] }
              : parseBasicUpgradeActivitySnapshot({ set: snapshot });
            if (activityParsed.status === 'supported') {
              logBasicActivityDiscovery(snapshot, activityParsed, loadError);
            }
          } else {
            const parsed = loadError && cacheStatus !== 'load-failed-compatible-cache'
              ? { status: 'unavailable', diagnostics: [`Challenge metadata refresh failed: ${loadError?.message || loadError}`] }
              : parseBasicUpgradeActivitySnapshot({ set: snapshot });
            logBasicActivityDiscovery(snapshot, parsed, loadError);
          }
          log(`Dynamic SBC scan: set #${snapshot.id || '?'} cache:${cacheStatus}`);
          return;
        }
        const parsed = unavailableDynamicSbcParse(parsePlayerPickSbcSnapshot({
          set: snapshot,
          pricePlatform: 'pc',
        }), loadError, cacheStatus);
        const reward = snapshot.rewards?.[0] || {};
        const remaining = parsed.remainingCompletions ?? (() => {
          if (parsed.loop?.useRoundsAsCompletions === true) return 'user rounds';
          const completed = snapshot.timesCompleted;
          const repeats = snapshot.repeats;
          if (completed === null || completed === undefined || repeats === null || repeats === undefined) return null;
          if (!Number.isFinite(Number(repeats)) || Number(repeats) <= 0) return null;
          return Math.max(0, Number(repeats) - Number(completed));
        })();
        log(`Player Pick scan: set #${snapshot.id || '?'} ${snapshot.name || '?'}; reward ${describePlayerPickDiscoveryReward(reward, parsed)}; challenges:${snapshot.challenges?.length || 0}; set complete:${snapshot.complete ? 'yes' : 'no'}, state:${snapshot.status || '?'}, completed:${snapshot.timesCompleted ?? '?'}, repeats:${snapshot.repeats ?? '?'}, remaining:${remaining ?? '?'}; status:${parsed.status}${parsed.reportedCompleted ? ' (reported completed; runtime probe enabled)' : ''}`);
        if (!parsed.pickCandidateCount || !parsed.pickCount) logPlayerPickDiscoveryMetadataHints(reward);
        for (const [index, challenge] of (snapshot.challenges || []).entries()) {
          const requirements = (challenge.eligibilityRequirements || [])
            .map(describePlayerPickDiscoveryRequirement)
            .join(', ');
          log(`Player Pick scan: challenge ${index + 1} #${challenge.id || '?'} players:${challenge.requiredPlayerCount || '?'} completed:${challenge.completed ? 'yes' : 'no'}; ${requirements || 'requirements unavailable'}`);
        }
        if (loadError) log(`Player Pick scan: challenge load warning: ${loadError?.message || loadError}`);
        for (const diagnostic of parsed.diagnostics || []) log(`Player Pick scan: diagnostic: ${diagnostic}`);
        log(`Dynamic SBC scan: set #${snapshot.id || '?'} cache:${cacheStatus}`);
      },
    });
    await reportProgress({
      phase: 'finalizing',
      completed: summary.results.length,
      total: summary.results.length,
      label: 'Updating Loops and pack catalog',
    });
    const scanHealth = requestPacer?.save() || null;
    if (!cacheOnly) adapters.userscriptStorage.set(cacheKey, summary.cache);
    const snapshots = summary.results.map((result) => (
      result.loadError && result.cacheStatus !== 'load-failed-compatible-cache'
        ? { ...result.snapshot, challenges: [] }
        : result.snapshot
    ));
    state.storageSinkCandidates = cloneLoopDef(buildRollingStorageSinkCatalog(
      storageSinkIndexes,
      snapshots,
    ));
    const configuredLoops = getConfiguredLoopDefs();
    const pickSession = buildPlayerPickDiscoverySession({
      sets: snapshots,
      configuredLoops,
      selectedId: document.querySelector('#bronze-loop-select')?.value || null,
      preferScannedMetadata: pickOptions.preferScannedMetadata,
      pricePlatform: 'pc',
    });
    const upgradeSession = buildUpgradeDiscoverySession({
      sets: snapshots,
      configuredLoops,
    });
    const specializedLoopOverrides = {
      ...pickSession.loopOverrides,
      ...upgradeSession.loopOverrides,
    };
    const activitySession = buildActivityBindingSession({
      sets: snapshots,
      configuredLoops: [
        ...configuredLoops.map((loopDef) => specializedLoopOverrides[loopDef.id] || loopDef),
        ...upgradeSession.discoveredLoops,
        ...upgradeSession.rollingLoops,
      ],
      recoveryRecipes: getConfiguredRecoveryRecipes(),
      additionalActivities: collectScannedUpgradeActivities(upgradeSession.results),
    });
    const configuredLoopIds = new Set(configuredLoops.map((loopDef) => String(loopDef?.id || '')).filter(Boolean));
    const configuredActivityOverrides = Object.fromEntries(
      Object.entries(activitySession.loopOverrides).filter(([loopId]) => configuredLoopIds.has(String(loopId))),
    );
    const materializedUpgradeLoops = upgradeSession.discoveredLoops.map((loopDef) => (
      activitySession.loopOverrides[loopDef.id] || loopDef
    ));
    const materializedRollingLoops = bindRollingPlayerPickCapabilities(
      upgradeSession.rollingLoops.map((loopDef) => activitySession.loopOverrides[loopDef.id] || loopDef),
      collectScannedPlayerPickLoopDefs(pickSession.results),
      {
        storageSinkSets: snapshots,
        storageSinkSelection: {
          mode: pickOptions.rollingStorageSinkMode,
          setId: pickOptions.rollingStorageSinkSetId,
        },
      },
    );
    state.discoveredLoopDefs = cloneLoopDef([
      ...pickSession.discoveredLoops,
      ...materializedUpgradeLoops,
      ...materializedRollingLoops,
    ]);
    state.discoveredLoopOverrides = cloneLoopDef({
      ...specializedLoopOverrides,
      ...configuredActivityOverrides,
    });
    state.discoveredRecoveryRecipeOverrides = cloneLoopDef(activitySession.recoveryRecipeOverrides);
    state.scannedDynamicSbcDefs = cloneLoopDef([
      ...collectScannedPlayerPickLoopDefs(pickSession.results),
      ...materializedUpgradeLoops,
      ...Object.values(upgradeSession.loopOverrides).filter((loopDef) =>
        loopDef?.discovered === true && loopDef?.discoveryKind === 'upgrade'
      ),
    ]);
    state.workflowBuilder?.refreshDynamic(getScannedDynamicSbcLoopDefs());
    const activeBuilderId = state.workflowBuilder?.getStore?.().activeProfileId;
    if (activeBuilderId) {
      const restored = state.workflowBuilder.restoreActiveProfile();
      if (restored.status === 'blocked') {
        if (String(state.loopConfigSource || '').startsWith('Builder profile:')) {
          resetLoopDefs({ preserveDiscovery: true });
        }
        log(`Active Builder profile remains unavailable after Dynamic SBC scan: ${(restored.errors || []).join('; ')}; using built-in Workflow/Loop configuration until the conflicts are resolved`);
      }
    }
    if (!cacheOnly) await refreshPackCatalogFromSbcIndex(summary.refreshResult);
    const requestedSelection = document.querySelector('#bronze-loop-select')?.value || pickSession.selectedId;
    const selectedId = getLoopDefs().some((loopDef) => loopDef.id === requestedSelection)
      ? requestedSelection
      : getLoopDefs()[0]?.id;
    renderLoopSelect(selectedId);
    const pickDuplicateCount = pickSession.results.filter((result) => result.status === 'duplicate').length;
    for (const [loopId, loopDef] of Object.entries(pickSession.loopOverrides)) {
      const ratios = (loopDef.challengeRequirements || [loopDef.requirements || []])
        .map((requirements, index) => `challenge ${index + 1}: ${(requirements || []).map((requirement) => `${requirement.count} ${requirement.rarity || requirement.tier}${requirement.goldConsumption && requirement.goldConsumption !== 'eligibility' ? ` (${requirement.goldConsumption})` : requirement.preferCommon ? ' (common-first legacy)' : ''}`).join(' + ')}`)
        .join('; ');
      log(`Player Pick scan: using scanned metadata for configured Loop ${loopId} (Set #${loopDef.sbcSetIds?.[0] || '?'}, reward #${loopDef.pickItemResourceIds?.[0] || '?'}, select ${loopDef.pickCount}/${loopDef.pickCandidateCount}; repeatability:${loopDef.repeatability || 'unknown'}${loopDef.completionLimit ? `/${loopDef.completionLimit}` : ''}; ${ratios})`);
    }
    for (const diagnostic of pickSession.overrideDiagnostics) log(`Player Pick scan: override skipped: ${diagnostic}`);
    for (const loopDef of pickSession.discoveredLoops) {
      const ratios = (loopDef.challengeRequirements || [loopDef.requirements || []])
        .map((requirements, index) => `challenge ${index + 1}: ${(requirements || []).map((requirement) => `${requirement.count} ${requirement.rarity || requirement.tier}${requirement.goldConsumption && requirement.goldConsumption !== 'eligibility' ? ` (${requirement.goldConsumption})` : requirement.preferCommon ? ' (common-first legacy)' : ''}`).join(' + ')}`)
        .join('; ');
      log(`Player Pick scan: added session Loop ${loopDef.name} (Set #${loopDef.sbcSetIds?.[0] || '?'}, reward #${loopDef.pickItemResourceIds?.[0] || '?'}, select ${loopDef.pickCount}/${loopDef.pickCandidateCount}; repeatability:${loopDef.repeatability || 'unknown'}${loopDef.completionLimit ? `/${loopDef.completionLimit}` : ''}; ${ratios}${loopDef.discoveryReportedCompleted ? '; reported completed, one runtime probe' : ''})`);
    }
    for (const [loopId, loopDef] of Object.entries(upgradeSession.loopOverrides)) {
      log(`Dynamic SBC scan: using scanned Upgrade metadata for configured Loop ${loopId} (Set #${loopDef.sbcSetIds?.[0] || '?'}, reward #${loopDef.rewardPackIds?.[0] || '?'}, target rating:${loopDef.ratingSbcFill?.targetRating || '?'}, players:${loopDef.expectedPlayerCount || '?'})`);
    }
    for (const loopDef of upgradeSession.discoveredLoops) {
      log(`Dynamic SBC scan: added session Upgrade Loop ${loopDef.name} (Set #${loopDef.sbcSetIds?.[0] || '?'}, reward #${loopDef.rewardPackIds?.[0] || '?'}, target rating:${loopDef.ratingSbcFill?.targetRating || '?'}, players:${loopDef.expectedPlayerCount || '?'})`);
    }
    for (const loopDef of materializedRollingLoops) {
      const pickSelection = loopDef.rollingPlayerPick?.selection;
      const pickSummary = pickSelection
        ? `${loopDef.rollingPlayerPick.status}/${pickSelection.minimumRareGoldCost} rare/${pickSelection.totalGoldCost} gold/${pickSelection.rewardMinRating}+/${loopDef.rollingPlayerPick.alternatives?.length || 0} alternate(s)`
        : loopDef.rollingPlayerPick?.status || 'unavailable';
      const storageSink = loopDef.rollingStorageSink;
      const storageSinkSummary = storageSink?.status === 'resolved'
        ? `${storageSink.mode}/${storageSink.capability?.setName || `Set #${storageSink.capability?.setId || '?'}`}/${storageSink.capability?.rewardKind || '?'}`
        : `${storageSink?.mode || 'off'}/${storageSink?.status || 'unavailable'}`;
      log(`Dynamic SBC scan: added selectable Rolling Loop ${loopDef.name} (primary Set #${loopDef.sbcSetIds?.[0] || '?'}; TOTW:${loopDef.rollingTotwUpgrade?.activityResolved === true ? 'resolved' : 'unavailable'}; Provisions:${loopDef.rollingProvisionsUpgrade?.activityResolved === true ? 'resolved' : 'unavailable'}; Rare Gold Pick:${pickSummary}; Storage pressure SBC:${storageSinkSummary}; Gold sink:${loopDef.rollingGoldSinkUpgrade?.activityResolved === true ? 'resolved' : 'unavailable'})`);
    }
    for (const activity of activitySession.activities) {
      const sink = activity.materialSink;
      const sinkSummary = sink
        ? `; class:${sink.className}; cost:${sink.cost}; guaranteed:${sink.reward?.guaranteedCount || '?'}x${sink.reward?.minimumRating || '?'}+ ${sink.reward?.rarity || '?'}`
        : '';
      log(`Dynamic SBC scan: resolved activity ${activity.familyId} -> Set #${activity.setId} ${activity.setName}; reward #${activity.rewardPackIds?.[0] || '?'}${sinkSummary}; consumers:${activity.consumers?.join(', ') || 'none'}`);
    }
    for (const diagnostic of activitySession.diagnostics) log(`Dynamic SBC scan: activity binding: ${diagnostic}`);
    const upgradeDuplicateCount = upgradeSession.results.filter((result) => result.status === 'duplicate').length;
    const pickSetCount = snapshots.filter((snapshot) => (snapshot.rewards || []).some((reward) => reward?.type === 'PLAYER_PICK')).length;
    const upgradeSetCount = snapshots.length - pickSetCount;
    if (cacheOnly) {
      log(`Dynamic SBC cache restore complete: ${summary.results.length} cached Set snapshot(s), ${state.discoveredLoopDefs.length} session Loop(s); live validation continues in background`);
    } else {
      log(`Dynamic SBC scan complete: ${summary.stats.setsScanned} Set(s) checked, ${summary.stats.candidates} candidate(s) (${pickSetCount} Pick, ${upgradeSetCount} Upgrade); cache hits:${summary.stats.cacheHits}, cache fallbacks:${summary.stats.cacheFallbacks}, rescanned:${summary.stats.rescanned}, new:${summary.stats.newSets}, changed:${summary.stats.changedSets}, expired:${summary.stats.expiredEntries}, invalid:${summary.stats.invalidEntries}, removed:${summary.stats.removedEntries}, retries:${summary.stats.loadRetries}, failures:${summary.stats.loadFailures}, circuit opened:${summary.stats.circuitBreakers}, requests skipped:${summary.stats.circuitSkipped}; ${state.discoveredLoopDefs.length} session Loop(s) added, ${Object.keys(state.discoveredLoopOverrides).length} configured Loop(s) updated, ${Object.keys(state.discoveredRecoveryRecipeOverrides).length} recovery recipe(s) updated, ${pickDuplicateCount + upgradeDuplicateCount} duplicate(s) skipped`);
      const requestFailureRate = requestPacer.metrics.requestCount
        ? (requestPacer.metrics.failureCount / requestPacer.metrics.requestCount) * 100
        : 0;
      const codes = Object.entries(requestPacer.metrics.codes).map(([code, count]) => `${code}:${count}`).join(', ') || 'none';
      log(`Dynamic SBC scan request health: ${requestPacer.metrics.requestCount} EA Challenge request(s), ${requestPacer.metrics.failureCount} failure(s) (${requestFailureRate.toFixed(1)}%), codes:${codes}; next scan minimum gap:${scanHealth.recommendedGapMs}ms`);
    }
    await reportProgress({
      phase: 'complete',
      completed: summary.results.length,
      total: summary.results.length,
      label: 'Dynamic SBC scan complete',
    });
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
    const sbcLoadKey = `${Number(set?.id || 0)}:${Number(challenge?.id || 0)}`;
    if (!state.sbcLoadLogKeys.has(sbcLoadKey)) {
      state.sbcLoadLogKeys.add(sbcLoadKey);
      log(`SBC loaded: ${set.name} (Set #${set.id || '?'}, Challenge #${challenge.id || '?'})`);
    }

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
      `rareflag:${itemRareFlag(item)}`,
      isTradeable(item) ? 'tradeable' : 'untradeable',
      `from:${entry?.pileName || 'unknown'}`,
      `id:${Number(item?.id || 0) || '?'}`,
      `def:${Number(item?.definitionId || 0) || '?'}`,
    ];
    if (entry?.submissionPileName && entry.submissionPileName !== entry.pileName) {
      parts.splice(parts.length - 2, 0, `submitFrom:${entry.submissionPileName}`);
    }
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
      requirement.goldConsumption && requirement.goldConsumption !== 'eligibility'
        ? `consume:${requirement.goldConsumption}`
        : '',
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
    if (options.protectHighGold && isProtectedHighGold(item, resolveProtectHighGoldThreshold(options))) {
      reasons.push('protected-high-gold');
    }
    const lowRatedGoldMaxRating = Number(options.lowRatedGoldMaxRating || getSbcFodderRuntimeOptions().lowRatedGoldMaxRating || 0);
    if (options.sbcFodderPolicy?.mode !== 'rating-constrained' && isNormalGoldFodder(item) && lowRatedGoldMaxRating > 0 && Number(item?.rating || 0) > lowRatedGoldMaxRating) {
      reasons.push(`low-rated-gold-over-${lowRatedGoldMaxRating}`);
    }
    if (isLoanItem(item)) reasons.push('loan');
    else if (isLimitedUseItem(item)) reasons.push('limited-use');
    if (isConceptItem(item)) reasons.push('concept');
    try { if (item?.isEnrolledInAcademy?.()) reasons.push('academy'); } catch { }
    if (item?.endTime !== undefined && Number(item.endTime) !== -1) reasons.push('active-trade');
    if (!isInactiveTrade(item)) reasons.push('active-trade');
    getFsuRejectReasons(item, options, getFsuSettings(), {
      sbcFodderPolicy: options.sbcFodderPolicy,
      respectFsuGoldRange: options.respectFsuGoldRange !== undefined
        ? options.respectFsuGoldRange
        : options.sbcFodderPolicy?.mode !== 'rating-constrained',
    }).forEach((reason) => reasons.push(reason));
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
      .filter((item) => (
        (Number(item?.id || 0) === duplicateId || Number(item?.definitionId || 0) === definitionId)
          && isSamePlayerCardVersion(signal, item)
      ))
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

  function findSubmissionItemForDuplicateSignal(signal, usedIds, spec = {}, settings = getFsuSettings()) {
    const duplicateId = Number(signal?.duplicateId || 0);
    const cacheItems = getSubmissionCacheItems().filter((item) =>
      isSbcUsablePlayer(item, spec) &&
      itemMatchesSpec(item, spec, settings) &&
      !usedIds.has(Number(item?.id || 0))
    );

    if (duplicateId) {
      const direct = cacheItems.find((item) => Number(item?.id || 0) === duplicateId);
      if (direct && isSamePlayerCardVersion(signal, direct)) return direct;
    }

    return sortSbcFodder(cacheItems, spec, settings)
      .find((item) => isSamePlayerCardVersion(item, signal)) || null;
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
    const selectionLoopDef = !Array.isArray(requirementsOrLoopDef) && requirementsOrLoopDef
      ? {
        ...requirementsOrLoopDef,
        runtimeSbcFodderPolicy: requirementsOrLoopDef.runtimeSbcFodderPolicy
          || effectiveSbcFodderPolicy(requirementsOrLoopDef, getSbcFodderRuntimeOptions()),
      }
      : null;
    const requirements = Array.isArray(requirementsOrLoopDef)
      ? selectionRequirements({ requirements: requirementsOrLoopDef, runtimeSbcFodderPolicy: getSbcFodderRuntimeOptions() }, effectivePriorityPiles)
      : selectionRequirements(selectionLoopDef || {}, effectivePriorityPiles);
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
      matchesPlayerRarityGroup: (item, values) => {
        const groups = new Set(itemGroupNumbers(item));
        return (values || []).some((value) => groups.has(Number(value)));
      },
      itemLeagueId,
      requiredSpecialLabel,
      isRequiredSpecialItem,
    });
  }

  function validateRatingSbcModelAgainstItems(model, items = [], challenge = null, options = {}) {
    return validateRatingSbcModelAgainstItemsPure(model, items, challenge, {
      calculateSquadRating: calculateEaSquadRating,
      isSpecialItem: isSbcSpecialItem,
      exclusiveRoles: options.exclusiveRoles || model?.exclusiveRoles,
      allowOtherSpecialAsOrdinary: options.allowOtherSpecialAsOrdinary === true,
    });
  }

  function logRatingSbcValidation(loopDef, label, validation, model) {
    log(`${loopDef.name}: ${label} rating ${validation.rating}/${model.targetRating}, players ${validation.players.length}/${model.requiredPlayerCount}, special ${validation.specialCount}/${model.maxSpecialCount}, unique definitions ${validation.uniqueDefinitionCount}/${validation.players.length}, unique players ${validation.uniquePlayerCount}/${validation.players.length}`);
    validation.constraintResults.forEach(({ constraint, matched, required }) => {
      log(`${loopDef.name}: ${label} constraint ${constraint.label}: ${matched}/${required}`);
    });
    if (validation.challengeReady !== null) {
      log(`${loopDef.name}: ${label} local challenge.meetsRequirements(): ${validation.challengeReady ? 'true' : 'false'}`);
    }
    validation.errors.forEach((error) => log(`${loopDef.name}: ${label} validation failed: ${error}`));
  }

  function isRatingSbcCandidateSafe(item, loopDef, model = null, context = null) {
    const roleAware = context?.roleAware === true;
    const allowedSpecialCount = roleAware
      ? Number(model?.requiredPlayerCount || 0)
      : model
      ? model.maxSpecialCount
      : Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
    if (!isPlayer(item)) return false;
    if (isSbcSpecialItem(item)) {
      if (!allowedSpecialCount) return false;
      if (!roleAware && requiredSpecialKind(loopDef) && !isRequiredSpecialItem(item, loopDef)) return false;
      if (!roleAware && model && hasDynamicPlayerGroupRequirement(loopDef)) {
        const matchesActivePlayerGroup = eaPlayerGroupConstraints(model).some(({ constraint }) => {
          try { return constraint.matches(item) === true; } catch { return false; }
        });
        if (!matchesActivePlayerGroup) return false;
      }
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
      sbcFodderPolicy: getSbcFodderPolicy(loopDef),
      protectedItemIds: loopDef.protectedItemIds,
      protectedDefinitionIds: loopDef.protectedDefinitionIds,
    });
    if (!resolved) return false;
    return isRatingSbcCandidateSafe(resolved, loopDef);
  }

  function buildRatingSbcCandidateEntries(loopDef, model, selectionPolicy = null, inventorySnapshot = null) {
    const settings = getFsuSettings();
    const piles = getRatingSbcPriorityPiles(loopDef, settings);
    const protectedItemIds = new Set((loopDef.protectedItemIds || []).map(Number).filter(Boolean));
    const protectedDefinitionIds = new Set((loopDef.protectedDefinitionIds || []).map(Number).filter(Boolean));
    const context = {
      settings,
      protectedItemIds,
      protectedDefinitionIds,
      lockedItemIds: new Set((settings.lockedItemIds || []).map(Number).filter(Boolean)),
      lockedDefinitionIds: new Set((settings.lockedDefinitionIds || []).map(Number).filter(Boolean)),
      excludedLeagueIds: (settings.excludedLeagueIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0),
      roleAware: selectionPolicy !== null,
      skipRatingLimit: selectionPolicy !== null,
    };
    const broadSpec = {
      playerOnly: true,
      allowSpecial: true,
      sbcFodderPolicy: getSbcFodderPolicy(loopDef),
      protectedItemIds: loopDef.protectedItemIds,
      protectedDefinitionIds: loopDef.protectedDefinitionIds,
    };
    const readPile = inventorySnapshot?.piles
      ? (pileName) => inventorySnapshot.piles[pileName] || []
      : getPileItemsByName;
    const liveRequirementItemsById = inventorySnapshot?.piles
      ? new Map(['unassigned', 'storage', 'transfer', 'club']
          .flatMap((pileName) => getPileItemsByName(pileName))
          .map((item) => [Number(item?.id || 0), item])
          .filter(([id]) => id > 0))
      : null;
    const submissionItems = inventorySnapshot?.piles
      ? uniqueItems([
          ...(inventorySnapshot.piles.storage || []),
          ...(inventorySnapshot.piles.club || []),
        ])
      : getSubmissionCacheItems();
    const candidates = buildRatingCandidateEntries({
      model,
      settings,
      piles,
      getPileItems: readPile,
      submissionItems,
      isSafe: (item) => isRatingSbcCandidateSafe(item, loopDef, model, context),
      isDuplicate,
      pileNeedsDuplicateSignalResolution,
      sortFodder: sortSbcFodder,
      isSpecialItem: isSbcSpecialItem,
      broadSpec,
      requiredItems: selectionPolicy?.requiredItems || [],
      resolveRequirementItem: liveRequirementItemsById
        ? (item) => liveRequirementItemsById.get(Number(item?.id || 0)) || item
        : (item) => item,
    });
    if (typeof selectionPolicy?.candidateFilter !== 'function') return candidates;
    const entries = candidates.entries.filter((entry) => {
      try { return selectionPolicy.candidateFilter(entry) === true; } catch { return false; }
    });
    return {
      ...candidates,
      entries,
      policyFiltered: candidates.entries.length - entries.length,
      requiredItemDiagnostics: finalizeRequiredCandidateDiagnostics(
        candidates.requiredItemDiagnostics,
        entries,
      ),
    };
  }

  function ratingSelectionItemSnapshot(item, pileName) {
    return createItemSnapshot({
      id: item?.id,
      definitionId: item?.definitionId,
      databaseId: readPlayerDatabaseId(item),
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
    const selectionPolicy = options.selectionPolicy || {};
    return selectRatingCandidateEntries({
      candidateEntries,
      model,
      piles,
      requiredItems: selectionPolicy.requiredItems,
      preferredItems: selectionPolicy.preferredItems,
      protectedItems: selectionPolicy.protectedItems,
      exclusiveRoles: selectionPolicy.exclusiveRoles,
      maxOrdinaryRating: selectionPolicy.maxOrdinaryRating,
      protectionPolicy: selectionPolicy.protectionPolicy,
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
      prepareRuntimeAccess: prepareFsuRuntimeAccess,
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

  async function showUnassignedIfAny(reason = 'final confirmation', options = {}) {
    const clickUnassignedFallback = () => clickButtonByText([
      'Unassigned Items',
      'Unassigned',
      'Assign Items',
      '未分配',
      '未分配物品',
      '分配物品',
    ]);
    return confirmUnassignedView({
      reason,
      openUnassigned: () => pageRuntime.gotoUnassigned(ctrl()),
      clickFallback: clickUnassignedFallback,
      waitLoadingEnd,
      refreshUnassigned,
      getItems: getUnassignedItems,
      stableEmptyReads: options.stableEmptyReads || 1,
      emptyReadDelayMs: options.emptyReadDelayMs || 0,
      diagnostic: options.diagnostic === true,
      requireNavigation: options.requireNavigation === true || options.verifyNavigation === true,
      getControllerName: currentControllerName,
      recoverNavigation: () => recoverRuntimeUnassignedNavigation({
        getControllerName: currentControllerName,
        popCurrent: () => pageRuntime.popViewController(false, ctrl()),
        requestController: () => pageRuntime.gotoUnassigned(ctrl()),
        requestTextFallback: clickUnassignedFallback,
        materializeUnassigned: async () => {
          await refreshUnassigned({
            attempts: 1,
            allowCacheFallback: false,
            quiet: true,
          });
          return true;
        },
        clickHome: () => {
          const homeTab = document.querySelector('.ut-tab-bar-item.icon-home');
          if (!homeTab) return false;
          simulateClick(homeTab);
          return true;
        },
        settle: async () => {
          await waitLoadingEnd(250, 8000).catch(() => null);
          await sleep(250);
        },
      }),
      sleep,
      log,
    });
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
    const provisionalAccess = fsuAdapter().readiness().state === 'provisional';
    if (provisionalAccess) fsuAdapter().beginProvisionalClubAccess();
    try {
    const requireSubmitReady = options.requireSubmitReady !== false;
    const squad = await waitFor(() => ctrl()?._squad, 15000, 'SBC squad object');
    patchFsuLengthSafePlayerMetadata(`${label} before FSU fill`);
    const fsuRepeatFillTexts = ['重复球员填充阵容', '重複球員填充陣容', 'Repeat player fill squad'];
    const fsuOneClickFillTexts = ['一键完成', '一鍵完成', '一键填充', '一鍵填充', 'One-click fill'];
    // FSU can occasionally fail to fill after we clear the squad. Keep a local
    // snapshot so the existing safe-repair flow still has a squad to work with.
    const existingItems = getSquadItems(squad);
    try { squad.removeAllItems?.(); } catch { }
    await sleep(500);

    if (options.specialRequirementAdd) {
      const clicked = await clickRequirementAddControl(options.specialRequirementAdd, `${label} special requirement`);
      if (!clicked) log(`${label}: special requirement Add button not found; continuing with FSU fill`);
    }

    if (clickButtonByText(fsuRepeatFillTexts)) {
      log('Clicked duplicate fill');
      await waitLoadingEnd();
      await sleep(CFG.pauseMs);
    }

    if (clickButtonByText(fsuOneClickFillTexts)) {
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

    if (!findSubmitButton() && getFilledSquadSlots(squad) === 0 && clickButtonByText(fsuOneClickFillTexts)) {
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
    if (!submitReady && filled === 0) {
      log(`${label}: FSU did not place any players after the supported fill attempts; no squad was saved and no SBC was submitted. Check the FSU fill overlay and its lock/rarity/range settings.`);
    }
    if (!submitReady && requireSubmitReady) fail(`${label} squad is not complete`);
    return { squad, filled, submitReady };
    } finally {
      if (provisionalAccess) fsuAdapter().endProvisionalClubAccess();
    }
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
    if (Array.isArray(item?._groups)) return item._groups;
    if (Array.isArray(item?._data?.groups)) return item._data.groups;
    if (Array.isArray(item?._staticData?.groups)) return item._staticData.groups;
    return [];
  }

  // FC26 live entities use group 44 on TOTS/FUTTIES too; group 45 is TOTW-specific.
  const TOTW_GROUP_IDS = [45];

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
    let runtimeResult = null;
    for (const methodName of ['isTOTW', 'isTotw']) {
      if (typeof item?.[methodName] !== 'function') continue;
      try {
        runtimeResult = item[methodName]() === true;
        if (runtimeResult) return true;
      } catch { }
    }
    if (runtimeResult === false) return false;
    if (itemRareFlag(item) === 3) return true;
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

  function isFuttiesItem(item) {
    try { if (item?.isFUTTIES?.() || item?.isFutties?.()) return true; } catch { }
    return /\bFUTTIES\b/i.test(itemSearchText(item));
  }

  function requiredSpecialKind(loopDef = {}) {
    return String(loopDef.requiredSpecialKind || '').trim().toLowerCase();
  }

  function dynamicPlayerGroupRequirements(loopDef = {}) {
    return (loopDef.dynamicActiveEligibilityRequirements || []).filter((requirement) => (
      String(requirement?.key || '') === 'PLAYER_RARITY_GROUP'
    ));
  }

  function hasDynamicPlayerGroupRequirement(loopDef = {}) {
    return dynamicPlayerGroupRequirements(loopDef).length > 0;
  }

  function requiredSpecialLabel(loopDef = {}) {
    const groupValues = [...new Set(dynamicPlayerGroupRequirements(loopDef)
      .flatMap((requirement) => requirement.values || [])
      .map(Number)
      .filter(Number.isFinite))];
    if (groupValues.length) return `EA player group ${groupValues.join('/')}`;
    return requiredSpecialKind(loopDef) === 'totw-tots-fof' ? 'TOTW/TOTS/FOF' : 'TOTW';
  }

  function isRequiredSpecialItem(item, loopDef = {}) {
    if (hasDynamicPlayerGroupRequirement(loopDef)) return false;
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
    const seenIds = new Set();
    const seenDefinitions = new Set();
    const settings = getFsuSettings();
    const piles = getRatingSbcPriorityPiles(loopDef, settings)
      .map((pileName) => ({ pileName, items: getPileItemsByName(pileName) }));
    if (options.includeRecent !== false) piles.push({ pileName: 'recent', items: state.recentRewardItems || [] });
    const submissionSpec = {
      playerOnly: true,
      allowSpecial: true,
      sbcFodderPolicy: getSbcFodderPolicy(loopDef),
      protectedItemIds: loopDef.protectedItemIds,
      protectedDefinitionIds: loopDef.protectedDefinitionIds,
    };
    for (const { pileName, items } of piles) {
      for (const sourceItem of (items || [])) {
        let item = sourceItem;
        if (pileNeedsDuplicateSignalResolution(pileName)) {
          if (!isDuplicate(sourceItem)) continue;
          item = findSubmissionItemForDuplicateSignal(sourceItem, new Set(), submissionSpec, settings);
          if (!item) continue;
        }
        const id = Number(item?.id || 0);
        const definitionId = Number(item?.definitionId || 0);
        if (!id || seenIds.has(id) || (definitionId && seenDefinitions.has(definitionId))) continue;
        if (state.consumedItemIds.has(id)) continue;
        seenIds.add(id);
        if (definitionId) seenDefinitions.add(definitionId);
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
      entries = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef), loopDef);
      if (entries.length >= required) return entries;

      const recentEntries = sortRequiredSpecialEntriesForSubmit(
        getEligibleRequiredSpecialEntries(loopDef).filter(({ pileName }) => pileName === 'recent'),
        loopDef,
      );
      if (recentEntries.length && attempt < attempts) {
        log(`${loopDef.name}: waiting for opened ${requiredSpecialLabel(loopDef)} to enter submit cache (${attempt}/${attempts}); recent ${summarizeRequiredSpecialEntries(recentEntries)}`);
      }
    }
    return entries;
  }

  function sortRequiredSpecialEntriesForSubmit(entries, loopDef = {}) {
    const priorityPiles = getRatingSbcPriorityPiles(loopDef);
    const pileRank = Object.fromEntries([...priorityPiles, 'recent'].map((pileName, index) => [pileName, index]));
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
    const policy = getSbcFodderPolicy(loopDef);
    if (policy.mode === 'rating-constrained') return Number(policy.ratingSbcMaxCardRating || 0);
    if (!isNormalGoldFodder(item)) return 0;
    return effectiveNormalGoldMaxRating(
      policy,
      settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange,
    );
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
    const policy = getSbcFodderPolicy(loopDef);
    if (getFsuRejectReasons(item, { playerOnly: true, allowSpecial: false }, getFsuSettings(), {
      sbcFodderPolicy: policy,
      respectFsuGoldRange: policy.mode === 'low-gold',
    }).length) return false;
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
      const externalTotw = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef), loopDef)
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
        const policy = getSbcFodderPolicy(loopDef);
        const maxRating = policy.mode === 'rating-constrained'
          ? Number(policy.ratingSbcMaxCardRating || 0)
          : Number(policy.lowRatedGoldMaxRating || 0);
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

  function inheritSbcFodderPolicy(definition = {}, parent = {}) {
    definition.runtimeSbcFodderPolicy = effectiveSbcFodderPolicy(
      definition,
      parent.runtimeSbcFodderPolicy || getSbcFodderRuntimeOptions(),
    );
    return definition;
  }

  function getAutoTotwUpgradeDef(loopDef = {}) {
    const override = isPlainObject(loopDef.autoTotwUpgrade) ? loopDef.autoTotwUpgrade : {};
    return inheritSbcFodderPolicy({
      id: `${loopDef.id || 'fill-and-verify'}-auto-totw-upgrade`,
      name: 'Scanned TOTW Upgrade',
      ...createTotwUpgradePolicy(),
      maxCompletions: 1,
      ...override,
    }, loopDef);
  }

  function getAutoFodderUpgradeDef(loopDef = {}) {
    const override = isPlainObject(loopDef.autoFodderUpgrade) ? loopDef.autoFodderUpgrade : {};
    return inheritSbcFodderPolicy({
      id: `${loopDef.id || 'fill-and-verify'}-auto-2x84-fodder`,
      name: 'Scanned Rare Gold Fodder Recovery',
      ...createTwoBy84UpgradePolicy({ hidden: false, forceOpenRewardPacks: true }),
      maxCompletions: 1,
      ...override,
    }, loopDef);
  }

  function hasResolvedSbcIdentity(definition = {}) {
    return (definition.sbcSetIds || []).some((value) => Number(value) > 0)
      || (definition.sbcNames || []).some((value) => String(value || '').trim());
  }

  function getAutoFodderUpgradeAttemptLimit(loopDef = {}) {
    if (loopDef.autoFodderUpgrade === undefined || loopDef.autoFodderUpgrade === false) return 0;
    const override = isPlainObject(loopDef.autoFodderUpgrade) ? loopDef.autoFodderUpgrade : {};
    return Math.max(1, Math.min(10, Number(override.maxAttemptsPerCompletion || 3) || 3));
  }

  async function craftAutoFodderUpgrade(loopDef, attempt, maxAttempts) {
    const upgradeDef = getAutoFodderUpgradeDef(loopDef);
    if (!hasResolvedSbcIdentity(upgradeDef)) {
      log(`${loopDef.name}: scanned Rare Gold recovery activity is unavailable; keeping the current squad unsubmitted`);
      return { ok: false, reason: 'scanned Rare Gold recovery activity is unavailable' };
    }
    await refreshInventoryCaches(`${loopDef.name} ${upgradeDef.name} preflight`, { includePacks: false, quiet: true });
    const selection = selectInventoryPlayers(upgradeDef);
    const requiredFodderCount = (upgradeDef.requirements || []).reduce(
      (total, requirement) => total + Math.max(0, Number(requirement?.count || 0) || 0),
      0,
    ) || Number(upgradeDef.expectedPlayerCount || 0) || '?';
    log(`${loopDef.name}: ${upgradeDef.name} attempt ${attempt}/${maxAttempts} selected ${selection.selected.length}/${requiredFodderCount} low rare gold player(s) (${formatSelectionStats(selection.stats)})`);
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
      log(`${loopDef.name}: ${upgradeDef.name} was submitted but its reward pack was not opened; stop before consuming another ${requiredFodderCount} low rare gold card(s)`);
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
    if (!hasResolvedSbcIdentity(upgradeDef)) {
      const reason = 'scanned TOTW Upgrade activity is unavailable';
      log(`${loopDef.name}: cannot auto-craft ${requiredSpecialLabel(loopDef)} because ${reason}`);
      return { ok: false, reason };
    }
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

  function eaPlayerGroupConstraints(model = {}) {
    return (model.constraints || [])
      .map((constraint, index) => ({ constraint, index }))
      .filter(({ constraint }) => constraint.source === 'ea' && constraint.keyName === 'PLAYER_RARITY_GROUP');
  }

  function evaluateDynamicPlayerGroupAvailability(loopDef, model) {
    const candidates = buildRatingSbcCandidateEntries(loopDef, model);
    const requirements = eaPlayerGroupConstraints(model).map(({ constraint, index }) => {
      const matches = candidates.entries.filter((entry) => entry.requirementMatches[index] === true);
      return {
        constraint,
        index,
        matches,
        required: Math.max(0, Number(constraint.count || 0) || 0),
      };
    });
    return {
      ok: requirements.length > 0 && requirements.every((entry) => entry.matches.length >= entry.required),
      candidates,
      requirements,
    };
  }

  function logDynamicPlayerGroupAvailability(loopDef, availability, label = 'EA player-group preflight') {
    for (const entry of availability.requirements || []) {
      log(`${loopDef.name}: ${label} ${entry.constraint.label}: ${entry.matches.length}/${entry.required} safe candidate(s)`);
      entry.matches.slice(0, 3).forEach(({ item, pileName }, index) => {
        log(`${loopDef.name}: ${label} candidate ${index + 1}. ${itemDisplayName(item)} rating:${Number(item?.rating || 0) || '?'} from:${pileName} id:${Number(item?.id || 0) || '?'}`);
      });
      if (entry.matches.length > 3) {
        log(`${loopDef.name}: ${label} candidate list truncated: ${entry.matches.length - 3} more`);
      }
    }
  }

  async function waitForDynamicPlayerGroupAvailability(loopDef, model, label) {
    const attempts = 4;
    let availability = { ok: false, requirements: [], candidates: null };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) await sleep(900 * attempt);
      await refreshInventoryCaches(`${loopDef.name} ${label} ${attempt}/${attempts}`, { includePacks: false, quiet: true });
      resolveRecentRewardItems(`${loopDef.name} ${label} ${attempt}/${attempts}`);
      availability = evaluateDynamicPlayerGroupAvailability(loopDef, model);
      if (availability.ok) return availability;
    }
    return availability;
  }

  async function ensureDynamicPlayerGroupForFillAndVerify(loopDef, model) {
    await refreshInventoryCaches(`${loopDef.name} EA player-group preflight`, { includePacks: false, quiet: true });
    resolveRecentRewardItems(`${loopDef.name} EA player-group preflight`);
    let availability = evaluateDynamicPlayerGroupAvailability(loopDef, model);
    logDynamicPlayerGroupAvailability(loopDef, availability);
    if (availability.ok) return { ready: true, inventoryRefreshed: true };

    const upgradeDef = getAutoTotwUpgradeDef(loopDef);
    if (loopDef.dryRun) {
      await refreshStorePacks().catch(() => null);
      const existingPack = findRewardPackInCache(upgradeDef, null);
      if (existingPack) {
        log(`${loopDef.name}: dry-run found unopened ${upgradeDef.name} reward pack ${packName(existingPack)} (#${existingPack.id}); live run would open it and verify the reward against the live EA player-group matcher`);
        return { ready: true, inventoryRefreshed: true };
      }
      const set = await findSbcSetForLoopDef(upgradeDef, upgradeDef.name);
      const challenge = shouldUseRatingSbcFill(upgradeDef)
        ? await findAvailableRatingSbcChallenge(set, upgradeDef.name)
        : await findAvailableSbcChallenge(set, upgradeDef.name);
      if (challenge) {
        log(`${loopDef.name}: dry-run found no matching EA player-group card; live run would submit ${upgradeDef.name} (#${set.id || '?'}) and verify its reward`);
      } else {
        log(`${loopDef.name}: dry-run found no matching EA player-group card and no available ${upgradeDef.name} challenge remains`);
      }
      return { ready: true, inventoryRefreshed: true };
    }

    const maximumRecoveries = Math.max(1, Math.min(5, ...availability.requirements.map((entry) => (
      Math.max(0, entry.required - entry.matches.length)
    ))));
    for (let attempt = 1; attempt <= maximumRecoveries; attempt++) {
      const openedExistingPack = await openExistingAutoTotwPackIfAvailable(loopDef, upgradeDef);
      if (!openedExistingPack) {
        const crafted = await craftAutoTotwUpgrade(loopDef);
        if (!crafted?.ok) {
          const reason = `EA player-group recovery unavailable: ${crafted?.reason || 'auto craft failed'}`;
          log(`${loopDef.name}: stopping before SBC fill because ${reason}`);
          return { ready: false, inventoryRefreshed: true, reason };
        }
      }

      availability = await waitForDynamicPlayerGroupAvailability(
        loopDef,
        model,
        `post EA player-group recovery ${attempt}/${maximumRecoveries}`,
      );
      logDynamicPlayerGroupAvailability(loopDef, availability, 'post-recovery EA player-group check');
      if (availability.ok) return { ready: true, inventoryRefreshed: true };
    }

    return {
      ready: false,
      inventoryRefreshed: true,
      reason: `${upgradeDef.name} reward did not satisfy the live EA player-group requirement`,
    };
  }

  async function ensureRequiredEligibilityForFillAndVerify(loopDef, challenge) {
    if (!hasDynamicPlayerGroupRequirement(loopDef)) {
      const legacyPreflight = needsAutoTotwPreflight(loopDef);
      const ready = await ensureTotwForFillAndVerify(loopDef);
      return {
        ready,
        inventoryRefreshed: legacyPreflight,
        reason: ready ? '' : 'required legacy special-card preflight is unavailable',
      };
    }

    const model = parseRatingSbcChallenge(loopDef, challenge);
    const groupMatcherErrors = (model.unsupported || []).filter((entry) => String(entry).startsWith('PLAYER_RARITY_GROUP'));
    const groupConstraints = eaPlayerGroupConstraints(model);
    if (groupMatcherErrors.length || !groupConstraints.length) {
      const reason = groupMatcherErrors.length
        ? `live EA player-group matcher unavailable: ${groupMatcherErrors.join(', ')}`
        : 'live EA player-group requirement could not be bound to the active Challenge';
      log(`${loopDef.name}: ${reason}`);
      return { ready: false, inventoryRefreshed: false, reason };
    }
    if (loopDef.autoTotwUpgrade === false) {
      return { ready: true, inventoryRefreshed: false };
    }
    return ensureDynamicPlayerGroupForFillAndVerify(loopDef, model);
  }

  async function ensureTotwForFillAndVerify(loopDef) {
    if (!needsAutoTotwPreflight(loopDef)) return true;
    const required = Math.max(1, Number(loopDef.requiredSpecialCount || 1) || 1);
    const fodderPolicy = getSbcFodderPolicy(loopDef);
    const requiredSpecialMinRating = Number(loopDef.requiredSpecialMinRating || 0);
    if (
      fodderPolicy.mode === 'rating-constrained'
      && requiredSpecialMinRating > Number(fodderPolicy.ratingSbcMaxCardRating || 0)
    ) {
      log(`${loopDef.name}: required ${requiredSpecialLabel(loopDef)} minimum rating ${requiredSpecialMinRating} exceeds rating SBC card cap ${fodderPolicy.ratingSbcMaxCardRating}; stopping before automatic recovery`);
      return false;
    }
    await refreshInventoryCaches(`${loopDef.name} ${requiredSpecialLabel(loopDef)} preflight`, { includePacks: false, quiet: true });
    resolveRecentRewardItems(`${loopDef.name} ${requiredSpecialLabel(loopDef)} preflight`);

    let entries = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef), loopDef);
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
      const set = await findSbcSetForLoopDef(upgradeDef, upgradeDef.name);
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
    const fodderPolicy = getSbcFodderPolicy(loopDef);
    const roleAware = context.roleAware === true;
    const maxRating = context.skipRatingLimit === true ? 0 : getSubmittedRatingLimit(item, loopDef, settings);
    const protectedIds = context.protectedItemIds || new Set((loopDef.protectedItemIds || []).map(Number));
    const protectedDefinitionIds = context.protectedDefinitionIds || new Set((loopDef.protectedDefinitionIds || []).map(Number));
    const allowedSpecialCount = context.allowedSpecialCount !== undefined
      ? Math.max(0, Number(context.allowedSpecialCount || 0) || 0)
      : Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
    const requiredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
    const specialIndex = Number(context.specialIndex || 0) || 0;
    const fsuSpec = {
      playerOnly: true,
      allowSpecial: roleAware || (requiredSpecialCount > 0 && specialIndex <= requiredSpecialCount),
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
      !roleAware &&
      ['totw', 'totw-tots-fof'].includes(requiredSpecialKind(loopDef)) &&
      requiredSpecialCount > 0 &&
      isSbcSpecialItem(item) &&
      specialIndex <= requiredSpecialCount &&
      !isRequiredSpecialItem(item, loopDef)
    ) {
      reasons.push('required-totw');
    }
    if (
      !roleAware &&
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
    getFsuRejectReasons(item, fsuSpec, settings, {
      ...(context || {}),
      sbcFodderPolicy: fodderPolicy,
      respectFsuGoldRange: fodderPolicy.mode === 'low-gold',
    }).forEach((reason) => {
      if (!reasons.includes(reason)) reasons.push(reason);
    });

    return reasons;
  }

  function inspectSbcItems(loopDef, items = [], options = {}) {
    const blocked = [];
    const entries = [];
    let specialCount = 0;
    const requiredSpecialCount = hasDynamicPlayerGroupRequirement(loopDef)
      ? 0
      : Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
    const expectedPlayerCount = Math.max(
      0,
      Number(options.expectedPlayerCount || 0) ||
      Number(loopDef.expectedPlayerCount || 0) ||
      (loopDef.inventoryFillFirst === true ? sumRequirementPlayerCount(loopDef) : 0) ||
      0
    );

    const selectionPolicy = options.selectionPolicy || null;
    const selectionModel = options.model || null;
    const policyProtectedRefs = selectionPolicy?.protectedItems || [];
    const reserveRatings = new Set((selectionPolicy?.protectionPolicy?.reserveRatings || []).map(Number));
    const maxOrdinaryRating = Number(selectionPolicy?.maxOrdinaryRating || 0);
    const requiredItemRefs = selectionPolicy?.requiredItems || [];
    const allowOtherSpecialAsOrdinary = selectionPolicy?.protectionPolicy?.allowOtherSpecialAsOrdinary === true;

    items.forEach((item, index) => {
      if (isSbcSpecialItem(item)) specialCount++;
      const requiredItemMatch = requiredItemRefs.some((ref) => {
        const refId = Number(ref?.id || ref?.ref?.id || 0);
        const refDefinitionId = Number(ref?.definitionId || ref?.ref?.definitionId || 0);
        const itemId = Number(item?.id || item?.ref?.id || 0);
        const itemDefinitionId = Number(item?.definitionId || item?.ref?.definitionId || 0);
        return refId ? refId === itemId : refDefinitionId > 0 && refDefinitionId === itemDefinitionId;
      });
      const exclusiveRoleMatch = (selectionPolicy?.exclusiveRoles || []).some((role) => {
        const constraint = selectionModel?.constraints?.[Number(role.constraintIndex)];
        try { return constraint?.matches?.(item) === true; } catch { return false; }
      });
      const policyRoleMatch = requiredItemMatch || exclusiveRoleMatch;
      const reasons = getSbcProtectionReasons(item, loopDef, {
        specialIndex: specialCount,
        roleAware: selectionPolicy !== null,
        skipRatingLimit: selectionPolicy !== null,
        allowedSpecialCount: selectionPolicy ? expectedPlayerCount : undefined,
      });
      const itemId = Number(item?.id || 0);
      const definitionId = Number(item?.definitionId || 0);
      if (selectionPolicy && policyProtectedRefs.some((ref) => (
        Number(ref?.id || 0) ? Number(ref.id) === itemId : Number(ref?.definitionId || 0) === definitionId
      ))) reasons.push('protected-selection-item');
      if (selectionPolicy && !policyRoleMatch && maxOrdinaryRating > 0 && Number(item?.rating || 0) > maxOrdinaryRating) {
        reasons.push(`rating-over-${maxOrdinaryRating}`);
      }
      if (selectionPolicy && !policyRoleMatch && reserveRatings.has(Number(item?.rating || 0))) {
        reasons.push(`reserved-rating-${Number(item?.rating || 0)}`);
      }
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

    return {
      items,
      entries,
      blocked,
      specialCount,
      requiredSpecialMetCount,
      expectedPlayerCount,
      missingRequirements,
      allowOtherSpecialAsOrdinary,
    };
  }

  function inspectSbcSquad(loopDef, squad = ctrl()?._squad, options = {}) {
    return inspectSbcItems(loopDef, getSquadItems(squad), options);
  }

  function logSbcSquadInspection(loopDef, inspection, options = {}) {
    const maxItems = Number(options.maxItems || 20);
    const requiredPart = !hasDynamicPlayerGroupRequirement(loopDef)
      && Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0)
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
    const requiredSpecialCount = hasDynamicPlayerGroupRequirement(loopDef)
      ? 0
      : Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);

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
      const requiredSpecialMaxRating = Number(getSbcFodderPolicy(loopDef).ratingSbcMaxCardRating || 0);
      hints.push(`add ${requiredSpecialCount - (inspection.requiredSpecialMetCount || 0)} untradeable ${requiredSpecialLabel(loopDef)} card(s) rating <= ${requiredSpecialMaxRating || 'limit'}`);
    }
    const missingPlayers = parseMissingPlayerCount(inspection);
    if (missingPlayers) {
      hints.push(`add ${missingPlayers.missing} eligible normal gold player(s) to fill ${missingPlayers.current}/${missingPlayers.expected} squad slots`);
    }
    if (!inspection.allowOtherSpecialAsOrdinary && allowedSpecialCount && (inspection.specialCount || 0) > allowedSpecialCount) {
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

    const claimConfirmed = await claimSbcRewardsIfPresent(set.name, { set, beforePackCounts, beforeProgress });
    if (!claimConfirmed) {
      fail(`${set.name}: SBC submission could not be confirmed by reward, progress, or My Packs state; preserving inventory state`);
    }
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
    recordObservedPackCatalogReward(set, rewardPackId);

    // Capture the reward before leaving the submitted squad, then unwind every SBC
    // submission path before a reward pack is opened or another challenge is loaded.
    await syncAfterSbcSubmit(set?.name || 'SBC submit');
    return rewardPackId;
  }

  function rewardPackIdFromSubmitResult(result, set, options = {}) {
    const awards = [
      ...collectionValues(result?.data?.grantedChallengeAwards),
      ...collectionValues(result?.response?.grantedChallengeAwards),
      ...collectionValues(result?.data?.grantedSetAwards),
      ...collectionValues(result?.response?.grantedSetAwards),
      ...collectionValues(result?.data?.awards),
      ...collectionValues(result?.response?.awards),
    ];
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
    return options.allowSetFallback === true ? Number(set?.awards?.[0]?.value) || null : null;
  }

  async function applyPlayersToRatingChallenge(challenge, players, label = 'rating SBC') {
    const squad = challenge?.squad;
    if (!squad) fail(`${label}: challenge squad missing while applying background players`);
    const list = Array.isArray(players) ? players.filter(Boolean) : [];
    if (!list.length) fail(`${label}: no players available to apply before background submit`);
    const playerList = buildSquadPlayerList(challenge, list);
    try { squad.removeAllItems?.(); } catch { }
    squad.setPlayers(playerList, true);
    return list;
  }

  const backgroundSubmitTelemetry = createBackgroundSubmitTelemetry();

  function currentBackgroundSubmitItems(players = []) {
    const refs = (players || []).filter(Boolean).map((item) => liveItemRef(item));
    return summarizeBackgroundSubmitItems(refs, {
      resolveItem: (ref) => {
        const live = findCachedItemById(
          Number(ref?.id || 0),
          ['unassigned', 'storage', 'transfer', 'club'],
        );
        if (!live?.item) return null;
        return {
          id: Number(live.item?.id || 0),
          definitionId: Number(live.item?.definitionId || 0),
          rating: Number(live.item?.rating || 0),
          pile: live.pileName,
          ref: { pile: live.pileName },
        };
      },
    });
  }

  function backgroundSubmitItemsAfterFailure(players = [], options = {}, submission = null) {
    let selectedItems = currentBackgroundSubmitItems(players);
    if (typeof options.failureInventoryDiagnostic === 'function') {
      try {
        selectedItems = options.failureInventoryDiagnostic({ players, submission }) || selectedItems;
      } catch { }
    }
    return selectedItems;
  }

  function currentBackgroundSubmitState(set, challenge, submissionOptions = {}) {
    let cachedChallenges = [];
    let squadItems = [];
    try { cachedChallenges = getCachedSbcChallenges(set); } catch { }
    try { squadItems = getSquadItems(challenge?.squad); } catch { }
    return summarizeBackgroundSubmitState({
      set,
      challenge,
      cachedChallenges,
      squadItems,
      submissionOptions,
      controllerName: currentControllerName(),
    });
  }

  function logBackgroundSubmitDiagnostic(label, submission, players, options = {}, evidence = {}) {
    emitDiagnostic(log, () => {
      const selectedItemsAfter = backgroundSubmitItemsAfterFailure(players, options, submission);
      const { selectedItemsBefore = null, ...diagnosticEvidence } = evidence;
      return `${label}: background submit diagnostic ${diagnosticJson({
        submission,
        ...diagnosticEvidence,
        selectedItems: {
          before: selectedItemsBefore,
          after: selectedItemsAfter,
        },
      })}`;
    });
  }

  async function submitRatingSbcInBackground(set, challenge, label = set?.name || 'rating SBC', options = {}) {
    const beforePackCounts = getPackCountsById();
    const players = Array.isArray(options.players) ? options.players.filter(Boolean) : [];
    const maxAttempts = Math.max(1, Math.min(5, Number(options.maxAttempts || 3) || 3));
    let currentChallenge = challenge;
    let lastDetail = 'unknown';

    const completeSuccessfulSubmit = async (result) => {
      const directRewardPackId = rewardPackIdFromSubmitResult(result, set);
      let newPackId = null;
      const observationAttempts = Math.max(1, Math.min(5, Number(options.rewardObservationAttempts || 3) || 3));
      for (let observationAttempt = 1; observationAttempt <= observationAttempts; observationAttempt++) {
        await refreshStorePacks().catch(() => null);
        const afterPacks = getAvailableRepositoryMyPacks();
        const afterPackCounts = getPackCountsById(afterPacks);
        const newPack = afterPacks.find((pack) => {
          const id = packIdKey(pack);
          return id && Number(afterPackCounts.get(id) || 0) > Number(beforePackCounts.get(id) || 0);
        });
        newPackId = Number(packIdKey(newPack)) || null;
        if (directRewardPackId || newPackId || observationAttempt >= observationAttempts) break;
        await sleep(Math.min(2000, 500 * observationAttempt));
      }
      const rewardObserved = Boolean(directRewardPackId || newPackId);
      const usedKnownFallback = !rewardObserved && options.allowKnownRewardFallback === true;
      const rewardPackId = directRewardPackId
        || newPackId
        || (usedKnownFallback ? rewardPackIdFromSubmitResult(result, set, { allowSetFallback: true }) : null);
      recordObservedPackCatalogReward(set, rewardPackId);
      log(`${label}: background submit complete; reward pack ${rewardPackId || 'not granted for this Challenge'}${usedKnownFallback ? ' (single-Challenge identity fallback)' : ''}`);
      return {
        rewardPackId,
        rewardObserved,
        usedKnownFallback,
      };
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let canSubmit = true;
      let retryEvidence = null;

      if (players.length) {
        try {
          await applyPlayersToRatingChallenge(currentChallenge, players, `${label} attempt ${attempt}`);
        } catch (error) {
          lastDetail = error?.message || String(error);
          if (attempt >= maxAttempts) fail(`${label}: ${lastDetail}`);
          log(`${label}: could not apply background squad before submit attempt ${attempt}/${maxAttempts}: ${lastDetail}`);
          await sleep(Math.min(3000, (Number(CFG.pauseMs) || 800) + attempt * 500));
          try {
            currentChallenge = await loadRatingSbcChallenge(currentChallenge, `${label} submit-retry`, { force: true }) || currentChallenge;
          } catch (reloadError) {
            log(`${label}: challenge reload after apply failure: ${reloadError?.message || reloadError}`);
          }
          continue;
        }
      }

      try { canSubmit = currentChallenge?.canSubmit?.() !== false; } catch { }
      if (!canSubmit) {
        lastDetail = 'challenge model rejected the background squad before submit';
        if (attempt >= maxAttempts) fail(`${label}: ${lastDetail}`);
        retryEvidence = {
          attempt,
          detail: lastDetail,
          kind: 'local-model-rejected',
          submission: null,
          submissionOptions: {},
          selectedItemsBefore: currentBackgroundSubmitItems(players),
          stateBefore: currentBackgroundSubmitState(set, currentChallenge),
          packCountsBefore: getPackCountsById(),
        };
        log(`${label}: ${lastDetail}; reloading before retry (${attempt}/${maxAttempts})`);
      } else {
        const { skipValidation, chemistryEnabled } = eaSbcAdapter().submissionOptions();
        const submissionOptions = { skipValidation, chemistryEnabled };
        const selectedItemsBefore = currentBackgroundSubmitItems(players);
        const stateBefore = currentBackgroundSubmitState(set, currentChallenge, submissionOptions);
        const attemptPackCountsBefore = getPackCountsById();
        log(`Submitting SBC in background: ${set.name}${attempt > 1 ? ` (retry ${attempt}/${maxAttempts})` : ''}`);
        const submitEvent = backgroundSubmitTelemetry.begin({
          setId: Number(set?.id || 0),
          challengeId: Number(currentChallenge?.id || 0),
          attempt,
          maxAttempts,
          playerCount: players.length,
          submittedItemIds: players.map((item) => Number(item?.id || 0)).filter(Boolean),
          skipValidation,
          chemistryEnabled,
        });
        let result;
        try {
          result = await observeOnce(
            eaSbcAdapter().submitChallenge(currentChallenge, set, { skipValidation, chemistryEnabled }),
            ctrl(),
            45000,
            `submitChallenge ${label}`,
          );
        } catch (error) {
          const submission = backgroundSubmitTelemetry.complete(submitEvent, {
            success: false,
            error,
          });
          logBackgroundSubmitDiagnostic(label, submission, players, options, {
            selectedItemsBefore,
            state: {
              before: stateBefore,
              after: currentBackgroundSubmitState(set, currentChallenge, submissionOptions),
            },
            packInventory: summarizeBackgroundSubmitPackCounts(
              attemptPackCountsBefore,
              getPackCountsById(),
            ),
          });
          throw error;
        }
        const submissionDiagnostic = backgroundSubmitTelemetry.complete(submitEvent, result);
        if (result?.success) {
          return completeSuccessfulSubmit(result);
        }
        const stateAfter = currentBackgroundSubmitState(set, currentChallenge, submissionOptions);
        const packInventory = summarizeBackgroundSubmitPackCounts(
          attemptPackCountsBefore,
          getPackCountsById(),
        );
        logBackgroundSubmitDiagnostic(label, submissionDiagnostic, players, options, {
          selectedItemsBefore,
          state: { before: stateBefore, after: stateAfter },
          packInventory,
        });
        lastDetail = serviceResultErrorText(result) || result?.status || 'unknown';
        const overridePlan = planItemViolationOverride({
          allowOverride: options.allowItemViolationOverride === true,
          attempt,
          maxAttempts,
          detail: lastDetail,
          result,
          submittedItemIds: players.map((item) => Number(item?.id || 0)).filter(Boolean),
          skipValidation,
        });
        if (overridePlan.retry) {
          const forcedOptions = { skipValidation: true, chemistryEnabled };
          const names = overridePlan.violationNames.join('/') || 'unnamed warning';
          log(`${label}: EA rejected ${overridePlan.violationItemIds.length} submitted item(s) with ${names}; confirming the same saved squad once with skipValidation:true`);
          const forcedSelectedItemsBefore = currentBackgroundSubmitItems(players);
          const forcedStateBefore = currentBackgroundSubmitState(set, currentChallenge, forcedOptions);
          const forcedPackCountsBefore = getPackCountsById();
          const forcedEvent = backgroundSubmitTelemetry.begin({
            setId: Number(set?.id || 0),
            challengeId: Number(currentChallenge?.id || 0),
            attempt: attempt + 1,
            maxAttempts,
            playerCount: players.length,
            submittedItemIds: players.map((item) => Number(item?.id || 0)).filter(Boolean),
            skipValidation: true,
            chemistryEnabled,
          });
          let forcedResult;
          try {
            forcedResult = await observeOnce(
              eaSbcAdapter().submitChallenge(currentChallenge, set, forcedOptions),
              ctrl(),
              45000,
              `submitChallenge ${label} validation override`,
            );
          } catch (error) {
            const forcedSubmission = backgroundSubmitTelemetry.complete(forcedEvent, {
              success: false,
              error,
            });
            logBackgroundSubmitDiagnostic(label, forcedSubmission, players, options, {
              selectedItemsBefore: forcedSelectedItemsBefore,
              state: {
                before: forcedStateBefore,
                after: currentBackgroundSubmitState(set, currentChallenge, forcedOptions),
              },
              packInventory: summarizeBackgroundSubmitPackCounts(
                forcedPackCountsBefore,
                getPackCountsById(),
              ),
            });
            throw error;
          }
          const forcedDiagnostic = backgroundSubmitTelemetry.complete(forcedEvent, forcedResult);
          if (forcedResult?.success) return completeSuccessfulSubmit(forcedResult);

          logBackgroundSubmitDiagnostic(label, forcedDiagnostic, players, options, {
            selectedItemsBefore: forcedSelectedItemsBefore,
            state: {
              before: forcedStateBefore,
              after: currentBackgroundSubmitState(set, currentChallenge, forcedOptions),
            },
            packInventory: summarizeBackgroundSubmitPackCounts(
              forcedPackCountsBefore,
              getPackCountsById(),
            ),
          });
          const forcedDetail = serviceResultErrorText(forcedResult) || forcedResult?.status || 'unknown';
          fail(`${label}: background submit validation override failed: ${forcedDetail}`);
        }
        const plan = planBackgroundSubmitRetry({
          attempt,
          maxAttempts,
          detail: lastDetail,
          baseDelayMs: Number(CFG.pauseMs) || 800,
        });
        if (!plan.retry) {
          fail(`${label}: background submit failed: ${lastDetail}`);
        }
        retryEvidence = {
          attempt,
          detail: lastDetail,
          kind: 'submit-failure',
          submission: submissionDiagnostic,
          submissionOptions,
          selectedItemsBefore,
          stateBefore,
          stateAfter,
          packCountsBefore: attemptPackCountsBefore,
        };
        log(`${label}: background submit returned ${lastDetail}; reloading challenge before retry (${attempt}/${maxAttempts})`);
        await sleep(plan.delayMs);
      }

      const reloadStateBefore = currentBackgroundSubmitState(
        set,
        currentChallenge,
        retryEvidence?.submissionOptions,
      );
      const reloadAttempts = [];
      let reloadOutcome = 'unavailable';
      let reloadError = null;
      try {
        const reloaded = await loadRatingSbcChallenge(currentChallenge, `${label} submit-retry`, {
          force: true,
          onDiagnostic: (diagnostic) => reloadAttempts.push({ source: 'current-challenge', ...diagnostic }),
        });
        if (reloaded) {
          currentChallenge = reloaded;
          reloadOutcome = 'current-challenge-loaded';
        }
        else {
          const next = await findAvailableRatingSbcChallenge(set, `${label} submit-retry`);
          if (next) {
            currentChallenge = await loadRatingSbcChallenge(next, `${label} submit-retry`, {
              force: true,
              onDiagnostic: (diagnostic) => reloadAttempts.push({ source: 'next-challenge', ...diagnostic }),
            }) || next;
            reloadOutcome = 'next-challenge-loaded';
          }
        }
      } catch (error) {
        reloadOutcome = 'failed';
        reloadError = sanitizeBackgroundSubmitResult({ success: false, error });
        log(`${label}: challenge reload after submit conflict failed: ${error?.message || error}`);
      }
      emitDiagnostic(log, () => `${label}: background submit retry reconciliation diagnostic ${diagnosticJson({
        trigger: {
          attempt: retryEvidence?.attempt || attempt,
          maxAttempts,
          detail: retryEvidence?.detail || lastDetail,
          kind: retryEvidence?.kind || 'unknown',
        },
        reload: {
          outcome: reloadOutcome,
          attempts: reloadAttempts,
          error: reloadError,
        },
        state: {
          before: reloadStateBefore,
          after: currentBackgroundSubmitState(set, currentChallenge, retryEvidence?.submissionOptions),
        },
        selectedItems: {
          beforeSubmit: retryEvidence?.selectedItemsBefore || null,
          afterReload: backgroundSubmitItemsAfterFailure(players, options, retryEvidence?.submission),
        },
        packInventory: summarizeBackgroundSubmitPackCounts(
          retryEvidence?.packCountsBefore || beforePackCounts,
          getPackCountsById(),
        ),
      })}`);
      if (!canSubmit && attempt < maxAttempts) {
        await sleep(Math.min(3000, (Number(CFG.pauseMs) || 800) + attempt * 500));
      }
    }

    fail(`${label}: background submit failed after ${maxAttempts} attempt(s): ${lastDetail}`);
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
    if (!pack) pack = findSourcePackInCache(loopDef);
    if (!pack && loopDef.rewardPackNames?.length) pack = findPackByName(loopDef.rewardPackNames);
    return pack || null;
  }

  function findRewardPackInCache(loopDef, explicitPackId = null, options = {}) {
    const packs = options.repositoryOnly === true
      ? getAvailableRepositoryMyPacks()
      : getAvailableMyPacks();
    const findById = (id) => packs.find((pack) => packIdKey(pack) === packIdKey(id)) || null;
    const findByName = (patterns) => packs.find((pack) => matchesAny(packName(pack), patterns)) || null;
    const findByPredicate = (predicate) => packs.find((pack) => {
      try { return !!predicate(pack); } catch { return false; }
    }) || null;
    let pack = explicitPackId ? findById(explicitPackId) : null;
    if (!pack && loopDef.rewardPackIds?.length) {
      pack = loopDef.rewardPackIds.map((id) => findById(id)).find(Boolean);
    }
    if (!pack && loopDef.rewardPackNames?.length) pack = findByName(loopDef.rewardPackNames);
    if (!pack && options.fallbackPackMatcher) pack = findByPredicate(options.fallbackPackMatcher);
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
        const visiblePacks = options.repositoryOnly === true
          ? getAvailableRepositoryMyPacks()
          : getAvailableMyPacks();
        log(`${loopDef.name}: waiting for reward pack${explicitPackId ? ` #${explicitPackId}` : ''} (${attempt}/${attempts}); current packs: ${summarizePacks(visiblePacks) || 'none'}`);
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
        openedItemPolicy: createOpenedItemPolicy(async (openedItems, context = {}) => {
          if (options.assumeTotwReward) {
            markAssumedTotwRewardItems(openedItems, `${loopDef.name} ${reason}`);
          }
          // EA can expose the pack response before Purchased/Unassigned caches settle.
          await materializeOpenedPlayerRewards(openedItems, `${loopDef.name} ${reason}`, {
            routingBaseline: context.routingBaseline || null,
          });
          await resolveRuntimeUnassigned(`${loopDef.name} ${reason} handling`);
          resolveRecentRewardItems(`${loopDef.name} ${reason}`);
          await refreshUnassigned();
          return openedItemRoutingResult(
            openedItems,
            null,
            { assumeTotwReward: options.assumeTotwReward === true },
            context.routingBaseline || null,
          );
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

  function resolvedSourcePackIdentity(loopDef = {}) {
    const producedDefs = [
      loopDef,
      loopDef.rareUpgrade,
      loopDef.commonUpgrade,
      ...(Array.isArray(loopDef.craftingUpgrades) ? loopDef.craftingUpgrades : []),
      ...(Array.isArray(loopDef.stages) ? loopDef.stages : []),
    ].filter(Boolean);
    return resolveSourcePackIdentity({
      sourcePackRef: loopDef.sourcePackRef,
      sourcePackIds: loopDef.sourcePackIds,
      sourcePackNames: loopDef.sourcePackNames,
      producedRewardPackIds: producedDefs.flatMap((definition) => definition.rewardPackIds || []),
      producedRewardPackNames: producedDefs.flatMap((definition) => definition.rewardPackNames || []),
      catalog: state.packCatalog,
    });
  }

  function findSourcePackInCache(loopDef) {
    const identity = resolvedSourcePackIdentity(loopDef);
    if (identity.sourceOutputOverlap.length) return null;
    const producedIds = new Set(identity.producedPackIds.map(packIdKey).filter(Boolean));
    const isProducedPack = (pack) => (
      producedIds.has(packIdKey(pack))
        || matchesAny(packName(pack), identity.producedPackNames)
    );
    for (const candidate of identity.candidates) {
      const pack = candidate.type === 'id'
        ? findPackById(candidate.value)
        : findPackByName([candidate.value]);
      if (pack && !isProducedPack(pack)) return pack;
    }
    return null;
  }

  function sourcePackExpectation(loopDef) {
    const identity = resolvedSourcePackIdentity(loopDef);
    return [
      identity.rewardOfLoopId ? `reward of Loop:${identity.rewardOfLoopId}${identity.dynamicResolved ? '' : ' (unresolved)'}` : '',
      identity.dynamicPackIds.length ? `dynamic IDs:${identity.dynamicPackIds.join('/')}` : '',
      identity.dynamicPackNames.length ? `dynamic names:${identity.dynamicPackNames.join(' / ')}` : '',
      identity.staticPackIds.length ? `fallback IDs:${identity.staticPackIds.join('/')}` : '',
      identity.staticPackNames.length ? `fallback names:${identity.staticPackNames.join(' / ')}` : '',
    ].filter(Boolean).join('; ') || 'no configured identity';
  }

  const warnedSourcePackIdentityMismatches = new Set();
  const warnedSourceOutputOverlaps = new Set();

  function sourcePackIdentityBlocked(loopDef, label) {
    const identity = resolvedSourcePackIdentity(loopDef);
    if (!identity.sourceOutputOverlap.length) return false;
    const overlap = identity.sourceOutputOverlap
      .map((candidate) => `${candidate.type}:${candidate.value} (${candidate.source})`)
      .join(', ');
    const warningKey = `${loopDef?.id || label}:${overlap}`;
    if (!warnedSourceOutputOverlaps.has(warningKey)) {
      warnedSourceOutputOverlaps.add(warningKey);
      log(`${label}: source/output pack identity overlap detected; refusing to open matching source pack(s): ${overlap}`);
    }
    return true;
  }

  function warnSourcePackIdentityMismatch(loopDef, pack, label) {
    const identity = resolvedSourcePackIdentity(loopDef);
    const ids = new Set(identity.packIds.map(packIdKey).filter(Boolean));
    const names = identity.packNames;
    const id = packIdKey(pack);
    const name = packName(pack);
    if (!id || !ids.has(id) || !names.length || matchesAny(name, names)) return;
    const warningKey = `${id}:${name}`;
    if (warnedSourcePackIdentityMismatches.has(warningKey)) return;
    warnedSourcePackIdentityMismatches.add(warningKey);
    log(`${label}: pack #${id} matched a resolved source ID, but its name "${name || '?'}" did not match Catalog or fallback aliases; accepting the ID and retaining name fallback for future pack IDs`);
  }

  async function findSourcePack(loopDef, options = {}) {
    const label = String(options.label || `${loopDef.name}: source pack lookup`);
    if (sourcePackIdentityBlocked(loopDef, label)) return null;
    const pack = await findPackWithRecovery({
      label,
      attempts: options.attempts || 3,
      delayMs: options.delayMs ?? 900,
      openStoreFallback: options.openStoreFallback !== false,
      refresh: () => refreshStorePacks(),
      findCached: () => findSourcePackInCache(loopDef),
      openStorePacks: () => openStorePacksViewForRefresh(label),
      onStoreOpened: options.onStoreOpened,
      sleep,
      log,
      onWait: ({ attempt, attempts }) => {
        if (options.logWait === true || attempt === attempts) {
          log(`${label}: waiting for ${sourcePackExpectation(loopDef)} (${attempt}/${attempts}); current packs: ${summarizePacks() || 'none'}`);
        }
      },
      onExhausted: ({ attempts }) => {
        log(`${label}: confirmed unavailable after ${attempts} refresh attempt(s); expected ${sourcePackExpectation(loopDef)}; current packs: ${summarizePacks() || 'none'}`);
      },
    });
    if (pack) warnSourcePackIdentityMismatch(loopDef, pack, label);
    return pack;
  }

  async function submitConfiguredSbc(loopDef, options = {}) {
    const selection = options.selection || null;
    const attempt = await submitSbcAttempt({
      label: loopDef.name,
      challengeProvider: async () => {
        const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
        return openSbcSet(set, { returnNullIfComplete: options.returnNullIfComplete });
      },
      squadProvider: selection
        ? createInventorySquadProvider({
            selection,
            prepareSelection: async (_context, inputSelection) => prepareInventorySelection(loopDef, inputSelection),
            itemRef: liveItemRef,
          })
        : createFsuFillProvider({
            fill: async () => fillSbcSquad(loopDef.name),
            getPlayers: async ({ challenge }) => getSquadItems(ctrl()?._squad || challenge?.squad),
            itemRef: liveItemRef,
          }),
      prepareRuntimeAccess: prepareFsuRuntimeAccess,
      saveSquad: async ({ challenge, players, runtimeAccess }) => {
        if (!selection && !runtimeAccess?.refreshedClubPlayers) return;
        const reason = selection ? 'inventory selection' : 'provisional Club refresh';
        if (selection) log(`${loopDef.name}: applying inventory selection before submit`);
        else log(`${loopDef.name}: applying freshly validated Club entities before submit`);
        await saveChallengeSquad(challenge, players, `${loopDef.name} ${reason}`);
      },
      preSaveValidators: [({ challenge, players }) => {
        const inspection = selection
          ? inspectSbcItems(loopDef, players, { expectedPlayerCount: expectedSbcPlayerCount(loopDef, challenge) })
          : inspectSbcSquad(loopDef, ctrl()?._squad || challenge?.squad);
        logSbcSquadInspection(loopDef, inspection);
        assertSbcSquadSafe(loopDef, inspection);
        return true;
      }],
      readSavedPlayers: selection
        ? async ({ challenge }) => getSquadItems(challenge?.squad || ctrl()?._squad)
        : undefined,
      postSaveValidators: selection
        ? [({ challenge }) => {
            const inspection = inspectSbcSquad(loopDef, challenge?.squad || ctrl()?._squad);
            logSbcSquadInspection(loopDef, inspection);
            assertSbcSquadSafe(loopDef, inspection);
            return true;
          }]
        : [],
      isSubmitReady: async () => !!findSubmitButton(),
      submitTransport: async ({ set, players, savedPlayers }) => {
        emitDiagnostic(log, () => {
          const submittedPlayers = savedPlayers?.length ? savedPlayers : players || [];
          const signalCount = selectedUnassignedSignalRefs(selection).length;
          if (!signalCount) return null;
          const refs = submittedPlayers.map((item) => `${Number(item?.id || 0) || '?'}/def:${Number(item?.definitionId || 0) || '?'}`);
          return `${loopDef.name}: submit squad for ${signalCount} Unassigned signal(s): ${refs.join(', ')}`;
        });
        return {
          submitted: true,
          rewardPackId: await submitSbcAndGetAwardPackId(set),
        };
      },
      runCommittedSubmit: runCommittedSbcSubmit,
      afterSubmit: selection
        ? async ({ players, savedPlayers, squadPlan }) => finalizeSubmittedInventorySelection(
            squadPlan?.selection || selection,
            loopDef.name,
            savedPlayers?.length ? savedPlayers : players,
          )
        : undefined,
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

  async function selectDailySeedInventory(loopDef) {
    const { requirement, priorityPiles } = createSingleCardSelectionRequirement(
      loopDef,
      loopDef.targetDuplicate,
    );
    await refreshInventoryCaches(`${loopDef.name} seed inventory selection`, { includePacks: false, quiet: true });
    return {
      requirement,
      selection: selectInventoryPlayers([requirement], priorityPiles),
    };
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

  async function reconcileSubmittedDuplicateSignals(selection, label, submittedItems = []) {
    const selectedSignalRefs = selectedUnassignedSignalRefs(selection);
    if (!selectedSignalRefs.length) return 0;
    const submittedIds = (submittedItems || [])
      .map((item) => Number(item?.id || item?.ref?.id || 0))
      .filter(Boolean);
    if (!submittedIds.length) {
      log(`${label}: could not confirm submitted item IDs for ${selectedSignalRefs.length} Unassigned duplicate signal(s); preserving them for the next inventory refresh`);
      return 0;
    }
    const consumedSignalRefs = submittedUnassignedSignalRefs(selection, submittedItems);
    if (!consumedSignalRefs.length) return 0;

    rememberConsumedDuplicateSignals(consumedSignalRefs);
    log(`${label}: consumed ${consumedSignalRefs.length} Unassigned duplicate signal(s) by submitting their matching Club/Storage item(s)`);
    await refreshInventoryCaches(`${label} post-submit duplicate sync`, { includePacks: false, quiet: true });
    clearConsumedDuplicateSignals(consumedSignalRefs, label);
    return consumedSignalRefs.length;
  }

  async function finalizeSubmittedInventorySelection(selection, label, players = []) {
    const submittedPlayers = (players || []).filter((item) => Number(item?.id || 0));
    if (!submittedPlayers.length) {
      log(`${label}: submitted squad item IDs are unavailable; preserving inventory and Unassigned duplicate state for refresh`);
      return;
    }
    markSbcItemsConsumed(submittedPlayers, label);
    await reconcileSubmittedDuplicateSignals(selection, label, submittedPlayers);
  }

  async function trySubmitUnassignedRecoveryRecipe({ policy, recipe, triggerRefs }) {
    const parentLoopDef = state.loopStack[state.loopStack.length - 1] || null;
    recipe = inheritSbcFodderPolicy(cloneLoopDef(recipe), parentLoopDef || {});
    const label = `Unassigned ${policy.id} -> ${recipe.name}`;
    let set;
    try {
      set = await findSbcSetForDefIfPresent(recipe);
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
    const triggerCoverage = evaluateRecoveryTriggerSelection(recipe, policy, selection, triggerRefs);
    if (!triggerCoverage.sufficient) {
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
        reason: `selection resolved ${triggerCoverage.selectedCount}/${triggerCoverage.expectedCount} expected blocked duplicate signal(s) for ${triggerCoverage.capacity} matching recipe slot(s); diagnostic logged before submit`,
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
    const inventoryOnly = loopDef.inventoryOnly === true;
    if (inventoryOnly) {
      const tier = String(loopDef.targetDuplicate?.tier || 'target');
      log(`${loopDef.name}: inventory-only mode; ${tier} packs will remain unopened and SBCs will use current inventory`);
    }
    const result = await runRecycleWorkflow({
      maxCompletions: Number(loopDef.maxCompletions || 7),
      packOpeningEnabled: !inventoryOnly,
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
        const selection = selectInventoryPlayers([
          { ...loopDef.targetDuplicate, count: 1, priorityPiles: ['unassigned'] },
        ], ['unassigned'], {
          preferredSignalRefs: targets.map((item) => liveItemRef(item, 'unassigned')),
        });
        if (!selection.ok) {
          logSelectionDiagnostics(`${loopDef.name} target duplicate`, selection, ['unassigned']);
          return { status: 'blocked', reason: 'target Unassigned duplicate cannot be resolved to a submit-ready Club/Storage item' };
        }
        return await submitConfiguredSbc(loopDef, { returnNullIfComplete: true, selection }) || {
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
          const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
          const challenge = await findAvailableSbcChallenge(set, loopDef.name);
          if (!challenge) return { status: 'unavailable', reason: 'no available seed SBC challenge remains' };
          const { requirement, selection } = await selectDailySeedInventory(loopDef);
          logDryRunSelection(`${loopDef.name} seed inventory`, selection, { priorityPiles: requirement.priorityPiles });
          if (!selection.ok) {
            return { status: 'blocked', reason: 'no FSU-compatible daily seed player is available' };
          }
          const reason = inventoryOnly
            ? 'inventory-only mode'
            : 'no target duplicate or reward pack';
          log(`${loopDef.name}: dry-run ${reason}; seed SBC available ${set.name} (#${set.id || '?'}) challenge #${challenge.id || '?'}`);
          return { status: 'planned', reason: 'would submit seed SBC' };
        }
        const reason = inventoryOnly
          ? 'inventory-only mode'
          : 'no target duplicate or reward pack';
        const { requirement, selection } = await selectDailySeedInventory(loopDef);
        log(`${loopDef.name}: seed inventory selected ${selection.selected.length}/1 player(s) (${formatSelectionStats(selection.stats)})`);
        if (!selection.ok) {
          logSelectionDiagnostics(`${loopDef.name} seed inventory`, selection, requirement.priorityPiles);
          return { status: 'blocked', reason: 'no FSU-compatible daily seed player is available' };
        }
        log(`${loopDef.name}: ${reason}; submitting seed SBC ${current.completions + 1}/${loopDef.maxCompletions}`);
        return await submitConfiguredSbc(loopDef, { returnNullIfComplete: true, selection }) || {
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
      openFinalReward: !inventoryOnly && loopDef.openRewardPacks === true
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

  function isOpenRewardPacksEnabled() {
    return document.querySelector('#bronze-loop-open-rewards')?.checked === true;
  }

  function loadLoopUiOptions() {
    try {
      const saved = adapters.localStorage.getJson(LOOP_UI_OPTIONS_KEY, {});
      return {
        inventoryOnly: saved.inventoryOnly === true || saved.dailyRecycleInventoryOnly === true,
      };
    } catch {
      return { inventoryOnly: false };
    }
  }

  function saveLoopUiOptions() {
    const inventoryOnly = document.querySelector('#bronze-loop-daily-inventory-only')?.checked === true;
    try {
      adapters.localStorage.setJson(LOOP_UI_OPTIONS_KEY, {
        inventoryOnly,
      });
    } catch { }
  }

  function getPickRuntimeOptions() {
    return normalizePickRuntimeOptions(state.pickOptions);
  }

  function getSbcFodderRuntimeOptions() {
    return normalizeSbcFodderPolicy(state.sbcFodderOptions || DEFAULT_SBC_FODDER_POLICY);
  }

  function loadSbcFodderOptions() {
    try {
      const stored = adapters.localStorage.getJson(SBC_FODDER_OPTIONS_KEY, null);
      if (stored && typeof stored === 'object') return normalizeSbcFodderPolicy(stored);
      const legacyPickOptions = adapters.localStorage.getJson(PICK_OPTIONS_KEY, {});
      return normalizeSbcFodderPolicy(legacyPickOptions);
    } catch {
      return normalizeSbcFodderPolicy();
    }
  }

  function getSbcFodderPolicy(loopDef = {}) {
    return effectiveSbcFodderPolicy(
      loopDef,
      loopDef.runtimeSbcFodderPolicy || getSbcFodderRuntimeOptions(),
    );
  }

  function renderCurrentSelectionPolicySummary() {
    renderSelectionPolicySummary({
      panel: document.querySelector('#bronze-loop-panel'),
      pickOptions: getPickRuntimeOptions(),
      sbcFodderOptions: getSbcFodderRuntimeOptions(),
    });
  }

  function saveSbcFodderOptions(input = state.sbcFodderOptions) {
    const options = normalizeSbcFodderPolicy(input);
    state.sbcFodderOptions = options;
    try {
      adapters.localStorage.setJson(SBC_FODDER_OPTIONS_KEY, options);
    } catch { }
    log(`SBC fodder policy updated: low-rated Gold <= ${options.lowRatedGoldMaxRating}; rating SBC all cards <= ${options.ratingSbcMaxCardRating}`);
    renderCurrentSelectionPolicySummary();
    return options;
  }

  function loadPickRuntimeOptions() {
    try {
      return normalizePickRuntimeOptions(adapters.localStorage.getJson(PICK_OPTIONS_KEY, {}));
    } catch {
      return normalizePickRuntimeOptions();
    }
  }

  function savePickRuntimeOptions(input = state.pickOptions) {
    const options = normalizePickRuntimeOptions(input);
    state.pickOptions = options;
    try {
      adapters.localStorage.setJson(PICK_OPTIONS_KEY, options);
    } catch { }
    if (!options.preferScannedMetadata && Object.values(state.discoveredLoopOverrides)
      .some((loopDef) => loopDef?.strategy === 'playerPickSbc')) {
      state.discoveredLoopOverrides = Object.fromEntries(
        Object.entries(state.discoveredLoopOverrides)
          .filter(([, loopDef]) => loopDef?.strategy !== 'playerPickSbc'),
      );
      renderLoopSelect(document.querySelector('#bronze-loop-select')?.value || null);
      log('Player Pick scan: scanned metadata preference disabled; configured Pick Loops reverted to static fallback');
    }
    const storageSink = options.rollingStorageSinkMode === 'selected'
      ? `selected Set #${options.rollingStorageSinkSetId} ${options.rollingStorageSinkSetName || ''}`.trim()
      : options.rollingStorageSinkMode;
    log(`Pick/Rolling policy updated: automatic-use rating <= ${options.protectionRating}; Pick mode ${options.autoSelectBelow90 ? 'Automatic' : 'Review protected'}${options.openPicksAtEnd ? '; open Picks at end' : ''}; Provisions reserve 87-${options.rollingProvisionsMaxRating}; shortage Provisions batch ${options.rollingShortageProvisionsPackLimit}; surplus Provisions/TOTW ${options.rollingSurplusCraftingEnabled ? 'enabled' : 'off'}; Provisions shortage recovery ${options.rollingProvisionsShortageRecoveryEnabled ? 'allowed' : 'off'}; Required Special/TOTW recovery ${options.rollingRequiredSpecialRecoveryEnabled ? 'allowed' : 'off'}; Club non-TOTW specials ${options.rollingProtectAllClubNonTotwSpecials ? 'protected' : 'last-resort fallback'}; duplicate Provisions rewards ${options.rollingOpenDuplicateProvisionsRewards ? 'immediate' : 'on shortage'}; Storage pressure SBC ${storageSink}`);
    renderCurrentSelectionPolicySummary();
    return options;
  }

  function openSelectionPolicySettingsModal() {
    return showSelectionPolicySettings({
      dom: adapters.dom,
      pickOptions: getPickRuntimeOptions(),
      sbcFodderOptions: getSbcFodderRuntimeOptions(),
      storageSinkCandidates: cloneLoopDef(state.storageSinkCandidates),
      onSave: async ({ pickOptions, sbcFodderOptions }) => {
        const previous = getPickRuntimeOptions();
        saveSbcFodderOptions(sbcFodderOptions);
        const saved = savePickRuntimeOptions(pickOptions);
        const storageSinkChanged = saved.rollingStorageSinkMode !== previous.rollingStorageSinkMode
          || saved.rollingStorageSinkSetId !== previous.rollingStorageSinkSetId;
        if (storageSinkChanged) {
          log('Storage pressure SBC selection changed; refreshing the selected dynamic SBC contract');
          await scanAvailableDynamicSbcs();
        }
      },
    });
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

    const set = await findSbcSetForLoopDef(step, step.name);
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
        } else if (event === 'step-complete' && payload.stepResult?.status !== 'completed') {
          log(`${loopDef.name}: ${payload.step.name} ended with status:${payload.stepResult?.status || 'unknown'}; reason:${payload.stepResult?.reason || 'unknown'}`);
        }
      },
    });
  }

  async function runWorkflowRoutine(loopDef) {
    await waitAppReady();
    const steps = getRoutineStepLoopDefs(loopDef);
    const limitSummary = summarizeRoutineStepLimits(steps);
    log(`${loopDef.name}: running configurable workflow with ${steps.length} step(s): ${steps.map((step) => step.name).join(' -> ')}`);
    log(`${loopDef.name}: step policy: ${limitSummary.text}`);

    return runSequenceWorkflow({
      steps,
      stopPoint: () => stopPoint(),
      beforeStep: async ({ step }) => {
        if (step.dryRun) return { status: 'ready' };
        const recovery = await recoverUnassignedOverflow(step, `${loopDef.name} step preflight`);
        if (recovery.status === 'resolved') {
          log(`${loopDef.name}: ${step.name} overflow recovery completed before step`);
        }
        if (recovery.status === 'blocked') return { status: 'blocked', reason: recovery.reason };
        return { status: 'ready' };
      },
      runStep: async ({ step }) => runConfiguredLoop(step, 1),
      afterStep: async () => sleep(CFG.pauseMs),
      onEvent: async (event, payload) => {
        if (event === 'step-start') {
          log(`${loopDef.name}: step ${payload.index + 1}/${payload.total} ${payload.step.name}`);
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
    const fodderPolicy = getSbcFodderPolicy(loopDef);
    log(`${loopDef.name}: rating-constrained fodder cap applies to every card at rating <= ${fodderPolicy.ratingSbcMaxCardRating}; FSU Gold rating range is ignored while other FSU protections remain active`);
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

    const selectionPolicy = options.selectionPolicy || loopDef.ratingSbcFill?.selectionPolicy || null;
    const candidates = buildRatingSbcCandidateEntries(loopDef, model, selectionPolicy);
    log(`${loopDef.name}: rating SBC candidates ${candidates.entries.length} unique definition(s) across ${candidates.piles.join(' > ')}; scanned ${candidates.scannedItems} item(s), built in ${candidates.buildMs}ms`);
    const planningStartedAt = Date.now();
    log(`${loopDef.name}: deterministic rating recipe planning started from live rating buckets`);
    const selection = await findOptimalRatingSbcSelection(candidates.entries, model, candidates.piles, {
      ...loopDef.ratingSbcFill,
      ...(selectionPolicy ? { selectionPolicy } : {}),
    });
    const planningMs = Date.now() - planningStartedAt;
    if (!selection.ok) {
      return {
        ok: false,
        reason: `${selection.reason} (rating levels:${selection.ratingLevels || 0}, recipe attempts:${selection.recipeAttempts || 0}, planner transitions:${selection.recipeTransitions || 0}, cache:${selection.recipeCacheHit ? 'hit' : 'miss'}, ${planningMs}ms)`,
        reasonCode: selection.missing?.code || selection.details?.reasonCode || null,
        missing: selection.missing || null,
        selection,
        ratingShortage: true,
        model,
        candidates,
      };
    }

    selection.stats = selection.pileCounts;
    const range = selection.ratingRange
      ? `${selection.ratingRange.min}-${selection.ratingRange.max}`
      : 'n/a';
    log(`${loopDef.name}: deterministic rating squad ${selection.rating}/${model.targetRating}; ratings ${selection.ratings.join(', ')}; live range:${range}, levels:${selection.ratingLevels}, recipe attempts:${selection.recipeAttempts}, planner transitions:${selection.recipeTransitions}, cache:${selection.recipeCacheHit ? 'hit' : 'miss'}, planning:${planningMs}ms, total:${Date.now() - startedAt}ms`);
    if (options.dryRun) {
      logDryRunSelection(`${loopDef.name} rating SBC`, selection, {
        maxItems: 30,
        priorityPiles: candidates.piles,
      });
    } else {
      logInventorySelection(`${loopDef.name} rating SBC`, selection, { maxItems: 30 });
    }

    const prepared = await prepareInventorySelection(loopDef, selection);
    const plannedModelValidation = validateRatingSbcModelAgainstItems(model, prepared.selected || [], null, {
      exclusiveRoles: selectionPolicy?.exclusiveRoles,
      allowOtherSpecialAsOrdinary: selectionPolicy?.protectionPolicy?.allowOtherSpecialAsOrdinary === true,
    });
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
      selectionPolicy,
      model,
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
    const inspection = inspectSbcSquad(loopDef, squad, {
      expectedPlayerCount: model.requiredPlayerCount,
      selectionPolicy,
      model,
    });
    logSbcSquadInspection(loopDef, inspection);
    const savedModelValidation = validateRatingSbcModelAgainstItems(model, inspection.items, opened.challenge, {
      exclusiveRoles: selectionPolicy?.exclusiveRoles,
      allowOtherSpecialAsOrdinary: selectionPolicy?.protectionPolicy?.allowOtherSpecialAsOrdinary === true,
    });
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
    let forceRatingChallengeRefresh = false;
    let challengeSubmissions = 0;

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
      patchFsuLengthSafePlayerMetadata(`${loopDef.name} before opening SBC`);

      const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
      let opened;
      let ratingChallengeIncompleteCount = 0;
      if (shouldUseRatingSbcFill(loopDef)) {
        log(`${loopDef.name}: reading dynamic challenge requirements through the direct rating SBC path`);
        const challengeContext = await findAvailableRatingSbcChallengeContext(set, loopDef.name, {
          force: forceRatingChallengeRefresh,
        });
        forceRatingChallengeRefresh = false;
        ratingChallengeIncompleteCount = challengeContext.incompleteCount;
        const challenge = challengeContext.challenge;
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

      const activeLoopDef = shouldUseRatingSbcFill(loopDef)
        ? materializeDynamicUpgradeChallengeLoopDef(loopDef, opened.challenge)
        : loopDef;
      const eligibilityPreflight = await ensureRequiredEligibilityForFillAndVerify(activeLoopDef, opened.challenge);
      if (!eligibilityPreflight.ready) {
        return {
          status: 'unavailable',
          reason: eligibilityPreflight.reason || 'required eligibility preflight is unavailable',
        };
      }
      const expectedPlayerCount = expectedSbcPlayerCount(activeLoopDef, opened.challenge);
      const configuredFill = await fillConfiguredSbcSquad(activeLoopDef, opened, {
        dryRun: loopDef.dryRun,
        stopOnMissingSelection: true,
        skipInventoryRefresh: eligibilityPreflight.inventoryRefreshed === true,
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
        const autoFodderLimit = getAutoFodderUpgradeAttemptLimit(activeLoopDef);
        if (configuredFill.ratingShortage && autoFodderAttempts < autoFodderLimit) {
          log(`${loopDef.name}: rating shortage before automatic Rare Gold recovery: ${configuredFill.reason || 'unknown reason'}`);
          const nextAttempt = autoFodderAttempts + 1;
          const recovery = await craftAutoFodderUpgrade(activeLoopDef, nextAttempt, autoFodderLimit);
          if (recovery.ok) {
            autoFodderAttempts = nextAttempt;
            log(`${loopDef.name}: ${getAutoFodderUpgradeDef(activeLoopDef).name} opened successfully; retrying optimized rating fill`);
            return { status: 'retry', reason: 'automatic fodder recovery succeeded' };
          }
          log(`${loopDef.name}: automatic Rare Gold recovery stopped: ${recovery.reason || 'unknown reason'}`);
        } else {
          log(`${loopDef.name}: stopping because ${configuredFill.reason || 'configured SBC fill failed'}`);
        }
        return { status: 'blocked', reason: configuredFill.reason || 'configured SBC fill failed' };
      }
      let fillResult = configuredFill.fillResult;
      let inspection = configuredFill.inspection;
      let squad = fillResult.squad || ctrl()?._squad || opened.challenge?.squad;

      const ratingSbcFill = shouldUseRatingSbcFill(activeLoopDef);
      const totwInjection = ratingSbcFill
        ? { fillResult, inspection, planned: false, injected: false }
        : await injectRequiredTotwIfNeeded(activeLoopDef, opened, fillResult, inspection);
      fillResult = totwInjection.fillResult;
      inspection = totwInjection.inspection;
      squad = fillResult.squad || squad;

      const protectedRepair = !ratingSbcFill && (!activeLoopDef.dryRun || !totwInjection.planned)
        ? await repairProtectedSquadItemsIfNeeded(activeLoopDef, opened, fillResult, inspection)
        : { fillResult, inspection, planned: false, repaired: false };
      fillResult = protectedRepair.fillResult;
      inspection = protectedRepair.inspection;
      squad = fillResult.squad || squad;

      const submitReadyRepair = !ratingSbcFill && (!activeLoopDef.dryRun || (!totwInjection.planned && !protectedRepair.planned))
        ? await repairSubmitReadinessIfNeeded(activeLoopDef, opened, fillResult, inspection)
        : { fillResult, inspection, planned: false, repaired: false };
      fillResult = submitReadyRepair.fillResult;
      inspection = submitReadyRepair.inspection;
      squad = fillResult.squad || squad;

      if (loopDef.dryRun) {
        const injectableIssues = getDryRunInjectableIssues(activeLoopDef, inspection);
        if (totwInjection.planned && !injectableIssues.blocked.length && !injectableIssues.missingRequirements.length) {
          log(`${loopDef.name}: dry-run squad needs required ${requiredSpecialLabel(activeLoopDef)} repair; live run would save the repair plan and re-check before submit`);
        } else if (protectedRepair.planned && !injectableIssues.blocked.length && !injectableIssues.missingRequirements.length) {
          log(`${loopDef.name}: dry-run squad needs protected item repair; live run would save the repair plan and re-check before submit`);
        } else if (submitReadyRepair.planned && !injectableIssues.blocked.length && !injectableIssues.missingRequirements.length) {
          log(`${loopDef.name}: dry-run squad may need submit-ready rating repair; live run would save the repair plan and re-check before submit`);
        } else if (inspection.blocked.length || inspection.missingRequirements?.length) {
          log(`${loopDef.name}: dry-run blocked by protected or missing squad requirement(s); live run would stop before submit`);
          logManualSbcFixHints(activeLoopDef, inspection);
        } else if (!fillResult.submitReady) {
          log(`${loopDef.name}: dry-run squad passed protection, but submit is not ready; live run would stop before submit`);
        } else {
          log(`${loopDef.name}: dry-run squad passed protection; live run would submit once`);
        }
        log(`${loopDef.name}: dry run stops before SBC submit`);
        return { status: 'planned', reason: 'dry-run protection inspection complete', details: { dryRun: true } };
      }

      const autoFodderLimit = getAutoFodderUpgradeAttemptLimit(activeLoopDef);
      if (
        !fillResult.submitReady &&
        !inspection.blocked.length &&
        !inspection.missingRequirements?.length &&
        autoFodderAttempts < autoFodderLimit
      ) {
        log(`${loopDef.name}: submit not ready before automatic Rare Gold recovery (${inspection.items?.length || fillResult.filled || 0} filled)`);
        const nextAttempt = autoFodderAttempts + 1;
        const recovery = await craftAutoFodderUpgrade(activeLoopDef, nextAttempt, autoFodderLimit);
        if (recovery.ok) {
          autoFodderAttempts = nextAttempt;
          log(`${loopDef.name}: ${getAutoFodderUpgradeDef(activeLoopDef).name} opened successfully; retrying the same Upgrade completion with refreshed inventory`);
          return { status: 'retry', reason: 'automatic submit-ready recovery succeeded' };
        }
        log(`${loopDef.name}: automatic Rare Gold recovery stopped: ${recovery.reason || 'unknown reason'}`);
        return { status: 'blocked', reason: recovery.reason || 'automatic Rare Gold recovery stopped' };
      } else if (
        !fillResult.submitReady &&
        !inspection.blocked.length &&
        !inspection.missingRequirements?.length &&
        autoFodderLimit > 0 &&
        autoFodderAttempts >= autoFodderLimit
      ) {
        log(`${loopDef.name}: automatic Rare Gold recovery reached its ${autoFodderLimit} attempt limit for this completion`);
        return { status: 'blocked', reason: 'automatic Rare Gold recovery attempt limit reached' };
      }

      if (!fillResult.submitReady) fail(`${loopDef.name}: submit is not ready after protection inspection`);
      let ratingSubmission = null;
      const submitAttempt = await submitSbcAttempt({
        label: loopDef.name,
        dryRun: loopDef.dryRun === true,
        challengeProvider: async () => opened,
        squadProvider: createExistingSquadProvider({
          getPlayers: async () => inspection.items,
          itemRef: liveItemRef,
          source: ratingSbcFill ? 'rating-squad' : 'filled-squad',
        }),
        prepareRuntimeAccess: prepareFsuRuntimeAccess,
        saveSquad: async ({ challenge, players, runtimeAccess }) => {
          if (ratingSbcFill || !runtimeAccess?.refreshedClubPlayers) return;
          log(`${loopDef.name}: applying freshly validated Club entities before submit`);
          await saveChallengeSquad(challenge, players, `${loopDef.name} provisional Club refresh`);
        },
        preSaveValidators: [() => {
          assertSbcSquadSafe(activeLoopDef, inspection);
          if (shouldUseRatingSbcFill(activeLoopDef)) {
            const finalModelValidation = validateRatingSbcModelAgainstItems(configuredFill.model, inspection.items, opened.challenge);
            logRatingSbcValidation(activeLoopDef, 'final rating squad', finalModelValidation, configuredFill.model);
            if (!finalModelValidation.ok) {
              fail(`${loopDef.name}: final rating squad failed dynamic requirement validation: ${finalModelValidation.errors.join(', ')}`);
            }
          }
          return true;
        }],
        isSubmitReady: async () => fillResult.submitReady === true,
        submitTransport: async (context) => {
          if (ratingSbcFill) {
            ratingSubmission = await submitRatingSbcInBackground(context.set, context.challenge, loopDef.name, {
              players: context.players || inspection.items || [],
              allowKnownRewardFallback: Number(activeLoopDef.dynamicChallengeCount || 1) <= 1,
            });
            return { submitted: true, rewardPackId: ratingSubmission.rewardPackId };
          }
          return { submitted: true, rewardPackId: await submitSbcAndGetAwardPackId(context.set) };
        },
        runCommittedSubmit: runCommittedSbcSubmit,
        afterSubmit: async ({ players, savedPlayers, squadPlan }) => finalizeSubmittedInventorySelection(
          squadPlan?.selection || configuredFill.selection,
          loopDef.name,
          savedPlayers?.length ? savedPlayers : players,
        ),
      });
      if (!submitAttempt.submitted) {
        fail(`${loopDef.name}: submit transaction blocked: ${submitAttempt.reason || submitAttempt.status}`);
      }
      challengeSubmissions++;
      const rewardPackId = submitAttempt.rewardPackId;
      const dynamicChallengeCount = Math.max(1, Number(activeLoopDef.dynamicChallengeCount || 1) || 1);
      if (ratingSbcFill && dynamicChallengeCount > 1 && !ratingSubmission?.rewardObserved) {
        autoFodderAttempts = 0;
        forceRatingChallengeRefresh = true;
        if (ratingChallengeIncompleteCount <= 1) {
          log(`${loopDef.name}: final Challenge #${opened.challenge?.id || '?'} submitted, but the Set reward was not observed after bounded refresh; stopping before a new round`);
          return {
            status: 'blocked',
            reason: 'final multi-Challenge Upgrade reward was not observed',
            details: { challengeSubmissions, lastChallengeId: opened.challenge?.id || null },
          };
        }
        log(`${loopDef.name}: intermediate Challenge #${opened.challenge?.id || '?'} submitted (${ratingChallengeIncompleteCount - 1} Challenge(s) remain in this round); reward handling deferred`);
        await sleep(CFG.pauseMs);
        return {
          status: 'progressed',
          details: { challengeSubmissions, lastChallengeId: opened.challenge?.id || null },
        };
      }
      let stopAfterRewardFailure = false;
      let rewardPacksOpened = 0;
      let rewardPacksPending = 0;
      if (activeLoopDef.openRewardPacks) {
        const openedReward = await openRewardPackAndCleanup(activeLoopDef, rewardPackId, 'reward pack', {
          assumeTotwReward: activeLoopDef.assumeTotwRewardPack === true,
          fallbackPackMatcher: activeLoopDef.assumeTotwRewardPack === true ? isLikelyTotwRewardPack : null,
          openAttempts: activeLoopDef.assumeTotwRewardPack === true ? 3 : 1,
        });
        if (openedReward) rewardPacksOpened++;
        else {
          rewardPacksPending++;
          if (activeLoopDef.forceOpenRewardPacks === true) {
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
        details: {
          lastRewardPackId: rewardPackId || null,
          completedBefore: workflowResult.completions,
          challengeSubmissions,
        },
      };
      },
    });

    log(`${loopDef.name}: completed ${result.completions} round(s) with ${challengeSubmissions} Challenge submission(s) in this run`);
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
    return findSourcePackInCache({
      sourcePackRef: source?.sourcePackRef,
      sourcePackIds: source?.packIds || [],
      sourcePackNames: source?.packNames || [],
    });
  }

  function shortageSourceLabel(source) {
    return source?.requirement?.tier || source?.requirement?.rarity || 'material';
  }

  function countShortageSourcePacks(source) {
    const identity = resolvedSourcePackIdentity({
      sourcePackRef: source?.sourcePackRef,
      sourcePackIds: source?.packIds || [],
      sourcePackNames: source?.packNames || [],
    });
    const ids = new Set(identity.packIds.map(packIdKey).filter(Boolean));
    return getAvailableRepositoryMyPacks().filter((pack) =>
      (ids.size && ids.has(packIdKey(pack))) ||
      (identity.packNames.length && matchesAny(packName(pack), identity.packNames))
    ).length;
  }

  function createMaterializeAndResolvePolicy(label, cleanupReason, cleanupOptions = {}) {
    return createOpenedItemPolicy(async (openedItems, context = {}) => {
      const { directDuplicateFallback = false, ...unassignedCleanupOptions } = cleanupOptions;
      const settlement = await settleOpenedItems({
        attempts: 3,
        materialize: async () => {
          const materialized = await materializeOpenedPlayerRewards(openedItems, label, {
            routingBaseline: context.routingBaseline || null,
          });
          await sleep(CFG.pauseMs);
          return materialized;
        },
        cleanup: async ({ attempt }) => resolveRuntimeUnassigned(
          attempt === 1 ? cleanupReason : `${cleanupReason} delayed response retry ${attempt}/3`,
          {
            ...unassignedCleanupOptions,
            beforeSnapshot: () => restoreOpenedUnassignedDuplicateMetadata(openedItems, label, {
              routingBaseline: context.routingBaseline || null,
            }),
          },
        ),
        confirmRouting: async () => confirmOpenedItemRouting(openedItems, label, {
          routingBaseline: context.routingBaseline || null,
        }),
        onRetry: async ({ attempt, routing, materialized }) => {
          log(`${label}: ${routing.pendingItems.length} opened item(s) appeared after initial cleanup; retrying Unassigned settlement ${attempt + 1}/3`);
          await sleep(CFG.pauseMs);
          await materializeOpenedDuplicatesFresh(
            materialized?.deferredDuplicates || [],
            `${label} delayed materialization retry ${attempt + 1}/3`,
            { routingBaseline: context.routingBaseline || null },
          );
        },
      });
      const fallback = settlement.status === 'pending' && directDuplicateFallback
        ? await tryDirectlySettleUnmaterializedOpenedDuplicates({
            openedItems,
            materialized: settlement.materialized,
            routing: settlement.routing,
            label,
            routingBaseline: context.routingBaseline || null,
          })
        : null;
      const finalSettlement = fallback ? { ...settlement, ...fallback } : settlement;
      const cleanup = finalSettlement.cleanup || {};
      const routing = finalSettlement.routing || { reservedItems: [], routedItems: [], pendingItems: openedItems };
      return {
        ...routing,
        details: {
          cleanupStatus: finalSettlement.status === 'pending' ? 'preserved' : cleanup.status,
          cleanupReason: finalSettlement.reason || cleanup.reason || null,
          settlementAttempts: finalSettlement.attempts,
          blockedDestination: cleanup.plan?.blocked?.destination || null,
          blockedFree: cleanup.plan?.blocked?.free ?? null,
          blockedRequired: cleanup.plan?.blocked?.required ?? null,
          resolvedAliasCount: routing.aliasRoutes?.length || 0,
          directDuplicateFallback: fallback?.status || null,
        },
      };
    });
  }

  function createReserveMatchingDuplicatePackPolicy(loopDef, source) {
    return createOpenedItemPolicy(async (openedItems) => {
      const fodderPolicy = getSbcFodderPolicy(loopDef);
      const requirement = {
        ...(source?.requirement || {}),
        sbcFodderPolicy: fodderPolicy,
        ...(fodderPolicy.mode === 'low-gold' ? { lowRatedGoldMaxRating: fodderPolicy.lowRatedGoldMaxRating } : {}),
      };
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
    let challengeInvalidated = false;

    while (openedCount < maxOpens && getShortageForSource(loopDef, source, primaryPiles) > 0) {
      stopPoint();
      const shortage = getShortageForSource(loopDef, source, primaryPiles);
      const pack = await findSourcePack({
        name: `${loopDef.name} ${label} shortage`,
        sourcePackRef: source?.sourcePackRef,
        sourcePackIds: source?.packIds || [],
        sourcePackNames: source?.packNames || [],
      }, {
        label: `${loopDef.name}: ${label} shortage source pack lookup`,
        onStoreOpened: () => {
          challengeInvalidated = true;
        },
      });
      if (!pack) {
        log(`${loopDef.name}: missing ${shortage} ${label} player(s); no matching source pack available, skipping`);
        break;
      }
      const availableCount = countShortageSourcePacks(source);

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

    return { openedCount, preserveUnassigned, challengeInvalidated };
  }

  async function runSupplyAndCraftLoop(loopDef, workflowOptions = {}) {
    await waitAppReady();
    const dryRun = loopDef.dryRun === true;
    const inventoryOnly = loopDef.inventoryOnly === true;
    const shortagePacks = inventoryOnly
      ? []
      : loopDef.shortagePacks?.length
        ? loopDef.shortagePacks
      : loopDef.strategy === 'commonGoldToRareUpgrade'
        ? [{
            requirement: { ...(loopDef.requirements?.[0] || {}) },
            sourcePackRef: loopDef.sourcePackRef,
            packIds: loopDef.sourcePackIds || [],
            packNames: loopDef.sourcePackNames || [],
            maxOpensPerAttempt: 1,
            repeatUntilSatisfied: true,
            maxRuns: 100,
            routingPolicy: 'reserveMatchingDuplicates',
          }]
        : [];
    if (inventoryOnly) {
      log(`${loopDef.name}: inventory-only mode; supply packs and reward packs will remain unopened`);
    }
    const primaryPiles = inventoryOnly
      ? (loopDef.primaryPiles || loopDef.priorityPiles || ['unassigned', 'storage', 'transfer', 'club'])
      : shortagePacks.length
        ? (loopDef.primaryPiles || ['unassigned', 'storage', 'transfer'])
        : (loopDef.priorityPiles || ['storage', 'transfer', 'club']);
    const fallbackPiles = loopDef.clubFallbackPiles || loopDef.priorityPiles || primaryPiles;
    const reservePrimaryUnassigned = primaryPiles.includes('unassigned')
      ? (item) => isDuplicateForLoopRequirements(item, loopDef)
      : null;

    const result = await runSupplyAndCraftWorkflow({
      maxCompletions: Number(loopDef.maxCompletions || 7),
      stopPoint: () => stopPoint(),
      beforeIteration: async () => {
        if (dryRun) return { preserveSupply: false };
        if (loopDef.preSelectionCleanup === false) return { preserveSupply: false };
        if (!shortagePacks.length && !reservePrimaryUnassigned) {
          await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`);
          return { preserveSupply: false };
        }
        const cleanup = await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`, {
          blockedPolicy: 'preserve',
          reserveItem: reservePrimaryUnassigned,
        });
        const preserveSupply = cleanup.status === 'preserved';
        if (preserveSupply) {
          const overflow = getUnassignedStorageOverflow();
          log(`${loopDef.name}: keeping ${overflow.count} unassigned duplicate(s) for the current SBC; SBC storage has ${overflow.space} slot(s), so no further shortage pack will be opened`);
        }
        return { preserveSupply };
      },
      challengeProvider: async ({ refresh }) => {
        const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
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
          if (!supplied.openedCount) {
            return {
              status: 'unavailable',
              reason: 'matching source pack unavailable',
              challengeInvalidated: supplied.challengeInvalidated,
            };
          }
          return {
            status: 'provided',
            openedCount: supplied.openedCount,
            preserveSupply: supplied.preserveUnassigned,
            challengeInvalidated: supplied.challengeInvalidated,
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
        if (workflowOptions.skipFinalUnassignedCleanup === true) return;
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
          else {
            const requirements = (loopDef.requirements || []).map(describeRequirement).join(' + ') || 'unspecified';
            log(`${loopDef.name}: ${label} selected ${selection.selected.length} player(s) (${formatSelectionStats(selection.stats)}); requirements:${requirements}`);
            if (
              selection.selected.length
              && (loopDef.dynamicSbcFamily === 'daily-rare-gold-upgrade'
                || loopDef.activityBinding?.family === 'daily-rare-gold-upgrade')
            ) {
              const entries = selection.entries || selection.selected.map((item) => ({ item, pileName: 'unknown' }));
              entries.forEach((entry, index) => log(`${loopDef.name}: ${label} pick ${formatDryRunItem(entry, index)}`));
            }
          }
        } else if (event === 'supply-skipped') {
          log(`${loopDef.name}: unassigned duplicates are reserved for this SBC; skipping additional shortage packs`);
        } else if (event === 'selection-insufficient') {
          const missing = payload.selection?.missing || {};
          log(`${loopDef.name}: missing ${missing.count || '?'} ${missing.tier || 'any'} ${missing.rarity || ''} player(s); stopping before submit`);
          logSelectionDiagnostics(loopDef.name, payload.selection, fallbackPiles);
        } else if (event === 'challenge-unavailable') {
          const suffix = payload.afterSupply
            ? ' after source pack handling'
            : payload.afterNavigation
              ? ' after restoring the SBC from Store Packs'
              : '';
          log(`${loopDef.name}: no available SBC challenge remains${suffix}`);
        }
      },
    });

    if (dryRun) {
      log(`${loopDef.name}: dry-run result ${result.status}; planned completions:${result.completions}`);
      log(`${loopDef.name}: dry run stops before cleanup, opening packs, squad save, or SBC submit`);
    } else if (result.status === 'completed') {
      log(`${loopDef.name}: submitted ${result.completions} SBC(s) in this run`);
    } else {
      log(`${loopDef.name}: ended after ${result.completions} SBC(s); status:${result.status}; reason:${result.reason || 'unknown'}`);
    }
    return result;
  }

  async function openMatchingRewardPacksUntilEmpty(loopDef, reason = 'deferred reward pack') {
    const maxOpens = Math.max(1, Math.min(500, Number(loopDef.maxDeferredRewardPackOpens || 200) || 200));
    let opened = 0;
    let failures = 0;
    while (opened < maxOpens && failures < 3) {
      await stopPoint();
      await refreshStorePacks().catch(() => null);
      const pack = findRewardPackInCache(loopDef, null);
      if (!pack) break;
      log(`${loopDef.name}: opening deferred reward pack ${opened + 1}: ${packName(pack)} (#${pack.id})`);
      const ok = await openRewardPackAndCleanup(loopDef, pack.id, reason, {
        openAttempts: 2,
        findAttempts: 3,
        findDelayMs: 900,
      });
      if (!ok) {
        failures += 1;
        markStalePack(pack, { gone: true });
        log(`${loopDef.name}: deferred reward pack open failed (${failures}/3); skipping #${pack.id}`);
        continue;
      }
      opened += 1;
      failures = 0;
      await sleep(CFG.pauseMs);
    }
    log(`${loopDef.name}: opened ${opened} deferred reward pack(s)${opened >= maxOpens ? ' (hit safety cap)' : ''}`);
    return opened;
  }

  async function runInventoryExhaustionLoop(loopDef) {
    await waitAppReady();
    const openAtEnd = loopDef.openRewardPacksAtEnd === true;
    const shouldOpenAtEnd = openAtEnd && loopDef.openRewardPacks === true;
    if (openAtEnd) {
      log(`${loopDef.name}: reward packs deferred until stages finish${shouldOpenAtEnd ? '' : ' (end open disabled by options)'}`);
    }
    log(`${loopDef.name}: exhausting stages in order: ${loopDef.stages.map((stage) => stage.name).join(' -> ')}`);
    const result = await runInventoryExhaustionWorkflow({
      stages: loopDef.stages,
      stopPoint: () => stopPoint(),
      runStage: async ({ stage }) => {
        // Stage can force mid-run opens (bronze/silver packs feed later stages).
        // Parent openRewardPacksAtEnd only suppresses opens for stages that did not opt in.
        const stageOpensRewards = stage.forceOpenRewardPacks === true
          || stage.openRewardPacks === true
          || (!openAtEnd && loopDef.openRewardPacks === true);
        const stageDef = {
          ...cloneLoopDef(stage),
          strategy: 'supplyAndCraft',
          dryRun: loopDef.dryRun === true,
          openRewardPacks: stageOpensRewards,
          forceOpenRewardPacks: stage.forceOpenRewardPacks === true,
          // Keep deferred end-open names on the parent loop only.
          rewardPackNames: stage.rewardPackNames?.length ? [...stage.rewardPackNames] : undefined,
          rewardPackIds: stage.rewardPackIds?.length ? [...stage.rewardPackIds] : undefined,
          disabledPiles: loopDef.disabledPiles?.length ? [...loopDef.disabledPiles] : undefined,
          preSelectionCleanup: false,
        };
        inheritSbcFodderPolicy(stageDef, loopDef);
        applyDisabledPiles(stageDef);
        return runSupplyAndCraftLoop(stageDef, { skipFinalUnassignedCleanup: true });
      },
      onEvent: async (event, payload) => {
        if (event === 'stage-start') {
          log(`${loopDef.name}: stage ${payload.index + 1}/${payload.total} ${payload.stage.name}`);
        } else if (event === 'stage-complete') {
          const stageResult = payload.stageResult;
          if (stageResult.status === 'insufficient') {
            log(`${loopDef.name}: ${payload.stage.name} exhausted; fewer than one complete safe squad remains`);
          } else if (stageResult.status === 'unavailable') {
            log(`${loopDef.name}: ${payload.stage.name} unavailable; continuing to the next stage`);
          } else {
            log(`${loopDef.name}: ${payload.stage.name} finished with ${stageResult.completions || 0} submission(s), status ${stageResult.status}`);
          }
        }
      },
      finalize: async (workflowResult) => {
        if (loopDef.dryRun === true || !shouldOpenAtEnd) return;
        if (Number(workflowResult?.totalCompletions || 0) < 1 && !findRewardPackInCache(loopDef, null)) {
          log(`${loopDef.name}: no deferred reward packs to open`);
          return;
        }
        log(`${loopDef.name}: stages complete; opening deferred reward packs`);
        const opened = await openMatchingRewardPacksUntilEmpty(loopDef, 'deferred stage reward pack');
        workflowResult.deferredRewardPacksOpened = opened;
        await resolveRuntimeUnassigned(`${loopDef.name} post-deferred-reward cleanup`, { loopDef });
      },
    });
    log(`${loopDef.name}: submitted ${result.totalCompletions} SBC(s) across ${result.completedStages.length} stage(s)${
      Number(result.deferredRewardPacksOpened || 0) ? `; opened ${result.deferredRewardPacksOpened} deferred reward pack(s)` : ''
    }`);
    return result;
  }

  function isRareGoldPlayer(item, options = {}) {
    const fodderPolicy = options.sbcFodderPolicy || getSbcFodderRuntimeOptions();
    const lowRatedGoldMaxRating = Number(options.lowRatedGoldMaxRating || fodderPolicy.lowRatedGoldMaxRating || 82);
    const spec = {
      tier: 'gold',
      rarity: 'rare',
      playerOnly: true,
      allowSpecial: false,
      sbcFodderPolicy: fodderPolicy,
      lowRatedGoldMaxRating,
    };
    return isSbcUsablePlayer(item, spec, null) &&
      itemMatchesSpec(item, spec);
  }

  function isRareGoldDuplicate(item, options = {}) {
    return isDuplicate(item) && isRareGoldPlayer(item, options);
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

  async function prepareFsuRuntimeAccess(context) {
    const adapter = fsuAdapter();
    return prepareFsuProvisionalClubAccess({
      readiness: adapter.readiness(),
      label: context.label,
      players: context.players,
      itemRefs: context?.squadPlan?.itemRefs || [],
      snapshotItem: adapters.inventory().snapshotItem,
      validateClubPlayers: (refs, options) => adapter.validateClubPlayers(refs, options),
      log,
    });
  }

  async function submitInventorySbcAttempt(loopDef, selection, options = {}) {
    let openedContext = null;
    const label = options.label || loopDef.name;
    const result = await submitSbcAttempt({
      label,
      dryRun: options.dryRun === true || loopDef.dryRun === true,
      challengeProvider: async () => {
        if (options.opened) {
          openedContext = options.opened;
          return options.opened;
        }
        const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
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
      prepareRuntimeAccess: prepareFsuRuntimeAccess,
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
      submitReadyAttempts: 3,
      onSubmitNotReady: async ({ attempt, maxAttempts }) => {
        log(`${label}: submit button not ready after saved squad; waiting before recheck (${attempt}/${maxAttempts})`);
        await waitLoadingEnd(250, attempt === 1 ? 6000 : 12000).catch(() => null);
        await sleep(Math.min(1500, Math.max(500, Number(CFG.pauseMs) || 800)));
      },
      submitTransport: async ({ set }) => ({
        submitted: true,
        rewardPackId: await submitSbcAndGetAwardPackId(set),
      }),
      runCommittedSubmit: runCommittedSbcSubmit,
      onResult: options.onResult,
      onResultError: options.onResultError,
      afterSubmit: async ({ result: submissionResult, players, savedPlayers, squadPlan }) => {
        await finalizeSubmittedInventorySelection(
          squadPlan?.selection || selection,
          label,
          savedPlayers?.length ? savedPlayers : players,
        );
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
    let basePickDef = null;
    if (pickLoopId) {
      basePickDef = findLoopDefById(pickLoopId);
      if (!basePickDef || basePickDef.strategy !== 'playerPickSbc') {
        fail(`${loopDef.name}: pre-craft Player Pick loop not found or invalid: ${pickLoopId}`);
      }
    } else if (loopDef.preCraftPlayerPick) {
      const resolved = resolvePlayerPickLoopReference(loopDef.preCraftPlayerPick, getLoopDefs());
      if (resolved.status === 'ambiguous') {
        fail(`${loopDef.name}: pre-craft Player Pick identity is ambiguous: ${resolved.matches.map((loop) => loop.id).join(', ')}`);
      }
      basePickDef = resolved.loop;
    } else if (loopDef.preCraftPlayerPickSelector) {
      const resolved = resolvePlayerPickLoopSelector(loopDef.preCraftPlayerPickSelector, getLoopDefs());
      if (resolved.status === 'ambiguous') {
        fail(`${loopDef.name}: pre-craft Player Pick selector is ambiguous: ${resolved.matches.map((loop) => loop.id).join(', ')}`);
      }
      basePickDef = resolved.loop;
    }
    if (!basePickDef) return null;
    const pickDef = cloneLoopDef(basePickDef);
    if (loopDef.disabledPiles?.length && !pickDef.disabledPiles?.length) {
      pickDef.disabledPiles = [...loopDef.disabledPiles];
    }
    applyDisabledPiles(pickDef);
    applyPickRuntimeOptions(pickDef, loopDef.runtimePickOptions || getPickRuntimeOptions());
    inheritSbcFodderPolicy(pickDef, loopDef);
    pickDef.maxCompletions = 1;
    return pickDef;
  }

  function getProvisionCraftingUpgrades(loopDef) {
    const configured = Array.isArray(loopDef.craftingUpgrades) && loopDef.craftingUpgrades.length
      ? loopDef.craftingUpgrades
      : [loopDef.commonUpgrade, loopDef.rareUpgrade].filter(isPlainObject);
    return configured.map((upgradeDef) => inheritSbcFodderPolicy({
      ...upgradeDef,
      openRewardPacks: loopDef.openRewardPacks === true || upgradeDef.openRewardPacks === true,
    }, loopDef));
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
      const responseDuplicates = materializeOpenedResponsePlayerDuplicates(
        openedItems,
        `${loopDef.name} provision response classification`,
      ).duplicates;
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
        loopDef,
        blockedPolicy: 'preserve',
        enableRecovery: false,
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
      const responseDuplicates = materializeOpenedResponsePlayerDuplicates(
        openedItems,
        `${loopDef.name} rare pack response classification`,
      ).duplicates;
      const duplicateIds = new Set(responseDuplicates.map((item) => Number(item?.id || 0)).filter(Boolean));
      const classified = classifyOpenedUpgradeDuplicates(openedItems, {
        isDuplicate: (item) => duplicateIds.has(Number(item?.id || 0)),
        isEligibleDuplicate: (item) => isRareGoldPlayer(item, { sbcFodderPolicy: getSbcFodderPolicy(loopDef) }),
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

        const set = await findSbcSetForLoopDef(upgradeDef, upgradeDef.name || label);
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
        const repositorySignals = getUnassignedItems().filter(activeDuplicatePredicate);
        const signalById = new Map([...repositorySignals, ...transientSignals]
          .map((signal) => [Number(signal?.id || signal?.ref?.id || 0), signal])
          .filter(([id]) => id));
        const transientSignalRefs = transientSignals.map((signal) => signal.ref || signal);
        const signalRefs = [...signalById.values()].map((signal) => signal.ref || signal);
        const selectionOptions = {
          transientUnassignedSignals: transientSignals,
          preferredSignalRefs: signalRefs,
        };
        const duplicateOnlySelection = fallbackPiles.includes('unassigned')
          ? selectInventoryPlayers(challengeDef, ['unassigned'], selectionOptions)
          : { ok: false };
        const piles = duplicateOnlySelection.ok ? ['unassigned'] : fallbackPiles;
        const selection = selectInventoryPlayers(challengeDef, piles, selectionOptions);
        log(`${loopDef.name}: ${label} selected ${selection.selected.length}/${countNeeded} (${formatSelectionStats(selection.stats)})`);

        const selectedSignalCount = (selection.entries || [])
          .filter((entry) => entry.pileName === 'unassigned' && entry.signal).length;
        if (signalById.size) {
          log(`${loopDef.name}: ${label} duplicate signal sources response:${transientSignals.length}, repository:${repositorySignals.length}, unique:${signalById.size}, selected:${selectedSignalCount}`);
        }
        const signalCoverage = evaluateUnassignedSignalCoverage(selection, signalById.size, countNeeded);
        const expectedSelectedSignalCount = signalCoverage.expectedCount;
        const missedTransientSignal = !selectionConsumesAllSignalRefs(selection, transientSignalRefs);
        if (selectedSignalCount < expectedSelectedSignalCount || missedTransientSignal) {
          logDuplicateSignalDiagnostics(
            `${loopDef.name} ${label}`,
            [...signalById.values()],
            selectionRequirements(challengeDef, piles)[0] || {},
            selection,
          );
        }

        if (options.requireFullSignalCoverage === true && selection.ok && !signalCoverage.sufficient) {
          return {
            status: 'blocked',
            reason: `${label} found ${signalRefs.length} matching Unassigned duplicate signal(s), but the selected squad would consume only ${selectedSignalCount}/${expectedSelectedSignalCount}; refusing a fallback that skips Unassigned cards`,
          };
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

        return {
          status: 'ready',
          challengeDef,
          selection,
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

        const submitted = await submitInventorySelection(plan.challengeDef, plan.selection);
        if (!submitted) {
          if (plan.transientSignalCount) {
            fail(`${loopDef.name}: ${label} did not submit; preserving ${plan.transientSignalCount} just-opened duplicate(s) and stopping`);
          }
          return { status: 'done', reason: 'SBC was not submitted' };
        }
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
    let preCraftPickRecapPublished = false;
    const preCraftPickDef = getProvisionPreCraftPickDef(loopDef);
    const recordPreCraftPick = (entry) => {
      preCraftPickResults.push(entry);
      if (state.loopRecapSession) state.loopRecapSession.dedicatedRecap = true;
    };
    const publishPreCraftPickRecap = async (result) => {
      if (preCraftPickRecapPublished || !hasPlayerPickRecapCards(preCraftPickResults)) return;
      preCraftPickRecapPublished = true;
      state.lastPickRecap = {
        name: preCraftPickDef?.name || 'Provision pre-craft Player Pick',
        pickResults: preCraftPickResults,
        status: result.status,
        reason: result.reason,
        completedAt: Date.now(),
      };
      state.lastRecapType = 'pick';
      updateRecapButton();
      if (preCraftPickDef) await showPickRecapModal(preCraftPickDef, preCraftPickResults, result);
    };
    const effectiveMaterialStages = [
      preCraftPickDef
        ? `${preCraftPickDef.name} [common material]`
        : (loopDef.preCraftPlayerPick || loopDef.preCraftPlayerPickSelector ? 'dynamic pre-craft Player Pick [unavailable]' : null),
      ...craftingUpgrades.map((upgradeDef) => {
        const materialTypes = [...new Set(
          getChallengeMaterialDefs(upgradeDef)
            .flatMap((challengeDef) => challengeDef.requirements || [])
            .map((requirement) => requirement.rarity || requirement.tier)
            .filter(Boolean),
        )];
        const materialType = materialTypes.length
          ? `${materialTypes.join('/')} material`
          : 'configured material';
        return `${upgradeDef.name} [${materialType}; ${(upgradeDef.sbcNames || []).join(' | ')}]`;
      }),
    ].filter(Boolean);
    log(`${loopDef.name}: effective material routing: ${effectiveMaterialStages.join(' -> ') || 'none'}`);
    const runProvisionMaterialStages = async (phase, context = {}) => {
      const handling = phase === 'resume' ? context.provisionHandling || {} : context;
      if (dryRun) {
        if (loopDef.preCraftPlayerPickLoopId || loopDef.preCraftPlayerPick || loopDef.preCraftPlayerPickSelector) {
          const pickDef = getProvisionPreCraftPickDef(loopDef);
          if (pickDef) {
            log(`${loopDef.name}: dry-run ${phase} checks ${pickDef.name} before the Common Gold Premium stage when an unassigned duplicate matches`);
          } else {
            log(`${loopDef.name}: configured dynamic pre-craft Player Pick is not available in the current scan; live run would skip it and continue Common/Rare Gold recycling stages`);
          }
        }
      } else {
        await runProvisionPreCraftPlayerPick(loopDef, handling, {
          onPickConfirmed: recordPreCraftPick,
        });
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
            { maxCompletions: 1, requireFullSignalCoverage: true },
          );
          completions[`stage-${index}`] = 0;
        } else {
          const stageResult = await runReservedDuplicateCraftingStage(
            loopDef,
            upgradeDef,
            (item) => isDuplicateForLoopRequirements(item, upgradeDef),
            label,
            { requireFullSignalCoverage: true },
          );
          completions[`stage-${index}`] = stageResult.completions;
          if (stageResult.status === 'blocked' || stageResult.status === 'planned') {
            return {
              status: stageResult.status,
              completions,
              reason: stageResult.reason || `${label} ${stageResult.status}`,
            };
          }
        }
      }
      return { status: 'completed', completions };
    };
    let result;
    try {
      result = await runPackAndCraftWorkflow({
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
          const stageResult = await runProvisionMaterialStages('pre-open');
          if (stageResult.status === 'blocked' || stageResult.status === 'planned') return stageResult;
          if (!dryRun) {
            await resolveRuntimeUnassigned(`${loopDef.name} round ${current.packsOpened + 1} pre-open cleanup`, {
              loopDef,
              blockedPolicy: 'preserve',
              enableRecovery: false,
              reserveItem: isReservedDuplicate,
            });
          }
          return { status: 'ready' };
        },
        findPack: async () => findSourcePack(loopDef, { openStoreFallback: !dryRun }),
        openPack: async ({ result: current, pack }) => {
          log(`${loopDef.name}: ${dryRun ? 'dry-run would open' : `round ${current.packsOpened + 1}/${rounds} opening`} ${packName(pack)} (#${pack.id})`);
          if (dryRun) return { status: 'planned', reason: `would open ${packName(pack)}` };
          const receipt = await openPack(pack, `${loopDef.name} round ${current.packsOpened + 1}`, {
            allowGone: true,
            retryCodes: ['471', '500'],
            resolveRetryPack: () => findSourcePack(loopDef),
            preOpenUnassignedOptions: {
              loopDef,
              blockedPolicy: 'preserve',
              enableRecovery: false,
              reserveItem: isReservedDuplicate,
            },
            openedItemPolicy: createProvisionPackPolicy(loopDef),
          });
          return receipt || { status: 'stale', reason: 'source pack stale or unavailable' };
        },
        runStages: async ({ phase, context }) => {
          return runProvisionMaterialStages(phase, context);
        },
        afterStages: async ({ phase, result: current }) => {
          if (dryRun) return;
          await resolveRuntimeUnassigned(`${loopDef.name} ${phase === 'resume' ? 'resume' : `round ${current.packsOpened}`} cleanup`, {
            loopDef,
            blockedPolicy: 'preserve',
            enableRecovery: false,
            reserveItem: isReservedDuplicate,
          });
          if (phase === 'pack') await sleep(CFG.pauseMs);
        },
        afterStalePack: async () => {
          if (!dryRun) await sleep(CFG.pauseMs);
        },
        finalize: async () => {
          if (!dryRun) {
            const stageResult = await runProvisionMaterialStages('final-cleanup');
            if (stageResult.status === 'blocked' || stageResult.status === 'planned') {
              fail(`${loopDef.name}: final material cleanup ${stageResult.status}: ${stageResult.reason || 'unknown reason'}`);
            }
            await resolveRuntimeUnassigned(`${loopDef.name} final cleanup`, {
              loopDef,
              blockedPolicy: 'preserve',
              enableRecovery: false,
              reserveItem: isReservedDuplicate,
            });
          }
        },
        onEvent: async (event, payload) => {
          if (event === 'pack-unavailable') {
            log(`${loopDef.name}: configured source pack not found; stopping at round ${payload.result.packsOpened + 1}/${rounds}`);
          }
        },
      });
    } catch (error) {
      const message = String(error?.message || error);
      const failedResult = {
        status: /stopped by user/i.test(message) ? 'stopped' : 'blocked',
        reason: /stopped by user/i.test(message) ? 'stopped by user' : message,
      };
      await publishPreCraftPickRecap(failedResult);
      throw error;
    }

    if (hasPlayerPickRecapCards(preCraftPickResults)) {
      await publishPreCraftPickRecap(result);
    } else if (preCraftPickResults.length) {
      log(`${loopDef.name}: pre-craft Pick results contain no selected card; Pick recap skipped`);
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

  function getBoundRarePackFallbackDef(loopDef, rareUpgradeDef, activityFamily) {
    if (!activityFamily
      || rareUpgradeDef?.activityResolved !== true
      || String(rareUpgradeDef?.activityBinding?.family || '') !== String(activityFamily)) return null;
    return {
      id: `${loopDef?.id || 'rare-pack-recycling'}-inventory-fallback`,
      ...createTwoBy84UpgradePolicy({ hidden: false }),
      ...cloneLoopDef(rareUpgradeDef),
      strategy: 'fillAndVerifySbc',
    };
  }

  async function runRarePackCraftLoop(loopDef) {
    const dryRun = loopDef.dryRun === true;
    const consumeAllSourcePacks = loopDef.consumeAllSourcePacks === true;
    const fillRemainingRoundsFromInventory = consumeAllSourcePacks && loopDef.useRoundsAsCompletions === true;
    const maxPacks = Math.max(1, Math.min(100, Number(loopDef.maxPacks || 100) || 100));
    const maxCompletions = Math.max(1, Math.min(100, Number(loopDef.maxCompletions || 1) || 1));
    const rareUpgradeDef = inheritSbcFodderPolicy({
      ...loopDef.rareUpgrade,
      openRewardPacks: loopDef.openRewardPacks === true,
    }, loopDef);
    if (sourcePackIdentityBlocked(loopDef, loopDef.name)) {
      return {
        status: 'blocked',
        packsOpened: 0,
        stageCompletions: { rare: 0 },
        reason: 'source/output pack identity overlap',
      };
    }
    if (rareUpgradeDef.activityBinding?.required === true && rareUpgradeDef.activityResolved !== true) {
      const family = String(rareUpgradeDef.activityBinding.family || 'Rare Gold material Upgrade');
      log(`${loopDef.name}: required scanned activity ${family} is unavailable; stopping before opening a source pack`);
      return {
        status: 'unavailable',
        packsOpened: 0,
        stageCompletions: { rare: 0 },
        reason: `required scanned activity unavailable: ${family}`,
      };
    }
    const rareUpgradeLabel = rareUpgradeDef.name || 'Rare Gold Recycling Upgrade';
    const isEligibleLowRareGoldDuplicate = (item) => isRareGoldDuplicate(item, {
      sbcFodderPolicy: getSbcFodderPolicy(rareUpgradeDef),
    });
    await waitAppReady();
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
          const usable = items.filter(isEligibleLowRareGoldDuplicate);
          log(`${loopDef.name}: dry-run resume found ${items.length} unassigned item(s), ${usable.length} usable low rare duplicate(s)`);
          return { hasItems: usable.length > 0, usableCount: usable.length };
        }
        await unwindSbcSquadControllers(`${loopDef.name} resume`);
        const items = await showUnassignedIfAny(`${loopDef.name} resume sync`);
        const usable = items.filter(isEligibleLowRareGoldDuplicate);
        if (items.length) log(`${loopDef.name}: resume found ${items.length} unassigned item(s), ${usable.length} usable low rare duplicate(s)`);
        return { hasItems: usable.length > 0, usableCount: usable.length };
      },
      beforePack: async () => {
        if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} pre-open cleanup`);
        return { status: 'ready' };
      },
      findPack: async () => findSourcePack(loopDef, { openStoreFallback: !dryRun }),
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
            isEligibleLowRareGoldDuplicate,
            `${rareUpgradeLabel} ${phase === 'resume' ? 'resumed ' : ''}low rare gold`,
            { maxCompletions: 1, requireFullSignalCoverage: true },
          );
          return { status: 'planned', completions: { rare: 0 }, reason: `would submit ${rareUpgradeLabel} stage` };
        }
        const stageResult = await runReservedDuplicateCraftingStage(
          loopDef,
          rareUpgradeDef,
          isEligibleLowRareGoldDuplicate,
          `${rareUpgradeLabel} ${phase === 'resume' ? 'resumed ' : ''}low rare gold`,
          {
            maxCompletions: remainingCompletions ?? 100,
            forceAttempts: phase === 'pack' && Number(context?.lowRare || 0) > 0 ? 1 : 0,
            transientUnassignedSignals: phase === 'pack' ? context?.transientUnassignedSignals || [] : [],
            requireFullSignalCoverage: true,
          },
        );
        return {
          status: stageResult.status === 'blocked' || stageResult.status === 'planned'
            ? stageResult.status
            : 'completed',
          completions: { rare: stageResult.completions },
          reason: stageResult.reason || null,
        };
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
        const fallbackActivityFamily = String(loopDef.sourceExhaustedFallbackActivityFamily || '').trim();
        const requestedFallbackCompletions = fillRemainingRoundsFromInventory
          ? Number(remainingCompletions || 0)
          : (consumeAllSourcePacks
            ? Number(loopDef.sourceExhaustedFallbackMaxCompletions || 1)
            : Number(remainingCompletions || 0));
        if (fillRemainingRoundsFromInventory && requestedFallbackCompletions === 0) {
          log(`${loopDef.name}: source packs completed the requested ${maxCompletions} round(s); no inventory fallback needed`);
          return { status: 'completed', completions: { rare: 0 }, reason: null };
        }
        if ((!fallbackLoopId && !fallbackActivityFamily) || requestedFallbackCompletions <= 0) {
          return { status: 'unavailable', completions: { rare: 0 }, reason: 'no source-exhausted fallback configured' };
        }
        let baseFallbackDef = fallbackLoopId ? findLoopDefById(fallbackLoopId) : null;
        if (!baseFallbackDef) {
          baseFallbackDef = getBoundRarePackFallbackDef(loopDef, rareUpgradeDef, fallbackActivityFamily);
        }
        if (!baseFallbackDef && fallbackActivityFamily) {
          const resolution = resolveSessionLoopByActivityFamily(getLoopDefs(), fallbackActivityFamily);
          if (resolution.status === 'ambiguous') {
            fail(`${loopDef.name}: source-exhausted fallback activity ${fallbackActivityFamily} is ambiguous: ${resolution.matches.map((entry) => `${entry.name} (${entry.id})`).join(', ')}`);
          }
          if (resolution.status === 'unavailable') {
            log(`${loopDef.name}: source-exhausted fallback activity ${fallbackActivityFamily} is unavailable in the current scan`);
            return { status: 'unavailable', completions: { rare: 0 }, reason: `fallback activity unavailable: ${fallbackActivityFamily}` };
          }
          baseFallbackDef = resolution.loop;
        }
        if (!baseFallbackDef || baseFallbackDef.strategy !== 'fillAndVerifySbc') {
          fail(`${loopDef.name}: source-exhausted fallback loop not found or invalid: ${fallbackLoopId || fallbackActivityFamily}`);
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
        log(`${loopDef.name}: no matching source pack remains; running ${fallbackDef.name} for up to ${fallbackCompletions} remaining recycling completion(s)`);
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
      log(`${loopDef.name}: opened ${result.packsOpened} rare gold pack(s), submitted ${rareUpgradeLabel}:${completionSummary}`);
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
        log(`${loopDef.name}: FUTNext returned no usable Pick prices; price-missing ties will use randomized fallback ordering`);
      } else {
        log(`${loopDef.name}: FUTNext price lookup unavailable (${attempt.reason}); price-missing ties will use randomized fallback ordering`);
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

  function isPlayerPickRare(item) {
    return isRare(item) || itemRareFlag(item) > 0;
  }

  function isPlayerPickSpecial(item) {
    return isSpecial(item) || itemRareFlag(item) > 1;
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
    const autoSelectWithinProtection = shouldAutoSelectPlayerPick(maxRating, {
      autoSelectBelow90: loopDef.autoSelectBelow90,
      protectionRating: autoPickThreshold,
    });
    if (autoSelectWithinProtection) {
      log(`${loopDef.name}: all candidates are within the automatic-use rating ${autoPickThreshold} (max ${maxRating}); keeping automatic selection while loading prices for the recap`);
    }

    await refreshInventoryCaches(`${loopDef.name} Player Pick duplicate check`, { includePacks: false, quiet: true });
    const prices = await getPlayerPickPrices(choices, loopDef);
    const pickRewardOptions = {
      isSpecial: isPlayerPickSpecial,
      isDuplicate: isPlayerPickDuplicate,
      isRare: isPlayerPickRare,
    };
    const ranked = rankPlayerPickCandidates(choices, prices, pickRewardOptions);
    ranked.forEach((candidate, index) => log(`${loopDef.name}: pick candidate ${index + 1}/${ranked.length} ${describePlayerPickCandidate(candidate)}`));

    const manualReason = autoSelectWithinProtection ? '' : getManualPlayerPickReason(ranked, pickCount);
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

    const beforeConfirmation = {
      unassigned: eaInventoryAdapter().unassignedState(),
      selected: selected.map((item) => (
        captureRuntimeInventoryItem(item, { identify: identifyRuntimeInventoryItem })
      )),
    };
    const confirmed = await observeOnce(
      eaPlayerPickAdapter().confirmSelection(selected),
      ctrl(),
      30000,
      'confirm Player Pick selection',
    );
    if (!confirmed?.success) fail(`${loopDef.name}: Player Pick confirmation failed: ${serviceResultErrorText(confirmed)}`);
    emitDiagnostic(log, () => `${loopDef.name}: Player Pick confirmation response: ${diagnosticJson({
      before: beforeConfirmation,
      result: captureMoveResult(confirmed),
    })}`);
    selectedCards.forEach((card) => { card.destination = 'unassigned'; });
    await options.onSelectionConfirmed?.(selectedCards);
    await sleep(CFG.pauseMs);
    let invalidation = null;
    let refreshResult = null;
    try {
      invalidation = await eaInventoryAdapter().invalidateUnassigned();
      refreshResult = await refreshUnassigned({
        attempts: 2,
        allowCacheFallback: false,
        quiet: true,
      });
    } catch (error) {
      refreshResult = await refreshUnassigned({ quiet: true });
      invalidation = {
        ...(invalidation || {}),
        error: error?.message || String(error),
      };
    }
    emitDiagnostic(log, () => {
      const piles = {
        unassigned: getUnassignedItems(),
        storage: getStorageItems(),
        transfer: getTransferItems(),
        club: getClubItems(),
      };
      const selectedDefinitions = [...new Set(selected
        .map((item) => Number(item?.definitionId || 0))
        .filter(Boolean))];
      return `${loopDef.name}: Player Pick post-confirm inventory: ${diagnosticJson({
        invalidation,
        refresh: captureMoveResult(refreshResult),
        unassigned: eaInventoryAdapter().unassignedState(),
        pendingPlayerPicks: eaPlayerPickAdapter().listUnassignedPlayerPicks().map((item) => (
          captureRuntimeInventoryItem(item, { identify: identifyRuntimeInventoryItem })
        )),
        selectedDefinitions: Object.fromEntries(selectedDefinitions.map((definitionId) => [
          definitionId,
          captureDefinitionPileState(piles, definitionId, { identify: identifyRuntimeInventoryItem }),
        ])),
      })}`;
    });
    selectedCards.forEach((card) => { card.destination = predictUnassignedDestination(card.item); });
    try {
      await resolveRuntimeUnassigned(`${loopDef.name} Player Pick result`, options.cleanupOptions || {});
    } catch (error) {
      selectedCards.forEach((card) => { card.destination = 'blocked'; });
      throw error;
    }
    emitDiagnostic(log, () => `${loopDef.name}: Player Pick result cleanup complete; unassigned:${diagnosticJson(eaInventoryAdapter().unassignedState())}`);
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
    const preferredSignalRefs = options.preferredSignalRefs || [];
    const selection = selectInventoryPlayers(challengeDef, challengeDef.priorityPiles, {
      preferredSignalRefs,
    });
    log(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} selected ${selection.selected.length}/${sumRequirementPlayerCount(challengeDef)} player(s) (${formatSelectionStats(selection.stats)})`);
    if (!selection.ok) {
      log(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} missing ${selection.missing.count} ${selection.missing.rarity || selection.missing.tier || 'player'}(s); stopping`);
      logSelectionDiagnostics(`${loopDef.name} challenge ${challengeNo}/${challengeTotal}`, selection, challengeDef.priorityPiles);
      return { status: 'blocked', submitted: false, reason: `missing ${selection.missing.count} player(s)` };
    }
    if (options.requirePreferredSignal === true
      && preferredSignalRefs.length
      && !selectionConsumesSignalRefs(selection, preferredSignalRefs)) {
      log(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} did not consume a required recovery duplicate signal; preserving the primary 10x85+ fodder`);
      return { status: 'unavailable', submitted: false, reason: 'recovery duplicate signal was not selected' };
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
    return {
      status: 'submitted',
      submitted: true,
      rewardPackId: attempt.result.rewardPackId,
      selection,
    };
  }

  async function runProvisionPreCraftPlayerPick(loopDef, provisionHandling = {}, options = {}) {
    const pickDef = getProvisionPreCraftPickDef(loopDef);
    if (!pickDef) {
      if (loopDef.preCraftPlayerPick || loopDef.preCraftPlayerPickSelector) {
        log(`${loopDef.name}: configured dynamic pre-craft Player Pick is unavailable; skipping it and continuing crafting stages`);
      }
      return [];
    }
    const materialDefs = [
      ...getChallengeMaterialDefs(pickDef),
      ...getProvisionCraftingUpgrades(loopDef).flatMap(getChallengeMaterialDefs),
    ];
    const isReservedDuplicate = (item) => materialDefs.some((def) => isDuplicateForLoopRequirements(item, def));
    const cleanupOptions = {
      loopDef,
      blockedPolicy: 'preserve',
      enableRecovery: false,
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
      let confirmedResult = null;
      const pickedCards = await redeemAndSelectPlayerPick(pendingPick, pickDef, {
        cleanupOptions,
        onSelectionConfirmed: async (cards) => {
          confirmedResult = { resumed: true, pickedCards: cards || [] };
          await options.onPickConfirmed?.(confirmedResult);
        },
      });
      log(`${loopDef.name}: pending ${pickDef.name} selected; continuing original crafting flow`);
      return [confirmedResult || { resumed: true, pickedCards: pickedCards || [] }];
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
    let confirmedResult = null;
    const pickedCards = await redeemAndSelectPlayerPick(pickItem, pickDef, {
      cleanupOptions,
      onSelectionConfirmed: async (cards) => {
        confirmedResult = { resumed: false, pickedCards: cards || [] };
        await options.onPickConfirmed?.(confirmedResult);
      },
    });
    log(`${loopDef.name}: ${pickDef.name} completed and selected; continuing original crafting flow`);
    return [confirmedResult || { resumed: false, pickedCards: pickedCards || [] }];
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
      redeemPick: async ({ pickItem, resumed, onSelectionConfirmed }) => {
        if (dryRun) return { status: 'planned', reason: 'would redeem Player Pick' };
        const pickedCards = await redeemAndSelectPlayerPick(pickItem, loopDef, openPicksAtEnd ? {
          onSelectionConfirmed,
          cleanupOptions: {
            reserveItem: (item) => playerPickMatchesReward(
              item,
              loopDef.pickItemNames || [],
              loopDef.pickItemResourceIds || [],
            ),
          },
        } : { onSelectionConfirmed });
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
      onPickConfirmed: async () => {
        if (state.loopRecapSession) state.loopRecapSession.dedicatedRecap = true;
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
    } else if (result.status !== 'completed') {
      log(`${loopDef.name}: failed (${result.status}): ${result.reason || 'unknown Player Pick failure'}`);
    } else {
      const targetLabel = loopDef.exhaustSbcSet === true ? 'available' : 'requested';
      log(`${loopDef.name}: completed ${result.picksCompleted}/${maxPicks} ${targetLabel} Player Pick(s)${openPicksAtEnd ? `; queued ${result.picksQueued}` : ''}`);
    }
    return result;
  }

  function recapDefinitionId(item) {
    const definitionId = Number(item?.definitionId || 0);
    return Number.isInteger(definitionId) && definitionId > 0 ? definitionId : null;
  }

  function createRecapFutbinItemHydrator() {
    const byItemId = new Map();
    const byDefinitionId = new Map();
    ['storage', 'club', 'unassigned', 'transfer'].forEach((pileName) => {
      getPileItemsByName(pileName).forEach((item) => {
        const itemId = Number(item?.id || 0);
        const definitionId = recapDefinitionId(item);
        if (Number.isInteger(itemId) && itemId > 0 && !byItemId.has(itemId)) byItemId.set(itemId, item);
        if (definitionId && !byDefinitionId.has(definitionId)) byDefinitionId.set(definitionId, item);
      });
    });
    return (item) => {
      const itemId = Number(item?.id || 0);
      if (Number.isInteger(itemId) && itemId > 0 && byItemId.has(itemId)) return byItemId.get(itemId);
      return byDefinitionId.get(recapDefinitionId(item)) || item;
    };
  }

  async function resolveRecapFutbinPlayerIds(items, label) {
    const fsu = fsuAdapter();
    // Pack receipts can omit metadata that FSU keeps on the current inventory entity.
    const hydrateItem = createRecapFutbinItemHydrator();
    const resolved = await resolveFutbinCardIds({
      items,
      cache: adapters.userscriptStorage.get(FUTBIN_CARD_ID_CACHE_KEY, null),
      hydrateItem,
      resolveKnownId: (item) => fsu.getFutbinPlayerId(item),
      getLookupContext: (item) => fsu.getFutbinLookupContext(item),
      shouldResolve: () => true,
      requestText: adapters.http.getText,
      maxConcurrency: 3,
    });
    if (resolved.resolved > 0) {
      try {
        adapters.userscriptStorage.set(FUTBIN_CARD_ID_CACHE_KEY, resolved.cache);
        log(`${label}: FUTBIN direct links resolved for ${resolved.resolved} card(s) and cached`);
      } catch {
        log(`${label}: FUTBIN direct links resolved for ${resolved.resolved} card(s); local cache unavailable`);
      }
    }
    if (resolved.failed > 0) {
      log(`${label}: FUTBIN card lookup unavailable for ${resolved.failed} card(s); those links stay hidden`);
    } else if (resolved.unmatched > 0) {
      log(`${label}: FUTBIN returned no exact card ID for ${resolved.unmatched} card(s); those links stay hidden`);
    }
    return (item) => resolved.ids.get(recapDefinitionId(item)) || fsu.getFutbinPlayerId(hydrateItem(item));
  }

  async function showPickRecapModal(loopDef, pickResults, result = {}) {
    if (state.loopRecapSession) state.loopRecapSession.dedicatedRecap = true;
    const pickedCards = (pickResults || []).flatMap((entry) => entry?.pickedCards || []);
    const resolveFutbinPlayerId = await resolveRecapFutbinPlayerIds(
      pickedCards.map((card) => card.item),
      `${loopDef?.name || 'Player Pick'} recap`,
    );
    return showPlayerPickRecap({
      dom: adapters.dom,
      name: loopDef?.name,
      pickResults,
      status: result.status,
      reason: result.reason,
      itemDisplayName,
      resolveNativeTheme: (item) => eaRarityAdapter.playerTheme(item),
      resolveFutbinPlayerId,
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

  function showLoopRecapModal(model) {
    return showLoopRecap({
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

  async function getSpecialCardPrices(items, label = 'Recap') {
    const specialItems = (items || []).filter(isSpecialPlayerCard);
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
      log(`${label}: special card price lookup failed (${error?.message || error}); recap will show price:?`);
      return new Map();
    }
    for (const attempt of result.attempts) {
      if (attempt.status === 'loaded') {
        log(`${label}: ${attempt.source} prices loaded for ${result.prices.size}/${result.ids.length} special card(s)`);
      } else if (attempt.source === 'FUT.GG') {
        log(`${label}: FUT.GG price lookup ${attempt.status}${attempt.reason ? ` (${attempt.reason})` : ''}; trying FUTNext`);
      } else {
        log(`${label}: FUTNext price lookup ${attempt.status}${attempt.reason ? ` (${attempt.reason})` : ''}; unavailable prices will show as ?`);
      }
    }
    return result.prices;
  }

  function beginLoopRecapSession(loopDef) {
    const rolling = loopDef?.strategy === 'rollingUpgrade';
    state.loopRecapSession = {
      name: loopDef?.name || loopDef?.id || 'Loop',
      receipts: [],
      dedicatedRecap: false,
      startedAt: Date.now(),
      rollingAggregator: rolling ? createRollingRecapAggregator({
        alertMinimumRating: state.rewardAlertSettings.minimumRating,
        resolveNativeTheme: (item) => eaRarityAdapter.playerTheme(item),
      }) : null,
    };
  }

  function rollingFinalResources(runResult = {}) {
    if (runResult.finalResources) return runResult.finalResources;
    const telemetry = state.runtimeTelemetryController.getSnapshot();
    return {
      specialSlots: telemetry.specialSlots,
      directCycles: telemetry.directCycles,
      provisionsBatches: telemetry.provisionsBatches,
      totwRecoveries: telemetry.totwRecoveries,
      storage: telemetry.storageUsed === null || telemetry.storageCapacity === null
        ? null
        : `${telemetry.storageUsed}/${telemetry.storageCapacity}`,
      inventoryVersion: telemetry.inventoryVersion,
    };
  }

  async function finalizeLoopRecap(loopDef, status = 'completed', reason = null, runResult = null) {
    const session = state.loopRecapSession;
    state.loopRecapSession = null;
    if (!session || session.dedicatedRecap) return null;
    if (session.rollingAggregator) {
      try {
        const snapshot = session.rollingAggregator.getSnapshot({
          workflow: runResult || {},
          status,
          reason: reason || runResult?.reason || null,
          finalResources: rollingFinalResources(runResult || {}),
        });
        const retainedCards = snapshot.retainedCards || [];
        const prices = await getSpecialCardPrices(retainedCards, `${session.name} recap`);
        const resolveFutbinPlayerId = await resolveRecapFutbinPlayerIds(retainedCards, `${session.name} recap`);
        const model = createRollingRecapModel({
          name: session.name,
          snapshot,
          prices,
          resolveFutbinPlayerId,
        });
        state.lastLoopRecap = { name: session.name, model, completedAt: Date.now() };
        state.lastRecapType = 'loop';
        updateRecapButton();
        await showLoopRecapModal(model);
        return model;
      } catch (error) {
        log(`${session.name}: Rolling recap failed (${error?.message || error})`);
        errorStackLines(error).forEach((line) => log(`Error stack: ${line}`));
        return null;
      }
    }
    const openedItems = session.receipts.flatMap((receipt) => receipt?.openedItems || []);
    if (!hasRecapRareGoldOrAbove(openedItems)) {
      log(`${session.name}: no Rare Gold or Special card in this session; recap skipped`);
      return null;
    }
    try {
      const prices = await getSpecialCardPrices(openedItems, `${session.name} recap`);
      const resolveFutbinPlayerId = await resolveRecapFutbinPlayerIds(openedItems, `${session.name} recap`);
      const model = createLoopRecapModel({
        name: session.name,
        receipts: session.receipts,
        status,
        reason,
        prices,
        resolveNativeTheme: (item) => eaRarityAdapter.playerTheme(item),
        resolveFutbinPlayerId,
      });
      if (!model) return null;
      state.lastLoopRecap = { name: session.name, model, completedAt: Date.now() };
      state.lastRecapType = 'loop';
      updateRecapButton();
      await showLoopRecapModal(model);
      return model;
    } catch (error) {
      log(`${session.name}: recap failed (${error?.message || error})`);
      errorStackLines(error).forEach((line) => log(`Error stack: ${line}`));
      return null;
    }
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
    const savedPlan = persistBatchOpenPlan(planInput);
    state.running = true;
    state.stopping = false;
    setPanelState();
    let result = null;
    let recapModel = null;
    try {
      await refreshStorePacks().catch((error) => {
        log(`Batch Open: start-time My Packs refresh failed; using current cache (${error?.message || error})`);
      });
      const plan = materializeBatchOpenPlan(savedPlan, getPackInventorySnapshot());
      const requested = plan.entries.reduce((sum, entry) => sum + entry.quantity, 0);
      let packQueue = null;
      log(`Batch Open: starting ${requested} requested pack(s) across ${plan.entries.length} pack type(s)`);
      result = await runBatchOpenWorkflow({
        plan,
        shouldStop: () => state.stopping,
        beforeStart: async () => resolveRuntimeUnassigned('Batch Open preflight', {
          blockedPolicy: 'preserve',
          enableRecovery: true,
        }),
        resolvePack: async (entry) => {
          if (!packQueue) {
            packQueue = createPackInstanceQueue(getAvailableRepositoryMyPacks(), { getName: packName });
          }
          return packQueue.take(entry);
        },
        openPack: async ({ entry, pack, openIndex }) => await openPack(
          pack,
          `Batch Open ${entry.packName || `#${entry.packId}`} ${openIndex + 1}/${entry.quantity}`,
          {
            allowGone: true,
            allowPendingItems: true,
            retryCodes: ['471', '500'],
            openedItemPolicy: createMaterializeAndResolvePolicy(
              `Batch Open ${entry.packName || `#${entry.packId}`}`,
              `Batch Open ${entry.packName || `#${entry.packId}`} cleanup`,
              { blockedPolicy: 'preserve', enableRecovery: true, directDuplicateFallback: true },
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
          } else if (event === 'pending') {
            log(`Batch Open: opened items remain unresolved after ${payload.entry.packName || `#${payload.entry.packId}`}; stopping before ${payload.remaining} remaining pack(s)`);
          } else if (event === 'blocked') {
            log(`Batch Open: blocked at ${payload.entry.packName || `#${payload.entry.packId}`}; ${payload.entryResult.reason || 'pack open failed'}`);
          }
        },
      });
      const prices = await getSpecialCardPrices(result.openedItems, 'Batch Open');
      const resolveFutbinPlayerId = await resolveRecapFutbinPlayerIds(result.openedItems, 'Batch Open recap');
      recapModel = createBatchOpenRecapModel({
        ...result,
        prices,
        resolveNativeTheme: (item) => eaRarityAdapter.playerTheme(item),
        resolveFutbinPlayerId,
      });
      if (recapModel?.hasQualifyingCards) {
        state.lastBatchRecap = { model: recapModel, completedAt: Date.now() };
        state.lastRecapType = 'batch';
      } else {
        log('Batch Open: no Rare Gold or Special card in this session; recap skipped');
      }
      log(`Batch Open: ${result.status}${result.reason ? ` (${result.reason})` : ''}; opened ${result.packsOpened}/${result.requestedPacks}, skipped ${result.skippedPacks}`);
      updateRecapButton();
      return recapModel;
    } catch (error) {
      log(`Batch Open stopped: ${error?.message || error}`);
      errorStackLines(error).forEach((line) => log(`Error stack: ${line}`));
      console.error(CONSOLE_PREFIX, error);
      const fallbackPlan = materializeBatchOpenPlan(savedPlan, getPackInventorySnapshot());
      const requestedPacks = fallbackPlan.entries.reduce((sum, entry) => sum + entry.quantity, 0);
      const resolveFutbinPlayerId = await resolveRecapFutbinPlayerIds(result?.openedItems || [], 'Batch Open recap');
      recapModel = createBatchOpenRecapModel({
        ...(result || {}),
        requestedPacks: result?.requestedPacks ?? requestedPacks,
        status: 'blocked',
        reason: error?.message || error,
        resolveNativeTheme: (item) => eaRarityAdapter.playerTheme(item),
        resolveFutbinPlayerId,
      });
      if (recapModel?.hasQualifyingCards) {
        state.lastBatchRecap = { model: recapModel, completedAt: Date.now() };
        state.lastRecapType = 'batch';
      } else {
        log('Batch Open: no Rare Gold or Special card in this session; blocked recap skipped');
      }
      updateRecapButton();
      return null;
    } finally {
      state.running = false;
      state.stopping = false;
      setPanelState();
      if (recapModel?.hasQualifyingCards) void showBatchRecapModal(recapModel);
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
        const set = await findSbcSetForLoopDef({
          ...loopDef,
          sbcNames: loopDef.sbcNames || CFG.bronzeUpgradeNames,
        }, loopDef.name);
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

  function rollingProtectionRating(loopDef = {}) {
    return resolveRollingAutomaticUseMaxRating(loopDef);
  }

  function rollingProvisionsReserveRatings(loopDef = {}) {
    return resolveRollingProvisionsReserveRatings(loopDef);
  }

  function rollingProvisionsMaxRating(loopDef = {}) {
    return rollingProvisionsReserveRatings(loopDef).at(-1)
      || ROLLING_PROVISIONS_RATING_RANGE.max;
  }

  function rollingSnapshotMatchesRequiredSpecial(item, loopDef = {}) {
    if (item?.special !== true) return false;
    const requiredGroups = new Set(dynamicPlayerGroupRequirements(loopDef)
      .flatMap((requirement) => requirement.values || [])
      .map(Number)
      .filter(Number.isFinite));
    if (requiredGroups.size) {
      return (item.groups || []).some((group) => requiredGroups.has(Number(group)));
    }
    return isRequiredSpecialItem(item, loopDef);
  }

  function rollingSnapshotRequiredSpecial(item, loopDef = {}) {
    if (!rollingSnapshotMatchesRequiredSpecial(item, loopDef)) return false;
    const pile = normalizedRuntimePileName(item?.pile || item?.ref?.pile) || 'unknown';
    return pile !== 'club' || isTotwItem(item);
  }

  function isRollingTransientSubmissionAllowed(item, loopDef = {}) {
    const pile = normalizedRuntimePileName(item?.pile || item?.ref?.pile) || 'unknown';
    if (pile !== 'club') return true;
    if (isTotwItem(item)) return true;
    return rollingBaseProtectionReasons(item, loopDef, pile).length === 0;
  }

  function rollingLiveRequiredSpecial(item, model = {}) {
    const constraints = eaPlayerGroupConstraints(model);
    if (!constraints.length) {
      const fallback = (model.constraints || []).find((constraint) => constraint.id === 'runner-required-special');
      if (!fallback) return false;
      try { return fallback.matches(item) === true; } catch { return false; }
    }
    return constraints.some(({ constraint }) => {
      try { return constraint.matches(item) === true; } catch { return false; }
    });
  }

  function duplicateSwapSnapshot(item, pile) {
    return {
      ...ratingSelectionItemSnapshot(item, pile),
      tradeable: typeof item?.tradeable === 'boolean' ? item.tradeable : isTradeable(item),
      pile,
      ref: liveItemRef(item, pile),
    };
  }

  function duplicateSwapSelectionSnapshot(selection, players) {
    const playerById = new Map((players || [])
      .map((item) => [Number(item?.id || 0), item])
      .filter(([id]) => id));
    return {
      entries: (selection?.entries || []).map((entry) => {
        const signal = entry?.signal || entry?.signalRef || null;
        const plannedItem = entry?.item || entry?.itemRef || null;
        const selectedItem = playerById.get(Number(plannedItem?.id || plannedItem?.ref?.id || 0)) || plannedItem;
        return {
          ...entry,
          signal: signal ? duplicateSwapSnapshot(signal, 'unassigned') : null,
          item: selectedItem ? duplicateSwapSnapshot(selectedItem, liveItemRef(selectedItem).pile) : null,
        };
      }),
    };
  }

  async function prepareRollingUntradeableDuplicateSwaps(context, runtime) {
    const selection = context?.squadPlan?.selection;
    const players = Array.isArray(context?.players) ? context.players : [];
    if (!selection?.entries?.length || !players.length) return { ok: true };

    const originalPlan = planUntradeableDuplicateSwaps({
      selection: duplicateSwapSelectionSnapshot(selection, players),
      players: players.map((item) => duplicateSwapSnapshot(item, liveItemRef(item).pile)),
    });
    if (!originalPlan.ok || !originalPlan.swaps.length) return originalPlan;

    const signalItems = [];
    for (const swap of originalPlan.swaps) {
      const live = findCachedItemById(swap.signalId, ['unassigned'])?.item || null;
      if (!live) {
        return { ok: false, reason: `Unassigned duplicate #${swap.signalId} disappeared before tradeable swap` };
      }
      signalItems.push(live);
    }
    const liveSelection = {
      entries: originalPlan.swaps.map((swap, index) => {
        const target = players.find((item) => Number(item?.id || 0) === swap.targetId);
        return {
          pileName: 'unassigned',
          signal: duplicateSwapSnapshot(signalItems[index], 'unassigned'),
          item: duplicateSwapSnapshot(target, 'club'),
        };
      }),
    };
    const livePlan = planUntradeableDuplicateSwaps({
      selection: liveSelection,
      players: liveSelection.entries.map((entry) => entry.item),
    });
    if (!livePlan.ok || livePlan.swaps.length !== originalPlan.swaps.length) {
      return { ok: false, reason: livePlan.reason || 'duplicate swap eligibility changed before move' };
    }

    log(`${context.label}: swapping ${signalItems.length} Unassigned untradeable duplicate(s) into Club before SBC submit`);
    const moveResult = await moveItems(signalItems, inventoryPile('club'), true);
    const resolution = resolveUntradeableDuplicateSwapIds(livePlan, moveResult);
    if (!resolution.ok) {
      log(`${context.label}: duplicate swap response diagnostic ${diagnosticJson(captureMoveResult(moveResult))}`);
      return resolution;
    }

    await refreshInventoryCaches(`${context.label} post-untradeable-swap`, {
      includePacks: false,
      quiet: true,
    });
    const replacementByTargetId = new Map();
    for (const replacement of resolution.replacements) {
      const originalSignal = signalItems.find((item) => Number(item?.id || 0) === replacement.signalId);
      const originalTarget = players.find((item) => Number(item?.id || 0) === replacement.targetId);
      const newItemLocation = findCachedItemById(replacement.newItemId, ['club', 'unassigned', 'storage', 'transfer']);
      let displacedTargetLocation = findCachedItemById(replacement.targetId, ['unassigned', 'storage', 'transfer', 'club']);
      for (let attempt = 1; attempt <= 2 && displacedTargetLocation?.pileName !== 'unassigned'; attempt++) {
        log(`${context.label}: waiting for displaced tradeable Club item #${replacement.targetId} to settle in Unassigned (${attempt}/2)`);
        await sleep(400 * attempt);
        await refreshUnassigned({ quiet: true }).catch(() => null);
        displacedTargetLocation = findCachedItemById(replacement.targetId, ['unassigned', 'storage', 'transfer', 'club']);
      }
      const newItem = newItemLocation?.item || null;
      const materialization = validateUntradeableDuplicateSwapMaterialization({
        replacement,
        originalSignal: originalSignal ? duplicateSwapSnapshot(originalSignal, 'unassigned') : null,
        originalTarget: originalTarget ? duplicateSwapSnapshot(originalTarget, 'club') : null,
        newClubItem: newItem ? duplicateSwapSnapshot(newItem, newItemLocation.pileName) : null,
        displacedTarget: displacedTargetLocation?.item
          ? duplicateSwapSnapshot(displacedTargetLocation.item, displacedTargetLocation.pileName)
          : null,
      });
      if (!materialization.ok) {
        log(`${context.label}: duplicate swap postcondition diagnostic ${diagnosticJson({
          replacement,
          reason: materialization.reason,
          newItemLocation: newItemLocation ? {
            pile: newItemLocation.pileName,
            item: captureRuntimeInventoryItem(newItemLocation.item, { identify: identifyRuntimeInventoryItem }),
          } : null,
          displacedTargetLocation: displacedTargetLocation ? {
            pile: displacedTargetLocation.pileName,
            item: captureRuntimeInventoryItem(displacedTargetLocation.item, { identify: identifyRuntimeInventoryItem }),
          } : null,
          definitionPiles: captureDefinitionPileState({
            unassigned: getUnassignedItems(),
            storage: getStorageItems(),
            transfer: getTransferItems(),
            club: getClubItems(),
          }, Number(originalSignal?.definitionId || originalTarget?.definitionId || 0), {
            identify: identifyRuntimeInventoryItem,
          }),
        })}`);
        return materialization;
      }
      log(`${context.label}: duplicate swap verified: untradeable #${replacement.signalId} -> Club #${replacement.newItemId}; tradeable Club #${replacement.targetId} -> Unassigned #${replacement.targetId}`);
      replacementByTargetId.set(replacement.targetId, {
        ...replacement,
        originalTarget,
        newItem,
      });
    }

    const preparedPlayers = players.map((item) => (
      replacementByTargetId.get(Number(item?.id || 0))?.newItem || item
    ));
    const preparedSelection = {
      ...selection,
      entries: (selection.entries || []).map((entry) => {
        const selected = entry?.item || entry?.itemRef || null;
        const replacement = replacementByTargetId.get(Number(selected?.id || selected?.ref?.id || 0));
        if (!replacement) return entry;
        const swappedOutSignal = {
          ...duplicateSwapSnapshot(replacement.originalTarget, 'unassigned'),
          duplicate: true,
          duplicateSignal: true,
          duplicateId: replacement.newItemId,
          duplicateSignalId: replacement.newItemId,
        };
        return {
          ...entry,
          pileName: 'unassigned',
          signal: swappedOutSignal,
          signalRef: swappedOutSignal.ref,
          item: replacement.newItem,
          itemRef: liveItemRef(replacement.newItem, 'club'),
        };
      }),
      selected: preparedPlayers,
    };

    if (runtime?.coordinator) {
      const reconciliation = await runtime.coordinator.reconcile(
        `${context.label} post-untradeable-duplicate-swap`,
        { refreshUnassigned: true },
      );
      if (!reconciliation.ok) {
        return { ok: false, reason: reconciliation.reason || 'inventory reconciliation failed after duplicate swap' };
      }
    }
    log(`${context.label}: replaced ${resolution.replacements.length} selected tradeable Club card(s) with Unassigned untradeable version(s)`);
    return {
      ok: true,
      changed: true,
      players: preparedPlayers,
      itemRefs: preparedPlayers.map((item) => liveItemRef(item)),
      selection: preparedSelection,
    };
  }

  function rollingRequiredSpecialConstraintIndexes(model = {}) {
    return (model.constraints || [])
      .map((constraint, index) => ({ constraint, index }))
      .filter(({ constraint }) => (
        (constraint.source === 'ea' && constraint.keyName === 'PLAYER_RARITY_GROUP')
          || constraint.id === 'runner-required-special'
      ))
      .map(({ index }) => index);
  }

  function rollingRequiredSpecialSourceErrors(selection, model = {}) {
    const indexes = rollingRequiredSpecialConstraintIndexes(model);
    return (selection?.entries || [])
      .filter((entry) => (
        rollingSelectionSubmissionPile(entry) === 'club'
          && indexes.some((index) => entry.requirementMatches?.[index] === true)
          && !isTotwItem(entry.item)
      ))
      .map((entry) => `Club ${itemDisplayName(entry.item)} is not TOTW`);
  }

  function rollingPrimaryReservesAllSpecialSlots(model = {}) {
    const maxSpecialCount = Math.max(0, Number(model?.maxSpecialCount || 0) || 0);
    if (!maxSpecialCount) return false;
    const requiredSpecialCount = rollingRequiredSpecialConstraintIndexes(model)
      .reduce((total, index) => (
        total + Math.max(0, Number(model?.constraints?.[index]?.count || 0) || 0)
      ), 0);
    return requiredSpecialCount >= maxSpecialCount;
  }

  function rollingBaseProtectionReasons(item, loopDef = {}, pileOverride = null) {
    const reasons = getSbcProtectionReasons(item, loopDef, {
      roleAware: true,
      skipRatingLimit: true,
      allowedSpecialCount: expectedSbcPlayerCount(loopDef),
      specialIndex: isSbcSpecialItem(item) ? 1 : 0,
    });
    const pile = normalizedRuntimePileName(pileOverride || item?.pile || item?.ref?.pile) || 'unknown';
    const strictClubSpecial = loopDef.rollingProtectAllClubNonTotwSpecials === true
      && pile === 'club'
      && isSbcSpecialItem(item)
      && !isTotwItem(item);
    if (strictClubSpecial) reasons.push('rolling-club-non-totw-special-strict');
    const protectedClubEventSpecial = pile === 'club'
      && !isTotwItem(item)
      && (
        rollingSnapshotMatchesRequiredSpecial(item, loopDef)
          || isTotsItem(item)
          || isFofItem(item)
          || isFuttiesItem(item)
      );
    if (protectedClubEventSpecial) reasons.push('rolling-club-non-totw-required-special');
    return [...new Set(reasons)];
  }

  function rollingClubNonTotwSpecialSourceErrors(selection, loopDef = {}) {
    if (loopDef.rollingProtectAllClubNonTotwSpecials !== true) return [];
    return (selection?.entries || [])
      .filter((entry) => (
        rollingSelectionSubmissionPile(entry) === 'club'
          && isSbcSpecialItem(entry?.item)
          && !isTotwItem(entry?.item)
      ))
      .map((entry) => `Club ${itemDisplayName(entry.item)} is a protected non-TOTW special`);
  }

  function rollingOpenedDuplicateTargetProtectionReasons(item, loopDef = {}) {
    let targetPile = null;
    return rollingDuplicateTargetProtectionReasons(item, {
      isDuplicate,
      resolveTarget: (signal, duplicateId) => {
        const resolved = findCachedItemById(duplicateId, ['storage', 'club']);
        if (!resolved || !isSamePlayerCardVersion(signal, resolved.item)) return null;
        targetPile = resolved.pileName;
        return resolved.item;
      },
      protectionReasons: (target) => rollingBaseProtectionReasons(target, loopDef, targetPile),
    });
  }

  function rollingItemRef(item, pile) {
    return {
      id: Number(item?.id || 0),
      definitionId: Number(item?.definitionId || 0),
      pile,
    };
  }

  function findRollingLiveUnassignedItem(responseItem, usedIds = new Set(), baselineIds = new Set()) {
    const responseId = Number(responseItem?.id || 0);
    const definitionId = Number(responseItem?.definitionId || 0);
    const items = getUnassignedItems();
    const exact = responseId
      ? items.find((item) => (
          Number(item?.id || 0) === responseId
            && !usedIds.has(responseId)
            && !baselineIds.has(responseId)
        ))
      : null;
    if (exact) return exact;
    return items.find((item) => {
      const id = Number(item?.id || 0);
      return id
        && !usedIds.has(id)
        && !baselineIds.has(id)
        && Number(item?.definitionId || 0) === definitionId
        && isSamePlayerCardVersion(responseItem, item);
    }) || null;
  }

  function createRollingPrimaryPackPolicy(loopDef, context, options = {}) {
    return createOpenedItemPolicy(async (openedItems, packContext = {}) => {
      const label = context.rewardLabel || `${loopDef.name} primary reward`;
      if (context.assumeTotwReward === true || packContext.assumeTotwReward === true) {
        markAssumedTotwRewardItems(openedItems, label);
      }
      const materialized = await materializeOpenedPlayerRewards(openedItems, label, {
        routingBaseline: packContext.routingBaseline || null,
      });
      const nonPlayerItems = openedItems.filter((item) => !isPlayer(item));
      let nonPlayersMoved = 0;
      if (nonPlayerItems.length) {
        try {
          await moveItems(nonPlayerItems, inventoryPile('club'), true);
          nonPlayersMoved = nonPlayerItems.length;
        } catch (error) {
          log(`${label}: non-player reward routing failed (${error?.message || error})`);
        }
      }
      await refreshInventoryCaches(`${label} classification`, { includePacks: false, quiet: true });
      restoreOpenedUnassignedDuplicateMetadata(openedItems, label, {
        routingBaseline: packContext.routingBaseline || null,
      });

      const usedLiveIds = new Set();
      const baselineUnassignedIds = new Set(packContext.routingBaseline?.unassignedIds || []);
      const duplicatePairs = materialized.deferredDuplicates.map((response) => {
        const live = findRollingLiveUnassignedItem(response, usedLiveIds, baselineUnassignedIds);
        const id = Number(live?.id || 0);
        if (id) usedLiveIds.add(id);
        return { response, live };
      });
      const unresolvedPairs = duplicatePairs.filter(({ live }) => !live);
      const liveDuplicates = duplicatePairs.filter(({ live }) => live).map(({ live }) => live);
      let routePlan = planRollingOpenedItemRouting(liveDuplicates, {
        protectionRating: rollingProtectionRating(loopDef),
        provisionsMinRating: ROLLING_PROVISIONS_RATING_RANGE.min,
        provisionsMaxRating: rollingProvisionsMaxRating(loopDef),
        storageFree: storageSpaceLeft(),
        provisionsRequiredCount: rollingProvisionsRequiredCount(loopDef),
        provisionsRecoveryAvailable: rollingCapabilityAvailable(loopDef.rollingProvisionsUpgrade),
        proactiveProvisionsEnabled: loopDef.rollingSurplusCraftingEnabled === true,
        storeOtherSpecialDuplicates: rollingPrimaryReservesAllSpecialSlots(
          context.model || context.primaryContext?.model,
        ),
        isDuplicate,
        isSpecial: isSbcSpecialItem,
        isRequiredSpecial: (item) => rollingLiveRequiredSpecial(
          item,
          context.model || context.primaryContext?.model,
        ),
        protectionReasons: (item) => rollingBaseProtectionReasons(item, loopDef),
        duplicateTargetProtectionReasons: (item) => (
          rollingOpenedDuplicateTargetProtectionReasons(item, loopDef)
        ),
      });
      if (unresolvedPairs.length) {
        routePlan = {
          ...routePlan,
          status: 'blocked',
          reason: `${unresolvedPairs.length} opened duplicate item(s) did not materialize in Unassigned`,
          reasonCode: 'OPENED_DUPLICATE_NOT_MATERIALIZED',
        };
      }

      let storageMoved = false;
      if (routePlan.status === 'ready' && routePlan.storageItems.length) {
        try {
          await moveItems(routePlan.storageItems, inventoryPile('storage'), true);
          storageMoved = true;
        } catch (error) {
          routePlan = {
            ...routePlan,
            status: 'blocked',
            reason: `protected/reserved Storage move failed: ${error?.message || error}`,
            reasonCode: 'PROTECTED_STORAGE_BLOCKED',
          };
        }
      }

      const responseByLiveId = new Map(duplicatePairs
        .filter(({ live }) => live)
        .map(({ response, live }) => [Number(live.id), response]));
      const responseItems = (values) => values
        .map((item) => responseByLiveId.get(Number(item?.id || 0)))
        .filter(Boolean);
      const reservedResponseItems = responseItems([
        ...(routePlan.reservedItems || []),
        ...(routePlan.provisionsItems || []),
      ]);
      const storageResponseItems = storageMoved ? responseItems(routePlan.storageItems) : [];
      const directPlayerItems = Number(materialized.moved || 0) === materialized.directItems.length
        ? materialized.directItems
        : [];
      const directOtherItems = nonPlayersMoved === nonPlayerItems.length ? nonPlayerItems : [];
      const pendingItems = [
        ...unresolvedPairs.map(({ response }) => response),
        ...(storageMoved ? [] : responseItems(routePlan.storageItems)),
        ...(directPlayerItems.length === materialized.directItems.length ? [] : materialized.directItems),
        ...(directOtherItems.length === nonPlayerItems.length ? [] : nonPlayerItems),
      ];
      const finalRouteStatus = routePlan.status === 'blocked' || pendingItems.length
        ? 'blocked'
        : 'ready';
      const finalRouteReason = routePlan.reason
        || (pendingItems.length ? `${pendingItems.length} opened item(s) still have no confirmed destination` : null);
      const finalRouteReasonCode = routePlan.reasonCode
        || (pendingItems.length ? 'OPENED_ITEM_ROUTING_PENDING' : null);
      context.openRouting = {
        ...routePlan,
        status: finalRouteStatus,
        reason: finalRouteReason,
        reasonCode: finalRouteReasonCode,
        counts: {
          ...routePlan.counts,
          opened: openedItems.length,
          directClub: directPlayerItems.length + directOtherItems.length,
          unresolved: unresolvedPairs.length,
        },
      };
      if (options.capturePrimaryDuplicates === true) {
        const captured = preserveRollingPrimaryDuplicateRefs(context, context.openRouting, {
          replace: true,
          storageMoved,
        });
        if (captured.captured) {
          log(`${label}: marked ${context.primaryDuplicateRefs.length} opened duplicate(s) for the next primary SBC or Storage pressure recovery`);
        }
      }
      const counts = context.openRouting.counts;
      log(`${label}: classified ${counts.opened} item(s); duplicates:${counts.duplicates}, primary:${counts.primaryDuplicates}, Required Special:${counts.requiredSpecial}, Provisions reserve:${counts.provisionsReserve} (immediate:${counts.provisionsImmediate || 0}), protected:${counts.protectedDuplicates}, Storage:${counts.storageRequired}, unresolved:${counts.unresolved}`);
      if (finalRouteStatus === 'blocked') {
        log(`${label}: protected routing blocked [${finalRouteReasonCode || 'unknown'}] ${finalRouteReason}`);
      }
      return {
        reservedItemRefs: reservedResponseItems.map((item) => rollingItemRef(item, 'unassigned')),
        routedItemRefs: [
          ...directPlayerItems.map((item) => rollingItemRef(item, 'club')),
          ...directOtherItems.map((item) => rollingItemRef(item, 'club')),
          ...storageResponseItems.map((item) => rollingItemRef(item, 'storage')),
        ],
        pendingItemRefs: pendingItems.map((item) => rollingItemRef(item, 'unassigned')),
        details: {
          rolling: true,
          status: finalRouteStatus,
          reason: finalRouteReason,
          reasonCode: finalRouteReasonCode,
          counts,
        },
      };
    });
  }

  async function loadRollingPrimaryContext(loopDef, options = {}) {
    const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
    const challengeContext = await findAvailableRatingSbcChallengeContext(set, loopDef.name, {
      force: options.force === true,
    });
    if (!challengeContext.challenge) {
      return { status: 'unavailable', reason: 'no available primary SBC challenge remains' };
    }
    const challenge = loopDef.dryRun
      ? challengeContext.challenge
      : await loadRatingSbcChallengeForSet(set, challengeContext.challenge, loopDef.name, {
          force: options.force === true,
        });
    if (!challenge) return { status: 'unavailable', reason: 'primary SBC challenge could not be loaded' };
    const activeLoopDef = applyRollingAutomaticUseFodderPolicy(
      materializeDynamicUpgradeChallengeLoopDef(loopDef, challenge),
      loopDef,
    );
    const model = parseRatingSbcChallenge(activeLoopDef, challenge);
    if (model.unsupported.length) {
      return {
        status: 'blocked',
        reason: `unsupported dynamic SBC requirement(s): ${model.unsupported.join(', ')}`,
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    const roles = eaPlayerGroupConstraints(model);
    const roleCount = roles.reduce((total, entry) => total + Number(entry.constraint.count || 0), 0);
    if (roleCount !== 1) {
      return {
        status: 'blocked',
        reason: `Rolling requires exactly one live Required Special slot, found ${roleCount}`,
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    return {
      status: 'ready',
      set,
      challenge,
      incompleteCount: challengeContext.incompleteCount,
      activeLoopDef,
      model,
    };
  }

  function rollingRecoveryDef(definition, parentLoopDef, options = {}) {
    if (!isPlainObject(definition)) return null;
    const result = inheritSbcFodderPolicy(cloneLoopDef(definition), parentLoopDef);
    const minRating = Number(options.minRating);
    const maxRating = Number(options.maxRating);
    result.runtimeSbcFodderPolicy = {
      ...(result.runtimeSbcFodderPolicy || {}),
      mode: 'rating-constrained',
      ratingSbcMaxCardRating: Number.isFinite(maxRating) && maxRating > 0
        ? maxRating
        : rollingProtectionRating(parentLoopDef),
    };
    result.dryRun = parentLoopDef.dryRun === true;
    result.autoSelectBelow90 = parentLoopDef.autoSelectBelow90 !== false;
    result.autoPickRatingThreshold = rollingProtectionRating(parentLoopDef);
    result.maxCompletions = 1;
    result.openRewardPacks = false;
    result.forceOpenRewardPacks = false;
    result.autoTotwUpgrade = false;
    result.autoFodderUpgrade = false;
    result.protectedItemIds = [...new Set((result.protectedItemIds || []).map(Number).filter(Boolean))];
    result.protectedDefinitionIds = [...new Set((result.protectedDefinitionIds || []).map(Number).filter(Boolean))];
    if (Number.isFinite(minRating) || Number.isFinite(maxRating)) {
      result.requirements = (result.requirements || []).map((requirement) => ({
        ...requirement,
        ...(Number.isFinite(minRating) ? { minRating } : {}),
        ...(Number.isFinite(maxRating) ? { maxRating } : {}),
      }));
    }
    if (options.inventoryFirst === true) {
      delete result.ratingSbcFill;
      result.inventoryFillFirst = true;
    }
    if (Array.isArray(options.priorityPiles) && options.priorityPiles.length) {
      result.priorityPiles = [...options.priorityPiles];
      result.ratingSbcFill = {
        ...(result.ratingSbcFill || {}),
        priorityPiles: [...options.priorityPiles],
      };
      result.requirements = (result.requirements || []).map((requirement) => ({
        ...requirement,
        priorityPiles: [...options.priorityPiles],
      }));
    }
    applyDisabledPiles(result);
    return result;
  }

  function rollingCapabilityAvailable(definition) {
    return isPlainObject(definition)
      && definition.activityResolved === true
      && hasResolvedSbcIdentity(definition);
  }

  function rollingProvisionsRequiredCount(loopDef = {}) {
    const definition = loopDef?.rollingProvisionsUpgrade;
    if (!rollingCapabilityAvailable(definition)) return 4;
    const count = Number(definition?.requirements?.[0]?.count);
    return Number.isInteger(count) && count > 0 ? count : 4;
  }

  function rollingRecoveryEntryRefs(runtime, predicate) {
    return (runtime.coordinator?.getLedger()?.classifiedEntries?.() || [])
      .filter(predicate)
      .map(({ item }) => liveItemRef(item, item?.pile || item?.ref?.pile));
  }

  function refreshRollingPendingUnassignedRefs(runtime) {
    runtime.pendingUnassignedRefs = rollingUniqueRefs(
      (runtime.coordinator?.getLedger()?.classifiedEntries?.() || [])
        .filter(({ item, pile }) => pile === 'unassigned' && item?.type === 'player')
        .map(({ item }) => liveItemRef(item, 'unassigned')),
    );
    return runtime.pendingUnassignedRefs;
  }

  function inspectRollingLiveUnassignedEntries(entries = [], options = {}) {
    const resolveLive = options.resolveLive || ((id) => findCachedItemById(id, ['unassigned']));
    const listPlayerPicks = options.listPlayerPicks
      || (() => eaPlayerPickAdapter().listUnassignedPlayerPicks());
    const liveIds = new Set();
    for (const { item } of entries || []) {
      const id = Number(item?.id || 0);
      if (!id) {
        return {
          ok: false,
          reason: 'an Unassigned item has no stable item ID',
          reasonCode: 'UNASSIGNED_RESUME_IDENTITY_UNAVAILABLE',
        };
      }
      const live = resolveLive(id);
      if (!live?.item || live.pileName !== 'unassigned' || Number(live.item.id || 0) !== id) {
        return {
          ok: false,
          reason: `Unassigned item #${id} changed before Rolling resume inspection`,
          reasonCode: 'UNASSIGNED_RESUME_IDENTITY_CHANGED',
        };
      }
      liveIds.add(id);
    }

    let playerPicks;
    try {
      playerPicks = listPlayerPicks() || [];
    } catch (error) {
      return {
        ok: false,
        reason: `pending Player Pick inspection failed: ${error?.message || error}`,
        reasonCode: 'UNASSIGNED_RESUME_PICK_INSPECTION_FAILED',
      };
    }
    const playerPickIds = new Set();
    for (const item of playerPicks) {
      const id = Number(item?.id || 0);
      if (!id || !liveIds.has(id)) {
        return {
          ok: false,
          reason: 'pending Player Pick identity does not match the reconciled Unassigned inventory',
          reasonCode: 'UNASSIGNED_RESUME_PICK_IDENTITY_CHANGED',
        };
      }
      playerPickIds.add(id);
    }
    return { ok: true, playerPickCount: playerPickIds.size, playerPickIds: [...playerPickIds] };
  }

  function rollingRecoveryProtection(runtime, additionalProtected = []) {
    return rollingRecoveryProtectionWithOptions(runtime, additionalProtected);
  }

  function rollingNonPrimaryPendingRefs(runtime) {
    const primaryRefs = runtime.primaryDuplicateRefs || [];
    return (runtime.pendingUnassignedRefs || []).filter((ref) => (
      !primaryRefs.some((primaryRef) => rollingItemMatchesRef(ref, primaryRef))
    ));
  }

  function rollingRecoveryProtectionWithOptions(runtime, additionalProtected = [], options = {}) {
    const pendingRefs = options.allowPrimaryDuplicates === true
      ? rollingNonPrimaryPendingRefs(runtime)
      : (runtime.pendingUnassignedRefs || []);
    return createRollingRecoveryProtection({
      ledger: runtime.coordinator?.getLedger(),
      protectedItems: [
        ...pendingRefs,
        ...additionalProtected,
      ],
      allowRequiredSpecial: options.allowRequiredSpecial === true,
    });
  }

  function rollingItemMatchesRef(item, ref) {
    const itemId = Number(item?.id || 0);
    const refId = Number(ref?.id || 0);
    if (refId) return itemId === refId;
    return Number(ref?.definitionId || 0) > 0
      && Number(item?.definitionId || 0) === Number(ref.definitionId);
  }

  function assertRollingRecoveryItems(loopDef, runtime, players = [], options = {}) {
    const protection = rollingRecoveryProtectionWithOptions(runtime, [
      ...(options.additionalProtected || []),
      ...(options.allowPrimaryDuplicates === true ? [] : (runtime.primaryDuplicateRefs || [])),
    ], {
      allowPrimaryDuplicates: options.allowPrimaryDuplicates === true,
      allowRequiredSpecial: options.allowRequiredSpecial === true,
    });
    const reserveRatings = options.allowProvisionsReserve === true
      ? new Set()
      : new Set(rollingProvisionsReserveRatings(loopDef));
    const allowedPrimaryDuplicateRefs = options.allowPrimaryDuplicates === true
      ? rollingUniqueRefs(options.allowedPrimaryDuplicateRefs || [])
      : [];
    const protectionRating = rollingProtectionRating(loopDef);
    const minRating = Number(options.minRating);
    const maxRating = Number(options.maxRating);
    const sourceErrors = rollingClubNonTotwSpecialSourceErrors(options.selection, loopDef);
    if (sourceErrors.length) {
      fail(`${loopDef.name}: recovery squad violated strict Club special protection: ${sourceErrors.join(', ')}`);
    }
    for (const item of players || []) {
      const allowedPrimaryDuplicate = allowedPrimaryDuplicateRefs.some((ref) => (
        rollingItemMatchesRef(item, ref)
          || (Number(item?.definitionId || 0) > 0
            && Number(item.definitionId) === Number(ref?.definitionId || 0))
      ));
      if (options.allowRequiredSpecial !== true && (
        rollingLiveRequiredSpecial(item, runtime.primaryContext?.model)
          || rollingSnapshotRequiredSpecial(item, runtime.primaryContext?.activeLoopDef || loopDef)
      )) {
        fail(`${loopDef.name}: recovery squad attempted to consume a Required Special card`);
      }
      if (protection.protectedItems.some((ref) => rollingItemMatchesRef(item, ref))) {
        fail(`${loopDef.name}: recovery squad attempted to consume a protected card`);
      }
      if (reserveRatings.has(Number(item?.rating || 0)) && !allowedPrimaryDuplicate) {
        fail(`${loopDef.name}: recovery squad attempted to consume a reserved ${Number(item.rating)} card`);
      }
      if (Number(item?.rating || 0) > protectionRating) {
        fail(`${loopDef.name}: recovery squad card rating ${Number(item.rating)} exceeds Protection rating ${protectionRating}`);
      }
      if (Number.isFinite(minRating) && Number(item?.rating || 0) < minRating) {
        fail(`${loopDef.name}: recovery squad card rating ${Number(item.rating)} is below the required minimum ${minRating}`);
      }
      if (Number.isFinite(maxRating) && Number(item?.rating || 0) > maxRating) {
        fail(`${loopDef.name}: recovery squad card rating ${Number(item.rating)} exceeds the recovery maximum ${maxRating}`);
      }
      const reasons = rollingBaseProtectionReasons(
        item,
        runtime.primaryContext?.activeLoopDef || loopDef,
        liveItemRef(item).pile,
      );
      if (reasons.length) {
        fail(`${loopDef.name}: recovery squad contains protected item ${itemDisplayName(item)} (${reasons.join(',')})`);
      }
      if (options.allowSpecial !== true && isSbcSpecialItem(item)) {
        fail(`${loopDef.name}: recovery squad attempted to consume a special card`);
      }
    }
    return true;
  }

  async function reconcileRollingRuntime(runtime, reason) {
    const reconciliation = await runtime.coordinator.reconcile(reason, { refreshUnassigned: true });
    if (!reconciliation.ok) {
      return { status: 'blocked', reason: reconciliation.reason, reasonCode: 'INVENTORY_RECONCILIATION_FAILED' };
    }
    return { status: 'ready', inventoryDelta: runtime.lastMutation?.delta || null };
  }

  async function saveRollingProvisionalClubSquad(challenge, players, runtimeAccess, label, playerPreparation = null) {
    if (!runtimeAccess?.refreshedClubPlayers && playerPreparation?.changed !== true) return;
    await saveChallengeSquad(challenge, players, label);
  }

  async function submitRollingRequirementRecovery(loopDef, runtime, definition, options = {}) {
    const priorityPiles = options.priorityPiles || ['unassigned', 'storage', 'transfer', 'club'];
    const recoveryDef = rollingRecoveryDef(definition, loopDef, {
      inventoryFirst: true,
      priorityPiles,
      minRating: options.minRating,
      maxRating: options.maxRating,
    });
    if (!rollingCapabilityAvailable(recoveryDef)) {
      return { status: 'unavailable', reason: `${definition?.name || 'recovery SBC'} capability is unavailable` };
    }

    await refreshInventoryCaches(`${loopDef.name} ${recoveryDef.name} recovery selection`, {
      includePacks: false,
      quiet: true,
    });
    await runtime.coordinator.reconcile(`${recoveryDef.name} pre-selection`, { refreshUnassigned: true });
    const additionalProtected = [
      ...(options.additionalProtected || []),
      ...(runtime.primaryDuplicateRefs || []),
    ];
    const protection = rollingRecoveryProtection(runtime, additionalProtected);
    const protectedDuplicateRefs = options.protectedDuplicateRefs || [];
    const reserveRefs = options.protectProvisionsReserve === true
      ? rollingRecoveryEntryRefs(runtime, ({ classification }) => classification.provisionsReserve === true)
      : [];
    const hardProtectedIds = [...new Set([
      ...protection.protectedItemIds,
      ...protectedDuplicateRefs.map((ref) => Number(ref?.id || 0)),
      ...reserveRefs.map((ref) => Number(ref.id || 0)),
    ].filter(Boolean))];
    const softProtectedIds = protection.softProtectedItems.map((ref) => Number(ref.id || 0)).filter(Boolean);
    const buildDef = (includeSoftProtection) => ({
      ...recoveryDef,
      protectedItemIds: [...new Set([
        ...(recoveryDef.protectedItemIds || []),
        ...hardProtectedIds,
        ...(includeSoftProtection ? softProtectedIds : []),
      ])],
      protectedDefinitionIds: [...new Set([
        ...(recoveryDef.protectedDefinitionIds || []),
        ...protection.protectedDefinitionIds,
      ])],
    });

    let activeDef = buildDef(options.softProtectClubSpecial !== false);
    let selection = selectInventoryPlayers(activeDef, priorityPiles, {
      preferredSignalRefs: options.preferredSignalRefs || [],
    });
    if (!selection.ok && options.softProtectClubSpecial !== false && softProtectedIds.length) {
      activeDef = buildDef(false);
      selection = selectInventoryPlayers(activeDef, priorityPiles, {
        preferredSignalRefs: options.preferredSignalRefs || [],
      });
      if (selection.ok) {
        log(`${loopDef.name}: ${activeDef.name} uses Club Other Special only after ordinary recovery material was insufficient`);
      }
    }
    if (!selection.ok) {
      logSelectionDiagnostics(`${loopDef.name} ${activeDef.name}`, selection, priorityPiles);
      return {
        status: 'unavailable',
        reason: `${activeDef.name} has insufficient eligible recovery material`,
        reasonCode: 'RECOVERY_MATERIAL_SHORTAGE',
      };
    }
    if (options.requirePreferredSignal === true
      && options.preferredSignalRefs?.length
      && !selectionConsumesSignalRefs(selection, options.preferredSignalRefs)) {
      log(`${loopDef.name}: ${activeDef.name} did not consume a required recovery duplicate signal; preserving the primary 10x85+ fodder`);
      return {
        status: 'unavailable',
        reason: `${activeDef.name} could not consume the recovery duplicate signal`,
        reasonCode: 'RECOVERY_DUPLICATE_SIGNAL_NOT_SELECTED',
      };
    }
    if (options.requirePreferredItem === true
      && options.preferredSignalRefs?.length
      && !rollingSelectionConsumesItemOrSignalRef(selection, options.preferredSignalRefs)) {
      log(`${loopDef.name}: ${activeDef.name} did not consume a required Storage maintenance item`);
      return {
        status: 'unavailable',
        reason: `${activeDef.name} could not consume the required Storage item`,
        reasonCode: 'RECOVERY_STORAGE_ITEM_NOT_SELECTED',
      };
    }
    const selectedStorageItems = rollingSelectionStorageConsumption(runtime, selection);
    if (typeof options.validateSelection === 'function') {
      const selectionValidation = await options.validateSelection({
        selection,
        storageItemsConsumed: selectedStorageItems,
      });
      if (selectionValidation?.ok === false) {
        log(`${loopDef.name}: ${activeDef.name} selection rejected before submit (${selectionValidation.reasonCode || 'selection validation failed'}): ${selectionValidation.reason || 'insufficient recovery effect'}`);
        return {
          status: 'unavailable',
          reason: selectionValidation.reason || `${activeDef.name} selection did not release enough Storage capacity`,
          reasonCode: selectionValidation.reasonCode || 'RECOVERY_SELECTION_INVALID',
          details: selectionValidation.details || null,
        };
      }
    }
    logInventorySelection(`${loopDef.name} ${activeDef.name}`, selection);

    const itemRefs = (selection.selected || []).map((item) => liveItemRef(item));
    if (!activeDef.dryRun) {
      const validation = await runtime.coordinator.validateBeforeSubmit(itemRefs, {
        label: activeDef.name,
        reason: `${activeDef.name} pre-submit`,
      });
      if (!validation.ok) {
        return { status: 'blocked', reason: validation.reason, reasonCode: 'INVENTORY_VALIDATION_FAILED' };
      }
    }
    const validators = [({ players, squadPlan }) => assertRollingRecoveryItems(loopDef, runtime, players, {
      additionalProtected,
      allowProvisionsReserve: options.allowProvisionsReserve === true,
      allowSpecial: options.allowSpecial === true,
      minRating: options.minRating,
      maxRating: options.maxRating,
      selection: squadPlan?.selection || selection,
    })];
    runtime.lastMutation = null;
    const attempt = await submitInventorySbcAttempt(activeDef, selection, {
      label: `${loopDef.name} -> ${activeDef.name}`,
      dryRun: activeDef.dryRun,
      handleReward: false,
      preSaveValidators: validators,
      postSaveValidators: validators,
      onResult: async (submissionResult) => {
        runtime.lastMutation = await runtime.coordinator.recordSubmission(submissionResult, { primary: false });
      },
    });
    const submission = attempt.result;
    if (submission.status === 'planned') return { ...submission, status: 'planned' };
    if (!submission.submitted) {
      return {
        status: submission.status === 'unavailable' ? 'unavailable' : 'blocked',
        reason: submission.reason || `${activeDef.name} was not submitted`,
        reasonCode: 'RECOVERY_SUBMISSION_BLOCKED',
      };
    }
    if (!runtime.lastMutation) {
      runtime.lastMutation = await runtime.coordinator.recordSubmission(submission, { primary: false });
    }
    const routingRelease = releaseRollingRoutingItemsAfterConsumption(
      runtime.openRouting,
      submission.consumedItemRefs || itemRefs,
    );
    runtime.openRouting = routingRelease.routing;
    refreshRollingPendingUnassignedRefs(runtime);
    if (routingRelease.removedItemCount) {
      log(`${loopDef.name}: released ${routingRelease.removedItemCount} confirmed recovery-consumed item(s) from opened-item routing ownership`);
    }
    const recoveryAction = activeDef.dynamicSbcFamily === 'provisions-upgrade'
      ? 'provisions'
      : activeDef.dynamicSbcFamily === '5x80-upgrade' ? 'goldSink' : null;
    if (recoveryAction) {
      recordRollingRecapRecovery(recoveryAction, {
        duplicatesConsumed: rollingDuplicatePlayerCount(selection),
      });
    }
    return {
      ...submission,
      status: 'submitted',
      recoveryDef: activeDef,
      inventoryDelta: runtime.lastMutation?.delta || null,
      consumedSignalRefs: rollingSelectionConsumedSignalRefs(
        selection,
        options.preferredSignalRefs || [],
      ),
    };
  }

  async function loadRollingRatingRecoveryContext(definition) {
    const set = await findSbcSetForLoopDef(definition, definition.name);
    const challengeContext = await findAvailableRatingSbcChallengeContext(set, definition.name, { force: true });
    if (!challengeContext.challenge) {
      return { status: 'unavailable', reason: `no available ${definition.name} challenge remains` };
    }
    const challenge = definition.dryRun
      ? challengeContext.challenge
      : await loadRatingSbcChallenge(challengeContext.challenge, definition.name, { force: true });
    if (!challenge) return { status: 'unavailable', reason: `${definition.name} challenge could not be loaded` };
    const activeLoopDef = materializeDynamicUpgradeChallengeLoopDef(definition, challenge);
    const model = parseRatingSbcChallenge(activeLoopDef, challenge);
    if (model.unsupported.length || !model.targetRating || !model.requiredPlayerCount) {
      return {
        status: 'blocked',
        reason: `unsupported ${definition.name} requirement(s): ${model.unsupported.join(', ') || 'rating/player count unavailable'}`,
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    return { status: 'ready', set, challenge, activeLoopDef, model };
  }

  function rollingBackgroundSubmitInventoryDiagnostic(runtime, players = []) {
    const ledger = runtime?.coordinator?.getLedger?.();
    const refs = (players || []).filter(Boolean).map((item) => liveItemRef(item));
    return summarizeBackgroundSubmitItems(refs, {
      resolveItem: (ref) => ledger?.resolveItem?.(ref) || null,
      ledgerSummary: ledger?.summary?.() || {},
    });
  }

  async function submitRollingRatingRecovery(loopDef, runtime, definition, options = {}) {
    const recoveryDef = rollingRecoveryDef(definition, loopDef, {
      priorityPiles: options.priorityPiles,
    });
    if (!rollingCapabilityAvailable(recoveryDef)) {
      return { status: 'unavailable', reason: `${definition?.name || 'rating recovery'} capability is unavailable` };
    }
    const opened = await loadRollingRatingRecoveryContext(recoveryDef);
    if (opened.status !== 'ready') return opened;
    await runtime.coordinator.reconcile(`${recoveryDef.name} pre-selection`, { refreshUnassigned: true });
    const ledger = runtime.coordinator.getLedger();
    const allowPrimaryDuplicates = options.allowPrimaryDuplicates === true;
    const consumablePrimaryRefs = allowPrimaryDuplicates
      ? rollingUniqueRefs(runtime.primaryDuplicateRefs || []).filter((ref) => {
          const item = ledger.resolveItem(ref);
          return item && String(item.pile || item.ref?.pile || '') === 'unassigned';
        })
      : [];
    const relaxationOrder = allowPrimaryDuplicates
      ? rollingPrimaryDuplicateRelaxationOrder({
          ledger,
          primaryDuplicateRefs: consumablePrimaryRefs,
        })
      : [];
    let relaxedPrimaryRefs = [];
    let selectionPolicy = null;
    let fill = null;
    while (true) {
      const primaryRecoveryPolicy = createRollingPrimarySelectionPolicy({
        ledger,
        model: { constraints: [] },
        protectionRating: rollingProtectionRating(loopDef),
        reserveRatings: false,
        primaryDuplicateRefs: consumablePrimaryRefs,
        includeUnroutedUnassignedDuplicates: false,
        relaxedPrimaryDuplicateRefs: relaxedPrimaryRefs,
        isTransientSubmissionAllowed: (item) => (
          isRollingTransientSubmissionAllowed(item, loopDef)
        ),
      });
      selectionPolicy = createRollingRatingRecoverySelectionPolicy({
        ledger,
        protectionRating: rollingProtectionRating(loopDef),
        maxOrdinaryRating: options.maxOrdinaryRating,
        reserveRatings: rollingProvisionsReserveRatings(loopDef),
        requiredItems: [
          ...(options.requiredItems || []),
          ...primaryRecoveryPolicy.requiredItems,
        ],
        preferredItems: [
          ...(options.preferredItems || []),
          ...primaryRecoveryPolicy.preferredItems,
        ],
        protectedItems: [
          ...(allowPrimaryDuplicates
            ? rollingNonPrimaryPendingRefs(runtime)
            : [
                ...(runtime.primaryDuplicateRefs || []),
                ...(runtime.pendingUnassignedRefs || []),
              ]),
          ...(options.additionalProtected || []),
          ...relaxedPrimaryRefs,
        ],
      });
      fill = await fillSbcSquadRatingOptimized(opened.activeLoopDef, {
        set: opened.set,
        challenge: opened.challenge,
        background: true,
      }, {
        dryRun: recoveryDef.dryRun,
        selectionPolicy,
        skipInventoryRefresh: relaxedPrimaryRefs.length > 0,
      });
      if (!fill.ok || !allowPrimaryDuplicates
        || Number(fill.optimizedRating || 0) <= Number(fill.model?.targetRating || 0)) break;
      const nextRef = relaxationOrder[relaxedPrimaryRefs.length];
      if (!nextRef) break;
      relaxedPrimaryRefs.push(nextRef);
      log(`${loopDef.name}: ${recoveryDef.name} rating ${fill.optimizedRating} exceeds target ${fill.model?.targetRating || '?'}; deferring primary duplicate #${nextRef.id || nextRef.definitionId}`);
    }
    if (!fill.ok) {
      const code = fill.reasonCode || fill.missing?.code || 'RECOVERY_MATERIAL_SHORTAGE';
      if (code === 'REQUIRED_ITEM_UNAVAILABLE') {
        const requiredDiagnostics = fill.candidates?.requiredItemDiagnostics || [];
        const unavailable = requiredDiagnostics.filter((entry) => entry?.candidateAfterPolicy !== true);
        log(`${loopDef.name}: ${recoveryDef.name} required item diagnostic summary: required:${requiredDiagnostics.length}, unavailable:${unavailable.length}, candidate definitions:${fill.candidates?.entries?.length || 0}`);
        unavailable.slice(0, 16).forEach((entry, index) => {
          log(`${loopDef.name}: ${recoveryDef.name} required item diagnostic ${index + 1}/${unavailable.length}: ${diagnosticJson(entry)}`);
        });
        if (unavailable.length > 16) {
          log(`${loopDef.name}: ${recoveryDef.name} required item diagnostics truncated: ${unavailable.length - 16} more item(s)`);
        }
      }
      return {
        status: 'blocked',
        reason: fill.reason || `${recoveryDef.name} squad is infeasible`,
        reasonCode: code,
        recoverableByProvisions: [
          'PLAYER_COUNT_SHORTAGE',
          'SQUAD_RATING_SHORTAGE',
          'RESERVED_FODDER_BLOCKED',
        ].includes(code),
      };
    }
    if (allowPrimaryDuplicates
      && Number(fill.optimizedRating || 0) > Number(fill.model?.targetRating || 0)) {
      return {
        status: 'blocked',
        reason: `${recoveryDef.name} cannot consume the pending Unassigned duplicates without exceeding target rating ${fill.model?.targetRating || '?'}`,
        reasonCode: 'SQUAD_RATING_EXCESS',
      };
    }
    const consumedPrimaryRefs = rollingSelectionConsumedPrimaryRefs(
      fill.selection,
      consumablePrimaryRefs,
    );
    const storageItemsConsumed = rollingSelectionStorageConsumption(runtime, fill.selection);
    if (typeof options.validateSelection === 'function') {
      const selectionValidation = await options.validateSelection({
        selection: fill.selection,
        storageItemsConsumed,
        consumedPrimaryRefs,
      });
      if (selectionValidation?.ok === false) {
        log(`${loopDef.name}: ${recoveryDef.name} rating selection rejected before submit (${selectionValidation.reasonCode || 'selection validation failed'}): ${selectionValidation.reason || 'insufficient recovery effect'}`);
        return {
          status: 'unavailable',
          reason: selectionValidation.reason || `${recoveryDef.name} selection did not release enough Storage capacity`,
          reasonCode: selectionValidation.reasonCode || 'RECOVERY_SELECTION_INVALID',
          details: selectionValidation.details || null,
        };
      }
    }
    if (recoveryDef.dryRun) {
      return { status: 'planned', reason: `dry-run ${recoveryDef.name} squad plan complete` };
    }
    if (fill.fillResult?.submitReady !== true) {
      return { status: 'blocked', reason: `${recoveryDef.name} squad is not submit ready` };
    }

    const players = fill.inspection?.items || fill.selection?.selected || [];
    const itemRefs = players.map((item) => liveItemRef(item));
    const ledgerValidation = await runtime.coordinator.validateBeforeSubmit(itemRefs, {
      label: recoveryDef.name,
      reason: `${recoveryDef.name} pre-submit`,
    });
    if (!ledgerValidation.ok) {
      return { status: 'blocked', reason: ledgerValidation.reason, reasonCode: 'INVENTORY_VALIDATION_FAILED' };
    }
    let backgroundSubmission = null;
    runtime.lastMutation = null;
    const submission = await submitSbcAttempt({
      label: `${loopDef.name} -> ${recoveryDef.name}`,
      challengeProvider: async () => ({
        set: opened.set,
        challenge: opened.challenge,
        background: true,
      }),
      squadProvider: createExistingSquadProvider({
        getPlayers: async () => players,
        itemRef: liveItemRef,
        selection: fill.selection,
        source: 'rolling-recovery-rating-squad',
      }),
      prepareRuntimeAccess: prepareFsuRuntimeAccess,
      preparePlayers: (context) => prepareRollingUntradeableDuplicateSwaps(context, runtime),
      saveSquad: async ({ challenge, players: refreshedPlayers, runtimeAccess, playerPreparation }) => {
        await saveRollingProvisionalClubSquad(
          challenge,
          refreshedPlayers,
          runtimeAccess,
          `${recoveryDef.name} provisional Club refresh`,
          playerPreparation,
        );
      },
      preSaveValidators: [({ players: validatedPlayers, squadPlan }) => {
        assertRollingRecoveryItems(loopDef, runtime, validatedPlayers, {
          allowSpecial: true,
          allowPrimaryDuplicates,
          allowedPrimaryDuplicateRefs: consumedPrimaryRefs,
          selection: squadPlan?.selection || fill.selection,
        });
        const validation = validateRatingSbcModelAgainstItems(
          fill.model,
          validatedPlayers,
          opened.challenge,
          { allowOtherSpecialAsOrdinary: true },
        );
        if (!validation.ok) {
          fail(`${recoveryDef.name}: final recovery squad failed dynamic validation: ${validation.errors.join(', ')}`);
        }
        return true;
      }],
      isSubmitReady: async () => fill.fillResult?.submitReady === true,
      submitTransport: async (context) => {
        backgroundSubmission = await submitRatingSbcInBackground(
          context.set,
          context.challenge,
          recoveryDef.name,
          {
            players: context.players || players,
            allowItemViolationOverride: true,
            allowKnownRewardFallback: Number(opened.activeLoopDef.dynamicChallengeCount || 1) <= 1,
            failureInventoryDiagnostic: ({ players: attemptedPlayers }) => (
              rollingBackgroundSubmitInventoryDiagnostic(runtime, attemptedPlayers)
            ),
          },
        );
        return { submitted: true, rewardPackId: backgroundSubmission.rewardPackId };
      },
      runCommittedSubmit: runCommittedSbcSubmit,
      onResult: async (submissionResult) => {
        runtime.lastMutation = await runtime.coordinator.recordSubmission(submissionResult, { primary: false });
      },
      afterSubmit: async ({ players: submittedPlayers, savedPlayers, squadPlan }) => {
        await finalizeSubmittedInventorySelection(
          squadPlan?.selection || fill.selection,
          recoveryDef.name,
          savedPlayers?.length ? savedPlayers : submittedPlayers,
        );
      },
    });
    if (submission.submitted && !runtime.lastMutation) {
      runtime.lastMutation = await runtime.coordinator.recordSubmission(submission, { primary: false });
    }
    if (submission.submitted) {
      if (consumedPrimaryRefs.length) {
        runtime.primaryDuplicateRefs = (runtime.primaryDuplicateRefs || []).filter((ref) => (
          !consumedPrimaryRefs.some((consumed) => rollingItemMatchesRef(ref, consumed))
        ));
        const released = releaseRollingRoutingItemsAfterConsumption(
          runtime.openRouting,
          consumedPrimaryRefs,
        );
        runtime.openRouting = released.routing;
        log(`${loopDef.name}: ${recoveryDef.name} consumed ${consumedPrimaryRefs.length} pending Unassigned duplicate(s); ${runtime.primaryDuplicateRefs.length} remain reserved for the primary SBC`);
      }
      refreshRollingPendingUnassignedRefs(runtime);
      recordRollingRecapRecovery('totw', {
        duplicatesConsumed: rollingDuplicatePlayerCount(players),
      });
    }
    return {
      ...submission,
      status: submission.submitted ? 'submitted' : submission.status,
      inventoryDelta: runtime.lastMutation?.delta || null,
      details: {
        rewardObserved: backgroundSubmission?.rewardObserved === true,
        storageItemsConsumed,
        consumedPrimaryDuplicates: consumedPrimaryRefs.length,
      },
    };
  }

  async function openRollingRecoveryReward(loopDef, runtime, definition, pack, options = {}) {
    const routeContext = {
      primaryContext: runtime.primaryContext,
      model: runtime.primaryContext?.model,
      rewardLabel: `${loopDef.name} -> ${definition.name} reward`,
      assumeTotwReward: options.assumeTotwReward === true,
      openRouting: null,
    };
    const receipt = await openPack(pack, routeContext.rewardLabel, {
      dryRun: loopDef.dryRun === true,
      allowGone: true,
      allowPendingItems: true,
      returnBlockedReceipt: true,
      preOpenUnassignedOptions: { returnBlockedResult: true },
      assumeSpecialPlayers: options.assumeTotwReward === true,
      retryCodes: ['471', '500'],
      resolveRetryPack: () => findRewardPack(definition, null, {
        attempts: 2,
        delayMs: 1200,
        fallbackPackMatcher: options.fallbackPackMatcher,
        repositoryOnly: true,
      }),
      openedItemPolicy: createRollingPrimaryPackPolicy(loopDef, routeContext),
      settleReceipt: async (openedReceipt) => {
        runtime.lastMutation = await runtime.coordinator.recordPackReceipt(openedReceipt, { reconcile: true });
      },
    });
    if (!receipt) return { status: 'unavailable', reason: `${definition.name} reward pack is unavailable` };
    if (receipt.status === 'planned') return receipt;
    if (receipt.status !== 'opened') return receipt;
    runtime.openRouting = routeContext.openRouting;
    if (options.captureRecoveryDuplicates === true) {
      const capturedRefs = (routeContext.openRouting?.entries || [])
        .filter(({ item, classification }) => (
          classification?.duplicate === true
            && rollingOrdinaryGoldDuplicate(item, runtime.primaryContext?.activeLoopDef || loopDef)
        ))
        .map(({ item }) => liveItemRef(item, 'unassigned'));
      runtime.recoveryDuplicateRefs = rollingUniqueRefs([
        ...(runtime.recoveryDuplicateRefs || []),
        ...capturedRefs,
      ]);
      log(`${loopDef.name}: captured ${capturedRefs.length} ${definition.name} duplicate Gold signal(s) for the Rare Gold Pick -> 5x80 recovery chain`);
    }
    return { ...receipt, status: 'opened', inventoryDelta: runtime.lastMutation?.delta || null };
  }

  function captureRollingInventoryIdentityState(runtime, refs = [], stage = 'unknown') {
    const retryRefs = refs.map((item) => liveItemRef(item, item?.pile || item?.ref?.pile || 'unassigned'));
    const piles = {
      unassigned: getPileItemsByName('unassigned'),
      storage: getPileItemsByName('storage'),
      transfer: getPileItemsByName('transfer'),
      club: getPileItemsByName('club'),
    };
    const ledger = runtime.coordinator?.getLedger?.();
    const ledgerEntries = ledger?.classifiedEntries?.() || [];
    const ledgerMatches = retryRefs.map((ref) => ({
      ref,
      entries: ledgerEntries
        .filter(({ item }) => rollingItemMatchesRef(item, ref))
        .map(({ item, pile, classification }) => ({
          item: diagnoseRollingInventoryRefs([item], { [pile]: [item] })[0],
          pile,
          classification,
        })),
    }));
    return {
      stage,
      retryRefs,
      matches: diagnoseRollingInventoryRefs(retryRefs, piles),
      ledgerMatches,
      unassignedState: (() => {
        try { return eaInventoryAdapter().unassignedState(); } catch (error) { return { error: error?.message || String(error) }; }
      })(),
      pileCounts: Object.fromEntries(Object.entries(piles).map(([pile, items]) => [pile, items.length])),
      ledgerSummary: ledger?.summary?.() || null,
    };
  }

  function logRollingInventoryIdentityState(loopDef, runtime, refs, stage) {
    const diagnostics = captureRollingInventoryIdentityState(runtime, refs, stage);
    log(`${loopDef.name}: inventory identity ${diagnosticJson(diagnostics)}`);
    return diagnostics;
  }

  async function retryRollingProtectedStorage(loopDef, runtime) {
    const routing = runtime.openRouting;
    if (!routing || routing.status !== 'blocked') return { status: 'ready' };
    if (routing.reasonCode !== 'PROTECTED_STORAGE_BLOCKED') {
      return { status: 'blocked', reason: routing.reason, reasonCode: routing.reasonCode };
    }
    const primaryRefs = preserveRollingPrimaryDuplicateRefs(runtime, routing);
    if (!primaryRefs.captured && (routing.reservedItems || []).length) {
      return {
        status: 'blocked',
        reason: 'materialized primary duplicate context could not be preserved before protected Storage recovery',
        reasonCode: 'PRIMARY_DUPLICATE_CONTEXT_LOST',
      };
    }
    const retryRefs = (routing.storageItems || []).map((item) => liveItemRef(item, item?.pile || 'unassigned'));
    const logRetryState = (stage) => {
      logRollingInventoryIdentityState(loopDef, runtime, retryRefs, `protected-storage-retry:${stage}`);
    };
    logRetryState('before-refresh');
    await refreshInventoryCaches(`${loopDef.name} protected Storage retry`, {
      includePacks: false,
      quiet: true,
      onStage: (stage) => logRetryState(`after-${stage}`),
    });
    logRetryState('after-refresh');
    const resolved = (routing.storageItems || []).map((item) => ({
      original: item,
      live: findCachedItemById(Number(item?.id || 0), ['unassigned', 'storage', 'club', 'transfer']),
    }));
    if (resolved.some(({ live }) => !live)) {
      const missingRefs = resolved
        .filter(({ live }) => !live)
        .map(({ original }) => liveItemRef(original, original?.pile || 'unassigned'));
      const details = {
        missingRefs,
        retryState: captureRollingInventoryIdentityState(runtime, retryRefs, 'protected-storage-retry:missing-after-refresh'),
      };
      log(`${loopDef.name}: protected Storage retry could not resolve ${missingRefs.length} deferred item(s): ${diagnosticJson(details)}`);
      return {
        status: 'blocked',
        reason: `protected/reserved opened item changed before Storage retry (${missingRefs.map((ref) => `#${ref.id || ref.definitionId}`).join(', ')})`,
        reasonCode: 'OPENED_ITEM_ROUTING_PENDING',
        details,
      };
    }
    const pending = resolved
      .filter(({ live }) => live.pileName === 'unassigned')
      .map(({ live }) => live.item);
    const unexpected = resolved.filter(({ live }) => !['unassigned', 'storage', 'club'].includes(live.pileName));
    if (unexpected.length) {
      return {
        status: 'blocked',
        reason: `${unexpected.length} protected/reserved opened item(s) moved to an unexpected pile before Storage retry`,
        reasonCode: 'OPENED_ITEM_ROUTING_PENDING',
      };
    }
    const storageFree = storageSpaceLeft();
    if (pending.length && (storageFree === null || pending.length > storageFree)) {
      return {
        status: 'blocked',
        reason: `SBC storage has ${storageFree === null ? 'an unknown number of' : storageFree} free slot(s), but ${pending.length} protected/reserved item(s) still require storage`,
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
        details: { storageFree, storageRequired: pending.length },
      };
    }
    if (pending.length) await moveItems(pending, inventoryPile('storage'), true);
    recordRollingRecapDuplicateRoute('storage', pending.length);
    const primaryRelease = releaseRollingPrimaryDuplicateRefs(
      runtime.primaryDuplicateRefs,
      routing.deferredPrimaryRefs,
    );
    runtime.primaryDuplicateRefs = primaryRelease.refs;
    const deferredPrimaryRefs = rollingUniqueRefs(routing.deferredPrimaryRefs || []);
    runtime.openRouting = {
      ...routing,
      status: 'ready',
      reason: null,
      reasonCode: null,
      pendingItems: [],
      reservedItems: (routing.reservedItems || []).filter((item) => (
        !deferredPrimaryRefs.some((ref) => rollingItemMatchesRef(item, ref))
      )),
      deferredPrimaryRefs: [],
    };
    const reconciled = await reconcileRollingRuntime(runtime, `${loopDef.name} protected Storage retry`);
    if (reconciled.status !== 'ready') return reconciled;
    refreshRollingPendingUnassignedRefs(runtime);
    log(`${loopDef.name}: resolved ${resolved.length} protected/reserved opened item(s) after recovery; moved ${pending.length} to Storage${primaryRelease.releasedRefs.length ? `; released ${primaryRelease.releasedRefs.length} deferred primary duplicate(s) from the mandatory squad` : ''}`);
    return { status: 'ready', inventoryDelta: reconciled.inventoryDelta };
  }

  function rollingOrdinaryGoldDuplicate(item, loopDef) {
    return isDuplicate(item)
      && isPlayer(item)
      && isGold(item)
      && !isSbcSpecialItem(item)
      && !rollingProvisionsReserveRatings(loopDef).includes(Number(item?.rating || 0))
      && Number(item?.rating || 0) <= rollingProtectionRating(loopDef)
      && rollingBaseProtectionReasons(item, loopDef).length === 0;
  }

  function rollingSignalKey(ref) {
    const id = Number(ref?.id || 0);
    if (id) return `id:${id}`;
    const definitionId = Number(ref?.definitionId || 0);
    return definitionId ? `definition:${definitionId}` : null;
  }

  function rollingUniqueRefs(refs = []) {
    const seen = new Set();
    return (refs || []).filter((ref) => {
      const key = rollingSignalKey(ref);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function preserveRollingPrimaryDuplicateRefs(context, routing = {}, options = {}) {
    const status = String(routing?.status || '').toLowerCase();
    const reasonCode = String(routing?.reasonCode || '').toUpperCase();
    const unresolvedCount = Number(routing?.counts?.unresolved);
    const recoverableStorageBlock = status === 'blocked'
      && reasonCode === 'PROTECTED_STORAGE_BLOCKED'
      && Number.isFinite(unresolvedCount)
      && unresolvedCount === 0;
    if (status !== 'ready' && !recoverableStorageBlock) {
      return { captured: false, count: 0, refs: [] };
    }

    const storageIds = new Set((options.storageMoved === true ? routing.storageItems || [] : [])
      .map((item) => Number(item?.id || 0))
      .filter(Boolean));
    const refs = rollingUniqueRefs((routing.reservedItems || []).map((item) => liveItemRef(
      item,
      storageIds.has(Number(item?.id || 0)) ? 'storage' : 'unassigned',
    )));
    context.primaryDuplicateRefs = options.replace === true
      ? refs
      : rollingUniqueRefs([...(context.primaryDuplicateRefs || []), ...refs]);
    return {
      captured: true,
      count: refs.length,
      refs: context.primaryDuplicateRefs,
      recoveredFromBlockedStorage: recoverableStorageBlock,
    };
  }

  function rollingSelectionConsumedSignalRefs(selection, expectedRefs = []) {
    return rollingUniqueRefs((selection?.entries || [])
      .filter((entry) => entry?.signal && (entry.pileName === 'unassigned' || entry.pileName === 'transfer'))
      .map((entry) => entry.signal)
      .filter((signal) => expectedRefs.some((ref) => rollingItemMatchesRef(signal, ref))));
  }

  function rollingSelectionConsumedPrimaryRefs(selection, expectedRefs = []) {
    const entries = selection?.entries || [];
    return rollingUniqueRefs(expectedRefs.filter((ref) => entries.some((entry) => (
      rollingItemMatchesRef(entry?.signal, ref) || rollingItemMatchesRef(entry?.item, ref)
    ))));
  }

  function rollingSelectionConsumesItemOrSignalRef(selection, expectedRefs = []) {
    return (selection?.entries || []).some((entry) => expectedRefs.some((ref) => (
      rollingItemMatchesRef(entry?.item, ref) || rollingItemMatchesRef(entry?.signal, ref)
    )));
  }

  function rollingSelectionStorageConsumption(runtime, selection) {
    const ledger = runtime.coordinator?.getLedger?.();
    const ids = new Set();
    for (const entry of selection?.entries || []) {
      const item = entry?.item;
      const record = item ? ledger?.resolveItem?.(liveItemRef(item)) : null;
      if (record && String(record.pile || record.ref?.pile || '') === 'storage') {
        ids.add(Number(record.id || record.ref?.id || 0));
      }
    }
    return ids.size;
  }

  function rollingPendingStorageRoutingState(runtime, options = {}) {
    const consumedPendingRefs = rollingUniqueRefs(options.consumedPendingRefs || []);
    const pendingRefs = [];
    for (const item of runtime.openRouting?.storageItems || []) {
      if (consumedPendingRefs.some((ref) => rollingItemMatchesRef(item, ref))) continue;
      const id = Number(item?.id || 0);
      if (!id) {
        return {
          ok: false,
          reason: 'a pending Storage-routed item has no stable item ID',
          reasonCode: 'OPENED_ITEM_ROUTING_IDENTITY_UNAVAILABLE',
        };
      }
      const live = findCachedItemById(id, ['unassigned', 'storage', 'club', 'transfer']);
      if (!live) {
        return {
          ok: false,
          reason: `pending Storage-routed item #${id} is no longer present in live inventory`,
          reasonCode: 'OPENED_ITEM_ROUTING_PENDING',
        };
      }
      if (live.pileName === 'unassigned') pendingRefs.push(liveItemRef(live.item, 'unassigned'));
    }
    return { ok: true, pendingRefs: rollingUniqueRefs(pendingRefs) };
  }

  function validateRollingEmergencyProvisionsSelection(runtime, storageItemsConsumed, options = {}) {
    const routing = rollingPendingStorageRoutingState(runtime, options);
    if (!routing.ok) return routing;
    const currentFree = runtime.coordinator?.getLedger?.()?.summary?.()?.capacities?.storage?.free;
    return validateStorageRecoveryHeadroom({
      currentFree,
      pendingStorageItems: routing.pendingRefs.length,
      storageItemsConsumed,
    });
  }

  function stageRollingDeferredPrimaryStorage(runtime, deferredRefs = [], details = {}) {
    const ledger = runtime.coordinator?.getLedger?.();
    const deferredItems = rollingUniqueRefs(deferredRefs)
      .map((ref) => ledger?.resolveItem?.(ref))
      .filter(Boolean);
    const existingStorageItems = runtime.openRouting?.storageItems || [];
    runtime.openRouting = {
      ...(runtime.openRouting || {}),
      status: 'blocked',
      reason: details.reason || `${deferredItems.length} primary-pack duplicate(s) require Storage after rating normalization`,
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      storageItems: uniqueItems([...existingStorageItems, ...deferredItems]),
      deferredPrimaryRefs: rollingUniqueRefs([
        ...(runtime.openRouting?.deferredPrimaryRefs || []),
        ...deferredRefs,
      ]),
      pendingItems: deferredItems,
      details: {
        ...(runtime.openRouting?.details || {}),
        deferredPrimaryDuplicates: deferredItems.length,
        ...details,
      },
    };
    return deferredItems;
  }

  async function routeRollingDeferredPrimaryStorage(loopDef, runtime, deferredRefs = []) {
    const refs = rollingUniqueRefs(deferredRefs);
    if (!refs.length) return { status: 'ready', moved: 0 };
    logRollingInventoryIdentityState(loopDef, runtime, refs, 'deferred-primary-route:before-refresh');
    await refreshInventoryCaches(`${loopDef.name} deferred primary duplicate routing`, {
      includePacks: false,
      quiet: true,
      onStage: (stage) => logRollingInventoryIdentityState(loopDef, runtime, refs, `deferred-primary-route:after-${stage}`),
    });
    logRollingInventoryIdentityState(loopDef, runtime, refs, 'deferred-primary-route:after-refresh');
    const resolved = refs.map((ref) => ({
      ref,
      live: findCachedItemById(Number(ref.id || 0), ['unassigned', 'storage', 'club', 'transfer']),
    }));
    if (resolved.some(({ live }) => !live)) {
      const missingRefs = resolved.filter(({ live }) => !live).map(({ ref }) => ref);
      return {
        status: 'blocked',
        reason: `a deferred primary-pack duplicate changed before it could be stored (${missingRefs.map((ref) => `#${ref.id || ref.definitionId}`).join(', ')})`,
        reasonCode: 'OPENED_ITEM_ROUTING_PENDING',
        details: {
          missingRefs,
          identity: captureRollingInventoryIdentityState(runtime, refs, 'deferred-primary-route:missing-after-refresh'),
        },
      };
    }
    const unexpected = resolved.filter(({ live }) => !['unassigned', 'storage'].includes(live.pileName));
    if (unexpected.length) {
      return {
        status: 'blocked',
        reason: `${unexpected.length} deferred primary-pack duplicate(s) moved to an unexpected pile`,
        reasonCode: 'OPENED_ITEM_ROUTING_PENDING',
      };
    }
    const pending = resolved
      .filter(({ live }) => live.pileName === 'unassigned')
      .map(({ live }) => live.item);
    const storageFree = storageSpaceLeft();
    if (pending.length && (storageFree === null || pending.length > storageFree)) {
      stageRollingDeferredPrimaryStorage(runtime, refs, {
        reason: `SBC storage has ${storageFree === null ? 'an unknown number of' : storageFree} free slot(s), but ${pending.length} deferred primary-pack duplicate(s) require storage`,
        storageFree,
        storageRequired: pending.length,
      });
      return {
        status: 'blocked',
        reason: runtime.openRouting.reason,
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      };
    }
    if (pending.length) await moveItems(pending, inventoryPile('storage'), true);
    recordRollingRecapDuplicateRoute('storage', pending.length);
    const reconciled = await reconcileRollingRuntime(runtime, `${loopDef.name} deferred primary duplicate routing`);
    if (reconciled.status !== 'ready') return reconciled;
    refreshRollingPendingUnassignedRefs(runtime);
    log(`${loopDef.name}: stored ${pending.length} primary-pack duplicate(s) replaced by lower-rated primary SBC material`);
    return { status: 'ready', moved: pending.length, inventoryDelta: reconciled.inventoryDelta };
  }

  function rollingProtectedDuplicateRefs(items = [], sourceRefs = []) {
    const source = items.filter((item) => sourceRefs.some((ref) => rollingItemMatchesRef(item, ref)));
    return rollingUniqueRefs(items
      .filter((item) => isDuplicate(item) && !source.includes(item))
      .flatMap((item) => [
        liveItemRef(item, 'unassigned'),
        Number(item?.duplicateId || 0)
          ? { id: Number(item.duplicateId), definitionId: Number(item?.definitionId || 0), pile: 'club' }
          : null,
      ]));
  }

  function recordRollingPlayerPickResult(
    pickDef,
    pickedCards,
    duplicatesConsumed = 0,
    recoveryAction = 'playerPick',
  ) {
    const items = (pickedCards || []).map((card) => card.item || card);
    recordRollingRecapItems(items, { sourceLabel: pickDef.name });
    recordRollingRecapRecovery(recoveryAction, { duplicatesConsumed });
    publishPackHighlight(items, {
      packRef: {
        id: Number(pickDef.pickItemResourceIds?.[0] || 0),
        name: pickDef.name,
      },
      purpose: `${pickDef.name} result`,
    });
  }

  function rollingPlayerPickCapabilityLoops(capability = {}) {
    const seen = new Set();
    return [capability?.loop, ...(capability?.alternatives || [])].filter((loop) => {
      const key = `${(loop?.sbcSetIds || []).join(',')}|${(loop?.pickItemResourceIds || []).join(',')}`;
      if (!loop || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function findPendingRollingPlayerPickLoop(capability = {}) {
    for (const pickLoop of rollingPlayerPickCapabilityLoops(capability)) {
      const pending = await findUnassignedPlayerPick(pickLoop, 1, {
        quietMissing: true,
        failOnUnexpected: true,
      });
      if (pending) return pickLoop;
    }
    return null;
  }

  async function runRollingPlayerPickCandidate(loopDef, runtime, pickLoop, options = {}) {
    const pickDef = rollingRecoveryDef(pickLoop, loopDef, {
      inventoryFirst: true,
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
    });
    if (!pickDef) {
      return { status: 'unavailable', reason: 'Rolling Rare Gold Pick candidate is unavailable' };
    }
    const reserves = rollingRecoveryEntryRefs(runtime, ({ classification }) => classification.provisionsReserve === true);
    const protection = rollingRecoveryProtection(runtime, [
      ...reserves,
      ...(runtime.primaryDuplicateRefs || []),
    ]);
    pickDef.protectedItemIds = [...new Set([
      ...(pickDef.protectedItemIds || []),
      ...protection.protectedItemIds,
      ...(options.protectedDuplicateRefs || []).map((ref) => Number(ref?.id || 0)),
    ])];

    const cleanupOptions = {
      loopDef,
      blockedPolicy: 'preserve',
      enableRecovery: false,
      reserveItem: (item) => isDuplicate(item) && isPlayer(item),
    };
    const pending = await findUnassignedPlayerPick(pickDef, 1, { quietMissing: true, failOnUnexpected: true });
    if (pending) {
      if (pickDef.dryRun) return { status: 'planned', reason: `would redeem pending ${pickDef.name}` };
      let pickedCards = [];
      await redeemAndSelectPlayerPick(pending, pickDef, {
        cleanupOptions,
        onSelectionConfirmed: async (cards) => { pickedCards = cards || []; },
      });
      recordRollingPlayerPickResult(pickDef, pickedCards);
      const reconciled = await reconcileRollingRuntime(runtime, `${pickDef.name} pending Pick selection`);
      if (reconciled.status !== 'ready') return reconciled;
      return { status: 'selected', pickedCards };
    }

    const set = await findSbcSetForDefIfPresent(pickDef);
    if (!set) return { status: 'unavailable', reason: `${pickDef.name} Set is no longer available` };
    const liveRepeatability = classifyPlayerPickRepeatability(set);
    if (liveRepeatability.repeatability !== 'unlimited') {
      return {
        status: 'unavailable',
        reason: `${pickDef.name} live repeatability is ${liveRepeatability.repeatability}`,
      };
    }
    const challenges = await requestSbcChallenges(set, pickDef.name, { attempts: 3 });
    const incomplete = challenges
      .map((challenge, index) => ({ challenge, challengeNo: index + 1 }))
      .filter(({ challenge }) => !isCompletedChallenge(challenge));
    if (!incomplete.length) return { status: 'unavailable', reason: `${pickDef.name} has no available challenge` };
    let submittedDuplicateCount = 0;
    let preferredSignalRefs = rollingUniqueRefs(options.preferredSignalRefs || []);
    for (const entry of incomplete) {
      const submitted = await submitPlayerPickChallenge(
        pickDef,
        entry.challengeNo,
        challenges.length || incomplete.length,
        {
          dryRun: pickDef.dryRun,
          preferredSignalRefs,
          requirePreferredSignal: preferredSignalRefs.length > 0,
        },
      );
      if (submitted.status === 'planned') return submitted;
      if (!submitted.submitted) return { ...submitted, status: submitted.status || 'unavailable' };
      const consumedSignalRefs = rollingSelectionConsumedSignalRefs(
        submitted.selection,
        preferredSignalRefs,
      );
      submittedDuplicateCount += consumedSignalRefs.length;
      runtime.recoveryDuplicateRefs = (runtime.recoveryDuplicateRefs || []).filter((ref) => (
        !consumedSignalRefs.some((consumed) => rollingItemMatchesRef(consumed, ref))
      ));
      preferredSignalRefs = preferredSignalRefs.filter((ref) => (
        !consumedSignalRefs.some((consumed) => rollingItemMatchesRef(consumed, ref))
      ));
      await runtime.coordinator.reconcile(`${pickDef.name} challenge ${entry.challengeNo} submitted`, {
        refreshUnassigned: true,
      });
    }
    const pickItem = await findUnassignedPlayerPick(pickDef, 10, { failOnUnexpected: true });
    if (!pickItem) return { status: 'blocked', reason: `${pickDef.name} reward was not found` };
    let pickedCards = [];
    await redeemAndSelectPlayerPick(pickItem, pickDef, {
      cleanupOptions,
      onSelectionConfirmed: async (cards) => { pickedCards = cards || []; },
    });
    recordRollingPlayerPickResult(pickDef, pickedCards, submittedDuplicateCount);
    const reconciled = await reconcileRollingRuntime(runtime, `${pickDef.name} selection`);
    if (reconciled.status !== 'ready') return reconciled;
    return { status: 'selected', pickedCards };
  }

  async function runRollingPlayerPickRecovery(loopDef, runtime, capability, options = {}) {
    if (capability?.status !== 'resolved') {
      return { status: 'unavailable', reason: 'Rolling Rare Gold Pick capability is unavailable' };
    }
    const candidates = rollingPlayerPickCapabilityLoops(capability);
    if (!candidates.length) {
      return { status: 'unavailable', reason: 'Rolling Rare Gold Pick capability has no candidates' };
    }

    const pendingLoop = await findPendingRollingPlayerPickLoop(capability);
    if (pendingLoop) {
      return runRollingPlayerPickCandidate(loopDef, runtime, pendingLoop, options);
    }

    const unavailable = [];
    for (const candidate of candidates) {
      const result = await runRollingPlayerPickCandidate(loopDef, runtime, candidate, options);
      if (result?.status !== 'unavailable') return result;
      unavailable.push(`${candidate.name || 'Rare Gold Pick'}: ${result.reason || 'unavailable'}`);
      log(`${loopDef.name}: ${candidate.name || 'Rare Gold Pick'} unavailable; trying the next dynamic Rare Gold Pick candidate`);
    }
    return {
      status: 'unavailable',
      reason: unavailable.join('; ') || 'all Rolling Rare Gold Pick candidates are unavailable',
    };
  }

  async function loadRollingStorageSinkContexts(loopDef, pickDef) {
    const set = await findSbcSetForLoopDef(pickDef, pickDef.name);
    const challenges = await requestSbcChallenges(set, pickDef.name, { attempts: 3 });
    if (challenges.length !== 2) {
      return {
        status: 'blocked',
        reason: `${pickDef.name} must expose exactly two live challenges; found ${challenges.length}`,
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    const incomplete = challenges.filter((challenge) => !isCompletedChallenge(challenge));
    if (!incomplete.length) {
      return {
        status: 'complete',
        set,
        contexts: [],
        completedCount: challenges.length,
      };
    }

    const contexts = [];
    for (const sourceChallenge of incomplete) {
      const challenge = pickDef.dryRun
        ? sourceChallenge
        : await loadRatingSbcChallengeForSet(set, sourceChallenge, pickDef.name);
      if (!challenge) {
        return {
          status: 'blocked',
          reason: `${pickDef.name} challenge #${sourceChallenge?.id || '?'} could not be loaded`,
          reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
        };
      }
      const activeLoopDef = applyRollingAutomaticUseFodderPolicy({
        ...materializeDynamicUpgradeChallengeLoopDef(pickDef, challenge),
        priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      }, loopDef);
      const model = parseRatingSbcChallenge(activeLoopDef, challenge);
      if (model.unsupported.length || !model.targetRating || !model.requiredPlayerCount) {
        return {
          status: 'blocked',
          reason: `${pickDef.name} challenge #${challenge?.id || '?'} has unsupported live requirements: ${model.unsupported.join(', ') || 'rating/player count unavailable'}`,
          reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
        };
      }
      contexts.push({
        set,
        challenge,
        challengeId: Number(challenge?.id || 0),
        activeLoopDef,
        model,
        targetRating: Number(model.targetRating || 0),
      });
    }

    const ratings = contexts.map((context) => context.targetRating).sort((left, right) => left - right);
    const validRatings = ratings.every((rating) => rating === 88 || rating === 89)
      && new Set(ratings).size === ratings.length
      && (ratings.length !== 2 || ratings.join(',') === '88,89');
    if (!validRatings) {
      return {
        status: 'blocked',
        reason: `${pickDef.name} incomplete live squad ratings are not a valid subset of 88/89: ${ratings.join('/') || 'unknown'}`,
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    return {
      status: 'ready',
      set,
      contexts,
      completedCount: challenges.length - incomplete.length,
    };
  }

  function rollingStorageSinkLoopDefForPiles(context, priorityPiles) {
    return {
      ...context.activeLoopDef,
      priorityPiles: [...priorityPiles],
      ratingSbcFill: {
        ...(context.activeLoopDef.ratingSbcFill || {}),
        priorityPiles: [...priorityPiles],
      },
    };
  }

  function rollingStorageSinkSelectionPolicy(loopDef, runtime, options = {}) {
    const requiredSpecialRoles = storageSinkRequiredSpecialRoles(options.model);
    const selectionPolicy = createRollingRatingRecoverySelectionPolicy({
      ledger: runtime.coordinator.getLedger(),
      protectionRating: rollingProtectionRating(loopDef),
      reserveRatings: false,
      protectedItems: rollingNonPrimaryPendingRefs(runtime),
      requiredItems: options.requiredItems || [],
      exclusiveRoles: requiredSpecialRoles,
      allowRequiredSpecial: requiredSpecialRoles.length > 0,
    });
    if (!requiredSpecialRoles.length) return selectionPolicy;
    return {
      ...selectionPolicy,
      candidateFilter: createRollingRequiredSpecialSourceFilter({
        constraintIndexes: requiredSpecialRoles.map((role) => role.constraintIndex),
        isClubTotw: isTotwItem,
        resolveSubmissionPile: rollingSelectionSubmissionPile,
      }),
    };
  }

  async function selectRollingStorageSink89Squad(loopDef, runtime, context, snapshot) {
    const activeLoopDef = rollingStorageSinkLoopDefForPiles(
      context,
      storageSinkSquadSourceStrategy(89).priorityPiles,
    );
    const basePolicy = rollingStorageSinkSelectionPolicy(loopDef, runtime, { model: context.model });
    const candidates = buildRatingSbcCandidateEntries(
      activeLoopDef,
      context.model,
      basePolicy,
      snapshot,
    );
    const maxRating = rollingProtectionRating(loopDef);
    const prepared = prepareStorageSink89Candidates(candidates.entries, {
      primaryRefs: runtime.primaryDuplicateRefs || [],
      maxRating,
      protectedItems: basePolicy.protectedItems,
    });
    if (prepared.requiredEntries.length > Number(context.model.requiredPlayerCount || 0)) {
      return {
        ok: false,
        reason: `${prepared.requiredEntries.length} eligible primary Unassigned duplicate(s) cannot fit in the ${context.model.requiredPlayerCount}-player 89 squad`,
        reasonCode: 'STORAGE_SINK_UNASSIGNED_EXCESS',
      };
    }
    const selectionPolicy = rollingStorageSinkSelectionPolicy(loopDef, runtime, {
      requiredItems: prepared.requiredItems,
      model: context.model,
    });
    const selection = await findOptimalRatingSbcSelection(
      prepared.entries,
      context.model,
      candidates.piles,
      { selectionPolicy },
    );
    return selection.ok ? selection : {
      ...selection,
      reasonCode: selection.reasonCode || 'RECOVERY_MATERIAL_SHORTAGE',
    };
  }

  async function selectRollingStorageSink88Squad(loopDef, runtime, context, snapshot) {
    const buildFor = (priorityPiles) => {
      const activeLoopDef = rollingStorageSinkLoopDefForPiles(context, priorityPiles);
      const basePolicy = rollingStorageSinkSelectionPolicy(loopDef, runtime, { model: context.model });
      return buildRatingSbcCandidateEntries(
        activeLoopDef,
        context.model,
        basePolicy,
        snapshot,
      );
    };
    const selectWith = async (candidates, forcedClubEntries = []) => {
      const forcedClubIds = new Set(forcedClubEntries.map((entry) => Number(entry.item?.id || 0)));
      const entries = forcedClubEntries.length
        ? candidates.entries.filter((entry) => (
          entry.pileName === 'storage'
            || (entry.pileName === 'club' && forcedClubIds.has(Number(entry.item?.id || 0)))
        ))
        : candidates.entries;
      const selectionPolicy = rollingStorageSinkSelectionPolicy(loopDef, runtime, {
        requiredItems: forcedClubEntries.map((entry) => liveItemRef(entry.item, entry.pileName)),
        model: context.model,
      });
      return {
        candidates,
        selection: await findOptimalRatingSbcSelection(
          entries,
          context.model,
          candidates.piles,
          { selectionPolicy },
        ),
      };
    };

    const storageOnlyCandidates = buildFor(['storage']);
    const storageOnly = await selectWith(storageOnlyCandidates);
    if (storageOnly.selection.ok) return storageOnly.selection;

    const storageAndClubCandidates = buildFor(['storage', 'club']);
    const maxRating = rollingProtectionRating(loopDef);
    const clubEntries = selectStorageSinkClubFallbackEntries(storageAndClubCandidates.entries, {
      count: STORAGE_SINK_MAX_CLUB_FILL_PER_SQUAD,
      maxRating,
      requiredConstraintIndexes: storageSinkRequiredSpecialRoles(context.model)
        .map((role) => role.constraintIndex),
      protectedItems: rollingStorageSinkSelectionPolicy(loopDef, runtime, { model: context.model })
        .protectedItems,
    });
    let lastFailure = storageOnly.selection;
    for (let clubCount = 1; clubCount <= STORAGE_SINK_MAX_CLUB_FILL_PER_SQUAD; clubCount++) {
      if (clubEntries.length < clubCount) break;
      const attempt = await selectWith(storageAndClubCandidates, clubEntries.slice(0, clubCount));
      if (attempt.selection.ok) return attempt.selection;
      lastFailure = attempt.selection;
    }
    return {
      ...lastFailure,
      reasonCode: lastFailure.reasonCode || 'RECOVERY_MATERIAL_SHORTAGE',
    };
  }

  async function planRollingStorageSinkSquad(loopDef, runtime, context) {
    const strategy = storageSinkSquadSourceStrategy(context?.targetRating);
    if (!strategy) {
      return {
        ok: false,
        reason: `unsupported Storage Sink squad rating ${context?.targetRating || '?'}`,
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    const snapshot = runtime.coordinator.getLedger().inventorySnapshot();
    const result = await planMultiSquadRatingSelections({
      snapshot,
      contexts: [context],
      selectChallenge: async (workingSnapshot) => (
        strategy.targetRating === 89
          ? selectRollingStorageSink89Squad(loopDef, runtime, context, workingSnapshot)
          : selectRollingStorageSink88Squad(loopDef, runtime, context, workingSnapshot)
      ),
    });
    return result.ok ? {
      ...result,
      details: {
        ...result.details,
        targetRating: strategy.targetRating,
        sourceOrder: strategy.priorityPiles,
        maxClubPerSquad: strategy.maxClubCount,
      },
    } : result;
  }

  function validateRollingStorageSinkHeadroom(runtime, squadPlan, options = {}) {
    const storage = runtime.coordinator.getLedger().summary().capacities?.storage || {};
    const currentFree = storage.free;
    const plans = squadPlan.plans || [];
    const consumedSignalRefs = plans.flatMap((plan) => plan.signalRefs || []);
    const pendingStorageItems = (runtime.openRouting?.storageItems || []).filter((item) => {
      if (consumedSignalRefs.some((ref) => rollingItemMatchesRef(item, ref))) return false;
      const live = findCachedItemById(Number(item?.id || 0));
      return !live || live.pileName === 'unassigned';
    }).length;
    const input = {
      currentFree,
      pendingStorageItems,
      storageItemsConsumed: squadPlan.storageItemsConsumed,
    };
    return options.reservePickResult === true
      ? validateStorageSinkHeadroom({ ...input, pickDuplicateReserve: 1 })
      : validateStorageRecoveryHeadroom(input);
  }

  function resolveRollingStorageSinkPlayers(runtime, plan) {
    const ledgerEntries = runtime.coordinator.getLedger().classifiedEntries();
    const players = [];
    const itemRefs = [];
    for (const plannedRef of plan.itemRefs || []) {
      const record = ledgerEntries.find(({ item }) => (
        Number(plannedRef.id || 0) > 0
          ? Number(item?.id || 0) === Number(plannedRef.id)
          : Number(plannedRef.definitionId || 0) > 0
            && Number(item?.definitionId || 0) === Number(plannedRef.definitionId)
      ));
      if (!record) {
        return { ok: false, reason: `planned item #${plannedRef.id || plannedRef.definitionId || '?'} is no longer in the Inventory Ledger` };
      }
      const live = findCachedItemById(Number(record.item?.id || 0));
      if (!live) {
        return { ok: false, reason: `planned item #${record.item?.id || '?'} is no longer available in live inventory` };
      }
      players.push(live.item);
      itemRefs.push(liveItemRef(live.item, live.pileName));
    }
    return { ok: true, players, itemRefs };
  }

  function validateRollingStorageSinkPlayers(loopDef, runtime, context, players, options = {}) {
    const requiredSpecialRoles = storageSinkRequiredSpecialRoles(context.model);
    assertRollingRecoveryItems(loopDef, runtime, players, {
      allowProvisionsReserve: true,
      allowSpecial: true,
      allowPrimaryDuplicates: true,
      allowRequiredSpecial: requiredSpecialRoles.length > 0,
      selection: options.selection,
    });
    return validateRatingSbcModelAgainstItems(
      context.model,
      players,
      options.checkSavedChallenge === true ? context.challenge : null,
      {
        allowOtherSpecialAsOrdinary: true,
        exclusiveRoles: requiredSpecialRoles,
      },
    );
  }

  function createRollingStorageSinkSubmissionValidators(loopDef, runtime, context, label) {
    const validate = (players, options = {}) => {
      const validation = validateRollingStorageSinkPlayers(
        loopDef,
        runtime,
        context,
        players,
        options,
      );
      if (!validation.ok) {
        const phase = options.checkSavedChallenge === true ? 'saved' : 'planned';
        fail(`${label}: ${phase} squad failed dynamic validation: ${validation.errors.join(', ')}`);
      }
      return true;
    };
    return {
      validatePlannedPlayers: (players, selection) => validate(players, { selection }),
      preSave: ({ players, squadPlan }) => validate(players, {
        selection: squadPlan?.selection,
      }),
      postSave: ({ players, savedPlayers, squadPlan }) => validate(
        savedPlayers?.length ? savedPlayers : players,
        { checkSavedChallenge: true, selection: squadPlan?.selection },
      ),
    };
  }

  async function submitRollingStorageSinkSquad(loopDef, runtime, pickDef, plan, index, total) {
    const context = plan.context;
    const label = `${loopDef.name} -> ${pickDef.name} ${context.targetRating} squad (${index + 1}/${total})`;
    const reconciliation = await runtime.coordinator.reconcile(`${label} pre-submit`, { refreshUnassigned: true });
    if (!reconciliation.ok) {
      return { status: 'blocked', reason: reconciliation.reason, reasonCode: 'INVENTORY_RECONCILIATION_FAILED' };
    }
    const resolved = resolveRollingStorageSinkPlayers(runtime, plan);
    if (!resolved.ok) {
      return { status: 'blocked', reason: resolved.reason, reasonCode: 'INVENTORY_VALIDATION_FAILED' };
    }
    const ledgerValidation = await runtime.coordinator.validateBeforeSubmit(resolved.itemRefs, {
      label,
      reason: 'rolling-storage-sink-pre-submit',
    });
    if (!ledgerValidation.ok) {
      return { status: 'blocked', reason: ledgerValidation.reason, reasonCode: 'INVENTORY_VALIDATION_FAILED' };
    }
    const validators = createRollingStorageSinkSubmissionValidators(
      loopDef,
      runtime,
      context,
      label,
    );
    validators.validatePlannedPlayers(resolved.players, plan.selection);

    let backgroundSubmission = null;
    runtime.lastMutation = null;
    const submission = await submitSbcAttempt({
      label,
      challengeProvider: async () => ({
        set: context.set,
        challenge: context.challenge,
        background: true,
      }),
      squadProvider: createExistingSquadProvider({
        getPlayers: async () => resolved.players,
        itemRef: liveItemRef,
        selection: plan.selection,
        source: 'rolling-storage-sink-squad',
      }),
      prepareRuntimeAccess: prepareFsuRuntimeAccess,
      preparePlayers: (submitContext) => prepareRollingUntradeableDuplicateSwaps(submitContext, runtime),
      saveSquad: async ({ challenge, players }) => {
        await applyPlayersToRatingChallenge(challenge, players, label);
      },
      readSavedPlayers: async ({ challenge }) => getSquadItems(challenge?.squad),
      preSaveValidators: [validators.preSave],
      postSaveValidators: [validators.postSave],
      isSubmitReady: async ({ challenge }) => {
        try { return challenge?.canSubmit?.() !== false; } catch { return false; }
      },
      submitTransport: async (submitContext) => {
        backgroundSubmission = await submitRatingSbcInBackground(
          submitContext.set,
          submitContext.challenge,
          label,
          {
            players: submitContext.players || resolved.players,
            allowItemViolationOverride: true,
            rewardObservationAttempts: 1,
            allowKnownRewardFallback: false,
            failureInventoryDiagnostic: ({ players: attemptedPlayers }) => (
              rollingBackgroundSubmitInventoryDiagnostic(runtime, attemptedPlayers)
            ),
          },
        );
        return { submitted: true, rewardPackId: null };
      },
      runCommittedSubmit: runCommittedSbcSubmit,
      onResult: async (submissionResult) => {
        runtime.lastMutation = await runtime.coordinator.recordSubmission(submissionResult, { primary: false });
      },
      afterSubmit: async ({ players, savedPlayers }) => {
        await finalizeSubmittedInventorySelection(
          plan.selection,
          label,
          savedPlayers?.length ? savedPlayers : players,
        );
      },
    });
    if (submission.submitted && !runtime.lastMutation) {
      runtime.lastMutation = await runtime.coordinator.recordSubmission(submission, { primary: false });
    }
    return {
      ...submission,
      status: submission.submitted ? 'submitted' : submission.status,
      inventoryDelta: runtime.lastMutation?.delta || null,
      details: { rewardObserved: backgroundSubmission?.rewardObserved === true },
    };
  }

  async function selectPendingRollingStorageSinkPick(loopDef, runtime, capability, options = {}) {
    const pickDef = rollingRecoveryDef(capability?.loop, loopDef, {
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
    });
    if (!pickDef || capability?.status !== 'resolved' || !hasResolvedSbcIdentity(pickDef)) {
      return { status: 'unavailable', reason: 'dynamic Storage pressure Player Pick capability is unavailable' };
    }
    const cleanupOptions = {
      loopDef,
      blockedPolicy: 'preserve',
      enableRecovery: false,
      reserveItem: (item) => isDuplicate(item) && isPlayer(item),
    };
    const pending = await findUnassignedPlayerPick(pickDef, Number(options.attempts || 1), {
      quietMissing: options.quietMissing !== false,
      failOnUnexpected: options.failOnUnexpected === true,
    });
    if (!pending) {
      return {
        status: 'missing',
        reason: `${pickDef.name} Player Pick reward was not found`,
        reasonCode: 'STORAGE_SINK_REWARD_NOT_FOUND',
      };
    }
    if (pickDef.dryRun) return { status: 'planned', reason: `would redeem pending ${pickDef.name}` };

    let pickedCards = [];
    await redeemAndSelectPlayerPick(pending, pickDef, {
      cleanupOptions,
      onSelectionConfirmed: async (cards) => { pickedCards = cards || []; },
    });
    recordRollingPlayerPickResult(
      pickDef,
      pickedCards,
      Number(options.duplicatesConsumed || 0),
      'storageSink',
    );
    const reconciled = await reconcileRollingRuntime(runtime, `${pickDef.name} pending selection`);
    if (reconciled.status !== 'ready') return reconciled;
    refreshRollingPendingUnassignedRefs(runtime);
    return { status: 'selected', pickedCards };
  }

  async function runRollingLegacyStorageSinkRecovery(loopDef, runtime, capability) {
    const pendingSelection = await selectPendingRollingStorageSinkPick(
      loopDef,
      runtime,
      capability,
      { attempts: 1, quietMissing: true, failOnUnexpected: true },
    );
    if (pendingSelection.status !== 'missing') return pendingSelection;

    const pickDef = rollingRecoveryDef(capability?.loop, loopDef, {
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
    });

    await refreshInventoryCaches(`${pickDef.name} sequential recovery`, { includePacks: false, quiet: true });
    const reconciled = await runtime.coordinator.reconcile(`${pickDef.name} sequential recovery`, {
      refreshUnassigned: true,
    });
    if (!reconciled.ok) {
      return { status: 'blocked', reason: reconciled.reason, reasonCode: 'INVENTORY_RECONCILIATION_FAILED' };
    }
    const loaded = await loadRollingStorageSinkContexts(loopDef, pickDef);
    if (loaded.status !== 'ready' && loaded.status !== 'complete') return loaded;
    const pendingContexts = loaded.status === 'ready' ? [...loaded.contexts] : [];
    let submitted = 0;
    let duplicatesConsumed = 0;
    const submittedRatings = [];
    let lastHeadroom = null;
    while (pendingContexts.length) {
      const context = nextStorageSinkContext(pendingContexts);
      if (!context) {
        return {
          status: 'blocked',
          reason: `${pickDef.name} has no supported incomplete 89/88 squad`,
          reasonCode: submitted ? 'STORAGE_SINK_PARTIAL_COMPLETION' : 'LIVE_REQUIREMENT_UNAVAILABLE',
          details: { partialCompletion: submitted, submittedRatings },
        };
      }
      const squadPlan = await planRollingStorageSinkSquad(loopDef, runtime, context);
      if (!squadPlan.ok) {
        const rating = Number(context.targetRating || 0) || '?';
        log(`${loopDef.name}: ${pickDef.name} ${rating} squad deferred [${squadPlan.reasonCode || 'unknown'}]: ${squadPlan.reason || 'no safe source plan'}`);
        const diagnostic = squadPlan.details?.selectionDiagnostics?.[0];
        if (diagnostic) {
          log(`${loopDef.name}: ${pickDef.name} ${rating} squad source diagnostic: ${diagnosticJson(diagnostic)}`);
        }
        if (submitted) {
          return {
            status: 'submitted',
            submitted: true,
            reason: `${pickDef.name} ${submittedRatings.join('/')} squad submitted; ${rating} squad deferred until later Storage pressure: ${squadPlan.reason || 'no safe source plan'}`,
            reasonCode: 'STORAGE_SINK_88_DEFERRED',
            details: {
              partialCompletion: submitted,
              submittedRatings,
              remainingRatings: pendingContexts.map((entry) => Number(entry.targetRating || 0)),
              deferredReasonCode: squadPlan.reasonCode || 'RECOVERY_MATERIAL_SHORTAGE',
            },
          };
        }
        return {
          status: 'unavailable',
          reason: squadPlan.reason,
          reasonCode: squadPlan.reasonCode || 'RECOVERY_MATERIAL_SHORTAGE',
          details: squadPlan.details,
        };
      }
      const plan = squadPlan.plans[0];
      const rating = Number(context.targetRating || 0);
      const headroom = validateRollingStorageSinkHeadroom(runtime, squadPlan, {
        reservePickResult: rating === 88,
      });
      if (!headroom.ok) {
        log(`${loopDef.name}: ${pickDef.name} ${rating} squad deferred [${headroom.reasonCode}]: ${headroom.reason}`);
        if (submitted) {
          return {
            status: 'submitted',
            submitted: true,
            reason: `${pickDef.name} ${submittedRatings.join('/')} squad submitted; ${rating} squad deferred until later Storage pressure: ${headroom.reason}`,
            reasonCode: 'STORAGE_SINK_88_DEFERRED',
            details: {
              partialCompletion: submitted,
              submittedRatings,
              remainingRatings: pendingContexts.map((entry) => Number(entry.targetRating || 0)),
              deferredReasonCode: headroom.reasonCode,
            },
          };
        }
        return { status: 'unavailable', ...headroom };
      }
      lastHeadroom = headroom;
      log(`${loopDef.name}: ${pickDef.name} sequential ${rating} squad ready; sources:${formatSelectionStats(squadPlan.pileCounts)}, source order:${squadPlan.details.sourceOrder.join(' -> ')}, Club cap:${squadPlan.details.maxClubPerSquad}, Storage cards:${squadPlan.storageItemsConsumed}, projected free:${headroom.projectedFree}/${headroom.requiredFree} required`);
      logInventorySelection(
        `${loopDef.name}: ${pickDef.name} ${rating} squad`,
        plan.selection,
        { maxItems: 30 },
      );
      if (pickDef.dryRun) {
        return {
          status: 'planned',
          reason: `dry-run ${pickDef.name} next ${rating} squad plan complete`,
          details: { headroom, rating },
        };
      }
      const result = await submitRollingStorageSinkSquad(
        loopDef,
        runtime,
        pickDef,
        plan,
        Number(loaded.completedCount || 0) + submitted,
        2,
      );
      if (!result.submitted) {
        return {
          ...result,
          status: 'blocked',
          reason: submitted
            ? `${pickDef.name} stopped after ${submitted}/2 squad(s): ${result.reason || result.status}`
            : result.reason,
          reasonCode: submitted ? 'STORAGE_SINK_PARTIAL_COMPLETION' : result.reasonCode,
          details: { ...(result.details || {}), partialCompletion: submitted },
        };
      }
      submitted++;
      submittedRatings.push(rating);
      duplicatesConsumed += rollingDuplicatePlayerCount(plan.selection?.selected)
        + Number(plan.signalRefs?.length || 0);
      const afterSubmit = await runtime.coordinator.reconcile(
        `${pickDef.name} ${rating} squad submitted`,
        { refreshUnassigned: true },
      );
      if (!afterSubmit.ok) {
        return {
          status: 'blocked',
          reason: `${pickDef.name} inventory reconciliation failed after ${submitted}/2 squad(s): ${afterSubmit.reason}`,
          reasonCode: 'STORAGE_SINK_PARTIAL_COMPLETION',
          details: { partialCompletion: submitted, submittedRatings },
        };
      }
      const consumedSignalRefs = plan.signalRefs || [];
      if (consumedSignalRefs.length) {
        runtime.primaryDuplicateRefs = (runtime.primaryDuplicateRefs || []).filter((ref) => (
          !consumedSignalRefs.some((consumedRef) => rollingItemMatchesRef(ref, consumedRef))
        ));
        const released = releaseRollingRoutingItemsAfterConsumption(
          runtime.openRouting,
          consumedSignalRefs,
        );
        runtime.openRouting = released.routing;
        log(`${loopDef.name}: ${pickDef.name} consumed ${consumedSignalRefs.length} Unassigned duplicate signal(s); ${runtime.primaryDuplicateRefs.length} remain reserved for the primary SBC`);
      }
      refreshRollingPendingUnassignedRefs(runtime);
      const completedContextIndex = pendingContexts.indexOf(context);
      if (completedContextIndex >= 0) pendingContexts.splice(completedContextIndex, 1);
      if (pendingContexts.length) {
        log(`${loopDef.name}: ${pickDef.name} reusing ${pendingContexts.length} preloaded remaining squad(s) after ${rating} submission`);
      }
    }

    const selectedPick = await selectPendingRollingStorageSinkPick(
      loopDef,
      runtime,
      capability,
      {
        attempts: 10,
        quietMissing: false,
        failOnUnexpected: true,
        duplicatesConsumed,
      },
    );
    if (selectedPick.status !== 'selected') {
      return {
        ...selectedPick,
        status: 'blocked',
        reason: selectedPick.reason || `${pickDef.name} completed but its Player Pick reward was not found`,
        reasonCode: selectedPick.reasonCode || 'STORAGE_SINK_REWARD_NOT_FOUND',
        details: { ...(selectedPick.details || {}), partialCompletion: submitted, submittedRatings },
      };
    }

    const routed = await retryRollingProtectedStorage(loopDef, runtime);
    if (routed.status !== 'ready') {
      return {
        ...routed,
        status: 'blocked',
        reasonCode: 'STORAGE_SINK_PARTIAL_COMPLETION',
        details: {
          ...(routed.details || {}),
          partialCompletion: submitted,
          submittedRatings,
          pickSelected: true,
        },
      };
    }
    return {
      status: 'selected',
      pickedCards: selectedPick.pickedCards,
      details: { submittedSquads: submitted, submittedRatings, headroom: lastHeadroom },
    };
  }

  async function loadRollingGenericStorageSinkContexts(loopDef, capability) {
    const sinkDef = rollingRecoveryDef(capability?.loop, loopDef, {
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
    });
    if (!sinkDef || !hasResolvedSbcIdentity(sinkDef)) {
      return {
        status: 'unavailable',
        reason: 'selected Storage pressure SBC identity is unavailable',
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    const set = await findSbcSetForLoopDef(sinkDef, sinkDef.name);
    const challenges = await requestSbcChallenges(set, sinkDef.name, { attempts: 3 });
    const incomplete = challenges.filter((challenge) => !isCompletedChallenge(challenge));
    if (!incomplete.length) {
      return {
        status: 'complete',
        sinkDef,
        set,
        contexts: [],
        totalChallengeCount: challenges.length,
        completedCount: challenges.length,
        incompleteCount: 0,
      };
    }

    const contexts = [];
    for (const sourceChallenge of incomplete) {
      const snapshot = eaSbcAdapter().snapshotDiscoverySet(set, [sourceChallenge])?.challenges?.[0] || {};
      const snapshotRating = Number((snapshot.eligibilityRequirements || [])
        .find((requirement) => requirement?.key === 'TEAM_RATING')?.values?.[0] || 0);
      if (snapshotRating < ROLLING_STORAGE_SINK_MIN_CHALLENGE_RATING) continue;
      const challenge = sinkDef.dryRun
        ? sourceChallenge
        : await loadRatingSbcChallengeForSet(set, sourceChallenge, sinkDef.name);
      if (!challenge) {
        return {
          status: 'blocked',
          reason: `${sinkDef.name} challenge #${sourceChallenge?.id || '?'} could not be loaded`,
          reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
        };
      }
      const activeLoopDef = applyRollingAutomaticUseFodderPolicy({
        ...materializeDynamicUpgradeChallengeLoopDef(sinkDef, challenge),
        priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      }, loopDef);
      const model = parseRatingSbcChallenge(activeLoopDef, challenge);
      if (model.unsupported.length || !model.targetRating || !model.requiredPlayerCount) {
        return {
          status: 'blocked',
          reason: `${sinkDef.name} challenge #${challenge?.id || '?'} has unsupported live requirements: ${model.unsupported.join(', ') || 'rating/player count unavailable'}`,
          reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
        };
      }
      if (Number(model.targetRating) < ROLLING_STORAGE_SINK_MIN_CHALLENGE_RATING) continue;
      contexts.push({
        set,
        challenge,
        challengeId: Number(challenge?.id || 0),
        activeLoopDef,
        model,
        targetRating: Number(model.targetRating || 0),
      });
    }
    if (!contexts.length) {
      return {
        status: 'unavailable',
        reason: `${sinkDef.name} has no incomplete ${ROLLING_STORAGE_SINK_MIN_CHALLENGE_RATING}+ rating squad`,
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    return {
      status: 'ready',
      sinkDef,
      set,
      contexts,
      totalChallengeCount: challenges.length,
      completedCount: challenges.length - incomplete.length,
      incompleteCount: incomplete.length,
    };
  }

  function rollingRatingHistogram(items = []) {
    const counts = new Map();
    for (const item of items) {
      const rating = Number(item?.rating || item?.item?.rating || 0);
      if (!rating) continue;
      counts.set(rating, Number(counts.get(rating) || 0) + 1);
    }
    return Object.fromEntries([...counts.entries()].sort((left, right) => left[0] - right[0]));
  }

  function rollingCandidatePileDiagnostic(entries = []) {
    const result = {};
    for (const pile of ['unassigned', 'storage', 'transfer', 'club']) {
      const items = entries
        .filter((entry) => String(entry?.pileName || '') === pile)
        .map((entry) => entry.item)
        .filter(Boolean);
      result[pile] = {
        count: items.length,
        ratings: rollingRatingHistogram(items),
      };
    }
    return result;
  }

  function rollingSnapshotPileDiagnostic(snapshot = {}) {
    return Object.fromEntries(['unassigned', 'storage', 'transfer', 'club'].map((pile) => {
      const players = (snapshot?.piles?.[pile] || []).filter(isPlayer);
      return [pile, {
        count: players.length,
        ratings: rollingRatingHistogram(players),
      }];
    }));
  }

  function rollingStorageSinkAdmissionDiagnostic(activeLoopDef, model, selectionPolicy, snapshot, candidates) {
    const settings = getFsuSettings();
    const safetyContext = {
      settings,
      protectedItemIds: new Set((activeLoopDef.protectedItemIds || []).map(Number).filter(Boolean)),
      protectedDefinitionIds: new Set((activeLoopDef.protectedDefinitionIds || []).map(Number).filter(Boolean)),
      lockedItemIds: new Set((settings.lockedItemIds || []).map(Number).filter(Boolean)),
      lockedDefinitionIds: new Set((settings.lockedDefinitionIds || []).map(Number).filter(Boolean)),
      excludedLeagueIds: (settings.excludedLeagueIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0),
      roleAware: selectionPolicy !== null,
      skipRatingLimit: selectionPolicy !== null,
    };
    const candidateEntries = candidates?.entries || [];
    const candidateByItemId = new Map(candidateEntries.map((entry) => [
      Number(entry.item?.id || 0),
      entry,
    ]));
    const candidateByDefinition = new Map();
    candidateEntries.forEach((entry) => {
      const definitionId = Number(entry.item?.definitionId || 0);
      if (definitionId && !candidateByDefinition.has(definitionId)) candidateByDefinition.set(definitionId, entry);
    });
    const rejectedByReason = {};
    const rejectedSamples = {};
    const addRejection = (reason, item) => {
      rejectedByReason[reason] = Number(rejectedByReason[reason] || 0) + 1;
      const samples = rejectedSamples[reason] || [];
      if (samples.length < 4) {
        samples.push({
          id: Number(item?.id || 0),
          definitionId: Number(item?.definitionId || 0),
          rating: Number(item?.rating || 0),
        });
      }
      rejectedSamples[reason] = samples;
    };
    let acceptedAsStorage = 0;
    let representedByUnassigned = 0;
    const storagePlayers = (snapshot?.piles?.storage || []).filter(isPlayer);
    for (const item of storagePlayers) {
      const itemId = Number(item?.id || 0);
      const exactCandidate = candidateByItemId.get(itemId);
      if (exactCandidate?.pileName === 'storage') {
        acceptedAsStorage++;
        continue;
      }
      if (exactCandidate?.pileName === 'unassigned') {
        representedByUnassigned++;
        addRejection('represented-by-unassigned-duplicate', item);
        continue;
      }
      const reasons = getSbcProtectionReasons(item, activeLoopDef, {
        ...safetyContext,
        allowedSpecialCount: Number(model?.requiredPlayerCount || 0),
        specialIndex: isSbcSpecialItem(item) ? 1 : 0,
      });
      if (reasons.length) {
        reasons.forEach((reason) => addRejection(reason, item));
        continue;
      }
      const representative = candidateByDefinition.get(Number(item?.definitionId || 0));
      addRejection(representative ? `definition-represented-by-${representative.pileName}` : 'candidate-builder-filtered', item);
    }
    return {
      rawStoragePlayers: storagePlayers.length,
      acceptedAsStorage,
      representedByUnassigned,
      rejectedByReason,
      rejectedSamples,
    };
  }

  async function selectRollingGenericStorageSinkSquad(loopDef, runtime, context, snapshot) {
    const strategy = genericStorageSinkSquadSourceStrategy(context?.targetRating);
    if (!strategy) {
      return {
        ok: false,
        reason: `unsupported Storage pressure squad rating ${context?.targetRating || '?'}`,
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    const activeLoopDef = rollingStorageSinkLoopDefForPiles(context, strategy.priorityPiles);
    const basePolicy = rollingStorageSinkSelectionPolicy(loopDef, runtime, { model: context.model });
    const candidates = buildRatingSbcCandidateEntries(
      activeLoopDef,
      context.model,
      basePolicy,
      snapshot,
    );
    const maxRating = rollingProtectionRating(loopDef);
    const clubEntries = selectStorageSinkClubFallbackEntries(candidates.entries, {
      count: strategy.maxClubCount,
      maxRating,
      requiredConstraintIndexes: storageSinkRequiredSpecialRoles(context.model)
        .map((role) => role.constraintIndex),
      protectedItems: basePolicy.protectedItems,
    });
    let lastFailure = null;
    let requiredDiagnostic = null;
    const attemptDiagnostics = [];
    for (let clubCount = 0; clubCount <= strategy.maxClubCount; clubCount++) {
      if (clubCount > clubEntries.length) break;
      const prepared = prepareGenericStorageSinkCandidates(candidates.entries, {
        primaryRefs: runtime.primaryDuplicateRefs || [],
        maxRating,
        requiredPlayerCount: context.model.requiredPlayerCount,
        clubEntries: clubEntries.slice(0, clubCount),
        protectedItems: basePolicy.protectedItems,
      });
      if (!requiredDiagnostic) {
        requiredDiagnostic = {
          configuredPrimaryRefs: Number(runtime.primaryDuplicateRefs?.length || 0),
          matchedRequiredEntries: prepared.requiredEntries.length,
          deferredProtectedEntries: prepared.deferredProtectedEntries.slice(0, 16).map((entry) => ({
            itemId: Number(entry.item?.id || 0),
            signalId: Number(entry.signal?.id || 0),
            definitionId: Number(entry.item?.definitionId || 0),
            rating: Number(entry.item?.rating || 0),
          })),
          requiredEntries: prepared.requiredEntries.slice(0, 16).map((entry) => ({
            itemId: Number(entry.item?.id || 0),
            signalId: Number(entry.signal?.id || 0),
            definitionId: Number(entry.item?.definitionId || 0),
            rating: Number(entry.item?.rating || 0),
          })),
        };
      }
      const selectionPolicy = rollingStorageSinkSelectionPolicy(loopDef, runtime, {
        requiredItems: prepared.requiredItems,
        model: context.model,
      });
      const selection = await findOptimalRatingSbcSelection(
        prepared.entries,
        context.model,
        candidates.piles,
        { selectionPolicy },
      );
      if (selection.ok) return selection;
      lastFailure = selection;
      attemptDiagnostics.push({
        clubFill: clubCount,
        reasonCode: selection.reasonCode || selection.missing?.code || 'RECOVERY_MATERIAL_SHORTAGE',
        reason: selection.reason || selection.missing?.reason || 'no safe rating plan',
        prepared: rollingCandidatePileDiagnostic(prepared.entries),
        policy: selection.details?.policy || null,
        selection: selection.diagnostics?.[0] || null,
      });
    }
    log(`${loopDef.name}: generic Storage pressure raw player diagnostic: ${diagnosticJson(rollingSnapshotPileDiagnostic(snapshot))}`);
    log(`${loopDef.name}: generic Storage pressure safe unique candidate diagnostic: ${diagnosticJson(rollingCandidatePileDiagnostic(candidates.entries))}`);
    log(`${loopDef.name}: generic Storage pressure Storage admission diagnostic: ${diagnosticJson(rollingStorageSinkAdmissionDiagnostic(activeLoopDef, context.model, basePolicy, snapshot, candidates))}`);
    log(`${loopDef.name}: generic Storage pressure required Unassigned diagnostic: ${diagnosticJson(requiredDiagnostic)}`);
    attemptDiagnostics.forEach((diagnostic, index) => {
      log(`${loopDef.name}: generic Storage pressure plan attempt ${index + 1}/${attemptDiagnostics.length}: ${diagnosticJson(diagnostic)}`);
    });
    return {
      ...(lastFailure || {}),
      ok: false,
      reason: lastFailure?.reason || 'no safe generic Storage pressure source plan',
      reasonCode: lastFailure?.reasonCode || 'RECOVERY_MATERIAL_SHORTAGE',
    };
  }

  async function planRollingGenericStorageSinkSquad(loopDef, runtime, context) {
    const snapshot = runtime.coordinator.getLedger().inventorySnapshot();
    const result = await planMultiSquadRatingSelections({
      snapshot,
      contexts: [context],
      selectChallenge: (workingSnapshot) => selectRollingGenericStorageSinkSquad(
        loopDef,
        runtime,
        context,
        workingSnapshot,
      ),
    });
    const strategy = genericStorageSinkSquadSourceStrategy(context?.targetRating);
    return result.ok ? {
      ...result,
      details: {
        ...result.details,
        targetRating: strategy.targetRating,
        sourceOrder: strategy.priorityPiles,
        maxClubPerSquad: strategy.maxClubCount,
      },
    } : result;
  }

  function rollingStorageSinkCapabilities(definition = {}) {
    return [definition?.capability, ...(definition?.alternatives || [])].filter(Boolean);
  }

  async function resumePendingRollingStorageSinkReward(loopDef, runtime, definition) {
    for (const capability of rollingStorageSinkCapabilities(definition)) {
      if (capability.rewardKind !== 'player-pick') continue;
      const selected = await selectPendingRollingStorageSinkPick(
        loopDef,
        runtime,
        { status: 'resolved', loop: capability.loop },
        { attempts: 1, quietMissing: true, failOnUnexpected: false },
      );
      if (selected.status !== 'missing' && selected.status !== 'unavailable') return selected;
    }
    return { status: 'skipped' };
  }

  async function runRollingGenericStorageSinkRecovery(loopDef, runtime, capability) {
    const loaded = await loadRollingGenericStorageSinkContexts(loopDef, capability);
    if (loaded.status !== 'ready') return loaded;
    const context = nextGenericStorageSinkContext(loaded.contexts);
    if (!context) {
      return {
        status: 'unavailable',
        reason: `${loaded.sinkDef.name} has no supported next Storage pressure challenge`,
        reasonCode: 'LIVE_REQUIREMENT_UNAVAILABLE',
      };
    }
    const requiredSpecialRoles = storageSinkRequiredSpecialRoles(context.model);
    log(`${loopDef.name}: ${loaded.sinkDef.name} next live Challenge #${context.challengeId || '?'} target:${context.targetRating}, Required Special:${requiredSpecialRoles.map((role) => role.label).join('/') || 'none'}`);
    const squadPlan = await planRollingGenericStorageSinkSquad(loopDef, runtime, context);
    if (!squadPlan.ok) return { status: 'unavailable', ...squadPlan };
    const finalChallenge = loaded.incompleteCount === 1;
    const headroom = validateRollingStorageSinkHeadroom(runtime, squadPlan, {
      reservePickResult: finalChallenge && Number(capability.rewardReserveSlots || 0) > 0,
    });
    if (!headroom.ok) return { status: 'unavailable', ...headroom };
    const plan = squadPlan.plans[0];
    log(`${loopDef.name}: ${loaded.sinkDef.name} generic ${context.targetRating} squad ready; sources:${formatSelectionStats(squadPlan.pileCounts)}, source order:${squadPlan.details.sourceOrder.join(' -> ')}, Club cap:${squadPlan.details.maxClubPerSquad}, Storage cards:${squadPlan.storageItemsConsumed}, projected free:${headroom.projectedFree}/${headroom.requiredFree} required`);
    logInventorySelection(`${loopDef.name}: ${loaded.sinkDef.name} ${context.targetRating} squad`, plan.selection, { maxItems: 30 });
    if (loaded.sinkDef.dryRun) {
      return { status: 'planned', reason: `dry-run ${loaded.sinkDef.name} next ${context.targetRating} squad plan complete` };
    }
    const result = await submitRollingStorageSinkSquad(
      loopDef,
      runtime,
      loaded.sinkDef,
      plan,
      loaded.completedCount,
      loaded.totalChallengeCount,
    );
    if (!result.submitted) return result;
    const consumedSignalRefs = plan.signalRefs || [];
    runtime.primaryDuplicateRefs = (runtime.primaryDuplicateRefs || []).filter((ref) => (
      !consumedSignalRefs.some((consumedRef) => rollingItemMatchesRef(ref, consumedRef))
    ));
    if (consumedSignalRefs.length) {
      const released = releaseRollingRoutingItemsAfterConsumption(runtime.openRouting, consumedSignalRefs);
      runtime.openRouting = released.routing;
    }
    const reconciled = await reconcileRollingRuntime(runtime, `${loaded.sinkDef.name} ${context.targetRating} squad submitted`);
    if (reconciled.status !== 'ready') return reconciled;
    refreshRollingPendingUnassignedRefs(runtime);
    if (!finalChallenge) {
      return {
        status: 'submitted',
        submitted: true,
        reason: `${loaded.sinkDef.name} ${context.targetRating} squad submitted; remaining squads are deferred until later Storage pressure`,
        details: { submittedRating: context.targetRating, headroom },
      };
    }

    if (capability.rewardKind === 'player-pick') {
      const selected = await selectPendingRollingStorageSinkPick(
        loopDef,
        runtime,
        { status: 'resolved', loop: capability.loop },
        {
          attempts: 10,
          quietMissing: false,
          failOnUnexpected: true,
          duplicatesConsumed: rollingDuplicatePlayerCount(plan.selection?.selected)
            + Number(plan.signalRefs?.length || 0),
        },
      );
      if (selected.status !== 'selected') return { ...selected, status: 'blocked' };
    } else {
      const routed = await resumeRollingPendingUnassigned(loopDef, runtime);
      if (routed.status !== 'ready') return routed;
    }
    const routed = await retryRollingProtectedStorage(loopDef, runtime);
    return routed.status === 'ready'
      ? { status: 'submitted', submitted: true, details: { submittedRating: context.targetRating, headroom } }
      : routed;
  }

  async function runRollingStorageSinkRecovery(loopDef, runtime, definition) {
    const unavailable = [];
    for (const capability of rollingStorageSinkCapabilities(definition)) {
      const result = capability.legacy95
        ? await runRollingLegacyStorageSinkRecovery(
            loopDef,
            runtime,
            { status: 'resolved', loop: capability.loop },
          )
        : await runRollingGenericStorageSinkRecovery(loopDef, runtime, capability);
      if (result?.status !== 'unavailable') return result;
      unavailable.push({ capability, result });
      if (definition?.mode === 'selected') break;
    }
    const failureCodes = [...new Set(unavailable.map(({ result }) => result?.reasonCode).filter(Boolean))];
    const specificFailure = unavailable.length && failureCodes.length === 1
      ? unavailable[0].result
      : null;
    return {
      ...(specificFailure || {}),
      status: 'unavailable',
      reason: unavailable.map(({ capability, result }) => (
        `${capability.setName || `Set #${capability.setId}`}: ${result.reason || 'unavailable'}`
      )).join('; ') || 'no validated Storage pressure SBC capability is available',
      reasonCode: specificFailure?.reasonCode || 'STORAGE_SINK_CAPABILITY_UNAVAILABLE',
      details: {
        ...(specificFailure?.details || {}),
        capabilityFailures: unavailable.map(({ capability, result }) => ({
          setId: capability.setId,
          setName: capability.setName,
          reason: result.reason || null,
          reasonCode: result.reasonCode || null,
        })),
      },
    };
  }

  function publishRollingTelemetry(loopDef, runtime, update = {}) {
    if (!runtime.telemetryActive) return;
    state.runtimeTelemetryController.publish({
      visible: true,
      cycleLimit: Number(loopDef.maxCompletions || 0),
      updatedAt: new Date().toISOString(),
      ...update,
    });
  }

  function requestRollingTelemetryCapabilities(loopDef, runtime) {
    const ledger = runtime.coordinator?.getLedger?.();
    if (!runtime.telemetryActive || !ledger) return;
    const summary = ledger.summary();
    const storage = summary.capacities?.storage || {};
    publishRollingTelemetry(loopDef, runtime, {
      inventoryVersion: summary.inventoryVersion,
      storageUsed: storage.used,
      storageCapacity: storage.max,
      calculating: runtime.telemetryPublishedVersion !== summary.inventoryVersion,
    });
    if (runtime.telemetryPublishedVersion === summary.inventoryVersion) return;

    runtime.telemetryCalculationRequested = true;
    if (runtime.telemetryCalculationRunning) return;
    runtime.telemetryCalculationRunning = true;
    setTimeout(async () => {
      try {
        while (runtime.telemetryActive && runtime.telemetryCalculationRequested) {
          runtime.telemetryCalculationRequested = false;
          const activeLedger = runtime.coordinator?.getLedger?.();
          if (!activeLedger) break;
          const requestedVersion = activeLedger.summary().inventoryVersion;
          const policyKey = [
            loopDef.id,
            rollingProtectionRating(loopDef),
          ].join(':');
          try {
            const capabilities = await runtime.capabilityCalculator.calculate({
              ledger: activeLedger,
              policyKey,
              provisionsRequiredCount: rollingProvisionsRequiredCount(loopDef),
            });
            const currentVersion = runtime.coordinator?.getLedger?.()?.summary?.().inventoryVersion;
            if (!runtime.telemetryActive || currentVersion !== requestedVersion) {
              runtime.telemetryCalculationRequested = runtime.telemetryActive;
              continue;
            }
            runtime.telemetryPublishedVersion = requestedVersion;
            publishRollingTelemetry(loopDef, runtime, capabilities);
          } catch (error) {
            const currentVersion = runtime.coordinator?.getLedger?.()?.summary?.().inventoryVersion;
            if (runtime.telemetryActive && currentVersion === requestedVersion) {
              runtime.telemetryPublishedVersion = requestedVersion;
              publishRollingTelemetry(loopDef, runtime, { calculating: false });
              const reason = String(error?.message || error);
              if (!runtime.telemetryErrorReasons.has(reason)) {
                runtime.telemetryErrorReasons.add(reason);
                log(`${loopDef.name}: Runtime Telemetry capability refresh failed (${reason})`);
              }
            }
          }
        }
      } finally {
        runtime.telemetryCalculationRunning = false;
        if (runtime.telemetryActive && runtime.telemetryCalculationRequested) {
          requestRollingTelemetryCapabilities(loopDef, runtime);
        }
      }
    }, 0);
  }

  function clearUnassignedDuplicateMetadata(item) {
    if (!item) return;
    try { item.duplicateId = 0; } catch { }
    try { if (item._duplicateId !== undefined) item._duplicateId = 0; } catch { }
    try { if (item._data && item._data.duplicateId !== undefined) item._data.duplicateId = 0; } catch { }
    try { eaInventoryAdapter().preparePurchasedItem(item); } catch { }
  }

  async function resumeRollingPendingUnassigned(loopDef, runtime) {
    await refreshInventoryCaches(`${loopDef.name} resume Unassigned`, {
      includePacks: false,
      quiet: true,
    });
    const initialReconciliation = await runtime.coordinator.reconcile(
      `${loopDef.name} resume Unassigned snapshot`,
      { refreshUnassigned: true },
    );
    if (!initialReconciliation.ok) {
      return {
        status: 'blocked',
        reason: initialReconciliation.reason,
        reasonCode: 'INVENTORY_RECONCILIATION_FAILED',
      };
    }

    const unassignedEntries = () => runtime.coordinator.getLedger().classifiedEntries()
      .filter(({ pile }) => pile === 'unassigned');
    let entries = unassignedEntries();
    if (!entries.length) {
      runtime.pendingUnassignedRefs = [];
      return { status: 'ready', primaryPending: false };
    }

    const liveInspection = inspectRollingLiveUnassignedEntries(entries);
    if (!liveInspection.ok) {
      const inspectionRefs = entries.map(({ item }) => liveItemRef(item, 'unassigned'));
      const identity = logRollingInventoryIdentityState(loopDef, runtime, inspectionRefs, 'resume-inspection:identity-failed');
      return {
        status: 'blocked',
        reason: liveInspection.reason,
        reasonCode: liveInspection.reasonCode,
        details: { identity },
      };
    }
    const pendingPickCount = liveInspection.playerPickCount;
    if (pendingPickCount) {
      return {
        status: 'blocked',
        reason: `${pendingPickCount} pending Player Pick item(s) require Pick recovery before Rolling can resume`,
        reasonCode: 'UNASSIGNED_RESUME_PICK_PENDING',
      };
    }

    const duplicateEntries = entries.filter(({ item }) => (
      item?.type === 'player' && item?.duplicate === true
    ));
    const reservedIds = new Set(duplicateEntries
      .map(({ item }) => Number(item?.id || 0))
      .filter(Boolean));

    // The EA live object may retain stale duplicateId data after a previous
    // run moved its Club counterpart. The normalized ledger snapshot is the
    // identity authority for this decision, so clear only contradictory data.
    entries
      .filter(({ item }) => item?.type === 'player' && item?.duplicate !== true)
      .forEach(({ item }) => {
        const live = findCachedItemById(Number(item?.id || 0), ['unassigned']);
        if (live?.item && isDuplicate(live.item) && !findClubDuplicate(live.item)) {
          clearUnassignedDuplicateMetadata(live.item);
        }
      });

    if (entries.length) {
      try {
        await resolveRuntimeUnassigned(`${loopDef.name} resume non-duplicates`, {
          loopDef,
          blockedPolicy: 'preserve',
          enableRecovery: false,
          reserveItem: (item) => reservedIds.has(Number(item?.id || 0)),
        });
      } catch (error) {
        return {
          status: 'blocked',
          reason: error?.message || String(error),
          reasonCode: 'UNASSIGNED_RESUME_ROUTING_BLOCKED',
        };
      }
      const routedReconciliation = await runtime.coordinator.reconcile(
        `${loopDef.name} resume non-duplicates reconciled`,
        { refreshUnassigned: true },
      );
      if (!routedReconciliation.ok) {
        return {
          status: 'blocked',
          reason: routedReconciliation.reason,
          reasonCode: 'INVENTORY_RECONCILIATION_FAILED',
        };
      }
      entries = unassignedEntries();
    }

    const unroutedEntries = entries.filter(({ item }) => (
      item?.type !== 'player' || item?.duplicate !== true
    ));
    if (unroutedEntries.length) {
      return {
        status: 'blocked',
        reason: `${unroutedEntries.length} existing Unassigned item(s) could not be routed before Rolling resume`,
        reasonCode: 'UNASSIGNED_RESUME_ROUTING_BLOCKED',
      };
    }

    const duplicates = entries
      .filter(({ item }) => item?.type === 'player' && item?.duplicate === true)
      .map(({ item }) => item);
    if (!duplicates.length) {
      runtime.pendingUnassignedRefs = [];
      return { status: 'ready', primaryPending: false };
    }

    const routePlan = planRollingOpenedItemRouting(duplicates, {
      protectionRating: rollingProtectionRating(loopDef),
      provisionsMinRating: ROLLING_PROVISIONS_RATING_RANGE.min,
      provisionsMaxRating: rollingProvisionsMaxRating(loopDef),
      storageFree: storageSpaceLeft(),
      provisionsRequiredCount: rollingProvisionsRequiredCount(loopDef),
      provisionsRecoveryAvailable: rollingCapabilityAvailable(loopDef.rollingProvisionsUpgrade),
      proactiveProvisionsEnabled: loopDef.rollingSurplusCraftingEnabled === true,
      storeOtherSpecialDuplicates: rollingPrimaryReservesAllSpecialSlots(runtime.primaryContext?.model),
      isDuplicate: () => true,
      isSpecial: isSbcSpecialItem,
      isRequiredSpecial: (item) => rollingLiveRequiredSpecial(item, runtime.primaryContext?.model),
      protectionReasons: (item) => rollingBaseProtectionReasons(item, loopDef),
      duplicateTargetProtectionReasons: (item) => (
        rollingOpenedDuplicateTargetProtectionReasons(item, loopDef)
      ),
    });

    let finalRoute = routePlan;
    if (routePlan.status === 'ready' && routePlan.storageItems.length) {
      const liveItems = routePlan.storageItems.map((item) => (
        findCachedItemById(Number(item?.id || 0), ['unassigned'])?.item
      ));
      if (liveItems.some((item) => !item)) {
        const routeRefs = routePlan.storageItems.map((item) => liveItemRef(item, 'unassigned'));
        const identity = logRollingInventoryIdentityState(loopDef, runtime, routeRefs, 'resume-storage-route:identity-failed');
        finalRoute = {
          ...routePlan,
          status: 'blocked',
          reason: 'a reconstructed Unassigned duplicate changed before Storage routing',
          reasonCode: 'OPENED_ITEM_ROUTING_PENDING',
          details: {
            ...(routePlan.details || {}),
            identity,
          },
        };
      } else {
        try {
          await moveItems(liveItems, inventoryPile('storage'), true);
          const movedReconciliation = await reconcileRollingRuntime(
            runtime,
            `${loopDef.name} resume protected Storage routing`,
          );
          if (movedReconciliation.status !== 'ready') return movedReconciliation;
        } catch (error) {
          finalRoute = {
            ...routePlan,
            status: 'blocked',
            reason: `reconstructed protected Storage move failed: ${error?.message || error}`,
            reasonCode: 'PROTECTED_STORAGE_BLOCKED',
          };
        }
      }
    }

    const currentEntries = unassignedEntries();
    const pendingRefs = currentEntries
      .filter(({ item }) => item?.type === 'player' && item?.duplicate === true)
      .map(({ item }) => liveItemRef(item, 'unassigned'));
    const primaryRefs = (finalRoute.reservedItems || [])
      .map((item) => liveItemRef(item, 'unassigned'))
      .filter((ref) => pendingRefs.some((candidate) => rollingItemMatchesRef(candidate, ref)));
    runtime.pendingUnassignedRefs = rollingUniqueRefs(pendingRefs);
    runtime.primaryDuplicateRefs = rollingUniqueRefs(primaryRefs);
    runtime.openRouting = {
      ...finalRoute,
      pendingItems: finalRoute.status === 'blocked'
        ? (finalRoute.pendingItems?.length ? finalRoute.pendingItems : finalRoute.storageItems || [])
        : [],
      counts: {
        ...(finalRoute.counts || {}),
        resumed: duplicates.length,
        pending: runtime.pendingUnassignedRefs.length,
      },
    };
    log(`${loopDef.name}: resumed ${duplicates.length} Unassigned duplicate(s); primary:${runtime.primaryDuplicateRefs.length}, pending Storage:${runtime.openRouting.pendingItems.length}, route:${runtime.openRouting.status}`);
    return {
      status: 'ready',
      primaryPending: runtime.primaryDuplicateRefs.length > 0 || finalRoute.status === 'blocked',
      details: {
        resumedDuplicates: duplicates.length,
        primaryDuplicates: runtime.primaryDuplicateRefs.length,
        pendingStorage: runtime.openRouting.pendingItems.length,
      },
    };
  }

  async function runRollingUpgradeLoop(loopDef) {
    await waitAppReady();
    const runtime = {
      primaryContext: null,
      coordinator: null,
      openRouting: null,
      primaryDuplicateRefs: [],
      pendingUnassignedRefs: [],
      pendingRewardPackId: null,
      pendingRecoveryReward: null,
      recoveryDuplicateRefs: [],
      forceChallengeRefresh: false,
      lastMutation: null,
      capabilityCalculator: createInventoryCapabilityCalculator(),
      telemetryActive: true,
      telemetryCalculationRequested: false,
      telemetryCalculationRunning: false,
      telemetryPublishedVersion: null,
      telemetryErrorReasons: new Set(),
    };

    publishRollingTelemetry(loopDef, runtime, {
      phase: ROLLING_UPGRADE_PHASES.PREFLIGHT,
      completedCycles: 0,
      specialSlots: null,
      directCycles: null,
      provisionsBatches: null,
      totwRecoveries: null,
      storageUsed: null,
      storageCapacity: null,
      inventoryVersion: null,
      calculating: true,
    });

    let result;
    try {
      result = await runRollingUpgradeWorkflow({
      maxCompletions: Number(loopDef.maxCompletions || 0),
      storageSinkEnabled: loopDef.rollingStorageSinkEnabled === true,
      surplusCraftingEnabled: loopDef.rollingSurplusCraftingEnabled === true,
      provisionsShortageRecoveryEnabled:
        loopDef.rollingProvisionsShortageRecoveryEnabled === true,
      requiredSpecialRecoveryEnabled:
        loopDef.rollingRequiredSpecialRecoveryEnabled === true,
      shortageProvisionsPackLimit: Number(loopDef.rollingShortageProvisionsPackLimit || 2),
      retainReceipts: false,
      shouldStop: () => state.stopping,
      preflight: async () => {
        if (loopDef.openRewardPacks !== true) {
          return { status: 'blocked', reason: 'Rolling Upgrade requires Open reward packs' };
        }
        runtime.primaryContext = await loadRollingPrimaryContext(loopDef);
        if (runtime.primaryContext.status !== 'ready') return runtime.primaryContext;
        const groupMatcher = eaPlayerGroupConstraints(runtime.primaryContext.model)
          .map(({ constraint }) => `${constraint.label}:${constraint.matcherSource || 'runtime'}`)
          .join(',') || 'none';
        log(`${loopDef.name}: live primary Challenge #${runtime.primaryContext.challenge?.id || '?'} ready; target rating:${runtime.primaryContext.model.targetRating}, players:${runtime.primaryContext.model.requiredPlayerCount}, Required Special matcher:${groupMatcher}, Protection rating:${rollingProtectionRating(loopDef)}`);
        return { status: 'ready' };
      },
      initializeInventory: async () => {
        const inventoryAdapter = adapters.inventory({ capacityFallbacks: { storage: CFG.storageMax } });
        const fsu = fsuAdapter();
        runtime.coordinator = createInventoryLedgerCoordinator({
          readSnapshot: async () => inventoryAdapter.snapshot(),
          readReadiness: async () => fsu.readiness(),
          refreshUnassigned: async () => refreshUnassigned({ quiet: true }),
          snapshotItem: inventoryAdapter.snapshotItem,
          validateClubPlayers: (refs, options) => fsu.validateClubPlayers(refs, options),
          classifyItem: (item) => classifyRollingInventoryItem(item, {
            protectionRating: rollingProtectionRating(loopDef),
            provisionsMinRating: ROLLING_PROVISIONS_RATING_RANGE.min,
            provisionsMaxRating: rollingProvisionsMaxRating(loopDef),
            requiredSpecial: rollingSnapshotRequiredSpecial(item, runtime.primaryContext.activeLoopDef),
            protectionReasons: rollingBaseProtectionReasons(item, runtime.primaryContext.activeLoopDef),
          }),
          log,
        });
        const initialized = await runtime.coordinator.initialize('rolling-start');
        if (initialized.ok) {
          log(`${loopDef.name}: inventory ledger indexed ${initialized.summary.itemCount} local item(s)`);
          return { status: 'ready', details: { inventory: initialized.summary } };
        }
        return { status: 'blocked', reason: initialized.reason, reasonCode: 'INVENTORY_INDEX_UNAVAILABLE' };
      },
      resumePendingPlayerPick: async () => {
        if (loopDef.rollingStorageSinkEnabled !== true) return { status: 'skipped' };
        return resumePendingRollingStorageSinkReward(
          loopDef,
          runtime,
          loopDef.rollingStorageSink,
        );
      },
      resumePendingUnassigned: async () => resumeRollingPendingUnassigned(loopDef, runtime),
      findPrimaryPack: async () => {
        const pack = await findRewardPack(loopDef, runtime.pendingRewardPackId, {
          attempts: runtime.pendingRewardPackId ? 6 : 1,
          delayMs: 1200,
          logWait: runtime.pendingRewardPackId !== null,
          repositoryOnly: true,
        });
        return pack || null;
      },
      openPrimaryPack: async ({ pack }) => {
        runtime.openRouting = null;
        runtime.primaryDuplicateRefs = [];
        runtime.pendingUnassignedRefs = [];
        const routingLoopDef = runtime.primaryContext?.activeLoopDef || loopDef;
        const receipt = await openPack(pack, `${loopDef.name} primary reward`, {
          dryRun: loopDef.dryRun === true,
          allowGone: true,
          allowPendingItems: true,
          returnBlockedReceipt: true,
          retryCodes: ['471', '500'],
          resolveRetryPack: () => findRewardPack(loopDef, runtime.pendingRewardPackId, {
            attempts: 2,
            delayMs: 1200,
            repositoryOnly: true,
          }),
          openedItemPolicy: createRollingPrimaryPackPolicy(routingLoopDef, runtime, {
            capturePrimaryDuplicates: true,
          }),
          settleReceipt: async (openedReceipt) => {
            runtime.pendingRewardPackId = null;
            runtime.lastMutation = await runtime.coordinator.recordPackReceipt(openedReceipt, { reconcile: true });
          },
        });
        if (!receipt) return { status: 'unavailable', reason: 'primary reward pack is unavailable' };
        if (receipt.status === 'opened') {
          runtime.pendingRewardPackId = null;
        }
        return {
          ...receipt,
          inventoryDelta: runtime.lastMutation?.delta || null,
        };
      },
      classifyOpenedItems: async ({ opened }) => ({
        status: 'ready',
        details: opened.details?.counts || runtime.openRouting?.counts || {},
      }),
      resolveProtectedStorage: async () => retryRollingProtectedStorage(loopDef, runtime),
      getProgressFingerprint: () => {
        const summary = runtime.coordinator?.getLedger()?.summary?.();
        return summary ? `inventory:${summary.inventoryVersion}` : null;
      },
      readRecoveryState: async () => {
        const duplicateProvisionRefs = (runtime.openRouting?.provisionsItems || [])
          .map((item) => liveItemRef(item, item?.pile || 'unassigned'));
        if (!duplicateProvisionRefs.length) return { duplicateProvisionBatches: 0 };
        const entries = runtime.coordinator?.getLedger()?.classifiedEntries?.() || [];
        const requiredCount = rollingProvisionsRequiredCount(loopDef);
        return {
          duplicateProvisionBatches: Math.floor(entries.filter(({ item, classification }) => (
            classification.provisionsReserve === true
              && classification.requiredSpecial !== true
              && classification.protected !== true
              && duplicateProvisionRefs.some((ref) => rollingItemMatchesRef(item, ref))
          )).length / requiredCount),
        };
      },
      processPendingRecoveryReward: async () => {
        const pending = runtime.pendingRecoveryReward;
        if (!pending?.definition) return { status: 'skipped' };
        log(`${loopDef.name}: opening newly submitted ${pending.definition.name} reward before the next recovery decision`);
        const pack = await findRewardPack(pending.definition, pending.rewardPackId, {
          attempts: 6,
          delayMs: 1200,
          logWait: true,
          repositoryOnly: true,
        });
        if (!pack) {
          return {
            status: 'blocked',
            reason: `${pending.definition.name} was submitted but its reward pack was not found`,
            reasonCode: 'RECOVERY_REWARD_NOT_FOUND',
          };
        }
        const opened = await openRollingRecoveryReward(loopDef, runtime, pending.definition, pack, {
          captureRecoveryDuplicates: pending.definition.dynamicSbcFamily === 'provisions-upgrade',
        });
        if (opened.status === 'opened') runtime.pendingRecoveryReward = null;
        return opened;
      },
      processLeftoverRecoveryReward: async () => {
        for (const field of ['rollingProvisionsUpgrade', 'rollingGoldSinkUpgrade']) {
          const definition = rollingRecoveryDef(loopDef[field], loopDef, { inventoryFirst: true });
          if (!rollingCapabilityAvailable(definition)) continue;
          const pack = findRewardPackInCache(definition, null, { repositoryOnly: true });
          if (!pack) continue;
          log(`${loopDef.name}: primary fodder shortage; opening existing leftover ${definition.name} reward`);
          const opened = await openRollingRecoveryReward(loopDef, runtime, definition, pack, {
            captureRecoveryDuplicates: definition.dynamicSbcFamily === 'provisions-upgrade',
          });
          return {
            ...opened,
            details: {
              ...(opened.details || {}),
              recoveryFamily: definition.dynamicSbcFamily || field,
            },
          };
        }
        return { status: 'skipped' };
      },
      drainRecoveryDuplicates: async ({ reportPhase } = {}) => {
        await runtime.coordinator.reconcile(`${loopDef.name} recovery duplicate check`, {
          refreshUnassigned: true,
        });
        const unassignedItems = getUnassignedItems();
        const recoveryRefs = rollingUniqueRefs(runtime.recoveryDuplicateRefs || []);
        const goldDuplicates = unassignedItems.filter((item) => (
          recoveryRefs.some((ref) => rollingItemMatchesRef(item, ref))
            && rollingOrdinaryGoldDuplicate(item, runtime.primaryContext?.activeLoopDef || loopDef)
        ));
        runtime.recoveryDuplicateRefs = recoveryRefs.filter((ref) => (
          goldDuplicates.some((item) => rollingItemMatchesRef(item, ref))
        ));
        const rareDuplicates = goldDuplicates.filter(isRare);
        const pickCapability = loopDef.rollingPlayerPick;
        const pendingPickLoop = pickCapability?.status === 'resolved'
          ? await findPendingRollingPlayerPickLoop(pickCapability)
          : null;
        if (pendingPickLoop || rareDuplicates.length) {
          await reportPhase?.(ROLLING_UPGRADE_PHASES.REDEEM_RARE_GOLD_PICK);
          const rareDuplicateRefs = rareDuplicates.map((item) => liveItemRef(item, 'unassigned'));
          const protectedDuplicateRefs = rollingProtectedDuplicateRefs(
            unassignedItems,
            runtime.recoveryDuplicateRefs,
          );
          const pick = await runRollingPlayerPickRecovery(
            loopDef,
            runtime,
            pickCapability?.loop ? pickCapability : null,
            {
              preferredSignalRefs: rareDuplicateRefs,
              protectedDuplicateRefs,
            },
          );
          if (['selected', 'planned', 'blocked', 'stopped'].includes(String(pick?.status || ''))) {
            return pick;
          }
          if (pick?.status !== 'unavailable') return pick;
          log(`${loopDef.name}: Rare Gold Pick recovery unavailable; trying the Gold sink for remaining duplicate Gold`);
        }
        if (!goldDuplicates.length) return { status: 'skipped' };

        await reportPhase?.(ROLLING_UPGRADE_PHASES.CRAFT_5X80);
        const protectedDuplicateRefs = rollingProtectedDuplicateRefs(
          unassignedItems,
          runtime.recoveryDuplicateRefs,
        );
        const sink = await submitRollingRequirementRecovery(
          loopDef,
          runtime,
          loopDef.rollingGoldSinkUpgrade,
          {
            priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
            protectProvisionsReserve: true,
            allowProvisionsReserve: false,
            allowSpecial: false,
            softProtectClubSpecial: false,
            preferredSignalRefs: runtime.recoveryDuplicateRefs,
            requirePreferredSignal: true,
            protectedDuplicateRefs,
          },
        );
        if (sink.status === 'unavailable') {
          log(`${loopDef.name}: Gold duplicate sink cannot form a full squad yet; leaving the duplicate for the primary planner`);
          return { status: 'skipped' };
        }
        if (sink.submitted) {
          runtime.recoveryDuplicateRefs = (runtime.recoveryDuplicateRefs || []).filter((ref) => (
            !(sink.consumedSignalRefs || []).some((consumed) => rollingItemMatchesRef(consumed, ref))
          ));
          runtime.pendingRecoveryReward = {
            definition: sink.recoveryDef,
            rewardPackId: sink.rewardPackId || null,
          };
        }
        return sink;
      },
      recoverProvisions: async ({ context }) => {
        const duplicateReserve = context.trigger === 'duplicate-reserve';
        if (!duplicateReserve && loopDef.rollingProvisionsShortageRecoveryEnabled !== true) {
          return {
            status: 'blocked',
            reason: 'Provisions shortage recovery is disabled in Settings',
            reasonCode: 'PROVISIONS_SHORTAGE_RECOVERY_DISABLED',
          };
        }
        const storagePressure = context.trigger === 'storage-pressure';
        const preferredSignalRefs = duplicateReserve
          ? (runtime.openRouting?.provisionsItems || []).map((item) => liveItemRef(item, 'unassigned'))
          : storagePressure
            ? rollingRecoveryEntryRefs(runtime, ({ pile, classification }) => (
                pile === 'storage'
                  && classification.provisionsReserve === true
                  && classification.requiredSpecial !== true
                  && classification.protected !== true
              ))
            : [];
        const consumableReserveIds = new Set((runtime.openRouting?.entries || [])
          .filter(({ classification }) => classification.provisionsReserve === true)
          .map(({ item }) => Number(item?.id || 0))
          .filter(Boolean));
        const additionalProtected = storagePressure
          ? (runtime.openRouting?.storageItems || [])
              .filter((item) => !consumableReserveIds.has(Number(item?.id || 0)))
              .map((item) => liveItemRef(item, 'unassigned'))
          : [];
        log(`${loopDef.name}: ${storagePressure ? 'emergency' : duplicateReserve ? 'duplicate-reserve' : 'normal'} Provisions recovery (${context.trigger})`);
        const provisionsMaxRating = rollingProvisionsMaxRating(loopDef);
        log(`${loopDef.name}: Provisions material is restricted to ratings ${ROLLING_PROVISIONS_RATING_RANGE.min}-${provisionsMaxRating}`);
        const recovery = await submitRollingRequirementRecovery(
          loopDef,
          runtime,
          loopDef.rollingProvisionsUpgrade,
          {
            priorityPiles: storagePressure
              ? ['storage', 'unassigned', 'transfer', 'club']
              : ['unassigned', 'storage', 'transfer', 'club'],
            additionalProtected,
            allowProvisionsReserve: true,
            allowSpecial: true,
            softProtectClubSpecial: true,
            preferredSignalRefs,
            requirePreferredSignal: duplicateReserve,
            requirePreferredItem: storagePressure,
            validateSelection: storagePressure
              ? ({ storageItemsConsumed }) => validateRollingEmergencyProvisionsSelection(
                  runtime,
                  storageItemsConsumed,
                )
              : null,
            minRating: ROLLING_PROVISIONS_RATING_RANGE.min,
            maxRating: provisionsMaxRating,
          },
        );
        if (recovery.submitted) {
          if (duplicateReserve && recovery.consumedSignalRefs?.length) {
            runtime.openRouting.provisionsItems = (runtime.openRouting.provisionsItems || []).filter((item) => (
              !recovery.consumedSignalRefs.some((ref) => rollingItemMatchesRef(item, ref))
            ));
          }
          if (shouldQueueRollingProvisionsReward(context.trigger, loopDef)) {
            runtime.pendingRecoveryReward = {
              definition: recovery.recoveryDef,
              rewardPackId: recovery.rewardPackId || null,
            };
          } else {
            log(`${loopDef.name}: retained ${context.trigger} Provisions reward in My Packs until primary fodder shortage`);
          }
        }
        return recovery;
      },
      recoverStorageSink: async () => runRollingStorageSinkRecovery(
        loopDef,
        runtime,
        loopDef.rollingStorageSink,
      ),
      recoverRequiredSpecial: async ({ context } = {}) => {
        if (loopDef.rollingRequiredSpecialRecoveryEnabled !== true) {
          return {
            status: 'blocked',
            reason: 'Required Special/TOTW recovery is disabled in Settings',
            reasonCode: 'REQUIRED_SPECIAL_RECOVERY_DISABLED',
          };
        }
        const definition = rollingRecoveryDef(loopDef.rollingTotwUpgrade, loopDef);
        if (!rollingCapabilityAvailable(definition)) {
          return { status: 'unavailable', reason: 'dynamic 84+ TOTW Upgrade capability is unavailable' };
        }
        const pack = await findRewardPack(definition, null, {
          attempts: 2,
          delayMs: 1000,
          fallbackPackMatcher: isLikelyTotwRewardPack,
          repositoryOnly: true,
        });
        const action = chooseRollingRequiredSpecialRecoveryAction({
          hasExistingPack: Boolean(pack),
          hasPendingUnassignedPrimaryDuplicates: (runtime.primaryDuplicateRefs || []).some((ref) => {
            const item = runtime.coordinator?.getLedger?.()?.resolveItem?.(ref);
            return String(item?.pile || item?.ref?.pile || ref?.pile || '') === 'unassigned';
          }),
          trigger: context?.trigger,
        });
        if (action === 'open-existing-pack') {
          log(`${loopDef.name}: opening existing ${definition.name} reward before crafting another`);
          return openRollingRecoveryReward(loopDef, runtime, definition, pack, {
            assumeTotwReward: true,
            fallbackPackMatcher: isLikelyTotwRewardPack,
          });
        }
        if (['craft-storage-pressure', 'craft-with-pending-duplicates'].includes(action)) {
          if (pack) {
            log(`${loopDef.name}: existing ${definition.name} reward cannot open while primary duplicates remain Unassigned; consuming those duplicates before opening the reward`);
          }
          if (action === 'craft-storage-pressure') {
            log(`${loopDef.name}: Storage pressure SBC lacks its Required Special; crafting ${definition.name} from Storage before retrying Storage routing`);
          } else {
            log(`${loopDef.name}: consuming exact pending Unassigned primary duplicates in ${definition.name} before creating or opening its reward`);
          }
          return submitRollingRatingRecovery(loopDef, runtime, definition, {
            priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
            allowPrimaryDuplicates: true,
            validateSelection: ({ storageItemsConsumed, consumedPrimaryRefs }) => (
              validateRollingEmergencyProvisionsSelection(runtime, storageItemsConsumed, {
                consumedPendingRefs: consumedPrimaryRefs,
              })
            ),
          });
        }
        log(`${loopDef.name}: no eligible Required Special or existing TOTW reward; planning one ${definition.name}`);
        return submitRollingRatingRecovery(loopDef, runtime, definition);
      },
      maintainStorage: async () => {
        const ledger = runtime.coordinator?.getLedger?.();
        if (!ledger) return { status: 'skipped', reason: 'inventory ledger is unavailable' };
        const provisionsRequiredCount = rollingProvisionsRequiredCount(loopDef);
        const maintenance = planRollingStorageMaintenance({
          ledger,
          protectedItems: [
            ...(runtime.primaryDuplicateRefs || []),
            ...(runtime.pendingUnassignedRefs || []),
          ],
          provisionsRequiredCount,
          totwRequiredCount: 11,
          maxRating: rollingProtectionRating(loopDef),
        });
        if (maintenance.status !== 'ready') return { status: 'skipped' };

        log(`${loopDef.name}: Storage maintenance plan Provisions ${maintenance.provisions.eligible}/${maintenance.provisions.requiredCount} (${maintenance.provisions.batches} batch(es)); TOTW targets ${maintenance.totw.eligible}/${maintenance.totw.requiredCount}; action:${maintenance.action}`);
        if (maintenance.action === 'provisions') {
          const batchRefs = maintenance.provisions.nextBatchRefs;
          const protectedStorageReserveRefs = rollingRecoveryEntryRefs(runtime, ({ item, pile }) => (
            pile === 'storage'
              && [87, 88].includes(Number(item?.rating || 0))
              && !batchRefs.some((ref) => rollingItemMatchesRef(item, ref))
          ));
          const recovery = await submitRollingRequirementRecovery(
            loopDef,
            runtime,
            loopDef.rollingProvisionsUpgrade,
            {
              priorityPiles: ['storage'],
              additionalProtected: protectedStorageReserveRefs,
              allowProvisionsReserve: true,
              allowSpecial: true,
              softProtectClubSpecial: false,
              preferredSignalRefs: batchRefs,
              requirePreferredItem: true,
              minRating: 87,
              maxRating: 88,
            },
          );
          if (recovery.submitted) {
            log(`${loopDef.name}: retained Storage-maintenance Provisions reward in My Packs until primary fodder shortage`);
          }
          return {
            ...recovery,
            details: {
              ...(recovery.details || {}),
              action: 'provisions',
              storageTargets: batchRefs.length,
            },
          };
        }

        const definition = rollingRecoveryDef(loopDef.rollingTotwUpgrade, loopDef);
        if (!rollingCapabilityAvailable(definition)) {
          return { status: 'unavailable', reason: 'dynamic 84+ TOTW Upgrade capability is unavailable' };
        }
        const existingPack = await findRewardPack(definition, null, {
          attempts: 1,
          delayMs: 0,
          fallbackPackMatcher: isLikelyTotwRewardPack,
          repositoryOnly: true,
        });
        if (existingPack) {
          log(`${loopDef.name}: Storage maintenance opening existing ${definition.name} reward before crafting another`);
          return openRollingRecoveryReward(loopDef, runtime, definition, existingPack, {
            assumeTotwReward: true,
            fallbackPackMatcher: isLikelyTotwRewardPack,
          });
        }

        const candidateRefs = maintenance.totw.candidateRefs;
        const protectedNonTargetStorageRefs = rollingRecoveryEntryRefs(runtime, ({ item, pile }) => (
          pile === 'storage'
            && !candidateRefs.some((ref) => rollingItemMatchesRef(item, ref))
        ));
        const recovery = await submitRollingRatingRecovery(
          loopDef,
          runtime,
          definition,
          {
            priorityPiles: ['storage', 'transfer', 'club'],
            requiredItems: candidateRefs.slice(0, 1),
            preferredItems: candidateRefs,
            additionalProtected: protectedNonTargetStorageRefs,
            maxOrdinaryRating: 89,
          },
        );
        if (!recovery.submitted) {
          const optionalShortage = [
            'PLAYER_COUNT_SHORTAGE',
            'SQUAD_RATING_SHORTAGE',
            'SQUAD_RATING_EXCESS',
            'RESERVED_FODDER_BLOCKED',
            'RECOVERY_MATERIAL_SHORTAGE',
          ].includes(String(recovery.reasonCode || ''));
          return optionalShortage
            ? { status: 'skipped', reason: recovery.reason, reasonCode: recovery.reasonCode }
            : recovery;
        }

        const rewardPack = await findRewardPack(definition, recovery.rewardPackId || null, {
          attempts: 6,
          delayMs: 1200,
          logWait: true,
          fallbackPackMatcher: isLikelyTotwRewardPack,
          repositoryOnly: true,
        });
        if (!rewardPack) {
          return {
            status: 'blocked',
            reason: `${definition.name} was submitted but its reward pack was not found`,
            reasonCode: 'RECOVERY_REWARD_NOT_FOUND',
          };
        }
        const openedReward = await openRollingRecoveryReward(
          loopDef,
          runtime,
          definition,
          rewardPack,
          {
            assumeTotwReward: true,
            fallbackPackMatcher: isLikelyTotwRewardPack,
          },
        );
        return {
          ...openedReward,
          details: {
            ...(openedReward.details || {}),
            action: 'totw',
            storageTargets: candidateRefs.length,
          },
        };
      },
      planPrimarySquad: async () => {
        runtime.primaryContext = await loadRollingPrimaryContext(loopDef, {
          force: runtime.forceChallengeRefresh,
        });
        runtime.forceChallengeRefresh = false;
        if (runtime.primaryContext.status !== 'ready') {
          return {
            ok: false,
            reason: runtime.primaryContext.reason,
            reasonCode: runtime.primaryContext.reasonCode || 'PRIMARY_SBC_UNAVAILABLE',
          };
        }
        const { activeLoopDef, challenge, model, set } = runtime.primaryContext;
        const preservedPrimary = runtime.openRouting
          ? preserveRollingPrimaryDuplicateRefs(runtime, runtime.openRouting)
          : { captured: true, count: 0 };
        if ((runtime.openRouting?.reservedItems || []).length
          && preservedPrimary.captured !== true
          && !(runtime.primaryDuplicateRefs || []).length) {
          log(`${loopDef.name}: primary duplicate context was lost before primary squad planning: ${diagnosticJson({
            routingStatus: runtime.openRouting?.status || null,
            routingReasonCode: runtime.openRouting?.reasonCode || null,
            unresolved: runtime.openRouting?.counts?.unresolved ?? null,
            reservedItems: runtime.openRouting?.reservedItems?.length || 0,
          })}`);
          return {
            ok: false,
            reason: 'materialized primary duplicate context is unavailable before primary squad planning',
            reasonCode: 'PRIMARY_DUPLICATE_CONTEXT_LOST',
          };
        }
        let primaryDuplicateRefs = rollingUniqueRefs(runtime.primaryDuplicateRefs || []);
        let primaryIdentity = validateRollingPrimaryDuplicateIdentity({
          ledger: runtime.coordinator.getLedger(),
          primaryDuplicateRefs,
        });
        if (!primaryIdentity.ok) {
          log(`${loopDef.name}: reserved primary duplicate identity changed: ${diagnosticJson(primaryIdentity.missingRefs)}`);
          return {
            ok: false,
            reason: primaryIdentity.reason,
            reasonCode: primaryIdentity.reasonCode,
            details: { missingPrimaryDuplicateRefs: primaryIdentity.missingRefs },
          };
        }
        const protectionConflicts = rollingPrimaryDuplicateProtectionConflicts({
          ledger: runtime.coordinator.getLedger(),
          model,
          protectionRating: rollingProtectionRating(loopDef),
          reserveRatings: loopDef.rollingSurplusCraftingEnabled === true
            ? rollingProvisionsReserveRatings(loopDef)
            : false,
          primaryDuplicateRefs,
          isTransientSubmissionAllowed: (item) => (
            isRollingTransientSubmissionAllowed(item, activeLoopDef)
          ),
        });
        if (protectionConflicts.refs.length) {
          const conflictCount = protectionConflicts.refs.length;
          stageRollingDeferredPrimaryStorage(runtime, protectionConflicts.refs, {
            reason: `${conflictCount} primary-pack duplicate target(s) became protected after live requirement refresh`,
            protectionConflict: true,
            protectedPrimaryDuplicateRefs: protectionConflicts.refs,
            protectedSubmissionRefs: protectionConflicts.submissionRefs,
          });
          log(`${loopDef.name}: rerouting ${conflictCount} protected primary duplicate(s) to Storage before squad planning`);
          if (loopDef.dryRun) {
            return {
              ok: false,
              reason: runtime.openRouting.reason,
              reasonCode: 'PROTECTED_STORAGE_BLOCKED',
              details: runtime.openRouting.details,
            };
          }
          const rerouted = await retryRollingProtectedStorage(activeLoopDef, runtime);
          if (rerouted.status !== 'ready') {
            return {
              ok: false,
              reason: rerouted.reason || runtime.openRouting.reason,
              reasonCode: rerouted.reasonCode || 'PROTECTED_STORAGE_BLOCKED',
              details: rerouted.details || runtime.openRouting.details,
            };
          }
          primaryDuplicateRefs = rollingUniqueRefs(runtime.primaryDuplicateRefs || []);
          primaryIdentity = validateRollingPrimaryDuplicateIdentity({
            ledger: runtime.coordinator.getLedger(),
            primaryDuplicateRefs,
          });
          if (!primaryIdentity.ok) {
            return {
              ok: false,
              reason: primaryIdentity.reason,
              reasonCode: primaryIdentity.reasonCode,
              details: { missingPrimaryDuplicateRefs: primaryIdentity.missingRefs },
            };
          }
        }
        const relaxationOrder = rollingPrimaryDuplicateRelaxationOrder({
          ledger: runtime.coordinator.getLedger(),
          primaryDuplicateRefs,
        });
        const requiredSpecialSourceFilter = createRollingRequiredSpecialSourceFilter({
          constraintIndexes: rollingRequiredSpecialConstraintIndexes(model),
          isClubTotw: isTotwItem,
          resolveSubmissionPile: rollingSelectionSubmissionPile,
        });
        let relaxedPrimaryDuplicateRefs = [];
        let selectionPolicy = null;
        let fill = null;
        while (true) {
          selectionPolicy = {
            ...createRollingPrimarySelectionPolicy({
              ledger: runtime.coordinator.getLedger(),
              model,
              protectionRating: rollingProtectionRating(loopDef),
              reserveRatings: loopDef.rollingSurplusCraftingEnabled === true
                ? rollingProvisionsReserveRatings(loopDef)
                : false,
              primaryDuplicateRefs,
              relaxedPrimaryDuplicateRefs,
              isTransientSubmissionAllowed: (item) => (
                isRollingTransientSubmissionAllowed(item, activeLoopDef)
              ),
            }),
            candidateFilter: requiredSpecialSourceFilter,
          };
          fill = await fillSbcSquadRatingOptimized(activeLoopDef, {
            set,
            challenge,
            background: true,
          }, {
            dryRun: loopDef.dryRun === true,
            selectionPolicy,
            skipInventoryRefresh: relaxedPrimaryDuplicateRefs.length > 0,
          });
          if (!fill.ok || Number(fill.optimizedRating || 0) <= Number(model.targetRating || 0)) break;
          const nextRef = relaxationOrder[relaxedPrimaryDuplicateRefs.length];
          if (!nextRef) break;
          relaxedPrimaryDuplicateRefs.push(nextRef);
          log(`${loopDef.name}: primary rating ${fill.optimizedRating} exceeds target ${model.targetRating}; replacing duplicate #${nextRef.id || nextRef.definitionId} with lower-rated Storage material`);
        }
        if (!fill.ok) {
          const reasonCode = fill.reasonCode || fill.missing?.code || 'PRIMARY_SQUAD_INFEASIBLE';
          const reason = fill.reason || 'primary squad is infeasible';
          log(`${loopDef.name}: primary squad planner blocked (${reasonCode}): ${reason}`);
          if (reasonCode === 'REQUIRED_ITEM_UNAVAILABLE') {
            const requiredDiagnostics = fill.candidates?.requiredItemDiagnostics || [];
            const unavailable = requiredDiagnostics.filter((entry) => entry?.candidateAfterPolicy !== true);
            log(`${loopDef.name}: required item candidate diagnostic summary: required:${requiredDiagnostics.length}, unavailable:${unavailable.length}, candidate definitions:${fill.candidates?.entries?.length || 0}`);
            unavailable.slice(0, 16).forEach((entry, index) => {
              log(`${loopDef.name}: required item candidate diagnostic ${index + 1}/${unavailable.length}: ${diagnosticJson(entry)}`);
            });
            if (unavailable.length > 16) {
              log(`${loopDef.name}: required item candidate diagnostics truncated: ${unavailable.length - 16} more item(s)`);
            }
          }
          (fill.selection?.diagnostics || []).slice(0, 5).forEach((diagnostic) => {
            const serialized = typeof diagnostic === 'string' ? diagnostic : JSON.stringify(diagnostic);
            const bounded = serialized.length > 1800 ? `${serialized.slice(0, 1800)}...` : serialized;
            log(`${loopDef.name}: primary planner diagnostic: ${bounded}`);
          });
          return {
            ok: false,
            reason,
            reasonCode,
            missing: fill.missing || null,
            diagnostics: fill.selection?.diagnostics || [],
          };
        }
        const sourceErrors = rollingRequiredSpecialSourceErrors(fill.selection, model);
        if (sourceErrors.length) {
          return {
            ok: false,
            reason: `Required Special source policy failed: ${sourceErrors.join(', ')}`,
            reasonCode: 'REQUIRED_SPECIAL_SOURCE_POLICY_BLOCKED',
          };
        }
        const targetRating = Number(model.targetRating || 0);
        if (Number(fill.optimizedRating || 0) > targetRating) {
          return {
            ok: false,
            reason: `primary squad cannot reach target rating ${targetRating} without exceeding it after all primary-pack duplicates are relaxed`,
            reasonCode: 'SQUAD_RATING_EXCESS',
            diagnostics: fill.selection?.diagnostics || [],
          };
        }
        const consumedPrimaryRefs = rollingSelectionConsumedPrimaryRefs(
          fill.selection,
          primaryDuplicateRefs,
        );
        const deferredPrimaryRefs = primaryDuplicateRefs.filter((ref) => (
          !consumedPrimaryRefs.some((consumed) => rollingItemMatchesRef(consumed, ref))
        ));
        if (deferredPrimaryRefs.length) {
          const deferredItems = deferredPrimaryRefs
            .map((ref) => runtime.coordinator.getLedger().resolveItem(ref))
            .filter(Boolean);
          const pendingUnassigned = deferredItems.filter((item) => (
            String(item?.pile || item?.ref?.pile || '') === 'unassigned'
          )).length;
          const selectedStorage = rollingSelectionStorageConsumption(runtime, fill.selection);
          const storageFree = storageSpaceLeft();
          if (storageFree === null || pendingUnassigned > storageFree + selectedStorage) {
            stageRollingDeferredPrimaryStorage(runtime, deferredPrimaryRefs, {
              reason: `primary rating normalization needs ${pendingUnassigned} Storage slot(s), but only ${storageFree === null ? 'an unknown number of' : storageFree + selectedStorage} will be available after submission`,
              storageFree,
              projectedStorageFree: storageFree === null ? null : storageFree + selectedStorage,
              storageRequired: pendingUnassigned,
            });
            return {
              ok: false,
              reason: runtime.openRouting.reason,
              reasonCode: 'PROTECTED_STORAGE_BLOCKED',
              details: runtime.openRouting.details,
            };
          }
        }
        if (!loopDef.dryRun && fill.fillResult?.submitReady !== true) {
          return {
            ok: false,
            reason: 'planned primary squad is not submit ready',
            reasonCode: 'PRIMARY_SUBMISSION_NOT_READY',
          };
        }
        return {
          ok: true,
          opened: { set, challenge, background: true },
          activeLoopDef,
          selectionPolicy,
          fill,
          deferredPrimaryRefs,
        };
      },
      submitPrimary: async ({ plan }) => {
        if (loopDef.dryRun) {
          return { status: 'planned', reason: 'dry-run primary squad plan complete' };
        }
        const { opened, activeLoopDef, selectionPolicy, fill } = plan;
        const players = fill.inspection?.items || fill.selection?.selected || [];
        const itemRefs = players.map((item) => liveItemRef(item));
        const ledgerValidation = await runtime.coordinator.validateBeforeSubmit(itemRefs, {
          label: loopDef.name,
          reason: 'rolling-primary-pre-submit',
        });
        if (!ledgerValidation.ok) {
          return {
            status: 'blocked',
            reason: ledgerValidation.reason,
            reasonCode: 'INVENTORY_VALIDATION_FAILED',
          };
        }
        let backgroundSubmission = null;
        runtime.lastMutation = null;
        const submission = await submitSbcAttempt({
          label: loopDef.name,
          challengeProvider: async () => opened,
          squadProvider: createExistingSquadProvider({
            getPlayers: async () => players,
            itemRef: liveItemRef,
            selection: fill.selection,
            source: 'rolling-rating-squad',
          }),
          prepareRuntimeAccess: prepareFsuRuntimeAccess,
          preparePlayers: (context) => prepareRollingUntradeableDuplicateSwaps(context, runtime),
          saveSquad: async ({ challenge, players: refreshedPlayers, runtimeAccess, playerPreparation }) => {
            await saveRollingProvisionalClubSquad(
              challenge,
              refreshedPlayers,
              runtimeAccess,
              `${loopDef.name} provisional Club refresh`,
              playerPreparation,
            );
          },
          preSaveValidators: [({ squadPlan }) => {
            assertSbcSquadSafe(activeLoopDef, fill.inspection);
            const finalSelection = squadPlan?.selection || fill.selection;
            const sourceErrors = rollingRequiredSpecialSourceErrors(finalSelection, fill.model);
            if (sourceErrors.length) {
              fail(`${loopDef.name}: final Rolling squad violated Required Special source policy: ${sourceErrors.join(', ')}`);
            }
            const strictSourceErrors = rollingClubNonTotwSpecialSourceErrors(
              finalSelection,
              activeLoopDef,
            );
            if (strictSourceErrors.length) {
              fail(`${loopDef.name}: final Rolling squad violated strict Club special protection: ${strictSourceErrors.join(', ')}`);
            }
            const validation = validateRatingSbcModelAgainstItems(
              fill.model,
              fill.inspection.items,
              opened.challenge,
              {
                exclusiveRoles: selectionPolicy.exclusiveRoles,
                allowOtherSpecialAsOrdinary: true,
              },
            );
            if (!validation.ok) {
              fail(`${loopDef.name}: final Rolling squad failed dynamic requirement validation: ${validation.errors.join(', ')}`);
            }
            return true;
          }],
          isSubmitReady: async () => fill.fillResult?.submitReady === true,
          submitTransport: async (context) => {
            backgroundSubmission = await submitRatingSbcInBackground(
              context.set,
              context.challenge,
              loopDef.name,
              {
                players: context.players || players,
                allowItemViolationOverride: true,
                allowKnownRewardFallback: Number(activeLoopDef.dynamicChallengeCount || 1) <= 1,
                failureInventoryDiagnostic: ({ players: attemptedPlayers }) => (
                  rollingBackgroundSubmitInventoryDiagnostic(runtime, attemptedPlayers)
                ),
              },
            );
            return { submitted: true, rewardPackId: backgroundSubmission.rewardPackId };
          },
          runCommittedSubmit: runCommittedSbcSubmit,
          onResult: async (submissionResult) => {
            runtime.lastMutation = await runtime.coordinator.recordSubmission(submissionResult, {
              primary: true,
            });
          },
          afterSubmit: async ({ players: submittedPlayers, savedPlayers, squadPlan }) => {
            await finalizeSubmittedInventorySelection(
              squadPlan?.selection || fill.selection,
              loopDef.name,
              savedPlayers?.length ? savedPlayers : submittedPlayers,
            );
          },
        });
        if (submission.submitted && !runtime.lastMutation) {
          runtime.lastMutation = await runtime.coordinator.recordSubmission(submission, {
            primary: true,
          });
        }
        if (submission.submitted) {
          runtime.pendingRewardPackId = submission.rewardPackId || null;
          runtime.forceChallengeRefresh = true;
          recordRollingRecapDuplicateRoute('primary', rollingDuplicatePlayerCount(fill.selection));
          const deferredStorage = await routeRollingDeferredPrimaryStorage(
            loopDef,
            runtime,
            plan.deferredPrimaryRefs || [],
          );
          if (deferredStorage.status !== 'ready') {
            return {
              ...submission,
              postSubmitBlocked: true,
              reason: deferredStorage.reason,
              reasonCode: deferredStorage.reasonCode,
            };
          }
          runtime.primaryDuplicateRefs = [];
          refreshRollingPendingUnassignedRefs(runtime);
        }
        return {
          ...submission,
          inventoryDelta: runtime.lastMutation?.delta || null,
          details: {
            rewardObserved: backgroundSubmission?.rewardObserved === true,
          },
        };
      },
      reconcile: async () => {
        const ledger = runtime.coordinator.getLedger();
        if (!ledger.summary().needsReconciliation) return { status: 'ready' };
        const reconciliation = await runtime.coordinator.reconcile('rolling-post-primary');
        return reconciliation.ok
          ? { status: 'ready' }
          : { status: 'blocked', reason: reconciliation.reason };
      },
      onEvent: async (event, payload) => {
        if (event === 'phase') {
          publishRollingTelemetry(loopDef, runtime, {
            phase: payload.phase,
            completedCycles: payload.completions,
          });
          requestRollingTelemetryCapabilities(loopDef, runtime);
          log(`${loopDef.name}: ${payload.phase} (primary ${payload.completions}/${Number(loopDef.maxCompletions || 0) || 'no limit'})`);
        } else if (event === 'recovery') {
          log(`${loopDef.name}: recovery ${payload.kind} progressed (${payload.trigger || 'unspecified'}); cycle ${payload.cycleRecoveries.total}/${payload.budgets?.total || 'budgeted'}`);
        } else if (event === 'progress') {
          log(`${loopDef.name}: primary completions ${payload.completions}; opened ${payload.packsOpened}; bootstrap ${payload.bootstrapSubmissions}`);
        }
      },
      });
      const telemetry = state.runtimeTelemetryController.getSnapshot();
      const ledgerSummary = runtime.coordinator?.getLedger?.()?.summary?.() || {};
      const storage = ledgerSummary.capacities?.storage || {};
      result.finalResources = {
        specialSlots: telemetry.specialSlots,
        directCycles: telemetry.directCycles,
        provisionsBatches: telemetry.provisionsBatches,
        totwRecoveries: telemetry.totwRecoveries,
        storage: storage.used === null || storage.used === undefined || storage.max === null || storage.max === undefined
          ? null
          : `${storage.used}/${storage.max}`,
        inventoryVersion: ledgerSummary.inventoryVersion ?? telemetry.inventoryVersion,
      };
    } finally {
      runtime.telemetryActive = false;
    }
    log(`${loopDef.name}: ${result.status}; primary completions:${result.completions}, packs opened:${result.packsOpened}, recoveries:${result.recoveries?.total || 0}${result.reason ? `, reason:${result.reasonCode || 'unknown'} ${result.reason}` : ''}`);
    return result;
  }

  function unresolvedRequiredMaterialActivities(value, path = 'Loop', visited = new WeakSet()) {
    if (!value || typeof value !== 'object') return [];
    if (visited.has(value)) return [];
    visited.add(value);
    if (Array.isArray(value)) {
      return value.flatMap((entry, index) => unresolvedRequiredMaterialActivities(entry, `${path}[${index}]`, visited));
    }
    const binding = value.activityBinding;
    const current = binding?.required === true
      && MATERIAL_SINK_BASELINES[binding.family]
      && value.activityResolved !== true
      ? [{ path, family: binding.family }]
      : [];
    return [
      ...current,
      ...Object.entries(value).flatMap(([key, entry]) => (
        unresolvedRequiredMaterialActivities(entry, `${path}.${key}`, visited)
      )),
    ];
  }

  async function runConfiguredLoop(loopDef, roundNo = 1) {
    const unresolvedActivities = loopDef.strategy === 'rollingUpgrade'
      ? []
      : unresolvedRequiredMaterialActivities(loopDef, loopDef.name || loopDef.id || 'Loop');
    if (unresolvedActivities.length) {
      const reason = `required scanned material activity unavailable: ${unresolvedActivities.map((entry) => `${entry.family} at ${entry.path}`).join(', ')}`;
      log(`${loopDef.name}: ${reason}; stopping before pack or SBC actions`);
      return { status: 'unavailable', reason };
    }
    state.loopStack.push(loopDef);
    try {
      return await dispatchConfiguredWorkflow({
        loopDef,
        roundNo,
        log,
        runners: {
          validationBronzeUpgrade: runValidationBronzeUpgrade,
          dailyRoutine: runDailySequence,
          workflowRoutine: runWorkflowRoutine,
          dailySingleCardRecycle: runRecycleLoop,
          supplyAndCraft: runSupplyAndCraftLoop,
          provisionPackCrafting: runProvisionCraftLoop,
          rarePackTo84Upgrade: runRarePackCraftLoop,
          playerPickSbc: runPlayerPickLoop,
          fillAndVerifySbc: runFillAndVerifyLoop,
          inventoryExhaustion: runInventoryExhaustionLoop,
          rollingUpgrade: runRollingUpgradeLoop,
        },
        afterStandardRun: async (definition) => {
          await showUnassignedIfAny(`${definition.name} end`);
        },
        afterPlayerPickRun: async (definition, result) => {
          const pickResults = result.pickResults || [];
          if (!pickResults.length && result.status === 'completed' && !result.reason) {
            await showUnassignedIfAny(`${definition.name} end`);
            return;
          }
          if (!hasPlayerPickRecapCards(pickResults)) {
            log(`${definition.name}: Pick results contain no selected card; Pick recap skipped`);
            await showUnassignedIfAny(`${definition.name} end`);
            return;
          }
          state.lastPickRecap = {
            name: definition.name,
            pickResults,
            status: result.status,
            reason: result.reason,
            completedAt: Date.now(),
          };
          state.lastRecapType = 'pick';
          updateRecapButton();
          await showPickRecapModal(definition, pickResults, result);
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
    let fsuReadiness = null;
    let runStatus = 'completed';
    let runReason = null;
    let runResult = null;

    try {
      loopDef = getSelectedLoopDef();
      const quantity = resolveRuntimeQuantity(loopDef);
      const input = document.querySelector('#bronze-loop-rounds');
      rounds = quantity?.mode === 'user'
        ? Math.max(quantity.min, Math.min(quantity.max, Number(input?.value || quantity.default) || quantity.default))
        : 1;
      applyLoopRuntimeOptions(loopDef, {
        rounds,
        openRewardPacks: isOpenRewardPacksEnabled(),
        inventoryOnly: document.querySelector('#bronze-loop-daily-inventory-only')?.checked === true,
        pickOptions: getPickRuntimeOptions(),
        sbcFodderPolicy: getSbcFodderRuntimeOptions(),
      });
      assertRollingRuntimePreflight(loopDef);
      const fodderPolicy = getSbcFodderPolicy(loopDef);
      if (loopDef.strategy === 'rollingUpgrade') {
        const storageSinkSummary = loopDef.rollingStorageSinkEnabled
          ? `${loopDef.rollingStorageSink?.mode || 'automatic'}/${loopDef.rollingStorageSink?.capability?.setName || 'unavailable'}`
          : 'off';
        log(`${loopDef.name}: Rolling automatic-use max rating <= ${rollingProtectionRating(loopDef)}; ordinary Rating SBC card cap ${fodderPolicy.ratingSbcMaxCardRating} does not apply; shortage Provisions batch ${loopDef.rollingShortageProvisionsPackLimit || 2}; surplus Provisions/TOTW ${loopDef.rollingSurplusCraftingEnabled ? 'enabled' : 'off'}; Provisions shortage recovery ${loopDef.rollingProvisionsShortageRecoveryEnabled ? 'allowed' : 'off'}; Required Special/TOTW recovery ${loopDef.rollingRequiredSpecialRecoveryEnabled ? 'allowed' : 'off'}; Club non-TOTW specials ${loopDef.rollingProtectAllClubNonTotwSpecials ? 'protected' : 'last-resort fallback'}; Storage pressure SBC ${storageSinkSummary}`);
      } else {
        log(`${loopDef.name}: SBC fodder policy mode:${fodderPolicy.mode}; low-rated normal Gold <= ${fodderPolicy.lowRatedGoldMaxRating}; rating SBC all cards <= ${fodderPolicy.ratingSbcMaxCardRating}`);
      }
      if (Number(loopDef.runtimeRounds) > 0) {
        rounds = Number(loopDef.runtimeRounds || rounds || 1);
      }
      logFsuSettingsForRun();
      fsuReadiness = fsuAdapter().readiness();
      if (fsuReadiness.detected && !fsuReadiness.ready) {
        fail(`FSU Club player data is ${fsuReadiness.state === 'loading' ? 'still loading in the background' : 'not ready'}; wait for the FSU player-data success notice, then click Start again`);
      }
    } catch (e) {
      log(`Stopped: ${e.message || e}`);
      errorStackLines(e).forEach((line) => log(`Error stack: ${line}`));
      console.error(CONSOLE_PREFIX, e);
      return;
    }

    state.running = true;
    state.stopping = false;
    state.runtimeTelemetryController.hide({
      phase: '',
      completedCycles: 0,
      cycleLimit: 0,
      specialSlots: null,
      directCycles: null,
      provisionsBatches: null,
      totwRecoveries: null,
      storageUsed: null,
      storageCapacity: null,
      inventoryVersion: null,
    });
    state.sbcLoadLogKeys.clear();
    beginLoopRecapSession(loopDef);
    if (fsuReadiness?.state === 'provisional') {
      log(`FSU Club cache is provisional (${fsuReadiness.cacheStatus}); selected Club players will be validated against EA before each SBC save`);
    }
    setPanelState();
    try {
      if (loopDef.dryRun || loopDef.strategy !== 'validationBronzeUpgrade') {
        stopPoint();
        runResult = await runConfiguredLoop(loopDef, 1);
      } else {
        for (let i = 1; i <= rounds; i++) {
          stopPoint();
          runResult = await runConfiguredLoop(loopDef, i);
          await sleep(CFG.pauseMs);
      }
    }

      if (runResult?.status && runResult.status !== 'completed') {
        runStatus = String(runResult.status);
        runReason = runResult.reason || null;
      }

      if (runStatus === 'completed') {
        log('All requested rounds completed');
      } else {
        log(`Run ended before all requested work completed; status:${runStatus}; reason:${runReason || 'unknown'}`);
      }
    } catch (e) {
      runStatus = state.stopping ? 'stopped' : 'blocked';
      runReason = e?.message || String(e);
      log(`Stopped: ${e.message || e}`);
      errorStackLines(e).forEach((line) => log(`Error stack: ${line}`));
      console.error(CONSOLE_PREFIX, e);
    } finally {
      state.running = false;
      state.stopping = false;
      state.runtimeTelemetryController.hide();
      setPanelState();
      await finalizeLoopRecap(loopDef, runStatus, runReason, runResult);
    }
  }

  function setPanelState() {
    renderMainPanelRuntimeState({
      panel: document.querySelector('#bronze-loop-panel'),
        state: {
          running: state.running,
          stopping: state.stopping,
          refreshing: state.refreshing,
          scanningPicks: state.scanningPicks,
          dynamicSbcScanProgress: state.dynamicSbcScanProgress,
          loadingLoops: state.loadingLoops,
          runtimeTelemetry: state.runtimeTelemetry,
          pickOptions: state.pickOptions,
          sbcFodderOptions: state.sbcFodderOptions,
          usingBuiltIn: state.loopConfigSource === 'built-in'
          && !state.workflowBuilder?.getStore?.().activeProfileId,
      },
      setMobileTab: (tab) => state.panelGeometry?.setMobileTab?.(tab),
    });
    updateLoopControls();
  }

  function renderProfileSelect() {
    const builder = state.workflowBuilder;
    if (!builder) return null;
    return renderMainPanelProfileOptions({
      panel: document.querySelector('#bronze-loop-panel'),
      profiles: builder.listRuntimeProfiles(),
      selectedId: builder.getSelectedRuntimeProfileId(),
      createOption: () => document.createElement('option'),
    });
  }

  function installPanel() {
    const mounted = mountMainPanel({
      dom: adapters.dom,
      maxRounds: CFG.maxRounds,
      version: W[APP_KEY]?.version,
      startupHidden: true,
    });
    if (!mounted.created) return;
    const { panel } = mounted;
    const expiredLease = tradeRunLease.inspect();
    if (expiredLease.expired && expiredLease.lease) {
      const schedulerSnapshot = tradeJobStore.read();
      const leaseRecovery = inspectExpiredTradeLeaseRecovery({
        previousLease: expiredLease.lease,
        history: schedulerSnapshot.history,
        buyJournal: tradeBuyJournal.snapshot(),
        listingJournal: tradeListingJournal.snapshot(),
        bulkRelistJournal: tradeBulkRelistJournal.snapshot(),
        inspectJournal: (journal, journalType) => inspectPersistedTradeJournal(journalType, journal, schedulerSnapshot).reviewRequired,
        continuation: schedulerSnapshot.runtimes?.[expiredLease.lease.jobId]?.continuation
          ? { ...schedulerSnapshot.runtimes[expiredLease.lease.jobId].continuation, jobId: expiredLease.lease.jobId }
          : null,
      });
      log(`Trade: expired Lease read-only check ${leaseRecovery.status} (${leaseRecovery.reason}); Scheduler will remain fail-closed until reconciliation is confirmed`);
    }
    state.logRenderer = createLogRenderer({
      getLines: () => state.logLines,
      getPanel: () => document.querySelector('#bronze-loop-panel'),
      getLatestBox: () => document.querySelector('#bronze-loop-latest'),
      getFullBox: () => document.querySelector('#bronze-loop-log'),
      formatFullLog: (lines) => formatLogHtml(lines, escapeHtml),
    });
    const savedLoopUiOptions = loadLoopUiOptions();
    const savedPickOptions = loadPickRuntimeOptions();
    const savedLayoutMode = normalizeLayoutOverride(adapters.localStorage.get('fc-loop-layout-mode', 'auto'));
    state.pickOptions = savedPickOptions;
    state.sbcFodderOptions = loadSbcFodderOptions();
    state.rewardAlertSettings = loadRewardAlertSettings();
    hydrateMainPanelOptions({
      panel,
      loopOptions: savedLoopUiOptions,
      rewardAlertSettings: state.rewardAlertSettings,
      layoutMode: savedLayoutMode,
    });
    renderSelectionPolicySummary({
      panel,
      pickOptions: state.pickOptions,
      sbcFodderOptions: state.sbcFodderOptions,
    });
    renderRewardAlertSummary({ panel, settings: state.rewardAlertSettings });
    state.panelGeometry = createMainPanelGeometry({
      panel,
      getViewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
      loadPosition: () => {
        try { return adapters.localStorage.getJson('fc-loop-panel-pos', null); } catch { return null; }
      },
      savePosition: (position) => {
        try { adapters.localStorage.setJson('fc-loop-panel-pos', position); } catch { }
      },
      loadLogHeight: () => {
        try { return adapters.localStorage.get('fc-loop-panel-log-height', null); } catch { return null; }
      },
      saveLogHeight: (height) => {
        try { adapters.localStorage.set('fc-loop-panel-log-height', height); } catch { }
      },
      loadMobileTab: () => {
        try { return adapters.localStorage.get('fc-loop-panel-mobile-tab', 'run'); } catch { return 'run'; }
      },
      saveMobileTab: (tab) => {
        try { adapters.localStorage.set('fc-loop-panel-mobile-tab', tab); } catch { }
      },
      loadMobileIconPosition: () => {
        try { return adapters.localStorage.getJson('fc-loop-panel-mobile-icon-pos', null); } catch { return null; }
      },
      saveMobileIconPosition: (position) => {
        try { adapters.localStorage.setJson('fc-loop-panel-mobile-icon-pos', position); } catch { }
      },
      onModeChange: renderLog,
    });
    state.workflowBuilder = createWorkflowLoopBuilder({
      dom: adapters.dom,
      getBuiltInConfig: getBuiltInLoopConfig,
      getDiscoveredLoops: getScannedDynamicSbcLoopDefs,
      loadStore: () => {
        try { return adapters.localStorage.getJson(BUILDER_PROFILE_KEY, null); } catch { return null; }
      },
      saveStore: (store) => adapters.localStorage.setJson(BUILDER_PROFILE_KEY, store),
      onStoreChange: renderProfileSelect,
      applyConfig: (config, source) => setLoopConfig(config, source, { preserveDiscovery: true }),
      useBuiltIn: () => resetLoopDefs({ preserveDiscovery: true }),
      exportText: (text, filename) => adapters.userEffects.downloadText(text, filename),
      log,
      now: Date.now,
    });
    state.layoutController = createResponsiveLayoutController({
      windowObject: window,
      root: document.documentElement,
      loadOverride: () => savedLayoutMode,
      saveOverride: (layoutMode) => {
        try { adapters.localStorage.set('fc-loop-layout-mode', layoutMode); } catch { }
        const select = document.querySelector('#bronze-loop-layout-mode');
        if (select) select.value = layoutMode;
      },
      onChange: (snapshot) => {
        state.panelGeometry?.setResponsiveMode?.(snapshot);
        renderLog();
      },
    });
    const restoredProfile = state.workflowBuilder.restoreActiveProfile();
    if (restoredProfile.status === 'blocked') {
      log(`Active Builder profile was not restored before Dynamic SBC refresh: ${(restoredProfile.errors || []).join('; ')}; using built-in Workflow/Loop configuration until the conflicts are resolved`);
    }
    renderProfileSelect();
    renderLoopSelect();
    renderLog();
    const scanDynamicSbcsWithProgress = (scanOptions = {}) => scanAvailableDynamicSbcs({
      ...scanOptions,
      onProgress: (progress) => {
        state.dynamicSbcScanProgress = { ...progress };
        setPanelState();
      },
    });
    const panelCommands = createMainPanelCommands({
      state,
      log,
      setPanelState,
      openBuilder: (tab) => state.workflowBuilder?.open(tab),
      openHelp: (topic) => showMainPanelHelp({ dom: adapters.dom, topic }),
      selectProfile: (profileId) => state.workflowBuilder?.selectRuntimeProfile(profileId),
      setLayoutMode: (layoutMode) => state.layoutController?.setOverride?.(layoutMode),
      renderProfiles: renderProfileSelect,
      updateLoopControls,
      getLoopSelectionDefaults: (loopId) => ({
        openRewardPacks: findLoopDefById(loopId)?.defaultOpenRewardPacksOnSelect === true,
      }),
      setOpenRewardPacksEnabled: (enabled) => {
        const input = document.querySelector('#bronze-loop-open-rewards');
        if (input) input.checked = enabled === true;
      },
      openSelectionPolicySettings: openSelectionPolicySettingsModal,
      saveLoopOptions: saveLoopUiOptions,
      saveRewardAlertEnabled,
      openRewardAlertSettings: openRewardAlertSettingsModal,
      start: startLoop,
      openBatch: openBatchOpenDialogModal,
      openTrade: openTradeSchedulerDialogModal,
      reopenRecap: reopenLastRecap,
      refreshInventoryCaches,
      scanDynamicSbcs: scanDynamicSbcsWithProgress,
      scanPlayerPicks: scanDynamicSbcsWithProgress,
      getDynamicSbcScanOptions: () => {
        const mode = document.querySelector('#bronze-loop-scan-mode')?.value || 'incremental';
        return {
          forceFull: mode === 'full' || mode === 'clear',
          clearCache: mode === 'clear',
        };
      },
      resetDynamicSbcScanMode: () => {
        const select = document.querySelector('#bronze-loop-scan-mode');
        if (select) select.value = 'incremental';
      },
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
    log(`Ready v${W[APP_KEY]?.version || 'unknown'}. Keep FSU enabled before starting; FC26 Enhancer may remain enabled.`);
    if (!state.tradeSchedulerTimer) {
      state.tradeSchedulerTimer = setInterval(() => { void tickTradeScheduler({ trigger: 'interval' }); }, 5000);
      state.tradeSchedulerWakeups = createTradeSchedulerWakeups({
        windowTarget: window,
        documentTarget: document,
        tick: tickTradeScheduler,
      });
      state.tradeSchedulerWakeups.start();
      void tickTradeScheduler({ trigger: 'startup' });
    }
    setTimeout(async () => {
      try {
        await scanAvailableDynamicSbcs({ cacheOnly: true });
      } catch (error) {
        log(`Dynamic SBC cache restore skipped: ${error?.message || error}`);
      }
      const scanPromise = panelCommands.scanPicks();
      setMainPanelStartupHidden(panel, false);
      try {
        await scanPromise;
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
