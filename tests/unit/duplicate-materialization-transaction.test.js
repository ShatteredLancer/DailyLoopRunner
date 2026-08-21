import { describe, expect, it } from 'vitest';
import {
  createDuplicateCardValueFingerprint,
  createDuplicateMaterializationTransaction,
  createDuplicateSubmissionManifest,
  duplicateTransactionAuthorizesItem,
  materializeDuplicateTransaction,
  planDuplicateMaterializationRecovery,
  validateDuplicateMaterializationState,
  transitionDuplicateMaterializationTransaction,
  validateDuplicateProtectedRestoration,
  validateDuplicateSubmissionManifest,
} from '../../src/inventory/duplicate-materialization-transaction.js';

function card(id, overrides = {}) {
  return {
    id,
    definitionId: 84119499,
    rating: 95,
    rareflag: 64,
    tradeable: false,
    pile: 'unassigned',
    playStyle: 250,
    loyaltyBonus: 1,
    preferredPosition: 18,
    attributes: [95, 92, 96, 94, 60, 80],
    groups: [19, 35],
    ...overrides,
  };
}

function plannedTransaction(overrides = {}) {
  const source = card(925789369453);
  const counterpart = card(904476902398, {
    tradeable: true,
    pile: 'club',
    playStyle: 268,
    cosmetics: [{ id: 7 }],
  });
  return createDuplicateMaterializationTransaction({
    transactionId: 'duplicate-test-1',
    challengeRef: { setId: 100, challengeId: 101 },
    beforeInventoryVersion: 8,
    pairs: [{ sourceSignal: source, protectedCounterpart: counterpart }],
    ...overrides,
  });
}

function materialize(transaction = plannedTransaction(), overrides = {}) {
  const consume = card(925789369999, { pile: 'club' });
  const protectedCard = card(904476902398, {
    tradeable: true,
    pile: 'unassigned',
    playStyle: 268,
    cosmetics: [{ id: 7 }],
  });
  return materializeDuplicateTransaction(transaction, {
    replacements: [{
      signalId: 925789369453,
      targetId: 904476902398,
      newItemId: 925789369999,
    }],
    afterInventoryVersion: 9,
    resolveItem: (id, pile) => [consume, protectedCard]
      .find((item) => item.id === id && item.pile === pile) || null,
    ...overrides,
  });
}

