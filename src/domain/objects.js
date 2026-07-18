export function cloneLoopDef(definition) {
  return JSON.parse(JSON.stringify(definition));
}

export function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
