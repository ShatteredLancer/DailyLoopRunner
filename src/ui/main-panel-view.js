export const MAIN_PANEL_STYLE = `
  #bronze-loop-panel {
    position: fixed;
    right: 10px;
    bottom: 10px;
    z-index: 999999;
    width: 300px;
    height: 178px;
    min-width: 300px;
    min-height: 178px;
    display: flex;
    flex-direction: column;
    background: #15181d;
    border: 1px solid #5b6f8f;
    color: #f4f6f8;
    font: 12px Arial, sans-serif;
    padding: 8px;
    box-shadow: 0 8px 30px rgba(0,0,0,.35);
    box-sizing: border-box;
  }
  #bronze-loop-panel.startup-hidden {
    visibility: hidden;
    pointer-events: none;
  }
  #bronze-loop-panel .panel-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  #bronze-loop-run-view { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  #bronze-loop-mobile-tabs, #bronze-loop-run-summary { display: none; }
  .bronze-loop-resize { position: absolute; z-index: 2; touch-action: none; }
  #bronze-loop-resize-n { top: -3px; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
  #bronze-loop-resize-s { bottom: -3px; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
  #bronze-loop-resize-e { top: 12px; bottom: 12px; right: -3px; width: 6px; cursor: ew-resize; }
  #bronze-loop-resize-w { top: 12px; bottom: 12px; left: -3px; width: 6px; cursor: ew-resize; }
  #bronze-loop-resize-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
  #bronze-loop-resize-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
  #bronze-loop-resize-se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
  #bronze-loop-resize-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
  #bronze-loop-panel.icon-only .bronze-loop-resize { display: none; }
  #bronze-loop-panel.icon-only {
    width: 36px;
    height: 36px;
    min-width: 0;
    min-height: 0;
    padding: 0;
    background: rgba(12,15,19,.72);
    border: 1px solid #78a6ff;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0,0,0,.28);
  }
  #bronze-loop-panel.icon-only .panel-body,
  #bronze-loop-panel.icon-only .bronze-loop-title-label,
  #bronze-loop-panel.icon-only #bronze-loop-options-toggle { display: none; }
  #bronze-loop-panel.icon-only #bronze-loop-drag { width: 34px; height: 34px; margin: 0; justify-content: center; }
  #bronze-loop-drag { cursor: move; user-select: none; justify-content: space-between; }
  .bronze-loop-title-label { display: flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0; }
  #bronze-loop-title { flex: 0 1 auto; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bronze-loop-title-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
  #bronze-loop-panel .row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  #bronze-loop-panel button { min-width: 62px; height: 26px; cursor: pointer; font-size: 11px; background: #222832; color: #fff; border: 1px solid #607089; }
  #bronze-loop-panel button:disabled { opacity: .45; cursor: default; }
  #bronze-loop-collapse { min-width: 28px !important; width: 28px; padding: 0; }
  #bronze-loop-panel.icon-only #bronze-loop-collapse {
    min-width: 34px !important;
    width: 34px;
    height: 34px;
    border: 0;
    background: transparent;
    color: #78a6ff;
    font-weight: 700;
  }
  #bronze-loop-options-toggle { min-width: 58px; }
  #bronze-loop-panel .bronze-loop-help-button { min-width: 18px; width: 18px; height: 18px; padding: 0; border-radius: 50%; font-size: 10px; font-weight: 700; line-height: 1; }
  #bronze-loop-panel input { width: 54px; height: 24px; background: #222832; color: #fff; border: 1px solid #607089; box-sizing: border-box; }
  #bronze-loop-panel input[type="checkbox"] { width: 14px; height: 14px; accent-color: #78a6ff; }
  #bronze-loop-panel label { cursor: pointer; user-select: none; }
  #bronze-loop-panel .bronze-loop-option-summary { color: #9fb2c9; font-size: 11px; flex: 1 1 auto; min-width: 100px; }
  #bronze-loop-panel select { flex: 1; min-width: 0; height: 28px; background: #222832; color: #fff; border: 1px solid #607089; }
  #bronze-loop-scan-mode { flex: 0 1 94px !important; min-width: 86px !important; }
  #bronze-loop-panel .bronze-loop-profile-row span { flex: 0 0 auto; color: #9fb2c9; }
  #bronze-loop-scan-progress { display: none; flex: 0 0 auto; margin: 0 0 8px; }
  .bronze-loop-scan-progress-head { display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 4px; color: #c8d5e5; font-size: 11px; }
  #bronze-loop-scan-progress-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #bronze-loop-scan-progress-count { flex: 0 0 auto; color: #9fb2c9; font-variant-numeric: tabular-nums; }
  #bronze-loop-scan-progress-track { position: relative; height: 6px; overflow: hidden; background: #252c35; border: 1px solid #3c4858; box-sizing: border-box; }
  #bronze-loop-scan-progress-bar { height: 100%; width: 0; background: #54b4d3; transition: width .18s ease-out; }
  #bronze-loop-scan-progress[data-mode="indeterminate"] #bronze-loop-scan-progress-bar { width: 35% !important; animation: bronze-loop-scan-slide 1.05s ease-in-out infinite; }
  @keyframes bronze-loop-scan-slide { from { transform: translateX(-120%); } to { transform: translateX(310%); } }
  @media (prefers-reduced-motion: reduce) { #bronze-loop-scan-progress-bar { transition: none; } #bronze-loop-scan-progress[data-mode="indeterminate"] #bronze-loop-scan-progress-bar { animation: none; } }
  #bronze-loop-latest {
    flex: 1 1 auto;
    min-height: 28px;
    overflow-x: hidden;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: #0c0f13;
    border: 1px solid #303946;
    padding: 6px;
    box-sizing: border-box;
    line-height: 16px;
    color: #d7e2f0;
    word-break: break-word;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }
  #bronze-loop-options { display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid #303946; }
  #bronze-loop-panel.options-open #bronze-loop-options { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow: hidden; }
  #bronze-loop-panel.options-open #bronze-loop-run-view { flex: 0 0 auto; min-height: auto; }
  #bronze-loop-panel.options-open #bronze-loop-latest { display: none; }
  #bronze-loop-options-scroll { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; padding-right: 4px; }
  .bronze-loop-section-heading { display: flex; align-items: center; gap: 4px; margin: 8px 0 6px; }
  .bronze-loop-section { color: #9fb2c9; font-size: 11px; }
  #bronze-loop-log {
    flex: 0 0 auto;
    height: 110px;
    min-height: 64px;
    overflow-x: auto;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
    background: #0c0f13;
    border: 1px solid #303946;
    padding: 8px;
    box-sizing: border-box;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }
  #bronze-loop-log-resize {
    position: relative;
    flex: 0 0 10px;
    cursor: ns-resize;
    touch-action: none;
  }
  #bronze-loop-log-resize::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 4px;
    width: 34px;
    height: 2px;
    transform: translateX(-50%);
    background: #607089;
  }
  #bronze-loop-log-resize:hover::before { background: #9fb2c9; }
  #bronze-loop-log .bronze-loop-log-high-rated { color: #ffd54a; font-weight: 700; }
  #bronze-loop-panel[data-input="touch"] button,
  #bronze-loop-panel[data-input="touch"] select,
  #bronze-loop-panel[data-input="touch"] input:not([type="checkbox"]) { min-height: 44px; font-size: 16px; }
  #bronze-loop-panel[data-input="touch"] button { height: 44px; }
  #bronze-loop-panel[data-input="touch"] .bronze-loop-help-button { min-width: 44px; width: 44px; height: 44px; font-size: 14px; }
  #bronze-loop-panel[data-input="touch"] input[type="checkbox"] { width: 22px; height: 22px; }
  #bronze-loop-panel[data-input="touch"] label { min-height: 44px; display: inline-flex; align-items: center; gap: 6px; }
  #bronze-loop-panel[data-layout="mobile"] {
    left: 0 !important; right: 0 !important; top: auto !important; bottom: 0 !important;
    width: 100% !important; min-width: 0; height: min(72dvh, 620px) !important; min-height: 260px;
    max-height: calc(100dvh - env(safe-area-inset-top, 0px));
    padding: 10px max(10px, env(safe-area-inset-right, 0px)) max(10px, env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px));
    border-width: 1px 0 0; box-shadow: 0 -8px 30px rgba(0,0,0,.42);
  }
  #bronze-loop-panel[data-layout="mobile"] .bronze-loop-resize,
  #bronze-loop-panel[data-layout="mobile"] #bronze-loop-log-resize { display: none; }
  #bronze-loop-panel[data-layout="mobile"] #bronze-loop-drag { cursor: default; touch-action: pan-y; }
  #bronze-loop-panel[data-layout="mobile"] #bronze-loop-mobile-tabs {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin: 0 0 8px;
    border-bottom: 1px solid #303946;
  }
  #bronze-loop-panel[data-layout="mobile"] #bronze-loop-mobile-tabs button { min-width: 0; border-width: 0 0 2px; background: transparent; }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="run"] #bronze-loop-mobile-tab-run,
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="options"] #bronze-loop-mobile-tab-options,
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="log"] #bronze-loop-mobile-tab-log { border-color: #78a6ff; color: #b8d1ff; }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="run"] #bronze-loop-run-view { display: flex; }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="run"] #bronze-loop-options { display: none; }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="options"] #bronze-loop-run-view,
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="log"] #bronze-loop-run-view { display: none; }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="options"] #bronze-loop-options,
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="log"] #bronze-loop-options {
    display: flex; flex: 1 1 auto; min-height: 0; margin: 0; padding: 0; border: 0; overflow: hidden;
  }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="options"] #bronze-loop-log-section { display: none; }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="log"] #bronze-loop-options-config { display: none; }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="log"] #bronze-loop-options-scroll,
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="log"] #bronze-loop-log-section { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="log"] #bronze-loop-log { flex: 1 1 auto; height: auto !important; min-height: 0; touch-action: pan-y; }
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="options"],
  #bronze-loop-panel[data-layout="mobile"][data-mobile-tab="log"] { height: min(88dvh, 760px) !important; }
  #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] { height: 154px !important; min-height: 154px; }
  #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] #bronze-loop-mobile-tabs,
  #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] .bronze-loop-loop-row,
  #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] #bronze-loop-start,
  #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] #bronze-loop-batch-open,
  #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] #bronze-loop-recap-reopen,
  #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] #bronze-loop-scan-progress { display: none !important; }
  #bronze-loop-panel[data-layout="mobile"].is-running #bronze-loop-run-summary { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; min-width: 0; }
  #bronze-loop-panel[data-layout="mobile"].is-running #bronze-loop-run-indicator { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: #58c58a; }
  #bronze-loop-panel[data-layout="mobile"].is-stopping #bronze-loop-run-indicator { background: #ffcf66; }
  #bronze-loop-panel[data-layout="mobile"].is-running #bronze-loop-run-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #c8d5e5; }
  #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] .bronze-loop-run-actions { margin: 0; }
  #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] #bronze-loop-stop { flex: 1 1 auto; }
  #bronze-loop-panel[data-layout="mobile"].icon-only {
    left: var(--dlr-mobile-icon-left, auto) !important;
    right: var(--dlr-mobile-icon-right, max(10px, env(safe-area-inset-right, 0px))) !important;
    top: var(--dlr-mobile-icon-top, auto) !important;
    bottom: var(--dlr-mobile-icon-bottom, max(10px, env(safe-area-inset-bottom, 0px))) !important;
    width: 48px !important; height: 48px !important; min-height: 0; border: 1px solid #78a6ff; padding: 0;
  }
  #bronze-loop-panel[data-layout="mobile"].icon-only #bronze-loop-drag,
  #bronze-loop-panel[data-layout="mobile"].icon-only #bronze-loop-collapse { width: 46px; height: 46px; }
  #bronze-loop-panel[data-layout="mobile"].icon-only #bronze-loop-drag { cursor: move; touch-action: none; }
  @media (max-height: 520px) {
    #bronze-loop-panel[data-layout="mobile"] { height: calc(100dvh - env(safe-area-inset-top, 0px)) !important; }
    #bronze-loop-panel[data-layout="mobile"].is-running[data-mobile-tab="run"] { height: 142px !important; }
  }
`;

