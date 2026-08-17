function controllerName(options) {
  try { return String(options.getControllerName?.() || '?'); } catch { return '?'; }
}

function isUnassignedController(name) {
  return /Unassigned/i.test(String(name || ''));
}

function normalizeRequestResult(value) {
  if (value && typeof value === 'object') {
    return {
      requested: value.requested === true || value.confirmed === true,
      reason: value.reason ? String(value.reason) : null,
      via: value.via ? String(value.via) : null,
      steps: Array.isArray(value.steps) ? value.steps : [],
    };
  }
  return { requested: value !== false, reason: null, via: null, steps: [] };
}

function formatNavigationMethod(attempts) {
  const parts = [];
  for (const attempt of attempts) {
    if (!attempt.requested && !attempt.confirmed) continue;
    parts.push(attempt.id);
    if (attempt.delayed) parts.push('delayed');
  }
  return parts.join('+') || 'unavailable';
}

export async function navigateToUnassigned(options = {}) {
  if (typeof options.requestController !== 'function') throw new TypeError('requestController is required');
  if (typeof options.requestTextFallback !== 'function') throw new TypeError('requestTextFallback is required');
  if (typeof options.waitLoadingEnd !== 'function') throw new TypeError('waitLoadingEnd is required');
  const requireNavigation = options.requireNavigation === true || options.verifyNavigation === true;
  const retryAttempts = Math.max(1, Math.min(5, Number(options.retryAttempts || 3) || 3));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 250));
  const from = controllerName(options);
  const attempts = [];
  const isConfirmed = () => isUnassignedController(controllerName(options));

  const attemptNavigation = async (id, request) => {
    const before = controllerName(options);
    let requestResult = { requested: false, reason: null, via: null };
    let error = null;
    try {
      requestResult = normalizeRequestResult(await request());
    } catch (caught) {
      error = caught?.message || String(caught);
    }

    if (requestResult.requested) await options.waitLoadingEnd();
    let confirmed = requireNavigation ? isConfirmed() : null;
    let delayed = false;
    if (requireNavigation && requestResult.requested && !confirmed) {
      for (let retry = 1; retry <= retryAttempts; retry++) {
        await options.sleep?.(retryDelayMs);
        if (!isConfirmed()) continue;
        confirmed = true;
        delayed = true;
        break;
      }
    }

    const attempt = {
      id,
      requested: requestResult.requested,
      confirmed,
      delayed,
      before,
      after: controllerName(options),
      reason: requestResult.reason,
      via: requestResult.via,
      steps: requestResult.steps,
      error,
    };
    attempts.push(attempt);
    return attempt;
  };

  if (requireNavigation && isConfirmed()) {
    return { status: 'confirmed', from, to: controllerName(options), method: 'already', attempts };
  }

  const controllerAttempt = await attemptNavigation('controller', options.requestController);
  if (!requireNavigation) {
    if (!controllerAttempt.requested) {
      await attemptNavigation('text-fallback', options.requestTextFallback);
    }
    return {
      status: 'requested',
      from,
      to: controllerName(options),
      method: formatNavigationMethod(attempts),
      attempts,
    };
  }
  if (controllerAttempt.confirmed) {
    return { status: 'confirmed', from, to: controllerName(options), method: formatNavigationMethod(attempts), attempts };
  }

  const textAttempt = await attemptNavigation('text-fallback', options.requestTextFallback);
  if (textAttempt.confirmed) {
    return { status: 'confirmed', from, to: controllerName(options), method: formatNavigationMethod(attempts), attempts };
  }

  if (typeof options.requestRecovery === 'function') {
    const recoveryAttempt = await attemptNavigation('controller-recovery', options.requestRecovery);
    if (recoveryAttempt.confirmed) {
      return { status: 'confirmed', from, to: controllerName(options), method: formatNavigationMethod(attempts), attempts };
    }
  }

  return {
    status: 'blocked',
    from,
    to: controllerName(options),
    method: formatNavigationMethod(attempts),
    attempts,
  };
}
