import { describe, expect, it } from 'vitest';
import { createHighRatedUpgradePolicy, createTotwUpgradePolicy, createTwoBy84UpgradePolicy } from '../../src/config/upgrade-policies.js';
import { loadUserscript, makePlayer } from '../helpers/load-userscript.js';

describe('high-rated Upgrade safety policy', () => {
  it('uses the all-card cap and ignores FSU Gold range for rating Upgrades', async () => {
    const { api } = await loadUserscript();
    const settings = api.setFsuSettingsOverride({ goldRange: [75, 83] });
    const normalGold = makePlayer({ id: 1, rating: 90, rareflag: 1 });

    expect(createHighRatedUpgradePolicy()).not.toHaveProperty('maxNormalGoldSubmittedRating');
    expect(createHighRatedUpgradePolicy()).toMatchObject({ sbcFodderPolicy: { mode: 'rating-constrained' } });
    expect(createTotwUpgradePolicy()).toMatchObject({ sbcFodderPolicy: { mode: 'rating-constrained' } });
    expect(createTwoBy84UpgradePolicy()).toMatchObject({ sbcFodderPolicy: { mode: 'low-gold' } });
    expect(api.getSubmittedRatingLimit(normalGold, createHighRatedUpgradePolicy())).toBe(88);
    expect(api.getFsuRejectReasons(normalGold, { playerOnly: true }, settings, {
      sbcFodderPolicy: { mode: 'rating-constrained' },
    })).not.toContain('fsu-gold-range-75-83');
  });

  it('intersects the low-rated normal Gold cap with FSU Gold range', async () => {
    const { api } = await loadUserscript();
    const settings = api.setFsuSettingsOverride({ goldRange: [75, 83] });
    const normalGold = makePlayer({ id: 2, rating: 90, rareflag: 1 });

    expect(api.getSubmittedRatingLimit(normalGold, createTwoBy84UpgradePolicy())).toBe(82);
    expect(api.getFsuRejectReasons(normalGold, { playerOnly: true }, settings, {
      sbcFodderPolicy: { mode: 'low-gold' },
    })).toContain('fsu-gold-range-75-83');
  });

  it('scans required special cards through the shared rating pile flow and resolves duplicate signals', async () => {
    const clubTotw = makePlayer({ id: 20, definitionId: 200, rating: 84, rareflag: 2, name: 'TOTW Club' });
    const unassignedSignal = makePlayer({
      id: 10,
      definitionId: 200,
      rating: 84,
      rareflag: 2,
      duplicate: true,
      duplicateId: 20,
      name: 'TOTW Unassigned Signal',
    });
    const { api } = await loadUserscript({ club: [clubTotw], unassigned: [unassignedSignal] });
    const entries = api.getEligibleRequiredSpecialEntries({
      name: '85x10',
      requiredSpecialCount: 1,
      allowedSpecialCount: 1,
      requiredSpecialKind: 'totw-tots-fof',
      requiredSpecialMinRating: 84,
      sbcFodderPolicy: { mode: 'rating-constrained', ratingSbcMaxCardRating: 88 },
      ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'transfer', 'club'] },
    }, { includeRecent: false });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pileName: 'unassigned', item: { id: 20, definitionId: 200 } });
  });
});
