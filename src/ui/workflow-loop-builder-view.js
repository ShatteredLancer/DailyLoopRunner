import {
  BUILDER_STRATEGY_OPTIONS,
  getBuilderLoopFields,
  getBuilderStrategyDescriptor,
} from '../config/builder-descriptors.js';
import { SBC_ACTIVITY_FAMILY_IDS } from '../config/activity-discovery.js';
import {
  MATERIAL_SINK_BASELINES,
  MATERIAL_SINK_CLASSES,
  MATERIAL_SINK_PREFERENCES,
} from '../config/material-sink.js';
import {
  PLAYER_PICK_SELECTION_MODE_LABELS,
  PLAYER_PICK_SELECTION_MODES,
} from '../domain/player-pick.js';

const PILES = Object.freeze(['unassigned', 'storage', 'transfer', 'club']);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function selected(value, expected) {
  return String(value ?? '') === String(expected ?? '') ? ' selected' : '';
}

function disabled(value) {
  return value ? ' disabled' : '';
}

function optionList(options, value, includeInherit = false) {
  const inherit = includeInherit ? `<option value=""${selected(value, undefined)}>Inherit</option>` : '';
  return `${inherit}${options.map((option) => (
    `<option value="${escapeHtml(option.value)}"${selected(value, option.value)}>${escapeHtml(option.label)}</option>`
  )).join('')}`;
}

function boolOptions(value) {
  return optionList([
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ], value === undefined ? undefined : String(value), true);
}

function fieldRow(label, control, options = {}) {
  return `<label class="dlr-builder-field${options.wide ? ' wide' : ''}">
    <span>${escapeHtml(label)}${options.required ? ' *' : ''}</span>
    ${control}
  </label>`;
}

function textInput(path, value, type = 'text', readOnly = false, placeholder = '') {
  return `<input type="${type}" data-builder-field="${escapeHtml(path)}" data-builder-value-type="${escapeHtml(type)}" value="${escapeHtml(value ?? '')}" placeholder="${escapeHtml(placeholder)}"${disabled(readOnly)}>`;
}

function selectInput(path, value, options, readOnly = false, includeInherit = false) {
  return `<select data-builder-field="${escapeHtml(path)}"${disabled(readOnly)}>${optionList(options, value, includeInherit)}</select>`;
}

function renderScalarField(field, value, context) {
  const readOnly = context.readOnly
    || (field.path === 'strategy' && context.source !== 'custom')
    || (field.path === 'id' && context.source !== 'custom');
  switch (field.type) {
    case 'id':
      return fieldRow(field.label, textInput(field.path, value, 'id', readOnly), { required: field.required });
    case 'integer':
    case 'rating':
      return fieldRow(field.label, textInput(field.path, value, 'number', readOnly), { required: field.required });
    case 'boolean-inherit':
      return fieldRow(field.label, `<select data-builder-field="${escapeHtml(field.path)}" data-builder-value-type="boolean-inherit"${disabled(readOnly)}>${boolOptions(value)}</select>`);
    case 'strategy':
      return fieldRow(field.label, selectInput(field.path, value, BUILDER_STRATEGY_OPTIONS, readOnly), { required: true });
    case 'inventory-mode':
      return fieldRow(field.label, selectInput(field.path, value, [
        { value: 'inherit', label: 'Inherit' },
        { value: 'normal', label: 'Normal' },
        { value: 'inventory-only', label: 'Inventory only' },
      ], readOnly));
    case 'special-kind':
      return fieldRow(field.label, selectInput(field.path, value, [
        { value: '', label: 'None' },
        { value: 'totw', label: 'TOTW' },
        { value: 'totw-tots-fof', label: 'TOTW / TOTS / FOF' },
      ], readOnly));
    case 'loop-reference':
      return fieldRow(field.label, selectInput(field.path, value, [
        { value: '', label: 'None' },
        ...context.atomicLoops.map((loop) => ({ value: loop.id, label: loop.name })),
      ], readOnly));
    case 'activity-family':
      return fieldRow(field.label, selectInput(field.path, value, [
        { value: '', label: 'None' },
        ...SBC_ACTIVITY_FAMILY_IDS.map((family) => ({ value: family, label: family })),
      ], readOnly));
    case 'pick-loop-reference':
      return fieldRow(field.label, selectInput(field.path, value, [
        { value: '', label: 'None' },
        ...context.playerPickLoops.map((loop) => ({ value: loop.id, label: loop.name })),
      ], readOnly));
    case 'price-platform':
      return fieldRow(field.label, selectInput(field.path, value, [
        { value: '', label: 'Runtime default' },
        { value: 'pc', label: 'PC' },
        { value: 'ps', label: 'PlayStation' },
        { value: 'xbox', label: 'Xbox' },
      ], readOnly));
    default:
      return fieldRow(field.label, textInput(field.path, value, 'text', readOnly), { required: field.required });
  }
}

function renderList(path, label, values, itemType, context) {
  const rows = (values || []).map((value, index) => `<div class="dlr-builder-list-row">
    ${textInput(`${path}.${index}`, value, itemType === 'number' ? 'number' : 'text', context.readOnly)}
    <button data-builder-action="move-list" data-path="${escapeHtml(path)}" data-index="${index}" data-delta="-1" title="Move up"${disabled(context.readOnly || index === 0)}>Up</button>
    <button data-builder-action="move-list" data-path="${escapeHtml(path)}" data-index="${index}" data-delta="1" title="Move down"${disabled(context.readOnly || index === values.length - 1)}>Down</button>
    <button data-builder-action="remove-list" data-path="${escapeHtml(path)}" data-index="${index}" title="Remove"${disabled(context.readOnly)}>Remove</button>
  </div>`).join('');
  return `<section class="dlr-builder-form-section">
    <div class="dlr-builder-section-head"><h3>${escapeHtml(label)}</h3><button data-builder-action="add-list" data-path="${escapeHtml(path)}" data-item-type="${itemType}"${disabled(context.readOnly)}>Add</button></div>
    ${rows || '<div class="dlr-builder-empty">No entries</div>'}
  </section>`;
}

function renderSourcePackRef(path, label, value = {}, context) {
  return `<section class="dlr-builder-form-section"><h3>${escapeHtml(label)}</h3><div class="dlr-builder-form-grid">
    ${fieldRow('Reward produced by Loop', selectInput(`${path}.rewardOfLoopId`, value?.rewardOfLoopId, [
      { value: '', label: 'Use pack ID/name fallback only' },
      ...context.rewardSourceLoops.map((loop) => ({ value: loop.id, label: `${loop.name} (${loop.id})` })),
    ], context.readOnly))}
  </div></section>`;
}

function renderActivityBinding(path, value, context) {
  const enabled = value && typeof value === 'object';
  const materialSink = enabled && MATERIAL_SINK_BASELINES[value.family];
  const classes = Array.isArray(value?.classes) ? value.classes : [];
  return `<section class="dlr-builder-form-section"><h3>Dynamic SBC activity</h3>
    <div class="dlr-builder-form-grid">
      ${fieldRow('Binding', `<select data-builder-field="${escapeHtml(path)}" data-builder-value-type="object-toggle"${disabled(context.readOnly)}><option value=""${selected(enabled, false)}>None</option><option value="true"${selected(enabled, true)}>Enabled</option></select>`)}
      ${enabled ? fieldRow('Family', selectInput(`${path}.family`, value.family, SBC_ACTIVITY_FAMILY_IDS.map((family) => ({ value: family, label: family })), context.readOnly)) : ''}
      ${enabled ? fieldRow('Required', `<select data-builder-field="${path}.required" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value.required)}</select>`) : ''}
      ${enabled ? fieldRow('Category', textInput(`${path}.category`, value.category || 'Upgrades', 'text', true)) : ''}
      ${materialSink ? fieldRow('Accepted classes', `<select multiple size="4" data-builder-field="${path}.classes" data-builder-value-type="string-list"${disabled(context.readOnly)}>${MATERIAL_SINK_CLASSES.map((className) => `<option value="${className}"${classes.includes(className) ? ' selected' : ''}>${className}</option>`).join('')}</select>`) : ''}
      ${materialSink ? fieldRow('Preference', selectInput(`${path}.preference`, value.preference, MATERIAL_SINK_PREFERENCES.map((preference) => ({ value: preference, label: preference })), context.readOnly, true)) : ''}
    </div>
  </section>`;
}

function renderPileList(path, label, values, context) {
  const piles = Array.isArray(values) ? values : [];
  const rows = piles.map((pile, index) => `<div class="dlr-builder-pile-row">
    <span class="dlr-builder-pile-order">${index + 1}</span><strong>${escapeHtml(pile)}</strong>
    <button data-builder-action="move-list" data-path="${escapeHtml(path)}" data-index="${index}" data-delta="-1"${disabled(context.readOnly || index === 0)}>Up</button>
    <button data-builder-action="move-list" data-path="${escapeHtml(path)}" data-index="${index}" data-delta="1"${disabled(context.readOnly || index === piles.length - 1)}>Down</button>
    <button data-builder-action="remove-list" data-path="${escapeHtml(path)}" data-index="${index}"${disabled(context.readOnly)}>Remove</button>
  </div>`).join('');
  const available = PILES.filter((pile) => !piles.includes(pile));
  return `<section class="dlr-builder-form-section">
    <div class="dlr-builder-section-head"><h3>${escapeHtml(label)}</h3></div>
    ${rows || '<div class="dlr-builder-empty">Inherit strategy default</div>'}
    <div class="dlr-builder-add-row">
      <select data-builder-add-select="${escapeHtml(path)}"${disabled(context.readOnly || !available.length)}>${available.map((pile) => `<option value="${pile}">${pile}</option>`).join('')}</select>
      <button data-builder-action="add-selected-list" data-path="${escapeHtml(path)}"${disabled(context.readOnly || !available.length)}>Add pile</button>
    </div>
  </section>`;
}

