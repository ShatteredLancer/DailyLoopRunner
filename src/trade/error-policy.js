const DEFAULT_CIRCUIT_CONFIG = Object.freeze({
  failureThreshold: 3,
  windowMs: 60_000,
  cooldownMs: 15 * 60_000,
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function errorCode(error) {
  const candidates = [
    error?.code,
    error?.status,
    error?.statusCode,
    error?.error?.code,
    error?.error?.status,
    error?.error?.statusCode,
    error?.response?.status,
    error?.response?.statusCode,
    error?.response?.error?.code,
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  const match = String(error?.message || error || '').match(/(?:HTTP|status|code)?\s*[:#]?\s*(\d{3,5})/i);
  return match ? Number(match[1]) : null;
}

function messageText(error) {
  return String(error?.message || error?.reason || error?.error?.message || error || '').trim().slice(0, 500);
}

export function classifyTradeError(error = {}) {
  const code = errorCode(error);
  const message = messageText(error);
  const text = `${String(error?.kind || '')} ${message}`.toLowerCase();
  if (code === 427) {
    return {
      kind: 'auction-operation-blocked',
      code,
      action: 'stop-and-require-manual-reset',
      retryable: false,
      opensCircuit: true,
      persistent: true,
      disarm: true,
      ambiguous: false,
    };
  }
  if (code === 429 || /too many requests|rate.?limit/.test(text)) {
    return { kind: 'rate-limit', code, action: 'stop-and-cooldown', retryable: false, opensCircuit: false, disarm: false, ambiguous: false };
  }
  if (code === 401 || /session expired|not authenticated|unauthori[sz]ed/.test(text)) {
    return { kind: 'session-expired', code, action: 'wait-session', retryable: false, opensCircuit: true, disarm: false, ambiguous: false };
  }
  if (/captcha/.test(text)) {
    return { kind: 'captcha', code, action: 'stop-and-disarm', retryable: false, opensCircuit: true, disarm: true, ambiguous: false };
  }
  if (code === 403 || /permission denied|trade access/.test(text)) {
    return { kind: 'permission-denied', code, action: 'block', retryable: false, opensCircuit: true, disarm: false, ambiguous: false };
  }
  if (/destination full|trade pile full|transfer.*full/.test(text)) {
    return { kind: 'destination-full', code, action: 'stop', retryable: false, opensCircuit: false, disarm: false, ambiguous: false };
  }
  if (/card.*(?:in trade|already listed)|item.*trade offer/.test(text)) {
    return { kind: 'card-in-trade', code, action: 'refresh-and-skip', retryable: true, opensCircuit: false, disarm: false, ambiguous: false };
  }
  if (/competition[- ]lost|lost bid|already purchased|outbid|auction.*expired/.test(text)) {
    return { kind: 'competition-lost', code, action: 'continue-after-delay', retryable: true, opensCircuit: false, disarm: false, ambiguous: false };
  }
  if ([426, 512, 521].includes(code)) {
    return { kind: 'transient-service', code, action: 'bounded-backoff', retryable: true, opensCircuit: false, disarm: false, ambiguous: false };
  }
  if (/timeout|network|transport|connection|failed to fetch/.test(text) || code === null) {
    return { kind: 'ambiguous-transport', code, action: 'reconcile-and-stop-if-unknown', retryable: false, opensCircuit: false, disarm: false, ambiguous: true };
  }
  return { kind: 'service-error', code, action: 'stop', retryable: false, opensCircuit: false, disarm: false, ambiguous: false };
}

export function createTradeCircuitState(input = {}) {
  return {
    state: ['closed', 'open', 'half-open'].includes(input.state) ? input.state : 'closed',
    failureTimes: (input.failureTimes || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b),
    openedAt: Number.isFinite(Number(input.openedAt)) ? Number(input.openedAt) : null,
    retryAt: Number.isFinite(Number(input.retryAt)) ? Number(input.retryAt) : null,
    reason: input.reason ? String(input.reason) : null,
    persistent: input.persistent === true,
  };
}

export function tradeCircuitAvailability(stateInput = {}, nowInput = Date.now()) {
  const state = createTradeCircuitState(stateInput);
  const now = finiteNumber(nowInput, Date.now());
  if (state.state === 'open' && state.persistent) {
    return { allowed: false, probe: false, state };
  }
  if (state.state === 'open' && state.retryAt !== null && now >= state.retryAt) {
    return { allowed: true, probe: true, state: { ...state, state: 'half-open' } };
  }
  return { allowed: state.state !== 'open', probe: state.state === 'half-open', state };
}

export function reduceTradeCircuit(stateInput, event = {}, configInput = {}) {
  const config = { ...DEFAULT_CIRCUIT_CONFIG, ...configInput };
  const now = finiteNumber(event.at, Date.now());
  const state = createTradeCircuitState(stateInput);
  if (event.type === 'success') return createTradeCircuitState();
  if (event.type === 'reset') return createTradeCircuitState();
  if (event.type === 'tick') return tradeCircuitAvailability(state, now).state;
  if (event.type !== 'failure') return state;

  const classification = event.classification || classifyTradeError(event.error);
  if (classification.kind === 'rate-limit') return state;
  const windowStart = now - Math.max(1, finiteNumber(config.windowMs, DEFAULT_CIRCUIT_CONFIG.windowMs));
  const failureTimes = [...state.failureTimes.filter((time) => time >= windowStart), now];
  const threshold = Math.max(1, Math.floor(finiteNumber(config.failureThreshold, DEFAULT_CIRCUIT_CONFIG.failureThreshold)));
  if (classification.opensCircuit === true || state.state === 'half-open' || failureTimes.length >= threshold) {
    const cooldownMs = Math.max(1, finiteNumber(config.cooldownMs, DEFAULT_CIRCUIT_CONFIG.cooldownMs));
    const persistent = classification.persistent === true;
    return {
      state: 'open',
      failureTimes,
      openedAt: now,
      retryAt: persistent ? null : now + cooldownMs,
      reason: classification.kind || 'failure-threshold',
      persistent,
    };
  }
  return { ...state, state: 'closed', failureTimes };
}

export { errorCode as tradeErrorCode };
