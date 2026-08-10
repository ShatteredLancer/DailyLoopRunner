import { normalizeTradeJob } from '../trade/contracts.js';
import {
  GUARDED_SCHEDULE_CONFIRMATION,
  selectGuardedScheduledListingJob,
} from '../trade/guarded-scheduled-listing.js';
import { applyResponsiveDialogLayout, readResponsiveUiMode, responsiveControlHeight } from './responsive-dialog.js';

const PAGE_SIZE = 15;
const RANGE_SCHEDULE = ['win', 'dow'].join('');
const GRACE_MISFIRE = ['grace', 'win', 'dow'].join('-');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function styles(element, values) {
  Object.assign(element.style, values);
  return element;
}

function button(dom, text, mode, id = '') {
  const value = dom.create('button');
  value.type = 'button';
  value.textContent = text;
  if (id) value.id = id;
  styles(value, {
    minHeight: responsiveControlHeight(mode), padding: '0 12px', cursor: 'pointer', color: '#f4f6f8',
    background: '#222832', border: '1px solid #607089',
  });
  return value;
}

function input(dom, type, value, mode, id = '') {
  const control = dom.create(type === 'select' ? 'select' : 'input');
  if (type !== 'select') control.type = type;
  if (id) control.id = id;
  if (type === 'checkbox') control.checked = value === true;
  else control.value = String(value ?? '');
  styles(control, {
    minHeight: type === 'checkbox' ? 'auto' : responsiveControlHeight(mode), minWidth: '0', width: type === 'checkbox' ? 'auto' : '100%',
    boxSizing: 'border-box', background: '#222832', color: '#f4f6f8', border: type === 'checkbox' ? '0' : '1px solid #607089', padding: type === 'checkbox' ? '0' : '0 8px',
    fontSize: mode.touchTargets && type !== 'checkbox' ? '16px' : '',
  });
  return control;
}

function select(dom, value, entries, mode, id = '') {
  const control = input(dom, 'select', value, mode, id);
  for (const entry of entries) {
    const option = dom.create('option');
    option.value = String(entry.value);
    option.textContent = entry.text;
    control.appendChild(option);
  }
  control.value = String(value);
  return control;
}

function field(dom, text, control, mode) {
  const label = styles(dom.create('label'), {
    display: 'grid', gridTemplateColumns: mode.mobile ? '1fr' : '145px minmax(0, 1fr)', alignItems: 'center', gap: '8px', minWidth: '0',
  });
  const title = dom.create('span');
  title.textContent = text;
  styles(title, { color: '#b8c3d2', fontSize: '12px' });
  label.append(title, control);
  return label;
}

function section(dom, text) {
  const value = dom.create('div');
  value.textContent = text;
  styles(value, { color: '#d9e1eb', fontWeight: '700', marginTop: '8px' });
  return value;
}

function epochInputValue(value) {
  if (!Number.isFinite(Number(value))) return '';
  const date = new Date(Number(value));
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function readEpochInput(value) {
  const epoch = new Date(String(value || '')).getTime();
  return Number.isFinite(epoch) ? epoch : 0;
}

function uniqueJobId(type, now) {
  return `${type}-${Math.max(0, Number(now) || Date.now())}`;
}

export function createTradeJobDraft(type = 'listing', options = {}) {
  const now = Math.max(0, Number(options.now ?? Date.now()) || 0);
  if (options.job) return clone(options.job);
  const common = {
    id: uniqueJobId(type, now),
    name: type === 'buy' ? 'Buy Job' : 'Listing Job',
    type,
    enabled: true,
    armed: false,
    schedule: { type: 'manual' },
    misfirePolicy: { type: GRACE_MISFIRE, graceMinutes: 15 },
    createdAt: now,
    updatedAt: now,
  };
  return type === 'buy' ? {
    ...common,
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      ratingPriceOverrides: {}, quantity: 1, totalBudget: 1000, maxRuntimeMinutes: 15,
      searchDelaySeconds: [8, 15], maxPurchasesPerSearch: 1, maxConsecutiveEmptySearches: 20,
    },
  } : {
    ...common,
    policy: {
      sources: ['club'], cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      marketOverride: { enabled: false, markupPercent: 5, maxQuoteAgeMinutes: 10 },
      startPricePolicy: 'one-step-below', durationSeconds: 3600, listingDelaySeconds: [4, 8],
      maxListings: 1, expiredPolicy: 'skip',
    },
  };
}

