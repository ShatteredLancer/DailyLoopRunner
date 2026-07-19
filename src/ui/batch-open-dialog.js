import {
  batchOpenEntryKey,
  createBatchOpenAvailability,
  normalizeBatchOpenPlan,
} from '../config/batch-open.js';

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

function button(dom, text, primary = false) {
  const value = dom.create('button');
  value.type = 'button';
  value.textContent = text;
  applyStyles(value, {
    minHeight: '30px', padding: '0 12px', cursor: 'pointer', color: '#fff',
    background: primary ? '#2f6fde' : '#222832', border: `1px solid ${primary ? '#4f8cff' : '#607089'}`,
  });
  return value;
}

function quantityInput(dom, quantity) {
  const input = dom.create('input');
  input.type = 'number';
  input.min = '1';
  input.max = '999';
  input.value = String(quantity);
  applyStyles(input, {
    width: '70px', height: '30px', boxSizing: 'border-box', background: '#222832', color: '#fff',
    border: '1px solid #607089', padding: '0 6px',
  });
  return input;
}

export function showBatchOpenDialog(options = {}) {
  const dom = options.dom;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  dom.query?.('#bronze-loop-batch-open-modal')?.remove?.();

  const overlay = dom.create('div');
  overlay.id = 'bronze-loop-batch-open-modal';
  applyStyles(overlay, {
    position: 'fixed', inset: '0', zIndex: '1000001', background: 'rgba(0,0,0,.72)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
  });
  const dialog = dom.create('div');
  applyStyles(dialog, {
    width: 'min(700px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#171b21', color: '#f4f6f8',
    border: '1px solid #65758a', padding: '14px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
  });
  const title = dom.create('div');
  title.textContent = 'Batch Open Packs';
  applyStyles(title, { fontSize: '16px', fontWeight: '700' });
  const note = dom.create('div');
  note.textContent = 'Choose pack types and quantities. The saved list is reused next time; unavailable remembered types are skipped.';
  applyStyles(note, { color: '#9aa6b8', fontSize: '11px', margin: '6px 0 10px' });
  const status = dom.create('div');
  applyStyles(status, { minHeight: '16px', color: '#9fb2c9', fontSize: '11px', marginTop: '8px' });
  const availableTitle = dom.create('div');
  availableTitle.textContent = 'My Packs';
  applyStyles(availableTitle, { color: '#b8c3d2', fontSize: '12px', fontWeight: '700', marginBottom: '6px' });
  const availableList = dom.create('div');
  applyStyles(availableList, { display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' });
  const planTitle = dom.create('div');
  planTitle.textContent = 'Batch list';
  applyStyles(planTitle, { color: '#b8c3d2', fontSize: '12px', fontWeight: '700', marginBottom: '6px' });
  const planList = dom.create('div');
  applyStyles(planList, { display: 'flex', flexDirection: 'column', gap: '5px' });

  let snapshot = options.snapshot || { total: 0, groups: [] };
  let plan = normalizeBatchOpenPlan(options.plan);

  const notifyPlanChange = () => options.onPlanChange?.(plan);

  const currentPlan = () => normalizeBatchOpenPlan({
    entries: Array.from(planList.children || []).map((row) => ({
      packId: row.dataset?.packId || null,
      packName: row.dataset?.packName || '',
      quantity: row.querySelector?.('input')?.value || 1,
    })),
  });

  const render = () => {
    availableList.textContent = '';
    const selectedKeys = new Set(plan.entries.map(batchOpenEntryKey));
    for (const group of snapshot.groups || []) {
      const row = dom.create('div');
      applyStyles(row, { position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 7px', background: '#1d2229' });
      const label = dom.create('span');
      label.textContent = `${group.name} (#${group.id || '?'}) x${group.count}`;
      applyStyles(label, { flex: '1 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
      const selected = selectedKeys.has(batchOpenEntryKey({ packId: group.id, packName: group.name }));
      const addMenu = dom.create('div');
      applyStyles(addMenu, { position: 'relative', flex: '0 0 auto' });
      const add = button(dom, selected ? 'Added v' : 'Add v');
      add.setAttribute?.('aria-label', `Add ${group.name} to batch`);
      add.setAttribute?.('aria-expanded', 'false');
      const menu = dom.create('div');
      applyStyles(menu, {
        display: 'none', position: 'absolute', right: '0', top: '34px', zIndex: '4', minWidth: '130px',
        padding: '4px', background: '#171b21', border: '1px solid #607089', boxShadow: '0 6px 18px rgba(0,0,0,.35)',
      });
      const setQuantity = (quantity) => {
        plan = currentPlan();
        const key = batchOpenEntryKey({ packId: group.id, packName: group.name });
        const exists = plan.entries.some((entry) => batchOpenEntryKey(entry) === key);
        const entries = exists
          ? plan.entries.map((entry) => batchOpenEntryKey(entry) === key
            ? { packId: group.id, packName: group.name, quantity }
            : entry)
          : [...plan.entries, { packId: group.id, packName: group.name, quantity }];
        plan = normalizeBatchOpenPlan({ entries });
        notifyPlanChange();
        render();
      };
      const addOne = button(dom, selected ? 'Set to 1' : 'Add 1');
      const addAll = button(dom, `${selected ? 'Set to all' : 'Add all'} (${group.count})`);
      for (const option of [addOne, addAll]) {
        applyStyles(option, { display: 'block', width: '100%', minWidth: '0', textAlign: 'left', border: '0' });
      }
      addOne.addEventListener('click', () => setQuantity(1));
      addAll.addEventListener('click', () => setQuantity(Math.max(1, Number(group.count) || 1)));
      add.addEventListener('click', () => {
        const open = menu.style.display === 'none';
        menu.style.display = open ? 'block' : 'none';
        add.setAttribute?.('aria-expanded', open ? 'true' : 'false');
      });
      menu.append(addOne, addAll);
      addMenu.append(add, menu);
      row.append(label, addMenu);
      availableList.appendChild(row);
    }
    if (!(snapshot.groups || []).length) {
      const empty = dom.create('div');
      empty.textContent = 'No packs found. Use Scan My Packs to refresh.';
      applyStyles(empty, { color: '#9aa6b8', padding: '8px' });
      availableList.appendChild(empty);
    }

    planList.textContent = '';
    const rows = createBatchOpenAvailability(plan, snapshot);
    for (const entry of rows) {
      const row = dom.create('div');
      row.dataset.packId = entry.packId ? String(entry.packId) : '';
      row.dataset.packName = entry.packName;
      applyStyles(row, { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 7px', background: '#1d2229' });
      const label = dom.create('span');
      label.textContent = `${entry.packName || `Pack #${entry.packId}`} (#${entry.packId || '?'})`;
      applyStyles(label, { flex: '1 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
      const availability = dom.create('span');
      availability.textContent = entry.available ? `${entry.available} available` : 'unavailable';
      applyStyles(availability, { color: entry.available ? '#8fd19e' : '#e3a7a7', fontSize: '11px', flex: '0 0 auto' });
      const quantity = quantityInput(dom, entry.quantity);
      quantity.setAttribute?.('aria-label', `Quantity for ${entry.packName}`);
      quantity.addEventListener('change', () => {
        plan = currentPlan();
        notifyPlanChange();
      });
      const remove = button(dom, 'Remove');
      remove.addEventListener('click', () => {
        const key = batchOpenEntryKey(entry);
        plan = normalizeBatchOpenPlan({ entries: currentPlan().entries.filter((candidate) => batchOpenEntryKey(candidate) !== key) });
        notifyPlanChange();
        render();
      });
      row.append(label, availability, quantity, remove);
      planList.appendChild(row);
    }
    if (!rows.length) {
      const empty = dom.create('div');
      empty.textContent = 'No pack types in the batch list.';
      applyStyles(empty, { color: '#9aa6b8', padding: '8px' });
      planList.appendChild(empty);
    }
  };

  const toolbar = dom.create('div');
  applyStyles(toolbar, { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' });
  const scan = button(dom, 'Scan My Packs');
  const preview = button(dom, 'Preview recap');
  toolbar.append(scan, preview);
  const actions = dom.create('div');
  applyStyles(actions, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' });
  const cancel = button(dom, 'Cancel');
  const start = button(dom, 'Start batch', true);
  actions.append(cancel, start);

  const setPending = (pending) => {
    scan.disabled = pending;
    preview.disabled = pending;
    start.disabled = pending;
  };
  scan.addEventListener('click', async () => {
    setPending(true);
    status.textContent = 'Scanning My Packs...';
    try {
      plan = currentPlan();
      snapshot = await options.onScan?.() || snapshot;
      status.textContent = `${Number(snapshot.total || 0)} pack(s) found`;
      render();
    } catch (error) {
      status.textContent = `Scan failed: ${error?.message || error}`;
    } finally {
      setPending(false);
    }
  });
  preview.addEventListener('click', () => options.onPreview?.());
  const close = () => overlay.remove?.();
  cancel.addEventListener('click', close);
  start.addEventListener('click', async () => {
    const selected = currentPlan();
    if (!selected.entries.length) {
      status.textContent = 'Add at least one pack type first';
      return;
    }
    setPending(true);
    status.textContent = 'Starting batch...';
    try {
      await options.onStart?.(selected);
      close();
    } catch (error) {
      status.textContent = `Start failed: ${error?.message || error}`;
      setPending(false);
    }
  });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  dialog.append(title, note, toolbar, availableTitle, availableList, planTitle, planList, status, actions);
  overlay.appendChild(dialog);
  dom.appendToBody(overlay);
  render();
  return overlay;
}
