import { normalizeTradeJob } from './contracts.js';
import { buildBuyLanePlan } from './buy-plan.js';

export function createBuyPreview(options = {}) {
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  if (typeof options.playerCatalogProvider?.load !== 'function') throw new TypeError('playerCatalogProvider.load is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();

  async function preview(input = {}, request = {}) {
    const timestamp = Number(now());
    const job = normalizeTradeJob({
      ...input,
      id: input.id || 'manual-buy-preview',
      name: input.name || 'Manual Buy Preview',
      type: 'buy',
      enabled: true,
      armed: false,
    }, { now: timestamp });
    const catalog = await options.playerCatalogProvider.load({
      ratingMin: job.policy.ratingMin,
      ratingMax: job.policy.ratingMax,
      platform: request.platform || 'pc',
      forceRefresh: request.forceRefresh === true,
    });
    const plan = buildBuyLanePlan({ job, catalog, runId: `preview:${job.id}:${timestamp}` });
    return {
      schemaVersion: 1,
      mode: 'preview-only',
      liveExecutionAllowed: false,
      job,
      capabilities: options.getTradeAdapter().inspectCapabilities(),
      catalog: {
        ok: catalog.ok === true,
        platform: String(catalog.platform || request.platform || 'pc'),
        ratings: [...(catalog.ratings || [])],
        missingRatings: [...(catalog.missingRatings || [])],
        attempts: (catalog.attempts || []).map((attempt) => ({ ...attempt })),
      },
      plan,
      summary: {
        ratings: plan.lanes.length,
        definitions: plan.lanes.reduce((sum, lane) => sum + lane.definitionIds.length, 0),
        missingRatings: plan.missingRatings.length,
        maxQuantity: Number(job.policy.quantity),
        totalBudget: Number(job.policy.totalBudget),
      },
    };
  }

  return Object.freeze({ preview });
}
