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
  #bronze-loop-panel.icon-only #bronze-loop-title,
  #bronze-loop-panel.icon-only #bronze-loop-options-toggle { display: none; }
  #bronze-loop-panel.icon-only #bronze-loop-drag { width: 34px; height: 34px; margin: 0; justify-content: center; }
  #bronze-loop-drag { cursor: move; user-select: none; justify-content: space-between; }
  #bronze-loop-title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  #bronze-loop-panel input { width: 54px; height: 24px; background: #222832; color: #fff; border: 1px solid #607089; box-sizing: border-box; }
  #bronze-loop-panel input[type="checkbox"] { width: 14px; height: 14px; accent-color: #78a6ff; }
  #bronze-loop-panel label { cursor: pointer; user-select: none; }
  #bronze-loop-panel .bronze-loop-option-summary { color: #9fb2c9; font-size: 11px; flex: 1 1 auto; min-width: 100px; }
  #bronze-loop-panel select { flex: 1; min-width: 0; height: 28px; background: #222832; color: #fff; border: 1px solid #607089; }
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
  #bronze-loop-panel.options-open #bronze-loop-latest { display: none; }
  .bronze-loop-section { color: #9fb2c9; font-size: 11px; margin: 8px 0 6px; }
  #bronze-loop-json {
    display: none;
    width: 100%;
    height: 170px;
    min-height: 60px;
    flex-shrink: 1;
    box-sizing: border-box;
    margin-bottom: 8px;
    background: #0c0f13;
    color: #f4f6f8;
    border: 1px solid #303946;
    font: 11px Consolas, monospace;
    padding: 8px;
  }
  #bronze-loop-json.show { display: block; }
  #bronze-loop-log {
    flex: 1 1 0;
    min-height: 100px;
    overflow: auto;
    white-space: pre-wrap;
    background: #0c0f13;
    border: 1px solid #303946;
    padding: 8px;
    box-sizing: border-box;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }
  #bronze-loop-log .bronze-loop-log-high-rated { color: #ffd54a; font-weight: 700; }
`;

export function mainPanelHtml(maxRounds = 3) {
  const rounds = Math.max(1, Number(maxRounds) || 3);
  const resizeHandles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
    .map((dir) => `<div class="bronze-loop-resize" id="bronze-loop-resize-${dir}"></div>`)
    .join('\n');
  return `
    <div class="row" id="bronze-loop-drag">
      <span id="bronze-loop-title">Loop Runner</span>
      <button id="bronze-loop-options-toggle" title="Options">Options</button>
      <button id="bronze-loop-collapse" title="Compact">L</button>
    </div>
    <div class="panel-body">
      <div class="row"><select id="bronze-loop-select"></select></div>
      <div class="row">
        <button id="bronze-loop-start">Start</button>
        <button id="bronze-loop-stop" disabled>Stop</button>
        <button id="bronze-loop-batch-open" title="Scan My Packs and open a saved batch">Batch Open</button>
        <button id="bronze-loop-recap-reopen" style="display:none" title="View last Player Pick recap">View recap</button>
      </div>
      <div id="bronze-loop-latest">Ready.</div>
      <div id="bronze-loop-options">
        <div class="bronze-loop-section">Run options</div>
        <div class="row">
          <label id="bronze-loop-dry-run-label" title="Log planned selections without moving items, opening packs, or submitting SBCs">
            <input id="bronze-loop-dry-run" type="checkbox"> Dry run
          </label>
          <label title="Open reward packs automatically when a loop supports it">
            <input id="bronze-loop-open-rewards" type="checkbox"> Open reward packs
          </label>
        </div>
        <div class="row"><label title="Show MVP and one-run validation loops in the main selector"><input id="bronze-loop-show-mvp" type="checkbox"> Show MVP loops</label></div>
        <div class="row" id="bronze-loop-reward-alert-row">
          <label title="Enable high-rated special-card alerts"><input id="bronze-loop-reward-alert-enabled" type="checkbox"> Reward alerts</label>
          <span id="bronze-loop-reward-alert-summary" class="bronze-loop-option-summary">94+ special | highlight</span>
          <button id="bronze-loop-reward-alert-settings" title="Reward alert settings">Settings</button>
        </div>
        <div class="row">
          <label title="Player Pick SBCs will not submit normal gold players at or above this rating">
            <input id="bronze-loop-pick-protect-high-gold" type="checkbox"> Protect Pick fodder >=
            <input id="bronze-loop-pick-high-gold-threshold" type="number" min="2" max="99" value="82">
          </label>
          <label title="Player Picks whose candidates are all below this rating will be selected automatically">
            <input id="bronze-loop-pick-auto-below-90" type="checkbox"> Auto-pick below
            <input id="bronze-loop-pick-auto-threshold" type="number" min="1" max="99" value="90">
          </label>
        </div>
        <div class="row">
          <label title="Use fully supported scanned Pick requirements and stable identities while keeping static loop IDs as fallback">
            <input id="bronze-loop-pick-prefer-scanned" type="checkbox"> Use scanned Pick metadata
          </label>
          <label title="Complete the requested Player Pick SBC count first, then open the matching Picks together">
            <input id="bronze-loop-pick-open-at-end" type="checkbox"> Open Picks at end
          </label>
        </div>
        <div class="row" id="bronze-loop-rounds-row">
          <span id="bronze-loop-rounds-label">rounds</span>
          <input id="bronze-loop-rounds" type="number" min="1" max="50" value="${rounds}">
        </div>
        <div class="bronze-loop-section">Config</div>
        <div class="row"><button id="bronze-loop-refresh">Refresh caches</button><button id="bronze-loop-scan-picks">Scan Picks</button><button id="bronze-loop-load-json">Load loops JSON</button></div>
        <div class="row"><button id="bronze-loop-built-in" disabled>Built-in loops</button><button id="bronze-loop-edit">Edit JSON</button></div>
        <textarea id="bronze-loop-json" spellcheck="false"></textarea>
        <div class="bronze-loop-section">Log</div>
        <div class="row"><button id="bronze-loop-copy">Copy log</button><button id="bronze-loop-clear">Clear log</button><button id="bronze-loop-download">Save log</button></div>
        <div id="bronze-loop-log"></div>
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
  panel.innerHTML = mainPanelHtml(options.maxRounds);
  dom.appendToBody(panel);
  return { panel, style, created: true };
}

export function setMainPanelStartupHidden(panel, hidden) {
  if (!panel?.classList) return;
  panel.classList.toggle('startup-hidden', hidden === true);
  if (hidden === true) panel.setAttribute?.('aria-hidden', 'true');
  else panel.removeAttribute?.('aria-hidden');
}
