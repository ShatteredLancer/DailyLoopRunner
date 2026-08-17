import { isSamePlayerCardVersion } from '../domain/player-rarity.js';

function positiveId(value) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

export function classifyUnassignedDuplicateIdentity(item = {}, clubItems = []) {
  const itemId = positiveId(item.id || item.ref?.id);
  const duplicateId = positiveId(item.duplicateId);
  const candidates = (clubItems || []).filter((candidate) => (
    positiveId(candidate?.id || candidate?.ref?.id) !== itemId
  ));

  if (duplicateId) {
    const direct = candidates.find((candidate) => (
      positiveId(candidate?.id || candidate?.ref?.id) === duplicateId
      && isSamePlayerCardVersion(item, candidate)
    ));
    if (direct) {
      return Object.freeze({
        duplicate: true,
        duplicateId,
        evidence: 'exact-club-id',
      });
    }
  }

  const matching = candidates.find((candidate) => (
    positiveId(candidate?.id || candidate?.ref?.id) > 0
    && isSamePlayerCardVersion(item, candidate)
  ));
  if (matching) {
    return Object.freeze({
      duplicate: true,
      duplicateId: positiveId(matching.id || matching.ref?.id),
      evidence: 'same-version-club',
    });
  }

  return Object.freeze({
    duplicate: false,
    duplicateId: 0,
    evidence: 'no-club-counterpart',
  });
}
