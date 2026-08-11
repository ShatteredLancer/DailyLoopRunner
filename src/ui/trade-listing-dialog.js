import {
  createManualListingJob,
  createManualListingPreviewJob,
  createManualTransferRepriceJob,
  MANUAL_LISTING_LIVE_LIMIT,
} from '../trade/manual-listing.js';
import { createTradeListingRecap } from '../trade/listing-recap.js';
import { applyResponsiveDialogLayout, readResponsiveUiMode, responsiveControlHeight } from './responsive-dialog.js';

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function button(dom, text, options = {}) {
  const value = dom.create('button');
  value.type = 'button';
  value.textContent = text;
  if (options.id) value.id = options.id;
  applyStyles(value, {
    minHeight: responsiveControlHeight(options.mode), padding: '0 12px', cursor: 'pointer', color: '#fff',
    background: options.primary ? '#2f6fde' : options.danger ? '#8f2d36' : '#222832',
    border: `1px solid ${options.primary ? '#4f8cff' : options.danger ? '#c44d58' : '#607089'}`,
  });
  return value;
}

function control(dom, type, value, mode, options = {}) {
  const input = dom.create(type === 'select' ? 'select' : 'input');
  if (type !== 'select') input.type = type;
  if (options.id) input.id = options.id;
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.step !== undefined) input.step = String(options.step);
  input.value = String(value ?? '');
  applyStyles(input, {
    width: '100%', minWidth: '0', height: responsiveControlHeight(mode), boxSizing: 'border-box',
    fontSize: mode?.touchTargets ? '16px' : '', background: '#222832', color: '#f4f6f8',
    border: '1px solid #607089', padding: '0 8px',
  });
  return input;
}

function option(dom, value, text) {
  const item = dom.create('option');
  item.value = value;
  item.textContent = text;
  return item;
}

function selectControl(dom, value, items, mode, options = {}) {
  const select = control(dom, 'select', value, mode, options);
  items.forEach((item) => select.appendChild(option(dom, item.value, item.text)));
  select.value = String(value);
  return select;
}

function field(dom, labelText, input, mode) {
  const label = dom.create('label');
  applyStyles(label, {
    display: 'grid', gridTemplateColumns: mode?.mobile ? '1fr' : '150px minmax(0, 1fr)',
    alignItems: 'center', gap: '8px', minWidth: '0',
  });
  const text = dom.create('span');
  text.textContent = labelText;
  applyStyles(text, { color: '#b8c3d2', fontSize: '12px' });
  label.append(text, input);
  return label;
}

function sectionTitle(dom, text) {
  const title = dom.create('div');
  title.textContent = text;
  applyStyles(title, { color: '#d9e1eb', fontSize: '12px', fontWeight: '700', margin: '4px 0 2px' });
  return title;
}

function defaultDraft(input = {}) {
  const requestedSources = new Set((Array.isArray(input.sources) ? input.sources : ['club']).map(String));
  const sources = ['club', 'transfer'].filter((source) => requestedSources.has(source));
  return {
    id: input.id ? String(input.id) : undefined,
    name: input.name ? String(input.name) : undefined,
    sources: sources.length ? sources : ['club'],
    cardClass: String(input.cardClass || 'common-gold'),
    ratingRules: clone(input.ratingRules?.length ? input.ratingRules : [{ min: 75, max: 82, buyNow: 700 }]),
    marketOverride: {
      enabled: input.marketOverride?.enabled === true,
      markupPercent: Number(input.marketOverride?.markupPercent ?? 5),
      maxQuoteAgeMinutes: Number(input.marketOverride?.maxQuoteAgeMinutes ?? 10),
    },
    startPricePolicy: String(input.startPricePolicy || 'one-step-below'),
    durationSeconds: Number(input.durationSeconds || 3600),
    expiredPolicy: input.expiredPolicy === 'reprice' ? 'reprice' : 'skip',
    provider: String(input.provider || 'auto'),
    platform: String(input.platform || 'pc'),
  };
}

function formatCoins(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : '?';
}

