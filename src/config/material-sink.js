const NUMBER_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
});

const RARITY_RANK = Object.freeze({ common: 1, rare: 2 });
const CLASS_RANK = Object.freeze({ premium: 0, baseline: 1, 'sub-baseline': 2, incomparable: 3 });

export const MATERIAL_SINK_FAMILIES = Object.freeze({
  commonGold: 'common-gold-material-upgrade',
  rareGold: 'rare-gold-material-upgrade',
});

export const MATERIAL_SINK_CLASSES = Object.freeze([
  'premium',
  'baseline',
  'sub-baseline',
  'incomparable',
]);

export const MATERIAL_SINK_PREFERENCES = Object.freeze([
  'reward-first',
  'quantity-first',
  'cost-first',
]);

export const MATERIAL_SINK_MATERIALS = Object.freeze([
  'common-gold',
  'rare-gold',
]);

export const MATERIAL_SINK_BASELINES = Object.freeze({
  [MATERIAL_SINK_FAMILIES.commonGold]: Object.freeze({
    material: 'common-gold',
    cost: 11,
    reward: Object.freeze({ guaranteedCount: 2, minimumRating: 75, rarity: 'rare' }),
  }),
  [MATERIAL_SINK_FAMILIES.rareGold]: Object.freeze({
    material: 'rare-gold',
    cost: 10,
    reward: Object.freeze({ guaranteedCount: 2, minimumRating: 85, rarity: 'rare' }),
  }),
});

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizedText(value) {
  return String(value ?? '').trim();
}

function parsedCount(value) {
  const numeric = positiveInteger(value);
  if (numeric) return numeric;
  return NUMBER_WORDS[normalizedText(value).toLowerCase()] || null;
}

function rewardText(reward = {}, fallbackText = '') {
  return [reward.name, reward.description, fallbackText]
    .map(normalizedText)
    .filter(Boolean)
    .join(' ');
}

export function parseMaterialSinkReward(reward = {}, options = {}) {
  if (normalizedText(reward.type).toUpperCase() !== 'PACK') return null;
  const text = rewardText(reward, options.fallbackText);
  if (!text) return null;

  const prefix = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*x\s*(\d{2})\+/i.exec(text);
  const suffix = /\b(\d{2})\+\s*x\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.exec(text);
  const rareGoldCount = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+rare\s+gold\s+players?\b/i.exec(text);
  const guaranteedCount = parsedCount(
    positiveInteger(reward.guaranteedCount || reward.playerCount || reward.itemCount)
      || prefix?.[1]
      || suffix?.[2]
      || rareGoldCount?.[1],
  );
  const minimumRating = positiveInteger(
    reward.minimumRating
      || prefix?.[2]
      || suffix?.[1],
  ) || (/\brare\s+gold\s+players?\b/i.test(text) ? 75 : null);
  const rarity = /\brare\s+gold\b/i.test(text)
    ? 'rare'
    : (prefix || suffix) && options.fallbackRarity === 'rare'
      ? 'rare'
      : null;

  if (!guaranteedCount || !minimumRating || !rarity) return null;
  return {
    type: 'pack',
    guaranteedCount,
    minimumRating,
    rarity,
    tradeable: /\buntradeable\b/i.test(text) ? false : null,
  };
}

function rewardRelation(left = {}, right = {}) {
  const leftRarity = RARITY_RANK[left.rarity] || 0;
  const rightRarity = RARITY_RANK[right.rarity] || 0;
  if (!left.guaranteedCount || !left.minimumRating || !leftRarity
    || !right.guaranteedCount || !right.minimumRating || !rightRarity) return null;
  const values = [
    Number(left.guaranteedCount) - Number(right.guaranteedCount),
    Number(left.minimumRating) - Number(right.minimumRating),
    leftRarity - rightRarity,
  ];
  if (values.every((value) => value >= 0)) return values.some((value) => value > 0) ? 1 : 0;
  if (values.every((value) => value <= 0)) return values.some((value) => value < 0) ? -1 : 0;
  return null;
}

