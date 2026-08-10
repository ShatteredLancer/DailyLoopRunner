import { createTradeBuyRecap } from '../trade/buy-recap.js';
import {
  inspectManualBuyValidationJob,
  manualBuyValidationConfirmation,
} from '../trade/manual-buy-validation.js';
import { applyResponsiveDialogLayout, readResponsiveUiMode, responsiveControlHeight } from './responsive-dialog.js';

function styles(element, value) {
  Object.assign(element.style, value);
  return element;
}

function button(dom, text, mode, id, primary = false) {
  const value = dom.create('button');
  value.type = 'button';
  value.textContent = text;
  if (id) value.id = id;
  return styles(value, {
    minHeight: responsiveControlHeight(mode), padding: '0 12px', cursor: 'pointer', color: '#fff',
    background: primary ? '#2f6fde' : '#222832',
    border: `1px solid ${primary ? '#4f8cff' : '#607089'}`,
  });
}

function formatCoins(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : '?';
}

function textRow(dom, label, value) {
  const row = styles(dom.create('div'), {
    display: 'grid', gridTemplateColumns: 'minmax(110px, .7fr) minmax(0, 1.3fr)', gap: '8px',
    padding: '7px 0', borderBottom: '1px solid #303a47', minWidth: '0',
  });
  const name = styles(dom.create('span'), { color: '#9fb2c9', fontSize: '12px' });
  name.textContent = label;
  const detail = styles(dom.create('span'), { overflowWrap: 'anywhere' });
  detail.textContent = value;
  row.append(name, detail);
  return row;
}

function controlRow(dom, label, control) {
  const row = styles(dom.create('div'), {
    display: 'grid', gridTemplateColumns: 'minmax(110px, .7fr) minmax(0, 1.3fr)', gap: '8px',
    padding: '7px 0', borderBottom: '1px solid #303a47', minWidth: '0', alignItems: 'center',
  });
  const name = styles(dom.create('span'), { color: '#9fb2c9', fontSize: '12px' });
  name.textContent = label;
  row.append(name, control);
  return row;
}

