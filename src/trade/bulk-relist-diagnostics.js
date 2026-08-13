function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sanitizedError(error) {
  if (!error) return null;
  const result = {};
  for (const key of ['name', 'message', 'code', 'status', 'stack']) {
    if (error[key] !== undefined && error[key] !== null) result[key] = String(error[key]);
  }
  return Object.keys(result).length ? result : { message: String(error) };
}

function sanitizedPreview(preview) {
  if (!preview) return null;
  const value = clone(preview);
  if (value.confirmation) {
    value.confirmation = {
      action: value.confirmation.action,
      createdAt: value.confirmation.createdAt,
      expiresAt: value.confirmation.expiresAt,
      itemCount: value.confirmation.itemCount,
    };
  }
  return value;
}

export const TRADE_BULK_RELIST_ELIGIBILITY_CONTRACT = 'expired-auction-v2';

export function createBulkRelistDiagnostics(input = {}) {
  return {
    schemaVersion: 1,
    eligibilityContract: TRADE_BULK_RELIST_ELIGIBILITY_CONTRACT,
    capturedAt: Math.max(0, Number(input.capturedAt ?? Date.now()) || 0),
    runner: {
      version: String(input.runnerVersion || 'unknown'),
      userAgent: String(input.userAgent || ''),
    },
    operation: clone(input.operation) || null,
    circuit: clone(input.circuit) || null,
    capabilities: clone(input.capabilities) || null,
    journal: clone(input.journal) || null,
    preview: sanitizedPreview(input.preview),
    receipt: clone(input.receipt) || null,
    error: sanitizedError(input.error),
  };
}
