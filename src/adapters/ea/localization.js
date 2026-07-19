export function createEaLocalizationAdapter(runtime) {
  function localize(value) {
    if (!value) return '';
    try {
      const service = runtime?.services?.Localization;
      if (typeof service?.localize === 'function') return service.localize(value);
    } catch { }
    return String(value || '');
  }

  return Object.freeze({ localize });
}