export function classifyMaterialSinkCandidate(input = {}) {
  const familyId = String(input.familyId || '');
  const baseline = MATERIAL_SINK_BASELINES[familyId];
  const cost = positiveInteger(input.cost);
  const reward = input.reward || null;
  if (!baseline || !cost || !reward) return { className: 'incomparable', relation: null };

  const rewardVsBaseline = rewardRelation(reward, baseline.reward);
  const baselineVsReward = rewardRelation(baseline.reward, reward);
  const costNoWorse = cost <= baseline.cost;
  const costStrictlyBetter = cost < baseline.cost;
  const rewardNoWorse = rewardVsBaseline === 0 || rewardVsBaseline === 1;
  const rewardStrictlyBetter = rewardVsBaseline === 1;

  if (costStrictlyBetter && rewardStrictlyBetter) {
    return { className: 'premium', relation: 'dominates-baseline' };
  }
  if (costNoWorse && rewardNoWorse) {
    return { className: 'baseline', relation: 'baseline-compatible' };
  }
  const baselineCostNoWorse = baseline.cost <= cost;
  const baselineRewardNoWorse = baselineVsReward === 0 || baselineVsReward === 1;
  if (baselineCostNoWorse && baselineRewardNoWorse
    && (baseline.cost < cost || baselineVsReward === 1)) {
    return { className: 'sub-baseline', relation: 'dominated-by-baseline' };
  }
  return { className: 'incomparable', relation: 'cross-tradeoff' };
}

function dominates(left, right) {
  if (!left?.materialSink || !right?.materialSink) return false;
  const leftSink = left.materialSink;
  const rightSink = right.materialSink;
  const reward = rewardRelation(leftSink.reward, rightSink.reward);
  return leftSink.cost <= rightSink.cost
    && (reward === 0 || reward === 1)
    && (leftSink.cost < rightSink.cost || reward === 1);
}

export function assignMaterialSinkParetoLayers(candidates = []) {
  const remaining = [...candidates];
  const layers = [];
  while (remaining.length) {
    const layer = remaining.filter((candidate) => (
      !remaining.some((other) => other !== candidate && dominates(other, candidate))
    ));
    if (!layer.length) break;
    layers.push(layer);
    layer.forEach((candidate) => remaining.splice(remaining.indexOf(candidate), 1));
  }
  return layers;
}

function compareNumbers(left, right, direction = 'desc') {
  const a = Number(left || 0);
  const b = Number(right || 0);
  return direction === 'asc' ? a - b : b - a;
}

function preferenceFields(preference) {
  if (preference === 'quantity-first') {
    return [['guaranteedCount', 'desc'], ['minimumRating', 'desc'], ['cost', 'asc']];
  }
  if (preference === 'cost-first') {
    return [['cost', 'asc'], ['minimumRating', 'desc'], ['guaranteedCount', 'desc']];
  }
  return [['minimumRating', 'desc'], ['guaranteedCount', 'desc'], ['cost', 'asc']];
}

function preferenceValue(candidate, field) {
  if (field === 'cost') return candidate.materialSink?.cost;
  return candidate.materialSink?.reward?.[field];
}

export function selectMaterialSinkCandidate(candidates = [], binding = {}) {
  const allowedClasses = Array.isArray(binding.classes) && binding.classes.length
    ? binding.classes
    : ['premium', 'baseline'];
  const allowedClassSet = new Set(allowedClasses);
  const eligible = candidates.filter((candidate) => allowedClassSet.has(candidate.materialSink?.className));
  if (!eligible.length) return { status: 'unavailable', candidate: null, matches: [] };

  const bestClass = Math.min(...eligible.map((candidate) => CLASS_RANK[candidate.materialSink.className]));
  const sameClass = eligible.filter((candidate) => CLASS_RANK[candidate.materialSink.className] === bestClass);
  const topLayer = assignMaterialSinkParetoLayers(sameClass)[0] || [];
  if (topLayer.length === 1) return { status: 'resolved', candidate: topLayer[0], matches: topLayer };

  const preference = MATERIAL_SINK_PREFERENCES.includes(binding.preference) ? binding.preference : null;
  if (!preference) return { status: 'ambiguous', candidate: null, matches: topLayer };
  const fields = preferenceFields(preference);
  const ranked = [...topLayer].sort((left, right) => {
    for (const [field, direction] of fields) {
      const compared = compareNumbers(preferenceValue(left, field), preferenceValue(right, field), direction);
      if (compared) return compared;
    }
    return Number(left.setId || 0) - Number(right.setId || 0);
  });
  return { status: 'resolved', candidate: ranked[0], matches: ranked };
}
