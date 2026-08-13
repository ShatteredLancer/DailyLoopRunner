import { describe, expect, it, vi } from 'vitest';
import { showTradeBuyDialog } from '../../src/ui/trade-buy-dialog.js';
import { normalizeTradeJob } from '../../src/trade/contracts.js';

function uiHarness() {
  const created = [];
  const body = [];
  const root = { dataset: { dlrLayout: 'desktop', dlrInput: 'pointer' }, getAttribute: () => null };
  function create(tagName) {
    const listeners = new Map();
    const element = {
      tagName, style: {}, dataset: {}, children: [], value: '', checked: false, disabled: false, removed: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { element.children.push(...items); },
      appendChild(item) { element.children.push(item); return item; },
      remove() { element.removed = true; },
      click() { return listeners.get('click')?.({ target: element }); },
      input() { return listeners.get('input')?.({ target: element }); },
      change() { return listeners.get('change')?.({ target: element }); },
      setAttribute() {},
    };
    let text = '';
    Object.defineProperty(element, 'textContent', {
      get: () => text,
      set(value) { text = String(value); if (text === '') element.children = []; },
    });
    created.push(element);
    return element;
  }
  return {
    created,
    body,
    byId: (id) => created.find((element) => element.id === id),
    dom: {
      create,
      query: (selector) => selector === ':root' ? root : null,
      appendToBody: (element) => body.push(element),
    },
  };
}

function buyJob(policy = {}) {
  return normalizeTradeJob({
    id: 'buy-1', name: '84 Rare Gold', type: 'buy', enabled: true, armed: false,
    schedule: { type: 'manual' }, misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      ratingMin: 84, ratingMax: 84, cardClass: 'rare-gold', maxBuyNow: 1000,
      ratingPriceOverrides: {}, quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 5,
      searchDelaySeconds: [8, 15], maxPurchasesPerSearch: 1, maxConsecutiveEmptySearches: 5,
      ...policy,
    },
    createdAt: 1, updatedAt: 1,
  });
}

