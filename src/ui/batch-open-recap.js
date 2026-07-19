function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

export function showBatchOpenRecap(options = {}) {
  const dom = options.dom;
  const model = options.model;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  if (!model) return Promise.resolve(false);
  dom.query?.('#bronze-loop-batch-recap-modal')?.remove?.();

  return new Promise((resolve) => {
    const overlay = dom.create('div');
    overlay.id = 'bronze-loop-batch-recap-modal';
    applyStyles(overlay, {
      position: 'fixed', inset: '0', zIndex: '1000001', background: 'rgba(0,0,0,.72)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
    });
    const dialog = dom.create('div');
    applyStyles(dialog, {
      width: 'min(620px, 100%)', maxHeight: '88vh', overflow: 'auto', background: '#171b21', color: '#f4f6f8',
      border: '1px solid #65758a', padding: '14px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
    });
    const title = dom.create('div');
    title.textContent = model.status === 'preview' ? 'Batch Open Recap Preview' : 'Batch Open Recap';
    applyStyles(title, { fontSize: '16px', fontWeight: '700', marginBottom: '8px' });
    const summary = dom.create('div');
    summary.textContent = `${model.packsOpened}/${model.requestedPacks} pack(s) opened, ${model.itemCount} item(s), ${model.specialCount} special, ${model.normalGoldCount} gold, ${model.normalSilverCount} silver, ${model.normalBronzeCount} bronze${model.skippedPacks ? `, ${model.skippedPacks} skipped` : ''}${model.omittedCount ? `, ${model.omittedCount} other item(s)` : ''}`;
    applyStyles(summary, { color: '#9aa6b8', marginBottom: '10px', fontSize: '12px' });
    const reason = model.reason ? dom.create('div') : null;
    if (reason) {
      reason.textContent = `${model.status}: ${model.reason}`;
      applyStyles(reason, {
        color: model.status === 'preserved' ? '#ffd27a' : '#e3a7a7', marginBottom: '10px', fontSize: '12px',
        padding: '7px 8px', background: '#241f1a', borderLeft: '3px solid #c48a3a', overflowWrap: 'anywhere',
      });
    }

    const list = dom.create('div');
    applyStyles(list, { display: 'flex', flexDirection: 'column', gap: '6px' });
    if (!model.rows.length) {
      const empty = dom.create('div');
      empty.textContent = 'No player rows to display.';
      applyStyles(empty, { padding: '10px', color: '#9aa6b8', background: '#1d2229' });
      list.appendChild(empty);
    }
    for (const rowModel of model.rows) {
      const row = dom.create('div');
      applyStyles(row, {
        minHeight: '34px', padding: '6px 8px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '8px',
        background: rowModel.kind === 'special' ? '#30263d' : '#1d2229',
        borderLeft: `3px solid ${rowModel.kind === 'special' ? '#c48cff' : '#64748b'}`,
      });
      const rating = dom.create('span');
      rating.textContent = String(rowModel.rating);
      applyStyles(rating, { minWidth: '28px', color: rowModel.kind === 'special' ? '#ffd54a' : '#f3f5f7', fontWeight: '700' });
      const label = dom.create('span');
      label.textContent = rowModel.kind === 'special' ? rowModel.name : `${rowModel.label} x${rowModel.count}`;
      applyStyles(label, { flex: '1 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
      row.append(rating, label);
      if (rowModel.kind === 'special') {
        const tags = dom.create('span');
        const price = options.formatPrice?.(rowModel.price) || '';
        tags.textContent = [rowModel.duplicate ? 'duplicate' : null, rowModel.tradeable ? 'tradeable' : 'untradeable', `price:${price || '?'}`]
          .filter(Boolean).join(', ');
        applyStyles(tags, { color: '#9aa6b8', fontSize: '11px', flex: '0 0 auto' });
        row.appendChild(tags);
      }
      list.appendChild(row);
    }

    const closeButton = dom.create('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    applyStyles(closeButton, {
      marginTop: '12px', minHeight: '30px', padding: '0 14px', background: '#2f6fde', color: '#fff',
      border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '13px',
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      overlay.remove?.();
      options.onClose?.();
      resolve(true);
    };
    closeButton.addEventListener('click', finish);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(); });
    dialog.append(title, summary);
    if (reason) dialog.appendChild(reason);
    dialog.append(list, closeButton);
    overlay.appendChild(dialog);
    dom.appendToBody(overlay);
    if (model.specialCount > 0) options.celebrate?.(dialog, model.specialCount);
  });
}
