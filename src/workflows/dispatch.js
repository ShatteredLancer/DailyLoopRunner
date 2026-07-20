const STANDARD_FINALIZATION_STRATEGIES = new Set([
  'dailyRoutine',
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
  if (dryRun) log('Dry run active: no items will be moved, no packs opened, no squads saved, no SBCs submitted');

  let result;
  if (strategy === 'validationBronzeUpgrade') {
    return runners.validationBronzeUpgrade(loopDef, roundNo);
  }
  if (strategy === 'dailyRoutine') {
    result = await runners.dailyRoutine(loopDef);
  } else if (strategy === 'dailySingleCardRecycle') {
    result = await runners.dailySingleCardRecycle(loopDef);
  } else if (['supplyAndCraft', 'inventoryMixedUpgrade', 'commonGoldToRareUpgrade'].includes(strategy)) {
    result = await runners.supplyAndCraft(loopDef);
  } else if (strategy === 'provisionPackCrafting' || strategy === 'provisionPackDualCrafting') {
    result = await runners.provisionPackCrafting(loopDef);
  } else if (strategy === 'rarePackTo84Upgrade') {
    result = await runners.rarePackTo84Upgrade(loopDef);
  } else if (strategy === 'playerPickSbc') {
    result = await runners.playerPickSbc(loopDef);
    if (!dryRun) await afterPlayerPickRun(loopDef, result);
    return result;
  } else if (strategy === 'fillAndVerifySbc') {
    result = await runners.fillAndVerifySbc(loopDef);
  } else if (strategy === 'inventoryExhaustion') {
    result = await runners.inventoryExhaustion(loopDef);
  } else {
    throw new Error(`Unsupported loop strategy: ${strategy}`);
  }

  if (!dryRun && STANDARD_FINALIZATION_STRATEGIES.has(strategy)) {
    await afterStandardRun(loopDef, result);
  }
  return result;
}
