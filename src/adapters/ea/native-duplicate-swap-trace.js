const SENSITIVE_KEY = /(account|auth|cookie|email|persona|session|token|user)/i;
const RELEVANT_KEY = /(args|callback|club|controller|data|destination|discovered|duplicate|error|item|message|model|name|patched|pile|response|result|select|source|status|success|swap|unassigned|view)/i;
const ITEM_FIELDS = [
  'id', 'itemId', 'definitionId', 'resourceId', 'assetId', 'rating', 'rareflag', 'rareFlag',
  'pile', '_pile', 'duplicateId', 'duplicateSignalId', 'tradeable', 'tradable', 'untradeable',
];

function safeRead(value, key) {
  try { return value?.[key]; } catch { return undefined; }
}

function constructorName(value) {
  try { return String(value?.constructor?.name || typeof value); } catch { return typeof value; }
}

function scalar(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 160);
  return undefined;
}

function itemSnapshot(value) {
  const snapshot = {};
  for (const key of ITEM_FIELDS) {
    const normalized = scalar(safeRead(value, key));
    if (normalized !== undefined && normalized !== null && normalized !== '') snapshot[key] = normalized;
  }
  return snapshot;
}

function responseIdentityArray(value, key) {
  if (!Array.isArray(value)) return null;
  if (key === 'itemIds') {
    return value.slice(0, 40).map((entry) => scalar(entry));
  }
  if (key === 'clubDuplicates') {
    return value.slice(0, 40).map((entry) => {
      const primitive = scalar(entry);
      return primitive !== undefined ? primitive : itemSnapshot(entry);
    });
  }
  return null;
}

function boundedValue(value, options = {}, depth = 0, seen = new WeakSet()) {
  const primitive = scalar(value);
  if (primitive !== undefined) return primitive;
  if (typeof value === 'function') return `[function ${String(value.name || 'anonymous').slice(0, 80)}]`;
  if (!value || typeof value !== 'object') return `[${typeof value}]`;
  if (seen.has(value)) return '[circular]';

  const maxDepth = Math.max(1, Number(options.maxDepth || 3));
  const maxArray = Math.max(1, Number(options.maxArray || 20));
  if (depth >= maxDepth) return `[${constructorName(value)}]`;
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.slice(0, maxArray)
      .map((entry) => boundedValue(entry, options, depth + 1, seen));
    if (value.length > maxArray) result.push(`[+${value.length - maxArray} more]`);
    seen.delete(value);
    return result;
  }

  let keys = [];
  try { keys = Object.getOwnPropertyNames(value).slice(0, 80); } catch { }
  const result = {
    type: constructorName(value),
    keys: keys.filter((key) => !SENSITIVE_KEY.test(key)).slice(0, 40),
  };
  const identity = itemSnapshot(value);
  if (Object.keys(identity).length) result.item = identity;

  const values = {};
  for (const key of keys) {
    if (SENSITIVE_KEY.test(key) || !RELEVANT_KEY.test(key)) continue;
    const entry = safeRead(value, key);
    const identityArray = responseIdentityArray(entry, key);
    if (identityArray) {
      values[key] = identityArray;
      continue;
    }
    const entryScalar = scalar(entry);
    if (entryScalar !== undefined) values[key] = entryScalar;
    else if (entry && (Array.isArray(entry) || typeof entry === 'object')) {
      values[key] = boundedValue(entry, options, depth + 1, seen);
    }
    if (Object.keys(values).length >= 16) break;
  }
  if (Object.keys(values).length) result.values = values;
  seen.delete(value);
  return result;
}

