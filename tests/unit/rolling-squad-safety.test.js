import { describe, expect, it } from 'vitest';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

describe('Rolling squad safety inspection', () => {
  it('blocks FSU-locked, evolved, and Academy-enrolled cards at final squad inspection', async () => {
    const locked = makePlayer({ id: 1, definitionId: 1001, rating: 84, rareflag: 1 });
    const evolved = makePlayer({
      id: 2,
      definitionId: 1002,
      rating: 84,
      rareflag: 1,
      evolutionId: 42,
    });
    const academy = makePlayer({ id: 3, definitionId: 1003, rating: 84, rareflag: 1 });
    academy.isEnrolledInAcademy = () => true;
    const { api } = await loadUserscript();
    api.setFsuSettingsOverride({
      excludeEvolution: true,
      lockedItemIds: [locked.id],
      lockedDefinitionIds: [],
    });
    api.state.pickOptions = { protectFsuLockedPlayers: true };

    const inspection = api.inspectSbcItems({
      name: 'Rolling final safety',
      expectedPlayerCount: 3,
      blockSpecial: false,
    }, [locked, evolved, academy], { expectedPlayerCount: 3 });

    expect(inspection.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: locked, reasons: expect.arrayContaining(['fsu-locked-player']) }),
      expect.objectContaining({ item: evolved, reasons: expect.arrayContaining(['fsu-exclude-evolution']) }),
      expect.objectContaining({ item: academy, reasons: expect.arrayContaining(['academy']) }),
    ]));
  });

  it('does not block an FSU-locked player when the guard is disabled', async () => {
    const locked = makePlayer({ id: 11, definitionId: 1011, rating: 75, rareflag: 1 });
    const { api } = await loadUserscript();
    api.setFsuSettingsOverride({ lockedItemIds: [locked.id], lockedDefinitionIds: [] });

    const inspection = api.inspectSbcItems({
      name: 'Rolling default lock policy',
      expectedPlayerCount: 1,
      blockSpecial: false,
    }, [locked], { expectedPlayerCount: 1 });

    expect(inspection.blocked).toEqual([]);
  });

  it('keeps submit inspection consistent when a generic policy explicitly requires a reserve-rated item', async () => {
    const requiredReserve = makePlayer({ id: 101, definitionId: 1001, rating: 89, rareflag: 1 });
    const ordinaryReserve = makePlayer({ id: 102, definitionId: 1002, rating: 87, rareflag: 1 });
    const ordinary = makePlayer({ id: 103, definitionId: 1003, rating: 86, rareflag: 1 });
    const { api } = await loadUserscript();
    const inspection = api.inspectSbcItems({
      name: 'Rolling primary safety',
      expectedPlayerCount: 3,
      blockSpecial: false,
    }, [requiredReserve, ordinaryReserve, ordinary], {
      expectedPlayerCount: 3,
      model: { constraints: [] },
      selectionPolicy: {
        requiredItems: [{ id: requiredReserve.id }],
        exclusiveRoles: [],
        maxOrdinaryRating: 95,
        protectionPolicy: {
          reserveRatings: [87, 88, 89],
          allowOtherSpecialAsOrdinary: true,
        },
      },
    });

    expect(inspection.blocked).toEqual([
      expect.objectContaining({ item: ordinaryReserve, reasons: ['reserved-rating-87'] }),
    ]);
    expect(inspection.allowOtherSpecialAsOrdinary).toBe(true);
  });

  it('allows a reserved-rated Storage card only when the Storage-pressure role selected it explicitly', async () => {
    const pressureCard = makePlayer({ id: 111, definitionId: 1111, rating: 87, rareflag: 22 });
    const ordinary = makePlayer({ id: 112, definitionId: 1112, rating: 86, rareflag: 1 });
    const { api } = await loadUserscript();
    const inspection = api.inspectSbcItems({
      name: 'Storage-pressure recovery',
      expectedPlayerCount: 2,
      blockSpecial: false,
    }, [pressureCard, ordinary], {
      expectedPlayerCount: 2,
      model: { constraints: [] },
      selectionPolicy: {
        requiredItems: [],
        exclusiveRoles: [{
          id: 'storage-pressure-release',
          itemRefs: [{ id: pressureCard.id, definitionId: pressureCard.definitionId }],
          minCount: 1,
          maxCount: 1,
        }],
        maxOrdinaryRating: 95,
        protectionPolicy: {
          reserveRatings: [87, 88],
          allowOtherSpecialAsOrdinary: true,
        },
      },
    });

    expect(inspection.blocked).toEqual([]);
  });

  it('still blocks a reserved-rated Storage card when no explicit release role selected it', async () => {
    const reserveCard = makePlayer({ id: 121, definitionId: 1121, rating: 87, rareflag: 22 });
    const { api } = await loadUserscript();
    const inspection = api.inspectSbcItems({
      name: 'Normal recovery',
      expectedPlayerCount: 1,
      blockSpecial: false,
    }, [reserveCard], {
      expectedPlayerCount: 1,
      model: { constraints: [] },
      selectionPolicy: {
        requiredItems: [],
        exclusiveRoles: [],
        maxOrdinaryRating: 95,
        protectionPolicy: {
          reserveRatings: [87, 88],
          allowOtherSpecialAsOrdinary: true,
        },
      },
    });

    expect(inspection.blocked).toEqual([
      expect.objectContaining({ item: reserveCard, reasons: ['reserved-rating-87'] }),
    ]);
  });

  it('accepts an ordinary Other Special while role validation remains separate', async () => {
    const requiredSpecial = makePlayer({ id: 201, definitionId: 2001, rating: 92, rareflag: 11 });
    const otherSpecial = makePlayer({ id: 202, definitionId: 2002, rating: 86, rareflag: 111 });
    const ordinary = makePlayer({ id: 203, definitionId: 2003, rating: 84, rareflag: 1 });
    const { api } = await loadUserscript();
    const model = {
      requiredPlayerCount: 3,
      targetRating: 84,
      maxSpecialCount: 1,
      constraints: [{ matches: (item) => item.id === requiredSpecial.id }],
    };
    const inspection = api.inspectSbcItems({
      name: 'Rolling role-aware safety',
      expectedPlayerCount: 3,
      allowedSpecialCount: 1,
    }, [requiredSpecial, otherSpecial, ordinary], {
      expectedPlayerCount: 3,
      model,
      selectionPolicy: {
        exclusiveRoles: [{ constraintIndex: 0, minCount: 1, maxCount: 1 }],
        maxOrdinaryRating: 95,
        protectionPolicy: { allowOtherSpecialAsOrdinary: true },
      },
    });

    expect(inspection.specialCount).toBe(2);
    expect(inspection.blocked).toEqual([]);
  });
});
