import { describe, expect, it, vi } from 'vitest';
import {
  isSbcControllerName,
  isSbcSquadControllerName,
  synchronizeAfterSbcSubmit,
  unwindSbcSquadControllers,
} from '../../src/sbc/navigation-sync.js';

describe('SBC navigation synchronization', () => {
  it('classifies SBC squad and general SBC controllers', () => {
    expect(isSbcSquadControllerName('UTSBCSquadSplitViewController')).toBe(true);
    expect(isSbcControllerName('UTSBCHubViewController')).toBe(true);
    expect(isSbcControllerName('UTStorePackViewController')).toBe(false);
  });

  it('pops stale squad controllers until the current controller leaves the squad screen', async () => {
    const first = { name: 'first' };
    const second = { name: 'second' };
    const store = { name: 'store' };
    const controllers = [first, second, store];
    let index = 0;
    const logs = [];
    const popController = vi.fn(() => { index++; return true; });
    const waitLoadingEnd = vi.fn(async () => true);
    const sleep = vi.fn(async () => {});

    await expect(unwindSbcSquadControllers({
      label: 'Provision resume',
      currentController: () => controllers[index],
      currentControllerName: () => index < 2 ? 'UTSBCSquadSplitViewController' : 'UTStorePackViewController',
      popController,
      waitLoadingEnd,
      sleep,
      log: (message) => logs.push(message),
    })).resolves.toBe(2);

    expect(popController).toHaveBeenCalledTimes(2);
    expect(waitLoadingEnd).toHaveBeenNthCalledWith(1, 350, 10000);
    expect(sleep).not.toHaveBeenCalled();
    expect(logs).toEqual([
      'Provision resume: removed 2 stale SBC squad view(s); current controller UTStorePackViewController',
    ]);
  });

  it('preserves unavailable and unchanged-controller stop conditions', async () => {
    const controller = {};
    const unavailableLogs = [];
    await expect(unwindSbcSquadControllers({
      label: 'Daily Rare',
      currentController: () => controller,
      currentControllerName: () => 'UTSBCSquadSplitViewController',
      popController: () => false,
      waitLoadingEnd: async () => true,
      sleep: async () => {},
      log: (message) => unavailableLogs.push(message),
    })).resolves.toBe(0);
    expect(unavailableLogs).toEqual([
      'Daily Rare: cannot exit UTSBCSquadSplitViewController; navigation pop method is unavailable',
    ]);

    const stuckLogs = [];
    const sleep = vi.fn(async () => {});
    await expect(unwindSbcSquadControllers({
      label: '84x10',
      currentController: () => controller,
      currentControllerName: () => 'UTSBCSquadSplitViewController',
      popController: () => true,
      waitLoadingEnd: async () => true,
      sleep,
      log: (message) => stuckLogs.push(message),
    })).resolves.toBe(1);
    expect(sleep).toHaveBeenCalledTimes(12);
    expect(stuckLogs).toEqual([
      '84x10: SBC squad controller did not change after navigation pop 1',
      '84x10: removed 1 stale SBC squad view(s); current controller UTSBCSquadSplitViewController',
    ]);
  });

  it('re-unwinds after Unassigned and uses Store Packs when still inside the SBC area', async () => {
    let name = 'UTSBCSquadSplitViewController';
    const calls = [];
    const logs = [];
    const unwind = vi.fn(async (label) => {
      calls.push(['unwind', label]);
      name = label.endsWith('post-unassigned') ? 'UTSBCHubViewController' : 'UTSBCChallengesViewController';
    });
    const showUnassigned = vi.fn(async (label) => {
      calls.push(['unassigned', label]);
      name = 'UTSBCSquadSplitViewController';
    });
    const openStorePacks = vi.fn(async (label) => {
      calls.push(['store', label]);
      name = 'UTStorePackViewController';
      return true;
    });

    await expect(synchronizeAfterSbcSubmit({
      label: '84+ TOTW',
      currentControllerName: () => name,
      unwind,
      showUnassigned,
      openStorePacks,
      log: (message) => logs.push(message),
    })).resolves.toEqual({
      before: 'UTSBCSquadSplitViewController',
      after: 'UTStorePackViewController',
    });

    expect(calls).toEqual([
      ['unwind', '84+ TOTW post-submit'],
      ['unassigned', '84+ TOTW post-submit navigation sync'],
      ['unwind', '84+ TOTW post-unassigned'],
      ['store', '84+ TOTW post-submit Store sync'],
    ]);
    expect(logs).toEqual([
      '84+ TOTW: controller is still UTSBCHubViewController in the SBC area after navigation cleanup; opening Store Packs as a final fallback',
      '84+ TOTW: post-submit controller UTSBCSquadSplitViewController -> UTStorePackViewController',
    ]);
  });

  it('continues and logs when the Store fallback fails', async () => {
    const logs = [];
    await expect(synchronizeAfterSbcSubmit({
      label: 'Daily Common',
      currentControllerName: () => 'UTSBCChallengesViewController',
      unwind: async () => {},
      showUnassigned: async () => {},
      openStorePacks: async () => { throw new Error('store unavailable'); },
      log: (message) => logs.push(message),
    })).resolves.toEqual({ before: 'UTSBCChallengesViewController', after: 'UTSBCChallengesViewController' });
    expect(logs).toEqual([
      'Daily Common: controller is still UTSBCChallengesViewController in the SBC area after navigation cleanup; opening Store Packs as a final fallback',
      'Daily Common: post-submit Store sync skipped: store unavailable',
      'Daily Common: post-submit controller UTSBCChallengesViewController -> UTSBCChallengesViewController',
    ]);
  });
});
