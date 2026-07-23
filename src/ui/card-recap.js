import { getRecapPage } from '../reward/recap.js';

const DESTINATION_LABELS = Object.freeze({
  club: '->CLUB',
  transfer: '->TRANSFER',
  storage: '->STORAGE',
  unknown: '->?',
});

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

function button(dom, text, title) {
  const element = dom.create('button');
  element.type = 'button';
  element.textContent = text;
  if (title) element.title = title;
  applyStyles(element, {
    minHeight: '30px', padding: '0 12px', background: '#2F6FDE', color: '#FFF', border: 'none',
    borderRadius: '3px', cursor: 'pointer', fontSize: '13px',
  });
  return element;
}

function setButtonEnabled(element, enabled) {
  element.disabled = !enabled;
  element.style.opacity = enabled ? '1' : '0.42';
  element.style.cursor = enabled ? 'pointer' : 'default';
}

function rowTags(row, formatPrice) {
  const tags = [row.tierLabel || row.theme?.label || null];
  if (row.special) tags.push('special');
  if (row.duplicate) tags.push('duplicate');
  if (typeof row.tradeable === 'boolean') tags.push(row.tradeable ? 'tradeable' : 'untradeable');
  const price = formatPrice?.(row.price) || '';
  if (row.showPrice === true || price) tags.push(`price:${price || '?'}`);
  return tags.filter(Boolean).join(', ');
}

function renderCardRow(dom, row, formatPrice) {
  const theme = row.theme || {};
  const element = dom.create('div');
  applyStyles(element, {
    minHeight: '38px', padding: '6px 8px', boxSizing: 'border-box', display: 'flex', alignItems: 'center',
    flexWrap: 'wrap', gap: '8px',
    color: theme.foreground || '#F4F6F8', background: theme.background || '#1D2229',
    borderLeft: `4px solid ${theme.accent || '#64748B'}`,
  });
  const rating = dom.create('span');
  rating.textContent = String(Number(row.rating || 0));
  applyStyles(rating, {
    minWidth: '30px', color: theme.rating || theme.accent || '#F4F6F8', fontWeight: '700', fontSize: '14px',
  });
  const identity = dom.create('span');
  applyStyles(identity, {
    flex: '1 1 220px', minWidth: '0', display: 'flex', gap: '6px', alignItems: 'baseline', overflow: 'hidden',
  });
  const name = dom.create('span');
  name.textContent = String(row.name || 'Unknown player');
  applyStyles(name, {
    fontWeight: '600', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  });
  identity.appendChild(name);
  if (row.sourceLabel) {
    const source = dom.create('span');
    source.textContent = row.sourceLabel;
    applyStyles(source, { color: theme.muted || '#AAB4C2', fontSize: '11px', fontWeight: '600', flex: '0 0 auto' });
    identity.appendChild(source);
  }
  element.append(rating, identity);
  if (row.destination) {
    const destination = dom.create('span');
    destination.textContent = DESTINATION_LABELS[row.destination] || String(row.destination);
    applyStyles(destination, { color: theme.accent || '#AAB4C2', fontSize: '11px', fontWeight: '600', flex: '0 0 auto' });
    element.appendChild(destination);
  }
  const tags = dom.create('span');
  tags.textContent = rowTags(row, formatPrice);
  applyStyles(tags, {
    color: theme.muted || '#AAB4C2', fontSize: '11px', flex: '0 1 auto', maxWidth: '100%',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  });
  element.appendChild(tags);
  return element;
}

export function showCardRecap(options = {}) {
  const dom = options.dom;
  const model = options.model;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  if (!model) return Promise.resolve(false);
  dom.query?.(`#${model.modalId}`)?.remove?.();

  return new Promise((resolve) => {
    let stopTimer = null;
    let currentPage = 1;
    let finished = false;
    const overlay = dom.create('div');
    overlay.id = model.modalId;
    applyStyles(overlay, {
      position: 'fixed', inset: '0', zIndex: '1000001', background: 'rgba(0,0,0,.76)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
    });
    const dialog = dom.create('div');
    applyStyles(dialog, {
      width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#171B21', color: '#F4F6F8',
      border: '1px solid #65758A', padding: '14px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
    });
    const title = dom.create('div');
    title.textContent = model.title;
    applyStyles(title, { fontSize: '16px', fontWeight: '700', marginBottom: '5px' });
    const summary = dom.create('div');
    summary.textContent = model.summary;
    applyStyles(summary, { color: '#9AA6B8', marginBottom: '9px', fontSize: '12px' });
    const reason = model.reason ? dom.create('div') : null;
    if (reason) {
      reason.textContent = `${model.status}: ${model.reason}`;
      applyStyles(reason, {
        color: model.status === 'preserved' ? '#FFD27A' : '#E3A7A7', marginBottom: '10px', fontSize: '12px',
        padding: '7px 8px', background: '#241F1A', borderLeft: '3px solid #C48A3A', overflowWrap: 'anywhere',
      });
    }
    const list = dom.create('div');
    applyStyles(list, { display: 'flex', flexDirection: 'column', gap: '6px' });
    const footer = dom.create('div');
    applyStyles(footer, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginTop: '12px',
    });
    const previous = button(dom, 'Previous', 'Previous recap page');
    const pageLabel = dom.create('span');
    applyStyles(pageLabel, { color: '#AAB4C2', fontSize: '12px', flex: '1 1 auto', textAlign: 'center' });
    const next = button(dom, 'Next', 'Next recap page');
    const close = button(dom, 'Close');

    const renderPage = () => {
      const page = getRecapPage(model, currentPage);
      currentPage = page.page;
      list.textContent = '';
      if (!page.rows.length) {
        const empty = dom.create('div');
        empty.textContent = 'No player rows to display.';
        applyStyles(empty, { padding: '10px', color: '#9AA6B8', background: '#1D2229' });
        list.appendChild(empty);
      } else {
        page.rows.forEach((row) => list.appendChild(renderCardRow(dom, row, options.formatPrice)));
      }
      pageLabel.textContent = page.totalRows
        ? `Page ${page.page}/${page.pageCount} | ${page.start}-${page.end} of ${page.totalRows}`
        : 'Page 1/1 | 0 cards';
      setButtonEnabled(previous, page.hasPrevious);
      setButtonEnabled(next, page.hasNext);
      previous.style.display = page.pageCount > 1 ? '' : 'none';
      next.style.display = page.pageCount > 1 ? '' : 'none';
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      if (stopTimer !== null) options.cancelStopCheck?.(stopTimer);
      overlay.remove?.();
      options.onClose?.();
      resolve(true);
    };
    previous.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPage(); } });
    next.addEventListener('click', () => { if (currentPage < model.pageCount) { currentPage++; renderPage(); } });
    close.addEventListener('click', finish);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(); });
    footer.append(previous, pageLabel, next, close);
    dialog.append(title, summary);
    if (reason) dialog.appendChild(reason);
    dialog.append(list, footer);
    overlay.appendChild(dialog);
    dom.appendToBody(overlay);
    renderPage();
    if (model.specialCount > 0) options.celebrate?.(dialog, model.specialCount);
    if (typeof options.scheduleStopCheck === 'function') {
      stopTimer = options.scheduleStopCheck(() => {
        if (options.isStopping?.()) finish();
      }, 250);
    }
  });
}
