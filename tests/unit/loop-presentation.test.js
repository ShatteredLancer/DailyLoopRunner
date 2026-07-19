import { describe, expect, it } from 'vitest';
import { applyDisabledPiles, isMvpLoopDef, visibleLoopDefs } from '../../src/config/loop-presentation.js';

describe('loop presentation and disabled pile projection', () => {
  it('hides MVP and hidden loops unless MVP visibility is enabled', () => {
    const loops = [
      { id: 'daily', name: 'Daily' },
      { id: 'daily-mvp', hidden: true },
      { id: 'validation', hidden: true, mvp: true },
      { id: 'internal', hidden: true },
    ];
    expect(isMvpLoopDef(loops[1])).toBe(true);
    expect(isMvpLoopDef(loops[2])).toBe(true);
    expect(visibleLoopDefs(loops, false).map((loop) => loop.id)).toEqual(['daily']);
    expect(visibleLoopDefs(loops, true).map((loop) => loop.id)).toEqual(['daily', 'daily-mvp', 'validation']);
  });

  it('projects disabled piles through loop, rating, challenge, legacy, and crafting requirements', () => {
    const loopDef = {
      disabledPiles: ['club', 'transfer'],
      priorityPiles: ['unassigned', 'storage', 'transfer', 'club'],
      primaryPiles: ['storage', 'transfer'],
      clubFallbackPiles: ['storage', 'club'],
      ratingSbcFill: { priorityPiles: ['unassigned', 'storage', 'club'] },
      requirements: [{ priorityPiles: ['storage', 'transfer', 'club'] }],
      challengeRequirements: [[{ priorityPiles: ['unassigned', 'club'] }]],
      rareUpgrade: {
        priorityPiles: ['storage', 'club'],
        requirements: [{ priorityPiles: ['storage', 'transfer'] }],
        challengeRequirements: [[{ priorityPiles: ['unassigned', 'club'] }]],
      },
      craftingUpgrades: [{
        priorityPiles: ['unassigned', 'transfer'],
        requirements: [{ priorityPiles: ['storage', 'club'] }],
        challengeRequirements: [[{ priorityPiles: ['storage', 'transfer'] }]],
      }],
    };

    expect(applyDisabledPiles(loopDef)).toBe(loopDef);
    expect(loopDef.priorityPiles).toEqual(['unassigned', 'storage']);
    expect(loopDef.primaryPiles).toEqual(['storage']);
    expect(loopDef.clubFallbackPiles).toEqual(['storage']);
    expect(loopDef.ratingSbcFill.priorityPiles).toEqual(['unassigned', 'storage']);
    expect(loopDef.requirements[0].priorityPiles).toEqual(['storage']);
    expect(loopDef.challengeRequirements[0][0].priorityPiles).toEqual(['unassigned']);
    expect(loopDef.rareUpgrade.requirements[0].priorityPiles).toEqual(['storage']);
    expect(loopDef.craftingUpgrades[0].priorityPiles).toEqual(['unassigned']);
    expect(loopDef.craftingUpgrades[0].challengeRequirements[0][0].priorityPiles).toEqual(['storage']);
  });

  it('preserves missing pile lists and rejects a configured list with no enabled pile', () => {
    const unchanged = { disabledPiles: ['club'], requirements: [{}] };
    expect(applyDisabledPiles(unchanged)).toBe(unchanged);
    expect(unchanged.requirements[0].priorityPiles).toBeUndefined();

    expect(() => applyDisabledPiles({
      disabledPiles: ['storage', 'club'],
      priorityPiles: ['storage', 'club'],
    })).toThrow('priorityPiles has no enabled piles after disabledPiles');
  });
});
