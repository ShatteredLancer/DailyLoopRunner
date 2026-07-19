export const APP_KEY = '__FCLoopRunner';
export const LOOP_CONFIG_URL = 'http://127.0.0.1:8765/DailyLoopRunner.loops.json';
export const PICK_OPTIONS_KEY = 'fc-loop-runner-pick-options';
export const LOOP_UI_OPTIONS_KEY = 'fc-loop-runner-ui-options';
export const REWARD_ALERT_SETTINGS_KEY = 'fc-loop-runner-reward-alert-settings';
export const BATCH_OPEN_PLAN_KEY = 'fc-loop-runner-batch-open-plan';

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
