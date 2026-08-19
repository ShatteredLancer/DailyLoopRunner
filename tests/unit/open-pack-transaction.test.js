import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PACK_OPEN_RETRY_CODES,
  capturePackOpenResultEvidence,
  isAmbiguousPackOpenFailure,
  openPackTransaction,
  openedPackItems,
  packOpenFailureReason,
  packTransportFailureResult,
} from '../../src/pack/open-transaction.js';
import { loadFixture } from '../helpers/fixtures.js';

describe('openPackTransaction', () => {
  it('preserves a structured pre-open Storage block without selecting or opening a pack', async () => {
    const packSelector = vi.fn(async () => ({ id: 1082, name: '10x 85+' }));
    const openTransport = vi.fn(async () => ({ success: true, items: [] }));

    const receipt = await openPackTransaction({
      preOpenResolver: async () => ({
        status: 'blocked',
        reason: 'SBC storage has only 3 slot(s), but 7 item(s) need moving',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
        details: { free: 3, required: 7 },
      }),
      packSelector,
      openTransport,
    });

    expect(receipt).toMatchObject({
      status: 'blocked',
      attempts: 0,
      reason: 'SBC storage has only 3 slot(s), but 7 item(s) need moving',
      details: {
        phase: 'pre-open',
        reasonCode: 'PROTECTED_STORAGE_BLOCKED',
        free: 3,
        required: 7,
      },
    });
    expect(packSelector).not.toHaveBeenCalled();
    expect(openTransport).not.toHaveBeenCalled();
  });

  it('normalizes empty, malformed and nested EA pack responses', () => {
    expect(packOpenFailureReason(undefined)).toBe('empty-result');
    expect(packOpenFailureReason({ success: true })).toBe('missing-items');
    expect(packOpenFailureReason({ success: true, status: 200 })).toBe('missing-items');
    expect(packOpenFailureReason({ response: { error: { code: 512 } } })).toBe('512');
    expect(openedPackItems({ success: true, data: { items: [{ id: 1 }] } })).toEqual([{ id: 1 }]);
    expect(openedPackItems({ response: { success: true, data: { items: [{ id: 2 }] } } })).toEqual([{ id: 2 }]);
    expect(openedPackItems({ items: [], response: { items: [{ id: 3 }] } })).toEqual([{ id: 3 }]);
    expect(isAmbiguousPackOpenFailure('empty-result')).toBe(true);
    expect(isAmbiguousPackOpenFailure('transport-timeout')).toBe(true);
    expect(isAmbiguousPackOpenFailure('500')).toBe(false);
    expect(packTransportFailureResult(new Error('socket closed'))).toMatchObject({
      error: { code: 'transport-error', message: 'socket closed' },
    });
    expect(packTransportFailureResult(new Error('observable timed out'))).toMatchObject({
      error: { code: 'transport-timeout' },
    });
  });

  it('treats a nonempty direct reward payload as committed even when the EA DTO reports 500', async () => {
    const item = { id: 701, definitionId: 1701, rating: 95, duplicateId: 0 };
    const beforeRetry = vi.fn(async () => {});
    const onCommittedTransportFailure = vi.fn(async () => {});
    const openedItemPolicy = vi.fn(async (items) => ({ routedItemRefs: items }));
    const response = {
      success: false,
      status: 500,
      error: { code: 500 },
      response: { items: [item] },
    };

    expect(capturePackOpenResultEvidence(response)).toMatchObject({
      transportSucceeded: false,
      status: 500,
      errorCode: 500,
      selectedSource: 'response.items',
      selectedItemCount: 1,
      itemArrays: [{ source: 'response.items', count: 1 }],
      itemSample: [{ id: 701, definitionId: 1701, rating: 95, duplicateId: 0 }],
    });

    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 1082, name: '10x 85+' }),
      openTransport: async () => response,
      retryPolicy: { attempts: 2, retryCodes: ['500'] },
      beforeRetry,
      onCommittedTransportFailure,
      openedItemPolicy,
    });

    expect(receipt).toMatchObject({
      status: 'opened',
      attempts: 1,
      openedItems: [item],
      details: {
        transportWarning: {
          code: '500',
          itemSource: 'response.items',
          itemCount: 1,
        },
      },
    });
    expect(openedItemPolicy).toHaveBeenCalledWith([item], expect.objectContaining({ attempt: 1 }));
    expect(onCommittedTransportFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: '500',
      itemCount: 1,
      itemSource: 'response.items',
    }));
    expect(beforeRetry).not.toHaveBeenCalled();
  });

  it('normalizes a thrown transport exception inside the transaction and retries once', async () => {
    let calls = 0;
    const receipt = await openPackTransaction({
      packSelector: async ({ attempt }) => ({ id: 20059, instance: attempt }),
      openTransport: async () => {
        calls++;
        if (calls === 1) throw new Error('network connection failed');
        return { success: true, items: [] };
      },
      retryPolicy: { attempts: 2, retryCodes: ['transport-error'] },
      beforeRetry: async () => {},
      openedItemPolicy: async () => ({}),
    });

    expect(receipt).toMatchObject({ status: 'opened', attempts: 2 });
    expect(calls).toBe(2);
  });

  it('reports and retries an empty EA callback with a newly selected pack', async () => {
    const failures = [];
    const selector = vi.fn(async ({ attempt }) => ({ id: 20059, instance: attempt }));
    const receipt = await openPackTransaction({
      packSelector: selector,
      openTransport: async (_pack, { attempt }) => attempt === 1
        ? undefined
        : { success: true, data: { items: [{ id: 7 }] } },
      retryPolicy: { attempts: 2, retryCodes: ['empty-result'] },
      beforeRetry: async () => {},
      onTransportFailure: async (failure) => failures.push(failure),
      openedItemPolicy: async () => ({}),
    });

    expect(receipt).toMatchObject({ status: 'opened', attempts: 2, openedItems: [{ id: 7 }] });
    expect(selector).toHaveBeenCalledTimes(2);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ attempt: 1, code: 'empty-result', packRef: { id: 20059 } });
  });

  it('replays the sanitized EA failure matrix with bounded retry behavior', async () => {
    const fixture = await loadFixture('packs/open-failure-matrix.json');
    for (const scenario of fixture.cases) {
      const first = scenario.firstKind === 'undefined'
        ? undefined
        : scenario.firstKind === 'null' ? null : scenario.first;
      let calls = 0;
      const receipt = await openPackTransaction({
        packSelector: async () => ({ id: 20059, instance: calls + 1 }),
        openTransport: async () => ++calls === 1 ? first : scenario.second,
        openedItemPolicy: async () => ({}),
        retryPolicy: { attempts: 2, retryCodes: DEFAULT_PACK_OPEN_RETRY_CODES },
        beforeRetry: async () => {},
        allowGone: scenario.allowGone === true,
      });
      expect(receipt.status, scenario.name).toBe(scenario.expectedStatus);
      expect(receipt.attempts, scenario.name).toBe(scenario.expectedAttempts);
      if (scenario.expectedReason) expect(receipt.reason, scenario.name).toBe(scenario.expectedReason);
      expect(calls, scenario.name).toBe(scenario.expectedAttempts);
    }
  });

  it('publishes normalized opened items before routing without letting observer failures block the policy', async () => {
    const calls = [];
    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 105, name: 'Pack' }),
      openTransport: async () => ({ success: true, items: [{ id: 1 }] }),
      normalizeItems: async () => ({
        items: [{ id: 1, raw: true }],
        receiptItems: [{ id: 1, normalized: true }],
      }),
      onItemsOpened: ({ openedItems }) => {
        calls.push(['opened', openedItems]);
        throw new Error('preview failed');
      },
      onItemsOpenedError: (error) => calls.push(['observer-error', error.message]),
      openedItemPolicy: async () => {
        calls.push(['policy']);
        return {};
      },
    });

    expect(receipt.status).toBe('opened');
    expect(calls).toEqual([
      ['opened', [{ id: 1, normalized: true }]],
      ['observer-error', 'preview failed'],
      ['policy'],
    ]);
  });

  it('runs pre-open, selection, transport, normalization and policy in order', async () => {
    const calls = [];
    const receipt = await openPackTransaction({
      preOpenResolver: async () => { calls.push('pre'); return { status: 'resolved' }; },
      packSelector: async () => { calls.push('select'); return { id: 105, name: 'Bronze' }; },
      openTransport: async () => { calls.push('open'); return { success: true, response: { items: [{ id: 1 }] } }; },
      normalizeItems: async (items) => { calls.push('normalize'); return items.map((item) => ({ ...item, normalized: true })); },
      openedItemPolicy: async (items) => { calls.push('policy'); return { reservedItemRefs: [{ id: items[0].id }] }; },
    });
    expect(receipt).toMatchObject({ status: 'opened', packRef: { id: 105 }, attempts: 1 });
    expect(receipt.openedItems[0]).toMatchObject({ id: 1, normalized: true });
    expect(receipt.reservedItemRefs).toEqual([{ id: 1 }]);
    expect(calls).toEqual(['pre', 'select', 'open', 'normalize', 'policy']);
  });

  it('settles a committed pack response through routing, receipt and ledger before honoring Stop', async () => {
    const calls = [];
    let stopping = false;
    let committed = false;
    const requireCommitted = (stage) => {
      if (stopping && !committed) throw new Error(`Stop interrupted ${stage}`);
      calls.push(stage);
    };

    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 1082, name: '10x85+' }),
      openTransport: async () => {
        calls.push('transport');
        stopping = true;
        return { success: true, response: { items: [{ id: 701 }] } };
      },
      runCommitted: async (operation) => {
        calls.push('commit-enter');
        committed = true;
        try {
          return await operation();
        } finally {
          committed = false;
          calls.push('commit-exit');
        }
      },
      normalizeItems: async (items) => { requireCommitted('materialize'); return items; },
      openedItemPolicy: async (items) => {
        requireCommitted('route');
        return { routedItemRefs: items.map((item) => ({ ...item, pile: 'club' })) };
      },
      settleReceipt: async () => requireCommitted('ledger'),
      onReceipt: async () => requireCommitted('receipt'),
    });

    expect(receipt.status).toBe('opened');
    expect(calls).toEqual([
      'transport',
      'commit-enter',
      'materialize',
      'route',
      'ledger',
      'receipt',
      'commit-exit',
    ]);
  });

  it('publishes the final receipt before returning without letting observer failures change it', async () => {
    const calls = [];
    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 105, name: 'Bronze' }),
      openTransport: async () => ({ success: true, items: [{ id: 1 }] }),
      openedItemPolicy: async () => ({ routedItemRefs: [{ id: 1, pile: 'club' }] }),
      onReceipt: async (value, context) => {
        calls.push(['receipt', value.status, context.phase]);
        throw new Error('ledger unavailable');
      },
      onReceiptError: async (error, { receipt: value }) => calls.push(['error', error.message, value.status]),
    });

    expect(receipt).toMatchObject({ status: 'opened' });
    expect(calls).toEqual([
      ['receipt', 'opened', 'opened'],
      ['error', 'ledger unavailable', 'opened'],
    ]);
  });

  it('keeps live normalized items for policy execution and serializable items in the receipt', async () => {
    const liveItem = { id: 7, definitionId: 700, mark() { this.marked = true; } };
    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 105, name: 'Bronze' }),
      openTransport: async () => ({ success: true, response: { items: [liveItem] } }),
      normalizeItems: async (items) => ({
        items,
        receiptItems: items.map((item) => ({ id: item.id, definitionId: item.definitionId, pile: 'unassigned' })),
      }),
      openedItemPolicy: async (items) => {
        items[0].mark();
        return {
          routedItemRefs: [{ id: 7, definitionId: 700, pile: 'club' }],
          details: { route: 'club' },
        };
      },
    });
    expect(liveItem.marked).toBe(true);
    expect(receipt.openedItems).toEqual([{ id: 7, definitionId: 700, pile: 'unassigned' }]);
    expect(receipt.routedItemRefs).toEqual([{ id: 7, definitionId: 700, pile: 'club' }]);
    expect(receipt.details).toEqual({ route: 'club' });
  });

  it('marks all opened items pending when no policy is supplied', async () => {
    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 105 }),
      openTransport: async () => ({ success: true, response: { items: [{ id: 9, definitionId: 90 }] } }),
    });
    expect(receipt.pendingItemRefs).toEqual([{ id: 9, definitionId: 90 }]);
  });

  it('retries configured errors with a fresh pack selection', async () => {
    const selector = vi.fn(async ({ attempt }) => ({ id: 100 + attempt }));
    const transport = vi.fn(async (_pack, { attempt }) => attempt === 1
      ? { success: false, error: { code: 471 } }
      : { success: true, response: { items: [] } });
    const beforeRetry = vi.fn(async () => {});
    const receipt = await openPackTransaction({
      packSelector: selector,
      openTransport: transport,
      retryPolicy: { attempts: 2, retryCodes: ['471'] },
      beforeRetry,
    });
    expect(receipt).toMatchObject({ status: 'opened', attempts: 2 });
    expect(selector).toHaveBeenCalledTimes(2);
    expect(beforeRetry).toHaveBeenCalledOnce();
  });

  it('never issues a second open when recovery reports pending Purchased items', async () => {
    const transport = vi.fn(async () => ({ success: false, status: 409, error: { code: 471 } }));
    const selector = vi.fn(async ({ attempt }) => ({ id: 1082, instance: attempt }));
    const receipt = await openPackTransaction({
      packSelector: selector,
      openTransport: transport,
      retryPolicy: { attempts: 2, retryCodes: ['471'] },
      beforeRetry: async () => ({
        status: 'blocked',
        reason: 'PACK_OPEN_RESPONSE_LOST',
        details: { reasonCode: 'PACK_OPEN_RESPONSE_LOST', pendingCount: 10 },
      }),
    });

    expect(receipt).toMatchObject({
      status: 'blocked',
      reason: 'PACK_OPEN_RESPONSE_LOST',
      attempts: 1,
      details: { phase: 'recovery', reasonCode: 'PACK_OPEN_RESPONSE_LOST', pendingCount: 10 },
    });
    expect(selector).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
  });

  it('returns the final error code after a bounded retry is exhausted', async () => {
    const beforeRetry = vi.fn(async () => {});
    const receipt = await openPackTransaction({
      packSelector: async ({ attempt }) => ({ id: 200 + attempt }),
      openTransport: async () => ({ success: false, error: { code: 471 } }),
      retryPolicy: { attempts: 2, retryCodes: ['471'] },
      beforeRetry,
    });
    expect(receipt).toMatchObject({ status: 'blocked', reason: '471', attempts: 2 });
    expect(beforeRetry).toHaveBeenCalledOnce();
  });

  it('preserves a precise reconciliation block when retry selection is intentionally refused', async () => {
    const transport = vi.fn(async () => ({ success: false, error: { code: 500 } }));
    const receipt = await openPackTransaction({
      packSelector: async ({ attempt }) => attempt === 1 ? { id: 1082 } : null,
      openTransport: transport,
      retryPolicy: { attempts: 2, retryCodes: ['500'] },
      beforeRetry: async () => {},
      packUnavailableResult: async ({ attempt, lastReason }) => attempt === 2 ? {
        status: 'blocked',
        reason: 'PACK_OPEN_RESPONSE_LOST',
        details: {
          reasonCode: 'PACK_OPEN_RESPONSE_LOST',
          retryEvidence: { packCountBefore: 2, packCountAfter: 1 },
        },
      } : null,
    });

    expect(receipt).toMatchObject({
      status: 'blocked',
      reason: 'PACK_OPEN_RESPONSE_LOST',
      attempts: 1,
      details: {
        reasonCode: 'PACK_OPEN_RESPONSE_LOST',
        retryEvidence: { packCountBefore: 2, packCountAfter: 1 },
      },
    });
    expect(transport).toHaveBeenCalledOnce();
  });

  it('returns stale for an allowed 404', async () => {
    const onGone = vi.fn(async () => {});
    const receipt = await openPackTransaction({
      packSelector: async () => ({ id: 105 }),
      openTransport: async () => ({ success: false, error: { code: 404 } }),
      allowGone: true,
      onGone,
    });
    expect(receipt).toMatchObject({ status: 'stale', reason: '404' });
    expect(onGone).toHaveBeenCalledOnce();
  });

  it('blocks before selection when Unassigned cannot be resolved', async () => {
    const selector = vi.fn();
    const receipt = await openPackTransaction({
      preOpenResolver: async () => ({ status: 'blocked', reason: 'storage full' }),
      packSelector: selector,
      openTransport: async () => ({ success: true, response: { items: [] } }),
    });
    expect(receipt).toMatchObject({ status: 'blocked', reason: 'storage full', attempts: 0 });
    expect(selector).not.toHaveBeenCalled();
  });
});
