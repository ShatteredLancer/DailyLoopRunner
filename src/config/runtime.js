export const APP_KEY = '__FCLoopRunner';
export const PICK_OPTIONS_KEY = 'fc-loop-runner-pick-options';
export const SBC_FODDER_OPTIONS_KEY = 'fc-loop-runner-sbc-fodder-options';
export const LOOP_UI_OPTIONS_KEY = 'fc-loop-runner-ui-options';
export const REWARD_ALERT_SETTINGS_KEY = 'fc-loop-runner-reward-alert-settings';
export const BATCH_OPEN_PLAN_KEY = 'fc-loop-runner-batch-open-plan';
export const BUILDER_PROFILE_KEY = 'fc-loop-runner-builder-profiles-v1';
export const DYNAMIC_SBC_CACHE_KEY = 'fc-loop-runner-dynamic-sbc-cache-v1';
export const FUTBIN_CARD_ID_CACHE_KEY = 'fc-loop-runner-futbin-card-id-cache-v1';
export const TRADE_PLAYER_CATALOG_CACHE_KEY = 'fc-loop-runner-trade-player-catalog-v1';
export const TRADE_CIRCUIT_KEY = 'fc-loop-runner-trade-circuit-v1';
export const TRADE_JOB_STORE_KEY = 'fc-loop-runner-trade-jobs-v1';
export const TRADE_RUN_LEASE_KEY = 'fc-loop-runner-trade-run-lease-v1';
export const TRADE_BUY_JOURNAL_KEY = 'fc-loop-runner-trade-buy-journal-v1';
export const TRADE_LISTING_JOURNAL_KEY = 'fc-loop-runner-trade-listing-journal-v1';
export const TRADE_BULK_RELIST_JOURNAL_KEY = 'fc-loop-runner-trade-bulk-relist-journal-v1';
export const TRADE_REQUEST_PACING_KEY = 'fc-loop-runner-trade-request-pacing-v1';
export const TRADE_RECOVERY_AUDIT_KEY = 'fc-loop-runner-trade-recovery-audit-v1';
export const ROLLING_DUPLICATE_TRANSACTION_KEY = 'fc-loop-runner-rolling-duplicate-transaction-v1';
export const ROLLING_PENDING_REQUIRED_SPECIAL_REWARD_KEY = 'fc-loop-runner-rolling-pending-required-special-reward-v1';

export const CFG = Object.freeze({
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
});

export const FSU_COMPAT_DEFAULTS = Object.freeze({
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
