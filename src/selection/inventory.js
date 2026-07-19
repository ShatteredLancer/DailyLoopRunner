import { createSelectionPlan, INVENTORY_PILES } from '../domain/contracts.js';

function numberSet(values = []) {
  return new Set((values || []).map(Number).filter((value) => Number.isFinite(value) && value > 0));
}

function preferredItemRefs(refs = []) {
  return (refs || []).map((ref) => ({
    id: Number(ref?.id || 0),
    definitionId: Number(ref?.definitionId || 0),
  }));
}

function isPreferredItem(item, preferredRefs) {
  const id = Number(item?.id || item?.ref?.id || 0);
  const definitionId = Number(item?.definitionId || item?.ref?.definitionId || 0);
  return preferredRefs.some((ref) => ref.id ? ref.id === id : ref.definitionId > 0 && ref.definitionId === definitionId);
}

function applyPilePriority(piles = [], fsuPolicy = {}) {
  if (!fsuPolicy.priorityStoragePlayers || !piles.includes('storage')) return [...piles];
  const pinned = piles[0] === 'unassigned' ? ['unassigned'] : [];
  const rest = piles.filter((pile) => !pinned.includes(pile) && pile !== 'storage');
  return [...pinned, 'storage', ...rest];
}

function isNormalGold(item) {
  return item.tier === 'gold' && !item.special;
}

export function resolveHighGoldThreshold(requirement = {}) {
  const raw = requirement.highGoldThreshold ?? requirement.protectHighGoldMinRating ?? 82;
  const value = Number(raw);
  return Math.max(2, Math.min(99, Number.isFinite(value) && value > 0 ? value : 82));
}

function itemMatchesRequirement(item, requirement = {}) {
  if (requirement.playerOnly && item.type !== 'player') return false;
  if (requirement.minRating !== undefined && item.rating < Number(requirement.minRating)) return false;
  if (requirement.maxRating !== undefined && item.rating > Number(requirement.maxRating)) return false;
  if (requirement.blockTradeable === true && item.tradeable && !isNormalGold(item)) return false;
  if (requirement.special === true && !item.special) return false;
  if (requirement.special === false && item.special) return false;
  if (requirement.special !== true && requirement.allowSpecial !== true && item.special) return false;
  if (requirement.tier && item.tier !== requirement.tier) return false;
  if (requirement.rarity === 'rare' && !item.rare) return false;
  if (requirement.rarity === 'common' && item.rare) return false;
  return true;
}

function rejectionReasons(item, requirement, fsuPolicy, protection) {
  const reasons = [];
  if (item.type !== 'player') reasons.push('not-player');
  if (protection.consumedItemIds.has(item.id)) reasons.push('consumed-item');
  if (protection.protectedItemIds.has(item.id)) reasons.push('protected-item');
  if (protection.protectedDefinitionIds.has(item.definitionId)) reasons.push('protected-definition');
  if (requirement.protectHighGold && item.tier === 'gold' && item.rating >= resolveHighGoldThreshold(requirement)) {
    reasons.push('protected-high-gold');
  }
  if (item.limitedUse) reasons.push('limited-use');
  if (item.concept) reasons.push('concept');
  if (item.academyEnrolled) reasons.push('academy-enrolled');
  if (item.endTime !== -1) reasons.push('limited-end-time');
  if (item.activeTrade) reasons.push('active-trade');
  const lockedIds = new Set([...(fsuPolicy.lockedItemIds || []), ...(fsuPolicy.lockedDefinitionIds || [])].map(Number));
  if ((item.identityIds || [item.id, item.definitionId]).some((id) => lockedIds.has(Number(id)))) reasons.push('fsu-locked-player');
  if (fsuPolicy.onlyUntradeable && item.tradeable) reasons.push('fsu-only-untradeable');
  if (fsuPolicy.excludeEvolution && item.evolution) reasons.push('fsu-exclude-evolution');
  if (fsuPolicy.excludeDesignatedLeagues && (fsuPolicy.excludedLeagueIds || []).includes(item.leagueId)) reasons.push(`fsu-excluded-league-${item.leagueId}`);
  if (isNormalGold(item)) {
    const [minRating = 75, maxRating = 83] = fsuPolicy.goldRange || [75, 83];
    if (item.rating < Number(minRating) || item.rating > Number(maxRating)) reasons.push(`fsu-gold-range-${minRating}-${maxRating}`);
  }
  if (fsuPolicy.useRarityPlayer === false && requirement.special !== true && requirement.allowSpecial !== true && item.special) reasons.push('fsu-rarity-player-off');
  if (!itemMatchesRequirement(item, requirement)) reasons.push('requirement-mismatch');
  return reasons;
}