function renderCardSpec(path, spec = {}, context, options = {}) {
  const prefix = path ? `${path}.` : '';
  return `<div class="dlr-builder-requirement">
    ${options.index !== undefined ? `<span class="dlr-builder-requirement-index">${options.index + 1}</span>` : ''}
    ${fieldRow('Tier', selectInput(`${prefix}tier`, spec.tier, [
      { value: '', label: 'Any' }, { value: 'bronze', label: 'Bronze' }, { value: 'silver', label: 'Silver' }, { value: 'gold', label: 'Gold' },
    ], context.readOnly))}
    ${fieldRow('SBC rarity eligibility', selectInput(`${prefix}rarity`, spec.rarity, [
      { value: '', label: 'Any' }, { value: 'common', label: 'Common' }, { value: 'rare', label: 'Rare' },
    ], context.readOnly))}
    ${fieldRow('Gold consumption', selectInput(`${prefix}goldConsumption`, spec.goldConsumption || (spec.preferCommon === true ? 'common-first' : 'eligibility'), [
      { value: 'eligibility', label: 'Follow SBC eligibility' },
      { value: 'common-only', label: 'Common only' },
      { value: 'rare-only', label: 'Rare only' },
      { value: 'common-first', label: 'Common first, then Rare' },
      { value: 'rare-first', label: 'Rare first, then Common' },
    ], context.readOnly))}
    ${options.withCount !== false ? fieldRow('Count', textInput(`${prefix}count`, spec.count ?? 1, 'number', context.readOnly)) : ''}
    ${fieldRow('Min rating', textInput(`${prefix}minRating`, spec.minRating, 'number', context.readOnly))}
    ${fieldRow('Max rating', textInput(`${prefix}maxRating`, spec.maxRating, 'number', context.readOnly))}
    ${fieldRow('Special cards', `<select data-builder-field="${escapeHtml(`${prefix}allowSpecial`)}" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(spec.allowSpecial)}</select>`)}
    ${fieldRow('Player only', `<select data-builder-field="${escapeHtml(`${prefix}playerOnly`)}" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(spec.playerOnly)}</select>`)}
    ${fieldRow('Require special', `<select data-builder-field="${escapeHtml(`${prefix}special`)}" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(spec.special)}</select>`)}
    <div class="wide">${renderPileList(`${prefix}priorityPiles`, 'Pile order', spec.priorityPiles, context)}</div>
    ${options.removable ? `<button class="dlr-builder-remove-inline" data-builder-action="remove-list" data-path="${escapeHtml(options.listPath)}" data-index="${options.index}"${disabled(context.readOnly)}>Remove</button>` : ''}
  </div>`;
}

function renderRequirements(path, label, requirements, context) {
  return `<section class="dlr-builder-form-section">
    <div class="dlr-builder-section-head"><h3>${escapeHtml(label)}</h3><button data-builder-action="add-requirement" data-path="${escapeHtml(path)}"${disabled(context.readOnly)}>Add</button></div>
    ${(requirements || []).map((spec, index) => renderCardSpec(`${path}.${index}`, spec, context, { index, removable: true, listPath: path })).join('') || '<div class="dlr-builder-empty">No requirements</div>'}
  </section>`;
}

function renderChallengeRequirements(path, label, groups, context) {
  return `<section class="dlr-builder-form-section">
    <div class="dlr-builder-section-head"><h3>${escapeHtml(label)}</h3><button data-builder-action="add-challenge-group" data-path="${escapeHtml(path)}"${disabled(context.readOnly)}>Add challenge</button></div>
    ${(groups || []).map((requirements, index) => `<div class="dlr-builder-subsection">
      <div class="dlr-builder-section-head"><h4>Challenge ${index + 1}</h4><button data-builder-action="remove-list" data-path="${escapeHtml(path)}" data-index="${index}"${disabled(context.readOnly)}>Remove</button></div>
      ${renderRequirements(`${path}.${index}`, 'Materials', requirements, context)}
    </div>`).join('') || '<div class="dlr-builder-empty">No per-challenge requirements</div>'}
  </section>`;
}

function renderRuntimeQuantity(path, value = {}, context) {
  return `<section class="dlr-builder-form-section"><h3>Runtime quantity</h3><div class="dlr-builder-form-grid">
    ${fieldRow('Mode', selectInput(`${path}.mode`, value.mode, [
      { value: 'user', label: 'User input' },
      { value: 'ea-remaining', label: 'Current EA remaining' },
      { value: 'exhaust', label: 'All matching sources' },
      { value: 'fixed', label: 'Fixed' },
    ], context.readOnly, true))}
    ${fieldRow('Target', selectInput(`${path}.target`, value.target, [
      { value: 'maxCompletions', label: 'SBC completions' }, { value: 'rounds', label: 'Rounds' }, { value: 'maxPacks', label: 'Packs' }, { value: 'validationRounds', label: 'Validation runs' },
    ], context.readOnly, true))}
    ${fieldRow('Default', textInput(`${path}.default`, value.default, 'number', context.readOnly))}
    ${fieldRow('Minimum', textInput(`${path}.min`, value.min, 'number', context.readOnly))}
    ${fieldRow('Maximum', textInput(`${path}.max`, value.max, 'number', context.readOnly))}
    ${fieldRow('Allow zero', `<select data-builder-field="${path}.allowZero" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value.allowZero)}</select>`)}
    ${fieldRow('Label', textInput(`${path}.label`, value.label, 'text', context.readOnly))}
  </div></section>`;
}

function renderRewardFlow(path, value = {}, context) {
  return `<section class="dlr-builder-form-section"><h3>Reward flow</h3><div class="dlr-builder-form-grid">
    ${fieldRow('Open rewards', selectInput(`${path}.open`, value.open, [
      { value: 'inherit', label: 'Inherit' }, { value: 'always', label: 'Always' }, { value: 'never', label: 'Never' },
    ], context.readOnly))}
  </div>
  ${renderList(`${path}.packIds`, 'Reward pack IDs', value.packIds, 'number', context)}
  ${renderList(`${path}.packNames`, 'Reward pack aliases', value.packNames, 'text', context)}
  ${renderList(`${path}.unassignedRecoveryPolicyIds`, 'Recovery policies', value.unassignedRecoveryPolicyIds, 'text', context)}
  </section>`;
}

function renderPickOptions(path, value = {}, context) {
  const fields = [
    ['pickSelectionMode', 'Selection mode', 'pick-selection-mode'],
    ['protectionRating', 'Protection rating', 'number'],
    ['openPicksAtEnd', 'Open Picks at end', 'boolean-inherit'],
    ['preferScannedMetadata', 'Prefer scanned metadata', 'boolean-inherit'],
  ];
  return `<section class="dlr-builder-form-section"><h3>Player Pick options</h3><div class="dlr-builder-form-grid">${fields.map(([key, label, type]) => (
    type === 'pick-selection-mode'
      ? fieldRow(label, selectInput(
        `${path}.${key}`,
        value[key],
        PLAYER_PICK_SELECTION_MODES.map((selectionMode) => ({
          value: selectionMode,
          label: PLAYER_PICK_SELECTION_MODE_LABELS[selectionMode],
        })),
        context.readOnly,
        true,
      ))
      : type === 'boolean-inherit'
      ? fieldRow(label, `<select data-builder-field="${path}.${key}" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value[key])}</select>`)
      : fieldRow(label, textInput(
        `${path}.${key}`,
        key === 'protectionRating' ? value.protectionRating ?? value.autoPickThreshold : value[key],
        type,
        context.readOnly,
      ))
  )).join('')}</div></section>`;
}

function renderSbcFodderPolicy(path, value = {}, context) {
  return `<section class="dlr-builder-form-section"><h3>SBC fodder policy</h3><div class="dlr-builder-form-grid">
    ${fieldRow('Mode', selectInput(`${path}.mode`, value.mode, [
      { value: 'auto', label: 'Auto detect' },
      { value: 'low-gold', label: 'Low-rated Gold' },
      { value: 'rating-constrained', label: 'Rating-constrained' },
    ], context.readOnly, true))}
    ${fieldRow('Low-rated SBC Gold max rating', textInput(`${path}.lowRatedGoldMaxRating`, value.lowRatedGoldMaxRating, 'number', context.readOnly))}
    ${fieldRow('Rating SBC max card rating', textInput(`${path}.ratingSbcMaxCardRating`, value.ratingSbcMaxCardRating, 'number', context.readOnly))}
  </div></section>`;
}

function renderPickBinding(path, value = {}, context) {
  return `<section class="dlr-builder-form-section"><h3>Pre-craft Player Pick</h3>
    ${renderList(`${path}.sbcSetIds`, 'SBC Set IDs', value.sbcSetIds, 'number', context)}
    ${renderList(`${path}.pickItemResourceIds`, 'Pick resource IDs', value.pickItemResourceIds, 'number', context)}
  </section>`;
}

function renderPickSelector(path, value = {}, context) {
  return `<section class="dlr-builder-form-section"><h3>Pre-craft Player Pick selector</h3><div class="dlr-builder-form-grid">
    ${fieldRow('Material', selectInput(`${path}.material`, value.material, [
      { value: '', label: 'Disabled' },
      { value: 'common-gold', label: 'Common Gold compatible' },
    ], context.readOnly))}
  </div></section>`;
}

