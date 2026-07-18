import { describe, expect, it, vi } from 'vitest';
import { createInventorySnapshot, createItemSnapshot } from '../../src/domain/contracts.js';
import {
  createRecoveryOverflowResolvers,
  matchingBlockedItemRefs,
  selectionConsumesSignalRefs,
} from '../../src/unassigned/recovery.js';
import { resolveUnassigned } from '../../src/unassigned/resolve.js';

function bronzeDuplicate(id) {
  return createItemSnapshot({
    id,
    definitionId: id + 100,
    type: 'player',
    rating: 64,
    duplicate: true,
    duplicateId: id + 1000,
    tradeable: false,
  }, 'unassigned');
}

function snapshot(items, storageFree = 2) {
  return createInventorySnapshot({
    capturedAt: '2026-01-01T00:00:00.000Z',
    piles: { unassigned: items },
    capacities: {
      storage: { used: 100 - storageFree, max: 100 },
      transfer: { used: 0, max: 100 },
    },
  });
}

const recipes = [
  { id: 'daily-bronze', name: 'Daily Bronze' },
  { id: 'daily-common', name: 'Daily Common' },
  { id: 'bronze-upgrade', name: 'Bronze Upgrade' },
];
const policies = [{
  id: 'bronze-overflow',
  match: { tier: 'bronze', playerOnly: true, allowSpecial: false },
  steps: recipes.map((recipe) => ({ recipeId: recipe.id })),
}];

describe('Unassigned recovery policies', () => {
  it('matches only blocked items covered by the policy', () => {
    const bronze = bronzeDuplicate(1);
    const rareGold = createItemSnapshot({
      id: 2, definitionId: 102, type: 'player', rating: 80, rare: true, duplicate: true, duplicateId: 1002,
    }, 'unassigned');
    const current = snapshot([bronze, rareGold], 0);
    const plan = { blocked: { itemRefs: [bronze.ref, rareGold.ref] } };
    expect(matchingBlockedItemRefs(plan, current, policies[0])).toEqual([bronze.ref]);
  });

  it('requires the selected squad to contain an expected Unassigned signal', () => {
    const selection = {
      entries: [
        { pileName: 'storage', item: { id: 20 } },
        { pileName: 'unassigned', signal: { id: 11, definitionId: 111 } },
      ],
    };
    expect(selectionConsumesSignalRefs(selection, [{ id: 11, definitionId: 111 }])).toBe(true);
    expect(selectionConsumesSignalRefs(selection, [{ id: 10, definitionId: 110 }])).toBe(false);
  });

  it('falls back in configured order and resolves four bronze duplicates with two Storage slots', async () => {
    let items = [1, 2, 3, 4].map(bronzeDuplicate);
    const attemptRecipe = vi.fn(async ({ recipe, triggerRefs }) => {
      expect(triggerRefs).toHaveLength(4);
      if (recipe.id !== 'bronze-upgrade') return { status: 'unavailable' };
      items = [];
      return { status: 'progress' };
    });
    const overflowResolvers = createRecoveryOverflowResolvers({
      recipes,
      policies,
      policyIds: ['bronze-overflow'],
      attemptRecipe,
    });
    const result = await resolveUnassigned({
      getSnapshot: async () => snapshot(items, 2),
      executeAction: async () => {},
      overflowResolvers,
    });
    expect(result.status).toBe('resolved');
    expect(attemptRecipe.mock.calls.map(([call]) => call.recipe.id)).toEqual([
      'daily-bronze',
      'daily-common',
      'bronze-upgrade',
    ]);
  });

  it('stops on a configured submit failure and continues on insufficient inventory', async () => {
    const items = [bronzeDuplicate(1)];
    const continued = createRecoveryOverflowResolvers({
      recipes,
      policies,
      policyIds: ['bronze-overflow'],
      attemptRecipe: async ({ recipe }) => recipe.id === 'daily-bronze'
        ? { status: 'insufficient' }
        : { status: 'blocked', reason: 'saveChallenge failed' },
    });
    const result = await resolveUnassigned({
      getSnapshot: async () => snapshot(items, 0),
      executeAction: async () => {},
      overflowResolvers: continued,
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'saveChallenge failed' });
  });

  it('rejects recovery when no recipe can consume a matching trigger', async () => {
    const items = [bronzeDuplicate(1)];
    const attemptRecipe = vi.fn(async () => ({ status: 'insufficient', reason: 'selection does not consume trigger' }));
    const overflowResolvers = createRecoveryOverflowResolvers({
      recipes,
      policies,
      policyIds: ['bronze-overflow'],
      attemptRecipe,
    });
    const result = await resolveUnassigned({
      getSnapshot: async () => snapshot(items, 0),
      executeAction: async () => {},
      overflowResolvers,
    });
    expect(result.status).toBe('blocked');
    expect(attemptRecipe).toHaveBeenCalledTimes(3);
  });
});
