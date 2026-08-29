import { normalizePickRuntimeOptions } from '../config/runtime-options.js';
import { normalizeSbcFodderPolicy } from '../config/sbc-fodder-policy.js';
import {
  PLAYER_PICK_SELECTION_MODE_LABELS,
  PLAYER_PICK_SELECTION_MODES,
} from '../domain/player-pick.js';
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
  const pickMode = selectInput(
    dom,
    'bronze-loop-pick-mode',
    pickOptions.pickSelectionMode,
    PLAYER_PICK_SELECTION_MODES.map((selectionMode) => [
      selectionMode,
      PLAYER_PICK_SELECTION_MODE_LABELS[selectionMode],
    ]),
    mode,
  );
  applyStyles(pickMode, { width: 'min(320px, 100%)' });
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
  const rollingStorageRecoveryPriority = selectInput(
    dom,
    'bronze-loop-policy-rolling-storage-recovery-priority',
    pickOptions.rollingStorageRecoveryPriority,
    [
      ['storage-pressure-only', 'Storage Pressure only'],
      ['provisions-only', 'Provisions only'],
      ['provisions-then-storage-pressure', 'Provisions once, then Storage Pressure'],
    ],
    mode,
  );
  applyStyles(rollingStorageRecoveryPriority, { width: 'min(320px, 100%)' });
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
    'After a primary cycle, proactively turn complete Provisions reserves and eligible low-rated Storage cards into recovery SBCs',
  );
  const rollingProvisionsShortageRecovery = checkbox(
    dom,
    'bronze-loop-policy-rolling-provisions-shortage-recovery',
    'Allow Provisions shortage recovery',
    pickOptions.rollingProvisionsShortageRecoveryEnabled === true,
    'Allow Rolling to submit a Provisions SBC when primary fodder or Storage routing is blocked; disabled never submits Provisions for shortage recovery',
  );
  const rollingRequiredSpecialRecovery = checkbox(
    dom,
    'bronze-loop-policy-rolling-required-special-recovery',
    'Allow Required Special/TOTW recovery',
    pickOptions.rollingRequiredSpecialRecoveryEnabled === true,
    'Allow Rolling to submit a Required Special or TOTW recovery SBC when the primary squad lacks its required player group; disabled stops at the true shortage',
  );
  const rollingProtectAllClubNonTotwSpecials = checkbox(
    dom,
    'bronze-loop-policy-rolling-protect-club-specials',
    'Protect all Club non-TOTW specials',
    pickOptions.rollingProtectAllClubNonTotwSpecials === true,
    'Never use a Club non-TOTW special in Rolling, including severe fodder shortage; Storage, Transfer, and Unassigned specials remain eligible under the existing limits',
  );
  const rollingAllowClubCurrentPoolSpecialsForProvisions = checkbox(
    dom,
    'bronze-loop-policy-rolling-allow-club-current-pool-provisions',
    'Allow Club current-pool specials for Provisions',
    pickOptions.rollingAllowClubCurrentPoolSpecialsForProvisions === true,
    'As a last resort for normal Provisions shortage recovery, allow exact live-matcher-approved Club non-TOTW specials within the configured Provisions rating range; FSU locks, Evolution, Active Squad and all other protection guards still apply',
  );
  const rollingStoragePressureClubBoosters = checkbox(
    dom,
    'bronze-loop-policy-rolling-storage-pressure-club-boosters',
    'Allow Club normal-Gold boosters for Storage Pressure',
    pickOptions.rollingStoragePressureClubBoostersEnabled === true,
    'When a Storage Pressure squad must consume real Storage cards, allow more than the legacy three Club fillers using only ordinary 87-to-Provisions-max Gold cards; FSU filters, locks, Evolution, Active Squad and protection rating still apply',
  );
  const updateClubCurrentPoolProvisionsAvailability = () => {
    const disabled = rollingProtectAllClubNonTotwSpecials.input.checked === true;
    rollingAllowClubCurrentPoolSpecialsForProvisions.input.disabled = disabled;
    rollingAllowClubCurrentPoolSpecialsForProvisions.label.style.opacity = disabled ? '0.65' : '1';
  };
  rollingProtectAllClubNonTotwSpecials.input.addEventListener(
    'change',
    updateClubCurrentPoolProvisionsAvailability,
  );
  updateClubCurrentPoolProvisionsAvailability();
  const rollingDuplicateSwap = checkbox(
    dom,
    'bronze-loop-policy-rolling-duplicate-swap',
    'Enable experimental native duplicate swaps',
    pickOptions.rollingDuplicateSwapEnabled === true,
    'When disabled, Unassigned duplicates are routed to Storage and never exchanged with their Club counterpart; insufficient Storage stops safely',
  );
  const rollingDuplicateSwapMode = selectInput(
    dom,
    'bronze-loop-policy-rolling-duplicate-swap-mode',
    pickOptions.rollingDuplicateSwapMode || (pickOptions.rollingDuplicateSwapEnabled === true
      ? 'special-only'
      : 'off'),
    [
      ['off', 'Off'],
      ['special-only', 'Controlled: special only'],
      ['safe-only', 'Controlled: ordinary only'],
      ['all-eligible', 'Experimental: all eligible'],
    ],
    mode,
  );
  const updateDuplicateSwapModeAvailability = () => {
    if (rollingDuplicateSwap.input.checked === true
      && rollingDuplicateSwapMode.value === 'off') {
      rollingDuplicateSwapMode.value = 'special-only';
    }
    rollingDuplicateSwapMode.disabled = rollingDuplicateSwap.input.checked !== true;
    rollingDuplicateSwapMode.style.opacity = rollingDuplicateSwapMode.disabled ? '0.65' : '1';
  };
  rollingDuplicateSwap.input.addEventListener('change', updateDuplicateSwapModeAvailability);
  updateDuplicateSwapModeAvailability();
  const rollingProvisionsMaxRating = selectInput(
    dom,
    'bronze-loop-policy-rolling-provisions-max-rating',
    pickOptions.rollingProvisionsMaxRating,
    [[88, '87-88'], [89, '87-89'], [90, '87-90'], [91, '87-91']],
    mode,
  );
  const rollingRecoveryStorageFirst = checkbox(
    dom,
    'bronze-loop-policy-rolling-recovery-storage-first',
    'Use Storage first for normal recovery SBCs',
    pickOptions.rollingRecoveryStorageFirst === true,
    'Applies to normal Provisions and Required Special/TOTW recovery; pending Unassigned duplicates remain Unassigned-first, while Storage pressure recovery remains Storage-first',
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
  const protectFsuLockedPlayers = checkbox(
    dom,
    'bronze-loop-policy-protect-fsu-locked-players',
    'Protect FSU locked players',
    pickOptions.protectFsuLockedPlayers === true,
    'When enabled, Runner excludes players listed in FSU/Enhancer Lock player from SBC selection and stops before submission if one is present',
  );
  const protectActiveSquadPlayers = checkbox(
    dom,
    'bronze-loop-policy-protect-active-squad-players',
    'Protect Active Squad players',
    pickOptions.protectActiveSquadPlayers === true,
    'When enabled, replace ordinary conflict cards automatically, review eligible specials, and stop on protected-card selection regressions',
  );

  form.append(
    sectionTitle(dom, 'Standard SBCs'),
    field(dom, 'Low-rated Gold max', lowRatedGold, mode, 'Maximum normal Gold rating for non-rating SBCs'),
    field(dom, 'Standard Rating SBC max card', standardRating, mode, 'Maximum rating of an individual card in ordinary rating-constrained SBCs; does not apply to Rolling'),
    sectionTitle(dom, 'Rolling and Player Picks'),
    field(dom, 'Automatic-use max rating', automaticUse, mode, 'Cards at or below this rating may be automatically used; higher cards are protected'),
    sectionTitle(dom, 'Rolling'),
    field(dom, 'Provisions reserve max', rollingProvisionsMaxRating, mode, 'Choose the highest non-required rating reserved for Provisions; 88 means ratings 87-88, while 91 means ratings 87-91'),
    rollingRecoveryStorageFirst.label,
    field(dom, 'Provisions packs per shortage', rollingShortageProvisionsPackLimit, mode, 'Open at most this many existing Provisions rewards before replanning the primary squad; TOTW rewards remain one at a time'),
    rollingSurplusCrafting.label,
    rollingProvisionsShortageRecovery.label,
    rollingRequiredSpecialRecovery.label,
    rollingProtectAllClubNonTotwSpecials.label,
    rollingAllowClubCurrentPoolSpecialsForProvisions.label,
    rollingStoragePressureClubBoosters.label,
    rollingDuplicateSwap.label,
    wideField(dom, 'Duplicate swap scope', rollingDuplicateSwapMode, mode, 'Controlled modes require both entities to be untradeable and have identical value fingerprints; all eligible is retained only for legacy experiments'),
    rollingOpenDuplicateProvisionsRewards.label,
    wideField(dom, 'Storage Pressure SBC mode', rollingStorageSinkMode, mode, 'Off disables the Storage Pressure SBC path; Automatic preserves the validated 95+ Pick preference; Selected uses only the chosen SBC Set'),
    wideField(dom, 'Storage pressure SBC', rollingStorageSinkSet, mode, 'Player Pick and direct Player SBCs require at least one supported 87+ squad; reward rating does not affect eligibility'),
    wideField(dom, 'Pressure relief strategy', rollingStorageRecoveryPriority, mode, 'Choose exactly one recovery strategy: Storage Pressure only, Provisions only, or one Provisions attempt followed by Storage Pressure if the same pressure remains'),
    sectionTitle(dom, 'Submission guards'),
    protectFsuLockedPlayers.label,
    protectActiveSquadPlayers.label,
    sectionTitle(dom, 'Player Picks'),
    wideField(dom, 'Selection mode', pickMode, mode, 'Rating first preserves the existing behavior; Special price first ranks every special card before normal cards and pauses when a high-price duplicate displaces a non-duplicate; Always review specials pauses whenever a special card appears'),
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
      pickSelectionMode: pickMode.value,
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
      rollingProvisionsShortageRecoveryEnabled:
        rollingProvisionsShortageRecovery.input.checked,
      rollingRequiredSpecialRecoveryEnabled:
        rollingRequiredSpecialRecovery.input.checked,
      rollingProtectAllClubNonTotwSpecials:
        rollingProtectAllClubNonTotwSpecials.input.checked,
      rollingAllowClubCurrentPoolSpecialsForProvisions:
        rollingProtectAllClubNonTotwSpecials.input.checked !== true
          && rollingAllowClubCurrentPoolSpecialsForProvisions.input.checked,
      rollingStoragePressureClubBoostersEnabled:
        rollingStoragePressureClubBoosters.input.checked,
      rollingDuplicateSwapEnabled: rollingDuplicateSwap.input.checked,
      rollingDuplicateSwapMode: rollingDuplicateSwap.input.checked
        ? rollingDuplicateSwapMode.value === 'off'
          ? 'special-only'
          : rollingDuplicateSwapMode.value
        : 'off',
      rollingProvisionsMaxRating: readNumber(
        rollingProvisionsMaxRating,
        pickOptions.rollingProvisionsMaxRating,
      ),
      rollingRecoveryStorageFirst: rollingRecoveryStorageFirst.input.checked,
      rollingStorageRecoveryPriority: rollingStorageRecoveryPriority.value,
      rollingOpenDuplicateProvisionsRewards:
        rollingOpenDuplicateProvisionsRewards.input.checked,
      rollingShortageProvisionsPackLimit: readNumber(
        rollingShortageProvisionsPackLimit,
        pickOptions.rollingShortageProvisionsPackLimit,
      ),
      protectFsuLockedPlayers: protectFsuLockedPlayers.input.checked,
      protectActiveSquadPlayers: protectActiveSquadPlayers.input.checked,
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
      pickMode,
      rollingProvisionsMaxRating,
      rollingRecoveryStorageFirst.input,
      rollingShortageProvisionsPackLimit,
      protectFsuLockedPlayers.input,
      protectActiveSquadPlayers.input,
      rollingSurplusCrafting.input,
      rollingProvisionsShortageRecovery.input,
      rollingRequiredSpecialRecovery.input,
      rollingProtectAllClubNonTotwSpecials.input,
      rollingAllowClubCurrentPoolSpecialsForProvisions.input,
      rollingStoragePressureClubBoosters.input,
      rollingDuplicateSwap.input,
      rollingDuplicateSwapMode,
      rollingOpenDuplicateProvisionsRewards.input,
      rollingStorageSinkMode,
      rollingStorageSinkSet,
      rollingStorageRecoveryPriority,
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
