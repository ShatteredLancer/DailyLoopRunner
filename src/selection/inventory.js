import { createSelectionPlan, INVENTORY_PILES } from '../domain/contracts.js';
import {
  goldConsumptionOrder,
  runtimeGoldConsumptionMode,
} from '../domain/gold-consumption.js';
import { isSamePlayerCardVersion } from '../domain/player-rarity.js';

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
  if (requirement.selectionRarity === 'rare' && !item.rare) return false;
  if (requirement.selectionRarity === 'common' && item.rare) return false;
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
  if (
    isNormalGold(item)
    && Number(requirement.lowRatedGoldMaxRating || 0) > 0
    && item.rating > Number(requirement.lowRatedGoldMaxRating)
  ) {
    reasons.push(`low-rated-gold-over-${Number(requirement.lowRatedGoldMaxRating)}`);
  }
  if (
    requirement.sbcFodderPolicy?.mode === 'rating-constrained'
    && Number(requirement.ratingSbcMaxCardRating || requirement.sbcFodderPolicy.ratingSbcMaxCardRating || 0) > 0
    && item.rating > Number(requirement.ratingSbcMaxCardRating || requirement.sbcFodderPolicy.ratingSbcMaxCardRating)
  ) {
    reasons.push(`rating-sbc-card-over-${Number(requirement.ratingSbcMaxCardRating || requirement.sbcFodderPolicy.ratingSbcMaxCardRating)}`);
  }
  if (item.limitedUse) reasons.push('limited-use');
  if (item.concept) reasons.push('concept');
  if (item.academyEnrolled) reasons.push('academy-enrolled');
  if (item.endTime !== -1) reasons.push('limited-end-time');
  if (item.activeTrade) reasons.push('active-trade');
  const lockedIds = new Set([...(fsuPolicy.lockedItemIds || []), ...(fsuPolicy.lockedDefinitionIds || [])].map(Number));
  if (
    fsuPolicy.protectFsuLockedPlayers === true
    && (item.identityIds || [item.id, item.definitionId]).some((id) => lockedIds.has(Number(id)))
  ) {
    reasons.push('fsu-locked-player');
  }
  if (fsuPolicy.onlyUntradeable && item.tradeable) reasons.push('fsu-only-untradeable');
  if (fsuPolicy.excludeEvolution && item.evolution) reasons.push('fsu-exclude-evolution');
  if (fsuPolicy.excludeDesignatedLeagues && (fsuPolicy.excludedLeagueIds || []).includes(item.leagueId)) reasons.push(`fsu-excluded-league-${item.leagueId}`);
  if (isNormalGold(item) && requirement.respectFsuGoldRange !== false) {
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
  const duplicateSignalId = Number(signal.duplicateSignalId || signal.duplicateId || 0);
  if (duplicateSignalId) {
    const direct = candidates.find((item) => item.id === duplicateSignalId);
    if (direct && isSamePlayerCardVersion(signal, direct)) return direct;
  }
  return sortCandidates(candidates, requirement, fsuPolicy)
    .find((item) => isSamePlayerCardVersion(signal, item)) || null;
}

function requirementSelectionPhases(requirement = {}, hasPreferredSignals = false) {
  const mode = runtimeGoldConsumptionMode(requirement);
  const configuredOrder = goldConsumptionOrder(mode);
  if (!configuredOrder.length) return [{ requirement, preferredOnly: false }];
  const rarityOrder = configuredOrder
    .filter((rarity) => requirement.rarity === undefined || requirement.rarity === rarity);
  if (!rarityOrder.length) {
    return [{
      requirement: { ...requirement, selectionRarity: configuredOrder[0] },
      preferredOnly: false,
    }];
  }
  const fallbackMode = ['common-first', 'rare-first'].includes(mode);
  return [
    ...(hasPreferredSignals && fallbackMode ? [{ requirement, preferredOnly: true }] : []),
    ...rarityOrder.map((rarity) => ({
      requirement: { ...requirement, selectionRarity: rarity },
      preferredOnly: false,
    })),
  ];
}

