import { describe, expect, it } from 'vitest';
import { decideRollingActiveSquadConflict } from '../../src/sbc/rolling-active-squad-conflict.js';

const card = (id, options = {}) => ({ id, special: false, pile: 'club', ...options });

describe('Rolling Active Squad conflict policy', () => {
  it('replaces ordinary cards by exact item ID', () => {
    expect(decideRollingActiveSquadConflict([card(101)])).toEqual({
      action: 'replace',
      reasonCode: 'ACTIVE_SQUAD_CONFLICT_REPLAN',
      reason: 'Replacing 1 ordinary Active Squad card(s)',
      replaceItemIds: [101],
      reviewItemIds: [],
    });
  });

  it('fails closed for TOTS/FOF/FUTTIES even when the card is a non-Club Required Special', () => {
    expect(decideRollingActiveSquadConflict([card(201, {
      special: true,
      eventSpecial: true,
      requiredSpecialRole: true,
      pile: 'storage',
    })])).toMatchObject({
      action: 'error',
      reasonCode: 'ACTIVE_SQUAD_PROTECTION_REGRESSION',
      regressionItemIds: [201],
    });
    expect(decideRollingActiveSquadConflict([card(202, {
      special: true,
      eventSpecial: false,
      requiredSpecialRole: true,
    })])).toMatchObject({ action: 'review', reviewItemIds: [202] });
  });

  it.each(['storage', 'transfer', 'unassigned'])(
    'fails closed for a %s TOTS/FOF/FUTTIES Active Squad violation regardless of Required Special role',
    (pile) => {
      expect(decideRollingActiveSquadConflict([card(210, {
        special: true,
        eventSpecial: true,
        requiredSpecialRole: true,
        pile,
        strictClubSpecialProtection: true,
      })])).toMatchObject({
        action: 'error',
        reasonCode: 'ACTIVE_SQUAD_PROTECTION_REGRESSION',
        regressionItemIds: [210],
      });
    },
  );

  it('keeps an Unassigned duplicate submission identity visible while still rejecting an event-special violation', () => {
    expect(decideRollingActiveSquadConflict([card(211, {
      special: true,
      eventSpecial: true,
      requiredSpecialRole: true,
      pile: 'club',
      sourcePile: 'unassigned',
      submissionPile: 'club',
      strictClubSpecialProtection: true,
    })])).toMatchObject({
      action: 'error',
      reasonCode: 'ACTIVE_SQUAD_PROTECTION_REGRESSION',
      regressionItemIds: [211],
    });
  });

  it.each([
    ['Club TOTS/FOF/FUTTIES even when strict protection is off', card(301, {
      special: true,
      eventSpecial: true,
      requiredSpecialRole: true,
      pile: 'club',
      strictClubSpecialProtection: false,
    })],
    ['TOTS/FOF/FUTTIES used outside its Required Special role', card(302, {
      special: true,
      eventSpecial: true,
      requiredSpecialRole: false,
      pile: 'storage',
    })],
    ['other Club special while strict protection is on', card(303, {
      special: true,
      eventSpecial: false,
      clubOtherSpecial: true,
      strictClubSpecialProtection: true,
    })],
  ])('fails closed for %s', (_name, item) => {
    expect(decideRollingActiveSquadConflict([item])).toMatchObject({
      action: 'error',
      reasonCode: 'ACTIVE_SQUAD_PROTECTION_REGRESSION',
      regressionItemIds: [item.id],
    });
  });

  it('allows other Club specials to be reviewed when strict protection is off', () => {
    expect(decideRollingActiveSquadConflict([card(401, {
      special: true,
      clubOtherSpecial: true,
      strictClubSpecialProtection: false,
    })])).toMatchObject({ action: 'review', reviewItemIds: [401] });
  });

  it('does not let disabling strict Club protection expose Club TOTS/FOF/FUTTIES', () => {
    expect(decideRollingActiveSquadConflict([card(402, {
      special: true,
      eventSpecial: true,
      requiredSpecialRole: true,
      pile: 'club',
      strictClubSpecialProtection: false,
    })])).toMatchObject({
      action: 'error',
      reasonCode: 'ACTIVE_SQUAD_PROTECTION_REGRESSION',
      regressionItemIds: [402],
    });
  });

  it('keeps ordinary replacements and special reviews separate in a mixed response', () => {
    expect(decideRollingActiveSquadConflict([
      card(501),
      card(502, { special: true, requiredSpecialRole: true }),
    ])).toMatchObject({
      action: 'replace',
      replaceItemIds: [501],
      reviewItemIds: [502],
    });
  });
});
