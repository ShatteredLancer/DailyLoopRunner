import { describe, expect, it, vi } from 'vitest';
import { claimSbcRewards, hasPackCountIncrease, hasSbcProgressAdvanced } from '../../src/reward/sbc-claim.js';

function rewardHarness(overrides = {}) {
  const log = vi.fn();
  const overlay = {
    dismiss: vi.fn(async () => false),
    findClaimButton: vi.fn(() => null),
    findClaimContext: vi.fn(() => null),
    isVisible: vi.fn(() => false),
  };
  return {
    label: 'Test SBC',
    overlay,
    getPackCounts: vi.fn(() => new Map()),
    getProgress: vi.fn(() => ({})),
    refreshPacks: vi.fn(async () => {}),
    popupShieldShowing: vi.fn(() => false),
    click: vi.fn(),
    keyStroke: vi.fn(),
    waitLoadingEnd: vi.fn(async () => {}),
    sleep: vi.fn(async () => {}),
    stopPoint: vi.fn(),
    failIfSubmitError: vi.fn(),
    log,
    ...overrides,
  };
}

describe('SBC reward claim completion signals', () => {
  it('detects a newly granted pack even when that pack type already existed', () => {
    expect(hasPackCountIncrease(
      new Map([['1031', 4], ['1078', 1]]),
      new Map([['1031', 5], ['1078', 1]]),
    )).toBe(true);
    expect(hasPackCountIncrease(
      new Map([['1031', 5]]),
      new Map([['1031', 5]]),
    )).toBe(false);
  });

  it('detects set or challenge progress after an SBC submit callback settles', () => {
    expect(hasSbcProgressAdvanced(
      { setComplete: false, setTimesCompleted: 2, challenges: [{ id: 10, completed: false, timesCompleted: 2 }] },
      { setComplete: false, setTimesCompleted: 3, challenges: [{ id: 10, completed: false, timesCompleted: 3 }] },
    )).toBe(true);
    expect(hasSbcProgressAdvanced(
      { setComplete: false, challenges: [{ id: 10, completed: false }] },
      { setComplete: true, challenges: [{ id: 10, completed: true }] },
    )).toBe(true);
    expect(hasSbcProgressAdvanced(
      { setComplete: false, setTimesCompleted: 3, challenges: [{ id: 10, completed: false, timesCompleted: 3 }] },
      { setComplete: false, setTimesCompleted: 3, challenges: [{ id: 10, completed: false, timesCompleted: 3 }] },
    )).toBe(false);
  });

  it('claims an immediately clickable reward and preserves the wait timing', async () => {
    const button = { id: 'claim' };
    const harness = rewardHarness();
    harness.overlay.findClaimButton.mockReturnValue(button);

    await expect(claimSbcRewards(harness)).resolves.toBe(true);
    expect(harness.click).toHaveBeenCalledWith(button);
    expect(harness.waitLoadingEnd).toHaveBeenCalledWith(900, 45000);
    expect(harness.sleep).toHaveBeenCalledWith(1200);
    expect(harness.log).toHaveBeenCalledWith('Test SBC: claiming rewards');
  });

  it('stops waiting when the SBC progress snapshot advances', async () => {
    let currentTime = 0;
    const harness = rewardHarness({
      beforeProgress: { setComplete: false, setTimesCompleted: 2, challenges: [] },
      getProgress: vi.fn(() => ({ setComplete: false, setTimesCompleted: 3, challenges: [] })),
      now: () => {
        currentTime += 800;
        return currentTime;
      },
    });

    await expect(claimSbcRewards(harness)).resolves.toBe(true);
    expect(harness.refreshPacks).not.toHaveBeenCalled();
    expect(harness.log).toHaveBeenCalledWith(
      'Test SBC: rewards already granted (SBC progress advanced); skipping Claim Rewards wait',
    );
  });

  it('refreshes My Packs after 2.5 seconds and accepts a count increase', async () => {
    let currentTime = 0;
    let packCount = 4;
    const harness = rewardHarness({
      beforePackCounts: new Map([['1031', 4]]),
      getPackCounts: vi.fn(() => new Map([['1031', packCount]])),
      refreshPacks: vi.fn(async () => { packCount = 5; }),
      now: () => {
        currentTime += 800;
        return currentTime;
      },
    });

    await expect(claimSbcRewards(harness)).resolves.toBe(true);
    expect(harness.refreshPacks).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledWith(
      'Test SBC: rewards already granted (My Packs increased); skipping Claim Rewards wait',
    );
  });

  it('uses the AltRight fallback when the reward context is present but not clickable', async () => {
    let currentTime = 0;
    const harness = rewardHarness({
      now: () => {
        currentTime += 1000;
        return currentTime;
      },
    });
    harness.overlay.findClaimContext.mockReturnValue({ text: 'Rewards Player Pack' });

    await expect(claimSbcRewards(harness)).resolves.toBe(true);
    expect(harness.keyStroke).toHaveBeenNthCalledWith(1, 'Alt', 'AltRight', { altKey: true, location: 2 });
    expect(harness.keyStroke).toHaveBeenNthCalledWith(2, 'AltRight', 'AltRight', { altKey: true, location: 2 });
    expect(harness.waitLoadingEnd).toHaveBeenCalledWith(500, 12000);
  });

  it('logs the modal context and continues after the 25 second limit', async () => {
    const times = [0, 26000];
    const harness = rewardHarness({ now: () => times.shift() ?? 26000 });
    harness.overlay.findClaimContext.mockReturnValue({ text: 'Reward modal remains open' });

    await expect(claimSbcRewards(harness)).resolves.toBe(false);
    expect(harness.log).toHaveBeenCalledWith(
      'Test SBC: Claim Rewards button not detected; modal text: Reward modal remains open; continuing',
    );
  });
});