describe('Trade Buy dialog', () => {
  it('uses direct approval and renders the single Buy receipt', async () => {
    const ui = uiHarness();
    const receipt = {
      runId: 'buy-run-1', jobId: 'buy-1', jobType: 'buy', status: 'completed', reason: null,
      requested: 1, succeeded: 1, failed: 0, skipped: 0, coinsBefore: 10000, coinsAfter: 9000,
      receipts: [
        { status: 'run-summary', searches: 1, buyAttempts: 1, spent: 1000 },
        { index: 1, status: 'purchased', rating: 84, price: 1000, destination: 'club' },
      ],
    };
    const onExecute = vi.fn().mockResolvedValue(receipt);
    showTradeBuyDialog({
      dom: ui.dom,
      job: buyJob(),
      preview: { plan: { ready: true }, summary: { definitions: 50 } },
      onExecute,
    });

    const execute = ui.byId('bronze-loop-trade-buy-execute');
    expect(execute.disabled).toBe(false);
    expect(ui.byId('bronze-loop-trade-buy-confirmation')).toBeUndefined();
    await execute.click();

    expect(onExecute).toHaveBeenCalledWith(
      { approved: true, expectedDestination: 'auto', platform: 'pc' },
      expect.any(Function),
    );
    expect(ui.byId('bronze-loop-trade-buy-status').textContent).toBe('completed');
    expect(ui.created.some((element) => element.textContent.includes('1 purchased'))).toBe(true);
    expect(execute.disabled).toBe(true);
  });

  it('uses direct approval for controlled Transfer validation', async () => {
    const ui = uiHarness();
    const onExecute = vi.fn().mockResolvedValue({
      status: 'completed', reason: null, requested: 1, succeeded: 1, failed: 0, skipped: 0,
      receipts: [{ status: 'run-summary' }, { status: 'purchased', destination: 'transfer' }],
    });
    showTradeBuyDialog({
      dom: ui.dom,
      job: buyJob(),
      preview: { plan: { ready: true }, summary: { definitions: 50 } },
      onExecute,
    });
    const destination = ui.byId('bronze-loop-trade-buy-destination');
    const execute = ui.byId('bronze-loop-trade-buy-execute');
    destination.value = 'transfer';
    destination.change();
    await execute.click();
    expect(onExecute).toHaveBeenCalledWith(
      {
        approved: true,
        expectedDestination: 'transfer',
        platform: 'pc',
      },
      expect.any(Function),
    );
  });

  it('exports Preview and receipt diagnostics without allowing a second execution', async () => {
    const ui = uiHarness();
    const onDownloadDiagnostics = vi.fn();
    showTradeBuyDialog({
      dom: ui.dom,
      job: buyJob(),
      preview: { plan: { ready: true }, summary: { definitions: 50 } },
      onExecute: vi.fn().mockResolvedValue({ status: 'blocked', reason: 'trade-circuit-open', receipts: [] }),
      onDownloadDiagnostics,
    });
    await ui.byId('bronze-loop-trade-buy-execute').click();
    await ui.byId('bronze-loop-trade-buy-diagnostics').click();
    expect(onDownloadDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
      receipt: expect.objectContaining({ status: 'blocked', reason: 'trade-circuit-open' }),
    }));
    expect(ui.byId('bronze-loop-trade-buy-execute').disabled).toBe(true);
  });

  it('approves the displayed quantity for adjacent rating lanes', async () => {
    const ui = uiHarness();
    const onExecute = vi.fn().mockResolvedValue({
      status: 'completed', requested: 2, succeeded: 2, failed: 0, skipped: 0,
      receipts: [
        { status: 'run-summary', searches: 2, buyAttempts: 2, spent: 1900 },
        { index: 1, status: 'purchased', rating: 84, price: 900, destination: 'club' },
        { index: 2, status: 'purchased', rating: 85, price: 1000, destination: 'club' },
      ],
    });
    showTradeBuyDialog({
      dom: ui.dom,
      job: buyJob({ ratingMax: 85, quantity: 2, totalBudget: 2000 }),
      preview: { plan: { ready: true }, summary: { definitions: 100 } },
      onExecute,
    });

    const execute = ui.byId('bronze-loop-trade-buy-execute');
    expect(execute.textContent).toBe('Buy 2');
    await execute.click();
    expect(onExecute).toHaveBeenCalledWith(
      { approved: true, expectedDestination: 'auto', platform: 'pc' },
      expect.any(Function),
    );
  });

  it('allows a newly approved Run in the same dialog after exact Journal reconciliation', async () => {
    const ui = uiHarness();
    const onExecute = vi.fn()
      .mockResolvedValueOnce({
        status: 'blocked', reason: 'buy-journal-reconciled-retry-required',
        requested: 0, succeeded: 0, failed: 0, skipped: 0, receipts: [],
      })
      .mockResolvedValueOnce({
        status: 'completed', reason: null,
        requested: 1, succeeded: 1, failed: 0, skipped: 0,
        receipts: [{ status: 'purchased', index: 1, rating: 84, price: 900, destination: 'club' }],
      });
    showTradeBuyDialog({
      dom: ui.dom,
      job: buyJob(),
      preview: { plan: { ready: true }, summary: { definitions: 50 } },
      onExecute,
    });
    const execute = ui.byId('bronze-loop-trade-buy-execute');
    await execute.click();

    expect(ui.byId('bronze-loop-trade-buy-status').textContent).toContain('No new Buy was sent');
    expect(execute.disabled).toBe(false);
    await execute.click();
    expect(onExecute).toHaveBeenCalledTimes(2);
    expect(ui.byId('bronze-loop-trade-buy-status').textContent).toBe('completed');
  });

  it('shows completed-item and shared pacing progress while a later action waits locally', async () => {
    const ui = uiHarness();
    let finishRun;
    const onExecute = vi.fn((_input, onProgress) => {
      onProgress({ phase: 'chunk-started', at: 1000, chunkIndex: 1, quantity: 2, required: 28 });
      onProgress({
        phase: 'item-finished', at: 1200, chunkIndex: 1, itemIndex: 1,
        status: 'purchased', destination: 'club',
      });
      onProgress({ phase: 'chunk-started', at: 1500, chunkIndex: 2, quantity: 2, required: 28 });
      onProgress({
        phase: 'buy-request-permit-waiting', at: 2000, chunkIndex: 2, retryAt: 6000,
      });
      return new Promise((resolve) => { finishRun = resolve; });
    });
    showTradeBuyDialog({
      dom: ui.dom,
      job: buyJob({ ratingMax: 86, quantity: 4, totalBudget: 4000 }),
      preview: { plan: { ready: true }, summary: { definitions: 150 } },
      onExecute,
      now: () => 2000,
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    });
    const execution = ui.byId('bronze-loop-trade-buy-execute').click();

    expect(ui.byId('bronze-loop-trade-buy-status').textContent).toBe(
      'Buy waiting for shared pacing: retry in about 4s | 1/4 item(s) finished',
    );
    expect(ui.byId('bronze-loop-trade-buy-stop').style.display).toBe('');

    finishRun({
      status: 'stopped', reason: 'stopped-by-user', requested: 4,
      succeeded: 1, failed: 0, skipped: 3, receipts: [],
    });
    await execution;
    expect(ui.byId('bronze-loop-trade-buy-status').textContent).toBe('stopped (stopped-by-user)');
  });
});