function methodNames(value, predicate) {
  const result = [];
  const seen = new Set();
  let owner = value;
  for (let depth = 0; owner && owner !== Object.prototype && depth < 8; depth++) {
    let names = [];
    try { names = Object.getOwnPropertyNames(owner); } catch { }
    for (const name of names) {
      if (name === 'constructor' || seen.has(name) || !predicate(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(owner, name);
      if (typeof descriptor?.value !== 'function') continue;
      seen.add(name);
      result.push({ owner, name, descriptor });
    }
    try { owner = Object.getPrototypeOf(owner); } catch { owner = null; }
  }
  return result;
}

function traceMethodName(name) {
  return /(duplicate|swap|untradeable)/i.test(String(name || ''));
}

function controllerTypeName(value) {
  const name = constructorName(value);
  return /Unassigned.*Controller/i.test(name) ? name : null;
}

export function createNativeDuplicateSwapTrace(runtime, options = {}) {
  const maxEvents = Math.max(20, Math.min(1000, Number(options.maxEvents || 250)));
  const log = typeof options.log === 'function' ? options.log : () => {};
  let active = false;
  let sessionId = null;
  let startedAt = null;
  let stoppedAt = null;
  let events = [];
  let nextSequence = 1;
  const restorers = [];
  let patched = new WeakMap();

  function emit(method, phase, payload = null) {
    if (!active) return;
    const event = {
      sequence: nextSequence++,
      at: new Date().toISOString(),
      method: String(method || 'unknown').slice(0, 160),
      phase: String(phase || 'unknown').slice(0, 80),
      payload: boundedValue(payload, { maxDepth: 4, maxArray: 24 }),
    };
    events.push(event);
    if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
    try { log(`Native duplicate swap trace ${JSON.stringify(event)}`); } catch { }
  }

  function markPatched(owner, name) {
    let names = patched.get(owner);
    if (!names) {
      names = new Set();
      patched.set(owner, names);
    }
    if (names.has(name)) return false;
    names.add(name);
    return true;
  }

  function instrumentObservable(observable, method) {
    if (!observable || typeof observable !== 'object' || typeof observable.observe !== 'function') return;
    if (!markPatched(observable, 'observe')) return;
    const ownDescriptor = Object.getOwnPropertyDescriptor(observable, 'observe');
    const original = observable.observe;
    const wrapper = function (...args) {
      const tracedArgs = [...args];
      const callbackIndex = tracedArgs.findIndex((entry) => typeof entry === 'function');
      if (callbackIndex >= 0) {
        const callback = tracedArgs[callbackIndex];
        tracedArgs[callbackIndex] = function (...callbackArgs) {
          emit(method, 'observable-result', { args: callbackArgs });
          return Reflect.apply(callback, this, callbackArgs);
        };
      }
      emit(method, 'observe', { controller: tracedArgs[0], callbackIndex });
      return Reflect.apply(original, this, tracedArgs);
    };
    try {
      Object.defineProperty(observable, 'observe', {
        configurable: true,
        enumerable: ownDescriptor?.enumerable === true,
        writable: true,
        value: wrapper,
      });
    } catch {
      return;
    }
    restorers.push(() => {
      try {
        if (observable.observe !== wrapper) return;
        if (ownDescriptor) Object.defineProperty(observable, 'observe', ownDescriptor);
        else delete observable.observe;
      } catch { }
    });
  }

  function patchMethod(owner, name, descriptor, label) {
    if (!owner || !markPatched(owner, name)) return false;
    const original = descriptor.value;
    const wrapper = function (...args) {
      emit(label, 'call', { thisValue: this, args });
      try {
        const result = Reflect.apply(original, this, args);
        instrumentObservable(result, label);
        emit(label, 'return', { result });
        return result;
      } catch (error) {
        emit(label, 'throw', {
          error: {
            name: String(error?.name || 'Error').slice(0, 80),
            message: String(error?.message || error).slice(0, 240),
          },
        });
        throw error;
      }
    };
    try {
      Object.defineProperty(owner, name, { ...descriptor, value: wrapper });
    } catch {
      return false;
    }
    restorers.push(() => {
      try {
        const current = Object.getOwnPropertyDescriptor(owner, name);
        if (current?.value === wrapper) Object.defineProperty(owner, name, descriptor);
      } catch { }
    });
    return true;
  }

  function patchItemService(discovered) {
    const service = runtime?.services?.Item;
    if (!service) return;
    for (const entry of methodNames(service, (name) => name === 'move' || traceMethodName(name))) {
      const label = `ItemService.${entry.name}`;
      if (patchMethod(entry.owner, entry.name, entry.descriptor, label)) discovered.push(label);
    }
  }

  function controllerCandidates() {
    const candidates = [];
    const seen = new Set();
    const add = (value, label) => {
      if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
      seen.add(value);
      candidates.push({ value, label });
    };

    const constructorNames = ['UTUnassignedItemsViewController'];
    for (const name of constructorNames) add(runtime?.[name]?.prototype, name);
    try {
      const current = options.currentController?.();
      if (current && controllerTypeName(current)) add(current, controllerTypeName(current));
    } catch { }
    let globalNames = [];
    try { globalNames = Object.getOwnPropertyNames(runtime).slice(0, 5000); } catch { }
    for (const name of globalNames) {
      if (!/Unassigned.*Controller/i.test(name) || SENSITIVE_KEY.test(name)) continue;
      const candidate = safeRead(runtime, name);
      add(typeof candidate === 'function' ? candidate.prototype : candidate, name);
    }
    return candidates;
  }

  function patchControllers(discovered) {
    for (const candidate of controllerCandidates()) {
      for (const entry of methodNames(candidate.value, traceMethodName)) {
        const label = `${candidate.label}.${entry.name}`;
        if (patchMethod(entry.owner, entry.name, entry.descriptor, label)) discovered.push(label);
      }
    }
  }

  function snapshot() {
    return JSON.parse(JSON.stringify({
      schemaVersion: 1,
      active,
      sessionId,
      startedAt,
      stoppedAt,
      eventCount: events.length,
      events,
    }));
  }

  function start() {
    if (active) return snapshot();
    patched = new WeakMap();
    active = true;
    sessionId = `native-duplicate-swap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    startedAt = new Date().toISOString();
    stoppedAt = null;
    events = [];
    nextSequence = 1;
    const discovered = [];
    patchItemService(discovered);
    patchControllers(discovered);
    emit('trace', 'started', { discovered });
    return snapshot();
  }

  function stop() {
    if (!active) return snapshot();
    emit('trace', 'stopping', { patchedCount: restorers.length });
    while (restorers.length) {
      const restore = restorers.pop();
      try { restore(); } catch { }
    }
    patched = new WeakMap();
    stoppedAt = new Date().toISOString();
    active = false;
    try { log(`Native duplicate swap trace stopped: ${events.length} bounded event(s), session ${sessionId}`); } catch { }
    return snapshot();
  }

  return Object.freeze({ get: snapshot, start, stop });
}
