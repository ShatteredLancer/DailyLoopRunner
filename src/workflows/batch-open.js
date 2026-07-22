import { normalizeBatchOpenPlan } from '../config/batch-open.js';

function createResult(input = {}) {
  return Object.freeze({
    status: String(input.status || 'completed'),
    reason: input.reason ? String(input.reason) : null,
    requestedPacks: Number(input.requestedPacks || 0),
    packsOpened: Number(input.packsOpened || 0),
    skippedPacks: Number(input.skippedPacks || 0),
    openedItems: Object.freeze([...(input.openedItems || [])]),
    receipts: Object.freeze([...(input.receipts || [])]),
    entries: Object.freeze((input.entries || []).map((entry) => Object.freeze({ ...entry }))),
  });
}

export async function runBatchOpenWorkflow(options = {}) {
  if (typeof options.resolvePack !== 'function') throw new TypeError('resolvePack is required');
  if (typeof options.openPack !== 'function') throw new TypeError('openPack is required');
  const plan = normalizeBatchOpenPlan(options.plan);
  const requestedPacks = plan.entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const receipts = [];
  const openedItems = [];
  const entries = [];
  let packsOpened = 0;
  let skippedPacks = 0;

  const skipFollowingEntries = (startIndex, reason) => {
    for (let index = startIndex; index < plan.entries.length; index++) {
      const pending = plan.entries[index];
      entries.push({
        packId: pending.packId,
        packName: pending.packName,
        requested: pending.quantity,
        opened: 0,
        skipped: pending.quantity,
        reason,
      });
      skippedPacks += pending.quantity;
    }
  };

  const finish = (status = 'completed', reason = null) => createResult({
    status,
    reason,
    requestedPacks,
    packsOpened,
    skippedPacks,
    openedItems,
    receipts,
    entries,
  });

  if (typeof options.beforeStart === 'function') {
    const preflight = await options.beforeStart();
    if (preflight?.status === 'preserved' || preflight?.status === 'blocked') {
      skipFollowingEntries(0, preflight.reason || 'Unassigned items must be resolved before opening packs');
      await options.onEvent?.('preflight-preserved', { preflight, requestedPacks });
      return finish('preserved', preflight.reason || 'Unassigned items must be resolved before opening packs');
    }
  }

  for (let entryIndex = 0; entryIndex < plan.entries.length; entryIndex++) {
    const entry = plan.entries[entryIndex];
    const entryResult = {
      packId: entry.packId,
      packName: entry.packName,
      requested: entry.quantity,
      opened: 0,
      skipped: 0,
      reason: null,
    };
    entries.push(entryResult);

    for (let openIndex = 0; openIndex < entry.quantity; openIndex++) {
      if (options.shouldStop?.() === true) {
        const remaining = entry.quantity - openIndex;
        entryResult.skipped += remaining;
        entryResult.reason = 'stopped by user';
        skippedPacks += remaining;
        skipFollowingEntries(entryIndex + 1, 'stopped by user');
        return finish('stopped', 'stopped by user');
      }

      let receipt = null;
      let foundPack = false;
      try {
        for (let resolveAttempt = 1; resolveAttempt <= 2 && !receipt; resolveAttempt++) {
          const pack = await options.resolvePack(entry, { entryIndex, openIndex, resolveAttempt });
          if (!pack) break;
          foundPack = true;
          receipt = await options.openPack({
            entry,
            entryIndex,
            openIndex,
            resolveAttempt,
            pack,
          });
        }
      } catch (error) {
        const remaining = entry.quantity - openIndex;
        entryResult.skipped += remaining;
        entryResult.reason = error?.message || String(error || 'open failed');
        skippedPacks += remaining;
        if (options.shouldStop?.() === true || /stopped by user/i.test(entryResult.reason)) {
          skipFollowingEntries(entryIndex + 1, 'stopped by user');
          return finish('stopped', 'stopped by user');
        }
        await options.onEvent?.('blocked', { entry, entryResult, error });
        skipFollowingEntries(entryIndex + 1, 'not attempted after blocked pack');
        return finish('blocked', entryResult.reason);
      }

      if (!receipt || receipt.status !== 'opened') {
        const remaining = entry.quantity - openIndex;
        entryResult.skipped += remaining;
        entryResult.reason = foundPack ? 'matching pack became unavailable' : 'matching pack is unavailable';
        skippedPacks += remaining;
        await options.onEvent?.('unavailable', { entry, entryResult, remaining });
        break;
      }

      receipts.push(receipt);
      openedItems.push(...(receipt.openedItems || []));
      packsOpened++;
      entryResult.opened++;
      await options.onEvent?.('opened', {
        entry,
        entryResult,
        receipt,
        packsOpened,
        requestedPacks,
      });
      if ((receipt.pendingItemRefs || []).length) {
        const remaining = entry.quantity - openIndex - 1;
        entryResult.skipped += remaining;
        entryResult.reason = receipt.details?.cleanupReason
          || `${receipt.pendingItemRefs.length} opened item(s) remain unresolved`;
        skippedPacks += remaining;
        skipFollowingEntries(entryIndex + 1, 'not attempted while opened items remain unresolved');
        await options.onEvent?.('pending', {
          entry,
          entryResult,
          receipt,
          remaining,
          packsOpened,
          requestedPacks,
        });
        return finish('preserved', entryResult.reason);
      }
      if (receipt.details?.cleanupStatus === 'preserved') {
        const remaining = entry.quantity - openIndex - 1;
        entryResult.skipped += remaining;
        entryResult.reason = receipt.details.cleanupReason || 'Unassigned items were preserved';
        skippedPacks += remaining;
        skipFollowingEntries(entryIndex + 1, 'not attempted while Unassigned is preserved');
        await options.onEvent?.('preserved', {
          entry,
          entryResult,
          receipt,
          remaining,
          packsOpened,
          requestedPacks,
        });
        return finish('preserved', entryResult.reason);
      }
    }
  }

  return finish('completed');
}
