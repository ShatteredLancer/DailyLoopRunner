import { normalizePickRuntimeOptions } from '../config/runtime-options.js';
import { normalizeSbcFodderPolicy } from '../config/sbc-fodder-policy.js';
import { applyResponsiveDialogLayout, readResponsiveUiMode, responsiveControlHeight } from './responsive-dialog.js';

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

function inputStyles(input, mode) {
  applyStyles(input, {
    width: '78px',
    minWidth: '0',
    height: responsiveControlHeight(mode),
    fontSize: mode?.touchTargets ? '16px' : '',
    boxSizing: 'border-box',
    background: '#222832',
    color: '#f4f6f8',
    border: '1px solid #607089',
    padding: '0 8px',
  });
  return input;
}

function field(dom, labelText, input, mode, title = '') {
  const label = dom.create('label');
  applyStyles(label, {
    display: 'grid',
    gridTemplateColumns: mode?.mobile ? '1fr' : 'minmax(0, 1fr) 84px',
    alignItems: 'center',
    gap: '10px',
    minHeight: responsiveControlHeight(mode),
  });
  if (title) label.title = title;
  const text = dom.create('span');
  text.textContent = labelText;
  applyStyles(text, { color: '#b8c3d2', fontSize: '12px' });
  label.append(text, input);
  return label;
}

function wideField(dom, labelText, input, mode, title = '') {
  const label = field(dom, labelText, input, mode, title);
  label.style.gridTemplateColumns = mode?.mobile
    ? '1fr'
    : 'minmax(0, 1fr) minmax(180px, 320px)';
  return label;
}

function checkbox(dom, id, labelText, checked, title = '') {
  const label = dom.create('label');
  applyStyles(label, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '30px' });
  if (title) label.title = title;
  const input = dom.create('input');
  input.id = id;
  input.type = 'checkbox';
  input.checked = checked === true;
  input.style.accentColor = '#78a6ff';
  const text = dom.create('span');
  text.textContent = labelText;
  label.append(input, text);
  return { label, input };
}

function sectionTitle(dom, text) {
  const heading = dom.create('div');
  heading.textContent = text;
  applyStyles(heading, {
    color: '#9fb2c9',
    fontSize: '11px',
    fontWeight: '700',
    borderBottom: '1px solid #303946',
    paddingBottom: '5px',
    marginTop: '4px',
  });
  return heading;
}

function modeControl(dom, value) {
  const group = dom.create('div');
  group.id = 'bronze-loop-pick-mode';
  group.setAttribute?.('role', 'group');
  group.setAttribute?.('aria-label', 'Player Pick handling');
  applyStyles(group, { display: 'flex', gap: '0', minHeight: '30px' });
  const modes = [
    ['automatic', 'Automatic'],
    ['review-protected', 'Review protected'],
  ];
  const buttons = [];
  const update = (next) => {
    buttons.forEach((button) => {
      const active = button.dataset.mode === next;
      button.setAttribute?.('aria-pressed', active ? 'true' : 'false');
      button.style.background = active ? '#2f6fde' : '#222832';
      button.style.borderColor = active ? '#4f8cff' : '#607089';
    });
    group.dataset.value = next;
  };
  modes.forEach(([mode, label], index) => {
    const button = dom.create('button');
    button.type = 'button';
    button.dataset.mode = mode;
    button.textContent = label;
    button.setAttribute?.('aria-pressed', mode === value ? 'true' : 'false');
    button.style.minHeight = '30px';
    button.style.padding = '0 10px';
    button.style.cursor = 'pointer';
    button.style.color = '#fff';
    button.style.border = `1px solid ${mode === value ? '#4f8cff' : '#607089'}`;
    button.style.background = mode === value ? '#2f6fde' : '#222832';
    button.style.marginLeft = index ? '-1px' : '0';
    button.addEventListener('click', () => update(mode));
    buttons.push(button);
    group.appendChild(button);
  });
  group.dataset.value = value;
  return group;
}