function renderRecoveryPlayerPickSelector(path, value = {}, context) {
  const enabled = value?.material === 'rare-gold';
  const order = Array.isArray(value?.repeatabilityOrder) ? value.repeatabilityOrder : ['bounded', 'unlimited'];
  const unlimitedFirst = order[0] === 'unlimited';
  return `<section class="dlr-builder-form-section"><h3>Dynamic Player Pick recovery</h3><div class="dlr-builder-form-grid">
    ${fieldRow('Material', selectInput(`${path}.material`, value?.material, [
      { value: '', label: 'Disabled' },
      { value: 'rare-gold', label: 'Rare Gold recovery' },
    ], context.readOnly))}
    ${fieldRow('Minimum reward rating', textInput(`${path}.minRewardRating`, value?.minRewardRating ?? (enabled ? 85 : ''), 'number', context.readOnly))}
    ${fieldRow('Maximum challenges', textInput(`${path}.maxChallenges`, value?.maxChallenges ?? (enabled ? 1 : ''), 'number', context.readOnly))}
    ${fieldRow('Minimum Rare Gold cost', textInput(`${path}.minRareGoldCost`, value?.minRareGoldCost ?? (enabled ? 1 : ''), 'number', context.readOnly))}
    ${fieldRow('Pick preference', `<select data-builder-field="${escapeHtml(`${path}.repeatabilityOrder`)}" data-builder-value-type="recovery-pick-order"${disabled(context.readOnly)}><option value="bounded-first"${selected(unlimitedFirst, false)}>Limited uses first</option><option value="unlimited-first"${selected(unlimitedFirst, true)}>Unlimited uses first</option></select>`)}
  </div></section>`;
}

function renderUpgrade(path, value = {}, context, options = {}) {
  return `<div class="dlr-builder-subsection">
    <div class="dlr-builder-section-head"><h4>${escapeHtml(options.label || value.name || 'Upgrade')}</h4>${options.removable ? `<button data-builder-action="remove-list" data-path="${escapeHtml(options.listPath)}" data-index="${options.index}"${disabled(context.readOnly)}>Remove</button>` : ''}</div>
    <div class="dlr-builder-form-grid">
      ${fieldRow('ID', textInput(`${path}.id`, value.id, 'id', context.readOnly))}
      ${fieldRow('Name', textInput(`${path}.name`, value.name, 'text', context.readOnly))}
      ${fieldRow('Maximum completions', textInput(`${path}.maxCompletions`, value.maxCompletions, 'number', context.readOnly))}
      ${fieldRow('Open rewards', `<select data-builder-field="${path}.openRewardPacks" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value.openRewardPacks)}</select>`)}
      ${fieldRow('Force reward opening', `<select data-builder-field="${path}.forceOpenRewardPacks" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value.forceOpenRewardPacks)}</select>`)}
    </div>
    ${renderActivityBinding(`${path}.activityBinding`, value.activityBinding, context)}
    ${renderList(`${path}.sbcNames`, 'SBC aliases', value.sbcNames, 'text', context)}
    ${renderList(`${path}.rewardPackIds`, 'Reward pack IDs', value.rewardPackIds, 'number', context)}
    ${renderList(`${path}.rewardPackNames`, 'Reward pack aliases', value.rewardPackNames, 'text', context)}
    ${renderRequirements(`${path}.requirements`, 'Requirements', value.requirements, context)}
    ${renderChallengeRequirements(`${path}.challengeRequirements`, 'Challenge requirements', value.challengeRequirements, context)}
    ${renderPileList(`${path}.priorityPiles`, 'Pile order', value.priorityPiles, context)}
  </div>`;
}

function renderUpgradeList(path, label, values, context, stage = false) {
  return `<section class="dlr-builder-form-section">
    <div class="dlr-builder-section-head"><h3>${escapeHtml(label)}</h3><button data-builder-action="add-upgrade" data-path="${escapeHtml(path)}" data-stage="${stage}"${disabled(context.readOnly)}>Add</button></div>
    ${(values || []).map((value, index) => renderUpgrade(`${path}.${index}`, value, context, { label: stage ? `Stage ${index + 1}` : `Upgrade ${index + 1}`, removable: true, listPath: path, index })).join('') || '<div class="dlr-builder-empty">No upgrades</div>'}
  </section>`;
}

function renderShortagePacks(path, label, values, context) {
  return `<section class="dlr-builder-form-section">
    <div class="dlr-builder-section-head"><h3>${escapeHtml(label)}</h3><button data-builder-action="add-shortage" data-path="${escapeHtml(path)}"${disabled(context.readOnly)}>Add</button></div>
    ${(values || []).map((source, index) => `<div class="dlr-builder-subsection">
      <div class="dlr-builder-section-head"><h4>Source ${index + 1}</h4><button data-builder-action="remove-list" data-path="${escapeHtml(path)}" data-index="${index}"${disabled(context.readOnly)}>Remove</button></div>
      ${renderCardSpec(`${path}.${index}.requirement`, source.requirement, context, { withCount: false })}
      <div class="dlr-builder-form-grid">
        ${fieldRow('Reward produced by Loop', selectInput(`${path}.${index}.sourcePackRef.rewardOfLoopId`, source.sourcePackRef?.rewardOfLoopId, [
          { value: '', label: 'Use pack ID/name fallback only' },
          ...context.rewardSourceLoops.map((loop) => ({ value: loop.id, label: `${loop.name} (${loop.id})` })),
        ], context.readOnly))}
      </div>
      ${renderList(`${path}.${index}.packIds`, 'Pack IDs', source.packIds, 'number', context)}
      ${renderList(`${path}.${index}.packNames`, 'Pack aliases', source.packNames, 'text', context)}
      <div class="dlr-builder-form-grid">
        ${fieldRow('Maximum opens', textInput(`${path}.${index}.maxOpensPerAttempt`, source.maxOpensPerAttempt, 'number', context.readOnly))}
        ${fieldRow('Repeat until supplied', `<select data-builder-field="${path}.${index}.repeatUntilSatisfied" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(source.repeatUntilSatisfied)}</select>`)}
        ${fieldRow('Maximum supply runs', textInput(`${path}.${index}.maxRuns`, source.maxRuns, 'number', context.readOnly))}
        ${fieldRow('Duplicate routing', selectInput(`${path}.${index}.routingPolicy`, source.routingPolicy, [
          { value: '', label: 'Resolve normally' }, { value: 'reserveMatchingDuplicates', label: 'Reserve matching duplicates' },
        ], context.readOnly))}
      </div>
    </div>`).join('') || '<div class="dlr-builder-empty">No shortage pack sources</div>'}
  </section>`;
}

function renderRatingFill(path, value = {}, context) {
  return `<section class="dlr-builder-form-section"><h3>Rating recipe</h3><div class="dlr-builder-form-grid">
    ${fieldRow('Target rating', textInput(`${path}.targetRating`, value.targetRating, 'number', context.readOnly))}
  </div>${renderPileList(`${path}.priorityPiles`, 'Pile order', value.priorityPiles, context)}</section>`;
}

function renderGenericObject(path, label, value, context) {
  if (value === undefined || value === null || value === false) {
    return `<section class="dlr-builder-form-section"><h3>${escapeHtml(label)}</h3>${fieldRow('Enabled', `<select data-builder-field="${path}" data-builder-value-type="object-toggle"${disabled(context.readOnly)}><option value=""${selected(value, undefined)}>Inherit</option><option value="false"${selected(value, false)}>Disabled</option><option value="true"${selected(Boolean(value), true)}>Enabled</option></select>`)}</section>`;
  }
  const fields = Object.entries(value).filter(([, entry]) => ['string', 'number', 'boolean'].includes(typeof entry));
  return `<section class="dlr-builder-form-section"><h3>${escapeHtml(label)}</h3><div class="dlr-builder-form-grid">
    ${fieldRow('Enabled', `<select data-builder-field="${path}" data-builder-value-type="object-toggle"${disabled(context.readOnly)}><option value="true" selected>Enabled</option><option value="false">Disabled</option></select>`)}
    ${fields.map(([key, entry]) => typeof entry === 'boolean'
      ? fieldRow(key, `<select data-builder-field="${path}.${key}" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(entry)}</select>`)
      : fieldRow(key, textInput(`${path}.${key}`, entry, typeof entry === 'number' ? 'number' : 'text', context.readOnly))).join('')}
  </div></section>`;
}

function renderSpecialRequirementControl(path, value, context) {
  if (value === undefined || value === null || value === false) {
    return renderGenericObject(path, 'Additional special requirement control', value, context);
  }
  return `<section class="dlr-builder-form-section"><h3>Additional special requirement control</h3>
    ${fieldRow('Enabled', `<select data-builder-field="${path}" data-builder-value-type="object-toggle"${disabled(context.readOnly)}><option value="true" selected>Enabled</option><option value="false">Disabled</option></select>`)}
    ${renderList(`${path}.patterns`, 'Requirement label patterns', value.patterns, 'text', context)}
    ${renderList(`${path}.buttonTexts`, 'Add button labels', value.buttonTexts, 'text', context)}
  </section>`;
}

