const MAX_CACHE_ENTRIES = 16;

function readinessValue(entries, predicate) {
  return entries.filter(({ classification }) => !classification.protected && predicate(classification)).length;
}

export function createInventoryCapabilityCalculator(options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const measureTime = options.measureTime || (() => Date.now());
  let cacheByLedger = new WeakMap();

  async function calculate(input = {}) {
    const ledger = input.ledger;
    if (!ledger) throw new TypeError('ledger is required');
    const summary = ledger.summary();
    const policyKey = String(input.policyKey || 'default');
    const cache = cacheByLedger.get(ledger) || new Map();
    cacheByLedger.set(ledger, cache);
    const cacheKey = `${summary.inventoryVersion}:${policyKey}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const calculation = (async () => {
      const startedAt = measureTime();
      const entries = ledger.classifiedEntries();
      const unknownRequiredSpecial = entries.some(({ item, classification }) => (
        item.special === true && classification.requiredSpecial === null
      ));
      const specialSlots = unknownRequiredSpecial
        ? null
        : readinessValue(entries, (classification) => classification.requiredSpecial === true);
      const provisionsRequiredCount = Math.max(1, Number(input.provisionsRequiredCount || 4) || 4);
      const provisionsEligible = readinessValue(entries, (classification) => classification.provisionsReserve === true);
      const storage = summary.capacities.storage || {};
      return Object.freeze({
        inventoryVersion: summary.inventoryVersion,
        specialSlots,
        provisionsBatches: Math.floor(provisionsEligible / provisionsRequiredCount),
        storageUsed: Number.isFinite(Number(storage.used)) ? Number(storage.used) : null,
        storageCapacity: storage.max !== undefined && storage.max !== null && Number.isFinite(Number(storage.max))
          ? Number(storage.max)
          : null,
        calculating: false,
        updatedAt: String(now()),
        diagnostics: Object.freeze({
          elapsedMs: Math.max(0, Number(measureTime() - startedAt) || 0),
          directReason: 'exact squad count is disabled in live telemetry to avoid running the full rating solver',
          directLimited: false,
          totwReason: 'exact recovery count is disabled in live telemetry to avoid running the full rating solver',
          totwLimited: false,
          provisionsEligible,
          requiredSpecialUnknown: unknownRequiredSpecial,
        }),
      });
    })();
    cache.set(cacheKey, calculation);
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    try {
      const result = await calculation;
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      cache.delete(cacheKey);
      throw error;
    }
  }

  return Object.freeze({ calculate, clear: () => { cacheByLedger = new WeakMap(); } });
}