export function showTradeBuyDialog(options = {}) {
  const dom = options.dom;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  dom.query?.('#bronze-loop-trade-buy-modal')?.remove?.();
  const mode = readResponsiveUiMode(dom);
  const gate = inspectManualBuyValidationJob(options.job || {});
  const preview = options.preview || null;
  let receipt = null;
  let error = null;
  let running = false;
  let recapPage = 1;
  let expectedDestination = 'auto';

  const overlay = styles(dom.create('div'), {
    position: 'fixed', inset: '0', zIndex: '1000002', background: 'rgba(0,0,0,.74)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: mode.mobile ? '0' : '20px', boxSizing: 'border-box',
  });
  overlay.id = 'bronze-loop-trade-buy-modal';
  const dialog = styles(dom.create('div'), {
    width: 'min(760px, 100%)', maxHeight: mode.mobile ? '100dvh' : '92vh', overflow: 'auto',
    background: '#171b21', color: '#f4f6f8', border: '1px solid #65758a', padding: '14px',
    boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
  });
  const heading = styles(dom.create('div'), { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' });
  const title = styles(dom.create('div'), { fontSize: '17px', fontWeight: '700' });
  title.textContent = 'Single Buy Validation';
  const badge = styles(dom.create('span'), { color: '#9fb2c9', fontSize: '11px', border: '1px solid #536276', padding: '4px 7px' });
  badge.textContent = 'Manual / 1 item';
  heading.append(title, badge);

  const destination = dom.create('select');
  destination.id = 'bronze-loop-trade-buy-destination';
  for (const entry of [
    { value: 'auto', text: 'Auto route' },
    { value: 'club', text: 'Club only' },
    { value: 'transfer', text: 'Transfer only' },
  ]) {
    const option = dom.create('option');
    option.value = entry.value;
    option.textContent = entry.text;
    destination.appendChild(option);
  }
  destination.value = expectedDestination;
  styles(destination, {
    minWidth: '0', width: '100%', height: responsiveControlHeight(mode), boxSizing: 'border-box',
    background: '#222832', color: '#f4f6f8', border: '1px solid #607089', padding: '0 8px',
  });

  const summary = styles(dom.create('div'), { marginTop: '12px' });
  summary.append(
    textRow(dom, 'Job', String(gate.job?.name || options.job?.name || '?')),
    textRow(dom, 'Selection', `${gate.job?.policy?.ratingMin || '?'} OVR ${gate.job?.policy?.cardClass || '?'}`),
    textRow(dom, 'Maximum', formatCoins(gate.maxPrice)),
    textRow(dom, 'Definitions', String(preview?.summary?.definitions ?? '?')),
    controlRow(dom, 'Expected route', destination),
  );

  const output = styles(dom.create('div'), { marginTop: '12px' });
  const status = styles(dom.create('div'), { minHeight: '18px', color: '#9fb2c9', fontSize: '11px', marginTop: '10px' });
  status.id = 'bronze-loop-trade-buy-status';
  status.textContent = gate.ready && preview?.plan?.ready
    ? 'Ready for single-item validation'
    : `Blocked: ${gate.reason || 'buy-preview-not-ready'}`;

  const confirmation = dom.create('input');
  confirmation.id = 'bronze-loop-trade-buy-confirmation';
  confirmation.type = 'text';
  confirmation.value = '';
  const requiredText = () => manualBuyValidationConfirmation(gate.maxPrice, expectedDestination);
  confirmation.placeholder = gate.ready ? requiredText() : 'Confirmation';
  confirmation.autocomplete = 'off';
  styles(confirmation, {
    width: '100%', minWidth: '0', height: responsiveControlHeight(mode), boxSizing: 'border-box',
    marginTop: '12px', fontSize: mode.touchTargets ? '16px' : '', background: '#222832', color: '#f4f6f8',
    border: '1px solid #607089', padding: '0 8px',
  });

  const actions = styles(dom.create('div'), { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginTop: '12px' });
  const execute = button(dom, 'Buy one', mode, 'bronze-loop-trade-buy-execute', true);
  const stop = button(dom, 'Stop', mode, 'bronze-loop-trade-buy-stop');
  const diagnostics = button(dom, 'Save diagnostics', mode, 'bronze-loop-trade-buy-diagnostics');
  const close = button(dom, 'Close', mode, 'bronze-loop-trade-buy-close');
  stop.style.display = 'none';
  actions.append(confirmation, execute, stop, diagnostics, close);

  function renderRecap() {
    output.textContent = '';
    const recap = createTradeBuyRecap(receipt, { page: recapPage });
    const recapTitle = styles(dom.create('div'), { fontSize: '13px', fontWeight: '700', marginBottom: '7px' });
    recapTitle.textContent = recap.title;
    const recapSummary = styles(dom.create('div'), { color: recap.status === 'completed' ? '#8fd19e' : '#e3a7a7', marginBottom: '7px' });
    recapSummary.textContent = `${recap.status} | ${recap.counts.succeeded} purchased | ${recap.counts.failed} failed | ${recap.counts.searches} searches`;
    output.append(recapTitle, recapSummary);
    if (recap.reason) {
      const reason = styles(dom.create('div'), { color: '#e3a7a7', fontSize: '11px', marginBottom: '7px' });
      reason.textContent = `Reason: ${recap.reason}`;
      output.appendChild(reason);
    }
    const coins = styles(dom.create('div'), { color: '#9fb2c9', fontSize: '11px', marginBottom: '7px' });
    coins.textContent = `Coins: ${formatCoins(recap.coins.before)} -> ${formatCoins(recap.coins.after)} | Spent ${formatCoins(recap.coins.spent)}`;
    output.appendChild(coins);
    for (const entry of recap.items) {
      const row = styles(dom.create('div'), { padding: '8px', marginBottom: '6px', background: '#1d2229', border: '1px solid #344152' });
      row.textContent = `${entry.index}. ${entry.status} | ${entry.rating || '?'} OVR | ${formatCoins(entry.price)} | ${entry.destination || entry.reason || '?'}`;
      output.appendChild(row);
    }
  }

  function update() {
    const ready = gate.ready && preview?.plan?.ready === true && confirmation.value === requiredText();
    execute.disabled = running || receipt !== null || !ready;
    destination.disabled = running || receipt !== null || !gate.ready;
    confirmation.disabled = running || receipt !== null || !gate.ready;
    close.disabled = running;
    diagnostics.disabled = running || (!preview && !receipt && !error);
    stop.style.display = running ? '' : 'none';
    stop.disabled = !running;
  }

  destination.addEventListener('change', () => {
    expectedDestination = String(destination.value || 'auto');
    confirmation.value = '';
    confirmation.placeholder = requiredText();
    status.textContent = expectedDestination === 'auto'
      ? 'Ready for single-item validation'
      : `Ready to validate ${expectedDestination === 'transfer' ? 'duplicate Transfer' : 'non-duplicate Club'} routing`;
    update();
  });
  confirmation.addEventListener('input', update);
  execute.addEventListener('click', async () => {
    if (execute.disabled) return;
    running = true;
    error = null;
    status.textContent = 'Single Buy validation running';
    update();
    try {
      receipt = await options.onExecute?.({
        confirmationText: confirmation.value,
        expectedDestination,
        platform: 'pc',
      });
      if (!receipt) throw new Error('Buy receipt is unavailable');
      status.textContent = `${receipt.status}${receipt.reason ? ` (${receipt.reason})` : ''}`;
      renderRecap();
    } catch (caught) {
      error = caught;
      status.textContent = `Buy validation failed: ${caught?.message || caught}`;
    } finally {
      running = false;
      update();
    }
  });
  stop.addEventListener('click', () => {
    if (!running) return;
    if (options.onStop?.() === true) status.textContent = 'Stop requested';
  });
  diagnostics.addEventListener('click', () => options.onDownloadDiagnostics?.({
    job: gate.job || options.job,
    preview,
    receipt,
    error,
    expectedDestination,
  }));
  close.addEventListener('click', () => {
    if (!running) overlay.remove();
  });

  dialog.append(heading, summary, output, status, actions);
  overlay.appendChild(dialog);
  dom.appendToBody(overlay);
  applyResponsiveDialogLayout({ overlay, dialog, mode, controls: [destination, confirmation, execute, stop, diagnostics, close] });
  update();
  return { close: () => { if (!running) overlay.remove(); } };
}
