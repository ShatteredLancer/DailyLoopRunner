export function emitDiagnostic(log, createMessage) {
  if (typeof log !== 'function' || typeof createMessage !== 'function') return false;
  try {
    const message = createMessage();
    if (message === undefined || message === null || message === '') return false;
    log(String(message));
    return true;
  } catch {
    return false;
  }
}
