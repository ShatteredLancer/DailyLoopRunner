export function createDomAdapter(documentObject = globalThis.document) {
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

  return Object.freeze({ query, queryAll, create });
}
