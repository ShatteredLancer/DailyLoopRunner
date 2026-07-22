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
