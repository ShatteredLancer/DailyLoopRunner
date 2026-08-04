export const GOLD_CONSUMPTION_MODES = Object.freeze([
  'eligibility',
  'common-only',
  'rare-only',
  'common-first',
  'rare-first',
]);

const SELECTION_MATERIAL_MODES = Object.freeze({
  'common-gold': 'common-only',
  'rare-gold': 'rare-only',
  'low-rated-gold': 'common-first',
});

export function selectionMaterialGoldConsumptionMode(selectionMaterial) {
  return SELECTION_MATERIAL_MODES[String(selectionMaterial || '')] || null;
}

export function normalizeGoldConsumptionMode(value, fallback = 'eligibility') {
  const normalized = String(value || '').trim();
  return GOLD_CONSUMPTION_MODES.includes(normalized) ? normalized : fallback;
}

export function runtimeGoldConsumptionMode(requirement = {}) {
  if (requirement.tier !== 'gold') return 'eligibility';
  if (requirement.goldConsumption !== undefined) {
    return normalizeGoldConsumptionMode(requirement.goldConsumption);
  }
  if (requirement.preferCommon === true) return 'common-first';
  return 'eligibility';
}

export function configuredGoldConsumptionMode(requirement = {}, selectionMaterial = null) {
  if (requirement.tier !== 'gold') return 'eligibility';
  if (requirement.goldConsumption !== undefined) {
    return normalizeGoldConsumptionMode(requirement.goldConsumption);
  }
  const materialMode = selectionMaterialGoldConsumptionMode(selectionMaterial);
  if (materialMode) return materialMode;
  if (requirement.preferCommon === true) return 'common-first';
  if (requirement.rarity === 'common') return 'common-only';
  if (requirement.rarity === 'rare') return 'rare-only';
  return 'eligibility';
}

export function goldEligibilityRarities(requirement = {}) {
  if (requirement.tier !== 'gold') return [];
  if (requirement.rarity === 'common') return ['common'];
  if (requirement.rarity === 'rare') return ['rare'];
  return ['common', 'rare'];
}

export function goldConsumptionRarities(mode = 'eligibility') {
  const normalized = normalizeGoldConsumptionMode(mode);
  if (normalized === 'common-only') return ['common'];
  if (normalized === 'rare-only') return ['rare'];
  return ['common', 'rare'];
}

export function goldConsumptionCompatible(requirement = {}, mode = 'eligibility', options = {}) {
  if (requirement.tier !== 'gold') return true;
  const eligible = new Set(goldEligibilityRarities(requirement));
  const normalized = normalizeGoldConsumptionMode(mode);
  if (normalized === 'eligibility') return eligible.size > 0;
  const desired = goldConsumptionRarities(normalized);
  if (options.requireFallback === true && ['common-first', 'rare-first'].includes(normalized)) {
    return desired.every((rarity) => eligible.has(rarity));
  }
  return desired.some((rarity) => eligible.has(rarity));
}

export function goldConsumptionOrder(mode = 'eligibility') {
  const normalized = normalizeGoldConsumptionMode(mode);
  if (normalized === 'common-only') return ['common'];
  if (normalized === 'rare-only') return ['rare'];
  if (normalized === 'common-first') return ['common', 'rare'];
  if (normalized === 'rare-first') return ['rare', 'common'];
  return [];
}
