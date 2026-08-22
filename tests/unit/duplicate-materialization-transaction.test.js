import { describe, expect, it } from 'vitest';
import {
  createDuplicateCardValueFingerprint,
  createDuplicateMaterializationTransaction,
  createDuplicateSubmissionManifest,
  diffDuplicateCardValueFingerprint,
  duplicateTransactionAuthorizesItem,
  materializeDuplicateTransaction,
  materializeDuplicateTransactionPair,
  planDuplicateMaterializationRecovery,
  planDuplicateStartupCancellation,
  validateDuplicateMaterializationLedgerPair,
  validateDuplicateMaterializationLedgerState,
  updateDuplicateMaterializationInventoryVersion,
  validateDuplicateMaterializationState,
  transitionDuplicateMaterializationTransaction,
  validateDuplicateProtectedRestoration,
  validateDuplicateProtectedRestorationLedger,
  validateDuplicateRollbackLedgerState,
  validateDuplicateSubmissionManifest,
  validateDuplicateTransactionReplanSwapPlan,
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

function untradeableCounterpartTransaction() {
  return createDuplicateMaterializationTransaction({
    transactionId: 'duplicate-untradeable-counterpart',
    challengeRef: { setId: 100, challengeId: 101 },
    beforeInventoryVersion: 20,
    pairs: [{
      sourceSignal: card(501, { pile: 'unassigned', playStyle: 250 }),
      protectedCounterpart: card(601, {
        pile: 'club',
        tradeable: false,
        playStyle: 268,
        cosmetics: [{ id: 11 }],
      }),
    }],
  });
}

describe('duplicate materialization transaction', () => {
  it('accepts only the exact reverse duplicate signal created by the active transaction', () => {
    const source = card(101, { definitionId: 7001, pile: 'unassigned' });
    const counterpart = card(102, { definitionId: 7001, pile: 'club' });
    const consume = card(103, { definitionId: 7001, pile: 'club' });
    const displaced = card(102, { definitionId: 7001, pile: 'unassigned' });
    const planned = createDuplicateMaterializationTransaction({
      transactionId: 'tx-reverse-signal',
      challengeRef: { setId: 500, challengeId: 501 },
      beforeInventoryVersion: 8,
      pairs: [{ sourceSignal: source, protectedCounterpart: counterpart }],
    });
    const materialized = materializeDuplicateTransaction(planned, {
      replacements: [{ signalId: 101, targetId: 102, newItemId: 103 }],
      afterInventoryVersion: 9,
      resolveItem: (id, pile) => [consume, displaced]
        .find((item) => item.id === id && item.pile === pile) || null,
    }).transaction;

    expect(validateDuplicateTransactionReplanSwapPlan(materialized, [{
      signalId: 102,
      targetId: 103,
      definitionId: 7001,
    }])).toMatchObject({ ok: true, matchedSwapCount: 1 });
    expect(validateDuplicateTransactionReplanSwapPlan(materialized, [{
      signalId: 102,
      targetId: 999,
      definitionId: 7001,
    }])).toMatchObject({ ok: false });
    expect(validateDuplicateTransactionReplanSwapPlan(materialized, [{
      signalId: 999,
      targetId: 103,
      definitionId: 7001,
    }])).toMatchObject({ ok: false });
  });

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

  it('persists exact partial progress and recovers only after untouched and swapped pairs agree', () => {
    const sourceA = card(101, { definitionId: 501 });
    const targetA = card(201, { definitionId: 501, pile: 'club', playStyle: 268 });
    const sourceB = card(102, { definitionId: 502 });
    const targetB = card(202, { definitionId: 502, pile: 'club', playStyle: 269 });
    const planned = createDuplicateMaterializationTransaction({
      transactionId: 'duplicate-partial',
      challengeRef: { setId: 100, challengeId: 101 },
      beforeInventoryVersion: 30,
      pairs: [
        { sourceSignal: sourceA, protectedCounterpart: targetA },
        { sourceSignal: sourceB, protectedCounterpart: targetB },
      ],
    });
    const consumeA = card(301, { definitionId: 501, pile: 'club' });
    const displacedA = card(201, { definitionId: 501, pile: 'unassigned', playStyle: 268 });
    const progressed = materializeDuplicateTransactionPair(planned, {
      replacement: { signalId: 101, targetId: 201, newItemId: 301 },
      afterInventoryVersion: 31,
      resolveItem: (id, pile) => [consumeA, displacedA]
        .find((item) => item.id === id && item.pile === pile) || null,
    });

    expect(progressed).toMatchObject({
      ok: true,
      transaction: {
        status: 'planned',
        afterInventoryVersion: 31,
        pairs: [
          {
            materializedConsumeRef: { id: 301, definitionId: 501, pile: 'club' },
            displacedProtectedRef: { id: 201, definitionId: 501, pile: 'unassigned' },
          },
          { materializedConsumeRef: null, displacedProtectedRef: null },
        ],
      },
    });
    expect(planDuplicateMaterializationRecovery(progressed.transaction, {
      resolveItem: (id) => [consumeA, displacedA, sourceB, targetB].find((item) => item.id === id) || null,
    })).toEqual({ ok: true, action: 'rollback-partial' });

    const changedTarget = { ...targetB, playStyle: 250 };
    expect(planDuplicateMaterializationRecovery(progressed.transaction, {
      resolveItem: (id) => [consumeA, displacedA, sourceB, changedTarget].find((item) => item.id === id) || null,
    })).toMatchObject({ ok: false, action: 'block' });
  });

  it('records a pair from authoritative EA entities before a normalized Ledger refresh', () => {
    const planned = plannedTransaction();
    const consume = card(925789369999, { pile: 'club' });
    const displaced = card(904476902398, {
      tradeable: true,
      pile: 'unassigned',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    const progressed = materializeDuplicateTransactionPair(planned, {
      replacement: { signalId: 925789369453, targetId: 904476902398, newItemId: 925789369999 },
      resolveItem: (id, pile) => id === consume.id && pile === 'club'
        ? { item: consume, pileName: 'club' }
        : id === displaced.id && pile === 'unassigned'
          ? { item: displaced, pileName: 'unassigned' }
          : null,
    });

    expect(progressed.ok).toBe(true);
    expect(validateDuplicateMaterializationLedgerPair(progressed.transaction, 925789369453, {
      resolveItem: (id) => id === consume.id
        ? { id: consume.id, definitionId: consume.definitionId, pile: 'club' }
        : { id: displaced.id, definitionId: displaced.definitionId, pile: 'unassigned' },
    })).toEqual({ ok: true });
  });

  it.each([
    ['wrong consume pile', { consume: { pile: 'unassigned' } }],
    ['wrong protected identity', { protectedCard: { id: 999 } }],
    ['wrong protected pile', { protectedCard: { pile: 'club' } }],
  ])('fails Ledger pair verification for %s', (_name, override) => {
    const transaction = materialize().transaction;
    const consume = { id: 925789369999, definitionId: 84119499, pile: 'club', ...override.consume };
    const protectedCard = { id: 904476902398, definitionId: 84119499, pile: 'unassigned', ...override.protectedCard };
    expect(validateDuplicateMaterializationLedgerPair(transaction, 925789369453, {
      resolveItem: (id) => id === consume.id ? consume : protectedCard,
    })).toMatchObject({ ok: false });
  });

  it('updates the journal version after reconciliation without changing pair identities', () => {
    const transaction = materialize().transaction;
    const updated = updateDuplicateMaterializationInventoryVersion(transaction, 12);
    expect(updated).toMatchObject({
      ok: true,
      transaction: {
        afterInventoryVersion: 12,
        pairs: transaction.pairs,
      },
    });
    expect(updateDuplicateMaterializationInventoryVersion(updated.transaction, 11))
      .toEqual({ ok: true, transaction: updated.transaction });
  });

  it('protects an untradeable Club counterpart through swap, submission, and restoration', () => {
    const planned = untradeableCounterpartTransaction();
    const materializedConsume = card(701, { pile: 'club', tradeable: false, playStyle: 250 });
    const displacedProtected = card(601, {
      pile: 'unassigned',
      tradeable: false,
      playStyle: 268,
      cosmetics: [{ id: 11 }],
    });
    const result = materializeDuplicateTransaction(planned, {
      replacements: [{ signalId: 501, targetId: 601, newItemId: 701 }],
      afterInventoryVersion: 21,
      resolveItem: (id, pile) => [materializedConsume, displacedProtected]
        .find((item) => item.id === id && item.pile === pile) || null,
    });

    expect(result.ok).toBe(true);
    expect(result.transaction.pairs[0].counterpartFingerprint).toMatchObject({
      tradeable: false,
      chemistryStyle: 268,
      cosmetics: [{ id: 11 }],
    });
    expect(duplicateTransactionAuthorizesItem(result.transaction, materializedConsume)).toBe(true);
    expect(duplicateTransactionAuthorizesItem(result.transaction, card(701, {
      pile: 'unassigned',
      tradeable: false,
      playStyle: 250,
    }))).toBe(false);
    expect(duplicateTransactionAuthorizesItem(result.transaction, card(701, {
      pile: 'club',
      tradeable: false,
      playStyle: 268,
    }))).toBe(false);
    expect(duplicateTransactionAuthorizesItem(result.transaction, card(601, {
      pile: 'club',
      tradeable: false,
      playStyle: 268,
      cosmetics: [{ id: 11 }],
    }))).toBe(false);

    const ordinary = card(801, { definitionId: 801, rating: 85, rareflag: 1, pile: 'club' });
    expect(createDuplicateSubmissionManifest({
      transaction: result.transaction,
      inventoryVersion: 21,
      players: [card(601, {
        pile: 'club',
        tradeable: false,
        playStyle: 268,
        cosmetics: [{ id: 11 }],
      }), ordinary],
    })).toMatchObject({
      ok: false,
      reason: 'replanned squad does not contain every materialized consume item',
    });

    expect(createDuplicateSubmissionManifest({
      transaction: result.transaction,
      inventoryVersion: 21,
      players: [materializedConsume, card(601, {
        pile: 'club',
        tradeable: false,
        playStyle: 268,
        cosmetics: [{ id: 11 }],
      })],
    })).toEqual({
      ok: false,
      reason: 'replanned squad contains a protected displaced counterpart',
    });

    const created = createDuplicateSubmissionManifest({
      transaction: result.transaction,
      inventoryVersion: 21,
      players: [materializedConsume, ordinary],
    });
    expect(created.ok).toBe(true);
    expect(validateDuplicateSubmissionManifest(created.manifest, [
      card(601, {
        pile: 'club',
        tradeable: false,
        playStyle: 268,
        cosmetics: [{ id: 11 }],
      }),
      ordinary,
    ], { inventoryVersion: 21 })).toMatchObject({ ok: false });

    const confirmed = transitionDuplicateMaterializationTransaction(
      result.transaction,
      'submission-confirmed',
    );
    const restoredProtected = card(601, {
      pile: 'club',
      tradeable: false,
      playStyle: 268,
      cosmetics: [{ id: 11 }],
    });
    expect(validateDuplicateProtectedRestoration(confirmed, {
      resolveItem: (id, pile) => (
        id === restoredProtected.id && pile === restoredProtected.pile
          ? restoredProtected
          : null
      ),
    })).toEqual({ ok: true });
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

  it('ignores EA pile-local loyalty normalization in persistent value fingerprints', () => {
    expect(createDuplicateCardValueFingerprint(card(1, { pile: 'unassigned', loyaltyBonus: 1 })))
      .toEqual(createDuplicateCardValueFingerprint(card(1, { pile: 'storage', loyaltyBonus: 0 })));
  });

  it('reports exact value-fingerprint fields that changed', () => {
    const expected = card(1, { pile: 'unassigned' });
    const actual = card(1, {
      pile: 'storage',
      playStyle: 268,
      groups: [4, 19, 35],
    });

    expect(diffDuplicateCardValueFingerprint(expected, actual)).toMatchObject({
      changedFields: ['chemistryStyle', 'groups'],
      expected: { chemistryStyle: 250, groups: [19, 35] },
      actual: { chemistryStyle: 268, groups: [4, 19, 35] },
    });
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

  it('validates a materialized transaction from normalized Ledger identity without full EA value fields', () => {
    const transaction = materialize().transaction;
    const consumeSnapshot = {
      id: 925789369999,
      definitionId: 84119499,
      pile: 'club',
      rating: 95,
      tradeable: false,
    };
    const protectedSnapshot = {
      id: 904476902398,
      definitionId: 84119499,
      pile: 'unassigned',
      rating: 95,
      tradeable: true,
    };
    const resolveItem = (id) => [consumeSnapshot, protectedSnapshot]
      .find((item) => item.id === id) || null;

    expect(validateDuplicateMaterializationLedgerState(transaction, {
      inventoryVersion: 10,
      resolveItem,
    })).toEqual({ ok: true });
    expect(validateDuplicateMaterializationLedgerState(transaction, {
      inventoryVersion: 8,
      resolveItem,
    })).toEqual({
      ok: false,
      reason: 'duplicate materialization Ledger is older than the materialized inventory version',
    });
    protectedSnapshot.pile = 'club';
    expect(validateDuplicateMaterializationLedgerState(transaction, {
      inventoryVersion: 10,
      resolveItem,
    })).toMatchObject({
      ok: false,
      reason: 'protected counterpart #904476902398 did not reconcile in Unassigned',
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

  it('uses normalized Ledger identity for post-move restoration and rollback checks', () => {
    const transaction = transitionDuplicateMaterializationTransaction(
      materialize().transaction,
      'recovery-required',
    );
    const restored = {
      id: 904476902398,
      definitionId: 84119499,
      pile: 'club',
    };
    const rolledBackConsume = {
      id: 925789369999,
      definitionId: 84119499,
      pile: 'unassigned',
    };
    const resolveItem = (id) => [restored, rolledBackConsume].find((item) => item.id === id) || null;

    expect(validateDuplicateProtectedRestorationLedger(transaction, { resolveItem })).toEqual({ ok: true });
    expect(validateDuplicateRollbackLedgerState(transaction, { resolveItem })).toEqual({ ok: true });
    restored.definitionId = 123;
    expect(validateDuplicateProtectedRestorationLedger(transaction, { resolveItem })).toMatchObject({
      ok: false,
      reason: 'protected counterpart #904476902398 did not reconcile in Club',
    });
  });

  it.each([
    ['club', 'clear'],
    ['unassigned', 'restore-and-clear'],
    ['storage', 'clear'],
    ['transfer', 'clear'],
    ['missing', 'clear'],
  ])('classifies a prior-run protected ID in %s for startup cancellation', (pile, action) => {
    const transaction = plannedTransaction();
    const protectedCard = pile === 'missing'
      ? null
      : card(904476902398, { pile });

    expect(planDuplicateStartupCancellation(transaction, {
      resolveItem: () => protectedCard,
    })).toMatchObject({
      ok: true,
      action,
      states: [{ ref: { id: 904476902398 }, state: pile }],
    });
  });

  it('classifies every pair independently when startup inventory is mixed', () => {
    const transaction = createDuplicateMaterializationTransaction({
      transactionId: 'startup-mixed',
      challengeRef: { setId: 100, challengeId: 101 },
      pairs: [
        {
          sourceSignal: card(101, { definitionId: 7001 }),
          protectedCounterpart: card(102, { definitionId: 7001, pile: 'club' }),
        },
        {
          sourceSignal: card(201, { definitionId: 7002 }),
          protectedCounterpart: card(202, { definitionId: 7002, pile: 'club' }),
        },
        {
          sourceSignal: card(301, { definitionId: 7003 }),
          protectedCounterpart: card(302, { definitionId: 7003, pile: 'club' }),
        },
        {
          sourceSignal: card(401, { definitionId: 7004 }),
          protectedCounterpart: card(402, { definitionId: 7004, pile: 'club' }),
        },
      ],
    });
    const items = [
      card(102, { definitionId: 7001, pile: 'club' }),
      card(202, { definitionId: 7002, pile: 'unassigned' }),
      card(302, { definitionId: 7003, pile: 'storage' }),
    ];
    const result = planDuplicateStartupCancellation(transaction, {
      resolveItem: (id) => items.find((item) => item.id === id) || null,
    });

    expect(result).toMatchObject({
      ok: true,
      action: 'restore-and-clear',
      restoreRefs: [{ id: 202, definitionId: 7002 }],
      states: [
        { ref: { id: 102 }, state: 'club' },
        { ref: { id: 202 }, state: 'unassigned' },
        { ref: { id: 302 }, state: 'storage' },
        { ref: { id: 402 }, state: 'missing' },
      ],
    });
  });

  it('keeps exact item ID authoritative when its definition changed between runs', () => {
    const transaction = plannedTransaction();
    const changed = card(904476902398, { definitionId: 999, pile: 'unassigned' });

    expect(planDuplicateStartupCancellation(transaction, {
      resolveItem: () => changed,
    })).toMatchObject({
      ok: true,
      action: 'restore-and-clear',
      states: [{
        state: 'unassigned',
        actualDefinitionId: 999,
        definitionChanged: true,
      }],
    });
  });

  it('blocks startup cancellation when a resolver returns the wrong item for a protected ID', () => {
    const transaction = plannedTransaction();

    expect(planDuplicateStartupCancellation(transaction, {
      resolveItem: () => card(123, { pile: 'club' }),
    })).toMatchObject({
      ok: false,
      action: 'block-untrusted',
      states: [{ state: 'identity-mismatch' }],
    });
  });

  it('blocks startup cancellation when protected identity resolution throws', () => {
    const transaction = plannedTransaction();

    expect(planDuplicateStartupCancellation(transaction, {
      resolveItem: () => { throw new Error('ledger read failed'); },
    })).toMatchObject({
      ok: false,
      action: 'block-untrusted',
      states: [{ state: 'resolution-error' }],
    });
  });

  it('blocks startup cancellation when a protected ID resolves outside every supported pile', () => {
    const transaction = plannedTransaction();

    expect(planDuplicateStartupCancellation(transaction, {
      resolveItem: () => card(904476902398, { pile: 'quarantine' }),
    })).toMatchObject({
      ok: false,
      action: 'block-untrusted',
      states: [{ state: 'unknown-pile', pile: 'quarantine' }],
    });
  });

  it('classifies malformed, unknown-status, and reused-identity journals explicitly', () => {
    expect(planDuplicateStartupCancellation({ status: 'ambiguous', pairs: [] })).toMatchObject({
      ok: false,
      action: 'clear-invalid',
    });
    expect(planDuplicateStartupCancellation({
      ...plannedTransaction(),
      status: 'future-status',
    })).toMatchObject({
      ok: false,
      action: 'clear-invalid',
    });
    expect(planDuplicateStartupCancellation({
      transactionId: 'duplicate-protected-id',
      status: 'ambiguous',
      pairs: [
        { protectedCounterpartRef: { id: 102, definitionId: 7001 } },
        { protectedCounterpartRef: { id: 102, definitionId: 7001 } },
      ],
    })).toMatchObject({
      ok: false,
      action: 'clear-invalid',
    });
    expect(planDuplicateStartupCancellation({
      transactionId: 'cross-pair-reused-id',
      status: 'planned',
      pairs: [
        {
          sourceSignalRef: { id: 101, definitionId: 7001 },
          protectedCounterpartRef: { id: 102, definitionId: 7001 },
        },
        {
          sourceSignalRef: { id: 102, definitionId: 7002 },
          protectedCounterpartRef: { id: 202, definitionId: 7002 },
        },
      ],
    })).toMatchObject({
      ok: false,
      action: 'clear-invalid',
    });
  });

  it('clears a recovery-required journal after every exact pair was physically rolled back', () => {
    const transaction = transitionDuplicateMaterializationTransaction(
      materialize().transaction,
      'recovery-required',
      { reason: 'Club Repository temporarily omitted a restored counterpart' },
    );
    const restored = card(904476902398, {
      tradeable: true,
      pile: 'club',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    const rolledBackConsume = card(925789369999, { pile: 'unassigned' });

    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => [restored, rolledBackConsume].find((item) => item.id === id) || null,
    })).toEqual({ ok: true, action: 'clear' });
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

  it('uses a resolver location instead of a numeric EA entity pile during recovery', () => {
    const transaction = plannedTransaction();
    const source = card(925789369453, { pile: 6 });
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 7,
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => id === source.id
        ? { item: source, pileName: 'unassigned' }
        : { item: protectedCard, pileName: 'club' },
    })).toEqual({ ok: true, action: 'clear' });
  });

  it('clears a previously ambiguous planned journal after exact zero-drift verification', () => {
    const transaction = transitionDuplicateMaterializationTransaction(
      plannedTransaction(),
      'ambiguous',
      { reason: 'planned duplicate materialization journal has ambiguous inventory state' },
    );
    const source = card(925789369453, { pile: 6 });
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 7,
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => id === source.id
        ? { item: source, pileName: 'unassigned' }
        : { item: protectedCard, pileName: 'club' },
    })).toEqual({ ok: true, action: 'clear' });
  });

  it('clears a never-materialized ambiguous journal when the exact source is safely in Storage', () => {
    const transaction = transitionDuplicateMaterializationTransaction(
      plannedTransaction(),
      'ambiguous',
      { reason: 'planned duplicate materialization journal has ambiguous inventory state' },
    );
    const source = card(925789369453, { pile: 'storage' });
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 'club',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });

    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => id === source.id
        ? { item: source, pileName: 'storage' }
        : { item: protectedCard, pileName: 'club' },
    })).toEqual({ ok: true, action: 'clear' });
  });

  it('clears a safely stored source after EA normalizes only its loyalty bonus', () => {
    const transaction = transitionDuplicateMaterializationTransaction(
      plannedTransaction(),
      'ambiguous',
      { reason: 'planned duplicate materialization journal has ambiguous inventory state' },
    );
    const source = card(925789369453, { pile: 'storage', loyaltyBonus: 0 });
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 'club',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });

    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => id === source.id
        ? { item: source, pileName: 'storage' }
        : { item: protectedCard, pileName: 'club' },
    })).toEqual({ ok: true, action: 'clear' });
  });

  it('keeps a safely stored source blocked when a value field changed', () => {
    const transaction = transitionDuplicateMaterializationTransaction(
      plannedTransaction(),
      'ambiguous',
      { reason: 'planned duplicate materialization journal has ambiguous inventory state' },
    );
    const source = card(925789369453, { pile: 'storage', playStyle: 268 });
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 'club',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });

    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => id === source.id
        ? { item: source, pileName: 'storage' }
        : { item: protectedCard, pileName: 'club' },
    })).toMatchObject({
      ok: false,
      action: 'block',
      details: {
        changedItems: [{ role: 'source', pile: 'storage', changedFields: ['chemistryStyle'] }],
      },
    });
  });

  it('does not clear an ambiguous journal that ever recorded materialized identities', () => {
    const transaction = transitionDuplicateMaterializationTransaction(
      materialize().transaction,
      'ambiguous',
      { reason: 'unknown submission outcome' },
    );
    const consume = card(925789369999, { pile: 'unassigned' });
    const protectedCard = card(904476902398, {
      tradeable: true,
      pile: 'club',
      playStyle: 268,
      cosmetics: [{ id: 7 }],
    });
    expect(planDuplicateMaterializationRecovery(transaction, {
      resolveItem: (id) => [consume, protectedCard].find((item) => item.id === id) || null,
    })).toMatchObject({ ok: false, action: 'block' });
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
