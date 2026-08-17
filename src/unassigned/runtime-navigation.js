function normalizeRequested(value) {
  if (value && typeof value === 'object') return value.requested === true || value.confirmed === true;
  return value !== false;
}

export async function recoverRuntimeUnassignedNavigation(options = {}) {
  if (typeof options.getControllerName !== 'function') throw new TypeError('getControllerName is required');
  if (typeof options.requestController !== 'function') throw new TypeError('requestController is required');
  if (typeof options.requestTextFallback !== 'function') throw new TypeError('requestTextFallback is required');
  if (typeof options.clickHome !== 'function') throw new TypeError('clickHome is required');
  if (typeof options.settle !== 'function') throw new TypeError('settle is required');
  const controllerName = () => {
    try { return String(options.getControllerName() || '?'); } catch { return '?'; }
  };
  const confirmed = () => /Unassigned/i.test(controllerName());
  const from = controllerName();
  const steps = [];
  const result = () => ({
    requested: steps.some((step) => step.requested),
    confirmed: confirmed(),
    from,
    to: controllerName(),
    reason: confirmed() ? null : 'runtime recovery did not reach the Unassigned controller',
    steps,
  });

  const runStep = async (id, request) => {
    const before = controllerName();
    let requested = false;
    let error = null;
    try {
      requested = normalizeRequested(await request());
    } catch (caught) {
      error = caught?.message || String(caught);
    }
    if (requested) await options.settle();
    steps.push({ id, requested, confirmed: confirmed(), before, after: controllerName(), error });
    return confirmed();
  };

  if (confirmed()) return result();

  if (/UTStorePackViewController/i.test(controllerName()) && typeof options.popCurrent === 'function') {
    if (typeof options.materializeUnassigned === 'function') {
      if (await runStep('materialize-store-pack', options.materializeUnassigned)) return result();
      if (await runStep('controller-after-materialize', options.requestController)) return result();
    }
    if (await runStep('pop-store-pack', options.popCurrent)) return result();
  }

  if (await runStep('controller', options.requestController)) return result();
  if (await runStep('home', options.clickHome)) return result();
  if (typeof options.materializeUnassigned === 'function') {
    if (await runStep('materialize-after-home', options.materializeUnassigned)) return result();
  }
  if (await runStep('controller-after-home', options.requestController)) return result();
  await runStep('text-fallback-after-home', options.requestTextFallback);
  return result();
}
