function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

export function waitForManualPlayerPickSelection(options = {}) {
  if (!options.dom?.create || !options.dom?.appendToBody) throw new TypeError('dom adapter is required');
  if (typeof options.describeCandidate !== 'function') throw new TypeError('describeCandidate is required');
  if (typeof options.scheduleStopCheck !== 'function') throw new TypeError('scheduleStopCheck is required');
  if (typeof options.cancelStopCheck !== 'function') throw new TypeError('cancelStopCheck is required');

  const ranked = options.ranked || [];
  const pickCount = Math.max(1, Number(options.pickCount || 1) || 1);
  const reason = String(options.reason || 'manual selection required');

  return new Promise((resolve, reject) => {
    let stopTimer = null;
    const overlay = options.dom.create('div');
    const finish = (callback, value) => {
      if (stopTimer !== null) options.cancelStopCheck(stopTimer);
      overlay.remove();
      callback(value);
    };

    overlay.id = 'bronze-loop-pick-modal';
    applyStyles(overlay, {
      position: 'fixed', inset: '0', zIndex: '100000', background: 'rgba(0, 0, 0, 0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
    });
    const dialog = options.dom.create('div');
    applyStyles(dialog, {
      width: 'min(780px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#171b21', color: '#f3f5f7',
      border: '1px solid #65758a', padding: '16px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
    });
    const title = options.dom.create('div');
    title.textContent = `Manual Player Pick: ${reason}`;
    applyStyles(title, { fontWeight: '700', marginBottom: '8px' });
    const hint = options.dom.create('div');
    hint.textContent = `Select exactly ${pickCount} player(s), then confirm.`;
    applyStyles(hint, { color: '#b7c2d0', marginBottom: '12px' });
    const list = options.dom.create('div');
    applyStyles(list, { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' });
    const selected = new Set();
    const cards = [];
    const confirm = options.dom.create('button');
    confirm.textContent = 'Confirm selection';
    confirm.disabled = true;
    applyStyles(confirm, { marginTop: '14px', minHeight: '34px', padding: '0 14px' });

    const refresh = () => {
      cards.forEach(({ card, candidate }) => {
        card.style.borderColor = selected.has(candidate) ? '#64d77a' : '#536171';
        card.style.background = selected.has(candidate) ? '#243c2b' : '#202731';
      });
      confirm.disabled = selected.size !== pickCount;
    };

    ranked.forEach((candidate) => {
      const card = options.dom.create('button');
      card.type = 'button';
      card.textContent = options.describeCandidate(candidate);
      applyStyles(card, {
        minHeight: '68px', textAlign: 'left', color: '#f3f5f7', background: '#202731', border: '1px solid #536171',
        padding: '9px', cursor: 'pointer', lineHeight: '1.35',
      });
      card.addEventListener('click', () => {
        if (selected.has(candidate)) selected.delete(candidate);
        else if (selected.size < pickCount) selected.add(candidate);
        refresh();
      });
      cards.push({ card, candidate });
      list.appendChild(card);
    });
    confirm.addEventListener('click', () => {
      if (selected.size !== pickCount) return;
      finish(resolve, [...selected].map((candidate) => candidate.item));
    });
    dialog.append(title, hint, list, confirm);
    overlay.appendChild(dialog);
    options.dom.appendToBody(overlay);
    refresh();
    stopTimer = options.scheduleStopCheck(() => {
      if (!options.isStopping?.()) return;
      finish(reject, new Error('Stopped by user while a Player Pick selection was pending'));
    }, 250);
  });
}
