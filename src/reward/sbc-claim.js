function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function hasPackCountIncrease(before = new Map(), after = new Map()) {
  for (const [id, count] of after.entries()) {
    if (Number(count || 0) > Number(before.get(id) || 0)) return true;
  }
  return false;
}

export function hasSbcProgressAdvanced(before = {}, after = {}) {
  if (after.setComplete === true && before.setComplete !== true) return true;

  const beforeSetCount = finiteNumber(before.setTimesCompleted);
  const afterSetCount = finiteNumber(after.setTimesCompleted);
  if (beforeSetCount !== null && afterSetCount !== null && afterSetCount > beforeSetCount) return true;

  const beforeChallenges = new Map((before.challenges || []).map((challenge) => [Number(challenge.id || 0), challenge]));
  return (after.challenges || []).some((challenge) => {
    const previous = beforeChallenges.get(Number(challenge.id || 0));
    if (!previous) return challenge.completed === true;
    if (challenge.completed === true && previous.completed !== true) return true;
    const beforeCount = finiteNumber(previous.timesCompleted);
    const afterCount = finiteNumber(challenge.timesCompleted);
    return beforeCount !== null && afterCount !== null && afterCount > beforeCount;
  });
}

export async function claimSbcRewards(options = {}) {
  const {
    label = 'SBC submit',
    beforePackCounts,
    beforeProgress,
    overlay,
    getPackCounts,
    getProgress,
    refreshPacks,
    popupShieldShowing,
    click,
    keyStroke,
    waitLoadingEnd,
    sleep,
    stopPoint,
    failIfSubmitError,
    log,
    now = Date.now,
  } = options;
  const startedAt = now();
  let lastHotkeyAt = 0;
  let lastPackRefreshAt = 0;
  while (now() - startedAt < 25000) {
    stopPoint();
    failIfSubmitError(label);
    if (await overlay.dismiss(label)) continue;
    const button = overlay.findClaimButton();
    if (button) {
      log(`${label}: claiming rewards`);
      click(button);
      await waitLoadingEnd(900, 45000);
      await sleep(1200);
      return true;
    }

    const elapsed = now() - startedAt;
    if (elapsed >= 1500) {
      const progressAdvanced = beforeProgress
        ? hasSbcProgressAdvanced(beforeProgress, getProgress())
        : false;
      let packGranted = beforePackCounts
        ? hasPackCountIncrease(beforePackCounts, getPackCounts())
        : false;
      if (!packGranted && beforePackCounts && elapsed - lastPackRefreshAt >= 2500) {
        lastPackRefreshAt = elapsed;
        await refreshPacks().catch(() => null);
        packGranted = hasPackCountIncrease(beforePackCounts, getPackCounts());
      }
      if ((progressAdvanced || packGranted) && !overlay.isVisible() && !popupShieldShowing()) {
        log(`${label}: rewards already granted (${packGranted ? 'My Packs increased' : 'SBC progress advanced'}); skipping Claim Rewards wait`);
        return true;
      }
    }

    const context = overlay.findClaimContext();
    const currentTime = now();
    if (context && currentTime - lastHotkeyAt > 2500) {
      lastHotkeyAt = currentTime;
      log(`${label}: Claim Rewards button not clickable; trying AltRight reward hotkey`);
      keyStroke('Alt', 'AltRight', { altKey: true, location: 2 });
      keyStroke('AltRight', 'AltRight', { altKey: true, location: 2 });
      await waitLoadingEnd(500, 12000);
      await sleep(1200);
      return true;
    }
    await sleep(500);
  }
  const context = overlay.findClaimContext();
  const contextText = context?.text ? `; modal text: ${context.text.slice(0, 180)}` : '';
  log(`${label}: Claim Rewards button not detected${contextText}; continuing`);
  return false;
}