function renderAutomaticFillRecovery(path, label, value, context, options = {}) {
  if (value === undefined || value === null || value === false) {
    return renderGenericObject(path, label, value, context);
  }
  return `<section class="dlr-builder-form-section"><h3>${escapeHtml(label)}</h3>
    ${renderActivityBinding(`${path}.activityBinding`, value.activityBinding, context)}
    <div class="dlr-builder-form-grid">
      ${fieldRow('Enabled', `<select data-builder-field="${path}" data-builder-value-type="object-toggle"${disabled(context.readOnly)}><option value="true" selected>Enabled</option><option value="false">Disabled</option></select>`)}
      ${fieldRow('Name', textInput(`${path}.name`, value.name, 'text', context.readOnly))}
      ${options.attempts ? fieldRow('Maximum attempts per completion', textInput(`${path}.maxAttemptsPerCompletion`, value.maxAttemptsPerCompletion, 'number', context.readOnly)) : ''}
      ${fieldRow('Maximum completions', textInput(`${path}.maxCompletions`, value.maxCompletions, 'number', context.readOnly))}
      ${fieldRow('Required special cards', textInput(`${path}.requiredSpecialCount`, value.requiredSpecialCount, 'number', context.readOnly))}
      ${fieldRow('Allowed special cards', textInput(`${path}.allowedSpecialCount`, value.allowedSpecialCount, 'number', context.readOnly))}
      ${fieldRow('Fill from inventory first', `<select data-builder-field="${path}.inventoryFillFirst" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value.inventoryFillFirst)}</select>`)}
      ${fieldRow('Block special cards', `<select data-builder-field="${path}.blockSpecial" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value.blockSpecial)}</select>`)}
      ${fieldRow('Block tradeable cards', `<select data-builder-field="${path}.blockTradeable" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value.blockTradeable)}</select>`)}
      ${fieldRow('Open reward packs', `<select data-builder-field="${path}.openRewardPacks" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value.openRewardPacks)}</select>`)}
      ${fieldRow('Force reward opening', `<select data-builder-field="${path}.forceOpenRewardPacks" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(value.forceOpenRewardPacks)}</select>`)}
    </div>
    ${renderSbcFodderPolicy(`${path}.sbcFodderPolicy`, value.sbcFodderPolicy, context)}
    ${renderList(`${path}.sbcNames`, 'SBC aliases', value.sbcNames, 'text', context)}
    ${renderList(`${path}.rewardPackIds`, 'Reward pack IDs', value.rewardPackIds, 'number', context)}
    ${renderList(`${path}.rewardPackNames`, 'Reward pack aliases', value.rewardPackNames, 'text', context)}
    ${renderRequirements(`${path}.requirements`, 'Requirements', value.requirements, context)}
    ${renderRatingFill(`${path}.ratingSbcFill`, value.ratingSbcFill, context)}
    ${renderPileList(`${path}.priorityPiles`, 'Pile order', value.priorityPiles, context)}
  </section>`;
}

function renderAutoTotwUpgrade(path, value, context) {
  return renderAutomaticFillRecovery(path, 'Automatic special recovery', value, context);
}

function renderAutoFodderUpgrade(path, value, context) {
  return renderAutomaticFillRecovery(path, 'Automatic fodder recovery', value, context, { attempts: true });
}

function renderLegacyOverrides(path, value = {}, context) {
  return `<section class="dlr-builder-form-section"><h3>Legacy step overrides</h3>
    ${Object.entries(value || {}).map(([stepId, override]) => `<div class="dlr-builder-subsection"><h4>${escapeHtml(stepId)}</h4><div class="dlr-builder-form-grid">
      ${Object.entries(override || {}).map(([key, entry]) => typeof entry === 'boolean'
        ? fieldRow(key, `<select data-builder-field="${path}.${stepId}.${key}" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(entry)}</select>`)
        : fieldRow(key, textInput(`${path}.${stepId}.${key}`, entry, typeof entry === 'number' ? 'number' : 'text', context.readOnly))).join('')}
    </div></div>`).join('') || '<div class="dlr-builder-empty">No legacy overrides</div>'}
  </section>`;
}

function renderField(field, loop, context) {
  const value = loop[field.path];
  switch (field.type) {
    case 'string-list': return renderList(field.path, field.label, value, 'text', context);
    case 'number-list': return renderList(field.path, field.label, value, 'number', context);
    case 'pile-list': return renderPileList(field.path, field.label, value, context);
    case 'policy-list': return renderList(field.path, field.label, value, 'text', context);
    case 'card-spec': return `<section class="dlr-builder-form-section"><h3>${escapeHtml(field.label)}</h3>${renderCardSpec(field.path, value, context, { withCount: false })}</section>`;
    case 'requirements': return renderRequirements(field.path, field.label, value, context);
    case 'challenge-requirements': return renderChallengeRequirements(field.path, field.label, value, context);
    case 'runtime-quantity': return renderRuntimeQuantity(field.path, value, context);
    case 'reward-flow': return renderRewardFlow(field.path, value, context);
    case 'pick-options': return renderPickOptions(field.path, value, context);
    case 'sbc-fodder-policy': return renderSbcFodderPolicy(field.path, value, context);
    case 'pick-binding': return renderPickBinding(field.path, value, context);
    case 'pick-selector': return renderPickSelector(field.path, value, context);
    case 'activity-binding': return renderActivityBinding(field.path, value, context);
    case 'upgrade': return `<section class="dlr-builder-form-section"><h3>${escapeHtml(field.label)}</h3>${renderUpgrade(field.path, value, context)}</section>`;
    case 'upgrade-list': return renderUpgradeList(field.path, field.label, value, context);
    case 'stage-list': return renderUpgradeList(field.path, field.label, value, context, true);
    case 'shortage-packs': return renderShortagePacks(field.path, field.label, value, context);
    case 'source-pack-ref': return renderSourcePackRef(field.path, field.label, value, context);
    case 'rating-fill': return renderRatingFill(field.path, value, context);
    case 'auto-totw-upgrade': return renderAutoTotwUpgrade(field.path, value, context);
    case 'auto-fodder-upgrade': return renderAutoFodderUpgrade(field.path, value, context);
    case 'special-requirement-control': return renderSpecialRequirementControl(field.path, value, context);
    case 'object-toggle': return renderGenericObject(field.path, field.label, value, context);
    case 'legacy-step-overrides': return renderLegacyOverrides(field.path, value, context);
    case 'workflow-steps': return '';
    default: return renderScalarField(field, value, context);
  }
}

function renderWorkflow(loop, context) {
  const steps = loop.steps || [];
  return `<section class="dlr-builder-workflow">
    <div class="dlr-builder-section-head"><h2>Steps</h2><div class="dlr-builder-add-row">
      <select id="dlr-builder-add-step-select"${disabled(context.readOnly)}>${context.atomicLoops.map((child) => `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)} (${escapeHtml(child.strategy)})</option>`).join('')}</select>
      <button data-builder-action="add-step"${disabled(context.readOnly || !context.atomicLoops.length)}>Add step</button>
    </div></div>
    <div class="dlr-builder-step-list">${steps.map((rawStep, index) => {
      const step = typeof rawStep === 'string' ? { loopId: rawStep } : rawStep;
      const child = context.allLoops.find((candidate) => String(candidate.id) === String(step.loopId));
      return `<div class="dlr-builder-step${index === context.selectedStep ? ' selected' : ''}" data-builder-action="select-step" data-index="${index}">
        <span class="dlr-builder-step-number">${index + 1}</span>
        <div><strong>${escapeHtml(step.name || child?.name || step.loopId)}</strong><small>${escapeHtml(child?.strategy || 'Missing Loop')} | ${escapeHtml(step.loopId)}</small></div>
        <button data-builder-action="move-step" data-index="${index}" data-delta="-1"${disabled(context.readOnly || index === 0)}>Up</button>
        <button data-builder-action="move-step" data-index="${index}" data-delta="1"${disabled(context.readOnly || index === steps.length - 1)}>Down</button>
        <button data-builder-action="variant-step" data-index="${index}"${disabled(context.readOnly || !child)}>Customize</button>
        <button data-builder-action="remove-step" data-index="${index}"${disabled(context.readOnly)}>Remove</button>
      </div>`;
    }).join('') || '<div class="dlr-builder-empty">Add at least one atomic Loop</div>'}</div>
  </section>`;
}

function renderLoopEditor(loop, context) {
  if (!loop) return '<div class="dlr-builder-empty large">Select a Loop or Workflow</div>';
  const descriptor = getBuilderStrategyDescriptor(loop.strategy);
  const fields = getBuilderLoopFields(loop);
  return `<div class="dlr-builder-editor-title"><div><span class="dlr-builder-source ${context.source}">${escapeHtml(context.source)}</span><h1>${escapeHtml(loop.name)}</h1><code>${escapeHtml(loop.id)}</code></div>
    <div class="dlr-builder-object-actions">
      ${context.source === 'dynamic' ? '<button data-builder-action="bind-dynamic">Add to profile</button>' : ''}
      ${context.source === 'dynamic-bound' ? '<button class="danger" data-builder-action="unbind-dynamic">Remove binding</button>' : ''}
      ${context.source === 'built-in' ? '<button data-builder-action="override-object">Override</button>' : ''}
      ${context.source === 'override' ? '<button data-builder-action="reset-object">Reset</button>' : ''}
      ${context.source !== 'dynamic' ? '<button data-builder-action="duplicate-object">Duplicate</button>' : ''}
      ${context.source === 'custom' ? '<button class="danger" data-builder-action="delete-object">Delete</button>' : ''}
    </div>
  </div>
  ${descriptor?.routine ? renderWorkflow(loop, context) : ''}
  <div class="dlr-builder-form-grid common">${fields.filter((field) => ['text', 'id', 'strategy', 'integer', 'rating', 'boolean-inherit', 'inventory-mode', 'special-kind', 'loop-reference', 'activity-family', 'pick-loop-reference', 'price-platform'].includes(field.type)).map((field) => renderField(field, loop, context)).join('')}</div>
  ${fields.filter((field) => !['text', 'id', 'strategy', 'integer', 'rating', 'boolean-inherit', 'inventory-mode', 'special-kind', 'loop-reference', 'activity-family', 'pick-loop-reference', 'price-platform', 'workflow-steps'].includes(field.type)).map((field) => renderField(field, loop, context)).join('')}`;
}

