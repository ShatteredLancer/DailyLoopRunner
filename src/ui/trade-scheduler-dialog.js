import { normalizeTradeJob } from '../trade/contracts.js';
import { inspectManualBuyValidationJob } from '../trade/manual-buy-validation.js';
import { selectGuardedScheduledTradeJob } from '../trade/guarded-scheduled-job.js';
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
    name: type === 'buy' ? 'Buy Job' : type === 'bulk-relist' ? 'Re-list All Job' : 'Listing Job',
    type,
    enabled: true,
    armed: false,
    schedule: type === 'bulk-relist'
      ? { type: 'interval', intervalSeconds: 300, anchorAt: now }
      : { type: 'manual' },
    misfirePolicy: { type: GRACE_MISFIRE, graceMinutes: 15 },
    createdAt: now,
    updatedAt: now,
  };
  if (type === 'bulk-relist') return {
    ...common,
    policy: {
      relistDelaySeconds: [3, 8],
      initialRateLimitCooldownSeconds: 60,
      maximumRateLimitCooldownSeconds: 1800,
    },
  };
  return type === 'buy' ? {
    ...common,
    policy: {
      cardClass: 'rare-gold', ratingMin: 84, ratingMax: 84, maxBuyNow: 1000,
      ratingPriceOverrides: {}, quantity: 1, totalBudget: 1000, minimumRetainedCoins: null,
      maxRuntimeMinutes: 15,
      searchDelaySeconds: [7, 15], buyDelaySeconds: [0, 1], maxPurchasesPerSearch: 1,
      searchCyclePauseEnabled: true, searchCyclePauseEvery: [10, 15], searchCyclePauseSeconds: [5, 8],
      initialRateLimitCooldownSeconds: 60, maximumRateLimitCooldownSeconds: 1800,
      maxConsecutiveEmptySearches: 20,
    },
  } : {
    ...common,
    policy: {
      sources: ['club'], cardClass: 'common-gold', ratingRules: [{ min: 75, max: 82, buyNow: 700 }],
      marketOverride: { enabled: false, markupPercent: 5, maxQuoteAgeMinutes: 10 },
      startPricePolicy: 'one-step-below', durationSeconds: 3600, listingDelaySeconds: [3, 8],
      initialRateLimitCooldownSeconds: 60, maximumRateLimitCooldownSeconds: 1800,
      maxListings: 1, expiredPolicy: 'skip',
    },
  };
}

export function tradeScheduleSummary(job = {}) {
  const schedule = job.schedule || {};
  if (schedule.type === 'once') return `Once ${new Date(Number(schedule.runAt)).toLocaleString()}`;
  if (schedule.type === 'daily') return `Daily ${schedule.time} ${schedule.timezone}`;
  if (schedule.type === 'interval') return `Every ${schedule.intervalSeconds} sec`;
  if (schedule.type === RANGE_SCHEDULE) return `${new Date(Number(schedule.startAt)).toLocaleString()} - ${new Date(Number(schedule.endAt)).toLocaleString()}`;
  return 'Manual';
}

function guardedJobApprovalSummary(gate = {}) {
  const job = gate.job || {};
  const approval = gate.approval || {};
  const details = [tradeScheduleSummary(job)];
  if (approval.action === 'scheduled-buy') {
    details.push(`${approval.quantity} item(s)`);
    details.push(`max ${Number(approval.maxPrice || 0).toLocaleString('en-US')}/card`);
    details.push(`spend ${Number(approval.maxSpend || 0).toLocaleString('en-US')}`);
    details.push(`reserve ${Number(approval.minimumRetainedCoins || 0).toLocaleString('en-US')}`);
  } else if (approval.action === 'bulk-relist') {
    details.push('Re-list all Unsold');
    details.push(`up to ${Number(approval.itemLimit || 100)} item(s)`);
  } else {
    details.push(approval.action === 'transfer-reprice' ? 'Transfer reprice' : 'Club listing');
    details.push(`${approval.quantity} item(s)`);
  }
  return `${job.name || job.id || 'Trade Job'} [${details.join(' | ')}]`;
}

export function normalizeTradeJobEditorValue(value, options = {}) {
  return normalizeTradeJob(value, { now: options.now ?? Date.now() });
}

