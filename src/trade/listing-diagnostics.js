function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sanitizedListingArtifact(artifact) {
  if (!artifact) return null;
  const value = clone(artifact);
  if (value.confirmation) {
    value.confirmation = {
      createdAt: value.confirmation.createdAt,
      expiresAt: value.confirmation.expiresAt,
      itemCount: value.confirmation.itemCount,
      action: value.confirmation.action,
    };
  }
  return value;
}

function sanitizedError(error) {
  if (!error) return null;
  const value = {};
  for (const key of ['name', 'message', 'code', 'status', 'stack']) {
    if (error[key] !== undefined && error[key] !== null) value[key] = String(error[key]);
  }
  return Object.keys(value).length ? value : { message: String(error) };
}

export function createTradeListingDiagnostics(input = {}) {
  return {
    schemaVersion: 1,
    capturedAt: Math.max(0, Number(input.capturedAt ?? Date.now()) || 0),
    runner: {
      version: String(input.runnerVersion || 'unknown'),
      platform: String(input.platform || 'pc'),
      userAgent: String(input.userAgent || ''),
    },
    operation: {
      running: input.operation?.running === true,
      stopping: input.operation?.stopping === true,
      tradeListingRunning: input.operation?.tradeListingRunning === true,
    },
    circuit: clone(input.circuit) || null,
    journal: input.journal ? clone(input.journal) : null,
    job: clone(input.job) || null,
    preview: sanitizedListingArtifact(input.preview),
    prepared: sanitizedListingArtifact(input.prepared),
    clubValidation: clone(input.clubValidation) || null,
    receipt: clone(input.receipt) || null,
    error: sanitizedError(input.error),
  };
}
