export function createMainPanelCommands(options = {}) {
  const state = options.state;
  if (!state) throw new TypeError('runtime state is required');
  const log = options.log || (() => {});
  const setPanelState = options.setPanelState || (() => {});

  const commands = {
    selectLoop(selectedId) {
      if (selectedId !== 'custom') options.setLoopJson?.(options.getLoopDefById?.(selectedId));
      options.updateLoopControls?.();
    },
    editJson: options.updateLoopControls,
    jsonInput: options.updateLoopControls,
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
        log(`Loading loop definitions from ${options.loopConfigUrl}`);
        await options.loadLoopConfig?.(options.loopConfigUrl);
        return true;
      } catch (error) {
        log(`Loop JSON load failed: ${error?.message || error}`);
        return false;
      } finally {
        state.loadingLoops = false;
        setPanelState();
      }
    },
    useBuiltIn() {
      if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
      options.resetLoopDefs?.();
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