function sortCandidates(items, requirement, fsuPolicy, preferredRefs = []) {
  return [...items].sort((a, b) => {
    const aPreferred = isPreferredItem(a, preferredRefs);
    const bPreferred = isPreferredItem(b, preferredRefs);
    if (aPreferred !== bPreferred) return Number(bPreferred) - Number(aPreferred);
    if (fsuPolicy.priorityNonSpecialPlayers && a.special !== b.special) return Number(a.special) - Number(b.special);
    const [minRating = 75, maxRating = 83] = fsuPolicy.goldRange || [75, 83];
    const aGoldRange = a.tier === 'gold' && a.rating >= minRating && a.rating <= maxRating;
    const bGoldRange = b.tier === 'gold' && b.rating >= minRating && b.rating <= maxRating;
    if (fsuPolicy.priorityRareWithinGoldRange && requirement.rarity === undefined && aGoldRange && bGoldRange && a.rare !== b.rare) {
      return Number(b.rare) - Number(a.rare);
    }
    const aLowTier = a.tier === 'bronze' || a.tier === 'silver';
    const bLowTier = b.tier === 'bronze' || b.tier === 'silver';
    if (fsuPolicy.silverBronzePrioritizeNormal && aLowTier && bLowTier && a.rare !== b.rare) return Number(a.rare) - Number(b.rare);
    return a.rating - b.rating || Number(a.rare) - Number(b.rare) || a.id - b.id;
  });
}

function findSubmissionItem(signal, snapshot, usedIds, requirement, fsuPolicy, protection) {
  const candidates = [...snapshot.piles.storage, ...snapshot.piles.club]
    .filter((item) => !usedIds.has(item.id) && rejectionReasons(item, requirement, fsuPolicy, protection).length === 0);
  if (signal.duplicateId) {
    const direct = candidates.find((item) => item.id === signal.duplicateId);
    if (direct) return direct;
  }
  return sortCandidates(candidates, requirement, fsuPolicy).find((item) => item.definitionId === signal.definitionId) || null;
}

export function selectInventoryPlayers(input = {}) {
  const snapshot = input.inventorySnapshot;
  if (!snapshot?.piles) throw new Error('inventorySnapshot is required');
  const requirements = input.requirements || [];
  const defaultPiles = input.priorityPiles || ['storage', 'transfer', 'club'];
  const fsuPolicy = input.fsuPolicy || {};
  const protection = {
    consumedItemIds: numberSet(input.consumedItemIds),
    protectedItemIds: numberSet(input.protectedItemIds),
    protectedDefinitionIds: numberSet(input.protectedDefinitionIds),
  };
  const selectedIds = new Set();
  const selectedDefinitionIds = new Set();
  const submissionIds = new Set();
  const selected = [];
  const entries = [];
  const pileCounts = {};
  const duplicateSignals = [];
  const diagnostics = [];
  const preferredSignalRefs = preferredItemRefs(input.preferredSignalRefs);

  for (const requirement of requirements) {
    let need = Number(requirement.count || 0);
    const requirementProtection = {
      consumedItemIds: protection.consumedItemIds,
      protectedItemIds: new Set([...protection.protectedItemIds, ...numberSet(requirement.protectedItemIds)]),
      protectedDefinitionIds: new Set([...protection.protectedDefinitionIds, ...numberSet(requirement.protectedDefinitionIds)]),
    };
    const piles = applyPilePriority(requirement.priorityPiles || defaultPiles, fsuPolicy)
      .filter((pile) => INVENTORY_PILES.includes(pile));
    for (const pileName of piles) {
      if (need <= 0) break;
      const preferredRefs = pileName === 'unassigned' || pileName === 'transfer'
        ? preferredSignalRefs
        : [];
      const candidates = sortCandidates(snapshot.piles[pileName] || [], requirement, fsuPolicy, preferredRefs);
      for (const candidate of candidates) {
        if (need <= 0) break;
        if (selectedIds.has(candidate.id) || selectedDefinitionIds.has(candidate.definitionId)) continue;
        const reasons = rejectionReasons(candidate, requirement, fsuPolicy, requirementProtection);
        if (reasons.length) {
          diagnostics.push({ pileName, itemRef: candidate.ref, reasons });
          continue;
        }

        let item = candidate;
        let signal = null;
        if (pileName === 'unassigned' || pileName === 'transfer') {
          if (!candidate.duplicate) continue;
          item = findSubmissionItem(candidate, snapshot, submissionIds, requirement, fsuPolicy, requirementProtection);
          if (!item || selectedDefinitionIds.has(item.definitionId)) continue;
          signal = candidate;
          duplicateSignals.push({ pileName, signalRef: signal.ref, itemRef: item.ref });
          selectedIds.add(signal.id);
        }

        if (submissionIds.has(item.id) || selectedIds.has(item.id) || selectedDefinitionIds.has(item.definitionId)) continue;
        selectedIds.add(item.id);
        selectedDefinitionIds.add(item.definitionId);
        submissionIds.add(item.id);
        selected.push(item);
        entries.push({ pileName, signalRef: signal?.ref || null, itemRef: item.ref });
        pileCounts[pileName] = (pileCounts[pileName] || 0) + 1;
        need--;
      }
    }

    if (need > 0) {
      return createSelectionPlan({
        ok: false,
        mode: input.mode || 'requirements',
        entries,
        selected,
        missing: { ...requirement, count: need },
        pileCounts,
        duplicateSignals,
        diagnostics,
      });
    }
  }

  return createSelectionPlan({
    ok: true,
    mode: input.mode || 'requirements',
    entries,
    selected,
    missing: null,
    pileCounts,
    duplicateSignals,
    diagnostics,
  });
}