function numberInput(dom, id, value, mode, limits = {}) {
  const input = inputStyles(dom.create('input'), mode);
  input.id = id;
  input.type = 'number';
  input.min = String(limits.min ?? 1);
  input.max = String(limits.max ?? 99);
  input.value = String(value);
  return input;
}

function selectInput(dom, id, value, entries, mode) {
  const input = inputStyles(dom.create('select'), mode);
  input.id = id;
  for (const [entryValue, label] of entries) {
    const option = dom.create('option');
    option.value = String(entryValue);
    option.textContent = label;
    input.appendChild(option);
  }
  input.value = String(value);
  return input;
}

export function showSelectionPolicySettings(options = {}) {
  const dom = options.dom;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  dom.query?.('#bronze-loop-selection-policy-modal')?.remove?.();

  const mode = readResponsiveUiMode(dom);
  const pickOptions = normalizePickRuntimeOptions(options.pickOptions);
  const storageSinkCandidates = [...(options.storageSinkCandidates || [])]
    .filter((candidate) => Number(candidate?.setId || 0) > 0 && String(candidate?.name || '').trim())
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  const sbcFodderOptions = normalizeSbcFodderPolicy(options.sbcFodderOptions);
  const overlay = dom.create('div');
  overlay.id = 'bronze-loop-selection-policy-modal';
  applyStyles(overlay, {
    position: 'fixed',
    inset: '0',
    zIndex: '1000001',
    background: 'rgba(0,0,0,.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    boxSizing: 'border-box',
  });
  const dialog = dom.create('div');
  applyStyles(dialog, {
    width: 'min(520px, 100%)',
    maxHeight: '90vh',
    overflow: 'auto',
    background: '#171b21',
    color: '#f4f6f8',
    border: '1px solid #65758a',
    padding: '14px',
    boxSizing: 'border-box',
    fontFamily: 'Arial, sans-serif',
  });
  const title = dom.create('div');
  title.textContent = 'Selection Policy';
  applyStyles(title, { fontSize: '16px', fontWeight: '700', marginBottom: '12px' });
  const form = dom.create('div');
  applyStyles(form, { display: 'flex', flexDirection: 'column', gap: '10px' });

  const lowRatedGold = numberInput(dom, 'bronze-loop-policy-low-rated-gold-max', sbcFodderOptions.lowRatedGoldMaxRating, mode);
  const standardRating = numberInput(dom, 'bronze-loop-policy-rating-sbc-max-card', sbcFodderOptions.ratingSbcMaxCardRating, mode);
  const automaticUse = numberInput(dom, 'bronze-loop-policy-automatic-use-max', pickOptions.protectionRating, mode);
  const pickMode = modeControl(dom, pickOptions.autoSelectBelow90 === false ? 'review-protected' : 'automatic');
  const openPicksAtEnd = checkbox(
    dom,
    'bronze-loop-policy-pick-open-at-end',
    'Open Picks at end',
    pickOptions.openPicksAtEnd === true,
    'Complete the requested Player Pick SBC count before opening the resulting Picks',
  );
  const rollingStorageSinkMode = selectInput(
    dom,
    'bronze-loop-policy-rolling-storage-sink-mode',
    pickOptions.rollingStorageSinkMode,
    [['off', 'Off'], ['automatic', 'Automatic'], ['selected', 'Selected SBC']],
    mode,
  );
  const configuredStorageSinkSetId = Number(pickOptions.rollingStorageSinkSetId || 0);
  if (configuredStorageSinkSetId
    && !storageSinkCandidates.some((candidate) => Number(candidate.setId) === configuredStorageSinkSetId)) {
    storageSinkCandidates.push({
      setId: configuredStorageSinkSetId,
      name: pickOptions.rollingStorageSinkSetName || `Unavailable Set #${configuredStorageSinkSetId}`,
      status: 'unavailable',
    });
  }
  const storageSinkEntries = storageSinkCandidates.map((candidate) => {
    const reward = candidate.rewardKind === 'player-pick' ? 'Pick' : candidate.rewardKind === 'player' ? 'Player' : 'Pending validation';
    const ratings = (candidate.challengeRatings || []).length
      ? ` · ${(candidate.challengeRatings || []).slice().sort((a, b) => b - a).join('/')}`
      : '';
    const unavailable = candidate.status === 'unavailable' ? ' · unavailable' : '';
    return [candidate.setId, `${candidate.name} · ${reward}${ratings}${unavailable}`];
  });
  const fallbackStorageSinkSetId = configuredStorageSinkSetId
    || Number(storageSinkCandidates[0]?.setId || 0);
  const rollingStorageSinkSet = selectInput(
    dom,
    'bronze-loop-policy-rolling-storage-sink-set',
    fallbackStorageSinkSetId || '',
    storageSinkEntries.length ? storageSinkEntries : [['', 'No scanned Player/Pick SBCs']],
    mode,
  );
  applyStyles(rollingStorageSinkMode, { width: '150px' });
  applyStyles(rollingStorageSinkSet, { width: 'min(320px, 100%)' });
  const updateStorageSinkAvailability = () => {
    rollingStorageSinkSet.disabled = rollingStorageSinkMode.value !== 'selected';
    rollingStorageSinkSet.style.opacity = rollingStorageSinkSet.disabled ? '0.65' : '1';
  };
  rollingStorageSinkMode.addEventListener('change', updateStorageSinkAvailability);
  updateStorageSinkAvailability();
  const rollingSurplusCrafting = checkbox(
    dom,
    'bronze-loop-policy-rolling-surplus-crafting',
    'Craft surplus Provisions/TOTW',
    pickOptions.rollingSurplusCraftingEnabled === true,
    'After a primary cycle, proactively turn complete Provisions reserves and eligible low-rated Storage cards into recovery SBCs; disabled still permits shortage and Storage-pressure recovery',
  );
  const rollingProvisionsMaxRating = selectInput(
    dom,
    'bronze-loop-policy-rolling-provisions-max-rating',
    pickOptions.rollingProvisionsMaxRating,
    [[88, '87-88'], [89, '87-89']],
    mode,
  );
  const rollingOpenDuplicateProvisionsRewards = checkbox(
    dom,
    'bronze-loop-policy-rolling-open-duplicate-provisions-rewards',
    'Open duplicate Provisions rewards immediately',
    pickOptions.rollingOpenDuplicateProvisionsRewards === true,
    'When disabled, Provisions made from primary-pack duplicate reserves stay in My Packs until primary fodder is short',
  );
  const rollingShortageProvisionsPackLimit = numberInput(
    dom,
    'bronze-loop-policy-rolling-shortage-provisions-pack-limit',
    pickOptions.rollingShortageProvisionsPackLimit,
    mode,
    { min: 1, max: 30 },
  );

  form.append(
    sectionTitle(dom, 'Standard SBCs'),
    field(dom, 'Low-rated Gold max', lowRatedGold, mode, 'Maximum normal Gold rating for non-rating SBCs'),
    field(dom, 'Standard Rating SBC max card', standardRating, mode, 'Maximum rating of an individual card in ordinary rating-constrained SBCs; does not apply to Rolling'),
    sectionTitle(dom, 'Rolling and Player Picks'),
    field(dom, 'Automatic-use max rating', automaticUse, mode, 'Cards at or below this rating may be automatically used; higher cards are protected'),
    sectionTitle(dom, 'Rolling'),
    field(dom, 'Provisions reserve', rollingProvisionsMaxRating, mode, 'Choose whether 89-rated non-required cards join the default 87/88 Provisions reserve'),
    field(dom, 'Provisions packs per shortage', rollingShortageProvisionsPackLimit, mode, 'Open at most this many existing Provisions rewards before replanning the primary squad; TOTW rewards remain one at a time'),
    rollingSurplusCrafting.label,
    rollingOpenDuplicateProvisionsRewards.label,
    wideField(dom, 'Storage pressure recovery', rollingStorageSinkMode, mode, 'Off disables recovery; Automatic preserves the validated 95+ Pick preference; Selected uses only the chosen SBC Set'),
    wideField(dom, 'Storage pressure SBC', rollingStorageSinkSet, mode, 'Player Pick and direct Player SBCs require at least one supported 87+ squad; reward rating does not affect eligibility'),
    sectionTitle(dom, 'Player Picks'),
    field(dom, 'Selection mode', pickMode, mode, 'Automatic resolves safe and deterministically ranked Picks; Review protected pauses only when protected choices remain ambiguous'),
    openPicksAtEnd.label,
  );

  const status = dom.create('div');
  applyStyles(status, { minHeight: '16px', marginTop: '10px', color: '#9fb2c9', fontSize: '11px' });
  const actions = dom.create('div');
  applyStyles(actions, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' });
  const button = (id, text, primary = false) => {
    const value = dom.create('button');
    value.id = id;
    value.type = 'button';
    value.textContent = text;
    applyStyles(value, {
      minHeight: responsiveControlHeight(mode),
      padding: '0 12px',
      cursor: 'pointer',
      color: '#fff',
      background: primary ? '#2f6fde' : '#222832',
      border: `1px solid ${primary ? '#4f8cff' : '#607089'}`,
    });
    return value;
  };
  const cancel = button('bronze-loop-policy-cancel', 'Cancel');
  const save = button('bronze-loop-policy-save', 'Save', true);
  actions.append(cancel, save);

  const readNumber = (input, fallback) => {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  };
  const draft = () => ({
    sbcFodderOptions: normalizeSbcFodderPolicy({
      lowRatedGoldMaxRating: readNumber(lowRatedGold, sbcFodderOptions.lowRatedGoldMaxRating),
      ratingSbcMaxCardRating: readNumber(standardRating, sbcFodderOptions.ratingSbcMaxCardRating),
    }),
    pickOptions: normalizePickRuntimeOptions({
      protectionRating: readNumber(automaticUse, pickOptions.protectionRating),
      autoSelectBelow90: pickMode.dataset.value !== 'review-protected',
      openPicksAtEnd: openPicksAtEnd.input.checked,
      rollingStorageSinkMode: rollingStorageSinkMode.value,
      rollingStorageSinkSetId: rollingStorageSinkMode.value === 'selected'
        ? readNumber(rollingStorageSinkSet, 0)
        : null,
      rollingStorageSinkSetName: rollingStorageSinkMode.value === 'selected'
        ? storageSinkCandidates.find((candidate) => (
            Number(candidate.setId) === readNumber(rollingStorageSinkSet, 0)
          ))?.name || ''
        : '',
      rollingSurplusCraftingEnabled: rollingSurplusCrafting.input.checked,
      rollingProvisionsMaxRating: readNumber(
        rollingProvisionsMaxRating,
        pickOptions.rollingProvisionsMaxRating,
      ),
      rollingOpenDuplicateProvisionsRewards:
        rollingOpenDuplicateProvisionsRewards.input.checked,
      rollingShortageProvisionsPackLimit: readNumber(
        rollingShortageProvisionsPackLimit,
        pickOptions.rollingShortageProvisionsPackLimit,
      ),
    }),
  });
  const close = () => overlay.remove?.();
  cancel.addEventListener('click', close);
  save.addEventListener('click', async () => {
    try {
      await options.onSave?.(draft());
      close();
    } catch (error) {
      status.textContent = `Save failed: ${error?.message || error}`;
    }
  });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  applyResponsiveDialogLayout({
    dom,
    mode,
    overlay,
    dialog,
    title,
    actions,
    controls: [
      lowRatedGold,
      standardRating,
      automaticUse,
      rollingProvisionsMaxRating,
      rollingShortageProvisionsPackLimit,
      rollingSurplusCrafting.input,
      rollingOpenDuplicateProvisionsRewards.input,
      rollingStorageSinkMode,
      rollingStorageSinkSet,
      openPicksAtEnd.input,
      cancel,
      save,
    ],
  });
  dialog.append(title, form, status, actions);
  overlay.appendChild(dialog);
  dom.appendToBody(overlay);
  return overlay;
}
