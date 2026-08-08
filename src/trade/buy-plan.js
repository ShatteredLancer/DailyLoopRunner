import { assertValidTradeJob } from './contracts.js';
import { matchesTradeCardClass } from './listing-plan.js';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function rotate(values, offset) {
  if (!values.length) return [];
  const index = Math.abs(Math.floor(Number(offset) || 0)) % values.length;
  return [...values.slice(index), ...values.slice(0, index)];
}

function ratingLimit(policy, rating) {
  const override = Number(policy.ratingPriceOverrides?.[String(rating)]);
  return Number.isFinite(override) && override > 0 ? override : Number(policy.maxBuyNow);
}

export function buildBuyLanePlan(input = {}) {
  const job = input.job;
  assertValidTradeJob(job, 'Buy job');
  if (job.type !== 'buy') throw new Error('Buy job.type must be buy');
  const catalog = input.catalog || {};
  const runId = String(input.runId || job.id);
  const laneMap = new Map((catalog.lanes || []).map((lane) => [Number(lane.rating), lane]));
  const lanes = [];
  const missingRatings = [];
  for (let rating = Number(job.policy.ratingMin); rating <= Number(job.policy.ratingMax); rating += 1) {
    const lane = laneMap.get(rating);
    const ids = [...new Set((lane?.definitionIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
    if (!ids.length) {
      missingRatings.push(rating);
      continue;
    }
    lanes.push({
      rating,
      maxBuyNow: ratingLimit(job.policy, rating),
      definitionIds: rotate(ids, stableHash(`${runId}:${rating}`)),
      source: String(lane.source || 'catalog'),
      expiresAt: Number.isFinite(Number(lane.expiresAt)) ? Number(lane.expiresAt) : null,
    });
  }
  const orderedLanes = rotate(lanes, stableHash(`${runId}:lanes`));
  return {
    schemaVersion: 1,
    ready: missingRatings.length === 0 && orderedLanes.length > 0,
    job: { id: job.id, name: job.name, type: job.type },
    cardClass: job.policy.cardClass,
    lanes: orderedLanes,
    missingRatings,
    cursor: { laneIndex: 0, definitionIndexes: Object.fromEntries(orderedLanes.map((lane) => [lane.rating, 0])) },
  };
}

export function nextBuySearch(lanePlan = {}, cursorInput = null) {
  const lanes = lanePlan.lanes || [];
  if (lanePlan.ready !== true || !lanes.length) return { search: null, cursor: cursorInput || lanePlan.cursor || null };
  const cursor = {
    laneIndex: Math.max(0, Math.floor(finiteNumber(cursorInput?.laneIndex, lanePlan.cursor?.laneIndex))),
    definitionIndexes: { ...(lanePlan.cursor?.definitionIndexes || {}), ...(cursorInput?.definitionIndexes || {}) },
  };
  const laneIndex = cursor.laneIndex % lanes.length;
  const lane = lanes[laneIndex];
  const definitionIndex = Math.max(0, Math.floor(finiteNumber(cursor.definitionIndexes[lane.rating]))) % lane.definitionIds.length;
  const search = {
    laneIndex,
    rating: lane.rating,
    definitionIndex,
    definitionId: lane.definitionIds[definitionIndex],
    maxBuyNow: lane.maxBuyNow,
  };
  cursor.definitionIndexes[lane.rating] = (definitionIndex + 1) % lane.definitionIds.length;
  cursor.laneIndex = (laneIndex + 1) % lanes.length;
  return { search, cursor };
}

export function buyCandidateRejection(candidate = {}, search = {}, job = {}, limits = {}) {
  if (String(candidate.type || '').toLowerCase() !== 'player') return 'not-player';
  if (Number(candidate.item?.definitionId) !== Number(search.definitionId)) return 'definition-mismatch';
  if (Number(candidate.rating) !== Number(search.rating)) return 'rating-mismatch';
  if (!matchesTradeCardClass(candidate, job.policy?.cardClass)) return 'card-class-mismatch';
  const auction = candidate.auction || {};
  if (auction.present !== true || auction.state !== 'active') return 'auction-not-active';
  if (!Number.isFinite(Number(auction.tradeId)) || Number(auction.tradeId) <= 0) return 'missing-trade-id';
  const buyNow = Number(auction.buyNowPrice);
  if (!Number.isFinite(buyNow) || buyNow <= 0) return 'invalid-buy-now';
  if (buyNow > Number(search.maxBuyNow)) return 'rating-price-limit';
  if (Number.isFinite(Number(limits.remainingBudget)) && buyNow > Number(limits.remainingBudget)) return 'remaining-budget';
  if (Number.isFinite(Number(limits.coins)) && buyNow > Number(limits.coins)) return 'insufficient-coins';
  return null;
}

export function selectBuyCandidate(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const rejectionCounts = {};
  const eligible = [];
  for (const candidate of candidates) {
    const reason = buyCandidateRejection(candidate, input.search, input.job, input.limits);
    if (reason) rejectionCounts[reason] = Number(rejectionCounts[reason] || 0) + 1;
    else eligible.push(candidate);
  }
  eligible.sort((left, right) => (
    Number(left.auction.buyNowPrice) - Number(right.auction.buyNowPrice)
    || finiteNumber(left.auction.expires, Number.POSITIVE_INFINITY) - finiteNumber(right.auction.expires, Number.POSITIVE_INFINITY)
    || Number(left.auction.tradeId) - Number(right.auction.tradeId)
  ));
  return {
    selected: eligible[0] || null,
    eligibleCount: eligible.length,
    rejectedCount: candidates.length - eligible.length,
    rejectionCounts,
  };
}
