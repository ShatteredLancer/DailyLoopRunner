import { describe, expect, it, vi } from 'vitest';
import { showTradeListingDialog } from '../../src/ui/trade-listing-dialog.js';

function createUiHarness() {
  const created = [];
  const body = [];
  const root = { dataset: { dlrLayout: 'desktop', dlrInput: 'pointer' }, getAttribute: () => null };
  const create = (tagName) => {
    const listeners = new Map();
    const attributes = new Map();
    const element = {
      tagName,
      style: {},
      dataset: {},
      children: [],
      value: '',
      checked: false,
      disabled: false,
      removed: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { element.children.push(...items); },
      appendChild(item) { element.children.push(item); return item; },
      remove() { element.removed = true; },
      click() { return listeners.get('click')?.({ target: element }); },
      change() { return listeners.get('change')?.({ target: element }); },
      input() { return listeners.get('input')?.({ target: element }); },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) || null; },
    };
    let text = '';
    Object.defineProperty(element, 'textContent', {
      get: () => text,
      set(value) {
        text = String(value);
        if (text === '') element.children = [];
      },
    });
    created.push(element);
    return element;
  };
  return {
    body,
    created,
    byId: (id) => created.find((element) => element.id === id),
    byText: (text) => created.find((element) => element.textContent === text),
    dom: {
      create,
      query: (selector) => selector === ':root' ? root : null,
      appendToBody(element) { body.push(element); },
    },
  };
}

function plan(mode = 'preview-only') {
  return {
    mode,
    plan: {
      counts: { selected: 1, eligible: 2, rejected: 3 },
      entries: [{
        item: { id: 1, definitionId: 101, pile: 'club' },
        name: 'Player One', rating: 80, startPrice: 650, buyNow: 700,
        quoteStatus: 'disabled', priceLimitStatus: mode === 'prepared' ? 'loaded' : 'pending',
      }],
      warnings: [],
    },
  };
}

