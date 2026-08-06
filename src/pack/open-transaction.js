import { createOpenPackReceipt } from '../domain/contracts.js';

export const DEFAULT_PACK_OPEN_RETRY_CODES = Object.freeze([
  '471',
  '500',
  '512',
  '521',
  'empty-result',
  'missing-items',
  'transport-error',
  'transport-timeout',
  'unknown',
]);

const AMBIGUOUS_PACK_OPEN_FAILURES = new Set([
  'empty-result',
  'missing-items',
  'transport-error',
  'transport-timeout',
  'unknown',
]);

function firstReason(values = []) {
  const value = values.find((entry) => entry !== undefined && entry !== null && String(entry).trim());
  return value === undefined ? null : String(value).trim();
}

export function packTransportFailureResult(error) {
  const message = error?.message || String(error || 'pack transport failed');
  const explicitCode = firstReason([error?.code, error?.statusCode, error?.status]);
  const code = explicitCode
    || (error?.name === 'AbortError' ? 'cancelled' : null)
    || (/timed out|timeout/i.test(message) ? 'transport-timeout' : 'transport-error');
  return { success: false, error: { code, message } };
}

export function openedPackItems(result) {
  const candidates = [
    result?.items,
    result?.response?.items,
    result?.data?.items,
    result?.response?.data?.items,
  ];
  return candidates.find(Array.isArray) || null;
}

export function packOpenFailureReason(result) {
  if (result === undefined || result === null) return 'empty-result';
  if ((result?.success === true || result?.response?.success === true) && !openedPackItems(result)) {
    return 'missing-items';
  }
  const reason = firstReason([
    result?.error?.code,
    result?.response?.error?.code,
    result?.data?.error?.code,
    result?.statusCode,
    result?.status,
    result?.code,
    result?.error?.message,
    result?.response?.error?.message,
    result?.message,
  ]);
  if (reason) return reason;
  return 'unknown';
}

export function isAmbiguousPackOpenFailure(code) {
  return AMBIGUOUS_PACK_OPEN_FAILURES.has(String(code ?? '').trim());
}

export async function openPackTransaction(options = {}) {
  const attempts = Math.max(1, Math.min(10, Number(options.retryPolicy?.attempts || 1) || 1));
  const retryCodes = new Set((options.retryPolicy?.retryCodes || []).map(String));
  let lastReason = null;

  if (options.dryRun === true) {
    const pack = await options.packSelector?.({ attempt: 1, lastReason: null, dryRun: true });
    if (!pack) {
      return createOpenPackReceipt({
        status: 'unavailable',
        reason: 'matching pack is unavailable',
        attempts: 0,
      });
    }
    const packRef = options.packRef ? options.packRef(pack) : { id: Number(pack.id || 0), name: String(pack.name || '') };
    return createOpenPackReceipt({
      status: 'planned',
      packRef,
      reason: 'dry run would open pack',
      attempts: 0,
    });
  }

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
    let result;
    try {
      result = await options.openTransport(pack, { attempt, packRef });
    } catch (error) {
      result = packTransportFailureResult(error);
    }
    const rawItems = openedPackItems(result);
    const succeeded = result?.success === true || result?.response?.success === true;
    if (succeeded && rawItems) {
      const normalized = options.normalizeItems
        ? await options.normalizeItems(rawItems, { pack, packRef, attempt, result })
        : rawItems;
      const openedItems = Array.isArray(normalized) ? normalized : normalized?.items || rawItems;
      const receiptItems = Array.isArray(normalized) ? normalized : normalized?.receiptItems || openedItems;
      if (typeof options.onItemsOpened === 'function') {
        try {
          Promise.resolve(options.onItemsOpened({
            pack,
            packRef,
            attempt,
            result,
            openedItems: receiptItems,
          })).catch((error) => options.onItemsOpenedError?.(error));
        } catch (error) {
          options.onItemsOpenedError?.(error);
        }
      }
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

    const code = packOpenFailureReason(result);
    lastReason = code;
    if (typeof options.onTransportFailure === 'function') {
      try { await options.onTransportFailure({ attempt, code, pack, packRef, result }); } catch { }
    }
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
