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
  it('shows unresolved recovery evidence and disables acknowledgement while scheduling is unlocked', () => {
    const ui = uiHarness();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      getRecovery: () => ({
        reviewRequired: true,
        scheduler: { paused: false, liveExecutionEnabled: true },
        operation: { active: null, external: { busy: false } },
        lease: { active: false, owned: false },
        reviews: [{
          journalType: 'buy', runId: 'buy-recovery-1', jobId: 'buy-job', status: 'active',
          phase: 'buy-request-started', mutationItemCount: 1, uncertainItemCount: 1,
          evidenceHash: 'abc12345', risk: 'high',
        }],
        audit: { entries: [] },
      }),
    });
    expect(ui.byText('Scheduling unavailable: recovery-review-required; open Recovery and verify the previous EA result before another Job')).toBeTruthy();
    expect(ui.byId('bronze-loop-trade-enable-guarded-schedule').disabled).toBe(true);
    expect(ui.byId('bronze-loop-trade-enable-guarded-schedule').title).toBe('Resolve the previous Trade Journal in Recovery first');
    ui.byId('bronze-loop-trade-recovery-tab').click();
    expect(ui.byText('BUY Recovery | Run buy-recovery-1')).toBeTruthy();
    expect(ui.byId('bronze-loop-trade-recovery-ack-buy').disabled).toBe(true);
    expect(ui.byId('bronze-loop-trade-recovery-confirm-buy')).toBeUndefined();
    expect(ui.byId('bronze-loop-trade-recovery-resolution-buy')).toBeTruthy();
    expect(ui.byId('bronze-loop-trade-recovery-risk-buy')).toBeTruthy();
  });

  it('submits exact recovery evidence, a fixed resolution and risk acceptance only from a locked idle state', () => {
    const ui = uiHarness();
    const onAcknowledgeRecovery = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      getRecovery: () => ({
        scheduler: { paused: true, liveExecutionEnabled: false },
        operation: { active: null, external: { busy: false } },
        lease: { active: false, owned: false },
        reviews: [{
          journalType: 'listing', runId: 'listing-recovery-1', jobId: 'listing-job', status: 'active',
          phase: 'listing-request-started', mutationItemCount: 1, uncertainItemCount: 1,
          evidenceHash: 'def67890', risk: 'high',
        }],
        audit: { entries: [] },
      }),
      onAcknowledgeRecovery,
    });
    ui.byId('bronze-loop-trade-recovery-tab').click();
    const resolution = ui.byId('bronze-loop-trade-recovery-resolution-listing');
    const risk = ui.byId('bronze-loop-trade-recovery-risk-listing');
    const acknowledge = ui.byId('bronze-loop-trade-recovery-ack-listing');
    expect(acknowledge.disabled).toBe(true);
    resolution.value = 'confirmed-completed';
    resolution.change();
    expect(acknowledge.disabled).toBe(true);
    risk.checked = true;
    risk.change();
    expect(acknowledge.disabled).toBe(false);
    acknowledge.click();
    expect(onAcknowledgeRecovery).toHaveBeenCalledWith({
      journalType: 'listing', runId: 'listing-recovery-1', evidenceHash: 'def67890',
      resolution: 'confirmed-completed', riskAccepted: true,
    });
  });

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
        searchDelaySeconds: [7, 15],
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

  it('keeps the Armed control unavailable for Manual Jobs', () => {
    const ui = uiHarness();
    const onSaveJob = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onSaveJob,
    });

    ui.byId('bronze-loop-trade-new-listing').click();
    const armed = ui.byId('bronze-loop-trade-job-armed');
    const schedule = ui.byId('bronze-loop-trade-job-schedule');
    expect(armed.disabled).toBe(true);
    expect(armed.checked).toBe(false);

    schedule.value = 'once';
    schedule.change();
    expect(armed.disabled).toBe(false);
    armed.checked = true;

    schedule.value = 'manual';
    schedule.change();
    expect(armed.disabled).toBe(true);
    expect(armed.checked).toBe(false);
    ui.byId('bronze-loop-trade-job-save').click();
    expect(onSaveJob).toHaveBeenCalledWith(expect.objectContaining({ armed: false, schedule: { type: 'manual' } }));
  });

  it('saves per-rating Buy quantities and Listing quote fallback from the editor', () => {
    const buyUi = uiHarness();
    const onSaveBuy = vi.fn();
    showTradeSchedulerDialog({
      dom: buyUi.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onSaveJob: onSaveBuy,
    });
    buyUi.byId('bronze-loop-trade-new-buy').click();
    buyUi.byId('bronze-loop-trade-job-ratingMax').value = '86';
    buyUi.byId('bronze-loop-trade-job-quantity').value = '4';
    buyUi.byId('bronze-loop-trade-job-totalBudget').value = '4000';
    buyUi.byId('bronze-loop-trade-job-rating-quantities').value = '84=2, 85=1, 86=1';
    buyUi.byId('bronze-loop-trade-job-purchases-per-search').value = '3';
    buyUi.byId('bronze-loop-trade-job-buy-delay-min').value = '0.2';
    buyUi.byId('bronze-loop-trade-job-buy-delay-max').value = '0.5';
    buyUi.byId('bronze-loop-trade-job-cycle-pause-enabled').checked = false;
    buyUi.byId('bronze-loop-trade-job-cycle-every-min').value = '12';
    buyUi.byId('bronze-loop-trade-job-cycle-every-max').value = '18';
    buyUi.byId('bronze-loop-trade-job-cycle-pause-min').value = '6';
    buyUi.byId('bronze-loop-trade-job-cycle-pause-max').value = '9';
    buyUi.byId('bronze-loop-trade-job-cooldown-initial').value = '90';
    buyUi.byId('bronze-loop-trade-job-cooldown-maximum').value = '900';
    buyUi.byId('bronze-loop-trade-job-save').click();
    expect(onSaveBuy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'buy',
      policy: expect.objectContaining({
        ratingMin: 84,
        ratingMax: 86,
        quantity: 4,
        totalBudget: 4000,
        ratingQuantityOverrides: { 84: 2, 85: 1, 86: 1 },
        maxPurchasesPerSearch: 3,
        buyDelaySeconds: [0.2, 0.5],
        searchCyclePauseEnabled: false,
        searchCyclePauseEvery: [12, 18],
        searchCyclePauseSeconds: [6, 9],
        initialRateLimitCooldownSeconds: 90,
        maximumRateLimitCooldownSeconds: 900,
      }),
    }));

    const listingUi = uiHarness();
    const onSaveListing = vi.fn();
    showTradeSchedulerDialog({
      dom: listingUi.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onSaveJob: onSaveListing,
    });
    listingUi.byId('bronze-loop-trade-new-listing').click();
    listingUi.byId('bronze-loop-trade-job-market-enabled').checked = true;
    listingUi.byId('bronze-loop-trade-job-quote-fallback').value = 'skip';
    listingUi.byId('bronze-loop-trade-job-list-delay-min').value = '2';
    listingUi.byId('bronze-loop-trade-job-list-delay-max').value = '5';
    listingUi.byId('bronze-loop-trade-job-cooldown-initial').value = '45';
    listingUi.byId('bronze-loop-trade-job-cooldown-maximum').value = '600';
    listingUi.byId('bronze-loop-trade-job-save').click();
    expect(onSaveListing).toHaveBeenCalledWith(expect.objectContaining({
      type: 'listing',
      policy: expect.objectContaining({
        marketOverride: expect.objectContaining({ enabled: true, fallbackPolicy: 'skip' }),
        listingDelaySeconds: [2, 5],
        initialRateLimitCooldownSeconds: 45,
        maximumRateLimitCooldownSeconds: 600,
      }),
    }));
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

  it('keeps manual Re-list All and exposes a separate conservative scheduled Job draft', () => {
    const ui = uiHarness();
    const onOpenBulkRelist = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onOpenBulkRelist,
    });
    ui.byId('bronze-loop-trade-bulk-relist').click();
    expect(onOpenBulkRelist).toHaveBeenCalledOnce();
    ui.byId('bronze-loop-trade-new-bulk-relist').click();
    expect(ui.byId('bronze-loop-trade-job-card-class')).toBeUndefined();
    expect(ui.byId('bronze-loop-trade-job-interval').value).toBe('300');
    ui.byId('bronze-loop-trade-job-interval-60').click();
    expect(ui.byId('bronze-loop-trade-job-interval').value).toBe('60');
    ui.byId('bronze-loop-trade-job-interval-600').click();
    expect(ui.byId('bronze-loop-trade-job-interval').value).toBe('600');
    expect(ui.byId('bronze-loop-trade-job-relist-delay-min').value).toBe('3');
    expect(ui.byId('bronze-loop-trade-job-relist-delay-max').value).toBe('8');
  });

  it('refreshes a scheduled result in-place and disposes the refresh timer on close', () => {
    const ui = uiHarness();
    const draft = createTradeJobDraft('listing', { now: 1000 });
    const job = normalizeTradeJobEditorValue({
      ...draft,
      armed: true,
      schedule: { type: 'once', runAt: 120000 },
      policy: { ...draft.policy, maxListings: 2 },
    }, { now: 1000 });
    let snapshot = {
      ...schedulerSnapshot(job),
      paused: false,
      liveExecutionEnabled: true,
    };
    let refresh;
    const scheduleRefresh = vi.fn((callback) => {
      refresh = callback;
      return 41;
    });
    const cancelRefresh = vi.fn();

    showTradeSchedulerDialog({
      dom: ui.dom,
      getSnapshot: () => snapshot,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      scheduleRefresh,
      cancelRefresh,
    });
    expect(scheduleRefresh).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(ui.byId('bronze-loop-trade-scheduler-modal').children[0].children[2].textContent)
      .toContain('Scheduler: running | Automatic execution: enabled');

    snapshot = {
      ...schedulerSnapshot({ ...job, armed: false }),
      paused: true,
      liveExecutionEnabled: false,
      runtimes: {
        [job.id]: {
          status: 'completed', nextRunAt: null, runCount: 1,
          lastStartedAt: 120000, lastFinishedAt: 121000,
        },
      },
      history: [{
        jobId: job.id, jobType: 'listing', status: 'completed',
        requested: 2, succeeded: 2, startedAt: 120000,
      }],
    };
    refresh();

    expect(ui.byId('bronze-loop-trade-scheduler-modal').children[0].children[2].textContent)
      .toContain('Scheduler: paused | Automatic execution: locked');
    ui.byId('bronze-loop-trade-history-tab').click();
    expect(ui.created.some((element) => element.textContent === 'listing | completed | 2/2')).toBe(true);
    ui.byId('bronze-loop-trade-scheduler-close').click();
    expect(cancelRefresh).toHaveBeenCalledWith(41);
  });

  it('shows persisted pacing resume time and slice progress on a Job card', () => {
    const ui = uiHarness();
    const draft = createTradeJobDraft('buy', { now: 1000 });
    const job = normalizeTradeJobEditorValue({
      ...draft,
      armed: true,
      schedule: { type: 'interval', intervalSeconds: 30, anchorAt: 1000 },
      policy: { ...draft.policy, quantity: 4, totalBudget: 4000 },
    }, { now: 1000 });
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: {
        ...schedulerSnapshot(job),
        paused: false,
        liveExecutionEnabled: true,
        runtimes: {
          [job.id]: {
            jobId: job.id,
            status: 'waiting-pace',
            reason: 'trade-action-pacing',
            nextRunAt: 1000,
            continuation: {
              runId: 'buy-sliced', scheduledFor: 1000, startedAt: 1000,
              resumeAt: 5000, sliceCount: 2, requested: 4, succeeded: 2,
            },
          },
        },
      },
      getCircuit: () => ({ circuit: { state: 'closed' } }),
    });

    expect(ui.byText('waiting-pace')).toBeTruthy();
    expect(ui.created.some((element) => (
      element.textContent.includes('Resume')
      && element.textContent.includes('Slice 2')
      && element.textContent.includes('2/4 complete')
    ))).toBe(true);
  });

  it('clears stale action status when an external Scheduler transition is rendered', async () => {
    const ui = uiHarness();
    const job = normalizeTradeJobEditorValue({
      ...createTradeJobDraft('listing', { now: 1000 }),
      armed: true,
      schedule: { type: 'once', runAt: 120000 },
    }, { now: 1000 });
    let snapshot = schedulerSnapshot(job);
    let refresh;
    const onEnableGuardedScheduling = vi.fn(async () => {
      snapshot = { ...snapshot, paused: false, liveExecutionEnabled: true };
    });
    showTradeSchedulerDialog({
      dom: ui.dom,
      getSnapshot: () => snapshot,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onEnableGuardedScheduling,
      scheduleRefresh: (callback) => { refresh = callback; return 17; },
      cancelRefresh: vi.fn(),
    });

    await ui.byId('bronze-loop-trade-enable-guarded-schedule').click();
    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent)
      .toBe('Guarded schedule enabled for 1 Job(s)');

    snapshot = {
      ...schedulerSnapshot({ ...job, armed: false }),
      runtimes: { [job.id]: { status: 'completed', nextRunAt: null, runCount: 1 } },
    };
    refresh();

    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent).toBe('');
  });

  it('does not rebuild an active Job editor during an external refresh', () => {
    const ui = uiHarness();
    let snapshot = schedulerSnapshot();
    let refresh;
    showTradeSchedulerDialog({
      dom: ui.dom,
      getSnapshot: () => snapshot,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      scheduleRefresh: (callback) => { refresh = callback; return 9; },
      cancelRefresh: vi.fn(),
    });

    ui.byId('bronze-loop-trade-new-listing').click();
    const name = ui.byId('bronze-loop-trade-job-name');
    name.value = 'Unsaved operator input';
    snapshot = { ...snapshot, safety: { minimumRetainedCoins: 100000 } };
    refresh();

    expect(ui.byId('bronze-loop-trade-job-name')).toBe(name);
    expect(name.value).toBe('Unsaved operator input');
  });

  it('exposes persistent circuit state and gates reset behind risk acceptance', () => {
    const ui = uiHarness();
    const onResetCircuit = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'open', reason: 'auction-operation-blocked' } }),
      onResetCircuit,
    });
    const reset = ui.byId('bronze-loop-trade-circuit-reset');
    const risk = ui.byId('bronze-loop-trade-circuit-risk');
    expect(reset.disabled).toBe(true);
    reset.click();
    expect(onResetCircuit).not.toHaveBeenCalled();
    risk.checked = true;
    risk.change();
    expect(reset.disabled).toBe(false);
    reset.click();
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
      now: () => 1000,
      snapshot: {
        ...schedulerSnapshot(),
        metrics: {
          firstRecordedAt: 1000,
          lastRecordedAt: 2000,
          runs: { total: 4, byStatus: { completed: 2, blocked: 1, missed: 1 }, byJobType: { buy: 2, listing: 2 } },
          outcomes: { requested: 3, succeeded: 2, failed: 1, skipped: 0 },
          buy: { purchases: 1, searches: 3, attempts: 1, spent: 1200 },
          listing: { listed: 1 },
          bulkRelist: { relisted: 7 },
          reasons: [{ reason: 'trade-circuit-open', count: 1 }],
        },
      },
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      getRequestPacing: () => ({
        status: 'cooldown', reason: 'rate-limit', nextAllowedAt: 6000,
        lastAction: { action: 'market-search', delaySeconds: 7, jobId: 'buy-1' },
        cycle: { count: 2, threshold: 10 },
        cooldown: { active: true, level: 2, retryAt: 6000 },
      }),
    });
    expect(ui.byId('bronze-loop-trade-scheduler-modal').children[0].children[2].textContent)
      .toContain('Pacing: cooldown');
    ui.byId('bronze-loop-trade-summary-tab').click();
    expect(ui.byText('Summary')).toBeTruthy();
    expect(ui.byText('1,200')).toBeTruthy();
    expect(ui.byText('trade-circuit-open')).toBeTruthy();
    expect(ui.byText('Request pacing')).toBeTruthy();
    expect(ui.byText('Re-list All')).toBeTruthy();
    expect(ui.byText('Relisted')).toBeTruthy();
    expect(ui.byText('market-search')).toBeTruthy();
    expect(ui.byText('7 sec')).toBeTruthy();
    expect(ui.created.some((element) => element.textContent.startsWith('Next Trade action allowed after'))).toBe(true);
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
        futGgCircuit: { state: 'open', blockedUntil: 61000, reason: 'HTTP 403' },
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
    expect(ui.created.some((element) => element.textContent === 'FUT.GG circuit')).toBe(true);
    expect(ui.created.some((element) => element.textContent === 'open')).toBe(true);
    expect(ui.byId('bronze-loop-trade-clear-player-catalog').disabled).toBe(false);
    expect(ui.byId('bronze-loop-trade-clear-price-quotes').disabled).toBe(false);
    ui.byId('bronze-loop-trade-clear-player-catalog').click();
    expect(onClearPlayerCatalogCache).toHaveBeenCalledOnce();
    expect(ui.created.filter((element) => element.id === 'bronze-loop-trade-clear-player-catalog').at(-1).disabled).toBe(true);
    ui.created.filter((element) => element.id === 'bronze-loop-trade-clear-price-quotes').at(-1).click();
    expect(onClearPriceQuoteCache).toHaveBeenCalledOnce();
  });

  it('saves and clears the FUT.GG forwarding proxy from Providers', () => {
    const ui = uiHarness();
    const onSetFutGgProxy = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      getProviderHealth: () => ({ priceQuotes: { futGgProxy: { configured: false }, cache: {} } }),
      getFutGgProxy: () => '',
      onSetFutGgProxy,
    });
    ui.byId('bronze-loop-trade-providers-tab').click();
    const proxy = ui.byId('bronze-loop-trade-futgg-proxy');
    proxy.value = 'https://prices.example/';
    ui.byId('bronze-loop-trade-save-futgg-proxy').click();
    expect(onSetFutGgProxy).toHaveBeenCalledWith('https://prices.example/');
    expect(ui.created.some((element) => element.textContent.includes('FUT.GG proxy saved'))).toBe(true);
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
    expect(ui.created.some((element) => element.textContent.includes('Preview only | 84: 2 player ID(s), max 1,000, quota Run cap'))).toBe(true);
    expect(ui.created.some((element) => element.textContent.includes('Budget 1,000 | Runtime 15 min | Chunk 2 | Up to 1 purchase(s) per search'))).toBe(true);
    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent).toContain('Buy 1 is available');
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

  it('uses direct approval for one eligible armed Job', async () => {
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
    const enable = ui.byId('bronze-loop-trade-enable-guarded-schedule');
    expect(enable.disabled).toBe(false);
    expect(ui.byId('bronze-loop-trade-guarded-confirmation')).toBeUndefined();
    await enable.click();
    expect(onEnableGuardedScheduling).toHaveBeenCalledWith({ approved: true, jobId: eligible.id });
    expect(ui.byId('bronze-loop-trade-disable-guarded-schedule')).toBeTruthy();
    ui.byId('bronze-loop-trade-disable-guarded-schedule').click();
    expect(onDisableGuardedScheduling).toHaveBeenCalledOnce();
    expect(snapshot.jobs[0].armed).toBe(false);
  });

  it('uses direct approval for Transfer reprice when its live gate is enabled', async () => {
    const ui = uiHarness();
    const draft = createTradeJobDraft('listing', { now: 1000 });
    const eligible = normalizeTradeJobEditorValue({
      ...draft,
      armed: true,
      schedule: { type: 'once', runAt: 120000 },
      policy: {
        ...draft.policy,
        sources: ['transfer'],
        maxListings: 1,
        expiredPolicy: 'reprice',
      },
    }, { now: 1000 });
    const onEnableGuardedScheduling = vi.fn();
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(eligible),
      scheduledTransferRepriceEnabled: true,
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onEnableGuardedScheduling,
    });
    const enable = ui.byId('bronze-loop-trade-enable-guarded-schedule');
    expect(enable.disabled).toBe(false);
    await enable.click();
    expect(onEnableGuardedScheduling).toHaveBeenCalledWith({
      approved: true,
      jobId: eligible.id,
    });
  });

  it('disables guarded scheduling when no eligible armed Job exists', () => {
    const ui = uiHarness();
    showTradeSchedulerDialog({ dom: ui.dom, snapshot: schedulerSnapshot(), getCircuit: () => ({ circuit: { state: 'closed' } }) });
    const enable = ui.byId('bronze-loop-trade-enable-guarded-schedule');
    expect(enable.disabled).toBe(true);
    expect(enable.title).toBe('Create or arm a Job before enabling scheduling');
    expect(ui.byText('Scheduler idle: no armed Job; completed Once Jobs are automatically disarmed')).toBeTruthy();
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

  it('shows the effective reserve in the scheduled Buy approval summary', async () => {
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

    const enable = ui.byId('bronze-loop-trade-enable-guarded-schedule');
    expect(enable.disabled).toBe(false);
    expect(ui.created.some((element) => element.textContent.includes('reserve 150,000'))).toBe(true);
    await enable.click();
    expect(onEnableGuardedScheduling).toHaveBeenCalledWith({
      approved: true,
      jobId: scheduledBuy.id,
    });
  });

  it('passes direct two-item approvals through the guarded Scheduler UI', async () => {
    const listingDraft = createTradeJobDraft('listing', { now: 1000 });
    const buyDraft = createTradeJobDraft('buy', { now: 1000 });
    const cases = [
      {
        job: normalizeTradeJobEditorValue({
          ...listingDraft,
          id: 'club-two', armed: true, schedule: { type: 'once', runAt: 120000 },
          policy: { ...listingDraft.policy, maxListings: 2 },
        }, { now: 1000 }),
      },
      {
        job: normalizeTradeJobEditorValue({
          ...listingDraft,
          id: 'transfer-two', armed: true, schedule: { type: 'once', runAt: 120000 },
          policy: {
            ...listingDraft.policy, sources: ['transfer'], expiredPolicy: 'reprice', maxListings: 2,
          },
        }, { now: 1000 }),
      },
      {
        job: normalizeTradeJobEditorValue({
          ...buyDraft,
          id: 'buy-two', armed: true, schedule: { type: 'once', runAt: 120000 },
          policy: {
            ...buyDraft.policy, ratingMax: 85, quantity: 2, totalBudget: 2000,
          },
        }, { now: 1000 }),
      },
    ];

    for (const entry of cases) {
      const ui = uiHarness();
      const onEnableGuardedScheduling = vi.fn();
      showTradeSchedulerDialog({
        dom: ui.dom,
        snapshot: {
          ...schedulerSnapshot(entry.job),
          safety: { minimumRetainedCoins: 100000 },
        },
        scheduledTransferRepriceEnabled: true,
        scheduledBuyEnabled: true,
        getCircuit: () => ({ circuit: { state: 'closed' } }),
        onEnableGuardedScheduling,
      });
      const enable = ui.byId('bronze-loop-trade-enable-guarded-schedule');
      expect(ui.created.some((element) => element.textContent.includes('2 item(s)'))).toBe(true);
      await enable.click();
      expect(onEnableGuardedScheduling).toHaveBeenCalledWith({
        approved: true,
        jobId: entry.job.id,
      });
    }
  });
});
