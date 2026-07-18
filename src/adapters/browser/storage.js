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

  return Object.freeze({ get, set, remove, getJson, setJson });
}