function renderRecoveryEditor(object, kind, context) {
  if (!object) return '<div class="dlr-builder-empty large">Select a recovery recipe or policy</div>';
  const actions = `<div class="dlr-builder-object-actions">
    ${context.source === 'built-in' ? '<button data-builder-action="override-object">Override</button>' : ''}
    ${context.source === 'override' ? '<button data-builder-action="reset-object">Reset</button>' : ''}
    <button data-builder-action="duplicate-object">Duplicate</button>
    ${context.source === 'custom' ? '<button class="danger" data-builder-action="delete-object">Delete</button>' : ''}
  </div>`;
  const common = `<div class="dlr-builder-form-grid common">${fieldRow('Name', textInput('name', object.name, 'text', context.readOnly))}${fieldRow('Stable ID', textInput('id', object.id, 'id', context.readOnly || context.source !== 'custom'))}</div>`;
  if (kind === 'recoveryRecipes') {
    return `<div class="dlr-builder-editor-title"><div><span class="dlr-builder-source ${context.source}">${context.source}</span><h1>${escapeHtml(object.name)}</h1></div>${actions}</div>${common}
      <section class="dlr-builder-form-section"><h3>Recovery behavior</h3><div class="dlr-builder-form-grid">
        ${fieldRow('Maximum submissions', textInput('maxSubmissions', object.maxSubmissions, 'number', context.readOnly))}
        ${fieldRow('Must consume trigger', `<select data-builder-field="mustConsumeTrigger" data-builder-value-type="boolean-inherit"${disabled(context.readOnly)}>${boolOptions(object.mustConsumeTrigger)}</select>`)}
        ${fieldRow('Unavailable', selectInput('onUnavailable', object.onUnavailable, [{ value: '', label: 'Default' }, { value: 'continue', label: 'Continue' }, { value: 'stop', label: 'Stop' }], context.readOnly))}
        ${fieldRow('Insufficient', selectInput('onInsufficient', object.onInsufficient, [{ value: '', label: 'Default' }, { value: 'continue', label: 'Continue' }, { value: 'stop', label: 'Stop' }], context.readOnly))}
        ${fieldRow('Blocked', selectInput('onBlocked', object.onBlocked, [{ value: '', label: 'Default (stop)' }, { value: 'stop', label: 'Stop' }], context.readOnly))}
      </div></section>
      ${renderRecoveryPlayerPickSelector('playerPickSelector', object.playerPickSelector, context)}
      ${renderActivityBinding('activityBinding', object.activityBinding, context)}
      ${renderList('sbcNames', 'SBC aliases', object.sbcNames, 'text', context)}
      ${renderRequirements('requirements', 'Requirements', object.requirements, context)}
      ${renderPileList('priorityPiles', 'Pile order', object.priorityPiles, context)}`;
  }
  return `<div class="dlr-builder-editor-title"><div><span class="dlr-builder-source ${context.source}">${context.source}</span><h1>${escapeHtml(object.id)}</h1></div>${actions}</div>${common}
    <section class="dlr-builder-form-section"><div class="dlr-builder-form-grid">
      ${fieldRow('Use by default', `<select data-builder-action="toggle-default-policy" data-policy-id="${escapeHtml(object.id)}"${disabled(context.readOnly)}><option value="false"${selected(context.defaultRecoveryPolicyIds.includes(object.id), false)}>Disabled</option><option value="true"${selected(context.defaultRecoveryPolicyIds.includes(object.id), true)}>Enabled</option></select>`)}
    </div></section>
    <section class="dlr-builder-form-section"><h3>Match</h3>${renderCardSpec('match', object.match, context, { withCount: false })}</section>
    <section class="dlr-builder-form-section"><div class="dlr-builder-section-head"><h3>Recovery steps</h3><button data-builder-action="add-recovery-step"${disabled(context.readOnly)}>Add</button></div>
      ${(object.steps || []).map((step, index) => `<div class="dlr-builder-form-grid recovery-step">
        ${fieldRow('Recipe', selectInput(`steps.${index}.recipeId`, step.recipeId, context.recoveryRecipes.map((recipe) => ({ value: recipe.id, label: recipe.name })), context.readOnly))}
        ${fieldRow('Unavailable', selectInput(`steps.${index}.onUnavailable`, step.onUnavailable, [{ value: '', label: 'Default' }, { value: 'continue', label: 'Continue' }, { value: 'stop', label: 'Stop' }], context.readOnly))}
        ${fieldRow('Insufficient', selectInput(`steps.${index}.onInsufficient`, step.onInsufficient, [{ value: '', label: 'Default' }, { value: 'continue', label: 'Continue' }, { value: 'stop', label: 'Stop' }], context.readOnly))}
        ${fieldRow('Blocked', selectInput(`steps.${index}.onBlocked`, step.onBlocked, [{ value: '', label: 'Default (stop)' }, { value: 'stop', label: 'Stop' }], context.readOnly))}
        <button data-builder-action="remove-list" data-path="steps" data-index="${index}"${disabled(context.readOnly)}>Remove</button>
      </div>`).join('') || '<div class="dlr-builder-empty">No recovery steps</div>'}
    </section>`;
}

function libraryRows(model) {
  const search = String(model.search || '').toLowerCase();
  let entries = [];
  if (model.tab === 'workflows') entries = model.config.loops.filter((loop) => ['dailyRoutine', 'workflowRoutine'].includes(loop.strategy)).map((object) => ({ kind: 'loops', object }));
  if (model.tab === 'loops') entries = model.config.loops.filter((loop) => !['dailyRoutine', 'workflowRoutine'].includes(loop.strategy)).map((object) => ({ kind: 'loops', object }));
  if (model.tab === 'dynamic') entries = model.discoveredLoops.map((object) => ({ kind: 'dynamic', object }));
  if (model.tab === 'recovery') entries = [
    ...model.config.recoveryRecipes.map((object) => ({ kind: 'recoveryRecipes', object })),
    ...model.config.unassignedRecoveryPolicies.map((object) => ({ kind: 'unassignedRecoveryPolicies', object })),
  ];
  return entries.filter(({ object }) => `${object.name || ''} ${object.id || ''} ${object.strategy || ''}`.toLowerCase().includes(search));
}

function renderLibrary(model) {
  const entries = libraryRows(model);
  return `<aside class="dlr-builder-library">
    <div class="dlr-builder-library-tools"><input id="dlr-builder-search" type="search" value="${escapeHtml(model.search)}" placeholder="Search"><button data-builder-action="new-object"${disabled(model.tab === 'dynamic')}>New</button></div>
    <div class="dlr-builder-library-list">${entries.map(({ kind, object }) => {
      const source = kind === 'dynamic' ? 'dynamic' : model.sources[kind]?.find((entry) => entry.id === String(object.id))?.source || 'custom';
      const binding = kind === 'loops' && source === 'dynamic'
        ? (model.profile.dynamicBindings || []).find((entry) => String(entry.loopId) === String(object.id))
        : null;
      const availability = binding ? (binding.available ? 'available' : 'unavailable') : '';
      return `<button class="dlr-builder-library-row${model.selectedKind === kind && String(model.selectedId) === String(object.id) ? ' selected' : ''}" data-builder-action="select-object" data-kind="${kind}" data-id="${escapeHtml(object.id)}">
        <span><strong>${escapeHtml(object.name || object.id)}</strong><small>${escapeHtml(object.strategy || (kind === 'recoveryRecipes' ? 'Recovery recipe' : 'Recovery policy'))}${availability ? ` | ${availability}` : ''}</small></span>
        <span class="dlr-builder-source ${source}${availability ? ` ${availability}` : ''}">${source}</span>
      </button>`;
    }).join('') || '<div class="dlr-builder-empty">No matching objects</div>'}</div>
    ${model.tab === 'loops' ? `<div class="dlr-builder-new-type"><select id="dlr-builder-new-strategy">${optionList(BUILDER_STRATEGY_OPTIONS.filter((entry) => !entry.hidden && !['dailyRoutine', 'workflowRoutine'].includes(entry.value)), 'fillAndVerifySbc')}</select></div>` : ''}
    ${model.tab === 'recovery' ? '<div class="dlr-builder-new-type"><select id="dlr-builder-new-recovery-type"><option value="recipe">Recovery recipe</option><option value="policy">Recovery policy</option></select></div>' : ''}
  </aside>`;
}

