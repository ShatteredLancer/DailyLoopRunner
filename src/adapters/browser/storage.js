export function createStorageAdapter(storage) {
  if (!storage) throw new Error('Browser storage is unavailable');

  function get(key, fallback = null) {
    const value = storage.getItem(String(key));
    return value === null ? fallback : value;
  }

  function set(key, value) {
    storage.setItem(String(key), String(value));
  }

  function remove(key) {
    storage.removeItem(String(key));
  }

  function getJson(key, fallback = null) {
    const value = get(key, null);
    if (value === null) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function setJson(key, value) {
    set(key, JSON.stringify(value));
  }

  function entries(limit = 250) {
    const result = [];
    const max = Math.max(0, Math.min(1000, Number(limit) || 0));
    let length = 0;
    try { length = Number(storage.length || 0); } catch { }
    for (let index = 0; index < Math.min(length, max); index++) {
      try {
        const key = storage.key(index);
        if (key === null || key === undefined) continue;
        result.push([String(key), storage.getItem(key)]);
      } catch { }
    }
    return result;
  }

  return Object.freeze({ get, set, remove, getJson, setJson, entries });
}

export function createUserscriptStorageAdapter(options = {}) {
  const getValue = options.getValue;
  const setValue = options.setValue;
  const deleteValue = options.deleteValue;

  function get(key, fallback = null) {
    if (typeof getValue !== 'function') return fallback;
    try { return getValue(String(key), fallback); } catch { return fallback; }
  }

  function set(key, value) {
    if (typeof setValue !== 'function') throw new Error('Userscript storage is unavailable');
    setValue(String(key), value);
  }

  function remove(key) {
    if (typeof deleteValue !== 'function') return false;
    deleteValue(String(key));
    return true;
  }

  return Object.freeze({ get, set, remove });
}
