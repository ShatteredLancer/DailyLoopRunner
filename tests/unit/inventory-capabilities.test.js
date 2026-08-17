import { describe, expect, it, vi } from 'vitest';
import { createInventoryDelta, createInventorySnapshot } from '../../src/domain/contracts.js';
import { createInventoryCapabilityCalculator } from '../../src/inventory/capabilities.js';
import { createInventoryLedger } from '../../src/inventory/ledger.js';

function player(id, rating, pile = 'club', overrides = {}) {
  return {
    id,
    definitionId: 1000 + id,
    type: 'player',
    rating,
    rareflag: overrides.special ? 2 : 1,
    pile,
    ...overrides,
  };
}

function classifier(value) {
  return {
    requiredSpecial: value.groups?.includes(4) || false,
    provisionsReserve: [87, 88, 89].includes(value.rating) && !value.groups?.includes(4),
    protected: value.rating >= 96,
  };
}

describe('inventory capability calculation', () => {
  it('calculates cheap Rolling counts and storage pressure without solving squads', async () => {
    const inventory = createInventorySnapshot({
      piles: {
        storage: [
          player(1, 90, 'storage', { special: true, groups: [4] }),
          player(2, 91, 'storage', { special: true, groups: [4] }),
          ...Array.from({ length: 8 }, (_, index) => player(10 + index, 87 + (index % 3), 'storage')),
        ],
        club: Array.from({ length: 12 }, (_, index) => player(100 + index, 83 + (index % 2))),
      },
      capacities: { storage: { used: 10, max: 100 } },
    });
    const ledger = createInventoryLedger({ snapshot: inventory, classifyItem: classifier });
    const selectPrimary = vi.fn();
    const selectTotwRecovery = vi.fn();
    const calculator = createInventoryCapabilityCalculator();

    await expect(calculator.calculate({
      ledger,
      policyKey: 'rolling:95',
      selectPrimary,
      selectTotwRecovery,
      provisionsRequiredCount: 4,
    })).resolves.toMatchObject({
      inventoryVersion: 1,
      specialSlots: 2,
      directCycles: null,
      directCyclesLimited: false,
      provisionsBatches: 2,
      totwRecoveries: null,
      totwRecoveriesLimited: false,
      storageUsed: 10,
      storageCapacity: 100,
      calculating: false,
    });
    expect(selectPrimary).not.toHaveBeenCalled();
    expect(selectTotwRecovery).not.toHaveBeenCalled();
  });

  it('caches per ledger and policy version, then invalidates after a confirmed delta', async () => {
    const makeLedger = (id) => createInventoryLedger({
      snapshot: createInventorySnapshot({ piles: { club: [player(id, 84)] } }),
      classifyItem: classifier,
    });
    const first = makeLedger(1);
    const second = makeLedger(2);
    const calculator = createInventoryCapabilityCalculator();

    const firstResult = await calculator.calculate({ ledger: first, policyKey: 'same' });
    expect(await calculator.calculate({ ledger: first, policyKey: 'same' })).toBe(firstResult);
    await calculator.calculate({ ledger: second, policyKey: 'same' });

    first.applyDelta(createInventoryDelta({
      status: 'confirmed',
      operation: 'add',
      additions: [{ pile: 'club', item: player(3, 85) }],
    }));
    const updated = await calculator.calculate({ ledger: first, policyKey: 'same' });
    expect(updated).not.toBe(firstResult);
    expect(updated.inventoryVersion).toBe(2);
  });

  it('uses unknown instead of a false zero when Required Special classification is incomplete', async () => {
    const ledger = createInventoryLedger({
      snapshot: createInventorySnapshot({ piles: { club: [player(1, 90, 'club', { special: true })] } }),
      classifyItem: () => ({ requiredSpecial: null }),
    });
    const result = await createInventoryCapabilityCalculator().calculate({ ledger, policyKey: 'unknown' });

    expect(result).toMatchObject({ specialSlots: null, directCycles: null, totwRecoveries: null });
    expect(result.diagnostics.requiredSpecialUnknown).toBe(true);
  });

});
