import { createOpenPackReceipt } from '../domain/contracts.js';

export async function openPackTransaction(options = {}) {
  const attempts = Math.max(1, Math.min(10, Number(options.retryPolicy?.attempts || 1) || 1));
  const retryCodes = new Set((options.retryPolicy?.retryCodes || []).map(String));
  let lastReason = null;

  if (options.preOpenResolver) {
    const preOpen = await options.preOpenResolver();
    if (preOpen?.status === 'blocked') {
      return createOpenPackReceipt({ status: 'blocked', reason: preOpen.reason || 'pre-open resolver blocked', attempts: 0 });
    }
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const pack = await options.packSelector?.({ attempt, lastReason });
    if (!pack) {
      return createOpenPackReceipt({
        status: attempt === 1 ? 'unavailable' : 'stale',
        reason: 'matching pack is unavailable',
        attempts: attempt - 1,
      });
    }
    const packRef = options.packRef ? options.packRef(pack) : { id: Number(pack.id || 0), name: String(pack.name || '') };
    const result = await options.openTransport(pack, { attempt, packRef });
    if (result?.success && Array.isArray(result?.items || result?.response?.items)) {
      const rawItems = result.items || result.response.items || [];
      const normalized = options.normalizeItems
        ? await options.normalizeItems(rawItems, { pack, packRef, attempt, result })
        : rawItems;
      const openedItems = Array.isArray(normalized) ? normalized : normalized?.items || rawItems;
      const receiptItems = Array.isArray(normalized) ? normalized : normalized?.receiptItems || openedItems;
      const policyResult = options.openedItemPolicy
        ? await options.openedItemPolicy(openedItems, { pack, packRef, attempt, result })
        : { pendingItemRefs: openedItems };
      return createOpenPackReceipt({
        status: 'opened',
        packRef,
        openedItems: receiptItems,
        reservedItemRefs: policyResult?.reservedItemRefs || [],
        routedItemRefs: policyResult?.routedItemRefs || [],
        pendingItemRefs: policyResult?.pendingItemRefs || [],
        attempts: attempt,
        details: policyResult?.details || {},
      });
    }

    const code = String(result?.error?.code || result?.status || 'unknown');
    lastReason = code;
    if (options.allowGone === true && code === '404') {
      if (options.onGone) await options.onGone(pack, { attempt, packRef, result });
      return createOpenPackReceipt({ status: 'stale', packRef, reason: '404', attempts: attempt });
    }
    if (!retryCodes.has(code) || attempt >= attempts) {
      return createOpenPackReceipt({ status: 'blocked', packRef, reason: code, attempts: attempt });
    }
    if (options.beforeRetry) await options.beforeRetry({ attempt, code, pack, packRef, result });
  }

  return createOpenPackReceipt({ status: 'blocked', reason: lastReason || 'open failed', attempts });
}