export function showTradeSchedulerDialog(options = {}) {
  const dom = options.dom;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  const existing = dom.query?.('#bronze-loop-trade-scheduler-modal');
  existing?.__disposeTradeSchedulerDialog?.();
  existing?.remove?.();
  const mode = readResponsiveUiMode(dom);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let snapshot = clone(options.getSnapshot?.() || options.snapshot || {});
  let view = 'jobs';
  let historyPage = 1;
  let editing = null;
  let statusText = '';
  let validatedImportText = null;
  const buyPreviews = new Map();
  const scheduleRefresh = typeof options.scheduleRefresh === 'function' ? options.scheduleRefresh : null;
  const cancelRefresh = typeof options.cancelRefresh === 'function' ? options.cancelRefresh : null;
  const refreshIntervalMs = Math.max(250, Number(options.refreshIntervalMs || 1000));
  let refreshHandle = null;
  let disposed = false;
  let snapshotSignature = JSON.stringify(snapshot);
  let recoverySignature = JSON.stringify(options.getRecovery?.() || {});

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
  const summaryTab = button(dom, 'Summary', mode, 'bronze-loop-trade-summary-tab');
  const providersTab = button(dom, 'Providers', mode, 'bronze-loop-trade-providers-tab');
  const historyTab = button(dom, 'History', mode, 'bronze-loop-trade-history-tab');
  const recoveryTab = button(dom, 'Recovery', mode, 'bronze-loop-trade-recovery-tab');
  tabs.append(jobsTab, summaryTab, providersTab, historyTab, recoveryTab);
  const banner = styles(dom.create('div'), { padding: '9px', border: '1px solid #47576b', background: '#1d2229', marginBottom: '10px', fontSize: '12px' });
  const content = dom.create('div');
  const status = styles(dom.create('div'), { minHeight: '18px', color: '#9fb2c9', fontSize: '11px', marginTop: '10px' });
  status.id = 'bronze-loop-trade-scheduler-status';

  function refreshSnapshot() {
    snapshot = clone(options.getSnapshot?.() || snapshot || {});
    snapshotSignature = JSON.stringify(snapshot);
    recoverySignature = JSON.stringify(options.getRecovery?.() || {});
  }

  function setStatus(value) {
    statusText = String(value || '');
    status.textContent = statusText;
  }

  function buyValidationAvailability(job, preview) {
    if (preview?.plan?.ready !== true) return { ready: false, reason: 'buy-preview-not-ready' };
    if (snapshot.paused !== true || snapshot.liveExecutionEnabled === true) {
      return { ready: false, reason: 'scheduler-must-be-paused-and-live-disabled' };
    }
    const gate = inspectManualBuyValidationJob(job);
    return gate.ready ? { ready: true, reason: null, gate } : { ready: false, reason: gate.reason, gate };
  }

  function renderBanner() {
    const circuit = options.getCircuit?.() || null;
    const requestPacing = options.getRequestPacing?.() || null;
    const circuitState = circuit?.circuit?.state || 'closed';
    const scheduler = snapshot.paused ? 'paused' : 'running';
    const execution = snapshot.liveExecutionEnabled ? 'enabled' : 'locked';
    const recovery = options.getRecovery?.() || {};
    const pacingText = requestPacing
      ? ` | Pacing: ${requestPacing.status || 'available'}${requestPacing.nextAllowedAt ? ` until ${new Date(Number(requestPacing.nextAllowedAt)).toLocaleTimeString()}` : ''}`
      : '';
    banner.textContent = recovery.reviewRequired === true
      ? `Scheduler: ${scheduler} | Automatic execution: ${execution} | Circuit: ${circuitState} | Recovery review required`
      : `Scheduler: ${scheduler} | Automatic execution: ${execution} | Circuit: ${circuitState}${pacingText}`;
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
    content.appendChild(section(dom, draft.type === 'buy' ? 'Buy Job' : draft.type === 'bulk-relist' ? 'Re-list All Job' : 'Listing Job'));
    const form = styles(dom.create('div'), { display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '720px', marginTop: '8px' });
    const name = input(dom, 'text', draft.name, mode, 'bronze-loop-trade-job-name');
    const enabled = input(dom, 'checkbox', draft.enabled, mode, 'bronze-loop-trade-job-enabled');
    const armed = input(dom, 'checkbox', draft.armed, mode, 'bronze-loop-trade-job-armed');
    form.append(field(dom, 'Name', name, mode), checkboxLabel('Enabled', enabled), checkboxLabel('Armed', armed));

    const scheduleEntries = [
      { value: 'once', text: 'Once' }, { value: 'daily', text: 'Daily' },
      { value: 'interval', text: 'Interval' }, { value: RANGE_SCHEDULE, text: 'Window' },
    ];
    if (draft.type !== 'bulk-relist') scheduleEntries.unshift({ value: 'manual', text: 'Manual' });
    const scheduleType = select(
      dom,
      draft.schedule?.type || (draft.type === 'bulk-relist' ? 'interval' : 'manual'),
      scheduleEntries,
      mode,
      'bronze-loop-trade-job-schedule',
    );
    form.append(section(dom, 'Schedule'), field(dom, 'Type', scheduleType, mode));
    const scheduleFields = dom.create('div');
    form.appendChild(scheduleFields);
    const misfire = select(dom, draft.misfirePolicy?.type || GRACE_MISFIRE, [
      { value: 'skip', text: 'Skip' }, { value: GRACE_MISFIRE, text: 'Grace interval' },
    ], mode, 'bronze-loop-trade-job-misfire');
    const grace = input(dom, 'number', draft.misfirePolicy?.graceMinutes || 15, mode, 'bronze-loop-trade-job-grace');
    form.append(field(dom, 'Misfire', misfire, mode), field(dom, 'Grace minutes', grace, mode));

    const cardClass = draft.type === 'bulk-relist' ? null : select(dom, draft.policy.cardClass, [
      { value: 'common-gold', text: 'Common Gold' }, { value: 'rare-gold', text: 'Rare Gold' },
      { value: 'normal-gold', text: 'All normal Gold' }, { value: 'special', text: 'Special' }, { value: 'gold', text: 'All Gold' },
    ], mode, 'bronze-loop-trade-job-card-class');
    form.appendChild(section(dom, 'Policy'));
    if (cardClass) form.appendChild(field(dom, 'Card class', cardClass, mode));
    const policyFields = dom.create('div');
    styles(policyFields, { display: 'flex', flexDirection: 'column', gap: '8px' });
    form.appendChild(policyFields);
    const controls = { name, enabled, armed, scheduleType, misfire, grace, cardClass };

    function syncArmedState() {
      const manual = scheduleType.value === 'manual';
      if (manual) armed.checked = false;
      armed.disabled = manual;
      armed.title = manual ? 'Manual Jobs run only through Run now' : '';
    }

    function renderScheduleFields() {
      scheduleFields.textContent = '';
      const type = scheduleType.value;
      syncArmedState();
      if (type === 'once') {
        controls.runAt = input(dom, 'datetime-local', epochInputValue(draft.schedule?.runAt || now()), mode, 'bronze-loop-trade-job-run-at');
        scheduleFields.appendChild(field(dom, 'Run at', controls.runAt, mode));
      } else if (type === 'daily') {
        controls.dailyTime = input(dom, 'time', draft.schedule?.time || '09:00', mode, 'bronze-loop-trade-job-daily-time');
        controls.timezone = input(dom, 'text', draft.schedule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', mode, 'bronze-loop-trade-job-timezone');
        scheduleFields.append(field(dom, 'Time', controls.dailyTime, mode), field(dom, 'Timezone', controls.timezone, mode));
      } else if (type === 'interval') {
        controls.intervalSeconds = input(dom, 'number', draft.schedule?.intervalSeconds || (draft.type === 'bulk-relist' ? 300 : 3600), mode, 'bronze-loop-trade-job-interval');
        if (draft.type === 'bulk-relist') controls.intervalSeconds.min = '60';
        scheduleFields.appendChild(field(dom, 'Every seconds', controls.intervalSeconds, mode));
        if (draft.type === 'bulk-relist') {
          const presets = styles(dom.create('div'), { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' });
          for (const [label, seconds] of [['1 min', 60], ['5 min', 300], ['10 min', 600]]) {
            const preset = button(dom, label, mode, `bronze-loop-trade-job-interval-${seconds}`);
            preset.addEventListener('click', () => { controls.intervalSeconds.value = String(seconds); });
            presets.appendChild(preset);
          }
          scheduleFields.appendChild(presets);
        }
      } else if (type === RANGE_SCHEDULE) {
        controls.startAt = input(dom, 'datetime-local', epochInputValue(draft.schedule?.startAt || now()), mode, 'bronze-loop-trade-job-range-start');
        controls.endAt = input(dom, 'datetime-local', epochInputValue(draft.schedule?.endAt || now() + 60 * 60_000), mode, 'bronze-loop-trade-job-range-end');
        scheduleFields.append(field(dom, 'Start', controls.startAt, mode), field(dom, 'End', controls.endAt, mode));
      }
    }

    if (draft.type === 'bulk-relist') {
      const scope = styles(dom.create('div'), {
        border: '1px solid #714f55', background: '#241d22', color: '#f1c1c1', padding: '9px', fontSize: '12px', lineHeight: '1.45',
      });
      scope.textContent = 'Each run re-lists every current Unsold item in one EA action, preserving EA prices. The run is limited to a 100-item verified snapshot.';
      controls.relistDelayMin = input(dom, 'number', draft.policy.relistDelaySeconds?.[0] || 3, mode, 'bronze-loop-trade-job-relist-delay-min');
      controls.relistDelayMax = input(dom, 'number', draft.policy.relistDelaySeconds?.[1] || 8, mode, 'bronze-loop-trade-job-relist-delay-max');
      controls.initialRateLimitCooldown = input(dom, 'number', draft.policy.initialRateLimitCooldownSeconds || 60, mode, 'bronze-loop-trade-job-cooldown-initial');
      controls.maximumRateLimitCooldown = input(dom, 'number', draft.policy.maximumRateLimitCooldownSeconds || 1800, mode, 'bronze-loop-trade-job-cooldown-maximum');
      policyFields.append(
        scope,
        field(dom, 'Re-list delay min', controls.relistDelayMin, mode),
        field(dom, 'Re-list delay max', controls.relistDelayMax, mode),
        field(dom, 'Initial 429 cooldown', controls.initialRateLimitCooldown, mode),
        field(dom, 'Maximum 429 cooldown', controls.maximumRateLimitCooldown, mode),
      );
    } else if (draft.type === 'buy') {
      for (const [key, label, fallback] of [
        ['ratingMin', 'Rating min', 84], ['ratingMax', 'Rating max', 84], ['maxBuyNow', 'Max Buy Now', 1000],
        ['quantity', 'Quantity', 1], ['totalBudget', 'Total budget', 1000], ['maxRuntimeMinutes', 'Max runtime min', 15],
        ['maxConsecutiveEmptySearches', 'Empty search limit', 20],
      ]) {
        controls[key] = input(dom, 'number', draft.policy[key] ?? fallback, mode, `bronze-loop-trade-job-${key}`);
        policyFields.appendChild(field(dom, label, controls[key], mode));
      }
      controls.minimumRetainedCoins = input(
        dom,
        'number',
        draft.policy.minimumRetainedCoins ?? '',
        mode,
        'bronze-loop-trade-job-minimum-retained-coins',
      );
      controls.ratingPriceOverrides = input(dom, 'text', Object.entries(draft.policy.ratingPriceOverrides || {}).map(([rating, price]) => `${rating}=${price}`).join(', '), mode, 'bronze-loop-trade-job-rating-prices');
      controls.ratingQuantityOverrides = input(dom, 'text', Object.entries(draft.policy.ratingQuantityOverrides || {}).map(([rating, quantity]) => `${rating}=${quantity}`).join(', '), mode, 'bronze-loop-trade-job-rating-quantities');
      controls.searchDelayMin = input(dom, 'number', draft.policy.searchDelaySeconds?.[0] || 8, mode, 'bronze-loop-trade-job-search-delay-min');
      controls.searchDelayMax = input(dom, 'number', draft.policy.searchDelaySeconds?.[1] || 15, mode, 'bronze-loop-trade-job-search-delay-max');
      controls.buyDelayMin = input(dom, 'number', draft.policy.buyDelaySeconds?.[0] ?? 0, mode, 'bronze-loop-trade-job-buy-delay-min');
      controls.buyDelayMax = input(dom, 'number', draft.policy.buyDelaySeconds?.[1] ?? 1, mode, 'bronze-loop-trade-job-buy-delay-max');
      controls.maxPurchasesPerSearch = input(dom, 'number', draft.policy.maxPurchasesPerSearch || 1, mode, 'bronze-loop-trade-job-purchases-per-search');
      controls.searchCyclePauseEnabled = input(dom, 'checkbox', draft.policy.searchCyclePauseEnabled !== false, mode, 'bronze-loop-trade-job-cycle-pause-enabled');
      controls.searchCycleEveryMin = input(dom, 'number', draft.policy.searchCyclePauseEvery?.[0] || 10, mode, 'bronze-loop-trade-job-cycle-every-min');
      controls.searchCycleEveryMax = input(dom, 'number', draft.policy.searchCyclePauseEvery?.[1] || 15, mode, 'bronze-loop-trade-job-cycle-every-max');
      controls.searchCyclePauseMin = input(dom, 'number', draft.policy.searchCyclePauseSeconds?.[0] || 5, mode, 'bronze-loop-trade-job-cycle-pause-min');
      controls.searchCyclePauseMax = input(dom, 'number', draft.policy.searchCyclePauseSeconds?.[1] || 8, mode, 'bronze-loop-trade-job-cycle-pause-max');
      controls.initialRateLimitCooldown = input(dom, 'number', draft.policy.initialRateLimitCooldownSeconds || 60, mode, 'bronze-loop-trade-job-cooldown-initial');
      controls.maximumRateLimitCooldown = input(dom, 'number', draft.policy.maximumRateLimitCooldownSeconds || 1800, mode, 'bronze-loop-trade-job-cooldown-maximum');
      policyFields.append(
        field(dom, 'Job minimum retained coins', controls.minimumRetainedCoins, mode),
        field(dom, 'Rating prices', controls.ratingPriceOverrides, mode),
        field(dom, 'Rating quantities', controls.ratingQuantityOverrides, mode),
        field(dom, 'Search delay min', controls.searchDelayMin, mode),
        field(dom, 'Search delay max', controls.searchDelayMax, mode),
        field(dom, 'Buy delay min', controls.buyDelayMin, mode),
        field(dom, 'Buy delay max', controls.buyDelayMax, mode),
        field(dom, 'Purchases per search', controls.maxPurchasesPerSearch, mode),
        checkboxLabel('Pause after search cycles', controls.searchCyclePauseEnabled),
        field(dom, 'Cycle count min', controls.searchCycleEveryMin, mode),
        field(dom, 'Cycle count max', controls.searchCycleEveryMax, mode),
        field(dom, 'Cycle pause min', controls.searchCyclePauseMin, mode),
        field(dom, 'Cycle pause max', controls.searchCyclePauseMax, mode),
        field(dom, 'Initial 429 cooldown', controls.initialRateLimitCooldown, mode),
        field(dom, 'Maximum 429 cooldown', controls.maximumRateLimitCooldown, mode),
      );
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
      controls.quoteFallback = select(dom, draft.policy.marketOverride?.fallbackPolicy || 'configured', [{ value: 'configured', text: 'Use configured price' }, { value: 'skip', text: 'Skip item' }], mode, 'bronze-loop-trade-job-quote-fallback');
      controls.startPricePolicy = select(dom, draft.policy.startPricePolicy || 'one-step-below', [{ value: 'one-step-below', text: 'One step below' }, { value: 'same', text: 'Same as Buy Now' }], mode, 'bronze-loop-trade-job-start-price');
      controls.durationSeconds = select(dom, draft.policy.durationSeconds || 3600, [{ value: 3600, text: '1 hour' }, { value: 10800, text: '3 hours' }, { value: 21600, text: '6 hours' }, { value: 86400, text: '1 day' }], mode, 'bronze-loop-trade-job-duration');
      controls.maxListings = input(dom, 'number', draft.policy.maxListings || 1, mode, 'bronze-loop-trade-job-max-listings');
      controls.listingDelayMin = input(dom, 'number', draft.policy.listingDelaySeconds?.[0] || 4, mode, 'bronze-loop-trade-job-list-delay-min');
      controls.listingDelayMax = input(dom, 'number', draft.policy.listingDelaySeconds?.[1] || 8, mode, 'bronze-loop-trade-job-list-delay-max');
      controls.expiredPolicy = select(dom, draft.policy.expiredPolicy || 'skip', [{ value: 'skip', text: 'Skip expired' }, { value: 'reprice', text: 'Reprice expired' }], mode, 'bronze-loop-trade-job-expired');
      controls.initialRateLimitCooldown = input(dom, 'number', draft.policy.initialRateLimitCooldownSeconds || 60, mode, 'bronze-loop-trade-job-cooldown-initial');
      controls.maximumRateLimitCooldown = input(dom, 'number', draft.policy.maximumRateLimitCooldownSeconds || 1800, mode, 'bronze-loop-trade-job-cooldown-maximum');
      policyFields.append(
        checkboxLabel('Use higher market quote', controls.marketEnabled), field(dom, 'Markup %', controls.markupPercent, mode),
        field(dom, 'Quote max age', controls.quoteAge, mode), field(dom, 'Quote fallback', controls.quoteFallback, mode),
        field(dom, 'Start price', controls.startPricePolicy, mode),
        field(dom, 'Duration', controls.durationSeconds, mode), field(dom, 'Max listings', controls.maxListings, mode),
        field(dom, 'Listing delay min', controls.listingDelayMin, mode), field(dom, 'Listing delay max', controls.listingDelayMax, mode),
        field(dom, 'Expired items', controls.expiredPolicy, mode),
        field(dom, 'Initial 429 cooldown', controls.initialRateLimitCooldown, mode),
        field(dom, 'Maximum 429 cooldown', controls.maximumRateLimitCooldown, mode),
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
        draft.armed = scheduleType.value === 'manual' ? false : armed.checked;
        draft.schedule = { type: scheduleType.value };
        if (scheduleType.value === 'once') draft.schedule.runAt = readEpochInput(controls.runAt.value);
        if (scheduleType.value === 'daily') draft.schedule = { type: 'daily', time: controls.dailyTime.value, timezone: controls.timezone.value };
        if (scheduleType.value === 'interval') draft.schedule = { type: 'interval', intervalSeconds: Number(controls.intervalSeconds.value), anchorAt: now() };
        if (scheduleType.value === RANGE_SCHEDULE) draft.schedule = { type: RANGE_SCHEDULE, startAt: readEpochInput(controls.startAt.value), endAt: readEpochInput(controls.endAt.value) };
        draft.misfirePolicy = misfire.value === GRACE_MISFIRE ? { type: GRACE_MISFIRE, graceMinutes: Number(grace.value) } : { type: misfire.value };
        if (cardClass) draft.policy.cardClass = cardClass.value;
        if (draft.type === 'buy') {
          for (const key of ['ratingMin', 'ratingMax', 'maxBuyNow', 'quantity', 'totalBudget', 'maxRuntimeMinutes', 'maxConsecutiveEmptySearches']) draft.policy[key] = Number(controls[key].value);
          draft.policy.minimumRetainedCoins = controls.minimumRetainedCoins.value === ''
            ? null
            : Number(controls.minimumRetainedCoins.value);
          draft.policy.ratingPriceOverrides = Object.fromEntries(String(controls.ratingPriceOverrides.value || '').split(',').map((entry) => entry.trim().split('=').map((part) => part.trim())).filter(([rating, price]) => rating && Number(price) > 0));
          draft.policy.ratingQuantityOverrides = Object.fromEntries(String(controls.ratingQuantityOverrides.value || '').split(',').map((entry) => entry.trim().split('=').map((part) => part.trim())).filter(([rating, quantity]) => rating && Number.isInteger(Number(quantity)) && Number(quantity) > 0));
          draft.policy.searchDelaySeconds = [Number(controls.searchDelayMin.value), Number(controls.searchDelayMax.value)];
          draft.policy.buyDelaySeconds = [Number(controls.buyDelayMin.value), Number(controls.buyDelayMax.value)];
          draft.policy.maxPurchasesPerSearch = Number(controls.maxPurchasesPerSearch.value);
          draft.policy.searchCyclePauseEnabled = controls.searchCyclePauseEnabled.checked;
          draft.policy.searchCyclePauseEvery = [Number(controls.searchCycleEveryMin.value), Number(controls.searchCycleEveryMax.value)];
          draft.policy.searchCyclePauseSeconds = [Number(controls.searchCyclePauseMin.value), Number(controls.searchCyclePauseMax.value)];
        } else if (draft.type === 'listing') {
          draft.policy.sources = [['club', controls.clubSource], ['transfer', controls.transferSource]].filter(([, control]) => control.checked).map(([source]) => source);
          draft.policy.ratingRules = controls.rules.map((rule) => ({ min: Number(rule.min.value), max: Number(rule.max.value), buyNow: Number(rule.price.value) }));
          draft.policy.marketOverride = { enabled: controls.marketEnabled.checked, markupPercent: Number(controls.markupPercent.value), maxQuoteAgeMinutes: Number(controls.quoteAge.value), fallbackPolicy: controls.quoteFallback.value };
          draft.policy.startPricePolicy = controls.startPricePolicy.value;
          draft.policy.durationSeconds = Number(controls.durationSeconds.value);
          draft.policy.maxListings = Number(controls.maxListings.value);
          draft.policy.listingDelaySeconds = [Number(controls.listingDelayMin.value), Number(controls.listingDelayMax.value)];
          draft.policy.expiredPolicy = controls.expiredPolicy.value;
        } else {
          draft.policy = {
            relistDelaySeconds: [Number(controls.relistDelayMin.value), Number(controls.relistDelayMax.value)],
          };
        }
        draft.policy.initialRateLimitCooldownSeconds = Number(controls.initialRateLimitCooldown.value);
        draft.policy.maximumRateLimitCooldownSeconds = Number(controls.maximumRateLimitCooldown.value);
        const normalized = normalizeTradeJobEditorValue(draft, { now: now() });
        buyPreviews.delete(normalized.id);
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
    const bulkRelist = button(dom, 'Re-list All', mode, 'bronze-loop-trade-bulk-relist');
    const addListing = button(dom, 'New listing Job', mode, 'bronze-loop-trade-new-listing');
    const addBuy = button(dom, 'New Buy Job', mode, 'bronze-loop-trade-new-buy');
    const addBulkRelist = button(dom, 'New Re-list All Job', mode, 'bronze-loop-trade-new-bulk-relist');
    const exportConfig = button(dom, 'Export config', mode, 'bronze-loop-trade-export-config');
    const importConfig = button(dom, 'Import config', mode, 'bronze-loop-trade-import-config');
    const diagnostics = button(dom, 'Save diagnostics', mode, 'bronze-loop-trade-scheduler-diagnostics');
    const circuit = options.getCircuit?.();
    toolbar.append(manual, bulkRelist, addListing, addBuy, addBulkRelist, exportConfig, importConfig, diagnostics);
    content.appendChild(toolbar);
    manual.addEventListener('click', () => options.onOpenManualListing?.());
    bulkRelist.addEventListener('click', () => options.onOpenBulkRelist?.());
    addListing.addEventListener('click', () => { editing = createTradeJobDraft('listing', { now: now() }); renderEditor(); });
    addBuy.addEventListener('click', () => { editing = createTradeJobDraft('buy', { now: now() }); renderEditor(); });
    addBulkRelist.addEventListener('click', () => { editing = createTradeJobDraft('bulk-relist', { now: now() }); renderEditor(); });
    exportConfig.addEventListener('click', () => {
      try {
        options.onExportJobConfig?.();
        setStatus(`Exported ${(snapshot.jobs || []).length} Job(s)`);
      } catch (error) {
        setStatus(`Export failed: ${error?.message || error}`);
      }
    });
    importConfig.addEventListener('click', () => {
      validatedImportText = null;
      editing = null;
      view = 'import';
      render();
    });
    diagnostics.addEventListener('click', () => options.onDownloadDiagnostics?.());
    if (circuit?.circuit?.state === 'open') {
      const circuitRecovery = styles(dom.create('div'), {
        border: '1px solid #8f3d49', background: '#2a1b20', padding: '10px', marginBottom: '10px',
      });
      const circuitWarning = styles(dom.create('div'), {
        color: '#f1c1c1', fontSize: '12px', lineHeight: '1.45', marginBottom: '8px',
      });
      circuitWarning.textContent = `High-risk reset: Trade is blocked (${circuit.circuit.reason || 'unknown reason'}). Reset only after checking EA state; this unlocks future mutations but does not retry the failed action.`;
      const circuitRisk = input(dom, 'checkbox', false, mode, 'bronze-loop-trade-circuit-risk');
      const circuitRiskLabel = checkboxLabel('I checked EA state and understand this unlocks future Trade mutations', circuitRisk);
      const resetCircuit = button(dom, 'Reset trade block', mode, 'bronze-loop-trade-circuit-reset');
      styles(resetCircuit, { background: '#8f2d36', borderColor: '#c44d58' });
      resetCircuit.disabled = true;
      circuitRisk.addEventListener('change', () => { resetCircuit.disabled = circuitRisk.checked !== true; });
      resetCircuit.addEventListener('click', () => {
        if (resetCircuit.disabled || circuitRisk.checked !== true) return;
        options.onResetCircuit?.();
        refreshSnapshot();
        setStatus('Trade block reset manually');
        render();
      });
      circuitRecovery.append(circuitWarning, circuitRiskLabel, resetCircuit);
      content.appendChild(circuitRecovery);
    }

    const safety = styles(dom.create('div'), {
      display: 'grid', gridTemplateColumns: mode.mobile ? '1fr' : 'minmax(0, 1fr) auto', gap: '8px',
      alignItems: 'end', padding: '9px', marginBottom: '10px', border: '1px solid #47576b', background: '#1a2028',
    });
    const globalReserve = input(
      dom,
      'number',
      snapshot.safety?.minimumRetainedCoins ?? '',
      mode,
      'bronze-loop-trade-global-minimum-retained-coins',
    );
    const saveReserve = button(dom, 'Save reserve', mode, 'bronze-loop-trade-save-global-reserve');
    saveReserve.addEventListener('click', () => {
      try {
        const value = globalReserve.value === '' ? null : Number(globalReserve.value);
        options.onSetMinimumRetainedCoins?.(value);
        refreshSnapshot();
        setStatus(value === null ? 'Scheduled Buy global reserve cleared' : `Scheduled Buy global reserve set to ${value.toLocaleString()}`);
        render();
      } catch (error) {
        setStatus(`Reserve update failed: ${error?.message || error}`);
      }
    });
    safety.append(field(dom, 'Global minimum retained coins', globalReserve, mode), saveReserve);
    content.appendChild(safety);

    const validationGate = styles(dom.create('div'), {
      display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '9px',
      marginBottom: '10px', border: '1px solid #47576b', background: '#1a2028',
    });
    const guarded = selectGuardedScheduledTradeJob(snapshot, {
      scheduledBuyEnabled: options.scheduledBuyEnabled === true,
      scheduledTransferRepriceEnabled: options.scheduledTransferRepriceEnabled === true,
      scheduledBulkRelistEnabled: options.scheduledBulkRelistEnabled === true,
    });
    const recovery = options.getRecovery?.() || {};
    const recoveryBlocked = recovery.reviewRequired === true;
    if (snapshot.liveExecutionEnabled === true) {
      const gateState = dom.create('span');
      const authorizations = Object.values(snapshot.authorizations?.jobs || (snapshot.authorization ? { legacy: snapshot.authorization } : {}));
      const remainingRuns = authorizations.reduce((total, entry) => total + Number(entry.remainingRuns || 0), 0);
      const totalRuns = authorizations.reduce((total, entry) => total + Number(entry.totalRuns || 0), 0);
      const latestExpiry = authorizations.length ? Math.max(...authorizations.map((entry) => Number(entry.expiresAt || 0))) : null;
      gateState.textContent = `Guarded schedule enabled: ${authorizations.length} Job(s) | ${remainingRuns}/${totalRuns} Run(s) left${latestExpiry ? ` | latest expiry ${new Date(latestExpiry).toLocaleString()}` : ''}`;
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
      const gateSummary = dom.create('div');
      const scheduledJobs = guarded.jobs || [];
      const idleWithoutArmedJobs = guarded.reason === 'validation-gate-no-armed-job';
      gateSummary.textContent = recoveryBlocked
        ? 'Scheduling unavailable: recovery-review-required; open Recovery and verify the previous EA result before another Job'
        : idleWithoutArmedJobs
          ? 'Scheduler idle: no armed Job; completed Once Jobs are automatically disarmed'
        : guarded.ready
          ? `Enable ${scheduledJobs.length} Job(s) for ${guarded.totalRuns} authorized Run(s): ${guarded.gates.map(guardedJobApprovalSummary).join('; ')}`
          : `Scheduling unavailable: ${guarded.reason || 'no eligible armed Job'}`;
      styles(gateSummary, {
        flex: '1 1 280px',
        color: guarded.ready && !recoveryBlocked ? '#e3c98d' : idleWithoutArmedJobs && !recoveryBlocked ? '#b8c3d2' : '#e3a7a7',
        fontSize: '12px', overflowWrap: 'anywhere',
      });
      const enableGate = button(dom, 'Enable guarded schedule', mode, 'bronze-loop-trade-enable-guarded-schedule');
      enableGate.disabled = recoveryBlocked || guarded.ready !== true;
      enableGate.title = recoveryBlocked
        ? 'Resolve the previous Trade Journal in Recovery first'
        : guarded.ready
          ? 'Approve the displayed Job and Run summary'
          : idleWithoutArmedJobs ? 'Create or arm a Job before enabling scheduling' : guarded.reason || 'One armed Job is required';
      enableGate.addEventListener('click', async () => {
        enableGate.disabled = true;
        try {
          const jobIds = (guarded.jobs || []).map((job) => job.id);
          await options.onEnableGuardedScheduling?.({
            approved: true,
            ...(jobIds.length > 1 ? { jobIds } : { jobId: guarded.job?.id }),
          });
          refreshSnapshot();
          setStatus(`Guarded schedule enabled for ${jobIds.length} Job(s)`);
          render();
        } catch (error) {
          enableGate.disabled = false;
          setStatus(`Enable failed: ${error?.message || error}`);
        }
      });
      validationGate.append(gateSummary, enableGate);
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
      const continuation = runtime.continuation || null;
      const timing = continuation?.resumeAt
        ? ` | Resume ${new Date(continuation.resumeAt).toLocaleString()}`
        : runtime.nextRunAt !== null && runtime.nextRunAt !== undefined
          ? ` | Next ${new Date(runtime.nextRunAt).toLocaleString()}`
          : '';
      const progress = continuation
        ? ` | Slice ${Number(continuation.sliceCount || 1)} | ${Number(continuation.succeeded || 0)}/${Number(continuation.requested || 0)} complete`
        : '';
      detail.textContent = `${job.type} | ${tradeScheduleSummary(job)}${timing}${progress}`;
      styles(detail, { color: '#9aa6b8', fontSize: '11px', margin: '6px 0' });
      const buyPreview = buyPreviews.get(job.id);
      const buyAvailability = job.type === 'buy' ? buyValidationAvailability(job, buyPreview) : null;
      const previewDetail = job.type === 'buy' && buyPreview ? styles(dom.create('div'), {
        color: buyPreview.plan?.ready ? '#a9d7b5' : '#e3a7a7', fontSize: '11px', margin: '6px 0', lineHeight: '1.45', overflowWrap: 'anywhere',
      }) : null;
      if (previewDetail) {
        const lanes = (buyPreview.plan?.lanes || [])
          .map((lane) => `${lane.rating}: ${lane.definitionIds.length} player ID(s), max ${Number(lane.maxBuyNow).toLocaleString()}, quota ${lane.quantityLimit ?? 'Run cap'}`)
          .join(' | ');
        const missing = buyPreview.plan?.missingRatings?.length
          ? ` | Missing ratings: ${buyPreview.plan.missingRatings.join(', ')}`
          : '';
        const quantity = Number(job.policy.quantity || 1);
        previewDetail.textContent = `Preview only | ${lanes || 'No search lanes'}${missing} | Budget ${Number(job.policy.totalBudget || 0).toLocaleString()} | Runtime ${Number(job.policy.maxRuntimeMinutes || 0)} min | Chunk 2 | Up to ${Number(job.policy.maxPurchasesPerSearch || 1)} purchase(s) per search | ${buyAvailability.ready ? `Buy ${quantity} ready` : `Buy unavailable: ${buyAvailability.reason}`}`;
      }
      const actions = styles(dom.create('div'), { display: 'flex', gap: '6px', flexWrap: 'wrap' });
      const run = button(dom, job.type === 'buy' ? 'Preview' : job.type === 'bulk-relist' ? 'Open Re-list All' : 'Run now', mode);
      const validateBuy = job.type === 'buy' && buyAvailability.ready
        ? button(dom, `Buy ${Number(job.policy.quantity || 1)}`, mode, `bronze-loop-trade-buy-one-${job.id}`)
        : null;
      const edit = button(dom, 'Edit', mode);
      const duplicate = button(dom, 'Duplicate', mode);
      const remove = button(dom, 'Delete', mode);
      run.addEventListener('click', async () => {
        if (job.type === 'bulk-relist') {
          options.onOpenBulkRelist?.();
          return;
        }
        if (job.type !== 'buy') {
          options.onOpenManualListing?.(job);
          return;
        }
        run.disabled = true;
        if (validateBuy) validateBuy.disabled = true;
        buyPreviews.delete(job.id);
        setStatus(`Loading Buy preview for ${job.name}`);
        try {
          const preview = await options.onPreviewBuyJob?.(job);
          if (!preview) throw new Error('Buy preview is unavailable');
          buyPreviews.set(job.id, preview);
          refreshSnapshot();
          const availability = buyValidationAvailability(job, preview);
          setStatus(preview.plan?.ready
            ? `Buy preview ready: ${preview.summary?.ratings || 0} rating lane(s), ${preview.summary?.definitions || 0} player definition(s); ${availability.ready ? `Buy ${Number(job.policy.quantity || 1)} is available` : `Buy unavailable (${availability.reason})`}`
            : `Buy preview blocked: missing rating lane(s) ${(preview.plan?.missingRatings || []).join(', ') || 'unknown'}`);
          render();
        } catch (error) {
          setStatus(`Buy preview failed: ${error?.message || error}`);
          render();
        }
      });
      validateBuy?.addEventListener('click', () => options.onOpenManualBuy?.(job, buyPreview));
      edit.addEventListener('click', () => { editing = createTradeJobDraft(job.type, { job, now: now() }); renderEditor(); });
      duplicate.addEventListener('click', () => {
        const copy = createTradeJobDraft(job.type, { job, now: now() });
        copy.id = uniqueJobId(job.type, now());
        copy.name = `${job.name} copy`;
        copy.armed = false;
        editing = copy;
        renderEditor();
      });
      remove.addEventListener('click', () => {
        buyPreviews.delete(job.id);
        options.onDeleteJob?.(job.id);
        refreshSnapshot();
        render();
      });
      actions.append(run);
      if (validateBuy) actions.append(validateBuy);
      actions.append(edit, duplicate, remove);
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

  function renderRecovery() {
    content.textContent = '';
    const recovery = options.getRecovery?.() || {};
    const reviews = Array.isArray(recovery.reviews) ? recovery.reviews : [];
    const intro = styles(dom.create('div'), {
      color: reviews.length ? '#e3a7a7' : '#a9d7b5', fontSize: '12px', marginBottom: '12px', lineHeight: '1.45',
    });
    intro.textContent = reviews.length
      ? 'A mutation boundary is unresolved. Scheduler execution remains locked until the EA state is checked and each Journal is acknowledged.'
      : 'No unresolved Trade Journal requires acknowledgement.';
    content.appendChild(intro);

    const operation = recovery.operation || {};
    const lease = recovery.lease || {};
    const canAcknowledge = recovery.scheduler?.paused === true
      && recovery.scheduler?.liveExecutionEnabled !== true
      && !operation.active
      && operation.external?.busy !== true
      && lease.active !== true
      && lease.owned !== true;
    const gate = styles(dom.create('div'), {
      color: canAcknowledge ? '#a9d7b5' : '#e3c39d', fontSize: '12px', marginBottom: '12px',
    });
    gate.textContent = canAcknowledge
      ? 'Acknowledgement gate: ready'
      : 'Acknowledgement gate: Scheduler must be locked, Runner idle, and Trade Lease inactive';
    content.appendChild(gate);

    for (const review of reviews) {
      const card = styles(dom.create('div'), {
        border: '1px solid #714f55', background: '#241d22', padding: '10px', marginBottom: '10px',
      });
      const heading = dom.create('div');
      heading.textContent = `${String(review.journalType || 'trade').toUpperCase()} Recovery | Run ${review.runId}`;
      styles(heading, { fontWeight: '700', color: '#f1c1c1', overflowWrap: 'anywhere' });
      const details = dom.create('div');
      details.textContent = `Job ${review.jobId || 'unknown'} | Status ${review.status} | Phase ${review.phase} | Mutation items ${review.mutationItemCount} | Uncertain items ${review.uncertainItemCount}`;
      styles(details, { color: '#c5aeb2', fontSize: '11px', margin: '6px 0', overflowWrap: 'anywhere', lineHeight: '1.45' });
      const hash = dom.create('div');
      hash.textContent = `Evidence: ${review.evidenceHash}`;
      styles(hash, { color: '#9fb2c9', fontSize: '11px', overflowWrap: 'anywhere' });
      const resolution = select(dom, '', [
        { value: '', text: 'Select verified result' },
        { value: 'confirmed-completed', text: 'Verified completed in EA' },
        { value: 'confirmed-not-completed', text: 'Verified not completed in EA' },
        { value: 'archive-unknown', text: 'Archive as unknown and unlock' },
      ], mode, `bronze-loop-trade-recovery-resolution-${review.journalType}`);
      const riskAccepted = input(dom, 'checkbox', false, mode, `bronze-loop-trade-recovery-risk-${review.journalType}`);
      const riskLabel = checkboxLabel('I understand this archives evidence without retrying the transaction', riskAccepted);
      const acknowledge = button(dom, 'Archive review and unlock', mode, `bronze-loop-trade-recovery-ack-${review.journalType}`);
      styles(acknowledge, { background: '#8f2d36', borderColor: '#c44d58' });
      const updateRecoveryAction = () => {
        acknowledge.disabled = !canAcknowledge || !resolution.value || riskAccepted.checked !== true;
      };
      resolution.addEventListener('change', updateRecoveryAction);
      riskAccepted.addEventListener('change', updateRecoveryAction);
      updateRecoveryAction();
      acknowledge.addEventListener('click', () => {
        try {
          options.onAcknowledgeRecovery?.({
            journalType: review.journalType,
            runId: review.runId,
            evidenceHash: review.evidenceHash,
            resolution: resolution.value,
            riskAccepted: riskAccepted.checked,
          });
          setStatus(`${String(review.journalType).toUpperCase()} recovery acknowledged`);
          render();
        } catch (error) {
          setStatus(`Recovery acknowledgement failed: ${error?.message || error}`);
        }
      });
      const form = styles(dom.create('div'), {
        display: 'grid', gridTemplateColumns: mode.mobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.5fr) auto',
        gap: '8px', alignItems: 'end', marginTop: '9px',
      });
      form.append(field(dom, 'Verified result', resolution, mode), riskLabel, acknowledge);
      card.append(heading, details, hash, form);
      content.appendChild(card);
    }

    content.appendChild(section(dom, 'Acknowledgement audit'));
    const entries = Array.isArray(recovery.audit?.entries) ? [...recovery.audit.entries].reverse() : [];
    if (!entries.length) {
      const empty = dom.create('div');
      empty.textContent = 'No manual recovery acknowledgements recorded';
      styles(empty, { color: '#8795a8', padding: '8px 0' });
      content.appendChild(empty);
    } else {
      for (const entry of entries) {
        const row = styles(dom.create('div'), {
          borderBottom: '1px solid #35404e', padding: '7px 0', fontSize: '11px', overflowWrap: 'anywhere',
        });
        row.textContent = `${String(entry.journalType || 'trade').toUpperCase()} | ${entry.runId} | ${new Date(Number(entry.acknowledgedAt || 0)).toLocaleString()} | ${entry.reason}`;
        content.appendChild(row);
      }
    }
  }

  function renderSummary() {
    content.textContent = '';
    const metrics = snapshot.metrics || {};
    const runs = metrics.runs || {};
    const statuses = runs.byStatus || {};
    const outcomes = metrics.outcomes || {};
    const buy = metrics.buy || {};
    const listing = metrics.listing || {};
    const bulkRelist = metrics.bulkRelist || {};
    const requestPacing = options.getRequestPacing?.() || {};
    const lastAction = requestPacing.lastAction || {};
    const cycle = requestPacing.cycle || {};
    const cooldown = requestPacing.cooldown || {};
    const groups = [
      ['Runs', [
        ['Total', runs.total], ['Completed', statuses.completed], ['Blocked', statuses.blocked],
        ['Missed', statuses.missed], ['Stopped', statuses.stopped], ['Failed', Number(statuses.failed || 0) + Number(statuses.error || 0)],
      ]],
      ['Outcomes', [
        ['Requested', outcomes.requested], ['Succeeded', outcomes.succeeded],
        ['Failed', outcomes.failed], ['Skipped', outcomes.skipped],
      ]],
      ['Buy', [
        ['Purchased', buy.purchases], ['Searches', buy.searches],
        ['Attempts', buy.attempts], ['Spent', Number(buy.spent || 0).toLocaleString()],
      ]],
      ['Listing', [['Listed', listing.listed]]],
      ['Re-list All', [['Relisted', bulkRelist.relisted]]],
      ['Request pacing', [
        ['Status', requestPacing.status || 'available'],
        ['Last action', lastAction.action || 'None'],
        ['Effective interval', lastAction.delaySeconds === undefined ? 'None' : `${Number(lastAction.delaySeconds)} sec`],
        ['Next allowed', requestPacing.nextAllowedAt ? new Date(Number(requestPacing.nextAllowedAt)).toLocaleString() : 'Now'],
        ['Cycle', cycle.threshold ? `${Number(cycle.count || 0)}/${Number(cycle.threshold)}` : 'Inactive'],
        ['429 cooldown', cooldown.active ? `Level ${Number(cooldown.level || 1)}` : 'Inactive'],
      ]],
    ];
    const grid = styles(dom.create('div'), {
      display: 'grid', gridTemplateColumns: mode.mobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '12px',
    });
    for (const [label, values] of groups) {
      const group = styles(dom.create('div'), { borderTop: '1px solid #47576b', paddingTop: '8px', minWidth: '0' });
      const heading = dom.create('div');
      heading.textContent = label;
      styles(heading, { fontWeight: '700', marginBottom: '6px' });
      group.appendChild(heading);
      for (const [name, rawValue] of values) {
        const row = styles(dom.create('div'), { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '3px 0' });
        const key = dom.create('span');
        const value = dom.create('span');
        key.textContent = name;
        value.textContent = String(rawValue ?? 0);
        styles(key, { color: '#aeb8c6' });
        styles(value, { fontVariantNumeric: 'tabular-nums' });
        row.append(key, value);
        group.appendChild(row);
      }
      grid.appendChild(group);
    }
    content.appendChild(grid);

    if (Number(requestPacing.nextAllowedAt || 0) > Number(now())) {
      const pacingWait = styles(dom.create('div'), { borderTop: '1px solid #47576b', marginTop: '12px', paddingTop: '8px', color: '#e3c39d', fontSize: '12px' });
      pacingWait.textContent = `Next Trade action allowed after ${new Date(Number(requestPacing.nextAllowedAt)).toLocaleString()} (${requestPacing.reason || 'pacing'})`;
      content.appendChild(pacingWait);
    }

    const period = styles(dom.create('div'), { borderTop: '1px solid #47576b', marginTop: '12px', paddingTop: '8px', color: '#aeb8c6', fontSize: '12px' });
    const firstAt = Number(metrics.firstRecordedAt || 0);
    const lastAt = Number(metrics.lastRecordedAt || 0);
    period.textContent = firstAt
      ? `Tracked ${new Date(firstAt).toLocaleString()} - ${new Date(lastAt || firstAt).toLocaleString()}`
      : 'No recorded Trade runs';
    content.appendChild(period);

    const reasons = Array.isArray(metrics.reasons) ? metrics.reasons : [];
    if (reasons.length) {
      const reasonGroup = styles(dom.create('div'), { borderTop: '1px solid #47576b', marginTop: '12px', paddingTop: '8px' });
      const reasonHeading = dom.create('div');
      reasonHeading.textContent = 'Stop reasons';
      styles(reasonHeading, { fontWeight: '700', marginBottom: '6px' });
      reasonGroup.appendChild(reasonHeading);
      for (const entry of reasons) {
        const row = styles(dom.create('div'), { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '3px 0' });
        const reason = dom.create('span');
        const count = dom.create('span');
        reason.textContent = String(entry.reason || 'unknown');
        count.textContent = String(Number(entry.count || 0));
        styles(reason, { overflowWrap: 'anywhere', color: '#aeb8c6' });
        styles(count, { fontVariantNumeric: 'tabular-nums' });
        row.append(reason, count);
        reasonGroup.appendChild(row);
      }
      content.appendChild(reasonGroup);
    }
  }

  function renderImport() {
    content.textContent = '';
    const heading = section(dom, 'Import Trade Jobs');
    const textarea = dom.create('textarea');
    textarea.id = 'bronze-loop-trade-import-json';
    textarea.value = '';
    textarea.spellcheck = false;
    styles(textarea, {
      width: '100%', minHeight: mode.mobile ? '42dvh' : '320px', boxSizing: 'border-box', resize: 'vertical',
      border: '1px solid #596a7e', background: '#0d1117', color: '#eef2f6', padding: '10px',
      font: '12px Consolas, monospace', lineHeight: '1.45', overflowWrap: 'normal', whiteSpace: 'pre',
    });
    const actions = styles(dom.create('div'), { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' });
    const validate = button(dom, 'Validate', mode, 'bronze-loop-trade-import-validate');
    const replace = button(dom, 'Replace jobs', mode, 'bronze-loop-trade-import-apply');
    const cancel = button(dom, 'Cancel', mode, 'bronze-loop-trade-import-cancel');
    replace.disabled = true;
    const invalidate = () => {
      validatedImportText = null;
      replace.disabled = true;
      replace.textContent = 'Replace jobs';
    };
    textarea.addEventListener('input', invalidate);
    textarea.addEventListener('change', invalidate);
    validate.addEventListener('click', () => {
      try {
        const result = options.onValidateJobConfig?.(textarea.value);
        if (!result || !Array.isArray(result.jobs)) throw new Error('Trade Job configuration validator is unavailable');
        validatedImportText = textarea.value;
        replace.disabled = false;
        replace.textContent = `Replace with ${result.jobs.length} Job(s)`;
        setStatus(`Valid configuration: ${result.jobs.length} Job(s)`);
      } catch (error) {
        invalidate();
        setStatus(`Validation failed: ${error?.message || error}`);
      }
    });
    replace.addEventListener('click', () => {
      if (textarea.value !== validatedImportText) {
        invalidate();
        setStatus('Configuration changed; validate again');
        return;
      }
      try {
        const result = options.onImportJobConfig?.(textarea.value);
        if (!result || !Array.isArray(result.jobs)) throw new Error('Trade Job configuration importer is unavailable');
        buyPreviews.clear();
        validatedImportText = null;
        refreshSnapshot();
        view = 'jobs';
        setStatus(`Imported ${result.jobs.length} Job(s); all Jobs are unarmed`);
        render();
      } catch (error) {
        setStatus(`Import failed: ${error?.message || error}`);
      }
    });
    cancel.addEventListener('click', () => {
      validatedImportText = null;
      view = 'jobs';
      render();
    });
    actions.append(validate, replace, cancel);
    content.append(heading, textarea, actions);
  }

  function renderProviders() {
    content.textContent = '';
    const health = options.getProviderHealth?.() || {};
    const catalog = health.playerCatalog || {};
    const quotes = health.priceQuotes || {};

    function appendRows(group, values) {
      for (const [name, rawValue] of values) {
        const row = styles(dom.create('div'), { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '3px 0' });
        const key = dom.create('span');
        const value = dom.create('span');
        key.textContent = name;
        value.textContent = String(rawValue ?? 0);
        styles(key, { color: '#aeb8c6' });
        styles(value, { textAlign: 'right', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' });
        row.append(key, value);
        group.appendChild(row);
      }
    }

    const grid = styles(dom.create('div'), {
      display: 'grid', gridTemplateColumns: mode.mobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '14px',
    });
    const catalogGroup = styles(dom.create('div'), { borderTop: '1px solid #47576b', paddingTop: '8px', minWidth: '0' });
    const catalogHeading = dom.create('div');
    catalogHeading.textContent = 'Player catalog';
    styles(catalogHeading, { fontWeight: '700', marginBottom: '6px' });
    catalogGroup.appendChild(catalogHeading);
    appendRows(catalogGroup, [
      ['Provider', catalog.provider || 'FUTNext'], ['Status', catalog.status || 'unavailable'],
      ['Platform', catalog.cache?.platform || 'pc'], ['Season', catalog.cache?.season || '26'],
      ['Lanes', catalog.cache?.lanes], ['Fresh / expired', `${Number(catalog.cache?.freshLanes || 0)} / ${Number(catalog.cache?.expiredLanes || 0)}`],
      ['Definitions', catalog.cache?.definitions], ['Loads', catalog.activity?.loadCount],
      ['Last load', catalog.activity?.lastLoad?.at ? new Date(catalog.activity.lastLoad.at).toLocaleString() : 'none'],
    ]);
    const clearCatalog = button(dom, 'Clear player catalog', mode, 'bronze-loop-trade-clear-player-catalog');
    clearCatalog.disabled = !Number(catalog.cache?.lanes || 0);
    clearCatalog.addEventListener('click', () => {
      try {
        options.onClearPlayerCatalogCache?.();
        refreshSnapshot();
        setStatus('Player catalog cache cleared; Scheduler relocked and all Jobs disarmed');
        render();
      } catch (error) {
        setStatus(`Player catalog clear failed: ${error?.message || error}`);
      }
    });
    styles(clearCatalog, { marginTop: '8px' });
    catalogGroup.appendChild(clearCatalog);

    const quoteGroup = styles(dom.create('div'), { borderTop: '1px solid #47576b', paddingTop: '8px', minWidth: '0' });
    const quoteHeading = dom.create('div');
    quoteHeading.textContent = 'Price quotes';
    styles(quoteHeading, { fontWeight: '700', marginBottom: '6px' });
    quoteGroup.appendChild(quoteHeading);
    const sources = Object.entries(quotes.cache?.bySource || {}).map(([source, count]) => `${source}:${count}`).join(', ') || 'none';
    const platforms = Object.entries(quotes.cache?.byPlatform || {}).map(([platform, count]) => `${platform}:${count}`).join(', ') || 'none';
    const futGgCircuit = quotes.futGgCircuit || {};
    appendRows(quoteGroup, [
      ['Providers', (quotes.providers || ['FUT.GG', 'FUTNext']).join(' / ')], ['Status', quotes.status || 'unavailable'],
      ['FUT.GG proxy', quotes.futGgProxy?.configured ? (quotes.futGgProxy.origin || 'configured') : 'direct'],
      ['Entries', quotes.cache?.entries], ['Fresh / expired', `${Number(quotes.cache?.freshEntries || 0)} / ${Number(quotes.cache?.expiredEntries || 0)}`],
      ['Sources', sources], ['Platforms', platforms], ['Loads', quotes.activity?.loadCount],
      ['Last load', quotes.activity?.lastLoad?.at ? new Date(quotes.activity.lastLoad.at).toLocaleString() : 'none'],
      ['FUT.GG circuit', futGgCircuit.state || 'closed'],
      ['FUT.GG retry after', futGgCircuit.blockedUntil ? new Date(futGgCircuit.blockedUntil).toLocaleString() : 'now'],
    ]);
    const clearQuotes = button(dom, 'Clear price quotes', mode, 'bronze-loop-trade-clear-price-quotes');
    clearQuotes.disabled = !Number(quotes.cache?.entries || 0) && futGgCircuit.state !== 'open';
    clearQuotes.addEventListener('click', () => {
      try {
        options.onClearPriceQuoteCache?.();
        refreshSnapshot();
        setStatus('Price quote cache cleared; Scheduler relocked and all Jobs disarmed');
        render();
      } catch (error) {
        setStatus(`Price quote clear failed: ${error?.message || error}`);
      }
    });
    styles(clearQuotes, { marginTop: '8px' });
    quoteGroup.appendChild(clearQuotes);

    const proxyGroup = styles(dom.create('div'), { borderTop: '1px solid #47576b', paddingTop: '8px', marginTop: '12px', minWidth: '0' });
    const proxyHeading = dom.create('div');
    proxyHeading.textContent = 'FUT.GG forwarding proxy';
    styles(proxyHeading, { fontWeight: '700', marginBottom: '6px' });
    const proxyInput = input(dom, 'url', options.getFutGgProxy?.() || '', mode, 'bronze-loop-trade-futgg-proxy');
    proxyInput.placeholder = 'https://proxy.example/';
    proxyInput.autocomplete = 'off';
    const proxyActions = styles(dom.create('div'), { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' });
    const saveProxy = button(dom, 'Save FUT.GG proxy', mode, 'bronze-loop-trade-save-futgg-proxy');
    const clearProxy = button(dom, 'Clear FUT.GG proxy', mode, 'bronze-loop-trade-clear-futgg-proxy');
    clearProxy.disabled = !String(options.getFutGgProxy?.() || '').trim();
    saveProxy.addEventListener('click', () => {
      try {
        options.onSetFutGgProxy?.(proxyInput.value);
        refreshSnapshot();
        setStatus('FUT.GG proxy saved; price cache cleared and Scheduler relocked');
        render();
      } catch (error) {
        setStatus(`FUT.GG proxy save failed: ${error?.message || error}`);
      }
    });
    clearProxy.addEventListener('click', () => {
      try {
        options.onSetFutGgProxy?.('');
        refreshSnapshot();
        setStatus('FUT.GG proxy cleared; direct FUT.GG is enabled');
        render();
      } catch (error) {
        setStatus(`FUT.GG proxy clear failed: ${error?.message || error}`);
      }
    });
    proxyActions.append(saveProxy, clearProxy);
    proxyGroup.append(proxyHeading, proxyInput, proxyActions);

    grid.append(catalogGroup, quoteGroup);
    content.appendChild(grid);
    content.appendChild(proxyGroup);
  }

  function render(input = {}) {
    if (input.refresh !== false) refreshSnapshot();
    renderBanner();
    jobsTab.style.background = ['jobs', 'import'].includes(view) ? '#315d9b' : '#222832';
    summaryTab.style.background = view === 'summary' ? '#315d9b' : '#222832';
    providersTab.style.background = view === 'providers' ? '#315d9b' : '#222832';
    historyTab.style.background = view === 'history' ? '#315d9b' : '#222832';
    recoveryTab.style.background = view === 'recovery' ? '#315d9b' : '#222832';
    if (editing) renderEditor();
    else if (view === 'import') renderImport();
    else if (view === 'summary') renderSummary();
    else if (view === 'providers') renderProviders();
    else if (view === 'history') renderHistory();
    else if (view === 'recovery') renderRecovery();
    else renderJobs();
    status.textContent = statusText;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (refreshHandle !== null && refreshHandle !== undefined) cancelRefresh?.(refreshHandle);
    refreshHandle = null;
  }

  function closeDialog() {
    dispose();
    overlay.remove?.();
  }

  function refreshFromExternalState() {
    if (disposed) return;
    if (overlay.isConnected === false) {
      dispose();
      return;
    }
    const next = clone(options.getSnapshot?.() || snapshot || {});
    const nextSignature = JSON.stringify(next);
    const nextRecoverySignature = JSON.stringify(options.getRecovery?.() || {});
    const changed = nextSignature !== snapshotSignature || nextRecoverySignature !== recoverySignature;
    snapshot = next;
    snapshotSignature = nextSignature;
    recoverySignature = nextRecoverySignature;
    renderBanner();
    if (!changed || editing || view === 'import') return;
    statusText = '';
    const scrollTop = Number(dialog.scrollTop || 0);
    render({ refresh: false });
    dialog.scrollTop = scrollTop;
  }

  jobsTab.addEventListener('click', () => { editing = null; view = 'jobs'; render(); });
  summaryTab.addEventListener('click', () => { editing = null; view = 'summary'; render(); });
  providersTab.addEventListener('click', () => { editing = null; view = 'providers'; render(); });
  historyTab.addEventListener('click', () => { editing = null; view = 'history'; render(); });
  recoveryTab.addEventListener('click', () => { editing = null; view = 'recovery'; render(); });
  close.addEventListener('click', closeDialog);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeDialog(); });
  dialog.append(heading, tabs, banner, content, status);
  overlay.appendChild(dialog);
  dom.appendToBody(overlay);
  applyResponsiveDialogLayout({ dom, mode, overlay, dialog, title: heading, controls: [jobsTab, summaryTab, providersTab, historyTab, recoveryTab, close] });
  render();
  overlay.__disposeTradeSchedulerDialog = dispose;
  if (scheduleRefresh) refreshHandle = scheduleRefresh(refreshFromExternalState, refreshIntervalMs);
  return overlay;
}
