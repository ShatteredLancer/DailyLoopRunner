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

function buyJob() {
  return normalizeTradeJob({
    id: 'buy-1', name: '84 Rare Gold', type: 'buy', enabled: true, armed: false,
    schedule: { type: 'manual' }, misfirePolicy: { type: 'grace-window', graceMinutes: 15 },
    policy: {
      ratingMin: 84, ratingMax: 84, cardClass: 'rare-gold', maxBuyNow: 1000,
      ratingPriceOverrides: {}, quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 5,
      searchDelaySeconds: [8, 15], maxPurchasesPerSearch: 1, maxConsecutiveEmptySearches: 5,
    },
    createdAt: 1, updatedAt: 1,
  });
}

describe('Trade Buy dialog', () => {
  it('requires exact confirmation and renders the single Buy receipt', async () => {
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

    const confirmation = ui.byId('bronze-loop-trade-buy-confirmation');
    const execute = ui.byId('bronze-loop-trade-buy-execute');
    expect(execute.disabled).toBe(true);
    confirmation.value = 'BUY 1 MAX 999';
    confirmation.input();
    expect(execute.disabled).toBe(true);
    confirmation.value = 'BUY 1 MAX 1000';
    confirmation.input();
    expect(execute.disabled).toBe(false);
    await execute.click();

    expect(onExecute).toHaveBeenCalledWith({ confirmationText: 'BUY 1 MAX 1000', expectedDestination: 'auto', platform: 'pc' });
    expect(ui.byId('bronze-loop-trade-buy-status').textContent).toBe('completed');
    expect(ui.created.some((element) => element.textContent.includes('1 purchased'))).toBe(true);
    expect(execute.disabled).toBe(true);
  });

  it('requires route-specific confirmation for controlled Transfer validation', async () => {
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
    const confirmation = ui.byId('bronze-loop-trade-buy-confirmation');
    const execute = ui.byId('bronze-loop-trade-buy-execute');
    destination.value = 'transfer';
    destination.change();
    expect(confirmation.placeholder).toBe('BUY 1 TO TRANSFER MAX 1000');
    confirmation.value = 'BUY 1 MAX 1000';
    confirmation.input();
    expect(execute.disabled).toBe(true);
    confirmation.value = 'BUY 1 TO TRANSFER MAX 1000';
    confirmation.input();
    await execute.click();
    expect(onExecute).toHaveBeenCalledWith({
      confirmationText: 'BUY 1 TO TRANSFER MAX 1000',
      expectedDestination: 'transfer',
      platform: 'pc',
    });
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
    const confirmation = ui.byId('bronze-loop-trade-buy-confirmation');
    confirmation.value = 'BUY 1 MAX 1000';
    confirmation.input();
    await ui.byId('bronze-loop-trade-buy-execute').click();
    await ui.byId('bronze-loop-trade-buy-diagnostics').click();
    expect(onDownloadDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
      receipt: expect.objectContaining({ status: 'blocked', reason: 'trade-circuit-open' }),
    }));
    expect(ui.byId('bronze-loop-trade-buy-execute').disabled).toBe(true);
  });
});
