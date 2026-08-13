import {
  bulkRelistSnapshotFingerprint,
  normalizeBulkRelistSnapshot,
} from './bulk-relist-snapshot.js';

export function createBulkRelistPreview(options = {}) {
  if (typeof options.getTradeAdapter !== 'function') throw new TypeError('getTradeAdapter is required');
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const createToken = typeof options.createToken === 'function'
    ? options.createToken
    : () => `bulk-relist-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const confirmationTtlMs = Math.max(5_000, Number(options.confirmationTtlMs || 2 * 60_000));

  async function preview(request = {}) {
    const adapter = request.tradeAdapter || options.getTradeAdapter({ pacingContext: request.pacingContext });
    const capabilities = adapter.inspectCapabilities();
    const transferRefresh = await adapter.refreshTransferItems({ wait: request.wait !== false });
    const snapshot = normalizeBulkRelistSnapshot(adapter.inspectBulkRelistSnapshot());
    const blockers = [];
    if (capabilities.canTrade !== true) blockers.push({ reason: 'trade-capability-unavailable' });
    if (capabilities.methods?.relistExpiredAuctions !== true) blockers.push({ reason: 'bulk-relist-capability-unavailable' });
    if (transferRefresh.status !== 'completed') blockers.push({
      reason: `bulk-relist-transfer-refresh-${transferRefresh.status || 'unavailable'}`,
      detail: transferRefresh.error?.kind || null,
    });
    if (snapshot.status !== 'loaded' || snapshot.error) blockers.push({ reason: 'bulk-relist-snapshot-unavailable' });
    if (snapshot.truncated) blockers.push({ reason: 'bulk-relist-snapshot-truncated' });
    const createdAt = Number(now());
    const ready = blockers.length === 0;
    return {
      schemaVersion: 1,
      mode: 'preview',
      ready,
      blockers,
      capabilities,
      transferRefresh,
      snapshot,
      confirmation: ready ? {
        token: createToken(),
        action: 'bulk-relist',
        createdAt,
        expiresAt: createdAt + confirmationTtlMs,
        itemCount: snapshot.unsoldCount,
        fingerprint: bulkRelistSnapshotFingerprint(snapshot),
      } : null,
    };
  }

  return Object.freeze({ preview });
}