export function showTradeListingDialog(options = {}) {
  const dom = options.dom;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  dom.query?.('#bronze-loop-trade-listing-modal')?.remove?.();
  const mode = readResponsiveUiMode(dom);
  const draft = defaultDraft(options.draft);
  let previewResult = null;
  let preparedResult = null;
  let receipt = null;
  let currentJob = null;
  let lastError = null;
  let recapPage = 1;
  let busy = false;
  let running = false;
  const editableControls = [];

  const overlay = dom.create('div');
  overlay.id = 'bronze-loop-trade-listing-modal';
  applyStyles(overlay, {
    position: 'fixed', inset: '0', zIndex: '1000001', background: 'rgba(0,0,0,.74)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: mode.mobile ? '0' : '20px', boxSizing: 'border-box',
  });
  const dialog = dom.create('div');
  applyStyles(dialog, {
    width: 'min(900px, 100%)', maxHeight: mode.mobile ? '100dvh' : '92vh', overflow: 'auto',
    background: '#171b21', color: '#f4f6f8', border: '1px solid #65758a', padding: '14px',
    boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
  });
  const heading = dom.create('div');
  applyStyles(heading, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' });
  const title = dom.create('div');
  title.textContent = 'Trade Listings';
  applyStyles(title, { fontSize: '17px', fontWeight: '700' });
  const gate = dom.create('span');
  gate.textContent = `Live gate: ${MANUAL_LISTING_LIVE_LIMIT} item`;
  applyStyles(gate, { color: '#9fb2c9', fontSize: '11px', border: '1px solid #536276', padding: '4px 7px' });
  heading.append(title, gate);

  const workspace = dom.create('div');
  applyStyles(workspace, {
    display: 'grid', gridTemplateColumns: mode.mobile ? '1fr' : 'minmax(280px, 360px) minmax(0, 1fr)',
    gap: '16px', alignItems: 'start',
  });
  const editor = dom.create('div');
  applyStyles(editor, { display: 'flex', flexDirection: 'column', gap: '9px', minWidth: '0' });
  const output = dom.create('div');
  applyStyles(output, { minWidth: '0', minHeight: mode.mobile ? '180px' : '420px', borderLeft: mode.mobile ? '0' : '1px solid #35404e', paddingLeft: mode.mobile ? '0' : '16px' });

  const source = selectControl(dom, draft.sources.join(','), [
    { value: 'club', text: 'Club' },
    { value: 'transfer', text: 'Transfer List' },
    { value: 'club,transfer', text: 'Club + Transfer List' },
  ], mode, { id: 'bronze-loop-trade-source' });
  const cardClass = selectControl(dom, draft.cardClass, [
    { value: 'common-gold', text: 'Common Gold' },
    { value: 'rare-gold', text: 'Rare Gold' },
    { value: 'normal-gold', text: 'All normal Gold' },
    { value: 'special', text: 'Special' },
  ], mode, { id: 'bronze-loop-trade-card-class' });
  const provider = selectControl(dom, draft.provider, [
    { value: 'auto', text: 'Auto: FUT.GG -> FUTNext' },
    { value: 'futgg', text: 'FUT.GG' },
    { value: 'futnext', text: 'FUTNext' },
  ], mode, { id: 'bronze-loop-trade-provider' });
  const duration = selectControl(dom, draft.durationSeconds, [
    { value: '3600', text: '1 hour' },
    { value: '10800', text: '3 hours' },
    { value: '21600', text: '6 hours' },
    { value: '43200', text: '12 hours' },
    { value: '86400', text: '1 day' },
    { value: '259200', text: '3 days' },
  ], mode, { id: 'bronze-loop-trade-duration' });
  const startPolicy = selectControl(dom, draft.startPricePolicy, [
    { value: 'one-step-below', text: 'One step below Buy Now' },
    { value: 'same', text: 'Same as Buy Now' },
  ], mode, { id: 'bronze-loop-trade-start-policy' });
  const expiredPolicy = selectControl(dom, draft.expiredPolicy, [
    { value: 'skip', text: 'Skip expired' },
    { value: 'reprice', text: 'Include expired in Preview' },
  ], mode, { id: 'bronze-loop-trade-expired-policy' });
  const marketLabel = dom.create('label');
  applyStyles(marketLabel, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: responsiveControlHeight(mode) });
  const marketEnabled = dom.create('input');
  marketEnabled.id = 'bronze-loop-trade-market-enabled';
  marketEnabled.type = 'checkbox';
  marketEnabled.checked = draft.marketOverride.enabled;
  marketEnabled.style.accentColor = '#78a6ff';
  const marketText = dom.create('span');
  marketText.textContent = 'Use market quote when higher';
  marketLabel.append(marketEnabled, marketText);
  const markup = control(dom, 'number', draft.marketOverride.markupPercent, mode, { id: 'bronze-loop-trade-markup', min: 0, max: 100, step: 1 });
  const quoteAge = control(dom, 'number', draft.marketOverride.maxQuoteAgeMinutes, mode, { id: 'bronze-loop-trade-quote-age', min: 1, max: 1440, step: 1 });

  editor.append(
    sectionTitle(dom, 'Selection'),
    field(dom, 'Source', source, mode),
    field(dom, 'Card class', cardClass, mode),
  );
  const rulesHeader = dom.create('div');
  applyStyles(rulesHeader, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' });
  rulesHeader.appendChild(sectionTitle(dom, 'Rating rules'));
  const addRule = button(dom, '+', { mode, id: 'bronze-loop-trade-add-rule' });
  addRule.title = 'Add rating rule';
  addRule.setAttribute?.('aria-label', 'Add rating rule');
  applyStyles(addRule, { width: responsiveControlHeight(mode), padding: '0' });
  rulesHeader.appendChild(addRule);
  const rules = dom.create('div');
  rules.id = 'bronze-loop-trade-rules';
  applyStyles(rules, { display: 'flex', flexDirection: 'column', gap: '6px' });
  editor.append(
    rulesHeader,
    rules,
    sectionTitle(dom, 'Pricing'),
    marketLabel,
    field(dom, 'Quote provider', provider, mode),
    field(dom, 'Markup %', markup, mode),
    field(dom, 'Quote max age', quoteAge, mode),
    field(dom, 'Start price', startPolicy, mode),
    field(dom, 'Duration', duration, mode),
    field(dom, 'Expired Transfer items', expiredPolicy, mode),
  );

  const status = dom.create('div');
  status.id = 'bronze-loop-trade-status';
  status.setAttribute?.('role', 'status');
  status.setAttribute?.('aria-live', 'polite');
  applyStyles(status, { minHeight: '18px', color: '#9fb2c9', fontSize: '11px', marginTop: '12px' });
  const confirmation = control(dom, 'text', '', mode, { id: 'bronze-loop-trade-confirmation' });
  confirmation.autocomplete = 'off';
  confirmation.placeholder = 'Confirmation';
  confirmation.style.display = 'none';

  const actions = dom.create('div');
  applyStyles(actions, { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginTop: '12px' });
  const previewButton = button(dom, 'Preview', { mode, id: 'bronze-loop-trade-preview' });
  const prepareButton = button(dom, 'Prepare', { mode, id: 'bronze-loop-trade-prepare', primary: true });
  const executeButton = button(dom, 'List item', { mode, id: 'bronze-loop-trade-execute', primary: true });
  const stopButton = button(dom, 'Stop', { mode, id: 'bronze-loop-trade-stop', danger: true });
  const diagnosticsButton = button(dom, 'Save diagnostics', { mode, id: 'bronze-loop-trade-diagnostics' });
  const closeButton = button(dom, 'Close', { mode, id: 'bronze-loop-trade-close' });
  executeButton.style.display = 'none';
  stopButton.style.display = 'none';
  actions.append(previewButton, prepareButton, confirmation, executeButton, stopButton, diagnosticsButton, closeButton);

  function latestArtifact() {
    return receipt || preparedResult || previewResult || lastError;
  }

  function updateActionState() {
    editableControls.forEach((item) => { item.disabled = busy || running; });
    addRule.disabled = busy || running;
    previewButton.disabled = busy || running;
    const sourceAction = draft.sources.length === 1 && draft.sources[0] === 'club'
      ? 'list'
      : draft.sources.length === 1 && draft.sources[0] === 'transfer' && draft.expiredPolicy === 'reprice'
        ? 'reprice'
        : null;
    prepareButton.textContent = sourceAction === 'reprice' ? 'Prepare reprice' : 'Prepare';
    executeButton.textContent = sourceAction === 'reprice' ? 'Reprice item' : 'List item';
    prepareButton.disabled = busy || running || sourceAction === null;
    prepareButton.title = sourceAction === null ? 'Mixed sources and skipped expired items are Preview-only' : '';
    closeButton.disabled = running;
    diagnosticsButton.disabled = !latestArtifact() || busy || running;
    const requiredText = preparedResult?.confirmation?.requiredText || '';
    confirmation.style.display = preparedResult?.ready && !receipt ? '' : 'none';
    executeButton.style.display = preparedResult?.ready && !receipt ? '' : 'none';
    executeButton.disabled = busy || running || !requiredText || confirmation.value !== requiredText;
    stopButton.style.display = running ? '' : 'none';
    stopButton.disabled = !running;
    markup.disabled = busy || running || !marketEnabled.checked;
    quoteAge.disabled = busy || running || !marketEnabled.checked;
    provider.disabled = busy || running || !marketEnabled.checked;
  }

  function clearPrepared() {
    if (preparedResult) options.onCancelPrepared?.();
    preparedResult = null;
    receipt = null;
    confirmation.value = '';
  }

  function invalidate() {
    clearPrepared();
    previewResult = null;
    currentJob = null;
    lastError = null;
    output.textContent = '';
    status.textContent = 'Configuration changed';
    updateActionState();
  }

  function onDraftChange() {
    draft.sources = String(source.value || 'club').split(',').filter(Boolean);
    draft.cardClass = cardClass.value;
    draft.provider = provider.value;
    draft.durationSeconds = Number(duration.value);
    draft.startPricePolicy = startPolicy.value;
    draft.expiredPolicy = expiredPolicy.value;
    draft.marketOverride.enabled = marketEnabled.checked;
    draft.marketOverride.markupPercent = Number(markup.value);
    draft.marketOverride.maxQuoteAgeMinutes = Number(quoteAge.value);
    invalidate();
  }

  for (const item of [source, cardClass, provider, duration, startPolicy, expiredPolicy, marketEnabled, markup, quoteAge]) {
    editableControls.push(item);
    item.addEventListener('change', onDraftChange);
  }

  function renderRules() {
    rules.textContent = '';
    draft.ratingRules.forEach((rule, index) => {
      const row = dom.create('div');
      applyStyles(row, {
        display: 'grid', gridTemplateColumns: mode.mobile ? '1fr 1fr' : '1fr 1fr 1.25fr auto',
        gap: '6px', alignItems: 'end', padding: '7px', background: '#1d2229',
      });
      const min = control(dom, 'number', rule.min, mode, { min: 1, max: 99 });
      const max = control(dom, 'number', rule.max, mode, { min: 1, max: 99 });
      const buyNow = control(dom, 'number', rule.buyNow, mode, { min: 150, max: 15000000, step: 50 });
      min.setAttribute?.('aria-label', `Rule ${index + 1} minimum rating`);
      max.setAttribute?.('aria-label', `Rule ${index + 1} maximum rating`);
      buyNow.setAttribute?.('aria-label', `Rule ${index + 1} Buy Now`);
      const minField = field(dom, 'Min', min, { mobile: true });
      const maxField = field(dom, 'Max', max, { mobile: true });
      const priceField = field(dom, 'Buy Now', buyNow, { mobile: true });
      const remove = button(dom, 'x', { mode });
      remove.title = 'Remove rating rule';
      remove.setAttribute?.('aria-label', `Remove rating rule ${index + 1}`);
      applyStyles(remove, { width: responsiveControlHeight(mode), padding: '0' });
      const changed = () => {
        rule.min = Number(min.value);
        rule.max = Number(max.value);
        rule.buyNow = Number(buyNow.value);
        invalidate();
      };
      [min, max, buyNow].forEach((item) => {
        editableControls.push(item);
        item.addEventListener('change', changed);
      });
      remove.addEventListener('click', () => {
        if (draft.ratingRules.length <= 1) return;
        draft.ratingRules.splice(index, 1);
        invalidate();
        renderRules();
      });
      editableControls.push(remove);
      row.append(minField, maxField, priceField, remove);
      rules.appendChild(row);
    });
    updateActionState();
  }

  addRule.addEventListener('click', () => {
    const last = draft.ratingRules[draft.ratingRules.length - 1] || { min: 75, max: 82, buyNow: 700 };
    const nextRating = Math.min(99, Number(last.max || 74) + 1);
    draft.ratingRules.push({ min: nextRating, max: nextRating, buyNow: Number(last.buyNow || 700) });
    invalidate();
    renderRules();
  });

  function planName(entry) {
    const entries = preparedResult?.plan?.entries || previewResult?.plan?.entries || [];
    return entries.find((candidate) => Number(candidate.item?.id) === Number(entry.item?.id))?.name || `Item #${entry.item?.id || '?'}`;
  }

  function renderPlan(result, label) {
    output.textContent = '';
    output.appendChild(sectionTitle(dom, label));
    const plan = result?.plan;
    const summary = dom.create('div');
    summary.textContent = plan
      ? `${Number(plan.counts?.selected || 0)} selected / ${Number(plan.counts?.eligible || 0)} eligible / ${Number(plan.counts?.rejected || 0)} rejected`
      : 'No plan';
    applyStyles(summary, { color: '#9fb2c9', fontSize: '12px', margin: '6px 0 10px' });
    output.appendChild(summary);
    for (const entry of plan?.entries || []) {
      const row = dom.create('div');
      applyStyles(row, { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px', padding: '9px', marginBottom: '6px', background: '#1d2229', border: '1px solid #344152' });
      const identity = dom.create('div');
      identity.textContent = `${entry.name} | ${entry.rating} OVR | ${entry.item.pile}`;
      applyStyles(identity, { overflowWrap: 'anywhere' });
      const price = dom.create('strong');
      price.textContent = `${formatCoins(entry.startPrice)} / ${formatCoins(entry.buyNow)}`;
      const detail = dom.create('small');
      detail.textContent = `Quote: ${entry.quoteStatus}${entry.quotedPrice ? ` ${formatCoins(entry.quotedPrice)}` : ''} | Limits: ${entry.priceLimitStatus || 'pending'}`;
      applyStyles(detail, { gridColumn: '1 / -1', color: '#9aa6b8' });
      row.append(identity, price, detail);
      output.appendChild(row);
    }
    for (const warning of plan?.warnings || []) {
      const item = dom.create('div');
      item.textContent = warning;
      applyStyles(item, { color: '#d4b66f', fontSize: '11px', marginTop: '5px' });
      output.appendChild(item);
    }
    if (result?.blockers?.length) {
      result.blockers.forEach((blocker) => {
        const item = dom.create('div');
        item.textContent = `Blocked: ${blocker.reason}${blocker.detail ? ` (${blocker.detail})` : ''}`;
        applyStyles(item, { color: '#e3a7a7', fontSize: '11px', marginTop: '5px' });
        output.appendChild(item);
      });
    }
  }

  function renderRecap() {
    output.textContent = '';
    const model = createTradeListingRecap(receipt, { page: recapPage });
    output.appendChild(sectionTitle(dom, model.title));
    const summary = dom.create('div');
    summary.textContent = `${model.status} | ${model.counts.succeeded} listed | ${model.counts.failed} failed | ${model.counts.skipped} skipped`;
    applyStyles(summary, { color: model.status === 'completed' ? '#8fd19e' : '#e3a7a7', margin: '7px 0' });
    output.appendChild(summary);
    if (model.reason) {
      const reason = dom.create('div');
      reason.textContent = `Reason: ${model.reason}`;
      applyStyles(reason, { color: '#e3a7a7', fontSize: '11px', marginBottom: '8px' });
      output.appendChild(reason);
    }
    const coins = dom.create('div');
    coins.textContent = `Coins: ${formatCoins(model.coins.before)} -> ${formatCoins(model.coins.after)}`;
    applyStyles(coins, { color: '#9fb2c9', fontSize: '11px', marginBottom: '8px' });
    output.appendChild(coins);
    for (const entry of model.items) {
      const row = dom.create('div');
      applyStyles(row, { padding: '9px', marginBottom: '6px', background: '#1d2229', border: '1px solid #344152' });
      const name = dom.create('div');
      name.textContent = `${entry.index}. ${planName(entry)} | ${entry.status}`;
      const price = dom.create('small');
      price.textContent = entry.listing
        ? `${formatCoins(entry.listing.startPrice)} / ${formatCoins(entry.listing.buyNow)} | ${entry.item.pile} -> ${entry.auction?.state || '?'}`
        : `${entry.item.pile}${entry.reason ? ` | ${entry.reason}` : ''}`;
      applyStyles(price, { color: '#9aa6b8' });
      row.append(name, price);
      output.appendChild(row);
    }
    if (model.pageCount > 1) {
      const pages = dom.create('div');
      applyStyles(pages, { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '8px' });
      const previous = button(dom, '<', { mode });
      const next = button(dom, '>', { mode });
      const count = dom.create('span');
      count.textContent = `${model.page}/${model.pageCount}`;
      previous.disabled = model.page <= 1;
      next.disabled = model.page >= model.pageCount;
      previous.addEventListener('click', () => { recapPage -= 1; renderRecap(); });
      next.addEventListener('click', () => { recapPage += 1; renderRecap(); });
      pages.append(previous, count, next);
      output.appendChild(pages);
    }
  }

  function buildPreviewJob() {
    currentJob = createManualListingPreviewJob(draft, { now: options.now?.() ?? Date.now() });
    return currentJob;
  }

  function buildLiveJob() {
    currentJob = draft.sources.length === 1 && draft.sources[0] === 'transfer'
      ? createManualTransferRepriceJob(draft, { now: options.now?.() ?? Date.now() })
      : createManualListingJob(draft, { now: options.now?.() ?? Date.now() });
    return currentJob;
  }

  async function runAction(pendingText, action, success) {
    busy = true;
    lastError = null;
    status.textContent = pendingText;
    updateActionState();
    try {
      await action();
      status.textContent = success();
    } catch (error) {
      lastError = error;
      status.textContent = `Failed: ${error?.message || error}`;
    } finally {
      busy = false;
      updateActionState();
    }
  }

  previewButton.addEventListener('click', () => runAction('Building preview...', async () => {
    clearPrepared();
    receipt = null;
    const job = buildPreviewJob();
    previewResult = await options.onPreview?.(job, { platform: draft.platform, provider: draft.provider });
    renderPlan(previewResult, 'Preview');
  }, () => `${Number(previewResult?.plan?.counts?.selected || 0)} item(s) selected`));

  prepareButton.addEventListener('click', () => {
    const sourceAction = draft.sources.length === 1 && draft.sources[0] === 'club'
      ? 'list'
      : draft.sources.length === 1 && draft.sources[0] === 'transfer' && draft.expiredPolicy === 'reprice'
        ? 'reprice'
        : null;
    if (!sourceAction) return undefined;
    return runAction(sourceAction === 'reprice' ? 'Preparing reprice...' : 'Preparing listing...', async () => {
      clearPrepared();
      previewResult = null;
      receipt = null;
      const job = buildLiveJob();
      preparedResult = await options.onPrepare?.(job, { platform: draft.platform, provider: draft.provider });
      renderPlan(preparedResult, sourceAction === 'reprice' ? 'Prepared reprice' : 'Prepared listing');
    }, () => preparedResult?.ready
      ? `Prepared. Enter ${preparedResult.confirmation.requiredText}`
      : `Preparation blocked (${preparedResult?.blockers?.length || 0})`);
  });

  confirmation.addEventListener('input', updateActionState);
  executeButton.addEventListener('click', async () => {
    const requiredText = preparedResult?.confirmation?.requiredText || '';
    if (!preparedResult?.ready || confirmation.value !== requiredText) return;
    busy = true;
    running = true;
    lastError = null;
    status.textContent = preparedResult?.job?.policy?.sources?.[0] === 'transfer'
      ? 'Repricing item...'
      : 'Listing item...';
    updateActionState();
    try {
      receipt = await options.onExecute?.({
        confirmationToken: preparedResult.confirmation.token,
        confirmationText: confirmation.value,
      });
      recapPage = 1;
      renderRecap();
      status.textContent = `Run ${receipt?.status || 'unknown'}: ${Number(receipt?.succeeded || 0)} listed`;
    } catch (error) {
      preparedResult = null;
      lastError = error;
      status.textContent = `Listing failed: ${error?.message || error}`;
    } finally {
      busy = false;
      running = false;
      updateActionState();
    }
  });
  stopButton.addEventListener('click', () => {
    if (!running) return;
    const accepted = options.onStop?.() === true;
    status.textContent = accepted ? 'Stop requested' : 'Stop is not available';
  });
  diagnosticsButton.addEventListener('click', async () => {
    try {
      await options.onDownloadDiagnostics?.({
        job: currentJob,
        preview: previewResult,
        prepared: preparedResult,
        receipt,
        error: lastError,
        platform: draft.platform,
      });
      status.textContent = 'Diagnostics saved';
    } catch (error) {
      status.textContent = `Diagnostics failed: ${error?.message || error}`;
    }
  });

  const close = () => {
    if (running) return false;
    clearPrepared();
    options.onClose?.();
    overlay.remove?.();
    return true;
  };
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });

  renderRules();
  updateActionState();
  output.appendChild(sectionTitle(dom, 'Preview'));
  const empty = dom.create('div');
  empty.textContent = 'No listing preview';
  applyStyles(empty, { color: '#738196', fontSize: '12px', marginTop: '8px' });
  output.appendChild(empty);
  workspace.append(editor, output);
  applyResponsiveDialogLayout({
    dom,
    mode,
    overlay,
    dialog,
    title,
    actions,
    controls: [source, cardClass, provider, duration, startPolicy, expiredPolicy, marketEnabled, markup, quoteAge, previewButton, prepareButton, confirmation, executeButton, stopButton, diagnosticsButton, closeButton],
  });
  dialog.append(heading, workspace, status, actions);
  overlay.appendChild(dialog);
  dom.appendToBody(overlay);
  return overlay;
}
