import { applyResponsiveDialogLayout, readResponsiveUiMode, responsiveControlHeight } from './responsive-dialog.js';

function styles(element, values) {
  Object.assign(element.style, values);
  return element;
}

function button(dom, text, mode, id, primary = false) {
  const value = dom.create('button');
  value.type = 'button';
  value.textContent = text;
  if (id) value.id = id;
  return styles(value, {
    minHeight: responsiveControlHeight(mode), padding: '0 12px', cursor: 'pointer', color: '#fff',
    background: primary ? '#8f2d36' : '#222832', border: `1px solid ${primary ? '#c44d58' : '#607089'}`,
  });
}

function snapshotSummary(snapshot = {}) {
  const states = Object.entries(snapshot.byState || {})
    .map(([state, count]) => `${state}:${Number(count)}`)
    .join(', ') || 'none';
  return `${Number(snapshot.unsoldCount || 0)} Unsold | Transfer states ${states}`;
}

export function showTradeBulkRelistDialog(options = {}) {
  const dom = options.dom;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('DOM adapter is required');
  dom.query?.('#bronze-loop-trade-bulk-relist-modal')?.remove?.();
  const mode = readResponsiveUiMode(dom);
  const overlay = styles(dom.create('div'), {
    position: 'fixed', inset: '0', zIndex: '1000002', background: 'rgba(0,0,0,.74)',
    display: 'flex', alignItems: mode.mobile ? 'stretch' : 'center', justifyContent: 'center', padding: mode.mobile ? '0' : '16px',
  });
  overlay.id = 'bronze-loop-trade-bulk-relist-modal';
  const dialog = styles(dom.create('div'), {
    width: mode.mobile ? '100%' : 'min(620px, 96vw)', maxHeight: mode.mobile ? '100%' : '88vh', overflowY: 'auto',
    background: '#171b21', color: '#f4f6f8', border: '1px solid #4b586a', padding: '14px', boxSizing: 'border-box',
  });
  const heading = dom.create('h2');
  heading.textContent = 'Manual Re-list All';
  styles(heading, { margin: '0 0 10px', fontSize: '18px', letterSpacing: '0' });
  const warning = styles(dom.create('div'), {
    border: '1px solid #8f3d49', background: '#2a1b20', color: '#f1c1c1', padding: '10px', fontSize: '12px', lineHeight: '1.45',
  });
  warning.textContent = 'High risk: this calls EA Re-list All once for every current Unsold item, preserves EA auction prices, and does not apply card or price filters.';
  const output = styles(dom.create('div'), { marginTop: '10px', minHeight: '58px', fontSize: '12px', lineHeight: '1.5' });
  const riskRow = styles(dom.create('label'), { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' });
  const risk = dom.create('input');
  risk.type = 'checkbox';
  risk.id = 'bronze-loop-trade-bulk-relist-risk';
  const riskText = dom.create('span');
  riskText.textContent = 'Relist every item shown in the current Unsold preview';
  riskRow.append(risk, riskText);
  const status = styles(dom.create('div'), { color: '#9fb2c9', fontSize: '11px', marginTop: '10px' });
  status.id = 'bronze-loop-trade-bulk-relist-status';
  status.textContent = 'Preview is read-only';
  const actions = styles(dom.create('div'), { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginTop: '12px' });
  const previewButton = button(dom, 'Preview Unsold', mode, 'bronze-loop-trade-bulk-relist-preview');
  const execute = button(dom, 'Re-list All', mode, 'bronze-loop-trade-bulk-relist-execute', true);
  const diagnostics = button(dom, 'Save diagnostics', mode, 'bronze-loop-trade-bulk-relist-diagnostics');
  const close = button(dom, 'Close', mode, 'bronze-loop-trade-bulk-relist-close');
  actions.append(previewButton, execute, diagnostics, close);
  dialog.append(heading, warning, output, riskRow, status, actions);
  overlay.appendChild(dialog);
  dom.appendToBody(overlay);

  let preview = null;
  let receipt = null;
  let error = null;
  let running = false;

  function update() {
    const empty = Number(preview?.snapshot?.unsoldCount || 0) === 0;
    execute.textContent = empty ? 'Confirm empty check' : 'Re-list All';
    execute.disabled = running || preview?.ready !== true || (!empty && risk.checked !== true);
    previewButton.disabled = running;
    close.disabled = running;
    diagnostics.disabled = running || (!preview && !receipt && !error);
    risk.disabled = running || !preview || empty;
  }

  function renderPreview() {
    output.textContent = '';
    const summary = dom.create('div');
    summary.textContent = snapshotSummary(preview?.snapshot);
    styles(summary, { color: preview?.ready ? '#a9d7b5' : '#e3a7a7', marginBottom: '7px' });
    output.appendChild(summary);
    for (const entry of preview?.snapshot?.items || []) {
      const row = styles(dom.create('div'), { borderTop: '1px solid #35404e', padding: '5px 0', overflowWrap: 'anywhere' });
      row.textContent = `${entry.name} | ${entry.rating || '?'} OVR | ${Number(entry.auction?.startingBid || 0).toLocaleString()} / ${Number(entry.auction?.buyNowPrice || 0).toLocaleString()} | Trade ${entry.auction?.tradeId || '?'}`;
      output.appendChild(row);
    }
    if (preview?.blockers?.length) {
      const blockers = styles(dom.create('div'), { color: '#e3a7a7', marginTop: '7px' });
      blockers.textContent = `Blocked: ${preview.blockers.map((entry) => entry.reason).join(', ')}`;
      output.appendChild(blockers);
    }
  }

  previewButton.addEventListener('click', async () => {
    running = true;
    risk.checked = false;
    preview = null;
    receipt = null;
    error = null;
    status.textContent = 'Refreshing Transfer List and reading Unsold items...';
    update();
    try {
      preview = await options.onPreview?.();
      if (!preview) throw new Error('Re-list All preview is unavailable');
      renderPreview();
      status.textContent = preview.ready
        ? Number(preview.snapshot?.unsoldCount || 0) > 0 ? 'Review all items and accept the risk to continue' : 'No Unsold items; execution will send no mutation'
        : `Preview blocked: ${preview.blockers?.[0]?.reason || 'unknown'}`;
    } catch (caught) {
      error = caught;
      status.textContent = `Preview failed: ${caught?.message || caught}`;
    } finally {
      running = false;
      update();
    }
  });
  risk.addEventListener('change', update);
  execute.addEventListener('click', async () => {
    if (execute.disabled) return;
    running = true;
    error = null;
    status.textContent = 'Re-list All transaction running...';
    update();
    try {
      receipt = await options.onExecute?.({
        approved: true,
        preview,
        confirmationToken: preview.confirmation?.token,
      });
      if (!receipt) throw new Error('Re-list All receipt is unavailable');
      output.textContent = `${receipt.status} | ${Number(receipt.succeeded || 0)}/${Number(receipt.requested || 0)} relisted${receipt.reason ? ` | ${receipt.reason}` : ''}`;
      status.textContent = receipt.status === 'completed'
        ? receipt.reason === 'skipped-empty' ? 'Empty check complete; no mutation sent' : 'Re-list All completed and reconciled'
        : 'Result is not fully reconciled; save diagnostics and review Recovery';
      preview = null;
      risk.checked = false;
    } catch (caught) {
      error = caught;
      status.textContent = `Re-list All failed: ${caught?.message || caught}`;
    } finally {
      running = false;
      update();
    }
  });
  diagnostics.addEventListener('click', () => options.onDownloadDiagnostics?.({ preview, receipt, error }));
  close.addEventListener('click', () => { if (!running) overlay.remove?.(); });
  overlay.addEventListener('click', (event) => { if (!running && event.target === overlay) overlay.remove?.(); });
  applyResponsiveDialogLayout({ dom, mode, overlay, dialog, title: heading, controls: [previewButton, execute, diagnostics, close] });
  update();
  return overlay;
}