export function mainPanelHtml(maxRounds = 3, version = '') {
  const rounds = Math.max(1, Number(maxRounds) || 3);
  const versionLabel = String(version || '').trim();
  const title = versionLabel ? `Loop Runner v${versionLabel}` : 'Loop Runner';
  const resizeHandles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
    .map((dir) => `<div class="bronze-loop-resize" id="bronze-loop-resize-${dir}"></div>`)
    .join('\n');
  return `
    <div class="row" id="bronze-loop-drag">
      <div class="bronze-loop-title-label"><span id="bronze-loop-title">${title}</span><button id="bronze-loop-help-overview" class="bronze-loop-help-button" type="button" title="Loop Runner guide" aria-label="Loop Runner guide">?</button></div>
      <div class="bronze-loop-title-actions">
        <button id="bronze-loop-options-toggle" title="Options">Options</button>
        <button id="bronze-loop-collapse" title="Compact">L</button>
      </div>
    </div>
    <nav id="bronze-loop-mobile-tabs" aria-label="Loop Runner views">
      <button id="bronze-loop-mobile-tab-run" type="button" data-mobile-tab="run">Run</button>
      <button id="bronze-loop-mobile-tab-options" type="button" data-mobile-tab="options">Options</button>
      <button id="bronze-loop-mobile-tab-log" type="button" data-mobile-tab="log">Log</button>
    </nav>
    <div class="panel-body">
      <div id="bronze-loop-run-view">
      <div id="bronze-loop-run-summary"><span id="bronze-loop-run-indicator"></span><strong id="bronze-loop-run-status">Running</strong><span id="bronze-loop-run-name"></span></div>
      <div class="row bronze-loop-loop-row"><select id="bronze-loop-select"></select></div>
      <div class="row bronze-loop-run-actions">
        <button id="bronze-loop-start">Start</button>
        <button id="bronze-loop-stop" disabled>Stop</button>
        <button id="bronze-loop-batch-open" title="Scan My Packs and open a saved batch">Batch Open</button>
        <button id="bronze-loop-recap-reopen" style="display:none" title="View last Player Pick recap">View recap</button>
      </div>
      <div id="bronze-loop-scan-progress" role="status" aria-live="polite" data-mode="indeterminate">
        <div class="bronze-loop-scan-progress-head"><span id="bronze-loop-scan-progress-label">Refreshing SBC index</span><span id="bronze-loop-scan-progress-count"></span></div>
        <div id="bronze-loop-scan-progress-track" role="progressbar" aria-label="Dynamic SBC scan progress"><div id="bronze-loop-scan-progress-bar"></div></div>
      </div>
      <div id="bronze-loop-latest">Ready.</div>
      </div>
      <div id="bronze-loop-options">
        <div id="bronze-loop-options-scroll">
        <div id="bronze-loop-options-config">
        <div class="bronze-loop-section-heading"><div class="bronze-loop-section">Run options</div><button id="bronze-loop-help-run-options" class="bronze-loop-help-button" type="button" title="Explain run options" aria-label="Explain run options">?</button></div>
        <div class="row">
          <label title="Open reward packs automatically when a loop supports it">
            <input id="bronze-loop-open-rewards" type="checkbox"> Open reward packs
          </label>
          <label title="Use current inventory instead of opening supply or reward packs for Loops whose strategy supports inventory-only mode">
            <input id="bronze-loop-daily-inventory-only" type="checkbox"> Inventory only
          </label>
        </div>
        <div class="row" id="bronze-loop-reward-alert-row">
          <label title="Enable high-rated special-card alerts"><input id="bronze-loop-reward-alert-enabled" type="checkbox"> Reward alerts</label>
          <span id="bronze-loop-reward-alert-summary" class="bronze-loop-option-summary">94+ special | highlight</span>
          <button id="bronze-loop-reward-alert-settings" title="Reward alert settings">Settings</button>
        </div>
        <div class="row">
          <label title="Non-rating SBCs use normal Gold players up to this rating; FSU Gold Range can make the effective limit lower">
            Low-rated SBC Gold max
            <input id="bronze-loop-low-rated-gold-max" type="number" min="1" max="99" value="82">
          </label>
          <label title="Rating-constrained SBCs use no submitted player above this rating, including Special cards">
            Rating SBC max card
            <input id="bronze-loop-rating-sbc-max-card" type="number" min="1" max="99" value="88">
          </label>
          <label title="Player Picks whose candidates are all below this rating will be selected automatically">
            <input id="bronze-loop-pick-auto-below-90" type="checkbox"> Auto-pick below
            <input id="bronze-loop-pick-auto-threshold" type="number" min="1" max="99" value="90">
          </label>
        </div>
        <div class="row">
          <label title="Complete the requested Player Pick SBC count first, then open the matching Picks together">
            <input id="bronze-loop-pick-open-at-end" type="checkbox"> Open Picks at end
          </label>
        </div>
        <div class="row" id="bronze-loop-rounds-row">
          <span id="bronze-loop-rounds-label">Rounds</span>
          <input id="bronze-loop-rounds" type="number" min="1" max="50" value="${rounds}">
        </div>
        <div class="bronze-loop-section-heading"><div class="bronze-loop-section">Config</div><button id="bronze-loop-help-config" class="bronze-loop-help-button" type="button" title="Explain configuration" aria-label="Explain configuration">?</button></div>
          <div class="row bronze-loop-profile-row"><span>Profile</span><select id="bronze-loop-profile-select" title="Load a saved Builder Profile or restore built-in loops"></select></div>
          <div class="row"><button id="bronze-loop-open-builder" title="Open the visual Workflow and Loop Builder">Open Builder</button><button id="bronze-loop-refresh" title="Refresh EA and FSU inventory caches after external changes">Refresh caches</button></div>
          <div class="row"><span class="bronze-loop-option-summary">SBC scan</span><select id="bronze-loop-scan-mode" title="Choose incremental validation, a full Challenge refresh, or cache rebuild"><option value="incremental">Incremental scan</option><option value="full">Full rescan</option><option value="clear">Clear cache + scan</option></select><button id="bronze-loop-scan-picks" title="Scan supported dynamic Player Pick and Upgrade SBCs">Scan SBCs</button></div>
          <div class="row"><span class="bronze-loop-option-summary">Layout</span><select id="bronze-loop-layout-mode" title="Automatically choose a responsive layout or force Desktop/Mobile"><option value="auto">Auto</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></div>
        </div>
        <div id="bronze-loop-log-section">
        <div class="bronze-loop-section-heading"><div class="bronze-loop-section">Log</div><button id="bronze-loop-help-log" class="bronze-loop-help-button" type="button" title="Explain log controls and resizing" aria-label="Explain log controls and resizing">?</button></div>
        <div class="row"><button id="bronze-loop-copy">Copy log</button><button id="bronze-loop-clear">Clear log</button><button id="bronze-loop-download">Save log</button></div>
        <div id="bronze-loop-log"></div>
        <div id="bronze-loop-log-resize" role="separator" aria-orientation="horizontal" title="Drag up or down to resize the log"></div>
        </div>
        </div>
      </div>
    </div>
    ${resizeHandles}
  `;
}

export function mountMainPanel(options = {}) {
  const dom = options.dom;
  if (!dom?.query || !dom?.create || !dom?.appendToHead || !dom?.appendToBody) {
    throw new TypeError('dom adapter is required');
  }
  const existing = dom.query('#bronze-loop-panel');
  if (existing) return { panel: existing, created: false };
  dom.query('#bronze-loop-style')?.remove?.();
  const style = dom.create('style');
  style.id = 'bronze-loop-style';
  style.textContent = MAIN_PANEL_STYLE;
  dom.appendToHead(style);
  const panel = dom.create('div');
  panel.id = 'bronze-loop-panel';
  if (options.startupHidden === true) panel.classList?.add?.('startup-hidden');
  panel.innerHTML = mainPanelHtml(options.maxRounds, options.version);
  dom.appendToBody(panel);
  return { panel, style, created: true };
}

export function setMainPanelStartupHidden(panel, hidden) {
  if (!panel?.classList) return;
  panel.classList.toggle('startup-hidden', hidden === true);
  if (hidden === true) panel.setAttribute?.('aria-hidden', 'true');
  else panel.removeAttribute?.('aria-hidden');
}