export function tradeScheduleSummary(job = {}) {
  const schedule = job.schedule || {};
  if (schedule.type === 'once') return `Once ${new Date(Number(schedule.runAt)).toLocaleString()}`;
  if (schedule.type === 'daily') return `Daily ${schedule.time} ${schedule.timezone}`;
  if (schedule.type === 'interval') return `Every ${schedule.everyMinutes} min`;
  if (schedule.type === RANGE_SCHEDULE) return `${new Date(Number(schedule.startAt)).toLocaleString()} - ${new Date(Number(schedule.endAt)).toLocaleString()}`;
  return 'Manual';
}

export function normalizeTradeJobEditorValue(value, options = {}) {
  return normalizeTradeJob(value, { now: options.now ?? Date.now() });
}

export function showTradeSchedulerDialog(options = {}) {
  const dom = options.dom;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  dom.query?.('#bronze-loop-trade-scheduler-modal')?.remove?.();
  const mode = readResponsiveUiMode(dom);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let snapshot = clone(options.getSnapshot?.() || options.snapshot || {});
  let view = 'jobs';
  let historyPage = 1;
  let editing = null;
  let statusText = '';
  const buyPreviews = new Map();

  const overlay = styles(dom.create('div'), {
    position: 'fixed', inset: '0', zIndex: '1000000', background: 'rgba(0,0,0,.74)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: mode.mobile ? '0' : '20px', boxSizing: 'border-box',
  });
  overlay.id = 'bronze-loop-trade-scheduler-modal';
  const dialog = styles(dom.create('div'), {
    width: 'min(980px, 100%)', maxHeight: mode.mobile ? '100dvh' : '92vh', overflow: 'auto',
    background: '#171b21', color: '#f4f6f8', border: '1px solid #65758a', padding: '14px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
  });
  const heading = styles(dom.create('div'), { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' });
  const title = dom.create('div');
  title.textContent = 'Trade Scheduler';
  styles(title, { fontSize: '17px', fontWeight: '700' });
  const close = button(dom, 'Close', mode, 'bronze-loop-trade-scheduler-close');
  heading.append(title, close);
  const tabs = styles(dom.create('div'), { display: 'flex', gap: '8px', margin: '12px 0', flexWrap: 'wrap' });
  const jobsTab = button(dom, 'Jobs', mode, 'bronze-loop-trade-jobs-tab');
  const historyTab = button(dom, 'History', mode, 'bronze-loop-trade-history-tab');
  tabs.append(jobsTab, historyTab);
  const banner = styles(dom.create('div'), { padding: '9px', border: '1px solid #47576b', background: '#1d2229', marginBottom: '10px', fontSize: '12px' });
  const content = dom.create('div');
  const status = styles(dom.create('div'), { minHeight: '18px', color: '#9fb2c9', fontSize: '11px', marginTop: '10px' });
  status.id = 'bronze-loop-trade-scheduler-status';

  function refreshSnapshot() {
    snapshot = clone(options.getSnapshot?.() || snapshot || {});
  }

  function setStatus(value) {
    statusText = String(value || '');
    status.textContent = statusText;
  }

  function renderBanner() {
    const circuit = options.getCircuit?.() || null;
    const circuitState = circuit?.circuit?.state || 'closed';
    const scheduler = snapshot.paused ? 'paused' : 'running';
    const execution = snapshot.liveExecutionEnabled ? 'enabled' : 'locked';
    banner.textContent = `Scheduler: ${scheduler} | Automatic execution: ${execution} | Circuit: ${circuitState}`;
    banner.style.color = circuitState === 'open' ? '#e3a7a7' : '#b8c3d2';
  }

  function checkboxLabel(text, control) {
    const label = styles(dom.create('label'), { display: 'flex', alignItems: 'center', gap: '7px', minHeight: responsiveControlHeight(mode) });
    label.append(control, dom.create('span'));
    label.children[1].textContent = text;
    return label;
  }

  function renderEditor() {
    content.textContent = '';
    const draft = editing;
    content.appendChild(section(dom, draft.type === 'buy' ? 'Buy Job' : 'Listing Job'));
    const form = styles(dom.create('div'), { display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '720px', marginTop: '8px' });
    const name = input(dom, 'text', draft.name, mode, 'bronze-loop-trade-job-name');
    const enabled = input(dom, 'checkbox', draft.enabled, mode, 'bronze-loop-trade-job-enabled');
    const armed = input(dom, 'checkbox', draft.armed, mode, 'bronze-loop-trade-job-armed');
    form.append(field(dom, 'Name', name, mode), checkboxLabel('Enabled', enabled), checkboxLabel('Armed', armed));

    const scheduleType = select(dom, draft.schedule?.type || 'manual', [
      { value: 'manual', text: 'Manual' }, { value: 'once', text: 'Once' }, { value: 'daily', text: 'Daily' },
      { value: 'interval', text: 'Interval' }, { value: RANGE_SCHEDULE, text: 'Window' },
    ], mode, 'bronze-loop-trade-job-schedule');
    form.append(section(dom, 'Schedule'), field(dom, 'Type', scheduleType, mode));
    const scheduleFields = dom.create('div');
    form.appendChild(scheduleFields);
    const misfire = select(dom, draft.misfirePolicy?.type || GRACE_MISFIRE, [
      { value: 'skip', text: 'Skip' }, { value: GRACE_MISFIRE, text: 'Grace interval' }, { value: 'next-login', text: 'Next login' },
    ], mode, 'bronze-loop-trade-job-misfire');
    const grace = input(dom, 'number', draft.misfirePolicy?.graceMinutes || 15, mode, 'bronze-loop-trade-job-grace');
    form.append(field(dom, 'Misfire', misfire, mode), field(dom, 'Grace minutes', grace, mode));

    const cardClass = select(dom, draft.policy.cardClass, [
      { value: 'common-gold', text: 'Common Gold' }, { value: 'rare-gold', text: 'Rare Gold' },
      { value: 'normal-gold', text: 'All normal Gold' }, { value: 'special', text: 'Special' }, { value: 'gold', text: 'All Gold' },
    ], mode, 'bronze-loop-trade-job-card-class');
    form.append(section(dom, 'Policy'), field(dom, 'Card class', cardClass, mode));
    const policyFields = dom.create('div');
    styles(policyFields, { display: 'flex', flexDirection: 'column', gap: '8px' });
    form.appendChild(policyFields);
    const controls = { name, enabled, armed, scheduleType, misfire, grace, cardClass };

    function renderScheduleFields() {
      scheduleFields.textContent = '';
      const type = scheduleType.value;
      if (type === 'once') {
        controls.runAt = input(dom, 'datetime-local', epochInputValue(draft.schedule?.runAt || now()), mode, 'bronze-loop-trade-job-run-at');
        scheduleFields.appendChild(field(dom, 'Run at', controls.runAt, mode));
      } else if (type === 'daily') {
        controls.dailyTime = input(dom, 'time', draft.schedule?.time || '09:00', mode, 'bronze-loop-trade-job-daily-time');
        controls.timezone = input(dom, 'text', draft.schedule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', mode, 'bronze-loop-trade-job-timezone');
        scheduleFields.append(field(dom, 'Time', controls.dailyTime, mode), field(dom, 'Timezone', controls.timezone, mode));
      } else if (type === 'interval') {
        controls.everyMinutes = input(dom, 'number', draft.schedule?.everyMinutes || 60, mode, 'bronze-loop-trade-job-interval');
        scheduleFields.appendChild(field(dom, 'Every minutes', controls.everyMinutes, mode));
      } else if (type === RANGE_SCHEDULE) {
        controls.startAt = input(dom, 'datetime-local', epochInputValue(draft.schedule?.startAt || now()), mode, 'bronze-loop-trade-job-range-start');
        controls.endAt = input(dom, 'datetime-local', epochInputValue(draft.schedule?.endAt || now() + 60 * 60_000), mode, 'bronze-loop-trade-job-range-end');
        scheduleFields.append(field(dom, 'Start', controls.startAt, mode), field(dom, 'End', controls.endAt, mode));
      }
    }

    if (draft.type === 'buy') {
      for (const [key, label, fallback] of [
        ['ratingMin', 'Rating min', 84], ['ratingMax', 'Rating max', 84], ['maxBuyNow', 'Max Buy Now', 1000],
        ['quantity', 'Quantity', 1], ['totalBudget', 'Total budget', 1000], ['maxRuntimeMinutes', 'Max runtime min', 15],
        ['maxConsecutiveEmptySearches', 'Empty search limit', 20],
      ]) {
        controls[key] = input(dom, 'number', draft.policy[key] ?? fallback, mode, `bronze-loop-trade-job-${key}`);
        policyFields.appendChild(field(dom, label, controls[key], mode));
      }
      controls.ratingPriceOverrides = input(dom, 'text', Object.entries(draft.policy.ratingPriceOverrides || {}).map(([rating, price]) => `${rating}=${price}`).join(', '), mode, 'bronze-loop-trade-job-rating-prices');
      controls.searchDelayMin = input(dom, 'number', draft.policy.searchDelaySeconds?.[0] || 8, mode, 'bronze-loop-trade-job-search-delay-min');
      controls.searchDelayMax = input(dom, 'number', draft.policy.searchDelaySeconds?.[1] || 15, mode, 'bronze-loop-trade-job-search-delay-max');
      policyFields.append(field(dom, 'Rating prices', controls.ratingPriceOverrides, mode), field(dom, 'Search delay min', controls.searchDelayMin, mode), field(dom, 'Search delay max', controls.searchDelayMax, mode));
    } else {
      controls.clubSource = input(dom, 'checkbox', draft.policy.sources?.includes('club'), mode, 'bronze-loop-trade-job-source-club');
      controls.transferSource = input(dom, 'checkbox', draft.policy.sources?.includes('transfer'), mode, 'bronze-loop-trade-job-source-transfer');
      policyFields.append(checkboxLabel('Club source', controls.clubSource), checkboxLabel('Transfer source', controls.transferSource));
      controls.rules = [];
      const rules = dom.create('div');
      const renderRules = () => {
        rules.textContent = '';
        controls.rules = draft.policy.ratingRules.map((rule, index) => {
          const row = styles(dom.create('div'), { display: 'grid', gridTemplateColumns: mode.mobile ? '1fr' : '1fr 1fr 1.2fr auto', gap: '6px', marginBottom: '6px' });
          const min = input(dom, 'number', rule.min, mode);
          const max = input(dom, 'number', rule.max, mode);
          const price = input(dom, 'number', rule.buyNow, mode);
          const remove = button(dom, 'x', mode);
          remove.addEventListener('click', () => { if (draft.policy.ratingRules.length > 1) { draft.policy.ratingRules.splice(index, 1); renderRules(); } });
          row.append(field(dom, 'Min', min, { mobile: true }), field(dom, 'Max', max, { mobile: true }), field(dom, 'Buy Now', price, { mobile: true }), remove);
          rules.appendChild(row);
          return { min, max, price };
        });
      };
      const addRule = button(dom, '+', mode, 'bronze-loop-trade-job-add-rule');
      addRule.addEventListener('click', () => { draft.policy.ratingRules.push({ min: 83, max: 83, buyNow: 1000 }); renderRules(); });
      policyFields.append(rules, addRule);
      renderRules();
      controls.marketEnabled = input(dom, 'checkbox', draft.policy.marketOverride?.enabled, mode, 'bronze-loop-trade-job-market-enabled');
      controls.markupPercent = input(dom, 'number', draft.policy.marketOverride?.markupPercent || 5, mode, 'bronze-loop-trade-job-markup');
      controls.quoteAge = input(dom, 'number', draft.policy.marketOverride?.maxQuoteAgeMinutes || 10, mode, 'bronze-loop-trade-job-quote-age');
      controls.startPricePolicy = select(dom, draft.policy.startPricePolicy || 'one-step-below', [{ value: 'one-step-below', text: 'One step below' }, { value: 'same', text: 'Same as Buy Now' }], mode, 'bronze-loop-trade-job-start-price');
      controls.durationSeconds = select(dom, draft.policy.durationSeconds || 3600, [{ value: 3600, text: '1 hour' }, { value: 10800, text: '3 hours' }, { value: 21600, text: '6 hours' }, { value: 86400, text: '1 day' }], mode, 'bronze-loop-trade-job-duration');
      controls.maxListings = input(dom, 'number', draft.policy.maxListings || 1, mode, 'bronze-loop-trade-job-max-listings');
      controls.listingDelayMin = input(dom, 'number', draft.policy.listingDelaySeconds?.[0] || 4, mode, 'bronze-loop-trade-job-list-delay-min');
      controls.listingDelayMax = input(dom, 'number', draft.policy.listingDelaySeconds?.[1] || 8, mode, 'bronze-loop-trade-job-list-delay-max');
      controls.expiredPolicy = select(dom, draft.policy.expiredPolicy || 'skip', [{ value: 'skip', text: 'Skip expired' }, { value: 'reprice', text: 'Reprice expired' }], mode, 'bronze-loop-trade-job-expired');
      policyFields.append(
        checkboxLabel('Use higher market quote', controls.marketEnabled), field(dom, 'Markup %', controls.markupPercent, mode),
        field(dom, 'Quote max age', controls.quoteAge, mode), field(dom, 'Start price', controls.startPricePolicy, mode),
        field(dom, 'Duration', controls.durationSeconds, mode), field(dom, 'Max listings', controls.maxListings, mode),
        field(dom, 'Listing delay min', controls.listingDelayMin, mode), field(dom, 'Listing delay max', controls.listingDelayMax, mode),
        field(dom, 'Expired items', controls.expiredPolicy, mode),
      );
    }
    renderScheduleFields();
    scheduleType.addEventListener('change', renderScheduleFields);

    const actions = styles(dom.create('div'), { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' });
    const save = button(dom, 'Save', mode, 'bronze-loop-trade-job-save');
    const cancel = button(dom, 'Cancel', mode, 'bronze-loop-trade-job-cancel');
    actions.append(save, cancel);
    form.appendChild(actions);
    content.appendChild(form);

    save.addEventListener('click', () => {
      try {
        draft.name = name.value;
        draft.enabled = enabled.checked;
        draft.armed = armed.checked;
        draft.schedule = { type: scheduleType.value };
        if (scheduleType.value === 'once') draft.schedule.runAt = readEpochInput(controls.runAt.value);
        if (scheduleType.value === 'daily') draft.schedule = { type: 'daily', time: controls.dailyTime.value, timezone: controls.timezone.value };
        if (scheduleType.value === 'interval') draft.schedule = { type: 'interval', everyMinutes: Number(controls.everyMinutes.value), anchorAt: now() };
        if (scheduleType.value === RANGE_SCHEDULE) draft.schedule = { type: RANGE_SCHEDULE, startAt: readEpochInput(controls.startAt.value), endAt: readEpochInput(controls.endAt.value) };
        draft.misfirePolicy = misfire.value === GRACE_MISFIRE ? { type: GRACE_MISFIRE, graceMinutes: Number(grace.value) } : { type: misfire.value };
        draft.policy.cardClass = cardClass.value;
        if (draft.type === 'buy') {
          for (const key of ['ratingMin', 'ratingMax', 'maxBuyNow', 'quantity', 'totalBudget', 'maxRuntimeMinutes', 'maxConsecutiveEmptySearches']) draft.policy[key] = Number(controls[key].value);
          draft.policy.ratingPriceOverrides = Object.fromEntries(String(controls.ratingPriceOverrides.value || '').split(',').map((entry) => entry.trim().split('=').map((part) => part.trim())).filter(([rating, price]) => rating && Number(price) > 0));
          draft.policy.searchDelaySeconds = [Number(controls.searchDelayMin.value), Number(controls.searchDelayMax.value)];
          draft.policy.maxPurchasesPerSearch = 1;
        } else {
          draft.policy.sources = [['club', controls.clubSource], ['transfer', controls.transferSource]].filter(([, control]) => control.checked).map(([source]) => source);
          draft.policy.ratingRules = controls.rules.map((rule) => ({ min: Number(rule.min.value), max: Number(rule.max.value), buyNow: Number(rule.price.value) }));
          draft.policy.marketOverride = { enabled: controls.marketEnabled.checked, markupPercent: Number(controls.markupPercent.value), maxQuoteAgeMinutes: Number(controls.quoteAge.value) };
          draft.policy.startPricePolicy = controls.startPricePolicy.value;
          draft.policy.durationSeconds = Number(controls.durationSeconds.value);
          draft.policy.maxListings = Number(controls.maxListings.value);
          draft.policy.listingDelaySeconds = [Number(controls.listingDelayMin.value), Number(controls.listingDelayMax.value)];
          draft.policy.expiredPolicy = controls.expiredPolicy.value;
        }
        const normalized = normalizeTradeJobEditorValue(draft, { now: now() });
        options.onSaveJob?.(normalized);
        refreshSnapshot();
        editing = null;
        view = 'jobs';
        setStatus('Job saved');
        render();
      } catch (error) {
        setStatus(`Save failed: ${error?.message || error}`);
      }
    });
    cancel.addEventListener('click', () => { editing = null; view = 'jobs'; render(); });
  }

  function renderJobs() {
    content.textContent = '';
    const toolbar = styles(dom.create('div'), { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' });
    const manual = button(dom, 'Manual listing', mode, 'bronze-loop-trade-manual-listing');
    const addListing = button(dom, 'New listing Job', mode, 'bronze-loop-trade-new-listing');
    const addBuy = button(dom, 'New Buy Job', mode, 'bronze-loop-trade-new-buy');
    const diagnostics = button(dom, 'Save diagnostics', mode, 'bronze-loop-trade-scheduler-diagnostics');
    const circuit = options.getCircuit?.();
    const resetCircuit = button(dom, 'Reset trade block', mode, 'bronze-loop-trade-circuit-reset');
    resetCircuit.style.display = circuit?.circuit?.state === 'open' ? '' : 'none';
    toolbar.append(manual, addListing, addBuy, diagnostics, resetCircuit);
    content.appendChild(toolbar);
    manual.addEventListener('click', () => options.onOpenManualListing?.());
    addListing.addEventListener('click', () => { editing = createTradeJobDraft('listing', { now: now() }); renderEditor(); });
    addBuy.addEventListener('click', () => { editing = createTradeJobDraft('buy', { now: now() }); renderEditor(); });
    diagnostics.addEventListener('click', () => options.onDownloadDiagnostics?.());
    resetCircuit.addEventListener('click', () => { options.onResetCircuit?.(); refreshSnapshot(); setStatus('Trade block reset manually'); render(); });

    const validationGate = styles(dom.create('div'), {
      display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '9px',
      marginBottom: '10px', border: '1px solid #47576b', background: '#1a2028',
    });
    const guarded = selectGuardedScheduledListingJob(snapshot);
    if (snapshot.liveExecutionEnabled === true) {
      const gateState = dom.create('span');
      gateState.textContent = `One-card schedule enabled${guarded.job ? `: ${guarded.job.name}` : ''}`;
      styles(gateState, { color: '#e3c98d', flex: '1 1 260px', fontSize: '12px' });
      const disableGate = button(dom, 'Disable scheduling', mode, 'bronze-loop-trade-disable-guarded-schedule');
      disableGate.addEventListener('click', () => {
        options.onDisableGuardedScheduling?.();
        refreshSnapshot();
        setStatus('Guarded scheduling disabled');
        render();
      });
      validationGate.append(gateState, disableGate);
    } else {
      const gateInput = input(dom, 'text', '', mode, 'bronze-loop-trade-guarded-confirmation');
      gateInput.placeholder = GUARDED_SCHEDULE_CONFIRMATION;
      styles(gateInput, { flex: '1 1 220px' });
      const enableGate = button(dom, 'Enable one-card schedule', mode, 'bronze-loop-trade-enable-guarded-schedule');
      enableGate.disabled = guarded.ready !== true;
      enableGate.title = guarded.ready ? `Type ${GUARDED_SCHEDULE_CONFIRMATION}` : guarded.reason || 'One armed Job is required';
      enableGate.addEventListener('click', async () => {
        if (gateInput.value !== GUARDED_SCHEDULE_CONFIRMATION) {
          setStatus(`Confirmation must exactly match ${GUARDED_SCHEDULE_CONFIRMATION}`);
          return;
        }
        enableGate.disabled = true;
        try {
          await options.onEnableGuardedScheduling?.({ confirmationText: gateInput.value, jobId: guarded.job?.id });
          refreshSnapshot();
          setStatus(`One-card schedule enabled for ${guarded.job?.name || guarded.job?.id}`);
          render();
        } catch (error) {
          enableGate.disabled = false;
          setStatus(`Enable failed: ${error?.message || error}`);
        }
      });
      validationGate.append(gateInput, enableGate);
    }
    content.appendChild(validationGate);

    if (!snapshot.jobs?.length) {
      const empty = dom.create('div');
      empty.textContent = 'No Trade Jobs';
      styles(empty, { color: '#8795a8', padding: '18px 0' });
      content.appendChild(empty);
      return;
    }
    for (const job of snapshot.jobs) {
      const runtime = snapshot.runtimes?.[job.id] || {};
      const card = styles(dom.create('div'), { border: '1px solid #3e4b5d', background: '#1d2229', padding: '10px', marginBottom: '8px' });
      const head = styles(dom.create('div'), { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' });
      const identity = dom.create('div');
      identity.textContent = job.name;
      styles(identity, { fontWeight: '700', overflowWrap: 'anywhere' });
      const state = dom.create('span');
      state.textContent = runtime.status || (job.armed ? 'armed' : 'disabled');
      styles(state, { color: runtime.status === 'blocked' ? '#e3a7a7' : '#9fb2c9' });
      head.append(identity, state);
      const detail = dom.create('div');
      detail.textContent = `${job.type} | ${tradeScheduleSummary(job)}${runtime.nextRunAt !== null && runtime.nextRunAt !== undefined ? ` | Next ${new Date(runtime.nextRunAt).toLocaleString()}` : ''}`;
      styles(detail, { color: '#9aa6b8', fontSize: '11px', margin: '6px 0' });
      const buyPreview = buyPreviews.get(job.id);
      const previewDetail = job.type === 'buy' && buyPreview ? styles(dom.create('div'), {
        color: buyPreview.plan?.ready ? '#a9d7b5' : '#e3a7a7', fontSize: '11px', margin: '6px 0', lineHeight: '1.45', overflowWrap: 'anywhere',
      }) : null;
      if (previewDetail) {
        const lanes = (buyPreview.plan?.lanes || [])
          .map((lane) => `${lane.rating}: ${lane.definitionIds.length} player ID(s), max ${Number(lane.maxBuyNow).toLocaleString()}`)
          .join(' | ');
        const missing = buyPreview.plan?.missingRatings?.length
          ? ` | Missing ratings: ${buyPreview.plan.missingRatings.join(', ')}`
          : '';
        previewDetail.textContent = `Preview only | ${lanes || 'No search lanes'}${missing} | Live Buy locked`;
      }
      const actions = styles(dom.create('div'), { display: 'flex', gap: '6px', flexWrap: 'wrap' });
      const run = button(dom, job.type === 'buy' ? 'Preview' : 'Run now', mode);
      const edit = button(dom, 'Edit', mode);
      const duplicate = button(dom, 'Duplicate', mode);
      const remove = button(dom, 'Delete', mode);
      run.addEventListener('click', async () => {
        if (job.type !== 'buy') {
          options.onOpenManualListing?.(job);
          return;
        }
        run.disabled = true;
        setStatus(`Loading Buy preview for ${job.name}`);
        try {
          const preview = await options.onPreviewBuyJob?.(job);
          if (!preview) throw new Error('Buy preview is unavailable');
          buyPreviews.set(job.id, preview);
          setStatus(preview.plan?.ready
            ? `Buy preview ready: ${preview.summary?.ratings || 0} rating lane(s), ${preview.summary?.definitions || 0} player definition(s); execution remains locked`
            : `Buy preview blocked: missing rating lane(s) ${(preview.plan?.missingRatings || []).join(', ') || 'unknown'}`);
          render();
        } catch (error) {
          setStatus(`Buy preview failed: ${error?.message || error}`);
          run.disabled = false;
        }
      });
      edit.addEventListener('click', () => { editing = createTradeJobDraft(job.type, { job, now: now() }); renderEditor(); });
      duplicate.addEventListener('click', () => {
        const copy = createTradeJobDraft(job.type, { job, now: now() });
        copy.id = uniqueJobId(job.type, now());
        copy.name = `${job.name} copy`;
        copy.armed = false;
        editing = copy;
        renderEditor();
      });
      remove.addEventListener('click', () => { options.onDeleteJob?.(job.id); refreshSnapshot(); render(); });
      actions.append(run, edit, duplicate, remove);
      card.append(head, detail);
      if (previewDetail) card.appendChild(previewDetail);
      card.appendChild(actions);
      content.appendChild(card);
    }
  }

  function renderHistory() {
    content.textContent = '';
    const history = [...(snapshot.history || [])].reverse();
    const pageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
    historyPage = Math.min(pageCount, Math.max(1, historyPage));
    const entries = history.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);
    if (!entries.length) {
      const empty = dom.create('div');
      empty.textContent = 'No Trade history';
      content.appendChild(empty);
    }
    for (const receipt of entries) {
      const row = styles(dom.create('div'), { borderBottom: '1px solid #35404e', padding: '9px 0' });
      const line = dom.create('div');
      line.textContent = `${receipt.jobType || 'trade'} | ${receipt.status} | ${Number(receipt.succeeded || 0)}/${Number(receipt.requested || 0)}`;
      const detail = dom.create('small');
      detail.textContent = `${new Date(Number(receipt.startedAt || 0)).toLocaleString()}${receipt.reason ? ` | ${receipt.reason}` : ''}`;
      styles(detail, { color: '#9aa6b8' });
      row.append(line, detail);
      content.appendChild(row);
    }
    if (pageCount > 1) {
      const pages = styles(dom.create('div'), { display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center', marginTop: '10px' });
      const previous = button(dom, '<', mode);
      const next = button(dom, '>', mode);
      const count = dom.create('span');
      count.textContent = `${historyPage}/${pageCount}`;
      previous.disabled = historyPage <= 1;
      next.disabled = historyPage >= pageCount;
      previous.addEventListener('click', () => { historyPage -= 1; renderHistory(); });
      next.addEventListener('click', () => { historyPage += 1; renderHistory(); });
      pages.append(previous, count, next);
      content.appendChild(pages);
    }
  }

  function render() {
    refreshSnapshot();
    renderBanner();
    jobsTab.style.background = view === 'jobs' ? '#315d9b' : '#222832';
    historyTab.style.background = view === 'history' ? '#315d9b' : '#222832';
    if (editing) renderEditor();
    else if (view === 'history') renderHistory();
    else renderJobs();
    status.textContent = statusText;
  }

  jobsTab.addEventListener('click', () => { editing = null; view = 'jobs'; render(); });
  historyTab.addEventListener('click', () => { editing = null; view = 'history'; render(); });
  close.addEventListener('click', () => overlay.remove?.());
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove?.(); });
  dialog.append(heading, tabs, banner, content, status);
  overlay.appendChild(dialog);
  dom.appendToBody(overlay);
  applyResponsiveDialogLayout({ dom, mode, overlay, dialog, title: heading, controls: [jobsTab, historyTab, close] });
  render();
  return overlay;
}
