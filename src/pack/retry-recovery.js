import {
  PACK_OPEN_RESPONSE_LOST,
  PACK_OPEN_RESULT_AMBIGUOUS,
} from './retry-reconciliation.js';

function normalizedCode(value) {
  return String(value ?? '').trim();
}

export function shouldDiscardFailedPack(code) {
  return normalizedCode(code) === '471';
}

function inspectionItems(inspection) {
  return Array.isArray(inspection?.items) ? inspection.items : [];
}

function inspectionSummary(inspection = {}) {
  return {
    source: String(inspection.source || 'unknown'),
    verified: inspection.verified === true,
    pendingCount: inspectionItems(inspection).length,
    pendingItemIds: inspectionItems(inspection)
      .map((item) => Number(item?.id || item?.itemId || 0))
      .filter(Boolean),
    details: inspection.details || null,
  };
}

async function inspectFreshUnassigned(options, label) {
  if (typeof options.inspectFreshUnassigned !== 'function') {
    return { verified: false, source: 'fresh-api-unavailable', items: [] };
  }
  try {
    const inspection = await options.inspectFreshUnassigned();
    return {
      ...(inspection || {}),
      verified: inspection?.verified === true,
      source: String(inspection?.source || 'fresh-purchased-api'),
      items: inspectionItems(inspection),
    };
  } catch (error) {
    options.log?.(`${label}: fresh Purchased/Unassigned API inspection failed: ${error?.message || error}`);
    return {
      verified: false,
      source: 'fresh-purchased-api',
      items: [],
      details: { error: error?.message || String(error) },
    };
  }
}

async function resolvePendingInspection(options, inspection, base) {
  const evidence = inspectionSummary(inspection);
  options.log?.(`${base.label}: ${evidence.source} found ${evidence.pendingCount} pending item(s); blocking another pack open`);
  try {
    const resolution = await options.resolveUnassigned?.();
    evidence.resolutionStatus = resolution?.status || null;
  } catch (error) {
    evidence.resolveError = error?.message || String(error);
  }
  const resultBase = { ...base };
  delete resultBase.label;
  return {
    ...resultBase,
    status: 'blocked',
    reason: PACK_OPEN_RESPONSE_LOST,
    details: { reasonCode: PACK_OPEN_RESPONSE_LOST, unassignedEvidence: evidence },
  };
}

async function tryResolveKnownPendingItems(options, inspection, base) {
  if (typeof options.resolvePendingItems !== 'function') return null;
  const evidence = inspectionSummary(inspection);
  let resolution;
  try {
    resolution = await options.resolvePendingItems({
      inspection,
      items: inspectionItems(inspection),
      evidence,
    });
  } catch (error) {
    options.log?.(`${base.label}: pending-item retry recovery failed: ${error?.message || error}`);
    return null;
  }
  if (!resolution || resolution.status === 'unhandled') return null;
  if (resolution.status === 'deferred' || resolution.status === 'replan') {
    return {
      status: 'deferred',
      reason: resolution.reason || 'known pending items must be routed before retrying the pack open',
      reasonCode: resolution.reasonCode || 'PACK_OPEN_RETRY_DEFERRED',
      details: resolution.details || null,
    };
  }
  if (resolution.status !== 'resolved') {
    const resultBase = { ...base };
    delete resultBase.label;
    const reasonCode = resolution.reasonCode || PACK_OPEN_RESULT_AMBIGUOUS;
    return {
      ...resultBase,
      status: 'blocked',
      reason: reasonCode,
      details: {
        reasonCode,
        pendingItemReason: resolution.reason || null,
        unassignedEvidence: evidence,
      },
    };
  }

  const refreshed = await inspectFreshUnassigned(options, base.label);
  const refreshedEvidence = inspectionSummary(refreshed);
  if (!refreshed.verified || refreshedEvidence.pendingCount > 0) {
    options.log?.(`${base.label}: known pending item recovery did not produce verified empty Unassigned state`);
    return resolvePendingInspection(options, refreshed, base);
  }
  options.log?.(`${base.label}: resolved ${evidence.pendingCount} known pending item(s); continuing bounded pack retry`);
  return {
    status: 'resolved',
    inspection: refreshed,
    resetRetryBaseline: true,
    details: resolution.details || null,
  };
}