describe('Trade listing dialog', () => {
  it('keeps Preview separate, invalidates preparation on edits, and executes exact confirmation', async () => {
    const ui = createUiHarness();
    const preview = plan();
    const prepared = {
      ...plan('prepared'),
      ready: true,
      blockers: [],
      confirmation: { token: 'secret', requiredText: 'LIST 1', createdAt: 1, expiresAt: 2, itemCount: 1 },
    };
    const runReceipt = {
      status: 'completed', requested: 1, succeeded: 1, failed: 0, skipped: 0,
      receipts: [{ index: 1, status: 'listed', item: { id: 1, definitionId: 101, pile: 'club' }, listing: { startPrice: 650, buyNow: 700 } }],
    };
    const onPreview = vi.fn(async () => preview);
    const onPrepare = vi.fn(async () => prepared);
    const onCancelPrepared = vi.fn();
    const onExecute = vi.fn(async () => runReceipt);
    const onDownloadDiagnostics = vi.fn();
    showTradeListingDialog({
      dom: ui.dom,
      now: () => 123,
      onPreview,
      onPrepare,
      onCancelPrepared,
      onExecute,
      onDownloadDiagnostics,
    });

    await ui.byId('bronze-loop-trade-preview').click();
    expect(onPreview).toHaveBeenCalledOnce();
    await ui.byId('bronze-loop-trade-prepare').click();
    expect(onPrepare).toHaveBeenCalledOnce();
    await ui.byId('bronze-loop-trade-diagnostics').click();
    expect(onDownloadDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
      preview: null,
      prepared,
    }));

    const cardClass = ui.byId('bronze-loop-trade-card-class');
    cardClass.value = 'rare-gold';
    cardClass.change();
    expect(onCancelPrepared).toHaveBeenCalledOnce();
    expect(ui.byId('bronze-loop-trade-execute').style.display).toBe('none');

    await ui.byId('bronze-loop-trade-prepare').click();
    const confirmation = ui.byId('bronze-loop-trade-confirmation');
    confirmation.value = 'LIST 1';
    confirmation.input();
    expect(ui.byId('bronze-loop-trade-execute').disabled).toBe(false);
    await ui.byId('bronze-loop-trade-execute').click();
    expect(onExecute).toHaveBeenCalledWith({ confirmationToken: 'secret', confirmationText: 'LIST 1' });
    expect(ui.byText('Listing recap')).toBeTruthy();
    expect(ui.byId('bronze-loop-trade-close').disabled).toBe(false);
  });

  it('keeps the dialog open while a listing runs and forwards Stop', async () => {
    const ui = createUiHarness();
    let finish;
    const running = new Promise((resolve) => { finish = resolve; });
    const onStop = vi.fn(() => true);
    showTradeListingDialog({
      dom: ui.dom,
      onPrepare: async () => ({
        ...plan('prepared'), ready: true, blockers: [],
        confirmation: { token: 'secret', requiredText: 'LIST 1' },
      }),
      onExecute: () => running,
      onStop,
    });
    await ui.byId('bronze-loop-trade-prepare').click();
    const confirmation = ui.byId('bronze-loop-trade-confirmation');
    confirmation.value = 'LIST 1';
    confirmation.input();
    const execution = ui.byId('bronze-loop-trade-execute').click();
    expect(ui.byId('bronze-loop-trade-close').disabled).toBe(true);
    ui.byId('bronze-loop-trade-stop').click();
    expect(onStop).toHaveBeenCalledOnce();
    ui.byId('bronze-loop-trade-close').click();
    expect(ui.body[0].removed).toBe(false);
    finish({ status: 'stopped', reason: 'stopped-by-user', requested: 1, succeeded: 0, failed: 0, skipped: 1, receipts: [] });
    await execution;
    expect(ui.byId('bronze-loop-trade-close').disabled).toBe(false);
  });

  it('allows diagnostics export after a Preview failure', async () => {
    const ui = createUiHarness();
    const failure = new Error('Club unavailable');
    const onDownloadDiagnostics = vi.fn();
    showTradeListingDialog({
      dom: ui.dom,
      onPreview: async () => { throw failure; },
      onDownloadDiagnostics,
    });
    await ui.byId('bronze-loop-trade-preview').click();
    expect(ui.byId('bronze-loop-trade-diagnostics').disabled).toBe(false);
    await ui.byId('bronze-loop-trade-diagnostics').click();
    expect(onDownloadDiagnostics).toHaveBeenCalledWith(expect.objectContaining({ error: failure }));
  });

  it('gates two Transfer reprices behind preparation and exact confirmation', async () => {
    const ui = createUiHarness();
    const preview = plan();
    const prepared = {
      ...plan('prepared'),
      ready: true,
      blockers: [],
      job: { policy: { sources: ['transfer'] } },
      plan: {
        ...plan('prepared').plan,
        entries: [1, 2].map((id) => ({
          ...plan('prepared').plan.entries[0],
          item: { id, definitionId: 100 + id, pile: 'transfer' },
          auctionState: 'inactive',
        })),
      },
      confirmation: { token: 'reprice-secret', requiredText: 'REPRICE 2', createdAt: 1, expiresAt: 2, itemCount: 2 },
    };
    const onPreview = vi.fn(async () => preview);
    const onPrepare = vi.fn(async () => prepared);
    const onExecute = vi.fn(async () => ({ status: 'completed', requested: 2, succeeded: 2, failed: 0, skipped: 0, receipts: [] }));
    const onDownloadDiagnostics = vi.fn();
    showTradeListingDialog({
      dom: ui.dom,
      now: () => 123,
      draft: {
        id: 'transfer-observation',
        name: 'Transfer Observation',
        sources: ['transfer'],
        expiredPolicy: 'reprice',
      },
      onPreview,
      onPrepare,
      onExecute,
      onDownloadDiagnostics,
    });

    const source = ui.byId('bronze-loop-trade-source');
    const prepare = ui.byId('bronze-loop-trade-prepare');
    expect(source.value).toBe('transfer');
    expect(ui.byId('bronze-loop-trade-expired-policy').value).toBe('reprice');
    expect(prepare.disabled).toBe(false);
    expect(prepare.textContent).toBe('Prepare reprice');

    await ui.byId('bronze-loop-trade-preview').click();
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      id: 'transfer-observation',
      name: 'Transfer Observation',
      policy: expect.objectContaining({
        sources: ['transfer'],
        expiredPolicy: 'reprice',
      }),
    }), { platform: 'pc', provider: 'auto' });

    await ui.byId('bronze-loop-trade-diagnostics').click();
    expect(onDownloadDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
      job: expect.objectContaining({
        id: 'transfer-observation',
        policy: expect.objectContaining({ sources: ['transfer'], expiredPolicy: 'reprice' }),
      }),
      preview,
      prepared: null,
      receipt: null,
    }));

    await prepare.click();
    expect(onPrepare).toHaveBeenCalledWith(expect.objectContaining({
      id: 'transfer-observation',
      policy: expect.objectContaining({ sources: ['transfer'], expiredPolicy: 'reprice', maxListings: 4 }),
    }), { platform: 'pc', provider: 'auto' });
    const confirmation = ui.byId('bronze-loop-trade-confirmation');
    confirmation.value = 'REPRICE 1';
    confirmation.input();
    expect(ui.byId('bronze-loop-trade-execute').disabled).toBe(true);
    confirmation.value = 'REPRICE 2';
    confirmation.input();
    expect(ui.byId('bronze-loop-trade-execute').disabled).toBe(false);
    expect(ui.byId('bronze-loop-trade-execute').textContent).toBe('Reprice 2');
    await ui.byId('bronze-loop-trade-execute').click();
    expect(onExecute).toHaveBeenCalledWith({ confirmationToken: 'reprice-secret', confirmationText: 'REPRICE 2' });

    source.value = 'club,transfer';
    source.change();
    expect(prepare.disabled).toBe(true);
    await prepare.click();
    expect(onPrepare).toHaveBeenCalledTimes(1);

    source.value = 'transfer';
    source.change();
    const expiredPolicy = ui.byId('bronze-loop-trade-expired-policy');
    expiredPolicy.value = 'skip';
    expiredPolicy.change();
    expect(prepare.disabled).toBe(true);
    await prepare.click();
    expect(onPrepare).toHaveBeenCalledTimes(1);
  });
});
