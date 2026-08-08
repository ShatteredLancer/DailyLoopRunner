const WRITE_OPERATIONS = new Set(['loop', 'batch-open', 'trade-listing', 'trade-buy', 'dynamic-sbc-live-scan']);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeOperation(input = {}) {
  if (!input || !input.id || !input.type) return null;
  return {
    id: String(input.id),
    type: String(input.type),
    label: String(input.label || input.type),
    ownerId: String(input.ownerId || ''),
    startedAt: Math.max(0, finiteNumber(input.startedAt)),
    write: input.write !== false,
  };
}

export function createOperationCoordinator(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const externalBusy = typeof options.externalBusy === 'function' ? options.externalBusy : () => null;
  let active = null;

  function inspect() {
    const external = externalBusy();
    return {
      active: normalizeOperation(active),
      external: external ? {
        busy: external.busy === true,
        type: external.type ? String(external.type) : null,
        reason: external.reason ? String(external.reason) : null,
      } : { busy: false, type: null, reason: null },
    };
  }

  function acquire(input = {}) {
    const operation = normalizeOperation({
      ...input,
      write: input.write !== false,
      startedAt: now(),
      id: input.id || `${input.type || 'operation'}-${now()}`,
    });
    if (!operation) return { acquired: false, reason: 'invalid-operation', operation: null };
    const state = inspect();
    if (state.active) return { acquired: false, reason: 'operation-active', operation: state.active };
    if (operation.write && state.external.busy) {
      return { acquired: false, reason: state.external.reason || 'external-operation-active', operation: null, external: state.external };
    }
    active = operation;
    return { acquired: true, reason: null, operation: normalizeOperation(active) };
  }

  function release(operationId) {
    if (!active || active.id !== String(operationId || '')) return false;
    active = null;
    return true;
  }

  function availability(type, optionsInput = {}) {
    const state = inspect();
    const write = optionsInput.write !== false || WRITE_OPERATIONS.has(String(type || ''));
    if (state.active) return { allowed: false, reason: 'operation-active', state };
    if (write && state.external.busy) return { allowed: false, reason: state.external.reason || 'external-operation-active', state };
    return { allowed: true, reason: null, state };
  }

  return Object.freeze({ acquire, availability, inspect, release });
}

export { WRITE_OPERATIONS as TRADE_WRITE_OPERATIONS };
