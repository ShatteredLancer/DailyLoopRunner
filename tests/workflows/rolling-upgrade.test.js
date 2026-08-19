import { describe, expect, it, vi } from 'vitest';
import {
  chooseRollingRequiredSpecialRecoveryAction,
  ROLLING_UPGRADE_PHASES,
  runRollingUpgradeWorkflow,
} from '../../src/workflows/rolling-upgrade.js';
import { releaseRollingRoutingItemsAfterConsumption } from '../../src/inventory/rolling-policy.js';

describe('Rolling Required Special recovery decision', () => {
  it('opens an existing TOTW reward before crafting another Storage pressure recovery', () => {
    expect(chooseRollingRequiredSpecialRecoveryAction({
      hasExistingPack: true,
      trigger: 'storage-sink-required-special-shortage',
    })).toBe('open-existing-pack');
    expect(chooseRollingRequiredSpecialRecoveryAction({
      hasExistingPack: false,
      trigger: 'storage-sink-required-special-shortage',
    })).toBe('craft-storage-pressure');
  });

  it('consumes pending Unassigned primary duplicates before creating or opening a TOTW reward', () => {
    expect(chooseRollingRequiredSpecialRecoveryAction({
      hasExistingPack: true,
      hasPendingUnassignedPrimaryDuplicates: true,
      trigger: 'storage-sink-required-special-shortage',
    })).toBe('craft-with-pending-duplicates');
    expect(chooseRollingRequiredSpecialRecoveryAction({
      hasExistingPack: false,
      hasPendingUnassignedPrimaryDuplicates: true,
      trigger: 'primary-required-special-shortage',
    })).toBe('craft-with-pending-duplicates');
    expect(chooseRollingRequiredSpecialRecoveryAction({
      hasExistingPack: true,
      hasPendingUnassignedPrimaryDuplicates: true,
      trigger: 'primary-required-special-shortage',
    })).toBe('craft-with-pending-duplicates');
  });
});

