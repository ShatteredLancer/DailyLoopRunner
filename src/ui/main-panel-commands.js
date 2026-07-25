export function createMainPanelCommands(options = {}) {
  const state = options.state;
  if (!state) throw new TypeError('runtime state is required');
  const log = options.log || (() => {});
  const setPanelState = options.setPanelState || (() => {});

  const commands = {
    selectLoop() {
      options.updateLoopControls?.();
    },
    openBuilder() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      options.openBuilder?.('workflows');
      return true;
    },
    validateJson() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      options.openBuilder?.('json');
      return true;
    },
    async savePickOptions(event) {
      options.savePickOptions?.(event);
      if (event?.target?.id !== 'bronze-loop-pick-prefer-scanned' || event.target.checked !== true) return true;
      return commands.scanPicks();
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
    previewPickRecap() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      options.previewPickRecap?.();
      return true;
    },
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
        await options.scanPlayerPicks?.();
        return true;
      } catch (error) {
        log(`Player Pick scan failed: ${error?.message || error}`);
        return false;
      } finally {
        state.scanningPicks = false;
        setPanelState();
      }
    },
    async loadJson() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      state.loadingLoops = true;
      setPanelState();
      try {
        log(`Importing loop definitions from ${options.loopConfigUrl} into the Builder draft`);
        await options.importLoopConfig?.(options.loopConfigUrl);
        return true;
      } catch (error) {
        log(`Loop JSON import failed: ${error?.message || error}`);
        return false;
      } finally {
        state.loadingLoops = false;
        setPanelState();
      }
    },
    useBuiltIn() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      options.useBuiltIn?.();
      setPanelState();
      return true;
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
