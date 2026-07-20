import { describe, expect, it, vi } from 'vitest';
import { dispatchConfiguredWorkflow } from '../../src/workflows/dispatch.js';

function harness(overrides = {}) {
  const result = { status: 'completed' };
  const runners = {
    validationBronzeUpgrade: vi.fn(async () => result),
    dailyRoutine: vi.fn(async () => result),
    dailySingleCardRecycle: vi.fn(async () => result),
    supplyAndCraft: vi.fn(async () => result),
    provisionPackCrafting: vi.fn(async () => result),
    rarePackTo84Upgrade: vi.fn(async () => result),
    playerPickSbc: vi.fn(async () => ({ ...result, pickResults: [{ id: 1 }] })),
    fillAndVerifySbc: vi.fn(async () => result),
    inventoryExhaustion: vi.fn(async () => result),
  };
  return {
    loopDef: { id: 'loop', name: 'Test Loop', strategy: 'dailyRoutine' },
    roundNo: 3,
    runners,
    log: vi.fn(),
    afterStandardRun: vi.fn(async () => {}),
    afterPlayerPickRun: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('configured workflow dispatch', () => {
  it('dispatches standard strategies and runs the shared live finalizer', async () => {
    const options = harness({
      loopDef: { id: 'daily-common', name: 'Daily Common Loop', strategy: 'inventoryMixedUpgrade' },
    });
    const result = await dispatchConfiguredWorkflow(options);

    expect(result).toEqual({ status: 'completed' });
    expect(options.runners.supplyAndCraft).toHaveBeenCalledWith(options.loopDef);
    expect(options.afterStandardRun).toHaveBeenCalledWith(options.loopDef, result);
    expect(options.afterPlayerPickRun).not.toHaveBeenCalled();
  });

  it('preserves Bronze Validation round dispatch without standard finalization', async () => {
    const options = harness({
      loopDef: { id: 'validation', name: 'Bronze Upgrade Validation', strategy: 'validationBronzeUpgrade' },
      roundNo: 4,
    });
    await dispatchConfiguredWorkflow(options);

    expect(options.runners.validationBronzeUpgrade).toHaveBeenCalledWith(options.loopDef, 4);
    expect(options.afterStandardRun).not.toHaveBeenCalled();
  });

  it('uses Player Pick finalization only for a live Player Pick', async () => {
    const options = harness({
      loopDef: { id: 'pick', name: 'Player Pick', strategy: 'playerPickSbc' },
    });
    const result = await dispatchConfiguredWorkflow(options);

    expect(options.afterPlayerPickRun).toHaveBeenCalledWith(options.loopDef, result);
    expect(options.afterStandardRun).not.toHaveBeenCalled();
  });

  it('dispatches inventory exhaustion through the standard finalizer', async () => {
    const options = harness({
      loopDef: { id: 'inventory-exhaustion', name: 'Inventory Exhaustion', strategy: 'inventoryExhaustion' },
    });
    await dispatchConfiguredWorkflow(options);
    expect(options.runners.inventoryExhaustion).toHaveBeenCalledWith(options.loopDef);
    expect(options.afterStandardRun).toHaveBeenCalledWith(options.loopDef, { status: 'completed' });
  });

  it('skips all finalizers during Dry Run while keeping the same runner', async () => {
    const options = harness({
      loopDef: { id: '84x10', name: '84x10 Loop', strategy: 'fillAndVerifySbc', dryRun: true },
    });
    await dispatchConfiguredWorkflow(options);

    expect(options.runners.fillAndVerifySbc).toHaveBeenCalledWith(options.loopDef);
    expect(options.afterStandardRun).not.toHaveBeenCalled();
    expect(options.afterPlayerPickRun).not.toHaveBeenCalled();
    expect(options.log).toHaveBeenCalledWith(
      'Dry run active: no items will be moved, no packs opened, no squads saved, no SBCs submitted',
    );
  });

  it('rejects an unsupported strategy with the existing message', async () => {
    const options = harness({
      loopDef: { id: 'unknown', name: 'Unknown Loop', strategy: 'notSupported' },
    });
    await expect(dispatchConfiguredWorkflow(options)).rejects.toThrow(
      'Unsupported loop strategy: notSupported',
    );
  });
});
