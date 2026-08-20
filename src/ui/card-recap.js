import { compactRecapSourceLabel, getRecapPage } from '../reward/recap.js';
import { applyResponsiveDialogLayout, readResponsiveUiMode, responsiveControlHeight } from './responsive-dialog.js';

const DESTINATION_LABELS = Object.freeze({
  club: 'Club',
  transfer: 'Transfer',
  storage: 'Storage',
  unassigned: 'Unassigned',
  blocked: 'Blocked',
  unknown: '?',
});

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

function button(dom, text, title, mode) {
  const element = dom.create('button');
  element.type = 'button';
  element.textContent = text;
  if (title) element.title = title;
  applyStyles(element, {
    minHeight: responsiveControlHeight(mode), padding: '0 12px', background: '#2F6FDE', color: '#FFF', border: 'none',
    borderRadius: '3px', cursor: 'pointer', fontSize: '13px',
  });
  return element;
}

function setButtonEnabled(element, enabled) {
  element.disabled = !enabled;
  element.style.opacity = enabled ? '1' : '0.42';
  element.style.cursor = enabled ? 'pointer' : 'default';
}

function rowPrice(row, formatPrice) {
  const price = formatPrice?.(row.price) || '';
  return row.showPrice === true || price ? price || '?' : null;
}

function renderCardRow(dom, row, formatPrice, mode) {
  const theme = row.theme || {};
  const element = dom.create('div');
  applyStyles(element, {
    minHeight: mode?.touchTargets ? '44px' : '34px', padding: '5px 8px', boxSizing: 'border-box', display: 'flex', alignItems: 'center',
    flexWrap: 'nowrap', gap: mode?.mobile ? '6px' : '8px', overflow: 'hidden',
    color: theme.foreground || '#F4F6F8', background: theme.background || '#1D2229',
    borderLeft: `4px solid ${theme.accent || '#64748B'}`,
  });
  const rating = dom.create('span');
  rating.textContent = String(Number(row.rating || 0));
  applyStyles(rating, {
    minWidth: '34px', padding: '2px 5px', boxSizing: 'border-box', textAlign: 'center', lineHeight: '18px',
    color: theme.rating || '#111318', background: theme.ratingBackground || theme.accent || '#64748B',
    borderRadius: '2px', fontWeight: '700', fontSize: '14px', flex: '0 0 auto',
  });
  const name = dom.create(row.futbinUrl ? 'a' : 'span');
  name.textContent = String(row.name || 'Unknown player');
  name.title = row.futbinUrl ? `Open ${name.textContent} on FUTBIN` : name.textContent;
  if (row.futbinUrl) {
    name.href = row.futbinUrl;
    name.target = '_blank';
    name.rel = 'noopener noreferrer';
  }
  applyStyles(name, {
    fontWeight: '600', flex: '1 1 160px', minWidth: '0', lineHeight: '18px', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis', color: 'inherit', textDecoration: row.futbinUrl ? 'underline' : 'none',
  });
  element.append(rating, name);
  if (row.sourceLabel) {
    const source = dom.create('span');
    source.textContent = compactRecapSourceLabel(row.sourceLabel);
    source.title = row.sourceTitle || row.sourceLabel || source.textContent;
    applyStyles(source, {
      color: theme.muted || '#AAB4C2', fontSize: '11px', fontWeight: '600', flex: mode?.mobile ? '0 1 58px' : '0 1 100px',
      minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    });
    element.appendChild(source);
  }
  if (row.destination) {
    const destination = dom.create('span');
    destination.textContent = DESTINATION_LABELS[row.destination] || String(row.destination);
    destination.title = `Destination: ${destination.textContent}`;
    applyStyles(destination, {
      color: theme.accent || '#AAB4C2', fontSize: '11px', fontWeight: '600', flex: '0 1 auto',
      minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    });
    element.appendChild(destination);
  }
  const priceText = rowPrice(row, formatPrice);
  if (priceText) {
    const price = dom.create('span');
    price.textContent = priceText;
    price.title = `Price: ${priceText}`;
    applyStyles(price, {
      color: theme.muted || '#AAB4C2', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', flex: '0 0 auto',
    });
    element.appendChild(price);
  }
  return element;
}

export function showCardRecap(options = {}) {
  const dom = options.dom;
  const model = options.model;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  if (!model) return Promise.resolve(false);
  dom.query?.(`#${model.modalId}`)?.remove?.();
  const mode = readResponsiveUiMode(dom);

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
    const details = Array.isArray(model.details) && model.details.length ? dom.create('div') : null;
    if (details) {
      applyStyles(details, {
        display: 'grid', gridTemplateColumns: mode?.mobile ? '1fr' : 'minmax(105px, auto) minmax(0, 1fr)',
        gap: '5px 10px', marginBottom: '10px', padding: '8px 0', borderTop: '1px solid #343C47',
        borderBottom: '1px solid #343C47', fontSize: '11px', lineHeight: '16px',
      });
      model.details.forEach((entry) => {
        const label = dom.create('span');
        label.textContent = String(entry.label || '');
        applyStyles(label, { color: '#D7DEE8', fontWeight: '700' });
        const value = dom.create('span');
        value.textContent = String(entry.value || '-');
        applyStyles(value, { color: '#AAB4C2', minWidth: '0', overflowWrap: 'anywhere' });
        details.append(label, value);
      });
    }
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
    const previous = button(dom, 'Previous', 'Previous recap page', mode);
    const pageLabel = dom.create('span');
    applyStyles(pageLabel, { color: '#AAB4C2', fontSize: '12px', flex: '1 1 auto', textAlign: 'center' });
    const next = button(dom, 'Next', 'Next recap page', mode);
    const close = button(dom, 'Close', null, mode);

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
        page.rows.forEach((row) => list.appendChild(renderCardRow(dom, row, options.formatPrice, mode)));
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
    applyResponsiveDialogLayout({ dom, mode, overlay, dialog, title, actions: footer, controls: [previous, next, close] });
    dialog.append(title, summary);
    if (details) dialog.appendChild(details);
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