function renderInspector(model, selected) {
  const errors = model.validation?.errors || [];
  const conflicts = model.validation?.conflicts || [];
  const references = model.references || [];
  const step = model.selectedStepData;
  return `<aside class="dlr-builder-inspector">
    <h2>Inspector</h2>
    ${step ? `<section><h3>Selected step</h3><div class="dlr-builder-form-grid">
      ${fieldRow('Display name', textInput(`steps.${model.selectedStep}.name`, step.name, 'text', model.editorReadOnly))}
    </div>${renderRewardFlow(`steps.${model.selectedStep}.rewardFlow`, step.rewardFlow, { ...model, readOnly: model.editorReadOnly })}</section>` : ''}
    <section><h3>Validation</h3>${errors.length ? `<ul class="dlr-builder-errors">${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>` : '<div class="dlr-builder-valid">Valid draft</div>'}</section>
    ${conflicts.length ? `<section><h3>Built-in conflicts</h3>${conflicts.map((conflict, index) => `<div class="dlr-builder-conflict"><strong>${escapeHtml(`${conflict.collection}.${conflict.id}${conflict.path ? `.${conflict.path}` : ''}`)}</strong><small>${escapeHtml(conflict.reason)}</small><div><button data-builder-action="resolve-conflict" data-index="${index}" data-choice="built-in">Use built-in</button><button data-builder-action="resolve-conflict" data-index="${index}" data-choice="profile">Keep mine</button></div></div>`).join('')}</section>` : ''}
    <section><h3>References</h3>${references?.length ? `<ul>${references.map((ref) => `<li>${escapeHtml(ref.ownerId)}: ${escapeHtml(ref.type)}</li>`).join('')}</ul>` : '<div class="dlr-builder-empty">No references</div>'}</section>
    <section><h3>Revision</h3><dl><dt>Draft</dt><dd>${model.profile.draftRevision}</dd><dt>Saved</dt><dd>${model.profile.savedRevision}</dd><dt>Source</dt><dd>${escapeHtml(model.selectedSource || 'n/a')}</dd></dl></section>
  </aside>`;
}

function renderJson(model) {
  return `<main class="dlr-builder-json-view">
    <div class="dlr-builder-json-tools">
      <button data-builder-action="validate-json">Validate pasted JSON</button>
      <button data-builder-action="apply-json">Import valid JSON</button>
      <button data-builder-action="export-json">Export generated JSON</button>
    </div>
    <div class="dlr-builder-json-grid">
      <section><h2>Paste / validate</h2><textarea id="dlr-builder-json-input" spellcheck="false">${escapeHtml(model.jsonInput || '')}</textarea></section>
      <section><h2>Generated draft</h2><pre>${escapeHtml(model.generatedJson)}</pre></section>
    </div>
    ${model.jsonMessage ? `<div class="dlr-builder-json-message ${model.jsonValid ? 'valid' : 'error'}">${escapeHtml(model.jsonMessage)}</div>` : ''}
  </main>`;
}

function quantitySummary(loop = {}) {
  const quantity = loop.runtimeQuantity;
  if (quantity?.mode) {
    const target = quantity.target || 'maxCompletions';
    const amount = quantity.mode === 'user'
      ? `${quantity.default || '?'} (${quantity.min || 1}-${quantity.max || '?'})`
      : quantity.mode;
    return `${target}: ${amount}`;
  }
  if (loop.consumeAllSourcePacks) return 'all matching source packs';
  if (loop.exhaustSbcSet) return 'all EA remaining completions';
  for (const field of ['maxCompletions', 'rounds', 'maxPacks', 'maxRounds']) {
    if (loop[field] !== undefined) return `${field}: ${loop[field]}`;
  }
  return 'strategy default';
}

function rewardSummary(loop = {}) {
  const mode = loop.rewardFlow?.open
    || (loop.forceOpenRewardPacks ? 'always' : loop.openRewardPacks === true ? 'always' : loop.openRewardPacks === false ? 'never' : 'inherit');
  const packs = [...(loop.rewardFlow?.packNames || []), ...(loop.rewardPackNames || [])];
  return `${mode}${packs.length ? ` | ${packs.slice(0, 2).join(', ')}${packs.length > 2 ? ` +${packs.length - 2}` : ''}` : ''}`;
}

function renderPreview(model) {
  const config = model.validation.config;
  const byId = new Map((config.loops || []).map((loop) => [String(loop.id), loop]));
  const workflows = (config.loops || []).filter((loop) => ['dailyRoutine', 'workflowRoutine'].includes(loop.strategy));
  const atomic = (config.loops || []).filter((loop) => !['dailyRoutine', 'workflowRoutine'].includes(loop.strategy));
  return `<main class="dlr-builder-preview">
    <div class="dlr-builder-editor-title"><div><h1>Configuration preview</h1><small>Read-only</small></div><button data-builder-action="close-preview">Back to editor</button></div>
    <section class="dlr-builder-form-section"><h2>Validation</h2>
      ${model.validation.errors.length
        ? `<ul class="dlr-builder-errors">${model.validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`
        : '<div class="dlr-builder-valid">Materialized configuration is valid</div>'}
    </section>
    <section class="dlr-builder-form-section"><h2>Workflows</h2>
      ${workflows.map((workflow) => `<div class="dlr-builder-preview-workflow"><h3>${escapeHtml(workflow.name)} <code>${escapeHtml(workflow.id)}</code></h3>
        <ol>${(workflow.steps || []).map((rawStep) => {
          const step = typeof rawStep === 'string' ? { loopId: rawStep } : rawStep;
          const child = byId.get(String(step.loopId));
          const previewLoop = child ? { ...child, rewardFlow: step.rewardFlow || child.rewardFlow } : {};
          return `<li class="${child ? '' : 'missing'}"><strong>${escapeHtml(step.name || child?.name || step.loopId)}</strong><span>${escapeHtml(child?.strategy || 'Missing Loop')}</span><span>${escapeHtml(child ? quantitySummary(child) : step.loopId)}</span><span>Rewards: ${escapeHtml(rewardSummary(previewLoop))}</span></li>`;
        }).join('')}</ol>
      </div>`).join('') || '<div class="dlr-builder-empty">No Workflows</div>'}
    </section>
    <section class="dlr-builder-form-section"><h2>Atomic Loops</h2>
      <div class="dlr-builder-preview-table">${atomic.map((loop) => `<div><strong>${escapeHtml(loop.name)}</strong><code>${escapeHtml(loop.id)}</code><span>${escapeHtml(loop.strategy)}</span><span>${escapeHtml(quantitySummary(loop))}</span><span>Inventory: ${escapeHtml(loop.inventoryMode || 'inherit')}</span><span>Rewards: ${escapeHtml(rewardSummary(loop))}</span></div>`).join('')}</div>
    </section>
    ${model.validation.unavailableBindings.length ? `<section class="dlr-builder-form-section"><h2>Unavailable Dynamic SBCs</h2><ul class="dlr-builder-errors">${model.validation.unavailableBindings.map((binding) => `<li>${escapeHtml(binding.loopId || binding.id)}</li>`).join('')}</ul></section>` : ''}
  </main>`;
}

export const WORKFLOW_LOOP_BUILDER_STYLE = `
  #dlr-workflow-builder { position: fixed; inset: 0; z-index: 1000001; display: none; background: #101214; color: #edf1f4; font: 12px Arial, sans-serif; }
  #dlr-workflow-builder.open { display: grid; grid-template-rows: auto minmax(0, 1fr) 28px; }
  #dlr-workflow-builder * { box-sizing: border-box; letter-spacing: 0; }
  .dlr-builder-body { min-height: 0; display: grid; grid-template-rows: 35px minmax(0, 1fr); overflow: hidden; }
  #dlr-workflow-builder button, #dlr-workflow-builder input, #dlr-workflow-builder select, #dlr-workflow-builder textarea { font: inherit; }
  #dlr-workflow-builder button { min-height: 28px; border: 1px solid #4a535d; background: #24292e; color: #f5f7f8; padding: 4px 9px; cursor: pointer; }
  #dlr-workflow-builder button:hover:not(:disabled) { border-color: #79a7d8; background: #2d343a; }
  #dlr-workflow-builder button:disabled { opacity: .42; cursor: default; }
  #dlr-workflow-builder button.primary { background: #276749; border-color: #48a679; }
  #dlr-workflow-builder button.danger { color: #ffb3b3; border-color: #824848; }
  .dlr-builder-toolbar { min-height: 48px; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #394047; background: #171a1d; }
  .dlr-builder-toolbar h1 { margin: 0 12px 0 0; font-size: 16px; white-space: nowrap; }
  .dlr-builder-toolbar select { max-width: 210px; }
  .dlr-builder-toolbar .spacer { flex: 1; }
  .dlr-builder-profile-controls, .dlr-builder-secondary-actions, .dlr-builder-primary-actions { display: flex; align-items: center; gap: 8px; }
  .dlr-builder-mobile-more, .dlr-builder-mobile-sections { display: none; }
  .dlr-builder-dirty { color: #ffcf66; min-width: 56px; }
  .dlr-builder-workspace { min-height: 0; display: grid; grid-template-columns: 260px minmax(420px, 1fr) 340px; }
  .dlr-builder-library, .dlr-builder-inspector { min-width: 0; overflow: auto; background: #171a1d; }
  .dlr-builder-library { border-right: 1px solid #394047; }
  .dlr-builder-inspector { border-left: 1px solid #394047; padding: 12px; }
  .dlr-builder-editor { min-width: 0; overflow: auto; padding: 16px 20px 60px; }
  .dlr-builder-tabs { display: flex; gap: 0; border-bottom: 1px solid #394047; background: #171a1d; padding-left: 12px; }
  .dlr-builder-tabs button { border-width: 0 0 2px; background: transparent; min-height: 34px; }
  .dlr-builder-tabs button.active { border-color: #58a6ff; color: #a9d2ff; }
  .dlr-builder-library-tools, .dlr-builder-add-row, .dlr-builder-json-tools { display: flex; gap: 6px; align-items: center; padding: 8px; }
  .dlr-builder-library-tools input { min-width: 0; flex: 1; }
  .dlr-builder-library-list { overflow: auto; }
  .dlr-builder-library-row { width: 100%; border: 0 !important; border-bottom: 1px solid #2e3439 !important; background: transparent !important; display: flex; justify-content: space-between; text-align: left; padding: 9px 10px !important; }
  .dlr-builder-library-row.selected { background: #243342 !important; box-shadow: inset 3px 0 #58a6ff; }
  .dlr-builder-library-row span:first-child { min-width: 0; display: flex; flex-direction: column; }
  .dlr-builder-library-row strong, .dlr-builder-library-row small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dlr-builder-library-row small { color: #aab4bd; margin-top: 3px; }
  .dlr-builder-source { display: inline-block; font-size: 10px; text-transform: uppercase; padding: 2px 5px; border: 1px solid #56616b; color: #c8d1d9; }
  .dlr-builder-source.custom { color: #8ee6b6; border-color: #377a55; }
  .dlr-builder-source.override { color: #ffd67a; border-color: #80652d; }
  .dlr-builder-source.dynamic { color: #d2b5ff; border-color: #71529a; }
  .dlr-builder-source.dynamic-bound { color: #d2b5ff; border-color: #71529a; }
  .dlr-builder-editor-title { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 1px solid #394047; padding-bottom: 12px; margin-bottom: 14px; }
  .dlr-builder-editor-title h1 { margin: 5px 0 2px; font-size: 20px; }
  .dlr-builder-editor-title code { color: #aab4bd; }
  .dlr-builder-object-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .dlr-builder-form-grid { display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap: 10px 12px; }
  .dlr-builder-form-grid.common { grid-template-columns: repeat(3, minmax(160px, 1fr)); margin-bottom: 14px; }
  .dlr-builder-field { min-width: 0; display: flex; flex-direction: column; gap: 4px; color: #b8c2ca; }
  .dlr-builder-field.wide { grid-column: 1 / -1; }
  .dlr-builder-field input, .dlr-builder-field select, .dlr-builder-add-row select, .dlr-builder-library-tools input, .dlr-builder-new-type select { width: 100%; min-width: 0; height: 30px; border: 1px solid #4a535d; background: #0e1012; color: #f4f6f8; padding: 4px 6px; }
  .dlr-builder-form-section { border-top: 1px solid #394047; padding: 13px 0; margin: 0; }
  .dlr-builder-form-section h3, .dlr-builder-inspector h2, .dlr-builder-inspector h3 { margin: 0 0 9px; font-size: 13px; }
  .dlr-builder-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
  .dlr-builder-section-head h2, .dlr-builder-section-head h3, .dlr-builder-section-head h4 { margin: 0; }
  .dlr-builder-list-row, .dlr-builder-pile-row { display: grid; grid-template-columns: minmax(120px, 1fr) auto auto auto; gap: 6px; margin: 5px 0; align-items: center; }
  .dlr-builder-list-row input { min-width: 0; height: 30px; border: 1px solid #4a535d; background: #0e1012; color: #fff; padding: 4px 6px; }
  .dlr-builder-pile-row { grid-template-columns: 28px 1fr auto auto auto; padding: 5px 0; border-bottom: 1px solid #292f34; }
  .dlr-builder-pile-order, .dlr-builder-step-number { color: #91a0ad; font-variant-numeric: tabular-nums; }
  .dlr-builder-requirement { display: grid; grid-template-columns: 30px repeat(4, minmax(100px, 1fr)); gap: 8px; align-items: end; margin: 6px 0; padding: 8px; border-left: 3px solid #a87932; background: #15181a; }
  .dlr-builder-requirement .dlr-builder-field { min-width: 90px; }
  .dlr-builder-requirement-index { align-self: center; font-weight: 700; }
  .dlr-builder-remove-inline { align-self: end; }
  .dlr-builder-subsection { border-left: 2px solid #46515b; padding: 9px 0 9px 12px; margin: 8px 0; }
  .dlr-builder-step { display: grid; grid-template-columns: 28px minmax(160px, 1fr) auto auto auto auto; gap: 7px; align-items: center; padding: 8px; border-bottom: 1px solid #343b41; cursor: pointer; }
  .dlr-builder-step.selected { background: #21303a; }
  .dlr-builder-step div { min-width: 0; display: flex; flex-direction: column; }
  .dlr-builder-step small { color: #aab4bd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dlr-builder-inspector section { border-top: 1px solid #394047; padding: 12px 0; }
  .dlr-builder-inspector dl { display: grid; grid-template-columns: 80px 1fr; gap: 5px; }
  .dlr-builder-inspector dt { color: #9faab4; }
  .dlr-builder-inspector dd { margin: 0; overflow-wrap: anywhere; }
  .dlr-builder-errors { color: #ffaaa5; padding-left: 18px; }
  .dlr-builder-conflict { display: grid; gap: 5px; padding: 8px 0; border-bottom: 1px solid #343b41; }
  .dlr-builder-conflict small { color: #aab4bd; }
  .dlr-builder-conflict div { display: flex; gap: 6px; }
  .dlr-builder-valid { color: #85dfaa; }
  .dlr-builder-empty { color: #8f9aa3; padding: 10px; text-align: center; }
  .dlr-builder-empty.large { padding: 60px 20px; font-size: 14px; }
  .dlr-builder-status { display: flex; gap: 18px; align-items: center; padding: 5px 12px; border-top: 1px solid #394047; background: #171a1d; color: #aeb8c0; }
  .dlr-builder-json-view { min-height: 0; overflow: auto; padding: 12px; }
  .dlr-builder-json-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-height: 520px; }
  .dlr-builder-json-grid section { min-width: 0; display: flex; flex-direction: column; }
  .dlr-builder-json-grid h2 { font-size: 14px; }
  .dlr-builder-json-grid textarea, .dlr-builder-json-grid pre { flex: 1; min-height: 420px; margin: 0; overflow: auto; border: 1px solid #4a535d; background: #0b0d0e; color: #eef2f4; padding: 10px; font: 11px Consolas, monospace; white-space: pre; }
  .dlr-builder-json-message { padding: 8px; margin-top: 8px; border: 1px solid; }
  .dlr-builder-json-message.valid { color: #85dfaa; border-color: #377a55; }
  .dlr-builder-json-message.error { color: #ffaaa5; border-color: #824848; }
  .dlr-builder-preview { min-height: 0; overflow: auto; padding: 12px; }
  .dlr-builder-preview-workflow { border-top: 1px solid #394047; padding: 10px 0; }
  .dlr-builder-preview-workflow ol { margin: 8px 0; padding-left: 24px; }
  .dlr-builder-preview-workflow li { display: grid; grid-template-columns: minmax(160px, 1fr) 150px 180px minmax(180px, 1fr); gap: 8px; padding: 5px; }
  .dlr-builder-preview-workflow li.missing { color: #ff9f9f; }
  .dlr-builder-preview-table > div { display: grid; grid-template-columns: minmax(160px, 1fr) 150px 170px 180px 160px minmax(180px, 1fr); gap: 8px; border-top: 1px solid #394047; padding: 7px 5px; align-items: center; }
  .dlr-builder-new-type { padding: 8px; border-top: 1px solid #394047; }
  @media (max-width: 1200px) {
    .dlr-builder-toolbar { flex-wrap: wrap; }
  }
  @media (max-width: 900px) {
    .dlr-builder-workspace { grid-template-columns: 220px minmax(360px, 1fr); }
    .dlr-builder-inspector { display: none; }
    .dlr-builder-form-grid.common { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
    .dlr-builder-requirement { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
    .dlr-builder-preview-workflow li, .dlr-builder-preview-table > div { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
  }
  :root[data-dlr-input="touch"] #dlr-workflow-builder button,
  :root[data-dlr-input="touch"] #dlr-workflow-builder input,
  :root[data-dlr-input="touch"] #dlr-workflow-builder select { min-height: 44px; font-size: 16px; }
  :root[data-dlr-layout="mobile"] #dlr-workflow-builder.open { grid-template-rows: auto minmax(0, 1fr) 28px; }
  :root[data-dlr-layout="mobile"] .dlr-builder-toolbar {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 8px 10px;
  }
  :root[data-dlr-layout="mobile"] .dlr-builder-toolbar h1 { margin: 0; overflow: hidden; text-overflow: ellipsis; }
  :root[data-dlr-layout="mobile"] .dlr-builder-toolbar .spacer { display: none; }
  :root[data-dlr-layout="mobile"] .dlr-builder-profile-controls { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
  :root[data-dlr-layout="mobile"] .dlr-builder-profile-controls select,
  :root[data-dlr-layout="mobile"] .dlr-builder-profile-controls input { width: 100%; min-width: 0; max-width: none; }
  :root[data-dlr-layout="mobile"] .dlr-builder-mobile-more { display: block; grid-column: 2; grid-row: 1; }
  :root[data-dlr-layout="mobile"] .dlr-builder-secondary-actions { display: none; grid-column: 1 / -1; flex-wrap: wrap; padding-top: 2px; }
  :root[data-dlr-layout="mobile"] .dlr-builder-toolbar.mobile-actions-open .dlr-builder-secondary-actions { display: flex; }
  :root[data-dlr-layout="mobile"] .dlr-builder-primary-actions {
    position: fixed; left: 0; right: 0; bottom: 28px; z-index: 4; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px; padding: 8px max(10px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px));
    background: #171a1d; border-top: 1px solid #394047;
  }
  :root[data-dlr-layout="mobile"] .dlr-builder-body { grid-template-rows: auto auto minmax(0, 1fr); padding-bottom: 60px; }
  :root[data-dlr-layout="mobile"] .dlr-builder-tabs { overflow-x: auto; padding-left: 0; scrollbar-width: thin; }
  :root[data-dlr-layout="mobile"] .dlr-builder-tabs button { flex: 0 0 auto; }
  :root[data-dlr-layout="mobile"] .dlr-builder-mobile-sections { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid #394047; background: #131619; }
  :root[data-dlr-layout="mobile"] .dlr-builder-mobile-sections button { border-width: 0 0 2px; background: transparent; }
  :root[data-dlr-layout="mobile"] .dlr-builder-mobile-sections button.active { border-color: #58a6ff; color: #a9d2ff; }
  :root[data-dlr-layout="mobile"] .dlr-builder-workspace { grid-template-columns: minmax(0, 1fr); }
  :root[data-dlr-layout="mobile"] .dlr-builder-workspace > .dlr-builder-library,
  :root[data-dlr-layout="mobile"] .dlr-builder-workspace > .dlr-builder-editor,
  :root[data-dlr-layout="mobile"] .dlr-builder-workspace > .dlr-builder-inspector { display: none; }
  :root[data-dlr-layout="mobile"] .dlr-builder-workspace[data-mobile-section="library"] > .dlr-builder-library,
  :root[data-dlr-layout="mobile"] .dlr-builder-workspace[data-mobile-section="editor"] > .dlr-builder-editor,
  :root[data-dlr-layout="mobile"] .dlr-builder-workspace[data-mobile-section="details"] > .dlr-builder-inspector { display: block; }
  :root[data-dlr-layout="mobile"] .dlr-builder-library { max-height: none; border: 0; }
  :root[data-dlr-layout="mobile"] .dlr-builder-editor,
  :root[data-dlr-layout="mobile"] .dlr-builder-inspector { overflow: auto; padding: 12px 10px 72px; border: 0; }
  :root[data-dlr-layout="mobile"] .dlr-builder-form-grid,
  :root[data-dlr-layout="mobile"] .dlr-builder-form-grid.common,
  :root[data-dlr-layout="mobile"] .dlr-builder-json-grid { grid-template-columns: minmax(0, 1fr); }
  :root[data-dlr-layout="mobile"] .dlr-builder-requirement { grid-template-columns: minmax(0, 1fr); }
  :root[data-dlr-layout="mobile"] .dlr-builder-step { grid-template-columns: 24px minmax(0, 1fr) auto; }
  :root[data-dlr-layout="mobile"] .dlr-builder-status { overflow-x: auto; white-space: nowrap; gap: 12px; padding-bottom: max(5px, env(safe-area-inset-bottom, 0px)); }
  :root[data-dlr-layout="desktop"] .dlr-builder-workspace { grid-template-columns: 260px minmax(420px, 1fr) 340px; }
  :root[data-dlr-layout="desktop"] .dlr-builder-inspector { display: block; }
  :root[data-dlr-layout-override="desktop"] .dlr-builder-toolbar { flex-wrap: nowrap; }
  :root[data-dlr-layout-override="desktop"] .dlr-builder-form-grid.common { grid-template-columns: repeat(3, minmax(160px, 1fr)); }
  :root[data-dlr-layout-override="desktop"] .dlr-builder-requirement { grid-template-columns: 30px repeat(4, minmax(100px, 1fr)); }
  :root[data-dlr-layout-override="desktop"] .dlr-builder-preview-workflow li { grid-template-columns: minmax(160px, 1fr) 150px 180px minmax(180px, 1fr); }
  :root[data-dlr-layout-override="desktop"] .dlr-builder-preview-table > div { grid-template-columns: minmax(160px, 1fr) 150px 170px 180px 160px minmax(180px, 1fr); }
  :root[data-dlr-layout-override="desktop"] .dlr-builder-body { overflow: auto; }
  :root[data-dlr-layout-override="desktop"] .dlr-builder-workspace { min-width: 1020px; }
`;

export function workflowLoopBuilderHtml(model) {
  const profileOptions = model.store.profiles.map((profile) => ({ value: profile.id, label: profile.name }));
  const tabs = [
    ['workflows', 'Workflows'], ['loops', 'Loops'], ['recovery', 'Recovery'], ['dynamic', 'Dynamic SBCs'], ['json', 'JSON validation'],
  ];
  const selected = model.selectedObject ? { kind: model.selectedKind, object: model.selectedObject } : null;
  const context = {
    readOnly: model.editorReadOnly,
    source: model.selectedKind === 'loops' && model.selectedSource === 'dynamic'
      ? 'dynamic-bound'
      : model.selectedSource,
    allLoops: model.config.loops,
    atomicLoops: model.config.loops.filter((loop) => !['dailyRoutine', 'workflowRoutine'].includes(loop.strategy)),
    playerPickLoops: model.config.loops.filter((loop) => loop.strategy === 'playerPickSbc'),
    rewardSourceLoops: model.config.loops.filter((loop) => (
      (loop.sbcSetIds?.length || loop.sbcNames?.length)
      && String(loop.id) !== String(model.selectedObject?.id)
    )),
    selectedStep: model.selectedStep,
    recoveryRecipes: model.config.recoveryRecipes,
    defaultRecoveryPolicyIds: model.config.defaultUnassignedRecoveryPolicyIds || [],
  };
  const editor = model.previewOpen
    ? renderPreview(model)
    : model.tab === 'json'
      ? renderJson(model)
      : `<div class="dlr-builder-workspace" data-mobile-section="${escapeHtml(model.mobileSection || 'library')}">${renderLibrary(model)}<main class="dlr-builder-editor">${
      model.selectedKind === 'loops' || model.selectedKind === 'dynamic'
        ? renderLoopEditor(model.selectedObject, context)
        : renderRecoveryEditor(model.selectedObject, model.selectedKind, context)
    }</main>${renderInspector(model, selected)}</div>`;
  const mobileSections = model.previewOpen || model.tab === 'json' ? '' : `<nav class="dlr-builder-mobile-sections" aria-label="Builder workspace">
    ${[['library', 'Library'], ['editor', 'Editor'], ['details', 'Details']].map(([id, label]) => `<button class="${model.mobileSection === id ? 'active' : ''}" data-builder-action="select-mobile-section" data-section="${id}">${label}</button>`).join('')}
  </nav>`;
  return `<header class="dlr-builder-toolbar${model.mobileActionsOpen ? ' mobile-actions-open' : ''}">
    <h1>Workflow Builder</h1>
    <div class="dlr-builder-profile-controls">
      <select data-builder-action="select-profile">${optionList(profileOptions, model.profile.id)}</select>
      <input id="dlr-builder-profile-name" value="${escapeHtml(model.profile.name)}" aria-label="Profile name">
      <span class="dlr-builder-dirty">${model.profile.draftRevision !== model.profile.savedRevision ? 'Unsaved' : 'Saved'}</span>
    </div>
    <span class="spacer"></span>
    <button class="dlr-builder-mobile-more" data-builder-action="toggle-mobile-actions" aria-expanded="${model.mobileActionsOpen ? 'true' : 'false'}">More</button>
    <div class="dlr-builder-secondary-actions">
      <button data-builder-action="new-profile">New profile</button>
      <button data-builder-action="delete-profile"${disabled(model.store.profiles.length <= 1)}>Delete profile</button>
      <button data-builder-action="undo-draft" title="Undo"${disabled(!model.canUndo)}>Undo</button>
      <button data-builder-action="redo-draft" title="Redo"${disabled(!model.canRedo)}>Redo</button>
      <button data-builder-action="validate-profile">Validate</button>
      <button data-builder-action="preview-profile">Preview</button>
      <button data-builder-action="show-import">Import</button>
      <button data-builder-action="export-json">Export</button>
    </div>
    <div class="dlr-builder-primary-actions">
      <button data-builder-action="save-profile">Save</button>
      <button class="primary" data-builder-action="activate-profile">Activate</button>
      <button data-builder-action="close-builder">Close</button>
    </div>
  </header>
  <div class="dlr-builder-body"><nav class="dlr-builder-tabs">${tabs.map(([id, label]) => `<button class="${model.tab === id ? 'active' : ''}" data-builder-action="select-tab" data-tab="${id}">${label}</button>`).join('')}</nav>${mobileSections}${editor}</div>
  <footer class="dlr-builder-status"><span>${model.validation.valid ? 'Valid' : `${model.validation.errors.length} error(s)`}</span><span>${model.validation.conflicts.length} conflict(s)</span><span>${model.validation.unavailableBindings.length} unavailable binding(s)</span><span>Active: ${escapeHtml(model.store.activeProfileId || 'Built-in')}</span></footer>`;
}

export function mountWorkflowLoopBuilder(options = {}) {
  const dom = options.dom;
  if (!dom?.query || !dom?.create || !dom?.appendToHead || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  let root = dom.query('#dlr-workflow-builder');
  if (root) return { root, created: false };
  const style = dom.create('style');
  style.id = 'dlr-workflow-builder-style';
  style.textContent = WORKFLOW_LOOP_BUILDER_STYLE;
  dom.appendToHead(style);
  root = dom.create('div');
  root.id = 'dlr-workflow-builder';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Workflow and Loop Builder');
  dom.appendToBody(root);
  return { root, style, created: true };
}
