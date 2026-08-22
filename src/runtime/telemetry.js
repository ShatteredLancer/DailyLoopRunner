const MAX_COUNTER = 1000000;
const MAX_PHASE_LENGTH = 80;
const MAX_TIMESTAMP_LENGTH = 80;

function defaultSchedule(callback) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(callback, 0);
}

function defaultCancel(handle) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle);
}

function boundedInteger(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(MAX_COUNTER, Math.floor(number)));
}

function boundedText(value, fallback, maxLength) {
  if (value === null || value === undefined) return fallback;
  return String(value).slice(0, maxLength);
}

export function createRuntimeTelemetrySnapshot(input = {}, previous = null) {
  const prior = previous || {};
  const number = (key, fallback = null) => Object.hasOwn(input, key)
    ? boundedInteger(input[key], fallback)
    : boundedInteger(prior[key], fallback);
  return Object.freeze({
    visible: Object.hasOwn(input, 'visible') ? input.visible === true : prior.visible === true,
    phase: boundedText(input.phase, boundedText(prior.phase, '', MAX_PHASE_LENGTH), MAX_PHASE_LENGTH),
    completedCycles: number('completedCycles', 0),
    cycleLimit: number('cycleLimit', 0),
    specialSlots: number('specialSlots'),
    storagePressureSbcCount: number('storagePressureSbcCount'),
    provisionsBatches: number('provisionsBatches'),
    totwSbcCount: number('totwSbcCount'),
    storageUsed: number('storageUsed'),
    storageCapacity: number('storageCapacity'),
    inventoryVersion: number('inventoryVersion'),
    calculating: Object.hasOwn(input, 'calculating')
      ? input.calculating === true
      : prior.calculating === true,
    updatedAt: boundedText(
      input.updatedAt,
      boundedText(prior.updatedAt, '', MAX_TIMESTAMP_LENGTH),
      MAX_TIMESTAMP_LENGTH,
    ),
  });
}

function snapshotSignature(snapshot) {
  return JSON.stringify(snapshot);
}

export function createRuntimeTelemetryController(options = {}) {
  const schedule = options.schedule || defaultSchedule;
  const cancel = options.cancel || defaultCancel;
  const onSnapshot = options.onSnapshot || (() => {});
  let snapshot = createRuntimeTelemetrySnapshot(options.initialSnapshot);
  let pending = null;
  let handle = null;
  let destroyed = false;

  function flush() {
    handle = null;
    if (destroyed || !pending) return snapshot;
    const next = pending;
    pending = null;
    if (snapshotSignature(next) === snapshotSignature(snapshot)) return snapshot;
    snapshot = next;
    onSnapshot(snapshot);
    return snapshot;
  }

  function publish(update = {}) {
    if (destroyed) return snapshot;
    const next = createRuntimeTelemetrySnapshot(update, pending || snapshot);
    if (snapshotSignature(next) === snapshotSignature(pending || snapshot)) return next;
    pending = next;
    if (handle === null) handle = schedule(flush);
    return next;
  }

  function flushNow() {
    if (handle !== null) cancel(handle);
    handle = null;
    return flush();
  }

  function hide(update = {}) {
    return publish({ ...update, visible: false, calculating: false });
  }

  function destroy() {
    destroyed = true;
    if (handle !== null) cancel(handle);
    handle = null;
    pending = null;
  }

  return Object.freeze({
    destroy,
    flushNow,
    getSnapshot: () => pending || snapshot,
    hide,
    publish,
  });
}
