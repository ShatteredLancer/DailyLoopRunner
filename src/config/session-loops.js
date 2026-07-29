export function materializeSessionLoopDefs(options = {}) {
  const configuredLoops = Array.isArray(options.configuredLoops) ? options.configuredLoops : [];
  const loopOverrides = options.loopOverrides || {};
  const discoveredLoops = Array.isArray(options.discoveredLoops) ? options.discoveredLoops : [];
  const result = configuredLoops.map((loop) => loopOverrides[loop?.id] || loop);
  const ids = new Set(result.map((loop) => loop?.id).filter(Boolean));
  for (const loop of discoveredLoops) {
    if (loop?.id && ids.has(loop.id)) continue;
    result.push(loop);
    if (loop?.id) ids.add(loop.id);
  }
  return result;
}

export function resolveSessionLoopByActivityFamily(loopDefs = [], family) {
  const normalizedFamily = String(family || '').trim();
  if (!normalizedFamily) return { status: 'unavailable', loop: null, matches: [] };
  const matches = (loopDefs || []).filter((loop) => (
    loop?.strategy === 'fillAndVerifySbc'
      && (String(loop.dynamicSbcFamily || '') === normalizedFamily
        || String(loop.activityBinding?.family || '') === normalizedFamily)
  ));
  if (matches.length === 1) return { status: 'resolved', loop: matches[0], matches };
  return { status: matches.length ? 'ambiguous' : 'unavailable', loop: null, matches };
}
