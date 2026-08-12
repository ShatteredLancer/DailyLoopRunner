import { normalizeTradeJob } from './contracts.js';
import {
  buildListingCandidatePool,
  buildListingPlan,
  listingQuoteCandidatePoolLimit,
} from './listing-plan.js';

export function createListingPreview(options = {}) {
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  if (typeof options.priceQuoteProvider?.load !== 'function') throw new TypeError('priceQuoteProvider.load is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();

  async function preview(input = {}, request = {}) {
    const timestamp = Number(now());
    const job = normalizeTradeJob({
      ...input,
      id: input.id || 'manual-listing-preview',
      name: input.name || 'Manual Listing Preview',
      type: 'listing',
      enabled: true,
      armed: false,
    }, { now: timestamp });
    const adapter = options.getTradeAdapter();
    const capabilities = adapter.inspectCapabilities();
    const scan = adapter.inspectListingCandidates({ sources: job.policy.sources, limit: 0 });
    const candidatePool = buildListingCandidatePool({
      job,
      candidates: scan.candidates,
      limit: listingQuoteCandidatePoolLimit(job.policy.maxListings),
    });
    const definitionIds = candidatePool.definitionIds;
    const quoteResult = job.policy.marketOverride.enabled && definitionIds.length
      ? await options.priceQuoteProvider.load({
        definitionIds,
        platform: request.platform || 'pc',
        provider: request.provider || 'auto',
        forceRefresh: request.forceRefresh === true,
      })
      : { quotes: [], source: null, attempts: [] };
    const plan = buildListingPlan({ job, candidatePool, quotes: quoteResult.quotes, now: timestamp });
    return {
      schemaVersion: 1,
      mode: 'preview-only',
      job,
      capabilities,
      scan: {
        capturedAt: scan.capturedAt,
        sources: scan.sources,
        counts: scan.counts,
        total: scan.total,
        returned: scan.returned,
        truncated: scan.truncated,
        error: scan.error,
      },
      quotes: {
        requested: job.policy.marketOverride.enabled ? definitionIds.length : 0,
        candidateDefinitions: definitionIds.length,
        candidatePoolSize: candidatePool.candidates.length,
        candidatePoolLimit: candidatePool.limit,
        candidatePoolTruncated: candidatePool.truncated,
        loaded: quoteResult.quotes.length,
        source: quoteResult.source,
        attempts: quoteResult.attempts,
      },
      plan,
    };
  }

  return Object.freeze({ preview });
}