function harness(overrides = {}) {
  let packNo = 0;
  return {
    maxCompletions: 1,
    provisionsShortageRecoveryEnabled: true,
    requiredSpecialRecoveryEnabled: true,
    preflight: vi.fn(async () => ({ status: 'ready' })),
    initializeInventory: vi.fn(async () => ({ status: 'ready' })),
    findPrimaryPack: vi.fn(async () => ({ id: ++packNo, name: '10x85+' })),
    openPrimaryPack: vi.fn(async ({ pack }) => ({
      status: 'opened',
      packRef: { id: pack.id },
      openedItems: [{ id: 100 + pack.id }],
    })),
    classifyOpenedItems: vi.fn(async () => ({ status: 'ready', requiredSpecial: 1 })),
    resolveProtectedStorage: vi.fn(async () => ({ status: 'ready' })),
    planPrimarySquad: vi.fn(async () => ({ ok: true, itemRefs: [{ id: 1 }] })),
    submitPrimary: vi.fn(async () => ({ status: 'submitted', submitted: true })),
    reconcile: vi.fn(async () => ({ status: 'ready' })),
    shouldStop: vi.fn(async () => false),
    onEvent: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('10x85+ Rolling workflow', () => {
  it('does not invoke Provisions shortage recovery without explicit permission', async () => {
    const recoverProvisions = vi.fn(async () => ({ status: 'submitted' }));
    const options = harness({
      provisionsShortageRecoveryEnabled: false,
      findPrimaryPack: vi.fn(async () => null),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        missing: { code: 'PLAYER_COUNT_SHORTAGE' },
      })),
      recoverProvisions,
    });

    expect(await runRollingUpgradeWorkflow(options)).toMatchObject({
      status: 'blocked',
      reason: 'Provisions shortage recovery is disabled in Settings',
      reasonCode: 'PROVISIONS_SHORTAGE_RECOVERY_DISABLED',
    });
    expect(recoverProvisions).not.toHaveBeenCalled();
  });

  it('does not invoke Required Special recovery without explicit permission', async () => {
    const recoverRequiredSpecial = vi.fn(async () => ({ status: 'submitted' }));
    const options = harness({
      requiredSpecialRecoveryEnabled: false,
      findPrimaryPack: vi.fn(async () => null),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        missing: { code: 'REQUIRED_SPECIAL_SHORTAGE' },
      })),
      recoverRequiredSpecial,
    });

    expect(await runRollingUpgradeWorkflow(options)).toMatchObject({
      status: 'blocked',
      reason: 'Required Special/TOTW recovery is disabled in Settings',
      reasonCode: 'REQUIRED_SPECIAL_RECOVERY_DISABLED',
    });
    expect(recoverRequiredSpecial).not.toHaveBeenCalled();
  });

  it('opens an existing reward, classifies it, routes protected cards, and submits once', async () => {
    const options = harness();
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      completions: 1,
      packsOpened: 1,
      bootstrapSubmissions: 0,
    });
    expect(options.classifyOpenedItems).toHaveBeenCalledOnce();
    expect(options.resolveProtectedStorage).toHaveBeenCalledOnce();
    expect(options.submitPrimary).toHaveBeenCalledWith(expect.objectContaining({ bootstrap: false }));
  });

  it('bootstraps from inventory when no primary reward exists', async () => {
    const options = harness({ findPrimaryPack: vi.fn(async () => null) });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      completions: 1,
      packsOpened: 0,
      bootstrapSubmissions: 1,
    });
    expect(options.openPrimaryPack).not.toHaveBeenCalled();
    expect(options.planPrimarySquad).toHaveBeenCalledWith(expect.objectContaining({ bootstrap: true }));
  });

  it('resumes existing Unassigned primary cards before any pack lookup or open', async () => {
    const options = harness({
      resumePendingUnassigned: vi.fn(async () => ({
        status: 'ready',
        primaryPending: true,
      })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      completions: 1,
      packsOpened: 0,
      bootstrapSubmissions: 0,
    });
    expect(options.resumePendingUnassigned).toHaveBeenCalledOnce();
    expect(options.findPrimaryPack).not.toHaveBeenCalled();
    expect(options.openPrimaryPack).not.toHaveBeenCalled();
    expect(options.planPrimarySquad).toHaveBeenCalledWith(expect.objectContaining({
      bootstrap: false,
      resumedPrimary: true,
    }));
    expect(options.submitPrimary).toHaveBeenCalledWith(expect.objectContaining({
      bootstrap: false,
      resumedPrimary: true,
    }));
  });

  it('resumes a pending Storage Sink Pick before generic Unassigned recovery', async () => {
    const resumePendingPlayerPick = vi.fn(async () => ({ status: 'selected' }));
    const resumePendingUnassigned = vi.fn(async () => ({ status: 'ready', primaryPending: true }));
    const options = harness({ resumePendingPlayerPick, resumePendingUnassigned });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', completions: 1, packsOpened: 0 });
    expect(resumePendingPlayerPick).toHaveBeenCalledOnce();
    expect(resumePendingUnassigned).toHaveBeenCalledOnce();
    expect(resumePendingPlayerPick.mock.invocationCallOrder[0])
      .toBeLessThan(resumePendingUnassigned.mock.invocationCallOrder[0]);
    expect(options.findPrimaryPack).not.toHaveBeenCalled();
  });

  it('does not run generic Unassigned recovery when pending Pick recovery is blocked', async () => {
    const resumePendingUnassigned = vi.fn(async () => ({ status: 'ready' }));
    const options = harness({
      resumePendingPlayerPick: vi.fn(async () => ({
        status: 'blocked',
        reason: 'pending Storage Sink Pick confirmation failed',
        reasonCode: 'PLAYER_PICK_CONFIRMATION_FAILED',
      })),
      resumePendingUnassigned,
    });

    expect(await runRollingUpgradeWorkflow(options)).toMatchObject({
      status: 'blocked',
      reason: 'pending Storage Sink Pick confirmation failed',
      reasonCode: 'PLAYER_PICK_CONFIRMATION_FAILED',
    });
    expect(resumePendingUnassigned).not.toHaveBeenCalled();
    expect(options.findPrimaryPack).not.toHaveBeenCalled();
  });

  it('does not look up a pack when resumed Unassigned routing is blocked', async () => {
    const options = harness({
      resumePendingUnassigned: vi.fn(async () => ({
        status: 'blocked',
        reason: 'existing Unassigned identity is uncertain',
        reasonCode: 'UNASSIGNED_RESUME_BLOCKED',
      })),
    });

    expect(await runRollingUpgradeWorkflow(options)).toMatchObject({
      status: 'blocked',
      reason: 'existing Unassigned identity is uncertain',
      reasonCode: 'UNASSIGNED_RESUME_BLOCKED',
    });
    expect(options.findPrimaryPack).not.toHaveBeenCalled();
    expect(options.openPrimaryPack).not.toHaveBeenCalled();
  });

  it('counts only primary submissions toward a positive completion limit', async () => {
    const options = harness({ maxCompletions: 3 });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', completions: 3, packsOpened: 3 });
    expect(options.submitPrimary).toHaveBeenCalledTimes(3);
    expect(options.reconcile).toHaveBeenCalledTimes(3);
  });

  it('runs Storage maintenance only after primary submission and replans after each action', async () => {
    let inventoryVersion = 1;
    let maintenanceRuns = 0;
    const options = harness({
      surplusCraftingEnabled: true,
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      maintainStorage: vi.fn(async () => {
        maintenanceRuns++;
        if (maintenanceRuns > 2) return { status: 'skipped' };
        inventoryVersion++;
        return { status: 'submitted', details: { action: 'provisions' } };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      completions: 1,
      recoveries: { storageMaintenance: 2 },
    });
    expect(options.maintainStorage).toHaveBeenCalledTimes(3);
    expect(options.maintainStorage.mock.invocationCallOrder[0])
      .toBeGreaterThan(options.submitPrimary.mock.invocationCallOrder[0]);
  });

  it('does not proactively craft duplicate reserves or maintain Storage by default', async () => {
    const options = harness({
      readRecoveryState: vi.fn(async () => ({ duplicateProvisionBatches: 1 })),
      recoverProvisions: vi.fn(async () => ({ status: 'submitted' })),
      maintainStorage: vi.fn(async () => ({ status: 'submitted' })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', recoveries: { total: 0 } });
    expect(options.readRecoveryState).not.toHaveBeenCalled();
    expect(options.recoverProvisions).not.toHaveBeenCalled();
    expect(options.maintainStorage).not.toHaveBeenCalled();
  });

  it('does not invoke Storage maintenance before a failed primary plan', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        missing: { code: 'PLAYER_COUNT_SHORTAGE' },
      })),
      recoverProvisions: vi.fn(async () => ({ status: 'skipped' })),
      maintainStorage: vi.fn(async () => ({ status: 'submitted' })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result.status).toBe('blocked');
    expect(options.maintainStorage).not.toHaveBeenCalled();
  });

  it('treats zero as unlimited and exits through the Stop boundary', async () => {
    let stopChecks = 0;
    const options = harness({
      maxCompletions: 0,
      shouldStop: vi.fn(async () => ++stopChecks >= 4),
    });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'stopped', reasonCode: 'USER_STOPPED' });
    expect(result.completions).toBeGreaterThan(0);
    expect(result.completions).toBeLessThan(4);
  });

  it('stops Dry Run at an existing pack because its reward is unknown', async () => {
    const options = harness({
      openPrimaryPack: vi.fn(async () => ({ status: 'planned', reason: 'dry run would open 10x85+' })),
    });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'planned',
      phase: ROLLING_UPGRADE_PHASES.OPEN_PRIMARY_REWARD,
      completions: 0,
    });
    expect(options.planPrimarySquad).not.toHaveBeenCalled();
  });

  it('uses the same planner for a Dry Run inventory bootstrap', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      submitPrimary: vi.fn(async () => ({ status: 'planned', reason: 'dry-run squad plan complete' })),
    });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'planned', completions: 0, bootstrapSubmissions: 0 });
    expect(options.planPrimarySquad).toHaveBeenCalledOnce();
  });

  it('passes multiple Required Special cards through classification while the plan consumes one', async () => {
    const options = harness({
      classifyOpenedItems: vi.fn(async () => ({
        status: 'ready',
        requiredSpecialRefs: [{ id: 11 }, { id: 12 }, { id: 13 }],
      })),
      planPrimarySquad: vi.fn(async () => ({
        ok: true,
        details: { roles: [{ id: 'required-special', selected: 1 }] },
      })),
    });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result.status).toBe('completed');
    const classified = await options.classifyOpenedItems.mock.results[0].value;
    expect(classified.requiredSpecialRefs).toHaveLength(3);
    expect(result.lastPlan.details.roles[0].selected).toBe(1);
  });

  it('returns PROTECTED_STORAGE_BLOCKED before planning another squad', async () => {
    const options = harness({
      resolveProtectedStorage: vi.fn(async () => ({
        status: 'blocked',
        reason: 'SBC storage has no free slot',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      })),
    });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      phase: ROLLING_UPGRADE_PHASES.RESOLVE_PROTECTED_STORAGE,
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
    });
    expect(options.planPrimarySquad).not.toHaveBeenCalled();
  });

  it('preserves the structured Solver reason when the primary squad is infeasible', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        reason: 'Required Special is unavailable',
        missing: { code: 'REQUIRED_SPECIAL_SHORTAGE' },
      })),
    });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      phase: ROLLING_UPGRADE_PHASES.PLAN_PRIMARY_SQUAD,
      reasonCode: 'REQUIRED_SPECIAL_SHORTAGE',
    });
    expect(options.submitPrimary).not.toHaveBeenCalled();
  });

  it('blocks an effect that reports no primary submission progress', async () => {
    const options = harness({
      submitPrimary: vi.fn(async () => ({ status: 'ready', reason: 'nothing changed' })),
    });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      phase: ROLLING_UPGRADE_PHASES.SUBMIT_PRIMARY,
      reasonCode: 'PRIMARY_SUBMISSION_BLOCKED',
    });
  });

  it('bounds retained receipts during an unlimited run', async () => {
    let submissions = 0;
    const options = harness({
      maxCompletions: 0,
      maxReceipts: 3,
      shouldStop: vi.fn(async () => submissions >= 4),
      submitPrimary: vi.fn(async () => {
        submissions++;
        return { status: 'submitted', submitted: true, challengeRef: { id: submissions } };
      }),
    });
    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'stopped', completions: 4, receiptCount: 8 });
    expect(result.receipts).toHaveLength(3);
  });

  it('can disable full receipt retention for a streaming recap consumer', async () => {
    const result = await runRollingUpgradeWorkflow(harness({ retainReceipts: false }));

    expect(result.receiptCount).toBe(2);
    expect(result.receipts).toEqual([]);
  });

  it('recovers a missing Required Special and replans through the shared planning point', async () => {
    let inventoryVersion = 1;
    let specialReady = false;
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      planPrimarySquad: vi.fn(async () => specialReady
        ? { ok: true, itemRefs: [{ id: 1 }] }
        : { ok: false, missing: { code: 'REQUIRED_SPECIAL_SHORTAGE' } }),
      recoverRequiredSpecial: vi.fn(async () => {
        specialReady = true;
        inventoryVersion++;
        return { status: 'progressed', recoveryKind: 'totw-pack' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      completions: 1,
      recoveries: { total: 1, requiredSpecial: 1 },
    });
    expect(options.planPrimarySquad).toHaveBeenCalledTimes(2);
    expect(options.recoverRequiredSpecial).toHaveBeenCalledOnce();
  });

  it('uses the Storage pressure SBC when a pending Required Special reward cannot open', async () => {
    let inventoryVersion = 1;
    let storageReady = false;
    let specialReady = false;
    const calls = [];
    const options = harness({
      storageSinkEnabled: true,
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      planPrimarySquad: vi.fn(async () => specialReady
        ? { ok: true, itemRefs: [{ id: 1 }] }
        : { ok: false, missing: { code: 'REQUIRED_SPECIAL_SHORTAGE' } }),
      recoverRequiredSpecial: vi.fn(async () => {
        calls.push('required-special');
        if (!storageReady) {
          return {
            status: 'blocked',
            reason: 'SBC storage has only 6 slot(s), but 8 item(s) need moving',
            reasonCode: 'PROTECTED_STORAGE_BLOCKED',
          };
        }
        specialReady = true;
        inventoryVersion++;
        return { status: 'opened' };
      }),
      recoverStorageSink: vi.fn(async ({ context }) => {
        calls.push('storage-sink');
        expect(context).toMatchObject({
          trigger: 'storage-pressure',
          source: 'required-special-reward-pre-open',
        });
        storageReady = true;
        inventoryVersion++;
        return { status: 'submitted', submitted: true };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      completions: 1,
      recoveries: { total: 2, storageSink: 1, requiredSpecial: 1 },
    });
    expect(calls).toEqual(['required-special', 'storage-sink', 'required-special']);
    expect(options.submitPrimary).toHaveBeenCalledOnce();
  });

  it('uses Provisions when the Required Special recovery squad is short of fodder', async () => {
    let inventoryVersion = 1;
    let fodderReady = false;
    let specialReady = false;
    const calls = [];
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      planPrimarySquad: vi.fn(async () => specialReady
        ? { ok: true }
        : { ok: false, missing: { code: 'REQUIRED_SPECIAL_SHORTAGE' } }),
      recoverRequiredSpecial: vi.fn(async () => {
        calls.push('required-special');
        if (!fodderReady) {
          return {
            status: 'blocked',
            reason: 'TOTW squad rating shortage',
            recoverableByProvisions: true,
          };
        }
        specialReady = true;
        inventoryVersion++;
        return { status: 'progressed' };
      }),
      recoverProvisions: vi.fn(async () => {
        calls.push('provisions');
        fodderReady = true;
        inventoryVersion++;
        return { status: 'progressed' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      recoveries: { total: 2, provisions: 1, requiredSpecial: 1 },
    });
    expect(calls).toEqual(['required-special', 'provisions', 'required-special']);
  });

  it('runs Provisions, opens its reward, drains Rare through Pick, then Gold through 5x80+', async () => {
    let inventoryVersion = 1;
    let stage = 'shortage';
    const calls = [];
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      planPrimarySquad: vi.fn(async () => stage === 'ready'
        ? { ok: true }
        : { ok: false, missing: { code: 'PLAYER_COUNT_SHORTAGE' } }),
      recoverProvisions: vi.fn(async () => {
        calls.push('provisions-submit');
        stage = 'provisions-pack';
        inventoryVersion++;
        return { status: 'submitted' };
      }),
      processPendingRecoveryReward: vi.fn(async () => {
        if (stage === 'provisions-pack') {
          calls.push('provisions-open');
          stage = 'rare-duplicate';
        } else if (stage === 'gold-sink-pack') {
          calls.push('gold-sink-open');
          stage = 'ready';
        } else {
          return { status: 'skipped' };
        }
        inventoryVersion++;
        return { status: 'opened' };
      }),
      drainRecoveryDuplicates: vi.fn(async () => {
        if (stage === 'rare-duplicate') {
          calls.push('85-pick');
          stage = 'gold-duplicate';
        } else if (stage === 'gold-duplicate') {
          calls.push('5x80-submit');
          stage = 'gold-sink-pack';
        } else {
          return { status: 'skipped' };
        }
        inventoryVersion++;
        return { status: 'progressed' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      recoveries: { total: 5, reward: 2, goldDrain: 2, provisions: 1 },
    });
    expect(calls).toEqual([
      'provisions-submit',
      'provisions-open',
      '85-pick',
      '5x80-submit',
      'gold-sink-open',
    ]);
  });

  it('does not let accumulated Provisions reserves preempt a feasible primary bootstrap', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      readRecoveryState: vi.fn(async () => ({
        provisionsBatches: 2,
        duplicateProvisionBatches: 1,
      })),
      recoverProvisions: vi.fn(async () => ({ status: 'submitted' })),
      processLeftoverRecoveryReward: vi.fn(async () => ({ status: 'opened' })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', recoveries: { total: 0, provisions: 0 } });
    expect(options.recoverProvisions).not.toHaveBeenCalled();
    expect(options.processLeftoverRecoveryReward).not.toHaveBeenCalled();
    expect(options.readRecoveryState).not.toHaveBeenCalled();
    expect(options.planPrimarySquad).toHaveBeenCalledOnce();
  });

  it('fails closed on primary duplicate identity drift without opening or crafting Provisions', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        reason: 'reserved primary duplicate #42 is no longer available',
        reasonCode: 'PRIMARY_DUPLICATE_IDENTITY_CHANGED',
      })),
      processLeftoverRecoveryReward: vi.fn(async () => ({ status: 'opened' })),
      recoverProvisions: vi.fn(async () => ({ status: 'submitted' })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'PRIMARY_DUPLICATE_IDENTITY_CHANGED',
    });
    expect(options.processLeftoverRecoveryReward).not.toHaveBeenCalled();
    expect(options.recoverProvisions).not.toHaveBeenCalled();
    expect(options.submitPrimary).not.toHaveBeenCalled();
  });

  it('does not open Provisions when a mandatory primary item is unavailable', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        reason: 'one or more required items are unavailable or protected',
        reasonCode: 'REQUIRED_ITEM_UNAVAILABLE',
      })),
      processLeftoverRecoveryReward: vi.fn(async () => ({ status: 'opened' })),
      recoverProvisions: vi.fn(async () => ({ status: 'submitted' })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'REQUIRED_ITEM_UNAVAILABLE',
    });
    expect(options.processLeftoverRecoveryReward).not.toHaveBeenCalled();
    expect(options.recoverProvisions).not.toHaveBeenCalled();
    expect(options.submitPrimary).not.toHaveBeenCalled();
  });

  it('opens leftover Provisions in batches of two and replans before opening another batch', async () => {
    let inventoryVersion = 1;
    let leftovers = 3;
    let provisionsReady = false;
    const calls = [];
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      planPrimarySquad: vi.fn(async () => {
        calls.push('plan');
        return provisionsReady
          ? { ok: true, itemRefs: [{ id: 1 }] }
          : { ok: false, missing: { code: 'PLAYER_COUNT_SHORTAGE' } };
      }),
      processLeftoverRecoveryReward: vi.fn(async () => {
        if (!leftovers) {
          calls.push('leftovers-empty');
          return { status: 'skipped' };
        }
        calls.push(`leftover-${4 - leftovers}`);
        leftovers--;
        inventoryVersion++;
        return { status: 'opened' };
      }),
      drainRecoveryDuplicates: vi.fn(async () => ({ status: 'skipped' })),
      recoverProvisions: vi.fn(async () => {
        calls.push('provisions-submit');
        provisionsReady = true;
        inventoryVersion++;
        return { status: 'submitted' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      recoveries: { reward: 3, provisions: 1 },
    });
    expect(calls).toEqual([
      'plan',
      'leftover-1',
      'leftover-2',
      'plan',
      'leftover-3',
      'leftovers-empty',
      'plan',
      'provisions-submit',
      'plan',
    ]);
  });

  it('honors a configured shortage batch and stops opening leftovers once replanning succeeds', async () => {
    let inventoryVersion = 1;
    let ready = false;
    let leftovers = 3;
    const calls = [];
    const options = harness({
      shortageProvisionsPackLimit: 1,
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      planPrimarySquad: vi.fn(async () => {
        calls.push('plan');
        return ready
          ? { ok: true, itemRefs: [{ id: 1 }] }
          : { ok: false, missing: { code: 'PLAYER_COUNT_SHORTAGE' } };
      }),
      processLeftoverRecoveryReward: vi.fn(async () => {
        calls.push('leftover');
        leftovers--;
        ready = true;
        inventoryVersion++;
        return {
          status: 'opened',
          details: { recoveryFamily: 'provisions-upgrade' },
        };
      }),
      recoverProvisions: vi.fn(async () => ({ status: 'submitted' })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      recoveries: { reward: 1, provisions: 0 },
    });
    expect(calls).toEqual(['plan', 'leftover', 'plan']);
    expect(leftovers).toBe(2);
    expect(options.recoverProvisions).not.toHaveBeenCalled();
  });

  it('uses the Storage pressure Pick when Unassigned blocks opening a shortage Provisions reward', async () => {
    let inventoryVersion = 1;
    let ready = false;
    let leftoverAttempts = 0;
    const calls = [];
    const options = harness({
      shortageProvisionsPackLimit: 1,
      storageSinkEnabled: true,
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      planPrimarySquad: vi.fn(async () => {
        calls.push('plan');
        return ready
          ? { ok: true, itemRefs: [{ id: 1 }] }
          : { ok: false, missing: { code: 'SQUAD_RATING_EXCESS' } };
      }),
      processLeftoverRecoveryReward: vi.fn(async () => {
        leftoverAttempts++;
        if (leftoverAttempts === 1) {
          calls.push('leftover-storage-blocked');
          return {
            status: 'blocked',
            reason: 'SBC storage has only 3 slot(s), but 7 item(s) need moving',
            reasonCode: 'PROTECTED_STORAGE_BLOCKED',
          };
        }
        calls.push('leftover-opened');
        ready = true;
        inventoryVersion++;
        return { status: 'opened', details: { recoveryFamily: 'provisions-upgrade' } };
      }),
      recoverStorageSink: vi.fn(async ({ context }) => {
        calls.push('storage-sink');
        expect(context).toMatchObject({
          trigger: 'storage-pressure',
          source: 'leftover-recovery-pre-open',
        });
        inventoryVersion++;
        return { status: 'submitted', submitted: true };
      }),
      drainRecoveryDuplicates: vi.fn(async () => ({ status: 'skipped' })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      recoveries: { reward: 1, storageSink: 1 },
    });
    expect(calls).toEqual([
      'plan',
      'leftover-storage-blocked',
      'storage-sink',
      'leftover-opened',
      'plan',
    ]);
    expect(options.recoverStorageSink).toHaveBeenCalledOnce();
  });

  it('runs one Provisions batch only after primary planning reports a fodder shortage, then replans', async () => {
    let inventoryVersion = 1;
    let ready = false;
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      readRecoveryState: vi.fn(async () => ({ provisionsBatches: 2 })),
      planPrimarySquad: vi.fn(async () => ready
        ? { ok: true, itemRefs: [{ id: 1 }] }
        : { ok: false, missing: { code: 'PLAYER_COUNT_SHORTAGE' } }),
      recoverProvisions: vi.fn(async ({ context }) => {
        expect(context.trigger).toBe('primary-fodder-shortage');
        ready = true;
        inventoryVersion++;
        return { status: 'submitted' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', recoveries: { total: 1, provisions: 1 } });
    expect(options.recoverProvisions).toHaveBeenCalledOnce();
    expect(options.planPrimarySquad).toHaveBeenCalledTimes(2);
  });

  it('stops when shortage-driven Provisions is blocked before submission', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        missing: { code: 'PLAYER_COUNT_SHORTAGE' },
      })),
      recoverProvisions: vi.fn(async () => ({
        status: 'blocked',
        reason: 'inventory validation failed',
        reasonCode: 'INVENTORY_VALIDATION_FAILED',
      })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'inventory validation failed',
      reasonCode: 'INVENTORY_VALIDATION_FAILED',
    });
    expect(options.planPrimarySquad).toHaveBeenCalledOnce();
  });

  it('submits one Provisions batch immediately when opened duplicate Reserves form a squad', async () => {
    let inventoryVersion = 1;
    let pendingDuplicateBatch = true;
    const options = harness({
      surplusCraftingEnabled: true,
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      readRecoveryState: vi.fn(async () => ({
        provisionsBatches: 1,
        duplicateProvisionBatches: pendingDuplicateBatch ? 1 : 0,
      })),
      recoverProvisions: vi.fn(async ({ context }) => {
        expect(context.trigger).toBe('duplicate-reserve');
        pendingDuplicateBatch = false;
        inventoryVersion++;
        return { status: 'submitted' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', recoveries: { total: 1, provisions: 1 } });
    expect(options.recoverProvisions).toHaveBeenCalledOnce();
    expect(options.planPrimarySquad).toHaveBeenCalledOnce();
  });

  it('does not reinterpret a recovery reward Reserve as a primary-pack duplicate batch', async () => {
    let inventoryVersion = 1;
    let stage = 'primary-reserve';
    const options = harness({
      surplusCraftingEnabled: true,
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      readRecoveryState: vi.fn(async () => ({
        duplicateProvisionBatches: stage === 'primary-reserve' || stage === 'recovery-reserve' ? 1 : 0,
      })),
      recoverProvisions: vi.fn(async () => {
        stage = 'pending-reward';
        inventoryVersion++;
        return { status: 'submitted' };
      }),
      processPendingRecoveryReward: vi.fn(async () => {
        if (stage !== 'pending-reward') return { status: 'skipped' };
        stage = 'recovery-reserve';
        inventoryVersion++;
        return { status: 'opened' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', recoveries: { provisions: 1, reward: 1 } });
    expect(options.recoverProvisions).toHaveBeenCalledOnce();
    expect(options.readRecoveryState).toHaveBeenCalledTimes(2);
  });

  it('clears Storage pressure before retrying a newly submitted recovery reward', async () => {
    let inventoryVersion = 1;
    let pendingAttempts = 0;
    let pending = true;
    const calls = [];
    const options = harness({
      storageSinkEnabled: true,
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      processPendingRecoveryReward: vi.fn(async () => {
        if (!pending) return { status: 'skipped' };
        pendingAttempts++;
        if (pendingAttempts === 1) {
          calls.push('pending-storage-blocked');
          return {
            status: 'blocked',
            reason: 'existing Unassigned cards cannot enter full Storage',
            reasonCode: 'PROTECTED_STORAGE_BLOCKED',
          };
        }
        calls.push('pending-opened');
        pending = false;
        inventoryVersion++;
        return { status: 'opened' };
      }),
      recoverStorageSink: vi.fn(async ({ context }) => {
        calls.push('storage-sink');
        expect(context).toMatchObject({
          trigger: 'storage-pressure',
          source: 'pending-recovery-pre-open',
        });
        inventoryVersion++;
        return { status: 'submitted', submitted: true };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      recoveries: { reward: 1, storageSink: 1 },
    });
    expect(calls).toEqual([
      'pending-storage-blocked',
      'storage-sink',
      'pending-opened',
    ]);
    expect(pendingAttempts).toBe(2);
    expect(options.recoverStorageSink).toHaveBeenCalledOnce();
  });

  it('keeps a newly submitted recovery reward unopened when Storage pressure recovery is disabled', async () => {
    const options = harness({
      storageSinkEnabled: false,
      processPendingRecoveryReward: vi.fn(async () => ({
        status: 'blocked',
        reason: 'existing Unassigned cards cannot enter full Storage',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      })),
      recoverStorageSink: vi.fn(async () => ({ status: 'submitted', submitted: true })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      recoveries: { reward: 0, storageSink: 0 },
    });
    expect(options.processPendingRecoveryReward).toHaveBeenCalledOnce();
    expect(options.recoverStorageSink).not.toHaveBeenCalled();
    expect(options.planPrimarySquad).not.toHaveBeenCalled();
  });

  it('uses emergency Provisions to free Storage before retrying protected routing', async () => {
    let inventoryVersion = 1;
    let storageReady = false;
    const options = harness({
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      resolveProtectedStorage: vi.fn(async () => storageReady
        ? { status: 'ready' }
        : { status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' }),
      recoverProvisions: vi.fn(async ({ context }) => {
        expect(context.trigger).toBe('storage-pressure');
        storageReady = true;
        inventoryVersion++;
        return { status: 'submitted' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', recoveries: { provisions: 1 } });
    expect(options.resolveProtectedStorage).toHaveBeenCalledTimes(2);
  });

  it('continues Storage routing after Provisions consumes an already-stored Reserve', async () => {
    const reserve = { id: 101, definitionId: 1001, pile: 'storage' };
    const deferredHigh = { id: 102, definitionId: 1002, pile: 'unassigned' };
    let routing = {
      status: 'blocked',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      storageItems: [reserve, deferredHigh],
      pendingItems: [deferredHigh],
      entries: [
        { item: reserve, classification: { provisionsReserve: true } },
        { item: deferredHigh, classification: { provisionsReserve: false } },
      ],
    };
    let inventoryVersion = 1;
    let storageFree = 0;
    const options = harness({
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      resolveProtectedStorage: vi.fn(async () => {
        if (routing.pendingItems.length > storageFree) {
          return { status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' };
        }
        routing = { ...routing, status: 'ready', reasonCode: null, pendingItems: [] };
        return { status: 'ready' };
      }),
      recoverProvisions: vi.fn(async ({ context }) => {
        expect(context.trigger).toBe('storage-pressure');
        routing = releaseRollingRoutingItemsAfterConsumption(routing, [reserve]).routing;
        storageFree += 4;
        inventoryVersion++;
        return { status: 'submitted', consumedItemRefs: [reserve] };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', recoveries: { provisions: 1 } });
    expect(routing.storageItems).toEqual([deferredHigh]);
    expect(routing.pendingItems).toEqual([]);
    expect(options.resolveProtectedStorage).toHaveBeenCalledTimes(2);
    expect(options.planPrimarySquad).toHaveBeenCalledOnce();
  });

  it('does not reinterpret an opened-item materialization failure as Storage pressure', async () => {
    const options = harness({
      resolveProtectedStorage: vi.fn(async () => ({
        status: 'blocked',
        reason: '10 opened duplicate item(s) did not materialize in Unassigned',
        reasonCode: 'OPENED_DUPLICATE_NOT_MATERIALIZED',
      })),
      recoverProvisions: vi.fn(async () => ({ status: 'submitted' })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'OPENED_DUPLICATE_NOT_MATERIALIZED',
    });
    expect(options.recoverProvisions).not.toHaveBeenCalled();
    expect(options.submitPrimary).not.toHaveBeenCalled();
  });

  it('uses the Storage sink after emergency Provisions is unavailable', async () => {
    let inventoryVersion = 1;
    let storageReady = false;
    const options = harness({
      storageSinkEnabled: true,
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      resolveProtectedStorage: vi.fn(async () => storageReady
        ? { status: 'ready' }
        : { status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' }),
      recoverProvisions: vi.fn(async () => ({
        status: 'unavailable',
        reason: 'not enough eligible Provisions material',
      })),
      recoverStorageSink: vi.fn(async ({ context }) => {
        expect(context.trigger).toBe('storage-pressure');
        expect(context.provisions.status).toBe('unavailable');
        storageReady = true;
        inventoryVersion++;
        return { status: 'selected' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', recoveries: { storageSink: 1 } });
    expect(options.recoverProvisions).toHaveBeenCalledOnce();
    expect(options.recoverStorageSink).toHaveBeenCalledOnce();
    expect(options.resolveProtectedStorage).toHaveBeenCalledTimes(2);
  });

  it('skips Provisions and uses an explicitly enabled Storage sink when shortage recovery is off', async () => {
    let inventoryVersion = 1;
    let storageReady = false;
    const recoverProvisions = vi.fn(async () => ({ status: 'submitted' }));
    const options = harness({
      provisionsShortageRecoveryEnabled: false,
      storageSinkEnabled: true,
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      resolveProtectedStorage: vi.fn(async () => storageReady
        ? { status: 'ready' }
        : { status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' }),
      recoverProvisions,
      recoverStorageSink: vi.fn(async ({ context }) => {
        expect(context.trigger).toBe('storage-pressure');
        expect(context.provisions).toMatchObject({
          status: 'skipped',
          reasonCode: 'PROVISIONS_SHORTAGE_RECOVERY_DISABLED',
        });
        storageReady = true;
        inventoryVersion++;
        return { status: 'selected' };
      }),
    });

    expect(await runRollingUpgradeWorkflow(options)).toMatchObject({
      status: 'completed',
      recoveries: { provisions: 0, storageSink: 1 },
    });
    expect(recoverProvisions).not.toHaveBeenCalled();
    expect(options.recoverStorageSink).toHaveBeenCalledOnce();
  });

  it('does not auto-craft a Storage sink Required Special when its permission is off', async () => {
    const recoverRequiredSpecial = vi.fn(async () => ({ status: 'submitted' }));
    const options = harness({
      requiredSpecialRecoveryEnabled: false,
      storageSinkEnabled: true,
      resolveProtectedStorage: vi.fn(async () => ({
        status: 'blocked',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      })),
      recoverProvisions: vi.fn(async () => ({ status: 'unavailable' })),
      recoverStorageSink: vi.fn(async () => ({
        status: 'unavailable',
        reasonCode: 'REQUIRED_SPECIAL_SHORTAGE',
      })),
      recoverRequiredSpecial,
    });

    expect(await runRollingUpgradeWorkflow(options)).toMatchObject({
      status: 'blocked',
      reason: 'Required Special/TOTW recovery is disabled in Settings',
      reasonCode: 'REQUIRED_SPECIAL_RECOVERY_DISABLED',
    });
    expect(recoverRequiredSpecial).not.toHaveBeenCalled();
  });

  it('recovers a Required Special dependency before retrying a blocked Storage sink', async () => {
    let inventoryVersion = 1;
    let storageReady = false;
    let specialReady = false;
    const calls = [];
    const options = harness({
      storageSinkEnabled: true,
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      resolveProtectedStorage: vi.fn(async () => storageReady
        ? { status: 'ready' }
        : { status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' }),
      recoverProvisions: vi.fn(async () => {
        calls.push('provisions');
        return { status: 'unavailable' };
      }),
      recoverStorageSink: vi.fn(async () => {
        calls.push('storage-sink');
        return specialReady
          ? { status: 'selected' }
          : {
              status: 'unavailable',
              reason: 'Storage sink Required Special has only 0/1 safe candidates',
              reasonCode: 'REQUIRED_SPECIAL_SHORTAGE',
            };
      }),
      recoverRequiredSpecial: vi.fn(async ({ context }) => {
        calls.push('required-special');
        expect(context).toMatchObject({
          trigger: 'storage-sink-required-special-shortage',
          source: 'storage-sink-dependency',
        });
        specialReady = true;
        storageReady = true;
        inventoryVersion++;
        return { status: 'submitted', submitted: true };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'completed',
      recoveries: { storageSink: 0, requiredSpecial: 1 },
    });
    expect(calls).toEqual(['provisions', 'storage-sink', 'required-special']);
    expect(options.resolveProtectedStorage).toHaveBeenCalledTimes(2);
  });

  it('reports an unavailable Storage sink Required Special dependency explicitly', async () => {
    const options = harness({
      storageSinkEnabled: true,
      resolveProtectedStorage: vi.fn(async () => ({
        status: 'blocked',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      })),
      recoverProvisions: vi.fn(async () => ({ status: 'unavailable' })),
      recoverStorageSink: vi.fn(async () => ({
        status: 'unavailable',
        reason: 'Storage sink Required Special has only 0/1 safe candidates',
        reasonCode: 'REQUIRED_SPECIAL_SHORTAGE',
      })),
      recoverRequiredSpecial: vi.fn(async () => ({
        status: 'unavailable',
        reason: 'dynamic 84+ TOTW Upgrade capability is unavailable',
      })),
    });

    expect(await runRollingUpgradeWorkflow(options)).toMatchObject({
      status: 'unavailable',
      reason: 'dynamic 84+ TOTW Upgrade capability is unavailable',
      reasonCode: 'REQUIRED_SPECIAL_RECOVERY_BLOCKED',
    });
    expect(options.recoverRequiredSpecial).toHaveBeenCalledOnce();
  });

  it('continues after the 89 Storage Sink squad is submitted and defers the 88 squad', async () => {
    let inventoryVersion = 1;
    let storageReady = false;
    const options = harness({
      storageSinkEnabled: true,
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      resolveProtectedStorage: vi.fn(async () => storageReady
        ? { status: 'ready' }
        : { status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' }),
      recoverProvisions: vi.fn(async () => ({ status: 'unavailable' })),
      recoverStorageSink: vi.fn(async () => {
        storageReady = true;
        inventoryVersion++;
        return {
          status: 'submitted',
          submitted: true,
          reasonCode: 'STORAGE_SINK_88_DEFERRED',
          details: { submittedRatings: [89], remainingRatings: [88] },
        };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({ status: 'completed', recoveries: { storageSink: 1 } });
    expect(options.recoverStorageSink).toHaveBeenCalledOnce();
    expect(options.resolveProtectedStorage).toHaveBeenCalledTimes(2);
  });

  it('keeps the Storage sink disabled by default and preserves the Storage block', async () => {
    const recoverStorageSink = vi.fn(async () => ({ status: 'selected' }));
    const options = harness({
      resolveProtectedStorage: vi.fn(async () => ({
        status: 'blocked',
        reason: 'Storage still full',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      })),
      recoverProvisions: vi.fn(async () => ({ status: 'unavailable' })),
      recoverStorageSink,
    });

    expect(await runRollingUpgradeWorkflow(options)).toMatchObject({
      status: 'blocked',
      reason: 'Storage still full',
      reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      recoveries: { storageSink: 0 },
    });
    expect(recoverStorageSink).not.toHaveBeenCalled();
  });

  it('preserves the specific Storage Sink failure when both Storage recoveries are unavailable', async () => {
    const options = harness({
      storageSinkEnabled: true,
      resolveProtectedStorage: vi.fn(async () => ({
        status: 'blocked',
        reason: 'Storage still full',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
      })),
      recoverProvisions: vi.fn(async () => ({ status: 'unavailable' })),
      recoverStorageSink: vi.fn(async () => ({
        status: 'unavailable',
        reason: 'both squads require more than three Club cards',
        reasonCode: 'STORAGE_SINK_SOURCE_PRIORITY_UNSATISFIED',
      })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'both squads require more than three Club cards',
      reasonCode: 'STORAGE_SINK_SOURCE_PRIORITY_UNSATISFIED',
      recoveries: { storageSink: 0 },
    });
    expect(options.planPrimarySquad).not.toHaveBeenCalled();
  });

  it('does not call the Storage sink on the normal path or after a hard Provisions failure', async () => {
    const normal = harness({ recoverStorageSink: vi.fn() });
    expect((await runRollingUpgradeWorkflow(normal)).status).toBe('completed');
    expect(normal.recoverStorageSink).not.toHaveBeenCalled();

    const blocked = harness({
      resolveProtectedStorage: vi.fn(async () => ({ status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' })),
      recoverProvisions: vi.fn(async () => ({ status: 'blocked', reason: 'EA submit failed' })),
      recoverStorageSink: vi.fn(),
    });
    expect(await runRollingUpgradeWorkflow(blocked)).toMatchObject({
      status: 'blocked',
      reason: 'EA submit failed',
    });
    expect(blocked.recoverStorageSink).not.toHaveBeenCalled();
  });

  it('enforces Storage sink progress fingerprints and budgets', async () => {
    const noProgress = harness({
      storageSinkEnabled: true,
      getProgressFingerprint: vi.fn(async () => 'inventory:1'),
      resolveProtectedStorage: vi.fn(async () => ({ status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' })),
      recoverProvisions: vi.fn(async () => ({ status: 'unavailable' })),
      recoverStorageSink: vi.fn(async () => ({ status: 'selected' })),
    });
    expect(await runRollingUpgradeWorkflow(noProgress)).toMatchObject({
      status: 'blocked',
      reasonCode: 'RECOVERY_NO_PROGRESS',
      recoveries: { storageSink: 0 },
    });

    let version = 0;
    const budgeted = harness({
      storageSinkEnabled: true,
      recoveryBudgets: { storageSink: 1 },
      getProgressFingerprint: vi.fn(async () => `inventory:${version}`),
      resolveProtectedStorage: vi.fn(async () => ({ status: 'blocked', reasonCode: 'PROTECTED_STORAGE_BLOCKED' })),
      recoverProvisions: vi.fn(async () => ({ status: 'unavailable' })),
      recoverStorageSink: vi.fn(async () => {
        version++;
        return { status: 'selected' };
      }),
    });
    expect(await runRollingUpgradeWorkflow(budgeted)).toMatchObject({
      status: 'blocked',
      reasonCode: 'RECOVERY_BUDGET_REACHED',
      recoveries: { storageSink: 1 },
    });
    expect(budgeted.recoverStorageSink).toHaveBeenCalledOnce();
  });

  it('blocks a recovery that reports progress without changing its fingerprint', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => 'inventory:1'),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        missing: { code: 'REQUIRED_SPECIAL_SHORTAGE' },
      })),
      recoverRequiredSpecial: vi.fn(async () => ({ status: 'progressed' })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'RECOVERY_NO_PROGRESS',
      recoveries: { total: 0 },
    });
  });

  it('enforces per-primary recovery budgets', async () => {
    let inventoryVersion = 1;
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      recoveryBudgets: { requiredSpecial: 1 },
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        missing: { code: 'REQUIRED_SPECIAL_SHORTAGE' },
      })),
      recoverRequiredSpecial: vi.fn(async () => {
        inventoryVersion++;
        return { status: 'progressed' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'RECOVERY_BUDGET_REACHED',
      recoveries: { total: 1, requiredSpecial: 1 },
    });
    expect(options.recoverRequiredSpecial).toHaveBeenCalledOnce();
  });

  it('lets a recovery adapter publish a more specific bounded phase', async () => {
    let inventoryVersion = 1;
    let drained = false;
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      getProgressFingerprint: vi.fn(async () => inventoryVersion),
      drainRecoveryDuplicates: vi.fn(async ({ reportPhase }) => {
        if (drained) return { status: 'skipped' };
        drained = true;
        await reportPhase(ROLLING_UPGRADE_PHASES.REDEEM_RARE_GOLD_PICK);
        inventoryVersion++;
        return { status: 'selected' };
      }),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result.status).toBe('completed');
    expect(options.onEvent).toHaveBeenCalledWith('phase', expect.objectContaining({
      phase: ROLLING_UPGRADE_PHASES.REDEEM_RARE_GOLD_PICK,
      recovery: 'goldDrain',
    }));
    expect(options.planPrimarySquad).toHaveBeenCalledOnce();
    expect(options.submitPrimary).toHaveBeenCalledOnce();
  });

  it('reports an unavailable Required Special capability without submitting the primary SBC', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        missing: { code: 'REQUIRED_SPECIAL_SHORTAGE' },
      })),
      recoverRequiredSpecial: vi.fn(async () => ({
        status: 'unavailable',
        reason: 'dynamic 84+ TOTW Upgrade capability is unavailable',
      })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'unavailable',
      reasonCode: 'REQUIRED_SPECIAL_RECOVERY_BLOCKED',
      reason: 'dynamic 84+ TOTW Upgrade capability is unavailable',
    });
    expect(options.submitPrimary).not.toHaveBeenCalled();
  });

  it('stops Dry Run at the first unknown Provisions reward boundary', async () => {
    const options = harness({
      findPrimaryPack: vi.fn(async () => null),
      planPrimarySquad: vi.fn(async () => ({
        ok: false,
        missing: { code: 'PLAYER_COUNT_SHORTAGE' },
      })),
      recoverProvisions: vi.fn(async () => ({
        status: 'planned',
        reason: 'dry-run Provisions squad plan complete',
      })),
    });

    const result = await runRollingUpgradeWorkflow(options);

    expect(result).toMatchObject({
      status: 'planned',
      phase: ROLLING_UPGRADE_PHASES.RECOVER_PROVISIONS,
      completions: 0,
    });
    expect(options.submitPrimary).not.toHaveBeenCalled();
  });
});
