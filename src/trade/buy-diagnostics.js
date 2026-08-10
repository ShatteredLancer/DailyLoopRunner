function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeError(error) {
  if (!error) return null;
  const value = {};
  for (const key of ['name', 'message', 'code', 'status', 'stack']) {
    if (error[key] !== undefined && error[key] !== null) value[key] = String(error[key]);
  }
  return Object.keys(value).length ? value : { message: String(error) };
}

function safeRef(item) {
  if (!item) return null;
  return {
    id: safeNumber(item.id),
    definitionId: safeNumber(item.definitionId),
    pile: String(item.pile || 'unknown'),
  };
}

function safeExpectedDestination(value) {
  return ['auto', 'club', 'transfer'].includes(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : null;
}

export function sanitizeTradeBuyReceipt(receipt) {
  if (!receipt) return null;
  return {
    schemaVersion: safeNumber(receipt.schemaVersion),
    runId: String(receipt.runId || ''),
    jobId: String(receipt.jobId || ''),
    jobType: String(receipt.jobType || ''),
    scheduledFor: safeNumber(receipt.scheduledFor),
    startedAt: safeNumber(receipt.startedAt),
    finishedAt: safeNumber(receipt.finishedAt),
    status: String(receipt.status || 'unknown'),
    reason: receipt.reason ? String(receipt.reason) : null,
    requested: Math.max(0, Number(receipt.requested || 0) || 0),
    succeeded: Math.max(0, Number(receipt.succeeded || 0) || 0),
    failed: Math.max(0, Number(receipt.failed || 0) || 0),
    skipped: Math.max(0, Number(receipt.skipped || 0) || 0),
    coinsBefore: safeNumber(receipt.coinsBefore),
    coinsAfter: safeNumber(receipt.coinsAfter),
    receipts: (receipt.receipts || []).map((entry) => ({
      index: Math.max(0, Number(entry.index || 0) || 0),
      status: String(entry.status || 'unknown'),
      reason: entry.reason ? String(entry.reason) : null,
      item: safeRef(entry.item),
      tradeId: safeNumber(entry.tradeId),
      rating: safeNumber(entry.rating),
      price: safeNumber(entry.price),
      priceLimit: safeNumber(entry.priceLimit),
      coinsBefore: safeNumber(entry.coinsBefore),
      coinsAfter: safeNumber(entry.coinsAfter),
      destination: entry.destination ? String(entry.destination) : null,
      searches: safeNumber(entry.searches),
      buyAttempts: safeNumber(entry.buyAttempts),
      spent: safeNumber(entry.spent),
      expectedDestination: entry.expectedDestination ? String(entry.expectedDestination) : null,
      minimumRetainedCoins: safeNumber(entry.minimumRetainedCoins),
      search: entry.search ? {
        rating: safeNumber(entry.search.rating),
        definitionId: safeNumber(entry.search.definitionId),
        maxBuyNow: safeNumber(entry.search.maxBuyNow),
      } : null,
    })),
  };
}

export function createTradeBuyDiagnostics(input = {}) {
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
      tradeBuyRunning: input.operation?.tradeBuyRunning === true,
    },
    circuit: input.circuit ? JSON.parse(JSON.stringify(input.circuit)) : null,
    validation: {
      expectedDestination: safeExpectedDestination(
        input.expectedDestination ?? input.preview?.validationDestination?.expected,
      ),
    },
    job: input.job ? JSON.parse(JSON.stringify(input.job)) : null,
    preview: input.preview ? JSON.parse(JSON.stringify(input.preview)) : null,
    journal: input.journal ? {
      schemaVersion: safeNumber(input.journal.schemaVersion),
      runId: String(input.journal.runId || ''),
      jobId: String(input.journal.jobId || ''),
      expectedDestination: safeExpectedDestination(input.journal.expectedDestination),
      status: String(input.journal.status || 'unknown'),
      phase: String(input.journal.phase || 'unknown'),
      startedAt: safeNumber(input.journal.startedAt),
      updatedAt: safeNumber(input.journal.updatedAt),
      events: (input.journal.events || []).map((entry) => ({
        at: safeNumber(entry.at),
        phase: String(entry.phase || 'unknown'),
        status: entry.status ? String(entry.status) : null,
        reason: entry.reason ? String(entry.reason).slice(0, 160) : null,
        destination: entry.destination ? String(entry.destination) : null,
        item: safeRef(entry.item),
        tradeId: safeNumber(entry.tradeId),
        price: safeNumber(entry.price),
        search: entry.search ? {
          rating: safeNumber(entry.search.rating),
          definitionId: safeNumber(entry.search.definitionId),
          maxBuyNow: safeNumber(entry.search.maxBuyNow),
          page: safeNumber(entry.search.page),
        } : null,
        response: entry.response ? {
          success: entry.response.success === true,
          status: safeNumber(entry.response.status),
          code: safeNumber(entry.response.code),
        } : null,
      })),
    } : null,
    receipt: sanitizeTradeBuyReceipt(input.receipt),
    error: safeError(input.error),
  };
}