describe('duplicate materialization transaction', () => {
  it('keeps source and protected counterpart as different exact instances', () => {
    const transaction = plannedTransaction();
    expect(transaction.pairs[0]).toMatchObject({
      sourceSignalRef: { id: 925789369453, definitionId: 84119499, pile: 'unassigned' },
      protectedCounterpartRef: { id: 904476902398, definitionId: 84119499, pile: 'club' },
    });
    expect(transaction.pairs[0].sourceFingerprint.chemistryStyle).toBe(250);
    expect(transaction.pairs[0].counterpartFingerprint).toMatchObject({
      chemistryStyle: 268,
      cosmetics: [{ id: 7 }],
    });
  });

  it('tracks an EA-assigned materialized id without transferring authority to the old Club card', () => {
    const result = materialize();
    expect(result.ok).toBe(true);
    expect(result.transaction).toMatchObject({
      status: 'materialized',
      beforeInventoryVersion: 8,
      afterInventoryVersion: 9,
      pairs: [{
        materializedConsumeRef: { id: 925789369999, definitionId: 84119499, pile: 'club' },
        displacedProtectedRef: { id: 904476902398, definitionId: 84119499, pile: 'unassigned' },
      }],
    });
    expect(result.transaction.pairs[0].counterpartFingerprint).toMatchObject({
      chemistryStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    expect(duplicateTransactionAuthorizesItem(result.transaction, card(925789369999, { pile: 'club' }))).toBe(true);
    expect(duplicateTransactionAuthorizesItem(result.transaction, card(904476902398, { pile: 'club' }))).toBe(false);
    expect(duplicateTransactionAuthorizesItem(result.transaction, card(123, { pile: 'club' }))).toBe(false);
  });

  it.each([
    ['chemistry style', { playStyle: 250 }],
    ['cosmetic', { cosmetics: [] }],
    ['evolution', { upgrades: { evolutionId: 42 } }],
    ['rating', { rating: 96 }],
    ['rarity', { rareflag: 151 }],
  ])('rejects a protected counterpart whose %s changed', (_name, change) => {
    const result = materialize(plannedTransaction(), {
      resolveItem: (id, pile) => {
        if (id === 925789369999 && pile === 'club') return card(id, { pile });
        if (id === 904476902398 && pile === 'unassigned') {
          return card(id, {
            tradeable: true,
            pile,
            playStyle: 268,
            cosmetics: [{ id: 7 }],
            ...change,
          });
        }
        return null;
      },
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.reason).toContain('protected counterpart');
  });

  it('rejects materialization without an inventory version advance', () => {
    expect(materialize(plannedTransaction(), { afterInventoryVersion: 8 })).toEqual({
      ok: false,
      reason: 'duplicate materialization did not advance the inventory version',
    });
  });

  it('requires the replanned squad to contain A and exclude B', () => {
    const transaction = materialize().transaction;
    const ordinary = card(300, { definitionId: 300, rating: 85, rareflag: 1, pile: 'storage' });
    expect(createDuplicateSubmissionManifest({
      transaction,
      inventoryVersion: 9,
      players: [ordinary],
    })).toMatchObject({ ok: false, reason: 'replanned squad does not contain every materialized consume item' });
    expect(createDuplicateSubmissionManifest({
      transaction,
      inventoryVersion: 9,
      players: [card(925789369999, { pile: 'club' }), card(904476902398, { pile: 'unassigned' })],
    })).toMatchObject({ ok: false, reason: 'replanned squad contains a protected displaced counterpart' });

    const created = createDuplicateSubmissionManifest({
      transaction,
      inventoryVersion: 9,
      players: [card(925789369999, { pile: 'club' }), ordinary],
    });
    expect(created.ok).toBe(true);
    expect(validateDuplicateSubmissionManifest(created.manifest, [ordinary, card(925789369999, { pile: 'club' })], {
      inventoryVersion: 9,
    })).toMatchObject({ ok: true });
  });

  it('blocks saved-squad drift, same-definition substitution, protected B, and stale inventory', () => {
    const transaction = materialize().transaction;
    const ordinary = card(300, { definitionId: 300, rating: 85, rareflag: 1, pile: 'storage' });
    const { manifest } = createDuplicateSubmissionManifest({
      transaction,
      inventoryVersion: 9,
      players: [card(925789369999, { pile: 'club' }), ordinary],
    });

    expect(validateDuplicateSubmissionManifest(manifest, [card(123, { pile: 'club' }), ordinary], {
      inventoryVersion: 9,
    })).toMatchObject({ ok: false });
    expect(validateDuplicateSubmissionManifest(manifest, [card(904476902398, { pile: 'club' }), ordinary], {
      inventoryVersion: 9,
    })).toMatchObject({ ok: false });
    expect(validateDuplicateSubmissionManifest(manifest, [card(925789369999, { pile: 'club' }), ordinary], {
      inventoryVersion: 10,
    })).toEqual({
      ok: false,
      reason: 'duplicate submission inventory version changed after replanning',
    });
  });

  it('creates stable value fingerprints without pile or duplicate metadata', () => {
    expect(createDuplicateCardValueFingerprint(card(1, { pile: 'club', duplicateId: 2 })))
      .toEqual(createDuplicateCardValueFingerprint(card(9, { pile: 'unassigned', duplicateId: 10 })));
  });

  it('validates both live sides against the materialized inventory version', () => {
    const transaction = materialize().transaction;
    const consume = card(925789369999, { pile: 'club' });
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 'unassigned',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    const resolveItem = (id, pile) => [consume, protectedCard]
      .find((item) => item.id === id && item.pile === pile) || null;

    expect(validateDuplicateMaterializationState(transaction, {
      inventoryVersion: 9,
      resolveItem,
    })).toEqual({ ok: true });
    expect(validateDuplicateMaterializationState(transaction, {
      inventoryVersion: 10,
      resolveItem,
    })).toEqual({
      ok: false,
      reason: 'duplicate materialization inventory version changed before replanning',
    });
  });

  it('requires the protected counterpart to return unchanged to Club after submission', () => {
    const transaction = transitionDuplicateMaterializationTransaction(
      materialize().transaction,
      'submission-confirmed',
    );
    const restored = card(904476902398, {
      tradeable: true,
      pile: 'club',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    expect(validateDuplicateProtectedRestoration(transaction, {
      resolveItem: (id, pile) => id === restored.id && pile === restored.pile ? restored : null,
    })).toEqual({ ok: true });
    restored.playStyle = 250;
    expect(validateDuplicateProtectedRestoration(transaction, {
      resolveItem: () => restored,
    })).toMatchObject({ ok: false });
  });

  it('clears a planned journal only when A and B are untouched at their exact piles', () => {
    const transaction = plannedTransaction();
    const source = card(925789369453, { pile: 'unassigned' });
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 'club',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => [source, protectedCard].find((item) => item.id === id) || null,
    })).toEqual({ ok: true, action: 'clear' });
  });

  it('rolls back a materialized journal only from exact A-in-Club and B-in-Unassigned state', () => {
    const transaction = materialize().transaction;
    const consume = card(925789369999, { pile: 'club' });
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 'unassigned',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => [consume, protectedCard].find((item) => item.id === id) || null,
    })).toEqual({ ok: true, action: 'rollback' });
  });

  it('restores B after a confirmed submission without guessing a missing A identity', () => {
    const transaction = transitionDuplicateMaterializationTransaction(
      materialize().transaction,
      'submission-confirmed',
    );
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 'unassigned',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => id === protectedCard.id ? protectedCard : null,
    })).toEqual({ ok: true, action: 'restore-confirmed' });
  });

  it('fails closed when A disappears before submission is confirmed', () => {
    const transaction = materialize().transaction;
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 'unassigned',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => id === protectedCard.id ? protectedCard : null,
    })).toEqual({ ok: true, action: 'restore-ambiguous' });
  });

  it('does not recover through a same-definition substitute or changed B value identity', () => {
    const transaction = materialize().transaction;
    const sameDefinitionSubstitute = card(123, { pile: 'club' });
    const changedProtected = card(904476902398, {
      tradeable: true,
      pile: 'unassigned',
      playStyle: 250,
      cosmetics: [{ id: 7 }],
    });
    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => id === 925789369999 ? sameDefinitionSubstitute : changedProtected,
    })).toMatchObject({ ok: false, action: 'block' });
  });
});
