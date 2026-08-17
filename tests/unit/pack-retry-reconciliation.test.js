import { describe, expect, it } from 'vitest';
import {
  PACK_OPEN_RESPONSE_LOST,
  PACK_OPEN_RESULT_AMBIGUOUS,
  capturePackOpenRetrySnapshot,
  decidePackOpenRetry,
} from '../../src/pack/retry-reconciliation.js';

function piles(ids = []) {
  return {
    unassigned: ids.map((id) => ({ id })),
    storage: [],
    transfer: [],
    club: [],
  };
}

describe('pack retry reconciliation', () => {
  it('reuses a transient 500 pack when a forced refresh still contains the same instance', () => {
    const failedPack = { id: 1082, instance: 1 };
    const baseline = capturePackOpenRetrySnapshot({
      pack: failedPack,
      packs: [failedPack],
      piles: piles([1, 2]),
    });
    const current = capturePackOpenRetrySnapshot({
      pack: failedPack,
      packs: [failedPack],
      piles: piles([1, 2]),
    });

    expect(decidePackOpenRetry({
      code: 500,
      failedPack,
      resolvedPack: null,
      baseline,
      current,
    })).toMatchObject({ action: 'retry', pack: failedPack, source: 'same-instance' });
  });

  it('uses a refreshed same-id instance when the owned pack count is stable', () => {
    const failedPack = { id: 1082, instance: 1 };
    const freshPack = { id: 1082, instance: 2 };
    const baseline = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [failedPack], piles: piles([1]) });
    const current = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [freshPack], piles: piles([1]) });

    expect(decidePackOpenRetry({
      code: '500',
      failedPack,
      resolvedPack: freshPack,
      baseline,
      current,
    })).toMatchObject({ action: 'retry', pack: freshPack, source: 'fresh-instance' });
  });

  it('does not open the next identical pack when the owned pack count decreased', () => {
    const failedPack = { id: 1082, instance: 1 };
    const nextPack = { id: 1082, instance: 2 };
    const baseline = capturePackOpenRetrySnapshot({
      pack: failedPack,
      packs: [failedPack, nextPack],
      piles: piles([1]),
    });
    const current = capturePackOpenRetrySnapshot({
      pack: failedPack,
      packs: [nextPack],
      piles: piles([1]),
    });

    expect(decidePackOpenRetry({
      code: 500,
      failedPack,
      resolvedPack: nextPack,
      baseline,
      current,
    })).toMatchObject({
      action: 'blocked',
      reason: PACK_OPEN_RESPONSE_LOST,
      evidence: { packCountBefore: 2, packCountAfter: 1 },
    });
  });

  it('reports response loss without retrying when new inventory items appeared', () => {
    const failedPack = { id: 1082, instance: 1 };
    const baseline = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [failedPack], piles: piles([1]) });
    const current = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [], piles: piles([1, 9, 10]) });

    expect(decidePackOpenRetry({
      code: 500,
      failedPack,
      resolvedPack: null,
      baseline,
      current,
    })).toMatchObject({
      action: 'blocked',
      reason: PACK_OPEN_RESPONSE_LOST,
      evidence: { addedItemIds: [9, 10] },
    });
  });

  it('fails closed with an explicit ambiguous result when neither pack nor items can be proven', () => {
    const failedPack = { id: 1082, instance: 1 };
    const baseline = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [failedPack], piles: piles([1]) });
    const current = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [], piles: piles([1]) });

    expect(decidePackOpenRetry({
      code: 500,
      failedPack,
      resolvedPack: null,
      baseline,
      current,
    })).toMatchObject({ action: 'blocked', reason: PACK_OPEN_RESULT_AMBIGUOUS });
  });

  it('never reuses the failed object for a 471 retry', () => {
    const failedPack = { id: 1082, instance: 1 };
    const baseline = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [failedPack], piles: piles() });
    const current = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [failedPack], piles: piles() });

    expect(decidePackOpenRetry({
      code: 471,
      failedPack,
      resolvedPack: null,
      baseline,
      current,
    })).toMatchObject({ action: 'blocked', reason: PACK_OPEN_RESULT_AMBIGUOUS });
  });

  it('allows a 471 retry only through a refreshed same-id instance', () => {
    const failedPack = { id: 1082, instance: 1 };
    const freshPack = { id: 1082, instance: 2 };
    const baseline = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [failedPack], piles: piles() });
    const current = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [freshPack], piles: piles() });

    expect(decidePackOpenRetry({
      code: 471,
      failedPack,
      resolvedPack: freshPack,
      baseline,
      current,
    })).toMatchObject({ action: 'retry', pack: freshPack, source: 'fresh-instance' });
  });

  it('fails closed when post-recovery reads do not stabilize', () => {
    const failedPack = { id: 1082, instance: 1 };
    const baseline = capturePackOpenRetrySnapshot({ pack: failedPack, packs: [failedPack], piles: piles() });
    const current = capturePackOpenRetrySnapshot({
      pack: failedPack,
      packs: [failedPack],
      piles: piles(),
      stable: false,
      stableReadCount: 1,
    });

    expect(decidePackOpenRetry({
      code: 500,
      failedPack,
      resolvedPack: failedPack,
      baseline,
      current,
    })).toMatchObject({
      action: 'blocked',
      reason: PACK_OPEN_RESULT_AMBIGUOUS,
      evidence: { stable: false, stableReadCount: 1 },
    });
  });
});
