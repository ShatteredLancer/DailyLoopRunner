export function createMainPanelCommands(options = {}) {
  const state = options.state;
  if (!state) throw new TypeError('runtime state is required');
  const log = options.log || (() => {});
  const setPanelState = options.setPanelState || (() => {});
  const wait = options.wait || ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));

  const commands = {
    selectLoop(loopId) {
      const defaults = options.getLoopSelectionDefaults?.(loopId) || {};
      if (defaults.openRewardPacks === true) options.setOpenRewardPacksEnabled?.(true);
      options.updateLoopControls?.();
    },
    selectProfile(profileId) {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      try {
        options.selectProfile?.(profileId);
        options.renderProfiles?.();
        setPanelState();
        return true;
      } catch (error) {
        log(`Profile switch failed: ${error?.message || error}`);
        options.renderProfiles?.();
        setPanelState();
        return false;
      }
    },
    openBuilder() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      options.openBuilder?.('workflows');
      return true;
    },
    openHelp(topic) {
      options.openHelp?.(topic);
      return true;
    },
    setLayoutMode(layoutMode) {
      options.setLayoutMode?.(layoutMode);
      setPanelState();
      return true;
    },
    openSelectionPolicySettings: options.openSelectionPolicySettings,
    saveLoopOptions: options.saveLoopOptions,
    saveRewardAlertEnabled: options.saveRewardAlertEnabled,
    openRewardAlertSettings: options.openRewardAlertSettings,
    start() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      options.start?.();
      return true;
    },
    openBatch() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      options.openBatch?.();
      return true;
    },
    openTrade() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      options.openTrade?.();
      return true;
    },
    reopenRecap: options.reopenRecap,
    async refresh() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      state.refreshing = true;
      setPanelState();
      try {
        await options.refreshInventoryCaches?.('manual button');
        return true;
      } catch (error) {
        log(`Cache refresh failed: ${error?.message || error}`);
        return false;
      } finally {
        state.refreshing = false;
        setPanelState();
      }
    },
    async resolvePendingPrimaryReward() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      state.refreshing = true;
      setPanelState();
      try {
        return (await options.resolvePendingPrimaryReward?.()) === true;
      } catch (error) {
        log(`Pending primary reward recovery failed: ${error?.message || error}`);
        return false;
      } finally {
        state.refreshing = false;
        setPanelState();
      }
    },
    async scanPicks() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      state.scanningPicks = true;
      state.dynamicSbcScanProgress = {
        phase: 'refreshing',
        completed: 0,
        total: 0,
        label: 'Refreshing SBC index',
      };
      setPanelState();
      try {
        const scan = options.scanDynamicSbcs || options.scanPlayerPicks;
        const initialScanOptions = options.getDynamicSbcScanOptions?.() || {};
        let scanOptions = initialScanOptions;
        let summary = null;
        for (let pass = 1; pass <= 3; pass++) {
          summary = await scan?.(scanOptions);
          const failures = Math.max(0, Number(summary?.stats?.loadFailures || 0) || 0);
          if (!failures) break;
          if (pass >= 3) {
            log(`Dynamic SBC scan remains incomplete after ${pass} pass(es): ${failures} Challenge metadata load(s) unavailable`);
            break;
          }
          const delayMs = Number(summary?.stats?.circuitBreakers || 0) > 0 ? 5000 : 3000;
          log(`Dynamic SBC scan pass ${pass} left ${failures} Challenge metadata load(s) unavailable; retrying unresolved SBCs automatically in ${delayMs}ms`);
          state.dynamicSbcScanProgress = {
            phase: 'retrying',
            completed: 0,
            total: 0,
            label: `Waiting to retry unresolved SBCs (${pass + 1}/3)`,
          };
          setPanelState();
          await wait(delayMs);
          scanOptions = {
            ...initialScanOptions,
            forceFull: false,
            clearCache: false,
          };
        }
        return true;
      } catch (error) {
        log(`Dynamic SBC scan failed: ${error?.message || error}`);
        return false;
      } finally {
        options.resetDynamicSbcScanMode?.();
        state.scanningPicks = false;
        state.dynamicSbcScanProgress = null;
        setPanelState();
      }
    },
    stop() {
      state.stopping = true;
      log('Stop requested; waiting for current safe point');
      setPanelState();
    },
    async copyLog() {
      await options.userEffects?.copyText?.(options.getLogText?.() || '');
      log('Log copied to clipboard');
    },
    clearLog: options.clearLog,
    downloadLog() {
      const timestamp = Number(options.now?.() || Date.now());
      options.userEffects?.downloadText?.(options.getLogText?.() || '', `bronze-loop-${timestamp}.log`);
      log('Log download created');
    },
  };
  return Object.freeze(commands);
}
