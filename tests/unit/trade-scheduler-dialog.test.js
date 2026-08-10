import { describe, expect, it, vi } from 'vitest';
import {
  createTradeJobDraft,
  normalizeTradeJobEditorValue,
  showTradeSchedulerDialog,
  tradeScheduleSummary,
} from '../../src/ui/trade-scheduler-dialog.js';

function uiHarness() {
  const created = [];
  const body = [];
  const root = { dataset: { dlrLayout: 'desktop', dlrInput: 'pointer' }, getAttribute: () => null };
  function create(tagName) {
    const listeners = new Map();
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
    byText: (text) => created.find((element) => element.textContent === text),
    dom: {
      create,
      query: (selector) => selector === ':root' ? root : null,
      appendToBody: (element) => body.push(element),
    },
  };
}

function schedulerSnapshot(job = null) {
  return {
    paused: true,
    liveExecutionEnabled: false,
    jobs: job ? [job] : [],
    runtimes: job ? { [job.id]: { status: 'waiting-time', nextRunAt: job.schedule.runAt ?? null } } : {},
    history: [],
  };
}

describe('Trade Scheduler dialog', () => {
  it('creates conservative unarmed Buy and Listing drafts', () => {
    expect(createTradeJobDraft('listing', { now: 1000 })).toMatchObject({
      id: 'listing-1000', type: 'listing', enabled: true, armed: false,
      schedule: { type: 'manual' }, policy: { sources: ['club'], maxListings: 1 },
    });
    expect(createTradeJobDraft('buy', { now: 1000 })).toMatchObject({
      id: 'buy-1000', type: 'buy', armed: false,
      policy: {
        quantity: 1,
        minimumRetainedCoins: null,
        maxPurchasesPerSearch: 1,
        searchDelaySeconds: [8, 15],
      },
    });
  });

  it('normalizes editor values and summarizes schedules', () => {
    const draft = createTradeJobDraft('listing', { now: 1000 });
    draft.name = 'Morning list';
    draft.schedule = { type: 'daily', time: '09:30', timezone: 'Asia/Shanghai' };
    const normalized = normalizeTradeJobEditorValue(draft, { now: 2000 });
    expect(normalized).toMatchObject({ name: 'Morning list', armed: false, schedule: { type: 'daily', time: '09:30', timezone: 'Asia/Shanghai' } });
    expect(tradeScheduleSummary(normalized)).toBe('Daily 09:30 Asia/Shanghai');
  });

  it('keeps automatic execution locked while allowing Jobs and manual Listing entry', () => {
    const ui = uiHarness();
    const job = normalizeTradeJobEditorValue({
      ...createTradeJobDraft('listing', { now: 1000 }),
      name: 'Saved listing',
      schedule: { type: 'once', runAt: 2000 },
    }, { now: 1000 });
    const onOpenManualListing = vi.fn();
    const onSaveJob = vi.fn();
    let snapshot = schedulerSnapshot(job);
    showTradeSchedulerDialog({
      dom: ui.dom,
      now: () => 3000,
      getSnapshot: () => snapshot,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onOpenManualListing,
      onSaveJob: (saved) => { onSaveJob(saved); snapshot = schedulerSnapshot(saved); },
    });

    expect(ui.byId('bronze-loop-trade-scheduler-pause')).toBeUndefined();
    ui.byId('bronze-loop-trade-manual-listing').click();
    expect(onOpenManualListing).toHaveBeenCalledWith();
    const runButtons = ui.created.filter((element) => element.textContent === 'Run now');
    runButtons[0].click();
    expect(onOpenManualListing).toHaveBeenCalledWith(job);

    ui.byId('bronze-loop-trade-new-listing').click();
    ui.byId('bronze-loop-trade-job-name').value = 'Another listing';
    ui.byId('bronze-loop-trade-job-save').click();
    expect(onSaveJob).toHaveBeenCalledWith(expect.objectContaining({ name: 'Another listing', armed: false, type: 'listing' }));
  });

  it('exposes persistent circuit state and an explicit reset action', () => {
    const ui = uiHarness();
    const onResetCircuit = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'open', reason: 'auction-operation-blocked' } }),
      onResetCircuit,
    });
    expect(ui.byId('bronze-loop-trade-circuit-reset').style.display).toBe('');
    ui.byId('bronze-loop-trade-circuit-reset').click();
    expect(onResetCircuit).toHaveBeenCalledOnce();
  });

  it('persists an explicit global scheduled Buy reserve', () => {
    const ui = uiHarness();
    let snapshot = { ...schedulerSnapshot(), safety: { minimumRetainedCoins: null } };
    const onSetMinimumRetainedCoins = vi.fn((value) => {
      snapshot = { ...snapshot, safety: { minimumRetainedCoins: value } };
    });
    showTradeSchedulerDialog({
      dom: ui.dom,
      getSnapshot: () => snapshot,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onSetMinimumRetainedCoins,
    });
    ui.byId('bronze-loop-trade-global-minimum-retained-coins').value = '100000';
    ui.byId('bronze-loop-trade-save-global-reserve').click();
    expect(onSetMinimumRetainedCoins).toHaveBeenCalledWith(100000);
    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent).toContain('100,000');
  });

  it('shows persistent long-run Trade metrics separately from bounded History', () => {
    const ui = uiHarness();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: {
        ...schedulerSnapshot(),
        metrics: {
          firstRecordedAt: 1000,
          lastRecordedAt: 2000,
          runs: { total: 4, byStatus: { completed: 2, blocked: 1, missed: 1 }, byJobType: { buy: 2, listing: 2 } },
          outcomes: { requested: 3, succeeded: 2, failed: 1, skipped: 0 },
          buy: { purchases: 1, searches: 3, attempts: 1, spent: 1200 },
          listing: { listed: 1 },
          reasons: [{ reason: 'trade-circuit-open', count: 1 }],
        },
      },
      getCircuit: () => ({ circuit: { state: 'closed' } }),
    });
    ui.byId('bronze-loop-trade-summary-tab').click();
    expect(ui.byText('Summary')).toBeTruthy();
    expect(ui.byText('1,200')).toBeTruthy();
    expect(ui.byText('trade-circuit-open')).toBeTruthy();
    expect(ui.created.some((element) => element.textContent.startsWith('Tracked '))).toBe(true);
  });

  it('shows provider health without loading and relocks before explicit cache clearing', () => {
    const ui = uiHarness();
    let health = {
      playerCatalog: {
        provider: 'FUTNext', status: 'fresh',
        cache: { platform: 'pc', season: '26', lanes: 2, freshLanes: 2, expiredLanes: 0, definitions: 50 },
        activity: { loadCount: 1, lastLoad: { at: 1000 } },
      },
      priceQuotes: {
        providers: ['FUT.GG', 'FUTNext'], status: 'partial',
        cache: { entries: 3, freshEntries: 2, expiredEntries: 1, bySource: { 'FUT.GG': 2, FUTNext: 1 }, byPlatform: { pc: 3 } },
        activity: { loadCount: 2, lastLoad: { at: 1000 } },
      },
    };
    const onClearPlayerCatalogCache = vi.fn(() => {
      health = { ...health, playerCatalog: { ...health.playerCatalog, status: 'empty', cache: { lanes: 0, freshLanes: 0, expiredLanes: 0, definitions: 0 }, activity: { loadCount: 1 } } };
    });
    const onClearPriceQuoteCache = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      getProviderHealth: () => health,
      onClearPlayerCatalogCache,
      onClearPriceQuoteCache,
    });
    ui.byId('bronze-loop-trade-providers-tab').click();
    expect(ui.created.some((element) => element.textContent === 'Player catalog')).toBe(true);
    expect(ui.created.some((element) => element.textContent.includes('FUTNext'))).toBe(true);
    expect(ui.byId('bronze-loop-trade-clear-player-catalog').disabled).toBe(false);
    expect(ui.byId('bronze-loop-trade-clear-price-quotes').disabled).toBe(false);
    ui.byId('bronze-loop-trade-clear-player-catalog').click();
    expect(onClearPlayerCatalogCache).toHaveBeenCalledOnce();
    expect(ui.created.filter((element) => element.id === 'bronze-loop-trade-clear-player-catalog').at(-1).disabled).toBe(true);
    ui.created.filter((element) => element.id === 'bronze-loop-trade-clear-price-quotes').at(-1).click();
    expect(onClearPriceQuoteCache).toHaveBeenCalledOnce();
  });

  it('exports Job-only config and requires unchanged validated JSON before atomic import', () => {
    const ui = uiHarness();
    const existing = normalizeTradeJobEditorValue(createTradeJobDraft('listing', { now: 1000 }), { now: 1000 });
    const imported = normalizeTradeJobEditorValue({
      ...createTradeJobDraft('buy', { now: 2000 }),
      id: 'imported-buy',
      armed: false,
    }, { now: 2000 });
    let snapshot = schedulerSnapshot(existing);
    const onExportJobConfig = vi.fn();
    const onValidateJobConfig = vi.fn(() => ({ jobs: [imported] }));
    const onImportJobConfig = vi.fn(() => {
      snapshot = schedulerSnapshot(imported);
      return { jobs: [imported] };
    });
    showTradeSchedulerDialog({
      dom: ui.dom,
      getSnapshot: () => snapshot,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onExportJobConfig,
      onValidateJobConfig,
      onImportJobConfig,
    });

    ui.byId('bronze-loop-trade-export-config').click();
    expect(onExportJobConfig).toHaveBeenCalledOnce();
    ui.byId('bronze-loop-trade-import-config').click();
    const textarea = ui.byId('bronze-loop-trade-import-json');
    const validate = ui.byId('bronze-loop-trade-import-validate');
    const apply = ui.byId('bronze-loop-trade-import-apply');
    textarea.value = '{"jobs":[1]}';
    validate.click();
    expect(onValidateJobConfig).toHaveBeenCalledWith('{"jobs":[1]}');
    expect(apply.disabled).toBe(false);

    textarea.value = '{"jobs":[2]}';
    apply.click();
    expect(onImportJobConfig).not.toHaveBeenCalled();
    expect(apply.disabled).toBe(true);
    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent).toContain('validate again');

    validate.click();
    apply.click();
    expect(onImportJobConfig).toHaveBeenCalledWith('{"jobs":[2]}');
    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent).toContain('all Jobs are unarmed');
    expect(ui.created.some((element) => element.textContent === 'imported-buy')).toBe(false);
    expect(ui.created.some((element) => element.textContent === 'Buy Job')).toBe(true);
  });

  it('exposes guarded single Buy only after a ready Preview', async () => {
    const ui = uiHarness();
    const job = normalizeTradeJobEditorValue(createTradeJobDraft('buy', { now: 1000 }), { now: 1000 });
    const onPreviewBuyJob = vi.fn().mockResolvedValue({
      plan: { ready: true, missingRatings: [], lanes: [{ rating: 84, maxBuyNow: 1000, definitionIds: [8401, 8402] }] },
      summary: { ratings: 1, definitions: 2 },
    });
    const onOpenManualBuy = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(job),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onPreviewBuyJob,
      onOpenManualBuy,
    });

    expect(ui.created.filter((element) => element.textContent === 'Run now')).toHaveLength(0);
    expect(ui.created.filter((element) => element.textContent === 'Buy one')).toHaveLength(0);
    await ui.created.find((element) => element.textContent === 'Preview').click();
    expect(onPreviewBuyJob).toHaveBeenCalledWith(job);
    expect(ui.created.some((element) => element.textContent.includes('Preview only | 84: 2 player ID(s), max 1,000'))).toBe(true);
    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent).toContain('Buy one is available');
    const buy = ui.byId(`bronze-loop-trade-buy-one-${job.id}`);
    expect(buy).toBeTruthy();
    buy.click();
    expect(onOpenManualBuy).toHaveBeenCalledWith(job, expect.objectContaining({ plan: expect.objectContaining({ ready: true }) }));
  });

  it('keeps the single Buy action hidden while guarded scheduling is unlocked', async () => {
    const ui = uiHarness();
    const job = normalizeTradeJobEditorValue(createTradeJobDraft('buy', { now: 1000 }), { now: 1000 });
    const snapshot = { ...schedulerSnapshot(job), paused: false, liveExecutionEnabled: true };
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onPreviewBuyJob: vi.fn().mockResolvedValue({
        plan: { ready: true, missingRatings: [], lanes: [{ rating: 84, maxBuyNow: 1000, definitionIds: [8401] }] },
        summary: { ratings: 1, definitions: 1 },
      }),
    });
    await ui.created.find((element) => element.textContent === 'Preview').click();
    expect(ui.created.filter((element) => element.textContent === 'Buy one')).toHaveLength(0);
    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent).toContain('scheduler-must-be-paused-and-live-disabled');
  });

  it('requires exact confirmation and one eligible armed Job for guarded scheduling', async () => {
    const ui = uiHarness();
    const eligible = normalizeTradeJobEditorValue({
      ...createTradeJobDraft('listing', { now: 1000 }),
      armed: true,
      schedule: { type: 'once', runAt: 120000 },
    }, { now: 1000 });
    let snapshot = schedulerSnapshot(eligible);
    const onEnableGuardedScheduling = vi.fn(async () => {
      snapshot = { ...snapshot, paused: false, liveExecutionEnabled: true };
    });
    const onDisableGuardedScheduling = vi.fn(() => {
      snapshot = {
        ...snapshot,
        paused: true,
        liveExecutionEnabled: false,
        jobs: snapshot.jobs.map((job) => ({ ...job, armed: false })),
      };
    });
    showTradeSchedulerDialog({
      dom: ui.dom,
      getSnapshot: () => snapshot,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onEnableGuardedScheduling,
      onDisableGuardedScheduling,
    });
    const confirmation = ui.byId('bronze-loop-trade-guarded-confirmation');
    const enable = ui.byId('bronze-loop-trade-enable-guarded-schedule');
    expect(enable.disabled).toBe(false);
    confirmation.value = 'RUN ONCE';
    await enable.click();
    expect(onEnableGuardedScheduling).not.toHaveBeenCalled();
    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent).toContain('RUN ONCE 1');
    confirmation.value = 'RUN ONCE 1';
    await enable.click();
    expect(onEnableGuardedScheduling).toHaveBeenCalledWith({ confirmationText: 'RUN ONCE 1', jobId: eligible.id });
    expect(ui.byId('bronze-loop-trade-disable-guarded-schedule')).toBeTruthy();
    ui.byId('bronze-loop-trade-disable-guarded-schedule').click();
    expect(onDisableGuardedScheduling).toHaveBeenCalledOnce();
    expect(snapshot.jobs[0].armed).toBe(false);
  });

  it('disables guarded scheduling when no eligible armed Job exists', () => {
    const ui = uiHarness();
    showTradeSchedulerDialog({ dom: ui.dom, snapshot: schedulerSnapshot(), getCircuit: () => ({ circuit: { state: 'closed' } }) });
    expect(ui.byId('bronze-loop-trade-enable-guarded-schedule').disabled).toBe(true);
  });

  it('shows the separate scheduled Buy gate as disabled during the offline TS5 stage', () => {
    const ui = uiHarness();
    const scheduledBuy = normalizeTradeJobEditorValue({
      ...createTradeJobDraft('buy', { now: 1000 }),
      armed: true,
      schedule: { type: 'once', runAt: 120000 },
    }, { now: 1000 });
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: {
        ...schedulerSnapshot(scheduledBuy),
        safety: { minimumRetainedCoins: 100000 },
      },
      scheduledBuyEnabled: false,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
    });
    const enable = ui.byId('bronze-loop-trade-enable-guarded-schedule');
    expect(enable.disabled).toBe(true);
    expect(enable.title).toBe('scheduled-buy-validation-gate-disabled');
  });

  it('requires the effective reserve in the scheduled Buy live confirmation', async () => {
    const ui = uiHarness();
    const scheduledBuy = normalizeTradeJobEditorValue({
      ...createTradeJobDraft('buy', { now: 1000 }),
      armed: true,
      schedule: { type: 'once', runAt: 120000 },
      policy: {
        ...createTradeJobDraft('buy', { now: 1000 }).policy,
        minimumRetainedCoins: 150000,
      },
    }, { now: 1000 });
    const onEnableGuardedScheduling = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: {
        ...schedulerSnapshot(scheduledBuy),
        safety: { minimumRetainedCoins: 100000 },
      },
      scheduledBuyEnabled: true,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onEnableGuardedScheduling,
    });

    const confirmation = ui.byId('bronze-loop-trade-guarded-confirmation');
    const enable = ui.byId('bronze-loop-trade-enable-guarded-schedule');
    expect(enable.disabled).toBe(false);
    expect(confirmation.placeholder).toBe('RUN BUY ONCE 1 RESERVE 150000');
    confirmation.value = 'RUN ONCE 1';
    await enable.click();
    expect(onEnableGuardedScheduling).not.toHaveBeenCalled();
    confirmation.value = 'RUN BUY ONCE 1 RESERVE 150000';
    await enable.click();
    expect(onEnableGuardedScheduling).toHaveBeenCalledWith({
      confirmationText: 'RUN BUY ONCE 1 RESERVE 150000',
      jobId: scheduledBuy.id,
    });
  });
});
