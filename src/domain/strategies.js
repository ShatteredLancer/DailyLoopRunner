export const INVENTORY_ONLY_CAPABILITIES = Object.freeze({
  unsupported: 'unsupported',
  supported: 'supported',
  intrinsic: 'intrinsic',
  container: 'container',
});

export const LOOP_STRATEGY_CAPABILITIES = Object.freeze({
  validationBronzeUpgrade: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported }),
  dailySingleCardRecycle: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.supported }),
  supplyAndCraft: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.supported }),
  inventoryMixedUpgrade: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.supported }),
  commonGoldToRareUpgrade: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.supported }),
  provisionPackCrafting: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported }),
  provisionPackDualCrafting: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported }),
  rarePackTo84Upgrade: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported }),
  playerPickSbc: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.intrinsic }),
  dailyRoutine: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.container }),
  workflowRoutine: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.container }),
  fillAndVerifySbc: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.intrinsic }),
  inventoryExhaustion: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.intrinsic }),
});

export const LOOP_STRATEGIES = Object.freeze(Object.keys(LOOP_STRATEGY_CAPABILITIES));

export function getLoopStrategyCapabilities(strategy) {
  return LOOP_STRATEGY_CAPABILITIES[strategy] || Object.freeze({
    inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported,
  });
}
