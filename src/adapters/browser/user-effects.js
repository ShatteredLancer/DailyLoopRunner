export function createUserEffectsAdapter(runtime = globalThis, documentObject = runtime?.document || globalThis.document) {
  async function copyText(text) {
    const value = String(text || '');
    try {
      await runtime?.navigator?.clipboard?.writeText?.(value);
      if (typeof runtime?.navigator?.clipboard?.writeText === 'function') return true;
    } catch { }

    if (!documentObject?.createElement || !documentObject?.body?.appendChild) {
      throw new Error('Clipboard fallback is unavailable');
    }
    const textarea = documentObject.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    documentObject.body.appendChild(textarea);
    textarea.select?.();
    const copied = documentObject.execCommand?.('copy') !== false;
    textarea.remove?.();
    if (!copied) throw new Error('Clipboard copy failed');
    return true;
  }

  function downloadText(text, filename) {
    const BlobConstructor = runtime?.Blob || globalThis.Blob;
    const urlApi = runtime?.URL || globalThis.URL;
    if (!BlobConstructor || !urlApi?.createObjectURL || !documentObject?.createElement || !documentObject?.body?.appendChild) {
      throw new Error('Download is unavailable');
    }
    const blob = new BlobConstructor([String(text || '')], { type: 'text/plain;charset=utf-8' });
    const url = urlApi.createObjectURL(blob);
    const anchor = documentObject.createElement('a');
    anchor.href = url;
    anchor.download = String(filename || 'download.txt');
    documentObject.body.appendChild(anchor);
    try {
      anchor.click?.();
    } finally {
      anchor.remove?.();
      urlApi.revokeObjectURL?.(url);
    }
    return true;
  }

  return Object.freeze({ copyText, downloadText });
}
