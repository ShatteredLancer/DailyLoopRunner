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
      policy: { quantity: 1, maxPurchasesPerSearch: 1, searchDelaySeconds: [8, 15] },
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

    expect(ui.byId('bronze-loop-trade-scheduler-pause').disabled).toBe(true);
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

  it('previews Buy lanes without exposing a Buy execution action', async () => {
    const ui = uiHarness();
    const job = normalizeTradeJobEditorValue(createTradeJobDraft('buy', { now: 1000 }), { now: 1000 });
    const onPreviewBuyJob = vi.fn().mockResolvedValue({
      plan: { ready: true, missingRatings: [], lanes: [{ rating: 84, maxBuyNow: 1000, definitionIds: [8401, 8402] }] },
      summary: { ratings: 1, definitions: 2 },
    });
    showTradeSchedulerDialog({
      dom: ui.dom,
      snapshot: schedulerSnapshot(job),
      getCircuit: () => ({ circuit: { state: 'closed' } }),
      onPreviewBuyJob,
    });

    expect(ui.created.filter((element) => element.textContent === 'Run now')).toHaveLength(0);
    await ui.created.find((element) => element.textContent === 'Preview').click();
    expect(onPreviewBuyJob).toHaveBeenCalledWith(job);
    expect(ui.created.some((element) => element.textContent.includes('Preview only | 84: 2 player ID(s), max 1,000'))).toBe(true);
    expect(ui.byId('bronze-loop-trade-scheduler-status').textContent).toContain('execution remains locked');
  });
});
