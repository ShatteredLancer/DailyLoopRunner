function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

function positionStack(stack, panel, viewport = {}) {
  const rect = panel?.getBoundingClientRect?.();
  const viewportWidth = Math.max(0, Number(viewport.width || 0));
  const viewportHeight = Math.max(0, Number(viewport.height || 0));
  const width = Math.max(220, Math.min(420, viewportWidth > 0 ? viewportWidth - 20 : 360));
  stack.style.width = `${width}px`;
  if (!rect) {
    stack.style.right = '10px';
    stack.style.bottom = '198px';
    stack.style.top = 'auto';
    return;
  }
  stack.style.right = `${Math.max(10, viewportWidth - Number(rect.right || 0))}px`;
  if (Number(rect.top || 0) >= 180) {
    stack.style.top = 'auto';
    stack.style.bottom = `${Math.max(10, viewportHeight - Number(rect.top || 0) + 10)}px`;
  } else {
    stack.style.top = `${Math.max(10, Number(rect.bottom || 0) + 10)}px`;
    stack.style.bottom = 'auto';
  }
}

export function showPackHighlightToast(options = {}) {
  const dom = options.dom;
  const model = options.model;
  if (!dom?.create || !dom?.appendToBody || !model?.cards?.length) return false;
  let stack = dom.query?.('#bronze-loop-reward-highlight-stack');
  if (!stack) {
    stack = dom.create('div');
    stack.id = 'bronze-loop-reward-highlight-stack';
    applyStyles(stack, {
      position: 'fixed', zIndex: '1000000', display: 'flex', flexDirection: 'column', gap: '8px',
      pointerEvents: 'none', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box',
    });
    dom.appendToBody(stack);
  }
  positionStack(stack, options.panel, options.viewport?.() || {});

  const toast = dom.create('div');
  applyStyles(toast, {
    position: 'relative', overflow: 'hidden', isolation: 'isolate', pointerEvents: 'auto',
    background: 'rgba(20, 24, 30, 0.97)', color: '#f4f6f8', border: '1px solid #d4af37',
    borderLeft: '4px solid #ffd54a', boxShadow: '0 8px 24px rgba(0,0,0,.42)', padding: '10px 34px 10px 12px',
    boxSizing: 'border-box', opacity: '1', transition: 'opacity .25s ease, transform .25s ease',
  });
  const title = dom.create('div');
  title.textContent = `${model.maxRating} Special Highlight`;
  applyStyles(title, { color: '#ffd54a', fontSize: '14px', fontWeight: '700', marginBottom: '3px' });
  const pack = dom.create('div');
  pack.textContent = model.pack?.name || model.purpose || 'Opened pack';
  applyStyles(pack, { color: '#9fb2c9', fontSize: '11px', marginBottom: '6px' });
  const list = dom.create('div');
  applyStyles(list, { display: 'flex', flexDirection: 'column', gap: '3px' });
  for (const card of model.cards.slice(0, 5)) {
    const row = dom.create('div');
    row.textContent = `${card.name} - ${card.rating}${card.duplicate ? ' | duplicate' : ''}${card.tradeable ? ' | tradeable' : ''}`;
    applyStyles(row, { fontSize: '12px', lineHeight: '16px', overflowWrap: 'anywhere' });
    list.appendChild(row);
  }
  if (model.cards.length > 5) {
    const more = dom.create('div');
    more.textContent = `+${model.cards.length - 5} more`;
    applyStyles(more, { color: '#9fb2c9', fontSize: '11px' });
    list.appendChild(more);
  }
  const close = dom.create('button');
  close.type = 'button';
  close.textContent = 'x';
  close.title = 'Dismiss highlight';
  applyStyles(close, {
    position: 'absolute', top: '4px', right: '5px', width: '24px', height: '24px', padding: '0',
    border: '0', background: 'transparent', color: '#d7e2f0', cursor: 'pointer', fontSize: '18px',
  });

  let timer = null;
  const finish = () => {
    if (timer !== null) options.cancel?.(timer);
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    (options.schedule || setTimeout)(() => {
      toast.remove?.();
      if (!stack.children?.length) stack.remove?.();
    }, 260);
  };
  close.addEventListener('click', finish);
  toast.append(title, pack, list, close);
  stack.appendChild(toast);
  while (stack.children?.length > 3) stack.firstChild?.remove?.();
  options.celebrate?.(toast, model.cards.length);
  timer = (options.schedule || setTimeout)(finish, Math.max(3000, Number(options.durationMs || 7000) || 7000));
  return true;
}
