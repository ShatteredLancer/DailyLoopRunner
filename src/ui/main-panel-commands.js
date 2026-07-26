export function createMainPanelCommands(options = {}) {
  const state = options.state;
  if (!state) throw new TypeError('runtime state is required');
  const log = options.log || (() => {});
  const setPanelState = options.setPanelState || (() => {});

  const commands = {
    selectLoop() {
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
    savePickOptions(event) {
      options.savePickOptions?.(event);
      return true;
    },
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
    async scanPicks() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      state.scanningPicks = true;
      setPanelState();
      try {
        const scanOptions = options.getDynamicSbcScanOptions?.() || {};
        await (options.scanDynamicSbcs || options.scanPlayerPicks)?.(scanOptions);
        return true;
      } catch (error) {
        log(`Dynamic SBC scan failed: ${error?.message || error}`);
        return false;
      } finally {
        options.resetDynamicSbcScanMode?.();
        state.scanningPicks = false;
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
