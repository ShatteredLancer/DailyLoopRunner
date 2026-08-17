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

function packOpenItemArrays(result) {
  return [
    ['items', result?.items],
    ['response.items', result?.response?.items],
    ['data.items', result?.data?.items],
    ['response.data.items', result?.response?.data?.items],
  ].filter(([, value]) => Array.isArray(value));
}

export function openedPackItems(result) {
  const candidates = packOpenItemArrays(result);
  return candidates.find(([, items]) => items.length > 0)?.[1] || candidates[0]?.[1] || null;
}

export function capturePackOpenResultEvidence(result) {
  const candidates = packOpenItemArrays(result);
  const selected = candidates.find(([, items]) => items.length > 0) || candidates[0] || null;
  const items = selected?.[1] || [];
  return {
    transportSucceeded: result?.success === true || result?.response?.success === true,
    status: result?.status ?? result?.statusCode ?? result?.response?.status ?? null,
    errorCode: result?.error?.code ?? result?.response?.error?.code ?? result?.data?.error?.code ?? null,
    selectedSource: selected?.[0] || null,
    selectedItemCount: items.length,
    itemArrays: candidates.map(([source, value]) => ({ source, count: value.length })),
    itemSample: items.slice(0, 20).map((item) => ({
      id: Number(item?.id ?? item?.itemId ?? 0) || null,
      definitionId: Number(item?.definitionId ?? item?.defId ?? 0) || null,
      rating: Number(item?.rating ?? item?._data?.rating ?? 0) || null,
      duplicateId: Number(item?.duplicateId ?? item?._data?.duplicateId ?? 0) || 0,
    })),
  };
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

async function publishReceipt(options, receipt, context = {}) {
  if (typeof options.onReceipt !== 'function') return receipt;
  try {
    await options.onReceipt(receipt, context);
  } catch (error) {
    try { await options.onReceiptError?.(error, { receipt, context }); } catch { }
  }
  return receipt;
}

export async function openPackTransaction(options = {}) {
  const attempts = Math.max(1, Math.min(10, Number(options.retryPolicy?.attempts || 1) || 1));
  const retryCodes = new Set((options.retryPolicy?.retryCodes || []).map(String));
  let lastReason = null;

  if (options.dryRun === true) {
    const pack = await options.packSelector?.({ attempt: 1, lastReason: null, dryRun: true });
    if (!pack) {
      return publishReceipt(options, createOpenPackReceipt({
        status: 'unavailable',
        reason: 'matching pack is unavailable',
        attempts: 0,
      }), { phase: 'selection', dryRun: true });
    }
    const packRef = options.packRef ? options.packRef(pack) : { id: Number(pack.id || 0), name: String(pack.name || '') };
    return publishReceipt(options, createOpenPackReceipt({
      status: 'planned',
      packRef,
      reason: 'dry run would open pack',
      attempts: 0,
    }), { phase: 'dry-run', dryRun: true });
  }

  if (options.preOpenResolver) {
    const preOpen = await options.preOpenResolver();
    if (preOpen?.status === 'blocked') {
      const reasonCode = preOpen.reasonCode || preOpen.code || preOpen.details?.reasonCode || null;
      return publishReceipt(options, createOpenPackReceipt({
        status: 'blocked',
        reason: preOpen.reason || 'pre-open resolver blocked',
        attempts: 0,
        details: {
          ...(preOpen.details || {}),
          phase: 'pre-open',
          ...(reasonCode ? { reasonCode } : {}),
        },
      }), { phase: 'pre-open' });
    }
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const pack = await options.packSelector?.({ attempt, lastReason });
    if (!pack) {
      const unavailable = await options.packUnavailableResult?.({ attempt, lastReason });
      return publishReceipt(options, createOpenPackReceipt({
        ...(unavailable || {}),
        status: unavailable?.status || (attempt === 1 ? 'unavailable' : 'stale'),
        reason: unavailable?.reason || 'matching pack is unavailable',
        attempts: attempt - 1,
      }), { phase: 'selection', attempt });
    }
    const packRef = options.packRef ? options.packRef(pack) : { id: Number(pack.id || 0), name: String(pack.name || '') };
    let result;
    try {
      result = await options.openTransport(pack, { attempt, packRef });
    } catch (error) {
      result = packTransportFailureResult(error);
    }
    const evidence = capturePackOpenResultEvidence(result);
    const rawItems = openedPackItems(result);
    const committedWithItems = !evidence.transportSucceeded && Boolean(rawItems?.length);
    if ((evidence.transportSucceeded && rawItems) || committedWithItems) {
      const transportWarning = committedWithItems
        ? {
            code: packOpenFailureReason(result),
            itemSource: evidence.selectedSource,
            itemCount: evidence.selectedItemCount,
          }
        : null;
      if (transportWarning && typeof options.onCommittedTransportFailure === 'function') {
        try {
          await options.onCommittedTransportFailure({
            attempt,
            code: transportWarning.code,
            pack,
            packRef,
            result,
            itemCount: transportWarning.itemCount,
            itemSource: transportWarning.itemSource,
            evidence,
          });
        } catch { }
      }
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
      return publishReceipt(options, createOpenPackReceipt({
        status: 'opened',
        packRef,
        openedItems: receiptItems,
        reservedItemRefs: policyResult?.reservedItemRefs || [],
        routedItemRefs: policyResult?.routedItemRefs || [],
        pendingItemRefs: policyResult?.pendingItemRefs || [],
        attempts: attempt,
        details: {
          ...(policyResult?.details || {}),
          ...(transportWarning ? { transportWarning } : {}),
        },
      }), { phase: 'opened', attempt, packRef });
    }

    const code = packOpenFailureReason(result);
    lastReason = code;
    if (typeof options.onTransportFailure === 'function') {
      try { await options.onTransportFailure({ attempt, code, pack, packRef, result }); } catch { }
    }
    if (options.allowGone === true && code === '404') {
      if (options.onGone) await options.onGone(pack, { attempt, packRef, result });
      return publishReceipt(options, createOpenPackReceipt({ status: 'stale', packRef, reason: '404', attempts: attempt }), { phase: 'transport', attempt, packRef, code });
    }
    if (!retryCodes.has(code) || attempt >= attempts) {
      return publishReceipt(options, createOpenPackReceipt({ status: 'blocked', packRef, reason: code, attempts: attempt }), { phase: 'transport', attempt, packRef, code });
    }
    if (options.beforeRetry) await options.beforeRetry({ attempt, code, pack, packRef, result });
  }

  return publishReceipt(options, createOpenPackReceipt({ status: 'blocked', reason: lastReason || 'open failed', attempts }), { phase: 'transport', code: lastReason });
}
