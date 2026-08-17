import { applyResponsiveDialogLayout, readResponsiveUiMode, responsiveControlHeight } from './responsive-dialog.js';

export const MAIN_PANEL_HELP_TOPICS = Object.freeze([
  Object.freeze({
    id: 'overview',
    title: 'Loop Runner guide',
    items: Object.freeze([
      Object.freeze(['Start and Stop', 'Start runs the selected Loop. Stop waits for the next safe point before ending the run.']),
      Object.freeze(['Batch Open', 'Choose pack types from My Packs, save a batch, and open only the saved selection.']),
      Object.freeze(['Mobile views', 'Use Run, Options, and Log to switch views. Starting a Loop returns to the compact Run controller so Stop remains available.']),
      Object.freeze(['Mobile icon', 'After collapsing with L, drag the icon away from EA controls. Its mobile position is saved separately from the Desktop panel.']),
      Object.freeze(['Options', 'Show run settings, Builder Profiles, Dynamic SBC scan controls, and the full log.']),
      Object.freeze(['Move and resize', 'On Desktop layout, drag the title bar to move the panel and drag any edge or corner to resize it.']),
    ]),
  }),
  Object.freeze({
    id: 'run-options',
    title: 'Run options',
    items: Object.freeze([
      Object.freeze(['Open reward packs', 'Open reward packs after a Loop stage when that Loop supports automatic opening.']),
      Object.freeze(['Inventory only', 'For compatible Loops, use current inventory instead of opening supply or reward packs.']),
      Object.freeze(['Reward alerts', 'Highlight eligible high-rated special cards and optionally send desktop or ntfy alerts.']),
      Object.freeze(['Selection policy', 'Settings separates the standard non-rating Gold limit, the standard Rating SBC per-card cap, the shared Rolling/Pick automatic-use rating, the optional Rolling Storage pressure Pick, and Player Pick handling. The standard Rating SBC cap does not apply to Rolling.']),
      Object.freeze(['Rounds', 'Sets the requested run count for Loops that expose a repeat quantity.']),
    ]),
  }),
  Object.freeze({
    id: 'config',
    title: 'Config',
    items: Object.freeze([
      Object.freeze(['Profile', 'Load a saved Builder Profile or switch back to the built-in Loop set.']),
      Object.freeze(['Layout', 'Auto follows the viewport. Desktop and Mobile manually override the layout without changing the active run or Profile.']),
      Object.freeze(['Open Builder', 'Edit Workflows and Loops, including their steps, run settings, pack handling, and recovery rules.']),
      Object.freeze(['Refresh caches', 'Refresh available EA and FSU inventory data after changes made outside the Runner.']),
      Object.freeze(['SBC scan', 'Discover supported dynamic Player Pick and Upgrade SBCs. Incremental reuses cache, Full refreshes Challenge data, and Clear cache + scan rebuilds it.']),
    ]),
  }),
  Object.freeze({
    id: 'log',
    title: 'Log',
    items: Object.freeze([
      Object.freeze(['Latest log', 'The compact panel shows the newest status messages. Desktop Options and the mobile Log view show the complete session log.']),
      Object.freeze(['Copy, Clear, Save', 'Copy the session log, clear the on-screen history, or download it as a log file.']),
      Object.freeze(['Resize log', 'On Desktop layout, drag the horizontal resize bar below the full log. The chosen height is saved locally for the next Web App visit.']),
    ]),
  }),
]);

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

export function getMainPanelHelpTopics(topic = 'overview') {
  const requested = String(topic || 'overview');
  if (requested === 'overview') return MAIN_PANEL_HELP_TOPICS;
  const match = MAIN_PANEL_HELP_TOPICS.find((entry) => entry.id === requested);
  return match ? [match] : MAIN_PANEL_HELP_TOPICS;
}

export function showMainPanelHelp(options = {}) {
  const dom = options.dom;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  dom.query?.('#bronze-loop-help-modal')?.remove?.();
  const mode = readResponsiveUiMode(dom);

  const overlay = dom.create('div');
  overlay.id = 'bronze-loop-help-modal';
  applyStyles(overlay, {
    position: 'fixed', inset: '0', zIndex: '1000001', background: 'rgba(0,0,0,.72)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
  });
  const dialog = dom.create('div');
  applyStyles(dialog, {
    width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#171b21', color: '#f4f6f8',
    border: '1px solid #65758a', padding: '14px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
  });
  const title = dom.create('div');
  title.textContent = options.topic && options.topic !== 'overview'
    ? getMainPanelHelpTopics(options.topic)[0]?.title || 'Loop Runner guide'
    : 'Loop Runner guide';
  applyStyles(title, { fontSize: '16px', fontWeight: '700', marginBottom: '12px' });
  dialog.appendChild(title);

  for (const section of getMainPanelHelpTopics(options.topic)) {
    const heading = dom.create('div');
    heading.textContent = section.title;
    applyStyles(heading, { color: '#b8c3d2', fontSize: '12px', fontWeight: '700', margin: '12px 0 6px' });
    const list = dom.create('div');
    applyStyles(list, { display: 'flex', flexDirection: 'column', gap: '6px' });
    for (const [label, description] of section.items) {
      const row = dom.create('div');
      applyStyles(row, { padding: '7px 8px', background: '#1d2229', lineHeight: '17px' });
      const name = dom.create('span');
      name.textContent = `${label}: `;
      applyStyles(name, { color: '#f4f6f8', fontWeight: '700' });
      const detail = dom.create('span');
      detail.textContent = description;
      applyStyles(detail, { color: '#b8c3d2' });
      row.append(name, detail);
      list.appendChild(row);
    }
    dialog.append(heading, list);
  }

  const actions = dom.create('div');
  applyStyles(actions, { display: 'flex', justifyContent: 'flex-end', marginTop: '14px' });
  const close = dom.create('button');
  close.type = 'button';
  close.textContent = 'Close';
  applyStyles(close, {
    minHeight: responsiveControlHeight(mode), padding: '0 12px', cursor: 'pointer', color: '#fff', background: '#2f6fde', border: '1px solid #4f8cff',
  });
  const dismiss = () => overlay.remove?.();
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) dismiss(); });
  applyResponsiveDialogLayout({ dom, mode, overlay, dialog, title, actions, controls: [close] });
  actions.appendChild(close);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  dom.appendToBody(overlay);
  return overlay;
}