export async function recoverPackOpenRetry(options = {}) {
  const label = String(options.label || 'Pack open');
  const code = normalizedCode(options.code) || 'unknown';
  const pack = options.pack || null;
  const packId = Number(pack?.id ?? pack?.packId ?? pack?.packDefinitionId ?? pack?.packAssetId ?? 0) || null;
  const log = typeof options.log === 'function' ? options.log : () => {};
  const discardOnRetry = shouldDiscardFailedPack(code);
  let discarded = false;
  const discardFailedPack = () => {
    if (!discardOnRetry || discarded) return;
    options.markFailedPack?.(pack);
    discarded = true;
    log(`${label}: excluding failed pack instance${packId ? ` #${packId}` : ''} before retry`);
  };

  log(`${label}: pack open returned ${code}; synchronizing navigation and pack cache before retry`);
  log(`${label}: checking Purchased/Unassigned state before any retry`);

  await options.sleep?.(Math.max(0, Number(options.pauseMs || 0)));
  const base = { code, discarded: false, storeRefreshed: false };
  const freshInspection = await inspectFreshUnassigned(options, label);
  let stateEvidence = freshInspection.verified ? freshInspection : null;
  if (freshInspection.verified) {
    const evidence = inspectionSummary(freshInspection);
    log(`${label}: fresh ${evidence.source} verified ${evidence.pendingCount} pending item(s)`);
    if (evidence.pendingCount > 0) {
      const knownPending = await tryResolveKnownPendingItems(
        options,
        freshInspection,
        { ...base, label },
      );
      if (knownPending?.status === 'blocked') {
        discardFailedPack();
        return { ...knownPending, discarded };
      }
      if (knownPending?.status === 'deferred') {
        log(`${label}: keeping the unopened pack instance eligible while known pending items are routed`);
        return { ...base, ...knownPending, discarded: false };
      }
      if (knownPending?.status === 'resolved') {
        stateEvidence = knownPending.inspection;
        base.resetRetryBaseline = knownPending.resetRetryBaseline === true;
      } else {
        discardFailedPack();
        base.discarded = discarded;
        return resolvePendingInspection(options, freshInspection, { ...base, label });
      }
    }
  }

  await options.unwind?.();
  if (!stateEvidence && typeof options.showUnassigned === 'function') {
    try {
      const pageItems = await options.showUnassigned();
      stateEvidence = {
        verified: true,
        source: 'confirmed-unassigned-page',
        items: Array.isArray(pageItems) ? pageItems : [],
      };
    } catch (error) {
      log(`${label}: Unassigned page confirmation failed: ${error?.message || error}`);
    }
  }
  if (!stateEvidence) {
    discardFailedPack();
    base.discarded = discarded;
    return {
      ...base,
      status: 'blocked',
      reason: PACK_OPEN_RESULT_AMBIGUOUS,
      details: {
        reasonCode: PACK_OPEN_RESULT_AMBIGUOUS,
        unassignedEvidence: inspectionSummary(freshInspection),
      },
    };
  }
  if (stateEvidence && inspectionItems(stateEvidence).length > 0) {
    discardFailedPack();
    base.discarded = discarded;
    return resolvePendingInspection(options, stateEvidence, { ...base, label });
  }

  discardFailedPack();
  base.discarded = discarded;
  let storeRefreshed = false;
  try {
    storeRefreshed = await options.openStorePacks?.() === true;
  } catch (error) {
    log(`${label}: pack-open Store recovery skipped: ${error?.message || error}`);
  }
  if (!storeRefreshed) {
    log(`${label}: Store Packs view refresh unavailable; continuing with repository refresh`);
  }

  await options.sleep?.(Math.max(0, Number(options.settleMs ?? 700)));
  await options.refreshInventory?.({ storeRefreshed });
  return {
    ...base,
    status: 'ready',
    storeRefreshed,
    evidence: stateEvidence ? inspectionSummary(stateEvidence) : null,
  };
}
