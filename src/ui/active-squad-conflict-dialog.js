import { applyResponsiveDialogLayout, readResponsiveUiMode, responsiveControlHeight } from './responsive-dialog.js';

function styles(element, values) {
  Object.assign(element.style, values);
  return element;
}

export function requestActiveSquadConflictDecision(options = {}) {
  if (!options.dom?.create || !options.dom?.appendToBody) throw new TypeError('dom adapter is required');
  const mode = readResponsiveUiMode(options.dom);
  const items = Array.isArray(options.items) ? options.items : [];

  return new Promise((resolve) => {
    const overlay = styles(options.dom.create('div'), {
      position: 'fixed', inset: '0', zIndex: '100000', background: 'rgba(0, 0, 0, 0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
    });
    overlay.id = 'bronze-loop-active-squad-conflict';
    const dialog = styles(options.dom.create('div'), {
      width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#171b21', color: '#f3f5f7',
      border: '1px solid #65758a', padding: '16px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
    });
    const title = styles(options.dom.create('div'), { fontWeight: '700', marginBottom: '8px' });
    title.textContent = 'Active Squad special card';
    const message = styles(options.dom.create('div'), { color: '#b7c2d0', marginBottom: '12px', lineHeight: '1.45' });
    message.textContent = 'EA reports that the selected special card is used by an active squad.';
    const list = styles(options.dom.create('div'), { display: 'grid', gap: '6px', marginBottom: '14px' });
    items.forEach((item) => {
      const row = styles(options.dom.create('div'), {
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '10px',
        border: '1px solid #465363', padding: '8px', background: '#202731',
      });
      const name = styles(options.dom.create('span'), { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '700' });
      name.textContent = String(item.name || `Item #${item.id || '?'}`);
      const detail = styles(options.dom.create('span'), { color: '#ffd27a', whiteSpace: 'nowrap' });
      detail.textContent = `${Number(item.rating || 0) || '?'} | ${String(item.pile || 'unknown')}`;
      row.append(name, detail);
      list.appendChild(row);
    });
    const actions = styles(options.dom.create('div'), { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' });
    const replace = styles(options.dom.create('button'), { minHeight: responsiveControlHeight(mode, 34), padding: '0 14px' });
    replace.type = 'button';
    replace.textContent = 'Replace card';
    const use = styles(options.dom.create('button'), {
      minHeight: responsiveControlHeight(mode, 34), padding: '0 14px', background: '#a94343', color: '#fff', border: '1px solid #d16a6a',
    });
    use.type = 'button';
    use.textContent = 'Use this card';
    const finish = (decision) => {
      overlay.remove();
      resolve(decision);
    };
    replace.addEventListener('click', () => finish('replace'));
    use.addEventListener('click', () => finish('use'));
    overlay.addEventListener('click', (event) => {
      if (event?.target === overlay) finish('replace');
    });
    actions.append(replace, use);
    dialog.append(title, message, list, actions);
    applyResponsiveDialogLayout({ dom: options.dom, mode, overlay, dialog, title, actions, controls: [replace, use] });
    overlay.appendChild(dialog);
    options.dom.appendToBody(overlay);
  });
}
