export function createDomAdapter(documentObject = globalThis.document, runtime = globalThis) {
  function query(selector) {
    return documentObject?.querySelector?.(selector) || null;
  }

  function queryAll(selector) {
    return Array.from(documentObject?.querySelectorAll?.(selector) || []);
  }

  function create(tagName) {
    if (!documentObject?.createElement) throw new Error('DOM createElement is unavailable');
    return documentObject.createElement(tagName);
  }

  function appendToBody(element) {
    if (!documentObject?.body?.appendChild) throw new Error('DOM body is unavailable');
    documentObject.body.appendChild(element);
  }

  function appendToHead(element) {
    if (!documentObject?.head?.appendChild) throw new Error('DOM head is unavailable');
    documentObject.head.appendChild(element);
  }

  function eventConstructor(type) {
    return type === 'pointer'
      ? (runtime?.PointerEvent || globalThis.PointerEvent)
      : (runtime?.MouseEvent || globalThis.MouseEvent);
  }

  function createLegacyMouseEvent(type) {
    const event = documentObject?.createEvent?.('MouseEvents');
    if (!event) return null;
    event.initMouseEvent(type, true, true, runtime, 1, 0, 0, 1, 1, false, false, false, false, 0, null);
    return event;
  }

  function compactText(element) {
    return String(element?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isClickable(element) {
    if (!element) return false;
    if (element.disabled || element.classList?.contains?.('disabled')) return false;
    const rect = element.getBoundingClientRect?.();
    if (rect && (!rect.width || !rect.height)) return false;
    return true;
  }

  function click(element) {
    if (!element) return false;
    try { element.scrollIntoView?.({ block: 'center', inline: 'center' }); } catch { }
    try { element.focus?.(); } catch { }

    const fire = (Constructor, type, extra = {}) => {
      try {
        if (typeof Constructor === 'function') {
          element.dispatchEvent(new Constructor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            ...extra,
          }));
          return true;
        }
      } catch { }
      try {
        const event = createLegacyMouseEvent(type);
        if (!event) return false;
        element.dispatchEvent(event);
        return true;
      } catch { return false; }
    };

    fire(eventConstructor('pointer'), 'pointerdown', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
    fire(eventConstructor('mouse'), 'mousedown', { button: 0, buttons: 1 });
    fire(eventConstructor('pointer'), 'pointerup', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
    fire(eventConstructor('mouse'), 'mouseup', { button: 0, buttons: 0 });
    fire(eventConstructor('mouse'), 'click', { button: 0, buttons: 0 });
    try { element.click?.(); } catch { }
    return true;
  }

  function searchText(element) {
    return [
      compactText(element),
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('title'),
      element?.getAttribute?.('data-id'),
      element?.value,
    ].filter(Boolean).join(' ');
  }

  function findButtonByText(patterns, matches) {
    return queryAll('button').find((button) =>
      matches(compactText(button), patterns) && isClickable(button)
    ) || null;
  }

  function findClickableByText(patterns, matches, root = documentObject) {
    const selector = [
      'button',
      '[role="button"]',
      'a',
      'input[type="button"]',
      'input[type="submit"]',
      '.call-to-action',
      '[class*="call-to-action"]',
      '[class*="btn"]',
      '[class*="Button"]',
    ].join(',');
    return Array.from(root?.querySelectorAll?.(selector) || [])
      .filter(isClickable)
      .sort((a, b) => searchText(a).length - searchText(b).length)
      .find((element) => matches(searchText(element), patterns)) || null;
  }

  function keyStroke(key = 'Alt', code = 'AltRight', options = {}) {
    const KeyboardEventConstructor = runtime?.KeyboardEvent || globalThis.KeyboardEvent;
    const init = {
      key,
      code,
      bubbles: true,
      cancelable: true,
      composed: true,
      location: code === 'AltRight' ? 2 : 0,
      altKey: code === 'AltRight',
      ...options,
    };
    for (const target of [documentObject?.activeElement, documentObject?.body, documentObject, runtime].filter(Boolean)) {
      try { target.dispatchEvent(new KeyboardEventConstructor('keydown', init)); } catch { }
      try { target.dispatchEvent(new KeyboardEventConstructor('keyup', init)); } catch { }
    }
  }

  return Object.freeze({
    appendToBody,
    appendToHead,
    click,
    compactText,
    create,
    createLegacyMouseEvent,
    eventConstructor,
    findButtonByText,
    findClickableByText,
    isClickable,
    keyStroke,
    query,
    queryAll,
    searchText,
  });
}