export function selectInventoryPlayers(input = {}) {
  const snapshot = input.inventorySnapshot;
  if (!snapshot?.piles) throw new Error('inventorySnapshot is required');
  const requirements = input.requirements || [];
  const defaultPiles = input.priorityPiles || ['storage', 'transfer', 'club'];
  const minimumPileCounts = Object.fromEntries(
    Object.entries(input.minimumPileCounts || {})
      .map(([pile, count]) => [pile, Math.floor(Number(count))])
      .filter(([pile, count]) => INVENTORY_PILES.includes(pile) && Number.isFinite(count) && count > 0),
  );
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
  // Source counts remain useful for diagnostics, but capacity quotas apply to
  // the real entity submitted after duplicate-signal resolution.
  const quotaCounts = {};
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
    for (const phase of requirementSelectionPhases(requirement, preferredSignalRefs.length > 0)) {
      if (need <= 0) break;
      const phaseRequirement = phase.requirement;
      const pileCandidates = piles.flatMap((pileName) => {
        if (phase.preferredOnly && pileName !== 'unassigned' && pileName !== 'transfer') return [];
        const preferredRefs = pileName === 'unassigned' || pileName === 'transfer'
          ? preferredSignalRefs
          : [];
        return sortCandidates(snapshot.piles[pileName] || [], phaseRequirement, fsuPolicy, preferredRefs)
          .map((candidate) => ({ pileName, candidate }));
      });
      // Pressure Provisions must exhaust ordinary gold across every enabled
      // pile before using an explicitly authorized special card. This is a
      // path-local ordering rule; callers that do not opt in retain the
      // historical pile-first ordering.
      const orderedCandidates = input.specialFallbackAfterNormal === true
        && phaseRequirement.allowSpecial === true
        ? [
            ...pileCandidates.filter(({ candidate }) => candidate.special !== true),
            ...pileCandidates.filter(({ candidate }) => candidate.special === true),
          ]
        : pileCandidates;
      // A capacity recovery may require consuming a minimum number of cards
      // from a particular pile. Prefer that pile while its quota is unmet;
      // ordinary Loop callers omit this option and retain the existing order.
      const quotaUnmet = Object.keys(minimumPileCounts).some((pile) => (
        (quotaCounts[pile] || 0) < minimumPileCounts[pile]
      ));
      const quotaPileForCandidate = ({ pileName, candidate }) => {
        const resolved = pileName === 'unassigned' || pileName === 'transfer'
          ? (candidate.duplicateSignal || candidate.duplicate
            ? findSubmissionItem(
              candidate,
              snapshot,
              submissionIds,
              phaseRequirement,
              fsuPolicy,
              requirementProtection,
            )
            : null)
          : candidate;
        const resolvedPile = resolved?.ref?.pile || resolved?.pile;
        return Object.prototype.hasOwnProperty.call(minimumPileCounts, resolvedPile)
          ? resolvedPile
          : null;
      };
      const quotaCandidates = quotaUnmet
        ? orderedCandidates.filter((candidateEntry) => {
          const quotaPile = quotaPileForCandidate(candidateEntry);
          return quotaPile && (quotaCounts[quotaPile] || 0) < minimumPileCounts[quotaPile];
        })
        : [];
      const constrainedCandidates = quotaUnmet
        ? [
            ...quotaCandidates.map((candidateEntry) => ({ candidateEntry, quotaPhase: true })),
            // Once every quota is satisfied, resume the original ordering so
            // the quota does not change ordinary pile preference or ratings.
            ...orderedCandidates.map((candidateEntry) => ({
              candidateEntry,
              quotaPhase: false,
            })),
          ]
        : orderedCandidates.map((candidateEntry) => ({ candidateEntry, quotaPhase: false }));
      for (const { candidateEntry, quotaPhase } of constrainedCandidates) {
        const { pileName, candidate } = candidateEntry;
        if (quotaPhase) {
          const quotaPile = quotaPileForCandidate(candidateEntry);
          if (!quotaPile || (quotaCounts[quotaPile] || 0) >= minimumPileCounts[quotaPile]) continue;
        }
        if (need <= 0) break;
        if (phase.preferredOnly && !isPreferredItem(candidate, preferredSignalRefs)) continue;
        if (selectedIds.has(candidate.id) || selectedDefinitionIds.has(candidate.definitionId)) continue;
        const reasons = rejectionReasons(candidate, phaseRequirement, fsuPolicy, requirementProtection);
        if (reasons.length) {
          diagnostics.push({ pileName, itemRef: candidate.ref, reasons });
          continue;
        }

        let item = candidate;
        let signal = null;
        if (pileName === 'unassigned' || pileName === 'transfer') {
          if (!candidate.duplicateSignal && !candidate.duplicate) continue;
          item = findSubmissionItem(candidate, snapshot, submissionIds, phaseRequirement, fsuPolicy, requirementProtection);
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
        const submittedPile = item?.ref?.pile || item?.pile || pileName;
        if (INVENTORY_PILES.includes(submittedPile)) {
          quotaCounts[submittedPile] = (quotaCounts[submittedPile] || 0) + 1;
        }
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

  const minimumShortages = Object.entries(minimumPileCounts)
    .map(([pile, minimum]) => ({
      pile,
      minimum,
      selected: quotaCounts[pile] || 0,
      missing: Math.max(0, minimum - (quotaCounts[pile] || 0)),
    }))
    .filter(({ missing }) => missing > 0);
  if (minimumShortages.length) {
    const shortage = minimumShortages[0];
    return createSelectionPlan({
      ok: false,
      mode: input.mode || 'requirements',
      entries,
      selected,
      missing: {
        code: 'MINIMUM_PILE_COUNT_SHORTAGE',
        count: shortage.missing,
        pile: shortage.pile,
        minimum: shortage.minimum,
        selected: shortage.selected,
        reason: `selection requires at least ${shortage.minimum} ${shortage.pile} card(s), but only ${shortage.selected} eligible submitted card(s) were selected`,
      },
      pileCounts,
      duplicateSignals,
      diagnostics,
      details: { minimumPileCounts, quotaCounts, minimumShortages },
    });
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
