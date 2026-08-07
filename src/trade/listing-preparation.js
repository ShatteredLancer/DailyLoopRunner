import { applyListingPriceLimits, createListingConfirmation } from './listing-plan.js';

export function createListingPreparation(options = {}) {
  if (typeof options.listingPreview?.preview !== 'function') throw new TypeError('listingPreview.preview is required');
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();

  async function prepare(input = {}, request = {}) {
    const requestedMax = Math.max(1, Math.floor(Number(request.maxListings || input.policy?.maxListings || 1)));
    const previewInput = {
      ...input,
      policy: {
        ...(input.policy || {}),
        maxListings: requestedMax,
      },
    };
    const preview = await options.listingPreview.preview(previewInput, request);
    const adapter = options.getTradeAdapter();
    const blockers = [];
    const priceLimitChecks = [];
    const entries = [];
    const adjustedNames = [];
    if (preview.capabilities?.canTrade !== true) blockers.push({ reason: 'trade-capability-unavailable' });
    if (preview.scan?.error) blockers.push({ reason: 'candidate-scan-failed', detail: preview.scan.error.message });
    if (!preview.plan?.entries?.length) blockers.push({ reason: 'no-eligible-listing-candidates' });

    for (const entry of preview.plan?.entries || []) {
      const result = await adapter.inspectPriceLimits(entry.item, { refresh: true });
      const applied = applyListingPriceLimits(entry, result);
      priceLimitChecks.push({
        item: { ...entry.item },
        status: result.status,
        response: result.response,
        error: result.error,
        minimum: result.after?.minimum ?? null,
        maximum: result.after?.maximum ?? null,
        changed: applied.ok ? applied.changed : null,
      });
      if (!applied.ok) {
        blockers.push({ item: { ...entry.item }, reason: applied.reason });
        continue;
      }
      entries.push(applied.entry);
      if (applied.changed) adjustedNames.push(applied.entry.name);
    }

    const preparedAt = Number(now());
    const plan = {
      ...preview.plan,
      createdAt: preparedAt,
      entries,
      counts: {
        ...preview.plan.counts,
        selected: entries.length,
      },
      warnings: [
        ...(preview.plan.warnings || []).filter((warning) => !/price limits will be refreshed/i.test(warning)),
        ...adjustedNames.map((name) => `${name} listing prices were adjusted to EA limits`),
      ],
    };
    const ready = blockers.length === 0 && entries.length > 0;
    const confirmation = ready ? createListingConfirmation(plan, { now: preparedAt }) : null;
    return {
      ...preview,
      mode: 'prepared',
      preparedAt,
      ready,
      blockers,
      priceLimitChecks,
      plan,
      confirmation,
    };
  }

  return Object.freeze({ prepare });
}
