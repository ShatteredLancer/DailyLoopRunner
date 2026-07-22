import { LOOP_STRATEGIES } from '../domain/strategies.js';

export const STRATEGY_RUNNER_KEYS = Object.freeze({
  validationBronzeUpgrade: 'validationBronzeUpgrade',
  dailySingleCardRecycle: 'dailySingleCardRecycle',
  supplyAndCraft: 'supplyAndCraft',
  inventoryMixedUpgrade: 'supplyAndCraft',
  commonGoldToRareUpgrade: 'supplyAndCraft',
  provisionPackCrafting: 'provisionPackCrafting',
  provisionPackDualCrafting: 'provisionPackCrafting',
  rarePackTo84Upgrade: 'rarePackTo84Upgrade',
  playerPickSbc: 'playerPickSbc',
  dailyRoutine: 'dailyRoutine',
  workflowRoutine: 'workflowRoutine',
  fillAndVerifySbc: 'fillAndVerifySbc',
  inventoryExhaustion: 'inventoryExhaustion',
});

const STANDARD_FINALIZATION_STRATEGIES = new Set([
  'dailyRoutine',
  'workflowRoutine',
  'dailySingleCardRecycle',
  'supplyAndCraft',
  'inventoryMixedUpgrade',
  'commonGoldToRareUpgrade',
  'provisionPackCrafting',
  'provisionPackDualCrafting',
  'rarePackTo84Upgrade',
  'fillAndVerifySbc',
  'inventoryExhaustion',
]);

export const DISPATCHED_LOOP_STRATEGIES = Object.freeze(Object.keys(STRATEGY_RUNNER_KEYS));

if (LOOP_STRATEGIES.some((strategy) => !STRATEGY_RUNNER_KEYS[strategy])) {
  throw new Error('Loop strategy registry and workflow dispatch are out of sync');
}

export async function dispatchConfiguredWorkflow(options = {}) {
  const {
    loopDef,
    roundNo = 1,
    runners = {},
    log,
    afterStandardRun,
    afterPlayerPickRun,
  } = options;
  const strategy = loopDef.strategy;
  const dryRun = loopDef.dryRun === true;
  log(`Loop selected: ${loopDef.name} (${strategy})`);
  if (loopDef.disabledPiles?.length) log(`Disabled piles: ${loopDef.disabledPiles.join(', ')}`);
  if (loopDef.inventoryOnlyIgnored === true) {
    log(`${loopDef.name}: global inventory-only mode is not supported by ${strategy}; using the Loop's normal workflow`);
  }
  if (dryRun) log('Dry run active: no items will be moved, no packs opened, no squads saved, no SBCs submitted');

  let result;
  if (strategy === 'validationBronzeUpgrade') {
    return runners.validationBronzeUpgrade(loopDef, roundNo);
  }
  const runnerKey = STRATEGY_RUNNER_KEYS[strategy];
  const runner = runnerKey ? runners[runnerKey] : null;
  if (typeof runner !== 'function') {
    if (!runnerKey) throw new Error(`Unsupported loop strategy: ${strategy}`);
    throw new Error(`Missing runner for loop strategy: ${strategy}`);
  }
  result = await runner(loopDef);
  if (strategy === 'playerPickSbc') {
    if (!dryRun) await afterPlayerPickRun(loopDef, result);
    return result;
  }

  if (!dryRun && STANDARD_FINALIZATION_STRATEGIES.has(strategy)) {
    await afterStandardRun(loopDef, result);
  }
  return result;
}
